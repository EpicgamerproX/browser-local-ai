import { memo, useEffect, useRef, useState } from 'react'
import type { MLCEngineInterface } from '@mlc-ai/web-llm'
import { Activity, ArrowDown, ArrowUp, Cpu, Download, LockKeyhole, Plus, ShieldCheck, Sparkles, StopCircle, Trash2, WifiOff, X } from 'lucide-react'
import { createZip, downloadBlob, makeEngineeringReport, validateProject, type ArtifactFile, type ArtifactProject } from './artifacts'
import { checkModelCache, deleteCachedModel, modelRecord, readModelRecords, withModelLock, writeModelRecord } from './modelPersistence'
import { createLocalEngine } from './localEngine'

type Message = { id: string; role: 'user' | 'assistant'; content: string }
type Stage = 'idle' | 'routing' | 'loading' | 'inference' | 'complete' | 'error'
type ModelLifecycle = 'uninitialized' | 'checking-cache' | 'download-required' | 'downloading' | 'verifying' | 'initializing' | 'warming-up' | 'ready' | 'switching' | 'failed' | 'recoverable-offline-error'
type ActiveOperation = { id: string; modelId: string; cancelled: boolean; controller: AbortController; cancel: () => void; cancelledPromise: Promise<never> }

const MODEL_ID = 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC'
const STORAGE_KEY = 'local-ai-chat-v1'
const MODEL_STORAGE_KEY = 'local-ai-model-v1'
const MODEL_INITIALIZATION_TIMEOUT_MS = 30 * 60_000
const MODELS = [
  { id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC', name: 'Qwen2.5 0.5B', params: '0.5B', category: 'Desktop / Laptop', profile: 'Lightweight', memory: '~0.95 GB VRAM', recommendation: 'Low memory devices' },
  { id: MODEL_ID, name: 'Qwen2.5 1.5B', params: '1.5B', category: 'Desktop / Laptop', profile: 'Balanced', memory: '~1.63 GB VRAM', recommendation: 'General use' },
  { id: 'Qwen2.5-3B-Instruct-q4f16_1-MLC', name: 'Qwen2.5 3B', params: '3B', category: 'Desktop / Laptop', profile: 'Enhanced', memory: '~2.51 GB VRAM', recommendation: 'Higher memory devices' },
  { id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC', name: 'Qwen2.5 0.5B', params: '0.5B', category: 'Mobile', profile: 'Mobile Lite', memory: '~0.95 GB VRAM', recommendation: 'Phone / tablet' },
  { id: MODEL_ID, name: 'Qwen2.5 1.5B', params: '1.5B', category: 'Mobile', profile: 'Mobile Balanced', memory: '~1.63 GB VRAM', recommendation: 'Modern phone; test first' },
  { id: MODEL_ID, name: 'Qwen2.5 1.5B', params: '1.5B', category: 'Mobile', profile: 'Mobile Enhanced', memory: '~1.63 GB VRAM', recommendation: 'Higher-end phone / tablet' },
] as const
const SYSTEM_PROMPT = 'You are Local, a helpful AI assistant running entirely in the user\'s browser. Be clear, accurate, and concise. If uncertain, say so. Do not claim to have used tools, searched the web, or accessed live information unless it was provided in the conversation.'

function withDeadline<T>(promise: Promise<T>, label: string, timeoutMs = MODEL_INITIALIZATION_TIMEOUT_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    const duration = timeoutMs < 60_000 ? `${Math.round(timeoutMs / 1000)} seconds` : `${Math.round(timeoutMs / 60_000)} minutes`
    const timer = window.setTimeout(() => reject(new Error(`${label} exceeded ${duration}. Stop the operation and retry; if it repeats, choose a smaller model in Models.`)), timeoutMs)
    promise.then(resolve, reject).finally(() => window.clearTimeout(timer))
  })
}

function logModelOperation(operationId: string, modelId: string, event: string, details: Record<string, unknown> = {}) {
  console.info('[LOCAL:model]', { timestamp: new Date().toISOString(), operationId, modelId, event, ...details })
}

const MessageItem = memo(function MessageItem({ message }: { message: Message }) {
  return <article className={`message ${message.role}`}><div className="message-avatar">{message.role === 'user' ? 'YOU' : <Sparkles size={16}/>}</div><div className="message-body"><div className="message-role">{message.role === 'user' ? 'YOU' : 'LOCAL / AI'}</div><div className="message-content">{message.content}</div></div></article>
})

