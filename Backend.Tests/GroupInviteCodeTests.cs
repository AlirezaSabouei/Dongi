using System.Net;
using Dongi.Api.Data;
using Dongi.Api.Tests.Infrastructure;
using MongoDB.Bson;

namespace Dongi.Api.Tests;

/// <summary>
/// Invite-code generation is randomized, so collisions are exercised with a
/// scripted generator and an already-created unique index.
/// </summary>
public sealed class GroupInviteCodeTests
{
    [Fact]
    public async Task Create_WhenInviteCodeCollides_Regenerates()
    {
        using var factory = new ScriptedInviteCodeApiFactory("AAAAAAAA", "BBBBBBBB");
        using var client = factory.CreateAuthenticatedClient(ObjectId.GenerateNewId());
        await factory.WaitForIndexAsync(MongoCollections.Groups, "unique_inviteCode");

        var first = await GroupApiHelpers.CreateGroupAsync(client, "Trip");
        var second = await GroupApiHelpers.CreateGroupAsync(client, "Home");

        Assert.Equal("AAAAAAAA", await GroupApiHelpers.GetInviteCodeAsync(client, first.Id()));
        Assert.Equal("BBBBBBBB", await GroupApiHelpers.GetInviteCodeAsync(client, second.Id()));
    }

    [Fact]
    public async Task Create_WhenGeneratorKeepsColliding_Returns409()
    {
        using var factory = new ScriptedInviteCodeApiFactory("AAAAAAAA");
        using var client = factory.CreateAuthenticatedClient(ObjectId.GenerateNewId());
        await factory.WaitForIndexAsync(MongoCollections.Groups, "unique_inviteCode");

        await GroupApiHelpers.CreateGroupAsync(client, "Trip");

        var response = await client.PostAsJsonAsync("/groups", new { name = "Home" });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);

        using var json = await DongiApiFactory.ReadJsonAsync(response);
        Assert.Equal(
            "Could not allocate a unique invite code. Please try again.",
            json.RootElement.GetProperty("message").GetString());
    }
}
