// Turntable subjects name the same models the town draws: a build piece's
// GLB, a land building's GLB, or a ride's builder.

import { describe, expect, it } from 'vitest';
import { resolveSubject } from './turntable-stage';
import { BUILD_CATALOG } from '@/lib/town/builds';
import { VEHICLE_CATALOG } from '@/lib/town/vehicles';

describe('resolveSubject', () => {
  it('gives every placeable piece but the road a GLB', () => {
    for (const b of BUILD_CATALOG) {
      const source = resolveSubject(`build:${b.kind}`);
      if (b.kind === 'road') expect(source).toBeNull();
      else expect(source).toEqual({ glb: expect.any(String) });
    }
  });

  it('gives each land stage with a building its GLB, and the bare plot none', () => {
    expect(resolveSubject('land:0')).toBeNull();
    expect(resolveSubject('land:1')).toEqual({ glb: 'land-cottage' });
    expect(resolveSubject('land:3')).toEqual({ glb: 'land-castle' });
  });

  it('builds every garage ride', () => {
    // The jet ski is rented at its dock, not in the garage, and has no preview.
    for (const v of VEHICLE_CATALOG) {
      expect(resolveSubject(`vehicle:${v.kind}`)).toEqual(v.control === 'sail' ? null : { vehicle: v.kind });
    }
  });

  it('names nothing for an unknown subject', () => {
    expect(resolveSubject('vehicle:submarine')).toBeNull();
    expect(resolveSubject('build:castle')).toBeNull();
    expect(resolveSubject('nonsense')).toBeNull();
  });
});
