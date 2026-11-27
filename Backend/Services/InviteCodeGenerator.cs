using System.Security.Cryptography;

namespace Dongi.Api.Services;

/// <summary>Generates random group invite codes.</summary>
public interface IInviteCodeGenerator
{
    string CreateCode();
}

/// <summary>
/// Cryptographically random eight-character base62 code. An eight-character code
/// has roughly 47 bits of entropy, which makes guessing a valid code impractical
/// while keeping the join link short.
/// </summary>
internal sealed class InviteCodeGenerator : IInviteCodeGenerator
{
    private const string Alphabet =
        "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

    public const int CodeLength = 8;

    public string CreateCode()
    {
        Span<char> code = stackalloc char[CodeLength];

        for (var index = 0; index < code.Length; index++)
        {
            code[index] = Alphabet[RandomNumberGenerator.GetInt32(Alphabet.Length)];
        }

        return new string(code);
    }
}
