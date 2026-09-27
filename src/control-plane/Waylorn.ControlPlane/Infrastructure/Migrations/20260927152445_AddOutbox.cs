using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Waylorn.ControlPlane.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddOutbox : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Outbox",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OrganizationId = table.Column<Guid>(type: "uuid", nullable: false),
                    SiteId = table.Column<Guid>(type: "uuid", nullable: true),
                    Destination = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    Subject = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    Payload = table.Column<string>(type: "text", nullable: false),
                    CreatedUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    PublishedUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    NextAttemptUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    LeaseUntilUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    ClaimToken = table.Column<Guid>(type: "uuid", nullable: true),
                    Attempts = table.Column<int>(type: "integer", nullable: false),
                    LastError = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Outbox", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Outbox_PublishedUtc_NextAttemptUtc_LeaseUntilUtc",
                table: "Outbox",
                columns: new[] { "PublishedUtc", "NextAttemptUtc", "LeaseUntilUtc" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Outbox");
        }
    }
}
