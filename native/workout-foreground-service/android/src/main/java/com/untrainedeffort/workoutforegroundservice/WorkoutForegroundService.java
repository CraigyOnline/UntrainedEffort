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
import android.os.SystemClock;
import android.view.View;
import android.widget.RemoteViews;
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
 * A notification's built-in ticking figure (setUsesChronometer) is used
 * for elapsed time exactly as before, counting *up* from workout start —
 * and, unlike the previous version of this, it now stays in that slot even
 * while resting, since Craig wants elapsed time visible up top at all
 * times. The rest countdown gets its own separate, real Chronometer
 * *widget* instead, embedded in a custom DecoratedCustomViewStyle layout
 * (see buildRestNotification) alongside its own label, since a single
 * notification only has the one built-in ticking slot and that slot is
 * spoken for. The standard header - icon, app name, that elapsed
 * chronometer, expand affordance - keeps rendering above the custom
 * content exactly as it does in every other state; only the content below
 * it changes.
 *
 * The switch back to the standard (non-custom) layout once rest ends
 * happens either because show() is called again with fresh state, or, if
 * nothing calls in for a while, because this service schedules that
 * transition itself (see rescheduleRestEnd/onRestEnded) and fires a
 * separate, audible "rest complete" alert at the same moment. That's the
 * one piece of behavior here that *isn't* purely reactive to show() calls
 * - it exists specifically so the rest-end alert still fires on time even
 * if the JS side doesn't get to run again before it does.
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
    private String currentExerciseLine = "";
    private String currentSetsLine = "";
    private String currentVolumeLine = "";
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
        currentExerciseLine = intent.getStringExtra("currentExerciseLine");
        currentSetsLine = intent.getStringExtra("setsLine");
        currentVolumeLine = intent.getStringExtra("volumeLine");
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
        boolean resting = !currentPaused && currentRestEndsAtMs != null;
        Notification notification = resting ? buildRestNotification() : buildStandardNotification();
        ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
    }

    // Used whenever not resting - running normally (chronometer counting
    // elapsed time up) or paused (no chronometer, a static figure already
    // baked into currentLargeBody by workoutNotification.ts).
    private Notification buildStandardNotification() {
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
        } else {
            builder.setUsesChronometer(true).setChronometerCountDown(false).setWhen(currentElapsedAnchorMs);
        }

        return builder.build();
    }

    // Used while actively resting. A custom layout is the only way to show
    // a live countdown with its own label alongside the elapsed-time
    // chronometer, which Craig wants left visible up top rather than
    // temporarily replaced by the countdown - a single notification only
    // gets one built-in ticking slot (setUsesChronometer), so the
    // countdown here is a real Chronometer *widget* embedded in a custom
    // RemoteViews layout instead, with the elapsed chronometer left on the
    // builder exactly as buildStandardNotification sets it.
    //
    // DecoratedCustomViewStyle draws the standard header (icon, app name,
    // that elapsed chronometer, expand affordance) above whatever content
    // view is supplied, so the layouts here only need the content below
    // that header, not a reimplementation of it.
    private Notification buildRestNotification() {
        // Chronometer's own base is in SystemClock.elapsedRealtime() terms,
        // not wall-clock time - converted here by carrying over the offset
        // between currentRestEndsAtMs and now.
        long restBaseElapsedRealtime =
            SystemClock.elapsedRealtime() + (currentRestEndsAtMs - System.currentTimeMillis());

        RemoteViews collapsed = new RemoteViews(getPackageName(), R.layout.notification_rest_collapsed);
        collapsed.setTextViewText(R.id.notif_title, currentTitle);
        collapsed.setChronometer(R.id.rest_chronometer, restBaseElapsedRealtime, null, true);

        RemoteViews expanded = new RemoteViews(getPackageName(), R.layout.notification_rest_expanded);
        expanded.setTextViewText(R.id.notif_title, currentTitle);
        expanded.setChronometer(R.id.rest_chronometer, restBaseElapsedRealtime, null, true);
        if (currentExerciseLine == null || currentExerciseLine.isEmpty()) {
            expanded.setViewVisibility(R.id.notif_exercise, View.GONE);
        } else {
            expanded.setViewVisibility(R.id.notif_exercise, View.VISIBLE);
            expanded.setTextViewText(R.id.notif_exercise, currentExerciseLine);
        }
        expanded.setTextViewText(R.id.notif_sets, currentSetsLine);
        expanded.setTextViewText(R.id.notif_volume, currentVolumeLine);

        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(resolveSmallIcon())
            .setContentTitle(currentTitle)
            .setContentText(currentBody)
            .setStyle(new NotificationCompat.DecoratedCustomViewStyle())
            .setCustomContentView(collapsed)
            .setCustomBigContentView(expanded)
            .setOngoing(true)
            .setAutoCancel(false)
            .setOnlyAlertOnce(true)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .setContentIntent(buildContentIntent())
            .setUsesChronometer(true)
            .setChronometerCountDown(false)
            .setWhen(currentElapsedAnchorMs)
            .build();
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
