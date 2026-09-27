'use client';

import { useEffect, useRef, useState } from 'react';
import type { LiveHeartbeat, LiveSignal } from '@waylorn/contracts';
import { mergeSignal } from '@waylorn/domain';

export type StreamState = 'connecting' | 'connected' | 'silent' | 'disconnected';

export interface LiveStream {
  readonly signals: ReadonlyMap<string, LiveSignal>;
  readonly state: StreamState;
  readonly lastHeartbeatAt: number | undefined;
  readonly retryAt: number | undefined;
}

/** No heartbeat for this long means the connection is open but not delivering. */
const HEARTBEAT_TIMEOUT_MS = 10_000;
const MAX_BACKOFF_MS = 30_000;

/**
 * Subscribes to an asset's live signals through the BFF SSE relay (ADR 0010). On failure it
 * keeps the last values (marked unknown by the caller) and reconnects with backoff.
 */
export function useLiveStream(url: string, initial: readonly LiveSignal[]): LiveStream {
  const [signals, setSignals] = useState<ReadonlyMap<string, LiveSignal>>(() => new Map(initial.map((s) => [s.key, s])));
  const [state, setState] = useState<StreamState>('connecting');
  const [lastHeartbeatAt, setLastHeartbeatAt] = useState<number | undefined>();
  const [retryAt, setRetryAt] = useState<number | undefined>();
  const attempt = useRef(0);

  useEffect(() => {
    let source: EventSource | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let lastBeat = Date.now();
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      setState('connecting');
      setRetryAt(undefined);
      source = new EventSource(url);
      source.addEventListener('open', () => {
        attempt.current = 0;
        lastBeat = Date.now();
        setState('connected');
      });
      source.addEventListener('signal', (e) => {
        try {
          const s = JSON.parse((e as MessageEvent<string>).data) as LiveSignal;
          setSignals((cur) => mergeSignal(cur, s));
        } catch {
          // Malformed frame: ignore; freshness will reveal missing updates.
        }
      });
      source.addEventListener('heartbeat', (e) => {
        try {
          JSON.parse((e as MessageEvent<string>).data) as LiveHeartbeat;
        } catch {
          return;
        }
        lastBeat = Date.now();
        setLastHeartbeatAt(lastBeat);
        setState('connected');
      });
      source.addEventListener('error', () => {
        source?.close();
        setState('disconnected');
        const delay = Math.min(MAX_BACKOFF_MS, 2000 * 2 ** attempt.current);
        attempt.current += 1;
        setRetryAt(Date.now() + delay);
        retryTimer = setTimeout(connect, delay);
      });
    };

    connect();
    const watchdog = setInterval(() => {
      if (source?.readyState === EventSource.OPEN && Date.now() - lastBeat > HEARTBEAT_TIMEOUT_MS) setState('silent');
    }, 2000);

    return () => {
      disposed = true;
      source?.close();
      if (retryTimer) clearTimeout(retryTimer);
      clearInterval(watchdog);
    };
  }, [url]);

  return { signals, state, lastHeartbeatAt, retryAt };
}
