import type { IconName } from '../ui/dom.ts'
import { SITES } from './sites.ts'

/**
 * The toolbar's items. A site shows its page, a view is one of the app's own (Belport, settings), and a group opens a
 * popout menu of sites. Which items there are is built in (DEFAULT_MENU); the config only puts them in order.
 */
export type ViewId = 'belport' | 'settings'

export type MenuItem = { kind: 'site'; id: string } | { kind: 'view'; id: ViewId } | { kind: 'group'; id: string }

export interface ViewDef {
  id: ViewId
  name: string
  icon: IconName
}

export interface GroupDef {
  id: string
  name: string
  icon: IconName
  /** The sites in its popout menu, in order. */
  sites: string[]
}

export const VIEWS: readonly ViewDef[] = [
  { id: 'belport', name: 'Belport – lediga vårdplatser', icon: 'bed' },
  { id: 'settings', name: 'Inställningar', icon: 'settings' },
]

export const GROUPS: readonly GroupDef[] = [
  { id: 'calculators', name: 'Kalkylatorer', icon: 'calculator', sites: ['abgbench', 'im_kalkylatorer'] },
]

export const DEFAULT_MENU: readonly MenuItem[] = [
  { kind: 'site', id: 'kunskapsstod' },
  { kind: 'site', id: 'giftinformation' },
  { kind: 'site', id: 'fass' },
  { kind: 'site', id: 'janusinfo' },
  { kind: 'site', id: 'internetmedicin' },
  { kind: 'group', id: 'calculators' },
  { kind: 'view', id: 'belport' },
  { kind: 'view', id: 'settings' },
]

/**
 * A key naming an item uniquely, such as "site:fass". Ids are unique only within a kind, so the kind is part of it.
 */
export function item_key(item: MenuItem): string {
  return `${item.kind}:${item.id}`
}

/** An item's name, as tooltips, popout menus and settings show it. */
export function item_name(item: MenuItem): string {
  // All three kinds of definition have an id and a name; an item without a definition shows its id.
  const defs: ReadonlyArray<{ id: string; name: string }> = item.kind === 'site' ? SITES : item.kind === 'view' ? VIEWS : GROUPS
  return defs.find((def) => def.id === item.id)?.name ?? item.id
}

/** The sites an item stands for: the site itself, a group's sites, or none for a view. */
export function item_sites(item: MenuItem): string[] {
  if (item.kind === 'site') return [item.id]
  return item.kind === 'group' ? GROUPS.find((group) => group.id === item.id)?.sites ?? [] : []
}
