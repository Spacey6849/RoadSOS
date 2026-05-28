import React, { useCallback, useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, RefreshControl, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Activity, Cpu, Database, MessageSquare, Shield, User } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ContactList from '../../components/ContactList';
import { Chip, DataRow, GhostButton, Header, IconBadge, LoadingState, Panel, Screen, SectionTitle, StatusPill, Switch, TextField } from '../../components/AppKit';
import { Colors, Spacing, Typography } from '../../constants/theme';
import { tabContentPaddingBottom } from '../../constants/layout';
import { getEmergencyContacts, getSeedForRegion, getUserProfile, loadServicesCache, saveEmergencyContacts, saveServicesCache, saveUserProfile } from '../../lib/offline-cache';
import { ALL_REGION_KEYS, getRegionByKey } from '../../lib/region-detector';
import { storeContactsNative, storeMedicalInfoNative, storeUserNameNative } from '../../lib/native-crash-service';
import { uid } from '../../lib/utils';
import { AppMode, BloodGroup, CrashSensitivity, EmergencyContact, Language, UserProfile } from '../../types';

// Native Kotlin foreground service reads contacts/name from SharedPreferences
// at SOS time. Settings changes MUST sync to those prefs immediately — without
// this, adding/removing a contact wouldn't take effect until the next AppState
// foreground transition, and a crash fired in between would page the stale list.
function syncContactsToNative(next: EmergencyContact[]): void {
  storeContactsNative(next.map((c) => c.phone), next.map((c) => c.name)).catch(() => {});
}

const BLOOD_GROUPS: BloodGroup[] = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const LANGUAGES: Language[] = ['English', 'Hindi', 'Tamil', 'Telugu', 'Kannada', 'Malayalam', 'Marathi'];
const SENSITIVITIES: { label: string; value: CrashSensitivity; hint: string }[] = [
  { label: 'Low', value: 'low', hint: 'Fewer false alarms' },
  { label: 'Medium', value: 'medium', hint: 'Balanced' },
  { label: 'High', value: 'high', hint: 'Most sensitive' },
];

