import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build_injection_script } from '../src/core/inject.ts'

test('the script embeds the CSS as a JSON string, so quotes and tags cannot break out', () => {
  // The user's extra CSS is untrusted text inside a script: it must stay a string.
  const css = `a::after { content: "</style><script>'" }`
  const script = build_injection_script(css)
  assert.ok(script.includes(JSON.stringify(css)))
  assert.doesNotThrow(() => new Function(script))
})
