/**
 * @file useLocation.ts
 * @description Hook to get user's GPS coordinates with permission check.
 * Does NOT auto-request permission — that's handled by ProfileSetupScreen.
 * Falls back to Tel Aviv if no permission granted.
 *
 * @hebrew הוק למיקום GPS — בודק הרשאה קיימת, לא מבקש אוטומטית
 */

import { useState, useEffect } from 'react';
import * as Location from 'expo-location';

// Default fallback: Tel Aviv
const TEL_AVIV = { latitude: 32.0853, longitude: 34.7818 };

interface LocationState {
  coords: { latitude: number; longitude: number };
  hasPermission: boolean;
  isFallback: boolean;
}

export function useLocation(): LocationState {
  const [state, setState] = useState<LocationState>({
    coords: TEL_AVIV,
    hasPermission: false,
    isFallback: true,
  });

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') return;

        if (cancelled) return;

        // Try last known position first (fast, no battery cost)
        let position = await Location.getLastKnownPositionAsync();

        // Fall back to current position if no cached location
        if (!position) {
          position = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
        }

        if (!cancelled && position) {
          setState({
            coords: {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            },
            hasPermission: true,
            isFallback: false,
          });
        }
      } catch {
        // Silent fail — keep fallback
      }
    }

    resolve();
    return () => { cancelled = true; };
  }, []);

  return state;
}
