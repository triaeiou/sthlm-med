# SweMed

Snabbgenvägar till svenska medicinska webbplatser på Android: Kunskapsstöd för vårdgivare, Giftinformation, FASS,
Janusinfo och Internetmedicin, en meny med kalkylatorer, samt lediga vårdplatser från Belport.

- **One live view per site.** Every site gets its own WebView, loaded at start. Switching tabs keeps each site's
  page, history and scroll position. Links within a site (its host and subdomains) open in its view; links to other
  websites open in the default browser, and `tel:`, `mailto:` and `intent:` links in the app that handles them.
  - Tap a site icon to switch to it, as you left it.
  - **Long-press** a site icon to go back to its start page.
  - **Swipe up** on the tab bar to find text in the page shown (the Belport view or the active site). The search
    runs as you type, ↑/↓ step through the matches, and `.*` switches to regular expressions (case-insensitive;
    `^`/`$` match at block edges). Text in collapsed sections is searched too, and opened when it matches.
- **Kalkylatorer** is a toolbar icon that opens a menu of calculator sites (ABG bench, IM kalkylatorer). They are
  sites like the others: kept open, searchable, with a start page to long-press back to.
- **CSS injection** hides ads on Internetmedicin and the "Viktig information om väntetider" banner on Giftinformation.
  Each site has an *Extra CSS* field in settings for fixing things without a new build.
- **Belport** lists units by free beds. Each unit shows free beds and waiting referrals, per bed type (Vanliga/MRSA)
  when it has more than one, and the bakjour number as a call button.
- **Settings** cover each site's start page and whether it shows, the startup site, toolbar order and extra CSS.
  Belport's page is fixed (Stockholms län, geriatrik, `BELPORT_URL` in `web/src/core/belport.ts`): the parser follows
  that page's layout, and Belport's pages for other regions and care types look different.

## Layout

```
web/        The app itself: plain HTML/CSS + TypeScript, compiled by tsc (the only dev dependency)
  src/core/   host-agnostic logic: sites, menu, config, CSS-injection script, find in page, Belport parser
  src/ui/     toolbar and popout menu, find bar, settings and Belport views (plain DOM)
  src/host/   the Host contract (host.ts) and its implementations: android.ts, browser.ts
  static/     index.html, style.css
android/    Thin Kotlin host: native WebViews per site + the app's page as a "shell" WebView over them
```

The app (`web/src/app.ts`) holds the state: which site shows, and which view or popout menu is open over it. A host
only carries that out through `web/src/host/host.ts`: it keeps a view per site, stores the config, fetches pages
without CORS and opens links. Porting to another platform means implementing that interface; the core and UI stay as
they are. On Android the page's requests arrive in `ShellBridge.kt`, which passes them to the site views
(`SiteWebViews.kt`), the window (`MainActivity.kt`) or the config file.

### Why native views and not iframes

All five sites send `X-Frame-Options: SAMEORIGIN`, and cross-origin frames can't be restyled. So on Android each site
is a native WebView. The app's own page (toolbar, views) is a transparent WebView on top of them. It is the toolbar's
height normally, and the full screen while a view or popout menu is open. CSS is injected with
`WebViewCompat.addDocumentStartJavaScript`, limited to the site's hosts and their subdomains. The app's page, served from the APK's
assets at `https://appassets.androidplatform.net`, is the only one with a message channel to the app.

## Adding things

Which sites, views and menus there are is built in; the stored config only holds each site's settings and the
toolbar's order. A new toolbar item reaches existing users just before Settings.

- **A site:** add a `SiteDef` in `web/src/core/sites.ts`, and either a `{kind: 'site', id}` in `DEFAULT_MENU`
  (`web/src/core/menu.ts`) or its id in a group's `sites` there. A site on the toolbar needs an icon in
  `web/static/icons/` (from the originals in `gfx/`; `.ico` → largest frame, e.g.
  `magick 'gfx/x.ico[2]' PNG32:web/static/icons/x.png`); a site in a menu shows its name.
- **A popout menu:** add a `GroupDef` to `GROUPS` and a `{kind: 'group', id}` to `DEFAULT_MENU` (`menu.ts`); its
  line icon is one of `ICONS` in `web/src/ui/dom.ts`.
- **A view:** add a `ViewId` and a `ViewDef` (`menu.ts`), and a branch in `App.overlay_content()` (`web/src/app.ts`).

## Conventions

- No frameworks: plain HTML/CSS and TypeScript compiled by `tsc`, plain Kotlin and AndroidX on Android.
- snake_case for functions, methods, variables and properties (also in Kotlin, and in the bridge's JSON);
  PascalCase for classes and types; UPPER_CASE for constants. Platform APIs and Android overrides keep their names.
- Every function has a doc comment. Functions longer than two lines also explain, inside, their goal, approach and
  key steps (why as well as how), for whoever audits or extends them next. One- and two-line functions put any
  rationale in the doc comment and stay compact (in Kotlin as `= expression` where it fits).
- TypeScript/JavaScript without end-of-line semicolons. A statement that would start with `(`, `[` or `` ` `` is
  written differently (e.g. through a `const`), so automatic semicolon insertion never joins two lines.
- Scripts that run in a site's page (`page_add_css()`, `page_find()`) are ordinary, type-checked functions sent as
  their source text: they must not refer to anything outside themselves.

## Develop

```sh
cd web
npm install
npm test            # node --test: config, CSS injection, find, Belport parser (against a saved page)
npm run dev         # http://localhost:5173: tsc --watch + static server + /proxy for Belport
npm run build       # → web/dist
```

The browser host is for working on the UI. Sites open in tabs of their own, since they can't be framed, and there's no
CSS injection.

```sh
cd android
./gradlew testDebugUnitTest assembleDebug     # also runs npm run build in ../web and bundles web/dist
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

If AAPT2 fails with "Daemon startup failed", the aapt2 in the Gradle cache has lost its execute bit. Pass
`-Pandroid.aapt2FromMavenOverride=$ANDROID_HOME/build-tools/36.0.0/aapt2`.

Debug the pages with `chrome://inspect` (debug builds allow it): the shell and each site show up as separate pages.
