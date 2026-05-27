import { supabase } from './supabase';
import { getUserProfile, saveUserProfile, getEmergencyContacts, saveEmergencyContacts } from './offline-cache';

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  try {
    await syncFromCloud();
  } catch (err) {
    if (__DEV__) console.error('[auth] syncFromCloud failed during signIn:', err);
  }
  return data;
}

export async function signUp(email: string, password: string, name: string) {
  const { data, error } = await supabase.auth.signUp({
    email, password,
    options: { data: { full_name: name } },
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

import type { Session } from '@supabase/supabase-js';

export async function onAuthChange(callback: (event: string, session: Session | null) => void) {
  return supabase.auth.onAuthStateChange(callback);
}

export async function syncToCloud() {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) return;

  const profile = await getUserProfile();
  const contacts = await getEmergencyContacts();

  if (profile) {
    await supabase.from('profiles').upsert({
      id: user.id,
      name: profile.name,
      blood_group: profile.bloodGroup,
      language: profile.language,
      medical_info: profile.medicalInfo ?? {},
      crash_detection_enabled: profile.crashDetectionEnabled,
      crash_sensitivity: profile.crashSensitivity,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
  }

  if (contacts.length > 0) {
    await supabase.from('user_contacts').upsert(
      contacts.map((c: { id: string; name: string; phone: string }) => ({ user_id: user.id, name: c.name, phone: c.phone })),
      { onConflict: 'user_id,phone' }
    );
  }
}

export async function syncFromCloud() {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) return;

  const { data: profileData } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (profileData) {
    const currentProfile = await getUserProfile();
    await saveUserProfile({
      ...currentProfile,
      name: profileData.name ?? currentProfile?.name ?? '',
      bloodGroup: profileData.blood_group ?? currentProfile?.bloodGroup ?? 'O+',
      language: profileData.language ?? currentProfile?.language ?? 'English',
      medicalInfo: profileData.medical_info ?? currentProfile?.medicalInfo ?? { allergies: '', medications: '', conditions: '' },
      crashDetectionEnabled: profileData.crash_detection_enabled ?? currentProfile?.crashDetectionEnabled ?? true,
      crashSensitivity: profileData.crash_sensitivity ?? currentProfile?.crashSensitivity ?? 'medium',
    });
  }

  const { data: contactsData } = await supabase.from('user_contacts').select('*').eq('user_id', user.id);
  if (contactsData && contactsData.length > 0) {
    const cloudContacts = contactsData.map(c => ({ id: c.id, name: c.name, phone: c.phone }));
    const localContacts = await getEmergencyContacts();
    if (localContacts.length === 0) {
      await saveEmergencyContacts(cloudContacts);
    } else {
      const localPhones = new Set(localContacts.map((c: { phone: string }) => c.phone));
      const newContacts = cloudContacts.filter((c: { phone: string }) => !localPhones.has(c.phone));
      if (newContacts.length > 0) {
        await saveEmergencyContacts([...localContacts, ...newContacts]);
      }
    }
  }
}

export async function getCurrentUser() {
  const { data } = await supabase.auth.getUser();
  return data.user;
}
