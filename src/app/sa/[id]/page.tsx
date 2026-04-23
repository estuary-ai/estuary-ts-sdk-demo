"use client";

/**
 * Share Anchor landing route (quick-260415-f3m).
 *
 * Anchors are stable, owner-scoped redirectors the backend mints a fresh
 * short-lived sst_ session token for on every visit. Users reach this
 * route by tapping an NFC tag or scanning a QR code programmed with
 * `https://share.estuary-ai.com/sa/{anchor_id}`.
 *
 * Flow:
 *   1. Call POST /api/v1/share/{id}/open (unauthenticated,
 *      rate-limited per anchor id).
 *   2a. Default: Stash the returned session + character in sessionStorage
 *       using the EXACT SAME KEYS the existing exchangeShareToken flow
 *       writes (see src/app/page.tsx lines 134-140) so /chat rehydrates
 *       unchanged.
 *   2b. mode=ar: Redirect to the Mattercraft WebAR experience with the
 *       pre-baked session credentials in the URL hash fragment.
 *
 * Errors:
 *   - 404 -> "Anchor unavailable" (revoked or never existed)
 *   - 429 -> "Too many taps" (rate limit; user should wait ~1m)
 *   - Network -> "Network error, please try again"
 */

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

const IS_DEV = process.env.NODE_ENV === "development";
const DEFAULT_SERVER_URL = IS_DEV
    ? "http://localhost:4001"
    : "https://api.estuary-ai.com";

// Matches SHARE_EXCHANGE_BASE in src/app/page.tsx (same env var + default)
const ANCHOR_OPEN_BASE =
    process.env.NEXT_PUBLIC_SHARE_EXCHANGE_URL?.replace(/\/$/, "") ||
    "https://api.estuary-ai.com";

// Zappar-hosted Mattercraft project — webxr.run triggers iOS App Clips.
const MATTERCRAFT_AR_URL =
    process.env.NEXT_PUBLIC_MATTERCRAFT_AR_URL ||
    "https://webxr.run/ZwEy4xL788edG";

interface CharacterInfo {
    id: string;
    name: string;
    tagline: string | null;
    personality: string | null;
    avatar: string | null;
    modelUrl: string | null;
    modelPreviewUrl: string | null;
    modelStatus: string | null;
    sourceImageUrl: string | null;
}

interface OpenAnchorResponse {
    sessionToken: string;
    characterId: string;
    playerId: string;
    serverUrl: string | null;
    character: CharacterInfo;
    memorySharing?: "isolated" | "shared";
}

export default function AnchorLanding() {
    const params = useParams<{ id: string }>();
    const searchParams = useSearchParams();
    const router = useRouter();
    const [error, setError] = useState<string | null>(null);
    const isAR = searchParams?.get("mode") === "ar";

    useEffect(() => {
        const anchorId = params?.id;
        if (!anchorId) {
            setError("This anchor is unavailable.");
            return;
        }

        let cancelled = false;

        (async () => {
            try {
                const res = await fetch(
                    `${ANCHOR_OPEN_BASE}/api/v1/share/${encodeURIComponent(anchorId)}/open`,
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                    },
                );

                if (cancelled) return;

                if (!res.ok) {
                    if (res.status === 429) {
                        setError("Too many taps. Try again in a minute.");
                    } else {
                        setError("This anchor is unavailable.");
                    }
                    return;
                }

                const data: OpenAnchorResponse = await res.json();

                if (isAR) {
                    if (!MATTERCRAFT_AR_URL) {
                        setError("AR experience is not configured.");
                        return;
                    }
                    // Pre-encode `?` (%3F) and `&` (%26) so the payload survives
                    // webxr.run's redirect into the Mattercraft scene as a single
                    // decode layer. Mirrors estuary-website's QR-link pattern in
                    // src/components/demo/CrossPlatformPhase.tsx:37.
                    const sst = encodeURIComponent(data.sessionToken);
                    const cid = encodeURIComponent(data.characterId);
                    const pid = encodeURIComponent(data.playerId);
                    const srv = encodeURIComponent(
                        data.serverUrl || DEFAULT_SERVER_URL,
                    );
                    const name = encodeURIComponent(data.character?.name || "");
                    window.location.href = `${MATTERCRAFT_AR_URL}%3Fsst=${sst}%26cid=${cid}%26pid=${pid}%26srv=${srv}%26name=${name}`;
                    return;
                }

                // Pre-clear any prior share session so a new anchor cannot
                // inherit stale character metadata in the same tab. Matches
                // the exchangeShareToken handler in src/app/page.tsx.
                sessionStorage.removeItem("estuary-config");
                sessionStorage.removeItem("estuary-character");

                // Stash the new config + character under the SAME keys the
                // existing /chat route rehydrates. The `estuary-config` shape
                // is `{serverUrl, sessionToken, characterId, playerId}` —
                // see src/app/page.tsx lines 52-75 (exchangeShareToken).
                sessionStorage.setItem(
                    "estuary-config",
                    JSON.stringify({
                        serverUrl: data.serverUrl || DEFAULT_SERVER_URL,
                        sessionToken: data.sessionToken,
                        characterId: data.characterId,
                        playerId: data.playerId,
                    }),
                );
                if (data.character) {
                    sessionStorage.setItem(
                        "estuary-character",
                        JSON.stringify(data.character),
                    );
                }

                // Replace, not push — tapping Back shouldn't re-open the anchor.
                router.replace("/chat");
            } catch (err) {
                if (!cancelled) {
                    setError("Network error. Please try again.");
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [params, searchParams, router, isAR]);

    return (
        <main className="flex min-h-dvh items-center justify-center p-6 text-center">
            {error ? (
                <div className="max-w-sm space-y-2">
                    <h1 className="text-lg font-medium">
                        Can&apos;t open this anchor
                    </h1>
                    <p className="text-sm text-muted-foreground">{error}</p>
                </div>
            ) : (
                <div className="max-w-sm space-y-2">
                    <h1 className="text-lg font-medium">
                        {isAR ? "Launching AR experience…" : "Opening character…"}
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        One moment while we set up the conversation.
                    </p>
                </div>
            )}
        </main>
    );
}
