package se.sthlm_med.app

import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.View
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.inputmethod.InputMethodManager
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.widget.FrameLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewClientCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject
import kotlin.math.max

/**
 * The app's window: the sites' views (SiteWebViews) fill it above the toolbar, and the app's own page, the shell, lies
 * over them at the bottom: just the toolbar's height normally, the whole window while it shows a view or a popout menu.
 * The page decides what shows (web/src/app.ts) and says so through the bridge (ShellBridge); this activity carries out
 * what concerns the window, and handles Back, insets and links to other apps.
 */
class MainActivity : ComponentActivity() {
    private lateinit var site_stack: FrameLayout
    private lateinit var shell: WebView
    private lateinit var sites: SiteWebViews
    private lateinit var bridge: ShellBridge

    private var shell_full = false
    /** The shell's height when not full: the toolbar, and the find bar when open, in dp. */
    private var shell_height = 48
    /** Whether Back goes to the shell first, while it shows a view, a menu or the find bar. */
    private var capture_back = false
    private var keyboard_shown = false

    /** Back closes the shell's view, menu or find bar, else goes back in the site, else leaves the app running. */
    private val back = object : OnBackPressedCallback(true) {
        override fun handleOnBackPressed() {
            /*
             * The page says when it wants Back (capture_back: something of its own is open). Otherwise the site's
             * history; with none left, the app goes to the background instead of finishing, so every site keeps its
             * place for next time.
             */
            if (capture_back) bridge.send("back")
            else if (!sites.go_back()) moveTaskToBack(true)
        }
    }

