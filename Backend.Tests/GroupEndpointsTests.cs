using System.Net;
using System.Text.Json;
using Dongi.Api.Data;
using Dongi.Api.Tests.Infrastructure;
using MongoDB.Bson;
using MongoDB.Driver;

namespace Dongi.Api.Tests;

public sealed class GroupEndpointsTests : IClassFixture<DongiApiFactory>
{
    private readonly DongiApiFactory _factory;

    public GroupEndpointsTests(DongiApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Create_Returns201WithCreatorAsOwnerAndFirstMember()
    {
        var userId = ObjectId.GenerateNewId();
        using var client = _factory.CreateAuthenticatedClient(userId);

        var response = await client.PostAsJsonAsync("/groups", new { name = "  Trip  " });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.NotNull(response.Headers.Location);

        using var json = await DongiApiFactory.ReadJsonAsync(response);
        var group = json.RootElement;
        var groupId = group.GetProperty("id").GetString()!;

        Assert.Matches("^[0-9a-f]{24}$", groupId);
        Assert.Equal("Trip", group.GetProperty("name").GetString());
        Assert.Equal(userId.ToString(), group.GetProperty("ownerId").GetString());
        Assert.Equal([userId.ToString()], group.MemberIds());
        Assert.EndsWith($"/groups/{groupId}", response.Headers.Location!.ToString());
        Assert.Equal(
            _factory.Clock.GetUtcNow().UtcDateTime,
            group.GetProperty("createdAt").GetDateTime());

        // The invite code is persisted, unique, and never echoed in the group body.
        Assert.False(group.TryGetProperty("inviteCode", out _));

        var groups = _factory.Database.GetCollection<BsonDocument>(MongoCollections.Groups);
        var stored = await groups
            .Find(Builders<BsonDocument>.Filter.Eq("_id", ObjectId.Parse(groupId)))
            .FirstAsync();

        Assert.Matches("^[0-9A-Za-z]{8}$", stored["inviteCode"].AsString);
        Assert.Equal(userId, stored["ownerId"].AsObjectId);
        Assert.Equal([userId], stored["memberIds"].AsBsonArray.Select(value => value.AsObjectId));
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public async Task Create_WithBlankName_Returns400(string name)
    {
        using var client = _factory.CreateAuthenticatedClient(ObjectId.GenerateNewId());

        var response = await client.PostAsJsonAsync("/groups", new { name });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        using var json = await DongiApiFactory.ReadJsonAsync(response);
        Assert.Equal("Group name is required.", json.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Create_WithTooLongName_Returns400()
    {
        using var client = _factory.CreateAuthenticatedClient(ObjectId.GenerateNewId());

        var response = await client.PostAsJsonAsync("/groups", new { name = new string('a', 101) });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task List_ReturnsOnlyGroupsTheCallerBelongsTo()
    {
        var alice = ObjectId.GenerateNewId();
        var bob = ObjectId.GenerateNewId();
        using var aliceClient = _factory.CreateAuthenticatedClient(alice);
        using var bobClient = _factory.CreateAuthenticatedClient(bob);

        var aliceGroup = await GroupApiHelpers.CreateGroupAsync(aliceClient, "Trip");
        await GroupApiHelpers.CreateGroupAsync(bobClient, "Home");

        var groups = await aliceClient.GetFromJsonAsync<JsonElement>("/groups");

        Assert.Equal(JsonValueKind.Array, groups.ValueKind);
        Assert.Equal(1, groups.GetArrayLength());
        Assert.Equal(aliceGroup.Id(), groups[0].Id());
        Assert.Equal("Trip", groups[0].GetProperty("name").GetString());
    }

    [Fact]
    public async Task Get_ByNonMember_Returns403AndByMemberReturns200()
    {
        var owner = ObjectId.GenerateNewId();
        var outsider = ObjectId.GenerateNewId();
        using var ownerClient = _factory.CreateAuthenticatedClient(owner);
        using var outsiderClient = _factory.CreateAuthenticatedClient(outsider);

        var group = await GroupApiHelpers.CreateGroupAsync(ownerClient, "Trip");
        var groupId = group.Id();

        var forbidden = await outsiderClient.GetAsync($"/groups/{groupId}");
        Assert.Equal(HttpStatusCode.Forbidden, forbidden.StatusCode);

        using (var json = await DongiApiFactory.ReadJsonAsync(forbidden))
        {
            Assert.Equal(
                "You are not a member of this group.",
                json.RootElement.GetProperty("message").GetString());
        }

        var ok = await ownerClient.GetAsync($"/groups/{groupId}");
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);

        using var okJson = await DongiApiFactory.ReadJsonAsync(ok);
        Assert.Equal(groupId, okJson.RootElement.GetProperty("id").GetString());
    }

    [Fact]
    public async Task Get_WithUnknownOrMalformedId_Returns404()
    {
        using var client = _factory.CreateAuthenticatedClient(ObjectId.GenerateNewId());

        var unknown = await client.GetAsync($"/groups/{ObjectId.GenerateNewId()}");
        var malformed = await client.GetAsync("/groups/not-an-object-id");

        Assert.Equal(HttpStatusCode.NotFound, unknown.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, malformed.StatusCode);
    }

    [Fact]
    public async Task Join_WithValidCode_AddsCallerAndIsIdempotent()
    {
        var owner = ObjectId.GenerateNewId();
        var joiner = ObjectId.GenerateNewId();
        using var ownerClient = _factory.CreateAuthenticatedClient(owner);
        using var joinerClient = _factory.CreateAuthenticatedClient(joiner);

        var group = await GroupApiHelpers.CreateGroupAsync(ownerClient, "Trip");
        var groupId = group.Id();
        var inviteCode = await GroupApiHelpers.GetInviteCodeAsync(ownerClient, groupId);

        var first = await joinerClient.PostAsJsonAsync("/groups/join", new { inviteCode });
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);

        using (var json = await DongiApiFactory.ReadJsonAsync(first))
        {
            var joined = json.RootElement;
            Assert.Equal(groupId, joined.GetProperty("id").GetString());
            Assert.Equal([owner.ToString(), joiner.ToString()], joined.MemberIds());
        }

        var second = await joinerClient.PostAsJsonAsync("/groups/join", new { inviteCode });
        Assert.Equal(HttpStatusCode.OK, second.StatusCode);

        using (var json = await DongiApiFactory.ReadJsonAsync(second))
        {
            var joined = json.RootElement;
            Assert.Equal(2, joined.MemberIds().Length);
            Assert.Contains(joiner.ToString(), joined.MemberIds());
        }

        // The joined group now appears in the joiner's list, with no duplicate member.
        var groups = await joinerClient.GetFromJsonAsync<JsonElement>("/groups");
        Assert.Equal(1, groups.GetArrayLength());
        Assert.Equal(2, groups[0].MemberIds().Length);

        var collection = _factory.Database.GetCollection<BsonDocument>(MongoCollections.Groups);
        var stored = await collection
            .Find(Builders<BsonDocument>.Filter.Eq("_id", ObjectId.Parse(groupId)))
            .FirstAsync();
        Assert.Equal(2, stored["memberIds"].AsBsonArray.Count);
    }

    [Fact]
    public async Task Join_WithInvalidCode_Returns404()
    {
        using var client = _factory.CreateAuthenticatedClient(ObjectId.GenerateNewId());

        var response = await client.PostAsJsonAsync(
            "/groups/join",
            new { inviteCode = "ZZZZZZZZ" });

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);

        using var json = await DongiApiFactory.ReadJsonAsync(response);
        Assert.Equal("Invalid invite code.", json.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Invite_ReturnsCodeAndFrontendJoinUrl_ForMembersOnly()
    {
        var owner = ObjectId.GenerateNewId();
        var outsider = ObjectId.GenerateNewId();
        using var ownerClient = _factory.CreateAuthenticatedClient(owner);
        using var outsiderClient = _factory.CreateAuthenticatedClient(outsider);

        var group = await GroupApiHelpers.CreateGroupAsync(ownerClient, "Trip");
        var groupId = group.Id();

        var invite = await GroupApiHelpers.GetInviteAsync(ownerClient, groupId);
        var inviteCode = invite.GetProperty("inviteCode").GetString()!;

        Assert.Matches("^[0-9A-Za-z]{8}$", inviteCode);
        Assert.Equal(
            $"{DongiApiFactory.TestFrontendBaseUrl}/#/join/{inviteCode}",
            invite.GetProperty("joinUrl").GetString());

        var forbidden = await outsiderClient.GetAsync($"/groups/{groupId}/invite");
        Assert.Equal(HttpStatusCode.Forbidden, forbidden.StatusCode);
    }

    [Fact]
    public async Task Endpoints_WithoutToken_Return401()
    {
        using var anonymous = _factory.CreateClient();
        var groupId = ObjectId.GenerateNewId().ToString();

        var responses = new[]
        {
            await anonymous.GetAsync("/groups"),
            await anonymous.PostAsJsonAsync("/groups", new { name = "Trip" }),
            await anonymous.GetAsync($"/groups/{groupId}"),
            await anonymous.PostAsJsonAsync("/groups/join", new { inviteCode = "AAAAAAAA" }),
            await anonymous.GetAsync($"/groups/{groupId}/invite"),
        };

        Assert.All(responses, response => Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode));
    }

    [Fact]
    public async Task MongoIndexes_IncludeUniqueInviteCodeAndMemberLookupIndexes()
    {
        // Starting the host runs the background index initializer.
        using var client = _factory.CreateClient();

        await _factory.WaitForIndexAsync(MongoCollections.Groups, "unique_inviteCode");
        await _factory.WaitForIndexAsync(MongoCollections.Groups, "memberIds");

        var collection = _factory.Database.GetCollection<BsonDocument>(MongoCollections.Groups);
        using var cursor = await collection.Indexes.ListAsync();
        var indexes = await cursor.ToListAsync();

        Assert.Contains(indexes, index =>
            index["name"].AsString == "unique_inviteCode" &&
            index["key"].AsBsonDocument.Contains("inviteCode") &&
            index["unique"].ToBoolean());

        Assert.Contains(indexes, index =>
            index["name"].AsString == "memberIds" &&
            index["key"].AsBsonDocument.Contains("memberIds"));
    }
}
