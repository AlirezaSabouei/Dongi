using Dongi.Api.DTOs;
using Microsoft.AspNetCore.Mvc;

namespace Dongi.Api.Controllers;

[ApiController]
[Route("health")]
public sealed class HealthController : ControllerBase
{
    /// <summary>Liveness probe. Always returns <c>200 OK</c>; no auth required.</summary>
    [HttpGet]
    [ProducesResponseType<HealthResponse>(StatusCodes.Status200OK)]
    public ActionResult<HealthResponse> Get() =>
        Ok(new HealthResponse(Status: "Healthy", TimestampUtc: DateTimeOffset.UtcNow));
}
