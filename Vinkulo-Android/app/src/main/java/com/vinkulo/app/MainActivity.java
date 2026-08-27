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

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

public class MainActivity extends Activity {
    private static final String APP_URL = "https://adote-gestao.da0602766.chatgpt.site";
    private static final int FILE_PICKER = 401;
    private static final int CAMERA_PERMISSION = 402;
    private static final int NOTIFICATION_PERMISSION = 403;
    private static final String NOTIFICATION_CHANNEL = "vinkulo_alertas";
    private WebView webView;
    private ValueCallback<Uri[]> fileCallback;
    private final ArrayDeque<PermissionRequest> pendingMediaRequests = new ArrayDeque<>();
    private boolean awaitingMediaPermissionResult;

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
                if (!request.isForMainFrame()) return false;
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
                pendingMediaRequests.remove(request);
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
        String scheme = uri.getScheme();
        // O próprio domínio do app, e qualquer outro destino http(s) (login externo,
        // checkout, redirecionamento de OAuth etc.), continuam carregando dentro da
        // WebView. Só é enviado para fora do app o que a WebView não consegue exibir
        // (tel:, mailto:, whatsapp:, intents nativos, lojas de aplicativo...).
        if ("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme)) {
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

        // Cada solicitação pendente fica na fila com os recursos que ela pediu;
        // nenhuma delas é descartada se outra chegar antes do usuário responder
        // ao diálogo de permissão do sistema.
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
