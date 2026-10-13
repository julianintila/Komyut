import { ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { screenStyles } from '../styles/screenStyles';

export function NearbyScreen() {
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={screenStyles.screen}>
      <ScrollView contentContainerStyle={screenStyles.content}>
        <Text accessibilityRole="header" style={screenStyles.title}>Nearby</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
