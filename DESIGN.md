---
name: Gamecakes
description: A walkable confection archipelago where kids earn their way to the next island.
colors:
  warm-rose: "#fb7185"
  warm-rose-tint: "#fda4af"
  warm-rose-deep: "#e11d48"
  warm-rose-dark: "#9f1239"
  golden-cream: "#fde68a"
  golden-cream-tint: "#fef3c7"
  golden-cream-deep: "#fbbf24"
  soft-mint: "#6ee7b7"
  soft-mint-tint: "#a7f3d0"
  soft-mint-deep: "#10b981"
  cherry-red: "#dc2626"
  stem-green: "#166534"
  chrome-ink: "#18181b"
  ink: "#171717"
  ink-inverse: "#ededed"
  surface: "#ffffff"
  surface-inverse: "#0a0a0a"
  act-from: "#e11d48"
  act-to: "#be123c"
  act-ink: "#ffffff"
  earn-from: "#fbbf24"
  earn-to: "#f59e0b"
  earn-ink: "#451a03"
  grow-from: "#34d399"
  grow-to: "#10b981"
  grow-ink: "#022c22"
  travel-from: "#38bdf8"
  travel-to: "#0ea5e9"
  travel-ink: "#082f49"
  exit-from: "#27272a"
  exit-to: "#18181b"
  exit-ink: "#ffffff"
  focus-dark: "#18181b"
  focus-light: "#ffffff"
typography:
  display:
    fontFamily: "Fredoka, Geist, system-ui, sans-serif"
    fontSize: "48px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Fredoka, Geist, system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Fredoka, Geist, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.4
  body:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 700
    lineHeight: 1.33
rounded:
  sm: "12px"
  md: "16px"
  lg: "24px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  tap: "44px"
components:
  button-act:
    backgroundColor: "{colors.act-from}"
    textColor: "{colors.act-ink}"
    typography: "{typography.title}"
    rounded: "{rounded.md}"
    padding: "16px 24px"
    height: "44px"
  button-act-active:
    backgroundColor: "{colors.act-to}"
    textColor: "{colors.act-ink}"
  button-earn:
    backgroundColor: "{colors.earn-from}"
    textColor: "{colors.earn-ink}"
    typography: "{typography.title}"
    rounded: "{rounded.md}"
    padding: "16px 24px"
    height: "44px"
  button-grow:
    backgroundColor: "{colors.grow-from}"
    textColor: "{colors.grow-ink}"
    typography: "{typography.title}"
    rounded: "{rounded.md}"
    padding: "16px 24px"
    height: "44px"
  button-travel:
    backgroundColor: "{colors.travel-from}"
    textColor: "{colors.travel-ink}"
    typography: "{typography.title}"
    rounded: "{rounded.pill}"
    padding: "12px 24px"
    height: "44px"
  button-exit:
    backgroundColor: "{colors.exit-to}"
    textColor: "{colors.exit-ink}"
    typography: "{typography.title}"
    rounded: "{rounded.pill}"
    padding: "12px 24px"
    height: "44px"
  nav-chrome-pill:
    backgroundColor: "{colors.chrome-ink}"
    textColor: "{colors.surface}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "10px 16px"
    height: "44px"
  nav-chrome-pill-light:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.warm-rose-deep}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "10px 16px"
    height: "44px"
  card-panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "20px"
  speech-bubble:
    backgroundColor: "{colors.golden-cream-tint}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "16px"
---

# Design System: Gamecakes

## 1. Overview

**Creative North Star: "The Confectioner's Archipelago"**

Gamecakes is a world made of dessert, scattered across open water. The mainland is a jelly-bean island of themed lands; Chess Isle and Race Island sit offshore with real sea between them, crossed by ferry or by a rented biplane. Everything a kid can see is edible-looking, everything a kid can touch has give, and there is always one more island further out than they have reached. The visual system exists to make that world feel like a place rather than a menu.

Density is low and deliberate. Kids read slowly, tap imprecisely, and play on a bright screen that is often not indoors, so surfaces are uncluttered, controls are large, and nothing important is small. The interface is loud in color and quiet in quantity: at any moment there are typically two or three things to do, rendered big, rather than twelve rendered small.

