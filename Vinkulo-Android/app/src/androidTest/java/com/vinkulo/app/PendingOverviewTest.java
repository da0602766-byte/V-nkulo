package com.vinkulo.app;

import android.content.Context;
import android.webkit.CookieManager;
import androidx.test.core.app.ApplicationProvider;
import androidx.test.core.app.ActivityScenario;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.uiautomator.UiDevice;
import androidx.webkit.WebViewFeature;
import org.json.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.util.*;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import static org.junit.Assert.*;
import static org.junit.Assume.assumeTrue;

@RunWith(AndroidJUnit4.class)
public class PendingOverviewTest {
    @org.junit.Before public void allowOfflineFixture() {
        android.content.Context context = androidx.test.core.app.ApplicationProvider.getApplicationContext();
        context.getSharedPreferences("android-global-policy", android.content.Context.MODE_PRIVATE).edit()
            .putBoolean("enabled", true).putLong("confirmed", System.currentTimeMillis()).commit();
    }

    private final Context context=ApplicationProvider.getApplicationContext();
    private static final long USER=8981;
    private void cookies(String value)throws Exception{CountDownLatch done=new CountDownLatch(1);InstrumentationRegistry.getInstrumentation().runOnMainSync(()->CookieManager.getInstance().setCookie(NativePolicy.ORIGIN,"__Host-adote_session="+value+"; Path=/; Secure; HttpOnly",ok->done.countDown()));assertTrue(done.await(5,TimeUnit.SECONDS));}
    private JSONObject grant(ModuleAccess a)throws Exception{long now=System.currentTimeMillis();return new JSONObject().put("protocol",1).put("module",a.module).put("deviceId",a.device()).put("accountId",USER).put("communityId",33).put("communityName","Comunidade de teste").put("issuedAt",now).put("expiresAt",now+600000).put("token",new String(new char[64]).replace('\0','b')).put("canWrite",!a.module.equals("cells")).put("snapshot",new JSONObject().put("items",new JSONArray()).put("options",new JSONArray()));}
    private void seed()throws Exception{
        cookies("pending-ui");VisitorAccess.lock(context);ModuleAccess.lockAll(context);
        try(ModuleAccess a=new ModuleAccess(context,"notes")){
            a.install(grant(a),VisitorAccess.binding(),a.device(),1);String scope=a.active().getString("scope");
            for(String state:new String[]{"DRAFT","PENDING","SENDING","RETRY","CONFIRMED","CONFLICT","REJECTED"}){
                JSONObject row=a.save(scope,"",new JSONObject().put("titulo","Nota "+state).put("texto","CORPO SECRETO").put("cor","amarelo"));
                row.put("state",state).put("resultId","recibo-teste");a.drafts.put(scope,row.getString("id"),row);
            }
        }
    }
    private JSONObject notes(JSONObject result)throws Exception{JSONArray sections=result.getJSONArray("sections");for(int i=0;i<sections.length();i++)if(sections.getJSONObject(i).getString("module").equals("notes"))return sections.getJSONObject(i);throw new AssertionError();}
    private void clear()throws Exception{try(ModuleAccess a=new ModuleAccess(context,"notes")){String scope="modules:notes:"+OfflinePolicy.digest(USER+":33");for(OfflineDatabase.RecordRow r:a.database.storage().list(scope))a.database.storage().remove(scope,r.recordId);}ModuleAccess.lockAll(context);VisitorAccess.lock(context);}
    @Test public void projectionIsReadOnlyMinimalScopedAndSchedulesOnlyExistingQueue()throws Exception{
        try{seed();Map<String,byte[]> sealed=new HashMap<>();String scope;
            try(ModuleAccess a=new ModuleAccess(context,"notes")){scope=a.active().getString("scope");for(OfflineDatabase.RecordRow r:a.database.storage().list(scope))sealed.put(r.recordId,r.sealed);}
            List<String> scheduled=new ArrayList<>();JSONObject result=PendingOverview.read(context,false,scheduled::add);
            assertEquals(7,notes(result).getJSONArray("rows").length());assertTrue(notes(result).getBoolean("canSync"));assertEquals(0,scheduled.size());
            for(String forbidden:new String[]{"CORPO SECRETO","token","binding","scope","payload"})assertFalse(result.toString().contains(forbidden));
            assertEquals(1,PendingOverview.read(context,true,scheduled::add).getInt("scheduled"));assertEquals(Collections.singletonList("notes"),scheduled);
            try(ModuleAccess a=new ModuleAccess(context,"notes")){for(OfflineDatabase.RecordRow r:a.database.storage().list(scope))assertArrayEquals(sealed.get(r.recordId),r.sealed);}
            ModuleAccess.lock(context,"notes");JSONObject locked=notes(PendingOverview.read(context,true,scheduled::add));assertFalse(locked.getBoolean("ready"));assertFalse(locked.has("rows"));assertFalse(locked.has("communityName"));assertEquals(1,scheduled.size());
            try(ModuleAccess a=new ModuleAccess(context,"notes")){a.install(grant(a),VisitorAccess.binding(),a.device(),1);}
            cookies("another-account");assertFalse(notes(PendingOverview.read(context,false,scheduled::add)).has("rows"));
            cookies("pending-ui");try(ModuleAccess a=new ModuleAccess(context,"notes")){JSONObject g=a.active();g.put("duration",1).put("elapsed",0);a.drafts.putBounded(a.config(),"grant",g,131072);}
            assertFalse(notes(PendingOverview.read(context,false,scheduled::add)).has("rows"));
        }finally{clear();}
    }
    @Test public void draftsAndRefusalsNeverBecomeEligibleForSync()throws Exception{
        try{seed();try(ModuleAccess a=new ModuleAccess(context,"notes")){String scope=a.active().getString("scope");for(OfflineDatabase.RecordRow r:a.database.storage().list(scope)){JSONObject row=a.drafts.get(scope,r.recordId);if(Arrays.asList("PENDING","RETRY","SENDING").contains(row.getString("state")))a.database.storage().remove(scope,r.recordId);}}
            JSONObject result=PendingOverview.read(context,true,module->{throw new AssertionError("Must not schedule drafts/reviews");});assertFalse(notes(result).getBoolean("canSync"));assertEquals(0,result.getInt("scheduled"));
        }finally{clear();}
    }
    @Test public void visitorProjectionOmitsContactsAndCellQueueCannotSync()throws Exception{
        String visitorScope="visitors:"+OfflinePolicy.digest(USER+":33"),cellScope="modules:cells:"+OfflinePolicy.digest(USER+":33");
        try{cookies("pending-visitor");VisitorAccess.lock(context);ModuleAccess.lockAll(context);
            try(VisitorAccess a=new VisitorAccess(context)){
                long now=System.currentTimeMillis();a.install(new JSONObject().put("protocol",1).put("capability","visitor.create").put("deviceId",a.device()).put("accountId",USER).put("communityId",33).put("communityName","Comunidade de teste").put("issuedAt",now).put("expiresAt",now+600000).put("token",new String(new char[64]).replace('\0','a')),VisitorAccess.binding(),a.device(),1);
                JSONObject row=a.drafts.save(visitorScope,"",new JSONObject().put("nomeCompleto","Visitante de teste").put("telefone","11999991234").put("email","privado@example.test").put("dataEntrada","2026-09-28"));a.drafts.enqueue(visitorScope,row.getString("id"));
            }
            try(ModuleAccess a=new ModuleAccess(context,"cells")){
                a.install(grant(a),VisitorAccess.binding(),a.device(),1);JSONObject row=a.save(cellScope,"",new JSONObject().put("celulaId",1).put("data","2026-09-28").put("observacoes","SEGREDO CELULA"));
                // Even malformed legacy state must not grant write capability to this draft-only module.
                row.put("state","PENDING");a.drafts.put(cellScope,row.getString("id"),row);
            }
            List<String> scheduled=new ArrayList<>();JSONObject result=PendingOverview.read(context,true,scheduled::add);assertEquals(Collections.singletonList("visitors"),scheduled);assertEquals(1,result.getInt("scheduled"));
            assertTrue(result.toString().contains("Visitante de teste"));for(String hidden:new String[]{"11999991234","privado@example.test","SEGREDO CELULA"})assertFalse(result.toString().contains(hidden));
        }finally{try(VisitorAccess a=new VisitorAccess(context)){for(String scope:new String[]{visitorScope,cellScope})for(OfflineDatabase.RecordRow r:a.database.storage().list(scope))a.database.storage().remove(scope,r.recordId);}clear();}
    }
    private String evaluate(ActivityScenario<MainActivity> scenario,String script)throws Exception{String[] result={""};CountDownLatch done=new CountDownLatch(1);scenario.onActivity(a->((android.webkit.WebView)a.findViewById(R.id.webview)).evaluateJavascript(script,v->{result[0]=v;done.countDown();}));assertTrue(done.await(5,TimeUnit.SECONDS));return result[0];}
    private void awaitDom(ActivityScenario<MainActivity> scenario,String script)throws Exception{long end=android.os.SystemClock.elapsedRealtime()+15000;while(android.os.SystemClock.elapsedRealtime()<end){if("true".equals(evaluate(scenario,script)))return;android.os.SystemClock.sleep(150);}fail("Pending DOM not ready: "+script);}
    @Test public void centralUsesNativeBridgeFiltersAndClearsOnLock()throws Exception{
        assumeTrue(WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER));
        try{seed();try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)){
            awaitDom(scenario,"!!window.VinkuloPendingScreen");evaluate(scenario,"window.VinkuloNavigation.go('#pending-section')");
            awaitDom(scenario,"document.getElementById('pending-result').textContent.startsWith('7 registro')");
            assertEquals("true",evaluate(scenario,"!document.getElementById('pending-section').hidden&&document.documentElement.scrollWidth<=innerWidth&&!document.getElementById('pending-list').textContent.includes('CORPO SECRETO')"));
            evaluate(scenario,"document.getElementById('pending-filters').children[1].click()");awaitDom(scenario,"document.getElementById('pending-result').textContent.startsWith('2 registro')");
            CountDownLatch drawn=new CountDownLatch(1);scenario.onActivity(a->((android.webkit.WebView)a.findViewById(R.id.webview)).postVisualStateCallback(4,new android.webkit.WebView.VisualStateCallback(){@Override public void onComplete(long id){drawn.countDown();}}));assertTrue(drawn.await(5,TimeUnit.SECONDS));
            OfflineUiEvidence.capture(UiDevice.getInstance(InstrumentationRegistry.getInstrumentation()),"pending-review");
            evaluate(scenario,"window.VinkuloModules.postMessage(JSON.stringify({action:'lock',module:'notes',requestId:99999}))");
            awaitDom(scenario,"document.getElementById('pending-list').textContent===''");
            evaluate(scenario,"window.VinkuloPendingScreen.refresh()");awaitDom(scenario,"document.getElementById('pending-result').textContent.startsWith('0 registro')");
        }}finally{clear();}
    }
}
