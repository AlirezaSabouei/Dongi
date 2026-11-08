using System.Security.Cryptography;
using Dongi.Api.Data;
using Dongi.Api.Models;
using Microsoft.Extensions.Options;

namespace Dongi.Api.Services;

public enum OtpRequestStatus
{
    Sent,
    RateLimited,
}

public enum OtpVerificationStatus
{
    Verified,
    Invalid,
}

/// <summary>Issues and redeems SMS one-time codes.</summary>
public interface IOtpService
{
    /// <summary>
    /// Applies the per-phone request limit, stores a new code, and hands it to the
    /// SMS sender. The outcome is independent of whether the phone belongs to an
    /// existing user.
    /// </summary>
    Task<OtpRequestStatus> RequestCodeAsync(string normalizedPhone, CancellationToken cancellationToken);

    /// <summary>
    /// Validates a code and marks it used. Any failure (unknown phone, wrong code,
    /// expired code, reuse) returns the same <see cref="OtpVerificationStatus.Invalid"/>.
    /// </summary>
    Task<OtpVerificationStatus> VerifyCodeAsync(
        string normalizedPhone,
        string code,
        CancellationToken cancellationToken);
}

internal sealed class OtpService(
    IOtpCodeRepository codes,
    IOtpRequestLimiter requestLimiter,
    IOtpCodeHasher hasher,
    ISmsSender smsSender,
    IOptions<OtpSettings> options,
    TimeProvider clock) : IOtpService
{
    private readonly OtpSettings _settings = options.Value;

    public async Task<OtpRequestStatus> RequestCodeAsync(
        string normalizedPhone,
        CancellationToken cancellationToken)
    {
        var now = clock.GetUtcNow();
        var window = TimeSpan.FromMinutes(_settings.RequestWindowMinutes);

        var allowed = await requestLimiter.TryAcquireAsync(
            normalizedPhone,
            now.UtcDateTime,
            window,
            _settings.MaxRequestsPerWindow,
            cancellationToken);

        if (!allowed)
        {
            return OtpRequestStatus.RateLimited;
        }

        var code = GenerateCode(_settings.CodeLength);

        var otp = new OtpCode
        {
            Phone = normalizedPhone,
            CodeHash = hasher.Hash(normalizedPhone, code),
            CreatedAt = now.UtcDateTime,
            ExpiresAt = now.AddMinutes(_settings.ExpiryMinutes).UtcDateTime,
        };

        await codes.InsertAsync(otp, cancellationToken);

        await smsSender.SendAsync(
            normalizedPhone,
            $"Your Dongi verification code is {code}. " +
            $"It expires in {_settings.ExpiryMinutes} minutes.",
            cancellationToken);

        return OtpRequestStatus.Sent;
    }

    public async Task<OtpVerificationStatus> VerifyCodeAsync(
        string normalizedPhone,
        string code,
        CancellationToken cancellationToken)
    {
        var now = clock.GetUtcNow().UtcDateTime;

        var latest = await codes.FindLatestAsync(normalizedPhone, now, cancellationToken);

        if (latest is null ||
            latest.UsedAt is not null ||
            !hasher.Verify(normalizedPhone, code, latest.CodeHash))
        {
            return OtpVerificationStatus.Invalid;
        }

        // Only the request that flips usedAt from null to a value succeeds; this
        // makes a correct code single-use even under concurrent verification.
        return await codes.TryMarkUsedAsync(latest, now, cancellationToken)
            ? OtpVerificationStatus.Verified
            : OtpVerificationStatus.Invalid;
    }

    private static string GenerateCode(int length)
    {
        var upperBound = (int)Math.Pow(10, length);
        var value = RandomNumberGenerator.GetInt32(0, upperBound);
        return value.ToString($"D{length}", System.Globalization.CultureInfo.InvariantCulture);
    }
}
