using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Waylorn.ControlPlane.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class LinkWorkflowSites : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddForeignKey(
                name: "FK_Incidents_Sites_OrganizationId_SiteId",
                table: "Incidents",
                columns: new[] { "OrganizationId", "SiteId" },
                principalTable: "Sites",
                principalColumns: new[] { "OrganizationId", "Id" },
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_WorkOrders_Sites_OrganizationId_SiteId",
                table: "WorkOrders",
                columns: new[] { "OrganizationId", "SiteId" },
                principalTable: "Sites",
                principalColumns: new[] { "OrganizationId", "Id" },
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Incidents_Sites_OrganizationId_SiteId",
                table: "Incidents");

            migrationBuilder.DropForeignKey(
                name: "FK_WorkOrders_Sites_OrganizationId_SiteId",
                table: "WorkOrders");
        }
    }
}
