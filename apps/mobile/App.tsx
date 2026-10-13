import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { MobileNavigator } from './src/navigation/MobileNavigator';

export default function App() {
  return (
    <SafeAreaProvider>
      <MobileNavigator />
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}
