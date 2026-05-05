package com.avgllm.app;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Environment;
import android.util.Log;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileWriter;
import java.io.IOException;

@CapacitorPlugin(name = "StoragePermission")
public class StoragePermissionPlugin extends Plugin {
    private static final int REQ_STORAGE = 10002;
    private PluginCall pendingCall;

    @PluginMethod
    public void requestPermission(PluginCall call) {
        // Android 10+ (API 29+) 使用 Scoped Storage，不需要 WRITE_EXTERNAL_STORAGE
        // 对于公共 Documents 目录，应用可以直接写入
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            JSObject result = new JSObject();
            result.put("granted", true);
            result.put("scopedStorage", true);
            call.resolve(result);
            return;
        }

        // Android 9 及以下需要申请 WRITE_EXTERNAL_STORAGE 权限
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.WRITE_EXTERNAL_STORAGE)
                == PackageManager.PERMISSION_GRANTED) {
            JSObject result = new JSObject();
            result.put("granted", true);
            result.put("scopedStorage", false);
            call.resolve(result);
            return;
        }

        pendingCall = call;
        ActivityCompat.requestPermissions(
                getActivity(),
                new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE},
                REQ_STORAGE);
    }

    @Override
    public void handleRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        if (requestCode != REQ_STORAGE || pendingCall == null) {
            return;
        }
        PluginCall call = pendingCall;
        pendingCall = null;

        boolean granted = grantResults.length > 0
                && grantResults[0] == PackageManager.PERMISSION_GRANTED;
        JSObject result = new JSObject();
        result.put("granted", granted);
        result.put("scopedStorage", false);
        call.resolve(result);
    }

    @PluginMethod
    public void hasPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            JSObject result = new JSObject();
            result.put("granted", true);
            result.put("scopedStorage", true);
            call.resolve(result);
            return;
        }

        boolean granted = ContextCompat.checkSelfPermission(getContext(), Manifest.permission.WRITE_EXTERNAL_STORAGE)
                == PackageManager.PERMISSION_GRANTED;
        JSObject result = new JSObject();
        result.put("granted", granted);
        result.put("scopedStorage", false);
        call.resolve(result);
    }

    @PluginMethod
    public void getPublicDocumentsPath(PluginCall call) {
        String path = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS).getAbsolutePath();
        JSObject result = new JSObject();
        result.put("path", path);
        call.resolve(result);
    }

    /**
     * 写入日志文件到应用外部私有目录（可在文件管理器中查看）
     * 用于 LLM 输入/输出调试日志
     */
    @PluginMethod
    public void writeDebugLog(PluginCall call) {
        String content = call.getString("content", "");
        String filename = call.getString("filename", "llm-debug.log");

        try {
            // 使用外部私有目录（可在文件管理器中查看，不需要权限）
            // 路径: /storage/emulated/0/Android/data/com.avgllm.app/files/debug/
            File filesDir = getContext().getExternalFilesDir(null);
            if (filesDir == null) {
                // 如果外部存储不可用，回退到内部存储
                filesDir = getContext().getFilesDir();
            }
            File debugDir = new File(filesDir, "debug");

            // 创建 debug 目录（如果不存在）
            if (!debugDir.exists()) {
                boolean created = debugDir.mkdirs();
                Log.d("StoragePermission", "debug目录创建: " + created + ", path: " + debugDir.getAbsolutePath());
            }

            // 写入文件（覆盖模式）
            File logFile = new File(debugDir, filename);
            FileWriter writer = new FileWriter(logFile, false); // false = 覆盖模式
            writer.write(content);
            writer.close();

            Log.d("StoragePermission", "日志文件已写入: " + logFile.getAbsolutePath());

            JSObject result = new JSObject();
            result.put("success", true);
            result.put("path", logFile.getAbsolutePath());
            call.resolve(result);
        } catch (IOException e) {
            Log.e("StoragePermission", "写入日志文件失败: " + e.getMessage(), e);
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", e.getMessage());
            call.resolve(result);
        } catch (Exception e) {
            Log.e("StoragePermission", "写入日志文件异常: " + e.getMessage(), e);
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", e.getMessage());
            call.resolve(result);
        }
    }
}