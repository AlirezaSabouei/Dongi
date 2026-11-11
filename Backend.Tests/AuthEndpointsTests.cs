using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Text;
using System.Text.Json;
using Dongi.Api.Data;
using Dongi.Api.Tests.Infrastructure;
using Microsoft.IdentityModel.Tokens;
using MongoDB.Bson;
using MongoDB.Driver;

namespace Dongi.Api.Tests;

public sealed class AuthEndpointsTests : IClassFixture<DongiApiFactory>
{
    private readonly DongiApiFactory _factory;
    private readonly HttpClient _client;

    public AuthEndpointsTests(DongiApiFactory factory)
    {
        _factory = factory;
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task RequestCode_WithValidPhone_Returns200AndStoresHashedCodeWithTwoMinuteExpiry()
    {
        var phone = DongiApiFactory.NewPhoneNumber();

        var response = await _client.PostAsJsonAsync("/auth/request-code", new { phone });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var code = _factory.Sms.LastCodeFor(phone);
        Assert.Matches(@"^\d{6}$", code);

        var otp = await FindOtpAsync(phone);
        Assert.NotNull(otp);

        // The plaintext code is never persisted.
        Assert.False(otp.Contains("code"));

        var storedHash = otp["codeHash"].AsString;
        Assert.NotEqual(code, storedHash);
        Assert.NotEmpty(storedHash);

        var expiresAt = otp["expiresAt"].AsBsonDateTime.ToUniversalTime();
        var expected = _factory.Clock.GetUtcNow().UtcDateTime.AddMinutes(2);
        Assert.InRange(expiresAt, expected.AddSeconds(-2), expected.AddSeconds(2));

        Assert.True(otp["usedAt"].IsBsonNull);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("08121234567")]
    [InlineData("0912123456")]
    [InlineData("+98912")]
    [InlineData("not-a-phone")]
    [InlineData("++989121234567")]
    [InlineData("+1 415 555 0100 ext 4")]
    public async Task RequestCode_WithInvalidPhone_Returns400WithGenericMessage(string phone)
    {
        var response = await _client.PostAsJsonAsync("/auth/request-code", new { phone });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        using var json = await DongiApiFactory.ReadJsonAsync(response);
        Assert.Equal("Invalid phone number.", json.RootElement.GetProperty("message").GetString());
    }

    [Theory]
    [InlineData("plain")]
    [InlineData("spaces")]
    [InlineData("dashes")]
    public async Task RequestCode_WithIranianNationalMobile_NormalizesToE164(string format)
    {
        var normalized = DongiApiFactory.NewPhoneNumber();
        var local = "0" + normalized[3..];

        var input = format switch
        {
            "spaces" => $"{local[..4]} {local[4..7]} {local[7..]}",
            "dashes" => $"{local[..4]}-{local[4..7]}-{local[7..]}",
            _ => local,
        };

        var response = await _client.PostAsJsonAsync("/auth/request-code", new { phone = input });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Matches(@"^\d{6}$", _factory.Sms.LastCodeFor(normalized));

        var otp = await FindOtpAsync(normalized);
        Assert.NotNull(otp);
        Assert.Equal(normalized, otp["phone"].AsString);
    }

    [Fact]
    public async Task VerifyCode_WithCorrectCode_ReturnsJwtAndCreatesUser()
    {
        var phone = DongiApiFactory.NewPhoneNumber();
        await RequestCodeAsync(phone);
        var code = _factory.Sms.LastCodeFor(phone);

        var response = await VerifyAsync(phone, code);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var json = await DongiApiFactory.ReadJsonAsync(response);
        var token = json.RootElement.GetProperty("token").GetString();
        var user = json.RootElement.GetProperty("user");
        var userId = user.GetProperty("id").GetString();

        Assert.False(string.IsNullOrWhiteSpace(token));
        Assert.Equal(phone, user.GetProperty("phone").GetString());
        Assert.Matches("^[0-9a-f]{24}$", userId);

        // The user is upserted in MongoDB, keyed by phone.
        var users = _factory.Database.GetCollection<BsonDocument>(MongoCollections.Users);
        var userDocument = await users
            .Find(Builders<BsonDocument>.Filter.Eq("phone", phone))
            .FirstOrDefaultAsync();

        Assert.NotNull(userDocument);
        Assert.Equal(userId, userDocument["_id"].AsObjectId.ToString());

        // The token is a valid HS256 JWT signed with the configured secret.
        var handler = new JwtSecurityTokenHandler { MapInboundClaims = false };
        var principal = handler.ValidateToken(
            token,
            new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidIssuer = DongiApiFactory.TestJwtIssuer,
                ValidateAudience = true,
                ValidAudience = DongiApiFactory.TestJwtAudience,
                ValidateIssuerSigningKey = true,
                IssuerSigningKey = new SymmetricSecurityKey(
                    Encoding.UTF8.GetBytes(DongiApiFactory.TestJwtSecret)),
                // Lifetime is asserted below against the token's own timestamps;
                // the test clock may be ahead of wall-clock time after the expiry test.
                ValidateLifetime = false,
            },
            out var validatedToken);

        Assert.Equal(userId, principal.FindFirst("sub")!.Value);
        Assert.Equal(phone, principal.FindFirst("phone")!.Value);

        var jwt = Assert.IsType<JwtSecurityToken>(validatedToken);
        Assert.Equal(TimeSpan.FromDays(7), jwt.ValidTo - jwt.ValidFrom);
    }

