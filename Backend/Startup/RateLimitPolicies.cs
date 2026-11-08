namespace Dongi.Api.Startup;

/// <summary>Names of the rate-limit policies applied by endpoint attributes.</summary>
public static class RateLimitPolicies
{
    /// <summary>Per-client-IP limit for the auth endpoints.</summary>
    public const string AuthPerIp = "auth-per-ip";
}
