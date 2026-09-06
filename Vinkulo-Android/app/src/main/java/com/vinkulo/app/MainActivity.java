package com.vinkulo.app;

import android.Manifest;
import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.graphics.Insets;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.browser.customtabs.CustomTabsIntent;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

public class MainActivity extends Activity {
    private static final String APP_URL = "https://adote-gestao.da0602766.chatgpt.site";
    private static final String APP_HOST = "adote-gestao.da0602766.chatgpt.site";
    private static final String GOOGLE_AUTH_HOST = "accounts.google.com";
    private static final String GOOGLE_RETURN_SCHEME = "vinkulo";
    private static final String GOOGLE_RETURN_HOST = "google-login-complete";
    private static final int FILE_PICKER = 401;
    private static final int CAMERA_PERMISSION = 402;
    private static final int NOTIFICATION_PERMISSION = 403;
    private static final String NOTIFICATION_CHANNEL = "vinkulo_alertas";
    private static final String EXTRA_NOTIFICATION_URL = "vinkulo_notification_url";
    private static final long NOTIFICATION_REFRESH_INTERVAL_MS = 20_000L;

    private WebView webView;
    private ValueCallback<Uri[]> fileCallback;
    private final ArrayDeque<PermissionRequest> pendingMediaRequests = new ArrayDeque<>();
    private boolean awaitingMediaPermissionResult;
    private final Handler notificationRefreshHandler = new Handler(Looper.getMainLooper());
    private final Runnable notificationRefresh = new Runnable() {
        @Override
        public void run() {
            dispatchNotificationRefresh();
            notificationRefreshHandler.postDelayed(this, NOTIFICATION_REFRESH_INTERVAL_MS);
        }
    };

