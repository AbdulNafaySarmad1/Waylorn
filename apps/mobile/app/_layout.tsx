import type { ReactNode } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ApiProvider } from '@/api';
import { AuthProvider, useAuth } from '@/auth';

function Providers({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  return state === 'signed_in' ? <ApiProvider>{children}</ApiProvider> : <>{children}</>;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <Providers>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerTitleStyle: { fontWeight: '600' } }}>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="asset/[id]" options={{ title: 'Asset' }} />
        </Stack>
      </Providers>
    </AuthProvider>
  );
}
