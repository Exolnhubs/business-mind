import { Redirect } from 'expo-router'

// EventsScreen is now a component inside home.tsx — redirect any direct navigation here.
export default function EventsTabRoute() {
  return <Redirect href="/(tabs)/home" />
}
