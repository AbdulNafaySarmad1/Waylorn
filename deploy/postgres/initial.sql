CREATE TABLE IF NOT EXISTS "__EFMigrationsHistory" (
    "MigrationId" character varying(150) NOT NULL,
    "ProductVersion" character varying(32) NOT NULL,
    CONSTRAINT "PK___EFMigrationsHistory" PRIMARY KEY ("MigrationId")
);

START TRANSACTION;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20260927145909_InitialControlPlane') THEN
    CREATE TABLE "Assets" (
        "Id" uuid NOT NULL,
        "OrganizationId" uuid NOT NULL,
        "SiteId" uuid NOT NULL,
        "ZoneId" uuid,
        "Kind" character varying(32) NOT NULL,
        "Name" character varying(200) NOT NULL,
        "Manufacturer" character varying(200),
        "Model" character varying(200),
        "Serial" character varying(200),
        "Firmware" character varying(200),
        "Version" bigint NOT NULL,
        "Deleted" boolean NOT NULL,
        "CreatedUtc" timestamp with time zone NOT NULL,
        CONSTRAINT "PK_Assets" PRIMARY KEY ("Id"),
        CONSTRAINT "AK_Assets_OrganizationId_Id" UNIQUE ("OrganizationId", "Id")
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20260927145909_InitialControlPlane') THEN
    CREATE TABLE "Audit" (
        "Id" uuid NOT NULL,
        "OrganizationId" uuid NOT NULL,
        "SiteId" uuid,
        "Principal" character varying(200) NOT NULL,
        "Action" character varying(100) NOT NULL,
        "TargetType" character varying(100) NOT NULL,
        "TargetId" uuid NOT NULL,
        "Outcome" character varying(100) NOT NULL,
        "AtUtc" timestamp with time zone NOT NULL,
        CONSTRAINT "PK_Audit" PRIMARY KEY ("Id")
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20260927145909_InitialControlPlane') THEN
    CREATE TABLE "Commands" (
        "Id" uuid NOT NULL,
        "OrganizationId" uuid NOT NULL,
        "SiteId" uuid NOT NULL,
        "AssetId" uuid NOT NULL,
        "Operation" character varying(32) NOT NULL,
        "Risk" character varying(16) NOT NULL,
        "State" character varying(16) NOT NULL,
        "Requester" character varying(200) NOT NULL,
        "IdempotencyKey" character varying(128) NOT NULL,
        "ChangeTicket" character varying(200),
        "WindowStartUtc" timestamp with time zone,
        "WindowEndUtc" timestamp with time zone,
        "Approver" character varying(200),
        "ApprovedUtc" timestamp with time zone,
        "Version" bigint NOT NULL,
        "RequestedUtc" timestamp with time zone NOT NULL,
        CONSTRAINT "PK_Commands" PRIMARY KEY ("Id"),
        CONSTRAINT "FK_Commands_Assets_OrganizationId_AssetId" FOREIGN KEY ("OrganizationId", "AssetId") REFERENCES "Assets" ("OrganizationId", "Id") ON DELETE RESTRICT
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20260927145909_InitialControlPlane') THEN
    CREATE TABLE "Relationships" (
        "Id" uuid NOT NULL,
        "OrganizationId" uuid NOT NULL,
        "SourceAssetId" uuid NOT NULL,
        "TargetAssetId" uuid NOT NULL,
        "Kind" character varying(32) NOT NULL,
        "CreatedUtc" timestamp with time zone NOT NULL,
        CONSTRAINT "PK_Relationships" PRIMARY KEY ("Id"),
        CONSTRAINT "FK_Relationships_Assets_OrganizationId_SourceAssetId" FOREIGN KEY ("OrganizationId", "SourceAssetId") REFERENCES "Assets" ("OrganizationId", "Id") ON DELETE RESTRICT,
        CONSTRAINT "FK_Relationships_Assets_OrganizationId_TargetAssetId" FOREIGN KEY ("OrganizationId", "TargetAssetId") REFERENCES "Assets" ("OrganizationId", "Id") ON DELETE RESTRICT
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20260927145909_InitialControlPlane') THEN
    CREATE INDEX "IX_Assets_OrganizationId_SiteId_Deleted" ON "Assets" ("OrganizationId", "SiteId", "Deleted");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20260927145909_InitialControlPlane') THEN
    CREATE INDEX "IX_Audit_OrganizationId_AtUtc" ON "Audit" ("OrganizationId", "AtUtc");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20260927145909_InitialControlPlane') THEN
    CREATE INDEX "IX_Commands_OrganizationId_AssetId" ON "Commands" ("OrganizationId", "AssetId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20260927145909_InitialControlPlane') THEN
    CREATE UNIQUE INDEX "IX_Commands_OrganizationId_Requester_IdempotencyKey" ON "Commands" ("OrganizationId", "Requester", "IdempotencyKey");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20260927145909_InitialControlPlane') THEN
    CREATE UNIQUE INDEX "IX_Relationships_OrganizationId_SourceAssetId_TargetAssetId_Ki~" ON "Relationships" ("OrganizationId", "SourceAssetId", "TargetAssetId", "Kind");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20260927145909_InitialControlPlane') THEN
    CREATE INDEX "IX_Relationships_OrganizationId_TargetAssetId" ON "Relationships" ("OrganizationId", "TargetAssetId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20260927145909_InitialControlPlane') THEN
    INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
    VALUES ('20260927145909_InitialControlPlane', '10.0.9');
    END IF;
END $EF$;
COMMIT;