This system explicitly rejects **the edtech worksheet with a skin** — the Prodigy/IXL pattern where a cartoon wrapper is stretched over a problem set. The visual tell of that failure is a screen that would work equally well as a list: a question card floating on a decorative background, with the "game" reduced to a border. Gamecakes screens are places. Math appears at a gate, in a world the kid is trying to move through, and the surrounding geometry has to make that obvious without a word of explanation.

**Key Characteristics:**
- Confection-literal palette: three cake layers plus a cherry, used as identity rather than decoration
- Pill-first geometry — the fully-rounded shape is the default, not an option
- Lifted, tinted elevation: interactive things glow in their own hue
- Rounded display type (Fredoka) for anything a kid reads; neutral sans (Geist) for anything a grown-up reads
- Physical feedback on every press — nothing may respond only by changing color
- 44px minimum on every tap target, enforced by a shared token

## 2. Colors

Bright, saturated confection tones on a white or dark-zinc ground, named plainly so they can't be misapplied.

### Primary
- **Warm Rose** (`#fb7185`): The brand's dominant voice and the bottom cake layer. Primary actions, the "Play" affordance, the PWA theme color, and the wordmark gradient. If a screen has exactly one thing the kid should do, it is this color.
- **Warm Rose Deep** (`#e11d48`): The pressed and committed end of rose. Gradient terminus, active states, and the correct text-on-white rose for links and nav labels.

### Secondary
- **Golden Cream** (`#fde68a`): The middle cake layer. Reward, currency, celebration, and the Cakey speech-bubble ground. Sugar Tokens and anything the kid has earned live here.
- **Golden Cream Tint** (`#fef3c7`): The PWA splash background and the calm surface behind dialogue. The closest thing this system has to a neutral warm ground, and it is used sparingly — never as a page background.

### Tertiary
- **Soft Mint** (`#6ee7b7`): The top cake layer. Growth, unlocking, and successful completion — a land upgrading, a gate opening, a skill tiering up.
- **Cherry Red** (`#dc2626`) and **Stem Green** (`#166534`): Logo-only. The cherry and its stem appear on the mark and effectively nowhere else. Do not recruit them as UI colors.

### Neutral
- **Chrome Ink** (`#18181b`): The floating navigation pill. Deep zinc at ~85% opacity with a blur behind it, so chrome stays readable over a live 3D scene, a bright game canvas, or a photo without per-surface tuning.
- **Ink** (`#171717`) on **Surface** (`#ffffff`), inverting to **Ink Inverse** (`#ededed`) on **Surface Inverse** (`#0a0a0a`) under `prefers-color-scheme: dark`.

### Named Rules

**The Layer Rule.** Rose, cream, and mint are the cake, bottom to top, and they carry that order as meaning: rose is *act*, cream is *earn*, mint is *grow*. Sky is *travel* — going somewhere. A new control picks one of those four roles; it never picks a hue. The roles are tokens in `globals.css` (`--act-*`, `--earn-*`, `--grow-*`, `--travel-*`) and `CandyButton` takes `role`, not `color`.

**The Exit-Is-Not-Candy Rule.** Stopping is not an achievement, so it must not look like one. Everything that ends, closes, or backs out — hop off, exit, dismiss, cancel — leaves the candy palette entirely and takes the dark chrome treatment (`--exit-*`). This is what resolves the collision where rose meant both "Play" and "Hop off", and where "Hop off" was amber on the train but rose on a vehicle.

**The Ink Rule.** A label colour is never chosen; it is a property of the fill. Fills dark enough to carry white text take white (`act`, `exit`); the bright candy fills take a deep `-950` ink of their own hue (`earn`, `grow`, `travel`). Every pair is verified at **both** gradient stops and the worst in the system is `act` at 4.70:1 — AA for 16px bold, the smallest these render. Never hand-pick a text colour on a coloured fill.

**The Cherry Rule.** Cherry Red and Stem Green belong to the logo. Using them in the interface makes the mark generic and steals the one accent that still reads as "brand" at 16px.

