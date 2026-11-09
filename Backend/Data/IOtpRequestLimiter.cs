namespace Dongi.Api.Data;

/// <summary>
/// Fixed-window per-phone counter used to rate limit SMS OTP requests. The
/// implementation is atomic under concurrent requests; the counter is stored in
/// MongoDB so the limit is shared by every API instance.
/// </summary>
public interface IOtpRequestLimiter
{
    /// <summary>
    /// Registers an attempt for <paramref name="phone"/> and returns whether it is
    /// within <paramref name="maxRequests"/> per <paramref name="window"/>.
    /// </summary>
    Task<bool> TryAcquireAsync(
        string phone,
        DateTime utcNow,
        TimeSpan window,
        int maxRequests,
        CancellationToken cancellationToken);
}
