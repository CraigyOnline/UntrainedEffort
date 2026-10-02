package com.untrainedeffort.workoutforegroundservice;

import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import androidx.annotation.Nullable;
import com.getcapacitor.JSObject;
import com.getcapacitor.Logger;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * JS-facing bridge for the workout-in-progress notification. The actual
 * notification (and the process-priority protection that comes with a real
 * foreground service) is owned by WorkoutForegroundService, not by this
 * class or by anything running in the WebView — show() just passes fresh
 * content down to it; the service keeps displaying that content regardless
 * of whether the JS side is still alive to call show() again.
 */
@CapacitorPlugin(name = "WorkoutForegroundService")
public class WorkoutForegroundServicePlugin extends Plugin {

    static final String TAG = "WorkoutForegroundService";
    static final String NOTIFICATION_TAPPED_EVENT = "notificationTapped";

    // Set on the launch/resume intent when the user taps the notification;
    // read here and stripped immediately so it can't be re-handled if the
    // same Intent object is inspected again later.
    static final String TAP_EXTRA = "com.untrainedeffort.workoutforegroundservice.TAPPED";

    // Held so the Ringtone can't be garbage collected mid-play, and so a
    // second rest ending in quick succession cuts the first one off rather
    // than overlapping it.
    @Nullable
    private Ringtone restSound;

    @Override
    public void load() {
        handleTapIntent(getActivity().getIntent());
    }

    // Covers the case where the app is already running (not cold-started)
    // and the user taps the notification again - Capacitor's BridgeActivity
    // forwards onNewIntent to every loaded plugin automatically.
    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        handleTapIntent(intent);
    }

    private void handleTapIntent(Intent intent) {
        if (intent == null || !intent.getBooleanExtra(TAP_EXTRA, false)) {
            return;
        }
        intent.removeExtra(TAP_EXTRA);
        notifyListeners(NOTIFICATION_TAPPED_EVENT, new JSObject());
    }

    @PluginMethod
    public void show(PluginCall call) {
        try {
            String title = call.getString("title", "");
            String body = call.getString("body", "");
            String largeBody = call.getString("largeBody", "");
            boolean paused = Boolean.TRUE.equals(call.getBoolean("paused", false));
            long elapsedAnchorMs = call.getLong("elapsedAnchorMs", 0L);
            boolean resting = Boolean.TRUE.equals(call.getBoolean("resting", false));
            long restEndsAtMs = call.getLong("restEndsAtMs", 0L);
            String currentExerciseLine = call.getString("currentExerciseLine", "");
            String setsLine = call.getString("setsLine", "");
            String volumeLine = call.getString("volumeLine", "");

            Context context = getContext();
            Intent intent = new Intent(context, WorkoutForegroundService.class);
            intent.putExtra("title", title);
            intent.putExtra("body", body);
            intent.putExtra("largeBody", largeBody);
            intent.putExtra("paused", paused);
            intent.putExtra("elapsedAnchorMs", elapsedAnchorMs);
            intent.putExtra("resting", resting);
            intent.putExtra("restEndsAtMs", restEndsAtMs);
            intent.putExtra("currentExerciseLine", currentExerciseLine);
            intent.putExtra("setsLine", setsLine);
            intent.putExtra("volumeLine", volumeLine);

            // Always startForegroundService, even for what's conceptually an
            // "update" to an already-showing notification: the service
            // calls startForeground() again on every single onStartCommand
            // (see WorkoutForegroundService), which is the documented way to
            // refresh an ongoing notification's content, and it sidesteps
            // any question of whether a plain startService() call would be
            // rejected while the app is backgrounded - it's always the one
            // call Android unambiguously allows here.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent);
            } else {
                context.startService(intent);
            }
            call.resolve();
        } catch (Exception exception) {
            Logger.error(TAG, exception.getMessage(), exception);
            call.reject(exception.getMessage());
        }
    }

    // Tells the running service (if there is one - this is a no-op
    // otherwise) that the app is active again, so it clears and stops
    // posting the rest-complete alert. See
    // WorkoutForegroundService.onAppForegrounded.
    @PluginMethod
    public void appForegrounded(PluginCall call) {
        WorkoutForegroundService service = WorkoutForegroundService.getInstance();
        if (service != null) {
            service.onAppForegrounded();
        }
        call.resolve();
    }

    // The in-app counterpart to the rest-complete alert's sound, for when
    // the app is open and that alert is suppressed. Plays the same system
    // default notification sound the alert channel uses, tagged as a
    // notification so it follows the phone's ringer/Do Not Disturb state
    // exactly like the alert does (silent phone = silent here, with the
    // haptic still going). Purely best-effort: any failure just means no
    // sound.
    @PluginMethod
    public void playRestSound(PluginCall call) {
        new Handler(Looper.getMainLooper()).post(() -> {
            try {
                if (restSound != null && restSound.isPlaying()) {
                    restSound.stop();
                }
                Uri uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
                Ringtone ringtone = RingtoneManager.getRingtone(getContext(), uri);
                if (ringtone != null) {
                    ringtone.setAudioAttributes(
                        new AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                            .build()
                    );
                    ringtone.play();
                    restSound = ringtone;
                }
            } catch (RuntimeException e) {
                Logger.warn(TAG, "Could not play rest sound: " + e.getMessage());
            }
        });
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        try {
            Context context = getContext();
            context.stopService(new Intent(context, WorkoutForegroundService.class));
            call.resolve();
        } catch (Exception exception) {
            Logger.error(TAG, exception.getMessage(), exception);
            call.reject(exception.getMessage());
        }
    }
}
