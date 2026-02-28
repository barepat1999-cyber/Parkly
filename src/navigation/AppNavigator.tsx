import React from 'react';
import { View, Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import MapScreen from '../screens/MapScreen';
import HistoryScreen from '../screens/HistoryScreen';
import ProfileScreen from '../screens/ProfileScreen';

const Tab = createBottomTabNavigator();

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          headerShown: true,
          tabBarActiveTintColor: '#4CAF50',
          tabBarInactiveTintColor: '#9E9E9E',
        }}
      >
        <Tab.Screen
          name="Map"
          component={MapScreen}
          options={{
            title: 'Parkly',
            tabBarLabel: 'Kort',
            tabBarIcon: ({ color }) => (
              <TabBarIcon emoji="📍" color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="History"
          component={HistoryScreen}
          options={{
            title: 'Mine Rapporter',
            tabBarLabel: 'Historik',
            tabBarIcon: ({ color }) => (
              <TabBarIcon emoji="📋" color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Profile"
          component={ProfileScreen}
          options={{
            title: 'Profil',
            tabBarLabel: 'Profil',
            tabBarIcon: ({ color }) => (
              <TabBarIcon emoji="👤" color={color} />
            ),
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

// Simple icon component (in production, use react-native-vector-icons)
function TabBarIcon({ emoji, color }: { emoji: string; color: string }) {
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 20 }}>{emoji}</Text>
    </View>
  );
}
