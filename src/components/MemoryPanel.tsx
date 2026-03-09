"use client";

import { useState, useEffect, useCallback } from "react";
import type { EstuaryClient, MemoryData } from "@estuary-ai/sdk";

type MemoryType = string;

const MEMORY_TYPE_COLORS: Record<string, string> = {
  fact: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  preference: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  relationship: "bg-pink-500/20 text-pink-400 border-pink-500/30",
  event: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  emotional_state: "bg-rose-500/20 text-rose-400 border-rose-500/30",
  correction: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  character_self: "bg-indigo-500/20 text-indigo-400 border-indigo-500/30",
  spatial_change: "bg-teal-500/20 text-teal-400 border-teal-500/30",
};

function MemoryTypeBadge({ type }: { type: string }) {
  const color = MEMORY_TYPE_COLORS[type] ?? "bg-surface-light text-muted border-border";
  return (
    <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-medium border ${color}`}>
      {type.replace(/_/g, " ")}
    </span>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-surface-light overflow-hidden">
        <div
          className="h-full rounded-full bg-accent-light transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] text-muted w-8 text-right">{pct}%</span>
    </div>
  );
}

interface MemoryPanelProps {
  getClient: () => EstuaryClient | null;
}

export default function MemoryPanel({ getClient }: MemoryPanelProps) {
  const [memories, setMemories] = useState<MemoryData[]>([]);
  const [coreFacts, setCoreFacts] = useState<MemoryData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ memory: MemoryData; score: number }[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [activeFilter, setActiveFilter] = useState<MemoryType | "all">("all");
  const [tab, setTab] = useState<"memories" | "facts">("memories");

  const fetchMemories = useCallback(async () => {
    const client = getClient();
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const [memRes, factsRes] = await Promise.all([
        client.memory.getMemories({ status: "active", limit: 100, sortBy: "created_at", sortOrder: "desc" }),
        client.memory.getCoreFacts(),
      ]);
      setMemories(memRes.memories as unknown as MemoryData[]);
      setCoreFacts(factsRes.coreFacts as unknown as MemoryData[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load memories");
    } finally {
      setLoading(false);
    }
  }, [getClient]);

  // Fetch on mount
  useEffect(() => {
    fetchMemories();
  }, [fetchMemories]);

  // Listen for real-time memory updates
  useEffect(() => {
    const client = getClient();
    if (!client) return;
    const handler = () => {
      fetchMemories();
    };
    client.on("memoryUpdated", handler);
    return () => {
      client.off("memoryUpdated", handler);
    };
  }, [getClient, fetchMemories]);

  const handleSearch = useCallback(async () => {
    const client = getClient();
    if (!client || !searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await client.memory.search(searchQuery.trim(), 20);
      setSearchResults(res.results as unknown as { memory: MemoryData; score: number }[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }, [getClient, searchQuery]);

  const clearSearch = () => {
    setSearchQuery("");
    setSearchResults(null);
  };

  // Gather unique memory types for filter buttons
  const memoryTypes = Array.from(new Set(memories.map((m) => m.memoryType).filter(Boolean)));

  const displayedMemories = activeFilter === "all"
    ? memories
    : memories.filter((m) => m.memoryType === activeFilter);

  const renderMemoryCard = (mem: MemoryData, score?: number) => (
    <div
      key={mem.id}
      className="rounded-lg border border-border bg-surface p-3 space-y-2 animate-fade-in-up"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm leading-relaxed flex-1">{mem.content}</p>
        {score !== undefined && (
          <span className="text-[10px] text-accent-light font-mono shrink-0">
            {Math.round(score * 100)}% match
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {mem.memoryType && <MemoryTypeBadge type={mem.memoryType} />}
        {mem.topic && (
          <span className="text-[10px] text-muted">
            topic: {mem.topic}
          </span>
        )}
      </div>
      {mem.confidence !== undefined && (
        <ConfidenceBar value={mem.confidence} />
      )}
      {mem.sourceQuote && (
        <p className="text-[11px] text-muted italic border-l-2 border-border pl-2">
          &ldquo;{mem.sourceQuote}&rdquo;
        </p>
      )}
      {mem.createdAt && (
        <p className="text-[10px] text-muted">
          {new Date(mem.createdAt).toLocaleString()}
        </p>
      )}
    </div>
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-border space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
              <path d="M2 12h20" />
            </svg>
            Memory Map
          </h2>
          <button
            onClick={fetchMemories}
            disabled={loading}
            className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-surface-light transition disabled:opacity-50"
            title="Refresh"
          >
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              className={loading ? "animate-spin" : ""}
            >
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              <polyline points="21 3 21 12 12 12" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="flex gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Search memories..."
            className="flex-1 px-3 py-1.5 rounded-lg bg-surface-light border border-border text-xs focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition placeholder:text-muted"
          />
          {searchResults ? (
            <button
              onClick={clearSearch}
              className="px-3 py-1.5 rounded-lg text-xs border border-border text-muted hover:text-foreground transition"
            >
              Clear
            </button>
          ) : (
            <button
              onClick={handleSearch}
              disabled={searching || !searchQuery.trim()}
              className="px-3 py-1.5 rounded-lg text-xs bg-accent text-white hover:bg-accent-light transition disabled:opacity-50"
            >
              {searching ? "..." : "Search"}
            </button>
          )}
        </div>

        {/* Tabs */}
        {!searchResults && (
          <div className="flex gap-1">
            <button
              onClick={() => setTab("memories")}
              className={`px-3 py-1 rounded-md text-xs font-medium transition ${
                tab === "memories" ? "bg-accent/20 text-accent-light" : "text-muted hover:text-foreground"
              }`}
            >
              Memories ({memories.length})
            </button>
            <button
              onClick={() => setTab("facts")}
              className={`px-3 py-1 rounded-md text-xs font-medium transition ${
                tab === "facts" ? "bg-accent/20 text-accent-light" : "text-muted hover:text-foreground"
              }`}
            >
              Core Facts ({coreFacts.length})
            </button>
          </div>
        )}

        {/* Type filters (only in memories tab) */}
        {!searchResults && tab === "memories" && memoryTypes.length > 0 && (
          <div className="flex gap-1 flex-wrap">
            <button
              onClick={() => setActiveFilter("all")}
              className={`px-2 py-0.5 rounded-md text-[10px] font-medium transition border ${
                activeFilter === "all"
                  ? "bg-accent/20 text-accent-light border-accent/30"
                  : "text-muted border-border hover:text-foreground"
              }`}
            >
              All
            </button>
            {memoryTypes.map((type) => (
              <button
                key={type}
                onClick={() => setActiveFilter(type === activeFilter ? "all" : type)}
                className={`px-2 py-0.5 rounded-md text-[10px] font-medium transition border ${
                  activeFilter === type
                    ? "bg-accent/20 text-accent-light border-accent/30"
                    : "text-muted border-border hover:text-foreground"
                }`}
              >
                {type.replace(/_/g, " ")}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {error && (
          <div className="rounded-lg bg-danger/10 border border-danger/20 px-3 py-2 text-xs text-danger mb-3">
            {error}
          </div>
        )}

        {loading && memories.length === 0 && (
          <div className="flex items-center justify-center py-12 text-muted text-sm">
            Loading memories...
          </div>
        )}

        {/* Search results */}
        {searchResults && (
          <div className="space-y-2">
            <p className="text-xs text-muted mb-2">
              {searchResults.length} result{searchResults.length !== 1 ? "s" : ""} for &ldquo;{searchQuery}&rdquo;
            </p>
            {searchResults.length === 0 && (
              <p className="text-sm text-muted text-center py-8">No matching memories found</p>
            )}
            {searchResults.map((r) => renderMemoryCard(r.memory, r.score))}
          </div>
        )}

        {/* Memories list */}
        {!searchResults && tab === "memories" && (
          <div className="space-y-2">
            {!loading && displayedMemories.length === 0 && (
              <p className="text-sm text-muted text-center py-8">
                {activeFilter === "all"
                  ? "No memories yet. Chat with the character to build memories."
                  : `No ${activeFilter.replace(/_/g, " ")} memories.`}
              </p>
            )}
            {displayedMemories.map((m) => renderMemoryCard(m))}
          </div>
        )}

        {/* Core facts */}
        {!searchResults && tab === "facts" && (
          <div className="space-y-2">
            {!loading && coreFacts.length === 0 && (
              <p className="text-sm text-muted text-center py-8">
                No core facts extracted yet.
              </p>
            )}
            {coreFacts.map((m) => renderMemoryCard(m))}
          </div>
        )}
      </div>
    </div>
  );
}
