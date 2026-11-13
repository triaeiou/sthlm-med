import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { extract_phones, html_to_text, parse_belport, split_phones } from '../src/core/belport.ts'

const html = readFileSync(new URL('./fixtures/belport-geriatrik.html', import.meta.url), 'utf8')

test('parses the region, care type and every unit of the saved page', () => {
  // The saved page (fixtures/) is a real Belport page: if Belport changes its markup, a new copy fails here first.
  const page = parse_belport(html)
  assert.equal(page.region, 'Stockholms län')
  assert.equal(page.care_type, 'Geriatrik')
  assert.ok(page.units.length >= 10, `only ${page.units.length} units`)
  for (const unit of page.units) {
    assert.ok(unit.name, 'unit without a name')
    assert.match(unit.updated, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/, `${unit.name}: updated ${unit.updated}`)
  }
})

test('reads beds, the bakjour number, message and area of a unit', () => {
  // One unit checked field by field: the bakjour number is what the view's main button dials.
  const dalen = parse_belport(html).units.find((unit) => unit.name === 'Dalengeriatriken')
  assert.ok(dalen)
  assert.deepEqual(dalen.bakjour, { label: 'Bakjour', number: '08-58700030', tel: 'tel:0858700030' })
  // Rows hidden on the page (MRSA, Tilläggsuppdrag) are left out.
  assert.deepEqual(dalen.categories, [{ label: 'Geriatrik', kind: 'normal', available: 153, free: 3, waiting: 1 }])
  assert.equal(dalen.free, 3)
  assert.match(dalen.message, /^Vänligen ring bakjour/)
  assert.match(dalen.area, /Södermalm/)
})

test('tells MRSA beds from ordinary ones and adds up free beds', () => {
  // Sabbatsberg is the unit of the saved page with an MRSA row shown; its totals sort the list.
  const units = parse_belport(html).units
  const sabbatsberg = units.find((unit) => unit.name === 'Sabbatsbergsgeriatriken')
  assert.ok(sabbatsberg)
  assert.deepEqual(sabbatsberg.categories, [
    { label: 'Geriatrik', kind: 'normal', available: 87, free: 4, waiting: 2 },
    { label: 'MRSA platser', kind: 'mrsa', available: 7, free: 3, waiting: 0 },
  ])
  assert.equal(sabbatsberg.free, 7)
  // An empty cell is unknown, not zero.
  const lowet = units.find((unit) => unit.name === 'Löwetgeriatriken')
  assert.equal(lowet?.categories[0]?.waiting, null)
})

test('labels the numbers of a phone line', () => {
  // Phone lines as units write them: numbers in several formats, labels before them, times that are not numbers.
  assert.deepEqual(extract_phones('Tel: Intag ssk 08-58700018. Bakjour 08-58700030.'), [
    { label: 'Intag ssk', number: '08-58700018', tel: 'tel:0858700018' },
    { label: 'Bakjour', number: '08-58700030', tel: 'tel:0858700030' },
  ])
  assert.deepEqual(
    extract_phones('Tel: Bakjour vardagar 8-16.30: 0736-88 43 88. Jourtid till kl 21: via DS-växel: 08-123 550 00').map((p) => [p.label, p.tel]),
    [['Bakjour vardagar 8-16.30', 'tel:0736884388'], ['Jourtid till kl 21: via DS-växel', 'tel:0812355000']],
  )
  assert.deepEqual(
    extract_phones('Tel: Bakjour: 08-714 68 17, bemannad dygnet runt. Intagningssköterska: 08-714 68 22 dagtid.').map((p) => [p.label, p.number]),
    [['Bakjour', '08-714 68 17'], ['Intagningssköterska', '08-714 68 22']],
  )
  assert.deepEqual(extract_phones('Ring +46 8 123 550 00').map((p) => p.tel), ['tel:+46812355000'])
})

// Times, dates and room numbers look like digits too, and must not become call buttons.
test('ignores times, dates and short numbers', () => {
  assert.deepEqual(extract_phones('vardagar kl. 07.00-08.00, Uppdaterad: 2026-11-11 09:17, avd 32, kl 21'), [])
})

test('splits text around phone numbers', () => {
  // The message text keeps its words; only the number becomes a link.
  const parts = split_phones('Ring bakjour på tel. 08-714 68 17 innan.')
  assert.equal(parts.length, 3)
  assert.equal(parts[0], 'Ring bakjour på tel. ')
  assert.equal(typeof parts[1] === 'object' && parts[1].tel, 'tel:087146817')
  assert.equal(parts[2], ' innan.')
})

// Belport writes å, ä and ö both as named and as numeric entities.
test('decodes entities', () => {
  assert.equal(html_to_text('V&#228;lj <b>l&auml;n</b>&nbsp;&#xE4;<br/>x'), 'Välj län ä x')
})
