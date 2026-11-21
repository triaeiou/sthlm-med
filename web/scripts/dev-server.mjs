// Development server for the browser host: serves static/ and the scripts tsc compiles into dist/ (run in watch mode
// alongside), and proxies GET /proxy?url=… so the page can read Belport (which sends no CORS headers). Node only.
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { read_index_html } from './index-html.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const port = Number(process.env.PORT ?? 5173)
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' }

// tsc recompiles src/ into dist/ on every save; it stops with this server.

const tsc = spawn(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '-p', root, '--watch', '--preserveWatchOutput'], { stdio: 'inherit' })
process.on('exit', () => tsc.kill())
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => process.exit())

createServer(async (request, response) => {
  // /proxy goes to proxy(); anything else is a file.
  const url = new URL(request.url ?? '/', `http://localhost:${port}`)
  if (url.pathname === '/proxy') return proxy(url.searchParams.get('url'), response)
  // The path normalized and stripped of leading "../", so a request cannot read files outside the two folders.
  const path = normalize(url.pathname === '/' ? '/index.html' : url.pathname).replace(/^(\.\.[/\\])+/, '')
  // static/ first (page, styles, icons), then dist/ (compiled scripts), as the Android build merges them the same way.
  for (const dir of ['static', 'dist']) {
    try {
      const body = path === '/index.html' ? read_index_html() : await readFile(join(root, dir, path))
      response.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream', 'cache-control': 'no-store' })
      return response.end(body)
    } catch {
      // Not in this folder: try the next.
    }
  }
  response.writeHead(404).end('Not found')
}).listen(port, '127.0.0.1', () => console.log(`sthlm-med dev: http://localhost:${port}/`))

/** Fetch [target] server side and pass its answer on: the browser cannot read Belport itself (no CORS headers). */
async function proxy(target, response) {
  // http(s) only, so the proxy cannot be used to read local files or other schemes.
  if (!target || !/^https?:\/\//.test(target)) return response.writeHead(400).end('url must be http(s)')
  // A phone browser's user agent, as some sites serve other markup to unknown clients; 502 when the site is unreachable.
  try {
    const upstream = await fetch(target, { headers: { 'user-agent': 'Mozilla/5.0 (Linux; Android 14) sthlm-med-dev' } })
    response.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') ?? 'text/plain' })
    response.end(Buffer.from(await upstream.arrayBuffer()))
  } catch (error) {
    response.writeHead(502).end(String(error))
  }
}
