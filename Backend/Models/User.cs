using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace Dongi.Api.Models;

/// <summary>A Dongi user, keyed by unique normalized phone number.</summary>
public sealed class User
{
    [BsonId]
    public ObjectId Id { get; set; }

    [BsonElement("phone")]
    public string Phone { get; set; } = string.Empty;

    [BsonElement("createdAt")]
    public DateTime CreatedAt { get; set; }

    [BsonElement("lastLoginAt")]
    public DateTime? LastLoginAt { get; set; }
}
