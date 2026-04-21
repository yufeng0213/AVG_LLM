package com.avgllm.app;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Base64;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;

/**
 * 图片读取插件
 * 用于从文件系统读取图片并返回 base64
 * 支持 Widget 使用角色立绘
 */
@CapacitorPlugin(name = "ImageReader")
public class ImageReaderPlugin extends Plugin {

    private static final String TAG = "ImageReader";

    @PluginMethod
    public void readImage(PluginCall call) {
        String filePath = call.getString("filePath");
        if (filePath == null || filePath.isEmpty()) {
            call.reject("filePath is required");
            return;
        }

        try {
            Bitmap bitmap = loadImageFromPath(getContext(), filePath);
            if (bitmap == null) {
                call.reject("Failed to load image from: " + filePath);
                return;
            }

            // 缩放以避免过大
            int maxWidth = call.getInt("maxWidth", 800);
            int maxHeight = call.getInt("maxHeight", 600);
            bitmap = scaleBitmap(bitmap, maxWidth, maxHeight);

            // 转换为 base64
            String base64 = bitmapToBase64(bitmap, Bitmap.CompressFormat.PNG);

            JSObject result = new JSObject();
            result.put("base64", base64);
            result.put("mimeType", "image/png");
            result.put("width", bitmap.getWidth());
            result.put("height", bitmap.getHeight());
            result.put("dataUrl", "data:image/png;base64," + base64);
            result.put("success", true);

            call.resolve(result);
            Log.d(TAG, "Image loaded: " + bitmap.getWidth() + "x" + bitmap.getHeight() + " from " + filePath);

        } catch (Exception e) {
            Log.e(TAG, "Error reading image: " + e.getMessage(), e);
            call.reject("Error reading image: " + e.getMessage());
        }
    }

    /**
     * 从多种路径尝试加载图片
     */
    private Bitmap loadImageFromPath(Context context, String filePath) {
        // 如果是 dataUrl，直接解码
        if (filePath.startsWith("data:image")) {
            return decodeBase64Image(filePath);
        }

        // 如果是 http URL，暂不支持
        if (filePath.startsWith("http://") || filePath.startsWith("https://")) {
            Log.w(TAG, "HTTP URLs not supported for widget: " + filePath);
            return null;
        }

        // 尝试多种可能的路径
        String[] possiblePaths = {
            filePath,
            context.getFilesDir() + "/" + filePath,
            context.getFilesDir() + "/portraits/" + filePath,
            context.getExternalFilesDir(null) + "/" + filePath,
            context.getExternalFilesDir(null) + "/portraits/" + filePath,
        };

        // 如果是相对路径 ./data/xxx，尝试转换
        if (filePath.startsWith("./data/")) {
            String relativePart = filePath.substring(7); // 去掉 "./data/"
            possiblePaths = new String[]{
                context.getFilesDir() + "/data/" + relativePart,
                context.getExternalFilesDir(null) + "/data/" + relativePart,
                context.getFilesDir() + "/" + relativePart,
                filePath,
            };
        }

        for (String path : possiblePaths) {
            File file = new File(path);
            if (file.exists()) {
                try {
                    FileInputStream fis = new FileInputStream(file);
                    Bitmap bitmap = BitmapFactory.decodeStream(fis);
                    fis.close();
                    if (bitmap != null) {
                        Log.d(TAG, "Loaded image from: " + path);
                        return bitmap;
                    }
                } catch (Exception e) {
                    Log.w(TAG, "Failed to load from " + path + ": " + e.getMessage());
                }
            }
        }

        // 尝试从 Documents 目录（Capacitor Filesystem 使用的目录）
        File documentsDir = context.getExternalFilesDir("Documents");
        if (documentsDir != null) {
            File documentsFile = new File(documentsDir, filePath);
            if (documentsFile.exists()) {
                try {
                    FileInputStream fis = new FileInputStream(documentsFile);
                    Bitmap bitmap = BitmapFactory.decodeStream(fis);
                    fis.close();
                    if (bitmap != null) {
                        Log.d(TAG, "Loaded image from Documents: " + documentsFile.getAbsolutePath());
                        return bitmap;
                    }
                } catch (Exception e) {
                    Log.w(TAG, "Failed from Documents: " + e.getMessage());
                }
            }
        }

        Log.w(TAG, "Image not found at any path for: " + filePath);
        return null;
    }

    /**
     * 解码 base64 图片
     */
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

    /**
     * 缩放图片
     */
    private Bitmap scaleBitmap(Bitmap source, int maxWidth, int maxHeight) {
        if (source == null) return null;

        int width = source.getWidth();
        int height = source.getHeight();

        if (width <= maxWidth && height <= maxHeight) {
            return source;
        }

        float ratio = Math.min((float) maxWidth / width, (float) maxHeight / height);
        int newWidth = Math.round(width * ratio);
        int newHeight = Math.round(height * ratio);

        return Bitmap.createScaledBitmap(source, newWidth, newHeight, true);
    }

    /**
     * Bitmap 转 base64
     */
    private String bitmapToBase64(Bitmap bitmap, Bitmap.CompressFormat format) {
        java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
        bitmap.compress(format, 100, baos);
        byte[] bytes = baos.toByteArray();
        return Base64.encodeToString(bytes, Base64.NO_WRAP);
    }
}