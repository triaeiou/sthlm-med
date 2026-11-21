/**
 * Finding text in a page, as a browser's find bar does, with regular expressions. The finding runs in the page
 * searched: a site's page, which gets it as a script (build_find_script()), or the app's own page for its views. So
 * find_matches() and page_find() refer to nothing outside themselves: they are sent to pages as their source text.
 */

export interface FindArgs {
  /** The regular expression to find, as compile_query() gives it; "" removes the highlights. */
  source: string
  /**
   * 1 or -1 to move to the next or previous match, 0 for the same one (or, for a new query, the first in view), each
   * scrolled into view; omitted to only highlight, as when a page has loaded again.
   */
  step?: number
  /** A selector for the element to search in; the page's body by default. */
  root?: string
}

/** What a find in a page came to: how many matches, and which is the current one (-1 for none). */
export interface FindResult {
  count: number
  index: number
  /** True when there were more matches than are shown. */
  capped: boolean
}

/** A match from the start of one segment's text to the end in another (or the same), as [segment, offset]. */
export interface FindMatch {
  start: [number, number]
  end: [number, number]
}

/**
 * The regular expression for what the user typed, "" for nothing to find: the text itself, with any run of spaces
 * matching any whitespace; or, with [regex], the text as a regular expression, and the reason if it is not a valid one.
 */
