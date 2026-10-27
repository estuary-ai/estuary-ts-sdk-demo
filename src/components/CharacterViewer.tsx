"use client";

import { useRef, useMemo, useState, useCallback, useEffect, useEffectEvent, Suspense } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useGLTF, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { clone as cloneSkinnedScene } from "three/examples/jsm/utils/SkeletonUtils.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { useIsMobile } from "@/hooks/useIsMobile";
import { clipPlayback, resolveClip, TIMED_CLIP_SECONDS, type ModelGesture } from "@/lib/clipActions";
import "./CharacterViewer.css";

// ─── Helpers ────────────────────────────────────────────────────

/** Route S3 URLs through our proxy to avoid CORS and hide raw URLs from the browser.
 *  Same-origin and gateway-served URLs are returned as-is — the proxy's allowlist
 *  is scoped to S3/minio hosts, so non-S3 URLs would 403 there anyway. */
function proxyUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const base = typeof window !== "undefined" ? window.location.origin : "http://localhost";
    const u = new URL(url, base);
    if (u.hostname.endsWith("amazonaws.com") || u.hostname === "minio") {
      return `/api/proxy-model?url=${encodeURIComponent(url)}`;
    }
    return url;
  } catch {
    return null;
  }
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
  /** Bot audio level 0-1 for reactive speaking animation */
  audioLevel?: number;
  /** A clip the character chose (client_action), played when the model is rigged */
  gesture?: ModelGesture | null;
}

// ─── 3D Model Inner Component ───────────────────────────────────

interface GLBModelProps {
  url: string;
  state: ViewerState;
  isPreview: boolean;
  audioLevel: number;
  gesture: ModelGesture | null;
  /** Called with the model's URL when it carries animation clips (a rigged model). */
  onRigged: (url: string) => void;
}

const GESTURE_FADE_IN = 0.25;
const GESTURE_FADE_OUT = 0.4;

/** The resting loop of a rigged model. */
function idleClip(animations: THREE.AnimationClip[]): THREE.AnimationClip {
  return resolveClip("idle", animations)
    ?? animations.find((animation) => /idle/i.test(animation.name))
    ?? animations[0];
}

