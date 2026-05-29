package com.roadsos.mobile

import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Vibrator
import android.os.VibratorManager
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray

/**
 * React Native bridge for CrashDetectionService.
 *
 * Exposes start/stop/update/hasPendingCrash methods to JS.
 * NativeEventEmitter events ("RoadSoSCrashDetected") are emitted directly by
 * CrashDetectionService via DeviceEventManagerModule when a crash is detected.
 */
class CrashDetectionModule(reactContext: ReactApplicationContext)
    : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = MODULE_NAME

    // Required boilerplate so NativeEventEmitter doesn't log warnings
    @ReactMethod fun addListener(@Suppress("UNUSED_PARAMETER") eventName: String) {}
    @ReactMethod fun removeListeners(@Suppress("UNUSED_PARAMETER") count: Int) {}

    @ReactMethod
    fun startService(mode: String, sensitivity: String, promise: Promise) {
        try {
            val intent = Intent(reactApplicationContext, CrashDetectionService::class.java).apply {
                action = CrashDetectionService.ACTION_START
                putExtra(CrashDetectionService.EXTRA_MODE, mode)
                putExtra(CrashDetectionService.EXTRA_SENSITIVITY, sensitivity)
            }
            startForegroundService(intent)
            promise.resolve(true)
        } catch (e: Throwable) {
            promise.reject("ERR_START", e.message ?: "start failed", e)
        }
    }

    @ReactMethod
    fun stopService(promise: Promise) {
        try {
            val intent = Intent(reactApplicationContext, CrashDetectionService::class.java).apply {
                action = CrashDetectionService.ACTION_STOP
            }
            reactApplicationContext.startService(intent)
            promise.resolve(true)
        } catch (e: Throwable) {
            promise.reject("ERR_STOP", e.message ?: "stop failed", e)
        }
    }

    @ReactMethod
    fun stopVibration(promise: Promise) {
        try {
            // Cancel directly via the system Vibrator — bypasses service IPC so it's
            // instant and works even if the service intent queue is backed up.
            val vibrator: Vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                (reactApplicationContext.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                reactApplicationContext.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
            }
            vibrator.cancel()
            promise.resolve(true)
        } catch (e: Throwable) {
            promise.reject("ERR_VIB", e.message ?: "stop vibration failed", e)
        }
    }

    @ReactMethod
    fun updateConfig(mode: String, sensitivity: String, promise: Promise) {
        try {
            val intent = Intent(reactApplicationContext, CrashDetectionService::class.java).apply {
                action = CrashDetectionService.ACTION_UPDATE
                putExtra(CrashDetectionService.EXTRA_MODE, mode)
                putExtra(CrashDetectionService.EXTRA_SENSITIVITY, sensitivity)
            }
            reactApplicationContext.startService(intent)
            promise.resolve(true)
        } catch (e: Throwable) {
            promise.reject("ERR_UPDATE", e.message ?: "update failed", e)
        }
    }

    /** Stop the running countdown so the auto-SOS does NOT fire. */
    @ReactMethod
    fun cancelCountdown(promise: Promise) {
        try {
            val intent = Intent(reactApplicationContext, CrashDetectionService::class.java).apply {
                action = CrashDetectionService.ACTION_CANCEL_COUNTDOWN
            }
            reactApplicationContext.startService(intent)
            promise.resolve(true)
        } catch (e: Throwable) {
            promise.reject("ERR_CANCEL", e.message ?: "cancel failed", e)
        }
    }

    /** Skip the remaining countdown and fire the SOS immediately. */
    @ReactMethod
    fun sendSosNow(promise: Promise) {
        try {
            val intent = Intent(reactApplicationContext, CrashDetectionService::class.java).apply {
                action = CrashDetectionService.ACTION_SEND_NOW
            }
            reactApplicationContext.startService(intent)
            promise.resolve(true)
        } catch (e: Throwable) {
            promise.reject("ERR_SENDNOW", e.message ?: "send-now failed", e)
        }
    }

    /** Dev/testing only — trigger the full crash flow without a real impact. */
    @ReactMethod
    fun simulateCrash(promise: Promise) {
        try {
            val intent = Intent(reactApplicationContext, CrashDetectionService::class.java).apply {
                action = CrashDetectionService.ACTION_SIMULATE
            }
            reactApplicationContext.startService(intent)
            promise.resolve(true)
        } catch (e: Throwable) {
            promise.reject("ERR_SIMULATE", e.message ?: "simulate failed", e)
        }
    }

    @ReactMethod
    fun storeLocation(lat: Double, lng: Double, address: String, promise: Promise) {
        try {
            reactApplicationContext.getSharedPreferences(CrashDetectionService.PREF_FILE, Context.MODE_PRIVATE)
                .edit()
                .putString(CrashDetectionService.PREF_LOCATION_LAT, lat.toString())
                .putString(CrashDetectionService.PREF_LOCATION_LNG, lng.toString())
                .putString(CrashDetectionService.PREF_LOCATION_ADDR, address)
                .apply()
            promise.resolve(true)
        } catch (e: Throwable) { promise.reject("ERR_STORE", e.message, e) }
    }

    @ReactMethod
    fun storeContacts(phones: ReadableArray, names: ReadableArray, promise: Promise) {
        try {
            val phoneStr = (0 until phones.size()).mapNotNull { phones.getString(it) }.joinToString(",")
            val nameStr  = (0 until names.size()).mapNotNull  { names.getString(it)  }.joinToString(",")
            reactApplicationContext.getSharedPreferences(CrashDetectionService.PREF_FILE, Context.MODE_PRIVATE)
                .edit()
                .putString(CrashDetectionService.PREF_CONTACTS, phoneStr)
                .putString(CrashDetectionService.PREF_CONTACT_NAMES, nameStr)
                .apply()
            promise.resolve(true)
        } catch (e: Throwable) { promise.reject("ERR_STORE", e.message, e) }
    }

    @ReactMethod
    fun storeDeviceId(deviceId: String, promise: Promise) {
        try {
            reactApplicationContext.getSharedPreferences(CrashDetectionService.PREF_FILE, Context.MODE_PRIVATE)
                .edit()
                .putString(CrashDetectionService.PREF_DEVICE_ID, deviceId)
                .apply()
            promise.resolve(true)
        } catch (e: Throwable) { promise.reject("ERR_STORE", e.message, e) }
    }

    @ReactMethod
    fun storeUserName(name: String, promise: Promise) {
        try {
            reactApplicationContext.getSharedPreferences(CrashDetectionService.PREF_FILE, Context.MODE_PRIVATE)
                .edit()
                .putString(CrashDetectionService.PREF_USER_NAME, name)
                .apply()
            promise.resolve(true)
        } catch (e: Throwable) { promise.reject("ERR_STORE", e.message, e) }
    }

    /**
     * Persist blood group + medical info into prefs so the native SOS SMS
     * can include them when fired from a JS-cold-start crash. Pass empty
     * strings to clear individual fields.
     */
    @ReactMethod
    fun storeMedicalInfo(
        bloodGroup: String,
        allergies: String,
        medications: String,
        conditions: String,
        promise: Promise,
    ) {
        try {
            reactApplicationContext.getSharedPreferences(CrashDetectionService.PREF_FILE, Context.MODE_PRIVATE)
                .edit()
                .putString(CrashDetectionService.PREF_BLOOD_GROUP, bloodGroup)
                .putString(CrashDetectionService.PREF_ALLERGIES, allergies)
                .putString(CrashDetectionService.PREF_MEDICATIONS, medications)
                .putString(CrashDetectionService.PREF_CONDITIONS, conditions)
                .apply()
            promise.resolve(true)
        } catch (e: Throwable) { promise.reject("ERR_STORE", e.message, e) }
    }

    /**
     * Check whether the native service detected a crash while JS was not running.
     * Reads + clears SharedPreferences atomically. Discards stale entries (>5 min old).
     */
    @ReactMethod
    fun hasPendingCrash(promise: Promise) {
        try {
            val prefs = reactApplicationContext.getSharedPreferences(
                CrashDetectionService.PREF_FILE, Context.MODE_PRIVATE
            )
            val timestamp = prefs.getLong(CrashDetectionService.PREF_CRASH_TIME, 0L)
            if (timestamp == 0L) {
                promise.resolve(false)
                return
            }
            prefs.edit().remove(CrashDetectionService.PREF_CRASH_TIME).apply()
            val isRecent = System.currentTimeMillis() - timestamp < 5 * 60 * 1000L
            promise.resolve(isRecent)
        } catch (e: Throwable) {
            promise.reject("ERR_PREFS", e.message ?: "prefs read failed", e)
        }
    }

    private fun startForegroundService(intent: Intent) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            reactApplicationContext.startForegroundService(intent)
        } else {
            reactApplicationContext.startService(intent)
        }
    }

    companion object {
        const val MODULE_NAME = "RoadSoSCrashDetection"
    }
}
