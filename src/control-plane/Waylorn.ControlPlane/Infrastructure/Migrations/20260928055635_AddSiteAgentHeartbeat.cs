using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Waylorn.ControlPlane.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddSiteAgentHeartbeat : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "SiteAgentHeartbeats",
                columns: table => new
                {
                    OrganizationId = table.Column<Guid>(type: "uuid", nullable: false),
                    SiteId = table.Column<Guid>(type: "uuid", nullable: false),
                    AgentId = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    LastSeenUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IntervalMs = table.Column<int>(type: "integer", nullable: false),
                    SpoolDepth = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SiteAgentHeartbeats", x => new { x.OrganizationId, x.SiteId, x.AgentId });
                    table.ForeignKey(
                        name: "FK_SiteAgentHeartbeats_Sites_OrganizationId_SiteId",
                        columns: x => new { x.OrganizationId, x.SiteId },
                        principalTable: "Sites",
                        principalColumns: new[] { "OrganizationId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_SiteAgentHeartbeats_OrganizationId_SiteId_LastSeenUtc",
                table: "SiteAgentHeartbeats",
                columns: new[] { "OrganizationId", "SiteId", "LastSeenUtc" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "SiteAgentHeartbeats");
        }
    }
}
