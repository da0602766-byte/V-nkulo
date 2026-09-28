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
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import static org.junit.Assert.*;
import static org.junit.Assume.assumeTrue;

@RunWith(AndroidJUnit4.class)
public class ModuleOutboxTest {
    private final Context context=ApplicationProvider.getApplicationContext();
    private void cookies(String value)throws Exception{CountDownLatch done=new CountDownLatch(1);InstrumentationRegistry.getInstrumentation().runOnMainSync(()->CookieManager.getInstance().setCookie(NativePolicy.ORIGIN,"__Host-adote_session="+value+"; Path=/; Secure; HttpOnly",ok->done.countDown()));assertTrue(done.await(5,TimeUnit.SECONDS));}
    private JSONObject grant(ModuleAccess a,long user)throws Exception{long now=System.currentTimeMillis();JSONArray items=new JSONArray().put(new JSONObject().put("id",1).put("label","Registro fictício autorizado").put("text","Consulta de teste; não é produção").put("version",0));return new JSONObject().put("protocol",1).put("module",a.module).put("deviceId",a.device()).put("accountId",user).put("communityId",33).put("communityName","Comunidade de teste").put("issuedAt",now).put("expiresAt",now+600000).put("token",new String(new char[64]).replace('\0','b')).put("canWrite",!a.module.equals("cells")).put("snapshot",new JSONObject().put("items",items).put("options",items));}
    private JSONObject note()throws Exception{return new JSONObject().put("titulo","Anotação fictícia").put("texto","Texto protegido no aparelho").put("cor","amarelo");}
    private void clear(long user)throws Exception{for(String module:ModuleAccess.MODULES)try(ModuleAccess a=new ModuleAccess(context,module)){String scope="modules:"+module+":"+OfflinePolicy.digest(user+":33");for(OfflineDatabase.RecordRow r:a.database.storage().list(scope))a.database.storage().remove(scope,r.recordId);ModuleAccess.lock(context,module);}}
    @Test public void moduleQueueReplaysUuidAfterLostResponseAndLocksOnRevocation()throws Exception{
        cookies("module-test");long user=8901;
        try(ModuleAccess a=new ModuleAccess(context,"notes")){
            a.install(grant(a,user),VisitorAccess.binding(),a.device(),1);JSONObject g=a.active();String scope=g.getString("scope"),id=a.save(scope,"",note()).getString("id");a.enqueue(g,id);a.enqueue(g,id);
            assertFalse(new String(a.database.storage().get(scope,id).sealed,java.nio.charset.StandardCharsets.UTF_8).contains("Texto protegido"));
            final String[] sent={""};ModuleSyncWorker.drain(a,()->false,(b,c,t)->{sent[0]=b.getString("operationId");throw new java.io.IOException("Lost response");});
            assertEquals(id,sent[0]);assertEquals("RETRY",a.drafts.get(scope,id).getString("state"));
            try{a.drafts.discard(scope,id);fail();}catch(IllegalStateException expected){}
            a.drafts.resume(scope);ModuleSyncWorker.drain(a,()->false,(b,c,t)->{assertEquals(id,b.getString("operationId"));return new VisitorHttp.Reply(200,new JSONObject().put("result","CONFIRMED").put("operationId",id).put("resultId",id));});
            assertEquals("CONFIRMED",a.drafts.get(scope,id).getString("state"));
            String pending=a.save(scope,"",note()).getString("id");a.enqueue(a.active(),pending);
            ModuleSyncWorker.drain(a,()->false,(b,c,t)->new VisitorHttp.Reply(403,new JSONObject()));assertNull(a.active());assertEquals("RETRY",a.drafts.get(scope,pending).getString("state"));
            a.install(grant(a,user),VisitorAccess.binding(),a.device(),1);assertEquals("PENDING",a.drafts.get(scope,pending).getString("state"));
            cookies("other-module-account");assertNull(a.active());assertNotNull(a.drafts.get(scope,pending));
        }finally{clear(user);}
    }
    @Test public void modulesValidatePayloadAndNeverEnqueueCellDrafts()throws Exception{
        cookies("module-validation");long user=8902;
        try(ModuleAccess a=new ModuleAccess(context,"cells")){
            a.install(grant(a,user),VisitorAccess.binding(),a.device(),1);JSONObject g=a.active();String id=a.save(g.getString("scope"),"",new JSONObject().put("celulaId",1).put("data","2026-09-27").put("observacoes","Rascunho")).getString("id");
            try{a.enqueue(g,id);fail();}catch(IllegalStateException expected){}
            try{ModulePayload.validate("notes",note().put("admin",true),true);fail();}catch(IllegalArgumentException expected){}
            try{ModulePayload.validate("followups",new JSONObject().put("visitanteId",1).put("tipo","EMAIL").put("resultado","OK").put("descricao","").put("proximoContato","2026-02-30"),true);fail();}catch(Exception expected){}
        }finally{clear(user);}
    }
    private String evaluate(ActivityScenario<MainActivity> scenario,String script)throws Exception{String[] result={""};CountDownLatch done=new CountDownLatch(1);scenario.onActivity(a->((android.webkit.WebView)a.findViewById(R.id.webview)).evaluateJavascript(script,v->{result[0]=v;done.countDown();}));assertTrue(done.await(5,TimeUnit.SECONDS));return result[0];}
    private void awaitDom(ActivityScenario<MainActivity> scenario,String script)throws Exception{long end=android.os.SystemClock.elapsedRealtime()+15000;while(android.os.SystemClock.elapsedRealtime()<end){if("true".equals(evaluate(scenario,script)))return;android.os.SystemClock.sleep(150);}OfflineUiEvidence.capture(UiDevice.getInstance(InstrumentationRegistry.getInstrumentation()),"module-failure");fail("DOM not ready: "+script+"; "+evaluate(scenario,"JSON.stringify({hidden:document.hidden,status:document.getElementById('module-status')?.textContent,url:location.pathname})"));}
    @Test public void allModuleFormsRenderOfflineAndSaveThroughRestrictedBridge()throws Exception{
        assumeTrue(WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER));cookies("module-ui");long user=8903;
        for(String module:ModuleAccess.MODULES)try(ModuleAccess a=new ModuleAccess(context,module)){a.install(grant(a,user),VisitorAccess.binding(),a.device(),1);}
        UiDevice device=UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());
        // This class can run before the foundation fixture. Grant only in the
        // disposable CI app, as the reader fixture already does, so the system
        // dialog does not hide the document and correctly clear its private UI.
        if(android.os.Build.VERSION.SDK_INT>=33)device.executeShellCommand("pm grant com.vinkulo.app android.permission.POST_NOTIFICATIONS");
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)){
            awaitDom(scenario,"!!document.getElementById('module-workspace')&&!document.getElementById('module-workspace').hidden");
            for(String module:ModuleAccess.MODULES){
                evaluate(scenario,"document.getElementById('module-kind').value='"+module+"';document.getElementById('module-kind').dispatchEvent(new Event('change'))");
                awaitDom(scenario,"!document.getElementById('module-workspace').hidden&&!document.getElementById('module-kind').disabled");
                evaluate(scenario,"document.getElementById('module-title').scrollIntoView()");
                CountDownLatch drawn=new CountDownLatch(1);scenario.onActivity(a->((android.webkit.WebView)a.findViewById(R.id.webview)).postVisualStateCallback(3,new android.webkit.WebView.VisualStateCallback(){@Override public void onComplete(long id){drawn.countDown();}}));assertTrue(drawn.await(5,TimeUnit.SECONDS));
                assertEquals("true",evaluate(scenario,"document.documentElement.scrollWidth<=window.innerWidth"));
                OfflineUiEvidence.capture(device,"module-"+module);
                evaluate(scenario,"document.getElementById('module-fields').scrollIntoView()");
                assertEquals("true",evaluate(scenario,"document.getElementById('module-fields').children.length>=6&&document.documentElement.scrollWidth<=window.innerWidth"));
                OfflineUiEvidence.capture(device,"module-form-"+module);
                if(module.equals("notes")){
                    evaluate(scenario,"document.getElementById('module-input-titulo').value='Anotação fictícia';document.getElementById('module-input-texto').value='Texto protegido no aparelho';document.getElementById('module-save').click()");
                    awaitDom(scenario,"document.getElementById('module-status').textContent.includes('Rascunho salvo')");
                    try(ModuleAccess a=new ModuleAccess(context,module)){assertEquals(1,a.drafts.list(a.active().getString("scope")).length());}
                }
            }
            scenario.recreate();awaitDom(scenario,"!document.getElementById('module-workspace').hidden");
            try(ModuleAccess a=new ModuleAccess(context,"notes")){assertEquals("DRAFT",a.drafts.list(a.active().getString("scope")).getJSONObject(0).getString("state"));}
        }finally{clear(user);}
    }
}
