import type { InitProgressReport, MLCEngineInterface } from '@mlc-ai/web-llm'

export type LocalEngineSession = { engine: MLCEngineInterface; worker: Worker; runtimeVersion: string; ready: Promise<void> }

export async function createLocalEngine(
  modelId: string,
  onProgress: (report: InitProgressReport) => void,
  onEngineCreated: (worker: Worker, engine: MLCEngineInterface) => void = () => undefined,
  isCancelled: () => boolean = () => false,
): Promise<LocalEngineSession> {
  const runtime = await import('@mlc-ai/web-llm')
  if (isCancelled()) throw new Error('Operation stopped by user.')
  const worker = new Worker(new URL('./llm.worker.ts', import.meta.url), { type: 'module' })
  const engine = new runtime.WebWorkerMLCEngine(worker, {
    appConfig: { ...runtime.prebuiltAppConfig, cacheBackend: 'cache' },
    initProgressCallback: onProgress,
  })
  onEngineCreated(worker, engine)
  let rejectWorkerFailure!: (reason: Error) => void
  const workerFailure = new Promise<never>((_, reject) => { rejectWorkerFailure = reject })
  const onWorkerError = (event: ErrorEvent) => rejectWorkerFailure(new Error(event.message || 'The model worker failed.'))
  worker.addEventListener('error', onWorkerError, { once: true })
  const ready = Promise.race([engine.reload(modelId), workerFailure])
    .finally(() => worker.removeEventListener('error', onWorkerError))
    .catch((error: unknown) => { worker.terminate(); throw error })
  return { engine, worker, runtimeVersion: runtime.modelVersion, ready }
}
