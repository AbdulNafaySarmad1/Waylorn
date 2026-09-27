'use client';

import { createContext, createElement, useContext, useSyncExternalStore, type ReactNode } from 'react';

// One shared 1 Hz clock for all relative-time and freshness displays on the page.
let now = Date.now();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!timer) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      for (const l of listeners) l();
    }, 1000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

/**
 * The request time of the server render. Server rendering and hydration both use it, so
 * time-derived text (ages, freshness) cannot mismatch; the live clock takes over afterwards.
 */
const RenderTime = createContext<number | undefined>(undefined);

export function RenderTimeProvider({ value, children }: { value: number; children: ReactNode }) {
  return createElement(RenderTime.Provider, { value }, children);
}

export function useNow(serverNow?: number): number {
  const renderTime = useContext(RenderTime);
  return useSyncExternalStore(
    subscribe,
    () => now,
    () => serverNow ?? renderTime ?? now,
  );
}
