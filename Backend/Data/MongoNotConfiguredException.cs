namespace Dongi.Api.Data;

/// <summary>
/// Raised when the API is asked to use MongoDB but no connection string has
/// been configured. It is translated into a 503 response by the exception
/// handler instead of crashing the process, so <c>/health</c> keeps working.
/// </summary>
public sealed class MongoNotConfiguredException(string message) : Exception(message);
