package com.roadsos.mobile

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.telephony.SmsManager
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.ReactContext
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

class CrashDetectionService : Service(), SensorEventListener {

    companion object {
        const val CHANNEL_SERVICE  = "roadsos_service_v2"
        const val CHANNEL_CRASH    = "roadsos_crash_v2"
        const val NOTIF_ID_SERVICE = 2001
        const val NOTIF_ID_CRASH   = 2002

        const val ACTION_START            = "com.roadsos.mobile.CRASH_START"
        const val ACTION_STOP             = "com.roadsos.mobile.CRASH_STOP"
        const val ACTION_UPDATE           = "com.roadsos.mobile.CRASH_UPDATE"
        const val ACTION_STOP_VIBRATION   = "com.roadsos.mobile.CRASH_STOP_VIB"
        const val ACTION_CANCEL_COUNTDOWN = "com.roadsos.mobile.CRASH_CANCEL"
        const val ACTION_SEND_NOW         = "com.roadsos.mobile.CRASH_SEND_NOW"
        const val ACTION_SIMULATE         = "com.roadsos.mobile.CRASH_SIMULATE"

        const val EXTRA_MODE        = "mode"
        const val EXTRA_SENSITIVITY = "sensitivity"

        const val PREF_FILE            = "roadsos_crash_prefs"
        const val PREF_CRASH_TIME      = "pending_crash_time"
        const val PREF_CONTACTS        = "emergency_contacts"
        const val PREF_CONTACT_NAMES   = "emergency_contact_names"
        const val PREF_LOCATION_LAT    = "last_lat"
        const val PREF_LOCATION_LNG    = "last_lng"
        const val PREF_LOCATION_ADDR   = "last_addr"
        const val PREF_USER_NAME       = "user_name"
        const val PREF_BLOOD_GROUP     = "blood_group"
        const val PREF_ALLERGIES       = "allergies"
        const val PREF_MEDICATIONS     = "medications"
        const val PREF_CONDITIONS      = "conditions"
        // Last-known config — restored when Android restarts the sticky
        // service with a null intent (OOM kill / process death).
        private const val PREF_LAST_MODE        = "last_mode"
        private const val PREF_LAST_SENSITIVITY = "last_sensitivity"
        // Single-slot retry queue: if the crash_logs POST fails (network
        // down, RLS error, whatever), we stash the JSON body here and retry
        // the next time the service starts. Newer pending logs overwrite
        // older ones, and anything > 24h old is discarded.
        private const val PREF_PENDING_LOG      = "pending_log_json"
        private const val PREF_PENDING_LOG_TIME = "pending_log_time"
        private const val PENDING_LOG_TTL_MS    = 24 * 60 * 60 * 1000L

        const val EVENT_CRASH_DETECTED = "RoadSoSCrashDetected"

        private const val TAG_LOG = "RoadSoSCrashLog"

        private const val UPDATE_INTERVAL_US  = 50_000   // 20 Hz
        private const val EMA_ALPHA           = 0.08f
        private const val COUNTDOWN_SECONDS   = 15

        private val DRIVE = mapOf(
            "low"    to Triple(25f, 5.0f, 3.5f),
            "medium" to Triple(15f, 4.0f, 3.0f),
            "high"   to Triple(10f, 3.2f, 2.5f),
        )
        private val WALK = mapOf(
            "low"    to 4.0f,
            "medium" to 3.0f,
            "high"   to 2.2f,
        )

        private const val DRIVE_CONFIRM_MS  = 80L
        private const val WALK_CONFIRM_MS   = 150L
        private const val CRASH_COOLDOWN_MS = 30_000L
    }

    // ── Hardware ──────────────────────────────────────────────────────────

    private lateinit var sensorManager: SensorManager
    private var accelerometer: Sensor? = null
    private var vibrator: Vibrator? = null

    // ── Mode ──────────────────────────────────────────────────────────────

    @Volatile private var mode        = "normal"
    @Volatile private var sensitivity = "medium"

    // ── Sensor algorithm state ────────────────────────────────────────────

    private var prevMagG        = 1.0f
    private var emaG            = 1.0f
    private var prevTimestampMs = System.currentTimeMillis()
    private var impactStartMs: Long? = null
    private var lastCrashMs     = 0L
    private var lastGForce      = 0f
    private var lastJerkGs      = 0f

