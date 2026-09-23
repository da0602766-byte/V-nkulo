package com.vinkulo.app;

import org.junit.Test;
import static org.junit.Assert.*;

public class NativePolicyTest {
    @Test public void pushFromAnOldAccountOrWithoutBindingIsRejected() {
        String binding = "550e8400-e29b-41d4-a716-446655440000";
        assertTrue(NativePolicy.bindingMatches(binding, binding));
        assertFalse(NativePolicy.bindingMatches("", ""));
        assertFalse(NativePolicy.bindingMatches(binding, null));
        assertFalse(NativePolicy.bindingMatches(binding, "550e8400-e29b-41d4-a716-446655440001"));
        assertFalse(NativePolicy.validBinding("invalid"));
    }
    @Test public void onlyOfficialHttpsOriginCanReachNativeFeatures() {
        assertTrue(NativePolicy.trusted(NativePolicy.ORIGIN + "/painel?view=conta"));
        assertTrue(NativePolicy.trusted(NativePolicy.ORIGIN + ":443/painel"));
        for (String value : new String[]{"http://adote-gestao.da0602766.chatgpt.site", NativePolicy.ORIGIN + ".evil.test", NativePolicy.ORIGIN + ":8443", "https://user@adote-gestao.da0602766.chatgpt.site", "javascript:alert(1)", "file:///sdcard/data", "invalid", "https://evil.test"}) {
            assertFalse(value, NativePolicy.trusted(value));
        }
    }
    @Test public void framesAndOversizedMessagesCannotCallNativeBridge() {
        assertTrue(NativePolicy.allowedMessage(NativePolicy.ORIGIN, true, "{}"));
        assertFalse(NativePolicy.allowedMessage(NativePolicy.ORIGIN, false, "{}"));
        assertFalse(NativePolicy.allowedMessage("https://evil.test", true, "{}"));
        assertFalse(NativePolicy.allowedMessage(NativePolicy.ORIGIN, true, null));
        assertFalse(NativePolicy.allowedMessage(NativePolicy.ORIGIN, true, new String(new char[16385])));
    }
    @Test public void notificationLinksStayOnRecognizedRoutes() {
        for (String path : new String[]{"/painel", "/painel?view=eventos", "/comunidades", "/comunidades/teste", "/proprietario?tab=realtime"}) assertTrue(path, NativePolicy.notificationPath(path));
        for (String path : new String[]{"//evil.test", "https://evil.test", "/painel-errado", "/proprietario-malicioso", "/comunidades\\evil", "/api/auth/logout", "/painel\n", "javascript:alert(1)"}) assertFalse(path, NativePolicy.notificationPath(path));
    }
    @Test public void filenamesCannotEscapeDownloadDirectory() {
        assertEquals("documento.pdf", NativePolicy.downloadName("documento.pdf"));
        assertEquals("..-..-dados.pdf", NativePolicy.downloadName("../../dados.pdf"));
        assertEquals("documento", NativePolicy.downloadName(".."));
        assertEquals(120, NativePolicy.downloadName(new String(new char[150]).replace('\0','a')).length());
    }
}
