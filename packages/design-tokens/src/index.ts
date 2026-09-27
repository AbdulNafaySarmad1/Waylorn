/**
 * Token values for non-CSS consumers (React Native, canvas). Kept in lockstep with
 * tokens.css by `test/tokens.test.ts`.
 */
export const space = { 1: 2, 2: 4, 3: 6, 4: 8, 5: 12, 6: 16, 7: 24, 8: 32 } as const;
export const fontSize = { xs: 12, sm: 13, md: 14, lg: 16, xl: 20 } as const;
export const touchTarget = 44;

export interface ColorTokens {
  readonly surface0: string;
  readonly surface1: string;
  readonly surface2: string;
  readonly borderSubtle: string;
  readonly textPrimary: string;
  readonly textSecondary: string;
  readonly textMuted: string;
  readonly accent: string;
  readonly statusOk: string;
  readonly statusWarning: string;
  readonly statusFault: string;
  readonly statusUnknown: string;
  readonly statusInfo: string;
  readonly safetyGreen: string;
  readonly safetyAmber: string;
  readonly safetyRed: string;
  readonly envProduction: string;
}

export const light: ColorTokens = {
  surface0: '#eceeef',
  surface1: '#fbfbfb',
  surface2: '#f3f4f5',
  borderSubtle: '#d6d9dc',
  textPrimary: '#16191c',
  textSecondary: '#4a5159',
  textMuted: '#636a72',
  accent: '#1d5fb4',
  statusOk: '#3d6b52',
  statusWarning: '#8a5a00',
  statusFault: '#b3261e',
  statusUnknown: '#5f6368',
  statusInfo: '#1d5fb4',
  safetyGreen: '#2f6b45',
  safetyAmber: '#8a5a00',
  safetyRed: '#b3261e',
  envProduction: '#b3261e',
};

export const dark: ColorTokens = {
  surface0: '#111416',
  surface1: '#1a1e21',
  surface2: '#22272b',
  borderSubtle: '#2f363b',
  textPrimary: '#e8eaec',
  textSecondary: '#b4bbc2',
  textMuted: '#9aa2aa',
  accent: '#5b9be8',
  statusOk: '#8fbfa2',
  statusWarning: '#f2c25c',
  statusFault: '#ff8a80',
  statusUnknown: '#a6adb4',
  statusInfo: '#8ab8f5',
  safetyGreen: '#8fbfa2',
  safetyAmber: '#f2c25c',
  safetyRed: '#ff8a80',
  envProduction: '#e0564c',
};
