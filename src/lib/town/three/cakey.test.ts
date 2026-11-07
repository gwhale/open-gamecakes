// Tests for the rigged Cakey's pure parts. Playing clips needs the real GLB,
// but which clip a mood asks for, and finding the bone the face rides, are
// testable here.

import { describe, expect, it } from 'vitest';
import { Bone, Group, Mesh } from 'three';
import { clipForMood, findBone, type CakeyMood } from './cakey';

describe('clipForMood', () => {
  it('walks whenever he is moving, whatever the mood', () => {
    for (const mood of ['idle', 'happy', 'wave', 'celebrate'] as CakeyMood[]) {
      expect(clipForMood(mood, true)).toBe('Walk');
    }
  });

  it('maps each standing mood to its loop', () => {
    expect(clipForMood('idle', false)).toBe('Idle');
    expect(clipForMood('happy', false)).toBe('Idle');
    expect(clipForMood('wave', false)).toBe('Wave');
    expect(clipForMood('celebrate', false)).toBe('Celebrate');
  });
});

describe('findBone', () => {
  it('finds a bone by name, skipping non-bones with the same name', () => {
    const root = new Group();
    const decoy = new Mesh();
    decoy.name = 'body';
    const bone = new Bone();
    bone.name = 'body';
    root.add(decoy, bone);
    expect(findBone(root, 'body')).toBe(bone);
  });

  it('returns null when the rig has no such bone', () => {
    expect(findBone(new Group(), 'body')).toBeNull();
  });
});
