let sound: { stopAsync: () => Promise<unknown>; unloadAsync: () => Promise<unknown> } | null = null;

let beepWavBase64: string | null = null;

function uint8ToBase64(bytes: Uint8Array): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i]!;
    const b1 = i + 1 < len ? bytes[i + 1]! : 0;
    const b2 = i + 2 < len ? bytes[i + 2]! : 0;
    result += chars[b0 >> 2];
    result += chars[((b0 & 0x03) << 4) | (b1 >> 4)];
    result += i + 1 < len ? chars[((b1 & 0x0f) << 2) | (b2 >> 6)] : '=';
    result += i + 2 < len ? chars[b2 & 0x3f] : '=';
  }
  return result;
}

function generateBeepWav(): string {
  const sampleRate = 8000;
  const duration = 0.5;
  const frequency = 880;
  const numSamples = Math.floor(sampleRate * duration);
  const numChannels = 1;
  const bitsPerSample = 8;
  const byteRate = sampleRate * numChannels * bitsPerSample / 8;
  const blockAlign = numChannels * bitsPerSample / 8;
  const dataSize = numSamples * blockAlign;
  const fileSize = 44 + dataSize;

  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  function writeString(offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  writeString(0, 'RIFF');
  view.setUint32(4, fileSize - 8, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  const samples = new Uint8Array(buffer);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const sample = Math.sin(2 * Math.PI * frequency * t);
    const envelope = Math.min(1, Math.min(i / (sampleRate * 0.05), (numSamples - i) / (sampleRate * 0.05)));
    const value = Math.round((sample * envelope * 0.5 + 0.5) * 255);
    samples[44 + i] = Math.max(0, Math.min(255, value));
  }

  return uint8ToBase64(samples);
}

function getBeepWav(): string {
  if (!beepWavBase64) {
    try {
      beepWavBase64 = generateBeepWav();
    } catch (err) {
      if (__DEV__) console.error('[alarm] generateBeepWav failed:', err);
      beepWavBase64 = '';
    }
  }
  return beepWavBase64;
}

export async function playAlarm() {
  await stopAlarm();
  try {
    const { Audio } = await import('expo-av');
    await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
    const b64 = getBeepWav();
    if (!b64) return;
    const { sound: s } = await Audio.Sound.createAsync(
      { uri: `data:audio/wav;base64,${b64}` },
      { isLooping: true, volume: 1.0, shouldPlay: true }
    );
    sound = s;
  } catch (err) {
    if (__DEV__) console.error('[alarm] playAlarm failed:', err);
  }
}

export async function stopAlarm() {
  if (sound) {
    try {
      await sound.stopAsync();
      await sound.unloadAsync();
    } catch {
      // ignore
    }
    sound = null;
  }
}
