import 'server-only';
import * as client from 'openid-client';
import { serverConfig } from '../config';

let configuration: Promise<client.Configuration> | undefined;

/** Discovered, cached OIDC client configuration for the Keycloak realm. */
export function oidcConfiguration(): Promise<client.Configuration> {
  if (!configuration) {
    const cfg = serverConfig();
    configuration = client
      .discovery(new URL(cfg.oidc.issuer), cfg.oidc.clientId, undefined, client.ClientSecretBasic(cfg.oidc.clientSecret), {
        timeout: 10,
        // Plain HTTP is only permitted for loopback development issuers (validated in config).
        // eslint-disable-next-line @typescript-eslint/no-deprecated -- deliberate, loopback-only (validated in config)
        ...(cfg.oidc.allowInsecureIssuer ? { execute: [client.allowInsecureRequests] } : {}),
      })
      .catch((err: unknown) => {
        configuration = undefined;
        throw err;
      });
  }
  return configuration;
}

export function callbackUrl(): string {
  return `${serverConfig().publicOrigin}/auth/callback`;
}

export { client };
