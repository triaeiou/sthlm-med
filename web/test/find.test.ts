import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build_find_script, compile_query, find_matches } from '../src/core/find.ts'

/** Compile [text] as the find bar would, and find it in [segments] (the text nodes of one block). */
const run = (segments: string[], text: string, regex = false) => {
  // A query that does not compile fails the test here, with the reason in the message.
  const query = compile_query(text, regex)
  assert.equal(query.error, undefined)
  return find_matches(segments, query.source, 1000)
}

test('plain text ignores case and matches any whitespace for spaces', () => {
  // Plain text is found literally (special characters included), ignoring case and spacing differences.
  assert.deepEqual(compile_query('  ', false), { source: '' })
  assert.deepEqual(run(['Warfarin och WARFARIN'], 'warfarin').map((m) => m.start), [[0, 0], [0, 13]])
  assert.equal(run(['Bakjour\n08-1'], 'bakjour 08').length, 1)
  assert.equal(run(['a.b axb (1+2)'], 'a.b').length, 1)
  assert.equal(run(['a.b axb (1+2)'], '(1+2)').length, 1)
  assert.equal(run(['åäö ÅÄÖ'], 'ÅÄÖ').length, 2)
})

test('regular expressions, with ^ and $ at the ends of a block', () => {
  // Regular expressions as typed; ^ and $ anchor at the ends of the block's text.
  assert.deepEqual(run(['Dalen', 'geriatriken'], 'geriatrik(en)?$', true), [{ start: [1, 0], end: [1, 11] }])
  assert.equal(run(['geriatrik 3'], 'geriatrik(en)?$', true).length, 0)
  assert.equal(run(['Farsta, Skarpnäck'], 'fars|skarp', true).length, 2)
  assert.match(compile_query('(unclosed', true).error ?? '', /Invalid regular expression/)
})

test('matches across segments map back to their positions', () => {
  // "war" + "farin" in two text nodes, as <b>war</b>farin, is found as one match.
  assert.deepEqual(run(['Ta war', 'farin nu'], 'warfarin'), [{ start: [0, 3], end: [1, 5] }])
  // A match ending at the end of a segment ends there, not at the start of the next.
  assert.deepEqual(run(['abc', 'def'], 'abc'), [{ start: [0, 0], end: [0, 3] }])
  // Empty segments are passed over.
  assert.deepEqual(run(['ab', '', 'cd'], 'cd'), [{ start: [2, 0], end: [2, 2] }])
})

// An empty match must not loop forever; the limit keeps a query like "e" on a long page fast.
test('skips empty matches and stops at the limit', () => {
  assert.deepEqual(find_matches(['abc'], 'x*', 1000), [])
  assert.equal(find_matches(['a'.repeat(50)], 'A', 10).length, 10)
})

test('the script for a site is valid JavaScript', () => {
  // The functions travel as source text: the script must compile once joined.
  const script = build_find_script({ source: 'a', step: 0 })
  assert.doesNotThrow(() => new Function(`return ${script}`))
  assert.match(script, /^\(function page_find\(/)
})
