package com.vinkulo.app;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.SystemClock;
import android.provider.Settings;
import android.webkit.CookieManager;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Consumer;
import javax.net.ssl.HttpsURLConnection;

final class OfflineController {
    private final Activity activity;
    private final Runnable changed;
    private final SharedPreferences barriers;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final AtomicLong generation = new AtomicLong();
    private OfflineStore store;
    private volatile boolean blocked, closed, refreshing;
    private volatile String result = "idle";
    private long lastAttempt;

    OfflineController(Activity activity, Runnable changed) {
        this.activity = activity; this.changed = changed;
        barriers = activity.getSharedPreferences("offline-lock", Context.MODE_PRIVATE);
        blocked = barriers.getBoolean("locked", false);
    }
    private OfflineStore store() {
        if (store == null) store = new OfflineStore(OfflineDatabase.open(activity, "vinkulo-offline.db"), new OfflineCipher("vinkulo-offline-v1"));
        return store;
    }
    private String cookies() { return OfflinePolicy.sessionCookies(CookieManager.getInstance().getCookie(NativePolicy.ORIGIN)); }
    private int boot() { return Settings.Global.getInt(activity.getContentResolver(), Settings.Global.BOOT_COUNT, -1); }
    private String binding() { String value = cookies(); return value.isEmpty() ? "" : OfflinePolicy.digest(value); }

    void lock() {
        blocked = true; generation.incrementAndGet(); result = "locked";
        // Persist the barrier before queued database work, including process death.
        if (!barriers.edit().putBoolean("locked", true).remove("read-consent").remove("requests-consent").commit()) result = "storage-error";
        if (closed) return;
        executor.execute(() -> { try { store().lock(); } catch (Exception ignored) { result = "storage-error"; } notifyChanged(); });
    }

    void status(Consumer<JSONObject> callback) {
        if (closed) return;
        final long ticket = generation.get();
        executor.execute(() -> {
            JSONObject state = new JSONObject();
            String requestedBinding = binding();
            try {
                JSONObject saved = blocked ? null : store().read(requestedBinding, System.currentTimeMillis(), SystemClock.elapsedRealtime(), boot());
                if(saved!=null && saved.optJSONObject("snapshot")!=null && saved.getJSONObject("snapshot").has("pedidos")
                    && !requestedBinding.equals(barriers.getString("requests-consent",""))) {
                    saved.getJSONObject("snapshot").put("pedidos",new JSONObject().put("allowed",false).put("hasMore",false).put("items",new org.json.JSONArray()));
                }
                state.put("prepared", saved != null).put("result", result).put("refreshing", refreshing);
                if (saved != null) state.put("communityName", saved.getString("communityName"))
                        .put("preparedAt", saved.getLong("serverIssuedAt"))
                        .put("snapshot", saved.optJSONObject("snapshot"))
                        .put("theme", saved.optJSONObject("theme"))
                        .put("validForMs", Math.max(0, saved.getLong("duration") - (SystemClock.elapsedRealtime() - saved.getLong("elapsed"))));
            } catch (Exception ignored) {
                blocked = true;
                try { state.put("prepared", false).put("result", "storage-error"); } catch (Exception impossible) { }
            }
            activity.runOnUiThread(() -> {
                if (!closed && generation.get() == ticket && requestedBinding.equals(binding())) callback.accept(state);
                else if (!closed) notifyChanged();
            });
        });
    }

