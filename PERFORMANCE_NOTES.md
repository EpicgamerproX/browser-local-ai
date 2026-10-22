# Performance notes

- Streamed responses now update React state at most every 50 ms, with a final update when generation ends. Message rows have stable IDs and are memoized so unchanged rows are reused.
- Conversation persistence is debounced by 500 ms, keeping storage writes out of the token loop. Existing saved messages are assigned IDs when loaded.
- A failed stream keeps any partial assistant response in the conversation.
- Removed the external Google Fonts import and switched to system font stacks, avoiding a render-blocking third-party font request.
- Vite builds React and WebLLM into separate cacheable chunks.
- Added a model manager for the three verified installed WebLLM Qwen2.5 artifacts (0.5B, 1.5B, 3B), with distinct desktop/laptop and mobile profile cards. Mobile profiles reuse existing model IDs so artifacts are not duplicated.
- The manager uses WebLLM cache inspection/deletion APIs, shows initialization progress, and supports loading, switching, and unloading a single engine.
- Documented runtime VRAM estimates and the current mobile profile limitations in the README.

WebGPU availability is already checked before model initialization and reported in the existing error panel. This change does not add CPU inference; the current WebLLM model/runtime requires a supported WebGPU device.

Worker-thread inference, dynamic device recommendations, and pause/resume downloads remain unimplemented. The production service worker and model persistence are implemented below. `npm run build` completed with the Vite config runner override; the default config loader is blocked by this environment's esbuild path access issue.

## Student workspace additions

- Added `src/artifacts.ts` with validated relative-path manifests, extension/MIME mapping, text-size limits, a local uncompressed ZIP writer (CRC-32 and central directory), Blob downloads, and a deterministic Ohm's law report generator.
- Added Code Studio for local-model project generation, file tree navigation, editing, guarded HTML/SVG previews, per-file downloads, ZIP exports, and a searchable/renamable local artifact library.
- Added report generation to Markdown, CSV, and JSON. Generated source is marked as unverified; no generated code is executed.
- Artifacts use browser `localStorage`, so storage remains quota-limited. PDF/DOCX generation, Python runtime, static analysis, arbitrary execution, and circuit simulation remain unsupported. The app shell has service-worker caching; offline inference has not been tested in a real browser.

## Persistent model and offline shell

- Added `src/modelPersistence.ts`: explicitly configures WebLLM's Cache API backend, persists model/runtime/artifact metadata, requests per-model Web Locks, and falls back to an expiring local-storage lease.
- The app checks WebLLM's complete tensor-cache manifest on startup and does not load/download a model until cached weights exist or the user clicks **Download & load**. A cached selected model is initialized on startup. A short local inference probe must pass before it is labelled runtime-verified.
- Calls `navigator.storage.persist()` after an explicit model action and reports storage persistence, usage and quota. This is still subject to browser eviction/clearing.
- Added `public/service-worker.js`, `public/offline.html`, and a web manifest. Production Vite assets are precached; the service worker hashes the shell manifest/index, caches a complete replacement before offering reload, and preserves previous shell caches. It does not cache model weights; those stay in WebLLM's cache.
- The installed model registry provides no SRI hashes for these artifacts. Runtime verification checks WebLLM cache completeness and a real local inference response, not a cryptographic digest.
- `npm run build -- --configLoader runner` passed TypeScript and produced the production bundle. Real browser restart/offline inference testing remains outstanding; no claim of universal offline durability is made.