function classifyRequest(text: string) {
  const s = text.toLowerCase()
  if (/\b(calculate|compute|\d+\s*[+*/-]\s*\d+)\b/.test(s)) return 'calculation'
  if (/\b(summarize|summary|tl;dr)\b/.test(s)) return 'summarization'
  if (/\b(code|debug|function|typescript|javascript|python)\b/.test(s)) return 'coding'
  if (text.length > 450) return 'long-input'
  return 'conversation'
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as Array<Partial<Message>>
      return saved.filter((m): m is Partial<Message> & Pick<Message, 'role' | 'content'> =>
        (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string',
      ).map((m) => ({ id: m.id || crypto.randomUUID(), role: m.role, content: m.content }))
    } catch { return [] }
  })
  const [input, setInput] = useState('')
  const [stage, setStage] = useState<Stage>('idle')
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('Model not loaded')
  const [error, setError] = useState('')
  const [modelReady, setModelReady] = useState(false)
  const [selectedModel, setSelectedModel] = useState(() => { const saved = localStorage.getItem(MODEL_STORAGE_KEY); return MODELS.some((model) => model.id === saved) ? saved as string : MODEL_ID })
  const [loadedModel, setLoadedModel] = useState('')
  const [showModels, setShowModels] = useState(false)
  const [cachedModels, setCachedModels] = useState<Record<string, boolean>>({})
  const [modelStatuses, setModelStatuses] = useState<Record<string, string>>({})
  const [modelLifecycle, setModelLifecycle] = useState<Record<string, ModelLifecycle>>({})
  const [persistentStorage, setPersistentStorage] = useState<'checking' | 'granted' | 'not-granted' | 'unsupported'>('checking')
  const [storageEstimate, setStorageEstimate] = useState('Checking browser storage…')
  const [appShellReady, setAppShellReady] = useState(() => Boolean(navigator.serviceWorker?.controller))
  const [appUpdateAvailable, setAppUpdateAvailable] = useState(false)
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)
  const [showStudio, setShowStudio] = useState(false)
  const [studioPrompt, setStudioPrompt] = useState('')
  const [studioBusy, setStudioBusy] = useState(false)
  const [studioError, setStudioError] = useState('')
  const [projects, setProjects] = useState<ArtifactProject[]>(() => {
    try { const value: unknown = JSON.parse(localStorage.getItem('local-ai-artifacts-v1') || '[]'); return Array.isArray(value) ? value as ArtifactProject[] : [] } catch { return [] }
  })
  const [activeProjectId, setActiveProjectId] = useState('')
  const [activeFilePath, setActiveFilePath] = useState('')
  const [libraryQuery, setLibraryQuery] = useState('')
  const [previewHtml, setPreviewHtml] = useState(false)
  const [reportInput, setReportInput] = useState({ title: 'Ohm’s Law Calculation', objective: '', voltage: '', current: '', resistance: '' })
  const [busy, setBusy] = useState(false)
  const [lastRoute, setLastRoute] = useState('No request yet')
  const [metrics, setMetrics] = useState({ shellReadyMs: 0, cacheLookupMs: null as number | null, modelInitMs: null as number | null, readinessProbeMs: null as number | null, firstOutputMs: null as number | null, outputChunksPerSecond: null as number | null, modelSwitchMs: null as number | null })
  const engineRef = useRef<MLCEngineInterface | null>(null)
  const workerRef = useRef<Worker | null>(null)
  const loadedModelRef = useRef('')
  const lifecycleRef = useRef(new Map<string, Promise<MLCEngineInterface>>())
  const activeOperationRef = useRef<ActiveOperation | null>(null)
  const endRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    setMetrics((value) => ({ ...value, shellReadyMs: Math.round(performance.now()) }))
    let active = true
    const selectedId = selectedModel
    const operation = beginOperation(selectedId)
    const applyCacheResult = (id: string, result: { cached: boolean; runtimeVersion: string }) => {
      if (!active || operation.cancelled) return
      setCachedModels((current) => ({ ...current, [id]: result.cached }))
      const old = readModelRecords()[id]
      if (!result.cached) {
        setModelStatuses((current) => ({ ...current, [id]: 'Not downloaded' }))
        if (old?.status === 'verified' || old?.status === 'ready') writeModelRecord({ ...old, status: 'missing', updatedAt: Date.now() })
      } else if (old?.runtimeVersion === result.runtimeVersion && (old.status === 'verified' || old.status === 'ready')) {
        setModelStatuses((current) => ({ ...current, [id]: 'Downloaded and runtime-verified; checking runtime' }))
      } else {
        setModelStatuses((current) => ({ ...current, [id]: 'Downloaded; verification needed' }))
        writeModelRecord(modelRecord(id, result.runtimeVersion, 'downloaded'))
      }
    }
    void (async () => {
      setBusy(true); setStage('loading'); setStatus('Checking the selected model cache…')
      setModelLifecycle((current) => ({ ...current, [selectedId]: 'checking-cache' }))
      try {
        const selectedCache = await checkModelCache(selectedId, { signal: operation.controller.signal, operationId: operation.id })
        if (!active || operation.cancelled) return
        setMetrics((current) => ({ ...current, cacheLookupMs: selectedCache.durationMs }))
        applyCacheResult(selectedId, selectedCache)
        if (selectedCache.cached) {
          await loadModel(selectedId, true, operation, selectedCache)
        } else {
          setModelLifecycle((current) => ({ ...current, [selectedId]: 'download-required' }))
          setStatus('Selected model is not downloaded. Open Models and choose Download & Load.')
          setError('This model is not cached on this device yet. Choose Download & Load in Models to begin.')
          setShowModels(true); setStage('error')
        }
      } catch (cause) {
        if (active && !operation.cancelled) {
          const message = cause instanceof Error ? cause.message : 'Could not inspect the selected model cache.'
          setModelLifecycle((current) => ({ ...current, [selectedId]: 'failed' }))
          setModelStatuses((current) => ({ ...current, [selectedId]: `Cache check failed: ${message}` }))
          setError(message); setStatus('Model cache check failed'); setShowModels(true); setStage('error')
        }
      } finally {
        if (active && activeOperationRef.current === operation) { setBusy(false); finishOperation(operation) }
      }
    })()
    return () => { active = false; operation.cancel(); finishOperation(operation) }
  }, [])

  useEffect(() => {
    const checkUpdate = () => navigator.serviceWorker?.controller?.postMessage('CHECK_APP_UPDATE')
    const updateController = () => { setAppShellReady(Boolean(navigator.serviceWorker?.controller)); checkUpdate() }
    const updateOnline = () => setIsOnline(navigator.onLine)
    const updateMessage = (event: MessageEvent) => { if (event.data?.type === 'APP_UPDATE_READY') setAppUpdateAvailable(true) }
    navigator.serviceWorker?.addEventListener('controllerchange', updateController)
    navigator.serviceWorker?.addEventListener('message', updateMessage)
    window.addEventListener('online', updateOnline); window.addEventListener('offline', updateOnline)
    checkUpdate()
    return () => { navigator.serviceWorker?.removeEventListener('controllerchange', updateController); navigator.serviceWorker?.removeEventListener('message', updateMessage); window.removeEventListener('online', updateOnline); window.removeEventListener('offline', updateOnline) }
  }, [])

  function beginOperation(modelId = selectedModel): ActiveOperation {
    if (activeOperationRef.current) return activeOperationRef.current
    let rejectCancelled!: (reason: Error) => void
    const cancelledPromise = new Promise<never>((_, reject) => { rejectCancelled = reject })
    void cancelledPromise.catch(() => undefined)
    const operation: ActiveOperation = {
      id: crypto.randomUUID(),
      modelId,
      cancelled: false,
      controller: new AbortController(),
      cancelledPromise,
      cancel: () => { if (operation.cancelled) return; operation.cancelled = true; logModelOperation(operation.id, operation.modelId, 'operation-cancelled'); operation.controller.abort(); rejectCancelled(new Error('Operation stopped by user.')) },
    }
    activeOperationRef.current = operation
    return operation
  }

  function finishOperation(operation: ActiveOperation) {
    if (activeOperationRef.current === operation) activeOperationRef.current = null
  }

  function stopOperations() {
    const operation = activeOperationRef.current
    operation?.cancel()
    if (operation) finishOperation(operation)
    const engine = engineRef.current
    const worker = workerRef.current
    try { engine?.interruptGenerate() } catch { /* The worker may already have stopped. */ }
    const unload = engine?.unload().catch(() => undefined) || Promise.resolve()
    if (worker) {
      const shutdownLimit = new Promise<void>((resolve) => window.setTimeout(resolve, 1500))
      void Promise.race([unload, shutdownLimit]).finally(() => worker.terminate())
    }
    workerRef.current = null
    engineRef.current = null
    loadedModelRef.current = ''
    lifecycleRef.current.clear()
    setModelReady(false); setLoadedModel(''); setProgress(0); setBusy(false); setStudioBusy(false)
    setStage('idle'); setStatus('All AI operations stopped'); setError(''); setStudioError('')
    setModelLifecycle((current) => ({ ...current, [selectedModel]: 'uninitialized' }))
    setModelStatuses((current) => ({ ...current, [selectedModel]: 'Stopped by user; cached model files retained' }))
  }

  useEffect(() => {
    let active = true
    void (async () => {
      if (!navigator.storage) { setPersistentStorage('unsupported'); setStorageEstimate('Storage details are not available in this browser.'); return }
      try {
        const [persisted, estimate] = await Promise.all([navigator.storage.persisted(), navigator.storage.estimate()])
        if (!active) return
        setPersistentStorage(persisted ? 'granted' : 'not-granted')
        const used = estimate.usage == null ? 'unknown' : `${(estimate.usage / 1_000_000_000).toFixed(2)} GB used`
        const quota = estimate.quota == null ? 'unknown quota' : `${(estimate.quota / 1_000_000_000).toFixed(2)} GB origin quota`
        setStorageEstimate(`${used} · ${quota}`)
      } catch { if (active) { setPersistentStorage('unsupported'); setStorageEstimate('Could not read browser storage status.') } }
    })()
    return () => { active = false }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(messages)), 500)
    return () => window.clearTimeout(timer)
  }, [messages])
  useEffect(() => {
    try { localStorage.setItem('local-ai-artifacts-v1', JSON.stringify(projects)) }
    catch { setStudioError('Local artifact storage is full or unavailable. Download a backup before continuing.') }
  }, [projects])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, stage])

  async function ensureModelLoaded(modelToLoad: string, operationOverride?: ActiveOperation, knownCache?: { cached: boolean; runtimeVersion: string; durationMs?: number }): Promise<MLCEngineInterface> {
    const operation = operationOverride || activeOperationRef.current
    const operationId = operation?.id || crypto.randomUUID()
    logModelOperation(operationId, modelToLoad, 'ensure-model-loaded-entered', { alreadyLoading: lifecycleRef.current.has(modelToLoad) })
    const inFlight = lifecycleRef.current.get(modelToLoad)
    if (inFlight) return inFlight
    const raceCancellation = <T,>(promise: Promise<T>) => operation ? Promise.race([promise, operation.cancelledPromise]) : promise
    const initialization = withModelLock(modelToLoad, async () => {
      if (operation?.cancelled) throw new Error('Operation stopped by user.')
      if (engineRef.current && loadedModelRef.current === modelToLoad) return engineRef.current
      if (!("gpu" in navigator)) throw new Error('WebGPU is unavailable. No remote fallback is used.')
      const switchStartedAt = performance.now()
      const cacheStartedAt = performance.now()
      logModelOperation(operationId, modelToLoad, 'cache-lookup-started', { knownCache: Boolean(knownCache) })
      setModelLifecycle((current) => ({ ...current, [modelToLoad]: 'checking-cache' }))
      setModelStatuses((current) => ({ ...current, [modelToLoad]: 'Checking persistent cache' }))
      setStatus('Checking the local model cache...')
      const cache = knownCache || await raceCancellation(checkModelCache(modelToLoad, { signal: operation?.controller.signal, operationId }))
      logModelOperation(operationId, modelToLoad, 'cache-lookup-completed', { cached: cache.cached, elapsedMs: Math.round(performance.now() - cacheStartedAt) })
      setMetrics((value) => ({ ...value, cacheLookupMs: performance.now() - cacheStartedAt }))
      if (!cache.cached) setModelLifecycle((current) => ({ ...current, [modelToLoad]: 'download-required' }))
      if (!cache.cached && !navigator.onLine) { setModelLifecycle((current) => ({ ...current, [modelToLoad]: 'recoverable-offline-error' })); throw new Error('This model is not cached and the device is offline. Reconnect, then choose Download & Load in Models.') }
      setModelLifecycle((current) => ({ ...current, [modelToLoad]: cache.cached ? 'initializing' : 'downloading' }))
      setModelStatuses((current) => ({ ...current, [modelToLoad]: cache.cached ? 'Initializing cached model' : 'Downloading model' }))
      const previousEngine = engineRef.current
      if (previousEngine) {
        setModelLifecycle((current) => ({ ...current, [modelToLoad]: 'switching' }))
        setModelStatuses((current) => ({ ...current, [modelToLoad]: 'Switching models ? releasing previous model' }))
        await raceCancellation(previousEngine.unload())
        workerRef.current?.terminate()
        workerRef.current = null; engineRef.current = null; loadedModelRef.current = ''
      }
      const initStartedAt = performance.now()
      setModelLifecycle((current) => ({ ...current, [modelToLoad]: 'initializing' }))
      setStatus('Loading WebLLM runtime and checking WebGPU adapter…')
      const session = await raceCancellation(createLocalEngine(modelToLoad, (report) => {
        if (operation?.cancelled || activeOperationRef.current !== operation) return
        logModelOperation(operationId, modelToLoad, 'progress-callback', { progress: report.progress, text: report.text })
        setProgress(Math.max(0, Math.min(100, Math.round((report.progress ?? 0) * 100))))
        setStatus(report.text || (cache.cached ? 'Initializing cached model...' : 'Downloading model...'))
      }, (worker, engine) => {
        if (operation?.cancelled) { worker.terminate(); return }
        setStatus('Starting the local model worker…')
        workerRef.current = worker; engineRef.current = engine
      }, () => Boolean(operation?.cancelled), operationId))
      const engine = session.engine
      engineRef.current = engine; workerRef.current = session.worker
      try { await raceCancellation(withDeadline(session.ready, 'Model initialization')) }
      catch (error) {
        const unload = session.engine.unload().catch(() => undefined)
        let shutdownTimer = 0
        await Promise.race([unload, new Promise<void>((resolve) => { shutdownTimer = window.setTimeout(resolve, 1500) })])
        window.clearTimeout(shutdownTimer)
        session.worker.terminate()
        if (engineRef.current === session.engine) engineRef.current = null
        if (workerRef.current === session.worker) workerRef.current = null
        throw error
      }
      const initMs = performance.now() - initStartedAt
      setMetrics((value) => ({ ...value, modelInitMs: initMs, modelSwitchMs: previousEngine ? performance.now() - switchStartedAt : value.modelSwitchMs }))
      setCachedModels((current) => ({ ...current, [modelToLoad]: true }))
      writeModelRecord(modelRecord(modelToLoad, session.runtimeVersion, 'downloaded'))
      setModelLifecycle((current) => ({ ...current, [modelToLoad]: 'verifying' }))
      setModelStatuses((current) => ({ ...current, [modelToLoad]: 'Verifying local inference readiness' }))
      const probeStartedAt = performance.now()
      logModelOperation(operationId, modelToLoad, 'readiness-probe-started')
      const probe = await raceCancellation(withDeadline(engine.chat.completions.create({ messages: [{ role: 'user', content: 'Reply with only OK.' }], temperature: 0, max_tokens: 4, stream: false }), 'Model readiness check', 10 * 60_000))
      const readinessProbeMs = performance.now() - probeStartedAt
      logModelOperation(operationId, modelToLoad, 'readiness-probe-completed', { elapsedMs: Math.round(readinessProbeMs) })
      if (typeof probe.choices[0]?.message.content !== 'string' || !probe.choices[0].message.content.trim()) throw new Error('Model loaded, but the validation inference returned no text.')
      setMetrics((value) => ({ ...value, readinessProbeMs }))
      writeModelRecord(modelRecord(modelToLoad, session.runtimeVersion, 'ready', { verifiedAt: Date.now() }))
      setModelLifecycle((current) => ({ ...current, [modelToLoad]: 'ready' }))
      setModelStatuses((current) => ({ ...current, [modelToLoad]: 'Ready ? local inference verified' }))
      setLoadedModel(modelToLoad); loadedModelRef.current = modelToLoad; setModelReady(true)
      logModelOperation(operationId, modelToLoad, 'operation-completed', { elapsedMs: Math.round(performance.now() - initStartedAt) })
      return engine
    }, operation?.controller.signal, { operationId, onWaiting: () => { logModelOperation(operationId, modelToLoad, 'waiting-for-model-lock'); setStatus('Waiting for another tab to finish preparing this model…') } })
    const trackedInitialization = raceCancellation(initialization)
    lifecycleRef.current.set(modelToLoad, trackedInitialization)
    try { return await trackedInitialization }
    finally { if (lifecycleRef.current.get(modelToLoad) === trackedInitialization) lifecycleRef.current.delete(modelToLoad) }
  }

  async function loadModel(modelToLoad = selectedModel, fromStartup = false, parentOperation?: ActiveOperation, knownCache?: { cached: boolean; runtimeVersion: string; durationMs?: number }) {
    if ((engineRef.current && loadedModelRef.current === modelToLoad && modelReady) || (busy && !parentOperation)) return
    const operation = parentOperation || beginOperation(modelToLoad)
    logModelOperation(operation.id, modelToLoad, 'load-model-entered', { fromStartup })
    setBusy(true); setStage('loading'); setError(''); setProgress(0); setStatus('Preparing browser runtime...')
    try {
      if (!fromStartup && navigator.storage?.persist) setPersistentStorage(await Promise.race([navigator.storage.persist().then((granted): 'granted' | 'not-granted' => granted ? 'granted' : 'not-granted').catch((): 'not-granted' => 'not-granted'), operation.cancelledPromise]))
      await ensureModelLoaded(modelToLoad, operation, knownCache)
      setStage('idle'); setStatus('Model ready on this device'); setProgress(100)
      if (navigator.storage?.estimate) {
        const estimate = await navigator.storage.estimate()
        setStorageEstimate(`${estimate.usage == null ? 'unknown' : `${(estimate.usage / 1_000_000_000).toFixed(2)} GB used`} · ${estimate.quota == null ? 'unknown quota' : `${(estimate.quota / 1_000_000_000).toFixed(2)} GB origin quota`}`)
      }
    } catch (cause) {
      if (operation.cancelled) { logModelOperation(operation.id, modelToLoad, 'operation-cancelled'); return }
      const message = cause instanceof Error ? cause.message : 'Could not initialize the local model.'
      logModelOperation(operation.id, modelToLoad, 'operation-failed', { error: message })
      const ownsFailedSession = loadedModelRef.current === modelToLoad || (!loadedModelRef.current && Boolean(workerRef.current))
      if (ownsFailedSession) {
        const failedEngine = engineRef.current
        const failedWorker = workerRef.current
        engineRef.current = null; workerRef.current = null; loadedModelRef.current = ''
        if (failedEngine) {
          const shutdown = failedEngine.unload().catch(() => undefined)
          if (failedWorker) {
            const shutdownLimit = new Promise<void>((resolve) => window.setTimeout(resolve, 1500))
            void Promise.race([shutdown, shutdownLimit]).finally(() => failedWorker.terminate())
          }
        } else failedWorker?.terminate()
        setModelReady(false); setLoadedModel('')
      }
      setModelLifecycle((current) => ({ ...current, [modelToLoad]: message.includes('offline') ? 'recoverable-offline-error' : 'failed' }))
      setModelStatuses((current) => ({ ...current, [modelToLoad]: `Needs recovery: ${message}` }))
      const cacheVersion = readModelRecords()[modelToLoad]?.runtimeVersion || 'unknown'
      writeModelRecord(modelRecord(modelToLoad, cacheVersion, 'error', { error: message }))
      setStage('error'); setError(message); setStatus('Model could not be loaded')
      setShowModels(true)
    } finally {
      if (!parentOperation && activeOperationRef.current === operation) { setBusy(false); finishOperation(operation) }
    }
  }

  async function sendMessage() {
    const prompt = input.trim()
    if (!prompt || busy) return
    const operation = beginOperation()
    setBusy(true); setStage('loading'); setStatus('Checking the local model cache...')
    let cacheResult: { cached: boolean; runtimeVersion: string; durationMs?: number } | undefined
    let modelIsCached = Boolean(engineRef.current && loadedModelRef.current === selectedModel)
    try { if (!modelIsCached) { cacheResult = await Promise.race([checkModelCache(selectedModel, { signal: operation.controller.signal, operationId: operation.id }), operation.cancelledPromise]); modelIsCached = cacheResult.cached } }
    catch (cause) {
      if (!operation.cancelled) { setShowModels(true); setError(cause instanceof Error ? cause.message : 'Could not inspect the local model cache.'); setStage('error') }
      if (activeOperationRef.current === operation) { setBusy(false); finishOperation(operation) }
      return
    }
    if (!modelIsCached) {
      setShowModels(true); setError('Choose Download & Load in the model manager before your first inference. This avoids an unexpected model download.')
      if (activeOperationRef.current === operation) { setBusy(false); setStage('idle'); finishOperation(operation) }
      return
    }
    setInput(''); setError('')
    const userMessage: Message = { id: crypto.randomUUID(), role: 'user', content: prompt }
    const assistantId = crypto.randomUUID()
    const next = [...messages, userMessage]
    setMessages([...next, { id: assistantId, role: 'assistant', content: '' }])
    setBusy(true); setStage('routing')
    const route = classifyRequest(prompt)
    setLastRoute(route)
    try {
      setStage('loading'); setStatus('Checking persistent model cache...')
      const engine = await Promise.race([ensureModelLoaded(selectedModel, operation, cacheResult), operation.cancelledPromise])
      setStage('inference'); setStatus(`Running local inference · ${route}`)
      const context = next.slice(-9).map((m) => ({ role: m.role, content: m.content })) as Array<{ role: 'user' | 'assistant'; content: string }>
      const generationStartedAt = performance.now()
      const generation = engine.chat.completions.create({
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...context,
        ],
        temperature: 0.7,
        max_tokens: 700,
        stream: true,
      })
      const stream = await Promise.race([generation, operation.cancelledPromise])
      let answer = ''
      let lastCommit = 0
      let firstOutputMs: number | null = null
      let outputChunks = 0
      const iterator = stream[Symbol.asyncIterator]()
      while (true) {
        const next = await Promise.race([iterator.next(), operation.cancelledPromise])
        if (next.done) break
        const chunk = next.value
        const content = chunk.choices[0]?.delta?.content || ''
        if (content) { outputChunks += 1; if (firstOutputMs === null) firstOutputMs = performance.now() - generationStartedAt }
        answer += content
        const now = performance.now()
        if (now - lastCommit >= 50) {
          lastCommit = now
          const snapshot = answer
          setMessages((current) => current.map((m) => m.id === assistantId ? { ...m, content: snapshot } : m))
        }
      }
      setMessages((current) => current.map((m) => m.id === assistantId ? { ...m, content: answer } : m))
      setCachedModels((current) => ({ ...current, [selectedModel]: true }))
      const generationSeconds = (performance.now() - generationStartedAt) / 1000
      setMetrics((value) => ({ ...value, firstOutputMs, outputChunksPerSecond: generationSeconds > 0 ? outputChunks / generationSeconds : null }))
      setStage('complete'); setStatus('Response generated locally')
    } catch (e) {
      if (!operation.cancelled) {
      const message = e instanceof Error ? e.message : 'Something went wrong during local inference.'
      setError(message); setStage('error'); setStatus('Local inference failed')
      }
      // Keep any partial response so the user can still read it after a failure.
    } finally { if (activeOperationRef.current === operation) { setBusy(false); finishOperation(operation) }; inputRef.current?.focus() }
  }

  function clearChat() {
    setMessages([]); localStorage.removeItem(STORAGE_KEY); setError(''); setStage('idle'); setLastRoute('No request yet')
  }

  const activeProject = projects.find((project) => project.id === activeProjectId) || projects[0]
  const activeFile = activeProject?.files.find((file) => file.path === activeFilePath) || activeProject?.files[0]
  function saveProject(project: ArtifactProject) {
    setProjects((current) => [project, ...current.filter((item) => item.id !== project.id)])
    setActiveProjectId(project.id); setActiveFilePath(project.files[0]?.path || '')
  }
  async function generateProject() {
    if (!studioPrompt.trim() || studioBusy) return
    setStudioError('')
    let operation: ActiveOperation | null = null
    try {
      operation = beginOperation()
      setStudioBusy(true); setBusy(true); setStatus('Preparing project generation...')
      const cacheResult = (!engineRef.current || loadedModelRef.current !== selectedModel)
        ? await Promise.race([checkModelCache(selectedModel, { signal: operation.controller.signal, operationId: operation.id }), operation.cancelledPromise])
        : undefined
      if (cacheResult && !cacheResult.cached) {
        setShowModels(true); throw new Error('Choose Download & Load in the model manager first; project generation will not trigger a model download unexpectedly.')
      }
      if (!engineRef.current || loadedModelRef.current !== selectedModel) await loadModel(selectedModel, false, operation, cacheResult)
      const engine = engineRef.current
      if (!engine || loadedModelRef.current !== selectedModel) throw new Error('Load a compatible WebGPU model before generating a project.')
      setStudioBusy(true); setBusy(true)
      const result = await Promise.race([engine.chat.completions.create({
        messages: [
          { role: 'system', content: 'Return only one JSON object: {"title":"...","files":[{"path":"relative/path.ext","content":"complete text"}]}. Generate a small, complete multi-file student project for the request. Use only text files with supported extensions: html, css, js, ts, py, c, h, cpp, java, ino, json, csv, txt, md, svg, sp, cir, net, ini, toml, yml, yaml. Include a README.md with setup and limitations. Do not use markdown fences or add fields other than title and files.' },
          { role: 'user', content: studioPrompt },
        ], temperature: 0.2, max_tokens: 1400, stream: false,
      }), operation.cancelledPromise])
      const text = result.choices[0]?.message.content
      if (typeof text !== 'string') throw new Error('The model returned no project manifest.')
      const parsed: unknown = JSON.parse(text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''))
      if (!parsed || typeof parsed !== 'object') throw new Error('The model response was not a project manifest.')
      const manifest = parsed as Record<string, unknown>
      if (!Array.isArray(manifest.files)) throw new Error('Project manifest is missing its files list.')
      const project = validateProject(typeof manifest.title === 'string' ? manifest.title : studioPrompt.slice(0, 70), manifest.files)
      saveProject(project)
    } catch (cause) { if (!operation?.cancelled) setStudioError(cause instanceof Error ? cause.message : 'Project generation failed.') }
    finally { if (operation && activeOperationRef.current === operation) { setStudioBusy(false); setBusy(false); finishOperation(operation) } }
  }
  function updateActiveFile(content: string) {
    if (!activeProject || !activeFile) return
    setProjects((current) => current.map((project) => project.id === activeProject.id ? { ...project, files: project.files.map((file) => file.path === activeFile.path ? { ...file, content, status: 'edited', validationStatus: 'not-run', warnings: ['Edited locally; not executed or independently verified.'] } : file) } : project))
  }
  function downloadFile(file: ArtifactFile) { downloadBlob(new Blob([file.content], { type: file.mime }), file.path.split('/').pop() || 'artifact.txt') }
  function downloadProject(project: ArtifactProject) { downloadBlob(createZip(project.files), `${project.title.replace(/[^a-z0-9-_]+/gi, '-').toLowerCase() || 'project'}.zip`) }
  async function removeCachedModel(modelId: string) {
    try {
      await deleteCachedModel(modelId)
      setCachedModels((value) => ({ ...value, [modelId]: false })); setModelStatuses((value) => ({ ...value, [modelId]: 'Not downloaded' }))
      const cache = await checkModelCache(modelId).catch(() => ({ runtimeVersion: 'unknown' })); writeModelRecord(modelRecord(modelId, cache.runtimeVersion, 'missing'))
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not remove cached model.') }
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Sparkles size={19} /></div><div><strong>LOCAL<span>.</span></strong><small>BROWSER INTELLIGENCE</small></div></div>
      <button className="new-chat" onClick={clearChat}><Plus size={16} /> New conversation</button>
      <div className="side-label">RUNTIME</div>
      <div className="runtime-card"><div className={`status-dot ${modelReady ? 'ready' : ''}`} /><div className="runtime-copy"><strong>{modelReady ? 'Model ready' : 'Local runtime'}</strong><span>{modelReady ? 'Running on this device' : 'No server connection'}</span></div></div>
      <div className="side-label">PIPELINE</div>
      <div className={`pipeline-step ${stage === 'routing' ? 'active' : ''}`}><span>01</span><div><strong>Request routing</strong><small>Classify task</small></div><Activity size={15}/></div>
      <div className={`pipeline-step ${stage === 'loading' ? 'active' : ''}`}><span>02</span><div><strong>Model preparation</strong><small>Load local weights</small></div><Download size={15}/></div>
      <div className={`pipeline-step ${stage === 'inference' ? 'active' : ''}`}><span>03</span><div><strong>Inference</strong><small>Generate tokens</small></div><Cpu size={15}/></div>
      <div className={`pipeline-step ${stage === 'complete' ? 'active' : ''}`}><span>04</span><div><strong>Response assembly</strong><small>Return answer</small></div><ShieldCheck size={15}/></div>
      <div className="sidebar-bottom"><div className="privacy-icon"><LockKeyhole size={16}/></div><div><strong>Private by design</strong><p>Prompts are processed in your browser. No AI backend is configured.</p></div></div>
    </aside>

    <main className="main-panel">
      <header className="topbar"><div className="mobile-brand"><Sparkles size={17}/> LOCAL<span>.</span></div><div className="top-meta"><span className="live-pill"><i/> CLIENT-SIDE ONLY</span><span className="model-name">{loadedModel || selectedModel}</span></div><button className="manager-button stop-operations" onClick={stopOperations} disabled={!busy} aria-label={busy ? 'Stop current operation' : 'No operation to stop'}><StopCircle size={15}/> Stop operations</button><button className="manager-button" onClick={() => setShowModels((value) => !value)}>Models</button><button className="icon-button" title="Clear conversation" onClick={clearChat}><Trash2 size={17}/></button></header>
      {showModels && <section className="model-manager"><div className="manager-heading"><div><small>LOCAL MODEL LIBRARY</small><h2>Choose a model</h2><p>Models run on this device. WebLLM uses its persistent Cache API backend. Download estimates are not published in the installed model registry.</p>{appUpdateAvailable && <p className="storage-note">An updated application shell is cached. <button className="manager-button" onClick={() => window.location.reload()}>Reload to update</button></p>}<p className="storage-note">Network: {isOnline ? 'online' : 'offline'} · App shell: {appShellReady ? 'controlled by service worker' : 'not yet controlled'} · Current model: {modelReady && loadedModel === selectedModel ? (appShellReady ? 'ready for offline use' : 'loaded; offline shell not confirmed') : 'not ready'}</p><p className="storage-note">Storage: {persistentStorage}. {storageEstimate}. Browser storage may still be cleared or evicted.</p><p className="storage-note">Measured in this session (state: {modelLifecycle[selectedModel] || 'uninitialized'}): shell interactive {metrics.shellReadyMs} ms after navigation | cache lookup {metrics.cacheLookupMs == null ? 'n/a' : `${metrics.cacheLookupMs.toFixed(0)} ms`} | model initialization {metrics.modelInitMs == null ? 'n/a' : `${(metrics.modelInitMs / 1000).toFixed(1)} s`} | readiness probe {metrics.readinessProbeMs == null ? 'n/a' : `${(metrics.readinessProbeMs / 1000).toFixed(1)} s`} | first output {metrics.firstOutputMs == null ? 'n/a' : `${(metrics.firstOutputMs / 1000).toFixed(2)} s`} | streamed chunks/s {metrics.outputChunksPerSecond == null ? 'n/a' : metrics.outputChunksPerSecond.toFixed(1)} | model switch {metrics.modelSwitchMs == null ? 'n/a' : `${(metrics.modelSwitchMs / 1000).toFixed(1)} s`}. Output chunks/s is not token/s. No pre-change device baseline or network byte trace is available.</p>{persistentStorage === 'not-granted' && <button className="manager-button" onClick={() => { void navigator.storage?.persist().then((granted) => setPersistentStorage(granted ? 'granted' : 'not-granted')) }}>Ask browser to preserve storage</button>}{modelReady && <button className="manager-button" onClick={() => { void engineRef.current?.unload().then(() => { workerRef.current?.terminate(); workerRef.current = null; engineRef.current = null; loadedModelRef.current = ''; setModelReady(false); setLoadedModel(''); setStatus('Model unloaded') }).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not unload model.')) }}>Unload current model</button>}</div><button className="icon-button" aria-label="Close model manager" onClick={() => setShowModels(false)}><X size={17}/></button></div>
        {(['Desktop / Laptop', 'Mobile'] as const).map((category) => <div className="model-category" key={category}><h3>{category}</h3><div className="model-grid">{MODELS.filter((model) => model.category === category).map((model, index) => <article className={`model-card ${selectedModel === model.id ? 'selected' : ''}`} key={`${category}-${index}`}><div className="model-card-top"><strong>{model.profile}</strong><span>{cachedModels[model.id] === undefined ? (modelStatuses[model.id] || 'CACHE NOT CHECKED') : cachedModels[model.id] ? (modelStatuses[model.id] || 'CACHED') : 'NOT DOWNLOADED'}</span></div><h4>{model.name}</h4><p>{model.params} parameters · Q4F16 quantization</p><p>{model.recommendation}</p><small>Runtime estimate: {model.memory}. Download size varies; WebLLM reports transfer progress during loading.</small><div className="model-actions"><button onClick={() => { setSelectedModel(model.id); localStorage.setItem(MODEL_STORAGE_KEY, model.id) }}>Select</button><button className="primary-action" disabled={busy || (loadedModel === model.id && modelReady)} onClick={() => { setSelectedModel(model.id); localStorage.setItem(MODEL_STORAGE_KEY, model.id); void loadModel(model.id) }}>{loadedModel === model.id && modelReady ? 'Loaded' : cachedModels[model.id] === undefined ? 'Load / Download' : cachedModels[model.id] ? 'Load model' : 'Download & load'}</button>{cachedModels[model.id] && <button disabled={busy || loadedModel === model.id} onClick={() => { void removeCachedModel(model.id) }}>Delete cache</button>}</div></article>)}</div></div>)}
        <p className="storage-note">Cache is managed by WebLLM. Browser storage may be cleared or evicted. Mobile Balanced and Enhanced currently share the same verified 1.5B artifact.</p>
      </section>}
      <button className="studio-launch" onClick={() => { setShowModels(false); setShowStudio(true) }}>Code Studio &amp; Reports</button>
      {showStudio && <section className="studio-overlay"><header className="studio-header"><div><small>LOCAL WORKSPACE</small><h2>Code Studio &amp; Engineering Reports</h2><p>Generated files stay in this browser. Code is not executed here.</p></div><button className="icon-button" aria-label="Close workspace" onClick={() => setShowStudio(false)}><X size={18}/></button></header>
        <div className="studio-layout"><aside className="studio-tools"><h3>New project</h3><textarea value={studioPrompt} onChange={(event) => setStudioPrompt(event.target.value)} placeholder="Describe a multi-file student project…" rows={4}/><button className="primary-action" disabled={!studioPrompt.trim() || studioBusy} onClick={() => void generateProject()}>{studioBusy ? 'Generating locally…' : 'Generate project'}</button>
          <h3>Engineering report · Ohm’s law</h3><input value={reportInput.title} onChange={(event) => setReportInput({ ...reportInput, title: event.target.value })} aria-label="Report title" placeholder="Report title"/><textarea value={reportInput.objective} onChange={(event) => setReportInput({ ...reportInput, objective: event.target.value })} placeholder="Objective" rows={2}/><div className="report-inputs"><input inputMode="decimal" value={reportInput.voltage} onChange={(event) => setReportInput({ ...reportInput, voltage: event.target.value })} placeholder="Voltage (V)"/><input inputMode="decimal" value={reportInput.current} onChange={(event) => setReportInput({ ...reportInput, current: event.target.value })} placeholder="Current (A)"/><input inputMode="decimal" value={reportInput.resistance} onChange={(event) => setReportInput({ ...reportInput, resistance: event.target.value })} placeholder="Resistance (Ω)"/></div><button onClick={() => { try { saveProject(makeEngineeringReport(reportInput)); setStudioError('') } catch (cause) { setStudioError(cause instanceof Error ? cause.message : 'Could not create report.') } }}>Generate calculation report</button>
          <h3>Saved locally ({projects.length})</h3><input value={libraryQuery} onChange={(event) => setLibraryQuery(event.target.value)} placeholder="Search projects and files" aria-label="Search artifacts"/>{projects.filter((project) => `${project.title} ${project.files.map((file) => file.path).join(' ')}`.toLowerCase().includes(libraryQuery.toLowerCase())).map((project) => <div className="library-item" key={project.id}><button onClick={() => { setActiveProjectId(project.id); setActiveFilePath(project.files[0]?.path || '') }}>{project.title} <small>{project.files.length} files</small></button><button aria-label={`Rename ${project.title}`} onClick={() => { const title = window.prompt('Rename project', project.title); if (title?.trim()) setProjects((items) => items.map((item) => item.id === project.id ? { ...item, title: title.trim().slice(0, 100) } : item)) }}>✎</button><button aria-label={`Delete ${project.title}`} onClick={() => { setProjects((items) => items.filter((item) => item.id !== project.id)); if (activeProjectId === project.id) setActiveProjectId('') }}>×</button></div>)}<small className="studio-warning">Browser storage may be cleared or evicted. Download project backups.</small>
        </aside><div className="studio-editor">{studioError && <div className="error-panel"><p>{studioError}</p></div>}{activeProject ? <><div className="project-toolbar"><strong>{activeProject.title}</strong><span>{activeProject.files.length} files · {new Date(activeProject.createdAt).toLocaleDateString()}</span><button onClick={() => downloadProject(activeProject)}>Download ZIP</button></div><div className="project-content"><nav className="file-tree">{activeProject.files.map((file) => <button className={activeFile?.path === file.path ? 'active' : ''} key={file.path} onClick={() => { setActiveFilePath(file.path); setPreviewHtml(false) }}>{file.path}<small>{file.status}</small></button>)}</nav><div className="file-editor">{activeFile ? <><div className="file-toolbar"><span>{activeFile.path} · {new Blob([activeFile.content]).size.toLocaleString()} bytes</span><button onClick={() => downloadFile(activeFile)}>Download file</button>{(activeFile.path.toLowerCase().endsWith('.html') || activeFile.path.toLowerCase().endsWith('.svg')) && <button onClick={() => setPreviewHtml((value) => !value)}>{previewHtml ? 'Edit source' : 'Sandbox preview'}</button>}</div>{previewHtml && (activeFile.path.toLowerCase().endsWith('.html') || activeFile.path.toLowerCase().endsWith('.svg')) ? <iframe title="Sandboxed generated file preview" sandbox="" srcDoc={`<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; style-src 'unsafe-inline';"><body>${activeFile.content}`} /> : <textarea className="code-editor" spellCheck={false} value={activeFile.content} onChange={(event) => updateActiveFile(event.target.value)} />}{activeFile.warnings.length > 0 && <p className="studio-warning">{activeFile.warnings.join(' ')}</p>}</> : <p>Select a file to preview or edit.</p>}</div></div></> : <div className="studio-empty">Describe a project, or generate an Ohm’s law report to start your library.</div>}</div></div>
      </section>}
      <section className="conversation">
        {messages.length === 0 ? <div className="welcome">
          <div className="eyebrow"><span/> PRIVATE AI / NO SERVER</div>
          <h1>Intelligence,<br/><em>without the cloud.</em></h1>
          <p className="welcome-sub">A language model running directly on your device. Your prompts stay here; the model runs here.</p>
          <div className="feature-grid"><button onClick={() => setInput('Explain how a browser can run a language model locally.') }><span className="feature-icon"><Cpu size={17}/></span><strong>On-device inference</strong><small>No remote AI API</small><ArrowDown size={14}/></button><button onClick={() => setInput('Design a simple step-by-step pipeline for a small AI model.') }><span className="feature-icon"><Activity size={17}/></span><strong>Pipeline thinking</strong><small>Route → infer → respond</small><ArrowDown size={14}/></button><button onClick={() => setInput('What are the limitations of running a small AI model in a browser?') }><span className="feature-icon"><ShieldCheck size={17}/></span><strong>Private by design</strong><small>Local conversation history</small><ArrowDown size={14}/></button></div>
          <div className="model-notice"><WifiOff size={16}/><span><strong>First launch requires a download.</strong> The model is fetched once and cached by the runtime when supported. Subsequent launches should be faster.</span></div>
        </div> : <div className="messages">{messages.map((m, i) => m.role === 'assistant' && !m.content && busy && i === messages.length - 1 ? <article className="message assistant" key={m.id}><div className="message-avatar"><Sparkles size={16}/></div><div className="message-body"><div className="message-role">LOCAL / AI</div><div className="message-content"><span className="typing"><i/><i/><i/></span></div></div></article> : <MessageItem key={m.id} message={m} />)}</div>}
        {stage === 'loading' && <div className="load-panel"><div className="load-heading"><Download size={16}/><strong>Preparing local model</strong><span>{progress}%</span></div><div className="progress-track"><div style={{ width: `${progress}%` }}/></div><p>{status}</p><small>Keep this tab open. The initial download may take a while and uses your internet connection.</small><button className="manager-button stop-operations load-stop-button" onClick={stopOperations}><StopCircle size={15}/> Stop operations</button></div>}
        {error && <div className="error-panel"><strong>Couldn't run the local model</strong><p>{error}</p><button onClick={() => { setError(''); setStage('idle'); void loadModel(selectedModel) }}>Retry</button><button onClick={() => { setError(''); setShowModels(true) }}>Models</button><button onClick={() => { setError(''); setStage('idle') }}>Dismiss</button></div>}
        <div ref={endRef}/>
      </section>
      <footer className="composer-wrap"><div className="composer"><textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendMessage() } }} placeholder="Ask something… (Shift + Enter for a new line)" rows={1} disabled={busy}/><button className="send-button" onClick={() => void sendMessage()} disabled={busy || !input.trim()} aria-label="Send message"><ArrowUp size={18}/></button></div><div className="composer-meta"><span><LockKeyhole size={12}/> Your prompts stay on this device</span><span>{modelReady ? `READY · ${lastRoute.toUpperCase()}` : 'WEBGPU · LOCAL MODEL'}</span></div><div className="footer-note">AI can make mistakes. Verify important information.</div></footer>
    </main>
  </div>
}
