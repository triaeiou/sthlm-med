// Copy the page, stylesheet and icons next to the compiled scripts in dist/, which the Android build bundles.
import { cpSync } from 'node:fs'

// Recursive, so folders such as icons/ come along; files already there are overwritten.
cpSync(new URL('../static/', import.meta.url), new URL('../dist/', import.meta.url), { recursive: true })
