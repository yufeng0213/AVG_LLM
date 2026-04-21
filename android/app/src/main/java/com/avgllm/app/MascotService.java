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

    private String currentGifBase64 = null; // cached GIF base64 to serve to WebView

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
    private int bubbleWidthPhysical = 0;
    private int bubbleHeightPhysical = 0;
    private WindowManager.LayoutParams overlayParams;

    @Override
    public void onCreate() {
        super.onCreate();
        Log.d(TAG, "[MascotService] === Service onCreate ===");
        Log.d(TAG, "[MascotService] Service ID: " + hashCode());
        Log.d(TAG, "[MascotService] Process ID: " + android.os.Process.myPid());
        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
        Notification notification = buildNotification();
        Log.d(TAG, "[MascotService] Starting foreground with notification ID: " + NOTIFICATION_ID);
        startForeground(NOTIFICATION_ID, notification);
        Log.d(TAG, "[MascotService] Foreground service started successfully");
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Log.d(TAG, "[MascotService] === onStartCommand ===");
        Log.d(TAG, "[MascotService] startId: " + startId + ", flags: " + flags);
        if (intent == null || intent.getAction() == null) {
            Log.w(TAG, "[MascotService] Intent or action is null, returning START_STICKY");
            return START_STICKY;
        }

        String action = intent.getAction();
        Log.d(TAG, "[MascotService] Action: " + action);

        // 确保服务处于前台状态
        if (overlayRoot == null) {
            Log.w(TAG, "[MascotService] Overlay not created yet, ensuring foreground...");
            startForeground(NOTIFICATION_ID, buildNotification());
        }

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
            Log.e(TAG, "[MascotService] Failed to read mascot data file", e);
            return null;
        }
    }

    private void setMascotData() {
        String data = getCachedMascotData(this);
        if (data == null) {
            Log.d(TAG, "[MascotService] No mascot data file found");
            return;
        }
        Log.d(TAG, "[MascotService] Mascot data loaded from file, length: " + data.length());

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
                Log.d(TAG, "[MascotService] Mascot position parsed: (" + mascotX + ", " + mascotY + ") size=" + mascotWidth + "x" + mascotHeight);
                updateOverlayPosition();
            }

            // Extract GIF base64 data from gifData and cache it separately
            JSONObject gifData = json.optJSONObject("gifData");
            if (gifData != null && gifData.has("data")) {
                // gifData.data 是一个 data URL，需要提取 base64 部分
                String dataUrl = gifData.optString("data", "");
                if (dataUrl.startsWith("data:image/gif;base64,")) {
                    currentGifBase64 = dataUrl.substring("data:image/gif;base64,".length());
                    Log.d(TAG, "[MascotService] GIF base64 cached, length: " + currentGifBase64.length());
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "[MascotService] Failed to parse mascot position", e);
        }

        if (isPageLoaded && mascotWebView != null) {
            injectMascotDataToWebView(data);
        }
    }

    private void updateOverlayPosition() {
        long timestamp = System.currentTimeMillis();
        if (overlayParams != null && windowManager != null && overlayRoot != null) {
            android.util.DisplayMetrics dm = new android.util.DisplayMetrics();
            windowManager.getDefaultDisplay().getMetrics(dm);
            int screenHeight = dm.heightPixels;

            Log.d(TAG, "[MascotService] === updateOverlayPosition === timestamp=" + timestamp);
            Log.d(TAG, "[MascotService] bubble=" + bubbleWidthPhysical + "x" + bubbleHeightPhysical);
            Log.d(TAG, "[MascotService] mascot=" + mascotX + "," + mascotY + " size=" + mascotWidth + "x" + mascotHeight);

            // 内容高度，0 表示只有 mascot
            int contentHeight = bubbleHeightPhysical;
            int contentWidth = bubbleWidthPhysical;
            if (contentHeight <= 0 || contentWidth <= 0) {
                contentHeight = 0;
                contentWidth = mascotWidth;
            }

            // 窗口大小
            int windowWidth = Math.max(mascotWidth, contentWidth);
            int windowHeight = mascotHeight + contentHeight;

            // BOTTOM gravity 锚定窗口底部在 mascotY
            overlayParams.gravity = Gravity.BOTTOM | Gravity.START;
            overlayParams.x = mascotX;
            overlayParams.y = screenHeight - mascotY; // 从屏幕底部算的距离
            overlayParams.width = windowWidth;
            overlayParams.height = windowHeight;

            Log.d(TAG, "[MascotService] FINAL: y_from_bottom=" + overlayParams.y + ", size=" + windowWidth + "x" + windowHeight);

            try {
                windowManager.updateViewLayout(overlayRoot, overlayParams);
                Log.d(TAG, "[MascotService] Overlay position updated successfully");
            } catch (Exception e) {
                Log.e(TAG, "[MascotService] Failed to update overlay position: " + e.getMessage(), e);
            }
        }
    }

    /**
     * 更新窗口的焦点接收能力
     * 当输入框需要键盘输入时，移除 FLAG_NOT_FOCUSABLE
     * 当不需要时，恢复 FLAG_NOT_FOCUSABLE 让触摸穿透到其他应用
     */
    private void updateWindowFocusable(boolean focusable) {
        if (overlayParams != null && windowManager != null && overlayRoot != null) {
            int layoutType;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                layoutType = WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY;
            } else {
                layoutType = WindowManager.LayoutParams.TYPE_PHONE;
            }

            int flags = WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
                | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS;

            if (!focusable) {
                flags |= WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE;
            }

            overlayParams.flags = flags;
            try {
                windowManager.updateViewLayout(overlayRoot, overlayParams);
                Log.d(TAG, "[MascotService] Window focusable updated: focusable=" + focusable + ", flags=" + flags);
            } catch (Exception e) {
                Log.e(TAG, "[MascotService] Failed to update window focusable: " + e.getMessage(), e);
            }
        }
    }

    /**
     * 强制创建或重置悬浮窗
     * 如果已存在则先销毁再重建，确保状态干净
     */
    private void createOverlay() {
        Log.d(TAG, "[MascotService] createOverlay called");

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
                Log.d(TAG, "[MascotService] Mascot position from file: (" + mascotX + ", " + mascotY + ") size=" + mascotWidth + "x" + mascotHeight);
                Log.d(TAG, "[MascotService] GIF data in file: " + (json.has("gifData") ? "yes" : "no"));
            } catch (Exception e) {
                Log.w(TAG, "[MascotService] Failed to parse position from file", e);
            }
        }

        // 窗口大小：覆盖 mascot + 预留气泡空间
        // mascot: 80x80 CSS 像素，气泡在上方约 50-80 CSS 像素
        // 预留足够空间让气泡显示（气泡不需要触摸，会穿透）
        android.util.DisplayMetrics dm = new android.util.DisplayMetrics();
        windowManager.getDefaultDisplay().getMetrics(dm);
        float dpr = dm.density;
        Log.d(TAG, "[MascotService] DPR: " + dpr + ", mascotWidth: " + mascotWidth + ", mascotHeight: " + mascotHeight);

        // 如果尺寸太小，使用默认值
        if (mascotWidth <= 10 || mascotHeight <= 10) {
            mascotWidth = (int) (80 * dpr);
            mascotHeight = (int) (80 * dpr);
        }

        // 内容尺寸
        int contentHeight = bubbleHeightPhysical;
        int contentWidth = bubbleWidthPhysical;
        if (contentHeight <= 0 || contentWidth <= 0) {
            contentHeight = 0;
            contentWidth = mascotWidth;
        }

        // 窗口大小
        int windowWidth = Math.max(mascotWidth, contentWidth);
        int windowHeight = mascotHeight + contentHeight;

        Log.d(TAG, "[MascotService] Creating overlay: size=" + windowWidth + "x" + windowHeight);

        int layoutType;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            layoutType = WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY;
        } else {
            layoutType = WindowManager.LayoutParams.TYPE_PHONE;
        }

        overlayRoot = new FrameLayout(this);

        // 窗口只覆盖 mascot 区域，FLAG_NOT_TOUCH_MODAL 让窗口外触摸自动穿透
        overlayParams = new WindowManager.LayoutParams(
            windowWidth,
            windowHeight,
            layoutType,
            WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
                | WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT
        );
        // BOTTOM gravity 锚定窗口底部在 mascotY
        int screenHeight = dm.heightPixels;
        overlayParams.gravity = Gravity.BOTTOM | Gravity.START;
        overlayParams.x = mascotX;
        overlayParams.y = screenHeight - mascotY;

        Log.d(TAG, "[MascotService] Overlay params: y_from_bottom=" + overlayParams.y + ", size=" + windowWidth + "x" + windowHeight);

        try {
            windowManager.addView(overlayRoot, overlayParams);
            Log.d(TAG, "[MascotService] Overlay root added to window manager");
        } catch (Exception e) {
            Log.e(TAG, "[MascotService] Failed to add overlay: " + e.getMessage(), e);
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

        // 允许从 file:// URL 加载其他 file:// 资源（用于加载 JS/CSS）
        mascotWebView.getSettings().setAllowFileAccessFromFileURLs(true);
        mascotWebView.getSettings().setAllowUniversalAccessFromFileURLs(true);

        mascotWebView.setLayoutParams(new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        ));

        mascotWebView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                Log.d(TAG, "[MascotService] === WebView page finished ===");
                Log.d(TAG, "[MascotService] URL: " + url);
                isPageLoaded = true;
                String data = getCachedMascotData(MascotService.this);
                if (data != null) {
                    Log.d(TAG, "[MascotService] Cached mascot data found, length: " + data.length());
                    injectMascotDataToWebView(data);
                } else {
                    Log.w(TAG, "[MascotService] No cached mascot data found");
                }
                // 页面加载完成后立即显示
                forceShow();
            }

            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                Log.d(TAG, "[MascotService] === WebView page started ===");
                Log.d(TAG, "[MascotService] URL: " + url);
            }

            @Override
            public void onReceivedError(WebView view, android.webkit.WebResourceRequest request, android.webkit.WebResourceError error) {
                Log.e(TAG, "[MascotService] === WebView error ===");
                Log.e(TAG, "[MascotService] Error: " + error.getDescription() + ", code: " + error.getErrorCode());
                Log.e(TAG, "[MascotService] URL: " + request.getUrl());
            }
        });

        // JavaScript interface for the overlay to communicate with the service
        mascotWebView.addJavascriptInterface(new Object() {
            @android.webkit.JavascriptInterface
            public void updatePosition(int x, int y) {
                Log.d(TAG, "[MascotService] JS updatePosition: (" + x + ", " + y + ")");
                mascotX = x;
                mascotY = y;
                // 切换到主线程更新 UI
                overlayRoot.post(() -> updateOverlayPosition());
            }
            @android.webkit.JavascriptInterface
            public void updateSize(int w, int h) {
                Log.d(TAG, "[MascotService] JS updateSize: " + w + "x" + h);
                mascotWidth = w;
                mascotHeight = h;
                // 切换到主线程更新 UI
                overlayRoot.post(() -> updateOverlayPosition());
            }
            @android.webkit.JavascriptInterface
            public void updateBubbleSize(int widthPhysical, int heightPhysical) {
                Log.d(TAG, "[MascotService] JS updateBubbleSize: " + widthPhysical + "x" + heightPhysical);
                bubbleWidthPhysical = widthPhysical;
                bubbleHeightPhysical = heightPhysical;
                overlayRoot.post(() -> updateOverlayPosition());
            }
            @android.webkit.JavascriptInterface
            public void setAlpha(float alpha) {
                Log.d(TAG, "[MascotService] JS setAlpha: " + alpha);
                overlayRoot.post(() -> {
                    if (overlayRoot != null) {
                        overlayRoot.setAlpha(alpha);
                    }
                });
            }
            @android.webkit.JavascriptInterface
            public void setFocusable(boolean focusable) {
                Log.d(TAG, "[MascotService] JS setFocusable: " + focusable);
                overlayRoot.post(() -> updateWindowFocusable(focusable));
            }
            @android.webkit.JavascriptInterface
            public String getGifData() {
                if (currentGifBase64 != null) {
                    Log.d(TAG, "[MascotService] JS getGifData: returning base64 length " + currentGifBase64.length());
                    return currentGifBase64;
                }
                Log.d(TAG, "[MascotService] JS getGifData: no GIF cached");
                return "";
            }
            @android.webkit.JavascriptInterface
            public String logWeb(String tag, String msg) {
                Log.d(TAG, "[MascotService] [Web] " + tag + ": " + msg);
                return "ok";
            }
            @android.webkit.JavascriptInterface
            public String getDataFile() {
                String data = getCachedMascotData(MascotService.this);
                if (data != null) {
                    Log.d(TAG, "[MascotService] getDataFile: returning data, length " + data.length());
                    return data;
                }
                Log.d(TAG, "[MascotService] getDataFile: no data found");
                return "{}";
            }
            @android.webkit.JavascriptInterface
            public void saveGifBase64(String gifBase64) {
                Log.d(TAG, "[MascotService] JS saveGifBase64: length=" + (gifBase64 != null ? gifBase64.length() : 0));
                currentGifBase64 = gifBase64;
                Log.d(TAG, "[MascotService] GIF base64 saved, length: " + currentGifBase64.length());
            }
            @android.webkit.JavascriptInterface
            public void reloadMascot() {
                Log.d(TAG, "[MascotService] JS reloadMascot: reloading mascot from storage");
                setMascotData();
            }
            @android.webkit.JavascriptInterface
            public void openGifFileChooser() {
                Log.d(TAG, "[MascotService] JS openGifFileChooser: opening file chooser");
                MascotFileChooserActivity.setPendingCallback(new MascotFileChooserActivity.FileSelectedCallback() {
                    @Override
                    public void onFileSelected(String gifBase64, String fileName) {
                        Log.d(TAG, "[MascotService] GIF file selected: " + fileName + ", base64 length=" + gifBase64.length());
                        // 更新缓存
                        currentGifBase64 = gifBase64;
                        // 通知 WebView 更新动画
                        notifyGifUpdated(gifBase64, fileName);
                    }
                    @Override
                    public void onCanceled() {
                        Log.d(TAG, "[MascotService] GIF file selection canceled");
                    }
                });
                Intent intent = new Intent(MascotService.this, MascotFileChooserActivity.class);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(intent);
            }
        }, "AndroidOverlay");

        overlayRoot.addView(mascotWebView);
    }

    private void loadUrl(String url) {
        if (mascotWebView == null) {
            Log.d(TAG, "[MascotService] loadUrl: WebView not created, calling createOverlay first");
            createOverlay();
        }
        if (mascotWebView != null) {
            isPageLoaded = false;
            lastLoadedUrl = url;
            Log.d(TAG, "[MascotService] WebView loading URL: " + url);
            mascotWebView.loadUrl(url);
        }
    }

    /** 强制显示（无视之前的隐藏状态） */
    private void forceShow() {
        Log.d(TAG, "[MascotService] === forceShow called ===");
        Log.d(TAG, "[MascotService] overlayRoot: " + (overlayRoot != null ? "exists" : "null"));
        Log.d(TAG, "[MascotService] mascotWebView: " + (mascotWebView != null ? "exists" : "null"));
        Log.d(TAG, "[MascotService] isPageLoaded: " + isPageLoaded);

        if (overlayRoot == null) {
            Log.w(TAG, "[MascotService] forceShow: overlayRoot is null, creating");
            createOverlay();
        }
        if (overlayRoot != null) {
            overlayRoot.setAlpha(1f);
            overlayRoot.setVisibility(View.VISIBLE);
            Log.d(TAG, "[MascotService] Overlay force-showed, alpha=1, VISIBLE");

            // 再次确认窗口参数
            if (overlayParams != null) {
                Log.d(TAG, "[MascotService] Overlay params: type=" + overlayParams.type
                    + ", x=" + overlayParams.x + ", y=" + overlayParams.y
                    + ", w=" + overlayParams.width + ", h=" + overlayParams.height
                    + ", flags=" + overlayParams.flags);
            }
        }
    }

    private void forceHide() {
        if (overlayRoot != null) {
            overlayRoot.setAlpha(0f);
            Log.d(TAG, "[MascotService] Overlay force-hidden, alpha=0");
        }
    }

    private void destroyOverlay() {
        Log.d(TAG, "[MascotService] destroyOverlay called");
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
                Log.d(TAG, "[MascotService] Overlay views removed");
            } catch (Exception e) {
                Log.e(TAG, "[MascotService] Error removing overlay views: " + e.getMessage(), e);
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
        Log.d(TAG, "[MascotService] Injecting ready signal");
        mascotWebView.evaluateJavascript(js, (result) -> {
            Log.d(TAG, "[MascotService] JS ready signal result: " + (result != null ? result : "null"));
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

    private void notifyGifUpdated(String gifBase64, String fileName) {
        if (mascotWebView != null && isPageLoaded) {
            // GIF base64 直接注入到全局变量
            String escapedFileName = fileName.replace("\\", "\\\\").replace("\"", "\\\"");
            String escapedBase64 = gifBase64.replace("\\", "\\\\").replace("\"", "\\\"");
            String js = "window.__mascotUpdated__ && window.__mascotUpdated__({"
                    + "\"gifBase64\": \"" + escapedBase64 + "\","
                    + "\"fileName\": \"" + escapedFileName + "\""
                    + "});";
            Log.d(TAG, "[MascotService] Notifying WebView of GIF update, JS length=" + js.length());
            mascotWebView.post(() -> mascotWebView.evaluateJavascript(js, (result) -> {
                Log.d(TAG, "[MascotService] GIF update notification result: " + (result != null ? result : "null"));
            }));
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
        Log.d(TAG, "[MascotService] === Service onDestroy ===");
        Log.d(TAG, "[MascotService] Service being destroyed, reason unknown (check system logs)");
        Log.d(TAG, "[MascotService] Removing overlay views...");
        removeOverlayViews();
        Log.d(TAG, "[MascotService] Service onDestroy completed");
    }

    @Override
    public void onLowMemory() {
        super.onLowMemory();
        Log.w(TAG, "[MascotService] === onLowMemory called ===");
    }

    @Override
    public boolean onUnbind(Intent intent) {
        Log.d(TAG, "[MascotService] === onUnbind called ===");
        return super.onUnbind(intent);
    }
}
