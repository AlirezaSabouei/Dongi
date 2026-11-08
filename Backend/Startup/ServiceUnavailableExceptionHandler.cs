using Dongi.Api.Data;
using Dongi.Api.DTOs;
using Dongi.Api.Services;
using Microsoft.AspNetCore.Diagnostics;
using MongoDB.Driver;

namespace Dongi.Api.Startup;

/// <summary>
/// Converts infrastructure failures (MongoDB not configured/unreachable, SMS
/// provider not configured) into a generic 503 response instead of leaking
/// exception details to clients.
/// </summary>
internal sealed class ServiceUnavailableExceptionHandler(
    ILogger<ServiceUnavailableExceptionHandler> logger) : IExceptionHandler
{
    private static readonly MessageResponse Response = new(
        "The service is temporarily unavailable. Please try again later.");

    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext,
        Exception exception,
        CancellationToken cancellationToken)
    {
        if (exception is not (MongoNotConfiguredException or MongoException or SmsNotConfiguredException))
        {
            return false;
        }

        logger.LogError(exception, "Request failed because a dependency is unavailable.");

        httpContext.Response.StatusCode = StatusCodes.Status503ServiceUnavailable;
        await httpContext.Response.WriteAsJsonAsync(Response, cancellationToken);
        return true;
    }
}
