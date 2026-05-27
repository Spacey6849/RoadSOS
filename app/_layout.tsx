import '../global.css';
import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Colors } from '../constants/theme';
import { setupNotifications } from '../lib/notifications';
import { setupServiceChannel } from '../lib/background-service';
import { resumePendingDownload, warmupLocalLLM } from '../lib/local-llm';
import { ErrorBoundary } from '../components/ErrorBoundary';

export default function RootLayout() {
  useEffect(() => {
    setupNotifications().catch((err) => {
      if (__DEV__) console.error('[RootLayout] Notification setup failed:', err);
    });
    setupServiceChannel().catch(() => {});
    // If a model download was interrupted last session, pick it back up from
    // the persisted resume token. Runs in the background and just updates the
    // global download state — any screen that subscribes will see progress.
    resumePendingDownload().catch((err) => {
      if (__DEV__) console.warn('[RootLayout] resumePendingDownload failed:', err);
    });
    // Pre-load the on-device LLM in the background so the chat screen doesn't
    // pay the 30-90s GGUF-load cost on first open. Self-heals stale state if
    // the model file went missing since last launch. No-op if not downloaded.
    warmupLocalLLM();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" backgroundColor={Colors.background} />
      <ErrorBoundary>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: Colors.background },
            animation: 'fade',
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="model-setup" />
          <Stack.Screen name="incident/[id]" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="auth/sign-in" />
          <Stack.Screen name="auth/sign-up" />
          <Stack.Screen name="stream/[id]" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="ice" />
        </Stack>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
