package com.vinkulo.app;
import org.junit.Test;
import static org.junit.Assert.*;

public class RemoteOfflinePolicyTest {
    @Test public void siteReachabilityOverridesMissingAndroidValidation() {
        assertTrue(RemoteOfflinePolicy.online(true, false, true));
        assertTrue(RemoteOfflinePolicy.online(true, true, false));
        assertFalse(RemoteOfflinePolicy.online(false, true, true));
        assertFalse(RemoteOfflinePolicy.online(true, false, false));
    }
    @Test public void disabledUnknownExpiredAndClockRollbackCannotOpenOffline() {
        assertFalse(RemoteOfflinePolicy.fresh(false, 100, 101));
        assertFalse(RemoteOfflinePolicy.fresh(true, 0, 101));
        assertFalse(RemoteOfflinePolicy.fresh(true, 100, 99));
        assertFalse(RemoteOfflinePolicy.fresh(true, 100, 86_400_100));
        assertTrue(RemoteOfflinePolicy.fresh(true, 100, 101));
    }
}
