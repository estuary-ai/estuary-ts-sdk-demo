"use client";

import { useEffect, useRef, useState, useCallback } from "react";

export type CharacterState = "idle" | "listening" | "thinking" | "speaking" | "happy";

interface CharacterAvatarProps {
  state: CharacterState;
  className?: string;
}

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
  bodyBounce: number;
}

const STATE_TARGETS: Record<CharacterState, Partial<FaceState>> = {
  idle: { eyeOpenL: 1, eyeOpenR: 1, pupilX: 0, pupilY: 0, browL: 0, browR: 0, mouthOpen: 0, mouthWidth: 0.5, mouthSmile: 0.3, headTilt: 0, blush: 0, bodyBounce: 0 },
  listening: { eyeOpenL: 1.15, eyeOpenR: 1.15, pupilX: 0, pupilY: -0.1, browL: 0.3, browR: 0.3, mouthOpen: 0.05, mouthWidth: 0.45, mouthSmile: 0.1, headTilt: -2, blush: 0, bodyBounce: 0 },
  thinking: { eyeOpenL: 0.85, eyeOpenR: 0.85, pupilX: 0.35, pupilY: -0.35, browL: 0.2, browR: -0.2, mouthOpen: 0, mouthWidth: 0.3, mouthSmile: -0.05, headTilt: 4, blush: 0, bodyBounce: 0 },
  speaking: { eyeOpenL: 1.05, eyeOpenR: 1.05, pupilX: 0, pupilY: 0, browL: 0.1, browR: 0.1, mouthOpen: 0.4, mouthWidth: 0.55, mouthSmile: 0.2, headTilt: 0, blush: 0, bodyBounce: 0.5 },
  happy: { eyeOpenL: 0.6, eyeOpenR: 0.6, pupilX: 0, pupilY: 0.05, browL: 0.25, browR: 0.25, mouthOpen: 0.2, mouthWidth: 0.7, mouthSmile: 1, headTilt: -2, blush: 0.7, bodyBounce: 0.3 },
};

