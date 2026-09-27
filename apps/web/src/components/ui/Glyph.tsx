import type { StatusGlyph } from '@waylorn/domain';
import type { ReactNode } from 'react';

/**
 * Status shapes. Each state has a distinct silhouette so status survives colour-blindness,
 * monochrome printing and forced-colors mode.
 */
const PATHS: Record<StatusGlyph, ReactNode> = {
  check: <path d="M2.5 6.5 5 9l4.5-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" />,
  triangle: <path d="M6 1.2 11.2 10.5H.8Z" fill="currentColor" />,
  cross: (
    <>
      <rect x="0.5" y="0.5" width="11" height="11" fill="currentColor" />
      <path d="m3.5 3.5 5 5m0-5-5 5" stroke="var(--surface-1)" strokeWidth="1.6" />
    </>
  ),
  question: (
    <>
      <circle cx="6" cy="6" r="5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M4.4 4.6a1.6 1.6 0 1 1 2.4 1.4c-.5.3-.8.6-.8 1.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="6" cy="9" r=".8" fill="currentColor" />
    </>
  ),
  dot: <circle cx="6" cy="6" r="3" fill="currentColor" />,
  diamond: <path d="M6 1 11 6 6 11 1 6Z" fill="currentColor" />,
  slash: (
    <>
      <circle cx="6" cy="6" r="5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2.5 9.5 9.5 2.5" stroke="currentColor" strokeWidth="1.4" />
    </>
  ),
};

export function Glyph({ shape, size = 12 }: { shape: StatusGlyph; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden="true" focusable="false" style={{ flex: 'none' }}>
      {PATHS[shape]}
    </svg>
  );
}
