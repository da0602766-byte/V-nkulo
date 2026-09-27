package com.vinkulo.app;

import android.Manifest;
import android.app.Activity;
import android.app.DownloadManager;
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
import android.os.Environment;
import android.graphics.Insets;
import android.graphics.Bitmap;
import com.google.firebase.messaging.FirebaseMessaging;
import com.google.firebase.FirebaseApp;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebResourceError;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.URLUtil;
import android.widget.Toast;

import androidx.browser.customtabs.CustomTabsIntent;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import androidx.webkit.WebMessageCompat;
import androidx.webkit.ServiceWorkerControllerCompat;
import org.json.JSONObject;
import org.json.JSONException;
import java.util.Collections;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

public class MainActivity extends Activity {
    private static final String APP_URL = "https://adote-gestao.da0602766.chatgpt.site";
    private static final String GOOGLE_AUTH_HOST = "accounts.google.com";
    private static final String GOOGLE_RETURN_SCHEME = "vinkulo";
    private static final String GOOGLE_RETURN_HOST = "google-login-complete";
    private static final int FILE_PICKER = 401;
    private static final int CAMERA_PERMISSION = 402;
    private static final int NOTIFICATION_PERMISSION = 403;
    private static final String NOTIFICATION_CHANNEL = "vinkulo_alertas";
    private static final String EXTRA_NOTIFICATION_URL = "vinkulo_notification_url";

    private WebView webView;
    private OfflineController offline;
    private VisitorController visitors;
    private ModuleController modules;
    private OfflineAssets offlineAssets;
    private View legacyOfflineView;
    private ValueCallback<Uri[]> fileCallback;
    private final ArrayDeque<PermissionRequest> pendingMediaRequests = new ArrayDeque<>();
    private boolean awaitingMediaPermissionResult;

