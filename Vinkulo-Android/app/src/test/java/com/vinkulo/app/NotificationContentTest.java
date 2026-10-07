package com.vinkulo.app;
import org.junit.Test;
import static org.junit.Assert.*;
public class NotificationContentTest {
    @Test public void keepsEachNotificationSpecificAndBoundsUnicodeText() {
        NotificationContent a = new NotificationContent("Reserva aprovada", "  Vaga A02\npara domingo. ", "/painel?view=estacionamento");
        NotificationContent b = new NotificationContent("Escala confirmada", "Recepção às 18h.", "/painel?view=escalas");
        assertTrue(a.valid()); assertNotEquals(a.title, b.title); assertNotEquals(a.body, b.body); assertEquals("Vaga A02 para domingo.", a.body);
        StringBuilder text = new StringBuilder(); for (int i=0;i<600;i++) text.append("🚗");
        String shortText = NotificationContent.text(text.toString(), 500);
        assertEquals(500, shortText.codePointCount(0, shortText.length())); assertTrue(shortText.endsWith("🚗…"));
    }
    @Test public void rejectsEmptyContentAndExternalDestinations() {
        assertFalse(new NotificationContent(null, "", null).valid());
        assertEquals("/painel", new NotificationContent("Aviso", "Mensagem", "https://evil.test").url);
    }
}
