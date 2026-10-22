import type { InitProgressReport, MLCEngineInterface } from '@mlc-ai/web-llm'

export type LocalEngineSession = { engine: MLCEngineInterface; worker: Worker; runtimeVersion: string }

export async function createLocalEngine(
  modelId: string,
  onProgress: (report: InitProgressReport) => void,
): Promise<LocalEngineSession> {
  const runtime = await import('@mlc-ai/web-llm')
  const worker = new Worker(new URL('./llm.worker.ts', import.meta.url), { type: 'module' })
  try {
    const engine = await runtime.CreateWebWorkerMLCEngine(worker, modelId, {
      appConfig: { ...runtime.prebuiltAppConfig, cacheBackend: 'cache' },
      initProgressCallback: onProgress,
    })
    return { engine, worker, runtimeVersion: runtime.modelVersion }
  } catch (error) {
    worker.terminate()
    throw error
  }
}