    @Override
    public void onCreate(Bundle state) {
        super.onCreate(state);
        setContentView(R.layout.activity_main);
        applySafeSystemInsets();
        webView = findViewById(R.id.webview);
        // Navigation is restored explicitly below, not again by View hierarchy
        // restoration after onCreate (which can replace the new local document).
        webView.setSaveEnabled(false);
        offlineAssets = new OfflineAssets(getApplicationContext());
        visitors = new VisitorController(this);
        modules = new ModuleController(this);
        offline = new OfflineController(this, () -> {
            if (webView != null && OfflinePolicy.localPage(webView.getUrl())) {
                webView.evaluateJavascript("window.dispatchEvent(new Event('vinkulo:offline-status'))", null);
            }
        });
        if (WebViewFeature.isFeatureSupported(WebViewFeature.SERVICE_WORKER_BASIC_USAGE)) {
            ServiceWorkerControllerCompat.getInstance().setServiceWorkerClient(offlineAssets.workerClient());
        }

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false);
        installNativeBridge();
        installOfflineBridge();
        installVisitorBridge();
        installModuleBridge();
        webView.setDownloadListener((url, userAgent, disposition, mimeType, length) ->
                downloadDocument(url, userAgent, disposition, mimeType));
        webView.setWebViewClient(new WebViewClient() {
            @Override public void onPageStarted(WebView view, String url, Bitmap icon) {
                if (NativePolicy.trusted(url)) {
                    String path = Uri.parse(url).getPath();
                    if ("/api/auth/logout".equals(path) || "/login".equals(path)) {
                        FirebaseDeviceState.clearBinding(MainActivity.this);
                        offline.lock();
                        visitors.lock();
                        modules.lock();
                    }
                }
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                if (NativePolicy.trusted(request.getUrl().toString()) && "/api/auth/logout".equals(request.getUrl().getPath())) { offline.lock(); visitors.lock(); modules.lock(); }
                return offlineAssets.intercept(request.getUrl());
            }
            @Override public void onPageFinished(WebView view, String url) {
                if (NativePolicy.trusted(url) && "/painel".equals(Uri.parse(url).getPath())) offline.refresh(false);
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame() && NativePolicy.trusted(request.getUrl().toString()) && !OfflinePolicy.localPage(request.getUrl().toString())) {
                    showOfflineEntry();
                }
            }
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
                try { startActivityForResult(params.createIntent(), FILE_PICKER); }
                catch (ActivityNotFoundException error) {
                    fileCallback.onReceiveValue(null);
                    fileCallback = null;
                    Toast.makeText(MainActivity.this, "Nenhum seletor de arquivos disponível.", Toast.LENGTH_LONG).show();
                }
                return true;
            }
        });

        createNotificationChannel();
        requestStartupPermissions();
        if (state == null) {
            String coldStartPath = notificationPathFromIntent(getIntent());
            if (coldStartPath != null) webView.loadUrl(APP_URL + coldStartPath);
            else showOfflineEntry();
        } else if (state.getBoolean("vinkulo.localOffline", false) || state.getBoolean("vinkulo.legacyOffline", false)) {
            // The local reader has no navigation/form state to restore. Loading
            // after restoreState races the renderer's own history restoration.
            // Recreate it directly and ask native storage for authorized data.
            showOfflineEntry();
            handleNotificationTap(getIntent());
        } else {
            android.webkit.WebBackForwardList restored = webView.restoreState(state);
            // restoreState restores navigation history, not guaranteed display
            // data. Recreate the stateless local document and its native bridge
            // explicitly; identity is always read again from protected storage.
            if (state.getBoolean("vinkulo.legacyOffline", false) || restored == null || restored.getCurrentItem() == null
                    || OfflinePolicy.localPage(restored.getCurrentItem().getUrl())) showOfflineEntry();
            handleNotificationTap(getIntent());
        }
        handleGoogleReturn(getIntent());
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) { webView.onResume(); dispatchNotificationRefresh(); }
    }

    @Override
    protected void onPause() {
        if (webView != null) webView.onPause();
        CookieManager.getInstance().flush();
        super.onPause();
    }

    // pauseTimers is process-global and pauses parsing/layout of replacement
    // WebViews too. Use per-view lifecycle and foreground-only JS polling,
    // avoiding a global pause during Activity recreation/destruction.

    @Override protected void onDestroy() {
        if (offline != null) offline.close();
        if (visitors != null) visitors.close();
        if (modules != null) modules.close();
        if (fileCallback != null) { fileCallback.onReceiveValue(null); fileCallback = null; }
        while (!pendingMediaRequests.isEmpty()) pendingMediaRequests.poll().deny();
        if (webView != null) {
            webView.stopLoading();
            ((android.view.ViewGroup) webView.getParent()).removeView(webView);
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
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
                        WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
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
        if (webView == null || !NativePolicy.trusted(webView.getUrl())) return;
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

    private void installNativeBridge() {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)
                || !WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            Toast.makeText(this, "Atualize o Android System WebView para usar os recursos nativos do Vínkulo.", Toast.LENGTH_LONG).show();
            return;
        }
        WebViewCompat.addWebMessageListener(webView, "VinkuloNative", Collections.singleton(APP_URL),
                (view, message, origin, mainFrame, reply) -> {
                    if (message.getType() != WebMessageCompat.TYPE_STRING ||
                            !NativePolicy.allowedMessage(origin.toString(), mainFrame, message.getData())) return;
                    try {
                        JSONObject data = new JSONObject(message.getData());
                        switch (data.optString("action")) {
                            case "share":
                                String text = data.optString("text");
                                if (!text.trim().isEmpty() && text.length() <= 8000) openWhatsAppShare(text);
                                break;
                            case "google": openGoogleAuthorization(data.optString("url")); break;
                            case "push-token":
                                FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
                                    if (!task.isSuccessful() || isFinishing() || isDestroyed()) return;
                                    String token = task.getResult();
                                    FirebaseDeviceState.updateToken(MainActivity.this, token);
                                    boolean permission = Build.VERSION.SDK_INT < 33 || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
                                    NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
                                    permission = permission && manager != null && manager.areNotificationsEnabled();
                                    if (!permission) FirebaseDeviceState.clearBinding(MainActivity.this);
                                    try {
                                        JSONObject result = new JSONObject().put("token", token).put("permission", permission)
                                                .put("projectId", FirebaseApp.getInstance().getOptions().getProjectId());
                                        reply.postMessage(result.toString());
                                    } catch (JSONException | IllegalStateException ignored) { }
                                });
                                break;
                            case "push-bind": FirebaseDeviceState.bind(MainActivity.this, data.optString("token"), data.optString("bindingId")); break;
                            case "push-clear": FirebaseDeviceState.clearBinding(MainActivity.this); break;
                            case "notification":
                                postNativeNotification("Vínkulo", "Você recebeu uma atualização. Abra o Vínkulo para consultar.",
                                        data.optString("tag"), data.optString("url"));
                                break;
                            default: break;
                        }
                    } catch (JSONException ignored) { /* Ignore malformed messages without logging their content. */ }
                });
        String script = "if(window===window.top){VinkuloNative.onmessage=function(e){try{window.dispatchEvent(new CustomEvent('vinkulo:fcm-token',{detail:JSON.parse(e.data)}));}catch(ignore){}};window.VinkuloAndroid=Object.freeze({version:'1.12.0',"
                + "requestPushToken:function(){VinkuloNative.postMessage(JSON.stringify({action:'push-token'}));},"
                + "setPushBinding:function(token,bindingId){VinkuloNative.postMessage(JSON.stringify({action:'push-bind',token:token,bindingId:bindingId}));},"
                + "clearPushBinding:function(){VinkuloNative.postMessage(JSON.stringify({action:'push-clear'}));},"
                + "shareToWhatsApp:function(text){VinkuloNative.postMessage(JSON.stringify({action:'share',text:text}));},"
                + "openGoogleAuth:function(url){VinkuloNative.postMessage(JSON.stringify({action:'google',url:url}));},"
                + "showNotification:function(title,body,tag,url){VinkuloNative.postMessage(JSON.stringify({action:'notification',tag:tag,url:url}));}"
                + "});}";
        WebViewCompat.addDocumentStartJavaScript(webView, script, Collections.singleton(APP_URL));
    }

    private void hideLegacyOfflineEntry() {
        if (legacyOfflineView != null) {
            ((android.widget.FrameLayout) findViewById(R.id.app_root)).removeView(legacyOfflineView);
            legacyOfflineView = null;
        }
        webView.setVisibility(View.VISIBLE);
    }

    private void showOfflineEntry() {
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            hideLegacyOfflineEntry(); webView.loadUrl(OfflinePolicy.HOME); return;
        }
        // An obsolete renderer must not be responsible for drawing its own
        // update warning. This native fallback has no access to private data.
        if (legacyOfflineView != null) return;
        webView.stopLoading(); webView.setVisibility(View.GONE);
        android.widget.ScrollView scroll = new android.widget.ScrollView(this);
        android.widget.LinearLayout content = new android.widget.LinearLayout(this);
        content.setOrientation(android.widget.LinearLayout.VERTICAL);
        int spacing = (int) (24 * getResources().getDisplayMetrics().density);
        content.setPadding(spacing, spacing, spacing, spacing);
        scroll.setBackgroundColor(android.graphics.Color.rgb(244, 247, 245));
        for (String label : new String[]{"Seu Vínkulo começa aqui.", "Atualize o Android System WebView",
                "Esta orientação abre sem internet. Para usar a preparação protegida e os recursos nativos, atualize o WebView pela loja do aparelho."}) {
            android.widget.TextView text = new android.widget.TextView(this);
            text.setText(label); text.setTextSize(label.startsWith("Seu ") ? 28 : 18);
            text.setTextColor(android.graphics.Color.rgb(38, 54, 59)); text.setPadding(0, 0, 0, spacing);
            content.addView(text);
        }
        android.widget.Button update = new android.widget.Button(this);
        update.setText("Atualizar WebView");
        update.setOnClickListener(v -> openExternal(Uri.parse("https://play.google.com/store/apps/details?id=com.google.android.webview")));
        content.addView(update);
        android.widget.Button online = new android.widget.Button(this);
        online.setText("Abrir sistema online");
        online.setOnClickListener(v -> { hideLegacyOfflineEntry(); webView.loadUrl(APP_URL + "/painel"); });
        content.addView(online); scroll.addView(content); legacyOfflineView = scroll;
        ((android.widget.FrameLayout) findViewById(R.id.app_root)).addView(scroll,
                new android.widget.FrameLayout.LayoutParams(-1, -1));
    }

    private void installOfflineBridge() {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return;
        WebViewCompat.addWebMessageListener(webView, "VinkuloOffline", Collections.singleton(APP_URL),
                (view, message, origin, mainFrame, reply) -> {
                    if (!mainFrame || !NativePolicy.trusted(origin.toString()) || !OfflinePolicy.localPage(view.getUrl())
                            || message.getType() != WebMessageCompat.TYPE_STRING || message.getData() == null || message.getData().length() > 512) return;
                    try {
                        JSONObject command = new JSONObject(message.getData());
                        String action = command.getString("action");
                        int requestId = command.getInt("requestId");
                        if (requestId <= 0) return;
                        if ("lock".equals(action)) offline.lock();
                        else if ("refresh".equals(action)) offline.refresh(true);
                        else if ("refresh-requests".equals(action)) offline.refresh(true,true);
                        else if (!"status".equals(action)) return;
                        offline.status(state -> {
                            if (webView != null && OfflinePolicy.localPage(webView.getUrl())) {
                                try { state.put("requestId", requestId); reply.postMessage(state.toString()); }
                                catch (IllegalStateException | JSONException ignored) { }
                            }
                        });
                    } catch (JSONException ignored) { }
                });
    }

    private void installVisitorBridge() {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return;
        WebViewCompat.addWebMessageListener(webView, "VinkuloVisitors", Collections.singleton(APP_URL),
            (view,message,origin,mainFrame,reply) -> {
                if(!mainFrame || !NativePolicy.trusted(origin.toString()) || !OfflinePolicy.localPage(view.getUrl())
                    || message.getType()!=WebMessageCompat.TYPE_STRING || message.getData()==null || message.getData().length()>4096)return;
                try {
                    JSONObject command=new JSONObject(message.getData());int requestId=command.getInt("requestId");
                    if(requestId<=0)return;
                    if("lock".equals(command.optString("action"))){visitors.lock();command.put("action","status");}
                    visitors.command(command,state->{
                        if(webView!=null&&OfflinePolicy.localPage(webView.getUrl()))try{state.put("requestId",requestId);reply.postMessage(state.toString());}catch(Exception ignored){}
                    });
                }catch(JSONException ignored){}
            });
    }

    private void installModuleBridge() {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return;
        WebViewCompat.addWebMessageListener(webView,"VinkuloModules",Collections.singleton(APP_URL),(view,message,origin,mainFrame,reply)->{
            if(!mainFrame||!NativePolicy.trusted(origin.toString())||!OfflinePolicy.localPage(view.getUrl())||message.getType()!=WebMessageCompat.TYPE_STRING||message.getData()==null||message.getData().length()>4096)return;
            try{JSONObject command=new JSONObject(message.getData());int requestId=command.getInt("requestId");
                if(requestId<=0||!ModuleAccess.valid(command.optString("module")))return;
                if("lock".equals(command.optString("action"))){modules.lock();command.put("action","status");}
                modules.command(command,state->{if(webView!=null&&OfflinePolicy.localPage(webView.getUrl()))try{state.put("requestId",requestId);reply.postMessage(state.toString());}catch(Exception ignored){}});
            }catch(JSONException ignored){}
        });
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
            openExternal(target);
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
                .setOnlyAlertOnce(true)
                .setVisibility(Notification.VISIBILITY_PRIVATE)
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
        if (legacyOfflineView != null || OfflinePolicy.localPage(webView.getUrl())) {
            hideLegacyOfflineEntry(); webView.loadUrl(APP_URL + path); return;
        }
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
        return NativePolicy.notificationPath(value);
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
            if (NativePolicy.trusted(uri.toString())) {
                if ("/api/auth/logout".equals(uri.getPath()) || "/login".equals(uri.getPath())) FirebaseDeviceState.clearBinding(this);
                return false;
            }
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
            Uri target = externalIntent.getData();
            String targetScheme = target == null ? "" : String.valueOf(target.getScheme()).toLowerCase(java.util.Locale.ROOT);
            boolean calendar = Intent.ACTION_INSERT.equals(externalIntent.getAction()) &&
                    "content".equals(targetScheme) && "vnd.android.cursor.item/event".equals(externalIntent.getType());
            if (!calendar && (!Intent.ACTION_VIEW.equals(externalIntent.getAction()) ||
                    !Arrays.asList("https", "http", "mailto", "tel", "whatsapp", "market").contains(targetScheme))) return true;
            externalIntent.setComponent(null);
            externalIntent.setSelector(null);
            externalIntent.setFlags(0);
            externalIntent.addCategory(Intent.CATEGORY_BROWSABLE);
            startActivity(externalIntent);
        } catch (Exception ignored) {
            Toast.makeText(this, "Não foi possível abrir este aplicativo.", Toast.LENGTH_SHORT).show();
        }
        return true;
    }

    private void downloadDocument(String url, String userAgent, String disposition, String mimeType) {
        if (!NativePolicy.trusted(url)) {
            Toast.makeText(this, "Abra o arquivo pelo endereço oficial do Vínkulo.", Toast.LENGTH_LONG).show();
            return;
        }
        try {
            String filename = NativePolicy.downloadName(URLUtil.guessFileName(url, disposition, mimeType));
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
            String cookie = CookieManager.getInstance().getCookie(url);
            if (cookie != null) request.addRequestHeader("Cookie", cookie);
            if (userAgent != null) request.addRequestHeader("User-Agent", userAgent);
            if (mimeType != null) request.setMimeType(mimeType);
            request.setTitle(filename);
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, filename);
            } else {
                request.setDestinationInExternalFilesDir(this, Environment.DIRECTORY_DOWNLOADS, filename);
            }
            ((DownloadManager) getSystemService(DOWNLOAD_SERVICE)).enqueue(request);
            Toast.makeText(this, "Download iniciado. Acompanhe pelas notificações do Android.", Toast.LENGTH_LONG).show();
        } catch (RuntimeException failure) {
            Toast.makeText(this, "Não foi possível iniciar o download. Confira o espaço disponível e tente novamente.", Toast.LENGTH_LONG).show();
        }
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
        if (!NativePolicy.trusted(request.getOrigin().toString())) { request.deny(); return; }
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
        if (!NativePolicy.trusted(request.getOrigin().toString()) || webView == null || !NativePolicy.trusted(webView.getUrl())) { request.deny(); return; }
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
        if (legacyOfflineView != null) { super.onBackPressed(); return; }
        if (webView.canGoBack()) webView.goBack(); else super.onBackPressed();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        outState.putBoolean("vinkulo.legacyOffline", legacyOfflineView != null);
        boolean local = legacyOfflineView != null || OfflinePolicy.localPage(webView.getUrl());
        outState.putBoolean("vinkulo.localOffline", local);
        if (!local) webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }
}
