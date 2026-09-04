# Creating a New Game

**Status:** as of master `edc8023` (May 2026 — design system Phase 1+2 + iPad polish landed)

This is the canonical path for adding a new game to Gamecakes. After the
design system migration, every new game starts cake-themed for free —
visual chrome, haptics, sound dispatch, and HUD style come from
`@/lib/games/theme` so you write game logic and let shared primitives
handle everything else.

Skim time: ~5 minutes. Implementation time: ~½ day for a focused game,
~1 day for one with custom physics or new sprite types.

---

## Decisions to make first

Before you write code, lock in:

| Decision | Examples | Why it matters |
|---|---|---|
| **Subject** | `'math'` or `'reading'` | Determines which "land" (`/map/math` vs `/map/vocab`) the card appears on, and which generator (`generateMathChallenge` vs `generateReadingChallenge`) you'll call |
| **Skill mapping** | `add-within-20`, `counting-to-20`, `sight-words` | Decides which skill the kid's mastery progresses against. Match to an existing row in the `skills` table |
| **Mechanic** | tilt-roll, drag-release, tap-grid, scroll-through, ... | Drives the physics + input scaffolding |
| **Math gate cadence** | every action, periodic, ammo-style | Per-action gives the highest practice volume; ammo-style is easier on the kid |
| **Round shape** | score-attack timer, completion-based, infinite | Determines `buildSessionSummary` arguments and end-of-round flow |
| **Difficulty knobs** | none, easy/medium/hard, controls picker | Add `difficulty?` and/or `controls?` to scene props; the GameLauncher renders pickers via `showDifficulty` / `showControls` |

If you're unsure on any of these, look at the closest existing game:

| Mechanic | Reference scene | Notes |
|---|---|---|
| Tilt-controlled physics | `MarbleMazeScene.ts` | Multi-maze layout pattern, deviceorientation handling, lifesaver math |
| Gravity + tap-input | `FlappyScene.ts` | Pipe scrolling, drag-mode controls picker, phase advance |
| Drag-release slingshot | `three/engine.ts` (Sandcastle Siege) | Aim preview, math-first arm flow, sandcastle flattening. 3D, not Phaser: the Phaser original was Water Balloons, now removed |
| Tap-grid / time-attack | `SharksAndMinnowsScene.ts` | Pause-aware timer, chase movement, rough.js grid texture |
| Click-to-shoot | `AsteroidsScene.ts` | Manual bullet-vs-target hit detection, sticky-retry |

---

## File scaffold

A new game needs **4 new files** + **2 modified registry files**:

```
src/lib/games/phaser/scenes/
├── MyGameScene.factory.ts      [NEW]  Phaser-free entry point — SSR-safe types
└── MyGameScene.ts              [NEW]  The actual scene class

src/app/(gated)/games/my-game/
├── page.tsx                    [NEW]  Server component — kid + tier + family lookup
└── MyGameShell.tsx             [NEW]  Client component — GameLauncher → PhaserGameHost

src/lib/games/registry.ts       [EDIT] Append new game info
src/app/(gated)/map/math/page.tsx
                                [EDIT] Append new GAME_CARDS entry (or /map/vocab)
```

**Naming**: kebab-case for the URL slug (`my-game`), PascalCase for class
names (`MyGameScene`), SCREAMING_SNAKE for shared constants
(`MY_GAME_SCENE_KEY`).

---

## Step 1 — Factory file (~25 lines)

Phaser statically imports `window`, which crashes on the Next.js server.
The factory is the SSR-safe shim that the page imports; it dynamic-imports
the scene class only on the client.

