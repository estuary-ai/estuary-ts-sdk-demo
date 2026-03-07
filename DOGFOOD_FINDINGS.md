# Estuary TypeScript SDK - Dogfood Findings

Findings from building a Next.js 16 demo app using `@estuary-ai/sdk@0.1.20`.

---

## Bugs Found & Fixed (in local SDK source)

### BUG-1: `socket.io-client` is a devDependency, not a dependency
- **Severity:** Critical (npm package is broken for some consumers)
- `socket.io-client` was listed in `devDependencies` instead of `dependencies`.
- tsup bundled the entire library into the dist (301 KB CJS bundle).
- Consumers couldn't deduplicate socket.io-client if they also used it.
- **Fix:** Moved to `dependencies`, added to `external` in tsup config. CJS bundle dropped from 301 KB to 43 KB.

### BUG-2: CJS type declarations missing from published package
- **Severity:** Medium
- `package.json` declares `"types": "./dist/index.d.ts"` but only `index.d.mts` was generated.
- CJS consumers (require) get no TypeScript autocompletion.
- **Fix:** Added `dts: true` to the CJS build config in `tsup.config.ts`.

### BUG-3: LiveKit dynamic import broken in browser bundlers (Next.js, webpack, Vite)
- **Severity:** Critical (LiveKit voice completely non-functional in browser apps)
- tsup with `platform: 'browser'` compiles `import('livekit-client')` to `["livekit", "client"].join("-")`.
- This anti-bundler trick prevents webpack/Turbopack from resolving the module.
- Results in "livekit-client package is not installed" error even when livekit-client IS installed.
- **Fix:** Changed ESM build to `platform: 'neutral'` so tsup emits a clean `import('livekit-client')` that downstream bundlers can resolve.

### BUG-4: LiveKit availability check happens too late
- **Severity:** Medium
- `voice-manager.ts` tries `import('./livekit-voice')` (the local chunk) in a try/catch to detect LiveKit.
- The chunk always loads successfully since it's a local file — the REAL import of `livekit-client` happens later in `LiveKitVoiceManager.start()`.
- If livekit-client isn't installed, the fallback to WebSocket never triggers.
- **Fix:** Added `isLiveKitAvailable()` that probes `import('livekit-client')` directly before creating the LiveKit manager.

### BUG-5: Error messages in LiveKit voice are generic / unhelpful
- **Severity:** Low
- "Failed to enable microphone" and "Failed to connect to LiveKit room" hide the actual underlying error.
- Makes debugging impossible for developers.
- **Fix:** Error messages now include the original error reason (e.g., "Failed to connect to LiveKit room: WebSocket connection failed").

---

## Developer Experience Painpoints

### P0 - Blockers Hit During Development

1. **Published npm package doesn't work with browser bundlers for LiveKit voice**
   - The `import('livekit-client')` obfuscation in BUG-3 means NO browser app (Next.js, Vite, CRA, etc.) can use LiveKit voice from the published package.
   - Only WebSocket voice works out of the box.
   - This would block any developer trying to follow the LiveKit voice docs.

2. **`voiceTransport: 'auto'` silently tries LiveKit even when server doesn't support it**
   - If livekit-client is installed (even as a transitive dep), `auto` mode tries LiveKit first.
   - If the server doesn't have LiveKit enabled, you get a confusing "Failed to enable microphone" error.
   - Developer has no way to know the issue is server-side, not client-side.
   - No docs mention that LiveKit requires server-side configuration.

