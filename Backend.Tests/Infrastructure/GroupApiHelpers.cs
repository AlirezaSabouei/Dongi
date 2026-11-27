using System.Net;
using System.Text.Json;

namespace Dongi.Api.Tests.Infrastructure;

/// <summary>Small helpers shared by the group endpoint tests.</summary>
internal static class GroupApiHelpers
{
    public static async Task<JsonElement> CreateGroupAsync(HttpClient client, string name)
    {
        var response = await client.PostAsJsonAsync("/groups", new { name });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return await response.Content.ReadFromJsonAsync<JsonElement>();
    }

    public static async Task<JsonElement> GetInviteAsync(HttpClient client, string groupId)
    {
        var response = await client.GetAsync($"/groups/{groupId}/invite");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return await response.Content.ReadFromJsonAsync<JsonElement>();
    }

    public static async Task<string> GetInviteCodeAsync(HttpClient client, string groupId)
    {
        var invite = await GetInviteAsync(client, groupId);
        return invite.GetProperty("inviteCode").GetString()!;
    }

    public static string Id(this JsonElement group) => group.GetProperty("id").GetString()!;

    public static string[] MemberIds(this JsonElement group) =>
        group.GetProperty("memberIds")
            .EnumerateArray()
            .Select(memberId => memberId.GetString()!)
            .ToArray();
}
