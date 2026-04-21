package com.avgllm.app;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Base64;
import android.util.Log;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;

/**
 * 角色信息 Widget Provider
 * 底层：角色立绘背景
 * 上层：取景框PNG叠加
 */
public class CharacterWidgetProvider extends AppWidgetProvider {

    private static final String TAG = "CharacterWidget";
    private static final String PREFS_NAME = "CapacitorStorage";
    private static final String WORLD_BOOK_KEY = "avg_llm_world_books";
    private static final String WIDGET_FRAME_KEY = "avg_llm_widget_frame"; // 取景框样式

    // 随机对话列表
    private static final String[] DEFAULT_DIALOGUES = {
        "今天天气真好呢~",
        "有什么有趣的事吗？",
        "我在等你哦~",
        "想聊点什么？",
        "下午茶时间！",
        "今天过得怎么样？",
        "稍微有点无聊...",
        "嗯？你在看我？",
        "欢迎回来~",
        "可以陪我聊聊吗？",
        "最近还好吗？",
        "想听故事吗？",
        "我也想出去走走~",
        "你喜欢什么？",
        "有时间就来看看我吧~"
    };

    private static final Random random = new Random();

    /**
     * 获取随机对话
     */
    private String getRandomDialogue() {
        return DEFAULT_DIALOGUES[random.nextInt(DEFAULT_DIALOGUES.length)];
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        Log.d(TAG, "onUpdate called, widgetIds count: " + appWidgetIds.length);

        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);

