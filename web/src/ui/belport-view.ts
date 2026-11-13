import { BELPORT_URL, parse_belport, split_phones, type BedCategory, type BelportPage, type BelportUnit, type Phone } from '../core/belport.ts'
import type { Host } from '../host/host.ts'
import { h, icon, type Child } from './dom.ts'

export interface BelportActions {
  close(): void
  /** Open the find bar. */
  find(): void
  /** The list shown changed, as after reading the page again. */
  changed(): void
}

/** Belport's page as read at some time. */
interface Reading {
  page: BelportPage
  fetched_at: number
}

/** The last reading, kept while the app runs, so opening the view again shows it at once. */
let cache: Reading | null = null
const FRESH_MS = 2 * 60 * 1000
const STALE_UPDATE_MS = 12 * 60 * 60 * 1000
/** How far to pull the list down, from its top, to read the page again. */
const PULL_PX = 72

/**
 * Free beds from Belport: units with the most free beds first, each with its free beds and waiting referrals (per kind
 * of bed when it has more than one, such as MRSA beds), its bakjour number to call, and its other numbers, message and
 * area. Reads the page again when opened after two minutes, with the refresh button, or when the list is pulled down
 * from its top.
 */
export function render_belport(host: Host, actions: BelportActions): HTMLElement {
  /*
   * The view's frame: a header (title, when the page was read, search, refresh, close), the pull-to-refresh
   * indicator, and the scrolling list. The list is filled by show(), from the cache at once or after load().
   */
  const body = h('div', { class: 'view-body' })
  const subtitle = h('p', { class: 'subtitle' })
  const failure = h('p', { class: 'status error' })
  const pull_indicator = h('div', { class: 'pull-indicator' }, icon('refresh'))
  const refresh_button = h('button', { class: 'icon-button refresh', type: 'button', title: 'Uppdatera', onclick: () => load() }, icon('refresh'))
  const root = h('section', { class: 'view belport' },
    h('header', { class: 'view-header' },
      h('div', null, h('h1', null, 'Lediga vårdplatser'), subtitle),
      h('button', { class: 'icon-button', type: 'button', title: 'Sök på sidan', onclick: actions.find }, icon('search')),
      refresh_button,
      h('button', { class: 'icon-button', type: 'button', title: 'Stäng', onclick: actions.close }, icon('close'))),
    h('div', { class: 'pull', 'aria-hidden': 'true' }, pull_indicator),
    body)
  pull_to_refresh(body, pull_indicator, () => load())

  /** Fill the list from [reading]. */
  const show = ({ page, fetched_at }: Reading) => {
    // When the data was read (not when units updated it), so a stale list is noticed.
    subtitle.textContent = [page.region, page.care_type].filter(Boolean).join(' · ') + ` · hämtad ${time(new Date(fetched_at))}`
    // The most free beds first, as that is what is looked for; ties alphabetically, the Swedish way (å, ä, ö last).
    const units = [...page.units].sort((a, b) => b.free - a.free || a.name.localeCompare(b.name, 'sv'))
    body.replaceChildren(
      units.length ? h('ul', { class: 'units' }, units.map(unit_card)) : h('p', { class: 'empty' }, 'Inga enheter hittades på sidan.'),
      h('p', { class: 'source' },
        h('button', { class: 'link', type: 'button', onclick: () => host.open_external(BELPORT_URL) }, icon('external', 'icon inline'), 'Öppna Belport i webbläsaren')))
  }

  /** A unit's card: name, last update, beds, the bakjour call button, other numbers, and message and area folded. */
  const unit_card = (unit: BelportUnit) => {
    // Bakjour gets the big button; the unit's other numbers small ones.
    const others = unit.phones.filter((phone) => phone !== unit.bakjour)
    // A unit that has not updated its numbers for half a day shows its update time in red: the numbers may be wrong.
    const updated = parse_updated(unit.updated)
    const stale = updated !== null && Date.now() - updated.getTime() > STALE_UPDATE_MS
    return h('li', { class: 'unit' },
      h('div', { class: 'unit-head' },
        h('div', { class: 'unit-name' },
          h('strong', null, unit.name),
          h('span', { class: stale ? 'updated stale' : 'updated' }, unit.updated ? `Uppdaterad ${unit.updated}` : '')),
        beds(unit)),
      unit.bakjour ? phone_button(unit.bakjour, 'call primary') : null,
      others.length ? h('div', { class: 'phones' }, others.map((phone) => phone_button(phone, 'call'))) : null,
      // Folded, as they are long; the find bar searches them anyway, and opens the one holding a match.
      unit.message || unit.area
        ? h('details', null,
          h('summary', null, 'Meddelande och område'),
          // The message's phone numbers are call links too.
          unit.message ? h('p', null, split_phones(unit.message).map((part) => (typeof part === 'string' ? part : call_link(part, null, part.number)))) : null,
          unit.area ? h('p', { class: 'area' }, h('strong', null, 'Område: '), unit.area) : null)
        : null)
  }

  /** Free beds and waiting referrals, a row per kind of bed when there are more than one. */
  const beds = (unit: BelportUnit) => {
    /*
     * A small table, columns Lediga (free, of available) and Väntar (waiting referrals). Rows are named (Vanliga,
     * MRSA) only when there is more than one; a unit with no categories gets one row of dashes. The full numbers
     * are in each row's tooltip.
     */
    const named = unit.categories.length > 1
    const rows = unit.categories.length ? unit.categories : [null]
    return h('table', { class: 'beds' },
      h('thead', null, h('tr', null, named ? h('th', null) : null, h('th', null, 'Lediga'), h('th', null, 'Väntar'))),
      h('tbody', null, rows.map((category) => h('tr', { title: category ? bed_title(category) : '' },
        named && category ? h('th', { scope: 'row' }, category_name(category)) : null,
        h('td', { class: (category?.free ?? 0) > 0 ? 'free some' : 'free none' },
          h('span', { class: 'count' }, category?.free ?? '–'),
          category?.available != null ? h('span', { class: 'of' }, `/${category.available}`) : null),
        h('td', { class: (category?.waiting ?? 0) > 0 ? 'waiting some' : 'waiting none' }, h('span', { class: 'count' }, category?.waiting ?? 0))))))
  }

  /**
   * A link calling [phone]. A real tel: link (a long press shows the number, screen readers announce a link), but the
   * tap goes through the host: on Android a WebView does not open tel: links by itself.
   */
  const call_link = (phone: Phone, class_name: string | null, ...children: Child[]) =>
    h('a', {
      class: class_name,
      href: phone.tel,
      onclick: (event: Event) => {
        event.preventDefault()
        host.open_external(phone.tel)
      },
    }, children)

  /** A call button for [phone], saying what the number is. */
  const phone_button = (phone: Phone, class_name: string) =>
    call_link(phone, class_name, icon('phone', 'icon inline'), phone.label ? `${phone.label}: ` : '', h('span', { class: 'number' }, phone.number))

  /** Read Belport's page again, and show it, or why it could not be read. */
  const load = async () => {
    // One load at a time: while one runs the refresh button is disabled (and spins), and a pull does nothing.
    if (refresh_button.disabled) return
    refresh_button.disabled = true
    root.classList.add('refreshing')
    // With nothing to show yet, say that it is coming; with a list, keep it until the new one is there.
    if (!cache) body.replaceChildren(h('p', { class: 'empty' }, 'Hämtar…'))
    try {
      cache = { page: parse_belport(await host.fetch_text(BELPORT_URL)), fetched_at: Date.now() }
      show(cache)
      // The find bar, if open, searches the new list.
      actions.changed()
    } catch (error) {
      // A failed read keeps the list there was, with the error above it, as old numbers beat none.
      failure.textContent = `Kunde inte hämta Belport: ${error instanceof Error ? error.message : error}`
      if (!cache) body.replaceChildren()
      body.prepend(failure)
    } finally {
      refresh_button.disabled = false
      root.classList.remove('refreshing')
    }
  }

  /*
   * On opening: show what was read before at once, and read again if that is missing or older than FRESH_MS, so
   * switching to the view and back is instant but the numbers are never old for long.
   */
  if (cache) show(cache)
  if (!cache || Date.now() - cache.fetched_at > FRESH_MS) void load()
  return root
}

