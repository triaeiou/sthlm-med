import type { Host, HostEvent, HostSite, ShellMode } from './host.ts'

/**
 * The Android host: messages to and from the app (android/, ShellBridge.kt) over the "swemed" channel, which the app
 * adds to this page only, before its scripts run. A request is {id, method, params}; its reply {id, result} or
 * {id, error}; an event {event, params}.
 */
export interface Channel {
  postMessage(message: string): void
  onmessage: ((event: MessageEvent<string>) => void) | null
}

declare global {
  interface Window {
    /** The Android app's message channel; undefined when the page runs elsewhere (a browser). */
    swemed?: Channel
  }
}

export class AndroidHost implements Host {
  readonly kind = 'android'
  private next_id = 1
  private pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>()
  private handler: (event: HostEvent) => void = () => {}
  private channel: Channel

  /** Every message from the app (replies and events) comes through this one handler. */
  constructor(channel: Channel) {
    this.channel = channel
    channel.onmessage = (message) => this.receive(JSON.parse(message.data))
  }

  /** The app reads config.json off the UI thread and replies with its text, or null before the first save. */
  async load_config(): Promise<string | null> {
    return (await this.request('config.load')).json
  }

  /** Awaited, so a failed write shows in settings instead of passing as saved. */
  async save_config(json: string): Promise<void> {
    await this.request('config.save', { json })
  }

  /** The app compares the list with its views, so sending the same list again changes nothing. */
  set_sites(sites: readonly HostSite[]): void {
    this.post('sites.set', { sites })
  }

  /** Fire and forget: showing a view is immediate in the app, and nothing here waits on it. */
  show_site(id: string): void {
    this.post('site.show', { id })
  }

  /** The app loads [url] in the site's view, or scrolls to its top if it is there already. */
  navigate_site(id: string, url: string): void {
    this.post('site.navigate', { id, url })
  }

  /** The script's value comes back as JSON text (evaluateJavascript's format). */
  async evaluate_in_site(id: string, script: string): Promise<unknown> {
    return JSON.parse((await this.request('site.evaluate', { id, script })).json)
  }

  /** The height is in CSS pixels, which the app takes as dp: this page's text zoom is fixed at 100%. */
  set_shell_mode(mode: ShellMode): void {
    this.post('shell.mode', mode)
  }

  /**
   * Only the app can move Android's input focus to this page's view (a page's focus() cannot), and without it the
   * keyboard would not open for an input here. Resolved once the app has done so, so the caller focuses after.
   */
  async focus_page(): Promise<void> {
    await this.request('shell.focus')
  }

  /** Fetched by the app, outside this page, so CORS does not apply; an HTTP error status is an error. */
  async fetch_text(url: string): Promise<string> {
    return (await this.request('fetch.text', { url })).text
  }

  /** The app starts the dialler for tel:, else the app handling the URL; it shows a message when there is none. */
  open_external(url: string): void {
    this.post('open.external', { url })
  }

  /**
   * A short vibration from the app's view; the page's navigator.vibrate needs a permission the app does not ask for.
   */
  haptic(): void {
    this.post('haptic')
  }

  /** One listener (the app); a later call replaces it. */
  on_event(handler: (event: HostEvent) => void): void {
    this.handler = handler
  }

  /** Send a request to the app; resolved with its result, or rejected with its error. */
  private request(method: string, params: object = {}): Promise<any> {
    // Each request gets its own id, which the reply carries back, so replies can come in any order.
    const id = this.next_id++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.channel.postMessage(JSON.stringify({ id, method, params }))
    })
  }

  /** A request whose reply nobody waits for. Errors still arrive as replies; logging keeps them visible. */
  private post(method: string, params: object = {}): void {
    this.request(method, params).catch((error: unknown) => console.error(method, error))
  }

  /** A message from the app: a reply (with the id of a request) or an event (with a name). */
  private receive(message: any): void {
    // An event becomes a HostEvent: its name as the type, with its params.
    if (message.event) return this.handler({ type: message.event, ...message.params })
    // A reply settles the request waiting for it.
    const waiting = this.pending.get(message.id)
    this.pending.delete(message.id)
    if (message.error !== undefined) waiting?.reject(new Error(message.error))
    else waiting?.resolve(message.result)
  }
}
