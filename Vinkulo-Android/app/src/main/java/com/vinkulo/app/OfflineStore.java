package com.vinkulo.app;

import org.json.JSONObject;
import java.nio.charset.StandardCharsets;

// All methods run on the controller's serial executor, never on the UI thread.
final class OfflineStore implements AutoCloseable {
    private static final String CONTEXT_AAD = "vinkulo:offline:context:1";
    final OfflineDatabase database;
    private final OfflineCipher cipher;
    OfflineStore(OfflineDatabase database, OfflineCipher cipher) { this.database = database; this.cipher = cipher; }

    void install(JSONObject grant, String binding, long wall, long elapsed, int boot, long requestDuration) throws Exception {
        long issued = grant.getLong("issuedAt"), expires = grant.getLong("expiresAt");
        if (grant.getInt("protocol") != 1 || grant.getLong("accountId") <= 0 || grant.getLong("communityId") <= 0
                || binding.isEmpty() || boot < 0 || expires <= issued || expires - issued > OfflinePolicy.MAX_AGE
                || requestDuration < 0 || requestDuration >= expires - issued
                || grant.getString("communityName").length() > 160
                || grant.getJSONArray("capabilities").length() != 1
                || !"shell.open".equals(grant.getJSONArray("capabilities").getString(0))) throw new IllegalArgumentException("Invalid grant");
        JSONObject saved = new JSONObject().put("communityName", grant.getString("communityName"))
                .put("scope", OfflinePolicy.digest(grant.getLong("accountId") + ":" + grant.getLong("communityId")))
                .put("binding", binding).put("wall", wall).put("elapsed", elapsed).put("boot", boot)
                .put("duration", expires - issued - requestDuration).put("serverIssuedAt", issued);
        OfflineDatabase.ContextRow row = new OfflineDatabase.ContextRow();
        row.sealed = cipher.seal(saved.toString().getBytes(StandardCharsets.UTF_8), CONTEXT_AAD);
        database.storage().save(row);
    }

    JSONObject read(String binding, long wall, long elapsed, int boot) throws Exception {
        OfflineDatabase.ContextRow row = database.storage().context();
        if (row == null || binding.isEmpty()) return null;
        JSONObject saved = new JSONObject(new String(cipher.open(row.sealed, CONTEXT_AAD), StandardCharsets.UTF_8));
        if (!binding.equals(saved.getString("binding")) || !OfflinePolicy.fresh(wall, elapsed, boot,
                saved.getLong("wall"), saved.getLong("elapsed"), saved.getInt("boot"), saved.getLong("duration"))) return null;
        return saved;
    }

    void lock() { database.storage().lock(); } // Does not erase records or future unsent work.
    @Override public void close() { database.close(); }
}
