# Product Spec: Learning World — Adaptive Kids Game Ecosystem

**Version:** 0.1 (Draft)
**Date:** April 9, 2026
**Status:** Architecture & Scoping

---

## 1. Vision

A touch-first web app (iPad-optimized) that presents an explorable game world where two kids (ages <10) can play adaptive math and reading mini-games — and create their own. The system tracks performance in a persistent database, dynamically adjusts difficulty, and gives parents visibility into progress.

---

## 2. Users

| User | Description |
|------|-------------|
| **Kid A** | Primary player. Under 10. Interacts via touch. |
| **Kid B** | Primary player. Under 10. Interacts via touch. |
| **Parent** | Admin. Sets up accounts, views progress, manages content. Occasionally assists in game creation. |

Future: additional kids can be added.

---

## 3. Core Concepts

### 3.1 The Overworld Map
A visual, illustrated map that serves as the navigation shell. Kids tap on locations to enter mini-games. The map is **not** a free-roaming game — it's a styled menu with personality.

- Each location on the map corresponds to a mini-game or a category zone (e.g., "Math Mountain," "Story Swamp").
- Locations can be locked/unlocked based on progress.
- New kid-created games appear as new pins/locations on the map.
- Visual style: hand-drawn, colorful, approachable. Think treasure map meets storybook.

### 3.2 Mini-Games
Self-contained challenge modules that live inside the overworld. Each mini-game:

- Belongs to a **subject** (Math or Reading).
- Has a **game type** (see Section 5).
- Pulls questions/content from a **content pool** seeded by difficulty tier.
- Reports results back to the tracking system after each session.

### 3.3 Adaptive Difficulty Engine
A backend system that determines what level of content to serve each kid.

- Tracks per-kid, per-subject, per-skill performance (e.g., Kid A → Math → Multiplication → Tier 3).
- Uses a sliding window of recent attempts (last 20) to calculate mastery percentage.
- **Mastery ≥ 80%** → advance to next tier. **Mastery ≤ 40%** → drop back one tier. Otherwise, hold.
- Skills are tagged granularly (e.g., "addition-single-digit," "addition-double-digit," "sight-words-set-3," "reading-comprehension-level-2").

### 3.4 Game Creator Pipeline
Kids can design new mini-games through a guided flow:

1. **Draw** the game concept on paper.
2. **Photograph** the drawing with the iPad camera.
3. **Describe** the game verbally or via text (parent can assist).
4. **AI interprets** the drawing + description → generates a structured game config (JSON).
5. **Parent reviews** and approves the config.
6. **Game renders** using one of the base game templates, populated with the generated config.
7. **Game appears** as a new location on the overworld map.

This does NOT generate arbitrary code. It maps kid intent onto a fixed set of game templates with variable content, layouts, and art assets.

---

## 4. Architecture

### 4.1 Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Frontend** | React (Next.js on Vercel) | SSR, API routes, fast deploys, great DX |
| **Game Rendering** | React + Canvas/SVG + Framer Motion | Sufficient for quiz/puzzle games; no heavy engine needed initially |
| **Overworld Map** | SVG or Canvas with react-konva | Touch-friendly interactive illustrated map |
| **Database** | Supabase (hosted Postgres) | Auth, Postgres, REST API, real-time — all in one |
| **Auth** | Supabase Auth | Parent gate (password), kid profile selection (PIN or avatar tap) |
| **AI / Game Creator** | Anthropic Claude API (Vision + Text) | Interprets drawings, generates game configs |
| **Hosting** | Vercel | Zero-config deploys, edge functions, works with Supabase |
| **Asset Storage** | Supabase Storage or Vercel Blob | Kid drawings, custom game art |

### 4.2 System Diagram

