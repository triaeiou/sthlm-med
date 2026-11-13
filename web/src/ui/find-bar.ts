import { compile_query, type FindArgs, type FindResult } from '../core/find.ts'
import { h, icon } from './dom.ts'

export const FIND_HEIGHT = 52
const DEBOUNCE_MS = 150
const REGEX_KEY = 'swemed.find.regex'

export interface FindBarActions {
  /** Find in whatever is searched now: the active site, or the view open. */
  run(args: FindArgs): Promise<FindResult>
  /** Make ready for typing in this page (the host's input focus), before the input is focused. */
  focus_page(): Promise<void>
  /** The bar's close button was pressed. */
  close(): void
}

/**
 * The find bar above the toolbar: what to find, whether it is a regular expression, how many matches there are, and
 * buttons for the previous and next match. It finds as the user types; Enter goes to the next match, Shift+Enter to
 * the previous.
 */
export class FindBar {
  readonly element: HTMLElement
  private input: HTMLInputElement
  private regex_button: HTMLButtonElement
  private counter: HTMLElement
  /** Whether the query is a regular expression; remembered across starts. */
  private regex = localStorage.getItem(REGEX_KEY) === '1'
  private timer: ReturnType<typeof setTimeout> | undefined
  /** The number of the latest search, so that an older one's late result is ignored. */
  private sequence = 0
  private actions: FindBarActions

  /** A find bar, hidden until open(), which finds through [actions]. */
  constructor(actions: FindBarActions) {
    /*
     * The query input: no autocorrect or capitals, which would change drug names and regular expressions; the
     * keyboard's action key says "search". Typing searches after a pause (not for every letter); Enter steps.
     */
    this.actions = actions
    this.input = h('input', {
      class: 'find-input',
      type: 'text',
      placeholder: 'Sök på sidan',
      enterkeyhint: 'search',
      autocomplete: 'off',
      autocapitalize: 'off',
      spellcheck: 'false',
      'aria-label': 'Sök på sidan',
      oninput: () => {
        clearTimeout(this.timer)
        this.timer = setTimeout(() => this.search(0), DEBOUNCE_MS)
      },
      onkeydown: (event: KeyboardEvent) => {
        if (event.key !== 'Enter') return
        event.preventDefault()
        this.search(event.shiftKey ? -1 : 1)
      },
    })
    // A toggle (aria-pressed) between plain text and regular expressions.
    this.regex_button = h('button', {
      class: 'find-regex',
      type: 'button',
      title: 'Reguljärt uttryck',
      'aria-pressed': String(this.regex),
      onclick: () => this.toggle_regex(),
    }, '.*')
    // "3/12": read out by screen readers as it changes.
    this.counter = h('span', { class: 'find-count', 'aria-live': 'polite' })
    this.element = h('div', { class: 'find-bar', role: 'search', hidden: true },
      this.input,
      this.regex_button,
      this.counter,
      h('button', { class: 'icon-button small', type: 'button', title: 'Föregående', onclick: () => this.search(-1) }, icon('up')),
      h('button', { class: 'icon-button small', type: 'button', title: 'Nästa', onclick: () => this.search(1) }, icon('down')),
      h('button', { class: 'icon-button small', type: 'button', title: 'Stäng sökningen', onclick: () => actions.close() }, icon('close')))
  }

  /** Whether the bar is showing. */
  get is_open(): boolean {
    return !this.element.hidden
  }

  /** Show the bar with the last query selected, so typing replaces it. */
  open(): void {
    /*
     * Focus at once (enough in a browser), and again once the host has given this page the input focus (needed on
     * Android for the keyboard to open).
     */
    this.element.hidden = false
    /** Put the cursor in the input, with its text selected. */
    const focus = () => {
      // Not if the bar was closed while the host was asked.
      if (!this.is_open) return
      this.input.focus()
      this.input.select()
    }
    focus()
    this.actions.focus_page().then(focus, focus)
  }

  /** Hide the bar. The highlights it made are the caller's to remove. */
  close(): void {
    // Cancel a pending search, and make any result still on its way stale, so it cannot write to the hidden bar.
    clearTimeout(this.timer)
    this.sequence++
    this.element.hidden = true
    this.input.blur()
    this.counter.textContent = ''
  }

  /**
   * If the bar is open, highlight and count the query's matches again, without scrolling (no step), in what is searched
   * now: another site, or a page that has changed.
   */
  refresh(): void {
    if (this.is_open) this.search(undefined)
  }

  /** Switch between plain text and regular expressions, and search again with the same text. */
  private toggle_regex(): void {
    // The choice shows on the button, and is stored for the next start.
    this.regex = !this.regex
    this.regex_button.setAttribute('aria-pressed', String(this.regex))
    localStorage.setItem(REGEX_KEY, this.regex ? '1' : '')
    // Back to the input, so the keyboard stays up for editing the query.
    this.search(0)
    this.input.focus()
  }

  /** Search for the input's text in what is searched now, and show the count. [step]: see FindArgs. */
  private search(step: number | undefined): void {
    /*
     * This search replaces one waiting for typing to pause. Searches can also overlap (a site's page answers
     * asynchronously): each gets a number, and only the latest one's result is shown, so a slow answer to an old query
     * never overwrites a newer count.
     */
    clearTimeout(this.timer)
    const sequence = ++this.sequence
    // A broken regular expression is marked on the input, with the reason as its tooltip, and not searched.
    const query = compile_query(this.input.value, this.regex)
    this.input.classList.toggle('invalid', !!query.error)
    this.input.title = query.error ?? ''
    if (query.error) {
      this.counter.textContent = 'Fel'
      return
    }
    // An empty query is run too: it removes the highlights. With no match the count reads "0/0", in red.
    this.actions.run({ source: query.source, step }).then(
      (result) => {
        if (sequence !== this.sequence) return
        this.counter.textContent = query.source ? `${result.index + 1}/${result.count}${result.capped ? '+' : ''}` : ''
        this.counter.classList.toggle('none', !!query.source && !result.count)
      },
      (error: unknown) => {
        if (sequence !== this.sequence) return
        this.counter.textContent = '–'
        console.error('find', error)
      },
    )
  }
}
