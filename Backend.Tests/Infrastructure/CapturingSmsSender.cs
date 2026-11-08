using System.Collections.Concurrent;
using System.Text.RegularExpressions;
using Dongi.Api.Services;

namespace Dongi.Api.Tests.Infrastructure;

/// <summary>
/// Test double for the SMS provider that records messages so tests can read the
/// code that would have been texted to the user.
/// </summary>
public sealed partial class CapturingSmsSender : ISmsSender
{
    private readonly ConcurrentDictionary<string, ConcurrentQueue<string>> _messages = new();

    public Task SendAsync(string phoneNumber, string message, CancellationToken cancellationToken = default)
    {
        _messages.GetOrAdd(phoneNumber, _ => new ConcurrentQueue<string>()).Enqueue(message);
        return Task.CompletedTask;
    }

    public IReadOnlyList<string> MessagesFor(string phoneNumber) =>
        _messages.TryGetValue(phoneNumber, out var queue) ? queue.ToArray() : [];

    public string LastMessageFor(string phoneNumber)
    {
        var messages = MessagesFor(phoneNumber);
        if (messages.Count == 0)
        {
            throw new InvalidOperationException($"No SMS was sent to {phoneNumber}.");
        }

        return messages[^1];
    }

    public string LastCodeFor(string phoneNumber)
    {
        var match = CodePattern().Match(LastMessageFor(phoneNumber));
        if (!match.Success)
        {
            throw new InvalidOperationException(
                $"The SMS sent to {phoneNumber} did not contain a six-digit code.");
        }

        return match.Groups[1].Value;
    }

    [GeneratedRegex(@"\b(\d{6})\b", RegexOptions.CultureInvariant)]
    private static partial Regex CodePattern();
}
