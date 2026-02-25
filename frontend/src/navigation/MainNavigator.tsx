/**
 * @file MainNavigator.tsx
 * @description Main app navigation after authentication.
 * Bottom tabs (HomeFeed, PostTask, Transactions, Profile) + stack screens.
 *
 * @hebrew ניווט ראשי — טאבים תחתונים ומסכים נוספים
 */

import React from 'react';
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
  PostTask: undefined;
  Transactions: undefined;
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
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          direction: 'rtl',
          borderTopWidth: 1,
          borderTopColor: Colors.border,
          elevation: 8,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.08,
          shadowRadius: 4,
          paddingBottom: Spacing.sm,
          paddingTop: Spacing.xs,
          height: 64,
        },
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textSecondary,
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
      }}
    >
      <Tab.Screen
        name="HomeFeed"
        options={{
          tabBarLabel: he.home.nearby_tasks,
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 22, textAlign: 'center' }}>{'🏠'}</Text>,
        }}
      >
        {({ navigation }) => (
          <TaskFeedScreen
            userLat={32.0853}
            userLng={34.7818}
            onTaskPress={(taskId) => navigation.navigate('TaskDetail', { taskId })}
            onPostTask={() => navigation.navigate('PostTask')}
          />
        )}
      </Tab.Screen>

      <Tab.Screen
        name="PostTask"
        options={{
          tabBarLabel: he.tasks.post_task,
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 22, textAlign: 'center' }}>{'➕'}</Text>,
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
        name="Transactions"
        component={TransactionHistoryScreen}
        options={{
          tabBarLabel: he.escrow.pay_title,
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 22, textAlign: 'center' }}>{'💰'}</Text>,
        }}
      />

      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarLabel: he.profile.title,
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 22, textAlign: 'center' }}>{'👤'}</Text>,
        }}
      />
    </Tab.Navigator>
  );
}

// ─── Main Stack ──────────────────────────────────────────────────────────────

export default function MainNavigator() {
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
            currentUserId=""
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
