package com.vinkulo.app;

import android.content.Context;
import android.os.SystemClock;
import android.provider.Settings;
import android.webkit.CookieManager;
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
import java.io.File;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import static org.junit.Assert.*;
import static org.junit.Assume.assumeTrue;

@RunWith(AndroidJUnit4.class)
public class OfflineReadTest {
    private final Context context = ApplicationProvider.getApplicationContext();
    private OfflineCipher cipher() { return new OfflineCipher("test-vinkulo-offline-read"); }
    private JSONObject section(JSONArray rows) throws Exception {
        return new JSONObject().put("allowed",true).put("hasMore",false).put("items",rows);
    }
    private JSONObject grant() throws Exception {
        JSONObject post=new JSONObject().put("id",1).put("titulo","Aviso offline de teste")
                .put("texto","Texto cifrado disponível sem rede.").put("data","2026-09-27T12:00:00Z").put("autor","Autor de teste");
        JSONObject event=new JSONObject().put("id",2).put("titulo","Encontro offline de teste")
                .put("texto","Evento fictício de homologação").put("data","2026-09-28T12:00:00Z")
                .put("fim",JSONObject.NULL).put("local","Sala teste");
        JSONObject scale=new JSONObject().put("id",3).put("escalaId",4).put("titulo","Escala offline de teste")
                .put("texto","Recepção").put("data","2026-09-28T12:00:00Z").put("fim","2026-09-28T13:00:00Z")
                .put("local","Sala teste").put("ministerio","Equipe teste").put("resposta","PENDENTE");
        JSONObject data=new JSONObject().put("from","2026-09-26T12:00:00Z").put("until","2026-10-27T12:00:00Z")
                .put("mural",section(new JSONArray().put(post))).put("eventos",section(new JSONArray().put(event)))
                .put("compromissos",section(new JSONArray())).put("escalas",section(new JSONArray().put(scale)));
        return new JSONObject().put("protocol",2).put("accountId",11).put("communityId",22).put("communityName","Comunidade de teste")
                .put("issuedAt",1000L).put("expiresAt",601000L)
                .put("capabilities",new JSONArray().put("shell.open").put("snapshot.read")).put("snapshot",data);
    }

    @Test public void encryptedSnapshotSurvivesReopenAndIsAtomicallyReplaced() throws Exception {
        String name="test-read-"+UUID.randomUUID()+".db";
        try {
            try (OfflineStore store=new OfflineStore(OfflineDatabase.open(context,name),cipher())) {
                store.install(grant(),"binding-a",1000,100,1,10);
                assertEquals(1,store.read("binding-a",2000,1100,1).getJSONObject("snapshot").getJSONObject("mural").getJSONArray("items").length());
                String raw=new String(store.database.storage().context().sealed,java.nio.charset.StandardCharsets.UTF_8);
                assertFalse(raw.contains("Aviso offline"));
            }
            try (OfflineStore store=new OfflineStore(OfflineDatabase.open(context,name),cipher())) {
                assertNotNull(store.read("binding-a",2000,1100,1).getJSONObject("snapshot"));
                assertNull(store.read("binding-b",2000,1100,1));
                assertNull(store.read("binding-a",2000,1100,2));
                assertNull(store.read("binding-a",602000,601100,1));
                JSONObject replacement=grant();
                replacement.getJSONObject("snapshot").put("mural",section(new JSONArray()).put("allowed",false));
                replacement.getJSONObject("snapshot").put("escalas",section(new JSONArray()));
                store.install(replacement,"binding-a",2000,1100,1,10);
                JSONObject saved=store.read("binding-a",2001,1101,1).getJSONObject("snapshot");
                assertFalse(saved.getJSONObject("mural").getBoolean("allowed"));
                assertEquals(0,saved.getJSONObject("escalas").getJSONArray("items").length());
                store.install(grant().put("communityId",23),"binding-new-community",3000,2100,1,10);
                assertNull(store.read("binding-a",3001,2101,1));
                store.lock();assertNull(store.read("binding-new-community",3001,2101,1));
            }
        } finally {context.deleteDatabase(name);}
    }

    @Test public void malformedOverQuotaOrOverlongGrantNeverReplacesValidContent() throws Exception {
        String name="test-invalid-read-"+UUID.randomUUID()+".db";
        try (OfflineStore store=new OfflineStore(OfflineDatabase.open(context,name),cipher())) {
            store.install(grant(),"a",1000,100,1,10);
            JSONObject denied=grant();denied.getJSONObject("snapshot").getJSONObject("mural").put("allowed",false);
            JSONObject overCount=grant();JSONArray rows=overCount.getJSONObject("snapshot").getJSONObject("mural").getJSONArray("items");
            for(int i=2;i<=51;i++) rows.put(new JSONObject(rows.getJSONObject(0).toString()).put("id",i));
            JSONObject extra=grant();extra.getJSONObject("snapshot").getJSONObject("mural").getJSONArray("items").getJSONObject(0).put("email","not-allowed");
            JSONObject oversized=grant().put("padding",new String(new char[OfflineSnapshot.MAX_BYTES]).replace('\0','x'));
            for(JSONObject invalid:new JSONObject[]{grant().put("expiresAt",1000L+9*3600000L),denied,overCount,extra,oversized}) {
                try {store.install(invalid,"a",2000,1100,1,10);fail("Accepted invalid read snapshot");}catch(IllegalArgumentException expected) { }
                assertEquals(1000L,store.read("a",2001,1101,1).getLong("serverIssuedAt"));
            }
        } finally {context.deleteDatabase(name);}
    }

