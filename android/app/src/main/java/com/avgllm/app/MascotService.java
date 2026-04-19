package com.avgllm.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.graphics.PixelFormat;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import androidx.core.app.NotificationCompat;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

import org.json.JSONObject;

public class MascotService extends Service {

    public static final String ACTION_CREATE = "com.avgllm.app.MASCOT_CREATE";
    public static final String ACTION_DESTROY = "com.avgllm.app.MASCOT_DESTROY";
    public static final String ACTION_SHOW = "com.avgllm.app.MASCOT_SHOW";
    public static final String ACTION_HIDE = "com.avgllm.app.MASCOT_HIDE";
    public static final String ACTION_UPDATE_STATE = "com.avgllm.app.MASCOT_UPDATE_STATE";
    public static final String ACTION_COMMAND = "com.avgllm.app.MASCOT_COMMAND";
    public static final String ACTION_LOAD_URL = "com.avgllm.app.MASCOT_LOAD_URL";
    public static final String ACTION_SET_MASCOT_DATA = "com.avgllm.app.MASCOT_SET_DATA";

    private static final String TAG = "MascotService";
    private static final String CHANNEL_ID = "mascot_overlay_channel";
    private static final int NOTIFICATION_ID = 10001;

    private static final String MASCOT_DATA_FILE = "mascot_overlay_data.json";
    private static final String MASCOT_GIF_FILE = "mascot_overlay.gif";

    private String currentGifBase64 = null; // cached GIF data to serve to WebView

    private WindowManager windowManager;
    private FrameLayout overlayRoot;
    private WebView mascotWebView;
    private boolean isPageLoaded = false;
    private String lastLoadedUrl = null;

    // Mascot position and size for overlay window positioning
    private static final int DEFAULT_MASCOT_SIZE = 80;
    private int mascotX = 0;
    private int mascotY = 0;
    private int mascotWidth = DEFAULT_MASCOT_SIZE;
    private int mascotHeight = DEFAULT_MASCOT_SIZE;
    private WindowManager.LayoutParams overlayParams;

    @Override
    public void onCreate() {
        super.onCreate();
        Log.d(TAG, "Service onCreate");
        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
        startForeground(NOTIFICATION_ID, buildNotification());
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || intent.getAction() == null) {
            return START_STICKY;
        }

        String action = intent.getAction();
        Log.d(TAG, "onStartCommand action=" + action);

        switch (action) {
            case ACTION_CREATE:
                createOverlay();
                break;
            case ACTION_DESTROY:
                destroyOverlay();
                break;
            case ACTION_SHOW:
                forceShow();
                break;
            case ACTION_HIDE:
                forceHide();
                break;
            case ACTION_UPDATE_STATE:
                sendStateToWebView(intent.getStringExtra("state") != null ? intent.getStringExtra("state") : "{}");
                break;
            case ACTION_COMMAND:
                sendCommandToWebView(
                    intent.getStringExtra("command") != null ? intent.getStringExtra("command") : "",
                    intent.getStringExtra("payload") != null ? intent.getStringExtra("payload") : "{}"
                );
                break;
            case ACTION_LOAD_URL:
                loadUrl(intent.getStringExtra("url") != null ? intent.getStringExtra("url") : "");
                break;
            case ACTION_SET_MASCOT_DATA:
                setMascotData();
                break;
        }

