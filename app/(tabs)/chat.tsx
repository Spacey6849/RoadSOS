import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { ArrowLeftRight, Bot, Car, HeartPulse, Loader, Siren, Stethoscope, Wrench } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ChatInput from '../../components/ChatInput';
import { ChatBubble } from '../../components/ChatBubble';
import { Chip, colorForTone, Header, Panel, Screen, StatusPill } from '../../components/AppKit';
import { Colors, Spacing, Typography } from '../../constants/theme';
import { TAB_BAR_TOTAL } from '../../constants/layout';
import { useLocation } from '../../hooks/useLocation';
import { useNearbyServices } from '../../hooks/useNearbyServices';
import { fetchWithTimeout } from '../../lib/fetch-utils';
import { buildContextBlock, streamGroqResponse, UserContext } from '../../lib/groq';
import { getUserProfile } from '../../lib/offline-cache';
import { getSelectedVariant, initLocalLLM, isLLMReady, MODELS, reconcileModelState, stopLocalLLMCompletion, streamLocalLLM } from '../../lib/local-llm';
import { uid } from '../../lib/utils';
import { ChatMessage } from '../../types';

type ResolvedTier = 'cloud' | 'local' | 'offline';

const QUICK_ACTIONS = [
  { label: 'First Aid', prompt: 'Give me first-aid steps for an injured person after a road accident.', Icon: HeartPulse },
  { label: 'Car accident', prompt: 'I was in a road accident. What should I do first?', Icon: Car },
  { label: 'Breakdown', prompt: 'My vehicle broke down on the highway. What should I do?', Icon: Wrench },
  { label: 'Medical', prompt: 'Someone is unconscious and not breathing. Give me CPR steps.', Icon: Stethoscope },
  { label: 'Incident', prompt: 'Help me report a road incident and note the right details.', Icon: Siren },
];

/**
 * Lightweight reachability probe. Uses a HEAD request to a known-good endpoint
 * with a tight timeout so the UI flips between Online and Offline within a few
 * seconds of the network changing.
 */
