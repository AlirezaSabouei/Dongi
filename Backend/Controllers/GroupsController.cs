using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Dongi.Api.DTOs;
using Dongi.Api.Models;
using Dongi.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using MongoDB.Bson;

namespace Dongi.Api.Controllers;

/// <summary>
/// Group creation, listing, detail, and invite-code joining. Every endpoint
/// requires a valid JWT; the caller identity is the token's <c>sub</c> claim.
/// </summary>
[ApiController]
[Route("groups")]
[Authorize]
public sealed class GroupsController(
    IGroupService groupService,
    IOptions<GroupSettings> settings) : ControllerBase
{
    private readonly GroupSettings _settings = settings.Value;

    private static readonly MessageResponse NameRequiredMessage =
        new("Group name is required.");

    private static readonly MessageResponse GroupNotFoundMessage =
        new("Group not found.");

    private static readonly MessageResponse NotAMemberMessage =
        new("You are not a member of this group.");

    private static readonly MessageResponse InvalidInviteCodeMessage =
        new("Invalid invite code.");

    private static readonly MessageResponse InviteCodeUnavailableMessage =
        new("Could not allocate a unique invite code. Please try again.");

    /// <summary>Creates a group; the caller becomes owner and first member.</summary>
    [HttpPost]
    [ProducesResponseType<GroupResponse>(StatusCodes.Status201Created)]
    [ProducesResponseType<MessageResponse>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<MessageResponse>(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<MessageResponse>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<GroupResponse>> Create(
        [FromBody] CreateGroupRequest request,
        CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId))
        {
            return Unauthorized();
        }

        var name = request.Name?.Trim() ?? string.Empty;

        if (name.Length == 0)
        {
            return BadRequest(NameRequiredMessage);
        }

        if (name.Length > _settings.NameMaxLength)
        {
            return BadRequest(new MessageResponse(
                $"Group name must be at most {_settings.NameMaxLength} characters."));
        }

        try
        {
            var group = await groupService.CreateAsync(name, userId, cancellationToken);
            return CreatedAtAction(nameof(Get), new { id = group.Id.ToString() }, ToResponse(group));
        }
        catch (InviteCodeAllocationException)
        {
            return Conflict(InviteCodeUnavailableMessage);
        }
    }

    /// <summary>Lists the groups the caller belongs to, most recently created first.</summary>
    [HttpGet]
    [ProducesResponseType<IReadOnlyList<GroupResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType<MessageResponse>(StatusCodes.Status401Unauthorized)]
    public async Task<ActionResult<IReadOnlyList<GroupResponse>>> List(
        CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId))
        {
            return Unauthorized();
        }

        var groups = await groupService.ListForMemberAsync(userId, cancellationToken);
        return Ok(groups.Select(ToResponse).ToArray());
    }

    /// <summary>Returns one group. Only members may read it.</summary>
    [HttpGet("{id}")]
    [ProducesResponseType<GroupResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<MessageResponse>(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<MessageResponse>(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<MessageResponse>(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<GroupResponse>> Get(
        string id,
        CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId))
        {
            return Unauthorized();
        }

        if (!ObjectId.TryParse(id, out var groupId))
        {
            return NotFound(GroupNotFoundMessage);
        }

        var group = await groupService.GetAsync(groupId, cancellationToken);

        if (group is null)
        {
            return NotFound(GroupNotFoundMessage);
        }

        if (!IsMember(group, userId))
        {
            return StatusCode(StatusCodes.Status403Forbidden, NotAMemberMessage);
        }

        return Ok(ToResponse(group));
    }

    /// <summary>
    /// Joins the group that owns the invite code. Joining again is a successful
    /// no-op, so a retried request is safe.
    /// </summary>
    [HttpPost("join")]
    [ProducesResponseType<GroupResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<MessageResponse>(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<MessageResponse>(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<GroupResponse>> Join(
        [FromBody] JoinGroupRequest request,
        CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId))
        {
            return Unauthorized();
        }

        var inviteCode = request.InviteCode?.Trim() ?? string.Empty;

        if (inviteCode.Length == 0)
        {
            return NotFound(InvalidInviteCodeMessage);
        }

        var result = await groupService.JoinAsync(inviteCode, userId, cancellationToken);

        if (result.Status == JoinGroupStatus.NotFound || result.Group is null)
        {
            return NotFound(InvalidInviteCodeMessage);
        }

        return Ok(ToResponse(result.Group));
    }

    /// <summary>Returns the invite code and the shareable frontend join URL.</summary>
    [HttpGet("{id}/invite")]
    [ProducesResponseType<GroupInviteResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<MessageResponse>(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<MessageResponse>(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<MessageResponse>(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<GroupInviteResponse>> GetInvite(
        string id,
        CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId))
        {
            return Unauthorized();
        }

        if (!ObjectId.TryParse(id, out var groupId))
        {
            return NotFound(GroupNotFoundMessage);
        }

        var group = await groupService.GetAsync(groupId, cancellationToken);

        if (group is null)
        {
            return NotFound(GroupNotFoundMessage);
        }

        if (!IsMember(group, userId))
        {
            return StatusCode(StatusCodes.Status403Forbidden, NotAMemberMessage);
        }

        return Ok(new GroupInviteResponse(
            group.InviteCode,
            groupService.BuildJoinUrl(group.InviteCode)));
    }

    private bool TryGetUserId(out ObjectId userId) =>
        ObjectId.TryParse(User.FindFirstValue(JwtRegisteredClaimNames.Sub), out userId);

    private static bool IsMember(Group group, ObjectId userId) =>
        group.MemberIds.Contains(userId);

    private static GroupResponse ToResponse(Group group) => new(
        group.Id.ToString(),
        group.Name,
        group.OwnerId.ToString(),
        group.MemberIds.Select(memberId => memberId.ToString()).ToArray(),
        group.CreatedAt);
}
