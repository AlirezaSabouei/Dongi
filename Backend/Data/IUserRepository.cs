using Dongi.Api.Models;

namespace Dongi.Api.Data;

/// <summary>Persistence operations for <see cref="User"/> documents.</summary>
public interface IUserRepository
{
    /// <summary>
    /// Finds the user for a phone number, creating it on first login and
    /// refreshing the last-login timestamp. The phone number is unique.
    /// </summary>
    Task<User> UpsertByPhoneAsync(string phone, DateTime utcNow, CancellationToken cancellationToken);
}
