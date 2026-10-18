// Cheap "can this browser draw 3D at all?" probe, for the three.js hosts.
//
// Some school iPads and locked-down Chromebooks have WebGL off, and
// THREE.WebGLRenderer throws on construction when it can't get a context. A
// probe up front lets a host skip the multi-megabyte three import and go
// straight to its fallback. It is not a guarantee — a context can still fail
// later (lost GPU, too many contexts) — so hosts also try/catch the engine.
//
// Browser-only: call it from an effect or event handler, never during render.

export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}
