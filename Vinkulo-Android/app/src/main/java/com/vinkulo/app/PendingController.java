package com.vinkulo.app;

import android.app.Activity;
import android.os.SystemClock;
import org.json.JSONObject;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Consumer;

final class PendingController {
    private final Activity activity;
    private final ExecutorService executor=Executors.newSingleThreadExecutor();
    private final AtomicLong generation=new AtomicLong();private volatile boolean closed;
    PendingController(Activity activity){this.activity=activity;}
    void invalidate(){
        generation.incrementAndGet();
        activity.runOnUiThread(()->{
            if(closed)return;
            android.webkit.WebView view=activity.findViewById(R.id.webview);
            if(view!=null&&OfflinePolicy.localPage(view.getUrl()))view.evaluateJavascript("window.VinkuloPendingScreen&&window.VinkuloPendingScreen.invalidate()",null);
        });
    }
    void close(){closed=true;invalidate();executor.shutdown();}
    void command(String action,Consumer<JSONObject> callback){
        if(closed||(!action.equals("status")&&!action.equals("sync")))return;
        long ticket=generation.get();String binding=VisitorAccess.binding();
        executor.execute(()->{
            JSONObject result;long started=SystemClock.elapsedRealtime();
            try {
                if(closed||ticket!=generation.get()||!binding.equals(VisitorAccess.binding()))return;
                result=PendingOverview.read(activity,action.equals("sync"),module->{
                    if(closed||ticket!=generation.get()||!binding.equals(VisitorAccess.binding()))throw new IllegalStateException("Context changed");
                    if(module.equals("visitors"))VisitorSyncWorker.schedule(activity);else ModuleSyncWorker.schedule(activity,module);
                });
            }catch(Exception error){result=new JSONObject();try{result.put("error",true);}catch(Exception ignored){}}
            final JSONObject response=result;
            activity.runOnUiThread(()->{
                if(closed||ticket!=generation.get()||!binding.equals(VisitorAccess.binding()))return;
                try {
                    long remaining=response.optLong("validForMs")-(SystemClock.elapsedRealtime()-started);
                    if(response.optLong("validForMs")>0&&remaining<=0){callback.accept(new JSONObject().put("error",true));return;}
                    response.put("validForMs",Math.max(0,remaining));callback.accept(response);
                }catch(Exception ignored){}
            });
        });
    }
}