**The Two Palettes Rule.** The DOM brand (`globals.css` custom properties) and the canvas brand (`lib/games/theme/palette.ts`) are separate and currently disagree — canvas mint is `#86efac`, DOM mint is `#6ee7b7`; canvas vanilla is `#fef3c7` where DOM vanilla is `#fde68a`. This is drift, not intent. When they conflict, the DOM values in the frontmatter above are canonical, and canvas values should migrate toward them.

**The Contrast Rule (resolved 2026-07-25).** The old white-on-candy controls failed AA at every light gradient stop — rose 2.69:1, sky 2.14:1, emerald 1.92:1, amber 1.67:1. The system now applies a **luminance rule**: `act` and `exit` use fills dark enough for white text (rose-600→700, zinc-800→900), while `earn`, `grow`, and `travel` keep their bright candy fills and take a `-950` ink of their own hue. See The Ink Rule for the verified pairs. New controls inherit this automatically by picking a role; there is nothing left to decide per-button.

## 3. Typography

**Display Font:** Fredoka (falling back to Geist, then system-ui)
**Body Font:** Geist (falling back to system-ui)
**Mono Font:** Geist Mono — timers and numeric HUD readouts only

**Character:** A rounded geometric display paired with a neutral grotesque — contrast on the humanist/geometric axis rather than two similar sans faces. Fredoka's rounded terminals were chosen deliberately: it reads measurably faster for ages 4–9 than a tech-startup sans, so it carries every surface a kid reads. Geist carries every surface a grown-up reads. The split is by audience, not by size.

### Hierarchy
- **Display** (Fredoka 700, 48px / 36px, line-height 1): Login, splash, game-over headline. One per screen, never two.
- **Headline** (Fredoka 700, 30px, line-height 1.2): Page titles — the town header, the parent dashboard, a land name.
- **Title** (Fredoka 700, 20–24px, line-height 1.4): Section and card titles, button labels, modal headings.
- **Body** (Geist 400–500, 14–16px, line-height 1.5): Prose, dashboard copy, ticket text. Cap prose at 65–75ch; dense parent tables may run wider.
- **Label** (Geist 600–700, 12px): Chips, badges, HUD readouts, secondary nav.

### Named Rules

**The Fixed Scale Rule.** Type sizes are fixed rem steps, not `clamp()`. Kids play at one device and one distance; fluid type buys nothing here and makes headings shrink unpredictably inside panels. Only four clamps exist in the codebase and none should multiply.

**The Kid-Face Rule.** If a kid reads it, it is Fredoka. If a grown-up reads it, it is Geist. A button a kid presses is Fredoka even when it sits on a parent screen. The town's action pills currently violate this — they render in Geist at `font-extrabold` — and should move to Fredoka.

**The One Weight Per Role Rule.** Four weights are in circulation (`extrabold`, `bold`, `semibold`, `medium`) with no rule separating them. Bold is the default for anything interactive; semibold for supporting labels. `extrabold` is legacy and should not spread.

## 4. Elevation

Lifted, not flat. This system reads as sweets arranged on a tray: interactive surfaces sit visibly above their background, and the shadow under them is tinted to their own hue rather than neutral gray, so a rose button casts a rose glow. That tinted lift is the primary signal that something is pressable — more than border, more than color. Backgrounds and static panels stay near the surface; anything that lifts is asking to be touched.

Blur is a functional material here, not decoration. Floating chrome sits over a live 3D scene, a Phaser canvas, or a photo, and `backdrop-blur` is what keeps it legible without tuning per surface. That is the only sanctioned use.

### Shadow Vocabulary
- **Resting** (`box-shadow: 0 1px 2px rgb(0 0 0 / 0.05)`): Static cards, chips, and inline panels. Barely there.
- **Chrome** (`box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1)`): Floating nav pills and toggles over content.
- **Candy lift** (`box-shadow: 0 10px 15px -3px <hue>-300 / 0.5`): Primary and action buttons, tinted to the button's own hue. The signature.
- **Overlay** (`box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1)`): Modals, drawers, and the garage/rental panels.

### Named Rules

**The Own-Hue Rule.** A lifted control's shadow is tinted to its own color at 40–50% opacity, never neutral gray. Gray shadow under a candy button is the single fastest way to make this system look like generic Tailwind.