```
┌─────────────────────────────────────────────────┐
│                   iPad Browser                   │
│                                                  │
│  ┌──────────┐   ┌────────────┐   ┌───────────┐  │
│  │ Overworld │──▶│ Mini-Game  │   │   Game    │  │
│  │   Map     │   │  Player    │   │  Creator  │  │
│  └──────────┘   └─────┬──────┘   └─────┬─────┘  │
│                       │                 │        │
└───────────────────────┼─────────────────┼────────┘
                        │                 │
                        ▼                 ▼
              ┌──────────────────────────────────┐
              │      Next.js API Routes          │
              │         (Vercel)                  │
              └──────────┬───────────────────────┘
                         │
            ┌────────────┼────────────┐
            ▼            ▼            ▼
     ┌───────────┐ ┌──────────┐ ┌──────────┐
     │ Supabase  │ │ Supabase │ │ Claude   │
     │ Postgres  │ │ Auth     │ │ API      │
     │ (tracking,│ │ (parent  │ │ (game    │
     │  content, │ │  gate +  │ │  creator │
     │  configs) │ │  kids)   │ │  vision) │
     └───────────┘ └──────────┘ └──────────┘
```

### 4.3 Database Schema (Core Tables)

```sql
-- Users / profiles
kids (
  id uuid PK,
  name text,
  avatar text,
  pin text,              -- simple 4-digit PIN
  created_at timestamp
)

-- Skill taxonomy
skills (
  id uuid PK,
  subject text,          -- 'math' | 'reading'
  name text,             -- 'addition-double-digit'
  display_name text,     -- 'Double-Digit Addition'
  tier int               -- difficulty tier (1-10)
)

-- Content pool (questions/challenges)
content (
  id uuid PK,
  skill_id uuid FK → skills,
  tier int,
  game_type text,        -- which template this content fits
  payload jsonb          -- flexible: { question, answer, options, passage, ... }
)

-- Per-kid skill tracking
kid_skills (
  id uuid PK,
  kid_id uuid FK → kids,
  skill_id uuid FK → skills,
  current_tier int DEFAULT 1,
  mastery_pct float DEFAULT 0,
  total_attempts int DEFAULT 0,
  recent_window jsonb    -- last 20 attempts: [{correct: bool, ts}]
)

-- Session / attempt log
attempts (
  id uuid PK,
  kid_id uuid FK → kids,
  skill_id uuid FK → skills,
  game_id uuid FK → games,
  tier int,
  correct boolean,
  response_time_ms int,
  raw_response jsonb,
  created_at timestamp
)

-- Game registry (built-in + kid-created)
games (
  id uuid PK,
  title text,
  game_type text,        -- template type
  subject text,
  skill_ids uuid[],      -- which skills this game tests
  config jsonb,          -- full game configuration
  created_by uuid,       -- null = built-in, kid_id = kid-created
  source_drawing_url text,
  approved boolean DEFAULT false,
  map_position jsonb,    -- {x, y} on overworld
  created_at timestamp
)
```

---

## 5. Mini-Game Types (Templates)

These are the base templates that all mini-games — built-in or kid-created — are built from.

### 5.1 Multiple Choice Quiz
- **Subjects:** Math, Reading
- **Mechanic:** Question displayed, 2–4 answer options. Tap to select.
- **Math example:** "What is 7 × 8?" → [48, 54, 56, 63]
- **Reading example:** "What does 'enormous' mean?" → [tiny, huge, fast, old]
- **Adaptive lever:** Difficulty of questions scales with tier.

### 5.2 Drag-and-Drop Match
- **Subjects:** Math, Reading
- **Mechanic:** Items on the left, targets on the right. Drag to match.
- **Math example:** Match fractions to their decimal equivalents.
- **Reading example:** Match vocabulary words to definitions.
- **Adaptive lever:** Number of items, similarity of distractors.

### 5.3 Fill-in-the-Blank
- **Subjects:** Reading (primary), Math
- **Mechanic:** Sentence or equation with a blank. On-screen keyboard or word bank.
- **Reading example:** "The cat sat on the ___." (word bank: mat, bat, hat, sat)
- **Math example:** "12 + ___ = 20"
- **Adaptive lever:** Complexity of sentence/equation, size of word bank.

