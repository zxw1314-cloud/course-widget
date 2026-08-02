package com.czwidget.mobile;

import android.app.Activity;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.view.View;
import android.view.inputmethod.EditorInfo;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.Button;

public class MainActivity extends Activity {
    private static final String PREFS = "cw_mobile";
    private static final String KEY_URL = "server_url";
    private WebView web;
    private EditText urlInput;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        web = findViewById(R.id.web);
        urlInput = findViewById(R.id.urlInput);
        Button connectBtn = findViewById(R.id.connectBtn);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        web.setWebViewClient(new WebViewClient());

        final SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        String saved = prefs.getString(KEY_URL, "");
        if (!saved.isEmpty()) urlInput.setText(saved);

        connectBtn.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { connect(prefs); }
        });
        urlInput.setOnEditorActionListener((tv, actionId, ev) -> {
            if (actionId == EditorInfo.IME_ACTION_GO) { connect(prefs); return true; }
            return false;
        });

        if (!saved.isEmpty()) web.loadUrl(saved);
    }

    private void connect(SharedPreferences prefs) {
        String url = urlInput.getText().toString().trim();
        if (url.isEmpty()) return;
        if (!url.startsWith("http://") && !url.startsWith("https://")) url = "http://" + url;
        prefs.edit().putString(KEY_URL, url).apply();
        web.loadUrl(url);
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack(); else super.onBackPressed();
    }
}
