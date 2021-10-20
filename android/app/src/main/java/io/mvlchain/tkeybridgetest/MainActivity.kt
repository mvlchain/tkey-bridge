package io.mvlchain.tkeybridgetest

import android.annotation.SuppressLint
import android.content.Context
import androidx.appcompat.app.AppCompatActivity
import android.os.Bundle
import android.os.Handler
import android.util.Log
import android.webkit.*
import org.json.JSONObject

class WebAppInterface(private val mContext: Context) {
    @JavascriptInterface
    fun keySplitFinished(shareJson: String) {
        Log.i("tkey", "shareJson = $shareJson")
        val shares = JSONObject(shareJson)
    }
}

class MyWebViewClient(private val mContext: Context): WebViewClient() {
    override fun shouldInterceptRequest(view: WebView?, url: String?): WebResourceResponse? {
        return if (url == "file:///android_asset/serviceworker/redirect") { // intercept redirect url and serve static html page from asset
            val ins = mContext.assets.open("serviceworker/redirect.html")
            WebResourceResponse("text/html", "utf-8", ins)
        } else {
            super.shouldInterceptRequest(view, url)
        }
    }
}

class MainActivity : AppCompatActivity() {
    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        val myWebView = findViewById<WebView>(R.id.webview)
        myWebView.settings.allowContentAccess = true
        myWebView.settings.allowFileAccess = true
        myWebView.settings.javaScriptEnabled = true
        myWebView.settings.domStorageEnabled = true
        myWebView.settings.useWideViewPort = true
        myWebView.settings.setAppCacheEnabled(true)
        myWebView.settings.cacheMode = WebSettings.LOAD_DEFAULT
        myWebView.settings.allowFileAccessFromFileURLs = true
        myWebView.settings.allowUniversalAccessFromFileURLs = true
        myWebView.webViewClient = MyWebViewClient(this)
        myWebView.webChromeClient = WebChromeClient()

        myWebView.addJavascriptInterface(WebAppInterface(this), "tkeybridge")
        myWebView.loadUrl("file:///android_asset/index.html")

        val privateKey = "3b7830479c10c47fccfcb189240a1cb2ac5a8644eed38cd846479c16826befbc"
        Handler().postDelayed(Runnable {
            run() {
                Log.i("tkey", "try to call splitKey")
                myWebView.loadUrl("javascript:window.splitKey('$privateKey')")
            }
        }, 5000) // TODO: do right away after js loaded (how to catch that timing?)
    }
}