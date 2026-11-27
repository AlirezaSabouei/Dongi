using Dongi.Api.Data;
using Dongi.Api.Models;
using Microsoft.Extensions.Options;
using MongoDB.Bson;

namespace Dongi.Api.Services;

public enum JoinGroupStatus
{
    Joined,
    NotFound,
}

/// <summary>Result of a join attempt. <c>Group</c> is set when a group matched the code.</summary>
public sealed record JoinGroupResult(JoinGroupStatus Status, Group? Group);

/// <summary>Raised when no unique invite code could be allocated for a new group.</summary>
public sealed class InviteCodeAllocationException()
    : Exception("Could not allocate a unique invite code for the new group.");

/// <summary>Coordinates group creation, membership, and invite links.</summary>
public interface IGroupService
{
    Task<Group> CreateAsync(string name, ObjectId ownerId, CancellationToken cancellationToken);

    Task<IReadOnlyList<Group>> ListForMemberAsync(ObjectId memberId, CancellationToken cancellationToken);

    Task<Group?> GetAsync(ObjectId groupId, CancellationToken cancellationToken);

    Task<JoinGroupResult> JoinAsync(
        string inviteCode,
        ObjectId memberId,
        CancellationToken cancellationToken);

    /// <summary>Builds the frontend deep link that opens the join flow for a code.</summary>
    string BuildJoinUrl(string inviteCode);
}

internal sealed class GroupService(
    IGroupRepository groups,
    IInviteCodeGenerator inviteCodeGenerator,
    IOptions<GroupSettings> settings,
    TimeProvider clock) : IGroupService
{
    private readonly GroupSettings _settings = settings.Value;

    public async Task<Group> CreateAsync(
        string name,
        ObjectId ownerId,
        CancellationToken cancellationToken)
    {
        for (var attempt = 0; attempt < _settings.MaxInviteCodeAttempts; attempt++)
        {
            var group = new Group
            {
                Id = ObjectId.GenerateNewId(),
                Name = name,
                InviteCode = inviteCodeGenerator.CreateCode(),
                OwnerId = ownerId,
                MemberIds = [ownerId],
                CreatedAt = clock.GetUtcNow().UtcDateTime,
            };

            if (await groups.TryInsertAsync(group, cancellationToken))
            {
                return group;
            }
        }

        throw new InviteCodeAllocationException();
    }

    public Task<IReadOnlyList<Group>> ListForMemberAsync(
        ObjectId memberId,
        CancellationToken cancellationToken) =>
        groups.ListForMemberAsync(memberId, cancellationToken);

    public Task<Group?> GetAsync(ObjectId groupId, CancellationToken cancellationToken) =>
        groups.FindByIdAsync(groupId, cancellationToken);

    public async Task<JoinGroupResult> JoinAsync(
        string inviteCode,
        ObjectId memberId,
        CancellationToken cancellationToken)
    {
        var group = await groups.FindByInviteCodeAsync(inviteCode, cancellationToken);

        if (group is null)
        {
            return new JoinGroupResult(JoinGroupStatus.NotFound, null);
        }

        // AddToSet makes an existing membership a successful no-op.
        var updated = await groups.AddMemberAsync(group.Id, memberId, cancellationToken);
        return new JoinGroupResult(JoinGroupStatus.Joined, updated ?? group);
    }

    public string BuildJoinUrl(string inviteCode) =>
        $"{_settings.FrontendBaseUrl.TrimEnd('/')}/#/join/{Uri.EscapeDataString(inviteCode)}";
}
