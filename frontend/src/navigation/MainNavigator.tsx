/**
 * @file MainNavigator.tsx
 * @description Main app navigation after authentication.
 * Bottom tabs (HomeFeed, PostTask, Transactions, Profile) + stack screens.
 *
 * @hebrew ניווט ראשי — טאבים תחתונים ומסכים נוספים
 */

import React, { useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { Colors, Typography, Spacing, BorderRadius } from '../theme/rtl';
import { useAuthContext } from '../hooks/useAuth';
import { useLocation } from '../hooks/useLocation';
import { userApi } from '../services/api';
import he from '../i18n/he.json';

import TaskFeedScreen from '../screens/TaskFeedScreen';
import PostTaskScreen from '../screens/PostTaskScreen';
import TransactionHistoryScreen from '../screens/TransactionHistoryScreen';
import TaskDetailScreen from '../screens/TaskDetailScreen';
import FundEscrowScreen from '../screens/FundEscrowScreen';
import InvoiceViewerScreen from '../screens/InvoiceViewerScreen';

// ─── Route Params ────────────────────────────────────────────────────────────

export type MainStackParamList = {
  MainTabs: undefined;
  TaskDetail: { taskId: string };
  FundEscrow: {
    taskId: string;
    offerId: string;
    agreedPrice: number;
    jesterName: string;
    taskTitle: string;
    requiresVehicle: boolean;
  };
  InvoiceViewer: { transactionId: string };
};

type TabParamList = {
  HomeFeed: undefined;
  Community: undefined;
  Messages: undefined;
  Profile: undefined;
};

const Stack = createStackNavigator<MainStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

// ─── Profile Placeholder ─────────────────────────────────────────────────────

function ProfileScreen() {
  const { user, logout } = useAuthContext();

  return (
    <SafeAreaView style={profileStyles.container}>
      <Text style={profileStyles.title}>{he.profile.title}</Text>
      {user?.displayName && (
        <Text style={profileStyles.name}>{user.displayName}</Text>
      )}
      {user?.phone && (
        <Text style={profileStyles.phone}>{user.phone}</Text>
      )}
      <TouchableOpacity style={profileStyles.logoutButton} onPress={logout}>
        <Text style={profileStyles.logoutText}>{he.profile.logout}</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const profileStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  title: { ...Typography.h2, marginBottom: Spacing.lg },
  name: { ...Typography.h3, color: Colors.textPrimary, marginBottom: Spacing.sm },
  phone: { ...Typography.body, color: Colors.textSecondary, marginBottom: Spacing.xl },
  logoutButton: {
    backgroundColor: Colors.error,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.pill,
  },
  logoutText: { ...Typography.button, color: Colors.textInverse },
});

// ─── Tab Navigator ───────────────────────────────────────────────────────────

function MainTabs() {
  const { coords, isFallback } = useLocation();

  // Fire-and-forget: update backend with real GPS when available
  useEffect(() => {
    if (!isFallback) {
      userApi.updateLocation({ latitude: coords.latitude, longitude: coords.longitude }).catch(() => {});
    }
  }, [coords, isFallback]);

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          flexDirection: 'row-reverse' as const,
          backgroundColor: Colors.background,
          borderTopWidth: 1,
          borderTopColor: Colors.border,
          paddingTop: 8,
          paddingBottom: 20,
          height: 68,
        },
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.primary,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
      }}
    >
      <Tab.Screen
        name="HomeFeed"
        options={{
          tabBarLabel: ({ focused }) => (
            <Text style={{ fontSize: 10, fontWeight: '600', color: Colors.primary, opacity: focused ? 1 : 0.4 }}>משימות</Text>
          ),
          tabBarIcon: ({ focused }) => <Text style={{ fontSize: 20, textAlign: 'center', opacity: focused ? 1 : 0.4 }}>{'🗂️'}</Text>,
        }}
      >
        {({ navigation }) => (
          <TaskFeedScreen
            userLat={coords.latitude}
            userLng={coords.longitude}
            onTaskPress={(taskId) => navigation.navigate('TaskDetail', { taskId })}
            onPostTask={() => navigation.navigate('PostTask')}
          />
        )}
      </Tab.Screen>

      <Tab.Screen
        name="Community"
        options={{
          tabBarLabel: ({ focused }) => (
            <Text style={{ fontSize: 10, fontWeight: '600', color: Colors.primary, opacity: focused ? 1 : 0.4 }}>קהילה</Text>
          ),
          tabBarIcon: ({ focused }) => <Text style={{ fontSize: 20, textAlign: 'center', opacity: focused ? 1 : 0.4 }}>{'❤️'}</Text>,
        }}
      >
        {({ navigation }) => (
          <PostTaskScreen
            onSuccess={(taskId) => navigation.navigate('TaskDetail', { taskId })}
            onBack={() => navigation.goBack()}
          />
        )}
      </Tab.Screen>

      <Tab.Screen
        name="Messages"
        component={TransactionHistoryScreen}
        options={{
          tabBarLabel: ({ focused }) => (
            <Text style={{ fontSize: 10, fontWeight: '600', color: Colors.primary, opacity: focused ? 1 : 0.4 }}>הודעות</Text>
          ),
          tabBarIcon: ({ focused }) => <Text style={{ fontSize: 20, textAlign: 'center', opacity: focused ? 1 : 0.4 }}>{'💬'}</Text>,
        }}
      />

      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarLabel: ({ focused }) => (
            <Text style={{ fontSize: 10, fontWeight: '600', color: Colors.primary, opacity: focused ? 1 : 0.4 }}>{he.profile.title}</Text>
          ),
          tabBarIcon: ({ focused }) => <Text style={{ fontSize: 20, textAlign: 'center', opacity: focused ? 1 : 0.4 }}>{'👤'}</Text>,
        }}
      />
    </Tab.Navigator>
  );
}

// ─── Main Stack ──────────────────────────────────────────────────────────────

export default function MainNavigator() {
  const { user } = useAuthContext();

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animationEnabled: true,
      }}
    >
      <Stack.Screen name="MainTabs" component={MainTabs} />

      <Stack.Screen name="TaskDetail">
        {({ route, navigation }) => (
          <TaskDetailScreen
            taskId={route.params.taskId}
            currentUserId={user?.id ?? ''}
            onBack={() => navigation.goBack()}
            onOfferAccepted={(transactionId) =>
              navigation.navigate('FundEscrow', {
                taskId: route.params.taskId,
                offerId: '',
                agreedPrice: 0,
                jesterName: '',
                taskTitle: '',
                requiresVehicle: false,
              })
            }
          />
        )}
      </Stack.Screen>

      <Stack.Screen name="FundEscrow" component={FundEscrowScreen} />
      <Stack.Screen name="InvoiceViewer" component={InvoiceViewerScreen} />
    </Stack.Navigator>
  );
}
