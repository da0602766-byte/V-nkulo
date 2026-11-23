package com.vinkulo.app;

import javax.net.ssl.HttpsURLConnection;
import java.net.URL;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import android.os.SystemClock;
import org.json.JSONObject;

final class VisitorHttp {
    static final class Reply {final int status;final JSONObject body;final long retryAfterMs;
        Reply(int status,JSONObject body){this(status,body,0);}
        Reply(int status,JSONObject body,long retryAfterMs){this.status=status;this.body=body;this.retryAfterMs=retryAfterMs;}}
    static Reply post(boolean prepare,JSONObject payload,String cookies,String token,String challenge) throws Exception {
        return postPath(prepare,payload,cookies,token,challenge,prepare?"/api/mobile/write-bootstrap":"/api/mobile/visitors","android-write-1",8192);
    }
    static Reply module(boolean prepare,JSONObject payload,String cookies,String token,String challenge) throws Exception {
        return postPath(prepare,payload,cookies,token,challenge,prepare?"/api/mobile/modules/prepare":"/api/mobile/modules/operations","android-modules-1",prepare?131072:8192);
    }
    private static Reply postPath(boolean prepare,JSONObject payload,String cookies,String token,String challenge,String path,String client,int limit) throws Exception {
        HttpsURLConnection c=(HttpsURLConnection)new URL(NativePolicy.ORIGIN+path).openConnection();
        long started=SystemClock.elapsedRealtime();
        try {
            c.setInstanceFollowRedirects(false);c.setConnectTimeout(8000);c.setReadTimeout(8000);c.setUseCaches(false);
            c.setRequestMethod("POST");c.setDoOutput(true);c.setRequestProperty("Content-Type","application/json");
            c.setRequestProperty("Origin",NativePolicy.ORIGIN);c.setRequestProperty("X-Vinkulo-Client",client);c.setRequestProperty("Cookie",cookies);
            if(prepare)c.setRequestProperty("X-Vinkulo-Challenge",challenge);else c.setRequestProperty("Authorization","Bearer "+token);
            byte[] request=payload.toString().getBytes(StandardCharsets.UTF_8);if(request.length>4096)throw new IllegalArgumentException("Limite de envio.");
            c.setFixedLengthStreamingMode(request.length);try(java.io.OutputStream out=c.getOutputStream()){out.write(request);}
            int code=c.getResponseCode();
            if(!String.valueOf(c.getContentType()).startsWith("application/json"))throw new java.io.IOException("Resposta indisponível.");
            ByteArrayOutputStream bytes=new ByteArrayOutputStream();
            try(InputStream in=code>=400?c.getErrorStream():c.getInputStream()) {
                if(in==null)throw new java.io.IOException("Resposta vazia.");byte[] chunk=new byte[1024];int n;
                while((n=in.read(chunk))!=-1){if(bytes.size()+n>limit||SystemClock.elapsedRealtime()-started>20000)throw new java.io.IOException("Limite da resposta.");bytes.write(chunk,0,n);}
            }
            long retryAfter=0;String raw=c.getHeaderField("Retry-After");
            if(raw!=null)try{retryAfter=Math.min(8*3600000L,Math.max(0,Long.parseLong(raw)*1000));}catch(NumberFormatException ignored){
                try{java.text.SimpleDateFormat f=new java.text.SimpleDateFormat("EEE, dd MMM yyyy HH:mm:ss zzz",java.util.Locale.US);retryAfter=Math.min(8*3600000L,Math.max(0,f.parse(raw).getTime()-System.currentTimeMillis()));}catch(Exception invalid){}
            }
            return new Reply(code,new JSONObject(bytes.toString(StandardCharsets.UTF_8.name())),retryAfter);
        }finally{c.disconnect();}
    }
}