    @Override
    public void onCreate(Bundle state) {
        super.onCreate(state);
        setContentView(R.layout.activity_main);
        applySafeSystemInsets();
        webView = findViewById(R.id.webview);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);
        webView.addJavascriptInterface(new VinkuloBridge(), "VinkuloAndroid");
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (!request.isForMainFrame()) return false;
                return handleNavigation(request.getUrl());
            }

            @SuppressWarnings("deprecation")
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleNavigation(Uri.parse(url));
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                runOnUiThread(() -> handleWebPermissionRequest(request));
            }

            @Override
            public void onPermissionRequestCanceled(PermissionRequest request) {
                pendingMediaRequests.remove(request);
            }

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                startActivityForResult(params.createIntent(), FILE_PICKER);
                return true;
            }
        });

        createNotificationChannel();
        requestStartupPermissions();
        if (state == null) {
            String coldStartPath = notificationPathFromIntent(getIntent());
            webView.loadUrl(coldStartPath != null ? APP_URL + coldStartPath : APP_URL);
        } else {
            webView.restoreState(state);
            handleNotificationTap(getIntent());
        }
        handleGoogleReturn(getIntent());
    }

    @Override
    protected void onStart() {
        super.onStart();
        notificationRefreshHandler.removeCallbacks(notificationRefresh);
        notificationRefreshHandler.post(notificationRefresh);
    }

    @Override
    protected void onStop() {
        notificationRefreshHandler.removeCallbacks(notificationRefresh);
        super.onStop();
    }

    private void applySafeSystemInsets() {
        View root = findViewById(R.id.app_root);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            getWindow().setDecorFitsSystemWindows(false);
        }
        root.setOnApplyWindowInsetsListener((view, windowInsets) -> {
            int left;
            int top;
            int right;
            int bottom;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                Insets safeInsets = windowInsets.getInsets(
                        WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                left = safeInsets.left;
                top = safeInsets.top;
                right = safeInsets.right;
                bottom = safeInsets.bottom;
            } else {
                left = windowInsets.getSystemWindowInsetLeft();
                top = windowInsets.getSystemWindowInsetTop();
                right = windowInsets.getSystemWindowInsetRight();
                bottom = windowInsets.getSystemWindowInsetBottom();
            }
            view.setPadding(left, top, right, bottom);
            return Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
                    ? WindowInsets.CONSUMED
                    : windowInsets.consumeSystemWindowInsets();
        });
        root.requestApplyInsets();
    }

    private void dispatchNotificationRefresh() {
        if (webView == null) return;
        webView.post(() -> webView.evaluateJavascript(
                "window.dispatchEvent(new Event('vinkulo:native-notification-refresh'))",
                null));
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleGoogleReturn(intent);
        handleNotificationTap(intent);
    }

    private final class VinkuloBridge {
        @JavascriptInterface
        public void shareToWhatsApp(String message) {
            if (!isTrustedWebPage() || message == null || message.trim().isEmpty()) return;
            runOnUiThread(() -> openWhatsAppShare(message));
        }

        @JavascriptInterface
        public void openGoogleAuth(String authorizationUrl) {
            if (!isTrustedWebPage()) return;
            runOnUiThread(() -> openGoogleAuthorization(authorizationUrl));
        }

        // O WebView do Android não entrega notificações de página (Notification/
        // Push API) na bandeja do sistema. Esta ponte deixa o próprio app nativo,
        // que já tem o canal e a permissão POST_NOTIFICATIONS, postar o alerta.
        @JavascriptInterface
        public void showNotification(String title, String body, String tag, String url) {
            if (!isTrustedWebPage()) return;
            runOnUiThread(() -> postNativeNotification(title, body, tag, url));
        }
    }

    private boolean isTrustedWebPage() {
        Uri current = Uri.parse(String.valueOf(webView.getUrl()));
        return "https".equalsIgnoreCase(current.getScheme()) && APP_HOST.equalsIgnoreCase(current.getHost());
    }

    private void openGoogleAuthorization(String authorizationUrl) {
        Uri target = Uri.parse(authorizationUrl == null ? "" : authorizationUrl);
        if (!"https".equalsIgnoreCase(target.getScheme()) || !GOOGLE_AUTH_HOST.equalsIgnoreCase(target.getHost())) {
            Toast.makeText(this, "O endereço de autorização do Google não é válido.", Toast.LENGTH_LONG).show();
            return;
        }
        try {
            CustomTabsIntent customTab = new CustomTabsIntent.Builder()
                    .setShowTitle(false)
                    .setUrlBarHidingEnabled(true)
                    .build();
            customTab.launchUrl(this, target);
        } catch (ActivityNotFoundException error) {
            startActivity(new Intent(Intent.ACTION_VIEW, target));
        }
    }

    private void handleGoogleReturn(Intent intent) {
        Uri data = intent == null ? null : intent.getData();
        if (data == null || !GOOGLE_RETURN_SCHEME.equalsIgnoreCase(data.getScheme()) ||
                !GOOGLE_RETURN_HOST.equalsIgnoreCase(data.getHost())) return;
        if (webView != null) {
            webView.post(() -> webView.evaluateJavascript(
                    "window.dispatchEvent(new Event('vinkulo:google-return'))", null));
        }
    }

    private void postNativeNotification(String title, String body, String tag, String url) {
        if (Build.VERSION.SDK_INT >= 33 &&
                checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;

        int notificationId = notificationIdForTag(tag);
        Intent tapIntent = new Intent(this, MainActivity.class);
        tapIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        String path = notificationPathFromValue(url);
        if (path != null) tapIntent.putExtra(EXTRA_NOTIFICATION_URL, path);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                this, notificationId, tapIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        String safeBody = body == null ? "" : body;
        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, NOTIFICATION_CHANNEL)
                : new Notification.Builder(this);
        Notification notification = builder
                .setSmallIcon(R.drawable.ic_launcher)
                .setContentTitle(title == null || title.trim().isEmpty() ? "Vínkulo" : title)
                .setContentText(safeBody)
                .setStyle(new Notification.BigTextStyle().bigText(safeBody))
                .setAutoCancel(true)
                .setContentIntent(pendingIntent)
                .build();
        ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).notify(notificationId, notification);
    }

    private int notificationIdForTag(String tag) {
        return tag == null || tag.isEmpty() ? 1200 : 1200 + Math.floorMod(tag.hashCode(), 100000);
    }

    private void handleNotificationTap(Intent intent) {
        String path = notificationPathFromIntent(intent);
        if (path == null || webView == null) return;
        webView.post(() -> webView.evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('vinkulo:notification-open', { detail: "
                        + toJsStringLiteral(path) + " }))",
                null));
    }

    private String notificationPathFromIntent(Intent intent) {
        return intent == null ? null : notificationPathFromValue(intent.getStringExtra(EXTRA_NOTIFICATION_URL));
    }

    private String notificationPathFromValue(String value) {
        return value != null && isSafeNotificationPath(value) ? value : null;
    }

    private boolean isSafeNotificationPath(String value) {
        return value.startsWith("/painel?") || value.startsWith("/comunidades") || value.startsWith("/proprietario");
    }

    private static String toJsStringLiteral(String value) {
        StringBuilder out = new StringBuilder("'");
        String safe = value == null ? "" : value;
        for (int i = 0; i < safe.length(); i++) {
            char c = safe.charAt(i);
            if (c == '\\' || c == '\'') out.append('\\');
            if (c == '\n') { out.append("\\n"); continue; }
            if (c == '\r') { out.append("\\r"); continue; }
            out.append(c);
        }
        return out.append('\'').toString();
    }

    private boolean handleNavigation(Uri uri) {
        if (uri == null) return false;
        String scheme = uri.getScheme();
        if ("https".equalsIgnoreCase(scheme)) {
            String host = uri.getHost();
            if (APP_HOST.equalsIgnoreCase(host)) return false;
            if (GOOGLE_AUTH_HOST.equalsIgnoreCase(host)) {
                openGoogleAuthorization(uri.toString());
                return true;
            }
            openExternal(uri);
            return true;
        }
        if ("http".equalsIgnoreCase(scheme)) {
            openExternal(uri);
            return true;
        }

        try {
            Intent externalIntent = "intent".equalsIgnoreCase(scheme)
                    ? Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME)
                    : new Intent(Intent.ACTION_VIEW, uri);
            startActivity(externalIntent);
        } catch (Exception ignored) {
            Toast.makeText(this, "Não foi possível abrir este aplicativo.", Toast.LENGTH_SHORT).show();
        }
        return true;
    }

    private void openExternal(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException ignored) {
            Toast.makeText(this, "Não foi possível abrir este endereço.", Toast.LENGTH_SHORT).show();
        }
    }

    private void openWhatsAppShare(String message) {
        Intent share = new Intent(Intent.ACTION_SEND);
        share.setType("text/plain");
        share.putExtra(Intent.EXTRA_TEXT, message);
        if (launchShareInPackage(share, "com.whatsapp") || launchShareInPackage(share, "com.whatsapp.w4b")) return;

        Toast.makeText(this, "Instale o WhatsApp para compartilhar.", Toast.LENGTH_LONG).show();
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=com.whatsapp")));
        } catch (ActivityNotFoundException ignored) {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=com.whatsapp")));
        }
    }

    private boolean launchShareInPackage(Intent baseIntent, String packageName) {
        Intent targeted = new Intent(baseIntent);
        targeted.setPackage(packageName);
        try {
            startActivity(targeted);
            return true;
        } catch (ActivityNotFoundException ignored) {
            return false;
        }
    }

    private void handleWebPermissionRequest(PermissionRequest request) {
        List<String> resources = Arrays.asList(request.getResources());
        boolean wantsVideo = resources.contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE);
        boolean wantsAudio = resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE);
        if (!wantsVideo && !wantsAudio) {
            request.deny();
            return;
        }

        List<String> missing = new ArrayList<>();
        if (wantsVideo && !hasRuntimePermission(Manifest.permission.CAMERA)) missing.add(Manifest.permission.CAMERA);
        if (wantsAudio && !hasRuntimePermission(Manifest.permission.RECORD_AUDIO)) missing.add(Manifest.permission.RECORD_AUDIO);
        if (missing.isEmpty()) {
            grantMediaRequest(request, wantsVideo, wantsAudio);
            return;
        }

        pendingMediaRequests.add(request);
        if (!awaitingMediaPermissionResult) {
            awaitingMediaPermissionResult = true;
            requestPermissions(missing.toArray(new String[0]), CAMERA_PERMISSION);
        }
    }

    private boolean hasRuntimePermission(String permission) {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.M ||
                checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED;
    }

    private void grantMediaRequest(PermissionRequest request, boolean wantsVideo, boolean wantsAudio) {
        List<String> granted = new ArrayList<>();
        if (wantsVideo && hasRuntimePermission(Manifest.permission.CAMERA)) granted.add(PermissionRequest.RESOURCE_VIDEO_CAPTURE);
        if (wantsAudio && hasRuntimePermission(Manifest.permission.RECORD_AUDIO)) granted.add(PermissionRequest.RESOURCE_AUDIO_CAPTURE);
        if (granted.isEmpty()) request.deny(); else request.grant(granted.toArray(new String[0]));
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    NOTIFICATION_CHANNEL,
                    "Alertas do Vínkulo",
                    NotificationManager.IMPORTANCE_DEFAULT);
            channel.setDescription("Avisos e atualizações da plataforma Vínkulo");
            channel.enableVibration(true);
            getSystemService(NotificationManager.class).createNotificationChannel(channel);
        }
    }

    private void requestStartupPermissions() {
        if (Build.VERSION.SDK_INT >= 33 &&
                checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATION_PERMISSION);
        } else {
            requestCameraPermission();
        }
    }

    private void requestCameraPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M &&
                checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.CAMERA}, CAMERA_PERMISSION);
        }
    }

    private void showNotificationEnabledConfirmation() {
        if (Build.VERSION.SDK_INT >= 33 &&
                checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        if (getPreferences(MODE_PRIVATE).getBoolean("notification_confirmation_shown", false)) return;

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, NOTIFICATION_CHANNEL)
                : new Notification.Builder(this);
        Notification notification = builder
                .setSmallIcon(R.drawable.ic_launcher)
                .setContentTitle("Notificações ativadas")
                .setContentText("O Vínkulo pode exibir alertas neste celular.")
                .setAutoCancel(true)
                .build();
        ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).notify(1101, notification);
        getPreferences(MODE_PRIVATE).edit().putBoolean("notification_confirmation_shown", true).apply();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
        if (requestCode == CAMERA_PERMISSION) {
            awaitingMediaPermissionResult = false;
            while (!pendingMediaRequests.isEmpty()) {
                PermissionRequest pending = pendingMediaRequests.poll();
                List<String> resources = Arrays.asList(pending.getResources());
                grantMediaRequest(
                        pending,
                        resources.contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE),
                        resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE));
            }
        } else if (requestCode == NOTIFICATION_PERMISSION) {
            if (granted) showNotificationEnabledConfirmation();
            requestCameraPermission();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_PICKER && fileCallback != null) {
            fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            fileCallback = null;
        }
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) webView.goBack(); else super.onBackPressed();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }
}
