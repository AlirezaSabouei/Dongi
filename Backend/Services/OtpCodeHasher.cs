using System.Security.Cryptography;
using System.Text;
using Dongi.Api.Auth;
using Microsoft.Extensions.Options;

namespace Dongi.Api.Services;

/// <summary>
/// Hashes OTP codes before they are persisted. The HMAC key is derived from the
/// JWT signing secret, so a database leak does not allow offline recovery of
/// six-digit codes.
/// </summary>
public interface IOtpCodeHasher
{
    string Hash(string phoneNumber, string code);

    bool Verify(string phoneNumber, string code, string expectedHash);
}

internal sealed class OtpCodeHasher : IOtpCodeHasher
{
    private readonly byte[] _key;

    public OtpCodeHasher(IOptions<JwtSettings> jwtSettings)
    {
        _key = Encoding.UTF8.GetBytes(jwtSettings.Value.Secret);
    }

    public string Hash(string phoneNumber, string code) =>
        Convert.ToHexString(ComputeHash(phoneNumber, code));

    public bool Verify(string phoneNumber, string code, string expectedHash)
    {
        byte[] expected;

        try
        {
            expected = Convert.FromHexString(expectedHash);
        }
        catch (FormatException)
        {
            return false;
        }

        var actual = ComputeHash(phoneNumber, code);
        return CryptographicOperations.FixedTimeEquals(actual, expected);
    }

    private byte[] ComputeHash(string phoneNumber, string code) =>
        HMACSHA256.HashData(_key, Encoding.UTF8.GetBytes($"{phoneNumber}:{code}"));
}
