import { DEFAULT_MENU, item_key, item_sites, type MenuItem } from './menu.ts'
import { SITES } from './sites.ts'

/** The user's settings, as the host stores them: JSON, read back with parse_config(). */
export interface AppConfig {
  /** The site shown at start. */
  startup: string
  /** Every built-in site's settings, by its id. */
  sites: Record<string, SiteSettings>
  /** The toolbar: DEFAULT_MENU's items, in the user's order. */
  menu: MenuItem[]
}

export interface SiteSettings {
  url: string
  enabled: boolean
  /** CSS added to the site's built-in CSS, for fixing a site without a new version of the app. */
  extra_css: string
}

/** The config before the user changes anything: every site on, at its default page, the default toolbar. */
export function default_config(): AppConfig {
  // The first site of the toolbar starts, unless the user picks another.
  const sites = Object.fromEntries(SITES.map((def) => [def.id, { url: def.default_url, enabled: true, extra_css: '' }]))
  const menu = [...DEFAULT_MENU]
  return { startup: menu.flatMap(item_sites)[0] ?? '', sites, menu }
}

/** Whether a string is an absolute http(s) URL. */
export function is_web_url(value: unknown): value is string {
  /*
   * Parsed by URL rather than matched by a pattern, so that only addresses a WebView can load pass: this keeps out
   * javascript:, file: and relative URLs, which settings must not be able to load in a site's view.
   */
  if (typeof value !== 'string') return false
  try {
    return ['https:', 'http:'].includes(new URL(value).protocol)
  } catch {
    return false
  }
}

/**
 * The config stored as [json], over the defaults: a value missing or invalid keeps its default, so a file from another
 * version, or a damaged one, still gives a working config. Never throws.
 */
export function parse_config(json: string | null): AppConfig {
  /*
   * Start from the defaults and take over only what is stored and valid. [stored] is untyped, and read with ?. all the
   * way: whatever shape the file has, a value of the wrong type is just not taken.
   */
  const config = default_config()
  let stored: any
  try {
    stored = JSON.parse(json ?? 'null')
  } catch {
    return config
  }
  // Sites: only the built-in ones (config.sites has them all), each value checked.
  for (const [id, settings] of Object.entries(config.sites)) {
    const saved = stored?.sites?.[id]
    if (is_web_url(saved?.url)) settings.url = saved.url
    if (typeof saved?.enabled === 'boolean') settings.enabled = saved.enabled
    if (typeof saved?.extra_css === 'string') settings.extra_css = saved.extra_css
  }
  /*
   * The toolbar: the built-in items sorted into the stored order. An item the stored order lacks (one added in a newer
   * version) goes just before Settings, so that Settings stays last; stored items the app does not have are ignored.
   */
  if (Array.isArray(stored?.menu)) {
    const order: string[] = stored.menu.map((entry: any) => `${entry?.kind}:${entry?.id}`)
    const settings_at = order.indexOf('view:settings')
    /** Where [item] goes: its place in the stored order, or else just before Settings there. */
    const rank = (item: MenuItem) => {
      const at = order.indexOf(item_key(item))
      return at >= 0 ? at : settings_at >= 0 ? settings_at - 0.5 : order.length
    }
    config.menu.sort((a, b) => rank(a) - rank(b))
  }
  // The startup site must be one that is shown; else the first one shown.
  const enabled = enabled_site_ids(config)
  if (enabled.includes(stored?.startup)) config.startup = stored.startup
  else if (!enabled.includes(config.startup)) config.startup = enabled[0] ?? config.startup
  return config
}

/** The enabled sites, in toolbar order (a group's sites where the group is), so the first is the leftmost one. */
export function enabled_site_ids(config: AppConfig): string[] {
  return config.menu.flatMap(item_sites).filter((id) => config.sites[id]?.enabled)
}