    [Fact]
    public async Task VerifyCode_SameCodeTwice_Returns401()
    {
        var phone = DongiApiFactory.NewPhoneNumber();
        await RequestCodeAsync(phone);
        var code = _factory.Sms.LastCodeFor(phone);

        var first = await VerifyAsync(phone, code);
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);

        var second = await VerifyAsync(phone, code);
        Assert.Equal(HttpStatusCode.Unauthorized, second.StatusCode);

        using var json = await DongiApiFactory.ReadJsonAsync(second);
        Assert.Equal(
            "Invalid or expired verification code.",
            json.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task VerifyCode_WrongCodeFiveTimes_ReturnsGeneric401WithoutLockout()
    {
        var phone = DongiApiFactory.NewPhoneNumber();
        await RequestCodeAsync(phone);
        var code = _factory.Sms.LastCodeFor(phone);
        var wrongCode = code == "000000" ? "000001" : "000000";

        for (var attempt = 1; attempt <= 5; attempt++)
        {
            var response = await VerifyAsync(phone, wrongCode);

            Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);

            using var json = await DongiApiFactory.ReadJsonAsync(response);
            Assert.Equal(
                "Invalid or expired verification code.",
                json.RootElement.GetProperty("message").GetString());
        }

        // No lockout leak: the correct code still works after wrong attempts.
        var correct = await VerifyAsync(phone, code);
        Assert.Equal(HttpStatusCode.OK, correct.StatusCode);
    }

    [Fact]
    public async Task VerifyCode_AfterExpiry_Returns401()
    {
        var phone = DongiApiFactory.NewPhoneNumber();
        await RequestCodeAsync(phone);
        var code = _factory.Sms.LastCodeFor(phone);

        _factory.Clock.Advance(TimeSpan.FromMinutes(2) + TimeSpan.FromSeconds(1));

        var response = await VerifyAsync(phone, code);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);

