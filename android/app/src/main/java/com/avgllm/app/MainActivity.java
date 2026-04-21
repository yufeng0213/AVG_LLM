package com.avgllm.app;

import android.os.Bundle;
import android.os.Build;
import android.graphics.Color;
import android.view.View;
import android.view.WindowManager;
import android.content.pm.ActivityInfo;
import android.content.SharedPreferences;
import android.content.Intent;
import android.util.Log;
import com.getcapacitor.BridgeActivity;
import androidx.core.graphics.Insets;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.core.view.ViewCompat;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "MainActivity";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(CardImportPlugin.class);
        registerPlugin(IcsCalendarPlugin.class);
        registerPlugin(MicrophonePermissionPlugin.class);
        registerPlugin(MascotPlugin.class);
        registerPlugin(WidgetBackgroundPickerPlugin.class);
        registerPlugin(ImageReaderPlugin.class);
        // 在 Capacitor Bridge 初始化之前清理 SharedPreferences 中的大尺寸 base64 数据
        // 防止 OOM：Bridge 在 JS→Native 传递时会序列化整个 SharedPreferences
        cleanOomCausingData();
        super.onCreate(savedInstanceState);

        // 启动时应用系统栏样式并锁定竖屏
        applyStandardSystemUi();
        enablePortraitMode();
        scheduleInsetsDebug("onCreate");
        injectSafeAreaCssVariables();

        // 处理 Widget 点击 Intent
        handleWidgetIntent(getIntent());
    }

    /**
     * 清理 SharedPreferences 中的大尺寸 base64 图片数据
     * 这些数据应迁移到文件系统存储，避免 Capacitor Bridge 序列化时 OOM
     */
    private void cleanOomCausingData() {
        // Capacitor Preferences 使用的 SharedPreferences 文件名
        String[] prefNames = {"CapacitorStorage", "com.avgllm.app_preferences"};
        // 已知包含 base64 图片数据的 key
        String[] imageKeys = {
            "avg_llm_dormitory:avatars",
            "avg_llm_dormitory:avatarFrames",
            "avg_llm_mobile_background_assets",
        };

        for (String prefName : prefNames) {
            SharedPreferences prefs;
            try {
                prefs = getSharedPreferences(prefName, MODE_PRIVATE);
            } catch (OutOfMemoryError e) {
                // SharedPreferences 加载失败（可能文件太大），直接删除 XML 文件
                Log.e(TAG, "SharedPreferences 加载 OOM，直接删除文件: " + prefName);
                try {
                    getSharedPreferences(prefName, MODE_PRIVATE).edit().clear().apply();
                } catch (OutOfMemoryError e2) {
                    // 仍然 OOM，直接删除文件
                    java.io.File prefsDir = getSharedPreferencesDir();
                    java.io.File prefsFile = new java.io.File(prefsDir, prefName + ".xml");
                    if (prefsFile.exists()) {
                        prefsFile.delete();
                        Log.i(TAG, "已删除 SharedPreferences 文件: " + prefName);
                    }
                }
                continue;
            }

            // 安全检查：用 contains() 判断 key 是否存在，避免 getString() 读入大字符串
            boolean needsCleaning = false;
            for (String key : imageKeys) {
                if (prefs.contains(key)) {
                    needsCleaning = true;
                    break;
                }
            }
            if (!needsCleaning) continue;

            // 直接清理
            SharedPreferences.Editor editor = prefs.edit();
            for (String key : imageKeys) {
                editor.remove(key);
            }
            editor.apply();
            Log.i(TAG, "已清理 SharedPreferences: " + prefName);
        }
    }

    /**
     * 获取 SharedPreferences 文件目录
     */
    private java.io.File getSharedPreferencesDir() {
        return new java.io.File(getApplicationInfo().dataDir, "shared_prefs");
    }

    /**
     * 启用标准系统栏模式
     * 始终显示顶部状态栏（时间/信号/电量）
     */
    private void applyStandardSystemUi() {
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        // 内容避让系统栏，使用常规应用布局
        WindowCompat.setDecorFitsSystemWindows(getWindow(), true);

        // 系统栏配色与游戏背景保持一致，避免顶部色差
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            int barColor = Color.parseColor("#0D0D1A");
            getWindow().setStatusBarColor(barColor);
            getWindow().setNavigationBarColor(barColor);
        }

        View decorView = getWindow().getDecorView();
        WindowInsetsControllerCompat controller =
            WindowCompat.getInsetsController(getWindow(), decorView);

        if (controller != null) {
            controller.show(WindowInsetsCompat.Type.statusBars());
            controller.show(WindowInsetsCompat.Type.navigationBars());
            controller.setAppearanceLightStatusBars(false);
            controller.setAppearanceLightNavigationBars(false);
        }

        scheduleInsetsDebug("applyStandardSystemUi");
    }

    /**
     * 启用竖屏模式
     */
    private void enablePortraitMode() {
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            // 重新获得焦点时，确保系统栏可见
            applyStandardSystemUi();
            scheduleInsetsDebug("onWindowFocusChanged(hasFocus=true)");
            injectSafeAreaCssVariables();
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        applyStandardSystemUi();
        scheduleInsetsDebug("onResume");
        injectSafeAreaCssVariables();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleWidgetIntent(intent);
    }

    /**
     * 处理 Widget 点击 Intent
     * 将角色信息通过 JS 事件传递给 Vue 应用
     */
    private void handleWidgetIntent(Intent intent) {
        if (intent == null) return;

        String action = intent.getAction();
        Log.d(TAG, "handleWidgetIntent: action=" + action);

        if ("com.avgllm.app.OPEN_DORMITORY".equals(action)) {
            String characterId = intent.getStringExtra("characterId");
            String worldBookId = intent.getStringExtra("worldBookId");

            Log.d(TAG, "Widget intent received: characterId=" + characterId + ", worldBookId=" + worldBookId);

            if (characterId != null && worldBookId != null) {
                // 发送 JS 事件通知 Vue 应用
                sendWidgetEvent(characterId, worldBookId);
            }
        }
    }

    /**
     * 通过 Capacitor Bridge 发送 Widget 事件到 JavaScript
     */
    private void sendWidgetEvent(String characterId, String worldBookId) {
        try {
            com.getcapacitor.Bridge bridge = getBridge();
            if (bridge == null) {
                Log.e(TAG, "Bridge is null, cannot send widget event");
                return;
            }

            // 构造 JS 对象参数
            String jsCode = String.format(
                "if (window.__avgWidgetHandler) { window.__avgWidgetHandler({ characterId: '%s', worldBookId: '%s' }); }",
                characterId.replace("'", "\\'"),
                worldBookId.replace("'", "\\'")
            );

            bridge.getWebView().evaluateJavascript(jsCode, null);
            Log.d(TAG, "Widget event sent to JS: charId=" + characterId);
        } catch (Exception e) {
            Log.e(TAG, "Failed to send widget event: " + e.getMessage(), e);
        }
    }

    /**
     * 通过 JS 注入 CSS 自定义属性，传递系统栏安全距离
     * 让 WebView 中的内容区域能正确避开刘海/导航条
     */
    private void injectSafeAreaCssVariables() {
        View decorView = getWindow().getDecorView();
        if (decorView == null) return;

        ViewCompat.setOnApplyWindowInsetsListener(decorView, (v, insets) -> {
            Insets systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
            if (systemBars.top > 0 || systemBars.bottom > 0 || systemBars.left > 0 || systemBars.right > 0) {
                String js = String.format(
                    "document.documentElement.style.setProperty('--safe-area-inset-top','%dpx');" +
                    "document.documentElement.style.setProperty('--safe-area-inset-bottom','%dpx');" +
                    "document.documentElement.style.setProperty('--safe-area-inset-left','%dpx');" +
                    "document.documentElement.style.setProperty('--safe-area-inset-right','%dpx');",
                    systemBars.top,
                    systemBars.bottom,
                    systemBars.left,
                    systemBars.right
                );
                try {
                    com.getcapacitor.Bridge bridge = getBridge();
                    if (bridge != null && bridge.getWebView() != null) {
                        bridge.getWebView().evaluateJavascript(js, null);
                    }
                } catch (Exception e) {
                    Log.e(TAG, "injectSafeAreaCssVariables failed: " + e.getMessage(), e);
                }
            }
            return ViewCompat.onApplyWindowInsets(v, insets);
        });
    }

    private void scheduleInsetsDebug(String source) {
        View decorView = getWindow().getDecorView();
        if (decorView == null) return;

        decorView.post(() -> logInsetsSnapshot(source + ":post"));
        decorView.postDelayed(() -> logInsetsSnapshot(source + ":post300"), 300);
    }

    private void logInsetsSnapshot(String source) {
        try {
            View decorView = getWindow().getDecorView();
            View contentView = findViewById(android.R.id.content);
            WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(decorView);

            Insets statusInsets = insets != null
                ? insets.getInsets(WindowInsetsCompat.Type.statusBars())
                : Insets.of(-1, -1, -1, -1);
            Insets navInsets = insets != null
                ? insets.getInsets(WindowInsetsCompat.Type.navigationBars())
                : Insets.of(-1, -1, -1, -1);
            Insets systemInsets = insets != null
                ? insets.getInsets(WindowInsetsCompat.Type.systemBars())
                : Insets.of(-1, -1, -1, -1);

            boolean statusVisible = insets != null && insets.isVisible(WindowInsetsCompat.Type.statusBars());
            boolean navVisible = insets != null && insets.isVisible(WindowInsetsCompat.Type.navigationBars());

            WindowManager.LayoutParams attrs = getWindow().getAttributes();

            Log.d(
                TAG,
                source
                    + " | statusVisible=" + statusVisible
                    + ", navVisible=" + navVisible
                    + ", statusTop=" + statusInsets.top
                    + ", navBottom=" + navInsets.bottom
                    + ", systemTop=" + systemInsets.top
                    + ", systemBottom=" + systemInsets.bottom
                    + ", decorH=" + (decorView != null ? decorView.getHeight() : -1)
                    + ", contentTop=" + (contentView != null ? contentView.getTop() : -1)
                    + ", contentH=" + (contentView != null ? contentView.getHeight() : -1)
                    + ", cutoutMode=" + attrs.layoutInDisplayCutoutMode
            );
        } catch (Exception e) {
            Log.e(TAG, "logInsetsSnapshot failed: " + e.getMessage(), e);
        }
    }
}
