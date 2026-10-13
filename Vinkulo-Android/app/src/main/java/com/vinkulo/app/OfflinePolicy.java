package com.vinkulo.app;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Map;
import java.util.TreeMap;

final class OfflinePolicy {
    static final String HOME = NativePolicy.ORIGIN + "/mobile-app/index.html";
    static final String CONNECTION_ERROR = NativePolicy.ORIGIN + "/mobile-app/connection-error.html";
    static final long MAX_AGE = 86_400_000L;
    private OfflinePolicy() { }

    static boolean localPage(String url) {
        return NativePolicy.trusted(url) && "/mobile-app/index.html".equals(URI.create(url).getRawPath());
    }

    static boolean manualMode(String url) {
        if (!localPage(url)) return false;
        String query = URI.create(url).getRawQuery();
        if (query == null) return false;
        for (String part : query.split("&")) if ("mode=manual".equals(part)) return true;
        return false;
    }

    static boolean errorPage(String url) {
        return NativePolicy.trusted(url) && "/mobile-app/connection-error.html".equals(URI.create(url).getRawPath());
    }

    static String sessionCookies(String raw) {
        Map<String, String> selected = new TreeMap<>();
        for (String part : (raw == null ? "" : raw).split(";")) {
            String[] pair = part.trim().split("=", 2);
            if (pair.length == 2 && (pair[0].equals("__Host-adote_session") || pair[0].equals("__Host-vinkulo_community"))) {
                if (selected.put(pair[0], pair[1]) != null) return "";
            }
        }
        if (!selected.containsKey("__Host-adote_session") || selected.get("__Host-adote_session").isEmpty()) return "";
        StringBuilder result = new StringBuilder();
        for (Map.Entry<String, String> entry : selected.entrySet()) {
            if (result.length() > 0) result.append("; ");
            result.append(entry.getKey()).append('=').append(entry.getValue());
        }
        return result.toString();
    }

    static String digest(String value) {
        try {
            byte[] bytes = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder out = new StringBuilder();
            for (byte b : bytes) out.append(String.format(java.util.Locale.ROOT, "%02x", b & 255));
            return out.toString();
        } catch (java.security.NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
    }

    static boolean fresh(long nowWall, long nowElapsed, int nowBoot, long savedWall, long savedElapsed,
                         int savedBoot, long duration) {
        if (nowBoot < 0 || nowBoot != savedBoot || duration <= 0 || duration > MAX_AGE || nowElapsed < savedElapsed) return false;
        long elapsed = nowElapsed - savedElapsed;
        long wallElapsed = nowWall - savedWall;
        // Expire on reboot, clock rollback/large change, or the grant deadline.
        return elapsed < duration && wallElapsed >= 0 && Math.abs(wallElapsed - elapsed) <= 120_000;
    }
}
