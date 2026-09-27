import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EnvironmentBadge, FreshnessStatus, HealthStatus, SafetyClassBadge } from '@/components/ui/Status';
import { seriousViolations } from './axe';

describe('status components', () => {
  it('always pair colour with a text label', () => {
    render(
      <div>
        <HealthStatus state="fault" />
        <FreshnessStatus freshness="stale" />
        <SafetyClassBadge value="AMBER" long />
        <EnvironmentBadge environment="production" />
      </div>,
    );
    expect(screen.getByText('Fault')).toBeInTheDocument();
    expect(screen.getByText('Stale')).toBeInTheDocument();
    expect(screen.getByText('AMBER · Controlled administration')).toBeInTheDocument();
    expect(screen.getByText('PRODUCTION')).toBeInTheDocument();
  });

  it('renders an unknown safety class as RED', () => {
    render(<SafetyClassBadge value={undefined} />);
    expect(screen.getByText('RED')).toBeInTheDocument();
  });

  it('has no serious accessibility violations', async () => {
    const { container } = render(
      <main>
        <HealthStatus state="warning" reason="Oil temperature" />
        <FreshnessStatus freshness="unknown" />
      </main>,
    );
    expect(await seriousViolations(container)).toEqual([]);
  });
});
