package com.avgllm.app;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.Intent;
import android.os.Bundle;
import android.util.Log;

/**
 * 桥梁 Activity：启动语音输入后立即关闭
 */
public class VoiceLauncherActivity extends Activity {

    private static final String TAG = "VoiceLauncher";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Log.i(TAG, "========== onCreate START ==========");

        // 获取参数
        int widgetId = getIntent().getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, -1);
        String charId = getIntent().getStringExtra("characterId");
        String worldBookId = getIntent().getStringExtra("worldBookId");
        String charName = getIntent().getStringExtra("characterName");

        Log.i(TAG, "widgetId=" + widgetId);
        Log.i(TAG, "charId=" + charId);
        Log.i(TAG, "worldBookId=" + worldBookId);
        Log.i(TAG, "charName=" + charName);

        // 启动语音输入 Activity
        Intent intent = new Intent(this, VoiceInputActivity.class);
        intent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId);
        intent.putExtra("characterId", charId);
        intent.putExtra("worldBookId", worldBookId);
        intent.putExtra("characterName", charName);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        Log.i(TAG, "Starting VoiceInputActivity...");

        try {
            startActivity(intent);
            Log.i(TAG, "VoiceInputActivity started successfully");
        } catch (Exception e) {
            Log.e(TAG, "Failed to start VoiceInputActivity: " + e.getMessage());
            e.printStackTrace();
        }

        Log.i(TAG, "Finishing VoiceLauncherActivity");
        finish();
        Log.i(TAG, "========== onCreate END ==========");
    }
}