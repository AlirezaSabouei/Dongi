namespace Dongi.Api.Services;

/// <summary>
/// Development SMS sender: logs the message, which includes the generated code,
/// so the OTP flow can be exercised without a real SMS provider.
/// </summary>
internal sealed class ConsoleSmsSender(ILogger<ConsoleSmsSender> logger) : ISmsSender
{
    public Task SendAsync(string phoneNumber, string message, CancellationToken cancellationToken = default)
    {
        logger.LogInformation(
            "[Console SMS] To {PhoneNumber}: {Message}",
            phoneNumber,
            message);
        return Task.CompletedTask;
    }
}