    // Native HTTPS only: neither a JS payload nor a cached WebView response can
    // authorize a local context. No redirects, bearer tokens or raw error logs.
    void refresh(boolean explicit) {
        refresh(explicit,false);
    }
    void refresh(boolean explicit, boolean optInRequests) {
        if (closed || refreshing || (!explicit && lastAttempt != 0 && SystemClock.elapsedRealtime() - lastAttempt < 60_000)) return;
        final String requestCookies = cookies();
        if (requestCookies.isEmpty()) { lock(); return; }
        final String requestedBinding = OfflinePolicy.digest(requestCookies);
        final boolean includeRequests = (explicit && optInRequests) || requestedBinding.equals(barriers.getString("requests-consent",""));
        // Operational text is opt-in, tied to this exact session/community.
        if (!explicit && !requestedBinding.equals(barriers.getString("read-consent", ""))) return;
        final long ticket = generation.incrementAndGet();
        lastAttempt = SystemClock.elapsedRealtime(); refreshing = true; result = "refreshing";
        executor.execute(() -> {
            HttpsURLConnection connection = null;
            try {
                long started = SystemClock.elapsedRealtime();
                String challenge = OfflinePolicy.digest(UUID.randomUUID().toString());
                connection = (HttpsURLConnection) new URL(NativePolicy.ORIGIN + "/api/mobile/snapshot").openConnection();
                connection.setInstanceFollowRedirects(false); connection.setConnectTimeout(8000); connection.setReadTimeout(8000);
                connection.setUseCaches(false); connection.setRequestProperty("Cookie", requestCookies);
                connection.setRequestProperty("Origin", NativePolicy.ORIGIN);
                connection.setRequestProperty("X-Vinkulo-Challenge", challenge);
                connection.setRequestProperty("X-Vinkulo-Client", "android-read-3");
                connection.setRequestProperty("X-Vinkulo-Theme", "palette-1");
                if(includeRequests) connection.setRequestProperty("X-Vinkulo-Requests","own");
                int status = connection.getResponseCode();
                if (status == 401 || status == 403) {
                    if (generation.get() == ticket) {
                        blocked = true; barriers.edit().putBoolean("locked", true).remove("read-consent").remove("requests-consent").commit(); store().lock(); result = "locked";
                    }
                    return;
                }
                if (status != 200 || !String.valueOf(connection.getContentType()).startsWith("application/json")) throw new java.io.IOException("Unavailable");
                ByteArrayOutputStream bytes = new ByteArrayOutputStream();
                try (InputStream input = connection.getInputStream()) {
                    byte[] chunk = new byte[2048]; int count;
                    while ((count = input.read(chunk)) != -1) {
                        if (bytes.size() + count > OfflineSnapshot.MAX_BYTES || SystemClock.elapsedRealtime() - started > 16_000) throw new java.io.IOException("Limit");
                        bytes.write(chunk, 0, count);
                    }
                }
                JSONObject grant = new JSONObject(bytes.toString(StandardCharsets.UTF_8.name()));
                if (grant.getInt("protocol") != 3 || !challenge.equals(grant.getString("challenge"))) throw new java.io.IOException("Invalid challenge");
                final boolean requestsAllowed=grant.getJSONObject("snapshot").getJSONObject("pedidos").getBoolean("allowed");
                if(requestsAllowed&&!includeRequests)throw new java.io.IOException("Unexpected scope");
                if (generation.get() != ticket || !requestedBinding.equals(binding())) return;
                store().install(grant, requestedBinding, System.currentTimeMillis(), SystemClock.elapsedRealtime(), boot(), SystemClock.elapsedRealtime() - started);
                activity.runOnUiThread(() -> {
                    if (!closed && generation.get() == ticket && requestedBinding.equals(binding())) {
                        SharedPreferences.Editor edit=barriers.edit().putBoolean("locked", false).putString("read-consent", requestedBinding);
                        if(includeRequests&&requestsAllowed)edit.putString("requests-consent",requestedBinding);else edit.remove("requests-consent");
                        blocked = !edit.commit();
                        result = blocked ? "storage-error" : includeRequests&&!requestsAllowed ? "requests-denied" : "ready"; notifyChanged();
                    }
                });
            } catch (Exception ignored) {
                if (generation.get() == ticket) result = "unavailable";
            } finally {
                if (connection != null) connection.disconnect();
                refreshing = false; notifyChanged();
            }
        });
    }

    private void notifyChanged() { activity.runOnUiThread(() -> { if (!closed) changed.run(); }); }
    void close() {
        closed = true; blocked = true; generation.incrementAndGet();
        executor.execute(() -> { if (store != null) store.close(); }); executor.shutdown();
    }
}
