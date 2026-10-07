package com.vinkulo.app;

import android.content.Context;
import android.os.SystemClock;
import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import javax.net.ssl.HttpsURLConnection;
import org.json.JSONObject;

/** Retries network failures while keeping notification content out of the FCM payload. */
public final class PushNotificationWorker extends Worker {
    public PushNotificationWorker(@NonNull Context context, @NonNull WorkerParameters parameters) { super(context, parameters); }
    @NonNull @Override public Result doWork() {
        Context context = getApplicationContext();
        String binding = getInputData().getString("binding"), id = getInputData().getString("id");
        if (id == null || !id.matches("[1-9][0-9]{0,15}") || !FirebaseDeviceState.accepts(context, binding)) return Result.success();
        HttpsURLConnection connection = null;
        try {
            String cookies = VisitorAccess.cookies();
            if (cookies.isEmpty()) return Result.success();
            connection = (HttpsURLConnection) new URL(NativePolicy.ORIGIN + "/api/push-subscriptions/notification?id=" + id + "&binding=" + binding).openConnection();
            connection.setInstanceFollowRedirects(false); connection.setUseCaches(false);
            connection.setConnectTimeout(5000); connection.setReadTimeout(5000);
            connection.setRequestProperty("Cookie", cookies); connection.setRequestProperty("Accept", "application/json");
            int status = connection.getResponseCode();
            if (status == 401 || status == 403 || status == 404 || status == 400) return Result.success();
            if (status != 200 || !String.valueOf(connection.getContentType()).startsWith("application/json")) return retryOrStop();
            ByteArrayOutputStream bytes = new ByteArrayOutputStream(); long started = SystemClock.elapsedRealtime();
            try (InputStream input = connection.getInputStream()) {
                byte[] chunk = new byte[1024]; int size;
                while ((size = input.read(chunk)) != -1) {
                    if (bytes.size() + size > 8192 || SystemClock.elapsedRealtime() - started > 10000) return retryOrStop();
                    bytes.write(chunk, 0, size);
                }
            }
            JSONObject response = new JSONObject(bytes.toString(StandardCharsets.UTF_8.name()));
            NotificationContent content = new NotificationContent(response.optString("title"), response.optString("body"), response.optString("url"));
            synchronized (FirebaseDeviceState.class) {
                if (cookies.equals(VisitorAccess.cookies())) VinkuloFirebaseMessagingService.publish(context, binding, id, content);
            }
            return Result.success();
        } catch (Exception ignored) { return retryOrStop(); }
        finally { if (connection != null) connection.disconnect(); }
    }
    private Result retryOrStop() { return getRunAttemptCount() < 4 ? Result.retry() : Result.failure(); }
}
