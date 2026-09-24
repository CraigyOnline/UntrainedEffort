package com.untrainedeffort.workoutforegroundservice;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import com.getcapacitor.plugin.util.AssetUtil;
import java.util.Objects;

/**
 * Owns the "workout in progress" notification for as long as the workout is
 * active. Running as a real foreground service means this - and the rest of
 * the app process - is protected from the background process reclaiming
 * that a plain WebView timer has no defence against.
 *
 * The single ticking figure a notification can show (setUsesChronometer)
 * does double duty depending on state: it counts *up* from workout start
 * normally, and counts *down* to the rest timer's end while a rest period
 * is active, switching back once it's over - either because show() is
 * called again with fresh state, or, if nothing calls in for a while,
 * because this service schedules that transition itself (see
 * rescheduleRestEnd/onRestEnded) and fires a separate, audible "rest
 * complete" alert at the same moment. That's the one piece of behavior
 * here that *isn't* purely reactive to show() calls - it exists
 * specifically so the rest-end alert still fires on time even if the JS
 * side doesn't get to run again before it does.
 *
 * Everything else is effectively stateless: current* fields just hold the
 * latest content show() was given so postMainNotification() and the
 * rest-end callback both render from one source of truth, but none of it
 * is treated as authoritative beyond the current display - workoutNotification.ts
 * remains the single source of truth for the workout's actual data (sets,
 * volume, exercise, pause state).
 */
public class WorkoutForegroundService extends Service {

    static final String CHANNEL_ID = "workout-progress";
    static final int NOTIFICATION_ID = 918273;
    static final String REST_ALERT_CHANNEL_ID = "rest-complete";
    static final int REST_ALERT_NOTIFICATION_ID = 918274;

    // getIdentifier()-based lookups aren't free; resolved once and reused,
    // since it can't change for the life of the process.
    private int cachedIconResId = 0;

    private final Handler handler = new Handler(Looper.getMainLooper());

    // The rest-end moment currently scheduled natively, kept so a routine
    // refresh reporting the *same* end time (the common case - every
    // refresh while resting reports the same fixed value) doesn't
    // reschedule redundantly, while a genuinely different one (a new rest
    // period, or rest cancelled/paused) correctly replaces it.
    @Nullable
    private Long scheduledRestEndsAtMs = null;

    @Nullable
    private Runnable scheduledRestEndRunnable = null;

    // Latest content, held so both postMainNotification() and the
    // rest-end callback below - which runs with no fresh call from JS -
    // render from the same place.
    private String currentTitle = "";
    private String currentBody = "";
    private String currentLargeBody = "";
    private boolean currentPaused = false;
    private long currentElapsedAnchorMs = System.currentTimeMillis();

