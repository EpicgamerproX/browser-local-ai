# LOCAL — Browser AI starter

A static React/Vite app that runs a quantized language model in the visitor's browser using WebLLM. There is no inference backend and no API key. The UI includes a basic request-routing stage, model initialization, streaming local inference, and browser-local chat history.

## Requirements

- Node.js 20+ recommended
- A current browser/device with WebGPU support (Chrome is a good first target)
- Internet for the initial app/model download
- Enough memory and storage for the selected model

## Run locally

```bash
npm install
npm run dev
```

Open the Vite URL in a supported browser. The first message initializes the model and downloads its weights. This can take a while. WebLLM caches model assets when supported, so later visits should be faster.

## Build

```bash
npm run build
npm run preview
```

The static production output is in `dist/`.

## Deploy

### Cloudflare Pages / Vercel

Import the GitHub repository, use `npm run build` as the build command, and `dist` as the output directory. No environment variables or server functions are needed for inference.

### GitHub Pages

1. Set `base` in `vite.config.ts` to `'/YOUR_REPOSITORY_NAME/'` (or `'/'` for a custom domain).
2. Build with `npm run build`.
3. Publish the `dist/` directory with GitHub Actions or your preferred static deployment workflow.

## Model manager

Open **Models** in the chat header to choose from separate desktop/laptop and mobile profiles. These profiles use model IDs present in the installed WebLLM registry: Qwen2.5 0.5B, 1.5B, and 3B, all Q4F16 MLC builds. The mobile balanced and enhanced cards currently reuse the same 1.5B model; they do not imply different optimizations or broader compatibility. WebLLM's registry reports approximate VRAM requirements of 945 MB, 1,630 MB, and 2,505 MB respectively. These are runtime estimates, not device guarantees. Download size is not reported as a fixed value because it depends on the artifact and transfer; progress appears during model initialization.

The manager can load/switch models, inspect WebLLM's model cache, and delete cached model files. The first download requires an explicit **Download & load** action. Subsequent visits check WebLLM's tensor cache before loading; a local inference probe is required before a model is marked **Downloaded and runtime-verified**. The selected cached model is loaded on startup. A small local manifest records the model ID, registry URL/version, WebLLM model-library version and probe status. The installed prebuilt registry does not provide SRI hashes for these models, so verification checks required tensor-cache entries and successful inference rather than cryptographic hashes.

WebLLM is configured to use its persistent Cache API backend. The app requests `navigator.storage.persist()` when the user starts a model download and reports the browser's decision and origin quota. Persistence requests are not guaranteed; browser data clearing, profile changes, private browsing or storage eviction can remove model files. Missing files are detected and the UI offers an explicit download/recovery action. Browser tabs coordinate initialization using Web Locks where available, with a local-storage lease fallback.

Production builds precache the static app shell and hashed Vite assets in a service worker. Online visits can check for a changed shell manifest; a replacement is cached before the app offers a reload. The WebLLM model cache is separate from the service-worker cache. This workspace has not been tested across a real browser restart or in a fully offline browser session, so offline readiness is reported from current cache/runtime state and is not a universal guarantee. Automatic device recommendations, download pause/resume and dedicated worker inference are not implemented.

## Code Studio and generated artifacts

Open **Code Studio & Reports** to ask the loaded local model for a text-only multi-file project, review/edit the files, and download individual files or a ZIP. The ZIP writer is bundled with the app and writes uncompressed ZIP entries locally. Manifest paths are checked for absolute paths and traversal, and generated files are labelled unverified until a user validates them. HTML/SVG previews run in a sandboxed iframe with a restrictive content policy. Projects are saved in this origin's `localStorage`; export ZIPs as backups because browser storage can be cleared or run out of quota.

The engineering report form computes Ohm's law values deterministically from any two supplied SI values (volts, amps, ohms), then exports Markdown, CSV and JSON in a ZIP. This is arithmetic only, not circuit simulation or physical validation. PDF/DOCX generation, Python execution, native compilation, arbitrary code execution, SPICE simulation, and tested offline restart behavior are not implemented. The model must be available locally and initialized in WebGPU to create AI-generated projects; there is no cloud generation fallback.

## Privacy and network behavior

- Prompt inference runs in the browser.
- Chat history is stored in this browser origin's `localStorage`.
- WebLLM downloads model/runtime assets from its configured model sources and caches model assets using its supported browser storage implementation.
- Prompts and responses stay in the browser, but initial app/model downloads require network access. The app does not yet provide a verified offline/PWA startup path.
- Public static hosting still sees normal page requests and download metadata, but receives no prompt or response content from the app.

## Pipeline note

This is a starter pipeline, not a fully autonomous agent. It uses a deterministic router to label the request, then local model inference, then streams the response into the UI. Next iterations can add schema-constrained task plans, local JavaScript tools, bounded retries, and explicit verification. Tool execution should be allowlisted rather than running arbitrary model-generated code.
