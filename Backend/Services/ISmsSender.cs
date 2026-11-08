namespace Dongi.Api.Services;

/// <summary>
/// Abstraction over the SMS provider. The development implementation writes the
/// message (including the code) to the application log; a real provider replaces
/// it without touching the OTP flow.
/// </summary>
public interface ISmsSender
{
    Task SendAsync(string phoneNumber, string message, CancellationToken cancellationToken = default);
}
