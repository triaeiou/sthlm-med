import type { AppConfig } from '../core/config.ts'
import { GROUPS, VIEWS, item_key, item_name, item_sites, type GroupDef, type MenuItem, type ViewDef } from '../core/menu.ts'
import { find_site } from '../core/sites.ts'
import { h, icon } from './dom.ts'

export const TOOLBAR_HEIGHT = 48
const LONG_PRESS_MS = 500
/** How far up a finger must move on the toolbar, more up than sideways, for a swipe. */
const SWIPE_PX = 40

export interface MenuActions {
  /** A tap on an item. */
  select(item: MenuItem): void
  /** A long press on an item. */
  long_press(item: MenuItem): void
}

/**
 * The toolbar at the bottom. Built again only when the config changes; the active item and the loading bar change in
 * place (update()), so a press in progress is never interrupted by a rebuild. A swipe up on it is an action of its
 * own, not a press of the button it started on.
 */
export class Toolbar {
  readonly element = h('nav', { class: 'toolbar', 'aria-label': 'Webbplatser' })
  private buttons = new Map<string, HTMLElement>()
  private bar = h('div', { class: 'progress' })
  private actions: MenuActions

  /** A toolbar whose buttons report to [actions], and which calls [swipe_up] for a swipe up from it. */
  constructor(actions: MenuActions, swipe_up: () => void) {
    /*
     * The swipe-up gesture, watched on the whole toolbar, whichever button the finger starts on. [start] is where the
     * pointer being followed went down. The toolbar has touch-action: none (style.css), so the browser leaves the
     * moves to this code; a finger that has moved this far is no longer a tap or a long press of the button.
     */
    this.actions = actions
    let start: PointerEvent | null = null
    this.element.addEventListener('pointerdown', (event) => (start = event))
    this.element.addEventListener('pointermove', (event) => {
      // A swipe is up far enough, and more up than sideways, so a sloppy tap or a sideways slide is not one.
      if (event.pointerId !== start?.pointerId) return
      const dx = event.clientX - start.clientX
      const dy = event.clientY - start.clientY
      if (dy > -SWIPE_PX || Math.abs(dx) > Math.abs(dy)) return
      start = null
      swipe_up()
    })
    for (const type of ['pointerup', 'pointercancel']) this.element.addEventListener(type, () => (start = null))
  }

  /** Draw the buttons for [config]'s menu: on start and after settings change. */
  build(config: AppConfig): void {
    /*
     * An item shows if it is a view or has an enabled site: a site that is off, or a group with all its sites off, is
     * left out. The progress bar stays the first child; buttons are remembered by key for update().
     */
    this.buttons.clear()
    const items = config.menu.filter((item) => item.kind === 'view' || item_sites(item).some((id) => config.sites[id]?.enabled))
    for (const item of items) this.buttons.set(item_key(item), item_button(item, 'toolbar-item', this.actions))
    this.element.replaceChildren(this.bar, ...this.buttons.values())
  }

  /** Mark the item with [active_key] (item_key()) and show [progress] (0–100) of the active site's load, or none. */
  update(active_key: string, progress: number | null): void {
    // The active button is marked for the eye (class) and for screen readers (aria-current).
    for (const [key, button] of this.buttons) {
      button.classList.toggle('active', key === active_key)
      if (key === active_key) button.setAttribute('aria-current', 'page')
      else button.removeAttribute('aria-current')
    }
    // At least 8% while loading, so a load that just started shows at all; hidden when done.
    const loading = progress !== null && progress < 100
    this.bar.classList.toggle('loading', loading)
    this.bar.style.width = loading ? `${Math.max(progress, 8)}%` : '0'
  }
}

/** A group's popout menu: its enabled sites, by name, over a backdrop that closes it with [close]. */
export function render_popout(group: MenuItem, config: AppConfig, actions: MenuActions, close: () => void): HTMLElement {
  // A tap on the dimmed backdrop itself (not on the menu in it) closes the menu.
  const sites = item_sites(group).filter((id) => config.sites[id]?.enabled)
  const menu = h('div', { class: 'popout', role: 'menu' }, sites.map((id) => item_button({ kind: 'site', id }, 'popout-item', actions)))
  const backdrop = h('div', { class: 'backdrop', onclick: (event: Event) => event.target === backdrop && close() }, menu)
  return backdrop
}

/** A button for a menu item: in the toolbar its picture, in a popout menu its name as well. */
function item_button(item: MenuItem, class_name: 'toolbar-item' | 'popout-item', actions: MenuActions): HTMLElement {
  /*
   * A site's picture is its own icon, a view's or group's a line icon. The name is the tooltip, which also names the
   * button for screen readers; a site's says what a long press does.
   */
  const name = item_name(item)
  let picture: Node | null = null
  if (item.kind === 'site') {
    const src = find_site(item.id)?.icon
    if (src) picture = h('img', { class: 'site-icon', src, alt: '', draggable: 'false' })
  } else {
    const defs: ReadonlyArray<ViewDef | GroupDef> = item.kind === 'view' ? VIEWS : GROUPS
    const def = defs.find((def) => def.id === item.id)
    if (def) picture = icon(def.icon)
  }
  const title = item.kind === 'site' ? `${name} – håll inne för startsidan` : name
  const button = h('button', { class: class_name, type: 'button', title }, picture, class_name === 'popout-item' ? name : null)
  on_press(button, () => actions.select(item), () => actions.long_press(item))
  return button
}

/**
 * Call [tap] on a tap and [long] on a press held for half a second without moving; the click that ends a long press
 * is swallowed, as is the context menu Android would open.
 */
function on_press(element: HTMLElement, tap: () => void, long: () => void): void {
  /*
   * A timer starts when the finger goes down; if it runs out before the finger lifts or moves away, that is a long
   * press ([fired]), and the click that follows the lift is not a tap.
   */
  let timer: ReturnType<typeof setTimeout> | undefined
  let fired = false
  let x = 0
  let y = 0
  /** The press is over, or was no press: no long press will come of it. */
  const cancel = () => clearTimeout(timer)
  element.addEventListener('pointerdown', (event) => {
    fired = false
    x = event.clientX
    y = event.clientY
    cancel()
    timer = setTimeout(() => {
      fired = true
      long()
    }, LONG_PRESS_MS)
  })
  // A finger that moves more than a few pixels is scrolling or swiping, not pressing.
  element.addEventListener('pointermove', (event) => {
    if (Math.hypot(event.clientX - x, event.clientY - y) > 12) cancel()
  })
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) element.addEventListener(type, cancel)
  // Android opens a context menu on a long press; the long press is ours.
  element.addEventListener('contextmenu', (event) => event.preventDefault())
  // Taps are taken from click rather than pointerup, so keyboard and screen-reader activation work too.
  element.addEventListener('click', () => {
    if (fired) fired = false
    else tap()
  })
}
