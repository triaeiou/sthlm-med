import { enabled_site_ids, parse_config, type AppConfig } from './core/config.ts'
import { build_find_script, find_matches, page_find, type FindArgs, type FindResult } from './core/find.ts'
import { build_injection_script } from './core/inject.ts'
import { item_key, item_sites, type MenuItem, type ViewId } from './core/menu.ts'
import { find_site, site_hosts } from './core/sites.ts'
import type { Host, HostSite } from './host/host.ts'
import { render_belport } from './ui/belport-view.ts'
import { FIND_HEIGHT, FindBar } from './ui/find-bar.ts'
import { render_settings } from './ui/settings.ts'
import { render_popout, Toolbar, TOOLBAR_HEIGHT, type MenuActions } from './ui/toolbar.ts'

/** The part of this page the find bar searches when the Belport view is open. */
const BELPORT_ROOT = '#overlay .view-body'

/**
 * The app: which site shows, which view or popout menu is open over it, and the config. Independent of the platform,
 * which it drives through a Host. Every change of state ends in sync(), which makes the host and the page match it.
 */
export class App {
  private config!: AppConfig
  /** The site showing, or lying under the overlay. */
  private active = ''
  /** What is open over the site: the menu item of a view, or of a group whose popout menu shows. */
  private overlay: MenuItem | null = null
  /** Each site's load progress as last heard, 0 to 100. */
  private progress = new Map<string, number>()
  private menu_actions: MenuActions = { select: (item) => this.select(item), long_press: (item) => this.long_press(item) }
  private toolbar = new Toolbar(this.menu_actions, () => this.open_find())
  private find_bar = new FindBar({ run: (args) => this.find(args), close: () => this.close_find(), focus_page: () => this.host.focus_page() })
  private overlay_element: HTMLElement
  private host: Host

  /** The app on [host], with its toolbar and find bar added to the page, and its views shown in [overlay_element]. */
  constructor(host: Host, overlay_element: HTMLElement) {
    // The find bar goes just before the toolbar, so it comes before it in the tab order too.
    this.host = host
    this.overlay_element = overlay_element
    document.body.append(this.find_bar.element, this.toolbar.element)
    /*
     * The host's events: Back (only sent while the page captures it), and sites' load progress. Progress is kept for
     * every site but drawn only for the active one; when its page has loaded, the find bar finds in the new page.
     */
    host.on_event((event) => {
      if (event.type === 'back') return this.back()
      this.progress.set(event.id, event.progress)
      if (event.id !== this.active) return
      this.update_toolbar()
      if (event.progress === 100 && !this.overlay) this.find_bar.refresh()
    })
  }

  /** Read the config, open the sites and show the start page. */
  async start(): Promise<void> {
    // A config that cannot be read is logged and the defaults used: the app must start regardless.
    const json = await this.host.load_config().catch((error: unknown) => {
      console.error('config.load', error)
      return null
    })
    this.apply(parse_config(json))
  }

  /** Store and apply the settings view's [draft]. */
  private async save(draft: AppConfig): Promise<void> {
    /*
     * The draft goes through parse_config like a stored file, so what is saved and applied is exactly what a restart
     * would read. Saved first: if the write fails, the error reaches the settings view and nothing changes.
     */
    const config = parse_config(JSON.stringify(draft))
    await this.host.save_config(JSON.stringify(config))
    this.apply(config)
  }

  /** Make [config] the one in use: its sites open, one of them showing, the toolbar drawn for it. */
  private apply(config: AppConfig): void {
    // The site showing stays if it is still enabled; else, as at start, the startup site shows.
    this.config = config
    if (!enabled_site_ids(config).includes(this.active)) this.active = config.startup
    // The host adds, drops or reloads views as the list has changed.
    this.host.set_sites(this.host_sites())
    this.host.show_site(this.active)
    this.toolbar.build(config)
    this.sync()
  }

  /** The enabled sites as the host needs them: start page, the CSS script, and the hosts that are the site. */
  private host_sites(): HostSite[] {
    /*
     * A site's CSS is its built-in rules, then the user's, which so win over built-in rules of equal specificity.
     * No CSS, no script: the host then registers nothing for the site.
     */
    return enabled_site_ids(this.config).flatMap((id) => {
      const def = find_site(id)
      const settings = this.config.sites[id]
      if (!def || !settings) return []
      const css = `${def.css ?? ''}\n${settings.extra_css}`.trim()
      return [{ id, url: settings.url, script: css && build_injection_script(css), hosts: site_hosts(def, settings.url) }]
    })
  }

  /** A tap on a toolbar or popout item. */
  private select(item: MenuItem): void {
    // A site shows as it was left; a view or a group's menu opens, or closes when it is the one open (a second tap).
    if (item.kind === 'site') this.show_site(item.id)
    else if (this.overlay && item_key(this.overlay) === item_key(item)) this.set_overlay(null)
    else this.set_overlay(item)
  }

