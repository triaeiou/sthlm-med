import { App } from './app.ts'
import { AndroidHost } from './host/android.ts'
import { BrowserHost } from './host/browser.ts'

/*
 * Start-up: pick the host this page runs in, then start the app on it.
 *
 * The Android app gives this page a message channel (window.swemed) before it loads; without one, the page runs in a
 * desktop browser for development. The host's kind goes on <html> (data-host) so the stylesheet can adapt, e.g. a
 * transparent background on Android, where the sites' native views show through.
 */
const host = window.swemed ? new AndroidHost(window.swemed) : new BrowserHost(document.getElementById('site-area')!)
document.documentElement.dataset.host = host.kind
void new App(host, document.getElementById('overlay')!).start()
