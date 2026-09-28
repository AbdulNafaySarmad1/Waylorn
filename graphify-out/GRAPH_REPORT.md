# Graph Report - repo  (2026-09-28)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 2225 nodes · 4878 edges · 107 communities (91 shown, 16 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 86 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 5
- Community 6
- Community 7
- Community 8
- Community 9
- Community 10
- Community 11
- Community 12
- Community 13
- Community 14
- Community 15
- Community 16
- Community 17
- Community 18
- Community 19
- Community 20
- Community 21
- Community 22
- Community 23
- Community 24
- Community 25
- Community 26
- Community 27
- Community 28
- Community 29
- Community 30
- Community 31
- Community 32
- Community 33
- Community 34
- Community 35
- Community 36
- Community 37
- Community 38
- Community 39
- Community 40
- Community 41
- Community 42
- Community 43
- Community 44
- Community 45
- Community 46
- Community 47
- Community 48
- Community 49
- Community 50
- Community 51
- Community 52
- Community 53
- Community 54
- Community 55
- Community 56
- Community 57
- Community 58
- Community 59
- Community 60
- Community 61
- Community 62
- Community 63
- Community 64
- Community 65
- Community 66
- Community 67
- Community 68
- Community 69
- Community 70
- Community 71
- Community 72
- Community 73
- Community 74
- Community 75
- Community 76
- Community 77
- Community 78
- Community 79
- Community 80
- Community 81
- Community 82
- Community 83
- Community 84
- Community 85
- Community 86
- Community 87
- Community 88
- Community 89
- Community 90
- Community 91
- Community 92
- Community 94
- Community 95
- Community 96
- Community 99
- Community 100
- Community 105
- Community 106

## God Nodes (most connected - your core abstractions)
1. `WaylornDbContext` - 94 edges
2. `next` - 43 edges
3. `orgPath()` - 40 edges
4. `Waylorn.ControlPlane.Infrastructure` - 36 edges
5. `OrgContext` - 35 edges
6. `humanizeToken()` - 33 edges
7. `CommandRequest` - 31 edges
8. `load()` - 31 edges
9. `Asset` - 30 edges
10. `Waylorn.ControlPlane.Domain` - 25 edges

## Surprising Connections (you probably didn't know these)
- `AssetSeed` --references--> `AssetSummary`  [EXTRACTED]
  tools/dev-fixtures/src/data.ts → packages/contracts/src/index.ts
- `ApiContextValue` --references--> `ProblemPresentation`  [EXTRACTED]
  apps/mobile/src/api.tsx → packages/domain/src/problem.ts
- `PreflightReviewProps` --references--> `PreflightResult`  [EXTRACTED]
  apps/web/src/components/commands/PreflightReview.tsx → packages/contracts/src/index.ts
- `LiveStream` --references--> `LiveSignal`  [EXTRACTED]
  apps/web/src/components/live/useLiveStream.ts → packages/contracts/src/index.ts
- `SignalDef` --references--> `LiveSignal`  [EXTRACTED]
  tools/dev-fixtures/src/api.ts → packages/contracts/src/index.ts

## Import Cycles
- None detected.

## Communities (107 total, 16 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.02
Nodes (83): ADR-0008, RFC-9457, actionParameterTypeValues, actorRefTypeValues, aiDataPolicyUpdatePseudonymizationScopesValues, aiEgressRecordDecisionValues, aiEgressRecordLocalityValues, aiProviderLocalityValues (+75 more)

### Community 1 - "Community 1"
Cohesion: 0.06
Nodes (54): atomic, AtomicU16, BTreeSet, crate, main(), Result, String, run() (+46 more)

### Community 2 - "Community 2"
Cohesion: 0.08
Nodes (50): metadata, AuditExport(), Assistant(), Entry, apps_web_src_components_ai_assistant_module, provenanceHref(), TOOL_STATUS, PolicyEditor() (+42 more)

### Community 3 - "Community 3"
Cohesion: 0.09
Nodes (41): metadata, PLANNED, metadata, STATE_GLYPH, STEP_LABEL, metadata, metadata, metadata (+33 more)

### Community 4 - "Community 4"
Cohesion: 0.06
Nodes (46): AssetContext, Dictionary, FrontendAssetSummary, HierarchyNodeView, IQueryable, IReadOnlyCollection, Org, OrgRef (+38 more)

