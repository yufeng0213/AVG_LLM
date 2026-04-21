package com.avgllm.app;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;

import java.io.InputStream;
import java.util.Base64;

/**
 * 透明的 Activity 用于处理 MascotService 中的 GIF 文件选择
 */
public class MascotFileChooserActivity extends Activity {

    private static final String TAG = "MascotFileChooser";
    private static final int REQUEST_CODE = 10003;

    // 静态回调存储（因为 Activity 会被销毁）
    private static FileSelectedCallback pendingCallback = null;

    public interface FileSelectedCallback {
        void onFileSelected(String gifBase64, String fileName);
        void onCanceled();
    }

    public static void setPendingCallback(FileSelectedCallback callback) {
        pendingCallback = callback;
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Log.d(TAG, "MascotFileChooserActivity created");

        // 直接启动系统文件选择器
        Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("image/gif");
        intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"image/gif"});

        try {
            startActivityForResult(intent, REQUEST_CODE);
        } catch (Exception e) {
            Log.e(TAG, "Failed to start file chooser: " + e.getMessage());
            if (pendingCallback != null) {
                pendingCallback.onCanceled();
                pendingCallback = null;
            }
            finish();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        Log.d(TAG, "onActivityResult: requestCode=" + requestCode + ", resultCode=" + resultCode);

        if (requestCode == REQUEST_CODE) {
            if (pendingCallback != null) {
                if (resultCode == RESULT_OK && data != null) {
                    Uri uri = data.getData();
                    if (uri != null) {
                        Log.d(TAG, "File selected: " + uri.toString());
                        try {
                            // 读取 GIF 文件并转为 base64
                            ContentResolver resolver = getContentResolver();
                            InputStream inputStream = resolver.openInputStream(uri);
                            if (inputStream != null) {
                                byte[] bytes = new byte[inputStream.available()];
                                inputStream.read(bytes);
                                inputStream.close();

                                // GIF 文件转为 base64
                                String gifBase64 = Base64.getEncoder().encodeToString(bytes);

                                // 获取文件名
                                String fileName = "mascot.gif";
                                android.database.Cursor cursor = resolver.query(uri, null, null, null, null);
                                if (cursor != null && cursor.moveToFirst()) {
                                    int nameIndex = cursor.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME);
                                    if (nameIndex >= 0) {
                                        fileName = cursor.getString(nameIndex);
                                    }
                                    cursor.close();
                                }

                                Log.d(TAG, "GIF file read success, size=" + bytes.length + ", name=" + fileName);
                                pendingCallback.onFileSelected(gifBase64, fileName);
                            }
                        } catch (Exception e) {
                            Log.e(TAG, "Failed to read GIF file: " + e.getMessage());
                            pendingCallback.onCanceled();
                        }
                    } else {
                        pendingCallback.onCanceled();
                    }
                } else {
                    pendingCallback.onCanceled();
                }
                pendingCallback = null;
            }
        }
        finish();
    }
}