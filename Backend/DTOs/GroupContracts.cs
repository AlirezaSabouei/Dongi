namespace Dongi.Api.DTOs;

/// <summary>Body of <c>POST /groups</c>.</summary>
/// <remarks>Nullable so invalid payloads get the same validation response as an empty name.</remarks>
public sealed record CreateGroupRequest(string? Name);

/// <summary>Body of <c>POST /groups/join</c>.</summary>
public sealed record JoinGroupRequest(string? InviteCode);

/// <summary>
/// Group representation returned to clients. Internal fields (such as the
/// invite code) are exposed only through the dedicated invite endpoint.
/// </summary>
public sealed record GroupResponse(
    string Id,
    string Name,
    string OwnerId,
    IReadOnlyList<string> MemberIds,
    DateTime CreatedAt);

/// <summary>Response of <c>GET /groups/{id}/invite</c>.</summary>
public sealed record GroupInviteResponse(string InviteCode, string JoinUrl);
