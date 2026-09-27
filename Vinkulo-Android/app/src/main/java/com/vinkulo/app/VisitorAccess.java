package com.vinkulo.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.SystemClock;
import android.provider.Settings;
import android.webkit.CookieManager;
import org.json.JSONObject;
import java.util.UUID;

final class VisitorAccess implements AutoCloseable {
    final Context context;
    final OfflineDatabase database;
    final VisitorDrafts drafts;
    final SharedPreferences preferences;
    VisitorAccess(Context context) {
        this.context=context.getApplicationContext();database=OfflineDatabase.open(context,"vinkulo-offline.db");
        drafts=new VisitorDrafts(database,new OfflineCipher("vinkulo-offline-v1"));
        preferences=context.getSharedPreferences("visitor-offline",Context.MODE_PRIVATE);
    }
    static String cookies() {return OfflinePolicy.sessionCookies(CookieManager.getInstance().getCookie(NativePolicy.ORIGIN));}
    static String binding() {String c=cookies();return c.isEmpty()?"":OfflinePolicy.digest(c);}
    int boot() {return Settings.Global.getInt(context.getContentResolver(),Settings.Global.BOOT_COUNT,-1);}
    String device() {
        String id=preferences.getString("device","");if(!id.isEmpty())return id;
        id=UUID.randomUUID().toString();if(!preferences.edit().putString("device",id).commit())throw new IllegalStateException("Armazenamento indisponível.");return id;
    }
    static void lock(Context context) {
        context.getSharedPreferences("visitor-offline",Context.MODE_PRIVATE).edit().putBoolean("locked",true).commit();
        VisitorSyncWorker.cancel(context); // In-flight accepted requests cannot be recalled; UUID is retained.
    }
    JSONObject active() throws Exception {
        if(preferences.getBoolean("locked",true))return null;
        JSONObject grant=drafts.get("write-config","grant");if(grant==null)return null;
        if(!binding().equals(grant.getString("binding")) || !OfflinePolicy.fresh(System.currentTimeMillis(),SystemClock.elapsedRealtime(),boot(),
            grant.getLong("wall"),grant.getLong("elapsed"),grant.getInt("boot"),grant.getLong("duration")))return null;
        return grant;
    }
    void install(JSONObject grant,String expectedBinding,String device,long requestDuration) throws Exception {
        long duration=grant.getLong("expiresAt")-grant.getLong("issuedAt")-requestDuration;
        if(grant.getInt("protocol")!=1||!grant.getString("capability").equals("visitor.create")||!device.equals(grant.getString("deviceId"))
            ||grant.getLong("accountId")<=0||grant.getLong("communityId")<=0||duration<=0||duration>8*3600000L||boot()<0
            ||!grant.getString("token").matches("[a-f0-9]{64}")||grant.getString("communityName").length()>160
            ||expectedBinding.isEmpty()||!expectedBinding.equals(binding()))throw new IllegalArgumentException("Autorização inválida.");
        grant.put("scope","visitors:"+OfflinePolicy.digest(grant.getLong("accountId")+":"+grant.getLong("communityId")))
            .put("binding",expectedBinding).put("wall",System.currentTimeMillis()).put("elapsed",SystemClock.elapsedRealtime()).put("boot",boot()).put("duration",duration);
        drafts.put("write-config","grant",grant);
        if(!preferences.edit().putBoolean("locked",false).commit())throw new IllegalStateException("Não foi possível ativar.");
    }
    @Override public void close(){database.close();}
}
