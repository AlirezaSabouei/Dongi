namespace Dongi.Api.Startup;

/// <summary>
/// CORS configuration read from the <c>Cors</c> configuration section.
/// </summary>
public sealed class CorsSettings
{
    public const string SectionName = "Cors";

    /// <summary>Name of the policy applied to the API pipeline.</summary>
    public const string FrontendPolicy = "Frontend";

    /// <summary>Vite's default dev-server origin, used when nothing is configured.</summary>
    public const string DefaultFrontendOrigin = "http://localhost:5173";

    /// <summary>Origins allowed to call the API from a browser.</summary>
    public string[] AllowedOrigins { get; set; } = [DefaultFrontendOrigin];
}
