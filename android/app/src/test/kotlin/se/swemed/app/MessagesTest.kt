package se.swemed.app

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import java.nio.charset.Charset

class MessagesTest {
    @Test
    fun parses_requests() {
        // Requests as the page sends them; params are optional; anything else is not a request.
        val request = parse_request("""{"id":3,"method":"site.show","params":{"id":"fass"}}""")!!
        assertEquals(3, request.id)
        assertEquals("site.show", request.method)
        assertEquals("fass", request.params.getString("id"))
        assertEquals(0, parse_request("""{"id":1,"method":"haptic"}""")!!.params.length())
        assertNull(parse_request("nope"))
        assertNull(parse_request("""{"method":"x"}"""))
    }

    @Test
    fun formats_replies_errors_and_events() {
        // The shapes web/src/host/android.ts expects: {id, result}, {id, error}, {event, params}.
        assert_same_json("""{"id":1,"result":{"a":1}}""", reply_message(1, JSONObject().put("a", 1)))
        assert_same_json("""{"id":2,"error":"x"}""", error_message(2, "x"))
        assert_same_json("""{"event":"back","params":{}}""", event_message("back", JSONObject()))
    }

    /**
     * Assert two JSON texts hold the same object, whatever their key order. Both are re-serialized by the same
     * org.json, so key order and spacing match; JSONObject.similar() is not in the Android stubs the unit tests compile
     * against.
     */
    private fun assert_same_json(expected: String, actual: String) =
        assertEquals(JSONObject(expected).toString(), JSONObject(actual).toString())

    @Test
    fun parses_sites_and_rejects_those_that_are_not_web_pages() {
        // Sites as the page sends them; whatever it sends, a site's view must never load a file or another scheme.
        val specs = parse_sites(JSONObject("""{"sites":[{"id":"fass","url":"https://fass.se/health","script":"x()","hosts":["fass.se"]}]}"""))
        assertEquals(listOf(SiteSpec("fass", "https://fass.se/health", "x()", listOf("fass.se"))), specs)
        val file = JSONObject("""{"sites":[{"id":"x","url":"file:///etc/passwd","script":"","hosts":[]}]}""")
        assertThrows(IllegalArgumentException::class.java) { parse_sites(file) }
    }

    @Test
    fun a_site_owns_its_hosts_and_their_subdomains() {
        // What decides whether a link opens in the site's view or in the browser.
        val site = SiteSpec("im", "https://www.internetmedicin.se/", "", listOf("internetmedicin.se"))
        assertTrue(site.owns("internetmedicin.se"))
        assertTrue(site.owns("www.internetmedicin.se"))
        assertTrue(site.owns("Verktyg.Internetmedicin.se"))
        assertFalse(site.owns("notinternetmedicin.se"))
        assertFalse(site.owns("internetmedicin.se.example.org"))
        assertFalse(site.owns(null))
    }

    @Test
    fun charsets() {
        // Charsets as servers name them, or UTF-8 for none or an unknown one.
        assertEquals(Charsets.UTF_8, charset_of("text/html; charset=utf-8"))
        assertEquals(Charset.forName("ISO-8859-1"), charset_of("text/html; charset=\"ISO-8859-1\""))
        assertEquals(Charsets.UTF_8, charset_of(null))
        assertEquals(Charsets.UTF_8, charset_of("text/html; charset=bogus-charset"))
    }
}
