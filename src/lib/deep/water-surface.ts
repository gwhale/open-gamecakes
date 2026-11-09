// The sea surface — the ceiling of the Sunken Batterlands, and the one thing
// you see when you come back up.
//
// WHAT WAS WRONG. The surface was one flat plane of flat colour with
// `side: BackSide`. Two consequences, and the second is the one a kid notices:
//
//   1. From below it was a uniform pale sheet. Water lit from above is never
//      uniform — the whole reason a shallow reef reads as underwater is the
//      moving net of light on everything.
//   2. The chase camera sits CAM_HEIGHT_M (5m) above the sub and the sub may
//      rise to y = -1.5. So the moment a kid surfaces the camera is ABOVE the
//      plane, whose backfaces are culled, and the sea simply is not drawn. You
//      surface into nothing.
//
// WHY THIS IS NOT UPSTREAM'S MATERIAL. THIRD-PARTY.md records the decision not
// to take ABYSSAL's `UnderwaterMaterial.js`: it pulls in SharedUniforms,
// OceanCouplingGLSL, OceanSampleGLSL, a reef shadow map and a caustic slope
// texture, which is most of a renderer and more than a tablet should carry.
// That reasoning still holds, so none of it is taken here either. This is a
// single procedural shader on ONE plane: no textures, no extra passes, no
// render targets, and nothing sampled from the scene. It costs one draw call
// and some arithmetic per pixel of sky.
//
// It is deliberately shaded DIFFERENTLY on each face. Underneath you get the
// caustic net and a bright pool where the sun is; on top you get a denser,
// glittering skin you cannot see through. Same geometry, and `gl_FrontFacing`
// picks. That is what makes surfacing feel like arriving somewhere.

import type * as THREE from 'three';
import type { ThreeNS } from './types';
import { DOMAIN_RADIUS_M } from './types';

/** How opaque the underside is at the surface, and how fast that falls away
 *  with depth. The ceiling must not hang over the canyon like a lid. */
const UNDER_OPACITY = 0.42;
const FADE_OVER_M = 300;

/** Swell height in metres. Small: this is a calm bay, and a big wave on a plane
 *  this wide reads as a bending floor rather than water. */
const SWELL_M = 0.55;

export interface WaterSurfaceLook {
  /** Alpha for the underside. 0 means "do not draw at all". */
  opacity: number;
  /** 0 at depth, 1 at the surface — drives how lively the caustics are. */
  nearness: number;
  visible: boolean;
}

/**
 * How the surface should look from a given depth. Pure, so the rule that the
 * ceiling disappears over the canyon is testable without a GPU.
 */
export function surfaceLook(depthM: number): WaterSurfaceLook {
  const opacity = Math.max(0, UNDER_OPACITY - depthM / FADE_OVER_M);
  return {
    opacity,
    nearness: Math.max(0, Math.min(1, 1 - depthM / 45)),
    // Once you are above the water the plane must stay drawn whatever the
    // fade says, or surfacing puts you in an empty room again.
    visible: opacity > 0.01 || depthM < 2,
  };
}

export interface WaterSurface {
  mesh: THREE.Mesh;
  /** Follow the sub, retint, and advance the swell. */
  update(elapsed: number, depthM: number, waterColor: THREE.Color, x: number, z: number): void;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}

