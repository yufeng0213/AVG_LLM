package com.avgllm.app;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.ActivityCallback;

import androidx.activity.result.ActivityResult;

import java.io.InputStream;
import java.io.FileOutputStream;
import java.io.File;

/**
 * Widget背景图片选择插件
 * 允许用户从相册选择图片并保存到文件系统
 */
@CapacitorPlugin(name = "WidgetBackgroundPicker")
public class WidgetBackgroundPickerPlugin extends Plugin {

    private static final String TAG = "WidgetBgPicker";
    private static final int REQUEST_CODE_PICK_IMAGE = 1001;

    @Override
    public void load() {
        Log.d(TAG, "WidgetBackgroundPickerPlugin loaded");
    }

    /**
     * 打开图片选择器
     */
    @PluginMethod
    public void pickImage(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_PICK);
        intent.setType("image/*");
        intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"image/png", "image/jpeg", "image/webp"});

        startActivityForResult(call, intent, "handleImagePickResult");
    }

    /**
     * 处理图片选择结果
     */
    @ActivityCallback
    private void handleImagePickResult(PluginCall call, ActivityResult result) {
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.reject("User cancelled or no image selected");
            return;
        }

        Intent data = result.getData();
        Uri imageUri = data.getData();

        if (imageUri == null) {
            call.reject("No image URI returned");
            return;
        }

        try {
            // 读取图片
            InputStream inputStream = getContext().getContentResolver().openInputStream(imageUri);
            if (inputStream == null) {
                call.reject("Failed to open image stream");
                return;
            }

            Bitmap bitmap = BitmapFactory.decodeStream(inputStream);
            inputStream.close();

            if (bitmap == null) {
                call.reject("Failed to decode image");
                return;
            }

            // 保存到应用私有目录（文件系统）
            File filesDir = getContext().getFilesDir();
            File widgetBgDir = new File(filesDir, "widget_backgrounds");
            if (!widgetBgDir.exists()) {
                widgetBgDir.mkdirs();
            }

            File outputFile = new File(widgetBgDir, "custom_bg.png");

            // 保存为PNG（高质量）
            FileOutputStream fos = new FileOutputStream(outputFile);
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, fos);
            fos.flush();
            fos.close();

            // 返回文件路径
            JSObject ret = new JSObject();
            ret.put("filePath", outputFile.getAbsolutePath());
            ret.put("width", bitmap.getWidth());
            ret.put("height", bitmap.getHeight());
            ret.put("success", true);
            call.resolve(ret);

            Log.d(TAG, "Image saved to: " + outputFile.getAbsolutePath() + " (" + bitmap.getWidth() + "x" + bitmap.getHeight() + ")");

        } catch (Exception e) {
            Log.e(TAG, "Error processing image: " + e.getMessage(), e);
            call.reject("Error processing image: " + e.getMessage());
        }
    }
}