  /** A long press on a site takes it back to its start page. */
  private long_press(item: MenuItem): void {
    // Views and groups have no start page. The vibration confirms the long press, as the page may not visibly change.
    const url = item.kind === 'site' && this.config.sites[item.id]?.url
    if (!url) return
    this.host.haptic()
    this.host.navigate_site(item.id, url)
    this.show_site(item.id)
  }

  /** Show a site where the user left it, closing any view or popout menu. */
  private show_site(id: string): void {
    // The host swaps which site's view is visible; closing the overlay gives the screen back to it.
    this.active = id
    this.host.show_site(id)
    this.set_overlay(null)
  }

  /** Whether [view] is the one open. */
  private is_open(view: ViewId): boolean {
    return this.overlay?.kind === 'view' && this.overlay.id === view
  }

  /** Open [overlay] (the menu item of a view or group) over the site, or with null close what is open. */
  private set_overlay(overlay: MenuItem | null): void {
    /*
     * The content is drawn only when the overlay changes, so the Belport view keeps its list and scroll position as
     * the find bar opens over it. The site's view is untouched underneath; sync() gives this page the screen.
     */
    const changed = overlay !== this.overlay
    this.overlay = overlay
    if (changed) this.overlay_element.replaceChildren(...(overlay ? [this.overlay_content(overlay)] : []))
    this.overlay_element.hidden = !overlay
    // Settings are not searched, and the find bar would only be in their way.
    if (this.is_open('settings')) this.close_find()
    this.sync()
  }

  /** The element to show for [overlay]: a group's popout menu, settings, or the Belport view. */
  private overlay_content(overlay: MenuItem): HTMLElement {
    // Each gets what it may ask of the app; all can close themselves.
    const close = () => this.set_overlay(null)
    if (overlay.kind === 'group') return render_popout(overlay, this.config, this.menu_actions, close)
    if (overlay.id === 'settings') return render_settings(this.config, { save: (draft) => this.save(draft), close })
    return render_belport(this.host, { close, find: () => this.open_find(), changed: () => this.find_bar.refresh() })
  }

  /** Back closes a popout menu, then the find bar, then a view. */
  private back(): void {
    if (this.find_bar.is_open && this.overlay?.kind !== 'group') this.close_find()
    else this.set_overlay(null)
  }

  /** Open the find bar: for the Belport view if it is open, else for the active site. */
  private open_find(): void {
    // Belport stays open, to be searched; settings or a popout menu closes, leaving the site to search.
    this.find_bar.open()
    this.set_overlay(this.is_open('belport') ? this.overlay : null)
  }

  /** Close the find bar and remove its highlights. */
  private close_find(): void {
    /*
     * Safe to call when closed. The bar may have searched the Belport view (in this page) and any site the user
     * switched to while it was open; rather than keeping track, the highlights are removed everywhere.
     */
    if (!this.find_bar.is_open) return
    this.find_bar.close()
    page_find(find_matches, { source: '' })
    for (const id of enabled_site_ids(this.config)) this.host.evaluate_in_site(id, build_find_script({ source: '' })).catch(() => {})
    this.sync()
  }

  /** Find in what the find bar searches now: the Belport view when it is open (it covers the site), else the site. */
  private async find(args: FindArgs): Promise<FindResult> {
    /*
     * The Belport view is part of this page: page_find runs here directly, limited to the view's list. A site's page
     * is another WebView, reached through the host as a script; no value from it means the script failed there.
     */
    if (this.is_open('belport')) return page_find(find_matches, { ...args, root: BELPORT_ROOT })
    const result = await this.host.evaluate_in_site(this.active, build_find_script(args))
    if (!result) throw new Error('No result from the page')
    return result as FindResult
  }

  /** Make the host and the page match the state: the page's size, who gets Back, the toolbar's marks, the matches. */
  private sync(): void {
    /*
     * The page's size on Android: the whole screen with a view or menu open, else a strip for the toolbar (and the
     * find bar when open), so the site above stays touchable. Back goes to the page while anything is open here.
     */
    const find_open = this.find_bar.is_open
    const height = TOOLBAR_HEIGHT + (find_open ? FIND_HEIGHT : 0)
    this.host.set_shell_mode({ full: !!this.overlay, height, capture_back: !!this.overlay || find_open })
    this.update_toolbar()
    // What the find bar searches may have changed (another site, Belport opened or closed): find there too.
    this.find_bar.refresh()
  }

  /** Mark the toolbar item that is open, else the active site's (its own, or its group's), and show the site's load. */
  private update_toolbar(): void {
    // The load bar shows only for a site, not over a view or menu.
    const item = this.overlay ?? this.config.menu.find((item) => item_sites(item).includes(this.active))
    this.toolbar.update(item ? item_key(item) : '', this.overlay ? null : this.progress.get(this.active) ?? null)
  }
}
