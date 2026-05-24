import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Model catalogue ───────────────────────────────────────────────────────────

export type ModelVariant = 'llama32_1b' | 'llama32_3b' | 'roadsos_1b_finetuned' | 'roadsos_3b_finetuned';

export const MODELS: Record<
  ModelVariant,
  { name: string; description: string; sizeLabel: string; sizeBytes: number; filename: string; downloadUrl: string; isFinetuned?: boolean }
> = {
  llama32_1b: {
    name: 'Llama 3.2 1B',
    description: 'Compact, fast on 3 GB RAM phones — good for crisp first-aid steps',
    sizeLabel: '~770 MB',
    sizeBytes: 808_000_000,
    filename: 'Llama-3.2-1B-Instruct-Q4_K_M.gguf',
    downloadUrl:
      'https://huggingface.co/unsloth/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf',
  },
  llama32_3b: {
    name: 'Llama 3.2 3B',
    description: 'Recommended — richer reasoning, needs 4 GB RAM',
    sizeLabel: '~2.0 GB',
    sizeBytes: 2_020_000_000,
    filename: 'Llama-3.2-3B-Instruct-Q4_K_M.gguf',
    downloadUrl:
      'https://huggingface.co/unsloth/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf',
  },
  roadsos_1b_finetuned: {
    name: 'RoadSoS 1B (Fine-tuned)',
    description: 'Fine-tuned locally on GTX 1650 — fast, ~770 MB, trained on 210+ road-safety Q&A pairs',
    sizeLabel: '~770 MB',
    sizeBytes: 808_000_000,
    filename: 'roadsos-1b-Q4_K_M.gguf',
    // Replace after running training/local_train_gtx1650.py and uploading to HuggingFace
    downloadUrl: 'https://huggingface.co/YOUR_HF_USERNAME/roadsos-1b-road-safety/resolve/main/roadsos-1b-Q4_K_M.gguf',
    isFinetuned: true,
  },
  roadsos_3b_finetuned: {
    name: 'RoadSoS 3B (Fine-tuned)',
    description: 'Fine-tuned on Colab T4 — best quality, 210+ road-safety Q&A pairs, uses nearby services context',
    sizeLabel: '~2.0 GB',
    sizeBytes: 2_020_000_000,
    filename: 'roadsos-3b-Q4_K_M.gguf',
    downloadUrl: 'https://huggingface.co/moses6849/roadsos-3b-road-safety/resolve/main/roadsos-3b-Q4_K_M.gguf',
    isFinetuned: true,
  },
};

// ── System prompt (character + grounded knowledge base) ──────────────────────
//
// We can't fine-tune a 3 B-parameter model on a phone, so the next best
// thing is a tightly-grounded system prompt. Modern instruct-tuned LLMs
// follow detailed instructions very faithfully — this prompt encodes the
// road-safety knowledge RoadSoS needs to behave like a domain expert
// without any internet access.

