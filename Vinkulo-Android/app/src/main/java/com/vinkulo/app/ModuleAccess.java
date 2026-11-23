package com.vinkulo.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.SystemClock;
import android.provider.Settings;
import org.json.JSONObject;
import java.util.Arrays;
import java.util.UUID;

final class ModuleAccess implements AutoCloseable {
    static final String[] MODULES={"requests","notes","followups","checklists","cells","parking"};
    final Context context; final String module; final OfflineDatabase database; final VisitorDrafts drafts; final SharedPreferences preferences;
    static boolean valid(String module){return Arrays.asList(MODULES).contains(module);}
    ModuleAccess(Context context,String module) {
        if(!valid(module))throw new IllegalArgumentException("Módulo inválido.");
        this.context=context.getApplicationContext();this.module=module;database=OfflineDatabase.open(context,"vinkulo-offline.db");
        drafts=new VisitorDrafts(database,new OfflineCipher("vinkulo-offline-v1"));preferences=context.getSharedPreferences("module-offline-"+module,Context.MODE_PRIVATE);
    }
    String config(){return "module-config:"+module;}
    int boot(){return Settings.Global.getInt(context.getContentResolver(),Settings.Global.BOOT_COUNT,-1);}
    String device(){String id=preferences.getString("device","");if(!id.isEmpty())return id;id=UUID.randomUUID().toString();if(!preferences.edit().putString("device",id).commit())throw new IllegalStateException("Armazenamento indisponível.");return id;}
    static void lock(Context c,String module){c.getSharedPreferences("module-offline-"+module,Context.MODE_PRIVATE).edit().putBoolean("locked",true).commit();ModuleSyncWorker.cancel(c,module);}
    static void lockAll(Context c){for(String module:MODULES)lock(c,module);}
    JSONObject active() throws Exception {
        if(preferences.getBoolean("locked",true))return null;JSONObject g=drafts.get(config(),"grant");
        if(g==null||!VisitorAccess.binding().equals(g.getString("binding"))||!OfflinePolicy.fresh(System.currentTimeMillis(),SystemClock.elapsedRealtime(),boot(),g.getLong("wall"),g.getLong("elapsed"),g.getInt("boot"),g.getLong("duration")))return null;
        return g;
    }
    void install(JSONObject g,String binding,String device,long requestDuration) throws Exception {
        long duration=g.getLong("expiresAt")-g.getLong("issuedAt")-requestDuration;
        if(g.getInt("protocol")!=1||!module.equals(g.getString("module"))||!device.equals(g.getString("deviceId"))||g.getLong("accountId")<=0||g.getLong("communityId")<=0
            ||duration<=0||duration>8*3600000L||boot()<0||!g.getString("token").matches("[a-f0-9]{64}")||g.getString("communityName").length()>160
            ||binding.isEmpty()||!binding.equals(VisitorAccess.binding())||!(g.get("canWrite") instanceof Boolean))throw new IllegalArgumentException("Autorização inválida.");
        JSONObject snapshot=g.getJSONObject("snapshot");
        if(snapshot.getJSONArray("items").length()>50||snapshot.getJSONArray("options").length()>50)throw new IllegalArgumentException("Consulta excede limite.");
        g.put("scope","modules:"+module+":"+OfflinePolicy.digest(g.getLong("accountId")+":"+g.getLong("communityId")))
            .put("binding",binding).put("wall",System.currentTimeMillis()).put("elapsed",SystemClock.elapsedRealtime()).put("boot",boot()).put("duration",duration);
        drafts.putBounded(config(),"grant",g,131072);drafts.resume(g.getString("scope"));
        if(!preferences.edit().putBoolean("locked",false).commit())throw new IllegalStateException("Não foi possível ativar.");
    }
    JSONObject save(String scope,String id,JSONObject payload) throws Exception {
        if(payload.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8).length>3500)throw new IllegalArgumentException("Texto excede o limite de envio de 3.500 bytes.");
        ModulePayload.validate(module,payload,false);
        JSONObject row;
        if(id.isEmpty()){id=UUID.randomUUID().toString();row=new JSONObject().put("id",id).put("state","DRAFT").put("attempts",0);}
        else {row=drafts.get(scope,id);if(row==null||!"DRAFT".equals(row.getString("state")))throw new IllegalStateException("Somente rascunhos podem ser editados.");}
        row.put("payload",payload).put("module",module).put("updatedAt",System.currentTimeMillis());drafts.put(scope,id,row);return row;
    }
    void enqueue(JSONObject grant,String id) throws Exception {
        if(module.equals("cells")||!grant.getBoolean("canWrite"))throw new IllegalStateException("Sem autorização de envio neste módulo.");
        String scope=grant.getString("scope");JSONObject row=drafts.get(scope,id);if(row==null)throw new IllegalArgumentException("Rascunho não encontrado.");
        if(!"DRAFT".equals(row.getString("state")))return;
        ModulePayload.validate(module,row.getJSONObject("payload"),true);row.put("state","PENDING");drafts.put(scope,id,row);
    }
    @Override public void close(){database.close();}
}
