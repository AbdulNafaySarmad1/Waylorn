import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { dark, fontSize, light, space, touchTarget, type ColorTokens } from '@waylorn/design-tokens';
import type { ProblemPresentation, StatusPresentation } from '@waylorn/domain';

export function useTheme(): ColorTokens {
  return useColorScheme() === 'dark' ? dark : light;
}

/** Glyph characters mirror the web status shapes: status is never colour alone. */
const GLYPH: Record<StatusPresentation['glyph'], string> = {
  check: '✓',
  triangle: '▲',
  cross: '✖',
  question: '?',
  dot: '●',
  diamond: '◆',
  slash: '⊘',
};

export function StatusText({ status, label }: { status: StatusPresentation; label?: string }) {
  const t = useTheme();
  const color =
    status.tone === 'fault' ? t.statusFault : status.tone === 'warning' ? t.statusWarning : status.tone === 'ok' ? t.statusOk : status.tone === 'info' ? t.statusInfo : t.statusUnknown;
  return (
    <Text style={{ color, fontSize: fontSize.sm, fontWeight: status.tone === 'fault' ? '700' : '500' }} accessibilityLabel={label ?? status.label}>
      {GLYPH[status.glyph]} {label ?? status.label}
    </Text>
  );
}

export function Screen({ children, refreshing, onRefresh }: { children: ReactNode; refreshing?: boolean; onRefresh?: () => void }) {
  const t = useTheme();
  return (
    <ScrollView
      style={{ backgroundColor: t.surface0 }}
      contentContainerStyle={{ padding: space[6], gap: space[5] }}
      {...(onRefresh ? { refreshControl: <RefreshControl refreshing={refreshing ?? false} onRefresh={onRefresh} /> } : {})}
    >
      {children}
    </ScrollView>
  );
}

export function Card({ children, onPress, accessibilityLabel }: { children: ReactNode; onPress?: () => void; accessibilityLabel?: string }) {
  const t = useTheme();
  const style = [styles.row, { backgroundColor: t.surface1, borderColor: t.borderSubtle }];
  if (!onPress) return <View style={style}>{children}</View>;
  return (
    <Pressable style={({ pressed }) => [...style, pressed ? { opacity: 0.7 } : null]} onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel}>
      {children}
    </Pressable>
  );
}

export function Title({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <Text accessibilityRole="header" style={{ color: t.textPrimary, fontSize: fontSize.lg, fontWeight: '600' }}>
      {children}
    </Text>
  );
}

export function Body({ children, muted = false, mono = false }: { children: ReactNode; muted?: boolean; mono?: boolean }) {
  const t = useTheme();
  return (
    <Text style={{ color: muted ? t.textSecondary : t.textPrimary, fontSize: fontSize.md, fontFamily: mono ? 'monospace' : undefined }}>
      {children}
    </Text>
  );
}

export function LoadState({ loading, problem, empty, children }: { loading: boolean; problem: ProblemPresentation | undefined; empty?: string | false; children: ReactNode }) {
  const t = useTheme();
  if (problem) {
    return (
      <View accessibilityRole="alert" style={[styles.row, { borderColor: t.statusFault, backgroundColor: t.surface1 }]}>
        <Text style={{ color: t.statusFault, fontWeight: '700' }}>{problem.title}</Text>
        <Body>{problem.message}</Body>
        {problem.correlationId ? <Body muted>Correlation ID {problem.correlationId}</Body> : null}
      </View>
    );
  }
  if (loading) return <ActivityIndicator accessibilityLabel="Loading" />;
  if (empty) return <Body muted>{empty}</Body>;
  return <>{children}</>;
}

export function Button({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={{ minHeight: touchTarget, justifyContent: 'center', alignItems: 'center', backgroundColor: disabled ? t.surface2 : t.accent, paddingHorizontal: space[6] }}
    >
      <Text style={{ color: disabled ? t.textMuted : '#ffffff', fontWeight: '600', fontSize: fontSize.md }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { borderWidth: 1, padding: space[5], gap: space[3], minHeight: touchTarget },
});
