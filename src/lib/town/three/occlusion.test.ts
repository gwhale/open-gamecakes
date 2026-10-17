// The shoulder camera fades whatever stands between it and the cupcake, and
// puts it back once the line is clear.

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createOccluderFader, NEAR_FULL_U, NEAR_HIDE_U, OCCLUDER_ALPHA, occluderAlpha } from './occlusion';

function booth(x: number, z: number, shared?: THREE.MeshStandardMaterial) {
  const g = new THREE.Group();
  const original = shared ?? new THREE.MeshStandardMaterial();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), original);
  g.add(body);
  // A label sprite, like a booth's glyph: raycasting it needs the camera.
  const label = new THREE.Sprite(new THREE.SpriteMaterial());
  label.position.y = 2;
  g.add(label);
  g.position.set(x, 1, z);
  g.updateMatrixWorld(true);
  // What is on screen right now: the fader swaps in a private copy while faded.
  return {
    g,
    original,
    get mat() {
      return body.material as THREE.MeshStandardMaterial;
    },
  };
}

const cam = new THREE.PerspectiveCamera(55, 4 / 3, 0.5, 100);
cam.position.set(0, 1, 14);
cam.lookAt(0, 1, 0);
cam.updateMatrixWorld(true);
const avatar = new THREE.Vector3(0, 1, 0);

describe('createOccluderFader', () => {
  it('fades an object on the camera→avatar line and leaves others solid', () => {
    const inFront = booth(0, 5);
    const aside = booth(8, 5);
    const fader = createOccluderFader(THREE, [inFront.g, aside.g]);
    for (let i = 0; i < 60; i++) fader.update(cam, avatar, 16);
    expect(inFront.mat.opacity).toBeCloseTo(OCCLUDER_ALPHA, 2);
    expect(inFront.mat.transparent).toBe(true);
    expect(inFront.mat.depthWrite).toBe(false);
    expect(aside.mat.opacity).toBe(1);
    expect(fader.fadedRoots()).toEqual([inFront.g]);
  });

  it('restores the original look once the line is clear', () => {
    const b = booth(0, 5);
    const fader = createOccluderFader(THREE, [b.g]);
    for (let i = 0; i < 60; i++) fader.update(cam, avatar, 16);
    b.g.position.x = 8;
    b.g.updateMatrixWorld(true);
    for (let i = 0; i < 60; i++) fader.update(cam, avatar, 16);
    expect(b.mat.opacity).toBe(1);
    expect(b.mat.transparent).toBe(false);
    expect(b.mat.depthWrite).toBe(true);
    expect(b.mat).toBe(b.original);
    expect(fader.fadedRoots()).toEqual([]);
  });

  it('fades only the blocker when clones share one material', () => {
    // Authored GLB clones share their materials; fading the shared one would
    // fade every booth in town.
    const shared = new THREE.MeshStandardMaterial();
    const inFront = booth(0, 5, shared);
    const aside = booth(8, 5, shared);
    const fader = createOccluderFader(THREE, [inFront.g, aside.g]);
    for (let i = 0; i < 60; i++) fader.update(cam, avatar, 16);
    expect(inFront.mat.opacity).toBeCloseTo(OCCLUDER_ALPHA, 2);
    expect(aside.mat.opacity).toBe(1);
    expect(shared.opacity).toBe(1);
    expect(shared.transparent).toBe(false);
  });

  it('ignores an object behind the avatar', () => {
    const behind = booth(0, -5);
    const fader = createOccluderFader(THREE, [behind.g]);
    for (let i = 0; i < 60; i++) fader.update(cam, avatar, 16);
    expect(behind.mat.opacity).toBe(1);
  });

  it('hides a blocker right against the lens instead of tinting the view with it', () => {
    const close = booth(0, 12); // front face 1 unit from the camera
    const fader = createOccluderFader(THREE, [close.g]);
    for (let i = 0; i < 60; i++) fader.update(cam, avatar, 16);
    expect(close.mat.opacity).toBe(0);
    expect(fader.fadedRoots()).toEqual([close.g]);
  });

  it('ramps from hidden to the usual fade with distance', () => {
    expect(occluderAlpha(0.5)).toBe(0);
    expect(occluderAlpha(NEAR_HIDE_U)).toBe(0);
    expect(occluderAlpha((NEAR_HIDE_U + NEAR_FULL_U) / 2)).toBeCloseTo(OCCLUDER_ALPHA / 2, 5);
    expect(occluderAlpha(NEAR_FULL_U)).toBe(OCCLUDER_ALPHA);
    expect(occluderAlpha(40)).toBe(OCCLUDER_ALPHA);
  });
});
