package com.vinkulo.app;

import android.content.Context;
import androidx.annotation.NonNull;
import androidx.work.*;
import org.json.JSONObject;
import java.util.concurrent.TimeUnit;

public final class VisitorSyncWorker extends Worker {
    interface Transport { VisitorHttp.Reply post(JSONObject body,String cookies,String token) throws Exception; }
    private static final String NAME="vinkulo-visitor-outbox";
    public VisitorSyncWorker(@NonNull Context c,@NonNull WorkerParameters p){super(c,p);}
    static void schedule(Context context) {
        OneTimeWorkRequest work=new OneTimeWorkRequest.Builder(VisitorSyncWorker.class)
            .setConstraints(new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL,30,TimeUnit.SECONDS).build();
        WorkManager.getInstance(context).enqueueUniqueWork(NAME,ExistingWorkPolicy.APPEND_OR_REPLACE,work);
    }
    static void cancel(Context context){WorkManager.getInstance(context).cancelUniqueWork(NAME);}
    @NonNull @Override public Result doWork() {
        try(VisitorAccess access=new VisitorAccess(getApplicationContext())) {
            return drain(access,this::isStopped,(body,cookies,token)->VisitorHttp.post(false,body,cookies,token,""));
        }catch(Exception ignored){return Result.retry();}
    }
    static Result drain(VisitorAccess access,java.util.function.BooleanSupplier stopped,Transport transport) throws Exception {
            for(int i=0;i<20&&!stopped.getAsBoolean();i++) {
                JSONObject grant,row;String scope;
                synchronized(VisitorDrafts.MUTEX){grant=access.active();if(grant==null)return Result.success();scope=grant.getString("scope");row=access.drafts.claim(scope,System.currentTimeMillis());}
                if(row==null){synchronized(VisitorDrafts.MUTEX){return access.drafts.pending(scope)?Result.retry():Result.success();}}
                String state="RETRY",message="Sem confirmação. Nova tentativa automática quando houver conexão.";long visitorId=0,retryAfter=0;boolean pause=false;
                try {
                    // Check again immediately before touching the network. Never use a
                    // stale cookie captured by JS or credentials from another account.
                    synchronized(VisitorDrafts.MUTEX){JSONObject current=access.active();if(stopped.getAsBoolean()||current==null||!scope.equals(current.getString("scope")))throw new java.io.IOException("Blocked");}
                    String cookies=VisitorAccess.cookies();
                    if(!OfflinePolicy.digest(cookies).equals(grant.getString("binding")))throw new java.io.IOException("Changed");
                    VisitorHttp.Reply response=transport.post(new JSONObject().put("deviceId",grant.getString("deviceId"))
                        .put("operationId",row.getString("id")).put("visitor",row.getJSONObject("visitor")),cookies,grant.getString("token"));
                    retryAfter=response.retryAfterMs;
                    if(response.status==200&&"CONFIRMED".equals(response.body.optString("result"))&&row.getString("id").equals(response.body.optString("operationId"))&&response.body.optLong("visitorId")>0){
                        state="CONFIRMED";visitorId=response.body.getLong("visitorId");message="Cadastro confirmado no servidor.";
                    }else if(response.status==401||response.status==403){pause=true;message="Entre na mesma conta e prepare novamente para retomar.";}
                    else if(response.status==409){state="CONFLICT";message="Possível duplicidade ou conflito. Confira no sistema online antes de refazer.";}
                    else if(response.status==400||response.status==422){state="REJECTED";message="Cadastro recusado. Confira os campos e crie um novo rascunho.";}
                }catch(Exception ignored){/* Never log payloads, contacts, cookies or tokens. */}
                synchronized(VisitorDrafts.MUTEX){row.put("state",state).put("message",message).put("leaseUntil",0)
                    .put("nextAttemptAt",state.equals("RETRY")&&!pause?System.currentTimeMillis()+Math.max(30000,retryAfter)+java.util.concurrent.ThreadLocalRandom.current().nextLong(1000,5000):0);
                    if(visitorId>0)row.put("visitorId",visitorId);access.drafts.finish(scope,row);
                    JSONObject current=access.drafts.get("write-config","grant");
                    if(pause&&current!=null&&grant.getString("token").equals(current.optString("token")))access.preferences.edit().putBoolean("locked",true).commit();}
                if(pause)return Result.success();if(state.equals("RETRY"))return Result.retry();
            }
            return stopped.getAsBoolean()?Result.success():Result.retry();
    }
}
