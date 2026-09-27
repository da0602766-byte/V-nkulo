package com.vinkulo.app;

import android.content.Context;
import android.os.SystemClock;
import androidx.test.core.app.ApplicationProvider;
import androidx.test.uiautomator.UiDevice;
import java.io.File;

// Disposable CI emulator and synthetic fixture only. The test runner removes
// app-specific files after tests, so the shell retains named QA evidence.
final class OfflineUiEvidence {
    static void capture(UiDevice device,String name) throws Exception {
        device.waitForIdle(); SystemClock.sleep(1500);
        device.executeShellCommand("screencap -p /sdcard/vinkulo-reader-"+name+".png");
        Context context=ApplicationProvider.getApplicationContext();
        File hierarchy=new File(context.getExternalFilesDir(null),"reader-"+name+".xml");
        device.dumpWindowHierarchy(hierarchy);
        device.executeShellCommand("cp "+hierarchy.getAbsolutePath()+" /sdcard/vinkulo-reader-"+name+".xml");
    }
    private OfflineUiEvidence() { }
}
