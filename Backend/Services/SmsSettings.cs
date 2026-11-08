namespace Dongi.Api.Services;

/// <summary>
/// SMS provider configuration placeholder. No provider is wired up yet; the
/// API key must be provided through user-secrets or environment variables.
/// </summary>
public sealed class SmsSettings
{
    public const string SectionName = "Sms";

    public string Provider { get; set; } = string.Empty;

    public string ApiKey { get; set; } = string.Empty;

    public string SenderNumber { get; set; } = string.Empty;
}