const VERT = /* glsl */ `
  uniform float uTime;
  uniform float uSwell;
  varying vec3 vWorld;
  varying vec3 vViewDir;

  #include <fog_pars_vertex>

  void main() {
    vec3 p = position;
    // Two crossing swells, in METRES of world space, so the wavelength does not
    // change with how wide the plane happens to be.
    vec4 world = modelMatrix * vec4(p, 1.0);
    float a = sin(world.x * 0.035 + uTime * 0.7);
    float b = cos(world.z * 0.028 - uTime * 0.55);
    float c = sin((world.x + world.z) * 0.019 + uTime * 0.35);
    p.y += (a * 0.5 + b * 0.35 + c * 0.3) * uSwell;

    world = modelMatrix * vec4(p, 1.0);
    vWorld = world.xyz;
    vViewDir = normalize(cameraPosition - world.xyz);

    vec4 mvPosition = viewMatrix * world;
    #include <fog_vertex>
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  uniform float uNearness;
  uniform vec3  uWater;
  uniform vec2  uSunXZ;
  varying vec3 vWorld;
  varying vec3 vViewDir;

  #include <fog_pars_fragment>

  // Caustics: sum a few travelling waves, then keep only the crests. Raising a
  // folded sine to a power is what turns a smooth ripple into the thin bright
  // filaments the eye reads as sunlight through water.
  //
  // EVERY WAVE HERE IS DIRECTIONAL. The first version had a radial term, and a
  // radial term in world space is a set of rings centred on the world origin --
  // visibly so, from anywhere near it. Water has no centre.
  float caustic(vec2 q, float t) {
    float v = 0.0;
    v += sin(q.x * 1.70 + t * 1.10);
    v += sin(q.y * 1.30 - t * 0.90);
    v += sin((q.x + q.y) * 0.90 + t * 0.70);
    v += sin((q.x - q.y) * 1.50 - t * 0.55);
    float folded = abs(sin(v * 1.15));
    return pow(1.0 - folded, 6.0);
  }

  void main() {
    // World-space metres, so the pattern stays put while the plane follows the
    // submarine. Sliding texture is the giveaway that a ceiling is fake.
    //
    // SCALE IS THE WHOLE THING. At 0.045 the first wave was ~85m across and the
    // net read as weather rather than water. Real caustics on a shallow reef are
    // a couple of metres; three octaves from ~11m down to ~2.5m is what makes it
    // look wet instead of overcast.
    vec2 q = vWorld.xz * 0.34;
    float net = caustic(q, uTime) * 0.55
              + caustic(q * 2.10 + 7.0, uTime * 1.30) * 0.30
              + caustic(q * 4.30 + 19.0, uTime * 1.70) * 0.15;

    // A pool of brightness where the sun is, so the surface has a place rather
    // than being evenly lit. Tight enough to be a highlight, not a white-out.
    float sun = exp(-length(vWorld.xz - uSunXZ) * 0.010);

    if (gl_FrontFacing) {
      // ---- Seen from ABOVE: you have surfaced. ----
      // Denser, brighter, and not see-through: this is the skin of the sea.
      // Glitter is finer than the net below: from above you are looking at the
      // ripples themselves, not at light that has travelled through them.
      float glitter = caustic(q * 3.1 + 41.0, uTime * 2.1);
      float glint = pow(net, 1.4) * 1.1 + glitter * 0.9 + sun * 0.35;
      float fres = pow(1.0 - max(dot(vViewDir, vec3(0.0, 1.0, 0.0)), 0.0), 3.0);
      vec3 deep = uWater * 0.55;
      vec3 col = mix(deep, vec3(1.0), clamp(glint * 0.6 + fres * 0.45, 0.0, 1.0));
      gl_FragColor = vec4(col, clamp(0.90 + fres * 0.10, 0.0, 1.0));
    } else {
      // ---- Seen from BELOW: the ceiling. ----
      float lively = 0.30 + 0.70 * uNearness;
      float light = net * lively + sun * 0.30;
      vec3 col = mix(uWater, vec3(1.0), clamp(light * 0.95, 0.0, 1.0));
      gl_FragColor = vec4(col, clamp(uOpacity + light * 0.35 * uNearness, 0.0, 1.0));
    }

    #include <fog_fragment>
  }
`;

export function createWaterSurface(THREE: ThreeNS): WaterSurface {
  // Segments exist for the swell. 96 across ~1944m is a vertex roughly every
  // 20m — plenty for a swell whose wavelength is ~180m, and cheap.
  const geometry = new THREE.PlaneGeometry(DOMAIN_RADIUS_M * 2.4, DOMAIN_RADIUS_M * 2.4, 96, 96);
  geometry.rotateX(Math.PI / 2);

  const material = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uOpacity: { value: UNDER_OPACITY },
        uNearness: { value: 1 },
        uSwell: { value: SWELL_M },
        uWater: { value: new THREE.Color(0xbfe9ff) },
        uSunXZ: { value: new THREE.Vector2(0, 0) },
      },
    ]),
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    // BOTH faces. The old BackSide is exactly why surfacing showed nothing.
    side: THREE.DoubleSide,
    // Still no depth write: the sea must not occlude the sub that is under it.
    depthWrite: false,
    fog: true,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = -0.4;
  mesh.renderOrder = 2;
  mesh.frustumCulled = false;

  return {
    mesh,
    geometry,
    material,
    update(elapsed, depthM, waterColor, x, z) {
      const look = surfaceLook(depthM);
      const u = material.uniforms;
      u.uTime.value = elapsed;
      u.uOpacity.value = look.opacity;
      u.uNearness.value = look.nearness;
      (u.uWater.value as THREE.Color).copy(waterColor);
      // The sun sits a little north of the sub, so its pool drifts as you drive
      // rather than sitting nailed to the middle of the screen.
      (u.uSunXZ.value as THREE.Vector2).set(x + 25, z - 55);
      mesh.visible = look.visible;
      mesh.position.set(x, -0.4, z);
    },
  };
}
