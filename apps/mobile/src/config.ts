import Constants from 'expo-constants';

export interface MobileConfig {
  readonly oidcIssuer: string;
  readonly oidcClientId: string;
  readonly apiBaseUrl: string;
}

function read(key: keyof MobileConfig): string {
  const extra: Record<string, unknown> = Constants.expoConfig?.extra ?? {};
  const v = extra[key];
  if (typeof v !== 'string' || v.length === 0) throw new Error(`Missing app config extra.${key}`);
  return v;
}

/** Build-time configuration (app.json `extra`), per deployment and customer domain. */
export const config: MobileConfig = {
  oidcIssuer: read('oidcIssuer'),
  oidcClientId: read('oidcClientId'),
  apiBaseUrl: read('apiBaseUrl').replace(/\/+$/, ''),
};
