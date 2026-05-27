let _N: typeof import('expo-notifications') | null = null;

async function getNotifications() {
  if (_N) return _N;
  try {
    _N = await import('expo-notifications');
    return _N;
  } catch {
    return null;
  }
}

export async function setupNotifications(): Promise<boolean> {
  const N = await getNotifications();
  if (!N) return false;

  try {
    await N.setNotificationChannelAsync('crash-alerts', {
      name: 'Crash Alerts',
      importance: N.AndroidImportance.MAX,
      sound: 'default',
      vibrationPattern: [0, 500, 200, 500],
    });
    await N.setNotificationChannelAsync('sos-alerts', {
      name: 'SOS Alerts',
      importance: N.AndroidImportance.HIGH,
      sound: 'default',
    });

    N.setNotificationHandler({
      handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: true }),
    });

    const { status } = await N.requestPermissionsAsync();
    return status === 'granted';
  } catch (err) {
    if (__DEV__) console.error('[notifications] setupNotifications failed:', err);
    return false;
  }
}

export async function sendLocalNotification(title: string, body: string, data?: Record<string, unknown>) {
  const N = await getNotifications();
  if (!N) return;

  try {
    const content: { title: string; body: string; data?: Record<string, unknown>; sound: boolean } = { title, body, sound: true };
    if (data) content.data = data;
    await N.scheduleNotificationAsync({
      content,
      trigger: null,
    });
  } catch (err) {
    if (__DEV__) console.error('[notifications] sendLocalNotification failed:', err);
  }
}
