'use client';

import { useState } from 'react';
import { parseTheme, THEME_COOKIE, type ThemePreference } from '@/lib/cookies';

const LABELS: Record<ThemePreference, string> = {
  system: 'Follow system',
  light: 'Light (day shift)',
  dark: 'Dark (control room)',
  contrast: 'High contrast',
};

export function ThemeControl({ initial }: { initial: ThemePreference }) {
  const [theme, setTheme] = useState(initial);
  const apply = (value: ThemePreference) => {
    setTheme(value);
    if (value === 'system') delete document.documentElement.dataset['theme'];
    else document.documentElement.dataset['theme'] = value;
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${THEME_COOKIE}=${value}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
  };
  return (
    <label style={{ display: 'grid', gap: 4, padding: '6px 12px', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
      Display theme
      <select value={theme} onChange={(e) => apply(parseTheme(e.target.value))}>
        {(Object.keys(LABELS) as ThemePreference[]).map((t) => (
          <option key={t} value={t}>
            {LABELS[t]}
          </option>
        ))}
      </select>
    </label>
  );
}
