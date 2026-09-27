package com.vinkulo.app;

import android.content.Context;
import android.webkit.CookieManager;
import androidx.test.core.app.ApplicationProvider;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.core.app.ActivityScenario;
import androidx.test.uiautomator.*;
import androidx.webkit.WebViewFeature;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import static org.junit.Assert.*;
import static org.junit.Assume.assumeTrue;

@RunWith(AndroidJUnit4.class)
public class VisitorOutboxTest {
    private final Context context=ApplicationProvider.getApplicationContext();
    private final class TestDatabase implements AutoCloseable {
        final OfflineDatabase db;TestDatabase(String name){db=OfflineDatabase.open(context,name);}
        @Override public void close(){db.close();}
    }
    private JSONObject payload() throws Exception {return new JSONObject().put("nomeCompleto","Visitante fictício offline").put("telefone","11999991234").put("email","offline@example.test").put("dataEntrada","2026-09-27");}
    @Test public void concurrentReadersAndWriterNeverReplaceEachOthersKeystoreKey() throws Exception {
        String alias="test-shared-key-"+UUID.randomUUID();java.util.concurrent.ExecutorService workers=java.util.concurrent.Executors.newFixedThreadPool(2);
        try {
            CountDownLatch start=new CountDownLatch(1);
            java.util.concurrent.Future<byte[]> a=workers.submit(()->{start.await();return new OfflineCipher(alias).seal("a".getBytes(java.nio.charset.StandardCharsets.UTF_8),"scope");});
            java.util.concurrent.Future<byte[]> b=workers.submit(()->{start.await();return new OfflineCipher(alias).seal("b".getBytes(java.nio.charset.StandardCharsets.UTF_8),"scope");});
            start.countDown();OfflineCipher reopened=new OfflineCipher(alias);
            assertEquals("a",new String(reopened.open(a.get(10,TimeUnit.SECONDS),"scope"),java.nio.charset.StandardCharsets.UTF_8));
            assertEquals("b",new String(reopened.open(b.get(10,TimeUnit.SECONDS),"scope"),java.nio.charset.StandardCharsets.UTF_8));
        }finally{workers.shutdownNow();}
    }
    private void cookies(String value) throws Exception {
        CountDownLatch done=new CountDownLatch(1);
        InstrumentationRegistry.getInstrumentation().runOnMainSync(()->CookieManager.getInstance().setCookie(NativePolicy.ORIGIN,"__Host-adote_session="+value+"; Path=/; Secure; HttpOnly",ok->done.countDown()));
        assertTrue(done.await(5,TimeUnit.SECONDS));
    }
    private JSONObject grant(String device,long account) throws Exception {long now=System.currentTimeMillis();return new JSONObject()
        .put("protocol",1).put("capability","visitor.create").put("deviceId",device).put("accountId",account).put("communityId",22)
        .put("communityName","Comunidade de teste").put("issuedAt",now).put("expiresAt",now+600000).put("token",new String(new char[64]).replace('\0','a'));}

