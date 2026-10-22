package iq.abdullah.travel;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ImageView;

/**
 * يفتح موقع «سافر مع عبدالله» داخل التطبيق.
 * صفحات الموقع تبقى بالتطبيق، وأي رابط ثاني (واتساب، اتصال، خرائط، مواقع الخطوط)
 * يفتح بتطبيقه. إذا ماكو نت تطلع صفحة offline.html.
 */
public class MainActivity extends Activity {

    static final String HOST = "abode1997hussein-eng.github.io";
    static final String PATH = "/abdullah-travel";
    static final String HOME = "https://" + HOST + PATH + "/?app=1";

    private WebView web;
    private View splash;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);

        FrameLayout root = new FrameLayout(this);
        web = new WebView(this);
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        /* شاشة البداية: الشعار على أبيض لحد ما تنفتح الصفحة */
        FrameLayout cover = new FrameLayout(this);
        cover.setBackgroundColor(Color.WHITE);
        ImageView logo = new ImageView(this);
        logo.setImageResource(R.mipmap.splash_logo);
        int size = (int) (112 * getResources().getDisplayMetrics().density);
        cover.addView(logo, new FrameLayout.LayoutParams(size, size, Gravity.CENTER));
        splash = cover;
        root.addView(cover, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setSupportMultipleWindows(false);
        s.setMediaPlaybackRequiresUserGesture(true);
        /* الموقع يعرف إنه داخل التطبيق ويخفي زر «ثبّت التطبيق» */
        s.setUserAgentString(s.getUserAgentString() + " AbdullahTravelApp/1");

        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return openOutside(request.getUrl());
            }

            @Override
            @SuppressWarnings("deprecation")
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return openOutside(Uri.parse(url));
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (splash.getVisibility() == View.VISIBLE) {
                    splash.animate().alpha(0f).setDuration(250).withEndAction(() -> splash.setVisibility(View.GONE));
                }
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) view.loadUrl("file:///android_asset/offline.html");
            }

            @Override
            @SuppressWarnings("deprecation")
            public void onReceivedError(WebView view, int code, String description, String failingUrl) {
                if (failingUrl != null && failingUrl.equals(view.getUrl())) view.loadUrl("file:///android_asset/offline.html");
            }
        });

        if (state != null) web.restoreState(state);
        else web.loadUrl(HOME);
    }

    /** صفحات الموقع تبقى بالتطبيق، والباقي يفتح بتطبيقه (واتساب، الهاتف، الخرائط، المتصفح). */
    private boolean openOutside(Uri u) {
        String scheme = u.getScheme() == null ? "" : u.getScheme();
        if (("https".equals(scheme) || "http".equals(scheme)) && HOST.equals(u.getHost())
                && u.getPath() != null && u.getPath().startsWith(PATH)) {
            return false;
        }
        if ("file".equals(scheme)) return false;
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, u);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
        } catch (ActivityNotFoundException e) {
            /* ماكو تطبيق يفتحه: نخليه بالصفحة */
        }
        return true;
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }
}
