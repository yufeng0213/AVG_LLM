package com.avgllm.app;

import android.content.Intent;
import android.net.Uri;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;

@CapacitorPlugin(name = "IcsCalendar")
public class IcsCalendarPlugin extends Plugin {

    @PluginMethod
    public void openIcsFile(PluginCall call) {
        String filePath = call.getString("filePath");
        if (filePath == null || filePath.isEmpty()) {
            call.reject("filePath is required");
            return;
        }

        try {
            // Handle file:// URIs by stripping the scheme
            if (filePath.startsWith("file://")) {
                filePath = filePath.replace("file://", "");
            } else if (filePath.startsWith("content://")) {
                // For content URIs, copy to cache and use local path
                android.net.Uri uri = android.net.Uri.parse(filePath);
                java.io.InputStream is = getContext().getContentResolver().openInputStream(uri);
                if (is == null) {
                    call.reject("Cannot open content URI");
                    return;
                }
                File cacheFile = new File(getContext().getCacheDir(), "temp_calendar.ics");
                java.io.FileOutputStream fos = new java.io.FileOutputStream(cacheFile);
                byte[] buffer = new byte[1024];
                int len;
                while ((len = is.read(buffer)) > 0) {
                    fos.write(buffer, 0, len);
                }
                is.close();
                fos.close();
                filePath = cacheFile.getAbsolutePath();
            }

            File file = new File(filePath);
            if (!file.exists()) {
                call.reject("File not found: " + filePath);
                return;
            }

            Uri uri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                file
            );

            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "text/calendar");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);

            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to open ICS file: " + e.getMessage());
        }
    }
}