/**
 * Call [refresh] when [scroller], at its top, is pulled down by PULL_PX or more and let go. [indicator] follows the
 * finger (--pull, in CSS pixels, unitless) and is marked ready once the pull is far enough.
 */
function pull_to_refresh(scroller: HTMLElement, indicator: HTMLElement, refresh: () => void): void {
  /*
   * Touch events, not pointer events: once the list starts scrolling, the browser cancels pointer events but keeps
   * sending touch events. [start_y] is where the finger went down, when that was at the top of the list (null: no
   * pull in progress); [distance] is how far the indicator has been pulled.
   */
  let start_y: number | null = null
  let distance = 0
  /** Show the indicator pulled [value] pixels. */
  const pull = (value: number) => {
    // Its position and turn come from --pull in the stylesheet (to a limit); it is "ready" past PULL_PX.
    distance = value
    indicator.style.setProperty('--pull', String(Math.round(Math.min(value, PULL_PX * 1.4))))
    indicator.classList.toggle('pulling', value > 0)
    indicator.classList.toggle('ready', value >= PULL_PX)
  }
  /** No pull in progress, the indicator back in its place. */
  const reset = () => {
    start_y = null
    pull(0)
  }
  // A pull starts only with one finger, at the top of the list; elsewhere a downward move is ordinary scrolling.
  scroller.addEventListener('touchstart', (event) => {
    reset()
    if (event.touches.length === 1 && scroller.scrollTop <= 0) start_y = event.touches[0]?.clientY ?? null
  }, { passive: true })
  scroller.addEventListener('touchmove', (event) => {
    const touch = event.touches[0]
    if (start_y === null || !touch) return
    // If the list scrolled after all (the finger went up first), this is scrolling: no pull.
    if (scroller.scrollTop > 0) return reset()
    /* Resisting: the indicator moves at half the finger's pace. */
    pull(Math.max(0, (touch.clientY - start_y) / 2))
  }, { passive: true })
  // Letting go past PULL_PX refreshes; a cancelled touch (the system took the gesture) never does.
  scroller.addEventListener('touchend', () => {
    if (start_y !== null && distance >= PULL_PX) refresh()
    reset()
  })
  scroller.addEventListener('touchcancel', reset)
}

