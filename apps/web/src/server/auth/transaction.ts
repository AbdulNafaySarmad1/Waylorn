import 'server-only';
import { memoryStore } from './store';

/** Pending authorization request, stored server-side and referenced by a short-lived cookie. */
export interface AuthTransaction {
  readonly state: string;
  readonly nonce: string;
  readonly codeVerifier: string;
  readonly returnTo: string;
  readonly stepUp: boolean;
  readonly maxAge: number | undefined;
  readonly createdAt: number;
}

export const AUTH_TX_TTL_SECONDS = 600;
export const transactions = memoryStore<AuthTransaction>('auth-tx');
