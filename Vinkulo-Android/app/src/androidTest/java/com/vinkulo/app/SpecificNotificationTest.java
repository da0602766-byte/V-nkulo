package com.vinkulo.app;

import android.app.Notification;
import android.app.NotificationManager;
import android.content.Context;
import android.os.Build;
import android.service.notification.StatusBarNotification;
import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.uiautomator.UiDevice;
import java.util.HashMap;
import java.util.Map;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class SpecificNotificationTest {
    @Test public void trayShowsThreeDifferentMessagesAndRevokedBindingCannotDisplay() throws Exception {
        Context context = ApplicationProvider.getApplicationContext();
        UiDevice device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());
        if (Build.VERSION.SDK_INT >= 33) device.executeShellCommand("pm grant " + context.getPackageName() + " android.permission.POST_NOTIFICATIONS");
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        String binding = "550e8400-e29b-41d4-a716-446655440000";
        try {
            FirebaseDeviceState.updateToken(context, "synthetic-notification-token");
            FirebaseDeviceState.bind(context, "synthetic-notification-token", binding);
            String[] titles = {"Reserva aprovada", "Escala confirmada", "Nova solicitação de entrada"};
            String[] bodies = {"Vaga A02 para o culto de domingo.", "Recepção: seu plantão começa às 18h.", "Ana solicitou entrada na Comunidade Esperança."};
            for (int i=0;i<3;i++) VinkuloFirebaseMessagingService.publish(context, binding, String.valueOf(910+i), new NotificationContent(titles[i], bodies[i], "/painel"));
            Map<String, Notification> posted = new HashMap<>();
            for (StatusBarNotification item : manager.getActiveNotifications()) posted.put(item.getTag(), item.getNotification());
            for (int i=0;i<3;i++) {
                Notification actual = posted.get("vinkulo-notification-"+(910+i)); assertNotNull(actual);
                assertEquals(titles[i], actual.extras.getCharSequence(Notification.EXTRA_TITLE).toString());
                assertEquals(bodies[i], actual.extras.getCharSequence(Notification.EXTRA_TEXT).toString());
                assertEquals(bodies[i], actual.extras.getCharSequence(Notification.EXTRA_BIG_TEXT).toString());
                assertEquals(Notification.VISIBILITY_PRIVATE, actual.visibility);
            }
            device.openNotification();
            OfflineUiEvidence.capture(device, "notifications");
            device.pressBack();
            FirebaseDeviceState.clearBinding(context);
            VinkuloFirebaseMessagingService.publish(context, binding, "999", new NotificationContent("Não exibir", "Vínculo revogado", "/painel"));
            assertEquals(0, manager.getActiveNotifications().length);
        } finally { FirebaseDeviceState.clearBinding(context); }
    }
}
