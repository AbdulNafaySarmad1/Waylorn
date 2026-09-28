using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Waylorn.ControlPlane.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddClassifiedEgress : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "EgressDestinations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OrganizationId = table.Column<Guid>(type: "uuid", nullable: false),
                    DisplayName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    ProviderClass = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    Endpoint = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    Model = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Locality = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    ClassificationCeiling = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Enabled = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EgressDestinations", x => x.Id);
                    table.UniqueConstraint("AK_EgressDestinations_OrganizationId_Id", x => new { x.OrganizationId, x.Id });
                });

            migrationBuilder.CreateTable(
                name: "EgressRecords",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OrganizationId = table.Column<Guid>(type: "uuid", nullable: false),
                    DestinationId = table.Column<Guid>(type: "uuid", nullable: false),
                    AtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Categories = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    Decision = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Reason = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    PolicyVersion = table.Column<long>(type: "bigint", nullable: false),
                    Actor = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    ActorType = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Bytes = table.Column<int>(type: "integer", nullable: false),
                    RedactedFieldCount = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EgressRecords", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "EgressPolicies",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OrganizationId = table.Column<Guid>(type: "uuid", nullable: false),
                    DestinationId = table.Column<Guid>(type: "uuid", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false),
                    Rules = table.Column<string>(type: "character varying(20000)", maxLength: 20000, nullable: false),
                    UpdatedUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedBy = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EgressPolicies", x => x.Id);
                    table.ForeignKey(
                        name: "FK_EgressPolicies_EgressDestinations_OrganizationId_Destinatio~",
                        columns: x => new { x.OrganizationId, x.DestinationId },
                        principalTable: "EgressDestinations",
                        principalColumns: new[] { "OrganizationId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_EgressPolicies_OrganizationId_DestinationId",
                table: "EgressPolicies",
                columns: new[] { "OrganizationId", "DestinationId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_EgressRecords_OrganizationId_AtUtc",
                table: "EgressRecords",
                columns: new[] { "OrganizationId", "AtUtc" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "EgressPolicies");

            migrationBuilder.DropTable(
                name: "EgressRecords");

            migrationBuilder.DropTable(
                name: "EgressDestinations");
        }
    }
}
