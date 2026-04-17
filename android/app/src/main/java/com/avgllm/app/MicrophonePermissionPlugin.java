package com.avgllm.app;

import android.Manifest;
import android.content.pm.PackageManager;
import androidx.core.app.ActivityCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "MicrophonePermission")
public class MicrophonePermissionPlugin extends Plugin {
    private static final int REQ_MICROPHONE = 10001;
    private PluginCall pendingCall;

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (ActivityCompat.checkSelfPermission(
                getContext(), Manifest.permission.RECORD_AUDIO)
                == PackageManager.PERMISSION_GRANTED) {
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
            return;
        }
        pendingCall = call;
        ActivityCompat.requestPermissions(
                getActivity(),
                new String[]{Manifest.permission.RECORD_AUDIO},
                REQ_MICROPHONE);
    }

    @Override
    public void handleRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        if (requestCode != REQ_MICROPHONE || pendingCall == null) {
            return;
        }
        PluginCall call = pendingCall;
        pendingCall = null;

        boolean granted = grantResults.length > 0
                && grantResults[0] == PackageManager.PERMISSION_GRANTED;
        JSObject result = new JSObject();
        result.put("granted", granted);
        call.resolve(result);
    }
}
