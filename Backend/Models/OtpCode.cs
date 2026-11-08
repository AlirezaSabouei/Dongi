using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace Dongi.Api.Models;

/// <summary>
/// A one-time SMS login code. Only a salted hash of the code is stored; the
/// plaintext value exists only in the SMS message and in memory while it is
/// being generated. Documents carry a TTL index on <see cref="ExpiresAt"/> so
/// expired codes are removed by MongoDB automatically.
/// </summary>
public sealed class OtpCode
{
    [BsonId]
    public ObjectId Id { get; set; }

    /// <summary>Normalized E.164 phone number the code was sent to.</summary>
    [BsonElement("phone")]
    public string Phone { get; set; } = string.Empty;

    /// <summary>HMAC-SHA256 of the phone number and code.</summary>
    [BsonElement("codeHash")]
    public string CodeHash { get; set; } = string.Empty;

    [BsonElement("createdAt")]
    public DateTime CreatedAt { get; set; }

    /// <summary>UTC instant after which the code is no longer accepted.</summary>
    [BsonElement("expiresAt")]
    public DateTime ExpiresAt { get; set; }

    /// <summary>Set exactly once when a code is successfully redeemed.</summary>
    [BsonElement("usedAt")]
    public DateTime? UsedAt { get; set; }
}
