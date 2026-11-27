using Dongi.Api.Models;
using MongoDB.Bson;
using MongoDB.Driver;

namespace Dongi.Api.Data;

/// <summary>Persistence operations for <see cref="Group"/> documents.</summary>
public interface IGroupRepository
{
    /// <summary>
    /// Inserts a new group. Returns <c>false</c> when another group already owns
    /// the invite code, in which case the caller must retry with a new code.
    /// </summary>
    Task<bool> TryInsertAsync(Group group, CancellationToken cancellationToken);

    Task<Group?> FindByIdAsync(ObjectId id, CancellationToken cancellationToken);

    Task<Group?> FindByInviteCodeAsync(string inviteCode, CancellationToken cancellationToken);

    Task<IReadOnlyList<Group>> ListForMemberAsync(ObjectId memberId, CancellationToken cancellationToken);

    /// <summary>
    /// Adds the user to the group's members and returns the updated document, or
    /// <c>null</c> when the group no longer exists. Adding an existing member is a
    /// no-op, which makes joining idempotent.
    /// </summary>
    Task<Group?> AddMemberAsync(ObjectId groupId, ObjectId memberId, CancellationToken cancellationToken);
}

internal sealed class MongoGroupRepository(MongoDbContext context) : IGroupRepository
{
    private IMongoCollection<Group> Collection =>
        context.Database.GetCollection<Group>(MongoCollections.Groups);

    public async Task<bool> TryInsertAsync(Group group, CancellationToken cancellationToken)
    {
        try
        {
            await Collection.InsertOneAsync(group, cancellationToken: cancellationToken);
            return true;
        }
        catch (MongoWriteException exception)
            when (exception.WriteError?.Category == ServerErrorCategory.DuplicateKey)
        {
            return false;
        }
    }

    public async Task<Group?> FindByIdAsync(ObjectId id, CancellationToken cancellationToken) =>
        await Collection
            .Find(group => group.Id == id)
            .FirstOrDefaultAsync(cancellationToken);

    public async Task<Group?> FindByInviteCodeAsync(
        string inviteCode,
        CancellationToken cancellationToken) =>
        await Collection
            .Find(group => group.InviteCode == inviteCode)
            .FirstOrDefaultAsync(cancellationToken);

    public async Task<IReadOnlyList<Group>> ListForMemberAsync(
        ObjectId memberId,
        CancellationToken cancellationToken)
    {
        return await Collection
            .Find(group => group.MemberIds.Contains(memberId))
            .SortByDescending(group => group.CreatedAt)
            .ThenByDescending(group => group.Id)
            .ToListAsync(cancellationToken);
    }

    public async Task<Group?> AddMemberAsync(
        ObjectId groupId,
        ObjectId memberId,
        CancellationToken cancellationToken)
    {
        var update = Builders<Group>.Update.AddToSet(group => group.MemberIds, memberId);
        var options = new FindOneAndUpdateOptions<Group>
        {
            ReturnDocument = ReturnDocument.After,
        };

        return await Collection.FindOneAndUpdateAsync(
            group => group.Id == groupId,
            update,
            options,
            cancellationToken);
    }
}