/** The short name of a kind of bed in a unit's table: "Vanliga", "MRSA", or its label. */
function category_name(category: BedCategory): string {
  // Short names, to keep the table narrow next to the unit's name; other labels are cut to fit.
  if (category.kind === 'normal') return 'Vanliga'
  if (category.kind === 'mrsa') return 'MRSA'
  return category.label.length > 14 ? `${category.label.slice(0, 13)}…` : category.label
}

/**
 * A category's numbers in words, for the tooltip of its row in the table. Unknown numbers (empty cells on the page)
 * show as a dash; unknown waiting as none.
 */
function bed_title(category: BedCategory): string {
  return `${category.label}: ${category.free ?? '–'} lediga av ${category.available ?? '–'} disponibla, ${category.waiting ?? 0} väntande remisser`
}

/** "2026-11-11 09:17", Swedish time as written on the page, as a date in the device's time zone. */
function parse_updated(text: string): Date | null {
  /*
   * Read as local time: the page writes Swedish time and the app is used in Sweden. Unexpected formats give null,
   * and then no staleness warning, rather than a wrong one.
   */
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/.exec(text)
  if (!match) return null
  const [, year, month, day, hour, minute] = match.map(Number) as number[]
  return new Date(year!, month! - 1, day, hour, minute)
}

/**
 * "09:17": the time of [date], in Swedish format. sv-SE gives a 24-hour clock with a colon, regardless of the device's
 * language.
 */
function time(date: Date): string {
  return date.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
}
