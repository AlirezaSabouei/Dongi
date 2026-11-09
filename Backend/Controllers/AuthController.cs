using Dongi.Api.Auth;
using Dongi.Api.DTOs;
using Dongi.Api.Services;
using Dongi.Api.Startup;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Dongi.Api.Controllers;

/// <summary>
/// Passwordless SMS OTP authentication. Responses never disclose whether a phone
/// number belongs to an existing user.
/// </summary>
[ApiController]
[Route("auth")]
[EnableRateLimiting(RateLimitPolicies.AuthPerIp)]
public sealed class AuthController(IAuthService authService) : ControllerBase
{
    private static readonly MessageResponse SentMessage = new(
        "If the number can receive SMS, a verification code has been sent.");

    private static readonly MessageResponse InvalidCodeMessage = new(
        "Invalid or expired verification code.");

    private static readonly MessageResponse PhoneRateLimitedMessage = new(
        "Too many verification code requests. Please try again later.");

    private static readonly MessageResponse InvalidPhoneMessage = new("Invalid phone number.");

    /// <summary>Requests a six-digit login code for an E.164 phone number.</summary>
    [HttpPost("request-code")]
    [AllowAnonymous]
    [ProducesResponseType<MessageResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<MessageResponse>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<MessageResponse>(StatusCodes.Status429TooManyRequests)]
    [ProducesResponseType<MessageResponse>(StatusCodes.Status503ServiceUnavailable)]
    public async Task<ActionResult<MessageResponse>> RequestCode(
        [FromBody] RequestCodeRequest request,
        CancellationToken cancellationToken)
    {
        if (!PhoneNumber.TryNormalize(request.Phone, out var phone))
        {
            return BadRequest(InvalidPhoneMessage);
        }

        var outcome = await authService.RequestCodeAsync(phone, cancellationToken);

        return outcome == RequestCodeOutcome.RateLimited
            ? StatusCode(StatusCodes.Status429TooManyRequests, PhoneRateLimitedMessage)
            : Ok(SentMessage);
    }

    /// <summary>
    /// Redeems a login code. On success returns a JWT and the user, creating the
    /// user on first verification.
    /// </summary>
    [HttpPost("verify-code")]
    [AllowAnonymous]
    [ProducesResponseType<AuthResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<MessageResponse>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<MessageResponse>(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<MessageResponse>(StatusCodes.Status429TooManyRequests)]
    [ProducesResponseType<MessageResponse>(StatusCodes.Status503ServiceUnavailable)]
    public async Task<ActionResult<AuthResponse>> VerifyCode(
        [FromBody] VerifyCodeRequest request,
        CancellationToken cancellationToken)
    {
        if (!PhoneNumber.TryNormalize(request.Phone, out var phone))
        {
            return BadRequest(InvalidPhoneMessage);
        }

        var outcome = await authService.VerifyCodeAsync(
            phone,
            request.Code?.Trim() ?? string.Empty,
            cancellationToken);

        if (outcome is null)
        {
            return Unauthorized(InvalidCodeMessage);
        }

        return Ok(new AuthResponse(
            outcome.Token,
            new UserResponse(outcome.User.Id.ToString(), outcome.User.Phone)));
    }
}
