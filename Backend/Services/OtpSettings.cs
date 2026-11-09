namespace Dongi.Api.Services;

/// <summary>
/// OTP lifetime and throttling policy, read from the <c>Otp</c> configuration
/// section.
/// </summary>
public sealed class OtpSettings
{
    public const string SectionName = "Otp";

    /// <summary>Number of digits in a generated code.</summary>
    public int CodeLength { get; set; } = 6;

    /// <summary>How long a code remains valid after it is issued.</summary>
    public int ExpiryMinutes { get; set; } = 2;

    /// <summary>Length of the per-phone rate-limit window.</summary>
    public int RequestWindowMinutes { get; set; } = 10;

    /// <summary>Maximum code requests per phone number in one window.</summary>
    public int MaxRequestsPerWindow { get; set; } = 3;

    public void EnsureValid()
    {
        if (CodeLength is < 4 or > 10)
        {
            throw new InvalidOperationException("Otp:CodeLength must be between 4 and 10.");
        }

        if (ExpiryMinutes <= 0)
        {
            throw new InvalidOperationException("Otp:ExpiryMinutes must be greater than zero.");
        }

        if (RequestWindowMinutes <= 0)
        {
            throw new InvalidOperationException("Otp:RequestWindowMinutes must be greater than zero.");
        }

        if (MaxRequestsPerWindow <= 0)
        {
            throw new InvalidOperationException("Otp:MaxRequestsPerWindow must be greater than zero.");
        }
    }
}
