package com.vinkulo.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.os.Build;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

/** Receives FCM notifications without exposing Firebase credentials in the APK. */
public final class VinkuloFirebaseMessagingService extends FirebaseMessagingService {
    private static final String CHANNEL_ID = "vinkulo-updates";
    private static final String EXTRA_NOTIFICATION_URL = "vinkulo_notification_url";

    @Override
    public void onMessageReceived(@NonNull RemoteMessage message) {
        RemoteMessage.Notification notification = message.getNotification();
        String title = notification == null || notification.getTitle() == null
                ? "Vínkulo" : notification.getTitle();
        String body = notification == null || notification.getBody() == null
                ? "Você recebeu uma atualização. Abra o Vínkulo para consultar." : notification.getBody();
        String url = message.getData().get("url");
        showNotification(title, body, url);
    }

    @Override
    public void onNewToken(@NonNull String token) {
        // The token is intentionally not logged. Registration with the Vínkulo API
        // will be added through the authenticated WebView session in the next step.
    }

    private void showNotification(String title, String body, String url) {
        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (manager == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            manager.createNotificationChannel(new NotificationChannel(
                    CHANNEL_ID, "Atualizações do Vínkulo", NotificationManager.IMPORTANCE_DEFAULT));
        }
        Intent intent = new Intent(this, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        if (NativePolicy.notificationPath(url)) intent.putExtra(EXTRA_NOTIFICATION_URL, url);
        PendingIntent pending = PendingIntent.getActivity(this, 1, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(com.vinkulo.app.R.drawable.ic_launcher)
                .setContentTitle(title)
                .setContentText(body)
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .setContentIntent(pending);
        manager.notify((int) (System.currentTimeMillis() & 0x7fffffff), builder.build());
    }
}
