import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, Pressable, SafeAreaView } from 'react-native';
import { router } from 'expo-router';
import { AlertTriangle } from 'lucide-react-native';
import { Colors, Radius, Spacing } from '../constants/theme';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (__DEV__) console.error('[ErrorBoundary] caught:', error, errorInfo);
  }

  override render() {
    if (this.state.hasError) {
      return (
        <SafeAreaView
          style={{
            flex: 1,
            backgroundColor: Colors.background,
            alignItems: 'center',
            justifyContent: 'center',
            padding: Spacing.xl,
          }}
        >
          <AlertTriangle size={48} color={Colors.warningAmber} style={{ marginBottom: Spacing.lg }} />
          <Text
            style={{
              color: Colors.textPrimary,
              fontSize: 20,
              fontWeight: '700',
              marginBottom: Spacing.sm,
              textAlign: 'center',
            }}
          >
            Something went wrong
          </Text>
          <Text
            style={{
              color: Colors.textMuted,
              fontSize: 14,
              textAlign: 'center',
              marginBottom: Spacing.xxl,
              lineHeight: 20,
            }}
          >
            {(this.state.error?.message ?? 'An unexpected error occurred').slice(0, 200)}
          </Text>
          <Pressable
            style={({ pressed }) => ({
              backgroundColor: Colors.sosRed,
              paddingHorizontal: Spacing.xl,
              paddingVertical: Spacing.lg,
              borderRadius: Radius.pill,
              opacity: pressed ? 0.85 : 1,
            })}
            accessibilityRole="button"
            accessibilityHint="Returns to the main screen"
            onPress={() => {
              this.setState({ hasError: false, error: null });
              router.replace('/(tabs)');
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>
              Go Back Home
            </Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => ({
              backgroundColor: Colors.surface2,
              paddingHorizontal: Spacing.xl,
              paddingVertical: Spacing.lg,
              borderRadius: Radius.pill,
              opacity: pressed ? 0.85 : 1,
              marginTop: Spacing.sm,
            })}
            accessibilityRole="button"
            accessibilityHint="Tries to recover from the error"
            onPress={() => {
              this.setState({ hasError: false, error: null });
            }}
          >
            <Text style={{ color: Colors.textPrimary, fontWeight: '800', fontSize: 15 }}>
              Try Again
            </Text>
          </Pressable>
        </SafeAreaView>
      );
    }

    return this.props.children;
  }
}
