package com.vinkulo.app;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.SystemClock;
import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.uiautomator.By;
import androidx.test.uiautomator.UiDevice;
import androidx.webkit.WebViewFeature;
import org.junit.Test;
import org.junit.Assume;
import org.junit.runner.RunWith;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;

/** Exercises the real network transition that previously left WebView's ERR_FAILED page visible. */
@RunWith(AndroidJUnit4.class)
public class NetworkTransitionTest {
    private final UiDevice device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());
    private final ConnectivityManager connectivity = (ConnectivityManager)
            ApplicationProvider.getApplicationContext().getSystemService(Context.CONNECTIVITY_SERVICE);

    private boolean validated() {
        Network active = connectivity.getActiveNetwork();
        NetworkCapabilities capabilities = active == null ? null : connectivity.getNetworkCapabilities(active);
        return capabilities != null && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
    }

    private boolean waitForNetwork(boolean expected) {
        long deadline = SystemClock.elapsedRealtime() + 45_000;
        while (SystemClock.elapsedRealtime() < deadline) {
            if (validated() == expected) return true;
            SystemClock.sleep(250);
        }
        return false;
    }

    private boolean waitForScreen(ActivityScenario<MainActivity> scenario, boolean local) {
        long deadline = SystemClock.elapsedRealtime() + 30_000;
        while (SystemClock.elapsedRealtime() < deadline) {
            AtomicBoolean ready = new AtomicBoolean();
            scenario.onActivity(activity -> {
                WebView view = activity.findViewById(R.id.webview);
                String url = view.getUrl();
                if (local) ready.set(OfflinePolicy.localPage(url) && view.getProgress() == 100);
                else ready.set(NativePolicy.trusted(url) && !OfflinePolicy.localPage(url)
                        && !OfflinePolicy.errorPage(url) && view.getProgress() == 100);
            });
            if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
                boolean legacyVisible = device.hasObject(By.text("Seu Vínkulo começa aqui."));
                if (local) ready.set(legacyVisible);
                else ready.set(ready.get() && !legacyVisible);
            }
            if (ready.get()) return true;
            SystemClock.sleep(250);
        }
        return false;
    }

    private String screenState(ActivityScenario<MainActivity> scenario) {
        AtomicReference<String> state = new AtomicReference<>("unavailable");
        scenario.onActivity(activity -> {
            WebView view = activity.findViewById(R.id.webview);
            state.set("url=" + view.getUrl() + ", progress=" + view.getProgress()
                    + ", webViewVisible=" + (view.getVisibility() == android.view.View.VISIBLE));
        });
        return state.get() + ", validated=" + validated() + ", legacyVisible="
                + device.hasObject(By.text("Seu Vínkulo começa aqui.")) + ", webErrorVisible="
                + device.hasObject(By.textContains("Página da Web não disponível"));
    }

    @Test public void openOnlineLoseInternetShowLocalAndReturnOnline() throws Exception {
        Assume.assumeTrue("Run only in the dedicated online-to-offline CI phase",
                "1".equals(InstrumentationRegistry.getArguments().getString("vinkulo.liveDisconnect")));
        device.executeShellCommand("svc wifi enable");
        device.executeShellCommand("svc data enable");
        assertTrue("The emulator must start with validated internet", waitForNetwork(true));
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            assertTrue("The app must open the online system while connected", waitForScreen(scenario, false));
            device.executeShellCommand("svc wifi disable");
            device.executeShellCommand("svc data disable");
            assertTrue("The emulator must lose internet", waitForNetwork(false));
            assertTrue("The local screen must replace the online WebView", waitForScreen(scenario, true));
            assertFalse("The WebView error must not be visible",
                    device.hasObject(By.textContains("Página da Web não disponível")));
            OfflineUiEvidence.capture(device, "live-disconnect");
            device.executeShellCommand("svc wifi enable");
            device.executeShellCommand("svc data enable");
            assertTrue("The emulator must reconnect", waitForNetwork(true));
            if (!waitForScreen(scenario, false)) {
                OfflineUiEvidence.capture(device, "reconnect-failure");
                fail("The app must return to the online system: " + screenState(scenario));
            }
        } finally {
            device.executeShellCommand("svc wifi disable");
            device.executeShellCommand("svc data disable");
        }
    }
}
