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

START TRANSACTION;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20260927152445_AddOutbox') THEN
    CREATE TABLE "Outbox" (
        "Id" uuid NOT NULL,
        "OrganizationId" uuid NOT NULL,
        "SiteId" uuid,
        "Destination" character varying(16) NOT NULL,
        "Subject" character varying(160) NOT NULL,
        "Payload" text NOT NULL,
        "CreatedUtc" timestamp with time zone NOT NULL,
        "PublishedUtc" timestamp with time zone,
        "NextAttemptUtc" timestamp with time zone NOT NULL,
        "LeaseUntilUtc" timestamp with time zone,
        "ClaimToken" uuid,
        "Attempts" integer NOT NULL,
        "LastError" character varying(500),
        CONSTRAINT "PK_Outbox" PRIMARY KEY ("Id")
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20260927152445_AddOutbox') THEN
    CREATE INDEX "IX_Outbox_PublishedUtc_NextAttemptUtc_LeaseUntilUtc" ON "Outbox" ("PublishedUtc", "NextAttemptUtc", "LeaseUntilUtc");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20260927152445_AddOutbox') THEN
    INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
    VALUES ('20260927152445_AddOutbox', '10.0.9');
    END IF;
END $EF$;
COMMIT;

START TRANSACTION;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20260927154227_AddTenancy') THEN
    CREATE TABLE "Organizations" (
        "Id" uuid NOT NULL,
        "OrganizationId" uuid NOT NULL,
        "Slug" character varying(80) NOT NULL,
        "Name" character varying(200) NOT NULL,
        "CreatedUtc" timestamp with time zone NOT NULL,
        CONSTRAINT "PK_Organizations" PRIMARY KEY ("Id")
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20260927154227_AddTenancy') THEN
    CREATE TABLE "Sites" (
        "Id" uuid NOT NULL,
        "OrganizationId" uuid NOT NULL,
        "Code" character varying(40) NOT NULL,
        "Name" character varying(200) NOT NULL,
        "RegionName" character varying(120) NOT NULL,
        "Timezone" character varying(80) NOT NULL,
        "Environment" character varying(20) NOT NULL,
        "CreatedUtc" timestamp with time zone NOT NULL,
        CONSTRAINT "PK_Sites" PRIMARY KEY ("Id"),
        CONSTRAINT "AK_Sites_OrganizationId_Id" UNIQUE ("OrganizationId", "Id"),
        CONSTRAINT "FK_Sites_Organizations_OrganizationId" FOREIGN KEY ("OrganizationId") REFERENCES "Organizations" ("Id") ON DELETE RESTRICT
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20260927154227_AddTenancy') THEN
    CREATE TABLE "Zones" (
        "Id" uuid NOT NULL,
        "OrganizationId" uuid NOT NULL,
        "SiteId" uuid NOT NULL,
        "Code" character varying(40) NOT NULL,
        "Name" character varying(200) NOT NULL,
        "CreatedUtc" timestamp with time zone NOT NULL,
        CONSTRAINT "PK_Zones" PRIMARY KEY ("Id"),
        CONSTRAINT "FK_Zones_Sites_OrganizationId_SiteId" FOREIGN KEY ("OrganizationId", "SiteId") REFERENCES "Sites" ("OrganizationId", "Id") ON DELETE RESTRICT
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20260927154227_AddTenancy') THEN
    CREATE UNIQUE INDEX "IX_Organizations_Slug" ON "Organizations" ("Slug");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20260927154227_AddTenancy') THEN
    CREATE UNIQUE INDEX "IX_Sites_OrganizationId_Code" ON "Sites" ("OrganizationId", "Code");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20260927154227_AddTenancy') THEN
    CREATE UNIQUE INDEX "IX_Zones_OrganizationId_SiteId_Code" ON "Zones" ("OrganizationId", "SiteId", "Code");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20260927154227_AddTenancy') THEN
    INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
    VALUES ('20260927154227_AddTenancy', '10.0.9');
    END IF;
END $EF$;
COMMIT;

START TRANSACTION;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20260927193220_AddTelemetry') THEN
    CREATE TABLE "Telemetry" (
        "Id" uuid NOT NULL,
        "OrganizationId" uuid NOT NULL,
        "SiteId" uuid NOT NULL,
        "AssetId" uuid NOT NULL,
        "RequestId" uuid NOT NULL,
        "SignalKey" character varying(80) NOT NULL,
        "Value" integer NOT NULL,
        "Source" character varying(120) NOT NULL,
        "ObservedUtc" timestamp with time zone NOT NULL,
        "ReceivedUtc" timestamp with time zone NOT NULL,
        "ExpectedIntervalMs" integer NOT NULL,
        CONSTRAINT "PK_Telemetry" PRIMARY KEY ("Id"),
        CONSTRAINT "FK_Telemetry_Assets_OrganizationId_AssetId" FOREIGN KEY ("OrganizationId", "AssetId") REFERENCES "Assets" ("OrganizationId", "Id") ON DELETE RESTRICT
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20260927193220_AddTelemetry') THEN
    CREATE INDEX "IX_Telemetry_OrganizationId_AssetId_SignalKey_ObservedUtc" ON "Telemetry" ("OrganizationId", "AssetId", "SignalKey", "ObservedUtc");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20260927193220_AddTelemetry') THEN
    CREATE UNIQUE INDEX "IX_Telemetry_OrganizationId_RequestId_SignalKey" ON "Telemetry" ("OrganizationId", "RequestId", "SignalKey");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20260927193220_AddTelemetry') THEN
    INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
    VALUES ('20260927193220_AddTelemetry', '10.0.9');
    END IF;
END $EF$;
COMMIT;

START TRANSACTION;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20260927200159_AddIncidentsAndMaintenance') THEN
    CREATE TABLE "Incidents" (
        "Id" uuid NOT NULL,
        "OrganizationId" uuid NOT NULL,
        "SiteId" uuid NOT NULL,
        "PrimaryAssetId" uuid NOT NULL,
        "Title" character varying(200) NOT NULL,
        "Severity" character varying(16) NOT NULL,
        "State" character varying(20) NOT NULL,
        "OpenedBy" character varying(200) NOT NULL,
        "Owner" character varying(200),
        "OpenedUtc" timestamp with time zone NOT NULL,
        "UpdatedUtc" timestamp with time zone NOT NULL,
        "Version" bigint NOT NULL,
        CONSTRAINT "PK_Incidents" PRIMARY KEY ("Id"),
        CONSTRAINT "AK_Incidents_OrganizationId_Id" UNIQUE ("OrganizationId", "Id"),
        CONSTRAINT "FK_Incidents_Assets_OrganizationId_PrimaryAssetId" FOREIGN KEY ("OrganizationId", "PrimaryAssetId") REFERENCES "Assets" ("OrganizationId", "Id") ON DELETE RESTRICT
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20260927200159_AddIncidentsAndMaintenance') THEN
    CREATE TABLE "WorkOrders" (
        "Id" uuid NOT NULL,
        "OrganizationId" uuid NOT NULL,
        "SiteId" uuid NOT NULL,
        "AssetId" uuid NOT NULL,
        "Title" character varying(200) NOT NULL,
        "Type" character varying(20) NOT NULL,
        "State" character varying(20) NOT NULL,
        "DueUtc" timestamp with time zone,
        "CompletedUtc" timestamp with time zone,
        "CreatedBy" character varying(200) NOT NULL,
        "Version" bigint NOT NULL,
        "CreatedUtc" timestamp with time zone NOT NULL,
        "UpdatedUtc" timestamp with time zone NOT NULL,
        CONSTRAINT "PK_WorkOrders" PRIMARY KEY ("Id"),
        CONSTRAINT "FK_WorkOrders_Assets_OrganizationId_AssetId" FOREIGN KEY ("OrganizationId", "AssetId") REFERENCES "Assets" ("OrganizationId", "Id") ON DELETE RESTRICT
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20260927200159_AddIncidentsAndMaintenance') THEN
    CREATE TABLE "IncidentAssets" (
        "OrganizationId" uuid NOT NULL,
        "IncidentId" uuid NOT NULL,
        "AssetId" uuid NOT NULL,
        CONSTRAINT "PK_IncidentAssets" PRIMARY KEY ("OrganizationId", "IncidentId", "AssetId"),
        CONSTRAINT "FK_IncidentAssets_Assets_OrganizationId_AssetId" FOREIGN KEY ("OrganizationId", "AssetId") REFERENCES "Assets" ("OrganizationId", "Id") ON DELETE RESTRICT,
        CONSTRAINT "FK_IncidentAssets_Incidents_OrganizationId_IncidentId" FOREIGN KEY ("OrganizationId", "IncidentId") REFERENCES "Incidents" ("OrganizationId", "Id") ON DELETE RESTRICT
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20260927200159_AddIncidentsAndMaintenance') THEN
    CREATE INDEX "IX_IncidentAssets_OrganizationId_AssetId" ON "IncidentAssets" ("OrganizationId", "AssetId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20260927200159_AddIncidentsAndMaintenance') THEN
    CREATE INDEX "IX_Incidents_OrganizationId_PrimaryAssetId" ON "Incidents" ("OrganizationId", "PrimaryAssetId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20260927200159_AddIncidentsAndMaintenance') THEN
    CREATE INDEX "IX_Incidents_OrganizationId_SiteId_OpenedUtc" ON "Incidents" ("OrganizationId", "SiteId", "OpenedUtc");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20260927200159_AddIncidentsAndMaintenance') THEN
    CREATE INDEX "IX_WorkOrders_OrganizationId_AssetId" ON "WorkOrders" ("OrganizationId", "AssetId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20260927200159_AddIncidentsAndMaintenance') THEN
    CREATE INDEX "IX_WorkOrders_OrganizationId_SiteId_AssetId" ON "WorkOrders" ("OrganizationId", "SiteId", "AssetId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20260927200159_AddIncidentsAndMaintenance') THEN
    INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
    VALUES ('20260927200159_AddIncidentsAndMaintenance', '10.0.9');
    END IF;
END $EF$;
COMMIT;

START TRANSACTION;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20260927200937_LinkWorkflowSites') THEN
    ALTER TABLE "Incidents" ADD CONSTRAINT "FK_Incidents_Sites_OrganizationId_SiteId" FOREIGN KEY ("OrganizationId", "SiteId") REFERENCES "Sites" ("OrganizationId", "Id") ON DELETE RESTRICT;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20260927200937_LinkWorkflowSites') THEN
    ALTER TABLE "WorkOrders" ADD CONSTRAINT "FK_WorkOrders_Sites_OrganizationId_SiteId" FOREIGN KEY ("OrganizationId", "SiteId") REFERENCES "Sites" ("OrganizationId", "Id") ON DELETE RESTRICT;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20260927200937_LinkWorkflowSites') THEN
    INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
    VALUES ('20260927200937_LinkWorkflowSites', '10.0.9');
    END IF;
END $EF$;
COMMIT;

START TRANSACTION;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20260928054010_AddAuditIntegrity') THEN
    ALTER TABLE "Audit" ADD "IntegrityKeyId" character varying(40);
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20260928054010_AddAuditIntegrity') THEN
    ALTER TABLE "Audit" ADD "IntegrityTag" character varying(64);
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20260928054010_AddAuditIntegrity') THEN
    INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
    VALUES ('20260928054010_AddAuditIntegrity', '10.0.9');
    END IF;
END $EF$;
COMMIT;

START TRANSACTION;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20260928055635_AddSiteAgentHeartbeat') THEN
    CREATE TABLE "SiteAgentHeartbeats" (
        "OrganizationId" uuid NOT NULL,
        "SiteId" uuid NOT NULL,
        "AgentId" character varying(200) NOT NULL,
        "LastSeenUtc" timestamp with time zone NOT NULL,
        "IntervalMs" integer NOT NULL,
        "SpoolDepth" integer NOT NULL,
        CONSTRAINT "PK_SiteAgentHeartbeats" PRIMARY KEY ("OrganizationId", "SiteId", "AgentId"),
        CONSTRAINT "FK_SiteAgentHeartbeats_Sites_OrganizationId_SiteId" FOREIGN KEY ("OrganizationId", "SiteId") REFERENCES "Sites" ("OrganizationId", "Id") ON DELETE RESTRICT
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20260928055635_AddSiteAgentHeartbeat') THEN
    CREATE INDEX "IX_SiteAgentHeartbeats_OrganizationId_SiteId_LastSeenUtc" ON "SiteAgentHeartbeats" ("OrganizationId", "SiteId", "LastSeenUtc");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20260928055635_AddSiteAgentHeartbeat') THEN
    INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
    VALUES ('20260928055635_AddSiteAgentHeartbeat', '10.0.9');
    END IF;
END $EF$;
COMMIT;

START TRANSACTION;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20260928075920_AddAuditChain') THEN
    ALTER TABLE "Audit" ADD "ChainSequence" bigint;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20260928075920_AddAuditChain') THEN
    ALTER TABLE "Audit" ADD "PreviousTag" character varying(64);
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20260928075920_AddAuditChain') THEN
    CREATE TABLE "AuditHeads" (
        "OrganizationId" uuid NOT NULL,
        "Sequence" bigint NOT NULL,
        "Tag" character varying(64),
        CONSTRAINT "PK_AuditHeads" PRIMARY KEY ("OrganizationId")
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20260928075920_AddAuditChain') THEN
    CREATE UNIQUE INDEX "IX_Audit_OrganizationId_ChainSequence" ON "Audit" ("OrganizationId", "ChainSequence");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20260928075920_AddAuditChain') THEN
    INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
    VALUES ('20260928075920_AddAuditChain', '10.0.9');
    END IF;
END $EF$;
COMMIT;

START TRANSACTION;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20260928080744_AddSitePollingBudget') THEN
    ALTER TABLE "Sites" ADD "MaxPollsPerMinute" integer NOT NULL DEFAULT 600;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20260928080744_AddSitePollingBudget') THEN
    ALTER TABLE "SiteAgentHeartbeats" ADD "RequestedIntervalMs" integer NOT NULL DEFAULT 0;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20260928080744_AddSitePollingBudget') THEN
    UPDATE "SiteAgentHeartbeats" SET "RequestedIntervalMs" = "IntervalMs";
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20260928080744_AddSitePollingBudget') THEN
    INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
    VALUES ('20260928080744_AddSitePollingBudget', '10.0.9');
    END IF;
END $EF$;
COMMIT;

START TRANSACTION;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20260928082922_AddClassifiedEgress') THEN
    CREATE TABLE "EgressDestinations" (
        "Id" uuid NOT NULL,
        "OrganizationId" uuid NOT NULL,
        "DisplayName" character varying(200) NOT NULL,
        "ProviderClass" character varying(40) NOT NULL,
        "Endpoint" character varying(500) NOT NULL,
        "Model" character varying(200) NOT NULL,
        "Locality" character varying(20) NOT NULL,
        "ClassificationCeiling" character varying(20) NOT NULL,
        "Enabled" boolean NOT NULL,
        "CreatedUtc" timestamp with time zone NOT NULL,
        CONSTRAINT "PK_EgressDestinations" PRIMARY KEY ("Id"),
        CONSTRAINT "AK_EgressDestinations_OrganizationId_Id" UNIQUE ("OrganizationId", "Id")
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20260928082922_AddClassifiedEgress') THEN
    CREATE TABLE "EgressRecords" (
        "Id" uuid NOT NULL,
        "OrganizationId" uuid NOT NULL,
        "DestinationId" uuid NOT NULL,
        "AtUtc" timestamp with time zone NOT NULL,
        "Categories" character varying(300) NOT NULL,
        "Decision" character varying(20) NOT NULL,
        "Reason" character varying(60) NOT NULL,
        "PolicyVersion" bigint NOT NULL,
        "Actor" character varying(200) NOT NULL,
        "ActorType" character varying(20) NOT NULL,
        "Bytes" integer NOT NULL,
        "RedactedFieldCount" integer NOT NULL,
        CONSTRAINT "PK_EgressRecords" PRIMARY KEY ("Id")
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20260928082922_AddClassifiedEgress') THEN
    CREATE TABLE "EgressPolicies" (
        "Id" uuid NOT NULL,
        "OrganizationId" uuid NOT NULL,
        "DestinationId" uuid NOT NULL,
        "Version" bigint NOT NULL,
        "Rules" character varying(20000) NOT NULL,
        "UpdatedUtc" timestamp with time zone NOT NULL,
        "UpdatedBy" character varying(200) NOT NULL,
        CONSTRAINT "PK_EgressPolicies" PRIMARY KEY ("Id"),
        CONSTRAINT "FK_EgressPolicies_EgressDestinations_OrganizationId_Destinatio~" FOREIGN KEY ("OrganizationId", "DestinationId") REFERENCES "EgressDestinations" ("OrganizationId", "Id") ON DELETE RESTRICT
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20260928082922_AddClassifiedEgress') THEN
    CREATE UNIQUE INDEX "IX_EgressPolicies_OrganizationId_DestinationId" ON "EgressPolicies" ("OrganizationId", "DestinationId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20260928082922_AddClassifiedEgress') THEN
    CREATE INDEX "IX_EgressRecords_OrganizationId_AtUtc" ON "EgressRecords" ("OrganizationId", "AtUtc");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20260928082922_AddClassifiedEgress') THEN
    INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
    VALUES ('20260928082922_AddClassifiedEgress', '10.0.9');
    END IF;
END $EF$;
COMMIT;

