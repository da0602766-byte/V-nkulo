package com.vinkulo.app;

import android.content.Context;
import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.uiautomator.By;
import androidx.test.uiautomator.UiDevice;
import androidx.test.uiautomator.Until;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class GlobalOfflinePolicyTest {
    @Test public void disabledPolicyShowsNativeNoticeAndSurvivesRecreation() throws Exception {
        Context context = ApplicationProvider.getApplicationContext();
        UiDevice device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());
        device.executeShellCommand("svc wifi disable"); device.executeShellCommand("svc data disable");
        context.getSharedPreferences("android-global-policy", Context.MODE_PRIVATE).edit().putBoolean("enabled", false).putLong("confirmed", System.currentTimeMillis()).commit();
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            assertTrue(device.wait(Until.hasObject(By.text("Você está sem internet")), 15000));
            assertTrue(device.hasObject(By.text("Tentar novamente")));
            assertFalse(device.hasObject(By.text("O que você quer fazer?")));
            scenario.onActivity(activity -> {
                WebView view = activity.findViewById(R.id.webview);
                assertFalse(OfflinePolicy.localPage(view.getUrl()));
                assertEquals(android.view.View.INVISIBLE, view.getVisibility());
            });
            scenario.recreate();
            assertTrue(device.wait(Until.hasObject(By.text("Você está sem internet")), 15000));
            device.findObject(By.text("Tentar novamente")).click();
            assertTrue(device.hasObject(By.text("Você está sem internet")));
            OfflineUiEvidence.capture(device, "global-offline-disabled");
        }
    }

    @Test public void disablingPolicyHidesAnAlreadyOpenLocalScreen() throws Exception {
        Context context = ApplicationProvider.getApplicationContext();
        UiDevice device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());
        device.executeShellCommand("svc wifi disable"); device.executeShellCommand("svc data disable");
        android.content.SharedPreferences preferences = context.getSharedPreferences("android-global-policy", Context.MODE_PRIVATE);
        preferences.edit().putBoolean("enabled", true).putLong("confirmed", System.currentTimeMillis()).commit();
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            android.os.SystemClock.sleep(1500);
            preferences.edit().putBoolean("enabled", false).commit();
            scenario.onActivity(activity -> {
                try {
                    java.lang.reflect.Method method = MainActivity.class.getDeclaredMethod("reconcileInternetAccess");
                    method.setAccessible(true); method.invoke(activity);
                } catch (Exception failure) { throw new AssertionError(failure); }
            });
            assertTrue(device.wait(Until.hasObject(By.text("Você está sem internet")), 15000));
            scenario.onActivity(activity -> assertEquals(android.view.View.INVISIBLE, activity.findViewById(R.id.webview).getVisibility()));
        }
    }
}
