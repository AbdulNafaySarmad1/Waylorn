using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Waylorn.ControlPlane.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddSitePollingBudget : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "MaxPollsPerMinute",
                table: "Sites",
                type: "integer",
                nullable: false,
                defaultValue: 600);

            migrationBuilder.AddColumn<int>(
                name: "RequestedIntervalMs",
                table: "SiteAgentHeartbeats",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            // Gateways seen before the budget ran at their approved interval; zero would read as unbounded demand.
            migrationBuilder.Sql("UPDATE \"SiteAgentHeartbeats\" SET \"RequestedIntervalMs\" = \"IntervalMs\";");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "MaxPollsPerMinute",
                table: "Sites");

            migrationBuilder.DropColumn(
                name: "RequestedIntervalMs",
                table: "SiteAgentHeartbeats");
        }
    }
}