```typescript
// src/lib/games/phaser/scenes/MyGameScene.factory.ts
import type { MathType } from '@/lib/games/shared/generate-challenge';

export const MY_GAME_SCENE_KEY = 'MyGameScene';
export const MY_GAME_VIEW_W = 960;   // landscape for an Angry-Birds-y feel
export const MY_GAME_VIEW_H = 600;   // or 480x640 for portrait

export type MyGameDifficulty = 'easy' | 'medium' | 'hard';

export interface MyGameSceneProps {
  tier: number;
  mathType?: MathType;
  difficulty?: MyGameDifficulty;
}

export const MyGameSceneFactory = {
  key: MY_GAME_SCENE_KEY,
  create: async () => (await import('./MyGameScene')).MyGameScene,
};
```

---

## Step 2 — The scene (the bulk of the work)

**Always import primitives from the theme module.** Never reinvent
backgrounds, HUD, or particles — every game in the catalog should look
visually consistent.

```typescript
// src/lib/games/phaser/scenes/MyGameScene.ts
import * as Phaser from 'phaser';
import { generateMathChallenge } from '@/lib/games/shared/generate-challenge';
import type { Challenge } from '@/lib/games/shared/challenge';
import { buildSessionSummary, type SoundName } from '@/lib/games/phaser/session';
import {
  MY_GAME_SCENE_KEY,
  MY_GAME_VIEW_W,
  MY_GAME_VIEW_H,
  type MyGameSceneProps,
} from './MyGameScene.factory';
import {
  // palette tokens
  CAKE, CSS, WATER,
  // scenery
  drawSkyBands, drawCakeySun, drawCakeyCloud, drawTree,
  drawFence, drawGrass, drawSprinkles,
  // sprites
  createKid, pickDistinctPalettes, makeBalloon,
  // effects
  splashAt, sparkleAt, floatScore, bigHitFx,
  // HUD
  drawScoreBadge, drawTimerBadge, drawLivesRow,
  type BadgeHandle, type TimerHandle, type LivesHandle,
  type KidSpriteHandle,
} from '@/lib/games/theme';

const VIEW_W = MY_GAME_VIEW_W;
const VIEW_H = MY_GAME_VIEW_H;

export class MyGameScene extends Phaser.Scene {
  private hostBus!: Phaser.Events.EventEmitter;
  private sceneProps!: MyGameSceneProps;

  // Game state
  private score = 0;
  private wrongAnswers = 0;
  private sessionStart = 0;
  private paused = false;
  private ended = false;
  private pendingChallengeKind: 'launch' | null = null;

  // HUD
  private scoreBadge!: BadgeHandle;
  private timerBadge!: TimerHandle;

  constructor() {
    super(MY_GAME_SCENE_KEY);
  }

  create(): void {
    this.sceneProps = this.game.registry.get('sceneProps') as MyGameSceneProps;
    this.hostBus = this.game.registry.get('hostBus') as Phaser.Events.EventEmitter;
    this.sessionStart = Date.now();

    this.physics.world.gravity.set(0, 0);
    this.physics.world.setBounds(0, 0, VIEW_W, VIEW_H);

    this.drawBackdrop();
    this.spawnTargets();
    this.drawHud();

    this.hostBus.on('challenge:result', this.onChallengeResult, this);
    this.hostBus.on('scene:reset', this.resetScene, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
  }

  private drawBackdrop(): void {
    drawSkyBands(this, { viewW: VIEW_W, topH: 140, midH: 120, lowH: 60 });
    drawCakeySun(this, VIEW_W - 110, 90);
    drawCakeyCloud(this, { x: 200, y: 80, scale: 0.9, driftSpeedSec: 12, viewW: VIEW_W });
    drawFence(this, { viewW: VIEW_W, y: 330, knotholes: [42, 322, 686] });
    drawGrass(this, { viewW: VIEW_W, topY: 365, bottomY: 600 });
  }

  private drawHud(): void {
    this.scoreBadge = drawScoreBadge(this, { anchor: 'tl', initialValue: '0' });
    this.timerBadge = drawTimerBadge(this, {
      anchor: 'tr', viewW: VIEW_W, initialValue: '3:00',
    });
  }

  // ... game-specific methods ...

  private emitSfx(name: SoundName): void {
    this.hostBus.emit('scene:sfx', { name });
  }

  private cleanup(): void {
    this.hostBus?.off('challenge:result', this.onChallengeResult, this);
    this.hostBus?.off('scene:reset', this.resetScene, this);
  }
}
```

