/** A small helper for building DOM elements: h('div', {class: 'x', onclick}, child, 'text'). */
export type Child = Node | string | number | null | undefined | false | Child[]

type Props = Record<string, unknown>

/**
 * An element [tag] with [props] and [children]. Props: on* functions become event listeners, value/checked/selected
 * are set as properties, anything else is an attribute; null, undefined and false leave a prop out.
 */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props?: Props | null, ...children: Child[]): HTMLElementTagNameMap[K] {
  // Leaving out null, undefined and false props lets callers write { disabled: busy } or { title: maybe }.
  const element = document.createElement(tag)
  for (const [name, value] of Object.entries(props ?? {})) {
    if (value === undefined || value === null || value === false) continue
    if (name.startsWith('on') && typeof value === 'function') {
      // onclick → 'click': a listener, so several can be added and none is serialized into the DOM.
      element.addEventListener(name.slice(2), value as EventListener)
    } else if (name === 'value' || name === 'checked' || name === 'selected') {
      // These are live state, which the attribute only sets initially: set the property so the control shows it.
      Reflect.set(element, name, value)
    } else {
      // true means a boolean attribute that is present, as hidden or open.
      element.setAttribute(name, value === true ? '' : String(value))
    }
  }
  append(element, children)
  return element
}

/** Add [children] to [parent]: nodes as they are, strings and numbers as text, arrays flattened, nothing skipped. */
function append(parent: Node, children: Child[]): void {
  // Text goes in as text nodes, never as HTML, so text from scraped pages cannot inject markup.
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue
    if (Array.isArray(child)) append(parent, child)
    else parent.appendChild(child instanceof Node ? child : document.createTextNode(String(child)))
  }
}

/** The inline SVG icon [name] of ICONS. */
export function icon(name: IconName, class_name = 'icon'): SVGSVGElement {
  // SVG elements must be made in the SVG namespace; createElement would make unknown HTML elements that never draw.
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('class', class_name)
  // Decorative: the button around an icon carries the name for screen readers.
  svg.setAttribute('aria-hidden', 'true')
  // One <path> per '|'-separated part, so an icon can have strokes that are not joined.
  for (const d of ICONS[name].split('|')) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', d)
    svg.appendChild(path)
  }
  return svg
}

/** Line icons as path data in a 24×24 box, the paths of an icon separated by "|". */
const ICONS = {
  calculator:
    'M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z|M8 6h8|M16 14v4|M16 10h.01|M12 10h.01|M8 10h.01|M12 14h.01|M8 14h.01|M12 18h.01|M8 18h.01',
  bed: 'M3 7v11|M3 14h18v4|M21 14v-3a3 3 0 0 0-3-3h-7v6|M7 11.5a1.5 1.5 0 1 0 0-.01',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z|M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.85 1 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
  phone:
    'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z',
  refresh: 'M21 12a9 9 0 1 1-2.64-6.36|M21 3v6h-6',
  external: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6|M15 3h6v6|M10 14 21 3',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z|m21 21-4.35-4.35',
  up: 'm18 15-6-6-6 6',
  down: 'm6 9 6 6 6-6',
  close: 'M18 6 6 18|M6 6l12 12',
} as const

export type IconName = keyof typeof ICONS
