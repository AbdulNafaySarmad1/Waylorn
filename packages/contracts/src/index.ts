import createClient, { type ClientOptions } from 'openapi-fetch';
import type { components, paths } from './generated/control-plane';

export * from './generated/control-plane';

type Schemas = components['schemas'];

// Wire types. Re-exported names only; shapes come from the generated contract.
export type Problem = Schemas['Problem'];
export type PageInfo = Schemas['PageInfo'];
export type Provenance = Schemas['Provenance'];
export type SafetyClass = Schemas['SafetyClass'];
export type Environment = Schemas['Environment'];
export type HealthState = Schemas['HealthState'];
export type Severity = Schemas['Severity'];
export type ConnectivityState = Schemas['ConnectivityState'];
export type LifecycleState = Schemas['LifecycleState'];
export type AssetKind = Schemas['AssetKind'];
export type RelationType = Schemas['RelationType'];
export type Principal = Schemas['Principal'];
export type OrganizationRef = Schemas['OrganizationRef'];
export type Site = Schemas['Site'];
export type HierarchyNode = Schemas['HierarchyNode'];
export type TenancyContext = Schemas['TenancyContext'];
export type Overview = Schemas['Overview'];
export type AssetSummary = Schemas['AssetSummary'];
export type AssetDetail = Schemas['AssetDetail'];
export type AssetPage = Schemas['AssetPage'];
export type AssetExtension = Schemas['AssetExtension'];
export type Capability = Schemas['Capability'];
export type ObservedValue = Schemas['ObservedValue'];
export type VendorAttribute = Schemas['VendorAttribute'];
export type ActionAvailability = Schemas['ActionAvailability'];
export type LiveSignal = Schemas['LiveSignal'];
export type LiveHeartbeat = Schemas['LiveHeartbeat'];
export type LiveSnapshot = Schemas['LiveSnapshot'];
export type TelemetrySignalDefinition = Schemas['TelemetrySignalDefinition'];
export type TelemetrySeries = Schemas['TelemetrySeries'];
export type TelemetryBucket = Schemas['TelemetryBucket'];
export type ConfidenceInterval = Schemas['ConfidenceInterval'];
export type MethodRef = Schemas['MethodRef'];
export type ReliabilityReport = Schemas['ReliabilityReport'];
export type ReliabilityMetric = Schemas['ReliabilityMetric'];
export type HealthDimension = Schemas['HealthDimension'];
export type Prediction = Schemas['Prediction'];
export type AssetEvent = Schemas['AssetEvent'];
export type AssetEventPage = Schemas['AssetEventPage'];
export type EventCategory = Schemas['EventCategory'];
export type AssetSecurity = Schemas['AssetSecurity'];
export type ConfigurationSnapshot = Schemas['ConfigurationSnapshot'];
export type WorkOrder = Schemas['WorkOrder'];
export type ActionDefinition = Schemas['ActionDefinition'];
export type ActionParameter = Schemas['ActionParameter'];
export type StepUpRequirement = Schemas['StepUpRequirement'];
export type PreflightRequest = Schemas['PreflightRequest'];
export type PreflightResult = Schemas['PreflightResult'];
export type CommandSubmission = Schemas['CommandSubmission'];
export type CommandRecord = Schemas['CommandRecord'];
export type CommandState = Schemas['CommandState'];
export type ActorRef = Schemas['ActorRef'];
export type PolicyRef = Schemas['PolicyRef'];
export type TopologyGraph = Schemas['TopologyGraph'];
export type TopologyNode = Schemas['TopologyNode'];
export type TopologyEdge = Schemas['TopologyEdge'];
export type TopologyCluster = Schemas['TopologyCluster'];
export type ImpactAnalysis = Schemas['ImpactAnalysis'];
export type HostHealth = Schemas['HostHealth'];
export type HostMetric = Schemas['HostMetric'];
export type CostSummary = Schemas['CostSummary'];
export type AssetReviewSummary = Schemas['AssetReviewSummary'];
export type AssetReview = Schemas['AssetReview'];
export type Incident = Schemas['Incident'];
export type IncidentStatus = Schemas['IncidentStatus'];
export type AuditRecord = Schemas['AuditRecord'];
export type AuditPage = Schemas['AuditPage'];
export type AuditExportRequest = Schemas['AuditExportRequest'];
export type AuditExportJob = Schemas['AuditExportJob'];
export type DecisionOutcome = Schemas['DecisionOutcome'];
export type DataCategory = Schemas['DataCategory'];
export type DataClassification = Schemas['DataClassification'];
export type AiProvider = Schemas['AiProvider'];
export type AiDataPolicy = Schemas['AiDataPolicy'];
export type AiDataPolicyUpdate = Schemas['AiDataPolicyUpdate'];
export type AiEgressRecord = Schemas['AiEgressRecord'];
export type AssistantRequest = Schemas['AssistantRequest'];
export type AssistantTurn = Schemas['AssistantTurn'];
export type AssistantBlock = Schemas['AssistantBlock'];
export type ProvenanceLink = Schemas['ProvenanceLink'];
export type CustomDomain = Schemas['CustomDomain'];
export type DomainStep = Schemas['DomainStep'];

export type ControlPlaneClient = ReturnType<typeof createControlPlaneClient>;

/**
 * Typed client for the control-plane API. The transport decides where requests go:
 * server components pass the backend URL plus a bearer token; browser code passes the
 * same-origin BFF prefix and never sees a token.
 */
export function createControlPlaneClient(options: ClientOptions) {
  return createClient<paths>(options);
}

/** Header the fixture server sets so the UI can label non-production data (ADR 0012). */
export const DATA_SOURCE_HEADER = 'x-waylorn-data-source';
export const CORRELATION_HEADER = 'x-correlation-id';

export function isProblem(value: unknown): value is Problem {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate['title'] === 'string' &&
    typeof candidate['status'] === 'number' &&
    typeof candidate['correlationId'] === 'string'
  );
}
