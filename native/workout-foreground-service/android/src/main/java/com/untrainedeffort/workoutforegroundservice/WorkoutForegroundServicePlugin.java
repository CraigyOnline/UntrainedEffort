package com.untrainedeffort.workoutforegroundservice;

import android.content.Context;
import android.content.Intent;
import android.os.Build;
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
            boolean useChronometer = Boolean.TRUE.equals(call.getBoolean("useChronometer", false));
            long whenMs = call.getLong("whenMs", 0L);

            Context context = getContext();
            Intent intent = new Intent(context, WorkoutForegroundService.class);
            intent.putExtra("title", title);
            intent.putExtra("body", body);
            intent.putExtra("largeBody", largeBody);
            intent.putExtra("useChronometer", useChronometer);
            intent.putExtra("whenMs", whenMs);

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
