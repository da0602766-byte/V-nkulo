package com.vinkulo.app;

import android.Manifest;
import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.PermissionRequest;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {
    private static final String APP_URL = "https://adote-gestao.da0602766.chatgpt.site";
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
        webView.setWebViewClient(new WebViewClient());
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
        requestNotificationPermission();
        if (state == null) webView.loadUrl(APP_URL); else webView.restoreState(state);
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

    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33 &&
                checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(
                    new String[]{Manifest.permission.POST_NOTIFICATIONS},
                    NOTIFICATION_PERMISSION
            );
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

        if (requestCode == CAMERA_PERMISSION && pendingCameraRequest != null) {
            if (granted) {
                pendingCameraRequest.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
            } else {
                pendingCameraRequest.deny();
            }
            pendingCameraRequest = null;
        } else if (requestCode == NOTIFICATION_PERMISSION && granted) {
            showNotificationEnabledConfirmation();
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