**The Press-Drops Rule.** Pressing must lower the object: `active:scale-95` together with a reduction from the lift shadow to a smaller one. A control that changes only color on press reads as broken, because `-webkit-tap-highlight-color` is disabled globally and there is no browser fallback.

## 5. Components

Every control should feel **tactile and edible** — you should want to press it. Gloss, give, and a satisfying squash. The test: if a control would look at home in a generic admin panel, it is wrong.

### Buttons
- **Shape:** Fully rounded pill (9999px) for anything in the world or floating over it; softly rounded rectangle (16px) for anything inside a panel or modal. Pill is the default — it outnumbers every other radius roughly 3:1 and that ratio is correct.
- **Primary (candy):** Saturated fill in the role's hue, label per The Ink Rule, Fredoka bold, 24px horizontal padding, 44px minimum height. The candy read comes from a **rim light** — a 1.5px specular line along the top edge plus a soft occlusion at the bottom — not from a wash. An earlier version tinted the top 40% white at 45% alpha, which sat directly behind the label and cost roughly two stops of contrast; a rim reads as wet candy without touching the text. The whole shell lives in `.candy-shell` in `globals.css`.
- **Hover / Active:** `brightness(1.05)` on hover; `scale(0.95)` plus a glow collapse on press. Transitions name their properties explicitly (`transform`, `box-shadow`, `filter`) at 100ms — never `transition-all`.
- **Focus:** A **two-tone ring** — 2px inside, 3px outside — because no single colour clears 3:1 against both a bright candy fill and whatever the 3D town is rendering behind it. The pair contrasts 17.72:1 with itself, so the indicator survives a white page, a dark page, sky, grass, or sand. **The two tones swap with the fill**: the inner band must contrast with the control it sits on, so candy and light chrome take a dark inner while dark chrome takes a light one. Getting it backwards doesn't break the ring — the outer band still shows against the page — it just silently wastes 2 of its 5px.
- **Inert (disabled):** flat neutral fill, full-strength label, no lift. Never `opacity-50` — see The Readable-Inert Rule.
- **Shadow utilities are inert on a candy shell.** `.candy-shell` sets `box-shadow` from plain CSS, which outranks Tailwind's layered utilities — adding `shadow-lg` to one does nothing. Change the glow token, not the class list.

### Named Rules

**The Readable-Inert Rule.** A disabled control fades its *lift*, never its *label*. Blanket `opacity-50` dims fill and text together and drops every role to roughly 2.0–2.4:1. WCAG permits that — disabled controls are exempt from contrast — and it is still wrong here, because in Gamecakes the disabled state is where the reason lives: the ferry reads *"Need 🪙1 — play games!"* exactly when it is disabled, and that is the one message telling a kid what to do next. Inert controls go flat and neutral (8.23:1 light, 7.07:1 dark) and lose the glow entirely: not candy, not pressable, still readable. This applies to chrome as well as candy — a system that states a rule and then breaks it in one component is how drift starts.
- **Action pill (in-world):** The town's bottom-center prompts — pill, hue-coded by destination, glyph plus label, fixed above the safe-area inset.

### Chips
- **Style:** Pill, tinted background in the relevant hue at ~85% with a matching border one step darker, and text in that hue's deepest step. Never white text on a light chip.
- **State:** Selected chips take a solid fill; unselected stay tinted. Token and balance readouts use the Golden Cream family.

### Cards / Containers
- **Corner Style:** 24px for panels and modals, 16px for inline cards.
- **Background:** Surface white, or Golden Cream Tint when the container is dialogue from Cakey.
- **Shadow Strategy:** Resting for inline cards, Overlay for modals. See Elevation.
- **Border:** Usually none. When a container needs definition it takes a 1px border in the tint of its own hue, never a thick colored stripe on one edge.
- **Internal Padding:** 16–20px; 24px on modals.

### Inputs / Fields
- **Style:** Rounded rectangle (12–16px), 1px neutral border, surface fill, Geist body at 16px — never below 16px, which triggers iOS zoom-on-focus.
- **Focus:** Border shifts to Warm Rose with a soft rose ring. Focus must be visible without hovering.
- **Error:** Border and helper text in Cherry-adjacent red, with the message stated as a fix rather than a fault.

