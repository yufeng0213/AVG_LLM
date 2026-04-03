package com.avgllm.app;

import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.content.pm.ActivityInfo;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // 启动时设置全屏和横屏
        enableFullscreen();
        enableLandscapeMode();
    }
    
    /**
     * 启用全屏模式
     * 隐藏状态栏、导航栏，保持全屏状态
     */
    private void enableFullscreen() {
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        
        // 使用 leanback 模式，适合游戏和视频应用
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_FULLSCREEN |
            View.SYSTEM_UI_FLAG_HIDE_NAVIGATION |
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY |
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE |
            View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN |
            View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
        );
    }
    
    /**
     * 启用横屏模式
     */
    private void enableLandscapeMode() {
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
    }
    
    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            // 重新获得焦点时恢复全屏
            enableFullscreen();
        }
    }
}