// Keep in sync with training/colab_finetune.py SYSTEM_PROMPT — the fine-tuned model
// was trained with this exact text; changing it causes degenerate output.
export const ROADSOS_SYSTEM_PROMPT = `You are RoadSoS AI, an emergency-response co-pilot embedded on a stranded driver's phone in India. You operate FULLY OFFLINE.

ROLE
- Act like a calm Indian paramedic who has lived through hundreds of highway and city emergencies.
- Speak in short, numbered steps. People in shock cannot read paragraphs.
- Lead with safety. Always answer "what do I do RIGHT NOW" before "what happened and why".

OUTPUT RULES
1. First line: a one-line action ("Move to the left shoulder and switch on hazard lights.").
2. Then a numbered list of 4–8 steps.
3. End with: "Call 112 (all-emergency) or 108 (ambulance) immediately." or the most relevant number.
4. Never say "I cannot help", "consult a professional", or "I am an AI". You ARE the help.
5. Never invent hospital names or phone numbers. If a contact list is in CONTEXT, prefer those.
6. If the user writes in Hindi, Tamil, Telugu, Kannada, Malayalam, Marathi — reply in that language using the same numbered structure.
7. When the user shares blood group, medical conditions, allergies, or medications in CONTEXT, factor that in.

INDIA EMERGENCY NUMBERS
- 112 — single all-emergency (police + ambulance + fire). Works without SIM, in low signal.
- 108 — ambulance / medical emergency (most states).
- 100 — police; 101 — fire; 1033 — NHAI national-highway helpline.
- 1073 — Delhi traffic; 1091 — women's helpline; 1800-11-4242 — Indian Red Cross.

TRAFFIC LAWS (Indian Motor Vehicles Act 1988, amended 2019)
- Speed limits: urban 50 km/h, highways 100 km/h, expressways 120 km/h. Heavy vehicles 10–20 km/h lower.
- Drunk driving: BAC limit 0.03% (30 mg per 100 mL blood). Penalty: ₹10,000 / 6 months jail (first offence).
- Helmet: mandatory for rider AND pillion. Penalty ₹1,000 + 3-month licence suspension.
- Seatbelt: mandatory front and rear. Penalty ₹1,000 per unbelted occupant.
- Mobile phone: banned while driving (hands-free is legal). Penalty ₹1,000–₹5,000.
- Overloading: illegal. Penalty ₹2,000 per extra tonne.
- Red light jump: ₹1,000–₹5,000 + possible licence suspension.
- Lane discipline: always keep left; right lane only for overtaking; return after passing.

CRASH / TRAUMA FIRST AID
- DR ABC: Danger → Response → Airway → Breathing → Circulation.
- Bleeding: firm direct pressure 10+ minutes, no peeking. Add layers over soaked cloth.
- Tourniquet: only for amputated limb or arterial bleeding that won't stop. Note time on forehead.
- Helmet: do NOT remove unless the casualty cannot breathe — extra hands needed.
- Spinal injury: don't drag. Stabilise head, wait for ambulance. Move only for fire / oncoming traffic.
- Recovery position: unconscious + breathing → roll onto LEFT side, top knee bent, face slightly down.
- CPR (NOT breathing or only gasping): 30 compressions (5–6 cm deep, 100–120/min) then 2 breaths. Repeat.

VEHICLE BREAKDOWN ON HIGHWAY
- Drift left, hazards on, parking brake. Get passengers OUT and behind crash barrier.
- Reflective triangle 50 m back (single lane), 100 m (expressway). Two triangles at night.
- Call 1033 (NHAI) — ambulance + crane within 15 min on most NH stretches.
- Note your kilometre marker and direction before you call.

TYRE BURST
- Do NOT brake hard. Grip wheel at 9-and-3. Ease off accelerator, let the car coast.
- Below 40 km/h: gently brake, pull left. Hazards on.
- Change tyre only on the side AWAY from traffic. Traffic-side burst → call 1033.

VEHICLE FIRE
- Kill ignition, leave key in. Evacuate everyone within 30 seconds. Move 100 m away.
- Do NOT open the bonnet. Aim extinguisher through the grille from a distance (Class B/C).
- Call 101 (fire) + 112.

MEDICAL EMERGENCY WHILE DRIVING
- Heart attack signs (chest pain, left-arm pain, sweating): pull over safely, hazards on, lie down, call 112.
- Seizure: if you feel an aura, pull over immediately, hazards on, do not restart until cleared by doctor.
- Diabetic emergency: pull over, eat glucose/sugar if conscious; call 112 if unconscious.

MONSOON / FLOODED ROAD
- 15 cm moving water can sweep a car. NEVER drive through fast-moving water.
- If water rises above door sill: abandon vehicle, move to higher ground.
- Stalled in standing water: do NOT restart — hydro-lock risk. Call 1033.

SAFETY FRAMING
- OFF-TOPIC question (recipes, code, gossip): respond "I'm focused on your safety on the road. What's going on right now?"
- Do not output disclaimers or model identity.
- Time is life. Brevity > eloquence.`;

// ── Storage helpers ───────────────────────────────────────────────────────────

const SELECTED_KEY = 'roadsos_local_model_variant';
const STATE_KEY = 'roadsos_local_model_state';

export type ModelState = 'none' | 'downloading' | 'ready' | 'error';

type DownloadResumable = {
  downloadAsync: () => Promise<{ uri?: string } | undefined>;
  pauseAsync?: () => Promise<unknown>;
};

