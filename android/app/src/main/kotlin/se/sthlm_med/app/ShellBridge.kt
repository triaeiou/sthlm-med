package se.sthlm_med.app

import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.webkit.WebSettings
import android.webkit.WebView
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.WebMessageCompat
import androidx.webkit.WebViewCompat
import org.json.JSONObject
import java.util.concurrent.Executors

/**
 * The shell's end of the app page's message channel (web/src/host/android.ts), registered for the app's own origin
 * only; the sites' views have no channel. Each request is carried out by the site views, the activity or the config
 * store, and answered; events go the other way with send().
 */
class ShellBridge(private val activity: MainActivity, private val sites: SiteWebViews, private val store: ConfigStore) : WebViewCompat.WebMessageListener {
    /** Where what blocks (files, the network) runs, off the UI thread. */
    private val background = Executors.newFixedThreadPool(2)
    private val main = Handler(Looper.getMainLooper())
    private val user_agent = WebSettings.getDefaultUserAgent(activity)

    /** The page's end of the channel, from its latest message (it changes when the page reloads); events go there. */
    private var page: JavaScriptReplyProxy? = null

    /** A message from the page: carry out the request in it, and answer. */
    override fun onPostMessage(view: WebView, message: WebMessageCompat, sourceOrigin: Uri, isMainFrame: Boolean, replyProxy: JavaScriptReplyProxy) {
        /*
         * Only the app's page itself may talk to the app: frames inside it are ignored (the origin was already
         * restricted when the listener was added). Malformed messages are dropped without an answer.
         */
        if (!isMainFrame) return
        val request = message.data?.let(::parse_request) ?: return
        val params = request.params
        page = replyProxy

        /** Answer the request with [work]'s result, or with the error it throws; never thrown at the WebView. */
        fun reply(work: () -> JSONObject) {
            // The work runs on the caller's thread; the answer is sent from the UI thread, as the proxy requires.
            val text = try {
                reply_message(request.id, work())
            } catch (error: Exception) {
                error_message(request.id, error.message ?: error.toString())
            }
            main.post { replyProxy.postMessage(text) }
        }

        /*
         * Where each request runs: files and fetches in the background; a script in a site on the UI thread, answered
         * when the site's WebView has its value; the rest (view changes) on the UI thread, where this method is
         * called, answered at once.
         */
        when (request.method) {
            "config.load" -> background.execute { reply { JSONObject().put("json", store.read() ?: JSONObject.NULL) } }
            "config.save" -> background.execute {
                reply {
                    store.write(params.getString("json"))
                    JSONObject()
                }
            }
            "fetch.text" -> background.execute { reply { JSONObject().put("text", fetch_text(params.getString("url"), user_agent)) } }
            "site.evaluate" -> sites.evaluate(params.optString("id"), params.optString("script")) { json -> reply { JSONObject().put("json", json) } }
            else -> reply {
                when (request.method) {
                    "sites.set" -> sites.set(parse_sites(params))
                    "site.show" -> sites.show(params.getString("id"))
                    "site.navigate" -> {
                        // Checked like the sites' start pages: only web addresses are loaded into a site's view.
                        val url = params.getString("url")
                        require(is_web_url(url)) { "Not a web address: $url" }
                        sites.navigate(params.getString("id"), url)
                    }
                    "shell.mode" -> activity.set_shell_mode(params.getBoolean("full"), params.getInt("height"), params.getBoolean("capture_back"))
                    "shell.focus" -> activity.focus_shell()
                    "open.external" -> activity.open_external(params.getString("url"))
                    "haptic" -> activity.haptic()
                    else -> throw IllegalArgumentException("Unknown method ${request.method}")
                }
                JSONObject()
            }
        }
    }

    /**
     * Send an event to the page; call on the UI thread. Before the page's first message there is nobody to tell: the
     * event is dropped.
     */
    fun send(event: String, params: JSONObject = JSONObject()) {
        page?.postMessage(event_message(event, params))
    }

    /** Stop the background threads once what they have been given is done, when the activity ends. */
    fun close() = background.shutdown()
}
