package com.untrainedeffort.workoutforegroundservice;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import com.getcapacitor.plugin.util.AssetUtil;

/**
 * Owns the "workout in progress" notification for as long as the workout is
 * active. Running as a real foreground service means this - and the rest of
 * the app process - is protected from the background process reclaiming
 * that a plain WebView timer has no defence against; the elapsed-time figure
 * in particular is rendered by the OS itself (setUsesChronometer/setWhen),
 * so it keeps ticking correctly even if the JS side is asleep.
 *
 * Entirely stateless between calls: every field needed to render the
 * notification is passed in fresh on each show() call from
 * workoutNotification.ts, which remains the single source of truth for the
 * workout's actual data (sets, volume, exercise, pause state). This class
 * only ever formats and posts what it's given.
 */
public class WorkoutForegroundService extends Service {

    static final String CHANNEL_ID = "workout-progress";
    static final int NOTIFICATION_ID = 918273;

    // getIdentifier()-based lookups aren't free; resolved once and reused,
    // since it can't change for the life of the process.
    private int cachedIconResId = 0;

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

        String title = intent.getStringExtra("title");
        String body = intent.getStringExtra("body");
        String largeBody = intent.getStringExtra("largeBody");
        boolean useChronometer = intent.getBooleanExtra("useChronometer", false);
        long whenMs = intent.getLongExtra("whenMs", System.currentTimeMillis());

        Notification notification = buildNotification(title, body, largeBody, useChronometer, whenMs);

        // Called on every single onStartCommand, whether this is the very
        // first post or a later content refresh - repeat calls to an
        // already-foreground service are the documented way to update its
        // notification, and calling it unconditionally here means the
        // "must call startForeground() within 5 seconds of
        // startForegroundService()" requirement is trivially satisfied every
        // time, with no need to reason about whether any particular call is
        // "the first one". ServiceCompat resolves the right overload for the
        // running device itself - no need to branch on SDK_INT here.
        ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);

        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE);
        super.onDestroy();
    }

    private Notification buildNotification(String title, String body, String largeBody, boolean useChronometer, long whenMs) {
        ensureChannel();

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(resolveSmallIcon())
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(largeBody))
            .setOngoing(true)
            .setAutoCancel(false)
            // Content updates (a set logged, exercise changed, the 45s tick)
            // replace this same notification repeatedly; onlyAlertOnce keeps
            // that silent after the first post instead of re-alerting every
            // time.
            .setOnlyAlertOnce(true)
            // Android 12+ otherwise defaults to deferring a foreground
            // service's notification by up to 10 seconds, to avoid flicker
            // for services that start and stop quickly. This one doesn't -
            // it should appear the moment the app is backgrounded, not up
            // to 10s later. A no-op on pre-12 devices.
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .setContentIntent(buildContentIntent())
            .setUsesChronometer(useChronometer);

        if (useChronometer) {
            builder.setWhen(whenMs);
        }

        return builder.build();
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

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager notificationManager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (notificationManager == null || notificationManager.getNotificationChannel(CHANNEL_ID) != null) return;

        NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Workout in progress", NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("Reminds you a workout is still running when you leave the app.");
        // Belt-and-braces alongside IMPORTANCE_LOW, which already implies no
        // sound - explicit here so intent isn't left to that inference alone.
        channel.setSound(null, null);
        notificationManager.createNotificationChannel(channel);
    }
}
