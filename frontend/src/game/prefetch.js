// Byte-accurate prefetch of the game's lazily imported ES-module graph.
//
// The native dynamic import() used by loadEngines() has no progress events,
// and Vite's dev responses are streamed without Content-Length, so transfer
// progress can't be observed on the import itself. Instead we:
//   1. Ask the dev-server plugin (vite.config.js → /__game_manifest) for the
//      exact module URL list + wire sizes of the two engine entry graphs.
//   2. Re-fetch every module with the streaming fetch API, counting bytes and
//      warming the browser HTTP cache under the exact URLs the upcoming
//      import() will request, so the real import finishes from cache almost
//      instantly.
//   3. If the manifest endpoint is unavailable (e.g. a production static
//      build), fall back to discovering the graph by parsing each fetched
//      module's import statements; static hosting usually sends
//      Content-Length, keeping the byte totals accurate there too.
// Prefetching is best-effort: any file that fails is skipped and left to the
// real import(), which is the only thing that can surface load errors.

const ENTRIES = [
  '/src/game/engine.js',
  '/src/game/multiplayer_engine.js',
];
const CONCURRENCY = 6;
// Safety valve only — NOT a load timeout. If prefetching wedges (bug, stalled
// socket) we simply stop waiting for it and let the real import() continue on
// its own; loading itself never times out.
const PREFETCH_GIVEUP_MS = 30_000;
const ASSET_RE = /\.(css|scss|svg|png|jpe?g|gif|mp3|wav|ogg|glb|gltf|woff2?|ttf)(\?|$)/;

// Extract import specifiers from served (already URL-rewritten) module code.
// Keep in sync with the server-side copy in vite.config.js.
export function collectImportSpecifiers(code) {
  const specs = new Set();
  const add = (s) => {
    if (typeof s !== 'string') return;
    if (/^(https?:|data:|blob:)/.test(s) || s.startsWith('/@')) return;
    if (ASSET_RE.test(s)) return;
    if (s.startsWith('/') || s.startsWith('./') || s.startsWith('../')) specs.add(s);
  };
  for (const m of code.matchAll(/(?:^|[^\w$.])(?:import|export)(?:[\s\w$*{},]*\bfrom\b)?\s*["']([^"']+)["']/g)) add(m[1]);
  for (const m of code.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) add(m[1]);
  return specs;
}

// Rolling ~1s sample window → instantaneous transfer speed.
function createReporter(onProgress) {
  if (typeof onProgress !== 'function') return () => {};
  const samples = [];
  let lastEmit = 0;
  let lastSpeed = 0;
  return (state, force = false) => {
    const now = performance.now();
    samples.push([now, state.loaded]);
    while (samples.length > 1 && samples[1][0] <= now - 1000) samples.shift();
    const span = (now - samples[0][0]) / 1000;
    if (span >= 0.2) lastSpeed = Math.max(0, (state.loaded - samples[0][1]) / span);
    if (!force && now - lastEmit < 100) return;
    lastEmit = now;
    onProgress({ loaded: state.loaded, total: state.total, speed: lastSpeed });
  };
}

function resolveUrl(spec, base) {
  try {
    const u = new URL(spec, new URL(base, location.href));
    return u.origin === location.origin ? u.pathname + u.search : null;
  } catch {
    return null;
  }
}

async function fetchManifest() {
  try {
    const res = await fetch('/__game_manifest');
    if (!res.ok) return null;
    const data = await res.json();
    if (data && Array.isArray(data.files) && data.files.length) return data.files;
    return null;
  } catch {
    return null;
  }
}

async function prefetchAll(onProgress) {
  const state = { loaded: 0, total: 0 };
  const report = createReporter(onProgress);
  const seen = new Set();
  const queue = [];

  // In manifest mode the graph is already complete, so fetched code doesn't
  // need to be buffered + parsed for further imports.
  const manifest = await fetchManifest();
  const hasManifest = !!manifest;
  for (const url of manifest ?? ENTRIES) {
    if (seen.has(url)) continue;
    seen.add(url);
    queue.push({ url, size: null });
  }

  async function fetchEntry(entry) {
    let res;
    try {
      res = await fetch(entry.url);
    } catch {
      return; // network error; the real import() will surface it
    }
    if (!res.ok) return;

    const contentLength = Number.parseInt(res.headers.get('content-length') || '', 10);
    if (contentLength > 0) {
      entry.size = contentLength;
      state.total += contentLength;
    }

    const chunks = [];
    let received = 0;
    if (res.body && typeof res.body.getReader === 'function') {
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.length;
        state.loaded += value.length;
        report(state);
        if (!hasManifest) chunks.push(value);
      }
    } else {
      const buf = await res.arrayBuffer();
      received = buf.byteLength;
      state.loaded += received;
      if (!hasManifest) chunks.push(new Uint8Array(buf));
      report(state);
    }
    // Dev responses carry no Content-Length and manifest sizes may differ from
    // the actual stream by a few bytes (sourcemap comments etc.) — reconcile
    // the total with the real wire bytes as each file completes.
    state.total += received - (entry.size ?? 0);
    entry.size = received;
    report(state);

    if (!hasManifest) {
      const text = new TextDecoder().decode(concatChunks(chunks));
      for (const spec of collectImportSpecifiers(text)) {
        const abs = resolveUrl(spec, entry.url);
        if (abs && !seen.has(abs)) {
          seen.add(abs);
          queue.push({ url: abs, size: null });
        }
      }
    }
  }

  await new Promise((resolveAll) => {
    let active = 0;
    const pump = () => {
      if (queue.length === 0 && active === 0) {
        resolveAll();
        return;
      }
      while (active < CONCURRENCY && queue.length > 0) {
        const entry = queue.shift();
        active += 1;
        fetchEntry(entry)
          .catch(() => {})
          .finally(() => {
            active -= 1;
            pump();
          });
      }
    };
    pump();
  });
  report(state, true);
}

function concatChunks(chunks) {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

// Never rejects: progress display must not be able to break engine loading.
export async function prefetchGameModules(onProgress) {
  const giveUp = new Promise((r) => setTimeout(r, PREFETCH_GIVEUP_MS));
  try {
    await Promise.race([prefetchAll(onProgress), giveUp]);
  } catch {
    // best effort only
  }
}