---

## Step 3 — Math gate flow (host bus)

Every game's math problem flow goes through the same three events:

```typescript
// 1. Open the modal
private openMathChallenge(): void {
  this.paused = true;
  this.pendingChallengeKind = 'launch';
  const ch = generateMathChallenge(this.sceneProps.tier, this.sceneProps.mathType ?? 'mixed');
  const challenge: Challenge = { kind: 'numeric', prompt: ch.prompt, answer: ch.answer };
  this.hostBus.emit('challenge:open', {
    challenge,
    reason: '🚀 Solve to launch!',
  });
}

// 2. Receive the result
private onChallengeResult(payload: { correct: boolean }): void {
  const kind = this.pendingChallengeKind;
  this.pendingChallengeKind = null;
  this.paused = false;

  if (payload.correct) {
    this.emitSfx('correct');     // host plays sound + haptic
    this.doSomethingFun();
  } else {
    this.wrongAnswers++;
    this.emitSfx('wrong');
  }
}

// 3. End the round
private endRound(): void {
  if (this.ended) return;
  this.ended = true;
  this.emitSfx('timeUp');
  const summary = buildSessionSummary({
    score: this.score,
    wrongAnswers: this.wrongAnswers,
    sessionStart: this.sessionStart,
    completed: true,
    optimalTaps: this.score,    // for score-attack: use score itself
  });
  this.hostBus.emit('session:end', { summary });
}
```

If your game has multiple math gate types (e.g., gate-unlock vs life-saver),
use a `'gate' | 'lifesaver' | null` discriminator on
`pendingChallengeKind` and branch in `onChallengeResult`. Marble Maze and
Flappy Cake both use this pattern.

**Pause-aware timer**: if your game has a round timer AND opens math
modals, accumulate paused time so modal time doesn't burn round time.
See `AsteroidsScene.ts` `pauseStartedAt` / `pauseMs` for the pattern.

---

## Step 4 — Hit feedback

**Always use the theme effects** for hit feedback. The visual vocabulary
should be identical across games:

```typescript
// Kid hit: small splash + score floater
splashAt(this, x, y, { scale: 1 });
floatScore(this, { x, y: y - 30, label: '+5', color: CSS.SCORE_KID });

// Bullseye / big hit: camera flash + shake + bigger splash
bigHitFx(this);
splashAt(this, x, y, { scale: 1.8 });
floatScore(this, { x, y: y - 40, label: '+10!', color: CSS.SCORE_BULLSEYE });

// Treat / collectible: sparkle burst (no splash)
sparkleAt(this, x, y, { count: 5, spread: 20, fontSize: 14, rise: 18 });
```

Color tokens for `floatScore`: `CSS.SCORE_KID` (cyan), `CSS.SCORE_BULLSEYE`
(gold), `CSS.SCORE_CRATE` (amber). Pick a sensible one or add a new one
in `palette.ts` if your game introduces a new target type.

---

## Step 5 — Page + Shell

The page is a server component that resolves the kid + family + tier.
The shell is a client component that mounts the launcher then the host.

**Page** (~50 lines):

