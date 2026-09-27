import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LiveSignal } from '@waylorn/contracts';
import { LiveSignals } from '@/components/live/LiveSignals';

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  static readonly OPEN = 1;
  readyState = 0;
  private handlers = new Map<string, ((e: MessageEvent<string>) => void)[]>();
  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, fn: (e: MessageEvent<string>) => void) {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), fn]);
  }
  emit(type: string, data = '{}') {
    if (type === 'open') this.readyState = 1;
    for (const fn of this.handlers.get(type) ?? []) fn(new MessageEvent(type, { data }));
  }
  close() {
    this.readyState = 2;
  }
}

const signal = (observedAt: string): LiveSignal => ({
  key: 'oil_temp',
  label: 'Hydraulic oil temperature',
  unit: '°C',
  value: 61.2,
  quality: 'good',
  observedAt,
  expectedIntervalMs: 5000,
  source: 'site-agent',
  limits: { highWarning: 60, highAlarm: 68 },
});

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal('EventSource', FakeEventSource);
  vi.useFakeTimers({ toFake: ['setInterval', 'setTimeout', 'Date'] });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('LiveSignals degraded connectivity', () => {
  it('keeps last values but marks them Unknown when the stream drops', () => {
    const now = Date.now();
    render(<LiveSignals url="/stream" initial={[signal(new Date(now).toISOString())]} serverNow={now} />);
    const es = FakeEventSource.instances[0]!;
    act(() => es.emit('open'));
    expect(screen.getByText('Current')).toBeInTheDocument();
    expect(screen.getByText('Above warning limit')).toBeInTheDocument();

    act(() => es.emit('error'));
    expect(screen.getByText('Live stream disconnected')).toBeInTheDocument();
    expect(screen.getByText('61.2 °C')).toBeInTheDocument();
    expect(screen.getByText('Unknown')).toBeInTheDocument();
    expect(screen.getByText(/last known/)).toBeInTheDocument();
  });

  it('marks values stale when updates stop while the connection stays open', () => {
    const now = Date.now();
    render(<LiveSignals url="/stream" initial={[signal(new Date(now).toISOString())]} serverNow={now} />);
    const es = FakeEventSource.instances[0]!;
    act(() => es.emit('open'));
    act(() => {
      // Heartbeats keep arriving, but no signal updates for > 5 × 5 s.
      for (let i = 0; i < 30; i += 1) {
        vi.advanceTimersByTime(1000);
        es.emit('heartbeat', JSON.stringify({ serverTime: new Date().toISOString() }));
      }
    });
    expect(screen.getByText('Stale')).toBeInTheDocument();
  });

  it('reports a silent connection when heartbeats stop', () => {
    const now = Date.now();
    render(<LiveSignals url="/stream" initial={[signal(new Date(now).toISOString())]} serverNow={now} />);
    act(() => FakeEventSource.instances[0]!.emit('open'));
    act(() => {
      vi.advanceTimersByTime(14_000);
    });
    expect(screen.getByText(/open but silent/)).toBeInTheDocument();
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });
});
