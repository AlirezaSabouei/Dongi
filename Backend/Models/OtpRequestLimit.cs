using MongoDB.Bson.Serialization.Attributes;

namespace Dongi.Api.Models;

/// <summary>
/// Per-phone fixed-window request counter used to throttle SMS sends. The
/// document id is the normalized phone number, which makes the read-modify-write
/// update atomic per phone. A TTL index on <see cref="ExpiresAt"/> cleans up
/// windows that are no longer relevant.
/// </summary>
public sealed class OtpRequestLimit
{
    [BsonId]
    public string Phone { get; set; } = string.Empty;

    [BsonElement("windowStart")]
    public DateTime WindowStart { get; set; }

    [BsonElement("count")]
    public int Count { get; set; }

    [BsonElement("expiresAt")]
    public DateTime ExpiresAt { get; set; }
}
