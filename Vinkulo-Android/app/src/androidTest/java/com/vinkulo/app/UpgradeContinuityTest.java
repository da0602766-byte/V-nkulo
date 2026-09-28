package com.vinkulo.app;

import android.content.Context;
import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.nio.charset.StandardCharsets;
import static org.junit.Assert.*;

/** Invoked in separate processes before/after adb install -r; fixtures stay in the disposable emulator. */
@RunWith(AndroidJUnit4.class)
public class UpgradeContinuityTest {
    private final Context context = ApplicationProvider.getApplicationContext();
    private static final String PREFS = "stage7-upgrade-evidence";
    private static final String SCOPE = "visitors:" + OfflinePolicy.digest("9701:33");

    @Test public void seedPreviousVersion() throws Exception {
        assertEquals("1.15.0", context.getPackageManager().getPackageInfo(context.getPackageName(), 0).versionName);
        JSONArray expected = new JSONArray();
        try (VisitorAccess access = new VisitorAccess(context)) {
            assertEquals(0, access.database.storage().recordCount());
            JSONObject payload = new JSONObject().put("nomeCompleto", "Teste de atualização")
                .put("telefone", "").put("email", "").put("dataEntrada", "2026-09-27");
            for (String state : new String[]{"DRAFT", "PENDING", "RETRY", "SENDING", "CONFLICT", "CONFIRMED"}) {
                JSONObject row = access.drafts.save(SCOPE, "", payload);
                String id = row.getString("id");
                row.put("state", state).put("leaseId", "previous-process").put("leaseUntil", 1).put("nextAttemptAt", 0);
                access.drafts.put(SCOPE, id, row);
                expected.put(new JSONObject().put("scope", SCOPE).put("id", id).put("state", state)
                    .put("sealedHash", OfflinePolicy.digest(android.util.Base64.encodeToString(access.database.storage().get(SCOPE,id).sealed, android.util.Base64.NO_WRAP))));
            }
            assertTrue(context.getSharedPreferences(PREFS, 0).edit().putString("device",access.device()).commit());
        }
        try (ModuleAccess access = new ModuleAccess(context, "notes")) {
            String scope = "modules:notes:" + OfflinePolicy.digest("9701:33");
            JSONObject row = access.save(scope, "", new JSONObject().put("titulo", "Nota de atualização").put("texto", "Preservar texto cifrado").put("cor", "amarelo"));
            String id = row.getString("id");
            access.enqueue(new JSONObject().put("scope",scope).put("canWrite",true),id);
            expected.put(new JSONObject().put("scope",scope).put("id",id).put("state","PENDING")
                .put("sealedHash",OfflinePolicy.digest(android.util.Base64.encodeToString(access.database.storage().get(scope,id).sealed,android.util.Base64.NO_WRAP))));
        }
        assertTrue(context.getSharedPreferences(PREFS,0).edit().putString("expected",expected.toString()).commit());
    }

    @Test public void verifyUpdatedVersionAndRecovery() throws Exception {
        assertEquals("1.16.0", context.getPackageManager().getPackageInfo(context.getPackageName(),0).versionName);
        JSONArray expected = new JSONArray(context.getSharedPreferences(PREFS,0).getString("expected","[]"));
        assertEquals(7,expected.length());
        try (VisitorAccess access = new VisitorAccess(context)) {
            assertEquals(context.getSharedPreferences(PREFS,0).getString("device",""), access.device());
            assertEquals(7,access.database.storage().recordCount());
            for (int i=0;i<expected.length();i++) {
                JSONObject item=expected.getJSONObject(i);String scope=item.getString("scope"),id=item.getString("id");
                byte[] sealed=access.database.storage().get(scope,id).sealed;
                assertEquals(item.getString("sealedHash"),OfflinePolicy.digest(android.util.Base64.encodeToString(sealed,android.util.Base64.NO_WRAP)));
                JSONObject row=access.drafts.get(scope,id);
                assertEquals(id,row.getString("id"));assertEquals(item.getString("state"),row.getString("state"));
                assertFalse(new String(sealed,StandardCharsets.UTF_8).contains("atualização"));
                assertNull(access.drafts.get("visitors:"+OfflinePolicy.digest("9702:33"),id));
            }
            // Recovery acts on a copy in a separate test scope so repeat process launches
            // can re-assert byte-for-byte preservation of the original upgrade fixtures.
            String recovery="stage7-recovery";
            for(int i=0;i<expected.length();i++) {
                JSONObject item=expected.getJSONObject(i);
                if(!"SENDING".equals(item.getString("state")))continue;
                JSONObject old=access.drafts.get(item.getString("scope"),item.getString("id"));
                String id=old.getString("id");access.drafts.put(recovery,id,old);
                JSONObject claimed=access.drafts.claim(recovery,System.currentTimeMillis());
                assertEquals(id,claimed.getString("id"));assertNotEquals(old.getString("leaseId"),claimed.getString("leaseId"));
                assertFalse(access.drafts.finish(recovery,new JSONObject(old.toString()).put("state","CONFIRMED")));
                assertTrue(access.drafts.finish(recovery,claimed.put("state","CONFIRMED")));
                assertEquals("CONFIRMED",access.drafts.get(recovery,id).getString("state"));
                access.drafts.discard(recovery,id);
            }
            assertEquals(7,access.database.storage().recordCount());
        }
    }
}