    @Nullable
    private Long currentRestEndsAtMs = null;

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) {
            // A sticky restart with nothing to rebuild the notification's
            // content from - there's no saved state here to recover, so
            // don't ask to be restarted again next time either.
            stopSelf();
            return START_NOT_STICKY;
        }

        currentTitle = intent.getStringExtra("title");
        currentBody = intent.getStringExtra("body");
        currentLargeBody = intent.getStringExtra("largeBody");
        currentPaused = intent.getBooleanExtra("paused", false);
        currentElapsedAnchorMs = intent.getLongExtra("elapsedAnchorMs", System.currentTimeMillis());
        boolean resting = intent.getBooleanExtra("resting", false);
        currentRestEndsAtMs = resting ? intent.getLongExtra("restEndsAtMs", 0L) : null;

        rescheduleRestEnd(currentRestEndsAtMs);
        postMainNotification();

        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        if (scheduledRestEndRunnable != null) {
            handler.removeCallbacks(scheduledRestEndRunnable);
            scheduledRestEndRunnable = null;
        }
        NotificationManager notificationManager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (notificationManager != null) {
            // A lingering "tap to get back to your workout" alert is
            // meaningless once the workout it refers to no longer exists.
            notificationManager.cancel(REST_ALERT_NOTIFICATION_ID);
        }
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE);
        super.onDestroy();
    }

    // Schedules onRestEnded() to fire natively at restEndsAtMs, cancelling
    // whatever was previously scheduled first. A no-op when the incoming
    // value matches what's already scheduled - which is every routine
    // content refresh while a single rest period runs its course, since
    // endsAt is fixed once a rest timer starts.
    private void rescheduleRestEnd(@Nullable Long restEndsAtMs) {
        if (Objects.equals(restEndsAtMs, scheduledRestEndsAtMs)) return;

        if (scheduledRestEndRunnable != null) {
            handler.removeCallbacks(scheduledRestEndRunnable);
            scheduledRestEndRunnable = null;
        }
        scheduledRestEndsAtMs = restEndsAtMs;
        if (restEndsAtMs == null) return;

        long delayMs = restEndsAtMs - System.currentTimeMillis();
        if (delayMs <= 0) return; // already elapsed by the time this was processed

        scheduledRestEndRunnable = this::onRestEnded;
        handler.postDelayed(scheduledRestEndRunnable, delayMs);
    }

    // Fires with no fresh call from JS - this is the whole point of
    // scheduling it natively rather than with a JS-side timer, which
    // would be exactly as unreliable in the background as the old
    // elapsed-time approach was.
    private void onRestEnded() {
        scheduledRestEndsAtMs = null;
        scheduledRestEndRunnable = null;
        currentRestEndsAtMs = null; // falls the chronometer back to counting elapsed time up
        postRestCompleteAlert();
        postMainNotification();
    }

    private void postMainNotification() {
        ensureMainChannel();

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(resolveSmallIcon())
            .setContentTitle(currentTitle)
            .setContentText(currentBody)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(currentLargeBody))
            .setOngoing(true)
            .setAutoCancel(false)
            // Content updates (a set logged, exercise changed, the 45s
            // tick) replace this same notification repeatedly;
            // onlyAlertOnce keeps that silent after the first post instead
            // of re-alerting every time.
            .setOnlyAlertOnce(true)
            // Android 12+ otherwise defaults to deferring a foreground
            // service's notification by up to 10 seconds, to avoid
            // flicker for services that start and stop quickly. This one
            // doesn't - it should appear the moment the app is
            // backgrounded, not up to 10s later. A no-op on pre-12
            // devices.
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .setContentIntent(buildContentIntent());

        if (currentPaused) {
            builder.setUsesChronometer(false);
        } else if (currentRestEndsAtMs != null) {
            builder.setUsesChronometer(true).setChronometerCountDown(true).setWhen(currentRestEndsAtMs);
        } else {
            builder.setUsesChronometer(true).setChronometerCountDown(false).setWhen(currentElapsedAnchorMs);
        }

        ServiceCompat.startForeground(this, NOTIFICATION_ID, builder.build(), ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
    }

    // A separate, dismissable, audible alert - distinct from the silent
    // ongoing notification above, which stays exactly as unobtrusive as
    // before. Content is deliberately generic rather than pulled from
    // currentBody/currentLargeBody: this fires from native state alone,
    // with no guarantee JS has run recently enough for those to still be
    // fully current.
    private void postRestCompleteAlert() {
        ensureRestAlertChannel();

        Notification notification = new NotificationCompat.Builder(this, REST_ALERT_CHANNEL_ID)
            .setSmallIcon(resolveSmallIcon())
            .setContentTitle("Rest complete")
            .setContentText("Tap to get back to your workout.")
            .setAutoCancel(true)
            .setContentIntent(buildContentIntent())
            .build();

        NotificationManager notificationManager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (notificationManager != null) {
            notificationManager.notify(REST_ALERT_NOTIFICATION_ID, notification);
        }
    }

    private PendingIntent buildContentIntent() {
        Intent launchIntent = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (launchIntent == null) return null;

        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        launchIntent.putExtra(WorkoutForegroundServicePlugin.TAP_EXTRA, true);

        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            piFlags |= PendingIntent.FLAG_MUTABLE;
        }
        return PendingIntent.getActivity(this, NOTIFICATION_ID, launchIntent, piFlags);
    }

    private int resolveSmallIcon() {
        if (cachedIconResId == 0) {
            int iconResId = AssetUtil.getResourceID(getApplicationContext(), "ic_launcher", "mipmap");
            cachedIconResId = iconResId != 0 ? iconResId : android.R.drawable.ic_dialog_info;
        }
        return cachedIconResId;
    }

    private void ensureMainChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager notificationManager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (notificationManager == null || notificationManager.getNotificationChannel(CHANNEL_ID) != null) return;

        NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Workout in progress", NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("Reminds you a workout is still running when you leave the app.");
        // Belt-and-braces alongside IMPORTANCE_LOW, which already implies
        // no sound - explicit here so intent isn't left to that inference
        // alone.
        channel.setSound(null, null);
        notificationManager.createNotificationChannel(channel);
    }

    private void ensureRestAlertChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager notificationManager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (notificationManager == null || notificationManager.getNotificationChannel(REST_ALERT_CHANNEL_ID) != null) return;

        // HIGH + vibration, deliberately distinct from the main channel's
        // silence: this is the one moment meant to actually get noticed.
        // No explicit setSound() - leaving it unset means the system's
        // own default notification sound plays, which is all this needs.
        NotificationChannel channel = new NotificationChannel(REST_ALERT_CHANNEL_ID, "Rest complete", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Alerts you when a rest timer between sets finishes.");
        channel.enableVibration(true);
        notificationManager.createNotificationChannel(channel);
    }
}
