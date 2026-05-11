package com.braingame.app;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final String SERVER_URL = "https://brain-game-opal.vercel.app";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (!isNetworkAvailable()) {
            showOfflinePage();
        }
    }

    private boolean isNetworkAvailable() {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) return false;
        Network network = cm.getActiveNetwork();
        if (network == null) return false;
        NetworkCapabilities caps = cm.getNetworkCapabilities(network);
        return caps != null && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
    }

    private void showOfflinePage() {
        WebView webView = getBridge().getWebView();
        String html =
            "<!DOCTYPE html><html><head>" +
            "<meta charset='UTF-8'>" +
            "<meta name='viewport' content='width=device-width,initial-scale=1'>" +
            "<style>" +
            "* { box-sizing: border-box; margin: 0; padding: 0; }" +
            "body { background: #0a0a1a; color: #fff; font-family: sans-serif;" +
            "  display: flex; flex-direction: column; align-items: center;" +
            "  justify-content: center; min-height: 100vh; text-align: center; padding: 32px; }" +
            ".icon { font-size: 72px; margin-bottom: 28px; }" +
            "h1 { font-size: 22px; font-weight: 900; margin-bottom: 14px; }" +
            "p { color: #64748b; font-size: 15px; line-height: 1.7; margin-bottom: 36px; }" +
            "button { background: #6c63ff; color: #fff; border: none; border-radius: 14px;" +
            "  padding: 16px 40px; font-size: 17px; font-weight: 700; cursor: pointer;" +
            "  -webkit-tap-highlight-color: transparent; }" +
            "button:active { opacity: 0.8; }" +
            "</style></head><body>" +
            "<div class='icon'>📡</div>" +
            "<h1>インターネット未接続</h1>" +
            "<p>BrainGame はオンライン接続が必要です。<br>" +
            "Wi-Fi またはモバイルデータをオンにしてから<br>再試行してください。</p>" +
            "<button onclick=\"window.location.href='" + SERVER_URL + "'\">再試行</button>" +
            "</body></html>";
        webView.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
    }
}
