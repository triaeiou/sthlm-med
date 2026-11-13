import assert from 'node:assert/strict'
import { test } from 'node:test'
import { default_config, enabled_site_ids, parse_config } from '../src/core/config.ts'
import { DEFAULT_MENU, item_key, item_sites } from '../src/core/menu.ts'
import { find_site, site_hosts, SITES } from '../src/core/sites.ts'

test('every built-in site is on the toolbar or in a menu, once', () => {
  // A site left out would never show; a site named in the menu but not built in would have no page.
  assert.deepEqual(DEFAULT_MENU.flatMap(item_sites).sort(), SITES.map((site) => site.id).sort())
})

test('defaults: every site enabled at its start page, Kunskapsstöd first', () => {
  // The first start, with no config file: everything on, the documented start pages, the calculators in their menu.
  const config = default_config()
  assert.equal(config.startup, 'kunskapsstod')
  assert.equal(config.sites.fass?.url, 'https://fass.se/health')
  assert.equal(config.sites.giftinformation?.url, 'https://giftinformation.se/lakare/')
  assert.deepEqual(enabled_site_ids(config), ['kunskapsstod', 'giftinformation', 'fass', 'janusinfo', 'internetmedicin', 'abgbench', 'im_kalkylatorer'])
  assert.equal(item_key(config.menu.at(-1)!), 'view:settings')
})

test('missing or broken JSON gives the defaults', () => {
  // A damaged config file must never stop the app from starting.
  assert.deepEqual(parse_config(null), default_config())
  assert.deepEqual(parse_config('{nope'), default_config())
  assert.deepEqual(parse_config('[1,2]'), default_config())
  assert.deepEqual(parse_config('{"sites":7,"menu":[null,3],"startup":{}}'), default_config())
})

test('keeps valid stored values and drops invalid ones', () => {
  // Stored values are checked one by one: a javascript: URL or an unknown site never reaches a view.
  const config = parse_config(JSON.stringify({
    startup: 'fass',
    sites: {
      fass: { url: 'https://fass.se/health/search', enabled: true, extra_css: 'h1{color:red}' },
      janusinfo: { url: 'javascript:alert(1)', enabled: false },
      gone: { url: 'https://example.com' },
    },
  }))
  assert.equal(config.startup, 'fass')
  assert.deepEqual(config.sites.fass, { url: 'https://fass.se/health/search', enabled: true, extra_css: 'h1{color:red}' })
  assert.deepEqual(config.sites.janusinfo, { url: 'https://janusinfo.se/', enabled: false, extra_css: '' })
  assert.equal('gone' in config.sites, false)
})

// The app must start on a site that is shown.
test('a disabled startup site falls back to the first enabled one', () => {
  const config = parse_config(JSON.stringify({ startup: 'kunskapsstod', sites: { kunskapsstod: { enabled: false } } }))
  assert.equal(config.startup, 'giftinformation')
})

test('stored menu order is kept; unknown items ignored; items it lacks added before Settings', () => {
  // Updates add sites, views and menus; a user's order must survive them, with new items placed before Settings.
  const config = parse_config(JSON.stringify({
    menu: [{ kind: 'site', id: 'fass' }, { kind: 'site', id: 'nope' }, { kind: 'site', id: 'fass' }, { kind: 'view', id: 'settings' }],
  }))
  assert.deepEqual(config.menu.map(item_key), [
    'site:fass', 'site:kunskapsstod', 'site:giftinformation', 'site:janusinfo', 'site:internetmedicin', 'group:calculators', 'view:belport', 'view:settings',
  ])
  // A stored order is a full one once saved, and then kept as it is.
  const moved = ['view:belport', 'group:calculators', 'site:fass', 'view:settings', 'site:janusinfo', 'site:internetmedicin', 'site:kunskapsstod', 'site:giftinformation']
  const stored = { menu: moved.map((key) => ({ kind: key.split(':')[0], id: key.split(':')[1] })) }
  assert.deepEqual(parse_config(JSON.stringify(stored)).menu.map(item_key), moved)
})

// Sites redirect between www. and bare hosts: both are the site, as is a start page the user has set elsewhere.
test('a site is the hosts of its start page and its default page, without www', () => {
  const im = find_site('internetmedicin')!
  assert.deepEqual(site_hosts(im, im.default_url), ['internetmedicin.se'])
  assert.deepEqual(site_hosts(im, 'https://Example.org:8443/x'), ['example.org', 'internetmedicin.se'])
})
