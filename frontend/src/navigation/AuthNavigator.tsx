/**
 * @file AuthNavigator.tsx
 * @description Auth stack: Splash -> PhoneInput -> OtpVerify.
 * ConfirmationResult stored in useRef (not serializable for route params).
 * On OTP success, Firebase onAuthStateChanged auto-switches to MainNavigator.
 *
 * @hebrew ניווט אימות — מסכי כניסה עם OTP
 */

import React, { useRef, useCallback } from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { ConfirmationResult } from 'firebase/auth';

import SplashScreen from '../screens/SplashScreen';
import PhoneInputScreen from '../screens/PhoneInputScreen';
import OtpVerifyScreen from '../screens/OtpVerifyScreen';

// ─── Route Params ────────────────────────────────────────────────────────────

export type AuthStackParamList = {
  Splash: undefined;
  PhoneInput: undefined;
  OtpVerify: { phone: string; sessionToken: string };
};

const Stack = createStackNavigator<AuthStackParamList>();

// ─── Navigator ───────────────────────────────────────────────────────────────

export default function AuthNavigator() {
  // ConfirmationResult is not serializable — store in ref, not route params
  const confirmationRef = useRef<ConfirmationResult | null>(null);

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animationEnabled: true,
      }}
    >
      <Stack.Screen name="Splash">
        {({ navigation }) => (
          <SplashScreen
            onComplete={() => navigation.navigate('PhoneInput')}
          />
        )}
      </Stack.Screen>

      <Stack.Screen name="PhoneInput">
        {({ navigation }) => (
          <PhoneInputScreen
            onOtpSent={(phone, confirmation, sessionToken) => {
              confirmationRef.current = confirmation;
              navigation.navigate('OtpVerify', { phone, sessionToken });
            }}
            onBack={() => navigation.goBack()}
          />
        )}
      </Stack.Screen>

      <Stack.Screen name="OtpVerify">
        {({ route, navigation }) => (
          <OtpVerifyScreen
            phone={route.params.phone}
            confirmation={confirmationRef.current!}
            sessionToken={route.params.sessionToken}
            onSuccess={(_userId, _isNewUser) => {
              // Firebase onAuthStateChanged will detect the sign-in
              // and App.tsx will auto-switch to MainNavigator.
              // No explicit navigation needed here.
            }}
            onBack={() => navigation.goBack()}
          />
        )}
      </Stack.Screen>
    </Stack.Navigator>
  );
}
