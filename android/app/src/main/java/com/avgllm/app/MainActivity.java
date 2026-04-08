package com.avgllm.app;

import android.os.Bundle;
import android.os.Build;
import android.graphics.Color;
import android.view.View;
import android.view.WindowManager;
import android.content.pm.ActivityInfo;
import android.util.Log;
import com.getcapacitor.BridgeActivity;
import androidx.core.graphics.Insets;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.core.view.ViewCompat;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "AVGLayoutDebug";
    
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(CardImportPlugin.class);
        super.onCreate(savedInstanceState);
        
        // 启动时应用系统栏样式并锁定竖屏
        applyStandardSystemUi();
        enablePortraitMode();
        scheduleInsetsDebug("onCreate");
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
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        applyStandardSystemUi();
        scheduleInsetsDebug("onResume");
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
