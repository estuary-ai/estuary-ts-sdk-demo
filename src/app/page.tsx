"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import CharacterAvatar from "@/components/CharacterAvatar";

const ParticleNetwork = dynamic(() => import("@/components/ParticleNetwork"), { ssr: false });

const FEATURES = [
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" x2="12" y1="19" y2="23" />
        <line x1="8" x2="16" y1="23" y2="23" />
      </svg>
    ),
    title: "Real-time Voice",
    desc: "Full-duplex voice conversation with sub-second latency. Interrupt naturally, just like talking to a person.",
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
        <path d="M2 12h20" />
      </svg>
    ),
    title: "Memory Map",
    desc: "Characters remember everything. Browse their knowledge graph, search memories, and watch them learn in real-time.",
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
    title: "Text & Voice",
    desc: "Seamlessly switch between text chat and voice. Both modalities update in sync, powered by the same SDK.",
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <line x1="8" x2="16" y1="21" y2="21" />
        <line x1="12" x2="12" y1="17" y2="21" />
      </svg>
    ),
    title: "Cross-Platform SDK",
    desc: "TypeScript, Unity, Lens Studio. One API contract across web, mobile, AR glasses, and more.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Interactive particle background */}
      <div className="fixed inset-0 overflow-hidden">
        <ParticleNetwork />
        <div className="absolute -top-40 -left-40 w-[500px] h-[500px] bg-indigo-600/8 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute top-1/3 right-0 w-[400px] h-[400px] bg-violet-600/8 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute -bottom-20 left-1/3 w-[600px] h-[400px] bg-indigo-500/5 rounded-full blur-[120px] pointer-events-none" />
      </div>

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 md:px-12 py-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            </svg>
          </div>
          <span className="text-lg font-bold tracking-tight">Estuary</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden sm:inline text-xs text-muted font-mono bg-surface-light/50 px-3 py-1 rounded-full border border-border">
            @estuary-ai/sdk
          </span>
          <Link
            href="/connect"
            className="px-4 py-2 text-sm font-medium rounded-lg bg-surface-light border border-border text-foreground hover:border-accent/50 hover:text-accent-light transition"
          >
            Connect
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 pb-12">
        <div className="max-w-4xl w-full flex flex-col items-center text-center">
          {/* Badge */}
          <div className="mb-6 animate-fade-in-up">
            <span className="inline-flex items-center gap-2 text-xs font-medium px-4 py-1.5 rounded-full border border-border bg-surface/60 backdrop-blur-sm text-muted">
              <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
              TypeScript SDK Demo
            </span>
          </div>

          {/* Headline */}
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight leading-[1.1] mb-6 animate-fade-in-up" style={{ animationDelay: "0.1s", animationFillMode: "both" }}>
            Talk to AI characters{" "}
            <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-purple-400 bg-clip-text text-transparent">
              that remember you
            </span>
          </h1>

          {/* Sub */}
          <p className="text-lg text-muted max-w-xl mb-10 animate-fade-in-up" style={{ animationDelay: "0.2s", animationFillMode: "both" }}>
            Real-time voice and text conversations with persistent memory.
            Built with the Estuary TypeScript SDK.
          </p>

          {/* CTA */}
          <div className="flex items-center gap-4 animate-fade-in-up" style={{ animationDelay: "0.3s", animationFillMode: "both" }}>
            <Link
              href="/connect"
              className="group px-8 py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 text-white font-semibold text-sm hover:from-indigo-600 hover:to-violet-700 transition-all shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:scale-[1.02] active:scale-[0.98]"
            >
              Get Started
              <span className="inline-block ml-2 transition-transform group-hover:translate-x-0.5">&rarr;</span>
            </Link>
          </div>

          {/* Character preview */}
          <div className="mt-12 w-48 h-60 mx-auto animate-fade-in-up" style={{ animationDelay: "0.4s", animationFillMode: "both" }}>
            <CharacterAvatar state="idle" />
          </div>
        </div>
      </div>

      {/* Features */}
      <div className="relative z-10 px-6 md:px-12 pb-20">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {FEATURES.map((f, i) => (
              <div
                key={f.title}
                className="rounded-xl border border-border bg-surface/50 backdrop-blur-sm p-5 hover:border-accent/30 hover:bg-surface transition-all group animate-fade-in-up"
                style={{ animationDelay: `${0.4 + i * 0.08}s`, animationFillMode: "both" }}
              >
                <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center text-accent-light mb-3 group-hover:bg-accent/20 transition">
                  {f.icon}
                </div>
                <h3 className="text-sm font-semibold mb-1">{f.title}</h3>
                <p className="text-xs text-muted leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border px-6 py-6 text-center">
        <p className="text-xs text-muted">
          Powered by{" "}
          <span className="text-accent-light font-medium">@estuary-ai/sdk</span>
          {" "}&middot;{" "}
          Built with Next.js &middot; Real-time AI conversations
        </p>
      </footer>
    </div>
  );
}
