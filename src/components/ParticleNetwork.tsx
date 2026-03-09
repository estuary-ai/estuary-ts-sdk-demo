"use client";

import { useEffect, useState } from "react";
import Particles, { initParticlesEngine } from "@tsparticles/react";
import { loadSlim } from "@tsparticles/slim";
import type { ISourceOptions } from "@tsparticles/engine";

const OPTIONS: ISourceOptions = {
  fullScreen: false,
  background: { color: "transparent" },
  fpsLimit: 60,
  particles: {
    number: {
      value: 70,
      density: { enable: true, width: 1200, height: 800 },
    },
    color: { value: "#818cf8" },
    links: {
      enable: true,
      color: "#818cf8",
      distance: 150,
      opacity: 0.15,
      width: 1,
    },
    move: {
      enable: true,
      speed: 0.8,
      direction: "none",
      outModes: { default: "bounce" },
    },
    opacity: {
      value: { min: 0.15, max: 0.4 },
    },
    size: {
      value: { min: 1, max: 3 },
    },
    shape: { type: "circle" },
  },
  interactivity: {
    events: {
      onHover: {
        enable: true,
        mode: "grab",
      },
      onClick: {
        enable: true,
        mode: "push",
      },
    },
    modes: {
      grab: {
        distance: 200,
        links: {
          opacity: 0.35,
          color: "#a5a0ff",
        },
      },
      push: {
        quantity: 3,
      },
    },
  },
  detectRetina: true,
};

export default function ParticleNetwork() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    initParticlesEngine(async (engine) => {
      await loadSlim(engine);
    }).then(() => setReady(true));
  }, []);

  if (!ready) return null;

  return (
    <Particles
      id="landing-particles"
      className="absolute inset-0 w-full h-full"
      options={OPTIONS}
    />
  );
}