    @Test public void draftAndQueueAreEncryptedAtomicAndSurviveReopen() throws Exception {
        String database="test-drafts-"+UUID.randomUUID()+".db",scope="scope-a",id;
        try {
            try(TestDatabase handle=new TestDatabase(database)) {
                OfflineDatabase db=handle.db;
                VisitorDrafts drafts=new VisitorDrafts(db,new OfflineCipher("test-visitors"));
                id=drafts.save(scope,"",payload()).getString("id");drafts.enqueue(scope,id);drafts.enqueue(scope,id);
                assertEquals(1,drafts.list(scope).length());assertEquals("PENDING",drafts.get(scope,id).getString("state"));
                assertFalse(new String(db.storage().get(scope,id).sealed,java.nio.charset.StandardCharsets.UTF_8).contains("offline@example"));
                try{drafts.save(scope,id,payload());fail();}catch(IllegalStateException expected){}
                try{drafts.discard(scope,id);fail();}catch(IllegalStateException expected){}
                assertEquals(0,drafts.list("scope-b").length());
                JSONObject claimed=drafts.claim(scope,1000);assertEquals(id,claimed.getString("id"));assertNull(drafts.claim(scope,1001));
            }
            try(TestDatabase handle=new TestDatabase(database)) {
                OfflineDatabase db=handle.db;
                VisitorDrafts drafts=new VisitorDrafts(db,new OfflineCipher("test-visitors"));
                assertEquals(id,drafts.claim(scope,122000).getString("id"));
                assertEquals(2,drafts.get(scope,id).getInt("attempts"));
                JSONObject stale=drafts.get(scope,id);drafts.resume(scope);
                JSONObject fresh=drafts.claim(scope,122001);assertNotEquals(stale.getString("leaseId"),fresh.getString("leaseId"));
                assertTrue(drafts.finish(scope,fresh.put("state","CONFIRMED").put("visitorId",90)));
                assertFalse(drafts.finish(scope,stale.put("state","RETRY")));
                assertEquals("CONFIRMED",drafts.get(scope,id).getString("state"));
                db.storage().lock();assertNotNull(drafts.get(scope,id));
            }
        } finally{context.deleteDatabase(database);}
    }
    @Test public void lostResponseReplaysSameUuidAndRevocationPreservesPendingWork() throws Exception {
        cookies("visitor-test-a");
        try(VisitorAccess access=new VisitorAccess(context)) {
            synchronized(VisitorDrafts.MUTEX) {
                String device=access.device();access.install(grant(device,777),VisitorAccess.binding(),device,1);
                String scope=access.active().getString("scope"),id=access.drafts.save(scope,"",payload()).getString("id");access.drafts.enqueue(scope,id);
                final int[] calls={0};
                VisitorSyncWorker.Transport transport=(body,c,t)->{assertEquals(id,body.getString("operationId"));calls[0]++;if(calls[0]==1)throw new java.io.IOException("response lost after commit");return new VisitorHttp.Reply(200,new JSONObject().put("operationId",id).put("result","CONFIRMED").put("visitorId",91));};
                VisitorSyncWorker.drain(access,()->false,transport);assertEquals("RETRY",access.drafts.get(scope,id).getString("state"));
                assertTrue(access.drafts.get(scope,id).getLong("nextAttemptAt")>System.currentTimeMillis());
                access.drafts.put(scope,id,access.drafts.get(scope,id).put("nextAttemptAt",0));
                VisitorSyncWorker.drain(access,()->false,transport);assertEquals("CONFIRMED",access.drafts.get(scope,id).getString("state"));assertEquals(91,access.drafts.get(scope,id).getLong("visitorId"));
                String pending=access.drafts.save(scope,"",payload()).getString("id");access.drafts.enqueue(scope,pending);
                VisitorSyncWorker.drain(access,()->false,(b,c,t)->new VisitorHttp.Reply(403,new JSONObject()));
                assertNull(access.active());assertEquals("RETRY",access.drafts.get(scope,pending).getString("state"));
                access.install(grant(device,778),VisitorAccess.binding(),device,1);assertEquals(0,access.drafts.list(access.active().getString("scope")).length());
                access.install(grant(device,777),VisitorAccess.binding(),device,1);assertNotNull(access.drafts.get(scope,pending));
                access.drafts.put(scope,pending,access.drafts.get(scope,pending).put("state","CONFLICT"));access.drafts.discard(scope,pending);access.drafts.discard(scope,id);
                VisitorAccess.lock(context);assertNull(access.active());
            }
        }
    }
    @Test public void invalidPayloadAndQuotaNeverPretendToSave() throws Exception {
        String database="test-quota-"+UUID.randomUUID()+".db";
        try(TestDatabase handle=new TestDatabase(database)){
            OfflineDatabase db=handle.db;
            VisitorDrafts drafts=new VisitorDrafts(db,new OfflineCipher("test-visitors"));
            try{VisitorDrafts.validate(payload().put("dataEntrada","2026-02-30"));fail();}catch(Exception expected){}
            for(int i=0;i<201;i++)drafts.save("scope","",payload());
            try{drafts.save("scope","",payload());fail();}catch(IllegalStateException expected){}
            assertEquals(201,db.storage().recordCount());
        }finally{context.deleteDatabase(database);}
    }
    @Test public void localVisitorFormSavesAndRendersRealEncryptedDraft() throws Exception {
        assumeTrue(WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER));cookies("visitor-ui-test");
        String scope;
        try(VisitorAccess access=new VisitorAccess(context)){String device=access.device();access.install(grant(device,779),VisitorAccess.binding(),device,1);scope=access.active().getString("scope");}
        UiDevice device=UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)) {
            // Exercise real DOM inputs/button and restricted native bridge. UIAutomator
            // can omit WebView descendants after recreation; evaluateJavascript stays
            // test-only and no production bridge installs test data.
            CountDownLatch loaded=new CountDownLatch(1);long deadline=android.os.SystemClock.elapsedRealtime()+15000;
            while(android.os.SystemClock.elapsedRealtime()<deadline){CountDownLatch tick=new CountDownLatch(1);boolean[] ready={false};scenario.onActivity(a->((android.webkit.WebView)a.findViewById(com.vinkulo.app.R.id.webview)).evaluateJavascript("!document.getElementById('visitor-workspace').hidden",v->{ready[0]="true".equals(v);tick.countDown();}));assertTrue(tick.await(3,TimeUnit.SECONDS));if(ready[0]){loaded.countDown();break;}android.os.SystemClock.sleep(200);}
            assertEquals(0,loaded.getCount());
            scenario.onActivity(a->((android.webkit.WebView)a.findViewById(com.vinkulo.app.R.id.webview)).evaluateJavascript("document.getElementById('visitor-name').value='Visitante fictício offline';document.getElementById('visitor-save').click();document.getElementById('visitor-workspace').scrollIntoView()",null));
            boolean saved=false;deadline=android.os.SystemClock.elapsedRealtime()+8000;
            while(android.os.SystemClock.elapsedRealtime()<deadline){try(VisitorAccess access=new VisitorAccess(context)){synchronized(VisitorDrafts.MUTEX){if(access.drafts.list(scope).length()==1){saved=true;break;}}}android.os.SystemClock.sleep(200);}assertTrue(saved);
            android.os.SystemClock.sleep(1000);OfflineUiEvidence.capture(device,"visitors");
            scenario.recreate();android.os.SystemClock.sleep(1500);
            try(VisitorAccess access=new VisitorAccess(context)){assertEquals("DRAFT",access.drafts.list(scope).getJSONObject(0).getString("state"));}
        }finally{try(VisitorAccess access=new VisitorAccess(context)){for(int i=0;i<access.drafts.list(scope).length();i++){String id=access.drafts.list(scope).getJSONObject(i).getString("id");access.drafts.discard(scope,id);}}VisitorAccess.lock(context);}
    }
}