export function compile_query(text: string, regex: boolean): { source: string; error?: string } {
  /*
   * Plain text is escaped word by word, so what the user types is found literally, and joined by \s+, so "bakjour 08"
   * also matches across a line break or a non-breaking space. Nothing but spaces finds nothing.
   */
  const literal = text.trim().split(/\s+/).map((word) => word.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')).join('\\s+')
  const source = regex && text.trim() ? text : literal
  // Tried here, as find_matches() will use it, to catch a broken regular expression before it is sent to a page.
  try {
    find_matches([], source, 0)
    return { source }
  } catch (error) {
    return { source, error: String(error) }
  }
}

/**
 * The matches of a regular expression in the text of [segments] joined (the text nodes of one block of a page), as
 * positions in the segments; at most [limit], and no empty ones. Self-contained (see the top).
 */
export function find_matches(segments: readonly string[], source: string, limit: number): FindMatch[] {
  /*
   * One regular expression runs over all the text joined, so a match can span text nodes (as "war" + "farin" in
   * <b>war</b>farin). Flags: g for all matches, i to ignore case (å/Å too), m for ^ and $ at line ends as well.
   */
  const pattern = new RegExp(source, 'gim')
  const text = segments.join('')
  // Where each segment starts in the joined text, to map matches back.
  const starts: number[] = []
  let length = 0
  for (const segment of segments) {
    starts.push(length)
    length += segment.length
  }
  /*
   * The [segment, offset] of a place in the joined text: the last segment starting at or before it. An end is
   * exclusive, so an end on a segment's boundary stays in the segment before.
   */
  const position = (offset: number, is_end: boolean): [number, number] => {
    // Walk back from the last segment to the one the place is in.
    let segment = starts.length - 1
    while (segment > 0 && (starts[segment] as number) > offset - (is_end ? 1 : 0)) segment--
    return [segment, offset - (starts[segment] as number)]
  }
  const matches: FindMatch[] = []
  let match: RegExpExecArray | null
  while (matches.length < limit && (match = pattern.exec(text)) !== null) {
    // An empty match (as from "x*") would not advance lastIndex and loop forever; it highlights nothing anyway.
    if (match[0].length === 0) pattern.lastIndex++
    else matches.push({ start: position(match.index, false), end: position(match.index + match[0].length, true) })
  }
  return matches
}

/**
 * Find in the page this runs in: highlight every match of the query, make one the current match, opening any closed
 * <details> or hidden="until-found" it is in, and scroll it into the middle of the view. Text that is not shown is not
 * searched, except collapsed text (in a closed <details>, or hidden until found), which is. A match lies within one
 * block of text (a paragraph, a heading, a table cell). Self-contained (see the top); [find] is find_matches().
 */
export function page_find(find: typeof find_matches, args: FindArgs): FindResult {
  /*
   * Names this leaves in the page: the last find on window (so next and previous continue from the current match), and
   * the CSS highlights. With nothing to find (the bar closed, an empty query, a view not there yet), they are removed.
   */
  const ALL = 'sthlm-med-find'
  const CURRENT = 'sthlm-med-find-current'
  const COLLAPSED = 'details:not([open]), [hidden="until-found"]'
  const state = window as unknown as { __sthlm_med_find?: { source: string; index: number } }
  const root = args.root ? document.querySelector(args.root) : document.body
  if (!args.source || !root) {
    CSS.highlights.delete(ALL)
    CSS.highlights.delete(CURRENT)
    delete state.__sthlm_med_find
    return { count: 0, index: -1, capped: false }
  }

  /*
   * Whether the text of [element] counts: shown, or collapsed inside something shown, as the user expects to find
   * text that one tap would reveal. Text hidden otherwise (scripts, menus not open, the ads the injected CSS hides)
   * is not found.
   */
  const is_shown = (element: Element): boolean => {
    // checkVisibility() is false for collapsed text too, so what collapses it is looked for, and judged by its parent.
    if (element.checkVisibility()) return true
    const collapsed = element.closest(COLLAPSED)
    return !!collapsed && (!collapsed.parentElement || is_shown(collapsed.parentElement))
  }
  /*
   * The page's text nodes, in order, grouped by block: the nearest ancestor that is not inline. Text in the same
   * block runs on (<b>war</b>farin is one word); text in different blocks does not (a heading and the paragraph
   * after it). A textarea's text is left out, as it cannot be highlighted.
   */
  const blocks: Text[][] = []
  let last_block: Element | null = null
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const parent = node.parentElement
    if (!parent || parent.tagName === 'TEXTAREA' || !is_shown(parent)) continue
    let block = parent
    while (block !== root && block.parentElement && getComputedStyle(block).display.startsWith('inline')) block = block.parentElement
    if (block !== last_block) blocks.push([])
    last_block = block
    blocks.at(-1)?.push(node)
  }

  // Matches as ranges, block by block; at most 1000, and the result says when there were more.
  const LIMIT = 1000
  const ranges: Range[] = []
  for (const nodes of blocks) {
    for (const match of find(nodes.map((node) => node.data), args.source, LIMIT - ranges.length)) {
      const range = document.createRange()
      range.setStart(nodes[match.start[0]] as Text, match.start[1])
      range.setEnd(nodes[match.end[0]] as Text, match.end[1])
      ranges.push(range)
    }
  }

  /*
   * Which match is current. The same query as last time moves from the last current match by [step], wrapping around
   * at either end; a new query starts where the user is reading: the first match in view or below it.
   */
  const previous = state.__sthlm_med_find
  let index = -1
  if (ranges.length && previous?.source === args.source && previous.index >= 0) {
    index = (previous.index + (args.step ?? 0) + ranges.length) % ranges.length
  } else if (ranges.length) {
    const top = root === document.body ? 0 : Math.max(0, root.getBoundingClientRect().top)
    const first_in_view = ranges.findIndex((range) => {
      const rect = range.getBoundingClientRect()
      return rect.height > 0 && rect.bottom >= top
    })
    index = Math.max(0, first_in_view)
  }
  state.__sthlm_med_find = { source: args.source, index }

  /*
   * Highlight with the CSS Custom Highlight API: it paints ranges without changing the page's DOM, so the site's
   * scripts and layout are not disturbed, and clearing is just deleting the highlight. The style for it is added once.
   */
  const current = ranges[index]
  if (!document.getElementById('sthlm-med-find-style')) {
    const style = document.createElement('style')
    style.id = 'sthlm-med-find-style'
    style.textContent = `::highlight(${ALL}) { background-color: #ffe066; color: #000; } ::highlight(${CURRENT}) { background-color: #ff8c1a; color: #000; }`
    document.head.appendChild(style)
  }
  CSS.highlights.set(ALL, new Highlight(...ranges))
  CSS.highlights.set(CURRENT, new Highlight(...(current ? [current] : [])))

  /*
   * Bring the current match into view, unless only highlighting was asked for (no step: a page that loaded again
   * should not jump). Collapsed sections around it are opened first, so it has a place on screen to scroll to.
   */
  const element = current?.startContainer.parentElement
  if (current && element && args.step !== undefined) {
    for (let closed = element.closest(COLLAPSED); closed; closed = element.closest(COLLAPSED)) {
      closed.removeAttribute('hidden')
      if (closed instanceof HTMLDetailsElement) closed.open = true
    }
    element.scrollIntoView({ block: 'center', inline: 'nearest' })
    /*
     * In an element taller than the view, the match itself may still be outside it: then the nearest ancestor that
     * scrolls (as the Belport list), else the page itself, is scrolled until the match is in its middle.
     */
    const rect = current.getBoundingClientRect()
    if (rect.top < 0 || rect.bottom > innerHeight) {
      /** Whether [ancestor] scrolls its content up and down. */
      const scrolls = (ancestor: Element) => ancestor.scrollHeight > ancestor.clientHeight && /auto|scroll/.test(getComputedStyle(ancestor).overflowY)
      let scroller = element.parentElement
      while (scroller && !scrolls(scroller)) scroller = scroller.parentElement
      const middle = scroller ? scroller.getBoundingClientRect().top + scroller.clientHeight / 2 : innerHeight / 2
      const target = scroller ?? document.scrollingElement
      target?.scrollBy({ top: rect.top + rect.height / 2 - middle })
    }
  }
  return { count: ranges.length, index, capped: ranges.length >= LIMIT }
}

/**
 * A script that finds in a site's page (page_find()), its value the FindResult. Both functions travel as source text,
 * page_find() called with find_matches() as its [find]: they refer to nothing outside themselves, so they run the same
 * in a site's page as here. args go in as JSON, so a query cannot break out of the script.
 */
export function build_find_script(args: FindArgs): string {
  return `(${page_find.toString()})(${find_matches.toString()}, ${JSON.stringify(args)})`
}