### Community 5 - "Community 5"
Cohesion: 0.08
Nodes (56): go_pkg_bytes, go_pkg_context, go_pkg_crypto_rand, go_pkg_crypto_tls, go_pkg_crypto_x509, go_pkg_encoding_json, go_pkg_errors, go_pkg_fmt (+48 more)

### Community 6 - "Community 6"
Cohesion: 0.04
Nodes (50): ActionAvailability, ActionParameter, ActorRef, AiProvider, AssetEventPage, AssetPage, AssetReviewSummary, AssetSecurity (+42 more)

### Community 7 - "Community 7"
Cohesion: 0.11
Nodes (45): AiGovernance(), AssistantPage(), PlannedArea(), Audit(), metadata, toIso(), BASIS, Cloud() (+37 more)

### Community 8 - "Community 8"
Cohesion: 0.07
Nodes (37): BackgroundService, CancellationToken, DateTimeOffset, HttpContext, IResult, RouteGroupBuilder, Task, OutboxStatusEndpoints (+29 more)

### Community 9 - "Community 9"
Cohesion: 0.06
Nodes (40): AiDataPolicyUpdate, AiEgressRecord, AssetEvent, AssetReview, AssistantTurn, CommandRecord, ConfigurationSnapshot, ImpactAnalysis (+32 more)

### Community 10 - "Community 10"
Cohesion: 0.04
Nodes (40): compilerOptions, jsx, lib, noPropertyAccessFromIndexSignature, paths, types, extends, include (+32 more)

### Community 11 - "Community 11"
Cohesion: 0.06
Nodes (43): AssetDetail, AssetKind, AuditRecord, CustomDomain, HealthState, HostHealth, Incident, LifecycleState (+35 more)

### Community 12 - "Community 12"
Cohesion: 0.06
Nodes (37): devDependencies, @types/react, typescript, vitest, react, vitest, main, name (+29 more)

### Community 13 - "Community 13"
Cohesion: 0.07
Nodes (38): DateTimeOffset, Guid, AssetRelation, CreatedUtc, Id, Kind, OrganizationId, SourceAssetId (+30 more)

### Community 14 - "Community 14"
Cohesion: 0.08
Nodes (35): ref_node_http, control, dispatch(), openStreams, problem(), send(), ACR_MFA, ACR_PASSWORD (+27 more)

### Community 15 - "Community 15"
Cohesion: 0.07
Nodes (32): IDENTITY, apps_web_src_components_asset_assetheader_module, ASSET_VIEWS, AssetTabs(), CommandPalette(), isTyping(), apps_web_src_components_shell_commandpalette_module, Option (+24 more)

### Community 16 - "Community 16"
Cohesion: 0.17
Nodes (13): Waylorn.ControlPlane.Api, Waylorn.ControlPlane.Application, Waylorn.ControlPlane.Domain, Waylorn.ControlPlane.Infrastructure, microsoft_aspnetcore_webutilities, microsoft_entityframeworkcore, microsoft_entityframeworkcore_design, npgsql (+5 more)

### Community 17 - "Community 17"
Cohesion: 0.09
Nodes (27): AuthenticateResult, AuthenticationHandler, AuthenticationSchemeOptions, DbContextOptions, IDbContextOptionsConfiguration, IHostEnvironment, ILoggerFactory, IOptionsMonitor (+19 more)

### Community 18 - "Community 18"
Cohesion: 0.13
Nodes (28): Predictions(), linear(), niceTicks(), paddedExtent(), Scale, M, apps_web_src_components_charts_telemetrychart_module, Point (+20 more)

### Community 19 - "Community 19"
Cohesion: 0.17
Nodes (27): AssetDetail(), SignIn(), Alerts(), AssetLookup(), Health(), TabsLayout(), useApi(), useOrgQuery() (+19 more)

### Community 20 - "Community 20"
Cohesion: 0.11
Nodes (30): Approvals(), ADR-0014, AssetHeader(), apps_web_src_components_commands_commandlauncher_module, PreflightReview(), PreflightReviewProps, SafetyClassBadge(), ADR-0002 (+22 more)

### Community 21 - "Community 21"
Cohesion: 0.11
Nodes (24): dynamic, OrgLayout(), ContextBar(), Reachability(), UtcClock(), isCurrent(), NavLinks(), SideNav() (+16 more)

