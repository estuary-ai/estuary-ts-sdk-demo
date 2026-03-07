# Estuary TypeScript SDK Demo

Real-time AI voice and text conversation demo built with the Estuary TypeScript SDK (`@estuary-ai/sdk`) and Next.js 16.

## What This Demos

- Text chat with streaming responses
- Voice input via WebSocket or LiveKit WebRTC
- Live speech-to-text transcription
- Animated voice orb with state-aware visual feedback
- Bot interrupt capability
- Connection lifecycle management

## Getting Started

```bash
npm install
npm run dev
```

Open http://localhost:3000 and enter your Estuary credentials:

- **Server URL:** `https://api.estuary-ai.com` (or your self-hosted instance)
- **API Key:** Your `est_...` key from the Estuary dashboard
- **Character ID:** UUID of the AI character to chat with
- **Player ID:** Any unique identifier for the end user

## Tech Stack

- [Next.js 16](https://nextjs.org) (App Router, Turbopack)
- [React 19](https://react.dev)
- [Tailwind CSS v4](https://tailwindcss.com)
- [@estuary-ai/sdk](https://www.npmjs.com/package/@estuary-ai/sdk)
- [livekit-client](https://www.npmjs.com/package/livekit-client) (optional, for WebRTC voice)

## Project Structure

```
src/
  app/
    page.tsx          # Entry point (dynamic import, SSR disabled)
    layout.tsx        # Root layout with fonts
    globals.css       # Theme, animations, Tailwind config
  components/
    ChatApp.tsx       # Main chat interface (config screen + chat UI)
    VoiceOrb.tsx      # Animated orb visualization
  hooks/
    useEstuary.ts     # React hook wrapping EstuaryClient
```

## Dogfood Findings

See [DOGFOOD_FINDINGS.md](./DOGFOOD_FINDINGS.md) for documented painpoints, bugs, and wishlist items discovered during development.
