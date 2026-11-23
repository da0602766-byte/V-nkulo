package com.vinkulo.app;

import android.app.NotificationManager;
import android.content.Context;
import android.content.SharedPreferences;

final class FirebaseDeviceState {
    private static SharedPreferences preferences(Context context) { return context.getSharedPreferences("vinkulo_fcm", Context.MODE_PRIVATE); }
    static synchronized void updateToken(Context context, String token) {
        SharedPreferences prefs = preferences(context);
        if (!token.equals(prefs.getString("token", ""))) {
            clearBinding(context);
            prefs.edit().putString("token", token).apply();
        }
    }
    static synchronized void bind(Context context, String token, String binding) {
        SharedPreferences prefs = preferences(context);
        if (!token.equals(prefs.getString("token", "")) || !NativePolicy.validBinding(binding)) return;
        if (!binding.equals(prefs.getString("binding", ""))) clearBinding(context);
        prefs.edit().putString("binding", binding).apply();
    }
    static synchronized boolean accepts(Context context, String binding) {
        return NativePolicy.bindingMatches(preferences(context).getString("binding", ""), binding);
    }
    static synchronized void clearBinding(Context context) {
        preferences(context).edit().remove("binding").apply();
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) manager.cancelAll();
    }
}
