import { Tabs } from 'expo-router';
import { useApi } from '@/api';

export default function TabsLayout() {
  const { org } = useApi();
  const suffix = org ? ` · ${org.name}` : '';
  return (
    <Tabs screenOptions={{ tabBarLabelStyle: { fontSize: 13 } }}>
      <Tabs.Screen name="alerts" options={{ title: `Alerts${suffix}`, tabBarLabel: 'Alerts' }} />
      <Tabs.Screen name="approvals" options={{ title: 'Approvals', tabBarLabel: 'Approvals' }} />
      <Tabs.Screen name="assets" options={{ title: 'Asset lookup', tabBarLabel: 'Assets' }} />
      <Tabs.Screen name="health" options={{ title: 'Site health', tabBarLabel: 'Health' }} />
    </Tabs>
  );
}
