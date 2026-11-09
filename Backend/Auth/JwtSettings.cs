namespace Dongi.Api.Auth;

/// <summary>
/// JWT settings, read from the <c>Jwt</c> configuration section. The secret is
/// never committed: supply it through user-secrets or environment variables in
/// any non-development environment.
/// </summary>
public sealed class JwtSettings
{
    public const string SectionName = "Jwt";

    public string Issuer { get; set; } = "dongi";

    public string Audience { get; set; } = "dongi";

    /// <summary>HS256 signing key. Must be at least 32 bytes (256 bits).</summary>
    public string Secret { get; set; } = string.Empty;

    public int ExpiryDays { get; set; } = 7;

    public void EnsureValid()
    {
        if (string.IsNullOrWhiteSpace(Secret) || System.Text.Encoding.UTF8.GetByteCount(Secret) < 32)
        {
            throw new InvalidOperationException(
                "Jwt:Secret must be configured with at least 32 bytes. " +
                "Set it via user-secrets or the Jwt__Secret environment variable.");
        }

        if (string.IsNullOrWhiteSpace(Issuer) || string.IsNullOrWhiteSpace(Audience))
        {
            throw new InvalidOperationException("Jwt:Issuer and Jwt:Audience must be configured.");
        }

        if (ExpiryDays <= 0)
        {
            throw new InvalidOperationException("Jwt:ExpiryDays must be greater than zero.");
        }
    }
}
