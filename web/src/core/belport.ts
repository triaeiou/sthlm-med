/**
 * Reads Belport's page of beds (medscinet.com/Belport/default.aspx), which is server-rendered HTML: a table where each
 * unit is a header row with its name and phone numbers, then rows per kind of bed (available, free, waiting
 * referrals), "Uppdaterad", "Meddelande" and "Geografiskt ansvarsområde". Parsed from the HTML text, without a DOM, so
 * it runs anywhere and in tests.
 */
/**
 * The page read: Stockholms län, geriatrics. Fixed, as the parser follows this page's layout; Belport's pages for other
 * regions and care types are laid out differently.
 */
export const BELPORT_URL = 'https://www.medscinet.com/Belport/default.aspx?lan=00&avd=6'

export interface BelportPage {
  /** The region and care type the page shows, such as "Stockholms län" and "Geriatrik". */
  region: string
  care_type: string
  units: BelportUnit[]
}

export interface BelportUnit {
  name: string
  /** The numbers of the unit's phone line, such as "Tel: Intag ssk 08-58700018. Bakjour 08-58700030." */
  phones: Phone[]
  /** The bakjour's number, or another on-call number when no bakjour is named. */
  bakjour: Phone | null
  categories: BedCategory[]
  /** Free beds over all categories shown. */
  free: number
  /** As written on the page, such as "2026-11-11 09:17". */
  updated: string
  message: string
  area: string
}

export interface BedCategory {
  label: string
  /** Ordinary beds of the unit's care type, beds for MRSA patients, or another kind (such as a special assignment). */
  kind: BedKind
  available: number | null
  free: number | null
  waiting: number | null
}

export type BedKind = 'normal' | 'mrsa' | 'other'

export interface Phone {
  /** What the text calls the number, such as "Bakjour" or "Intag ssk"; empty when it says nothing. */
  label: string
  /** The number as written. */
  number: string
  /** A tel: URL with the digits. */
  tel: string
}

/** The region, care type and units of Belport's page [html]; what it cannot find is left empty. */
export function parse_belport(html: string): BelportPage {
  /*
   * The headings above the table, told apart by their inline styles: the care type's is the bold one with a colour.
   * Matching on markup this specific is fragile, but the page has no ids or classes there.
   */
  const page: BelportPage = {
    region: heading_text(html, /<span style="font-size: 15px; font-weight: bold;">([\s\S]*?)<\/span>/),
    care_type: heading_text(html, /<span style="font-size: 15px; font-weight: bold; color:[^"]*">([\s\S]*?)<\/span>/),
    units: [],
  }
  // Only the table body has units; the <thead> and the rest of the page are cut off.
  const start = html.indexOf('<tbody')
  if (start < 0) return page
  const end = html.indexOf('</tbody>', start)
  const body = html.slice(start, end < 0 ? undefined : end)

  /*
   * The rows come in runs, one run per unit: a header row starts a unit, and the rows after it (bed categories,
   * "Uppdaterad", "Meddelande", area) belong to it, until the next header. So [unit] is the unit being read.
   * Regular expressions are enough for this regular, server-generated table, and need no DOM (tests run in Node).
   */
  let unit: BelportUnit | null = null
  for (const [, attributes = '', content = ''] of body.matchAll(/<tr([^>]*)>([\s\S]*?)<\/tr>/g)) {
    // Each cell's attributes (rightSide marks a category row), its HTML (for the header's spans) and its plain text.
    const cells = [...content.matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/g)].map((match) => ({
      attributes: match[1] ?? '',
      html: match[2] ?? '',
      text: html_to_text(match[2] ?? ''),
    }))
    const first = cells[0]
    if (!first) continue
    // A unit's header row: its name in span.dataheader, its phone line in a <font> after it.
    const header = /<span class="dataheader">([\s\S]*?)<\/span>/.exec(first.html)
    if (header) {
      const phones = extract_phones(html_to_text(/<font[^>]*>([\s\S]*?)<\/font>/.exec(first.html)?.[1] ?? ''))
      unit = { name: html_to_text(header[1] ?? ''), phones, bakjour: pick_bakjour(phones), categories: [], free: 0, updated: '', message: '', area: '' }
      page.units.push(unit)
      continue
    }
    // Rows before the first header (none, on the pages seen) have no unit to go to.
    if (!unit) continue
    // The other rows are told apart by the label in their first cell.
    const label = first.text
    if (label.startsWith('Uppdaterad:')) unit.updated = label.slice('Uppdaterad:'.length).trim()
    else if (label.startsWith('Meddelande:')) unit.message = cells[1]?.text ?? ''
    else if (label.startsWith('Geografiskt ansvarsområde:')) unit.area = cells[1]?.text ?? ''
    else if (/id="rightSide"/.test(first.attributes) && !/display:\s*none/.test(attributes)) {
      /*
       * A category of beds: available, free and waiting, in cells 1 to 3. Rows the page hides (display: none) are
       * categories the unit does not have, with zeros, so they are skipped like the page skips them.
       */
      const category_label = label.replace(/:\s*$/, '')
      const category: BedCategory = {
        label: category_label,
        kind: bed_kind(category_label, page.care_type),
        available: number(cells[1]?.text),
        free: number(cells[2]?.text),
        waiting: number(cells[3]?.text),
      }
      unit.categories.push(category)
      // The unit's total of free beds, which the view sorts on.
      unit.free += category.free ?? 0
    }
  }
  return page
}

