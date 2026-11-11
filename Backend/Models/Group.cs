using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace Dongi.Api.Models;

/// <summary>
/// A shared expense group. The creator is stored as the owner and as the first
/// member; membership is a set of user ids kept unique per group. The invite
/// code is short, randomly generated, and unique across all groups so it can be
/// shared as a join link.
/// </summary>
public sealed class Group
{
    [BsonId]
    public ObjectId Id { get; set; }

    [BsonElement("name")]
    public string Name { get; set; } = string.Empty;

    /// <summary>Short base62 code used to join the group. Unique across groups.</summary>
    [BsonElement("inviteCode")]
    public string InviteCode { get; set; } = string.Empty;

    [BsonElement("ownerId")]
    public ObjectId OwnerId { get; set; }

    /// <summary>
    /// Member user ids. Written with <c>$addToSet</c> so joining is idempotent and
    /// concurrent joins cannot create duplicates.
    /// </summary>
    [BsonElement("memberIds")]
    public List<ObjectId> MemberIds { get; set; } = [];

    [BsonElement("createdAt")]
    public DateTime CreatedAt { get; set; }
}
