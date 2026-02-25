/**
 * @file AddressAutocomplete.tsx
 * @description Address autocomplete using Jesta backend proxy for Google Places.
 * Debounced search with RTL-styled dropdown.
 *
 * @hebrew חיפוש כתובת עם השלמה אוטומטית — RTL
 */

import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../theme/rtl';
import he from '../i18n/he.json';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface Prediction {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
}

interface AddressResult {
  address: string;
  latitude: number;
  longitude: number;
}

interface AddressAutocompleteProps {
  value: string;
  onSelect: (result: AddressResult) => void;
  placeholder?: string;
  error?: string;
}

const API_BASE = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000') + '/v1';
const DEBOUNCE_MS = 300;

export default function AddressAutocomplete({
  value, onSelect, placeholder, error,
}: AddressAutocompleteProps) {
  const [query, setQuery] = useState(value || '');
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (input: string) => {
    if (input.length < 2) {
      setPredictions([]);
      setShowDropdown(false);
      return;
    }

    setIsSearching(true);
    try {
      const token = await AsyncStorage.getItem('@jesta/access_token');
      const params = new URLSearchParams({ input });
      const res = await fetch(`${API_BASE}/geo/autocomplete?${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      setPredictions(data.predictions || []);
      setShowDropdown(true);
    } catch {
      setPredictions([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleChangeText = (text: string) => {
    setQuery(text);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => search(text), DEBOUNCE_MS);
  };

  const handleSelect = async (prediction: Prediction) => {
    setQuery(prediction.description);
    setShowDropdown(false);
    setPredictions([]);

    try {
      const token = await AsyncStorage.getItem('@jesta/access_token');
      const params = new URLSearchParams({ placeId: prediction.placeId });
      const res = await fetch(`${API_BASE}/geo/place-details?${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();

      if (data.latitude && data.longitude) {
        onSelect({
          address: data.address || prediction.description,
          latitude: data.latitude,
          longitude: data.longitude,
        });
      }
    } catch {
      // Still set the address text even if details fail
      onSelect({
        address: prediction.description,
        latitude: 0,
        longitude: 0,
      });
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.inputRow}>
        <TextInput
          style={[styles.textInput, !!error && styles.textInputError]}
          value={query}
          onChangeText={handleChangeText}
          placeholder={placeholder || he.tasks.address_placeholder}
          placeholderTextColor={Colors.textDisabled}
          textAlign="right"
          onFocus={() => predictions.length > 0 && setShowDropdown(true)}
        />
        {isSearching && (
          <ActivityIndicator
            size="small"
            color={Colors.primary}
            style={styles.spinner}
          />
        )}
      </View>
      {error && <Text style={styles.errorText}>{error}</Text>}

      {showDropdown && predictions.length > 0 && (
        <View style={styles.dropdown}>
          {predictions.map((p) => (
            <TouchableOpacity
              key={p.placeId}
              style={styles.suggestion}
              onPress={() => handleSelect(p)}
            >
              <Text style={styles.suggestionMain}>{p.mainText}</Text>
              <Text style={styles.suggestionSecondary}>{p.secondaryText}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {showDropdown && !isSearching && predictions.length === 0 && query.length >= 2 && (
        <View style={styles.dropdown}>
          <Text style={styles.noResults}>{he.tasks.address_no_results}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'relative', zIndex: 10 },
  inputRow: { position: 'relative' },
  textInput: {
    backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.border,
    borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
    fontSize: 14, color: Colors.textPrimary, textAlign: 'right',
  },
  textInputError: { borderColor: Colors.error },
  spinner: { position: 'absolute', left: Spacing.md, top: '50%', marginTop: -10 },
  errorText: { fontSize: 12, color: Colors.error, textAlign: 'right', marginTop: 4 },
  dropdown: {
    position: 'absolute', top: '100%', left: 0, right: 0,
    backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border,
    borderRadius: BorderRadius.md, marginTop: 4,
    ...Shadows.md, zIndex: 20,
    maxHeight: 240,
  },
  suggestion: {
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
    flexDirection: 'column', alignItems: 'flex-end',
  },
  suggestionMain: { ...Typography.label, color: Colors.textPrimary },
  suggestionSecondary: { ...Typography.caption, color: Colors.textSecondary },
  noResults: { ...Typography.bodySmall, color: Colors.textDisabled, textAlign: 'center', padding: Spacing.md },
});
