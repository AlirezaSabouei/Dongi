namespace Dongi.Api.DTOs;

/// <summary>Payload returned by <c>GET /health</c>.</summary>
public sealed record HealthResponse(string Status, DateTimeOffset TimestampUtc);
