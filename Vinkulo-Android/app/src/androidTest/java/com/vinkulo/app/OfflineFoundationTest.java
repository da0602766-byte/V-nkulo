package com.vinkulo.app;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;
import android.net.Uri;
import androidx.test.core.app.ActivityScenario;
import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.uiautomator.By;
import androidx.test.uiautomator.UiDevice;
import androidx.test.uiautomator.Until;
import androidx.webkit.WebViewFeature;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.UUID;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class OfflineFoundationTest {
    @org.junit.Before public void allowOfflineFixture() {
        android.content.Context context = androidx.test.core.app.ApplicationProvider.getApplicationContext();
        context.getSharedPreferences("android-global-policy", android.content.Context.MODE_PRIVATE).edit()
            .putBoolean("enabled", true).putLong("confirmed", System.currentTimeMillis()).commit();
    }

    private final Context context = ApplicationProvider.getApplicationContext();
    private String name() { return "test-offline-" + UUID.randomUUID() + ".db"; }
    private OfflineCipher cipher() { return new OfflineCipher("test-vinkulo-offline"); }
    private JSONObject grant() throws Exception {
        return new JSONObject().put("protocol",1).put("accountId",11).put("communityId",22).put("communityName","Comunidade de teste")
                .put("issuedAt",1000L).put("expiresAt",11000L).put("capabilities",new JSONArray().put("shell.open"));
    }

    @Test public void keystoreEncryptionRejectsTamperingAndWrongScope() throws Exception {
        OfflineCipher cipher = cipher(); byte[] clear = "dado privado".getBytes(StandardCharsets.UTF_8);
        byte[] sealed = cipher.seal(clear,"account-a/community-a");
        assertFalse(Arrays.equals(clear,sealed)); assertArrayEquals(clear,cipher.open(sealed,"account-a/community-a"));
        try { cipher.open(sealed,"account-b/community-a"); fail("Scope accepted"); } catch (java.security.GeneralSecurityException expected) { }
        sealed[sealed.length - 1] ^= 1;
        try { cipher.open(sealed,"account-a/community-a"); fail("Tampering accepted"); } catch (java.security.GeneralSecurityException expected) { }
    }

    @Test public void persistedContextExpiresAndNeverFollowsAccountOrCommunityChanges() throws Exception {
        String name = name();
        try {
            try (OfflineStore store = new OfflineStore(OfflineDatabase.open(context,name),cipher())) {
                store.install(grant(),"session-a/community-a",1000,100,3,10);
                assertEquals("Comunidade de teste",store.read("session-a/community-a",2000,1100,3).getString("communityName"));
                assertNull(store.read("session-b/community-a",2000,1100,3));
                assertNull(store.read("session-a/community-b",2000,1100,3));
                assertNull(store.read("session-a/community-a",11000,10100,3));
                assertNull(store.read("session-a/community-a",2000,1100,4));
                assertNull(store.read("session-a/community-a",900,1100,3));
            }
            try (OfflineStore reopened = new OfflineStore(OfflineDatabase.open(context,name),cipher())) {
                assertNotNull(reopened.read("session-a/community-a",2000,1100,3));
                reopened.lock(); assertNull(reopened.read("session-a/community-a",2000,1100,3));
            }
        } finally { context.deleteDatabase(name); }
    }

    @Test public void migrationPreservesCiphertextAndLockDoesNotDeleteRecords() throws Exception {
        String name = name(); byte[] encrypted = cipher().seal("migration".getBytes(StandardCharsets.UTF_8),"fixture");
        try {
            SQLiteDatabase previous = context.openOrCreateDatabase(name,Context.MODE_PRIVATE,null);
            previous.execSQL("CREATE TABLE offline_context (id INTEGER NOT NULL PRIMARY KEY, sealed BLOB NOT NULL)");
            previous.execSQL("INSERT INTO offline_context(id,sealed) VALUES(1,?)",new Object[]{encrypted});
            previous.setVersion(1); previous.close();
            OfflineDatabase database = OfflineDatabase.open(context,name);
            try {
                assertArrayEquals(encrypted,database.storage().context().sealed);
                OfflineDatabase.RecordRow row = new OfflineDatabase.RecordRow(); row.scope="a"; row.recordId="r"; row.sealed=encrypted;
                database.storage().put(row); database.storage().lock();
                assertNull(database.storage().context()); assertArrayEquals(encrypted,database.storage().get("a","r").sealed);
                assertNull(database.storage().get("b","r"));
            } finally { database.close(); }
        } finally { context.deleteDatabase(name); }
    }

    @Test public void invalidGrantCannotExtendAccessOrAddCapabilities() throws Exception {
        String name=name();
        try (OfflineStore store=new OfflineStore(OfflineDatabase.open(context,name),cipher())) {
            for (JSONObject invalid : new JSONObject[]{grant().put("expiresAt",999999999L),grant().put("accountId",0),grant().put("capabilities",new JSONArray().put("users.manage"))}) {
                try { store.install(invalid,"a",1000,100,1,10); fail("Invalid grant accepted"); } catch (IllegalArgumentException expected) { }
            }
            assertNull(store.read("a",2000,1100,1));
        } finally { context.deleteDatabase(name); }
    }

    @Test public void packagedAssetsNeverInterceptApiOrExternalOrigin() {
        OfflineAssets assets = new OfflineAssets(context);
        assertEquals(200,assets.intercept(Uri.parse(OfflinePolicy.HOME)).getStatusCode());
        assertEquals(200,assets.intercept(Uri.parse(OfflinePolicy.CONNECTION_ERROR)).getStatusCode());
        assertEquals(404,assets.intercept(Uri.parse(NativePolicy.ORIGIN+"/mobile-app/unknown.html")).getStatusCode());
        assertEquals(404,assets.intercept(Uri.parse(NativePolicy.ORIGIN+"/mobile-app/%2e%2e/api/mobile/bootstrap")).getStatusCode());
        assertNull(assets.intercept(Uri.parse(NativePolicy.ORIGIN+"/api/mobile/bootstrap")));
        assertNull(assets.intercept(Uri.parse("https://evil.test/mobile-app/index.html")));
    }

    @Test public void localScreenOpensWithoutServerAndSurvivesActivityRecreation() throws Exception {
        UiDevice device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());
        try (ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)) {
            boolean supportsBridge = WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER);
            requireVisible(device,supportsBridge ? "O que você quer fazer?" : "Seu Vínkulo começa aqui.");
            if (android.os.Build.VERSION.SDK_INT >= 35) assertTrue("Modern WebView must exercise the bridge", supportsBridge);
            String expected = supportsBridge ? "Prepare antes de ficar offline" : "Atualize o Android System WebView";
            // Preparation status lives inside the collapsed consultation drawer.
            // Verify the initialized DOM while the task heading stays accessible.
            if (supportsBridge) requireLocalDocument(scenario,expected);
            else assertTrue("Local JavaScript must render a usable state", device.wait(Until.hasObject(By.text(expected)),15000));
            if (!supportsBridge) assertTrue(device.hasObject(By.clazz("android.widget.Button").text("ATUALIZAR WEBVIEW"))
                    || device.hasObject(By.clazz("android.widget.Button").text("Atualizar WebView")));
            for(int repeat=0;repeat<5;repeat++) {
                scenario.recreate();
                if(supportsBridge) requireLocalDocument(scenario,expected);
                else { requireVisible(device,"Seu Vínkulo começa aqui.");requireVisible(device,expected); }
            }
            if(supportsBridge) OfflineUiEvidence.capture(device,"recreated");
        }
    }
    private void requireVisible(UiDevice device,String text) throws Exception {
        if(device.wait(Until.hasObject(By.text(text)),15000)) return;
        OfflineUiEvidence.capture(device,"foundation-failure");
        fail("Missing local screen: "+text);
    }
    private void requireLocalDocument(ActivityScenario<MainActivity> scenario,String expected) throws Exception {
        // The emulator's accessibility tree can be empty after recreation even
        // while the screenshot shows the full page. Assert WebView content via
        // its DOM plus visual-state callback, independently of UiAutomator's
        // cached tree. The reader test still checks actual accessible clicks.
        long deadline=android.os.SystemClock.elapsedRealtime()+15000;
        JSONObject last=null;
        while(android.os.SystemClock.elapsedRealtime()<deadline) {
            java.util.concurrent.CountDownLatch queried=new java.util.concurrent.CountDownLatch(1);
            java.util.concurrent.atomic.AtomicReference<JSONObject> result=new java.util.concurrent.atomic.AtomicReference<>();
            scenario.onActivity(activity->{
                android.webkit.WebView view=activity.findViewById(R.id.webview);
                view.evaluateJavascript("(function(){var h=document.getElementById('home-title'),s=document.getElementById('context-title'),p=document.getElementById('prepare'),r=h&&h.getBoundingClientRect();return JSON.stringify({url:location.href,title:h&&h.textContent,status:s&&s.textContent,ready:document.readyState,button:!!p&&!p.disabled,visible:!document.hidden&&!!r&&r.width>0&&r.height>0&&r.top>=0&&r.bottom<=innerHeight});})()",value->{
                    try {result.set(new JSONObject(new JSONArray("["+value+"]").getString(0)));}catch(Exception ignored) { }
                    queried.countDown();
                });
            });
            queried.await(2,java.util.concurrent.TimeUnit.SECONDS);last=result.get();
            if(last!=null && (OfflinePolicy.HOME+"#top").equals(last.optString("url")) && "complete".equals(last.optString("ready"))
                    && "O que você quer fazer?".equals(last.optString("title")) && expected.equals(last.optString("status"))
                    && last.optBoolean("visible") && last.optBoolean("button")) {
                java.util.concurrent.CountDownLatch drawn=new java.util.concurrent.CountDownLatch(1);
                scenario.onActivity(activity->((android.webkit.WebView)activity.findViewById(R.id.webview)).postVisualStateCallback(1,
                        new android.webkit.WebView.VisualStateCallback(){@Override public void onComplete(long requestId){drawn.countDown();}}));
                assertTrue("Local document not ready to draw",drawn.await(5,java.util.concurrent.TimeUnit.SECONDS));return;
            }
            android.os.SystemClock.sleep(200);
        }
        OfflineUiEvidence.capture(UiDevice.getInstance(InstrumentationRegistry.getInstrumentation()),"foundation-failure");
        fail("Invalid recreated local document: "+String.valueOf(last));
    }
}
