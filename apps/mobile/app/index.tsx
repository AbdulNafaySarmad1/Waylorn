import { Redirect } from 'expo-router';
import { View } from 'react-native';
import { useAuth } from '@/auth';
import { Body, Button, Title, useTheme } from '@/ui';

export default function SignIn() {
  const { state, signIn, error } = useAuth();
  const t = useTheme();
  if (state === 'signed_in') return <Redirect href="/alerts" />;
  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 16, backgroundColor: t.surface0 }}>
      <Title>Waylorn Field</Title>
      <Body muted>Alerts, approvals review, asset lookup, maintenance and health checks. Engineering functions stay on the workstation console.</Body>
      <Button label={state === 'loading' ? 'Loading…' : 'Sign in with your organization'} onPress={() => void signIn()} disabled={state === 'loading'} />
      {error ? <Body>{error}</Body> : null}
    </View>
  );
}
