import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { DefaultTheme, NavigationContainer } from '@react-navigation/native';

import { HomeScreen } from '../screens/HomeScreen';
import { colors } from '../styles/tokens';

export type TabParamList = {
  Home: undefined;
  Search: undefined;
  Nearby: undefined;
  Saved: undefined;
};

const Tab = createBottomTabNavigator<TabParamList>();

const theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.primary,
    background: colors.background,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    notification: colors.error,
  },
};

export function MobileNavigator() {
  return (
    <NavigationContainer theme={theme}>
      <Tab.Navigator
        initialRouteName="Home"
        screenOptions={{ headerShown: false }}
        tabBar={() => null}
      >
        <Tab.Screen name="Home" component={HomeScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