### Navigation
- **Style:** The floating chrome pill — deep zinc at 85%, 1px white border at low opacity, blurred backdrop, white Fredoka label, pill radius, 44px tall. Two variants: dark for game canvases and the 3D town, light (white fill, rose border, rose label) for gradient-backed pages.
- **States:** Hover lifts the background toward opaque; press scales to 95%; focus takes a rose ring.
- **Mobile / tablet:** Chrome clusters top-right in fullscreen and standalone PWA mode, and must always include a way out — iOS standalone cannot exit display-mode programmatically, so a missing exit link traps the kid.
- **Consistency:** There is one nav pill, and exactly one definition of it. `ChromeNavLink` (navigates) and `ChromeNavButton` (acts) share the same constants, so they cannot drift apart. The four divergent hand-rolled copies that used to live in `SoundToggle`/`FullscreenToggle`/`FeedbackButton`, `MapMenu`, the town HUD, and the game shells were migrated 2026-07-25. If you need a pill that acts rather than navigates, reach for `ChromeNavButton` — the absence of that export is the reason the copies existed.

### Cakey Speech Bubble
The mascot's dialogue: Golden Cream Tint ground, 16px radius, a CSS-triangle tail pointing back at Cakey, and a scale-and-fade pop-in with a `prefers-reduced-motion` variant that keeps the offset and drops the motion. This is the system's one piece of genuinely characterful chrome and the pattern to extend for any future in-world voice.

## 6. Do's and Don'ts

### Do:
- **Do** pick a control's color from the Layer Rule — rose to act, cream to earn, mint to grow — before reaching for a new hue.
- **Do** give every lifted control a shadow tinted to its own hue at 40–50% opacity.
- **Do** put a physical response on every press: `active:scale-95` plus a shadow drop. The global tap-highlight is disabled, so color alone is not feedback.
- **Do** hold 44px minimum on every tap target via the `--min-tap-target` token. This is already well enforced — keep it that way.
- **Do** set inputs at 16px or larger, so iOS doesn't zoom the viewport on focus.
- **Do** use Fredoka for anything a kid reads, including buttons on grown-up screens.
- **Do** name transition properties explicitly and keep state transitions at 100–250ms.
- **Do** give every animation a real `prefers-reduced-motion` alternative — a crossfade or a static end-state — rather than deleting it.
- **Do** reach for `CandyButton`, `ChromeNavLink`, or `ChromeNavButton` instead of pasting class strings. Every hand-rolled copy drifted, including two written the same week this system landed.

### Don't:
- **Don't** build a screen that would work just as well as a list of problems. That is **the edtech worksheet with a skin**, and it's the one thing PRODUCT.md forbids by name.
- **Don't** hand-pick a label colour on a coloured fill, or reach for a raw hue instead of a role. `<CandyButton role="travel">`, never `bg-sky-400 text-white` — that combination is 2.14:1 and is exactly what the role system exists to prevent.
- **Don't** ship an interactive control without a visible focus indicator. The shared components carry one by construction; a raw `<button>` does not, so either use a component or add `.candy-shell` / `.chrome-focus`.
- **Don't** use gray shadow under a candy surface — tint it to the control's own hue.
- **Don't** use Cherry Red or Stem Green anywhere but the logo.
- **Don't** use `transition-all`; name the properties.
- **Don't** disable a control with `opacity-50`. It dims the label along with the fill and hides the very message that explains why the control is off. Use the inert treatment in `.candy-shell:disabled`.
- **Don't** put streak counters, guilt states, countdown pressure, or any loss-aversion mechanic into the interface. Success is defined as kids choosing to open it.
- **Don't** use `backdrop-blur` decoratively. It is for chrome that must stay legible over a live canvas, and nothing else.
- **Don't** put a thick colored border on one edge of a card as an accent. Use a full 1px border in the hue's tint, or nothing.
- **Don't** introduce a fifth font weight or a fifth radius step. The vocabulary is already wider than it should be.
