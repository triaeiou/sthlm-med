package se.sthlm_med.app

import android.annotation.SuppressLint
import android.content.Context
import android.util.Log
import android.view.View
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.webkit.CookieManager
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.widget.FrameLayout
import androidx.webkit.ScriptHandler
import androidx.webkit.WebViewClientCompat
import androidx.webkit.WebViewCompat

/**
 * One WebView per site, stacked in [container] with only the active one visible. Every view is loaded as soon as its
 * site is set and stays alive, so a site keeps its page, history and scroll position while another shows.
 * [on_progress] hears each site's load progress (its id, 0 to 100); [open_external] is given what a site's view does
 * not show itself: links to other websites, other schemes such as tel:, and downloads.
 */
class SiteWebViews(
    private val context: Context,
    private val container: FrameLayout,
    private val on_progress: (String, Int) -> Unit,
    private val open_external: (String) -> Unit,
) {
    private class Site(var spec: SiteSpec, val view: WebView, var script: ScriptHandler? = null)

    private val sites = mutableMapOf<String, Site>()
    private var active_id: String? = null

    /** Keep the views of [specs]' sites: new sites get a view, sites no longer listed lose theirs, others follow. */
    fun set(specs: List<SiteSpec>) {
        /*
         * An existing site keeps its view, and so its history. A changed start page is loaded; a changed script is
         * registered again and the page reloaded, so that it applies at once. The same list again changes nothing.
         */
        for (id in sites.keys.toList()) if (specs.none { it.id == id }) remove(id)
        for (spec in specs) {
            val site = sites[spec.id]
            if (site == null) {
                create(spec)
            } else if (site.spec != spec) {
                val url_changed = site.spec.url != spec.url
                site.spec = spec
                register_script(site)
                if (url_changed) site.view.loadUrl(spec.url) else site.view.reload()
            }
        }
    }

    /** Show a site's view as it is. */
    fun show(id: String) {
        /*
         * INVISIBLE rather than GONE: hidden views keep their size, so their pages need no new layout (and keep their
         * scroll position) when shown again.
         */
        if (id !in sites) return
        active_id = id
        for ((site_id, site) in sites) site.view.visibility = if (site_id == id) View.VISIBLE else View.INVISIBLE
    }

    /** Load [url] in a site's view; if it shows [url] already, scroll to its top, as a reload would keep its place. */
    fun navigate(id: String, url: String) {
        val view = sites[id]?.view ?: return
        if (view.url == url) view.evaluateJavascript("window.scrollTo({top: 0, behavior: 'smooth'})", null) else view.loadUrl(url)
    }

    /** Run [script] in a site's page and give [done] its value as JSON: "null" if it failed or the site is not open. */
    fun evaluate(id: String, script: String, done: (String) -> Unit) {
        val view = sites[id]?.view ?: return done("null")
        view.evaluateJavascript(script) { json -> done(json ?: "null") }
    }

    /** Go back in the active site's history; false when it has none. Only the site showing: never one out of sight. */
    fun go_back(): Boolean {
        // canGoBack() is false at the first page of the site's history.
        val view = sites[active_id]?.view?.takeIf { it.canGoBack() } ?: return false
        view.goBack()
        return true
    }

    /** Pause every site's page (timers, media) while the app is in the background: hidden pages run scripts too. */
    fun pause() = sites.values.forEach { it.view.onPause() }

    /** Let the sites' pages run again, as the app comes back. */
    fun resume() = sites.values.forEach { it.view.onResume() }

    /** Destroy every view, when the activity ends. */
    fun destroy() = sites.keys.toList().forEach(::remove)

    /** Close a site: its script, its view and the view's renderer. */
    private fun remove(id: String) {
        // Out of the layout before destroy(), as a destroyed WebView must not be drawn.
        val site = sites.remove(id) ?: return
        site.script?.remove()
        container.removeView(site.view)
        site.view.destroy()
    }

    /** Open a site: a view for it in the stack, hidden unless it is the active one, loading its start page. */
    private fun create(spec: SiteSpec) {
        // The script is registered before the page loads, so it runs in that first page too.
        val site = Site(spec, create_view(spec.id))
        sites[spec.id] = site
        site.view.visibility = if (spec.id == active_id) View.VISIBLE else View.INVISIBLE
        container.addView(site.view, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))
        register_script(site)
        site.view.loadUrl(spec.url)
    }

    /** Have the site's script (its CSS) run at document start in the site's pages, in place of its last one. */
    private fun register_script(site: Site) {
        /*
         * A site with no CSS has no script. The site's pages are those on its hosts and their subdomains ("*."), as
         * for links (SiteSpec.owns()). The WebView rejects a host it cannot make a rule of; the site then works
         * without its CSS.
         */
        site.script?.remove()
        site.script = null
        if (site.spec.script.isEmpty()) return
        try {
            val origins = site.spec.hosts.flatMap { listOf("https://$it", "https://*.$it") }.toSet()
            site.script = WebViewCompat.addDocumentStartJavaScript(site.view, site.spec.script, origins)
        } catch (error: IllegalArgumentException) {
            Log.w(TAG, "Script for ${site.spec.id} not registered: ${error.message}")
        }
    }

    /** A WebView set up for the site [id]: scripts, storage and cookies as in a browser, and the app's own policies. */
    @SuppressLint("SetJavaScriptEnabled")
    private fun create_view(id: String): WebView {
        /*
         * As a browser would (scripts, local storage, pinch zoom, mobile layout), but with no access to the app's
         * files, and one window per site: target=_blank links open in the same view.
         */
        val view = WebView(context)
        view.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            builtInZoomControls = true
            displayZoomControls = false
            loadWithOverviewMode = true
            useWideViewPort = true
            setSupportMultipleWindows(false)
        }
        // Logins and cookie consents often live on other domains; without these, sites ask again on every start.
        CookieManager.getInstance().setAcceptThirdPartyCookies(view, true)
        view.webViewClient = object : WebViewClientCompat() {
            /** The site's own pages open in its view; other websites and other schemes open outside the app. */
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                // false: the view loads it itself. true: handled here, by the browser or another app (tel:, mailto:).
                val url = request.url
                if (is_web_url(url.toString()) && sites[id]?.spec?.owns(url.host) == true) return false
                open_external(url.toString())
                return true
            }

            /** A crashed or killed page: give the site a new view at its start page, rather than ending the app. */
            override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                // Returning true tells the WebView the app handled it; else the whole app is killed.
                val site = sites[id]?.takeIf { it.view === view } ?: return true
                Log.w(TAG, "Renderer of $id gone (crash: ${detail.didCrash()})")
                remove(id)
                create(site.spec)
                return true
            }
        }
        view.webChromeClient = object : WebChromeClient() {
            /** For the toolbar's load bar; the page draws it only for the active site. */
            override fun onProgressChanged(view: WebView, newProgress: Int) = on_progress(id, newProgress)
        }
        // A WebView cannot save files: downloads (PDFs on FASS, for one) open in an app that can show them.
        view.setDownloadListener { url, _, _, _, _ -> open_external(url) }
        return view
    }

    companion object {
        private const val TAG = "SiteWebViews"
    }
}