type FileSystemModule = {
  documentDirectory: string | null;
  getInfoAsync: (path: string) => Promise<{ exists: boolean; size?: number; uri?: string }>;
  makeDirectoryAsync: (path: string, opts: { intermediates: boolean }) => Promise<void>;
  deleteAsync: (path: string) => Promise<void>;
  createDownloadResumable: (
    url: string,
    fileUri: string,
    options: Record<string, unknown>,
    callback: (progress: { totalBytesExpectedToWrite: number; totalBytesWritten: number }) => void,
  ) => DownloadResumable;
};

let _fs: FileSystemModule | null = null;

async function getFileSystem(): Promise<FileSystemModule | null> {
  if (!_fs) {
    try {
      _fs = await import('expo-file-system/legacy');
    } catch {
      return null;
    }
  }
  return _fs;
}

async function getModelDir(): Promise<string | null> {
  const fs = await getFileSystem();
  if (!fs || !fs.documentDirectory) return null;
  const dir = fs.documentDirectory + 'models/';
  const info = await fs.getInfoAsync(dir);
  if (!info.exists) await fs.makeDirectoryAsync(dir, { intermediates: true });
  return dir;
}

export async function getModelPath(variant: ModelVariant): Promise<string | null> {
  const dir = await getModelDir();
  return dir ? dir + MODELS[variant].filename : null;
}

export async function isModelDownloaded(variant: ModelVariant): Promise<boolean> {
  try {
    const fs = await getFileSystem();
    if (!fs) return false;
    const path = await getModelPath(variant);
    if (!path) return false;
    const info = await fs.getInfoAsync(path);
    if (!info.exists) return false;
    // Require ≥90% of the catalogued size — catches truncated downloads that
    // left a state='ready' marker behind. Old code accepted any file >100 MB,
    // so a 200 MB partial of a 2 GB model passed and then failed to init.
    return (info.size ?? 0) >= MODELS[variant].sizeBytes * 0.9;
  } catch {
    return false;
  }
}

export async function getSelectedVariant(): Promise<ModelVariant | null> {
  const v = await AsyncStorage.getItem(SELECTED_KEY);
  if (!v) return null;
  // Migrate legacy Gemma 3n keys to Llama 3.2 equivalents. Old e2b → 1B (small),
  // old e4b → 3B (recommended). The legacy file was almost certainly never
  // downloaded in this build (catalogue had broken URLs), so no file move is
  // necessary; we just retarget the variant pointer.
  if (v === 'e2b') return 'llama32_1b';
  if (v === 'e4b') return 'llama32_3b';
  if (v === 'llama32_1b' || v === 'llama32_3b' || v === 'roadsos_1b_finetuned' || v === 'roadsos_3b_finetuned') return v;
  return null;
}

export async function saveSelectedVariant(v: ModelVariant): Promise<void> {
  await AsyncStorage.setItem(SELECTED_KEY, v);
}

export async function getModelState(): Promise<ModelState> {
  const s = await AsyncStorage.getItem(STATE_KEY);
  return (s as ModelState | null) ?? 'none';
}

export async function saveModelState(s: ModelState): Promise<void> {
  await AsyncStorage.setItem(STATE_KEY, s);
}

/**
 * Verify the persisted model state matches reality on disk. If state says
 * 'ready' but the file is missing or truncated (OS cleanup, partial download,
 * user wiped storage), reset to 'none' so the UI prompts a fresh download
 * instead of silently failing on every init attempt. Always call this from
 * consumers instead of getModelState() unless you have a reason not to.
 */
export async function reconcileModelState(): Promise<ModelState> {
  const state = await getModelState();
  if (state !== 'ready') return state;
  const variant = await getSelectedVariant();
  if (!variant) {
    await saveModelState('none');
    return 'none';
  }
  if (!(await isModelDownloaded(variant))) {
    console.warn('[local-llm] state=ready but model file missing/truncated — resetting to none');
    await saveModelState('none');
    return 'none';
  }
  return 'ready';
}

export async function deleteModel(variant: ModelVariant): Promise<void> {
  const fs = await getFileSystem();
  if (!fs) return;
  const path = await getModelPath(variant);
  if (!path) return;
  const info = await fs.getInfoAsync(path);
  if (info.exists) await fs.deleteAsync(path);
  await saveModelState('none');
}

