// Copy the page, stylesheet and icons next to the compiled scripts in dist/, which the Android build bundles.
import { cpSync, writeFileSync } from 'node:fs'
import { read_index_html } from './index-html.mjs'

// Recursive, so folders such as icons/ come along; files already there are overwritten.
cpSync(new URL('../static/', import.meta.url), new URL('../dist/', import.meta.url), { recursive: true })
writeFileSync(new URL('../dist/index.html', import.meta.url), read_index_html())
