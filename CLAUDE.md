# CLAUDE.md

## Project Overview

estuary-ts-sdk-demo is a website for sharing Estuary characters. It provides a shareable chat interface where users can connect to AI characters via voice and text, powered by the `@estuary-ai/sdk` TypeScript SDK.

## Tech Stack

- **Framework**: Next.js 16 (App Router, Webpack bundler)
- **Language**: TypeScript
- **Styling**: Tailwind CSS 4
- **3D**: Three.js + React Three Fiber + Drei
- **Package Manager**: pnpm

## Build & Run

```bash
pnpm install
pnpm dev          # Dev server
pnpm build        # Production build
pnpm lint         # ESLint
```

## Project Structure

- `src/app/` — Next.js App Router pages (connect, chat)
- `src/components/` — React components (ChatInterface, CharacterViewer, SettingsDrawer, MemoryPanel)
- `src/hooks/` — Custom hooks (useEstuary)
- `src/lib/` — Utilities (crypto for encrypted share links)

## Key Patterns

- **Session-based config**: Connection credentials stored in `sessionStorage`, not persisted
- **Encrypted sharing**: Characters shared via AES-256-GCM encrypted URL hashes or scoped share tokens
- **Split-screen layout**: Left panel (3D character viewer), right panel (chat/memory), draggable divider
- **Voice + text**: Pill-shaped input bar with voice call controls inline alongside text input
- **Settings button**: Hidden in production, shown only in dev mode (`process.env.NODE_ENV === "development"`)

## Deployment

Deployed on Vercel from the `dev` branch. Has its own `pnpm-lock.yaml` (standalone, not from parent workspace).
