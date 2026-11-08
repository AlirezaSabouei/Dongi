namespace Dongi.Api.Services;

/// <summary>
/// Placeholder sender used when no real SMS provider is configured. It fails
/// loudly instead of silently accepting requests that cannot be fulfilled; issue
/// #4 will replace it with the production provider.
/// </summary>
internal sealed class UnavailableSmsSender : ISmsSender
{
    public Task SendAsync(string phoneNumber, string message, CancellationToken cancellationToken = default) =>
        throw new SmsNotConfiguredException(
            "An SMS provider is not configured. Set Sms:Provider to 'Console' for development " +
            "or configure a real provider.");
}
