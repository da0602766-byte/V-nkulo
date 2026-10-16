package com.vinkulo.app;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.SystemClock;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.URL;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import javax.net.ssl.HttpsURLConnection;

/** Device-wide owner policy; contains no account data or credentials. */
final class RemoteOfflinePolicy {
    private final Activity activity;
    private final Runnable changed;
    private final SharedPreferences preferences;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private boolean closed, checking;
    private long lastAttempt, reachableAt;
    private int networkGeneration;

    RemoteOfflinePolicy(Activity activity, Runnable changed) {
        this.activity = activity; this.changed = changed;
        preferences = activity.getSharedPreferences("android-global-policy", Context.MODE_PRIVATE);
    }
    static boolean fresh(boolean enabled, long confirmed, long now) {
        return enabled && confirmed > 0 && now >= confirmed && now - confirmed < 86_400_000L;
    }
    static boolean online(boolean network, boolean androidValidated, boolean serverReachable) {
        return network && (androidValidated || serverReachable);
    }
    boolean enabled() {
        return fresh(preferences.getBoolean("enabled", false), preferences.getLong("confirmed", 0), System.currentTimeMillis());
    }
    boolean checking() { return checking; }
    boolean reachable() { return reachableAt > 0 && SystemClock.elapsedRealtime() - reachableAt < 60_000; }
    void networkChanged() { reachableAt = 0; lastAttempt = 0; networkGeneration++; }
    void check() {
        if (closed || checking || (lastAttempt > 0 && SystemClock.elapsedRealtime() - lastAttempt < 10_000)) return;
        checking = true; lastAttempt = SystemClock.elapsedRealtime();
        final int generation = networkGeneration;
        executor.execute(() -> {
            Boolean enabled = null;
            HttpsURLConnection connection = null;
            try {
                String challenge = OfflinePolicy.digest(UUID.randomUUID().toString());
                connection = (HttpsURLConnection) new URL(NativePolicy.ORIGIN + "/api/mobile/policy?challenge=" + challenge).openConnection();
                connection.setInstanceFollowRedirects(false); connection.setUseCaches(false);
                connection.setConnectTimeout(4000); connection.setReadTimeout(4000);
                connection.setRequestProperty("Cache-Control", "no-cache");
                if (connection.getResponseCode() != 200 || !String.valueOf(connection.getContentType()).startsWith("application/json")) throw new java.io.IOException();
                ByteArrayOutputStream bytes = new ByteArrayOutputStream();
                try (InputStream stream = connection.getInputStream()) {
                    byte[] buffer = new byte[1024]; int count;
                    while ((count = stream.read(buffer)) != -1) {
                        if (bytes.size() + count > 4096) throw new java.io.IOException();
                        bytes.write(buffer, 0, count);
                    }
                }
                JSONObject policy = new JSONObject(bytes.toString("UTF-8"));
                if (policy.getInt("protocol") != 1 || !challenge.equals(policy.getString("challenge"))
                        || !(policy.get("offlineEnabled") instanceof Boolean)) throw new java.io.IOException();
                enabled = policy.getBoolean("offlineEnabled");
            } catch (Exception ignored) { /* A failed request must never change the owner's policy. */ }
            finally { if (connection != null) connection.disconnect(); }
            final Boolean result = enabled;
            activity.runOnUiThread(() -> {
                checking = false;
                if (closed) return;
                if (generation != networkGeneration) { check(); return; }
                if (result != null) {
                    reachableAt = SystemClock.elapsedRealtime();
                    preferences.edit().putBoolean("enabled", result).putLong("confirmed", System.currentTimeMillis()).apply();
                } else reachableAt = 0;
                changed.run();
            });
        });
    }
    void close() { closed = true; executor.shutdownNow(); }
}
