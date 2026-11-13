import { h } from '../ui/dom.ts'
import type { Host, HostSite } from './host.ts'

const CONFIG_KEY = 'swemed.config'

/**
 * The browser host, for working on the app in a desktop browser (npm run dev). The sites refuse to be framed
 * (X-Frame-Options), so each opens in a tab of its own and the site area shows a card for it; there is no CSS
 * injection and no find in the sites. Config is kept in localStorage; fetch_text goes through the dev server's /proxy.
 */
export class BrowserHost implements Host {
  readonly kind = 'browser'
  private sites: readonly HostSite[] = []
  private area: HTMLElement

  /** [area] is where a site would show; here it holds a card with a button opening the site's tab. */
  constructor(area: HTMLElement) {
    this.area = area
  }

  /** The config lives in this browser's localStorage. */
  async load_config(): Promise<string | null> {
    return localStorage.getItem(CONFIG_KEY)
  }

  /** A failure (storage full or blocked) rejects, and so shows as an error in settings. */
  async save_config(json: string): Promise<void> {
    localStorage.setItem(CONFIG_KEY, json)
  }

  /** Only remembered; a tab opens from the site's card, as browsers block tabs opened without a click. */
  set_sites(sites: readonly HostSite[]): void {
    this.sites = sites
  }

  /** The card standing in for the site: its address, and a button to open or bring forward its tab. */
  show_site(id: string): void {
    // Built anew each time; the button's click may open a tab where an automatic window.open would be blocked.
    const site = this.sites.find((site) => site.id === id)
    if (!site) return
    this.area.replaceChildren(h('div', { class: 'browser-card' },
      h('p', null, `${site.url} öppnas i en egen flik (sidorna tillåter inte inbäddning).`),
      h('button', { class: 'button', type: 'button', onclick: () => this.navigate_site(id, site.url) }, 'Öppna fliken')))
  }

  /** A named window: the site reuses its own tab rather than opening a new one each time. */
  navigate_site(id: string, url: string): void {
    window.open(url, `swemed-${id}`)
  }

  /** Another origin's tab cannot be scripted from here; the find bar then shows that it found nothing. */
  async evaluate_in_site(): Promise<unknown> {
    throw new Error('Not available in the browser')
  }

  /** Nothing to do: in a browser this page has the whole window, and the stylesheet places the toolbar. */
  set_shell_mode(): void {}

  /** A browser focuses inputs on its own; nothing to prepare. */
  async focus_page(): Promise<void> {}

  /** Through the dev server (scripts/dev-server.mjs), which fetches the page server side, past CORS. */
  async fetch_text(url: string): Promise<string> {
    // An HTTP error status is an error here too, as on Android.
    const response = await fetch(`/proxy?url=${encodeURIComponent(url)}`)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return response.text()
  }

  /** In a new tab, which gets no handle back to this page (noopener). */
  open_external(url: string): void {
    window.open(url, '_blank', 'noopener')
  }

  /** Where supported (mostly Android browsers); elsewhere nothing happens. */
  haptic(): void {
    navigator.vibrate?.(30)
  }

  /** No events: no hardware Back, and the sites' tabs report no progress to this page. */
  on_event(): void {}
}
