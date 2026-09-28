package com.vinkulo.app;

import android.content.Context;
import android.os.SystemClock;
import org.json.JSONArray;
import org.json.JSONObject;

/** Read-only projection of existing authorized queues; no second queue/cache. */
final class PendingOverview {
    interface Scheduler { void schedule(String module); }
    static JSONObject read(Context context, boolean sync, Scheduler scheduler) throws Exception {
        JSONArray sections=new JSONArray();long lifetime=8*3600000L;int ready=0,scheduled=0;
        String[] names={"visitors","requests","notes","followups","checklists","cells","parking"};
        synchronized(VisitorDrafts.MUTEX) {
            for(String name:names) {
                JSONObject section=new JSONObject().put("module",name).put("ready",false);
                try {
                    JSONObject grant;JSONArray rows;boolean canSync;
                    if(name.equals("visitors")) {
                        try(VisitorAccess access=new VisitorAccess(context)) {
                            grant=access.active();rows=grant==null?null:access.drafts.list(grant.getString("scope"));canSync=grant!=null;
                        }
                    } else {
                        try(ModuleAccess access=new ModuleAccess(context,name)) {
                            grant=access.active();rows=grant==null?null:access.drafts.list(grant.getString("scope"));
                            canSync=grant!=null&&grant.getBoolean("canWrite")&&!name.equals("cells");
                        }
                    }
                    if(grant!=null) {
                        long remaining=grant.getLong("duration")-(SystemClock.elapsedRealtime()-grant.getLong("elapsed"));
                        if(remaining>0) {
                            JSONArray entries=new JSONArray();boolean queued=false;
                            for(int i=0;i<rows.length();i++) {
                                JSONObject row=rows.getJSONObject(i);String state=row.getString("state");
                                JSONObject payload=row.getJSONObject(name.equals("visitors")?"visitor":"payload");
                                String title=name.equals("visitors")?payload.optString("nomeCompleto"):payload.optString("titulo",payload.optString("resultado",payload.optString("tipo","Rascunho salvo")));
                                JSONObject entry=new JSONObject().put("id",row.getString("id")).put("state",state)
                                    .put("title",title.substring(0,Math.min(160,title.length()))).put("updatedAt",row.optLong("updatedAt"));
                                // No full payload, contact details, tokens, scope or session binding.
                                if(row.has("message"))entry.put("message",row.optString("message").substring(0,Math.min(300,row.optString("message").length())));
                                if(state.equals("CONFIRMED"))entry.put("receipt",row.optString(name.equals("visitors")?"visitorId":"resultId",""));
                                entries.put(entry);
                                queued|=state.equals("PENDING")||state.equals("RETRY")||state.equals("SENDING");
                            }
                            boolean eligible=canSync&&queued;
                            if(sync&&eligible){scheduler.schedule(name);scheduled++;}
                            section.put("ready",true).put("communityName",grant.getString("communityName")).put("rows",entries).put("canSync",eligible);
                            ready++;lifetime=Math.min(lifetime,remaining);
                        }
                    }
                }catch(Exception error){section=new JSONObject().put("module",name).put("ready",false).put("error",true);}
                sections.put(section);
            }
        }
        return new JSONObject().put("sections",sections).put("validForMs",ready==0?0:lifetime).put("scheduled",scheduled);
    }
    private PendingOverview() { }
}
