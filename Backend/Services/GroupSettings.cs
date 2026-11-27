namespace Dongi.Api.Services;

/// <summary>
/// Group settings, read from the <c>Groups</c> configuration section. The
/// frontend base URL is used to build shareable invite links.
/// </summary>
public sealed class GroupSettings
{
    public const string SectionName = "Groups";

    /// <summary>Origin the frontend is served from, without a trailing slash.</summary>
    public string FrontendBaseUrl { get; set; } = "http://localhost:5173";

    /// <summary>Maximum accepted group-name length after trimming.</summary>
    public int NameMaxLength { get; set; } = 100;

    /// <summary>
    /// Number of invite codes to try before giving up. A retry happens only when
    /// another group already owns the generated code.
    /// </summary>
    public int MaxInviteCodeAttempts { get; set; } = 5;

    public void EnsureValid()
    {
        if (!Uri.TryCreate(FrontendBaseUrl, UriKind.Absolute, out var uri) ||
            (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
        {
            throw new InvalidOperationException(
                "Groups:FrontendBaseUrl must be an absolute http(s) URL.");
        }

        if (NameMaxLength <= 0)
        {
            throw new InvalidOperationException("Groups:NameMaxLength must be greater than zero.");
        }

        if (MaxInviteCodeAttempts <= 0)
        {
            throw new InvalidOperationException("Groups:MaxInviteCodeAttempts must be greater than zero.");
        }
    }
}
