import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test, { afterEach, beforeEach } from 'node:test'
import ts from 'typescript'

const source = await readFile(new URL('../src/modelPersistence.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
const { withModelLock, ModelLockTimeoutError } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)

let originalNavigator
let originalWindow

beforeEach(() => {
  originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', { configurable: true, value: globalThis })
})

afterEach(() => {
  if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator)
  else delete globalThis.navigator
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow)
  else delete globalThis.window
})

function setLocks(locks) {
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks } })
}

test('a lock timeout aborts the queued request and a later retry can acquire it', async () => {
  let mode = 'held'
  let lateCallback
  const locks = {
    query: async () => ({ held: [{ name: 'local-ai-model-lock-v1:model' }], pending: [] }),
    request: (name, { signal }, callback) => {
      if (mode === 'acquired') return callback({ name, mode: 'exclusive' })
      lateCallback = callback
      return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))
    },
  }
  setLocks(locks)
  let started = false
  await assert.rejects(withModelLock('model', async () => { started = true }, undefined, { timeoutMs: 20, operationId: 'timeout-test' }), ModelLockTimeoutError)
  assert.equal(started, false)
  await lateCallback({ name: 'local-ai-model-lock-v1:model', mode: 'exclusive' }).catch(() => undefined)
  assert.equal(started, false, 'a late callback must not start after timeout')

  mode = 'acquired'
  assert.equal(await withModelLock('model', async () => { started = true; return 'ok' }, undefined, { timeoutMs: 100, operationId: 'retry-test' }), 'ok')
  assert.equal(started, true)
})

test('cancelling while waiting aborts the pending Web Lock request', async () => {
  let requestAborted = false
  setLocks({
    query: async () => ({ held: [], pending: [] }),
    request: (_name, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => { requestAborted = true; reject(signal.reason) }, { once: true })
    }),
  })
  const controller = new AbortController()
  const pending = withModelLock('model', async () => assert.fail('cancelled operation must not start'), controller.signal, { timeoutMs: 1000 })
  controller.abort()
  await assert.rejects(pending, { name: 'AbortError' })
  assert.equal(requestAborted, true)
})

test('an acquired lock runs the operation and resolves its result', async () => {
  setLocks({ query: async () => ({ held: [], pending: [] }), request: (_name, _options, callback) => callback({ mode: 'exclusive' }) })
  assert.equal(await withModelLock('model', async () => 42, undefined, { timeoutMs: 100 }), 42)
})

test('a second tab proceeds after the current lock holder finishes', async () => {
  let held = false
  const queue = []
  const locks = {
    query: async () => ({ held: held ? [{ name: 'local-ai-model-lock-v1:model' }] : [], pending: [] }),
    request: (name, { signal }, callback) => new Promise((resolve, reject) => {
      const entry = { name, signal, callback, resolve, reject }
      const grant = async () => {
        if (signal.aborted) { reject(signal.reason); return }
        held = true
        try { resolve(await callback({ name, mode: 'exclusive' })) }
        catch (error) { reject(error) }
        finally {
          held = false
          const next = queue.shift()
          if (next) void next()
        }
      }
      if (held) queue.push(grant)
      else void grant()
      signal.addEventListener('abort', () => reject(signal.reason), { once: true })
    }),
  }
  setLocks(locks)
  let releaseFirst
  const gate = new Promise((resolve) => { releaseFirst = resolve })
  const first = withModelLock('model', () => gate, undefined, { timeoutMs: 500, operationId: 'tab-a' })
  let secondStarted = false
  const second = withModelLock('model', async () => { secondStarted = true; return 'tab-b' }, undefined, { timeoutMs: 500, operationId: 'tab-b' })
  await new Promise((resolve) => setTimeout(resolve, 10))
  assert.equal(secondStarted, false)
  releaseFirst('tab-a')
  assert.equal(await first, 'tab-a')
  assert.equal(await second, 'tab-b')
  assert.equal(secondStarted, true)
})
