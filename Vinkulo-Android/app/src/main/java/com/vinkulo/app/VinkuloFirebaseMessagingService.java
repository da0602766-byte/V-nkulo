package com.vinkulo.app;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.Context;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.work.Constraints;
import androidx.work.Data;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

/** Data-only messages are accepted only for the current authenticated binding. */
public final class VinkuloFirebaseMessagingService extends FirebaseMessagingService {
    private static final String CHANNEL_ID = "vinkulo_alertas";
    private static final String EXTRA_NOTIFICATION_URL = "vinkulo_notification_url";

    @Override
    public void onMessageReceived(@NonNull RemoteMessage message) {
        String binding = message.getData().get("bindingId");
        String id = message.getData().get("notificationId");
        if (id == null || !id.matches("[1-9][0-9]{0,15}")) return;
        synchronized (FirebaseDeviceState.class) {
            if (!FirebaseDeviceState.accepts(this, binding)) return;
            OneTimeWorkRequest work = new OneTimeWorkRequest.Builder(PushNotificationWorker.class)
                    .setConstraints(new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                    .setInputData(new Data.Builder().putString("binding", binding).putString("id", id).build()).build();
            WorkManager.getInstance(this).enqueueUniqueWork("notification-" + binding + "-" + id, ExistingWorkPolicy.KEEP, work);
        }
    }

    @Override
    public void onNewToken(@NonNull String token) {
        FirebaseDeviceState.updateToken(this, token);
    }

    static void publish(Context context, String binding, String id, NotificationContent content) {
        synchronized (FirebaseDeviceState.class) {
        if (!FirebaseDeviceState.accepts(context, binding) || !content.valid()) return;
        if (Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        NotificationManager manager = (NotificationManager) context.getSystemService(NOTIFICATION_SERVICE);
        if (manager == null || !manager.areNotificationsEnabled()) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            manager.createNotificationChannel(new NotificationChannel(
                    CHANNEL_ID, "Alertas do Vínkulo", NotificationManager.IMPORTANCE_DEFAULT));
        }
        Intent intent = new Intent(context, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        intent.setData(Uri.parse("vinkulo://notification/" + binding + "/" + id));
        intent.putExtra(EXTRA_NOTIFICATION_URL, content.url);
        PendingIntent pending = PendingIntent.getActivity(context, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(com.vinkulo.app.R.drawable.ic_launcher)
                .setContentTitle(content.title)
                .setContentText(content.body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(content.body))
                .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
                .setOnlyAlertOnce(true)
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .setContentIntent(pending);
        manager.notify("vinkulo-notification-" + id, 0, builder.build());
        }
    }
}
