import { hasModelInCache, modelVersion, prebuiltAppConfig, WebWorkerMLCEngineHandler } from '@mlc-ai/web-llm'

const handler = new WebWorkerMLCEngineHandler()
self.onmessage = (event: MessageEvent) => {
  const message = event.data as { type?: string; requestId?: string; modelId?: string }
  if (message?.type === 'CHECK_MODEL_CACHE' && message.requestId && message.modelId) {
    const appConfig = { ...prebuiltAppConfig, cacheBackend: 'cache' as const }
    void hasModelInCache(message.modelId, appConfig).then(
      (cached) => self.postMessage({ type: 'MODEL_CACHE_RESULT', requestId: message.requestId, cached, runtimeVersion: modelVersion }),
      (error: unknown) => self.postMessage({ type: 'MODEL_CACHE_RESULT', requestId: message.requestId, error: error instanceof Error ? error.message : String(error) }),
    )
    return
  }
  handler.onmessage(event)
}
self.postMessage({ kind: 'initProgressCallback', uuid: '', content: { progress: 0, timeElapsed: 0, text: 'Model worker ready' } })
