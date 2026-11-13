import { default_config, enabled_site_ids, is_web_url, type AppConfig } from '../core/config.ts'
import { item_name, item_sites, type MenuItem } from '../core/menu.ts'
import { find_site } from '../core/sites.ts'
import { h, icon, type Child } from './dom.ts'

export interface SettingsActions {
  /** Store and apply [config]. */
  save(config: AppConfig): Promise<void>
  close(): void
}

/**
 * Settings: start page, each site's start URL, whether it shows and its extra CSS, and the toolbar's order. Edits a
 * copy; Spara applies it.
 */
export function render_settings(config: AppConfig, actions: SettingsActions): HTMLElement {
  /*
   * The view edits [draft], a copy of the config, and is drawn again from it after each structural change (a site
   * turned off, an item moved). Text typed into fields goes into the draft directly, without a redraw, so typing is
   * never interrupted. Nothing reaches the app until Spara.
   */
  let draft = structuredClone(config)
  const root = h('section', { class: 'view settings' })
  // Kept across redraws, so a message stays visible after one.
  const status = h('p', { class: 'status', role: 'status' })

  /** Draw the whole view from [draft]. */
  const render = () => {
    // A redraw replaces every element: put the focus back where it was (fields have ids for this).
    const focused_id = document.activeElement?.id
    root.replaceChildren(
      h('header', { class: 'view-header' },
        h('h1', null, 'Inställningar'),
        h('button', { class: 'icon-button', type: 'button', title: 'Stäng', onclick: actions.close }, icon('close'))),
      h('div', { class: 'view-body' },
        // Only sites that are shown can be the one the app starts on.
        h('label', { class: 'field' },
          h('span', null, 'Startsida när appen öppnas'),
          h('select', { id: 'startup', onchange: (event: Event) => (draft.startup = (event.target as HTMLSelectElement).value) },
            enabled_site_ids(draft).map((id) => h('option', { value: id, selected: id === draft.startup }, find_site(id)?.name)))),
        h('h2', null, 'Verktygsfältet'),
        h('p', { class: 'hint' }, 'Ordning och synlighet. Håll inne en webbplats ikon i verktygsfältet för att gå till dess startsida.'),
        h('ol', { class: 'menu-list' }, draft.menu.map(menu_row)),
        status,
        h('div', { class: 'actions' },
          h('button', { class: 'button primary', type: 'button', onclick: save }, 'Spara'),
          h('button', { class: 'button', type: 'button', onclick: reset }, 'Återställ allt'))))
    if (focused_id) document.getElementById(focused_id)?.focus()
  }

  /** A toolbar item's row: its order buttons by a site's checkbox or a view's or menu's name; a menu's sites follow. */
  const menu_row = (item: MenuItem, index: number) => {
    /** Move the item [by] places in the toolbar order. */
    const move = (by: number) => {
      // Taken out and put back in at its new place; then a redraw shows the new order.
      const [moved] = draft.menu.splice(index, 1)
      if (moved) draft.menu.splice(index + by, 0, moved)
      render()
    }
    // The buttons that would move the first or last item out of the list are disabled.
    const order = h('span', { class: 'order' },
      h('button', { class: 'icon-button small', type: 'button', title: 'Flytta upp', disabled: index === 0, onclick: () => move(-1) }, icon('up')),
      h('button', { class: 'icon-button small', type: 'button', title: 'Flytta ned', disabled: index === draft.menu.length - 1, onclick: () => move(1) }, icon('down')))
    if (item.kind === 'site') return h('li', { class: 'menu-row' }, site_editor(item.id, order))
    return h('li', { class: 'menu-row' },
      h('div', { class: 'row-head' }, h('strong', null, item.kind === 'group' ? `${item_name(item)} (meny)` : item_name(item)), order),
      item_sites(item).map((id) => site_editor(id)))
  }

  /** A site's settings: shown or not (beside [order], if given), then (when shown) its start page and extra CSS. */
  const site_editor = (id: string, order?: Child): Child => {
    /*
     * The checkbox redraws (the fields appear or go); the URL field has a "standard" link back to the default page;
     * the CSS editor shows the built-in CSS above it, since the extra CSS comes after it and may override it. The
     * fields have ids, unique per site, so focus survives a redraw.
     */
    const def = find_site(id)
    const site = draft.sites[id]
    if (!def || !site) return null
    return [
      h('div', { class: 'row-head' },
        h('label', { class: 'check' },
          h('input', {
            type: 'checkbox',
            checked: site.enabled,
            onchange: (event: Event) => {
              site.enabled = (event.target as HTMLInputElement).checked
              render()
            },
          }),
          h('strong', null, def.name)),
        order),
      site.enabled ? [
        h('label', { class: 'field' },
          h('span', null, 'Startsida', h('button', {
            class: 'link',
            type: 'button',
            onclick: () => {
              site.url = def.default_url
              render()
            },
          }, 'standard')),
          // type=url gives a keyboard with / and .se; the text is trimmed, as pasted addresses often end in a space.
          h('input', {
            id: `${id}-url`,
            type: 'url',
            autocapitalize: 'off',
            autocomplete: 'off',
            spellcheck: 'false',
            value: site.url,
            oninput: (event: Event) => (site.url = (event.target as HTMLInputElement).value.trim()),
          })),
        h('details', { class: 'css' },
          h('summary', null, site.extra_css.trim() ? 'Extra CSS (aktiv)' : 'Extra CSS'),
          def.css ? [h('p', { class: 'hint' }, 'Inbyggd:'), h('pre', null, def.css)] : null,
          h('textarea', {
            id: `${id}-css`,
            rows: 4,
            spellcheck: 'false',
            placeholder: '.annons { display: none !important; }',
            value: site.extra_css,
            oninput: (event: Event) => (site.extra_css = (event.target as HTMLTextAreaElement).value),
          })),
      ] : null,
    ]
  }

  /** Check the draft and hand it to the app; the outcome shows in the status line. */
  const save = async () => {
    // Refuse what would break the app: a shown site without a loadable address, or no site shown at all.
    const invalid = enabled_site_ids(draft).find((id) => !is_web_url(draft.sites[id]?.url))
    if (invalid) return show_status(`Ogiltig adress för ${find_site(invalid)?.name}.`, true)
    if (enabled_site_ids(draft).length === 0) return show_status('Minst en webbplats måste visas.', true)
    // The app may fail to write the file; then say so rather than pretend it was saved.
    try {
      await actions.save(draft)
      show_status('Sparat.')
    } catch (error) {
      show_status(`Kunde inte spara: ${error instanceof Error ? error.message : error}`, true)
    }
  }

  /** Everything back to the defaults, after asking, and saved at once. */
  const reset = () => {
    // confirm() shows as a native dialog on Android (MainActivity gives the page a WebChromeClient for it).
    if (!confirm('Återställa alla inställningar till standard?')) return
    draft = default_config()
    render()
    void save()
  }

  /** A message under the settings, in red for an error. */
  const show_status = (text: string, error = false) => {
    status.textContent = text
    status.classList.toggle('error', error)
  }

  // The first draw; the caller puts the element in the page.
  render()
  return root
}
