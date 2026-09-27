package com.vinkulo.app;
import android.app.Activity;
import android.os.SystemClock;
import org.json.JSONObject;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Consumer;

final class ModuleController {
    private final Activity activity;private final ExecutorService executor=Executors.newSingleThreadExecutor();private final AtomicLong generation=new AtomicLong();private volatile boolean closed;
    ModuleController(Activity activity){this.activity=activity;}
    void lock(){generation.incrementAndGet();ModuleAccess.lockAll(activity);}
    void close(){closed=true;generation.incrementAndGet();executor.shutdown();}
    void command(JSONObject command,Consumer<JSONObject> callback){
        if(closed)return;long ticket=generation.get();String binding=VisitorAccess.binding();
        executor.execute(()->{
            JSONObject response=new JSONObject();String module=command.optString("module");
            try(ModuleAccess access=new ModuleAccess(activity,module)){
                String action=command.getString("action"),savedId="";
                if(action.equals("prepare")){
                    if(binding.isEmpty())throw new IllegalStateException("Entre na conta com internet primeiro.");
                    String device;synchronized(VisitorDrafts.MUTEX){device=access.device();}
                    String challenge=OfflinePolicy.digest(UUID.randomUUID().toString());long started=SystemClock.elapsedRealtime();
                    VisitorHttp.Reply reply=VisitorHttp.module(true,new JSONObject().put("deviceId",device).put("module",module),VisitorAccess.cookies(),"",challenge);
                    if(reply.status!=200){if(reply.status==401||reply.status==403)ModuleAccess.lock(activity,module);throw new IllegalStateException("Não foi possível preparar. Confira conexão e permissão deste módulo.");}
                    if(!challenge.equals(reply.body.optString("challenge")))throw new IllegalStateException("Resposta inválida.");
                    synchronized(VisitorDrafts.MUTEX){if(closed||generation.get()!=ticket||!binding.equals(VisitorAccess.binding()))return;access.install(reply.body,binding,device,SystemClock.elapsedRealtime()-started);}
                    ModuleSyncWorker.schedule(activity,module);
                }
                synchronized(VisitorDrafts.MUTEX){
                    if(closed||generation.get()!=ticket||!binding.equals(VisitorAccess.binding()))return;
                    JSONObject grant=access.active();response.put("module",module).put("prepared",grant!=null);
                    if(grant!=null){
                        String scope=grant.getString("scope"),id=command.optString("id","");
                        if(action.equals("save"))savedId=access.save(scope,id,command.getJSONObject("payload")).getString("id");
                        else if(action.equals("enqueue")){access.enqueue(grant,id);ModuleSyncWorker.schedule(activity,module);}
                        else if(action.equals("discard"))access.drafts.discard(scope,id);
                        else if(action.equals("sync"))ModuleSyncWorker.schedule(activity,module);
                        else if(!action.equals("status")&&!action.equals("prepare"))throw new IllegalArgumentException("Comando inválido.");
                        response.put("communityName",grant.getString("communityName")).put("rows",access.drafts.list(scope)).put("snapshot",grant.getJSONObject("snapshot"))
                            .put("canWrite",grant.getBoolean("canWrite")).put("issuedAt",grant.getLong("issuedAt"))
                            .put("validForMs",Math.max(0,grant.getLong("duration")-(SystemClock.elapsedRealtime()-grant.getLong("elapsed"))));
                        if(!savedId.isEmpty())response.put("savedId",savedId);
                    }else if(!action.equals("status"))throw new IllegalStateException("Prepare este módulo com a mesma conta/comunidade para continuar.");
                }
            }catch(Exception e){try{response.put("error",e instanceof IllegalArgumentException||e instanceof IllegalStateException?e.getMessage():"Não foi possível concluir. Trabalho salvo preservado no aparelho.");}catch(Exception ignored){}}
            activity.runOnUiThread(()->{if(!closed&&generation.get()==ticket&&binding.equals(VisitorAccess.binding()))callback.accept(response);});
        });
    }
}
