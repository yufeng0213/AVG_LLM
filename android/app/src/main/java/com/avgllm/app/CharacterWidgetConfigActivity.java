package com.avgllm.app;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.LinearLayout;
import android.widget.ListView;
import android.widget.TextView;
import android.widget.Button;
import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Widget 配置 Activity
 * 用户添加 Widget 时，选择要显示的角色
 */
public class CharacterWidgetConfigActivity extends Activity {

    private static final String TAG = "WidgetConfigActivity";
    private static final String PREFS_NAME = "CapacitorStorage";
    private static final String WORLD_BOOK_KEY = "avg_llm_world_books";
    private static final String ACTIVE_KEY = "avg_llm_active_world_book";

    private int appWidgetId = AppWidgetManager.INVALID_APPWIDGET_ID;
    private List<WorldBookItem> worldBooks = new ArrayList<>();
    private List<CharacterItem> characters = new ArrayList<>();
    private String selectedWorldBookId = null;
    private String selectedCharId = null;

    private LinearLayout rootLayout;
    private TextView titleText;
    private TextView subtitleText;
    private ListView listView;
    private Button confirmBtn;
    private Button cancelBtn;

    private int currentStep = 0; // 0: 选择世界书, 1: 选择角色

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // 获取 Widget ID
        Intent intent = getIntent();
        Bundle extras = intent.getExtras();
        if (extras != null) {
            appWidgetId = extras.getInt(AppWidgetManager.EXTRA_APPWIDGET_ID,
                AppWidgetManager.INVALID_APPWIDGET_ID);
        }

