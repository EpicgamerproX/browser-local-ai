const MANIFEST_KEY = 'local-ai-model-manifest-v1'
const LOCK_PREFIX = 'local-ai-model-lock-v1:'

export type ModelRecord = { modelId: string; artifactUrl?: string; artifactVersion?: string; runtimeVersion: string; integrity?: string; validation?: string; status: 'downloaded' | 'verified' | 'ready' | 'missing' | 'error'; verifiedAt?: number; updatedAt: number; error?: string }
export const MODEL_CACHE_CHECK_TIMEOUT_MS = 90_000
export const MODEL_LOCK_TIMEOUT_MS = 45_000
export class ModelCacheCheckError extends Error {
  constructor(message: string, readonly code: 'timeout' | 'worker' | 'aborted') { super(message); this.name = 'ModelCacheCheckError' }
}
export class ModelLockTimeoutError extends Error {
  readonly code = 'lock-timeout'
  constructor(modelId: string, timeoutMs: number) {
    super(`Another tab may still be preparing ${modelId}. The lock was not acquired within ${Math.round(timeoutMs / 1000)} seconds. Retry after that tab finishes or closes.`)
    this.name = 'ModelLockTimeoutError'
  }
}
export async function checkModelCache(
  modelId: string,
  options: { timeoutMs?: number; signal?: AbortSignal; operationId?: string } = {},
): Promise<{ cached: boolean; runtimeVersion: string; durationMs: number }> {
  const startedAt = performance.now()
  const timeoutMs = options.timeoutMs ?? MODEL_CACHE_CHECK_TIMEOUT_MS
  const requestId = crypto.randomUUID()
  const diagnostic = (event: string, details: Record<string, unknown> = {}) => console.info('[LOCAL:model]', { timestamp: new Date().toISOString(), operationId: options.operationId || requestId, event, modelId, elapsedMs: Math.round(performance.now() - startedAt), ...details })
  if (options.signal?.aborted) throw new ModelCacheCheckError('Model cache check was cancelled.', 'aborted')
  diagnostic('cache-check-start', { timeoutMs })
  return new Promise((resolve, reject) => {
    let settled = false
    let timer = 0
    let worker: Worker | null = null
    const cleanup = () => {
      window.clearTimeout(timer)
      options.signal?.removeEventListener('abort', abort)
      worker?.removeEventListener('error', onError)
      worker?.removeEventListener('messageerror', onMessageError)
      worker?.terminate()
    }
    const finish = (error?: Error, result?: { cached: boolean; runtimeVersion: string }) => {
      if (settled) return
      settled = true
      cleanup()
      if (error) { diagnostic('cache-check-failed', { error: error.message, code: error instanceof ModelCacheCheckError ? error.code : 'worker' }); reject(error) }
      else if (result) { diagnostic('cache-check-complete', { cached: result.cached }); resolve({ ...result, durationMs: performance.now() - startedAt }) }
    }
    const abort = () => finish(new ModelCacheCheckError('Model cache check was cancelled.', 'aborted'))
    const onError = (event: ErrorEvent) => { event.preventDefault(); finish(new ModelCacheCheckError(`Cache-check worker failed: ${event.message || 'unknown worker error'}`, 'worker')) }
    const onMessageError = () => finish(new ModelCacheCheckError('Cache-check worker returned an unreadable response.', 'worker'))
    try { worker = new Worker(new URL('./llm.worker.ts', import.meta.url), { type: 'module' }) }
    catch (cause) { reject(new ModelCacheCheckError(`Could not start the model cache-check worker: ${cause instanceof Error ? cause.message : String(cause)}`, 'worker')); return }
    const cacheWorker = worker
    cacheWorker.addEventListener('error', onError)
    cacheWorker.addEventListener('messageerror', onMessageError)
    cacheWorker.addEventListener('message', (event: MessageEvent) => {
      const message = event.data as { type?: string; requestId?: string; cached?: boolean; runtimeVersion?: string; error?: string }
      if (message?.type !== 'MODEL_CACHE_RESULT' || message.requestId !== requestId) return
      if (message.error) finish(new ModelCacheCheckError(`WebLLM cache inspection failed: ${message.error}`, 'worker'))
      else if (typeof message.cached === 'boolean' && message.runtimeVersion) finish(undefined, { cached: message.cached, runtimeVersion: message.runtimeVersion })
      else finish(new ModelCacheCheckError('WebLLM returned an invalid cache-inspection result.', 'worker'))
    }, { once: false })
    timer = window.setTimeout(() => finish(new ModelCacheCheckError(`Checking the ${modelId} cache exceeded ${Math.round(timeoutMs / 1000)} seconds. Retry, or use Models to download the selected model.`, 'timeout')), timeoutMs)
    options.signal?.addEventListener('abort', abort, { once: true })
    try { cacheWorker.postMessage({ type: 'CHECK_MODEL_CACHE', requestId, modelId }) }
    catch (cause) { finish(new ModelCacheCheckError(`Could not request a model cache check: ${cause instanceof Error ? cause.message : String(cause)}`, 'worker')) }
  })
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

const pause = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal?.aborted) { reject(signal.reason || new DOMException('Operation aborted.', 'AbortError')); return }
  const timer = window.setTimeout(() => { signal?.removeEventListener('abort', abort); resolve() }, ms)
  const abort = () => { window.clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(signal?.reason || new DOMException('Operation aborted.', 'AbortError')) }
  signal?.addEventListener('abort', abort, { once: true })
})
export async function withModelLock<T>(
  modelId: string,
  operation: () => Promise<T>,
  signal?: AbortSignal,
  options: { timeoutMs?: number; operationId?: string; onWaiting?: () => void } = {},
): Promise<T> {
  const lockName = `${LOCK_PREFIX}${modelId}`
  const timeoutMs = options.timeoutMs ?? MODEL_LOCK_TIMEOUT_MS
  const startedAt = performance.now()
  const log = (event: string, details: Record<string, unknown> = {}) => console.info('[LOCAL:model]', { timestamp: new Date().toISOString(), operationId: options.operationId || 'unassigned', event, modelId, elapsedMs: Math.round(performance.now() - startedAt), ...details })
  if (signal?.aborted) throw new DOMException('Operation aborted.', 'AbortError')
  log('lock-requested', { lockName, timeoutMs, api: navigator.locks ? 'web-locks' : 'local-storage-lease' })
  if (navigator.locks) {
    const requestController = new AbortController()
    let acquired = false
    let timedOut = false
    const externalAbort = () => requestController.abort(signal?.reason || new DOMException('Operation aborted.', 'AbortError'))
    signal?.addEventListener('abort', externalAbort, { once: true })
    const timeout = window.setTimeout(() => {
      if (acquired) return
      timedOut = true
      requestController.abort(new ModelLockTimeoutError(modelId, timeoutMs))
    }, timeoutMs)
    options.onWaiting?.()
    if (typeof navigator.locks.query === 'function') {
      void navigator.locks.query().then((state) => log('lock-state', {
        held: state.held?.filter((lock) => lock.name === lockName).length || 0,
        pending: state.pending?.filter((lock) => lock.name === lockName).length || 0,
      })).catch((error: unknown) => log('lock-state-unavailable', { error: error instanceof Error ? error.message : String(error) }))
    }
    try {
      return await navigator.locks.request(lockName, { mode: 'exclusive', signal: requestController.signal }, async (lock) => {
        if (requestController.signal.aborted) {
          if (timedOut) throw new ModelLockTimeoutError(modelId, timeoutMs)
          throw requestController.signal.reason || new DOMException('Operation aborted.', 'AbortError')
        }
        acquired = true
        window.clearTimeout(timeout)
        log('lock-acquired', { lockName, lockMode: lock?.mode })
        if (signal?.aborted) throw signal.reason || new DOMException('Operation aborted.', 'AbortError')
        return operation()
      })
    } catch (error) {
      if (timedOut && !acquired) throw new ModelLockTimeoutError(modelId, timeoutMs)
      if (signal?.aborted) throw signal.reason || new DOMException('Operation aborted.', 'AbortError')
      throw error
    } finally {
      window.clearTimeout(timeout)
      signal?.removeEventListener('abort', externalAbort)
      log('lock-released', { acquired })
    }
  }
  const key = `local-ai-lease:${modelId}`
  const owner = crypto.randomUUID()
  const deadline = Date.now() + timeoutMs
  options.onWaiting?.()
  while (Date.now() < deadline) {
    if (signal?.aborted) throw new DOMException('Operation aborted.', 'AbortError')
    try {
      const current = JSON.parse(localStorage.getItem(key) || 'null') as { owner?: string; expiresAt?: number } | null
      if (!current || !current.expiresAt || current.expiresAt < Date.now()) {
        localStorage.setItem(key, JSON.stringify({ owner, expiresAt: Date.now() + 30_000 }))
        const claimed = JSON.parse(localStorage.getItem(key) || 'null') as { owner?: string } | null
        if (claimed?.owner === owner) break
      }
    } catch { throw new Error('Browser storage is unavailable, so LOCAL cannot safely coordinate model initialization across tabs. Enable site storage, then retry.') }
    await pause(250, signal)
  }
  if (signal?.aborted) throw new DOMException('Operation aborted.', 'AbortError')
  if (Date.now() >= deadline) throw new ModelLockTimeoutError(modelId, timeoutMs)
  log('lock-acquired', { lockName, api: 'local-storage-lease' })
  const heartbeat = window.setInterval(() => {
    try { const current = JSON.parse(localStorage.getItem(key) || 'null') as { owner?: string } | null; if (current?.owner === owner) localStorage.setItem(key, JSON.stringify({ owner, expiresAt: Date.now() + 30_000 })) } catch { /* storage may be unavailable */ }
  }, 5_000)
  try { return await operation() }
  finally {
    window.clearInterval(heartbeat)
    try { const current = JSON.parse(localStorage.getItem(key) || 'null') as { owner?: string } | null; if (current?.owner === owner) localStorage.removeItem(key) } catch { /* storage may be unavailable */ }
    log('lock-released', { lockName, api: 'local-storage-lease' })
  }
}
