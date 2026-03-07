"use client";

import { useEffect, useRef, useState, useCallback } from "react";

export type CharacterState = "idle" | "listening" | "thinking" | "speaking" | "happy";

interface CharacterAvatarProps {
  state: CharacterState;
  className?: string;
}

// Smooth interpolation helper
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

interface FaceState {
  eyeOpenL: number;
  eyeOpenR: number;
  pupilX: number;
  pupilY: number;
  browL: number;
  browR: number;
  mouthOpen: number;
  mouthWidth: number;
  mouthSmile: number;
  headTilt: number;
  headBob: number;
  blush: number;
}

const STATE_TARGETS: Record<CharacterState, Partial<FaceState>> = {
  idle: { eyeOpenL: 1, eyeOpenR: 1, pupilX: 0, pupilY: 0, browL: 0, browR: 0, mouthOpen: 0, mouthWidth: 0.5, mouthSmile: 0.3, headTilt: 0, blush: 0 },
  listening: { eyeOpenL: 1.15, eyeOpenR: 1.15, pupilX: 0, pupilY: -0.1, browL: 0.3, browR: 0.3, mouthOpen: 0.05, mouthWidth: 0.45, mouthSmile: 0.1, headTilt: -2, blush: 0 },
  thinking: { eyeOpenL: 0.85, eyeOpenR: 0.85, pupilX: 0.3, pupilY: -0.3, browL: 0.15, browR: -0.15, mouthOpen: 0, mouthWidth: 0.35, mouthSmile: 0, headTilt: 3, blush: 0 },
  speaking: { eyeOpenL: 1.05, eyeOpenR: 1.05, pupilX: 0, pupilY: 0, browL: 0.1, browR: 0.1, mouthOpen: 0.4, mouthWidth: 0.55, mouthSmile: 0.2, headTilt: 0, blush: 0 },
  happy: { eyeOpenL: 0.7, eyeOpenR: 0.7, pupilX: 0, pupilY: 0, browL: 0.2, browR: 0.2, mouthOpen: 0.15, mouthWidth: 0.65, mouthSmile: 0.8, headTilt: -1, blush: 0.6 },
};

