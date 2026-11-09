using Dongi.Api.Models;
using MongoDB.Driver;

namespace Dongi.Api.Data;

internal sealed class MongoUserRepository(MongoDbContext context) : IUserRepository
{
    private IMongoCollection<User> Collection =>
        context.Database.GetCollection<User>(MongoCollections.Users);

    public async Task<User> UpsertByPhoneAsync(
        string phone,
        DateTime utcNow,
        CancellationToken cancellationToken)
    {
        var update = Builders<User>.Update
            .SetOnInsert(user => user.Phone, phone)
            .SetOnInsert(user => user.CreatedAt, utcNow)
            .Set(user => user.LastLoginAt, utcNow);

        var options = new FindOneAndUpdateOptions<User>
        {
            IsUpsert = true,
            ReturnDocument = ReturnDocument.After,
        };

        try
        {
            var user = await Collection.FindOneAndUpdateAsync(
                user => user.Phone == phone,
                update,
                options,
                cancellationToken);

            return user ?? throw new InvalidOperationException("User upsert returned no document.");
        }
        catch (MongoWriteException exception)
            when (exception.WriteError?.Category == ServerErrorCategory.DuplicateKey)
        {
            // A concurrent first login won the unique-index race; return its user.
            return await Collection
                .Find(user => user.Phone == phone)
                .FirstAsync(cancellationToken);
        }
    }
}
