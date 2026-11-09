namespace Dongi.Api.Startup;

/// <summary>
/// IP-based throttling for the unauthenticated auth endpoints, read from the
/// <c>RateLimiting</c> configuration section.
/// </summary>
public sealed class RateLimitingSettings
{
    public const string SectionName = "RateLimiting";

    /// <summary>Requests allowed per client IP within one window.</summary>
    public int AuthIpPermitLimit { get; set; } = 20;

    /// <summary>Length of the IP rate-limit window.</summary>
    public int AuthIpWindowMinutes { get; set; } = 60;

    public void EnsureValid()
    {
        if (AuthIpPermitLimit <= 0)
        {
            throw new InvalidOperationException("RateLimiting:AuthIpPermitLimit must be greater than zero.");
        }

        if (AuthIpWindowMinutes <= 0)
        {
            throw new InvalidOperationException("RateLimiting:AuthIpWindowMinutes must be greater than zero.");
        }
    }
}
