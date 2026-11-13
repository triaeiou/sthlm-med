package se.swemed.app

import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.Charset

/**
 * GET an http(s) [url] as text, for the page to read other sites (Belport) without CORS: redirects followed, 10 s to
 * connect, 20 s to read, decoded by the charset the server names or else UTF-8. An HTTP error status throws. Blocks;
 * call off the UI thread.
 */
fun fetch_text(url: String, user_agent: String): String {
    // Only web addresses: the page must not be able to read files or other schemes through the app.
    require(is_web_url(url)) { "Not a web address: $url" }
    val connection = URL(url).openConnection() as HttpURLConnection
    try {
        /*
         * Timeouts, so a hanging server cannot keep a thread (and the page's spinner) forever. The WebView's own user
         * agent and Swedish first, so sites answer as they would in the app's views.
         */
        connection.connectTimeout = 10_000
        connection.readTimeout = 20_000
        connection.setRequestProperty("User-Agent", user_agent)
        connection.setRequestProperty("Accept-Language", "sv-SE,sv;q=0.9,en;q=0.5")
        if (connection.responseCode !in 200..299) throw IOException("HTTP ${connection.responseCode}")
        return connection.inputStream.use { it.readBytes() }.toString(charset_of(connection.contentType))
    } finally {
        connection.disconnect()
    }
}

/** The charset named in a Content-Type header, or UTF-8. */
fun charset_of(content_type: String?): Charset {
    // "text/html; charset=utf-8" → "utf-8"; the name may be quoted.
    val name = content_type?.let { Regex("charset=\"?([\\w.:-]+)", RegexOption.IGNORE_CASE).find(it)?.groupValues?.get(1) }
    // A charset Java does not know is read as UTF-8, rather than failing the whole fetch.
    return try {
        if (name != null) Charset.forName(name) else Charsets.UTF_8
    } catch (_: Exception) {
        Charsets.UTF_8
    }
}