export default function CharacterAvatar({ state, className = "" }: CharacterAvatarProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const faceRef = useRef<FaceState>({
    eyeOpenL: 1, eyeOpenR: 1, pupilX: 0, pupilY: 0,
    browL: 0, browR: 0, mouthOpen: 0, mouthWidth: 0.5,
    mouthSmile: 0.3, headTilt: 0, headBob: 0, blush: 0,
  });
  const frameRef = useRef<number>(0);
  const timeRef = useRef<number>(0);
  const blinkTimerRef = useRef<number>(0);
  const nextBlinkRef = useRef<number>(2 + Math.random() * 3);
  const [size, setSize] = useState({ w: 400, h: 500 });

  const draw = useCallback((ctx: CanvasRenderingContext2D, t: number, dt: number) => {
    const f = faceRef.current;
    const target = STATE_TARGETS[state];
    const speed = 0.08;

    // Interpolate toward target
    for (const key of Object.keys(target) as (keyof FaceState)[]) {
      const tv = target[key] as number;
      f[key] = lerp(f[key], tv, speed);
    }

    // Blink logic
    blinkTimerRef.current += dt;
    if (blinkTimerRef.current > nextBlinkRef.current) {
      blinkTimerRef.current = 0;
      nextBlinkRef.current = 2.5 + Math.random() * 4;
    }
    const blinkPhase = blinkTimerRef.current;
    let blinkMul = 1;
    if (blinkPhase < 0.15) {
      blinkMul = 1 - (blinkPhase / 0.08);
      if (blinkMul < 0.05) blinkMul = 0.05;
    } else if (blinkPhase < 0.25) {
      blinkMul = 0.05 + ((blinkPhase - 0.15) / 0.1) * 0.95;
    }

    // Speaking mouth oscillation
    let speakMod = 0;
    if (state === "speaking") {
      speakMod = Math.sin(t * 8) * 0.15 + Math.sin(t * 13.7) * 0.1 + Math.sin(t * 5.3) * 0.08;
    }

    // Idle micro-movements
    const idlePupilX = Math.sin(t * 0.7) * 0.05;
    const idlePupilY = Math.cos(t * 0.5) * 0.03;
    const breathe = Math.sin(t * 1.2) * 0.005;
    f.headBob = Math.sin(t * 1.2) * 1.5;

    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    const cx = w / 2;
    const cy = h / 2 + 20;
    const scale = Math.min(w, h) / 500;

    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(cx, cy + f.headBob);
    ctx.rotate((f.headTilt * Math.PI) / 180);
    ctx.scale(scale, scale);

    // --- Neck / Body hint ---
    ctx.fillStyle = "#6366f1";
    ctx.beginPath();
    ctx.ellipse(0, 155, 80, 40, 0, 0, Math.PI);
    ctx.fill();

    ctx.fillStyle = "#4f46e5";
    ctx.beginPath();
    ctx.moveTo(-35, 120);
    ctx.quadraticCurveTo(-80, 180, -80, 195);
    ctx.lineTo(80, 195);
    ctx.quadraticCurveTo(80, 180, 35, 120);
    ctx.fill();

    // --- Head ---
    const headR = 110;
    // Shadow
    const grad = ctx.createRadialGradient(0, 5, headR * 0.8, 0, 5, headR * 1.15);
    grad.addColorStop(0, "rgba(99, 102, 241, 0)");
    grad.addColorStop(1, "rgba(99, 102, 241, 0.15)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(0, 8, headR + 10, headR + 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // Head fill
    const headGrad = ctx.createLinearGradient(0, -headR, 0, headR);
    headGrad.addColorStop(0, "#fde8d8");
    headGrad.addColorStop(1, "#f5d0b8");
    ctx.fillStyle = headGrad;
    ctx.beginPath();
    ctx.ellipse(0, 0, headR, headR * (1 + breathe), 0, 0, Math.PI * 2);
    ctx.fill();

    // --- Hair ---
    ctx.fillStyle = "#4338ca";
    ctx.beginPath();
    ctx.ellipse(0, -30, headR + 5, headR * 0.75, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    // Side hair
    ctx.beginPath();
    ctx.ellipse(-headR + 10, -10, 25, 55, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(headR - 10, -10, 25, 55, -0.2, 0, Math.PI * 2);
    ctx.fill();
    // Bangs
    ctx.beginPath();
    ctx.ellipse(-30, -headR + 25, 35, 20, -0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(20, -headR + 20, 40, 22, 0.15, 0, Math.PI * 2);
    ctx.fill();

    // --- Blush ---
    if (f.blush > 0.01) {
      ctx.fillStyle = `rgba(255, 140, 140, ${f.blush * 0.35})`;
      ctx.beginPath();
      ctx.ellipse(-65, 30, 25, 15, -0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(65, 30, 25, 15, 0.1, 0, Math.PI * 2);
      ctx.fill();
    }

    // --- Eyes ---
    const eyeSpacing = 42;
    const eyeY = -10;
    const eyeH = 22 * f.eyeOpenL * blinkMul;
    const eyeHR = 22 * f.eyeOpenR * blinkMul;
    const pupilOfsX = (f.pupilX + idlePupilX) * 8;
    const pupilOfsY = (f.pupilY + idlePupilY) * 6;

    for (const side of [-1, 1]) {
      const ex = side * eyeSpacing;
      const eH = side === -1 ? eyeH : eyeHR;

      // Eye white
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.ellipse(ex, eyeY, 18, Math.max(eH, 1), 0, 0, Math.PI * 2);
      ctx.fill();

      // Iris
      if (eH > 2) {
        const irisGrad = ctx.createRadialGradient(ex + pupilOfsX, eyeY + pupilOfsY, 2, ex + pupilOfsX, eyeY + pupilOfsY, 12);
        irisGrad.addColorStop(0, "#6366f1");
        irisGrad.addColorStop(0.7, "#4338ca");
        irisGrad.addColorStop(1, "#312e81");
        ctx.fillStyle = irisGrad;
        ctx.beginPath();
        ctx.ellipse(ex + pupilOfsX, eyeY + pupilOfsY, 11, Math.min(11, eH * 0.7), 0, 0, Math.PI * 2);
        ctx.fill();

        // Pupil
        ctx.fillStyle = "#1e1b4b";
        ctx.beginPath();
        ctx.ellipse(ex + pupilOfsX, eyeY + pupilOfsY, 5, Math.min(5, eH * 0.3), 0, 0, Math.PI * 2);
        ctx.fill();

        // Eye shine
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        ctx.beginPath();
        ctx.ellipse(ex + pupilOfsX + 3, eyeY + pupilOfsY - 3, 3, 2.5, -0.3, 0, Math.PI * 2);
        ctx.fill();
      }

      // Eyelid line
      ctx.strokeStyle = "#c4a68a";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(ex, eyeY, 19, Math.max(eH + 1, 2), 0, Math.PI, Math.PI * 2);
      ctx.stroke();
    }

    // --- Eyebrows ---
    ctx.strokeStyle = "#4338ca";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    for (const side of [-1, 1]) {
      const bx = side * eyeSpacing;
      const browLift = side === -1 ? f.browL : f.browR;
      ctx.beginPath();
      ctx.moveTo(bx - side * 16, eyeY - 28 - browLift * 8);
      ctx.quadraticCurveTo(bx, eyeY - 34 - browLift * 12, bx + side * 16, eyeY - 26 - browLift * 6);
      ctx.stroke();
    }

    // --- Nose ---
    ctx.strokeStyle = "#d4a78a";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-3, 18);
    ctx.quadraticCurveTo(0, 28, 5, 24);
    ctx.stroke();

    // --- Mouth ---
    const mouthY = 50;
    const mOpen = f.mouthOpen + speakMod;
    const mW = f.mouthWidth * 50;
    const smile = f.mouthSmile;
    const mOpenClamped = Math.max(0, Math.min(mOpen, 0.8));

    if (mOpenClamped > 0.05) {
      // Open mouth
      ctx.fillStyle = "#c0445a";
      ctx.beginPath();
      ctx.moveTo(-mW, mouthY);
      ctx.quadraticCurveTo(0, mouthY + mOpenClamped * 45 + smile * 10, mW, mouthY);
      ctx.quadraticCurveTo(0, mouthY - mOpenClamped * 5 + smile * 5, -mW, mouthY);
      ctx.fill();

      // Tongue hint
      if (mOpenClamped > 0.2) {
        ctx.fillStyle = "#e05a70";
        ctx.beginPath();
        ctx.ellipse(0, mouthY + mOpenClamped * 25, mW * 0.5, mOpenClamped * 12, 0, 0, Math.PI);
        ctx.fill();
      }

      // Teeth
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.moveTo(-mW + 5, mouthY);
      ctx.quadraticCurveTo(0, mouthY + mOpenClamped * 8, mW - 5, mouthY);
      ctx.lineTo(mW - 5, mouthY + 3);
      ctx.quadraticCurveTo(0, mouthY + mOpenClamped * 10 + 3, -mW + 5, mouthY + 3);
      ctx.fill();
    } else {
      // Closed mouth / smile
      ctx.strokeStyle = "#c0445a";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-mW, mouthY);
      ctx.quadraticCurveTo(0, mouthY + smile * 22, mW, mouthY);
      ctx.stroke();
    }

    ctx.restore();
  }, [state]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let running = true;
    let lastTime = performance.now();

    const loop = (now: number) => {
      if (!running) return;
      const dt = (now - lastTime) / 1000;
      lastTime = now;
      timeRef.current += dt;
      draw(ctx, timeRef.current, dt);
      frameRef.current = requestAnimationFrame(loop);
    };

    frameRef.current = requestAnimationFrame(loop);
    return () => {
      running = false;
      cancelAnimationFrame(frameRef.current);
    };
  }, [draw]);

  // Responsive sizing
  useEffect(() => {
    const update = () => {
      const el = canvasRef.current?.parentElement;
      if (el) {
        const dpr = window.devicePixelRatio || 1;
        const w = el.clientWidth;
        const h = el.clientHeight;
        setSize({ w: w * dpr, h: h * dpr });
      }
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return (
    <div className={`relative w-full h-full ${className}`}>
      <canvas
        ref={canvasRef}
        width={size.w}
        height={size.h}
        className="w-full h-full"
      />
    </div>
  );
}
