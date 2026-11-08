using System.Net;
using Dongi.Api.Tests.Infrastructure;

namespace Dongi.Api.Tests;

public sealed class IpRateLimitTests : IClassFixture<StrictIpApiFactory>
{
    private readonly StrictIpApiFactory _factory;
    private readonly HttpClient _client;

    public IpRateLimitTests(StrictIpApiFactory factory)
    {
        _factory = factory;
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task TwentyFirstRequestWithinAnHour_Returns429()
    {
        // TestServer does not assign a client IP; the limiter falls back to a
        // single "unknown" partition, which makes the per-IP policy observable.
        for (var request = 1; request <= 20; request++)
        {
            var phone = DongiApiFactory.NewPhoneNumber();
            var response = await _client.PostAsJsonAsync("/auth/request-code", new { phone });

            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        }

        var blocked = await _client.PostAsJsonAsync(
            "/auth/request-code",
            new { phone = DongiApiFactory.NewPhoneNumber() });

        Assert.Equal(HttpStatusCode.TooManyRequests, blocked.StatusCode);

        using var json = await DongiApiFactory.ReadJsonAsync(blocked);
        Assert.Equal(
            "Too many requests. Try again later.",
            json.RootElement.GetProperty("message").GetString());
    }
}
