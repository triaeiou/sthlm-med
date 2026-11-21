package se.sthlm_med.app

import org.json.JSONException
import org.json.JSONObject

/**
 * The messages between the app's page and the shell (web/src/host/android.ts): the page sends requests
 * {id, method, params}; the shell answers {id, result} or {id, error} (what went wrong, in words), and sends events
 * {event, params}.
 */
data class Request(val id: Int, val method: String, val params: JSONObject)

/** The request in [text], or null when it is not one. */
fun parse_request(text: String): Request? = try {
    // Anything not shaped like a request (no id or method) is null, and ignored by the bridge.
    val json = JSONObject(text)
    Request(json.getInt("id"), json.getString("method"), json.optJSONObject("params") ?: JSONObject())
} catch (_: JSONException) {
    null
}

/** The reply to request [id]; the id lets the page match it to its request, as replies come in any order. */
fun reply_message(id: Int, result: JSONObject): String = JSONObject().put("id", id).put("result", result).toString()

/** The failed reply to request [id], with which the page rejects the request's promise. */
fun error_message(id: Int, error: String): String = JSONObject().put("id", id).put("error", error).toString()

/** An event for the page, such as "back" or "progress": no id, as it answers no request. */
fun event_message(event: String, params: JSONObject): String = JSONObject().put("event", event).put("params", params).toString()

/**
 * A site to keep open: its start page, the script to run at document start in its pages ("" for none), and the
 * [hosts] that are the site, such as "fass.se".
 */
data class SiteSpec(val id: String, val url: String, val script: String, val hosts: List<String>)

/** Whether a page on [host] is part of the site: on one of its hosts, or on a subdomain of one (such as "www."). */
fun SiteSpec.owns(host: String?): Boolean =
    hosts.any { host.equals(it, ignoreCase = true) || host?.endsWith(".$it", ignoreCase = true) == true }

/** The sites in a sites.set request's params; throws on malformed params. */
fun parse_sites(params: JSONObject): List<SiteSpec> {
    /*
     * Every site's start page is checked here, at the edge, so no other scheme (javascript:, file:) can be loaded
     * into a site's view, whatever the page sends.
     */
    val sites = params.getJSONArray("sites")
    return List(sites.length()) { index ->
        val site = sites.getJSONObject(index)
        val url = site.getString("url")
        require(is_web_url(url)) { "Not a web address: $url" }
        val hosts = site.getJSONArray("hosts")
        SiteSpec(site.getString("id"), url, site.getString("script"), List(hosts.length(), hosts::getString))
    }
}

/**
 * Whether [url] is an http(s) address. A prefix check is enough here: anything else is refused, and the WebView or URL
 * parser handles the rest.
 */
fun is_web_url(url: String): Boolean =
    url.startsWith("https://", ignoreCase = true) || url.startsWith("http://", ignoreCase = true)
