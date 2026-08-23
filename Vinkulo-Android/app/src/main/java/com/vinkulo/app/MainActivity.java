package com.vinkulo.app;

import android.Manifest;
import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebResourceRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

public class MainActivity extends Activity {
    private static final String APP_URL = "https://adote-gestao.da0602766.chatgpt.site";
    private static final String APP_HOST = "adote-gestao.da0602766.chatgpt.site";
    private static final int FILE_PICKER = 401;
    private static final int CAMERA_PERMISSION = 402;
    private static final int NOTIFICATION_PERMISSION = 403;
    private static final String NOTIFICATION_CHANNEL = "vinkulo_alertas";
    private WebView webView;
    private ValueCallback<Uri[]> fileCallback;
    private PermissionRequest pendingCameraRequest;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        setContentView(R.layout.activity_main);
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
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleNavigation(request.getUrl());
            }

            @SuppressWarnings("deprecation")
            @Override public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleNavigation(Uri.parse(url));
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override public void onPermissionRequest(PermissionRequest request) {
                runOnUiThread(() -> handleWebPermissionRequest(request));
            }

            @Override public void onPermissionRequestCanceled(PermissionRequest request) {
                if (pendingCameraRequest == request) pendingCameraRequest = null;
            }

            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                startActivityForResult(params.createIntent(), FILE_PICKER);
                return true;
            }
        });
        createNotificationChannel();
        requestStartupPermissions();
        if (state == null) webView.loadUrl(APP_URL); else webView.restoreState(state);
    }

    private final class VinkuloBridge {
        @JavascriptInterface
        public void shareToWhatsApp(String message) {
            if (message == null || message.trim().isEmpty()) return;
            runOnUiThread(() -> openWhatsAppShare(message));
        }
    }

    private void openWhatsAppShare(String message) {
        Intent share = new Intent(Intent.ACTION_SEND);
        share.setType("text/plain");
        share.putExtra(Intent.EXTRA_TEXT, message);

        if (launchShareInPackage(share, "com.whatsapp")) return;
        if (launchShareInPackage(share, "com.whatsapp.w4b")) return;

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

    private boolean handleNavigation(Uri uri) {
        if (uri == null) return false;
        if ("https".equalsIgnoreCase(uri.getScheme()) && APP_HOST.equalsIgnoreCase(uri.getHost())) {
            return false;
        }

        try {
            Intent externalIntent;
            if ("intent".equalsIgnoreCase(uri.getScheme())) {
                externalIntent = Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME);
            } else {
                externalIntent = new Intent(Intent.ACTION_VIEW, uri);
            }
            startActivity(externalIntent);
        } catch (Exception ignored) {
            Toast.makeText(this, "Não foi possível abrir este aplicativo.", Toast.LENGTH_SHORT).show();
        }
        return true;
    }

    private void handleWebPermissionRequest(PermissionRequest request) {
        boolean asksForCamera = false;
        for (String resource : request.getResources()) {
            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)) {
                asksForCamera = true;
                break;
            }
        }

        if (!asksForCamera) {
            request.deny();
            return;
        }

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M ||
                checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            request.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
            return;
        }

        pendingCameraRequest = request;
        requestPermissions(new String[]{Manifest.permission.CAMERA}, CAMERA_PERMISSION);
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    NOTIFICATION_CHANNEL,
                    "Alertas do Vínkulo",
                    NotificationManager.IMPORTANCE_DEFAULT
            );
            channel.setDescription("Avisos e atualizações da plataforma Vínkulo");
            channel.enableVibration(true);
            getSystemService(NotificationManager.class).createNotificationChannel(channel);
        }
    }

    private void requestStartupPermissions() {
        if (Build.VERSION.SDK_INT >= 33 &&
                checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(
                    new String[]{Manifest.permission.POST_NOTIFICATIONS},
                    NOTIFICATION_PERMISSION
            );
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
                checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return;
        }
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

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;

        if (requestCode == CAMERA_PERMISSION) {
            if (pendingCameraRequest != null) {
                if (granted) {
                    pendingCameraRequest.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
                } else {
                    pendingCameraRequest.deny();
                }
                pendingCameraRequest = null;
            }
        } else if (requestCode == NOTIFICATION_PERMISSION) {
            if (granted) showNotificationEnabledConfirmation();
            requestCameraPermission();
        }
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_PICKER && fileCallback != null) {
            fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            fileCallback = null;
        }
    }

    @Override public void onBackPressed() { if (webView.canGoBack()) webView.goBack(); else super.onBackPressed(); }
    @Override protected void onSaveInstanceState(Bundle outState) { webView.saveState(outState); super.onSaveInstanceState(outState); }
}
