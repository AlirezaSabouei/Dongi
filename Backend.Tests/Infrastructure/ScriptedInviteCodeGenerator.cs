using Dongi.Api.Services;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Dongi.Api.Tests.Infrastructure;

/// <summary>
/// Test double that replays a fixed sequence of invite codes, repeating the last
/// one once the sequence is exhausted. Used to exercise code-collision retries.
/// </summary>
public sealed class ScriptedInviteCodeGenerator(IReadOnlyList<string> codes) : IInviteCodeGenerator
{
    private int _next = -1;

    public string CreateCode()
    {
        var index = Interlocked.Increment(ref _next);
        return codes[Math.Min(index, codes.Count - 1)];
    }
}

/// <summary>API factory with a scripted invite-code generator.</summary>
public sealed class ScriptedInviteCodeApiFactory(params string[] codes) : DongiApiFactory
{
    protected override void ConfigureAdditionalTestServices(IServiceCollection services)
    {
        services.RemoveAll<IInviteCodeGenerator>();
        services.AddSingleton<IInviteCodeGenerator>(
            new ScriptedInviteCodeGenerator(codes));
    }
}
