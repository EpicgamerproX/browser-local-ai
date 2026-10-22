import type { InitProgressReport, MLCEngineInterface } from '@mlc-ai/web-llm'

export type LocalEngineSession = { engine: MLCEngineInterface; worker: Worker; runtimeVersion: string; ready: Promise<void> }
const RUNTIME_IMPORT_TIMEOUT_MS = 90_000
const WEBGPU_ADAPTER_TIMEOUT_MS = 20_000
const WORKER_STARTUP_TIMEOUT_MS = 60_000

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)} seconds.`)), timeoutMs)
    promise.then(resolve, reject).finally(() => window.clearTimeout(timer))
  })
}

function log(operationId: string, modelId: string, event: string, details: Record<string, unknown> = {}) {
  console.info('[LOCAL:model]', { timestamp: new Date().toISOString(), operationId, modelId, event, ...details })
}

export async function createLocalEngine(
  modelId: string,
  onProgress: (report: InitProgressReport) => void,
  onEngineCreated: (worker: Worker, engine: MLCEngineInterface) => void = () => undefined,
  isCancelled: () => boolean = () => false,
  operationId = 'unassigned',
): Promise<LocalEngineSession> {
  const runtimeStartedAt = performance.now()
  log(operationId, modelId, 'runtime-import-started', { timeoutMs: RUNTIME_IMPORT_TIMEOUT_MS })
  const runtime = await withTimeout(import('@mlc-ai/web-llm'), RUNTIME_IMPORT_TIMEOUT_MS, 'WebLLM runtime import')
  log(operationId, modelId, 'runtime-import-completed', { elapsedMs: Math.round(performance.now() - runtimeStartedAt), runtimeVersion: runtime.modelVersion })
  if (isCancelled()) throw new Error('Operation stopped by user.')
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown | null> } }).gpu
  if (!gpu) throw new Error('WebGPU is unavailable in this browser. Enable WebGPU or use a supported browser.')
  log(operationId, modelId, 'webgpu-adapter-check-started', { timeoutMs: WEBGPU_ADAPTER_TIMEOUT_MS })
  const adapter = await withTimeout(gpu.requestAdapter(), WEBGPU_ADAPTER_TIMEOUT_MS, 'WebGPU adapter request')
  if (!adapter) throw new Error('WebGPU is present, but this device did not provide an adapter. Check browser hardware acceleration or choose a smaller model.')
  log(operationId, modelId, 'webgpu-adapter-check-completed')
  if (isCancelled()) throw new Error('Operation stopped by user.')
  let worker: Worker
  try { worker = new Worker(new URL('./llm.worker.ts', import.meta.url), { type: 'module' }) }
  catch (error) { log(operationId, modelId, 'worker-create-failed', { error: error instanceof Error ? error.message : String(error) }); throw error }
  log(operationId, modelId, 'worker-created')
  let resolveWorkerStarted!: () => void
  let rejectWorkerStarted!: (error: Error) => void
  let workerStarted = false
  const workerStartup = new Promise<void>((resolve, reject) => { resolveWorkerStarted = resolve; rejectWorkerStarted = reject })
  const workerStartupTimer = window.setTimeout(() => rejectWorkerStarted(new Error(`Model worker did not start within ${Math.round(WORKER_STARTUP_TIMEOUT_MS / 1000)} seconds.`)), WORKER_STARTUP_TIMEOUT_MS)
  const onWorkerStarted = (event: MessageEvent) => {
    if (event.data?.kind !== 'initProgressCallback' || event.data?.content?.text !== 'Model worker ready' || workerStarted) return
    workerStarted = true
    window.clearTimeout(workerStartupTimer)
    log(operationId, modelId, 'worker-startup-completed')
    resolveWorkerStarted()
  }
  worker.addEventListener('message', onWorkerStarted)
  const engine = new runtime.WebWorkerMLCEngine(worker, {
    appConfig: { ...runtime.prebuiltAppConfig, cacheBackend: 'cache' },
    initProgressCallback: onProgress,
  })
  onEngineCreated(worker, engine)
  let rejectWorkerFailure!: (reason: Error) => void
  const workerFailure = new Promise<never>((_, reject) => { rejectWorkerFailure = reject })
  const onWorkerError = (event: ErrorEvent) => {
    const error = new Error(event.message || 'The model worker failed.')
    log(operationId, modelId, 'worker-error', { error: error.message })
    window.clearTimeout(workerStartupTimer); rejectWorkerStarted(error); rejectWorkerFailure(error)
  }
  const onWorkerMessageError = () => {
    const error = new Error('The model worker sent an unreadable message.')
    log(operationId, modelId, 'worker-message-error')
    window.clearTimeout(workerStartupTimer); rejectWorkerStarted(error); rejectWorkerFailure(error)
  }
  worker.addEventListener('error', onWorkerError, { once: true })
  worker.addEventListener('messageerror', onWorkerMessageError, { once: true })
  log(operationId, modelId, 'waiting-for-worker-startup', { timeoutMs: WORKER_STARTUP_TIMEOUT_MS })
  const reloadStartedAt = performance.now()
  const ready = Promise.race([workerStartup.then(() => {
    worker.removeEventListener('message', onWorkerStarted)
    log(operationId, modelId, 'engine-reload-started', { cacheBackend: 'cache' })
    return withTimeout(engine.reload(modelId), 30 * 60_000, 'WebLLM download and initialization')
  }), workerFailure])
    .then(() => log(operationId, modelId, 'engine-reload-completed', { elapsedMs: Math.round(performance.now() - reloadStartedAt) }))
    .finally(() => { window.clearTimeout(workerStartupTimer); worker.removeEventListener('message', onWorkerStarted); worker.removeEventListener('error', onWorkerError); worker.removeEventListener('messageerror', onWorkerMessageError) })
    .catch((error: unknown) => {
      log(operationId, modelId, 'engine-reload-failed', { error: error instanceof Error ? error.message : String(error) })
      worker.terminate()
      throw error
    })
  return { engine, worker, runtimeVersion: runtime.modelVersion, ready }
}