### 5.4 Sequence Builder
- **Subjects:** Math, Reading
- **Mechanic:** Arrange items in correct order by dragging.
- **Math example:** Order fractions from smallest to largest.
- **Reading example:** Put story events in chronological order.
- **Adaptive lever:** Number of items, subtlety of ordering.

### 5.5 Speed Round
- **Subjects:** Math
- **Mechanic:** Rapid-fire single-answer questions. Timer per question. Streak tracker.
- **Math example:** Flash cards — "6 × 7 = ?" Tap the answer fast.
- **Adaptive lever:** Operation type, number range, time allowed.

### 5.6 Reading Passage + Comprehension
- **Subjects:** Reading
- **Mechanic:** Short passage displayed. Followed by 2–4 comprehension questions (multiple choice or fill-in).
- **Adaptive lever:** Passage length, vocabulary complexity, question depth (recall vs. inference).

---

## 6. Overworld Map Behavior

- **Initial state:** 5–8 pre-built game locations visible. Some locked (greyed out, requiring a certain total XP or skill level to unlock).
- **Progression:** Completing games earns XP. XP unlocks new zones/locations.
- **Kid-created games:** Appear as special "custom" pins with the kid's drawing as the icon.
- **Per-kid state:** Each kid sees their own progress overlay (stars, completion badges) on the shared map.
- **Navigation:** Tap a location → brief intro screen (game title, best score, difficulty badge) → "Play" button → game loads.

---

## 7. Game Creator Flow (Detailed)

### Step 1: Draw
Kid draws their game idea on paper. Could be a game board, characters, a scene — anything.

### Step 2: Capture
Tap "Create a Game" in the app → iPad camera opens → take photo of drawing.

### Step 3: Describe
Voice-to-text or typed input: "This is a game where a dragon asks you math questions and you have to answer before the fire reaches you."

### Step 4: AI Interpretation
Send to Claude API:
- Image: the drawing photo
- Text: the kid's description
- System prompt: "You are a game designer assistant. Analyze the child's drawing and description. Output a JSON game config that maps to one of these templates: [multiple_choice, drag_match, fill_blank, sequence, speed_round, passage_comprehension]. Include: title, game_type, subject, visual_theme (colors, character descriptions derived from the drawing), and sample content if inferrable. If the concept doesn't map cleanly to a template, pick the closest one and note adaptations."

### Step 5: Parent Review
Parent sees the generated config in a preview screen. Can edit title, adjust game type, approve or reject.

### Step 6: Publish
Approved game is saved to the `games` table, assigned a map position, and becomes playable.

---

## 8. Auth & Access Model

```
App Load
  │
  ▼
Parent Password Gate (single password for the whole app)
  │
  ▼
Kid Selection Screen (tap your avatar)
  │
  ▼
Overworld Map (kid-specific progress overlay)
```

- One shared parent password protects entry (keeps random iPad usage out).
- Inside, kids tap their avatar — optionally protected by a simple 4-digit PIN.
- No email-based auth. No OAuth. Keep it dead simple.
- Parent can access a "Parent Dashboard" via a separate password or long-press gesture.

---

## 9. Parent Dashboard

Accessible behind a secondary auth gate. Shows:

- **Per-kid summary:** Current tier per skill, mastery percentages, total time played.
- **Trends:** Line charts of mastery over time per skill.
- **Struggle alerts:** Highlights skills where mastery has been declining or stuck below 50%.
- **Session log:** Recent play sessions with scores.
- **Game manager:** Approve/reject/edit kid-created games. Manage content pool.

---

## 10. Content Seeding Strategy

The system needs an initial pool of questions/content per skill per tier. Options:

