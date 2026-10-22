const MANIFEST_KEY = 'local-ai-model-manifest-v1'
const LOCK_PREFIX = 'local-ai-model-lock-v1:'

export type ModelRecord = { modelId: string; artifactUrl?: string; artifactVersion?: string; runtimeVersion: string; integrity?: string; validation?: string; status: 'downloaded' | 'verified' | 'ready' | 'missing' | 'error'; verifiedAt?: number; updatedAt: number; error?: string }
export async function checkModelCache(modelId: string): Promise<{ cached: boolean; runtimeVersion: string }> {
  if (import.meta.env.PROD && 'serviceWorker' in navigator) await navigator.serviceWorker.ready
  const runtime = await import('@mlc-ai/web-llm')
  const appConfig = { ...runtime.prebuiltAppConfig, cacheBackend: 'cache' as const }
  const cached = await runtime.hasModelInCache(modelId, appConfig)
  return { cached, runtimeVersion: runtime.modelVersion }
}
export async function deleteCachedModel(modelId: string): Promise<void> {
  const runtime = await import('@mlc-ai/web-llm')
  await runtime.deleteModelInCache(modelId, { ...runtime.prebuiltAppConfig, cacheBackend: 'cache' })
}
export function modelRecord(modelId: string, runtimeVersion: string, status: ModelRecord['status'], extra: Partial<ModelRecord> = {}): ModelRecord {
  const artifactUrl = `https://huggingface.co/mlc-ai/${modelId}`
  return {
    modelId, artifactUrl, artifactVersion: 'main',
    runtimeVersion, integrity: 'No SRI hash is provided by this prebuilt model record.',
    validation: 'WebLLM tensor cache completeness check plus successful local inference probe.', status, updatedAt: Date.now(), ...extra,
  }
}
export function readModelRecords(): Record<string, ModelRecord> {
  try { const value: unknown = JSON.parse(localStorage.getItem(MANIFEST_KEY) || '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, ModelRecord> : {} } catch { return {} }
}
export function writeModelRecord(record: ModelRecord): boolean {
  try { const records = readModelRecords(); records[record.modelId] = record; localStorage.setItem(MANIFEST_KEY, JSON.stringify(records)); return true }
  catch { return false }
}

const pause = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms))
export async function withModelLock<T>(modelId: string, operation: () => Promise<T>): Promise<T> {
  const lockName = `${LOCK_PREFIX}${modelId}`
  if (navigator.locks) return navigator.locks.request(lockName, { mode: 'exclusive' }, operation)
  const key = `local-ai-lease:${modelId}`
  const owner = crypto.randomUUID()
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    try {
      const current = JSON.parse(localStorage.getItem(key) || 'null') as { owner?: string; expiresAt?: number } | null
      if (!current || !current.expiresAt || current.expiresAt < Date.now()) {
        localStorage.setItem(key, JSON.stringify({ owner, expiresAt: Date.now() + 30_000 }))
        const claimed = JSON.parse(localStorage.getItem(key) || 'null') as { owner?: string } | null
        if (claimed?.owner === owner) break
      }
    } catch { return operation() }
    await pause(250)
  }
  if (Date.now() >= deadline) throw new Error('Another tab is currently preparing this model. Close that tab and retry.')
  const heartbeat = window.setInterval(() => {
    try { const current = JSON.parse(localStorage.getItem(key) || 'null') as { owner?: string } | null; if (current?.owner === owner) localStorage.setItem(key, JSON.stringify({ owner, expiresAt: Date.now() + 30_000 })) } catch { /* storage may be unavailable */ }
  }, 5_000)
  try { return await operation() }
  finally {
    window.clearInterval(heartbeat)
    try { const current = JSON.parse(localStorage.getItem(key) || 'null') as { owner?: string } | null; if (current?.owner === owner) localStorage.removeItem(key) } catch { /* storage may be unavailable */ }
  }
}
