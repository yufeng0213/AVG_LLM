package com.avgllm.app;

import android.app.Service;
import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.PixelFormat;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.util.Log;
import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.View;
import android.view.WindowManager;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Random;

/**
 * 悬浮语音窗口 Service
 * 在主屏幕上直接显示悬浮窗口进行语音交互
 */
public class VoiceFloatingService extends Service {

    private static final String TAG = "VoiceFloating";
    private static final String PREFS_NAME = "CapacitorStorage";

    private WindowManager windowManager;
    private View floatingView;
    private TextView statusText;
    private ImageView micIcon;

    private SpeechRecognizer speechRecognizer;
    private Intent speechIntent;

    private int widgetId;
    private String charId;
    private String worldBookId;
    private String charName;

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // 获取参数
        widgetId = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, -1);
        charId = intent.getStringExtra("characterId");
        worldBookId = intent.getStringExtra("worldBookId");
        charName = intent.getStringExtra("characterName");

        Log.d(TAG, "VoiceFloating started: charId=" + charId + ", charName=" + charName);

        // 创建悬浮窗口
        createFloatingWindow();

        // 初始化语音识别
        initSpeechRecognizer();

        // 开始监听
        startListening();

        return START_NOT_STICKY;
    }

    /**
     * 创建悬浮窗口
     */
    private void createFloatingWindow() {
        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);

        // 窗口参数
        WindowManager.LayoutParams params = new WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                : WindowManager.LayoutParams.TYPE_PHONE,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                | WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH
                | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT
        );

        params.gravity = Gravity.CENTER;
        params.x = 0;
        params.y = 0;

        // 创建视图
        floatingView = createFloatingView();

        // 添加到窗口
        windowManager.addView(floatingView, params);

        Log.d(TAG, "Floating window created");
    }

    /**
     * 创建悬浮视图
     */
    private View createFloatingView() {
        // 创建容器
        LinearLayout container = new LinearLayout(this);
        container.setOrientation(LinearLayout.VERTICAL);
        container.setGravity(Gravity.CENTER);
        int padding = (int) (24 * getResources().getDisplayMetrics().density);
        container.setPadding(padding, padding, padding, padding);
        container.setBackgroundResource(R.drawable.voice_dialog_bg);

        // 麦克风图标
        micIcon = new ImageView(this);
        micIcon.setImageResource(R.drawable.widget_voice_btn);
        LinearLayout.LayoutParams micParams = new LinearLayout.LayoutParams(
            (int) (48 * getResources().getDisplayMetrics().density),
            (int) (48 * getResources().getDisplayMetrics().density)
        );
        micParams.gravity = Gravity.CENTER;
        micParams.bottomMargin = (int) (12 * getResources().getDisplayMetrics().density);
        container.addView(micIcon, micParams);

        // 角色名提示
        TextView titleText = new TextView(this);
        if (charName != null && !charName.isEmpty()) {
            titleText.setText("和 " + charName + " 说话");
        } else {
            titleText.setText("请说话");
        }
        titleText.setTextSize(14);
        titleText.setTextColor(0xFFFFFFFF);
        titleText.setGravity(Gravity.CENTER);
        titleText.setPadding(0, 0, 0, (int) (8 * getResources().getDisplayMetrics().density));
        container.addView(titleText);

        // 状态文本
        statusText = new TextView(this);
        statusText.setText("正在聆听...");
        statusText.setTextSize(12);
        statusText.setTextColor(0xFF00FF88);
        statusText.setGravity(Gravity.CENTER);
        statusText.setMaxWidth((int) (200 * getResources().getDisplayMetrics().density));
        container.addView(statusText);

        // 点击外部关闭
        container.setOnClickListener(v -> {
            Log.d(TAG, "Floating view clicked, closing");
            closeFloatingWindow();
        });

        return container;
    }

    /**
     * 初始化语音识别
     */
    private void initSpeechRecognizer() {
        speechRecognizer = SpeechRecognizer.createSpeechRecognizer(this);

        speechIntent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        speechIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        speechIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "zh-CN");
        speechIntent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        speechIntent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);

        speechRecognizer.setRecognitionListener(new RecognitionListener() {
            @Override
            public void onReadyForSpeech(Bundle params) {
                statusText.setText("请说话...");
            }

            @Override
            public void onBeginningOfSpeech() {
                statusText.setText("正在听...");
                micIcon.setScaleX(1.2f);
                micIcon.setScaleY(1.2f);
            }

            @Override
            public void onRmsChanged(float rmsdB) {
                // 音量动画
                float scale = 1.0f + Math.min(rmsdB / 15f, 0.5f);
                micIcon.setScaleX(scale);
                micIcon.setScaleY(scale);
            }

            @Override
            public void onBufferReceived(byte[] buffer) {}

            @Override
            public void onEndOfSpeech() {
                statusText.setText("处理中...");
                micIcon.setScaleX(1.0f);
                micIcon.setScaleY(1.0f);
            }

            @Override
            public void onError(int error) {
                String errorMsg = getErrorMsg(error);
                statusText.setText(errorMsg);
                micIcon.setScaleX(1.0f);
                micIcon.setScaleY(1.0f);

                // 1.5秒后关闭
                floatingView.postDelayed(() -> closeFloatingWindow(), 1500);
            }

            @Override
            public void onResults(Bundle results) {
                ArrayList<String> matches = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                if (matches != null && matches.size() > 0) {
                    String text = matches.get(0);
                    Log.d(TAG, "Recognized: " + text);
                    generateReply(text);
                } else {
                    statusText.setText("没听清");
                    floatingView.postDelayed(() -> closeFloatingWindow(), 1000);
                }
            }

            @Override
            public void onPartialResults(Bundle partialResults) {
                ArrayList<String> partials = partialResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                if (partials != null && partials.size() > 0) {
                    statusText.setText(partials.get(0));
                }
            }

            @Override
            public void onEvent(int eventType, Bundle params) {}
        });

        Log.d(TAG, "Speech recognizer initialized");
    }

    /**
     * 开始监听
     */
    private void startListening() {
        try {
            speechRecognizer.startListening(speechIntent);
            Log.d(TAG, "Started listening");
        } catch (Exception e) {
            Log.e(TAG, "Failed to start listening: " + e.getMessage());
            statusText.setText("启动失败");
            closeFloatingWindow();
        }
    }

    /**
     * 生成回复
     */
    private void generateReply(String userText) {
        String reply = matchReply(userText);

        // 保存对话
        saveDialogue(userText, reply);

        // 更新 Widget
        updateWidget(reply);

        // 显示回复
        statusText.setText(reply);
        micIcon.setVisibility(View.GONE);

        // 1.5秒后关闭
        floatingView.postDelayed(() -> closeFloatingWindow(), 1500);
    }

    /**
     * 匹配预设回复
     */
    private String matchReply(String text) {
        String lower = text.toLowerCase();

        if (lower.contains("早安") || lower.contains("早上好")) return "早安~今天要做什么?";
        if (lower.contains("晚安") || lower.contains("晚上好")) return "晚安，好梦~";
        if (lower.contains("在吗") || lower.contains("在不在")) return "在呢~有事吗?";
        if (lower.contains("想你") || lower.contains("喜欢你")) return "我也想你~";
        if (lower.contains("你好") || lower.contains("嗨")) return "你好呀~";
        if (lower.contains("无聊")) return "无聊就找我聊聊~";
        if (lower.contains("天气")) return "今天天气还行吧?";
        if (lower.contains("吃") || lower.contains("饿")) return "想吃什么呢?";
        if (lower.contains("开心") || lower.contains("高兴")) return "开心就好~";
        if (lower.contains("难过") || lower.contains("伤心")) return "别难过啦~";
        if (lower.contains("再见") || lower.contains("拜拜")) return "再见~下次聊!";
        if (lower.contains("谢谢") || lower.contains("感谢")) return "不客气~";

        // 随机回复
        String[] defaults = {
            "嗯嗯~", "好呀~", "明白~", "收到~",
            "哦哦~", "是这样吗?", "有意思~",
            "好的好的~", "我来啦~"
        };
        return defaults[new Random().nextInt(defaults.length)];
    }

    /**
     * 保存对话
     */
    private void saveDialogue(String userMsg, String reply) {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        SharedPreferences.Editor editor = prefs.edit();

        // 保存当前对话（Widget 显示）
        String currentKey = "widget_current_dialogue_" + worldBookId + "_" + charId;
        editor.putString(currentKey, reply);
        editor.apply();

        // 保存历史记录
        try {
            String historyKey = "widget_dialogue_history_" + worldBookId + "_" + charId;
            String historyJson = prefs.getString(historyKey, "[]");
            JSONArray history = new JSONArray(historyJson);

            JSONObject entry = new JSONObject();
            entry.put("user", userMsg);
            entry.put("reply", reply);
            entry.put("time", System.currentTimeMillis());
            history.put(entry);

            // 保留最近20条
            if (history.length() > 20) {
                JSONArray trimmed = new JSONArray();
                for (int i = history.length() - 20; i < history.length(); i++) {
                    trimmed.put(history.get(i));
                }
                history = trimmed;
            }

            editor.putString(historyKey, history.toString());
            editor.apply();

            Log.d(TAG, "Dialogue saved");
        } catch (Exception e) {
            Log.e(TAG, "Save error: " + e.getMessage());
        }
    }

    /**
     * 更新 Widget
     */
    private void updateWidget(String reply) {
        // 发送更新广播
        Intent updateIntent = new Intent(this, CharacterWidgetProvider.class);
        updateIntent.setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE);
        updateIntent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, new int[]{widgetId});
        sendBroadcast(updateIntent);

        Log.d(TAG, "Widget update broadcast sent");
    }

    /**
     * 错误消息
     */
    private String getErrorMsg(int error) {
        switch (error) {
            case SpeechRecognizer.ERROR_AUDIO: return "录音失败";
            case SpeechRecognizer.ERROR_CLIENT: return "内部错误";
            case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS: return "缺少权限";
            case SpeechRecognizer.ERROR_NETWORK: return "网络问题";
            case SpeechRecognizer.ERROR_NETWORK_TIMEOUT: return "网络超时";
            case SpeechRecognizer.ERROR_NO_MATCH: return "没听清";
            case SpeechRecognizer.ERROR_RECOGNIZER_BUSY: return "忙";
            case SpeechRecognizer.ERROR_SERVER: return "服务器错误";
            case SpeechRecognizer.ERROR_SPEECH_TIMEOUT: return "没声音";
            default: return "出错了";
        }
    }

    /**
     * 关闭悬浮窗口
     */
    private void closeFloatingWindow() {
        if (speechRecognizer != null) {
            speechRecognizer.stopListening();
            speechRecognizer.destroy();
            speechRecognizer = null;
        }

        if (floatingView != null && windowManager != null) {
            windowManager.removeView(floatingView);
            floatingView = null;
        }

        Log.d(TAG, "Floating window closed");
        stopSelf();
    }

    @Override
    public void onDestroy() {
        closeFloatingWindow();
        super.onDestroy();
    }
}