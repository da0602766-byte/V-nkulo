package com.vinkulo.app;

import android.content.Context;
import android.os.SystemClock;
import android.provider.Settings;
import android.webkit.CookieManager;
import androidx.test.core.app.ActivityScenario;
import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.uiautomator.UiDevice;
import androidx.webkit.WebViewFeature;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.util.UUID;
import java.nio.charset.StandardCharsets;
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

    private JSONObject requestsGrant() throws Exception {
        JSONObject value=grant().put("protocol",3);
        value.getJSONObject("snapshot").put("pedidos",section(new JSONArray().put(new JSONObject()
            .put("id",71).put("titulo","Meu pedido offline de teste").put("texto","Texto pessoal cifrado")
            .put("tipo","ORACAO").put("status","ABERTA").put("data","2026-09-27T12:00:00Z").put("atualizado","2026-09-27T12:00:00Z"))));
        return value;
    }
    @Test public void ownRequestsAreEncryptedBoundedAndRemovedByReplacementWithoutAffectingQueuedVisitors() throws Exception {
        String name="test-requests-"+UUID.randomUUID()+".db";
        try(OfflineStore store=new OfflineStore(OfflineDatabase.open(context,name),cipher())) {
            VisitorDrafts drafts=new VisitorDrafts(store.database,cipher());
            drafts.put("visitors:test","pending",new JSONObject().put("state","PENDING"));
            store.install(requestsGrant(),"a",1000,100,1,10);
            assertFalse(new String(store.database.storage().context().sealed,java.nio.charset.StandardCharsets.UTF_8).contains("Texto pessoal"));
            assertEquals(1,store.read("a",2000,1100,1).getJSONObject("snapshot").getJSONObject("pedidos").getJSONArray("items").length());
            JSONObject invalid=requestsGrant();invalid.getJSONObject("snapshot").getJSONObject("pedidos").put("allowed",false);
            try{store.install(invalid,"a",2000,1100,1,10);fail("Denied section retained data");}catch(IllegalArgumentException expected) { }
            invalid=requestsGrant();invalid.getJSONObject("snapshot").getJSONObject("pedidos").getJSONArray("items").getJSONObject(0).put("destinatario","Forbidden");
            try{store.install(invalid,"a",2000,1100,1,10);fail("Unexpected private field");}catch(IllegalArgumentException expected) { }
            JSONObject revoked=requestsGrant();revoked.getJSONObject("snapshot").put("pedidos",section(new JSONArray()).put("allowed",false));
            store.install(revoked,"a",3000,2100,1,10);
            assertEquals(0,store.read("a",3001,2101,1).getJSONObject("snapshot").getJSONObject("pedidos").getJSONArray("items").length());
            store.install(grant(),"a",4000,3100,1,10); // Existing v2 is still accepted.
            assertFalse(store.read("a",4001,3101,1).getJSONObject("snapshot").has("pedidos"));
            store.lock();assertEquals("PENDING",drafts.get("visitors:test","pending").getString("state"));
        }finally{context.deleteDatabase(name);}
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
        setCookie("fixture-read-session");
        String binding=OfflinePolicy.digest(OfflinePolicy.sessionCookies(CookieManager.getInstance().getCookie(NativePolicy.ORIGIN)));
        context.getSharedPreferences("offline-lock",Context.MODE_PRIVATE).edit().putBoolean("locked",false).remove("read-consent").putString("requests-consent",binding).commit();
        try {
            try(OfflineStore store=new OfflineStore(OfflineDatabase.open(context,"vinkulo-offline.db"),new OfflineCipher("vinkulo-offline-v1"))) {
                store.install(requestsGrant(),binding,System.currentTimeMillis(),SystemClock.elapsedRealtime(),Settings.Global.getInt(context.getContentResolver(),Settings.Global.BOOT_COUNT,-1),10);
            }
            try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)) {
                requireReader(scenario,true);
                OfflineUiEvidence.capture(device,"mural");
                tapTab(scenario,device,"agenda","Encontro offline de teste");
                OfflineUiEvidence.capture(device,"agenda");
                tapTab(scenario,device,"escalas","Escala offline de teste");
                OfflineUiEvidence.capture(device,"escalas");
                tapTab(scenario,device,"pedidos","Meu pedido offline de teste");
                OfflineUiEvidence.capture(device,"requests");
                scenario.recreate();
                requireReader(scenario,true);
                OfflineUiEvidence.capture(device,"reader-restored");
                setCookie("different-session");scenario.recreate();
                requireReader(scenario,false);
                OfflineUiEvidence.capture(device,"reader-cleared");
            }
        } finally {
            try(OfflineStore store=new OfflineStore(OfflineDatabase.open(context,"vinkulo-offline.db"),new OfflineCipher("vinkulo-offline-v1"))) {store.lock();}
            setCookie("");
        }
    }
    @Test public void communityThemeIsValidatedEncryptedAndScopedWithItsSnapshot() throws Exception {
        JSONObject colors=new JSONObject();
        for(String key:new String[]{"bg","surface","surface-2","text","muted","line","primary","on-primary","link"})colors.put(key,"#112233");
        JSONObject theme=new JSONObject().put("version",1).put("paletteId","CLASSICO").put("light",colors).put("dark",new JSONObject(colors.toString()));
        String database="test-theme-"+java.util.UUID.randomUUID()+".db";
        try(OfflineStore store=new OfflineStore(OfflineDatabase.open(context,database),new OfflineCipher("test-theme"))) {
            JSONObject themed=requestsGrant().put("theme",theme);
            store.install(themed,"community-a",1000,100,1,1);
            assertEquals("CLASSICO",store.read("community-a",1100,200,1).getJSONObject("theme").getString("paletteId"));
            assertFalse(new String(store.database.storage().context().sealed,StandardCharsets.UTF_8).contains("CLASSICO"));
            assertNull(store.read("community-b",1100,200,1));
            colors.put("primary","url(https://evil.test)");
            try { store.install(themed,"community-a",1000,100,1,1);fail("Unsafe CSS accepted"); } catch(IllegalArgumentException expected) { }
            assertEquals("CLASSICO",store.read("community-a",1100,200,1).getJSONObject("theme").getString("paletteId"));
            store.install(requestsGrant(),"community-a",1000,100,1,1);
            assertFalse(store.read("community-a",1100,200,1).has("theme"));
            store.lock();assertNull(store.read("community-a",1100,200,1));
        }finally{context.deleteDatabase(database);}
    }
    private void setCookie(String value) throws Exception {
        CountDownLatch done=new CountDownLatch(1);
        InstrumentationRegistry.getInstrumentation().runOnMainSync(()->CookieManager.getInstance().setCookie(
                NativePolicy.ORIGIN,"__Host-adote_session="+value+"; Secure; Path=/; SameSite=Lax",ok->done.countDown()));
        assertTrue(done.await(5,TimeUnit.SECONDS));
    }
    private void requireReader(ActivityScenario<MainActivity> scenario,boolean prepared) throws Exception {
        String script="(function(){var r=document.getElementById('reader-content'),i=document.getElementById('items'),s=document.getElementById('context-title');return location.href.split('#')[0]==='"+OfflinePolicy.HOME+"'&&document.readyState==='complete'&&!document.hidden&&!!r&&!!i&&!!s&&"+
            (prepared?"!r.hidden&&s.textContent==='Aparelho preparado'&&i.textContent.indexOf('Aviso offline de teste')>=0":"r.hidden&&s.textContent==='Preparação necessária'&&i.textContent===''" )+";})()";
        requireDom(scenario,script);
        if(prepared)evaluate(scenario,"window.VinkuloNavigation.go('#read-mural');document.getElementById('items').scrollIntoView({block:'center'})");
        awaitDraw(scenario);
    }
    // Some emulator WebViews omit their accessibility tree even while rendering correctly.
    // Locate in the real DOM, then inject a physical tap (not JS click) and assert the result.
    // This does not replace the pending physical-device TalkBack acceptance test.
    private void tapTab(ActivityScenario<MainActivity> scenario,UiDevice device,String tab,String title) throws Exception {
        String id="tab-"+tab;
        evaluate(scenario,"document.getElementById('"+id+"').scrollIntoView({block:'center'})");
        awaitDraw(scenario);
        JSONArray point=new JSONArray(evaluate(scenario,"(function(){var e=document.getElementById('"+id+"'),r=e.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;return [x,y,window.innerWidth,window.innerHeight,document.elementFromPoint(x,y)===e];})()"));
        assertTrue("Tab is not hittable",point.getBoolean(4));
        double x=point.getDouble(0),y=point.getDouble(1),width=point.getDouble(2);
        assertTrue(x>0&&x<width&&y>0&&y<point.getDouble(3));
        int[] position=new int[2];int[] viewWidth={0};
        scenario.onActivity(a->{android.webkit.WebView view=a.findViewById(R.id.webview);view.getLocationOnScreen(position);viewWidth[0]=view.getWidth();});
        double scale=viewWidth[0]/width;
        assertTrue(device.click(position[0]+(int)Math.round(x*scale),position[1]+(int)Math.round(y*scale)));
        requireDom(scenario,"document.getElementById('"+id+"').getAttribute('aria-pressed')==='true'&&document.getElementById('items').textContent.indexOf('"+title+"')>=0");
        evaluate(scenario,"document.getElementById('items').scrollIntoView({block:'center'})");
        awaitDraw(scenario);
    }
    private String evaluate(ActivityScenario<MainActivity> scenario,String script) throws Exception {
        CountDownLatch checked=new CountDownLatch(1);String[] result={null};
        scenario.onActivity(a->((android.webkit.WebView)a.findViewById(R.id.webview)).evaluateJavascript(script,value->{result[0]=value;checked.countDown();}));
        assertTrue("WebView evaluation timed out",checked.await(5,TimeUnit.SECONDS));return result[0];
    }
    private void awaitDraw(ActivityScenario<MainActivity> scenario) throws Exception {
        CountDownLatch drawn=new CountDownLatch(1);
        scenario.onActivity(a->{android.webkit.WebView view=a.findViewById(R.id.webview);
            view.postVisualStateCallback(2,new android.webkit.WebView.VisualStateCallback(){@Override public void onComplete(long id){drawn.countDown();}});
        });assertTrue("WebView did not draw",drawn.await(5,TimeUnit.SECONDS));
    }
    private void requireDom(ActivityScenario<MainActivity> scenario,String script) throws Exception {
        long deadline=SystemClock.elapsedRealtime()+15000;
        while(SystemClock.elapsedRealtime()<deadline){
            if("true".equals(evaluate(scenario,script)))return;
            SystemClock.sleep(200);
        }
        OfflineUiEvidence.capture(UiDevice.getInstance(InstrumentationRegistry.getInstrumentation()),"reader-failure");
        fail("Reader DOM did not reach expected state: "+script);
    }
}
