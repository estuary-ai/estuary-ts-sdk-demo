/**
 * How a character's actions play as clips of its rigged GLB. Ported from
 * Lumiere (lumiere/web/src/lib/clipActions.ts), itself a port of the Estuary
 * web client (estuary-frontend/src/lib/character-animations.ts), so a
 * character moves the same here as on the device and in the dashboard.
 *
 * Since contract v1.40 a rigged GLB names its clips with the bare names its
 * actions carry (`wave`); characters rigged earlier carry Tripo's qualified
 * names (`preset:biped:wave`) for the same bare action. Both sides are
 * compared by their bare tail, exact match only, so `sit` never plays
 * `sit_kick` and `idle` never plays `happy_idle`.
 */

/** A clip from a rigged GLB played over the idle loop, such as a wave the character chose. */
export interface ModelGesture {
  /** Action or clip name, matched to the GLB's clips by bare name. */
  clip: string;
  /** A new value plays the clip again, so the same action twice plays twice. */
  cue: number;
}

/** The tail of a qualified clip name: `preset:biped:walk` -> `walk`. */
export function bareClipName(name: string): string {
  return (name.split(":").pop() ?? name).trim();
}

/** The clip an action refers to, or null when the model has none (an authored gesture, a static mesh). */
export function resolveClip<Clip extends { name: string }>(action: string, clips: readonly Clip[]): Clip | null {
  const wanted = bareClipName(action).toLowerCase();
  if (!wanted) return null;
  return clips.find((clip) => bareClipName(clip.name).toLowerCase() === wanted) ?? null;
}

/**
 * `once` plays the clip through and hands back to idle. `timed` repeats it for
 * TIMED_CLIP_SECONDS, because one stride of a walk reads as a stumble. `held`
 * repeats until the next action, so a seated character stays seated.
 */
export type ClipPlayback = "once" | "timed" | "held";

/** Long enough to read as walking; the rig walks in place, so not much longer. */
export const TIMED_CLIP_SECONDS = 4;

const TIMED_CLIPS = new Set(["walk", "run"]);
const HELD_CLIPS = new Set(["sit", "sit_kick"]);

export function clipPlayback(action: string): ClipPlayback {
  const bare = bareClipName(action).toLowerCase();
  if (HELD_CLIPS.has(bare)) return "held";
  if (TIMED_CLIPS.has(bare)) return "timed";
  return "once";
}
