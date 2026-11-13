/**
 * The built-in sites. A site is a web page the app keeps open in its own view, loaded at start, so switching to it is
 * instant and it keeps its place. To add a site, add a SiteDef here and put it on the toolbar (DEFAULT_MENU) or in a
 * popout menu (GROUPS), both in menu.ts; no host changes are needed.
 */
export interface SiteDef {
  id: string
  /** As tooltips, popout menus and settings show it. */
  name: string
  /**
   * The site's icon, relative to the app's page, such as "icons/fass.png". A site on the toolbar needs one; a site in
   * a popout menu shows its name, with the icon if it has one.
   */
  icon?: string
  /** Start page, until settings change it. */
  default_url: string
  /** CSS added to the site's pages, such as rules hiding ads. Settings can add more per site. */
  css?: string
}

/**
 * Internetmedicin's ads: each is a block marked itemtype="https://schema.org/WPAdBlock", inside an <aside>, often in a
 * list item.
 */
const INTERNETMEDICIN_ADS = [
  '[itemtype*="schema.org/WPAdBlock"],',
  'aside:has(> [itemtype*="schema.org/WPAdBlock"]),',
  'li:has(> aside > [itemtype*="schema.org/WPAdBlock"]),',
  'div:has(> [itemtype*="schema.org/WPAdBlock"]:only-child) { display: none !important; }',
].join('\n')

export const SITES: readonly SiteDef[] = [
  {
    id: 'kunskapsstod',
    name: 'Kunskapsstöd för vårdgivare',
    icon: 'icons/kunskapsstod.png',
    default_url: 'https://kunskapsstodforvardgivare.se/',
  },
  {
    id: 'giftinformation',
    name: 'Giftinformationscentralen',
    icon: 'icons/giftinformation.png',
    default_url: 'https://giftinformation.se/lakare/',
    // The banner "Viktig information om väntetider" above the header, which takes half a phone screen.
    css: '.site-msg-alert { display: none !important; }',
  },
  { id: 'fass', name: 'FASS', icon: 'icons/fass.png', default_url: 'https://fass.se/health' },
  { id: 'janusinfo', name: 'Janusinfo', icon: 'icons/janusinfo.png', default_url: 'https://janusinfo.se/' },
  {
    id: 'internetmedicin',
    name: 'Internetmedicin',
    icon: 'icons/internetmedicin.png',
    default_url: 'https://www.internetmedicin.se/specialistomraden',
    css: INTERNETMEDICIN_ADS,
  },
  { id: 'abgbench', name: 'ABG bench', default_url: 'https://abgbench.com/stewart' },
  {
    id: 'im_kalkylatorer',
    name: 'IM kalkylatorer',
    default_url: 'https://verktyg.internetmedicin.se/kalkylatorer',
    css: INTERNETMEDICIN_ADS,
  },
]

/** The built-in site with [id]. */
export function find_site(id: string): SiteDef | undefined {
  return SITES.find((site) => site.id === id)
}

/**
 * The hosts that make up a site, such as "fass.se": the host of its start page and of its default one, without "www.".
 * Pages on these hosts and their subdomains are the site (HostSite.hosts); anything else is another website.
 */
export function site_hosts(def: SiteDef, url: string): string[] {
  /*
   * Both the configured start page's host and the default one's, so the site is still itself when the user points it
   * at a page elsewhere. Without "www.", as sites redirect between it and the bare host, and it is a subdomain like
   * any other. [url] is a valid URL: the config only holds such (parse_config()).
   */
  return [...new Set([url, def.default_url].map((page) => new URL(page).hostname.replace(/^www\./, '')))]
}