### Community 22 - "Community 22"
Cohesion: 0.08
Nodes (26): FRESH_CLASS, FRESH_GLYPH, apps_web_src_components_ui_status_module, ConnectivityState, Environment, Severity, DEFAULT_FRESHNESS_THRESHOLDS, Freshness (+18 more)

### Community 23 - "Community 23"
Cohesion: 0.11
Nodes (17): PAGES, expectAccessible(), fixtureControl(), FIXTURES, FixtureUser, resetFixtures(), signIn(), ADR-0013 (+9 more)

### Community 24 - "Community 24"
Cohesion: 0.09
Nodes (25): react, vitest, name, private, type, version, sdk, register() (+17 more)

### Community 25 - "Community 25"
Cohesion: 0.11
Nodes (19): formatValue(), LiveSignals(), STREAM_LABEL, LiveStream, StreamState, ADR-0010, useLiveStream(), FakeEventSource (+11 more)

### Community 26 - "Community 26"
Cohesion: 0.08
Nodes (26): CommandPolicy, CommandRequest, ApprovedUtc, Approver, AssetId, ChangeTicket, Id, IdempotencyKey (+18 more)

### Community 27 - "Community 27"
Cohesion: 0.13
Nodes (24): dynamic, GET(), dynamic, POST(), dynamic, POST(), clientFor(), currentPath() (+16 more)

### Community 28 - "Community 28"
Cohesion: 0.11
Nodes (19): DbUpdateConcurrencyException, HttpMessageHandler, HttpRequestMessage, HttpResponseMessage, IHttpClientFactory, InvalidOperationException, Guid, TenantScope (+11 more)

### Community 29 - "Community 29"
Cohesion: 0.11
Nodes (24): RelationType, TopologyEdge, TopologyGraph, TopologyNode, compareText(), DEFAULT_LAYOUT, DEPENDENCY_RELATIONS, KIND_LANE (+16 more)

### Community 30 - "Community 30"
Cohesion: 0.15
Nodes (17): CancellationToken, DateTimeOffset, Guid, HttpContext, IResult, RouteGroupBuilder, Task, CommandEndpoints (+9 more)

### Community 31 - "Community 31"
Cohesion: 0.08
Nodes (23): DbContext, DbSet, IDesignTimeDbContextFactory, CancellationToken, Guid, HttpContext, IResult, Task (+15 more)

### Community 32 - "Community 32"
Cohesion: 0.20
Nodes (18): dynamic, fail(), GET(), dynamic, GET(), callbackUrl(), oidcConfiguration(), establishSession() (+10 more)

### Community 33 - "Community 33"
Cohesion: 0.11
Nodes (17): IReadOnlyDictionary, IConfiguration, AuditIntegrity, Disabled, KeyId, AuditRecord, Action, AtUtc (+9 more)

### Community 34 - "Community 34"
Cohesion: 0.25
Nodes (10): ClaimsPrincipal, Guid, AccessPolicy, CancellationToken, Guid, HttpContext, IResult, RouteGroupBuilder (+2 more)

### Community 35 - "Community 35"
Cohesion: 0.16
Nodes (16): CancellationToken, DateTimeOffset, Guid, HttpContext, IResult, RouteGroupBuilder, Task, MaintenanceEndpoints (+8 more)

### Community 36 - "Community 36"
Cohesion: 0.13
Nodes (17): CancellationToken, Guid, HttpContext, IResult, RouteGroupBuilder, Task, TopologyEndpoints, RelationKind (+9 more)

### Community 37 - "Community 37"
Cohesion: 0.30
Nodes (6): Waylorn.ControlPlane.Infrastructure.Migrations, microsoft_entityframeworkcore_infrastructure, microsoft_entityframeworkcore_migrations, microsoft_entityframeworkcore_storage_valueconversion, npgsql_entityframeworkcore_postgresql_metadata, system

### Community 38 - "Community 38"
Cohesion: 0.15
Nodes (16): CancellationToken, Guid, HttpContext, IResult, RouteGroupBuilder, Task, IncidentEndpoints, IncidentInput (+8 more)