        return START_STICKY;
    }

    private static String getCachedMascotData(Context context) {
        File file = new File(context.getFilesDir(), MASCOT_DATA_FILE);
        if (!file.exists()) return null;
        try {
            byte[] bytes = java.nio.file.Files.readAllBytes(file.toPath());
            return new String(bytes, StandardCharsets.UTF_8);
        } catch (IOException e) {
            Log.e(TAG, "Failed to read mascot data file", e);
            return null;
        }
    }

    private void setMascotData() {
        String data = getCachedMascotData(this);
        if (data == null) {
            Log.d(TAG, "No mascot data file found");
            return;
        }
        Log.d(TAG, "Mascot data loaded from file, length: " + data.length());

        // Parse position and size from mascot data
        try {
            JSONObject json = new JSONObject(data);
            int newX = json.optInt("x", mascotX);
            int newY = json.optInt("y", mascotY);
            int newW = json.optInt("overlayWidth", mascotWidth);
            int newH = json.optInt("overlayHeight", mascotHeight);
            if (newX != mascotX || newY != mascotY || newW != mascotWidth || newH != mascotHeight) {
                mascotX = newX;
                mascotY = newY;
                mascotWidth = newW;
                mascotHeight = newH;
                Log.d(TAG, "Mascot position parsed: (" + mascotX + ", " + mascotY + ") size=" + mascotWidth + "x" + mascotHeight);
                updateOverlayPosition();
            }

            // Extract GIF base64 from dataUrl and cache it separately
            JSONObject gifData = json.optJSONObject("gifData");
            if (gifData != null && gifData.has("dataUrl")) {
                String dataUrl = gifData.getString("dataUrl");
                // dataUrl format: "data:image/gif;base64,R0lGOD..."
                int base64Start = dataUrl.indexOf(",");
                if (base64Start > 0) {
                    currentGifBase64 = dataUrl.substring(base64Start + 1);
                    // Remove dataUrl from JSON to avoid injecting huge strings
                    gifData.remove("dataUrl");
                    // Write updated JSON (without dataUrl) back to file
                    String cleanData = json.toString();
                    try (FileOutputStream fos = new FileOutputStream(new File(getFilesDir(), MASCOT_DATA_FILE))) {
                        fos.write(cleanData.getBytes(StandardCharsets.UTF_8));
                    }
                    Log.d(TAG, "GIF base64 extracted, length: " + currentGifBase64.length());
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "Failed to parse mascot position", e);
        }

        if (isPageLoaded && mascotWebView != null) {
            injectMascotDataToWebView(data);
        }
    }

    private void updateOverlayPosition() {
        if (overlayParams != null && windowManager != null && overlayRoot != null) {
            overlayParams.x = mascotX;
            overlayParams.y = mascotY;
            overlayParams.width = mascotWidth;
            overlayParams.height = mascotHeight;
            try {
                windowManager.updateViewLayout(overlayRoot, overlayParams);
                Log.d(TAG, "Overlay position updated to (" + mascotX + ", " + mascotY + ") size=" + mascotWidth + "x" + mascotHeight);
            } catch (Exception e) {
                Log.e(TAG, "Failed to update overlay position: " + e.getMessage(), e);
            }
        }
    }

    /**
     * 强制创建或重置悬浮窗
     * 如果已存在则先销毁再重建，确保状态干净
     */
    private void createOverlay() {
        Log.d(TAG, "createOverlay called");

        // 清理旧视图
        removeOverlayViews();

        // 从文件读取最新位置和大小（避免竞态条件）
        String data = getCachedMascotData(this);
        if (data != null) {
            try {
                JSONObject json = new JSONObject(data);
                mascotX = json.optInt("x", mascotX);
                mascotY = json.optInt("y", mascotY);
                mascotWidth = json.optInt("overlayWidth", mascotWidth);
                mascotHeight = json.optInt("overlayHeight", mascotHeight);
                Log.d(TAG, "Mascot position from file: (" + mascotX + ", " + mascotY + ") size=" + mascotWidth + "x" + mascotHeight);
                Log.d(TAG, "GIF data in file: " + (json.has("gifData") ? "yes" : "no"));
            } catch (Exception e) {
                Log.w(TAG, "Failed to parse position from file", e);
            }
        }

        Log.d(TAG, "Creating new overlay at (" + mascotX + ", " + mascotY + ") size=" + mascotWidth + "x" + mascotHeight);
        int layoutType;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            layoutType = WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY;
        } else {
            layoutType = WindowManager.LayoutParams.TYPE_PHONE;
        }

        overlayRoot = new FrameLayout(this);

        overlayParams = new WindowManager.LayoutParams(
            mascotWidth,
            mascotHeight,
            layoutType,
            WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
                | WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT
        );
        overlayParams.gravity = Gravity.TOP | Gravity.START;
        overlayParams.x = mascotX;
        overlayParams.y = mascotY;

        try {
            windowManager.addView(overlayRoot, overlayParams);
            Log.d(TAG, "Overlay root added to window manager");
        } catch (Exception e) {
            Log.e(TAG, "Failed to add overlay: " + e.getMessage(), e);
            return;
        }

        mascotWebView = new WebView(this);
        mascotWebView.setBackgroundColor(0x00000000);
        mascotWebView.getSettings().setJavaScriptEnabled(true);
        mascotWebView.getSettings().setDomStorageEnabled(true);
        mascotWebView.getSettings().setAllowFileAccess(true);
        mascotWebView.getSettings().setAllowContentAccess(true);
        mascotWebView.getSettings().setUseWideViewPort(false);
        mascotWebView.getSettings().setLoadWithOverviewMode(false);
        mascotWebView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        mascotWebView.setHorizontalScrollBarEnabled(false);
        mascotWebView.setVerticalScrollBarEnabled(false);

        mascotWebView.setLayoutParams(new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        ));

        mascotWebView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                Log.d(TAG, "WebView page finished: " + url);
                isPageLoaded = true;
                String data = getCachedMascotData(MascotService.this);
                if (data != null) {
                    injectMascotDataToWebView(data);
                }
                // 页面加载完成后立即显示
                forceShow();
            }
        });

        // JavaScript interface for the overlay to communicate with the service
        mascotWebView.addJavascriptInterface(new Object() {
            @android.webkit.JavascriptInterface
            public void updatePosition(int x, int y) {
                Log.d(TAG, "JS updatePosition: (" + x + ", " + y + ")");
                mascotX = x;
                mascotY = y;
                updateOverlayPosition();
            }
            @android.webkit.JavascriptInterface
            public void updateSize(int w, int h) {
                Log.d(TAG, "JS updateSize: " + w + "x" + h);
                mascotWidth = w;
                mascotHeight = h;
                updateOverlayPosition();
            }
            @android.webkit.JavascriptInterface
            public String getGifDataUrl() {
                if (currentGifBase64 != null) {
                    Log.d(TAG, "JS getGifDataUrl: returning base64 length " + currentGifBase64.length());
                    return "data:image/gif;base64," + currentGifBase64;
                }
                Log.d(TAG, "JS getGifDataUrl: no GIF cached");
                return "";
            }
            @android.webkit.JavascriptInterface
            public String logWeb(String tag, String msg) {
                Log.d(TAG, "[Web] " + tag + ": " + msg);
                return "ok";
            }
            @android.webkit.JavascriptInterface
            public String getDataFile() {
                String data = getCachedMascotData(MascotService.this);
                if (data != null) {
                    Log.d(TAG, "getDataFile: returning data, length " + data.length());
                    return data;
                }
                Log.d(TAG, "getDataFile: no data found");
                return "{}";
            }
        }, "AndroidOverlay");

        overlayRoot.addView(mascotWebView);
    }

    private void loadUrl(String url) {
        if (mascotWebView == null) {
            Log.d(TAG, "loadUrl: WebView not created, calling createOverlay first");
            createOverlay();
        }
        if (mascotWebView != null) {
            isPageLoaded = false;
            lastLoadedUrl = url;
            Log.d(TAG, "WebView loading URL: " + url);
            mascotWebView.loadUrl(url);
        }
    }

    /** 强制显示（无视之前的隐藏状态） */
    private void forceShow() {
        if (overlayRoot == null) {
            Log.w(TAG, "forceShow: overlayRoot is null, creating");
            createOverlay();
        }
        if (overlayRoot != null) {
            overlayRoot.setAlpha(1f);
            overlayRoot.setVisibility(View.VISIBLE);
            Log.d(TAG, "Overlay force-showed, alpha=1");
        }
    }

    private void forceHide() {
        if (overlayRoot != null) {
            overlayRoot.setAlpha(0f);
            Log.d(TAG, "Overlay force-hidden, alpha=0");
        }
    }

    private void destroyOverlay() {
        Log.d(TAG, "destroyOverlay called");
        removeOverlayViews();
        isPageLoaded = false;
        lastLoadedUrl = null;
        // 注意：不调用 stopSelf()，服务保持运行
    }

    private void removeOverlayViews() {
        if (overlayRoot != null) {
            try {
                if (mascotWebView != null) {
                    overlayRoot.removeView(mascotWebView);
                    mascotWebView.stopLoading();
                    mascotWebView.destroy();
                    mascotWebView = null;
                }
                windowManager.removeViewImmediate(overlayRoot);
                Log.d(TAG, "Overlay views removed");
            } catch (Exception e) {
                Log.e(TAG, "Error removing overlay views: " + e.getMessage(), e);
            }
            overlayRoot = null;
        }
    }

    private void injectMascotDataToWebView(String data) {
        // Instead of injecting huge JSON via evaluateJavascript,
        // tell the web page to fetch it from the file
        String js = "if (window.__mascotStateUpdate__) { " +
                    "  window.__mascotStateUpdate__({ _fileReady: true }); " +
                    "}";
        Log.d(TAG, "Injecting ready signal");
        mascotWebView.evaluateJavascript(js, (result) -> {
            Log.d(TAG, "JS ready signal result: " + (result != null ? result : "null"));
        });
    }

    private void sendStateToWebView(String stateJson) {
        if (mascotWebView != null && isPageLoaded) {
            String js = "window.__mascotStateUpdate__ && window.__mascotStateUpdate__(" + stateJson + ");";
            mascotWebView.post(() -> mascotWebView.evaluateJavascript(js, null));
        }
    }

    private void sendCommandToWebView(String command, String payloadJson) {
        if (mascotWebView != null && isPageLoaded) {
            String js = "window.__mascotCommand__ && window.__mascotCommand__('" + command + "', " + payloadJson + ");";
            mascotWebView.post(() -> mascotWebView.evaluateJavascript(js, null));
        }
    }

    private Notification buildNotification() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "桌宠悬浮窗",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("桌宠功能正在运行");
            channel.setShowBadge(false);
            channel.enableLights(false);
            channel.enableVibration(false);
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }

        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("桌宠")
            .setContentText("桌宠悬浮窗运行中")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .build();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        Log.d(TAG, "Service onDestroy");
        removeOverlayViews();
    }
}
