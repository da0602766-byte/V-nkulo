package com.vinkulo.app;

import android.app.Activity;
import android.os.SystemClock;
import org.json.JSONObject;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Consumer;

final class VisitorController {
    private final Activity activity;
    private final ExecutorService executor=Executors.newSingleThreadExecutor();
    private final AtomicLong generation=new AtomicLong();
    private volatile boolean closed;
    VisitorController(Activity activity){this.activity=activity;}
    void lock(){generation.incrementAndGet();VisitorAccess.lock(activity);}
    void close(){closed=true;generation.incrementAndGet();executor.shutdown();}
    void command(JSONObject command,Consumer<JSONObject> callback) {
        if(closed)return;long ticket=generation.get();String binding=VisitorAccess.binding();
        executor.execute(()->{
            JSONObject response=new JSONObject();
            try(VisitorAccess access=new VisitorAccess(activity)) {
                String action=command.getString("action"),savedId="";
                if(action.equals("prepare")) {
                    if(binding.isEmpty())throw new IllegalStateException("Entre na conta com internet primeiro.");
                    String device; synchronized(VisitorDrafts.MUTEX){device=access.device();}
                    String challenge=OfflinePolicy.digest(UUID.randomUUID().toString());long started=SystemClock.elapsedRealtime();
                    VisitorHttp.Reply reply=VisitorHttp.post(true,new JSONObject().put("deviceId",device),VisitorAccess.cookies(),"",challenge);
                    if(reply.status!=200){if(reply.status==401||reply.status==403)VisitorAccess.lock(activity);throw new IllegalStateException("Não foi possível autorizar. Confira conexão e permissão de cadastrar visitantes.");}
                    if(!challenge.equals(reply.body.optString("challenge")))throw new IllegalStateException("Resposta inválida.");
                    synchronized(VisitorDrafts.MUTEX){if(closed||generation.get()!=ticket||!binding.equals(VisitorAccess.binding()))return;access.install(reply.body,binding,device,SystemClock.elapsedRealtime()-started);}
                    VisitorSyncWorker.schedule(activity);
                }
                synchronized(VisitorDrafts.MUTEX) {
                    if(closed||generation.get()!=ticket||!binding.equals(VisitorAccess.binding()))return;
                    JSONObject grant=access.active();response.put("prepared",grant!=null);
                    if(grant!=null) {
                        String scope=grant.getString("scope"),id=command.optString("id","");
                        if(action.equals("save"))savedId=access.drafts.save(scope,id,command.getJSONObject("visitor")).getString("id");
                        else if(action.equals("enqueue")){access.drafts.enqueue(scope,id);VisitorSyncWorker.schedule(activity);}
                        else if(action.equals("discard"))access.drafts.discard(scope,id);
                        else if(action.equals("sync"))VisitorSyncWorker.schedule(activity);
                        else if(!action.equals("status")&&!action.equals("prepare"))throw new IllegalArgumentException("Comando inválido.");
                        response.put("communityName",grant.getString("communityName")).put("rows",access.drafts.list(scope))
                            .put("validForMs",Math.max(0,grant.getLong("duration")-(SystemClock.elapsedRealtime()-grant.getLong("elapsed"))));
                        if(!savedId.isEmpty())response.put("savedId",savedId);
                    }else if(!action.equals("status"))throw new IllegalStateException("Prepare os cadastros com a mesma conta para continuar.");
                }
            }catch(Exception error){try{response.put("error",error instanceof IllegalArgumentException||error instanceof IllegalStateException?error.getMessage():"Não foi possível concluir. O trabalho salvo permanece no aparelho.");}catch(Exception ignored){}}
            activity.runOnUiThread(()->{if(!closed&&generation.get()==ticket&&binding.equals(VisitorAccess.binding()))callback.accept(response);});
        });
    }
}