### Community 39 - "Community 39"
Cohesion: 0.10
Nodes (20): Confluent.Kafka (2.15.1), Microsoft.AspNetCore.Authentication.JwtBearer (10.0.12), Microsoft.AspNetCore.Mvc.Testing (10.0.12), Microsoft.EntityFrameworkCore (10.0.9), Microsoft.EntityFrameworkCore.Design (10.0.9), Microsoft.EntityFrameworkCore.Sqlite (10.0.9), Microsoft.NET.Test.Sdk (17.14.1), NATS.Net (3.2.0) (+12 more)

### Community 40 - "Community 40"
Cohesion: 0.28
Nodes (10): CancellationToken, Guid, HttpContext, IResult, RouteGroupBuilder, Task, AssetEndpoints, AssetInput (+2 more)

### Community 41 - "Community 41"
Cohesion: 0.13
Nodes (13): AssetSummary, TelemetrySeries, TenancyContext, serializeAssetQuery(), assertSeriesWithinBudget(), DEFAULT_SERIES_POINTS, MAX_SERIES_POINTS, SeriesBudgetError (+5 more)

### Community 42 - "Community 42"
Cohesion: 0.25
Nodes (10): CancellationToken, Guid, HttpContext, IResult, RouteGroupBuilder, Task, OrganizationInput, SiteInput (+2 more)

### Community 43 - "Community 43"
Cohesion: 0.10
Nodes (20): DateTime, SiteAgentHeartbeat, AgentId, IntervalMs, LastSeenUtc, OrganizationId, SiteId, SpoolDepth (+12 more)

### Community 44 - "Community 44"
Cohesion: 0.10
Nodes (19): compilerOptions, esModuleInterop, exactOptionalPropertyTypes, forceConsistentCasingInFileNames, isolatedModules, lib, module, moduleResolution (+11 more)

### Community 45 - "Community 45"
Cohesion: 0.11
Nodes (18): allowBackup, package, expo, android, extra, ios, name, orientation (+10 more)

### Community 46 - "Community 46"
Cohesion: 0.11
Nodes (19): dependencies, next, openid-client, @opentelemetry/api, @opentelemetry/context-zone, @opentelemetry/exporter-trace-otlp-http, @opentelemetry/instrumentation, @opentelemetry/instrumentation-fetch (+11 more)

### Community 47 - "Community 47"
Cohesion: 0.15
Nodes (12): FreshnessStatus(), seriousViolations(), GET, POST, session, actions, asset, preflight() (+4 more)

### Community 48 - "Community 48"
Cohesion: 0.12
Nodes (13): Migration, MigrationBuilder, DateTime, DateTimeOffset, Guid, ModelBuilder, LinkWorkflowSites, MigrationBuilder (+5 more)

### Community 49 - "Community 49"
Cohesion: 0.11
Nodes (19): MaintenanceWorkOrder, AssetId, CompletedUtc, CreatedBy, CreatedUtc, DueUtc, Id, OrganizationId (+11 more)

### Community 50 - "Community 50"
Cohesion: 0.11
Nodes (18): Incident, Id, OpenedBy, OpenedUtc, OrganizationId, Owner, PrimaryAssetId, Severity (+10 more)

### Community 51 - "Community 51"
Cohesion: 0.12
Nodes (17): dependencies, expo, expo-auth-session, expo-constants, expo-crypto, expo-linking, expo-router, expo-secure-store (+9 more)

### Community 52 - "Community 52"
Cohesion: 0.19
Nodes (12): GLYPH, styles, ColorTokens, dark, fontSize, light, space, touchTarget (+4 more)

### Community 53 - "Community 53"
Cohesion: 0.12
Nodes (16): @types/node, typescript, devDependencies, @types/node, typescript, vitest, exports, ./tokens.css (+8 more)

### Community 54 - "Community 54"
Cohesion: 0.18
Nodes (14): DELETE, dynamic, endOnError(), forward(), GET, Params, POST, problem() (+6 more)

### Community 55 - "Community 55"
Cohesion: 0.14
Nodes (15): Waylorn.ControlPlane.Tests, microsoft_aspnetcore_authentication, microsoft_aspnetcore_hosting, microsoft_aspnetcore_mvc_testing, microsoft_aspnetcore_testhost, microsoft_data_sqlite, microsoft_extensions_configuration, microsoft_extensions_dependencyinjection (+7 more)

