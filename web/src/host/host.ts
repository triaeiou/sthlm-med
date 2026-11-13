/**
 * What the app needs from the platform it runs on. The app (src/app.ts and src/ui) decides what to show; a host only
 * carries it out: keeping a live view per site, storing the config, fetching pages and opening links. Hosts: Android
 * (android.ts, with android/), and the browser for development (browser.ts).
 */
export interface Host {
  readonly kind: 'android' | 'browser'

  /** The stored config as JSON, or null before the first save. */
  load_config(): Promise<string | null>
  save_config(json: string): Promise<void>

  /**
   * The sites to keep open, one live view each, loaded at once. Views of sites no longer listed are closed; a site
   * whose start page changed goes to the new one; a site whose script or hosts changed reloads. A link in a site's
   * page to another website (see HostSite.hosts) opens outside the app, like open_external().
   */
  set_sites(sites: readonly HostSite[]): void
  /** Show a site's view as it is, where the user left it. */
  show_site(id: string): void
  /** Load a URL in a site's view, as going back to its start page. */
  navigate_site(id: string, url: string): void
  /** Run a script of the app's in a site's page; its value. */
  evaluate_in_site(id: string, script: string): Promise<unknown>

  /** How much of the screen the app's own page takes, and whether Back is its to handle. */
  set_shell_mode(mode: ShellMode): void
  /** Give the app's page the input focus, so that an input focused next gets the keyboard. */
  focus_page(): Promise<void>

  /** GET a URL as text, from outside the page, so other sites' pages can be read (CORS does not apply). */
  fetch_text(url: string): Promise<string>
  /** Open a URL outside the app: tel: in the dialler, web pages in the browser. */
  open_external(url: string): void
  /** A short vibration, as for a long press. */
  haptic(): void

  /** Have [handler] called with the host's events. */
  on_event(handler: (event: HostEvent) => void): void
}

export interface ShellMode {
  /** The whole screen, for a view or a popout menu over the site; else a strip at the bottom, the site above it. */
  full: boolean
  /** The strip's height in CSS pixels: the toolbar, and the find bar when open. */
  height: number
  /** Back is the page's (a 'back' event) before the site's history. */
  capture_back: boolean
}

export interface HostSite {
  id: string
  /** The start page. */
  url: string
  /** Script to run in the site's pages at document start (inject.ts), or "" for none. */
  script: string
  /**
   * The site's hosts, such as "fass.se". Pages on them and on their subdomains are the site: the script runs in
   * those, and links to them open in the site's view. Any other page is another website.
   */
  hosts: string[]
}

export type HostEvent =
  /** Back, while the page captures it (set_shell_mode()); the host handles it otherwise (site history, leaving). */
  | { type: 'back' }
  /** A site's load progress, 0 to 100. */
  | { type: 'progress'; id: string; progress: number }