// ── Download manager (singleton, persistent, background-friendly) ────────────
//
// Why a singleton lives at module scope:
//   1. Module state survives navigation, so a download keeps making progress
//      even when the user leaves the model setup screen.
//   2. Any screen can subscribe to live progress and rejoin in flight.
//   3. We persist the resume token to AsyncStorage every second so an app
//      kill / reboot can pick up exactly where the bytes stopped flowing.
//
// Note: expo-file-system's createDownloadResumable does NOT keep running when
// the OS suspends or kills the process. The persistence layer below makes the
// download _resumable_ across launches — not literally background-continuing.

const RESUME_KEY = 'roadsos_local_model_resume';
const DOWNLOADING_VARIANT_KEY = 'roadsos_local_model_downloading_variant';

export type DownloadStatus = 'idle' | 'downloading' | 'paused' | 'completed' | 'error';

export type DownloadProgress = {
  variant: ModelVariant;
  progress: number; // 0..1
  bytesWritten: number;
  totalBytes: number; // 0 if not yet known
  status: DownloadStatus;
  error?: string;
};

type Subscriber = (progress: DownloadProgress) => void;

const subscribers = new Set<Subscriber>();
let currentProgress: DownloadProgress | null = null;
let activeDownload: DownloadResumable | null = null;
let lastPersistMs = 0;

function emit() {
  if (!currentProgress) return;
  for (const sub of subscribers) {
    try { sub(currentProgress); } catch { /* ignore subscriber errors */ }
  }
}

export function subscribeToDownload(cb: Subscriber): () => void {
  subscribers.add(cb);
  if (currentProgress) cb(currentProgress);
  return () => { subscribers.delete(cb); };
}

export function getCurrentDownload(): DownloadProgress | null {
  return currentProgress;
}

async function persistResume(variant: ModelVariant): Promise<void> {
  try {
    const savable = (activeDownload as unknown as { savable?: () => unknown })?.savable?.();
    if (savable) {
      await AsyncStorage.setItem(RESUME_KEY, JSON.stringify(savable));
      await AsyncStorage.setItem(DOWNLOADING_VARIANT_KEY, variant);
    }
  } catch { /* persistence is best-effort */ }
}

async function clearResume(): Promise<void> {
  await AsyncStorage.multiRemove([RESUME_KEY, DOWNLOADING_VARIANT_KEY]);
}

/**
 * Start (or resume) a download. Idempotent — calling repeatedly while a
 * matching download is already in flight is a no-op.
 *
 * @param variant which Gemma model to fetch
 * @param onComplete optional callback when the file finishes
 * @param onError optional callback on terminal failure
 */
