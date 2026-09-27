using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Waylorn.ControlPlane.Infrastructure;

public sealed class WaylornDesignTimeDbContextFactory : IDesignTimeDbContextFactory<WaylornDbContext>
{
    public WaylornDbContext CreateDbContext(string[] args)
    {
        var connection = Environment.GetEnvironmentVariable("WAYLORN_POSTGRES") ??
            "Host=localhost;Database=waylorn;Username=waylorn;Password=development-only";
        var options = new DbContextOptionsBuilder<WaylornDbContext>().UseNpgsql(connection).Options;
        return new WaylornDbContext(options, new TenantScope(Guid.Empty));
    }
}
