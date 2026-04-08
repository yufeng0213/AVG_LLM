package com.avgllm.app;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.net.Uri;
import android.util.Log;
import androidx.activity.result.ActivityResult;
import androidx.documentfile.provider.DocumentFile;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

@CapacitorPlugin(name = "CardImport")
public class CardImportPlugin extends Plugin {
    private static final String TAG = "CardImportPlugin";
    private static final String IMPORT_ROOT_DIR = "card-imports";
    private static final String IMPORT_CURRENT_DIR = "current";
    private static final String INDEX_FILE_NAME = "index.json";

    @PluginMethod
    public void importCardDirectory(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        intent.addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(call, intent, "handleImportDirectoryResult");
    }

    @ActivityCallback
    private void handleImportDirectoryResult(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }

        if (result == null || result.getResultCode() != Activity.RESULT_OK) {
            JSObject canceled = new JSObject();
            canceled.put("success", false);
            canceled.put("canceled", true);
            canceled.put("message", "已取消导入");
            call.resolve(canceled);
            return;
        }

        Intent data = result.getData();
        Uri treeUri = data != null ? data.getData() : null;
        if (treeUri == null) {
            call.reject("未获取到目录 URI");
            return;
        }

        try {
            final int uriFlags = data.getFlags()
                & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            getContext().getContentResolver().takePersistableUriPermission(treeUri, uriFlags);
        } catch (Exception permissionError) {
            Log.w(TAG, "takePersistableUriPermission failed: " + permissionError.getMessage());
        }

        try {
            DocumentFile sourceDir = DocumentFile.fromTreeUri(getContext(), treeUri);
            if (sourceDir == null || !sourceDir.isDirectory()) {
                call.reject("选择的目标不是有效目录");
                return;
            }

            DocumentFile indexFile = sourceDir.findFile(INDEX_FILE_NAME);
            if (indexFile == null || !indexFile.isFile()) {
                call.reject("目录中未找到 index.json");
                return;
            }

            File appFilesDir = getContext().getFilesDir();
            File importRoot = new File(appFilesDir, IMPORT_ROOT_DIR);
            File targetDir = new File(importRoot, IMPORT_CURRENT_DIR);

            if (targetDir.exists() && !deleteRecursively(targetDir)) {
                call.reject("清理旧导入目录失败");
                return;
            }
            if (!targetDir.exists() && !targetDir.mkdirs()) {
                call.reject("创建导入目录失败");
                return;
            }

            ImportStats stats = new ImportStats();
            copyTreeRecursive(sourceDir, targetDir, stats);

            File importedIndex = new File(targetDir, INDEX_FILE_NAME);
            if (!importedIndex.exists()) {
                call.reject("导入后未找到 index.json");
                return;
            }

            JSObject resultPayload = new JSObject();
            resultPayload.put("success", true);
            resultPayload.put("canceled", false);
            resultPayload.put("baseDir", "native://card-imports/current/");
            resultPayload.put("indexPath", "native://card-imports/current/index.json");
            resultPayload.put("sourceUri", treeUri.toString());
            resultPayload.put("filesCopied", stats.filesCopied);
            resultPayload.put("directoriesCopied", stats.directoriesCopied);
            call.resolve(resultPayload);
        } catch (Exception error) {
            call.reject("导入卡片目录失败: " + error.getMessage(), error);
        }
    }

    private void copyTreeRecursive(DocumentFile sourceDir, File targetDir, ImportStats stats) throws IOException {
        DocumentFile[] children = sourceDir.listFiles();
        if (children == null) {
            return;
        }

        for (DocumentFile child : children) {
            if (child == null) {
                continue;
            }
            String name = child.getName();
            if (name == null || name.trim().isEmpty()) {
                continue;
            }

            File targetChild = new File(targetDir, name);
            if (child.isDirectory()) {
                if (!targetChild.exists() && !targetChild.mkdirs()) {
                    throw new IOException("创建目录失败: " + targetChild.getAbsolutePath());
                }
                stats.directoriesCopied++;
                copyTreeRecursive(child, targetChild, stats);
                continue;
            }

            if (child.isFile()) {
                copySingleFile(child, targetChild);
                stats.filesCopied++;
            }
        }
    }

    private void copySingleFile(DocumentFile sourceFile, File targetFile) throws IOException {
        ContentResolver resolver = getContext().getContentResolver();
        InputStream inputStream = resolver.openInputStream(sourceFile.getUri());
        if (inputStream == null) {
            throw new IOException("无法打开源文件: " + sourceFile.getUri());
        }

        File parent = targetFile.getParentFile();
        if (parent != null && !parent.exists() && !parent.mkdirs()) {
            throw new IOException("无法创建父目录: " + parent.getAbsolutePath());
        }

        try (InputStream in = inputStream; OutputStream out = new FileOutputStream(targetFile, false)) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = in.read(buffer)) != -1) {
                out.write(buffer, 0, read);
            }
            out.flush();
        }
    }

    private boolean deleteRecursively(File target) {
        if (target == null || !target.exists()) {
            return true;
        }
        if (target.isDirectory()) {
            File[] children = target.listFiles();
            if (children != null) {
                for (File child : children) {
                    if (!deleteRecursively(child)) {
                        return false;
                    }
                }
            }
        }
        return target.delete();
    }

    private static class ImportStats {
        int filesCopied = 0;
        int directoriesCopied = 0;
    }
}
