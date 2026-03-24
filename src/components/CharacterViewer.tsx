"use client";

import { useRef, useMemo, Suspense } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import "./CharacterViewer.css";

// ─── Helpers ────────────────────────────────────────────────────

/** Route S3 URLs through our proxy to avoid CORS and hide raw URLs from the browser. */
function proxyUrl(url: string | null): string | null {
  if (!url) return null;
  return `/api/proxy-model?url=${encodeURIComponent(url)}`;
}

// ─── Types ──────────────────────────────────────────────────────

export type ViewerState = "idle" | "listening" | "thinking" | "speaking" | "happy";

interface CharacterViewerProps {
  modelUrl: string | null;
  previewModelUrl?: string | null;
  modelStatus?: string | null;
  avatarUrl: string | null;
  state: ViewerState;
  /** Loading progress 0-100, shown when model is downloading or generating */
  progress?: number;
}

// ─── 3D Model Inner Component ───────────────────────────────────

interface GLBModelProps {
  url: string;
  isSpeaking: boolean;
  isPreview: boolean;
}

function GLBModel({ url, isSpeaking, isPreview }: GLBModelProps) {
  const { scene } = useGLTF(url);
  const groupRef = useRef<THREE.Group>(null);
  const scaleRef = useRef(1);
  const yOffsetRef = useRef(0);
  const speakingGlowColor = useMemo(() => new THREE.Color("#00f0ff"), []);

  // Clone scene and extract glow materials, center + normalize
  const { model, glowMaterials } = useMemo(() => {
    const clone = scene.clone(true);
    const glowMats: THREE.MeshStandardMaterial[] = [];

    clone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const mat = mesh.material;
        if (mat instanceof THREE.MeshStandardMaterial) {
          glowMats.push(mat);
        } else if (Array.isArray(mat)) {
          for (const m of mat) {
            if (m instanceof THREE.MeshStandardMaterial) glowMats.push(m);
          }
        }
      }
    });

    // Center and normalize to fit a ~2-unit extent
    const box = new THREE.Box3().setFromObject(clone);
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);
    clone.position.x -= center.x;
    clone.position.y -= center.y;
    clone.position.z -= center.z;
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    clone.scale.setScalar(2 / maxDim);

    return { model: clone, glowMaterials: glowMats };
  }, [scene]);

  useFrame((state, delta) => {
    if (!groupRef.current) return;

    const smoothing = 1 - Math.exp(-delta * 7.5);
    let targetScale = 1;
    let targetYOffset = 0;
    let targetGlow = 0;

    if (isPreview) {
      const previewWave = (Math.sin(state.clock.elapsedTime * 2.2) + 1) * 0.5;
      targetScale = 1 + previewWave * 0.035;
      targetGlow = 0.24 + previewWave * 0.1;
    } else if (isSpeaking) {
      const primaryWave = (Math.sin(state.clock.elapsedTime * 2.6 - Math.PI / 2) + 1) * 0.5;
      const secondaryWave = (Math.sin(state.clock.elapsedTime * 5.2 + 0.6) + 1) * 0.5;
      targetScale = 1.006 + primaryWave * 0.016 + secondaryWave * 0.004;
      targetYOffset = primaryWave * 0.045;
      targetGlow = 0.05 + primaryWave * 0.11 + secondaryWave * 0.025;
    }

    scaleRef.current = THREE.MathUtils.lerp(scaleRef.current, targetScale, smoothing);
    yOffsetRef.current = THREE.MathUtils.lerp(yOffsetRef.current, targetYOffset, smoothing);
    groupRef.current.scale.setScalar(scaleRef.current);
    groupRef.current.position.y = yOffsetRef.current;

    for (const material of glowMaterials) {
      material.emissive.copy(speakingGlowColor);
      material.emissiveIntensity = THREE.MathUtils.lerp(
        material.emissiveIntensity,
        targetGlow,
        smoothing,
      );
    }
  });

  return (
    <group ref={groupRef}>
      <primitive object={model} />
    </group>
  );
}

// ─── Loading Overlay ────────────────────────────────────────────

function LoadingOverlay({ progress, text }: { progress?: number; text: string }) {
  return (
    <div className="character-viewer__loading">
      <div className="character-viewer__spinner" />
      {progress !== undefined && progress > 0 && (
        <div className="character-viewer__progress-bar">
          <div
            className="character-viewer__progress-fill"
            style={{ width: `${Math.min(100, progress)}%` }}
          />
        </div>
      )}
      <span className="character-viewer__loading-text">{text}</span>
    </div>
  );
}

// ─── Profile Image Fallback ─────────────────────────────────────

function ProfileFallback({ avatarUrl }: { avatarUrl: string | null }) {
  if (avatarUrl) {
    return (
      <div className="character-viewer__profile">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={avatarUrl} alt="Character" />
      </div>
    );
  }
  return (
    <div className="character-viewer__profile">
      <div className="character-viewer__placeholder">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(139, 92, 246, 0.5)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────

export default function CharacterViewer({
  modelUrl,
  previewModelUrl,
  modelStatus,
  avatarUrl,
  state,
  progress,
}: CharacterViewerProps) {
  const isSpeaking = state === "speaking";
  const isGenerating = modelStatus === "generating";
  const isPreviewReady = modelStatus === "preview_ready";

  // Determine which model URL to use, proxied through our API
  const rawModelUrl = modelUrl ?? (isPreviewReady || isGenerating ? previewModelUrl : null);
  const activeModelUrl = proxyUrl(rawModelUrl);
  const isPreviewModel = !modelUrl && !!previewModelUrl && (isPreviewReady || isGenerating);
  const hasModel = !!activeModelUrl;
  const proxiedAvatar = proxyUrl(avatarUrl);

  // Show loading when model is being fetched or generating
  const showLoading = !hasModel && (isGenerating || isPreviewReady);

  const containerClass = [
    "character-viewer",
    isSpeaking && "character-viewer--speaking",
  ].filter(Boolean).join(" ");

  // No model and not generating → show profile pic or placeholder
  if (!hasModel && !showLoading) {
    return (
      <div className={containerClass}>
        <ProfileFallback avatarUrl={proxiedAvatar} />
      </div>
    );
  }

  return (
    <div className={containerClass}>
      {showLoading && (
        <LoadingOverlay
          progress={progress}
          text={isGenerating ? "Generating model..." : "Loading..."}
        />
      )}
      {hasModel && (
        <Canvas
          camera={{ position: [0, 0.3, 4.8], fov: 40 }}
          gl={{ alpha: true, antialias: true }}
          style={{ background: "transparent" }}
        >
          <ambientLight intensity={0.6} />
          <directionalLight position={[5, 5, 5]} intensity={0.8} />
          <directionalLight position={[-3, 2, -3]} intensity={0.3} />
          <Suspense fallback={null}>
            <GLBModel
              url={activeModelUrl!}
              isSpeaking={isSpeaking}
              isPreview={isPreviewModel}
            />
          </Suspense>
          <OrbitControls
            enablePan={false}
            enableZoom={false}
            autoRotate={!isSpeaking && state !== "listening"}
            autoRotateSpeed={1.2}
            minPolarAngle={Math.PI / 4}
            maxPolarAngle={Math.PI / 1.6}
          />
        </Canvas>
      )}
    </div>
  );
}