function GLBModel({ url, state, isPreview, audioLevel, gesture, onRigged }: GLBModelProps) {
  const isSpeaking = state === "speaking";
  const isListening = state === "listening";
  const isThinking = state === "thinking";
  const { scene, asset, animations } = useGLTF(url);
  // Tripo-generated GLBs use a different coordinate convention than Meshy and
  // face +X, which makes the character snap 90° to the right when rendered.
  // Detect via the glTF asset generator string and correct the facing below
  // (mirrors lumiere's CreatureModel gallery fix). Unrigged Tripo meshes say
  // 'https://tripo3d.ai'; the gateway's rigged ones say 'Tripo'.
  const isTripo = /tripo/i.test(asset?.generator ?? "");
  const isRigged = animations.length > 0;
  const groupRef = useRef<THREE.Group>(null);
  const scaleRef = useRef(1);
  const yOffsetRef = useRef(0);
  const audioLevelRef = useRef(0);
  const speakingGlowColor = useMemo(() => new THREE.Color("#00f0ff"), []);

  // Clone scene, isolate materials, and extract glow materials
  const { model, animationRoot, glowMaterials } = useMemo(() => {
    // SkeletonUtils rebinds each skinned mesh to the clone's own bones.
    // Object3D.clone leaves it bound to the cached scene's, so clips would move
    // bones the mesh never follows and it would stay in its T-pose.
    const clone = cloneSkinnedScene(scene);
    const glowMats: THREE.MeshStandardMaterial[] = [];

    clone.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;

      // Clone materials so each mesh has isolated instances for animation
      if (Array.isArray(child.material)) {
        child.material = child.material.map((m) => m.clone());
      } else if (child.material) {
        child.material = child.material.clone();
      }

      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of mats) {
        // MeshPhysicalMaterial extends MeshStandardMaterial, so instanceof catches both
        if (mat instanceof THREE.MeshStandardMaterial) {
          mat.emissive = mat.emissive.clone();
          glowMats.push(mat);
        }
      }
    });

    // Measure a rigged model in its idle pose. Its bind pose is a T-pose, whose
    // outstretched arms would set the extent and shrink the character.
    let poser: THREE.AnimationMixer | null = null;
    if (isRigged) {
      poser = new THREE.AnimationMixer(clone);
      poser.clipAction(idleClip(animations)).play();
      poser.update(0);
    }
    clone.updateMatrixWorld(true);
    // `precise` reads skinned vertices in their posed positions; the cheap
    // bounding-box path would still see the T-pose.
    const box = new THREE.Box3().setFromObject(clone, isRigged);
    if (poser) {
      poser.stopAllAction();
      poser.uncacheRoot(clone);
    }

    // Center and normalize to fit a ~2-unit extent. Nesting keeps the scale and
    // the facing turn about the model's center.
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);
    const centered = new THREE.Group();
    centered.position.copy(center).multiplyScalar(-1);
    centered.add(clone);
    const normalized = new THREE.Group();
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    normalized.scale.setScalar(1.8 / maxDim);
    normalized.add(centered);

    // Correct Tripo's +X facing so the character faces the camera.
    if (isTripo) {
      normalized.rotation.y = -Math.PI / 2;
    }

    return { model: normalized, animationRoot: clone, glowMaterials: glowMats };
  }, [scene, animations, isRigged, isTripo]);

  const mixer = useMemo(
    () => (isRigged ? new THREE.AnimationMixer(animationRoot) : null),
    [isRigged, animationRoot],
  );
  const idleActionRef = useRef<THREE.AnimationAction | null>(null);
  const gestureActionRef = useRef<THREE.AnimationAction | null>(null);

  const reportRigged = useEffectEvent((modelUrl: string) => onRigged(modelUrl));
  useEffect(() => {
    if (isRigged) reportRigged(url);
  }, [isRigged, url]);

  useEffect(() => {
    if (!mixer) return;
    const action = mixer.clipAction(idleClip(animations));
    action.play();
    idleActionRef.current = action;
    return () => {
      action.stop();
      idleActionRef.current = null;
      mixer.uncacheRoot(animationRoot);
    };
  }, [animations, mixer, animationRoot]);

  // A gesture cross-fades in from the idle loop, then fades back to idle:
  // after one pass, after TIMED_CLIP_SECONDS for a walk or run, or for a
  // seated clip only when the next gesture replaces it. The `idle` action
  // itself just ends the gesture. Same rules as Lumiere's CreatureMesh.
  const gestureClip = gesture?.clip;
  const gestureCue = gesture?.cue;
  useEffect(() => {
    if (!mixer || !gestureClip || gestureCue == null) return;
    const clip = resolveClip(gestureClip, animations);
    const idle = idleActionRef.current;
    const action = clip ? mixer.clipAction(clip) : null;
    if (!action || action === idle) return;
    const playback = clipPlayback(gestureClip);
    action.reset().setLoop(playback === "once" ? THREE.LoopOnce : THREE.LoopRepeat, playback === "once" ? 1 : Infinity);
    action.clampWhenFinished = playback === "once";
    action.fadeIn(GESTURE_FADE_IN).play();
    idle?.fadeOut(GESTURE_FADE_IN);
    gestureActionRef.current = action;
    const backToIdle = () => {
      action.fadeOut(GESTURE_FADE_OUT);
      idle?.reset().fadeIn(GESTURE_FADE_OUT).play();
      gestureActionRef.current = null;
    };
    const onFinished = (event: { action: THREE.AnimationAction }) => {
      if (event.action === action) backToIdle();
    };
    mixer.addEventListener("finished", onFinished);
    const timer = playback === "timed" ? window.setTimeout(backToIdle, TIMED_CLIP_SECONDS * 1000) : undefined;
    return () => {
      mixer.removeEventListener("finished", onFinished);
      window.clearTimeout(timer);
      if (gestureActionRef.current !== action) return;
      // When the model goes away the idle effect's cleanup has already
      // uncached every action of the root; touching them again throws.
      if (idleActionRef.current) backToIdle();
      else gestureActionRef.current = null;
    };
  }, [gestureClip, gestureCue, mixer, animations]);

  useFrame((frameState, delta) => {
    mixer?.update(Math.min(delta, 0.1));
    if (!groupRef.current) return;

    const smoothing = 1 - Math.exp(-delta * 7.5);
    let targetScale = 1;
    let targetYOffset = 0;
    let targetGlow = 0;

    if (isPreview) {
      const previewWave = (Math.sin(frameState.clock.elapsedTime * 2.2) + 1) * 0.5;
      targetScale = 1 + previewWave * 0.035;
      targetGlow = 0.12 + previewWave * 0.06;
    } else if (isSpeaking) {
      // Fast attack / moderate release for mouth-sync feel
      const attack = 1 - Math.exp(-delta * 18);   // ~55ms to peak
      const release = 1 - Math.exp(-delta * 10);   // ~100ms decay
      const alpha = audioLevel > audioLevelRef.current ? attack : release;
      audioLevelRef.current = THREE.MathUtils.lerp(audioLevelRef.current, audioLevel, alpha);
      const level = audioLevelRef.current;
      // Subtle base pulse + direct audio-reactive glow
      const pulse = (Math.sin(frameState.clock.elapsedTime * 3.0) + 1) * 0.5;
      targetScale = 1.005 + level * 0.045;
      targetYOffset = level * 0.07;
      targetGlow = 0.01 + pulse * 0.015 + level * 0.04;
    } else if (isListening) {
      // Gentle breathing — character is alive and attentive
      const t = frameState.clock.elapsedTime;
      const breath = (Math.sin(t * 1.4) + 1) * 0.5;
      targetScale = 1 + breath * 0.012;
      targetYOffset = breath * 0.015;
      targetGlow = 0.015 + (Math.sin(t * 1.8) + 1) * 0.5 * 0.01;
      audioLevelRef.current = THREE.MathUtils.lerp(audioLevelRef.current, 0, smoothing);
    } else if (isThinking) {
      // Slightly faster pulse — processing
      const t = frameState.clock.elapsedTime;
      const pulse = (Math.sin(t * 2.5) + 1) * 0.5;
      targetScale = 1 + pulse * 0.015;
      targetYOffset = pulse * 0.01;
      targetGlow = 0.02 + pulse * 0.015;
      audioLevelRef.current = THREE.MathUtils.lerp(audioLevelRef.current, 0, smoothing);
    } else {
      // Decay audio level smoothly when not speaking
      audioLevelRef.current = THREE.MathUtils.lerp(audioLevelRef.current, 0, smoothing);
    }

    // A rigged model's skeletal idle already shows it is alive: keep a faint
    // swell, but no lift (its feet stay planted) and no glow, as in Lumiere and
    // the dashboard. The container's CSS still marks listening and speaking.
    if (isRigged) {
      targetScale = 1 + (targetScale - 1) * 0.25;
      targetYOffset = 0;
      targetGlow = 0;
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

// ─── Adaptive FOV — scales character to fill container ──────────

function AdaptiveFov() {
  const { camera, size } = useThree();
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const aspect = size.width / size.height;
    // Base FOV of 45 at ~1:1 aspect. Widen for narrow containers so the
    // model stays fully visible; keep 45 for wide/square containers.
    cam.fov = THREE.MathUtils.clamp(aspect < 1 ? 45 / aspect : 45, 30, 95);
    cam.updateProjectionMatrix();
  }, [camera, size]);
  return null;
}

// ─── Studio Lighting ────────────────────────────────────────────

/**
 * Ported from the dashboard (estuary-frontend model-3d-viewer StudioLighting).
 *
 * Generated characters are rough, non-metallic PBR materials (Tripo's
 * metalness map averages ~0.02, roughness ~0.8). Under three's physical light
 * units the old rig — 0.6 ambient plus two directional lights — lit them at
 * well under half their real colour, so dark clothing and hair read as black.
 * This adds soft light from every direction via three's RoomEnvironment
 * (generated on the GPU, no HDR download) and a key/fill/rim set that models
 * the face and separates the silhouette from the background.
 */
function StudioLighting() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    // The R3F scene is a mutable three.js object; lighting it is the point.
    // eslint-disable-next-line react-hooks/immutability
    scene.environment = environment;
    scene.environmentIntensity = 0.5;
    return () => {
      scene.environment = null;
      environment.dispose();
    };
  }, [gl, scene]);

  return (
    <>
      <hemisphereLight args={["#ffffff", "#8c8279", 0.4]} />
      {/* Key: in front, above and to the right of the camera. */}
      <directionalLight position={[2.5, 4, 5]} intensity={1.6} />
      {/* Fill: lower, from the left, softens the key's shadow side. */}
      <directionalLight position={[-4, 1.5, 3]} intensity={0.5} />
      {/* Rim: from behind, outlines hair and shoulders. */}
      <directionalLight position={[0, 4, -5]} intensity={1.0} />
    </>
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

// ─── Camera Ease ────────────────────────────────────────────────

/**
 * Gently rotate the orbit camera back to its saved front-facing framing,
 * easing azimuth/polar/distance and target over ~0.7s instead of snapping via
 * controls.reset(). Returns a function that cancels the ease.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function easeCameraToFront(controls: any): () => void {
  const camera = controls.object as THREE.PerspectiveCamera;
  const startTarget = controls.target.clone();
  const endTarget = controls.target0.clone();
  const startSph = new THREE.Spherical().setFromVector3(
    camera.position.clone().sub(startTarget),
  );
  const endSph = new THREE.Spherical().setFromVector3(
    controls.position0.clone().sub(endTarget),
  );

  // Take the shortest angular path for the azimuth so a long idle
  // auto-rotation doesn't unwind the "long way" back to front.
  const TWO_PI = Math.PI * 2;
  let dTheta = (endSph.theta - startSph.theta) % TWO_PI;
  if (dTheta > Math.PI) dTheta -= TWO_PI;
  if (dTheta < -Math.PI) dTheta += TWO_PI;

  const DURATION = 0.7; // seconds
  const offset = new THREE.Vector3();
  const sph = new THREE.Spherical();
  let elapsed = 0;
  let lastTime: number | null = null;
  let rafId = 0;

  const animate = (now: number) => {
    if (lastTime === null) lastTime = now;
    elapsed += (now - lastTime) / 1000;
    lastTime = now;
    const t = Math.min(1, elapsed / DURATION);
    const e = t * t * (3 - 2 * t); // smoothstep ease-in-out

    sph.radius = THREE.MathUtils.lerp(startSph.radius, endSph.radius, e);
    sph.phi = THREE.MathUtils.lerp(startSph.phi, endSph.phi, e);
    sph.theta = startSph.theta + dTheta * e;
    sph.makeSafe();
    offset.setFromSpherical(sph);

    controls.target.lerpVectors(startTarget, endTarget, e);
    camera.position.copy(controls.target).add(offset);
    controls.update();

    if (t < 1) rafId = requestAnimationFrame(animate);
  };
  rafId = requestAnimationFrame(animate);
  return () => cancelAnimationFrame(rafId);
}

// ─── Main Component ─────────────────────────────────────────────

export default function CharacterViewer({
  modelUrl,
  previewModelUrl,
  modelStatus,
  avatarUrl,
  state,
  progress,
  audioLevel = 0,
  gesture = null,
}: CharacterViewerProps) {
  const isMobile = useIsMobile();
  const isSpeaking = state === "speaking";
  const [isDragPaused, setIsDragPaused] = useState(false);
  // URL of the loaded model when it turned out to be rigged (it carries clips).
  const [riggedUrl, setRiggedUrl] = useState<string | null>(null);
  const dragTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controlsRef = useRef<any>(null);
  const prevStateRef = useRef<ViewerState>(state);
  const containerRef = useRef<HTMLDivElement>(null);
  const smoothedAudioRef = useRef(0);
  const rawAudioRef = useRef(0);

  // Keep raw audio ref in sync with prop
  rawAudioRef.current = audioLevel;

  // Smoothed --audio-level CSS custom property via requestAnimationFrame
  useEffect(() => {
    if (!isSpeaking) {
      // Decay to zero smoothly when speaking stops
      let decayId: number;
      const decay = () => {
        smoothedAudioRef.current *= 0.88; // exponential decay
        if (smoothedAudioRef.current < 0.005) {
          smoothedAudioRef.current = 0;
          containerRef.current?.style.setProperty('--audio-level', '0');
          return;
        }
        containerRef.current?.style.setProperty('--audio-level', String(smoothedAudioRef.current));
        decayId = requestAnimationFrame(decay);
      };
      decayId = requestAnimationFrame(decay);
      return () => cancelAnimationFrame(decayId);
    }

    let rafId: number;
    const update = () => {
      const raw = rawAudioRef.current;
      const current = smoothedAudioRef.current;
      // Lerp: fast attack (0.18), slower release (0.08)
      const alpha = raw > current ? 0.18 : 0.08;
      smoothedAudioRef.current = current + (raw - current) * alpha;
      containerRef.current?.style.setProperty('--audio-level', String(smoothedAudioRef.current));
      rafId = requestAnimationFrame(update);
    };
    rafId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(rafId);
  }, [isSpeaking]);

  // When entering a voice/response state from idle, gently rotate the camera
  // back to the saved front-facing framing instead of snapping via
  // controls.reset(). While idle the camera auto-rotates around the model; an
  // instant reset the moment the character started responding felt jarring, so
  // we ease the orbit (azimuth/polar/distance) and target back over ~0.7s.
  useEffect(() => {
    const prev = prevStateRef.current;
    prevStateRef.current = state;
    const wasIdle = prev === "idle" || prev === "happy";
    const isVoiceState = state === "listening" || state === "speaking" || state === "thinking";
    if (!(isVoiceState && wasIdle)) return;

    const controls = controlsRef.current;
    if (!controls) return;
    return easeCameraToFront(controls);
  }, [state]);

  const handleDragEnd = useCallback(() => {
    setIsDragPaused(true);
    if (dragTimerRef.current) clearTimeout(dragTimerRef.current);
    dragTimerRef.current = setTimeout(() => setIsDragPaused(false), 1000);
  }, []);
  const isGenerating = modelStatus === "generating";
  const isPreviewReady = modelStatus === "preview_ready";

  // Determine which model URL to use, proxied through our API
  const rawModelUrl = modelUrl ?? (isPreviewReady || isGenerating ? previewModelUrl ?? null : null);
  const activeModelUrl = proxyUrl(rawModelUrl);
  const isPreviewModel = !modelUrl && !!previewModelUrl && (isPreviewReady || isGenerating);
  const hasModel = !!activeModelUrl;
  const isRigged = riggedUrl !== null && riggedUrl === activeModelUrl;

  // A rigged character plays its clip toward the viewer, so a camera the user
  // dragged away eases back to the front (Lumiere turns the model instead).
  const gestureCue = gesture?.cue;
  useEffect(() => {
    const controls = controlsRef.current;
    if (!isRigged || gestureCue == null || !controls) return;
    return easeCameraToFront(controls);
  }, [isRigged, gestureCue]);
  const proxiedAvatar = proxyUrl(avatarUrl);

  // Show loading when model is being fetched or generating
  const showLoading = !hasModel && (isGenerating || isPreviewReady);

  const isListeningState = state === "listening";
  const isThinkingState = state === "thinking";
  const containerClass = [
    "character-viewer",
    isSpeaking && "character-viewer--speaking",
    isListeningState && "character-viewer--listening",
    isThinkingState && "character-viewer--thinking",
  ].filter(Boolean).join(" ");

  // No model and not generating → show profile pic or placeholder
  if (!hasModel && !showLoading) {
    return (
      <div ref={containerRef} className={containerClass}>
        <ProfileFallback avatarUrl={proxiedAvatar} />
      </div>
    );
  }

  return (
    <div ref={containerRef} className={containerClass}>
      {showLoading && (
        <LoadingOverlay
          progress={progress}
          text={isGenerating ? "Generating model..." : "Loading..."}
        />
      )}
      {hasModel && (
        <Canvas
          camera={{ position: [0, 0.2, 3.2], fov: 45 }}
          gl={{ alpha: true, antialias: !isMobile, stencil: false }}
          dpr={[1, 2]}
          style={{ background: "transparent" }}
          // Neutral (Khronos PBR) tone mapping keeps a character's base colours
          // true; R3F's default ACES darkens and desaturates the mid-tones a
          // stylised character lives in. R3F only sets this once, at creation.
          onCreated={({ gl }) => {
            gl.toneMapping = THREE.NeutralToneMapping;
            gl.toneMappingExposure = 1;
          }}
        >
          <AdaptiveFov />
          <StudioLighting />
          <Suspense fallback={null}>
            <GLBModel
              url={activeModelUrl!}
              state={state}
              isPreview={isPreviewModel}
              audioLevel={audioLevel}
              gesture={gesture}
              onRigged={setRiggedUrl}
            />
          </Suspense>
          <OrbitControls
            ref={controlsRef}
            enablePan={false}
            enableZoom={true}
            minDistance={1.5}
            maxDistance={10}
            // A rigged character stands and moves on its own instead of spinning.
            autoRotate={(state === "idle" || state === "happy") && !isDragPaused && !isRigged}
            autoRotateSpeed={0.9}
            onEnd={handleDragEnd}
          />
        </Canvas>
      )}

      {/* Status pill — shown only while speaking. The listening and thinking
          states (incl. image analysis) are conveyed by the character's
          breathing + blue-glow animation, without a pill. */}
      {isSpeaking && (
        <div className="character-viewer__status-pill">
          <span className={`character-viewer__status-dot character-viewer__status-dot--${state}`} />
          <span className="character-viewer__status-label">Speaking</span>
        </div>
      )}
    </div>
  );
}
