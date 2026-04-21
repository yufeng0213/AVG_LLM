package com.avgllm.app;

import android.Manifest;
import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.provider.Settings;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.util.Log;
import android.view.Gravity;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import java.util.ArrayList;
import java.util.Random;

/**
 * 语音输入 Activity - 使用 SpeechRecognizer API
 */
public class VoiceInputActivity extends Activity {

    private static final String TAG = "===VOICE===";

    private SpeechRecognizer speechRecognizer;
    private LinearLayout dialogView;
    private TextView statusText;
    private ImageView micIcon;

    private int widgetId;
    private String charId;
    private String worldBookId;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Log.e(TAG, "===== onCreate START =====");

        // 获取参数
        widgetId = getIntent().getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, -1);
        charId = getIntent().getStringExtra("characterId");
        worldBookId = getIntent().getStringExtra("worldBookId");

        Log.e(TAG, "widgetId=" + widgetId);
        Log.e(TAG, "charId=" + charId);
        Log.e(TAG, "worldBookId=" + worldBookId);

        setupWindow();
        createDialog();

        Log.e(TAG, "===== onCreate END =====");
    }

    @Override
    protected void onResume() {
        super.onResume();
        Log.e(TAG, "===== onResume =====");
        checkPermission();
    }

    private void setupWindow() {
        // 使用非完全透明的背景，可能有助于 SpeechRecognizer 正常工作
        getWindow().setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(0x80000000));
        getWindow().setLayout(300, 200);
        getWindow().setGravity(Gravity.CENTER);
    }

    private void createDialog() {
        dialogView = new LinearLayout(this);
        dialogView.setOrientation(LinearLayout.VERTICAL);
        dialogView.setGravity(Gravity.CENTER);
        dialogView.setPadding(32, 24, 32, 24);

        GradientDrawable bg = new GradientDrawable();
        bg.setColor(0xE61A1A2E);
        bg.setCornerRadius(16);
        dialogView.setBackground(bg);

        micIcon = new ImageView(this);
        micIcon.setImageResource(R.drawable.widget_voice_btn);
        LinearLayout.LayoutParams micParams = new LinearLayout.LayoutParams(48, 48);
        micParams.gravity = Gravity.CENTER;
        dialogView.addView(micIcon, micParams);

        statusText = new TextView(this);
        statusText.setText("正在准备...");
        statusText.setTextSize(14);
        statusText.setTextColor(Color.WHITE);
        statusText.setGravity(Gravity.CENTER);
        dialogView.addView(statusText);

        setContentView(dialogView);
    }

    private void checkPermission() {
        Log.e(TAG, "checkPermission START");

        int result = ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO);
        Log.e(TAG, "Permission result: " + result + " (GRANTED=0, DENIED=-1)");

        if (result == PackageManager.PERMISSION_GRANTED) {
            Log.e(TAG, "Permission GRANTED");
            // 添加延迟，等待 Activity 完全初始化
            statusText.setText("初始化...");
            dialogView.postDelayed(this::initSpeechRecognizer, 300);
        } else {
            Log.e(TAG, "Permission DENIED");
            handleMissingPermission();
        }
    }

    private void handleMissingPermission() {
        boolean canRequest = ActivityCompat.shouldShowRequestPermissionRationale(this, Manifest.permission.RECORD_AUDIO);
        Log.e(TAG, "canRequest: " + canRequest);

        if (canRequest) {
            Log.e(TAG, "Requesting permission NOW");
            statusText.setText("需要麦克风权限");
            ActivityCompat.requestPermissions(this,
                new String[]{Manifest.permission.RECORD_AUDIO}, 1001);
        } else {
            Log.e(TAG, "Cannot request -> Go to Settings");
            statusText.setText("点此前往设置开启权限");
            statusText.setTextColor(0xFFFFAA00);

            dialogView.setOnClickListener(v -> {
                Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                intent.setData(Uri.parse("package:" + getPackageName()));
                startActivity(intent);
                finish();
            });
        }
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] results) {
        Log.e(TAG, "===== onRequestPermissionsResult =====");
        if (results != null && results.length > 0) {
            Log.e(TAG, "result=" + results[0]);

            if (results[0] == PackageManager.PERMISSION_GRANTED) {
                Log.e(TAG, "User GRANTED!");
                statusText.setText("初始化...");
                statusText.setTextColor(Color.WHITE);
                dialogView.postDelayed(this::initSpeechRecognizer, 300);
            } else {
                Log.e(TAG, "User DENIED!");
                statusText.setText("权限被拒绝");
                dialogView.postDelayed(() -> finish(), 1500);
            }
        }
    }

    private void initSpeechRecognizer() {
        Log.e(TAG, "===== initSpeechRecognizer =====");

        // 检查是否可用
        boolean available = SpeechRecognizer.isRecognitionAvailable(this);
        Log.e(TAG, "isRecognitionAvailable: " + available);

        if (!available) {
            Log.e(TAG, "Recognition NOT available - trying anyway");
            // 不直接退出，尝试继续
        }

        try {
            speechRecognizer = SpeechRecognizer.createSpeechRecognizer(this);
            Log.e(TAG, "SpeechRecognizer created successfully");
        } catch (Exception e) {
            Log.e(TAG, "createSpeechRecognizer FAILED: " + e.getMessage());
            statusText.setText("无法创建语音识别");
            dialogView.postDelayed(() -> finish(), 2000);
            return;
        }

        // 创建识别 Intent
        Intent recognizerIntent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        recognizerIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        recognizerIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "zh-CN");
        recognizerIntent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        recognizerIntent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3);
        // 添加 calling package，可能有助于权限识别
        recognizerIntent.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, getPackageName());

        // 设置监听器
        speechRecognizer.setRecognitionListener(new RecognitionListener() {
            @Override public void onReadyForSpeech(Bundle params) {
                Log.e(TAG, "onReadyForSpeech");
                statusText.setText("请说话...");
                micIcon.animate().scaleX(1.2f).scaleY(1.2f).setDuration(200).start();
            }

            @Override public void onBeginningOfSpeech() {
                Log.e(TAG, "onBeginningOfSpeech");
                statusText.setText("正在听...");
            }

            @Override public void onRmsChanged(float rmsdB) {
                float scale = 1.0f + Math.min(rmsdB / 15f, 0.5f);
                micIcon.setScaleX(scale);
                micIcon.setScaleY(scale);
            }

            @Override public void onBufferReceived(byte[] buffer) {}

            @Override public void onEndOfSpeech() {
                Log.e(TAG, "onEndOfSpeech");
                statusText.setText("处理中...");
                micIcon.setScaleX(1f);
                micIcon.setScaleY(1f);
            }

            @Override public void onError(int error) {
                Log.e(TAG, "onError: " + error + " (" + getErrorName(error) + ")");
                statusText.setText(getErrorName(error));
                micIcon.setScaleX(1f);
                micIcon.setScaleY(1f);

                // 错误 9 可能是临时问题，尝试重新启动
                if (error == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS) {
                    Log.e(TAG, "ERROR_INSUFFICIENT_PERMISSIONS - checking actual permission status");
                    int perm = ContextCompat.checkSelfPermission(VoiceInputActivity.this, Manifest.permission.RECORD_AUDIO);
                    Log.e(TAG, "Actual permission check: " + perm);

                    // 如果权限确实有，尝试重新开始监听
                    if (perm == PackageManager.PERMISSION_GRANTED) {
                        Log.e(TAG, "Permission IS granted - retrying startListening");
                        dialogView.postDelayed(() -> {
                            try {
                                if (speechRecognizer != null) {
                                    speechRecognizer.startListening(recognizerIntent);
                                }
                            } catch (Exception e) {
                                Log.e(TAG, "Retry failed: " + e.getMessage());
                                finish();
                            }
                        }, 500);
                        return;
                    }
                }

                dialogView.postDelayed(() -> finish(), 1500);
            }

            @Override public void onResults(Bundle results) {
                Log.e(TAG, "onResults received");
                ArrayList<String> matches = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                if (matches != null && !matches.isEmpty()) {
                    String text = matches.get(0);
                    Log.e(TAG, "Recognized text: " + text);
                    handleResult(text);
                } else {
                    Log.e(TAG, "No results");
                    statusText.setText("没听清");
                    dialogView.postDelayed(() -> finish(), 1000);
                }
            }

            @Override public void onPartialResults(Bundle partialResults) {
                ArrayList<String> partials = partialResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                if (partials != null && !partials.isEmpty()) {
                    Log.e(TAG, "Partial: " + partials.get(0));
                    statusText.setText(partials.get(0));
                }
            }

            @Override public void onEvent(int eventType, Bundle params) {}
        });

        // 开始监听
        try {
            Log.e(TAG, "Calling startListening...");
            speechRecognizer.startListening(recognizerIntent);
            Log.e(TAG, "startListening called successfully");
        } catch (Exception e) {
            Log.e(TAG, "startListening FAILED: " + e.getMessage());
            statusText.setText("启动失败");
            dialogView.postDelayed(() -> finish(), 2000);
        }
    }

    private void handleResult(String text) {
        String reply = matchReply(text);
        saveDialogue(text, reply);
        updateWidget();

        statusText.setText(reply);
        dialogView.postDelayed(() -> finish(), 1500);
    }

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
        String[] defaults = {"嗯嗯~", "好呀~", "明白~", "收到~", "哦哦~"};
        return defaults[new Random().nextInt(defaults.length)];
    }

    private void saveDialogue(String user, String reply) {
        SharedPreferences prefs = getSharedPreferences("CapacitorStorage", MODE_PRIVATE);
        prefs.edit().putString("widget_current_dialogue_" + worldBookId + "_" + charId, reply).apply();
    }

    private void updateWidget() {
        Intent intent = new Intent(this, CharacterWidgetProvider.class);
        intent.setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE);
        intent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, new int[]{widgetId});
        sendBroadcast(intent);
    }

    private String getErrorName(int error) {
        switch (error) {
            case SpeechRecognizer.ERROR_NETWORK: return "网络错误";
            case SpeechRecognizer.ERROR_NETWORK_TIMEOUT: return "网络超时";
            case SpeechRecognizer.ERROR_AUDIO: return "录音错误";
            case SpeechRecognizer.ERROR_SERVER: return "服务器错误";
            case SpeechRecognizer.ERROR_CLIENT: return "客户端错误";
            case SpeechRecognizer.ERROR_SPEECH_TIMEOUT: return "没声音";
            case SpeechRecognizer.ERROR_NO_MATCH: return "没听清";
            case SpeechRecognizer.ERROR_RECOGNIZER_BUSY: return "识别繁忙";
            case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS: return "缺少权限";
            default: return "错误(" + error + ")";
        }
    }

    @Override
    protected void onPause() {
        Log.e(TAG, "===== onPause =====");
        if (speechRecognizer != null) {
            speechRecognizer.stopListening();
        }
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        Log.e(TAG, "===== onDestroy =====");
        if (speechRecognizer != null) {
            speechRecognizer.cancel();
            speechRecognizer.destroy();
            speechRecognizer = null;
        }
        super.onDestroy();
    }
}