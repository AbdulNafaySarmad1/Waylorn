using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Waylorn.ControlPlane.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddAuditChain : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<long>(
                name: "ChainSequence",
                table: "Audit",
                type: "bigint",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PreviousTag",
                table: "Audit",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "AuditHeads",
                columns: table => new
                {
                    OrganizationId = table.Column<Guid>(type: "uuid", nullable: false),
                    Sequence = table.Column<long>(type: "bigint", nullable: false),
                    Tag = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AuditHeads", x => x.OrganizationId);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Audit_OrganizationId_ChainSequence",
                table: "Audit",
                columns: new[] { "OrganizationId", "ChainSequence" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AuditHeads");

            migrationBuilder.DropIndex(
                name: "IX_Audit_OrganizationId_ChainSequence",
                table: "Audit");

            migrationBuilder.DropColumn(
                name: "ChainSequence",
                table: "Audit");

            migrationBuilder.DropColumn(
                name: "PreviousTag",
                table: "Audit");
        }
    }
}
