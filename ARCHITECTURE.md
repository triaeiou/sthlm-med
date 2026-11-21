# sthlm-med architecture and development

For the Swedish user guide, see [README.md](README.md).

## Runtime behavior

Each enabled site gets its own WebView, loaded at start. Switching sites keeps each site's page, history and scroll
position. Links within a site (its host and subdomains) open in its view; links to other websites open in the default
browser, and `tel:`, `mailto:` and `intent:` links in the app that handles them. Calculator sites use the same views
and behavior as toolbar sites, but are reached through a popout menu.

CSS injection hides ads on Internetmedicin and the "Viktig information om väntetider" banner on Giftinformation.
Each site has an *Extra CSS* field in settings for fixing things without a new build. Settings also cover each site's
start page and whether it shows, the startup site and toolbar order.

Find in page runs in the active site's WebView, or in the shell's Belport view when it is open. It searches as the
user types, supports stepping through matches and optionally uses regular expressions. Matching is case-insensitive;
`^`/`$` match at block edges. Text in collapsed sections is searched too, and opened when it matches.

Belport's page is fixed to Stockholms län, geriatrics (`BELPORT_URL` in `web/src/core/belport.ts`): the parser follows
that page's layout, and Belport's pages for other regions and care types look different. The UI sorts units by free
beds and shows free beds and waiting referrals per bed type when a unit has more than one, with the bakjour number
as a call button.

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

### The app icon

The launcher icon is `gfx/sthlm-med.png` (source: `gfx/sthlm-med.xcf`) as an adaptive icon
(`android/app/src/main/res/mipmap-anydpi/ic_launcher.xml`): a black background colour and, as the foreground and
themed-icon layer, the PNG's white symbol with its brightness as alpha. The symbol reaches 214 px from the centre of the
512 px image, so it is padded to 704 px. That way it stays inside the 66 dp safe zone of the 108 dp layer, which no
launcher mask clips. After changing the PNG, regenerate the layer for each density:

```sh
cd android/app/src/main/res
for d in mdpi:108 hdpi:162 xhdpi:216 xxhdpi:324 xxxhdpi:432; do
  magick ../../../../../gfx/sthlm-med.png \( -clone 0 -alpha off -colorspace gray \) \( -clone 0 -alpha extract \) \
    -delete 0 -compose multiply -composite -background white -alpha shape -background none -gravity center \
    -extent 704x704 -filter Lanczos -resize ${d#*:}x${d#*:} -strip PNG32:mipmap-${d%:*}/ic_launcher_foreground.png
done
```

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

With the repository root open in VS Code, **Tasks: Run Test Task** runs **Test: All** (web tests, then Android unit
tests). **Test: Web** and **Test: Android** are also available separately under **Tasks: Run Task**.
**Tasks: Run Build Task** (`Ctrl+Shift+B`) runs **Build: Debug APK**, producing
`android/app/build/outputs/apk/debug/app-debug.apk`. The Android build also compiles and bundles the web app.
These tasks require Node.js 24 or newer on the task's PATH, installed web dependencies, Java and the Android SDK.

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