```typescript
// src/app/(gated)/games/my-game/page.tsx
import { getActiveKid } from '@/lib/auth/active-kid';
import { supabaseServer } from '@/lib/supabase/server';
import MyGameShell from './MyGameShell';

const SKILL_SUBJECT = 'math' as const;

function skillSlugForKid(name: string | undefined): string {
  // Same convention as marble-maze: K-age tracks against counting,
  // older kids against addition. Add cases as new families onboard.
  const n = (name ?? '').toLowerCase();
  if (n.startsWith('char')) return 'counting-to-20';
  return 'add-within-20';
}

export default async function MyGamePage() {
  const kidId = await getActiveKid();
  const sb = supabaseServer();

  const { data: kidRow } = await sb
    .from('kids').select('name').eq('id', kidId!).maybeSingle();
  const kidName = (kidRow?.name as string | undefined) ?? undefined;
  const skillSlug = skillSlugForKid(kidName);

  const { data: skillRow } = await sb
    .from('skills').select('id')
    .eq('subject', SKILL_SUBJECT).eq('name', skillSlug).maybeSingle();
  const skillId = skillRow?.id as string | undefined;

  let currentTier = 1;
  if (kidId && skillId) {
    const { data: ks } = await sb
      .from('kid_skills').select('current_tier')
      .eq('kid_id', kidId).eq('skill_id', skillId).maybeSingle();
    if (ks?.current_tier && typeof ks.current_tier === 'number') {
      currentTier = ks.current_tier;
    }
  }

  return (
    <MyGameShell
      kidName={kidName}
      currentTier={currentTier}
      skillSubject={SKILL_SUBJECT}
      skillSlug={skillSlug}
    />
  );
}
```

**Shell** (~60 lines) — model after `FlappyShell.tsx`. A Phaser shell is
just plumbing now: `requestFullscreen` on Start lives in `GameLauncher` and
the iPad page-pan lock lives in `PhaserGameHost`, so neither belongs here:

