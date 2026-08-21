import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev-server responses are streamed without Content-Length, so the browser
// cannot know the total transfer size of the lazily imported game modules.
// This dev-only plugin walks the two engine entry graphs server-side (Vite
// caches the transforms, so repeated crawls are cheap) and serves the exact
// module URL list + on-the-wire byte sizes for the loading screen's progress
// readout. Client counterpart: src/game/prefetch.js.
const GAME_ENTRIES = [
  '/src/game/engine.js',
  '/src/game/multiplayer_engine.js',
]

function collectImportSpecifiers(code) {
  const specs = new Set()
  const add = (s) => {
    if (typeof s !== 'string' || !s.startsWith('/') || s.startsWith('/@')) return
    if (/\.(css|scss|svg|png|jpe?g|gif|mp3|wav|ogg|glb|gltf|woff2?|ttf)(\?|$)/.test(s)) return
    specs.add(s)
  }
  // Static imports / re-exports (specifiers are already rewritten to absolute
  // URLs by Vite's import analysis) + dynamic import() calls.
  for (const m of code.matchAll(/(?:^|[^\w$.])(?:import|export)(?:[\s\w$*{},]*\bfrom\b)?\s*["']([^"']+)["']/g)) add(m[1])
  for (const m of code.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) add(m[1])
  return specs
}

function gameManifestPlugin() {
  return {
    name: 'game-preload-manifest',
    apply: 'serve',
    configureServer(server) {
      let cached = null
      // Any file change can alter the graph or a module's served size.
      server.watcher.on('all', () => { cached = null })
      server.middlewares.use('/__game_manifest', async (_req, res) => {
        try {
          cached ??= await buildManifest(server)
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(cached))
        } catch (e) {
          cached = null
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: String(e) }))
        }
      })
    },
  }
}

async function buildManifest(server) {
  const files = []
  const seen = new Set()
  const queue = [...GAME_ENTRIES]
  while (queue.length) {
    const url = queue.shift()
    if (seen.has(url)) continue
    seen.add(url)
    let code = ''
    try {
      code = (await server.transformRequest(url))?.code ?? ''
    } catch {
      // Unloadable module: skip it; the real import() will surface the error.
    }
    if (!code) continue
    // Start from the transform size; exact wire sizes below usually replace it.
    files.push({ url, size: new TextEncoder().encode(code).length })
    for (const spec of collectImportSpecifiers(code)) queue.push(spec)
  }
  // Dev responses append an inline base64 sourcemap that transformRequest()
  // does not include, so measure exact on-the-wire bytes by requesting each
  // module through our own middleware stack (transforms are cached by now).
  const address = server.httpServer?.address()
  if (address && typeof address === 'object' && address.port) {
    const base = `http://127.0.0.1:${address.port}`
    await Promise.all(files.map(async (f) => {
      try {
        const r = await fetch(base + f.url)
        if (r.ok) f.size = (await r.arrayBuffer()).byteLength
      } catch {
        // keep the estimate; the client reconciles with real bytes anyway
      }
    }))
  }
  return { files }
}

export default defineConfig({
  plugins: [react(), gameManifestPlugin()],
  server: {
    proxy: {
      '/api': process.env.VITE_API_TARGET || 'http://localhost:8000',
      '/ws': {
        target: process.env.VITE_WS_TARGET || 'ws://localhost:8000',
        ws: true,
      },
    },
  },
  test: {
    environment: 'node',
    globals: true,
  },
})
