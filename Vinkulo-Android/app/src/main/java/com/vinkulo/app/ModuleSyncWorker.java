package com.vinkulo.app;
import android.content.Context;
import androidx.annotation.NonNull;
import androidx.work.*;
import org.json.JSONObject;
import java.util.concurrent.TimeUnit;

public final class ModuleSyncWorker extends Worker {
    interface Transport {VisitorHttp.Reply post(JSONObject body,String cookies,String token)throws Exception;}
    public ModuleSyncWorker(@NonNull Context c,@NonNull WorkerParameters p){super(c,p);}
    static void schedule(Context c,String module){
        OneTimeWorkRequest work=new OneTimeWorkRequest.Builder(ModuleSyncWorker.class).setInputData(new Data.Builder().putString("module",module).build())
            .setConstraints(new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).setBackoffCriteria(BackoffPolicy.EXPONENTIAL,30,TimeUnit.SECONDS).build();
        WorkManager.getInstance(c).enqueueUniqueWork("vinkulo-modules-"+module,ExistingWorkPolicy.APPEND_OR_REPLACE,work);
    }
    static void cancel(Context c,String module){WorkManager.getInstance(c).cancelUniqueWork("vinkulo-modules-"+module);}
    @NonNull @Override public Result doWork(){
        String module=getInputData().getString("module");if(!ModuleAccess.valid(module))return Result.failure();
        try(ModuleAccess access=new ModuleAccess(getApplicationContext(),module)){return drain(access,this::isStopped,(b,c,t)->VisitorHttp.module(false,b,c,t,""));}catch(Exception ignored){return Result.retry();}
    }
    static Result drain(ModuleAccess access,java.util.function.BooleanSupplier stopped,Transport transport)throws Exception{
        for(int i=0;i<20&&!stopped.getAsBoolean();i++){
            JSONObject grant,row;String scope;
            synchronized(VisitorDrafts.MUTEX){grant=access.active();if(grant==null||!grant.getBoolean("canWrite")||access.module.equals("cells"))return Result.success();scope=grant.getString("scope");row=access.drafts.claim(scope,System.currentTimeMillis());}
            if(row==null){synchronized(VisitorDrafts.MUTEX){return access.drafts.pending(scope)?Result.retry():Result.success();}}
            String state="RETRY",message="Sem confirmação. Nova tentativa quando houver conexão.",resultId="";long retryAfter=0;boolean pause=false;
            try{
                synchronized(VisitorDrafts.MUTEX){JSONObject current=access.active();if(stopped.getAsBoolean()||current==null||!scope.equals(current.getString("scope"))||!grant.getString("token").equals(current.getString("token")))throw new java.io.IOException("Blocked");}
                String cookies=VisitorAccess.cookies();if(!OfflinePolicy.digest(cookies).equals(grant.getString("binding")))throw new java.io.IOException("Changed");
                VisitorHttp.Reply reply=transport.post(new JSONObject().put("deviceId",grant.getString("deviceId")).put("module",access.module).put("operationId",row.getString("id")).put("payload",row.getJSONObject("payload")),cookies,grant.getString("token"));
                retryAfter=reply.retryAfterMs;
                if(reply.status==200&&"CONFIRMED".equals(reply.body.optString("result"))&&row.getString("id").equals(reply.body.optString("operationId"))&&!reply.body.optString("resultId").isEmpty()){
                    state="CONFIRMED";resultId=reply.body.getString("resultId");message="Registro confirmado no servidor.";
                }else if(reply.status==401||reply.status==403){pause=true;message="Entre na mesma conta e prepare este módulo novamente.";}
                else if(reply.status==409){state="CONFLICT";message="Conflito ou limite atingido. Confira online antes de criar outro envio.";}
                else if(reply.status==400||reply.status==422){state="REJECTED";message="Registro recusado. Revise os campos em um novo rascunho.";}
            }catch(Exception ignored){/* Do not log content or credentials. */}
            synchronized(VisitorDrafts.MUTEX){row.put("state",state).put("message",message).put("leaseUntil",0).put("resultId",resultId)
                .put("nextAttemptAt",state.equals("RETRY")&&!pause?System.currentTimeMillis()+Math.max(30000,retryAfter)+java.util.concurrent.ThreadLocalRandom.current().nextLong(1000,5000):0);
                access.drafts.finish(scope,row);JSONObject current=access.drafts.get(access.config(),"grant");
                if(pause&&current!=null&&grant.getString("token").equals(current.optString("token")))access.preferences.edit().putBoolean("locked",true).commit();}
            if(pause)return Result.success();if(state.equals("RETRY"))return Result.retry();
        }
        return stopped.getAsBoolean()?Result.success():Result.retry();
    }
}
