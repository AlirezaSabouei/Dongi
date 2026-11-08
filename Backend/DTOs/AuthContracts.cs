namespace Dongi.Api.DTOs;

/// <summary>Body of <c>POST /auth/request-code</c>.</summary>
/// <remarks>
/// Nullable so that invalid payloads reach the phone validator and receive the
/// same generic 400 response instead of a model-binding error that describes the
/// expected shape.
/// </remarks>
public sealed record RequestCodeRequest(string? Phone);

/// <summary>Body of <c>POST /auth/verify-code</c>.</summary>
public sealed record VerifyCodeRequest(string? Phone, string? Code);

/// <summary>Generic message payload used for all auth outcomes.</summary>
public sealed record MessageResponse(string Message);

/// <summary>Public representation of a user.</summary>
public sealed record UserResponse(string Id, string Phone);

/// <summary>Successful verification payload: a signed JWT and the user.</summary>
public sealed record AuthResponse(string Token, UserResponse User);
