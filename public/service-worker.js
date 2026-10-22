const PREFIX = 'local-shell-'
const META_CACHE = 'local-shell-meta'
const ACTIVE_KEY = new URL('__active_shell__', self.registration.scope).href
const MANIFEST_URL = new URL('.vite/manifest.json', self.registration.scope)
const SCOPE_URL = self.registration.scope

async function readActiveCache() {
  const response = await (await caches.open(META_CACHE)).match(ACTIVE_KEY)
  return response ? response.text() : ''
}

async function setActiveCache(name) {
  await (await caches.open(META_CACHE)).put(ACTIVE_KEY, new Response(name))
}

async function cacheApplicationShell() {
  const response = await fetch(MANIFEST_URL, { cache: 'no-store' })
  if (!response.ok) throw new Error('Could not read the production asset manifest.')
  const manifestText = await response.text()
  const indexUrl = new URL('index.html', SCOPE_URL)
  const indexResponse = await fetch(indexUrl, { cache: 'no-store' })
  if (!indexResponse.ok) throw new Error('Could not verify the application entry page.')
  const indexText = await indexResponse.text()
  const manifest = JSON.parse(manifestText)
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${manifestText}\n${indexText}`))
  const version = [...new Uint8Array(digest)].slice(0, 8).map((byte) => byte.toString(16).padStart(2, '0')).join('')
  const cacheName = `${PREFIX}${version}`
  const urls = [indexUrl, new URL('offline.html', SCOPE_URL), new URL('manifest.webmanifest', SCOPE_URL), MANIFEST_URL]
  const entry = Object.values(manifest).find((candidate) => candidate.isEntry)
  const visitStaticImports = (candidate) => {
    if (!candidate || candidate.isDynamicEntry) return
    if (candidate.file) urls.push(new URL(candidate.file, SCOPE_URL))
    for (const file of candidate.css || []) urls.push(new URL(file, SCOPE_URL))
    for (const file of candidate.assets || []) urls.push(new URL(file, SCOPE_URL))
    for (const imported of candidate.imports || []) visitStaticImports(manifest[imported])
  }
  visitStaticImports(entry)
  const cache = await caches.open(cacheName)
  const alreadyComplete = await Promise.all(urls.map((url) => cache.match(url.href)))
  if (alreadyComplete.every(Boolean)) return cacheName
  await cache.addAll([...new Set(urls.map((url) => url.href))])
  return cacheName
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cacheName = await cacheApplicationShell()
    await setActiveCache(cacheName)
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('message', (event) => {
  if (event.data !== 'CHECK_APP_UPDATE') return
  event.waitUntil((async () => {
    if (!self.navigator.onLine) return
    try {
      const current = await readActiveCache()
      const replacement = await cacheApplicationShell()
      if (replacement !== current) {
        await setActiveCache(replacement)
        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
        for (const client of clients) client.postMessage({ type: 'APP_UPDATE_READY' })
      }
    } catch { /* Keep the active shell if the update check or precache fails. */ }
  })())
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin || !url.href.startsWith(SCOPE_URL)) return
  event.respondWith((async () => {
    const activeName = await readActiveCache()
    const cache = await caches.open(activeName || `${PREFIX}missing`)
    if (request.mode === 'navigate') {
      const shell = await cache.match(new URL('index.html', SCOPE_URL))
      if (shell) return shell
      return (await cache.match(new URL('offline.html', SCOPE_URL))) || Response.error()
    }
    const cached = await cache.match(request)
    if (cached) return cached
    try {
      const response = await fetch(request)
      if (response.ok) await cache.put(request, response.clone())
      return response
    } catch {
      return (await cache.match(new URL('offline.html', SCOPE_URL))) || Response.error()
    }
  })())
})
