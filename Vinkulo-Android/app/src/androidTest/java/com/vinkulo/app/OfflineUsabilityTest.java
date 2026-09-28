package com.vinkulo.app;

import android.content.Context;
import android.os.Build;
import android.os.SystemClock;
import androidx.test.core.app.ActivityScenario;
import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.uiautomator.By;
import androidx.test.uiautomator.UiDevice;
import androidx.webkit.WebViewFeature;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import static org.junit.Assert.*;
import static org.junit.Assume.assumeTrue;

@RunWith(AndroidJUnit4.class)
public class OfflineUsabilityTest {
    private final Context context=ApplicationProvider.getApplicationContext();

    @Test public void localScreenSupportsLargeTextAnchorsKeyboardAndBackWithoutStartupPrompt() throws Exception {
        assumeTrue(WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER));
        UiDevice device=UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)) {
            await(scenario,"document.readyState==='complete'&&location.pathname==='/mobile-app/index.html'");
            if(Build.VERSION.SDK_INT>=33) {
                SystemClock.sleep(600);
                assertFalse("Notification permission must not cover startup",device.hasObject(By.pkg("com.android.permissioncontroller")));
            }
            assertEquals("true",evaluate(scenario,"(function(){document.documentElement.style.fontSize='200%';var controls=[].slice.call(document.querySelectorAll('button,a,input,select,textarea')).filter(function(x){return !x.hidden&&x.getClientRects().length});return document.documentElement.scrollWidth<=innerWidth+1&&controls.every(function(x){return x.getBoundingClientRect().height>=48;});})()"));
            evaluate(scenario,"document.querySelector('a[href=\"#module-section\"]').click()");
            await(scenario,"location.hash==='#module-section'&&document.activeElement.id==='screen-title'&&!document.getElementById('module-menu').hidden");
            device.pressBack();
            await(scenario,"location.hash===''||location.hash==='#top'");

            evaluate(scenario,"window.VinkuloNavigation.go('#visitor-section');document.getElementById('visitor-workspace').hidden=false;document.getElementById('visitor-name').scrollIntoView({block:'center'});");
            JSONArray point=new JSONArray(evaluate(scenario,"(function(){var e=document.getElementById('visitor-name'),r=e.getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2,innerWidth,innerHeight];})()"));
            int[] origin={0,0};int[] width={1};scenario.onActivity(a->{android.webkit.WebView view=a.findViewById(R.id.webview);view.getLocationOnScreen(origin);width[0]=view.getWidth();});
            double scale=width[0]/point.getDouble(2);assertTrue(device.click(origin[0]+(int)(point.getDouble(0)*scale),origin[1]+(int)(point.getDouble(1)*scale)));
            device.executeShellCommand("input text Teste");SystemClock.sleep(500);
            String ime=device.executeShellCommand("dumpsys input_method");
            assertTrue("Keyboard was not shown for the focused form control",ime.contains("mInputShown=true")||ime.contains("showRequested=true")||ime.contains("mImeShowing=true"));
            device.pressBack();SystemClock.sleep(300);
            assertEquals("true",evaluate(scenario,"document.getElementById('visitor-name').value.indexOf('Teste')>=0&&!document.getElementById('visitor-workspace').hidden"));
            OfflineUiEvidence.capture(device,"usability-large-text-keyboard");
        }
    }

    @Test public void listBatchingIsComparedWithTwentySamplesInTheSameWebView() throws Exception {
        assumeTrue(WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER));
        UiDevice device=UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)) {
            await(scenario,"document.readyState==='complete'&&location.pathname==='/mobile-app/index.html'");
            String script="(function(){var host=document.createElement('div');host.style.cssText='position:absolute;left:-10000px;width:320px';document.body.appendChild(host);"
                +"function item(i){var a=document.createElement('article'),h=document.createElement('h3'),p=document.createElement('p');h.textContent='Registro '+i;p.textContent='Conteúdo fictício para medir a lista';a.appendChild(h);a.appendChild(p);return a;}"
                +"function run(batch){host.textContent='';var start=performance.now(),target=batch?document.createDocumentFragment():host;for(var i=0;i<100;i++)target.appendChild(item(i));if(batch)host.appendChild(target);var height=host.offsetHeight;return performance.now()-start+(height<0?1:0);}"
                +"var direct=[],batched=[];for(var n=0;n<25;n++){var a,b;if(n%2){b=run(true);a=run(false);}else{a=run(false);b=run(true);}if(n>=5){direct.push(a);batched.push(b);}}"
                +"function q(values,p){var v=values.slice().sort(function(a,b){return a-b});return v[Math.ceil(v.length*p)-1];}host.remove();return JSON.stringify({records:100,samples:20,directConnectedAppends:100,batchedConnectedAppends:1,directMs:direct,batchedMs:batched,directP50:q(direct,.5),directP95:q(direct,.95),batchedP50:q(batched,.5),batchedP95:q(batched,.95)});})()";
            JSONObject result=new JSONObject(new JSONArray("["+evaluate(scenario,script)+"]").getString(0));
            assertEquals(20,result.getJSONArray("directMs").length());
            assertEquals(20,result.getJSONArray("batchedMs").length());
            assertEquals(100,result.getInt("directConnectedAppends"));
            assertEquals(1,result.getInt("batchedConnectedAppends"));
            result.put("api",Build.VERSION.SDK_INT).put("webView",android.webkit.WebView.getCurrentWebViewPackage().versionName);
            File evidence=new File(context.getExternalFilesDir(null),"usability-performance.json");
            try(FileOutputStream output=new FileOutputStream(evidence)){output.write(result.toString(2).getBytes(StandardCharsets.UTF_8));}
            device.executeShellCommand("cp "+evidence.getAbsolutePath()+" /sdcard/vinkulo-reader-usability-performance.json");
        }
    }

    private String evaluate(ActivityScenario<MainActivity> scenario,String script) throws Exception {
        CountDownLatch done=new CountDownLatch(1);String[] value={null};
        scenario.onActivity(a->((android.webkit.WebView)a.findViewById(R.id.webview)).evaluateJavascript(script,result->{value[0]=result;done.countDown();}));
        assertTrue("WebView evaluation timed out",done.await(5,TimeUnit.SECONDS));return value[0];
    }
    private void await(ActivityScenario<MainActivity> scenario,String script) throws Exception {
        long end=SystemClock.elapsedRealtime()+15000;
        while(SystemClock.elapsedRealtime()<end){if("true".equals(evaluate(scenario,script)))return;SystemClock.sleep(150);}
        fail("DOM did not reach expected usability state: "+script);
    }
}