    /** Build the window (the sites' stack, the shell over it) and load the app's page, which takes it from there. */
    override fun onCreate(savedInstanceState: Bundle?) {
        // Draw behind the system bars; the insets listener below pads the content back inside them.
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        /*
         * The bridge needs WebMessageListener, and the sites' CSS document start scripts; a WebView too old for them
         * (from before 2021) gets a message asking for an update instead.
         */
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER) || !WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            setContentView(TextView(this).apply {
                setText(R.string.webview_outdated)
                setPadding(48, 160, 48, 48)
            })
            return
        }
        // chrome://inspect works in debug builds only.
        WebView.setWebContentsDebuggingEnabled(applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0)

        /*
         * The views, back to front: the stack of site views filling the window, and the shell over them, anchored at
         * the bottom, its height set by layout_shell(). The sites report their progress to the page as events.
         */
        val root = FrameLayout(this)
        site_stack = FrameLayout(this)
        root.addView(site_stack, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))
        sites = SiteWebViews(this, site_stack, { id, progress -> bridge.send("progress", JSONObject().put("id", id).put("progress", progress)) }, ::open_external)
        bridge = ShellBridge(this, sites, ConfigStore(filesDir))
        shell = create_shell()
        root.addView(shell, FrameLayout.LayoutParams(MATCH_PARENT, dp(shell_height), Gravity.BOTTOM))
        setContentView(root)
        layout_shell()

        /*
         * Keep content out from under the status bar, navigation bar, notch and keyboard by padding the root; whether
         * the keyboard shows decides whether the toolbar gives way to it (layout_shell()).
         */
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            val keyboard = insets.getInsets(WindowInsetsCompat.Type.ime())
            view.setPadding(bars.left, bars.top, bars.right, max(bars.bottom, keyboard.bottom))
            keyboard_shown = insets.isVisible(WindowInsetsCompat.Type.ime())
            layout_shell()
            WindowInsetsCompat.CONSUMED
        }
        onBackPressedDispatcher.addCallback(this, back)
        // The page, once it runs, asks for its sites through the bridge.
        shell.loadUrl("https://${WebViewAssetLoader.DEFAULT_DOMAIN}/assets/index.html")
    }

    /** The shell: the app's page from the APK's assets, transparent where it shows nothing, with the bridge. */
    @SuppressLint("SetJavaScriptEnabled")
    private fun create_shell(): WebView {
        /*
         * Transparent, so only what the page draws covers the sites. Text zoom fixed at 100%, so CSS pixels are dp and
         * the heights the page sends match the toolbar it draws. No file access: the assets come through the loader.
         */
        val view = WebView(this)
        view.setBackgroundColor(Color.TRANSPARENT)
        view.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            textZoom = 100
        }
        /*
         * The page is served from the APK's assets at an https address (appassets.androidplatform.net), so it is a
         * normal secure origin: modules load, and the bridge can be restricted to it.
         */
        val loader = WebViewAssetLoader.Builder().addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this)).build()
        view.webViewClient = object : WebViewClientCompat() {
            /** The loader answers requests for the assets address; null lets anything else go to the network. */
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                loader.shouldInterceptRequest(request.url)

            /** The page stays on its own origin; any other link opens outside the app. */
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                // Navigating away would lose the app's page: links out (as to Belport's own page) go to the browser.
                if (request.url.host == WebViewAssetLoader.DEFAULT_DOMAIN) return false
                open_external(request.url.toString())
                return true
            }
        }
        /* A chrome client, so the page's confirm() dialogs show. */
        view.webChromeClient = WebChromeClient()
        /* Typing in the find bar keeps the shell above the keyboard (layout_shell()). */
        view.onFocusChangeListener = View.OnFocusChangeListener { _, _ -> view.post { layout_shell() } }
        WebViewCompat.addWebMessageListener(view, "sthlm_med", setOf("https://${WebViewAssetLoader.DEFAULT_DOMAIN}"), bridge)
        return view
    }

    /**
     * Size the shell for its mode: its strip at the bottom, or the whole window. While the keyboard shows for a site,
     * the shell hides, leaving the site the room; while it shows for the shell (the find bar), the shell stays.
     */
    private fun layout_shell() {
        // Hidden only in the strip mode, and only for a keyboard that is not for the shell's own input.
        val hidden = keyboard_shown && !shell_full && !shell.hasFocus()
        shell.visibility = if (hidden) View.GONE else View.VISIBLE
        (shell.layoutParams as FrameLayout.LayoutParams).height = if (shell_full) MATCH_PARENT else dp(shell_height)
        /*
         * The sites end where the strip begins, so no page content hides under the toolbar. In full mode the margin
         * stays the strip's: the sites are covered then anyway, and do not need a new layout on the way back.
         */
        (site_stack.layoutParams as FrameLayout.LayoutParams).bottomMargin = if (hidden) 0 else dp(shell_height)
        shell.requestLayout()
        site_stack.requestLayout()
    }

    /** The page's say on the shell: the whole window or a strip [height] dp high, and whether Back is the page's. */
    fun set_shell_mode(full: Boolean, height: Int, capture_back: Boolean) {
        // Remembered, as the layout is done again when the keyboard or the focus changes.
        this.capture_back = capture_back
        shell_full = full
        shell_height = height
        layout_shell()
    }

    /** Give the shell the input focus and show the keyboard, for typing in its page (the find bar). */
    fun focus_shell() {
        // Android's focus to the shell's view, which the page's own focus() cannot move; then the keyboard.
        shell.requestFocus()
        /* After the page has focused its input (it does so on this request's reply). */
        shell.postDelayed({
            if (shell.hasFocus()) getSystemService(InputMethodManager::class.java)?.showSoftInput(shell, 0)
        }, KEYBOARD_DELAY_MS)
    }

    /** The system's long-press vibration, which follows the user's haptics setting and needs no permission. */
    fun haptic() {
        shell.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
    }

    /** Open [url] outside the app: a web page in the default browser, tel: in the dialler; or say that no app can. */
    fun open_external(url: String) {
        /*
         * tel: opens the dialler with the number filled in (ACTION_DIAL needs no permission and calls nobody on its
         * own). An intent: link, a page's way of opening an app, is parsed and stripped of what a web page may not
         * choose (the component and the selector). Anything else is for whichever app views it: for a web page, the
         * default browser.
         */
        var fallback: String? = null
        try {
            val intent = when {
                url.startsWith("tel:") -> Intent(Intent.ACTION_DIAL, Uri.parse(url))
                url.startsWith("intent:") -> Intent.parseUri(url, Intent.URI_INTENT_SCHEME).apply {
                    fallback = getStringExtra("browser_fallback_url")
                    addCategory(Intent.CATEGORY_BROWSABLE)
                    component = null
                    selector = null
                }
                else -> Intent(Intent.ACTION_VIEW, Uri.parse(url))
            }
            startActivity(intent)
        } catch (_: Exception) {
            // No app for it, or a malformed link: the web page an intent: link names for that case, else a message.
            if (is_web_url(fallback.orEmpty())) open_external(fallback.orEmpty())
            else Toast.makeText(this, R.string.no_app, Toast.LENGTH_SHORT).show()
        }
    }

    /** Going to the background: the sites' pages pause, and cookies are saved. */
    override fun onPause() {
        /*
         * Cookies are written to disk now, as the process may be killed in the background. Nothing is initialized
         * when onCreate stopped early (WebView too old).
         */
        super.onPause()
        if (!::sites.isInitialized) return
        CookieManager.getInstance().flush()
        sites.pause()
    }

    /** Back in the foreground: the sites' pages run again. */
    override fun onResume() {
        super.onResume()
        if (::sites.isInitialized) sites.resume()
    }

    /** The activity ends (also when the theme changes, to be created anew): the views and threads are released. */
    override fun onDestroy() {
        // Views first (they may still send to the bridge), then the bridge's threads.
        if (::sites.isInitialized) {
            sites.destroy()
            shell.destroy()
            bridge.close()
        }
        super.onDestroy()
    }

    /** [value] dp in pixels, rounded (not truncated) so heights match what the page draws in CSS pixels. */
    private fun dp(value: Int): Int = (value * resources.displayMetrics.density + 0.5f).toInt()

    companion object {
        private const val KEYBOARD_DELAY_MS = 100L
    }
}