        for (int appWidgetId : appWidgetIds) {
            String selectedCharId = prefs.getString("widget_char_" + appWidgetId, null);
            String selectedWorldBookId = prefs.getString("widget_world_" + appWidgetId, null);

            Log.d(TAG, "Widget " + appWidgetId + ": charId=" + selectedCharId + ", worldBookId=" + selectedWorldBookId);

            RemoteViews views = buildWidgetView(context, selectedCharId, selectedWorldBookId, appWidgetId);
            appWidgetManager.updateAppWidget(appWidgetId, views);
        }
    }

    @Override
    public void onDeleted(Context context, int[] appWidgetIds) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        SharedPreferences.Editor editor = prefs.edit();

        for (int appWidgetId : appWidgetIds) {
            editor.remove("widget_char_" + appWidgetId);
            editor.remove("widget_world_" + appWidgetId);
            editor.remove("widget_char_name_" + appWidgetId);
        }
        editor.apply();

        Log.d(TAG, "Widgets deleted: " + appWidgetIds.length);
    }

    /**
     * 根据取景框ID获取对应的drawable资源ID
     */
    private int getFrameDrawableId(String frameId) {
        if (frameId == null) frameId = "camera";
        switch (frameId) {
            case "camera":
                return R.drawable.widget_frame_camera;
            case "simple":
                return R.drawable.widget_frame_simple;
            case "none":
                return R.drawable.widget_frame_none;
            default:
                return R.drawable.widget_frame_camera;
        }
    }

    /**
     * 从角色数据加载立绘图片（底层背景）
     */
    private Bitmap loadCharacterPortrait(Context context, JSONObject character, String worldBookId, String charId) {
        if (character == null) return null;

        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);

            // 1. 优先从已同步的文件读取 (widget_portraits/世界书ID_角色ID.png)
            String syncPathKey = "widget_portrait_path_" + worldBookId + "_" + charId;
            String syncPath = prefs.getString(syncPathKey, null);
            if (syncPath != null) {
                Bitmap bmp = loadSyncedPortraitFile(context, syncPath);
                if (bmp != null) {
                    Log.d(TAG, "Loaded portrait from synced file: " + syncPath);
                    return scaleBitmapForWidget(bmp);
                }
            }

            // 也尝试直接读取文件目录
            String directPath = "widget_portraits/" + worldBookId + "_" + charId + ".png";
            Bitmap directBmp = loadSyncedPortraitFile(context, directPath);
            if (directBmp != null) {
                Log.d(TAG, "Loaded portrait from direct file path: " + directPath);
                return scaleBitmapForWidget(directBmp);
            }

            // 2. 使用 smsAvatar (base64)
            String smsAvatar = character.optString("smsAvatar", null);
            if (smsAvatar != null && smsAvatar.startsWith("data:image")) {
                Bitmap bmp = decodeBase64Image(smsAvatar);
                if (bmp != null) {
                    Log.d(TAG, "Loaded portrait from smsAvatar (base64)");
                    return scaleBitmapForWidget(bmp);
                }
            }

            // 3. 尝试从 portraits 数组获取立绘
            JSONArray portraits = character.optJSONArray("portraits");
            if (portraits != null && portraits.length() > 0) {
                // 先查找 emotion=default 的立绘
                JSONObject defaultPortrait = null;
                for (int i = 0; i < portraits.length(); i++) {
                    JSONObject p = portraits.getJSONObject(i);
                    String emotion = p.optString("emotion", "");
                    if ("default".equals(emotion.trim())) {
                        defaultPortrait = p;
                        break;
                    }
                }

                // 如果没有 default，使用第一个
                if (defaultPortrait == null) {
                    defaultPortrait = portraits.getJSONObject(0);
                }

                String filePath = defaultPortrait.optString("filePath", null);
                if (filePath != null && !filePath.isEmpty()) {
                    // 尝试从文件系统加载
                    Bitmap bmp = loadPortraitFromFile(context, filePath);
                    if (bmp != null) {
                        Log.d(TAG, "Loaded portrait from file: " + filePath);
                        return scaleBitmapForWidget(bmp);
                    }
                }
            }

            Log.d(TAG, "No portrait found for character");
            return null;
        } catch (Exception e) {
            Log.e(TAG, "Error loading character portrait: " + e.getMessage());
            return null;
        }
    }

    /**
     * 从已同步的文件加载立绘
     */
    private Bitmap loadSyncedPortraitFile(Context context, String filePath) {
        try {
            // Capacitor Filesystem Directory.Files 对应 getFilesDir()
            File filesDir = context.getFilesDir();

            List<String> possiblePaths = new ArrayList<>();
            possiblePaths.add(filesDir + "/" + filePath);
            possiblePaths.add(filesDir + "/files/" + filePath);

            for (String path : possiblePaths) {
                File file = new File(path);
                if (file.exists()) {
                    FileInputStream fis = new FileInputStream(file);
                    Bitmap bitmap = BitmapFactory.decodeStream(fis);
                    fis.close();
                    if (bitmap != null) {
                        return bitmap;
                    }
                }
            }

            return null;
        } catch (Exception e) {
            Log.e(TAG, "Error loading synced portrait file: " + e.getMessage());
            return null;
        }
    }

    /**
     * 从文件系统加载立绘图片
     */
    private Bitmap loadPortraitFromFile(Context context, String filePath) {
        try {
            // 如果是 http URL，暂不支持
            if (filePath.startsWith("http://") || filePath.startsWith("https://")) {
                Log.d(TAG, "HTTP URLs not supported for widget portraits");
                return null;
            }

            // 如果是 dataUrl，直接解码
            if (filePath.startsWith("data:image")) {
                return decodeBase64Image(filePath);
            }

            // filePath 可能是相对路径如 ./data/lihui/xxx.png
            // 需要转换为 Android 文件系统路径

            List<String> possiblePaths = new ArrayList<>();

            // 处理 ./data/ 前缀的路径
            if (filePath.startsWith("./data/")) {
                String relativePart = filePath.substring(7); // 去掉 "./data/"
                possiblePaths.add(context.getFilesDir() + "/data/" + relativePart);
                possiblePaths.add(context.getExternalFilesDir(null) + "/data/" + relativePart);
                // 也尝试 Capacitor Documents 目录
                File documentsDir = context.getExternalFilesDir("Documents");
                if (documentsDir != null) {
                    possiblePaths.add(documentsDir.getAbsolutePath() + "/data/" + relativePart);
                }
            }

            // 处理 ./portraits/ 前缀
            if (filePath.startsWith("./portraits/")) {
                String relativePart = filePath.substring(12);
                possiblePaths.add(context.getFilesDir() + "/portraits/" + relativePart);
                possiblePaths.add(context.getExternalFilesDir(null) + "/portraits/" + relativePart);
            }

            // 其他相对路径
            if (filePath.startsWith("./")) {
                String relativePart = filePath.substring(2);
                possiblePaths.add(context.getFilesDir() + "/" + relativePart);
                possiblePaths.add(context.getExternalFilesDir(null) + "/" + relativePart);
            }

            // 常规路径尝试
            possiblePaths.add(filePath);
            possiblePaths.add(context.getFilesDir() + "/" + filePath);
            possiblePaths.add(context.getFilesDir() + "/portraits/" + filePath);
            possiblePaths.add(context.getExternalFilesDir(null) + "/" + filePath);
            possiblePaths.add(context.getExternalFilesDir(null) + "/portraits/" + filePath);

            // Capacitor Filesystem 默认使用 Documents 目录
            File documentsDir = context.getExternalFilesDir("Documents");
            if (documentsDir != null) {
                possiblePaths.add(documentsDir.getAbsolutePath() + "/" + filePath);
                possiblePaths.add(documentsDir.getAbsolutePath() + "/portraits/" + filePath);
            }

            // 尝试所有路径
            for (String path : possiblePaths) {
                File f = new File(path);
                if (f.exists()) {
                    Log.d(TAG, "Found portrait at: " + path);
                    FileInputStream fis = new FileInputStream(f);
                    Bitmap bitmap = BitmapFactory.decodeStream(fis);
                    fis.close();
                    if (bitmap != null) {
                        return bitmap;
                    }
                }
            }

            Log.d(TAG, "Portrait file not found at any path for: " + filePath);
            return null;
        } catch (Exception e) {
            Log.e(TAG, "Error loading portrait from file: " + e.getMessage());
            return null;
        }
    }

    /**
     * 从文件系统加载自定义取景框PNG（上层叠加）
     */
    private Bitmap loadCustomFrame(Context context) {
        try {
            File filesDir = context.getFilesDir();
            File frameFile = new File(filesDir, "widget_backgrounds/custom_bg.png");

            if (!frameFile.exists()) {
                Log.d(TAG, "Custom frame file not found");
                return null;
            }

            // 先获取图片尺寸
            BitmapFactory.Options options = new BitmapFactory.Options();
            options.inJustDecodeBounds = true;
            BitmapFactory.decodeFile(frameFile.getAbsolutePath(), options);

            int originalWidth = options.outWidth;
            int originalHeight = options.outHeight;

            Log.d(TAG, "Custom frame original size: " + originalWidth + "x" + originalHeight);

            // 取景框需要精确匹配Widget尺寸，不缩放太狠
            // 保留800px左右宽度
            int targetWidth = 800;
            int inSampleSize = 1;

            if (originalWidth > targetWidth) {
                inSampleSize = originalWidth / targetWidth;
                inSampleSize = Math.max(1, Integer.highestOneBit(inSampleSize));
            }

            options.inJustDecodeBounds = false;
            options.inSampleSize = inSampleSize;
            options.inPreferredConfig = Bitmap.Config.ARGB_8888; // 保持透明度

            Bitmap bitmap = BitmapFactory.decodeFile(frameFile.getAbsolutePath(), options);

            if (bitmap != null) {
                Log.d(TAG, "Loaded custom frame: " + bitmap.getWidth() + "x" + bitmap.getHeight());
            }
            return bitmap;
        } catch (Exception e) {
            Log.e(TAG, "Error loading custom frame: " + e.getMessage());
            return null;
        }
    }

    /**
     * 缩放图片适配Widget（避免OOM）
     */
    private Bitmap scaleBitmapForWidget(Bitmap source) {
        if (source == null) return null;

        int targetWidth = 800;
        int targetHeight = 600;

        int width = source.getWidth();
        int height = source.getHeight();

        if (width <= targetWidth && height <= targetHeight) {
            return source;
        }

        float ratio = Math.min((float) targetWidth / width, (float) targetHeight / height);
        int newWidth = Math.round(width * ratio);
        int newHeight = Math.round(height * ratio);

        return Bitmap.createScaledBitmap(source, newWidth, newHeight, true);
    }

    private RemoteViews buildWidgetView(Context context, String charId, String worldBookId, int widgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.character_widget);

        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String frameStyle = prefs.getString(WIDGET_FRAME_KEY, "camera");

        // 未配置状态
        if (charId == null || worldBookId == null) {
            views.setTextViewText(R.id.character_name, "点击配置");
            views.setTextViewText(R.id.character_status, "NO SIGNAL");
            views.setTextViewText(R.id.dialogue_text, "快选个角色吧~");

            // 默认背景
            views.setImageViewResource(R.id.widget_portrait_bg, R.drawable.widget_default_bg);
            views.setImageViewResource(R.id.widget_frame_overlay, R.drawable.widget_frame_camera);

            Intent configIntent = new Intent(context, CharacterWidgetConfigActivity.class);
            configIntent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId);
            configIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            views.setOnClickPendingIntent(R.id.widget_root,
                android.app.PendingIntent.getActivity(context, widgetId, configIntent,
                    android.app.PendingIntent.FLAG_UPDATE_CURRENT | android.app.PendingIntent.FLAG_IMMUTABLE));
            return views;
        }

        try {
            JSONObject character = findCharacter(context, worldBookId, charId);

            if (character != null) {
                String name = character.optString("name", "未知角色");
                views.setTextViewText(R.id.character_name, name);

                // 获取好感度用于状态显示
                JSONObject relationshipBase = character.optJSONObject("relationshipBase");
                int favorValue = relationshipBase != null ? relationshipBase.optInt("favor", 50) : 50;
                String statusText = getStatusText(favorValue);
                views.setTextViewText(R.id.character_status, statusText);

                // ===== 对话气泡：显示保存的对话或随机对话 =====
                String savedDialogue = prefs.getString("widget_current_dialogue_" + worldBookId + "_" + charId, null);
                if (savedDialogue != null && !savedDialogue.isEmpty()) {
                    views.setTextViewText(R.id.dialogue_text, savedDialogue);
                } else {
                    views.setTextViewText(R.id.dialogue_text, getRandomDialogue());
                }

                // ===== 底层：角色立绘背景 =====
                Bitmap portrait = loadCharacterPortrait(context, character, worldBookId, charId);
                if (portrait != null) {
                    views.setImageViewBitmap(R.id.widget_portrait_bg, portrait);
                    Log.d(TAG, "Using character portrait as background");
                } else {
                    views.setImageViewResource(R.id.widget_portrait_bg, R.drawable.widget_default_bg);
                    Log.d(TAG, "Using default background (no portrait)");
                }

                // ===== 上层：取景框PNG =====
                if (frameStyle.equals("custom")) {
                    Bitmap customFrame = loadCustomFrame(context);
                    if (customFrame != null) {
                        views.setImageViewBitmap(R.id.widget_frame_overlay, customFrame);
                        Log.d(TAG, "Using custom frame PNG");
                    } else {
                        views.setImageViewResource(R.id.widget_frame_overlay, R.drawable.widget_frame_camera);
                    }
                } else {
                    int frameDrawableId = getFrameDrawableId(frameStyle);
                    views.setImageViewResource(R.id.widget_frame_overlay, frameDrawableId);
                    Log.d(TAG, "Using frame style: " + frameStyle);
                }

                Log.d(TAG, "Widget updated for character: " + name);
            } else {
                views.setTextViewText(R.id.character_name, "NO SIGNAL");
                views.setTextViewText(R.id.character_status, "OFFLINE");
                views.setTextViewText(R.id.dialogue_text, "找不到我了...");
                views.setImageViewResource(R.id.widget_portrait_bg, R.drawable.widget_default_bg);
                views.setImageViewResource(R.id.widget_frame_overlay, R.drawable.widget_frame_camera);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error building widget view: " + e.getMessage(), e);
            views.setTextViewText(R.id.character_name, "ERROR");
            views.setTextViewText(R.id.character_status, "CONN_FAIL");
            views.setTextViewText(R.id.dialogue_text, "出了点问题...");
        }

        // 点击 Widget 触发悬浮语音窗口
        if (charId != null && worldBookId != null) {
            Intent voiceIntent = new Intent(context, VoiceLauncherActivity.class);
            voiceIntent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId);
            voiceIntent.putExtra("characterId", charId);
            voiceIntent.putExtra("worldBookId", worldBookId);
            voiceIntent.putExtra("characterName", prefs.getString("widget_char_name_" + widgetId, ""));
            voiceIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_NO_ANIMATION);
            views.setOnClickPendingIntent(R.id.widget_root,
                android.app.PendingIntent.getActivity(context, widgetId, voiceIntent,
                    android.app.PendingIntent.FLAG_UPDATE_CURRENT | android.app.PendingIntent.FLAG_IMMUTABLE));
        }

        return views;
    }

    private String getStatusText(int favor) {
        if (favor >= 80) return "CONNECTED";
        if (favor >= 60) return "ACTIVE";
        if (favor >= 40) return "IDLE";
        if (favor >= 20) return "STANDBY";
        return "OFFLINE";
    }

    private JSONObject findCharacter(Context context, String worldBookId, String charId) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);

        try {
            String worldBooksJson = prefs.getString(WORLD_BOOK_KEY, null);
            if (worldBooksJson == null) return null;

            JSONArray worldBooks = new JSONArray(worldBooksJson);

            for (int i = 0; i < worldBooks.length(); i++) {
                JSONObject book = worldBooks.getJSONObject(i);
                if (book.optString("id", "").equals(worldBookId)) {
                    JSONArray characters = book.optJSONArray("characters");
                    if (characters != null) {
                        for (int j = 0; j < characters.length(); j++) {
                            JSONObject character = characters.getJSONObject(j);
                            if (character.optString("id", "").equals(charId)) {
                                return character;
                            }
                        }
                    }
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Error finding character: " + e.getMessage());
        }

        return null;
    }

    private Bitmap decodeBase64Image(String dataUrl) {
        try {
            int commaIndex = dataUrl.indexOf(",");
            if (commaIndex < 0) return null;

            String base64 = dataUrl.substring(commaIndex + 1);
            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
            return BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
        } catch (Exception e) {
            Log.e(TAG, "Error decoding base64: " + e.getMessage());
            return null;
        }
    }
}