```typescript
'use client';

import { useState } from 'react';
import GameLauncher, { type LaunchSettings } from '@/components/games/shared/GameLauncher';
import PhaserGameHost from '@/components/games/phaser/PhaserGameHost';
import {
  MyGameSceneFactory, MY_GAME_VIEW_W, MY_GAME_VIEW_H,
} from '@/lib/games/phaser/scenes/MyGameScene.factory';

export default function MyGameShell({
  kidName, currentTier, skillSubject, skillSlug,
}: {
  kidName?: string;
  currentTier: number;
  skillSubject: 'math' | 'reading';
  skillSlug: string;
}) {
  const [settings, setSettings] = useState<LaunchSettings | null>(null);

  if (!settings) {
    return (
      <GameLauncher
        gameTitle="My Game"
        gameGlyph="🎯"
        gameDescription="Short blurb shown on the launcher screen"
        currentTier={currentTier}
        onStart={setSettings}
        accentBg="bg-emerald-50 dark:bg-emerald-950"
        kidName={kidName}
        showDifficulty
      />
    );
  }

  return (
    <PhaserGameHost
      title="My Game"
      subtitle={kidName ? `${kidName}'s Game` : 'Play'}
      kidName={kidName}
      gameSlug="my-game"
      sceneFactory={MyGameSceneFactory}
      sceneProps={{
        tier: settings.level,
        mathType: settings.mathType,
        difficulty: settings.difficulty,
      }}
      width={MY_GAME_VIEW_W}
      height={MY_GAME_VIEW_H}
      attemptMeta={{
        subject: skillSubject,
        skillSlug,
        tier: settings.level,
        gameId: null,
      }}
    />
  );
}
```

---

## Step 6 — Register

**Two appends.** First, the registry:

```typescript
// src/lib/games/registry.ts — add inside GAME_REGISTRY
{ slug: 'my-game', label: 'My Game', glyph: '🎯', subject: 'math' },
```

This makes the feedback ticket modal pick up your game so kids can file
tickets against it. Without this, `/tickets` will show your game's slug
as a raw string.

Second, the map cards. For a math game:

```typescript
// src/app/(gated)/map/math/page.tsx — append to GAME_CARDS
{
  label: 'My Game',
  href: '/games/my-game',
  glyph: '🎯',
  description: 'Short tagline shown under the card',
  bgClass: 'bg-emerald-100 dark:bg-emerald-950',
  textClass: 'text-emerald-900 dark:text-emerald-100',
},
```

(Or `/map/vocab/page.tsx` for reading games.)

---

## What you get for free

By using the theme module + host pattern:

- **Same HUD chrome** as every other game (translucent panel, white text)
- **Haptics** on every `correct` / `wrong` / `win` / `levelUp` / `padPress` /
  `catch` `scene:sfx` event — no per-game wiring
- **Sounds** dispatched from the same enum
- **Math modal UI** (numeric pad / choice buttons) handled by PhaserGameHost
- **Game-over overlay** with score + efficiency + Play Again
- **Attempt logging** via `/api/attempts` — POSTs the session summary,
  updates kid_skills, runs evidence engine, returns tier-up flag
- **Fullscreen toggle, sound toggle, feedback button** in the chrome
- **iPad-app-feel polish** — view transitions on route change, edge-to-edge
  in standalone mode, install prompt for first-time iPad visitors

---

## Test checklist before shipping

- [ ] `npx tsc --noEmit` clean
- [ ] Visit `/games/my-game` — launcher renders, kid name shown, tier picker works
- [ ] Tap Start → scene mounts with the dimensions you set
- [ ] First interaction (tap, drag, tilt) triggers the math gate
- [ ] Math modal shows; correct answer continues; wrong answer increments
      `wrongAnswers` and proceeds appropriately
- [ ] Score updates in HUD, timer counts down (if applicable)
- [ ] Round-end emits `session:end` and the host modal appears with
      Play Again button
- [ ] Play Again triggers `scene:reset`, the scene cleans up and rebuilds
- [ ] Attempt row appears in `attempts` table (check via Supabase Studio)
      with the right `skill_id`, `tier`, and `efficiency`
- [ ] Card appears at `/map/math` (or `/map/vocab`) with your styling
- [ ] Feedback button (🎤) shows the new game's slug in the picker
- [ ] On iPad, drag/swipe doesn't scroll the page
- [ ] Tier-up celebration plays correctly (mastery > threshold across multiple
      sessions; easiest to test by manually setting kid_skills.current_tier
      via Supabase Studio then playing a successful round)

---

## When something needs to be NEW

If your game introduces a primitive that doesn't exist yet — a new sprite
type, a new background style, a new effect — first ask: **does at least
one OTHER game also need this?**

| Yes | Add it to the theme module first, then use it from both games |
| --- | --- |
| No  | Keep it inline in the scene file |

Don't extract a `MyOnlyGameUsesThis` helper to the theme module just for
purity — it's allowed to live in the scene if it's truly game-specific.
The theme module is for the shared visual vocabulary, not every drawing
primitive.

If you DO add to the theme module:

1. Choose the right file (`palette.ts` for tokens, `decor.ts` for scenery,
   `effects.ts` for fire-and-forget juice, `hud.ts` for chrome,
   `kid-sprite.ts` / `balloon.ts` for sprite types)
2. Match the existing function shape (most take `scene` first, then opts;
   most return the created object so callers can attach tweens)
3. Update `index.ts` if needed (it does `export *` from each file, so
   most exports are automatic — only edit if you add a new file)
4. Re-migrate at least one existing game to use the new primitive, as
   proof it's reusable

---

## Reference: complete checklist

```
☐ Plan: subject, skill slug, mechanic, difficulty, round shape
☐ Create src/lib/games/phaser/scenes/MyGameScene.factory.ts
☐ Create src/lib/games/phaser/scenes/MyGameScene.ts (use theme module!)
☐ Create src/app/(gated)/games/my-game/page.tsx
☐ Create src/app/(gated)/games/my-game/MyGameShell.tsx
☐ Append to src/lib/games/registry.ts
☐ Append to src/app/(gated)/map/{math|vocab}/page.tsx GAME_CARDS
☐ npx tsc --noEmit clean
☐ Manual test: launcher → game → math gate → round end → Play Again
☐ Verify attempt logged in /parent
☐ Branch + commit + PR + merge (direct push to master is blocked)
```