        using var json = await DongiApiFactory.ReadJsonAsync(response);
        Assert.Equal(
            "Invalid or expired verification code.",
            json.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task VerifyCode_OlderCodeIsRejectedAfterANewerCodeIsIssued()
    {
        var phone = DongiApiFactory.NewPhoneNumber();
        await RequestCodeAsync(phone);
        var olderCode = _factory.Sms.LastCodeFor(phone);

        await RequestCodeAsync(phone);
        var newerCode = _factory.Sms.LastCodeFor(phone);

        if (olderCode != newerCode)
        {
            var older = await VerifyAsync(phone, olderCode);
            Assert.Equal(HttpStatusCode.Unauthorized, older.StatusCode);
        }

        var newest = await VerifyAsync(phone, newerCode);
        Assert.Equal(HttpStatusCode.OK, newest.StatusCode);
    }

    [Fact]
    public async Task VerifyCode_ForUnknownPhone_ReturnsSameGeneric401()
    {
        var response = await VerifyAsync(DongiApiFactory.NewPhoneNumber(), "123456");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);

        using var json = await DongiApiFactory.ReadJsonAsync(response);
        Assert.Equal(
            "Invalid or expired verification code.",
            json.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task RequestCode_ResponseIsIdenticalForExistingAndNewUsers()
    {
        var newPhone = DongiApiFactory.NewPhoneNumber();
        var newResponse = await _client.PostAsJsonAsync("/auth/request-code", new { phone = newPhone });
        var newBody = await newResponse.Content.ReadAsStringAsync();

        // Create the user first, then request another code.
        var code = _factory.Sms.LastCodeFor(newPhone);
        Assert.Equal(HttpStatusCode.OK, (await VerifyAsync(newPhone, code)).StatusCode);

        var existingResponse = await _client.PostAsJsonAsync("/auth/request-code", new { phone = newPhone });
        var existingBody = await existingResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, existingResponse.StatusCode);
        Assert.Equal(newBody, existingBody);
    }

    [Fact]
    public async Task MongoIndexes_IncludeTtlIndexesAndUniquePhoneIndex()
    {
        var otpIndexes = await WaitForIndexesAsync(MongoCollections.OtpCodes);
        Assert.Contains(otpIndexes, index =>
            index.Contains("key") &&
            index["key"].AsBsonDocument.Contains("expiresAt") &&
            index.Contains("expireAfterSeconds") &&
            index["expireAfterSeconds"].ToInt32() == 0);

        var limitIndexes = await WaitForIndexesAsync(MongoCollections.OtpRequestLimits);
        Assert.Contains(limitIndexes, index =>
            index.Contains("key") &&
            index["key"].AsBsonDocument.Contains("expiresAt") &&
            index.Contains("expireAfterSeconds") &&
            index["expireAfterSeconds"].ToInt32() == 0);

        var userIndexes = await WaitForIndexesAsync(MongoCollections.Users);
        Assert.Contains(userIndexes, index =>
            index.Contains("key") &&
            index["key"].AsBsonDocument.Contains("phone") &&
            index.Contains("unique") &&
            index["unique"].ToBoolean());
    }

    private async Task RequestCodeAsync(string phone)
    {
        var response = await _client.PostAsJsonAsync("/auth/request-code", new { phone });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    private Task<HttpResponseMessage> VerifyAsync(string phone, string code) =>
        _client.PostAsJsonAsync("/auth/verify-code", new { phone, code });

    private async Task<BsonDocument?> FindOtpAsync(string phone)
    {
        var collection = _factory.Database.GetCollection<BsonDocument>(MongoCollections.OtpCodes);
        return await collection
            .Find(Builders<BsonDocument>.Filter.Eq("phone", phone))
            .FirstOrDefaultAsync();
    }

    private async Task<List<BsonDocument>> WaitForIndexesAsync(string collectionName)
    {
        var collection = _factory.Database.GetCollection<BsonDocument>(collectionName);
        var deadline = DateTime.UtcNow.AddSeconds(15);
        List<BsonDocument> indexes = [];

        while (DateTime.UtcNow < deadline)
        {
            using var cursor = await collection.Indexes.ListAsync();
            indexes = await cursor.ToListAsync();

            if (indexes.Count > 1)
            {
                return indexes;
            }

            await Task.Delay(100);
        }

        return indexes;
    }
}
