package com.avgllm.app;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.provider.Settings;
import android.os.Build;
import android.content.Context;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(
    name = "MascotOverlay",
    permissions = {
        @Permission(alias = "overlay", strings = { Manifest.permission.SYSTEM_ALERT_WINDOW })
    }
)
public class MascotPlugin extends Plugin {

    private static final int OVERLAY_PERMISSION_REQUEST_CODE = 1001;
    private String savedPermissionCallId = null;

    // 用于保存 mascot 数据的临时文件（避免通过 Intent 传递大对象超过 Binder 1MB 限制）
    private static final String MASCOT_DATA_FILE = "mascot_overlay_data.json";

    private File getMascotDataFile() {
        return new File(getContext().getFilesDir(), MASCOT_DATA_FILE);
    }

    private void writeMascotDataFile(String data) {
        File file = getMascotDataFile();
        try (FileOutputStream fos = new FileOutputStream(file)) {
            fos.write(data.getBytes(StandardCharsets.UTF_8));
        } catch (IOException e) {
            android.util.Log.e("MascotPlugin", "Failed to write mascot data file", e);
        }
    }

    private String readMascotDataFile() {
        File file = getMascotDataFile();
        if (!file.exists()) return null;
        try {
            byte[] bytes = java.nio.file.Files.readAllBytes(file.toPath());
            return new String(bytes, StandardCharsets.UTF_8);
        } catch (IOException e) {
            android.util.Log.e("MascotPlugin", "Failed to read mascot data file", e);
            return null;
        }
    }

    @PluginMethod
    public void checkPermission(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", hasOverlayPermission());
        call.resolve(ret);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (hasOverlayPermission()) {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            call.resolve(ret);
            return;
        }
        bridge.saveCall(call);
        savedPermissionCallId = call.getCallbackId();
        Intent intent = new Intent(
            Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
            Uri.parse("package:" + getActivity().getPackageName())
        );
        getActivity().startActivityForResult(intent, OVERLAY_PERMISSION_REQUEST_CODE);
    }

    @PluginMethod
    public void create(PluginCall call) {
        if (!hasOverlayPermission()) {
            call.reject("No overlay permission. Call requestPermission() first.");
            return;
        }
        Intent intent = new Intent(getActivity(), MascotService.class);
        intent.setAction(MascotService.ACTION_CREATE);
        getActivity().startForegroundService(intent);
        call.resolve(new JSObject().put("ok", true));
    }

    @PluginMethod
    public void destroy(PluginCall call) {
        Intent intent = new Intent(getActivity(), MascotService.class);
        intent.setAction(MascotService.ACTION_DESTROY);
        getActivity().startService(intent);
        call.resolve(new JSObject().put("ok", true));
    }

    @PluginMethod
    public void show(PluginCall call) {
        Intent intent = new Intent(getActivity(), MascotService.class);
        intent.setAction(MascotService.ACTION_SHOW);
        getActivity().startService(intent);
        call.resolve(new JSObject().put("ok", true));
    }

    @PluginMethod
    public void hide(PluginCall call) {
        Intent intent = new Intent(getActivity(), MascotService.class);
        intent.setAction(MascotService.ACTION_HIDE);
        getActivity().startService(intent);
        call.resolve(new JSObject().put("ok", true));
    }

    @PluginMethod
    public void updateState(PluginCall call) {
        String data = call.getString("state", "{}");
        Intent intent = new Intent(getActivity(), MascotService.class);
        intent.setAction(MascotService.ACTION_UPDATE_STATE);
        intent.putExtra("state", data);
        getActivity().startService(intent);
        call.resolve(new JSObject().put("ok", true));
    }

    @PluginMethod
    public void command(PluginCall call) {
        String cmd = call.getString("command", "");
        String payload = call.getString("payload", "{}");
        Intent intent = new Intent(getActivity(), MascotService.class);
        intent.setAction(MascotService.ACTION_COMMAND);
        intent.putExtra("command", cmd);
        intent.putExtra("payload", payload);
        getActivity().startService(intent);
        call.resolve(new JSObject().put("ok", true));
    }

    @PluginMethod
    public void loadUrl(PluginCall call) {
        String url = call.getString("url", "");
        Intent intent = new Intent(getActivity(), MascotService.class);
        intent.setAction(MascotService.ACTION_LOAD_URL);
        intent.putExtra("url", url);
        getActivity().startService(intent);
        call.resolve(new JSObject().put("ok", true));
    }

    @PluginMethod
    public void setMascotData(PluginCall call) {
        String data = call.getString("data", "");
        // 写入临时文件而不是通过 Intent 传递，避免超过 Binder 1MB 限制
        writeMascotDataFile(data);
        android.util.Log.d("MascotPlugin", "Mascot data written to file, size: " + data.length());

        Intent intent = new Intent(getActivity(), MascotService.class);
        intent.setAction(MascotService.ACTION_SET_MASCOT_DATA);
        getActivity().startService(intent);
        call.resolve(new JSObject().put("ok", true));
    }

    @PluginMethod
    public void getMascotData(PluginCall call) {
        String data = readMascotDataFile();
        JSObject ret = new JSObject();
        ret.put("data", data != null ? data : "");
        call.resolve(ret);
    }

    public boolean hasOverlayPermission() {
        return Settings.canDrawOverlays(getContext());
    }

    @Override
    protected void handleOnActivityResult(int requestCode, int resultCode, Intent data) {
        super.handleOnActivityResult(requestCode, resultCode, data);
        if (requestCode == OVERLAY_PERMISSION_REQUEST_CODE && savedPermissionCallId != null) {
            PluginCall savedCall = bridge.getSavedCall(savedPermissionCallId);
            if (savedCall != null) {
                JSObject ret = new JSObject();
                ret.put("granted", hasOverlayPermission());
                savedCall.resolve(ret);
                bridge.releaseCall(savedCall);
                savedPermissionCallId = null;
            }
        }
    }
}