    @Test public void readerDisplaysCachedTextOfflineAfterRecreationAndClearsOnSessionChange() throws Exception {
        assumeTrue(WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER));
        UiDevice device=UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());
        if(android.os.Build.VERSION.SDK_INT>=33) device.executeShellCommand("pm grant com.vinkulo.app android.permission.POST_NOTIFICATIONS");
        setCookie("fixture-read-session");
        String binding=OfflinePolicy.digest(OfflinePolicy.sessionCookies(CookieManager.getInstance().getCookie(NativePolicy.ORIGIN)));
        context.getSharedPreferences("offline-lock",Context.MODE_PRIVATE).edit().putBoolean("locked",false).remove("read-consent").commit();
        try {
            try(OfflineStore store=new OfflineStore(OfflineDatabase.open(context,"vinkulo-offline.db"),new OfflineCipher("vinkulo-offline-v1"))) {
                store.install(grant(),binding,System.currentTimeMillis(),SystemClock.elapsedRealtime(),Settings.Global.getInt(context.getContentResolver(),Settings.Global.BOOT_COUNT,-1),10);
            }
            try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)) {
                assertTrue(device.wait(Until.hasObject(By.text("Aparelho preparado")),15000));
                scrollTo(device,"Aviso offline de teste");
                capture(device,"mural");
                scrollTo(device,"Agenda");device.findObject(By.text("Agenda")).click();
                scrollTo(device,"Encontro offline de teste");
                capture(device,"agenda");
                scrollTo(device,"Minhas escalas");device.findObject(By.text("Minhas escalas")).click();
                scrollTo(device,"Escala offline de teste");
                capture(device,"escalas");
                scenario.recreate();
                scrollTo(device,"Aviso offline de teste");
                setCookie("different-session");scenario.recreate();
                assertTrue(device.wait(Until.hasObject(By.text("Preparação necessária")),15000));
                assertFalse(device.hasObject(By.text("Aviso offline de teste")));
            }
        } finally {
            try(OfflineStore store=new OfflineStore(OfflineDatabase.open(context,"vinkulo-offline.db"),new OfflineCipher("vinkulo-offline-v1"))) {store.lock();}
            setCookie("");
        }
    }
    private void setCookie(String value) throws Exception {
        CountDownLatch done=new CountDownLatch(1);
        InstrumentationRegistry.getInstrumentation().runOnMainSync(()->CookieManager.getInstance().setCookie(
                NativePolicy.ORIGIN,"__Host-adote_session="+value+"; Secure; Path=/; SameSite=Lax",ok->done.countDown()));
        assertTrue(done.await(5,TimeUnit.SECONDS));
    }
    private void capture(UiDevice device,String section) throws Exception {
        device.waitForIdle(); SystemClock.sleep(1500);
        // The test runner uninstalls the disposable app after tests. Preserve
        // only synthetic QA screenshots outside its deleted app directory.
        device.executeShellCommand("screencap -p /sdcard/vinkulo-reader-"+section+".png");
        File hierarchy=new File(context.getExternalFilesDir(null),"reader-"+section+".xml");
        device.dumpWindowHierarchy(hierarchy);
        device.executeShellCommand("cp "+hierarchy.getAbsolutePath()+" /sdcard/vinkulo-reader-"+section+".xml");
    }
    private void scrollTo(UiDevice device,String label) throws Exception {
        if(device.wait(Until.hasObject(By.text(label)),3000)) return;
        int x=device.getDisplayWidth()/2, top=device.getDisplayHeight()/3, bottom=device.getDisplayHeight()*4/5;
        for(int i=0;i<8;i++) {device.swipe(x,bottom,x,top,25);if(device.wait(Until.hasObject(By.text(label)),1000))return;}
        for(int i=0;i<8;i++) {device.swipe(x,top,x,bottom,25);if(device.wait(Until.hasObject(By.text(label)),1000))return;}
        device.takeScreenshot(new File(context.getExternalFilesDir(null),"reader-failure.png"));
        device.dumpWindowHierarchy(new File(context.getExternalFilesDir(null),"reader-failure.xml"));
        assertTrue("Missing local reader text: "+label,device.hasObject(By.text(label)));
    }
}