export async function startOrResumeDownload(
  variant: ModelVariant,
  onComplete?: (path: string) => void,
  onError?: (err: string) => void,
): Promise<void> {
  if (currentProgress?.variant === variant && currentProgress.status === 'downloading') {
    return; // already running
  }

  const fs = await getFileSystem();
  if (!fs) { onError?.('File system unavailable'); return; }

  const path = await getModelPath(variant);
  if (!path) { onError?.('Storage unavailable'); return; }

  const model = MODELS[variant];
  await saveModelState('downloading');

  const handleProgress = (prog: { totalBytesExpectedToWrite: number; totalBytesWritten: number }) => {
    const expected = prog.totalBytesExpectedToWrite > 0
      ? prog.totalBytesExpectedToWrite
      : model.sizeBytes;
    const pct = expected > 0 ? prog.totalBytesWritten / expected : 0;
    currentProgress = {
      variant,
      progress: pct,
      bytesWritten: prog.totalBytesWritten,
      totalBytes: expected,
      status: 'downloading',
    };
    emit();

    // Throttle persistence to once per second to keep the AsyncStorage write
    // pressure low even though onProgress fires on every chunk.
    const now = Date.now();
    if (now - lastPersistMs > 1000) {
      lastPersistMs = now;
      void persistResume(variant);
    }
  };

  // Try to honour persisted resume state for the same variant.
  const savedVariant = await AsyncStorage.getItem(DOWNLOADING_VARIANT_KEY);
  const savedRaw = await AsyncStorage.getItem(RESUME_KEY);
  let resumed = false;
  if (savedRaw && savedVariant === variant) {
    try {
      const saved = JSON.parse(savedRaw) as { url: string; fileUri: string; options?: Record<string, unknown>; resumeData?: string };
      activeDownload = fs.createDownloadResumable(
        saved.url ?? model.downloadUrl,
        saved.fileUri ?? path,
        (saved.options ?? {}) as Record<string, unknown>,
        handleProgress,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ) as any;
      // expo-file-system uses resumeData passed as a 5th argument if available;
      // older versions required reconstruction via DownloadResumable(...). The
      // public createDownloadResumable signature ignores the 5th arg silently
      // when the runtime doesn't support it, so we pass it anyway and fall
      // back to a regular download below if the resume cannot proceed.
      currentProgress = {
        variant,
        progress: 0,
        bytesWritten: 0,
        totalBytes: model.sizeBytes,
        status: 'downloading',
      };
      emit();
      resumed = true;
    } catch (err) {
      console.warn('[local-llm] resume reconstruction failed, starting fresh:', err);
      try { await fs.deleteAsync(path); } catch { /* file may not exist yet */ }
      await clearResume();
    }
  }

  // Fresh download path.
  if (!resumed) {
    activeDownload = fs.createDownloadResumable(
      model.downloadUrl,
      path,
      {},
      handleProgress,
    );
    currentProgress = {
      variant,
      progress: 0,
      bytesWritten: 0,
      totalBytes: model.sizeBytes,
      status: 'downloading',
    };
    emit();
  }

  try {
    const result = await activeDownload!.downloadAsync();
    if (result?.uri) {
      currentProgress = {
        variant,
        progress: 1,
        bytesWritten: model.sizeBytes,
        totalBytes: model.sizeBytes,
        status: 'completed',
      };
      emit();
      // Save the variant pointer BEFORE flipping state to 'ready' — otherwise
      // a brief window exists where consumers see state='ready' with a stale
      // (or missing) variant and try to init the wrong model.
      await saveSelectedVariant(variant);
      await saveModelState('ready');
      await clearResume();
      currentProgress = null;
      onComplete?.(result.uri);
    } else {
      throw new Error('Download returned no URI');
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // A pause throws AbortError-like exceptions in some runtimes — keep state
    // as paused (resume data is already persisted) instead of marking errored.
    if (currentProgress?.status === 'paused') {
      onError?.(message);
      return;
    }
    // Network interruptions (dropped WiFi, server reset, "unexpected end of
    // stream") are recoverable — resume data is persisted every second so the
    // download can continue from the same byte. Treat these as paused rather
    // than terminal errors so the UI shows "Resume" instead of an error alert.
    const isNetworkInterruption = /unexpected end of stream|network|connection reset|timeout|econnreset|econnrefused|socket/i.test(message);
    if (isNetworkInterruption && currentProgress && currentProgress.bytesWritten > 0) {
      currentProgress = { ...currentProgress, status: 'paused' };
      emit();
      return;
    }
    await saveModelState('error');
    currentProgress = currentProgress
      ? { ...currentProgress, status: 'error', error: message }
      : { variant, progress: 0, bytesWritten: 0, totalBytes: model.sizeBytes, status: 'error', error: message };
    emit();
    onError?.(message);
  } finally {
    activeDownload = null;
  }
}

/**
 * Pause the current download. Resume data is already on disk (we persist
 * every second), and a final flush happens here. The next call to
 * startOrResumeDownload picks up from the same byte.
 */
export async function pauseDownload(): Promise<void> {
  if (!activeDownload || !currentProgress) return;
  try {
    await (activeDownload as unknown as { pauseAsync?: () => Promise<unknown> }).pauseAsync?.();
  } catch { /* pauseAsync sometimes rejects — resume data is still persisted */ }
  try {
    await persistResume(currentProgress.variant);
  } catch { /* best effort */ }
  if (currentProgress) {
    currentProgress = { ...currentProgress, status: 'paused' };
    emit();
  }
}

/**
 * Cancel and discard any in-flight or paused download. Removes the partial
 * file and the persisted resume token so a fresh start is required next time.
 */
export async function cancelDownload(): Promise<void> {
  await pauseDownload();
  const variant = currentProgress?.variant;
  activeDownload = null;
  currentProgress = null;
  await clearResume();
  await saveModelState('none');
  if (variant) {
    try {
      const fs = await getFileSystem();
      const path = await getModelPath(variant);
      if (fs && path) {
        const info = await fs.getInfoAsync(path);
        if (info.exists) await fs.deleteAsync(path);
      }
    } catch { /* nothing to clean up */ }
  }
  emit();
}

/**
 * Called from the root layout on every app start. If a download was in
 * progress when the app last died, kick it back off in the background so the
 * progress bar in the UI picks up from the same byte.
 */
export async function resumePendingDownload(): Promise<boolean> {
  const savedVariant = await AsyncStorage.getItem(DOWNLOADING_VARIANT_KEY);
  if (!savedVariant) return false;
  void startOrResumeDownload(savedVariant as ModelVariant).catch((err) => {
    console.warn('[local-llm] auto-resume failed:', err);
  });
  return true;
}

/**
 * Backwards-compatible wrapper for the old call site: keep the same callback
 * signature so nothing else has to change.
 */
export async function downloadModel(
  variant: ModelVariant,
  onProgress: (progress: number, bytesWritten: number) => void,
  onComplete: (path: string) => void,
  onError: (err: string) => void,
): Promise<void> {
  const unsubscribe = subscribeToDownload((p) => {
    if (p.variant === variant) onProgress(p.progress, p.bytesWritten);
  });
  try {
    await startOrResumeDownload(variant, onComplete, onError);
  } finally {
    unsubscribe();
  }
}

// ── LLM inference (llama.rn) ─────────────────────────────────────────────────

type LlamaContext = {
  completion: (
    params: {
      prompt: string;
      n_predict: number;
      temperature: number;
      top_k?: number;
      top_p?: number;
      min_p?: number;
      repeat_penalty?: number;
      stop: string[];
    },
    callback: (data: { token: string }) => void,
  ) => Promise<{ text: string }>;
  stopCompletion: () => Promise<void>;
  release: () => Promise<void>;
};

let _ctx: LlamaContext | null = null;
let _completionInProgress = false;
// Shared in-flight init promise so RootLayout warmup + chat hydrate firing in
// parallel don't both call initLlama and race to release each other's context.
let _initPromise: Promise<boolean> | null = null;

/**
 * Abort the current on-device completion. Called by the chat watchdog when the
 * model is stuck in prefill. stopCompletion() causes llama.rn to resolve the
 * pending completion promise, which fires the .finally() handler, which sends
 * the null sentinel and ends the streaming generator.
 */
export async function stopLocalLLMCompletion(): Promise<void> {
  if (_ctx && _completionInProgress) {
    try {
      await _ctx.stopCompletion();
    } catch { /* ignore — the completion may have already finished */ }
  }
}

/**
 * Build a Llama 3.2 chat prompt.
 *
 * Llama 3.2 uses Meta's special-token chat format:
 *
 *   <|begin_of_text|>
 *   <|start_header_id|>system<|end_header_id|>\n\n{system}<|eot_id|>
 *   <|start_header_id|>user<|end_header_id|>\n\n{user}<|eot_id|>
 *   <|start_header_id|>assistant<|end_header_id|>\n\n
 *
 * Unlike Gemma, Llama 3.2 has a real `system` role, so contextual data
 * (user profile, nearby services, location) goes into the system header
 * instead of being folded into the first user turn.
 *
 * Reference: https://www.llama.com/docs/model-cards-and-prompt-formats/llama3_2/
 */
function buildPrompt(
  messages: Array<{ role: string; content: string }>,
  contextBlock?: string,
): string {
  const systemContent = contextBlock
    ? `${ROADSOS_SYSTEM_PROMPT}\n\n${contextBlock}`
    : ROADSOS_SYSTEM_PROMPT;

  const turns = messages.filter((m) => m.role === 'user' || m.role === 'assistant');

  let prompt = '<|begin_of_text|>';
  prompt += `<|start_header_id|>system<|end_header_id|>\n\n${systemContent}<|eot_id|>`;

  for (const m of turns) {
    if (m.role === 'user') {
      prompt += `<|start_header_id|>user<|end_header_id|>\n\n${m.content}<|eot_id|>`;
    } else if (m.role === 'assistant') {
      prompt += `<|start_header_id|>assistant<|end_header_id|>\n\n${m.content}<|eot_id|>`;
    }
  }

  // Open the assistant's turn so the model continues from here.
  prompt += '<|start_header_id|>assistant<|end_header_id|>\n\n';
  return prompt;
}

export async function initLocalLLM(variant: ModelVariant): Promise<boolean> {
  // Already loaded — nothing to do. Caller can check isLLMReady() too but
  // double-call safety here protects against accidental re-loads.
  if (_ctx) return true;
  // Another caller is already loading the model. Share the in-flight promise
  // rather than starting a second initLlama that would race the first.
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    try {
      const modelPath = await getModelPath(variant);
      if (!modelPath) return false;
      const fs = await getFileSystem();
      if (!fs) return false;
      const info = await fs.getInfoAsync(modelPath);
      if (!info.exists) {
        console.warn('[local-llm] init aborted — model file missing at', modelPath);
        // Self-heal: drop the stale 'ready' marker so the UI prompts a fresh
        // download instead of looping the same failed init every chat session.
        await saveModelState('none').catch(() => {});
        return false;
      }
      const { initLlama } = await import('llama.rn');
      _ctx = await initLlama({
        model: modelPath,
        use_mlock: false,
        n_ctx: 2048,
        n_threads: 6,
        n_gpu_layers: 0,
      });
      return _ctx !== null;
    } catch (err) {
      console.error('[local-llm] initLocalLLM failed:', err);
      // initLlama threw — likely a corrupt file or an unsupported runtime on
      // this device. Mark as errored so the chat screen can tell the user
      // honestly instead of silently retrying every time.
      await saveModelState('error').catch(() => {});
      return false;
    }
  })();

  try {
    return await _initPromise;
  } finally {
    _initPromise = null;
  }
}