    // ── Countdown state ───────────────────────────────────────────────────

    private val countdownHandler = Handler(Looper.getMainLooper())
    private var countdownRemaining = 0
    @Volatile private var countdownActive = false
    // Set the instant a cancel is requested. Read from inside the background
    // executeSOS() thread to abort the SMS / HTTP calls when a cancel arrives
    // in the millisecond gap between countdown=0 and the network round-trip.
    @Volatile private var cancelled = false

    // Snapshot of the crash impact — captured in dispatchCrash() and reused
    // in executeSOS() / recordOutcome() so both paths report identical g_force
    // and jerk values regardless of subsequent sensor samples.
    @Volatile private var impactGForce = 0f
    @Volatile private var impactJerkGs = 0f

    // ── Lifecycle ─────────────────────────────────────────────────────────

    override fun onCreate() {
        super.onCreate()
        sensorManager = getSystemService(Context.SENSOR_SERVICE) as SensorManager
        accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
        vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            (getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        }
        createNotificationChannels()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                cancelCountdown(recordOutcome = false)
                vibrator?.cancel()
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
                return START_NOT_STICKY
            }
            ACTION_STOP_VIBRATION -> {
                vibrator?.cancel()
                return START_STICKY
            }
            ACTION_CANCEL_COUNTDOWN -> {
                cancelCountdown(recordOutcome = true)
                return START_STICKY
            }
            ACTION_SEND_NOW -> {
                // Skip the rest of the countdown and fire the SOS right now.
                if (countdownActive) {
                    countdownActive = false
                    countdownHandler.removeCallbacksAndMessages(null)
                    executeSOS()
                }
                return START_STICKY
            }
            ACTION_SIMULATE -> {
                // Dev/testing — run the full crash flow without a real impact.
                startForeground(NOTIF_ID_SERVICE, buildServiceNotification())
                if (!countdownActive) dispatchCrash()
                return START_STICKY
            }
            ACTION_UPDATE -> {
                intent.getStringExtra(EXTRA_MODE)?.let        { mode        = it }
                intent.getStringExtra(EXTRA_SENSITIVITY)?.let { sensitivity = it }
                persistConfig()
                startForeground(NOTIF_ID_SERVICE, buildServiceNotification())
                return START_STICKY
            }
            else -> {
                // Real start OR Android-triggered restart with a null intent
                // (OOM-kill recovery). On null intent, fall back to the last
                // mode/sensitivity from prefs instead of resetting to defaults.
                if (intent == null) {
                    restoreConfig()
                } else {
                    intent.getStringExtra(EXTRA_MODE)?.let        { mode        = it }
                    intent.getStringExtra(EXTRA_SENSITIVITY)?.let { sensitivity = it }
                    persistConfig()
                }
            }
        }

        startForeground(NOTIF_ID_SERVICE, buildServiceNotification())

        // No wakeLock: the foreground service (type=health) already gets CPU
        // time per its lifecycle. A multi-hour PARTIAL_WAKE_LOCK on top of
        // that is redundant and trips OEM battery-saver UIs (Xiaomi, OnePlus,
        // One UI) which then offer to kill the app.

        accelerometer?.also { sensor ->
            sensorManager.registerListener(this, sensor, UPDATE_INTERVAL_US)
        }

        // If a crash_log POST failed last session (network down at the
        // moment of impact, process killed mid-flight, RLS hiccup), retry it
        // now that we're back online. Fire-and-forget on its own Thread —
        // failure here just leaves the entry queued for the next start.
        retryPendingLog()

        return START_STICKY
    }

    private fun persistConfig() {
        getSharedPreferences(PREF_FILE, Context.MODE_PRIVATE)
            .edit()
            .putString(PREF_LAST_MODE, mode)
            .putString(PREF_LAST_SENSITIVITY, sensitivity)
            .apply()
    }

    private fun restoreConfig() {
        val prefs = getSharedPreferences(PREF_FILE, Context.MODE_PRIVATE)
        mode        = prefs.getString(PREF_LAST_MODE, mode) ?: mode
        sensitivity = prefs.getString(PREF_LAST_SENSITIVITY, sensitivity) ?: sensitivity
    }

    override fun onDestroy() {
        cancelCountdown(recordOutcome = false)
        sensorManager.unregisterListener(this)
        vibrator?.cancel()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    // ── Sensor callback ───────────────────────────────────────────────────

    override fun onSensorChanged(event: SensorEvent) {
        if (event.sensor.type != Sensor.TYPE_ACCELEROMETER) return

        val x = event.values[0]; val y = event.values[1]; val z = event.values[2]
        val rawMag = sqrt((x * x + y * y + z * z).toDouble()).toFloat()
        val magG   = rawMag / SensorManager.GRAVITY_EARTH

        val now   = System.currentTimeMillis()
        val dtSec = min(max((now - prevTimestampMs) / 1000f, 0.01f), 0.5f)
        prevTimestampMs = now

        emaG = EMA_ALPHA * magG + (1f - EMA_ALPHA) * emaG
        val jerkGs = abs(magG - prevMagG) / dtSec
        prevMagG = magG

        lastGForce  = magG
        lastJerkGs  = jerkGs

        val isCrash = if (mode == "drive") {
            val cfg = DRIVE[sensitivity] ?: DRIVE["medium"]!!
            val ratio = magG / max(emaG, 0.5f)
            magG > cfg.third && ratio > cfg.second && jerkGs > cfg.first
        } else {
            val threshold = WALK[sensitivity] ?: WALK["medium"]!!
            magG > threshold
        }

        val confirmMs = if (mode == "drive") DRIVE_CONFIRM_MS else WALK_CONFIRM_MS

        if (isCrash) {
            val start = impactStartMs
            if (start == null) {
                impactStartMs = now
            } else if (now - start >= confirmMs) {
                if (now - lastCrashMs > CRASH_COOLDOWN_MS) {
                    lastCrashMs   = now
                    impactStartMs = null
                    dispatchCrash()
                }
            }
        } else {
            impactStartMs = null
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

    // ── Crash dispatch ────────────────────────────────────────────────────

    private fun dispatchCrash() {
        // Reset cancel flag and snapshot the impact magnitude so the eventual
        // executeSOS() / outcome-record uses the values at the moment of
        // impact, not whatever the sensor reads N seconds later.
        cancelled    = false
        impactGForce = lastGForce
        impactJerkGs = lastJerkGs

        // Persist timestamp so JS can also pick it up on resume
        getSharedPreferences(PREF_FILE, Context.MODE_PRIVATE)
            .edit()
            .putLong(PREF_CRASH_TIME, System.currentTimeMillis())
            .apply()

        // Emit to JS if React context is alive
        tryEmitToJS()

        // Start repeating vibration
        val pattern = longArrayOf(0, 600, 300)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator?.vibrate(VibrationEffect.createWaveform(pattern, 0))
        } else {
            @Suppress("DEPRECATION")
            vibrator?.vibrate(pattern, 0)
        }

        // Start the native 15-second countdown (handles Supabase + SMS + final notif)
        startCountdown()
    }

    // ── Countdown ─────────────────────────────────────────────────────────

    private fun startCountdown() {
        countdownRemaining = COUNTDOWN_SECONDS
        countdownActive    = true
        showCountdownNotification(countdownRemaining)
        scheduleNextTick()
    }

    private fun scheduleNextTick() {
        countdownHandler.postDelayed({
            if (!countdownActive) return@postDelayed
            countdownRemaining--
            if (countdownRemaining <= 0) {
                countdownActive = false
                executeSOS()
            } else {
                showCountdownNotification(countdownRemaining)
                scheduleNextTick()
            }
        }, 1000L)
    }

    /**
     * @param recordOutcome  When the user explicitly cancelled the countdown
     *   we POST a crash_logs row with outcome='cancelled' so the dashboard
     *   can see false-positive signals (useful for tuning sensitivity).
     *   When the service is being torn down (ACTION_STOP / onDestroy) we
     *   skip the record so we don't spam rows on shutdown.
     */
    private fun cancelCountdown(recordOutcome: Boolean) {
        // Set the flag FIRST so any in-flight executeSOS() background thread
        // sees it before reaching its SMS / HTTP gates.
        cancelled = true
        val wasActive = countdownActive
        countdownActive = false
        countdownHandler.removeCallbacksAndMessages(null)
        vibrator?.cancel()
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.cancel(NOTIF_ID_CRASH)
        showResultNotification("SOS Cancelled", "Crash alert stopped. Stay safe.", false)
        // Only post the cancelled record if a countdown was actually running
        // — otherwise the user tapped Cancel on a non-existent crash.
        if (recordOutcome && wasActive) {
            Thread { sendCrashLogToSupabase(outcome = "cancelled") }.start()
        }
    }

    // ── SOS execution (runs when countdown hits 0) ─────────────────────────

    private fun executeSOS() {
        // Race window: countdownActive=false was set by the tick handler at
        // T-0, but a Cancel intent can land between that and this method.
        // Short-circuit if the user beat us to it.
        if (cancelled) return
        vibrator?.cancel()

        // Run network + SMS on a background thread
        Thread {
            // Re-check at each gate — a Cancel intent during these network
            // calls should still abort downstream side effects.
            if (cancelled) return@Thread
            val logSent = sendCrashLogToSupabase(outcome = "sos_sent")

            if (cancelled) return@Thread
            val smsResult = sendEmergencySMS()

            Handler(Looper.getMainLooper()).post {
                if (cancelled) return@post
                val title = buildResultTitle(logSent, smsResult.anySent)
                val body  = buildResultBody(logSent, smsResult)
                showResultNotification(title, body, true)
            }
        }.start()
    }

    // ── Supabase HTTP ─────────────────────────────────────────────────────

    /**
     * Insert a crash_logs row with the given outcome.
     *  - outcome="sos_sent"  → called from executeSOS() when SOS actually fires
     *  - outcome="cancelled" → called from cancelCountdown() when user dismisses
     *
     * Uses JSONObject (HIGH 6) so backslashes / unicode / control chars in
     * the address are properly escaped instead of producing invalid JSON.
     * Uses UTC timestamps (HIGH 3) so detected_at sorts correctly on the
     * dashboard regardless of the device's local timezone.
     */
    private fun sendCrashLogToSupabase(outcome: String): Boolean {
        val body = buildCrashLogJson(outcome) ?: return false
        val sent = postRawJsonToCrashLogs(body)
        if (!sent) {
            // Queue for retry on next service start. We only keep ONE pending
            // log at a time — if a second crash fails before the first one
            // gets retried, the older one is dropped. Tracking a queue would
            // need a more elaborate storage format and isn't worth it for
            // the hackathon scope.
            queuePendingLog(body)
            if (BuildConfig.DEBUG) Log.w(TAG_LOG, "POST failed, queued for retry (outcome=$outcome)")
        } else if (BuildConfig.DEBUG) {
            Log.i(TAG_LOG, "POST ok (outcome=$outcome)")
        }
        return sent
    }

    private fun buildCrashLogJson(outcome: String): String? {
        return try {
            val prefs = getSharedPreferences(PREF_FILE, Context.MODE_PRIVATE)
            val latRaw = prefs.getString(PREF_LOCATION_LAT, "") ?: ""
            val lngRaw = prefs.getString(PREF_LOCATION_LNG, "") ?: ""
            val addr   = prefs.getString(PREF_LOCATION_ADDR, "") ?: ""
            val hasLoc = isValidCoord(latRaw) && isValidCoord(lngRaw)

            val iso = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US)
                .apply { timeZone = TimeZone.getTimeZone("UTC") }
                .format(Date())

            JSONObject().apply {
                put("mode", mode)
                put("sensitivity", sensitivity)
                // Use the impact-time snapshot, not live sensor values, so the
                // logged g_force reflects the actual crash spike.
                put("g_force", impactGForce.toBigDecimal().toPlainString())
                put("jerk_gs", impactJerkGs.toBigDecimal().toPlainString())
                // null (not 0,0) when there's no GPS fix on record — a 0,0
                // row would pin the crash to the Gulf of Guinea on the map.
                put("latitude", if (hasLoc) latRaw.toDouble() else JSONObject.NULL)
                put("longitude", if (hasLoc) lngRaw.toDouble() else JSONObject.NULL)
                put("address", if (addr.isBlank()) JSONObject.NULL else addr)
                put("device_platform", "android")
                put("detected_at", iso)
                put("outcome", outcome)
            }.toString()
        } catch (e: Exception) {
            if (BuildConfig.DEBUG) Log.e(TAG_LOG, "buildCrashLogJson failed", e)
            null
        }
    }

    private fun postRawJsonToCrashLogs(jsonBody: String): Boolean {
        return try {
            val url  = URL("${BuildConfig.SUPABASE_URL}/rest/v1/crash_logs")
            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "POST"
            conn.setRequestProperty("Content-Type", "application/json")
            conn.setRequestProperty("apikey", BuildConfig.SUPABASE_ANON_KEY)
            conn.setRequestProperty("Authorization", "Bearer ${BuildConfig.SUPABASE_ANON_KEY}")
            conn.setRequestProperty("Prefer", "return=minimal")
            conn.doOutput = true
            conn.connectTimeout = 8_000
            conn.readTimeout    = 8_000
            conn.outputStream.use { it.write(jsonBody.toByteArray(Charsets.UTF_8)) }
            val code = conn.responseCode
            if (BuildConfig.DEBUG && code !in 200..299) {
                Log.w(TAG_LOG, "POST returned HTTP $code")
            }
            conn.disconnect()
            code in 200..299
        } catch (e: Exception) {
            if (BuildConfig.DEBUG) Log.w(TAG_LOG, "POST exception: ${e.message}")
            false
        }
    }

    private fun queuePendingLog(jsonBody: String) {
        getSharedPreferences(PREF_FILE, Context.MODE_PRIVATE)
            .edit()
            .putString(PREF_PENDING_LOG, jsonBody)
            .putLong(PREF_PENDING_LOG_TIME, System.currentTimeMillis())
            .apply()
    }

    /**
     * Retry any single pending crash_log left over from a previous session
     * (network was down, RLS hiccup, process killed mid-flight). Called once
     * on every service start. Best-effort — silently does nothing if nothing
     * is queued or the queued entry is too stale.
     */
    private fun retryPendingLog() {
        val prefs = getSharedPreferences(PREF_FILE, Context.MODE_PRIVATE)
        val json = prefs.getString(PREF_PENDING_LOG, null) ?: return
        val savedAt = prefs.getLong(PREF_PENDING_LOG_TIME, 0L)
        if (System.currentTimeMillis() - savedAt > PENDING_LOG_TTL_MS) {
            prefs.edit().remove(PREF_PENDING_LOG).remove(PREF_PENDING_LOG_TIME).apply()
            if (BuildConfig.DEBUG) Log.i(TAG_LOG, "Discarded pending log (>24h old)")
            return
        }
        Thread {
            if (postRawJsonToCrashLogs(json)) {
                prefs.edit().remove(PREF_PENDING_LOG).remove(PREF_PENDING_LOG_TIME).apply()
                if (BuildConfig.DEBUG) Log.i(TAG_LOG, "Retry of pending log succeeded")
            } else if (BuildConfig.DEBUG) {
                Log.w(TAG_LOG, "Retry of pending log failed; will try again next start")
            }
        }.start()
    }

    // ── Emergency SMS ─────────────────────────────────────────────────────

    /**
     * Per-recipient result so the user can see exactly which contacts got
     * the message and which failed (no more "SMS: no contacts or permission
     * denied" for a single failed recipient).
     */
    data class SmsResult(
        val sent: List<String>,
        val failed: List<Pair<String, String>>, // phone -> reason
        val permissionDenied: Boolean,
        val noContacts: Boolean,
    ) {
        val anySent: Boolean get() = sent.isNotEmpty()
    }

    private fun sendEmergencySMS(): SmsResult {
        val empty = SmsResult(emptyList(), emptyList(), permissionDenied = false, noContacts = true)
        return try {
            val prefs  = getSharedPreferences(PREF_FILE, Context.MODE_PRIVATE)
            val phones = (prefs.getString(PREF_CONTACTS, "") ?: "")
                .split(",").map { it.trim() }.filter { it.isNotBlank() }
            if (phones.isEmpty()) return empty

            // HIGH 5 — fail loudly if SEND_SMS runtime permission isn't granted,
            // instead of relying on the catch block below catching a
            // SecurityException and surfacing a confusing "no contacts" message.
            val permGranted = ContextCompat.checkSelfPermission(this, Manifest.permission.SEND_SMS) ==
                PackageManager.PERMISSION_GRANTED
            if (!permGranted) {
                return SmsResult(emptyList(), emptyList(), permissionDenied = true, noContacts = false)
            }

            val latRaw = prefs.getString(PREF_LOCATION_LAT, "") ?: ""
            val lngRaw = prefs.getString(PREF_LOCATION_LNG, "") ?: ""
            val addr   = prefs.getString(PREF_LOCATION_ADDR, "") ?: ""
            val name   = prefs.getString(PREF_USER_NAME, "RoadSoS User") ?: "RoadSoS User"
            val blood  = prefs.getString(PREF_BLOOD_GROUP, "") ?: ""
            val allerg = prefs.getString(PREF_ALLERGIES, "") ?: ""
            val meds   = prefs.getString(PREF_MEDICATIONS, "") ?: ""
            val conds  = prefs.getString(PREF_CONDITIONS, "") ?: ""
            val hasLoc = isValidCoord(latRaw) && isValidCoord(lngRaw)
            val locStr = when {
                addr.isNotBlank() -> addr
                hasLoc            -> "$latRaw, $lngRaw"
                else              -> "location unavailable — call back immediately"
            }
            val mapLine = if (hasLoc) "\nMap: https://maps.google.com/?q=$latRaw,$lngRaw" else ""

            // MED 10 — include medical info the recipient may need to relay
            // to paramedics. Mirrors the JS-side sms.ts template.
            val medicalLines = buildString {
                if (blood.isNotBlank() || allerg.isNotBlank() || meds.isNotBlank() || conds.isNotBlank()) {
                    append("\n\nMedical Info:")
                    if (blood.isNotBlank())  append("\nBlood Group: $blood")
                    if (allerg.isNotBlank()) append("\nAllergies: $allerg")
                    if (meds.isNotBlank())   append("\nMedications: $meds")
                    if (conds.isNotBlank())  append("\nConditions: $conds")
                }
            }

            val message =
                "🚨 EMERGENCY: $name may need help!\n" +
                "Location: $locStr\n" +
                "Triggered: auto crash detection" + mapLine + medicalLines

            val smsManager: SmsManager = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                getSystemService(SmsManager::class.java)
            } else {
                @Suppress("DEPRECATION")
                SmsManager.getDefault()
            }

            val parts = smsManager.divideMessage(message)
            val sent = mutableListOf<String>()
            val failed = mutableListOf<Pair<String, String>>()
            phones.forEach { phone ->
                try {
                    if (parts.size <= 1) {
                        smsManager.sendTextMessage(phone, null, message, null, null)
                    } else {
                        smsManager.sendMultipartTextMessage(phone, null, parts, null, null)
                    }
                    sent.add(phone)
                } catch (e: Exception) {
                    failed.add(phone to (e.message ?: e.javaClass.simpleName))
                }
            }
            SmsResult(sent, failed, permissionDenied = false, noContacts = false)
        } catch (_: Exception) {
            empty
        }
    }

    /** A stored coordinate is usable only if it parses and isn't the 0,0 default. */
    private fun isValidCoord(raw: String): Boolean {
        val v = raw.toDoubleOrNull() ?: return false
        return v != 0.0
    }

    // ── Notifications ─────────────────────────────────────────────────────

    private fun showCountdownNotification(seconds: Int) {
        val cancelPi = cancelPendingIntent()
        val notif = NotificationCompat.Builder(this, CHANNEL_CRASH)
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setContentTitle("⚠️ Impact detected!")
            .setContentText("Sending SOS in ${seconds}s. Tap Cancel to stop.")
            .setSubText("$seconds")
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setVibrate(longArrayOf(0))
            .setContentIntent(launchPendingIntent())
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Cancel SOS", cancelPi)
            .setFullScreenIntent(launchPendingIntent(), true)
            .build()

        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(NOTIF_ID_CRASH, notif)
    }

    private fun showResultNotification(title: String, body: String, success: Boolean) {
        val icon = if (success) android.R.drawable.ic_dialog_info else android.R.drawable.ic_dialog_alert
        val notif = NotificationCompat.Builder(this, CHANNEL_CRASH)
            .setSmallIcon(icon)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(launchPendingIntent())
            .build()

        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.cancel(NOTIF_ID_CRASH)
        nm.notify(NOTIF_ID_CRASH, notif)
    }

    private fun buildResultTitle(logSent: Boolean, smsSent: Boolean): String = when {
        logSent && smsSent -> "✅ SOS sent!"
        smsSent            -> "📱 SMS sent!"
        logSent            -> "📡 Crash logged!"
        else               -> "⚠️ SOS attempted"
    }

    private fun buildResultBody(logSent: Boolean, smsResult: SmsResult): String {
        val parts = mutableListOf<String>()
        if (logSent)  parts.add("Crash log sent to dashboard")
        else          parts.add("Crash log: offline (check connection)")

        when {
            smsResult.permissionDenied ->
                parts.add("SMS: permission denied — grant SEND_SMS in Settings")
            smsResult.noContacts ->
                parts.add("SMS: no emergency contacts saved")
            smsResult.anySent && smsResult.failed.isEmpty() ->
                parts.add("SMS sent to ${smsResult.sent.size} contact${if (smsResult.sent.size == 1) "" else "s"}")
            smsResult.anySent ->
                parts.add("SMS: ${smsResult.sent.size} sent, ${smsResult.failed.size} failed")
            else ->
                parts.add("SMS: all ${smsResult.failed.size} recipients failed")
        }
        // List each failure briefly so the user knows which numbers to retry by hand.
        if (smsResult.failed.isNotEmpty()) {
            smsResult.failed.take(3).forEach { (phone, reason) ->
                parts.add("  · $phone — $reason")
            }
            if (smsResult.failed.size > 3) parts.add("  · …and ${smsResult.failed.size - 3} more")
        }
        return parts.joinToString("\n")
    }

    private fun buildServiceNotification(): Notification {
        val label = if (mode == "drive") "Drive Mode Active" else "Normal Mode Active"
        return NotificationCompat.Builder(this, CHANNEL_SERVICE)
            .setSmallIcon(android.R.drawable.ic_menu_compass)
            .setContentTitle("RoadSoS")
            .setContentText("$label — crash detection running")
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(launchPendingIntent())
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .build()
    }

    private fun cancelPendingIntent(): PendingIntent {
        val intent = Intent(this, CrashDetectionService::class.java).apply {
            action = ACTION_CANCEL_COUNTDOWN
        }
        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        else PendingIntent.FLAG_UPDATE_CURRENT
        return PendingIntent.getService(this, 1, intent, flags)
    }

    private fun launchPendingIntent(): PendingIntent {
        val intent = packageManager.getLaunchIntentForPackage(packageName)
            ?.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        else PendingIntent.FLAG_UPDATE_CURRENT
        return PendingIntent.getActivity(this, 0, intent, flags)
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.createNotificationChannel(NotificationChannel(
            CHANNEL_SERVICE, "RoadSoS Active", NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "Shown while crash detection is running in the background"
            setShowBadge(false)
        })
        nm.createNotificationChannel(NotificationChannel(
            CHANNEL_CRASH, "Crash Alerts", NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "Fired immediately when an impact is detected"
            enableVibration(false) // vibration handled manually for looping
        })
    }

    // ── JS bridge ─────────────────────────────────────────────────────────

    /**
     * Emit the crash event to JS so the in-app countdown overlay can show.
     *
     * New Architecture (Fabric + bridgeless) uses `ReactHost.currentReactContext`
     * — the legacy `reactNativeHost.reactInstanceManager` is a stub under
     * bridgeless mode and may return null. Try the new path first; fall back
     * to the legacy path so this still works on old-arch builds.
     *
     * Either way the crash flow still completes (SMS + Supabase happen on
     * native), this only affects the in-app overlay.
     */
    private fun tryEmitToJS() {
        val app = applicationContext as? MainApplication ?: return
        val ctx: ReactContext = resolveReactContext(app) ?: return
        try {
            ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                ?.emit(EVENT_CRASH_DETECTED, null)
        } catch (_: Exception) {
            // Catalyst not active, JS thread paused, etc. Lock-screen
            // notification carries the UX from here.
        }
    }

    private fun resolveReactContext(app: MainApplication): ReactContext? {
        // New Architecture path — preferred. The reactHost property is
        // non-null per the MainApplication contract, but accessing
        // currentReactContext before RN finishes initializing returns null.
        try {
            app.reactHost.currentReactContext?.let { return it }
        } catch (_: Throwable) {}
        // Legacy bridge path — still works on old-arch builds.
        try {
            return app.reactNativeHost.reactInstanceManager.currentReactContext
        } catch (_: Throwable) {
            return null
        }
    }
}
