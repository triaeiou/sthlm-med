import { readFileSync } from 'node:fs'

/** Read the app's page with the Android build's version, or the web package version during browser development. */
export function read_index_html() {
  // Both hosts use the same page; escape the version for its quoted HTML attribute.
  const version = process.env.STHLM_MED_VERSION ?? JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version
  const escaped_version = version.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')
  return readFileSync(new URL('../static/index.html', import.meta.url), 'utf8').replace('__APP_VERSION__', escaped_version)
}
