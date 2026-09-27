import type { AiProvider, DataCategory, DataClassification } from '@waylorn/contracts';

export const DATA_CATEGORY: Readonly<Record<DataCategory, { readonly label: string; readonly sensitive: boolean }>> = {
  asset_inventory: { label: 'Asset inventory', sensitive: false },
  topology: { label: 'Topology and relationships', sensitive: true },
  telemetry_aggregates: { label: 'Telemetry aggregates', sensitive: false },
  raw_telemetry: { label: 'Raw telemetry', sensitive: true },
  plc_configuration: { label: 'PLC / controller configuration', sensitive: true },
  recipes: { label: 'Recipes and process parameters', sensitive: true },
  security_events: { label: 'Security events', sensitive: true },
  network_details: { label: 'Network addresses and details', sensitive: true },
  personal_data: { label: 'Personal data', sensitive: true },
  audit_records: { label: 'Audit records', sensitive: true },
  maintenance_records: { label: 'Maintenance records', sensitive: false },
  reliability_metrics: { label: 'Reliability metrics', sensitive: false },
};

export const LOCALITY: Readonly<Record<AiProvider['locality'], { readonly label: string; readonly egress: boolean }>> = {
  on_premises: { label: 'On premises — no external egress', egress: false },
  customer_cloud: { label: 'Customer cloud tenancy', egress: true },
  external: { label: 'External provider — data leaves your network', egress: true },
};

export const PROVIDER_CLASS: Readonly<Record<AiProvider['providerClass'], string>> = {
  ollama: 'Ollama',
  lm_studio: 'LM Studio',
  vllm: 'vLLM',
  llama_cpp: 'llama.cpp',
  openai_compatible: 'OpenAI-compatible endpoint',
  openai: 'OpenAI',
  azure_openai: 'Azure OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Google Gemini',
  watsonx: 'IBM watsonx',
  other: 'Other approved provider',
};

export const CLASSIFICATION: Readonly<Record<DataClassification, string>> = {
  public: 'Public',
  internal: 'Internal',
  confidential: 'Confidential',
  restricted: 'Restricted',
};

/** Categories that are both allowed and prohibited indicate a policy error to surface. */
export function conflictingCategories(
  allowed: readonly DataCategory[],
  prohibited: readonly DataCategory[],
): DataCategory[] {
  const p = new Set(prohibited);
  return allowed.filter((c) => p.has(c));
}
