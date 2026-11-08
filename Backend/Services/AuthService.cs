using Dongi.Api.Auth;
using Dongi.Api.Data;
using Dongi.Api.Models;

namespace Dongi.Api.Services;

public enum RequestCodeOutcome
{
    Sent,
    RateLimited,
}

public sealed record VerifyCodeOutcome(string Token, User User);

/// <summary>
/// Coordinates the OTP verification flow: redeem the code, upsert the user on
/// first successful login, and issue a JWT.
/// </summary>
public interface IAuthService
{
    Task<RequestCodeOutcome> RequestCodeAsync(string normalizedPhone, CancellationToken cancellationToken);

    /// <summary>Returns <c>null</c> for any invalid code so callers can respond generically.</summary>
    Task<VerifyCodeOutcome?> VerifyCodeAsync(
        string normalizedPhone,
        string code,
        CancellationToken cancellationToken);
}

internal sealed class AuthService(
    IOtpService otpService,
    IUserRepository users,
    IJwtTokenService jwtTokenService,
    TimeProvider clock) : IAuthService
{
    public async Task<RequestCodeOutcome> RequestCodeAsync(
        string normalizedPhone,
        CancellationToken cancellationToken)
    {
        var status = await otpService.RequestCodeAsync(normalizedPhone, cancellationToken);

        return status == OtpRequestStatus.Sent
            ? RequestCodeOutcome.Sent
            : RequestCodeOutcome.RateLimited;
    }

    public async Task<VerifyCodeOutcome?> VerifyCodeAsync(
        string normalizedPhone,
        string code,
        CancellationToken cancellationToken)
    {
        var status = await otpService.VerifyCodeAsync(normalizedPhone, code, cancellationToken);

        if (status != OtpVerificationStatus.Verified)
        {
            return null;
        }

        var user = await users.UpsertByPhoneAsync(
            normalizedPhone,
            clock.GetUtcNow().UtcDateTime,
            cancellationToken);

        return new VerifyCodeOutcome(jwtTokenService.CreateToken(user), user);
    }
}
