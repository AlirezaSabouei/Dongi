namespace Dongi.Api.Services;

/// <summary>
/// Raised when the API needs to send an SMS but no provider is configured. It is
/// translated into a 503 response by the exception handler.
/// </summary>
public sealed class SmsNotConfiguredException(string message) : Exception(message);