### Community 56 - "Community 56"
Cohesion: 0.12
Nodes (15): @waylorn/contracts, dependencies, @waylorn/contracts, devDependencies, typescript, vitest, exports, vitest (+7 more)

### Community 57 - "Community 57"
Cohesion: 0.12
Nodes (15): dependencies, openapi-fetch, exports, vitest, name, private, scripts, check:generated (+7 more)

### Community 58 - "Community 58"
Cohesion: 0.20
Nodes (12): apps_web_src_app_globals, metadata, RootLayout(), viewport, LABELS, ThemeControl(), AUTH_TX_COOKIE, CSRF_HEADER (+4 more)

### Community 59 - "Community 59"
Cohesion: 0.15
Nodes (5): KeyValueStore, MemoryStore, registry, ADR-0009, server-only

### Community 60 - "Community 60"
Cohesion: 0.15
Nodes (14): assetKindValues, healthStateValues, lifecycleStateValues, pathsOrgsOrgIdAssetsGetParametersQuerySortValues, packages_contracts_src_index_assetkindvalues, packages_contracts_src_index_healthstatevalues, packages_contracts_src_index_lifecyclestatevalues, packages_contracts_src_index_pathsorgsorgidassetsgetparametersquerysortvalues (+6 more)

### Community 61 - "Community 61"
Cohesion: 0.13
Nodes (14): jose, dependencies, jose, description, vitest, name, private, scripts (+6 more)

### Community 62 - "Community 62"
Cohesion: 0.14
Nodes (14): devDependencies, axe-core, @axe-core/playwright, jsdom, @playwright/test, @testing-library/jest-dom, @testing-library/react, @testing-library/user-event (+6 more)

### Community 63 - "Community 63"
Cohesion: 0.20
Nodes (12): engines, node, name, packageManager, private, eslint, @eslint/js, eslint-plugin-jsx-a11y (+4 more)

### Community 64 - "Community 64"
Cohesion: 0.14
Nodes (14): Asset, CreatedUtc, Deleted, Firmware, Id, Kind, Manufacturer, Model (+6 more)

### Community 65 - "Community 65"
Cohesion: 0.14
Nodes (14): OutboxMessage, Attempts, ClaimToken, CreatedUtc, Destination, Id, LastError, LeaseUntilUtc (+6 more)

### Community 66 - "Community 66"
Cohesion: 0.27
Nodes (7): IConnectionMultiplexer, IDisposable, Lazy, Guid, ILogger, Task, AssetCache

### Community 67 - "Community 67"
Cohesion: 0.25
Nodes (8): Providers(), ApiContext, ApiContextValue, ApiProvider(), ControlPlaneClient, createControlPlaneClient(), Principal, expo-status-bar

### Community 68 - "Community 68"
Cohesion: 0.20
Nodes (8): DateTime, Guid, MigrationBuilder, DateTime, DateTimeOffset, Guid, ModelBuilder, AddTelemetry

### Community 69 - "Community 69"
Cohesion: 0.20
Nodes (8): DateTime, Guid, MigrationBuilder, DateTime, DateTimeOffset, Guid, ModelBuilder, AddIncidentsAndMaintenance

### Community 70 - "Community 70"
Cohesion: 0.20
Nodes (8): DateTime, Guid, MigrationBuilder, DateTime, DateTimeOffset, Guid, ModelBuilder, AddSiteAgentHeartbeat

### Community 71 - "Community 71"
Cohesion: 0.20
Nodes (4): NOW, ref_node_url, @vitejs/plugin-react, ref_vitest

### Community 72 - "Community 72"
Cohesion: 0.20
Nodes (8): JsonSerializerOptions, microsoft_aspnetcore_authentication_jwtbearer, opentelemetry_trace, EventJson, Options, Program, system_text_json_serialization, system_threading_ratelimiting

### Community 73 - "Community 73"
Cohesion: 0.20
Nodes (10): OperationKind, ChangeConfiguration, Discover, Health, Identify, Read, ReadConfiguration, Subscribe (+2 more)

### Community 74 - "Community 74"
Cohesion: 0.22
Nodes (7): DateTimeOffset, Guid, MigrationBuilder, DateTimeOffset, Guid, ModelBuilder, InitialControlPlane

