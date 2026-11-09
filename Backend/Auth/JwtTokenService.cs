using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Dongi.Api.Models;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace Dongi.Api.Auth;

/// <summary>Issues signed access tokens for authenticated users.</summary>
public interface IJwtTokenService
{
    string CreateToken(User user);
}

internal sealed class JwtTokenService(IOptions<JwtSettings> settings, TimeProvider clock) : IJwtTokenService
{
    private readonly JwtSettings _settings = settings.Value;

    public string CreateToken(User user)
    {
        var now = clock.GetUtcNow();
        var claims = new Claim[]
        {
            new(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new("phone", user.Phone),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString("N")),
            new(
                JwtRegisteredClaimNames.Iat,
                now.ToUnixTimeSeconds().ToString(System.Globalization.CultureInfo.InvariantCulture),
                ClaimValueTypes.Integer64),
        };

        var credentials = new SigningCredentials(
            new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_settings.Secret)),
            SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: _settings.Issuer,
            audience: _settings.Audience,
            claims: claims,
            notBefore: now.UtcDateTime,
            expires: now.AddDays(_settings.ExpiryDays).UtcDateTime,
            signingCredentials: credentials);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
