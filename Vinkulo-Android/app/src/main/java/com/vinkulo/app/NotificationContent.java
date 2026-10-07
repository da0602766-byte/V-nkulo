package com.vinkulo.app;

/** Display text shared by the trusted WebView bridge and authenticated push resolver. */
final class NotificationContent {
    final String title, body, url;
    NotificationContent(String title, String body, String url) {
        this.title = text(title, 120); this.body = text(body, 500);
        this.url = NativePolicy.notificationPath(url) ? url : "/painel";
    }
    static String text(String value, int limit) {
        String clean = value == null ? "" : value.replaceAll("\\s+", " ").trim();
        return clean.codePointCount(0, clean.length()) <= limit ? clean : clean.substring(0, clean.offsetByCodePoints(0, limit - 1)) + "…";
    }
    boolean valid() { return !title.isEmpty() && !body.isEmpty(); }
}