### Community 75 - "Community 75"
Cohesion: 0.22
Nodes (7): DateTimeOffset, Guid, MigrationBuilder, DateTimeOffset, Guid, ModelBuilder, AddOutbox

### Community 76 - "Community 76"
Cohesion: 0.22
Nodes (7): DateTimeOffset, Guid, MigrationBuilder, DateTimeOffset, Guid, ModelBuilder, AddTenancy

### Community 77 - "Community 77"
Cohesion: 0.22
Nodes (9): devDependencies, eslint, @eslint/js, eslint-plugin-jsx-a11y, eslint-plugin-react-hooks, globals, @next/eslint-plugin-next, typescript (+1 more)

### Community 78 - "Community 78"
Cohesion: 0.22
Nodes (7): CancellationToken, Guid, HttpContext, IResult, RouteGroupBuilder, Task, IncidentFrontendEndpoints

### Community 80 - "Community 80"
Cohesion: 0.25
Nodes (8): scripts, build, contracts:generate, dev, e2e, lint, test, typecheck

### Community 81 - "Community 81"
Cohesion: 0.25
Nodes (7): RegisterSample, DateTimeOffset, Guid, RouteGroupBuilder, ObservationBatch, ObservationEndpoints, RegisterSample

### Community 82 - "Community 82"
Cohesion: 0.29
Nodes (7): scripts, build, dev, e2e, start, test, typecheck

### Community 83 - "Community 83"
Cohesion: 0.38
Nodes (5): SESSION_COOKIE, buildCsp(), CspOptions, config, proxy()

### Community 84 - "Community 84"
Cohesion: 0.29
Nodes (6): ModelSnapshot, DateTime, DateTimeOffset, Guid, ModelBuilder, WaylornDbContextModelSnapshot

### Community 85 - "Community 85"
Cohesion: 0.29
Nodes (6): ObservationBatch, CancellationToken, HttpContext, IConfiguration, IResult, Task

### Community 87 - "Community 87"
Cohesion: 0.53
Nodes (4): confluent_kafka, nats_client_core, nats_client_jetstream_models, nats_net

### Community 88 - "Community 88"
Cohesion: 0.40
Nodes (4): CancellationToken, HttpContext, IResult, Task

### Community 89 - "Community 89"
Cohesion: 0.40
Nodes (5): RequestResult, RequestStatus, Conflict, Created, Existing

### Community 90 - "Community 90"
Cohesion: 0.40
Nodes (5): devDependencies, @types/node, typescript, vitest, @waylorn/contracts

### Community 91 - "Community 91"
Cohesion: 0.50
Nodes (3): config, hstsMaxAge, securityHeaders

### Community 92 - "Community 92"
Cohesion: 0.50
Nodes (4): devDependencies, openapi-typescript, typescript, vitest

## Knowledge Gaps
- **717 isolated node(s):** `$defs`, `FlattenedDeepRequired`, `operations`, `ReadonlyArray`, `webhooks` (+712 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1041 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **16 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `next` connect `Community 3` to `Community 32`, `Community 2`, `Community 7`, `Community 91`, `Community 79`, `Community 15`, `Community 18`, `Community 83`, `Community 21`, `Community 54`, `Community 24`, `Community 58`, `Community 27`?**
  _High betweenness centrality (0.053) - this node is a cross-community bridge._
- **Why does `WaylornDbContext` connect `Community 31` to `Community 4`, `Community 8`, `Community 13`, `Community 16`, `Community 17`, `Community 26`, `Community 28`, `Community 30`, `Community 33`, `Community 34`, `Community 35`, `Community 36`, `Community 38`, `Community 40`, `Community 42`, `Community 43`, `Community 49`, `Community 50`, `Community 64`, `Community 65`, `Community 78`, `Community 85`, `Community 88`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **Why does `typescript` connect `Community 53` to `Community 12`, `Community 24`, `Community 57`, `Community 56`, `Community 61`, `Community 63`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `WaylornDbContext` (e.g. with `.Asset_version_detects_concurrent_update()` and `.Cross_tenant_write_is_rejected_before_database_access()`) actually correct?**
  _`WaylornDbContext` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `$defs`, `FlattenedDeepRequired`, `operations` to the rest of the system?**
  _717 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.023809523809523808 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.055944055944055944 - nodes in this community are weakly interconnected._