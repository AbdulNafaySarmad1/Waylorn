using Microsoft.EntityFrameworkCore;
using Waylorn.ControlPlane.Application;
using Waylorn.ControlPlane.Infrastructure;
using Xunit;

namespace Waylorn.ControlPlane.Tests;

// Runs only when WAYLORN_TEST_POSTGRES names a disposable database; the test drops and migrates it.
public sealed class PostgresFactAttribute : FactAttribute
{
    public PostgresFactAttribute()
    {
        if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("WAYLORN_TEST_POSTGRES")))
            Skip = "Set WAYLORN_TEST_POSTGRES to a disposable PostgreSQL database.";
    }
}

public class PostgresTests
{
    [PostgresFact]
    public async Task Concurrent_audit_appends_form_one_unbroken_chain()
    {
        var options = new DbContextOptionsBuilder<WaylornDbContext>()
            .UseNpgsql(Environment.GetEnvironmentVariable("WAYLORN_TEST_POSTGRES")).Options;
        var org = Guid.NewGuid();
        await using (var setup = new WaylornDbContext(options, new TenantScope(org)))
        {
            await setup.Database.EnsureDeletedAsync();
            await setup.Database.MigrateAsync();
        }

        // Without the per-organization lock, writers read the same head and collide on the sequence index.
        await Task.WhenAll(Enumerable.Range(0, 24).Select(async i =>
        {
            await using var db = new WaylornDbContext(options, new TenantScope(org));
            AuditWriter.Add(db, $"writer-{i}", "concurrent", "asset", Guid.NewGuid(), null);
            await db.SaveChangesAsync();
        }));

        await using var check = new WaylornDbContext(options, new TenantScope(org));
        var report = await AuditChain.VerifyAsync(check, CancellationToken.None);
        Assert.Null(report.FirstBreak);
        Assert.Equal(24, report.Checked);
        Assert.Equal(24, report.HeadSequence);
    }
}