3. **`file:` dependency symlinks don't work with Next.js 16 Turbopack**
   - When testing local SDK changes via `npm install ../path-to-sdk`, npm creates a symlink.
   - Turbopack doesn't follow symlinks: `Module not found: Can't resolve '@estuary-ai/sdk'`.
   - Workaround: manually copy dist files into node_modules. Very painful dev loop.

### P1 - SDK Painpoints (Bugs / DX Issues)

1. **No `"use client"` guidance for Next.js / React Server Components**
   - The SDK uses browser APIs (Socket.IO, AudioContext, getUserMedia) so it must be imported in client components only.
   - The docs didn't mention this. A Next.js developer following the getting-started guide will immediately hit SSR errors.
   - **Fixed:** Added React/Next.js integration section to getting-started docs.

2. **Next.js 16 + `next/dynamic` with `ssr: false` requires client component**
   - `ssr: false` is not allowed in Server Components in Next.js 16 with Turbopack.
   - You must add `"use client"` to the page using `next/dynamic` with `ssr: false`.
   - Unintuitive for developers new to the App Router.

3. **Memory REST response types use `Record<string, unknown>` everywhere**
   - `MemoryListResponse.memories` is typed as `Record<string, unknown>[]` instead of `MemoryData[]`.
   - `MemoryGraphResponse.nodes` and `edges` are `Record<string, unknown>[]`.
   - `MemoryStatsResponse` is just `[key: string]: unknown`.
   - This makes the Memory API much harder to use -- developers lose all type safety and must cast.
   - **Fix needed:** Use proper typed interfaces for all REST API response shapes.

4. **`VoiceManager.stop()` returns `Promise<void>` but `stopVoice()` on client is synchronous**
   - The `VoiceManager` interface declares `stop(): Promise<void>` but `EstuaryClient.stopVoice()` calls it synchronously without awaiting.
   - Could cause resource cleanup issues.

5. **Code duplication: `AudioRecorder` vs `WebSocketVoiceManager`**
   - `src/audio/audio-recorder.ts` is never used by the client. `WebSocketVoiceManager` duplicates all its audio capture logic.
   - Dead code that adds confusion for developers reading the source.
   - **Fix needed:** Remove `AudioRecorder` or extract shared audio utilities.

6. **Reconnect backoff is linear, not exponential (misleading)**
   - `socket-manager.ts`: `delay * this.reconnectAttempt` gives linear backoff (2s, 4s, 6s...).
   - Comments and docs describe it as "exponential backoff" which is incorrect.
   - **Fix needed:** Either implement actual exponential backoff or correct the docs.

7. **No request timeout in `RestClient`**
   - `fetch()` calls in `rest-client.ts` have no `AbortController` timeout.
   - On slow/dead networks, memory API calls will hang indefinitely.
   - **Fix needed:** Add configurable timeout (default ~10s) using `AbortSignal.timeout()`.

8. **LiveKit token timeout is hardcoded to 10s**
   - `livekit-voice.ts`: 10 second timeout for LiveKit token request is not configurable.
   - Could be too short for high-latency networks.

### P2 - Documentation Issues

1. **Unity SDK missing from sidebar** -- **Fixed**
   - 15 Unity SDK documentation files exist in `/docs/unity-sdk/` but were NOT in `sidebars.ts`.
   - Unity SDK docs were completely undiscoverable through navigation.

2. **TypeScript SDK missing `_category_.json` for API reference** -- **Fixed**
   - Lens Studio SDK had it, TypeScript SDK didn't. Added.

3. **No React / Next.js integration guide** -- **Partially fixed**
   - Added a section to getting-started docs. Still could use a dedicated page.

4. **No browser vs Node.js capability matrix**
   - Docs don't clearly state which features work in Node.js vs browser.
   - Voice, audio playback require browser. Memory REST works in Node.js. Text chat works in both.

5. **LiveKit docs don't mention server requirements** -- **Fixed**
   - No mention that LiveKit requires server-side configuration.
   - Added warnings and error handling section to voice-livekit docs.

6. **Core concepts config example missing 3 options** -- **Fixed**
   - `realtimeMemory`, `suppressMicDuringPlayback`, `autoInterruptOnSpeech` were undocumented in the core-concepts config example.

7. **Voice docs don't explain `auto` mode pitfall**  -- **Fixed**
   - `auto` mode tries LiveKit whenever the client library is installed, regardless of server support.
   - Added caution admonition to voice-livekit docs.

### P3 - Wishlist / Quality of Life Features

1. **React hooks package or built-in React bindings**
   - A `@estuary-ai/react` package with `useEstuaryClient()`, `useVoice()`, `useMessages()` hooks would dramatically improve React DX.
   - Auto-cleanup on unmount, proper state management, SSR-safe.
   - We had to write a custom `useEstuary` hook (~170 lines) for this demo.

2. **Connection config from environment variables**
   - Support for `NEXT_PUBLIC_ESTUARY_*` or `ESTUARY_*` env vars as defaults.
   - Reduce boilerplate in every project.

3. **Built-in audio visualizer data**
   - Expose audio level / frequency data from the voice stream.
   - Currently no way to build waveform visualizations without reimplementing audio capture.
   - An `audioLevel` event or `getAudioLevel()` method would enable rich UIs.

4. **Push-to-talk mode in SDK**
   - The SDK contract defines `voice_push_to_talk` but the TS SDK doesn't expose a dedicated PTT API.
   - Would be useful for mobile/web demos with a "hold to talk" button.

5. **Conversation history / message list from server**
   - No way to load previous messages when reconnecting.
   - The REST API has `/conversations/{id}/messages` but no SDK method wraps it.

6. **Character info endpoint in SDK**
   - No way to fetch character details (name, avatar, personality) from the SDK.
   - Would enable showing character name/avatar in the UI without hardcoding.

7. **Typed error details in REST client**
   - REST errors have `details: unknown` -- should parse server error response format.

8. **`onceConnected()` convenience method**
   - Pattern of `connect()` then immediately do something is very common.
   - A `client.onceConnected(callback)` or making `connect()` return a richer object could simplify.

9. **Export `MemoryClient` as a class (not just type)**
   - `MemoryClient` is only exported as a type (`export type { MemoryClient }`).
   - Can't be used standalone for memory-only applications without the full client.

---

## LiveKit Integration Status

- `livekit-client@2.x` installs cleanly alongside `@estuary-ai/sdk`.
- **Published npm package (0.1.20):** LiveKit is broken in browser bundles due to BUG-3 (obfuscated dynamic import). Only works in Node.js.
- **Local fix:** Changing tsup to `platform: 'neutral'` fixes the import. The SDK now emits a clean `import('livekit-client')` that webpack/Turbopack can resolve.
- **Server dependency:** LiveKit voice requires the Estuary server to have LiveKit enabled. If not, the SDK gives a confusing error with no guidance.
- **Fallback behavior:** With local fixes, `auto` mode correctly falls back to WebSocket when livekit-client is not installed. But if livekit-client IS installed and server doesn't support it, you get a hard error instead of a graceful fallback.

---

## SDK Package Health

- **npm package:** `@estuary-ai/sdk@0.1.20` (latest)
- **Published:** 2026-02-26
- **21 versions** published (rapid iteration from 0.1.0 to 0.1.20)
- **File count:** 14 files in tarball
- **Dual build:** ESM + CJS with TypeScript declarations
- **Dependencies:** socket.io-client (should be `dependencies`, is `devDependencies` in published version)
- **License:** MIT
- **Types:** Included, autocompletion works well in ESM. CJS types missing in published version.

---

## Files Changed (local, unpublished)

### SDK (`estuary-product/estuary-ts-sdk/`)
- `package.json` -- socket.io-client moved from devDependencies to dependencies
- `tsup.config.ts` -- platform: neutral, socket.io-client externalized, CJS dts enabled
- `src/voice/voice-manager.ts` -- isLiveKitAvailable() check before creating LiveKit manager
- `src/voice/livekit-voice.ts` -- error messages include underlying reason
- `README.md` -- added React/Next.js usage section

### Docs (`estuary-product/estuary-docs/`)
- `sidebars.ts` -- added Unity SDK section
- `docs/typescript-sdk/getting-started.md` -- added React/Next.js integration section
- `docs/typescript-sdk/voice-livekit.md` -- added server requirement warnings, error handling section, auto mode pitfall
- `docs/typescript-sdk/core-concepts.md` -- added missing config options
- `docs/typescript-sdk/api-reference/_category_.json` -- created (was missing)