/** Swedish phone numbers, as "08-587 000 18", "0736-88 43 88" or "+46 8 123 550 00", with 7 to 10 digits. */
const PHONE = /(?:\+46[\s-]?|(?<![\d.:])0)\d{1,4}(?:[\s-]?\d{1,4}){1,4}/g

/**
 * The phone numbers in a text, each with the words before it that say what it is: the text since the previous number
 * or sentence, without "Tel:" or a trailing colon.
 */
export function extract_phones(text: string): Phone[] {
  /*
   * PHONE finds candidates loosely (units write numbers in many ways); the digit count then sorts out what is not a
   * phone number, such as a date or a time range like "8-16.30". Swedish numbers have 6 to 9 digits after the
   * leading 0 or +46.
   */
  const phones: Phone[] = []
  let previous_end = 0
  for (const match of text.matchAll(PHONE)) {
    const number = match[0].trim()
    const digits = number.replace(/\D/g, '')
    const national = number.startsWith('+46') ? digits.slice(2) : digits.slice(1)
    if (national.length < 6 || national.length > 9) continue
    // The label is in the text between the previous number and this one, e.g. "Bakjour" in "…18. Bakjour 08-…".
    const before = text.slice(previous_end, match.index)
    previous_end = match.index + match[0].length
    // tel: takes digits only; a leading + is kept so international numbers dial right.
    phones.push({ label: label_of(before), number, tel: `tel:${number.startsWith('+') ? '+' : ''}${digits}` })
  }
  return phones
}

/** Text split into plain parts and phone numbers, for showing the numbers as links. */
export function split_phones(text: string): Array<string | Phone> {
  /*
   * Walk the text from number to number: the text before each number is kept as it is, and the number becomes a
   * Phone, which the view draws as a link. [at] is where the text not yet taken starts.
   */
  const parts: Array<string | Phone> = []
  let at = 0
  for (const phone of extract_phones(text)) {
    const index = text.indexOf(phone.number, at)
    if (index < 0) continue
    if (index > at) parts.push(text.slice(at, index))
    parts.push(phone)
    at = index + phone.number.length
  }
  // Whatever follows the last number.
  if (at < text.length) parts.push(text.slice(at))
  return parts
}

/** What the text before a number calls it: its last sentence or clause, without "Tel:", "och" and colons. */
function label_of(before: string): string {
  // The last clause only: "Intag ssk 08-…. Bakjour " should give "Bakjour", not the whole line.
  const sentence = before.split(/[.,;]\s+|\.\s*$/).filter((part) => part.trim()).pop() ?? ''
  // Then strip the words that only introduce a number, at either end.
  return sentence
    .replace(/^\s*[.,;]?\s*/, '')
    .replace(/^tel\.?:?\s*/i, '')
    .replace(/^(?:och|samt|eller)\s+/i, '')
    .replace(/\s*(?:på\s+)?tel\.?\s*$/i, '')
    .replace(/[\s:]+$/, '')
    .trim()
}

/** MRSA beds by their label; the care type's own beds ("Geriatrik" on the geriatrics page) as normal; else other. */
function bed_kind(label: string, care_type: string): BedKind {
  // By name, as the page marks categories in no other way: "MRSA platser", or the care type's name for ordinary beds.
  if (/mrsa/i.test(label)) return 'mrsa'
  if (!care_type || label.toLowerCase() === care_type.toLowerCase()) return 'normal'
  return 'other'
}

/**
 * The number to call for a referral: the one labelled bakjour, else another on-call ("jour") number, else none. Units
 * label their on-call doctor differently ("Bakjour", "Ger-jour", "Jourtid"); bakjour is preferred.
 */
function pick_bakjour(phones: Phone[]): Phone | null {
  return phones.find((phone) => /bakjour/i.test(phone.label)) ?? phones.find((phone) => /jour/i.test(phone.label)) ?? null
}

/**
 * A cell's number, or null for an empty or non-numeric cell (the page leaves cells empty for unknown). Digits only:
 * Number('') would be 0, which would wrongly read an empty cell as zero beds.
 */
function number(text: string | undefined): number | null {
  const value = text?.trim()
  return value && /^\d+$/.test(value) ? Number(value) : null
}

/**
 * The text of the first match of [pattern]'s group in [html], or "". Missing headings give "", so a changed page still
 * parses its units.
 */
function heading_text(html: string, pattern: RegExp): string {
  return html_to_text(pattern.exec(html)?.[1] ?? '')
}

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—',
  aring: 'å', auml: 'ä', ouml: 'ö', Aring: 'Å', Auml: 'Ä', Ouml: 'Ö', eacute: 'é', uuml: 'ü',
}

/** The text of an HTML fragment: tags dropped, <br> as a space, entities decoded, whitespace collapsed. */
export function html_to_text(html: string): string {
  /*
   * In this order: <br> becomes a space (before tags are dropped, or words on both sides would join), tags go, then
   * entities are decoded (after tags are dropped, so a decoded "&lt;" cannot become a tag), and whitespace is
   * collapsed, as a browser shows it.
   */
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, name: string) => {
      // Numeric entities (&#228; or &#xE4;) decode to their code point; named ones from ENTITIES; unknown ones stay.
      if (name[0] === '#') {
        const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10)
        return Number.isFinite(code) ? String.fromCodePoint(code) : entity
      }
      return ENTITIES[name] ?? entity
    })
    .replace(/\s+/g, ' ')
    .trim()
}
