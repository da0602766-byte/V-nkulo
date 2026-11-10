package com.vinkulo.app;

import java.net.URI;

/** Pure policy shared by navigation, native messages, camera and downloads. */
final class NativePolicy {
    static final String ORIGIN = "https://vinkulo.da0602766.chatgpt.site";
    private NativePolicy() {}
    static boolean validBinding(String value) { return value != null && value.matches("[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}"); }
    static boolean bindingMatches(String current, String received) { return validBinding(current) && current.equals(received); }

    static boolean trusted(String value) {
        try {
            URI uri = new URI(value);
            return "https".equalsIgnoreCase(uri.getScheme())
                    && URI.create(ORIGIN).getHost().equalsIgnoreCase(uri.getHost())
                    && uri.getRawUserInfo() == null && (uri.getPort() == -1 || uri.getPort() == 443);
        } catch (Exception ignored) { return false; }
    }

    static boolean allowedMessage(String origin, boolean mainFrame, String data) {
        return mainFrame && trusted(origin) && data != null && data.length() <= 16_384;
    }

    static boolean notificationPath(String value) {
        if (value == null || value.length() > 500 || value.indexOf('\\') >= 0) return false;
        try {
            URI uri = new URI(value);
            if (uri.isAbsolute() || uri.getRawAuthority() != null) return false;
            String path = uri.getPath();
            return "/painel".equals(path) || "/proprietario".equals(path)
                    || "/comunidades".equals(path) || (path != null && path.startsWith("/comunidades/"));
        } catch (Exception ignored) { return false; }
    }

    static String downloadName(String value) {
        String name = value == null ? "documento" : value.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "-").trim();
        if (name.isEmpty() || name.equals(".") || name.equals("..")) name = "documento";
        return name.substring(0, Math.min(name.length(), 120));
    }
}