1. **Manual seed:** Hand-author 20–50 questions per skill-tier. Tedious but high quality.
2. **AI-generated seed:** Use Claude to batch-generate questions per skill-tier with a structured prompt. Parent reviews a sample. Most practical for v1.
3. **Hybrid:** AI generates, parent curates. Flagged content goes to review queue.

**Recommendation:** AI-generated seed with parent spot-check. Store as JSON in the `content` table. Build an admin tool (part of parent dashboard) to browse, edit, and add content.

---

## 11. Technical Considerations

### Performance
- All game rendering happens client-side. API calls are limited to: fetching content at game start, submitting results at game end.
- Overworld map assets should be SVG (scalable, cacheable, small).
- Target: <2s load for any mini-game.

### Offline
- Not a v1 requirement, but the architecture should support it later via service workers + local-first sync.

### Touch
- All interactions must work with touch. No hover states. Minimum tap target: 44×44px.
- Drag-and-drop must use touch events (not mouse drag). Libraries: `@use-gesture/react` or `react-dnd` with touch backend.

### iPad Optimization
- Deploy as PWA with `manifest.json` and `apple-mobile-web-app-capable` meta tag.
- Add to Home Screen for full-screen, app-like experience.
- Lock to landscape orientation for the overworld; mini-games can be portrait or landscape.

---

## 12. Milestones

| Phase | Scope | Estimated Effort |
|-------|-------|-----------------|
| **Phase 1: Foundation** | Next.js app on Vercel. Supabase setup (auth, DB, schema). Parent gate + kid selection. Empty overworld map shell. | 1–2 weeks |
| **Phase 2: First Game** | Build one mini-game template (Multiple Choice Quiz). Wire adaptive difficulty. Log attempts. Seed 50 math questions across 3 tiers. | 1–2 weeks |
| **Phase 3: Overworld** | Illustrated map with 4–6 locations. Navigation flow. Progress/XP system. Unlock logic. | 1 week |
| **Phase 4: More Games** | Build remaining 5 templates. Seed content for each. | 2–3 weeks |
| **Phase 5: Parent Dashboard** | Progress views, trend charts, struggle alerts, session logs. | 1 week |
| **Phase 6: Game Creator** | Camera capture, Claude Vision integration, config generation, parent review flow, map placement. | 2 weeks |
| **Phase 7: Polish** | Animations, sound effects, rewards/badges, onboarding, PWA setup. | 1–2 weeks |

**Total estimated: 9–13 weeks** (solo developer, part-time)

---

## 13. Open Questions

1. **Art style:** Who creates the overworld map illustration? AI-generated? Hand-drawn by the kids? Stock?
2. **Sound:** Background music and sound effects — important for engagement. Source?
3. **Rewards system:** XP only, or also collectible items / badges / unlockable characters?
4. **Reading content licensing:** For reading passages, can we use public domain texts, or should everything be AI-generated?
5. **Multi-device:** Will both kids ever play simultaneously on different iPads? (Affects real-time sync requirements.)
6. **Budget:** Supabase free tier covers most of this. Vercel free tier likely sufficient. Claude API costs depend on game creation volume. Estimate ~$5–20/month total.

---

## 14. Decision Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Game engine | No heavy engine (no Unity, no Phaser for v1) | Quiz/puzzle games don't need physics or sprite systems. React + Canvas/SVG + Framer Motion is sufficient and keeps the stack simple. Can add Phaser later if kids want platformer-style games. |
| Database | Supabase (Postgres) | Bundled auth + DB + storage + API. Generous free tier. No need to manage infrastructure. |
| Hosting | Vercel | Native Next.js support. Free tier covers this use case. |
| Auth | Password gate + avatar tap | Kids under 10 can't manage passwords. Keep it simple. |
| Game creation | Template-based, AI-configured | Generating arbitrary game code is too risky and complex. Templates are predictable, testable, and safe. AI fills in the config, not the logic. |