        if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
            finish();
            return;
        }

        // 设置结果为取消（用户取消时不创建 Widget）
        setResult(RESULT_CANCELED);

        // 创建简单布局
        createLayout();

        // 加载世界书列表
        loadWorldBooks();
    }

    /**
     * 创建简单布局（不使用 XML 布局文件）
     */
    private void createLayout() {
        rootLayout = new LinearLayout(this);
        rootLayout.setOrientation(LinearLayout.VERTICAL);
        rootLayout.setPadding(32, 32, 32, 32);
        rootLayout.setBackgroundColor(0xFF1A1A2E);

        // 标题
        titleText = new TextView(this);
        titleText.setTextSize(18);
        titleText.setTextColor(0xFFFFFFFF);
        titleText.setPadding(0, 0, 0, 16);
        titleText.setText("选择世界书");
        rootLayout.addView(titleText);

        // 子标题
        subtitleText = new TextView(this);
        subtitleText.setTextSize(14);
        subtitleText.setTextColor(0xFFAAAAAA);
        subtitleText.setPadding(0, 0, 0, 16);
        subtitleText.setText("选择包含目标角色的世界书");
        rootLayout.addView(subtitleText);

        // 列表
        listView = new ListView(this);
        listView.setBackgroundColor(0xFF2D2D44);
        LinearLayout.LayoutParams listParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f);
        listView.setLayoutParams(listParams);
        listView.setOnItemClickListener(new AdapterView.OnItemClickListener() {
            @Override
            public void onItemClick(AdapterView<?> parent, View view, int position, long id) {
                handleItemClick(position);
            }
        });
        rootLayout.addView(listView);

        // 按钮容器
        LinearLayout buttonContainer = new LinearLayout(this);
        buttonContainer.setOrientation(LinearLayout.HORIZONTAL);
        buttonContainer.setPadding(0, 16, 0, 0);
        LinearLayout.LayoutParams btnContainerParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        buttonContainer.setLayoutParams(btnContainerParams);

        // 取消按钮
        cancelBtn = new Button(this);
        cancelBtn.setText("取消");
        cancelBtn.setBackgroundColor(0xFF3D3D5C);
        cancelBtn.setTextColor(0xFFFFFFFF);
        LinearLayout.LayoutParams cancelParams = new LinearLayout.LayoutParams(0,
            LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        cancelParams.setMargins(0, 0, 8, 0);
        cancelBtn.setLayoutParams(cancelParams);
        cancelBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                finish();
            }
        });
        buttonContainer.addView(cancelBtn);

        // 确认按钮
        confirmBtn = new Button(this);
        confirmBtn.setText("确认");
        confirmBtn.setBackgroundColor(0xFF4A90D9);
        confirmBtn.setTextColor(0xFFFFFFFF);
        LinearLayout.LayoutParams confirmParams = new LinearLayout.LayoutParams(0,
            LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        confirmParams.setMargins(8, 0, 0, 0);
        confirmBtn.setLayoutParams(confirmParams);
        confirmBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                handleConfirm();
            }
        });
        buttonContainer.addView(confirmBtn);

        rootLayout.addView(buttonContainer);

        setContentView(rootLayout);
    }

    /**
     * 加载世界书列表
     */
    private void loadWorldBooks() {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);

        try {
            String worldBooksJson = prefs.getString(WORLD_BOOK_KEY, null);
            String activeId = prefs.getString(ACTIVE_KEY, "default_world_book");

            if (worldBooksJson != null) {
                JSONArray array = new JSONArray(worldBooksJson);
                for (int i = 0; i < array.length(); i++) {
                    JSONObject book = array.getJSONObject(i);
                    String id = book.optString("id", "");
                    String title = book.optString("title", "未命名世界书");
                    int charCount = 0;
                    JSONArray chars = book.optJSONArray("characters");
                    if (chars != null) charCount = chars.length();

                    worldBooks.add(new WorldBookItem(id, title, charCount));
                }
            }

            if (worldBooks.isEmpty()) {
                subtitleText.setText("没有找到世界书，请先在应用中创建世界书");
                updateListView(new String[]{});
            } else {
                // 默认选择活跃的世界书
                for (WorldBookItem item : worldBooks) {
                    if (item.id.equals(activeId)) {
                        selectedWorldBookId = item.id;
                        break;
                    }
                }
                updateWorldBookListView();
            }
        } catch (Exception e) {
            Log.e(TAG, "Error loading world books: " + e.getMessage(), e);
            subtitleText.setText("加载失败: " + e.getMessage());
        }
    }

    /**
     * 更新世界书列表视图
     */
    private void updateWorldBookListView() {
        String[] items = new String[worldBooks.size()];
        for (int i = 0; i < worldBooks.size(); i++) {
            WorldBookItem wb = worldBooks.get(i);
            String marker = wb.id.equals(selectedWorldBookId) ? " ✓" : "";
            items[i] = wb.title + " (" + wb.charCount + " 角色)" + marker;
        }
        updateListView(items);
    }

    /**
     * 加载角色列表
     */
    private void loadCharacters(String worldBookId) {
        characters.clear();
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);

        try {
            String worldBooksJson = prefs.getString(WORLD_BOOK_KEY, null);
            if (worldBooksJson != null) {
                JSONArray array = new JSONArray(worldBooksJson);
                for (int i = 0; i < array.length(); i++) {
                    JSONObject book = array.getJSONObject(i);
                    if (book.optString("id", "").equals(worldBookId)) {
                        JSONArray chars = book.optJSONArray("characters");
                        if (chars != null) {
                            for (int j = 0; j < chars.length(); j++) {
                                JSONObject charObj = chars.getJSONObject(j);
                                String charId = charObj.optString("id", "");
                                String charName = charObj.optString("name", "未知角色");
                                int favor = 50;
                                JSONObject rel = charObj.optJSONObject("relationshipBase");
                                if (rel != null) favor = rel.optInt("favor", 50);

                                characters.add(new CharacterItem(charId, charName, favor));
                            }
                        }
                        break;
                    }
                }
            }

            if (characters.isEmpty()) {
                subtitleText.setText("该世界书没有角色");
            } else {
                selectedCharId = characters.get(0).id;
            }
            updateCharacterListView();
        } catch (Exception e) {
            Log.e(TAG, "Error loading characters: " + e.getMessage(), e);
        }
    }

    /**
     * 更新角色列表视图
     */
    private void updateCharacterListView() {
        String[] items = new String[characters.size()];
        for (int i = 0; i < characters.size(); i++) {
            CharacterItem ci = characters.get(i);
            String marker = ci.id.equals(selectedCharId) ? " ✓" : "";
            items[i] = ci.name + " (好感: " + ci.favor + ")" + marker;
        }
        updateListView(items);
    }

    /**
     * 更新 ListView
     */
    private void updateListView(String[] items) {
        ArrayAdapter<String> adapter = new ArrayAdapter<>(this,
            android.R.layout.simple_list_item_1, android.R.id.text1, items);
        listView.setAdapter(adapter);
    }

    /**
     * 处理列表点击
     */
    private void handleItemClick(int position) {
        if (currentStep == 0) {
            // 选择世界书
            if (position >= 0 && position < worldBooks.size()) {
                selectedWorldBookId = worldBooks.get(position).id;
                updateWorldBookListView();
            }
        } else {
            // 选择角色
            if (position >= 0 && position < characters.size()) {
                selectedCharId = characters.get(position).id;
                updateCharacterListView();
            }
        }
    }

    /**
     * 处理确认按钮
     */
    private void handleConfirm() {
        if (currentStep == 0) {
            // 进入角色选择
            if (selectedWorldBookId != null) {
                currentStep = 1;
                titleText.setText("选择角色");
                subtitleText.setText("选择要在 Widget 上显示的角色");
                loadCharacters(selectedWorldBookId);
            }
        } else {
            // 完成 Widget 配置
            if (selectedCharId != null && selectedWorldBookId != null) {
                saveWidgetConfig();
                returnWidgetResult();
            }
        }
    }

    /**
     * 保存 Widget 配置
     */
    private void saveWidgetConfig() {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        SharedPreferences.Editor editor = prefs.edit();
        editor.putString("widget_char_" + appWidgetId, selectedCharId);
        editor.putString("widget_world_" + appWidgetId, selectedWorldBookId);

        // 保存角色名称用于显示
        String charName = "";
        for (CharacterItem ci : characters) {
            if (ci.id.equals(selectedCharId)) {
                charName = ci.name;
                break;
            }
        }
        editor.putString("widget_char_name_" + appWidgetId, charName);
        editor.apply();

        Log.d(TAG, "Widget config saved: widgetId=" + appWidgetId +
            ", worldBook=" + selectedWorldBookId + ", char=" + selectedCharId);
    }

    /**
     * 返回 Widget 配置结果
     */
    private void returnWidgetResult() {
        // 更新 Widget
        AppWidgetManager appWidgetManager = AppWidgetManager.getInstance(this);
        CharacterWidgetProvider provider = new CharacterWidgetProvider();
        provider.onUpdate(this, appWidgetManager, new int[]{appWidgetId});

        // 返回成功结果
        Intent resultValue = new Intent();
        resultValue.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
        setResult(RESULT_OK, resultValue);

        finish();
    }

    /**
     * 世界书数据项
     */
    private static class WorldBookItem {
        String id;
        String title;
        int charCount;

        WorldBookItem(String id, String title, int charCount) {
            this.id = id;
            this.title = title;
            this.charCount = charCount;
        }
    }

    /**
     * 角色数据项
     */
    private static class CharacterItem {
        String id;
        String name;
        int favor;

        CharacterItem(String id, String name, int favor) {
            this.id = id;
            this.name = name;
            this.favor = favor;
        }
    }
}