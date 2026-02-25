/**
 * @file useAuth.ts
 * @description React hook for authentication state management.
 *
 * Manages:
 *  - Firebase Auth state via onAuthStateChanged
 *  - Current user profile (id, phone, displayName, role, trustScore)
 *  - Logout via Firebase signOut
 *
 * Firebase manages token lifecycle (issuance, auto-refresh, expiry).
 * User profile data is cached in AsyncStorage for offline access.
 *
 * @hebrew ניהול מצב אימות — Firebase Auth, משתמש, התנתקות
 * @usage
 *   const { user, isLoading, logout } = useAuth();
 */

import { useState, useEffect, useCallback, createContext, useContext, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { firebaseAuth } from '../services/firebase';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface AuthUser {
  id: string;
  phone: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: 'CLIENT' | 'JESTER' | 'ADMIN';
  trustScore: number;
  verificationLevel: 'PHONE' | 'ID' | 'PRO';
  isIdVerified: boolean;
  karmaPoints: number;
  completedTasksCount: number;
}

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

// ─────────────────────────────────────────────
// Storage keys
// ─────────────────────────────────────────────

const KEYS = {
  USER: '@jesta/user',
} as const;

// ─────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
  });

  // ─────────────────────────────
  // Firebase onAuthStateChanged
  // ─────────────────────────────

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(firebaseAuth, async (firebaseUser) => {
      try {
        if (firebaseUser) {
          // User is signed in — load cached profile from AsyncStorage
          const userJson = await AsyncStorage.getItem(KEYS.USER);
          const user: AuthUser | null = userJson ? JSON.parse(userJson) : null;

          setState({
            user,
            isLoading: false,
            isAuthenticated: true,
          });
        } else {
          // User is signed out
          await AsyncStorage.removeItem(KEYS.USER);
          setState({
            user: null,
            isLoading: false,
            isAuthenticated: false,
          });
        }
      } catch (err) {
        console.error('[useAuth] onAuthStateChanged error:', err);
        setState(prev => ({ ...prev, isLoading: false }));
      }
    });

    return unsubscribe;
  }, []);

  // ─────────────────────────────
  // Set user (called after OTP verify / backend registration)
  // ─────────────────────────────

  const setUser = useCallback(async (user: AuthUser) => {
    await AsyncStorage.setItem(KEYS.USER, JSON.stringify(user));
    setState({
      user,
      isLoading: false,
      isAuthenticated: true,
    });
  }, []);

  // ─────────────────────────────
  // Update user (after profile edit, trust score change, etc.)
  // ─────────────────────────────

  const updateUser = useCallback(async (updates: Partial<AuthUser>) => {
    setState(prev => {
      if (!prev.user) return prev;
      const updated = { ...prev.user, ...updates };
      AsyncStorage.setItem(KEYS.USER, JSON.stringify(updated)).catch(console.error);
      return { ...prev, user: updated };
    });
  }, []);

  // ─────────────────────────────
  // Logout
  // ─────────────────────────────

  const logout = useCallback(async () => {
    await signOut(firebaseAuth);
    await AsyncStorage.removeItem(KEYS.USER);
    setState({
      user: null,
      isLoading: false,
      isAuthenticated: false,
    });
  }, []);

  return {
    // State
    user: state.user,
    isLoading: state.isLoading,
    isAuthenticated: state.isAuthenticated,

    // Actions
    setUser,
    logout,
    updateUser,
  };
}

// ─────────────────────────────────────────────
// Auth context (for passing auth down without prop drilling)
// ─────────────────────────────────────────────

type AuthContextType = ReturnType<typeof useAuth>;

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const authState = useAuth();
  return (
    <AuthContext.Provider value={authState}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * @description Use this inside any screen to access auth state.
 * Requires <AuthProvider> at the app root (App.tsx).
 *
 * @usage
 *   const { user, logout } = useAuthContext();
 */
export function useAuthContext(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthContext must be used inside <AuthProvider>');
  return ctx;
}