function useOnlineStatus() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    let active = true;
    async function check() {
      try {
        await fetchWithTimeout('https://clients3.google.com/generate_204', { method: 'HEAD' }, 4000);
        if (active) setOnline(true);
      } catch {
        if (active) setOnline(false);
      }
    }
    check();
    const timer = setInterval(check, 20000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  return online;
}

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const streamAborted = useRef(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [localReady, setLocalReady] = useState(false);
  const [localModelName, setLocalModelName] = useState('Llama 3.2');
  const [forceLocal, setForceLocal] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [initElapsed, setInitElapsed] = useState(0);
  const initStartRef = useRef<number | null>(null);
  const [userCtx, setUserCtx] = useState<UserContext | null>(null);
  const online = useOnlineStatus();
  const { location } = useLocation();
  const { services } = useNearbyServices(location?.lat ?? null, location?.lng ?? null);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Hydrate user context and warm the on-device model if the user has it ready.
  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      const profile = await getUserProfile();
      if (!cancelled && profile) {
        setUserCtx({
          name: profile.name,
          bloodGroup: profile.bloodGroup,
          language: profile.language,
          medicalInfo: profile.medicalInfo,
        });
      }
      try {
        // Reconcile (not just read) — catches the case where state='ready' but
        // the model file went missing since the last run. Without this the
        // chat shows "Loading…" for 90s then silently falls back to offline
        // fallback, which looks like "the model I installed isn't working".
        const state = await reconcileModelState();
        const selected = await getSelectedVariant();
        if (!cancelled && state === 'ready' && selected) {
          if (!cancelled) setLocalModelName(MODELS[selected]?.name ?? 'Llama 3.2');
          let ready = isLLMReady();
          if (!ready) {
            if (!cancelled) {
              setIsInitializing(true);
              initStartRef.current = Date.now();
            }
            ready = await initLocalLLM(selected);
            if (!cancelled) setIsInitializing(false);
          }
          if (!cancelled) setLocalReady(ready);
        }
      } catch {
        if (!cancelled) {
          setIsInitializing(false);
          setLocalReady(false);
        }
      }
    }
    hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  const context = useMemo<UserContext | undefined>(() => {
    const nearbyServices = services.slice(0, 5).map((service) => ({
      name: service.name,
      service_type: service.service_type,
      phone: service.primary_phone,
      distance_km: service.distance_km,
    }));
    if (!userCtx && !location && nearbyServices.length === 0) return undefined;
    return {
      ...userCtx,
      location: location ? { lat: location.lat, lng: location.lng, address: location.address } : undefined,
      nearbyServices,
    };
  }, [location, services, userCtx]);

  // Tick elapsed seconds while the model is loading from disk.
  useEffect(() => {
    if (!isInitializing) {
      setInitElapsed(0);
      return;
    }
    const timer = setInterval(() => {
      if (initStartRef.current) {
        setInitElapsed(Math.floor((Date.now() - initStartRef.current) / 1000));
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [isInitializing]);

  // Reset forced-local when the connection drops — no choice to offer offline.
  useEffect(() => {
    if (!online) setForceLocal(false);
  }, [online]);

  /**
   * Pick the best available inference tier. When the user has forced local mode
   * and the model is ready, use it even when online. Otherwise: Online → Groq
   * cloud, on-device model ready → local, else → first-aid fallback.
   */
  const pickTier = useCallback((): ResolvedTier => {
    if (forceLocal && localReady && isLLMReady()) return 'local';
    if (forceLocal) return 'offline';
    if (online) return 'cloud';
    if (localReady && isLLMReady()) return 'local';
    return 'offline';
  }, [forceLocal, localReady, online]);

  function stopStreaming() {
    streamAborted.current = true;
    void stopLocalLLMCompletion();
    setIsStreaming(false);
    setMessages((current) => current.map((m) => (m.isStreaming ? { ...m, isStreaming: false } : m)));
  }

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isStreaming) return;
      streamAborted.current = false;

      const userMessage: ChatMessage = { id: uid(), role: 'user', content: trimmed, timestamp: Date.now() };
      const assistantId = uid();
      const assistantMessage: ChatMessage = { id: assistantId, role: 'assistant', content: '', timestamp: Date.now(), isStreaming: true };
      const history = [...messagesRef.current, userMessage];

      setMessages((current) => [...current, userMessage, assistantMessage]);
      setInput('');
      setIsStreaming(true);

      function update(content: string, streaming = true) {
        setMessages((current) => current.map((message) => (message.id === assistantId ? { ...message, content, isStreaming: streaming } : message)));
      }

      async function runTier(tier: ResolvedTier): Promise<{ ok: boolean; output: string; reason?: string }> {
        let output = '';
        try {
          if (tier === 'local') {
            if (!isLLMReady()) return { ok: false, output, reason: 'on-device model not loaded' };
            const stream = context ? streamLocalLLM(history, { contextBlock: buildContextBlock(context) }) : streamLocalLLM(history);
            // 90-second watchdog — aborts the completion if prefill takes too long.
            // stopLocalLLMCompletion() signals llama.rn to stop, which fires the
            // .finally() handler, which sends the null sentinel, which ends the
            // for-await loop cleanly without leaving _ctx in a broken state.
            const watchdog = setTimeout(() => void stopLocalLLMCompletion(), 90_000);
            try {
              for await (const chunk of stream) {
                if (streamAborted.current) break;
                output += chunk;
                update(output);
              }
            } finally {
              clearTimeout(watchdog);
            }
            return output ? { ok: true, output } : { ok: false, output, reason: 'on-device model timed out or returned no text' };
          }

          if (tier === 'cloud') {
            const stream = streamGroqResponse(history, context);
            for await (const chunk of stream) {
              if (streamAborted.current) break;
              output += chunk;
              update(output);
            }
            return output ? { ok: true, output } : { ok: false, output, reason: 'cloud returned no text' };
          }

          // 'offline' tier — intentionally minimal. We do NOT auto-paste the
          // long canned first-aid list when an AI tier failed; that confuses
          // the user (their actual question gets ignored) and is exactly what
          // the team flagged as a problem. A short honest message + the
          // emergency numbers is more useful in real distress.
          return {
            ok: true,
            output:
              `I can't reach the assistant right now. Please call 112 immediately, ` +
              `then describe what happened so I can help when I'm back.\n\n` +
              `If you have time, tap the Profile tab and download the on-device ` +
              `Llama 3.2 model — it works fully offline next time.`,
          };
        } catch (error) {
          return { ok: false, output, reason: error instanceof Error ? error.message : 'unknown error' };
        }
      }

      // Auto-ladder: try the picked tier first, then degrade. When the user
      // EXPLICITLY toggled to local (`forceLocal`), do NOT fall back silently —
      // they need to know if their chosen tier failed, not get a generic
      // "I can't reach the assistant" message that hides the real problem.
      const primary = pickTier();
      const ladder: ResolvedTier[] =
        primary === 'cloud'
          ? ['cloud', localReady && isLLMReady() ? 'local' : 'offline', 'offline']
          : primary === 'local' && forceLocal
            ? ['local'] // user explicitly chose local — no auto-fallback
            : primary === 'local'
              ? ['local', 'offline']
              : ['offline'];

      // Dedupe consecutive duplicates without losing order.
      const seen = new Set<ResolvedTier>();
      const dedupedLadder = ladder.filter((tier) => {
        if (seen.has(tier)) return false;
        seen.add(tier);
        return true;
      });

      let final = '';
      let used: ResolvedTier = primary;
      const reasons: string[] = [];

      for (let i = 0; i < dedupedLadder.length; i++) {
        if (streamAborted.current) break;
        const tier = dedupedLadder[i]!;
        if (i > 0) update('');
        const result = await runTier(tier);
        if (result.ok) {
          final = result.output;
          used = tier;
          break;
        }
        if (result.reason) reasons.push(`${tier}: ${result.reason}`);
      }

      if (streamAborted.current) {
        setIsStreaming(false);
        return;
      }

      // No tier produced output. The only path that ends with !final today is
      // when the user explicitly forced local (ladder=['local']) and local
      // failed. Give them an actionable message instead of a generic one so
      // they know to toggle back to cloud or reload the model.
      if (!final) {
        if (forceLocal) {
          // Sanitize the reason: strip any API keys / tokens / long hex blobs
          // that may have leaked into the underlying error message, and cap
          // the length so a stack trace can't dump into the chat bubble.
          const raw = reasons[0] ? reasons[0].replace(/^local: /, '') : 'no response from on-device model';
          const sanitized = raw
            .replace(/\b(gsk_|sk-|sb_|AIza|eyJ)[A-Za-z0-9_.-]{10,}/g, '<redacted>')
            .replace(/\s+/g, ' ')
            .slice(0, 140);
          const why = sanitized || 'no response from on-device model';
          final =
            `On-device model couldn't answer (${why}).\n\n` +
            `Tap the toggle in the header to switch back to cloud, ` +
            `or open Settings → Offline AI to reload the model.\n\n` +
            `For an immediate emergency, call 112.`;
        } else {
          final = `I can't reach the assistant right now. Please call 112 immediately.`;
        }
      }
      // Only annotate when we silently degraded to local — gives the user a
      // hint that the answer is from the on-device model and might be terser
      // than the cloud version.
      if (used === 'local' && primary === 'cloud') {
        final = `_(cloud unreachable — answering with ${localModelName})_\n\n${final}`;
      }
      update(final, false);
      setIsStreaming(false);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    },
    [context, isStreaming, localReady, pickTier, forceLocal],
  );

  const tier = pickTier();
  // `noUncheckedIndexedAccess` makes [0] `string | undefined`; split() always
  // returns at least one element so the ?? is belt-and-braces, not a real path.
  const shortModelName = (localModelName.split('(')[0] ?? localModelName).trim();
  const tierLabel = tier === 'cloud' ? 'Online · Llama 3.3' : tier === 'local' ? `Offline · ${shortModelName}` : 'Offline · First aid';
  const tierTone: 'green' | 'indigo' | 'amber' = tier === 'cloud' ? 'green' : tier === 'local' ? 'indigo' : 'amber';

  // Toggle is available only when both online and a local model are ready.
  const canToggle = online && localReady && isLLMReady();
  const indigo = colorForTone('indigo');

  // Loading indicator colour.
  const initColor = colorForTone('amber');
  const initTookTooLong = initElapsed >= 60;

  return (
    <Screen style={{ paddingTop: insets.top }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Header
          title="AI Assistant"
          subtitle={
            isInitializing
              ? `Loading ${shortModelName}…`
              : tier === 'cloud'
                ? 'Online · cloud guidance'
                : tier === 'local'
                  ? `Offline · ${shortModelName}`
                  : 'Offline · first-aid playbook'
          }
          right={
            isInitializing ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 999,
                  backgroundColor: `${initColor}1A`,
                }}
              >
                <Loader size={12} color={initColor} />
                <Text style={{ fontSize: 12, fontWeight: '600', color: initColor }}>
                  {initTookTooLong ? `Slow… ${initElapsed}s` : `Loading ${initElapsed}s`}
                </Text>
              </View>
            ) : canToggle ? (
              <Pressable
                onPress={() => setForceLocal((prev) => !prev)}
                accessibilityRole="switch"
                accessibilityLabel={forceLocal ? 'Switch to online cloud AI' : `Switch to offline ${shortModelName}`}
                accessibilityState={{ checked: forceLocal }}
                hitSlop={8}
                // Filled when local is forced, outlined when on cloud — the
                // user can see at a glance which tier the next message will use.
                style={({ pressed }) => ({
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: forceLocal ? indigo : `${indigo}1A`,
                  borderWidth: 1,
                  borderColor: forceLocal ? indigo : `${indigo}4D`,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <ArrowLeftRight size={18} color={forceLocal ? '#FFFFFF' : indigo} />
              </Pressable>
            ) : (
              <StatusPill label={tierLabel} tone={tierTone} />
            )
          }
        />

        {/* Quick prompt chips — always available above the conversation. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: Spacing.xs, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.sm }}
          style={{ flexGrow: 0 }}
        >
          {QUICK_ACTIONS.map((item) => (
            <Chip
              key={item.label}
              label={item.label}
              Icon={item.Icon}
              selected={false}
              tone="indigo"
              onPress={() => sendMessage(item.prompt)}
            />
          ))}
        </ScrollView>

        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ChatBubble message={item} />}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ flexGrow: 1, paddingBottom: Spacing.md }}
          onContentSizeChange={() => messages.length > 0 && listRef.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={
            <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: Spacing.lg }}>
              <Panel tone="indigo" style={{ alignItems: 'center', paddingVertical: Spacing.xl }}>
                <View
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 16,
                    backgroundColor: `${indigo}24`,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: Spacing.sm,
                  }}
                >
                  <Bot size={34} color={indigo} />
                </View>
                <Text style={{ color: Colors.textPrimary, ...Typography.h3, textAlign: 'center' }}>
                  Chat with your co-pilot
                </Text>
                <Text style={{ color: Colors.textMuted, ...Typography.bodySmall, textAlign: 'center', marginTop: 6 }}>
                  {online
                    ? 'Ask for first-aid, accident or breakdown steps — answered by cloud AI.'
                    : localReady
                      ? `Offline — answers from ${localModelName} on your device.`
                      : 'Offline — short first-aid answers from the built-in playbook.'}
                </Text>
              </Panel>
            </View>
          }
        />

        <ChatInput input={input} setInput={setInput} isStreaming={isStreaming} onSend={sendMessage} onStop={stopStreaming} />
        <View style={{ height: TAB_BAR_TOTAL + insets.bottom + Spacing.sm }} />
      </KeyboardAvoidingView>
    </Screen>
  );
}
