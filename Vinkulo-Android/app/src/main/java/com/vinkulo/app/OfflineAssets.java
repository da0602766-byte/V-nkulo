package com.vinkulo.app;

import android.content.Context;
import android.net.Uri;
import android.webkit.WebResourceResponse;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.ServiceWorkerClientCompat;
import android.webkit.WebResourceRequest;
import java.io.ByteArrayInputStream;
import java.util.HashMap;
import java.util.Map;

final class OfflineAssets {
    private final WebViewAssetLoader loader;
    OfflineAssets(Context context) {
        loader = new WebViewAssetLoader.Builder().setDomain(Uri.parse(NativePolicy.ORIGIN).getHost())
                .addPathHandler("/mobile-app/", path -> {
                    String mime;
                    switch (path) {
                        case "index.html": mime = "text/html"; break;
                        case "connection-error.html": mime = "text/html"; break;
                        case "app.js": mime = "application/javascript"; break;
                        case "theme.js": mime = "application/javascript"; break;
                        case "navigation.js": mime = "application/javascript"; break;
                        case "pending.js": mime = "application/javascript"; break;
                        case "visitors.js": mime = "application/javascript"; break;
                        case "modules.js": mime = "application/javascript"; break;
                        case "app.css": mime = "text/css"; break;
                        case "instrument-sans.woff2": mime = "font/woff2"; break;
                        default: return missing();
                    }
                    try {
                        Map<String, String> headers = new HashMap<>();
                        headers.put("Cache-Control", "no-store"); headers.put("X-Content-Type-Options", "nosniff");
                        headers.put("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
                        return new WebResourceResponse(mime, "UTF-8", 200, "OK", headers, context.getAssets().open("mobile-app/" + path));
                    } catch (java.io.IOException ignored) { return missing(); }
                }).build();
    }
    WebResourceResponse intercept(Uri uri) {
        if (!NativePolicy.trusted(uri.toString()) || !uri.getPath().startsWith("/mobile-app/")) return null;
        // Reject encoded/traversal paths; never fall through to the network for this prefix.
        if (!uri.getEncodedPath().equals(uri.getPath()) || uri.getPath().contains("..")) return missing();
        WebResourceResponse result = loader.shouldInterceptRequest(uri);
        return result == null ? missing() : result;
    }
    ServiceWorkerClientCompat workerClient() {
        return new ServiceWorkerClientCompat() {
            @Override public WebResourceResponse shouldInterceptRequest(WebResourceRequest request) {
                return intercept(request.getUrl());
            }
        };
    }
    private static WebResourceResponse missing() {
        return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", java.util.Collections.singletonMap("Cache-Control", "no-store"), new ByteArrayInputStream(new byte[0]));
    }
}
