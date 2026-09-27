using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Waylorn.ControlPlane.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class InitialControlPlane : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Assets",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OrganizationId = table.Column<Guid>(type: "uuid", nullable: false),
                    SiteId = table.Column<Guid>(type: "uuid", nullable: false),
                    ZoneId = table.Column<Guid>(type: "uuid", nullable: true),
                    Kind = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Manufacturer = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    Model = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    Serial = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    Firmware = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    Version = table.Column<long>(type: "bigint", nullable: false),
                    Deleted = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Assets", x => x.Id);
                    table.UniqueConstraint("AK_Assets_OrganizationId_Id", x => new { x.OrganizationId, x.Id });
                });

            migrationBuilder.CreateTable(
                name: "Audit",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OrganizationId = table.Column<Guid>(type: "uuid", nullable: false),
                    SiteId = table.Column<Guid>(type: "uuid", nullable: true),
                    Principal = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Action = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    TargetType = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    TargetId = table.Column<Guid>(type: "uuid", nullable: false),
                    Outcome = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    AtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Audit", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Commands",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OrganizationId = table.Column<Guid>(type: "uuid", nullable: false),
                    SiteId = table.Column<Guid>(type: "uuid", nullable: false),
                    AssetId = table.Column<Guid>(type: "uuid", nullable: false),
                    Operation = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Risk = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    State = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    Requester = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    IdempotencyKey = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    ChangeTicket = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    WindowStartUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    WindowEndUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    Approver = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    ApprovedUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    Version = table.Column<long>(type: "bigint", nullable: false),
                    RequestedUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Commands", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Commands_Assets_OrganizationId_AssetId",
                        columns: x => new { x.OrganizationId, x.AssetId },
                        principalTable: "Assets",
                        principalColumns: new[] { "OrganizationId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Relationships",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OrganizationId = table.Column<Guid>(type: "uuid", nullable: false),
                    SourceAssetId = table.Column<Guid>(type: "uuid", nullable: false),
                    TargetAssetId = table.Column<Guid>(type: "uuid", nullable: false),
                    Kind = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    CreatedUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Relationships", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Relationships_Assets_OrganizationId_SourceAssetId",
                        columns: x => new { x.OrganizationId, x.SourceAssetId },
                        principalTable: "Assets",
                        principalColumns: new[] { "OrganizationId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Relationships_Assets_OrganizationId_TargetAssetId",
                        columns: x => new { x.OrganizationId, x.TargetAssetId },
                        principalTable: "Assets",
                        principalColumns: new[] { "OrganizationId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Assets_OrganizationId_SiteId_Deleted",
                table: "Assets",
                columns: new[] { "OrganizationId", "SiteId", "Deleted" });

            migrationBuilder.CreateIndex(
                name: "IX_Audit_OrganizationId_AtUtc",
                table: "Audit",
                columns: new[] { "OrganizationId", "AtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_Commands_OrganizationId_AssetId",
                table: "Commands",
                columns: new[] { "OrganizationId", "AssetId" });

            migrationBuilder.CreateIndex(
                name: "IX_Commands_OrganizationId_Requester_IdempotencyKey",
                table: "Commands",
                columns: new[] { "OrganizationId", "Requester", "IdempotencyKey" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Relationships_OrganizationId_SourceAssetId_TargetAssetId_Ki~",
                table: "Relationships",
                columns: new[] { "OrganizationId", "SourceAssetId", "TargetAssetId", "Kind" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Relationships_OrganizationId_TargetAssetId",
                table: "Relationships",
                columns: new[] { "OrganizationId", "TargetAssetId" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Audit");

            migrationBuilder.DropTable(
                name: "Commands");

            migrationBuilder.DropTable(
                name: "Relationships");

            migrationBuilder.DropTable(
                name: "Assets");
        }
    }
}
