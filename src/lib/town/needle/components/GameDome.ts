import type { Behaviour, Context } from '@needle-tools/engine';
import type { Object3D } from 'three';
import type { GameDomeActivateDetail } from '@/lib/town/needle/types';

/**
 * The dome is registered against the engine module the <needle-engine> element
 * actually runs, NOT the npm package.
 *
 * Needle's TypeStore is a module-scoped singleton (engine_typestore.ts), and the
 * browser runtime is self-hosted rather than bundled — see needle-runtime.ts for
 * why. A class built on the npm copy therefore lands in a TypeStore the loader
 * never reads, and the GLB's component would be dropped with a console-only
 * "Unknown components in scene" warning.
 *
 * So: types come from npm (`import type` is erased at compile time, pulling in
 * no code), values come from the runtime module passed in here. One instance.
 */

/** Serialized shape written into the GLB by scripts/needle/generate-spike-dome.mjs. */
interface GameDomeFields {
  stableId: string;
  regionSlug: string;
  gameSlug: string;
  interactionRadius: number;
  highlightTarget?: Object3D;
}

/**
 * Registered under a string literal, never `constructor.name`: Needle's own
 * `registerType` keys off the class name, which does not survive production
 * minification. The GLB says "GameDome", so the store must too.
 */
export const GAME_DOME_TYPE_NAME = 'GameDome';

/** The slice of the engine module this component needs at runtime. */
export interface NeedleRuntimeModule {
  Behaviour: new () => Behaviour;
  TypeStore: {
    add(key: string, type: new () => unknown): void;
    get(key: string): unknown;
  };
}

/**
 * three's cross-module-instance escape hatch. `instanceof MeshStandardMaterial`
 * against the npm three would always be false here, because the runtime bundles
 * its own three — the `isX` flags exist precisely for this case.
 */
interface EmissiveMaterial {
  isMeshStandardMaterial?: boolean;
  emissive: { set(hex: number): void };
  emissiveIntensity: number;
}

const IDLE_COLOR = 0x7ee9ff;
const HOVER_COLOR = 0xffffff;

export function registerGameDome(engine: NeedleRuntimeModule): void {
  if (engine.TypeStore.get(GAME_DOME_TYPE_NAME)) return;

  class GameDome extends engine.Behaviour implements GameDomeFields {
    // Deserialized straight from the GLB. No @serializable needed: Needle's
    // assign() runs with onlyDeclared=false (engine_serialization_core.ts), so
    // every key present in the serialized data is applied. Dropping the
    // decorators also keeps experimentalDecorators out of the shared tsconfig.
    stableId = '';
    regionSlug = '';
    gameSlug = '';
    interactionRadius = 3.25;
    highlightTarget?: Object3D;

    start(): void {
      this.applyHighlight(false);
    }

    onPointerEnter(): void {
      this.applyHighlight(true);
    }

    onPointerExit(): void {
      this.applyHighlight(false);
    }

    onPointerClick(): void {
      const detail: GameDomeActivateDetail = {
        stableId: this.stableId,
        regionSlug: this.regionSlug,
        gameSlug: this.gameSlug,
      };
      // domElement is the <needle-engine> element itself. bubbles:true so a host
      // can also listen higher up (e.g. on the mount div) without re-plumbing.
      (this.context as Context).domElement.dispatchEvent(
        new CustomEvent<GameDomeActivateDetail>('gamecakes:dome-activate', {
          detail,
          bubbles: true,
        }),
      );
    }

    private applyHighlight(active: boolean): void {
      // Falls back to the named node rather than a serialized object reference:
      // HighlightTarget is guaranteed by the required-node contract that
      // validate-assets.mjs enforces, so there is no glTF pointer to get wrong.
      const target = this.highlightTarget ?? this.gameObject.getObjectByName('HighlightTarget');
      target?.traverse((object: Object3D) => {
        const material = (object as { material?: EmissiveMaterial }).material;
        if (!material?.isMeshStandardMaterial) return;
        material.emissive.set(active ? HOVER_COLOR : IDLE_COLOR);
        material.emissiveIntensity = active ? 1.25 : 0.65;
      });
    }
  }

  engine.TypeStore.add(GAME_DOME_TYPE_NAME, GameDome as unknown as new () => unknown);
}
