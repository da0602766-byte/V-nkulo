package com.vinkulo.app;
import org.junit.Test;
import static org.junit.Assert.*;

public class OfflinePolicyTest {
    @Test public void contextCannotFollowAnotherSessionOrCommunity() {
        String a = OfflinePolicy.sessionCookies("theme=dark; __Host-adote_session=a; __Host-vinkulo_community=1");
        assertEquals(a, OfflinePolicy.sessionCookies("__Host-vinkulo_community=1; __Host-adote_session=a"));
        assertNotEquals(OfflinePolicy.digest(a), OfflinePolicy.digest(OfflinePolicy.sessionCookies("__Host-adote_session=b; __Host-vinkulo_community=1")));
        assertNotEquals(OfflinePolicy.digest(a), OfflinePolicy.digest(OfflinePolicy.sessionCookies("__Host-adote_session=a; __Host-vinkulo_community=2")));
        assertEquals("", OfflinePolicy.sessionCookies("__Host-vinkulo_community=1"));
        assertEquals("", OfflinePolicy.sessionCookies("__Host-adote_session=a; __Host-adote_session=b"));
    }
    @Test public void expiryRebootAndClockChangesFailClosed() {
        assertTrue(OfflinePolicy.fresh(2000, 1100, 2, 1000, 100, 2, 5000));
        assertFalse(OfflinePolicy.fresh(2000, 1100, 3, 1000, 100, 2, 5000));
        assertFalse(OfflinePolicy.fresh(900, 1100, 2, 1000, 100, 2, 5000));
        assertFalse(OfflinePolicy.fresh(1000, 50, 2, 1000, 100, 2, 5000));
        assertFalse(OfflinePolicy.fresh(6000, 5100, 2, 1000, 100, 2, 5000));
        assertFalse(OfflinePolicy.fresh(999999, 1100, 2, 1000, 100, 2, 5000));
        assertFalse(OfflinePolicy.fresh(2000, 1100, -1, 1000, 100, -1, 5000));
    }
    @Test public void localBridgeIsOnlyForTheExactPackagedPage() {
        assertTrue(OfflinePolicy.localPage(OfflinePolicy.HOME));
        assertFalse(OfflinePolicy.localPage(NativePolicy.ORIGIN + "/painel"));
        assertFalse(OfflinePolicy.localPage("https://evil.test/mobile-app/index.html"));
        assertFalse(OfflinePolicy.localPage(NativePolicy.ORIGIN + "/mobile-app/%69ndex.html"));
        assertFalse(OfflinePolicy.localPage("file:///mobile-app/index.html"));
    }
}
