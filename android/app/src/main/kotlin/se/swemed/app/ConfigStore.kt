package se.swemed.app

import android.util.AtomicFile
import java.io.File
import java.io.FileNotFoundException

/**
 * The page's config, in config.json. Only stored here: the page checks and reads it (web/src/core/config.ts). Writes
 * are atomic, so a crash never leaves half a file.
 */
class ConfigStore(dir: File) {
    private val file = AtomicFile(File(dir, "config.json"))

    /** The config as the page saved it, or null before the first save. */
    fun read(): String? = try {
        // AtomicFile reads the last complete version, even if a write was cut off by a crash.
        file.readFully().toString(Charsets.UTF_8)
    } catch (_: FileNotFoundException) {
        null
    }

    /** Store the config, replacing the old one only once the new one is fully written. One write at a time. */
    @Synchronized
    fun write(json: String) {
        /*
         * AtomicFile writes a new file beside the old one and renames it over the old one when done (finishWrite);
         * on failure the new file is deleted (failWrite), the old one stays as it was, and the page hears of it.
         */
        val stream = file.startWrite()
        try {
            stream.write(json.toByteArray(Charsets.UTF_8))
            file.finishWrite(stream)
        } catch (error: Exception) {
            file.failWrite(stream)
            throw error
        }
    }
}