function defaultProfile(): UserProfile {
  return {
    name: 'RoadSoS User',
    bloodGroup: 'O+',
    language: 'English',
    medicalInfo: { allergies: '', medications: '', conditions: '' },
    crashDetectionEnabled: true,
    crashSensitivity: 'medium',
    appMode: 'normal',
    devMode: false,
    onboardingComplete: true,
    batteryOptimization: false,
  };
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [regionKey, setRegionKey] = useState('goa');
  const [cacheInfo, setCacheInfo] = useState<{ count: number; ageHours: number } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    const [storedProfile, storedContacts, cache] = await Promise.all([
      getUserProfile(),
      getEmergencyContacts(),
      loadServicesCache(regionKey),
    ]);
    const nextProfile = storedProfile ?? defaultProfile();
    if (!storedProfile) await saveUserProfile(nextProfile);
    setProfile(nextProfile);
    setContacts(storedContacts);
    setCacheInfo(cache ? { count: cache.services.length, ageHours: Math.round((cache.cacheAge ?? 0) / 3600000) } : null);
  }, [regionKey]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function updateProfile(updates: Partial<UserProfile>) {
    if (!profile) return;
    const next = { ...profile, ...updates };
    setProfile(next);
    await saveUserProfile(next);
    // Mirror the user's name into native prefs so the SMS template addresses
    // them correctly even on a JS-cold-start auto-SOS.
    if (updates.name && updates.name !== profile.name) {
      storeUserNameNative(next.name).catch(() => {});
    }
    // Same for medical info — the native SMS template includes blood group
    // and conditions so the recipient knows what to tell paramedics.
    if (updates.bloodGroup !== undefined || updates.medicalInfo !== undefined) {
      storeMedicalInfoNative(
        next.bloodGroup,
        next.medicalInfo.allergies,
        next.medicalInfo.medications,
        next.medicalInfo.conditions,
      ).catch(() => {});
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 1400);
  }

  async function updateMedical(key: 'allergies' | 'medications' | 'conditions', value: string) {
    const current = profile?.medicalInfo ?? { allergies: '', medications: '', conditions: '' };
    await updateProfile({ medicalInfo: { ...current, [key]: value } });
  }

  async function addContact(name: string, phone: string) {
    if (contacts.length >= 3) {
      Alert.alert('Contact limit', 'You can save up to 3 emergency contacts.');
      return;
    }
    const next = [...contacts, { id: uid(), name, phone }];
    setContacts(next);
    await saveEmergencyContacts(next);
    syncContactsToNative(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 1400);
  }

  function removeContact(id: string) {
    Alert.alert('Remove contact?', 'This person will no longer receive SOS messages.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          const next = contacts.filter((contact) => contact.id !== id);
          setContacts(next);
          await saveEmergencyContacts(next);
          syncContactsToNative(next);
        },
      },
    ]);
  }

  async function changeRegion(nextKey: string) {
    setRegionKey(nextKey);
    const seed = getSeedForRegion(nextKey);
    await saveServicesCache(seed, nextKey);
    const cache = await loadServicesCache(nextKey);
    setCacheInfo(cache ? { count: cache.services.length, ageHours: Math.round((cache.cacheAge ?? 0) / 3600000) } : null);
  }

  async function refreshSeedData() {
    const seed = getSeedForRegion(regionKey);
    await saveServicesCache(seed, regionKey);
    const cache = await loadServicesCache(regionKey);
    setCacheInfo(cache ? { count: cache.services.length, ageHours: Math.round((cache.cacheAge ?? 0) / 3600000) } : null);
    Alert.alert('Offline data ready', `${getRegionByKey(regionKey).name} seed services are available offline.`);
  }

  if (!profile) {
    return <Screen style={{ paddingTop: insets.top }}><LoadingState label="Loading profile..." /></Screen>;
  }

  return (
    <Screen style={{ paddingTop: insets.top }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Header
          title="Settings"
          subtitle="Emergency identity, contacts, and app behavior"
          right={saved ? <StatusPill label="Saved" tone="green" /> : null}
        />

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: Spacing.lg, paddingBottom: tabContentPaddingBottom(insets.bottom, Spacing.xxl) }}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.sosRed} />}
          showsVerticalScrollIndicator={false}
        >
          <Panel tone="red" style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
            <IconBadge Icon={User} tone="red" size={54} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: Colors.textPrimary, ...Typography.h3 }} numberOfLines={1}>
                {profile.name}
              </Text>
              <Text style={{ color: Colors.textMuted, ...Typography.bodySmall }}>
                Blood {profile.bloodGroup} - {profile.language}
              </Text>
            </View>
          </Panel>

          <SectionTitle label="Identity" />
          <Panel style={{ gap: Spacing.md }}>
            <TextField label="Name" value={profile.name} onChangeText={(value) => updateProfile({ name: value })} placeholder="Your name" />
            <View style={{ gap: Spacing.sm }}>
              <Text style={{ color: Colors.textMuted, ...Typography.label }}>BLOOD GROUP</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs }}>
                {BLOOD_GROUPS.map((item) => (
                  <Chip key={item} label={item} selected={profile.bloodGroup === item} tone="red" onPress={() => updateProfile({ bloodGroup: item })} />
                ))}
              </View>
            </View>
            <View style={{ gap: Spacing.sm }}>
              <Text style={{ color: Colors.textMuted, ...Typography.label }}>LANGUAGE</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs }}>
                {LANGUAGES.map((item) => (
                  <Chip key={item} label={item} selected={profile.language === item} tone="blue" onPress={() => updateProfile({ language: item })} />
                ))}
              </View>
            </View>
          </Panel>

          <SectionTitle label="Medical notes" />
          <Panel style={{ gap: Spacing.md }}>
            <TextField label="Allergies" value={profile.medicalInfo?.allergies ?? ''} onChangeText={(value) => updateMedical('allergies', value)} placeholder="Allergies or none" />
            <TextField label="Medications" value={profile.medicalInfo?.medications ?? ''} onChangeText={(value) => updateMedical('medications', value)} placeholder="Current medication" />
            <TextField label="Conditions" value={profile.medicalInfo?.conditions ?? ''} onChangeText={(value) => updateMedical('conditions', value)} placeholder="Medical conditions" />
          </Panel>

          <SectionTitle label="Emergency contacts" />
          <ContactList contacts={contacts} onAddContact={addContact} onRemoveContact={removeContact} />

          <SectionTitle label="Monitoring mode" />
          <Panel style={{ gap: Spacing.md }}>
            <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
              <Chip
                label="Drive"
                selected={profile.appMode === 'drive'}
                tone="amber"
                onPress={() => updateProfile({ appMode: 'drive' as AppMode })}
              />
              <Chip
                label="Normal"
                selected={profile.appMode === 'normal'}
                tone="green"
                onPress={() => updateProfile({ appMode: 'normal' as AppMode })}
              />
            </View>
            <Text style={{ color: Colors.textMuted, ...Typography.caption }}>
              {profile.appMode === 'drive'
                ? 'Drive mode: uses jerk + spike ratio to ignore speed bumps and braking. Only a sudden, high-energy collision triggers SOS.'
                : 'Normal mode: uses a direct impact threshold tuned for falls and pedestrian collisions.'}
            </Text>
          </Panel>

          <SectionTitle label="Crash detection" />
          <Panel style={{ gap: Spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
              <IconBadge Icon={Shield} tone={profile.crashDetectionEnabled ? 'green' : 'neutral'} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: Colors.textPrimary, ...Typography.bodySmall, fontWeight: '800' }}>Auto SOS monitoring</Text>
                <Text style={{ color: Colors.textMuted, ...Typography.caption }}>Start a countdown after a severe impact.</Text>
              </View>
              <Switch
                value={profile.crashDetectionEnabled}
                onValueChange={(value) => updateProfile({ crashDetectionEnabled: value })}
              />
            </View>
            <View style={{ flexDirection: 'row', gap: Spacing.xs }}>
              {SENSITIVITIES.map((item) => (
                <View key={item.value} style={{ flex: 1 }}>
                  <Chip label={item.label} selected={profile.crashSensitivity === item.value} tone="amber" onPress={() => updateProfile({ crashSensitivity: item.value })} />
                  <Text style={{ color: Colors.textFaint, ...Typography.caption, textAlign: 'center', marginTop: 5 }}>{item.hint}</Text>
                </View>
              ))}
            </View>
          </Panel>

          <SectionTitle label="AI assistant" />
          <Panel style={{ gap: Spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
              <IconBadge Icon={MessageSquare} tone="indigo" />
              <View style={{ flex: 1 }}>
                <Text style={{ color: Colors.textPrimary, ...Typography.bodySmall, fontWeight: '800' }}>Offline AI model</Text>
                <Text style={{ color: Colors.textMuted, ...Typography.caption }}>Download Llama 3.2 for AI guidance without internet.</Text>
              </View>
            </View>
            <GhostButton label="Set up AI model" tone="indigo" Icon={Cpu} onPress={() => router.push('/model-setup')} />
          </Panel>

          <View style={{ height: 1, backgroundColor: Colors.border, marginVertical: Spacing.xl }} />

          <SectionTitle label="Offline region" />
          <Panel style={{ gap: Spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
              <IconBadge Icon={Database} tone="blue" />
              <View style={{ flex: 1 }}>
                <Text style={{ color: Colors.textPrimary, ...Typography.bodySmall, fontWeight: '800' }}>{getRegionByKey(regionKey).name}</Text>
                <Text style={{ color: Colors.textMuted, ...Typography.caption }}>
                  {cacheInfo ? `${cacheInfo.count} services cached, ${cacheInfo.ageHours}h old` : 'Seed data not loaded yet'}
                </Text>
              </View>
              <GhostButton label="Load" tone="blue" onPress={refreshSeedData} />
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs }}>
              {ALL_REGION_KEYS.map((key) => (
                <Chip key={key} label={getRegionByKey(key).name} selected={regionKey === key} tone="blue" onPress={() => changeRegion(key)} />
              ))}
            </View>
          </Panel>

          <SectionTitle label="Power and developer" />
          <Panel style={{ gap: Spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
              <IconBadge Icon={Activity} tone="amber" />
              <View style={{ flex: 1 }}>
                <Text style={{ color: Colors.textPrimary, ...Typography.bodySmall, fontWeight: '800' }}>Emergency battery mode</Text>
                <Text style={{ color: Colors.textMuted, ...Typography.caption }}>Reduce background work when power is low.</Text>
              </View>
              <Switch
                value={!!profile.batteryOptimization}
                onValueChange={(value) => updateProfile({ batteryOptimization: value })}
              />
            </View>
            <View style={{ height: 1, backgroundColor: Colors.border }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
              <IconBadge Icon={Cpu} tone="neutral" />
              <View style={{ flex: 1 }}>
                <Text style={{ color: Colors.textPrimary, ...Typography.bodySmall, fontWeight: '800' }}>Developer demo mode</Text>
                <Text style={{ color: Colors.textMuted, ...Typography.caption }}>Adds crash simulation to the SOS screen.</Text>
              </View>
              <Switch
                value={profile.devMode}
                onValueChange={(value) => updateProfile({ devMode: value })}
              />
            </View>
          </Panel>

          <SectionTitle label="Account" />
          <Panel style={{ gap: Spacing.sm }}>
            <DataRow label="Storage" value="Offline-first" valueColor={Colors.safeGreen} />
            <DataRow label="Contacts" value={`${contacts.length}/3 saved`} />
            <GhostButton label="Sign in / cloud sync" Icon={Shield} tone="blue" onPress={() => router.push('/auth/sign-in')} />
          </Panel>

          <Text style={{ color: Colors.textFaint, ...Typography.caption, textAlign: 'center', marginTop: Spacing.xl }}>
            RoadSoS mobile 1.0
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
