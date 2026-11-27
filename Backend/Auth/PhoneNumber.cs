using System.Text.RegularExpressions;

namespace Dongi.Api.Auth;

/// <summary>
/// Normalizes and validates phone numbers. Numbers are stored and used for rate
/// limiting only after they have been reduced to strict E.164 form
/// (<c>+</c> followed by 8-15 digits, no leading zero), so equivalent inputs
/// share a single rate-limit bucket. Iranian mobile numbers entered in national
/// form (<c>09xxxxxxxxx</c>) are converted to <c>+989xxxxxxxxx</c>.
/// </summary>
public static partial class PhoneNumber
{
    [GeneratedRegex(@"^\+[1-9]\d{7,14}$", RegexOptions.CultureInvariant)]
    private static partial Regex E164Pattern();

    [GeneratedRegex(@"^09\d{9}$", RegexOptions.CultureInvariant)]
    private static partial Regex IranianMobilePattern();

    public static bool TryNormalize(string? raw, out string normalized)
    {
        normalized = string.Empty;

        if (string.IsNullOrWhiteSpace(raw))
        {
            return false;
        }

        var candidate = raw.Trim();

        // Accept the international "00" prefix as an alias for "+".
        if (candidate.StartsWith("00", StringComparison.Ordinal))
        {
            candidate = "+" + candidate[2..];
        }

        Span<char> buffer = stackalloc char[candidate.Length];
        var length = 0;

        foreach (var character in candidate)
        {
            if (character is >= '0' and <= '9')
            {
                buffer[length++] = character;
            }
            else if (character == '+' && length == 0)
            {
                buffer[length++] = character;
            }
            else if (character is ' ' or '-' or '(' or ')' or '.')
            {
                // Formatting characters are ignored so "+98 912 123 4567"
                // normalizes to "+989121234567".
            }
            else
            {
                return false;
            }
        }

        var cleaned = new string(buffer[..length]);

        // Iranian mobiles are commonly entered in national form (09xxxxxxxxx).
        // Convert to E.164 (+989xxxxxxxxx) so every spelling maps to one user.
        if (IranianMobilePattern().IsMatch(cleaned))
        {
            cleaned = "+98" + cleaned[1..];
        }

        if (!E164Pattern().IsMatch(cleaned))
        {
            return false;
        }

        normalized = cleaned;
        return true;
    }
}
