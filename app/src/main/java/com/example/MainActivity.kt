package com.example

import android.annotation.SuppressLint
import android.content.Context
import android.content.SharedPreferences
import android.os.Build
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.viewinterop.AndroidView
import com.example.ui.theme.CoffeeBackground
import com.example.ui.theme.MyApplicationTheme

class MainActivity : ComponentActivity() {

  private var webView: WebView? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    enableEdgeToEdge()
    setContent {
      MyApplicationTheme {
        Scaffold(
          modifier = Modifier
            .fillMaxSize()
            .background(CoffeeBackground)
        ) { innerPadding ->
          CoffeeShopScreen(
            modifier = Modifier
              .fillMaxSize()
              .padding(innerPadding)
              .testTag("coffee_shop_screen"),
            onWebViewCreated = { wv ->
              webView = wv
            }
          )
        }
      }
    }
  }

  override fun onResume() {
    super.onResume()
    webView?.onResume()
  }

  override fun onPause() {
    super.onPause()
    webView?.onPause()
  }

  override fun onDestroy() {
    webView?.destroy()
    webView = null
    super.onDestroy()
  }
}

/**
 * JavaScript bridge to connect the 3D WebGL game with native Android features
 * including SharedPreferences persistence and tactile haptic feedback.
 */
class AndroidBridge(context: Context) {
  private val appContext: Context = context.applicationContext
  private val prefs: SharedPreferences =
    appContext.getSharedPreferences("last_coffee_game_prefs", Context.MODE_PRIVATE)

  @JavascriptInterface
  fun saveGameData(json: String) {
    prefs.edit().putString("saved_state", json).apply()
  }

  @JavascriptInterface
  fun loadSaveData(): String? {
    return prefs.getString("saved_state", null)
  }

  @JavascriptInterface
  fun triggerHaptic(type: String) {
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        val manager = appContext.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
        val vibrator = manager?.defaultVibrator
        val effect = if (type == "heavy") {
          VibrationEffect.createPredefined(VibrationEffect.EFFECT_HEAVY_CLICK)
        } else {
          VibrationEffect.createPredefined(VibrationEffect.EFFECT_TICK)
        }
        vibrator?.vibrate(effect)
      } else {
        @Suppress("DEPRECATION")
        val vibrator = appContext.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        val duration = if (type == "heavy") 40L else 20L
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          vibrator?.vibrate(VibrationEffect.createOneShot(duration, VibrationEffect.DEFAULT_AMPLITUDE))
        } else {
          @Suppress("DEPRECATION")
          vibrator?.vibrate(duration)
        }
      }
    } catch (_: Exception) {
      // Ignored if vibration is unavailable
    }
  }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun CoffeeShopScreen(
  modifier: Modifier = Modifier,
  onWebViewCreated: (WebView) -> Unit = {}
) {
  val context = LocalContext.current
  val bridge = remember { AndroidBridge(context) }

  Box(
    modifier = modifier
      .fillMaxSize()
      .background(CoffeeBackground)
  ) {
    AndroidView(
      modifier = Modifier
        .fillMaxSize()
        .testTag("game_webview"),
      factory = { ctx ->
        WebView(ctx).apply {
          layoutParams = ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
          )
          setBackgroundColor(0xFF140E10.toInt())
          overScrollMode = android.view.View.OVER_SCROLL_NEVER
          setLayerType(android.view.View.LAYER_TYPE_NONE, null)
          isFocusable = true
          isFocusableInTouchMode = true

          webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(consoleMessage: android.webkit.ConsoleMessage?): Boolean {
              android.util.Log.d("GameWebView", "${consoleMessage?.message()} -- line ${consoleMessage?.lineNumber()} of ${consoleMessage?.sourceId()}")
              return true
            }
          }
          webViewClient = object : WebViewClient() {
            override fun onRenderProcessGone(view: WebView?, detail: RenderProcessGoneDetail?): Boolean {
              android.util.Log.w("GameWebView", "WebView render process gone (didCrash=${detail?.didCrash()}). Reloading game...")
              view?.loadUrl("file:///android_asset/game.html")
              return true
            }
            override fun onReceivedError(
              view: WebView?,
              request: android.webkit.WebResourceRequest?,
              error: android.webkit.WebResourceError?
            ) {
              super.onReceivedError(view, request, error)
              android.util.Log.w("GameWebView", "Resource error: ${error?.description}")
            }
          }

          settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = true
            allowContentAccess = true
            loadWithOverviewMode = true
            useWideViewPort = true
            cacheMode = WebSettings.LOAD_CACHE_ELSE_NETWORK
            mediaPlaybackRequiresUserGesture = false
            displayZoomControls = false
            builtInZoomControls = false
          }

          addJavascriptInterface(bridge, "AndroidBridge")
          loadUrl("file:///android_asset/game.html")
          onWebViewCreated(this)
        }
      },
      update = { wv ->
        onWebViewCreated(wv)
      }
    )
  }
}

@Composable
fun Greeting(name: String, modifier: Modifier = Modifier) {
  CoffeeShopScreen(modifier = modifier)
}
