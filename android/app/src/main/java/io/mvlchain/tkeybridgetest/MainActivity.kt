package io.mvlchain.tkeybridgetest

import android.annotation.SuppressLint
import android.content.Context
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.webkit.*
import androidx.appcompat.app.AppCompatActivity
import java8.util.function.BiConsumer
import org.bouncycastle.util.encoders.Hex
import org.json.JSONObject
import org.torusresearch.torusdirect.TorusDirectSdk
import org.torusresearch.torusdirect.types.DirectSdkArgs
import org.torusresearch.torusdirect.types.LoginType
import org.torusresearch.torusdirect.types.SubVerifierDetails
import org.torusresearch.torusdirect.types.TorusNetwork
import kotlin.random.Random

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
    private lateinit var torusSdk: TorusDirectSdk
    private lateinit var postboxKey: String
    private lateinit var webView: WebView
    private lateinit var loginId: String
    private lateinit var dsJson: String
    private lateinit var ssJson: String

    private val allowedBrowsers = arrayOf(
        "com.android.chrome",  // Chrome stable
        "com.google.android.apps.chrome",  // Chrome system
        "com.android.chrome.beta"
    )

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webview)
        webView.settings.allowContentAccess = true
        webView.settings.allowFileAccess = true
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.useWideViewPort = true
        webView.settings.setAppCacheEnabled(true)
        webView.settings.cacheMode = WebSettings.LOAD_DEFAULT
        webView.settings.allowFileAccessFromFileURLs = true
        webView.settings.allowUniversalAccessFromFileURLs = true
        webView.webViewClient = MyWebViewClient(this)
        webView.webChromeClient = WebChromeClient()

        webView.addJavascriptInterface(this, "tkeybridge")
        webView.loadUrl("file:///android_asset/index.html")

        // direct sdk init
        val directSdkArgs = DirectSdkArgs("https://staging.mvlclutch.io/customauth_redirect.html", TorusNetwork.TESTNET, "clutchwallet://io.mvlchain.customauthandroid/redirect")
        torusSdk = TorusDirectSdk(directSdkArgs, this)

        val loginResultCf = torusSdk.triggerLogin(SubVerifierDetails(LoginType.GOOGLE, "clutch-google-testnet", "354250895959-dneacv3fol73d6a6lf789mcjo2jjpbms.apps.googleusercontent.com")
            .setPreferCustomTabs(true)
            .setAllowedBrowsers(allowedBrowsers))

        // random gen private key
        val privateKey = Hex.toHexString(Random.Default.nextBytes(32))
        Log.i(this.javaClass.simpleName, "generated private key = $privateKey")

        loginResultCf.whenComplete { loginResponse, error ->
            if (error != null) {
                Log.e(this.javaClass.simpleName, error.message)
            } else {
                this.postboxKey = loginResponse.privateKey
                this.loginId = loginResponse.userInfo.email
                Log.i("tkey", "try to call splitKey")
                Handler(Looper.getMainLooper()).post {
                    webView.loadUrl("javascript:window.splitKey('${this.postboxKey}', '$privateKey')")
                }
            }
        }
    }

    @JavascriptInterface
    fun keySplitFinished(shareJson: String) {
        Log.i("tkey", "shareJson = $shareJson")
        val shares = JSONObject(shareJson)

        // try to save share
        val torusShare = shares.getString("ts")
        ssJson = shares.getString("ss").toString()
        dsJson = shares.getString("ds").toString()
        Log.i("tkey", "ss = $ssJson")
        Log.i("tkey", "ds = $dsJson")
//        Handler(Looper.getMainLooper()).post {
//            webView.loadUrl("javascript:window.saveTorusShare('${this.postboxKey}', '$torusShare', '${this.loginId}')")
//        }


        Handler(Looper.getMainLooper()).post {
            // try to restore share
            webView.loadUrl("javascript:window.reconstructKeyWithTorusShare('${this.postboxKey}','${this.ssJson}')")
        }
    }

//    @JavascriptInterface
//    fun torusShareSaved() {
//        Log.i("tkey", "torus share saved")
//
//        Handler(Looper.getMainLooper()).post {
//            // try to restore share
//            webView.loadUrl("javascript:window.reconstructKeyWithTorusShare('${this.postboxKey}','${this.ssJson}')")
//        }
//    }

    @JavascriptInterface
    fun privateKeyReconstructed(pkey: String) {
        Log.i("tkey", "private key restored = ${pkey}")
    }
}