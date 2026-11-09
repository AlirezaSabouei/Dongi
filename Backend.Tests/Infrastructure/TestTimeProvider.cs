namespace Dongi.Api.Tests.Infrastructure;

/// <summary>
/// Mutable clock used by the integration tests to exercise code expiry and
/// rate-limit windows without waiting in real time.
/// </summary>
public sealed class TestTimeProvider : TimeProvider
{
    private long _utcTicks = DateTimeOffset.UtcNow.UtcTicks;

    public override DateTimeOffset GetUtcNow() => new(Interlocked.Read(ref _utcTicks), TimeSpan.Zero);

    public void Advance(TimeSpan duration) => Interlocked.Add(ref _utcTicks, duration.Ticks);
}
