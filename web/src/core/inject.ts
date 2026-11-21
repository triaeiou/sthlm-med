/**
 * The script a host runs at document start in a site's pages to add the site's CSS: page_add_css() below, sent as its
 * source text, so it is type-checked here like any other code. It therefore must not refer to anything outside itself.
 */
export function build_injection_script(css: string): string {
  // The CSS goes in as a JSON string literal: whatever it contains (quotes, "</style>") cannot break out of it.
  return `(${page_add_css.toString()})(${JSON.stringify(css)})`
}

/** Runs in a site's page: add [css] in a <style id="sthlm-med-css">, and keep it there. Self-contained (see above). */
export function page_add_css(css: string): void {
  /*
   * At document start there is no <head> yet, so the style goes under <html> first. Any change to the document then
   * puts it back where it belongs: into <head> once there is one, and again if the page replaces its <head> or removes
   * the style, as single-page apps do.
   */
  const style = document.createElement('style')
  style.id = 'sthlm-med-css'
  style.textContent = css
  /** Put the style in <head>, or in <html> before there is one, unless it is there. */
  const place = () => {
    const parent = document.head ?? document.documentElement
    if (style.parentNode !== parent) parent.appendChild(style)
  }
  place()
  new MutationObserver(place).observe(document.documentElement, { childList: true, subtree: true })
}