export default function CharacterAvatar({ state, className = "" }: CharacterAvatarProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const faceRef = useRef<FaceState>({
    eyeOpenL: 1, eyeOpenR: 1, pupilX: 0, pupilY: 0,
    browL: 0, browR: 0, mouthOpen: 0, mouthWidth: 0.5,
    mouthSmile: 0.3, headTilt: 0, headBob: 0, blush: 0, bodyBounce: 0,
  });
  const frameRef = useRef<number>(0);
  const timeRef = useRef<number>(0);
  const blinkTimerRef = useRef<number>(0);
  const nextBlinkRef = useRef<number>(2 + Math.random() * 3);
  const [size, setSize] = useState({ w: 400, h: 500 });

  const draw = useCallback((ctx: CanvasRenderingContext2D, t: number, dt: number) => {
    const f = faceRef.current;
    const target = STATE_TARGETS[state];
    const speed = 0.07;

    for (const key of Object.keys(target) as (keyof FaceState)[]) {
      const tv = target[key] as number;
      f[key] = lerp(f[key], tv, speed);
    }

    // Blink
    blinkTimerRef.current += dt;
    if (blinkTimerRef.current > nextBlinkRef.current) {
      blinkTimerRef.current = 0;
      nextBlinkRef.current = 2.5 + Math.random() * 4;
    }
    const blinkPhase = blinkTimerRef.current;
    let blinkMul = 1;
    if (blinkPhase < 0.12) {
      blinkMul = Math.max(0.05, 1 - blinkPhase / 0.06);
    } else if (blinkPhase < 0.22) {
      blinkMul = 0.05 + ((blinkPhase - 0.12) / 0.1) * 0.95;
    }

    // Speaking mouth oscillation
    let speakMod = 0;
    if (state === "speaking") {
      speakMod = Math.sin(t * 9) * 0.15 + Math.sin(t * 14.3) * 0.1 + Math.sin(t * 5.7) * 0.08;
    }

    // Idle micro-movements
    const idlePupilX = Math.sin(t * 0.7) * 0.05;
    const idlePupilY = Math.cos(t * 0.5) * 0.03;
    const breathe = Math.sin(t * 1.2) * 0.006;
    f.headBob = Math.sin(t * 1.2) * 1.5 + f.bodyBounce * Math.sin(t * 3.5) * 3;

    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    const cx = w / 2;
    const cy = h / 2 + 30;
    const scale = Math.min(w, h) / 520;

    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(cx, cy + f.headBob);
    ctx.rotate((f.headTilt * Math.PI) / 180);
    ctx.scale(scale, scale);

    // --- Body ---
    // Shoulders / torso
    const bodyGrad = ctx.createLinearGradient(0, 120, 0, 220);
    bodyGrad.addColorStop(0, "#6366f1");
    bodyGrad.addColorStop(1, "#4338ca");
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.moveTo(-70, 120);
    ctx.quadraticCurveTo(-110, 160, -105, 210);
    ctx.lineTo(105, 210);
    ctx.quadraticCurveTo(110, 160, 70, 120);
    ctx.fill();

    // Collar / neck area
    ctx.fillStyle = "#818cf8";
    ctx.beginPath();
    ctx.ellipse(0, 125, 38, 18, 0, 0, Math.PI);
    ctx.fill();

    // --- Head shadow ---
    ctx.fillStyle = "rgba(67, 56, 202, 0.12)";
    ctx.beginPath();
    ctx.ellipse(3, 10, 118, 115, 0, 0, Math.PI * 2);
    ctx.fill();

    // --- Head ---
    const headR = 108;
    const headGrad = ctx.createRadialGradient(-20, -30, 20, 0, 0, headR);
    headGrad.addColorStop(0, "#fef0e4");
    headGrad.addColorStop(0.6, "#fde8d8");
    headGrad.addColorStop(1, "#f0c8a8");
    ctx.fillStyle = headGrad;
    ctx.beginPath();
    ctx.ellipse(0, 0, headR, headR * (1 + breathe), 0, 0, Math.PI * 2);
    ctx.fill();

    // Head outline (subtle)
    ctx.strokeStyle = "rgba(180, 140, 110, 0.15)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // --- Ears ---
    for (const side of [-1, 1]) {
      ctx.fillStyle = "#fde0cc";
      ctx.beginPath();
      ctx.ellipse(side * (headR - 8), 5, 14, 22, side * 0.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#f5c4a8";
      ctx.beginPath();
      ctx.ellipse(side * (headR - 6), 5, 8, 14, side * 0.15, 0, Math.PI * 2);
      ctx.fill();
    }

    // --- Hair ---
    const hairGrad = ctx.createLinearGradient(0, -headR - 20, 0, -headR + 60);
    hairGrad.addColorStop(0, "#312e81");
    hairGrad.addColorStop(1, "#4338ca");
    ctx.fillStyle = hairGrad;

    // Main hair top
    ctx.beginPath();
    ctx.ellipse(0, -28, headR + 6, headR * 0.72, 0, Math.PI, Math.PI * 2);
    ctx.fill();

    // Side hair
    ctx.fillStyle = "#3730a3";
    ctx.beginPath();
    ctx.ellipse(-headR + 8, -5, 26, 58, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(headR - 8, -5, 26, 58, -0.2, 0, Math.PI * 2);
    ctx.fill();

    // Bangs
    ctx.fillStyle = "#4338ca";
    ctx.beginPath();
    ctx.ellipse(-28, -headR + 24, 38, 22, -0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(22, -headR + 20, 42, 24, 0.15, 0, Math.PI * 2);
    ctx.fill();
    // Central bang highlight
    ctx.fillStyle = "#4f46e5";
    ctx.beginPath();
    ctx.ellipse(-5, -headR + 18, 25, 15, 0, 0, Math.PI * 2);
    ctx.fill();

    // Hair shine
    ctx.fillStyle = "rgba(165, 160, 255, 0.15)";
    ctx.beginPath();
    ctx.ellipse(-30, -headR + 5, 35, 12, -0.3, 0, Math.PI * 2);
    ctx.fill();

    // --- Blush ---
    if (f.blush > 0.01) {
      ctx.fillStyle = `rgba(255, 130, 130, ${f.blush * 0.3})`;
      ctx.beginPath();
      ctx.ellipse(-62, 32, 26, 14, -0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(62, 32, 26, 14, 0.1, 0, Math.PI * 2);
      ctx.fill();
    }

    // --- Eyes ---
    const eyeSpacing = 40;
    const eyeY = -8;
    const eyeHL = 22 * f.eyeOpenL * blinkMul;
    const eyeHR = 22 * f.eyeOpenR * blinkMul;
    const pupilOfsX = (f.pupilX + idlePupilX) * 8;
    const pupilOfsY = (f.pupilY + idlePupilY) * 6;

    for (const side of [-1, 1]) {
      const ex = side * eyeSpacing;
      const eH = side === -1 ? eyeHL : eyeHR;

      // Eye socket shadow
      ctx.fillStyle = "rgba(180, 140, 120, 0.08)";
      ctx.beginPath();
      ctx.ellipse(ex, eyeY + 2, 22, Math.max(eH + 4, 4), 0, 0, Math.PI * 2);
      ctx.fill();

      // Eye white
      const whiteGrad = ctx.createRadialGradient(ex, eyeY, 2, ex, eyeY, 20);
      whiteGrad.addColorStop(0, "#ffffff");
      whiteGrad.addColorStop(1, "#f0eef5");
      ctx.fillStyle = whiteGrad;
      ctx.beginPath();
      ctx.ellipse(ex, eyeY, 19, Math.max(eH, 1), 0, 0, Math.PI * 2);
      ctx.fill();

      if (eH > 2) {
        // Iris
        const irisGrad = ctx.createRadialGradient(
          ex + pupilOfsX, eyeY + pupilOfsY, 1,
          ex + pupilOfsX, eyeY + pupilOfsY, 13
        );
        irisGrad.addColorStop(0, "#818cf8");
        irisGrad.addColorStop(0.4, "#6366f1");
        irisGrad.addColorStop(0.8, "#4338ca");
        irisGrad.addColorStop(1, "#312e81");
        ctx.fillStyle = irisGrad;
        ctx.beginPath();
        ctx.ellipse(ex + pupilOfsX, eyeY + pupilOfsY, 12, Math.min(12, eH * 0.7), 0, 0, Math.PI * 2);
        ctx.fill();

        // Pupil
        ctx.fillStyle = "#1e1b4b";
        ctx.beginPath();
        ctx.ellipse(ex + pupilOfsX, eyeY + pupilOfsY, 5.5, Math.min(5.5, eH * 0.3), 0, 0, Math.PI * 2);
        ctx.fill();

        // Eye shine (main)
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.beginPath();
        ctx.ellipse(ex + pupilOfsX + 3.5, eyeY + pupilOfsY - 3.5, 3.5, 2.8, -0.3, 0, Math.PI * 2);
        ctx.fill();

        // Eye shine (secondary)
        ctx.fillStyle = "rgba(255,255,255,0.4)";
        ctx.beginPath();
        ctx.ellipse(ex + pupilOfsX - 2, eyeY + pupilOfsY + 3, 1.8, 1.2, 0.2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Upper eyelid line
      ctx.strokeStyle = "#c4a68a";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(ex, eyeY, 20, Math.max(eH + 1, 2), 0, Math.PI, Math.PI * 2);
      ctx.stroke();

      // Lower eyelash
      ctx.strokeStyle = "rgba(196, 166, 138, 0.3)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(ex, eyeY, 18, Math.max(eH - 1, 1), 0, 0, Math.PI);
      ctx.stroke();
    }

    // --- Eyebrows ---
    ctx.strokeStyle = "#4338ca";
    ctx.lineWidth = 3.5;
    ctx.lineCap = "round";
    for (const side of [-1, 1]) {
      const bx = side * eyeSpacing;
      const browLift = side === -1 ? f.browL : f.browR;
      ctx.beginPath();
      ctx.moveTo(bx - side * 17, eyeY - 28 - browLift * 8);
      ctx.quadraticCurveTo(bx, eyeY - 35 - browLift * 13, bx + side * 17, eyeY - 26 - browLift * 6);
      ctx.stroke();
    }

    // --- Nose ---
    ctx.strokeStyle = "#d4a78a";
    ctx.lineWidth = 1.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-3, 20);
    ctx.quadraticCurveTo(0, 30, 6, 26);
    ctx.stroke();

    // Nose highlight
    ctx.fillStyle = "rgba(255, 240, 230, 0.5)";
    ctx.beginPath();
    ctx.ellipse(1, 22, 4, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // --- Mouth ---
    const mouthY = 52;
    const mOpen = f.mouthOpen + speakMod;
    const mW = f.mouthWidth * 50;
    const smile = f.mouthSmile;
    const mOpenClamped = Math.max(0, Math.min(mOpen, 0.8));

    if (mOpenClamped > 0.05) {
      // Open mouth shadow
      ctx.fillStyle = "rgba(0, 0, 0, 0.05)";
      ctx.beginPath();
      ctx.moveTo(-mW, mouthY + 2);
      ctx.quadraticCurveTo(0, mouthY + mOpenClamped * 48 + smile * 10, mW, mouthY + 2);
      ctx.quadraticCurveTo(0, mouthY - mOpenClamped * 3 + smile * 5, -mW, mouthY + 2);
      ctx.fill();

      // Mouth interior
      const mouthGrad = ctx.createLinearGradient(0, mouthY, 0, mouthY + mOpenClamped * 40);
      mouthGrad.addColorStop(0, "#c0445a");
      mouthGrad.addColorStop(1, "#8b2240");
      ctx.fillStyle = mouthGrad;
      ctx.beginPath();
      ctx.moveTo(-mW, mouthY);
      ctx.quadraticCurveTo(0, mouthY + mOpenClamped * 45 + smile * 10, mW, mouthY);
      ctx.quadraticCurveTo(0, mouthY - mOpenClamped * 5 + smile * 5, -mW, mouthY);
      ctx.fill();

      // Tongue
      if (mOpenClamped > 0.2) {
        ctx.fillStyle = "#e05a70";
        ctx.beginPath();
        ctx.ellipse(0, mouthY + mOpenClamped * 26, mW * 0.45, mOpenClamped * 10, 0, 0, Math.PI);
        ctx.fill();
      }

      // Teeth
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.moveTo(-mW + 5, mouthY);
      ctx.quadraticCurveTo(0, mouthY + mOpenClamped * 8, mW - 5, mouthY);
      ctx.lineTo(mW - 5, mouthY + 4);
      ctx.quadraticCurveTo(0, mouthY + mOpenClamped * 10 + 4, -mW + 5, mouthY + 4);
      ctx.fill();

      // Mouth outline
      ctx.strokeStyle = "rgba(160, 50, 70, 0.4)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-mW, mouthY);
      ctx.quadraticCurveTo(0, mouthY + mOpenClamped * 45 + smile * 10, mW, mouthY);
      ctx.stroke();
    } else {
      // Closed mouth
      ctx.strokeStyle = "#c0445a";
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-mW, mouthY);
      ctx.quadraticCurveTo(0, mouthY + smile * 24, mW, mouthY);
      ctx.stroke();

      // Lip highlight
      if (smile > 0.2) {
        ctx.strokeStyle = "rgba(255, 200, 200, 0.3)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-mW + 8, mouthY - 1);
        ctx.quadraticCurveTo(0, mouthY + smile * 18, mW - 8, mouthY - 1);
        ctx.stroke();
      }
    }

    // --- State indicator glow ---
    if (state === "listening") {
      const glowAlpha = 0.06 + Math.sin(t * 3) * 0.03;
      ctx.fillStyle = `rgba(99, 102, 241, ${glowAlpha})`;
      ctx.beginPath();
      ctx.ellipse(0, 0, headR + 25, headR + 25, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (state === "speaking") {
      const glowAlpha = 0.05 + Math.sin(t * 4) * 0.03;
      ctx.fillStyle = `rgba(139, 92, 246, ${glowAlpha})`;
      ctx.beginPath();
      ctx.ellipse(0, 0, headR + 20, headR + 20, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (state === "thinking") {
      // Thinking dots
      const dotAlpha = 0.4 + Math.sin(t * 2.5) * 0.3;
      ctx.fillStyle = `rgba(99, 102, 241, ${dotAlpha})`;
      for (let i = 0; i < 3; i++) {
        const dotPhase = t * 2 + i * 0.4;
        const dotY = -headR - 25 - Math.sin(dotPhase) * 8;
        ctx.beginPath();
        ctx.ellipse(50 + i * 14, dotY, 4 - i * 0.5, 4 - i * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
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
