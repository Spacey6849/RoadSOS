import { useCallback, useState, useRef } from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase'; // used for incident insert only
import { buildSOSMessage, sendSOS } from '../lib/sms';
import { openAppSettings } from '../lib/direct-sms';
import { saveIncident, getUserProfile, getEmergencyContacts } from '../lib/offline-cache';
import { sendLocalNotification } from '../lib/notifications';
import { LocationData, NearbyService, Incident } from '../types';

function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function useSOSFlow() {
  const [isTriggering, setIsTriggering] = useState(false);
  const isTriggeringRef = useRef(false);

  const triggerSOS = useCallback(
    async (
      location: LocationData,
      triggerType: 'auto' | 'manual',
      nearbyServices: NearbyService[]
    ) => {
      if (isTriggeringRef.current) return;
      isTriggeringRef.current = true;
      setIsTriggering(true);

      try {
        const incidentId = generateId();
        const profile = await getUserProfile();
        const contacts = await getEmergencyContacts();
        const userName = profile?.name ?? 'Unknown User';

        if (contacts.length === 0) {
          Alert.alert(
            'No emergency contacts',
            'Add at least one emergency contact in Settings so RoadSoS can send SOS.',
            [{ text: 'OK' }]
          );
          return;
        }

        const message = buildSOSMessage(userName, location, triggerType, profile?.medicalInfo);

        // Best-effort Supabase incident log — never blocks SMS.
        // Use .then(onFulfilled, onRejected) instead of .then().catch() because
        // supabase's PostgrestFilterBuilder is typed as PromiseLike (no .catch).
        supabase.from('incidents').insert({
          id: incidentId,
          user_name: userName,
          blood_group: profile?.bloodGroup,
          trigger_type: triggerType,
          address: location.address,
          country_code: 'IN',
          status: 'active',
        }).then(undefined, () => {});

        const { statuses: smsStatuses, smsPermissionBlocked } = await sendSOS(contacts, message, incidentId, location);

        if (smsPermissionBlocked) {
          Alert.alert(
            'SMS Permission Blocked',
            'RoadSoS cannot send direct SMS because the permission was permanently denied. Open Settings to enable it.',
            [
              { text: 'Not now', style: 'cancel' },
              { text: 'Open Settings', onPress: openAppSettings },
            ],
          );
        }

        const incident: Incident = {
          id: incidentId,
          triggerType,
          location,
          services: nearbyServices.slice(0, 10),
          smsStatuses,
          createdAt: Date.now(),
        };

        await saveIncident(incident);

        const deliveredCount = smsStatuses.filter(s => s.deviceSent || s.backupSent).length;
        const totalCount = smsStatuses.length;
        const triggerLabel = triggerType === 'auto' ? 'Auto Crash Alert' : 'Manual SOS';

        if (deliveredCount > 0) {
          sendLocalNotification(
            `SOS Sent — ${deliveredCount}/${totalCount} delivered`,
            `${triggerLabel} · Location shared with your emergency contacts.`,
            { type: 'sos-acknowledged', incidentId }
          );
        } else {
          sendLocalNotification(
            'SOS Partially Sent',
            `${triggerLabel} · Device SMS unavailable. Backup delivery attempted.`,
            { type: 'sos-warning', incidentId }
          );
        }

        router.push(`/incident/${incidentId}`);
      } finally {
        isTriggeringRef.current = false;
        setIsTriggering(false);
      }
    },
    []
  );

  return { triggerSOS, isTriggering };
}