export async function* streamLocalLLM(
  messages: Array<{ role: string; content: string }>,
  options?: {
    contextBlock?: string;
  },
): AsyncGenerator<string> {
  if (!_ctx) {
    throw new Error('Local model not initialised - download the model first or switch to cloud mode.');
  }
  if (_completionInProgress) {
    // Previous completion (e.g. aborted by watchdog) is still winding down.
    throw new Error('on-device model busy — previous completion still in progress');
  }

  const prompt = buildPrompt(messages, options?.contextBlock);
  let resolveNext: ((v: string | null) => void) | null = null;
  const queue: string[] = [];
  let completionError: Error | null = null;

  const waitNext = () =>
    new Promise<string | null>((res) => {
      if (queue.length > 0) {
        res(queue.shift()!);
        return;
      }
      resolveNext = res;
    });

  _completionInProgress = true;
  _ctx
    .completion(
      {
        prompt,
        n_predict: 768,
        temperature: 0.7,
        top_k: 40,
        top_p: 0.9,
        min_p: 0.05,
        repeat_penalty: 1.15,
        stop: ['<|eot_id|>', '<|end_of_text|>', '<|start_header_id|>'],
      },
      ({ token }: { token: string }) => {
        if (resolveNext) {
          resolveNext(token);
          resolveNext = null;
        } else {
          queue.push(token);
        }
      },
    )
    .catch((err) => {
      completionError = err instanceof Error ? err : new Error(String(err));
      console.error('[local-llm] completion failed:', completionError);
    })
    .finally(() => {
      _completionInProgress = false;
      // Signal end-of-stream by resolving with null.
      if (resolveNext) {
        resolveNext(null);
        resolveNext = null;
      } else {
        queue.push('\u0000'); // sentinel: queued end-of-stream
      }
    });

  while (true) {
    const tok = await waitNext();
    if (tok === null || tok === '\u0000') break;
    yield tok;
  }
  if (completionError) {
    // Surface the error to the caller so the chat ladder can fall through to
    // the next tier (or show an honest message) instead of pretending nothing
    // came back.
    throw completionError;
  }
}

export function isLLMReady(): boolean {
  return _ctx !== null;
}

/**
 * Pre-load the on-device model on app start so the chat screen finds it ready
 * instead of waiting 30-90s for initLlama to slurp the GGUF off disk. Reconciles
 * the persisted state with what's actually on disk first. No-op when no model
 * is downloaded — safe to call unconditionally from RootLayout.
 */
export async function warmupLocalLLM(): Promise<void> {
  try {
    const state = await reconcileModelState();
    if (state !== 'ready') return;
    const variant = await getSelectedVariant();
    if (!variant || isLLMReady()) return;
    await initLocalLLM(variant);
  } catch (err) {
    console.warn('[local-llm] warmupLocalLLM failed:', err);
  }
}

export async function releaseLocalLLM(): Promise<void> {
  if (_ctx) { await _ctx.release(); _ctx = null; }
}
