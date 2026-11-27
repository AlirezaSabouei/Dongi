using System.Net;
using Dongi.Api.Data;
using Dongi.Api.Tests.Infrastructure;
using MongoDB.Bson;
using MongoDB.Driver;

namespace Dongi.Api.Tests;

public sealed class PhoneRateLimitTests : IClassFixture<DongiApiFactory>
{
    private readonly DongiApiFactory _factory;
    private readonly HttpClient _client;

    public PhoneRateLimitTests(DongiApiFactory factory)
    {
        _factory = factory;
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task FourthRequestWithinTenMinutes_Returns429AndSendsOnlyThreeSms()
    {
        var phone = DongiApiFactory.NewPhoneNumber();

        for (var request = 1; request <= 3; request++)
        {
            Assert.Equal(HttpStatusCode.OK, (await RequestCodeAsync(phone)).StatusCode);
        }

        var blocked = await RequestCodeAsync(phone);

        Assert.Equal(HttpStatusCode.TooManyRequests, blocked.StatusCode);
        Assert.Equal(3, _factory.Sms.MessagesFor(phone).Count);

        var codes = _factory.Database.GetCollection<BsonDocument>(MongoCollections.OtpCodes);
        Assert.Equal(3, await codes.CountDocumentsAsync(Builders<BsonDocument>.Filter.Eq("phone", phone)));

        var limits = _factory.Database.GetCollection<BsonDocument>(MongoCollections.OtpRequestLimits);
        var limit = await limits.Find(Builders<BsonDocument>.Filter.Eq("_id", phone)).FirstOrDefaultAsync();
        Assert.NotNull(limit);
        Assert.Equal(4, limit["count"].ToInt32());
    }

    [Fact]
    public async Task EquivalentPhoneFormats_ShareTheSameLimitBucket()
    {
        // +98912 123 4567, +98912-123-4567, 09121234567, 00989121234567 and
        // +989121234567 must all count against one normalized key.
        var normalized = DongiApiFactory.NewPhoneNumber();
        var digits = normalized[1..];

        var variants = new[]
        {
            normalized,
            "+" + digits[..3] + " " + digits[3..6] + " " + digits[6..],
            "0" + digits[2..],
            "+" + digits[..3] + "-" + digits[3..6] + "-" + digits[6..],
            "00" + digits,
        };

        foreach (var variant in variants.Take(3))
        {
            Assert.Equal(HttpStatusCode.OK, (await RequestCodeAsync(variant)).StatusCode);
        }

        foreach (var variant in variants.Skip(3))
        {
            Assert.Equal(
                HttpStatusCode.TooManyRequests,
                (await RequestCodeAsync(variant)).StatusCode);
        }

        var limits = _factory.Database.GetCollection<BsonDocument>(MongoCollections.OtpRequestLimits);
        var limit = await limits.Find(Builders<BsonDocument>.Filter.Eq("_id", normalized)).FirstOrDefaultAsync();
        Assert.NotNull(limit);
        Assert.Equal(5, limit["count"].ToInt32());
    }

    [Fact]
    public async Task AfterTenMinutesWindow_PhoneCanRequestAgain()
    {
        var phone = DongiApiFactory.NewPhoneNumber();

        for (var request = 1; request <= 3; request++)
        {
            Assert.Equal(HttpStatusCode.OK, (await RequestCodeAsync(phone)).StatusCode);
        }

        Assert.Equal(HttpStatusCode.TooManyRequests, (await RequestCodeAsync(phone)).StatusCode);

        _factory.Clock.Advance(TimeSpan.FromMinutes(10) + TimeSpan.FromSeconds(1));

        // A new window allows three more requests.
        for (var request = 1; request <= 3; request++)
        {
            Assert.Equal(HttpStatusCode.OK, (await RequestCodeAsync(phone)).StatusCode);
        }

        Assert.Equal(HttpStatusCode.TooManyRequests, (await RequestCodeAsync(phone)).StatusCode);
    }

    private Task<HttpResponseMessage> RequestCodeAsync(string phone) =>
        _client.PostAsJsonAsync("/auth/request-code", new { phone });
}
