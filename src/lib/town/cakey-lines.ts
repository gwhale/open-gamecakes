// Cakey's town voice — the lines the wandering mascot speaks in the 3D town.
//
// Cakey is a self-aware cake guide who lives on Gamecakes Island. He speaks in
// SHORT, warm, witty lines; he celebrates the kid's effort; he reacts to changes
// with dry wonder; and he's funny at his OWN expense, never the child's. He is
// never mean, scary, corporate, or babyish.
//
// This is a plain content module (no `three`, no React) so the persona is
// tunable in one place without touching scene or UI code. The 3D engine reports
// only WHERE Cakey is; the React overlay decides WHEN he talks and pulls the
// words from here.

import type { WhatsNewEntry } from '@/lib/whats-new';
import type { WeatherKind } from '@/lib/town/weather-config';

/** Ambient one-liners Cakey drops while roaming. Keep them short — a bubble
 *  should read in a glance. Dry, fond, a little bewildered by his own existence. */
export const AMBIENT_LINES: readonly string[] = [
  'I live here. Probably.',
  "Just checking the frosting. It's fine. It's always fine.",
  'Big island. Small cake. We manage.',
  'I forget my own recipe, but I never forget a face.',
  'Walking is just standing, but braver.',
  "I don't remember baking myself. Rude, honestly.",
  'The sprinkles moved again. Or I did. Hard to say.',
  'Some days I guard the island. Some days I just admire it.',
  'If you find a crumb, that was my cousin. Not me.',
  'Careful — the ground is made of ground.',
  'Nice weather for a cake. Every day is, really.',
  // Cakey's little jokes — groaners, at his own expense.
  'I tried to tell a cake joke, but the punchline was half-baked.',
  'Why did I cross the bakery? To get to the batter side.',
  'I’m not bossy. I’m just the cake with the most layers of experience.',
  'I asked the cookie for advice. It crumbled under pressure.',
  'My memory is a little frosting. Sweet, but not very reliable.',
  'Why don’t cakes argue? We prefer to let things settle.',
  'I may not know my recipe, but I’m pretty sure “handsome” was one of the ingredients.',
  'I tried running once. Turns out I’m more of a dessert walker.',
  'The muffins think they’re tough. Cute. They’re basically cupcakes without hats.',
  'I have a lot on my plate. Mostly crumbs.',
];

/** A dad joke Cakey tells on request: a setup, then a punchline. Kept as two
 *  fields so the panel can hand over the setup and let the kid tap for the
 *  reveal — the pause before the groan is the whole point. */
export interface DadJoke {
  setup: string;
  punchline: string;
}

/** Cakey's dad jokes — clean, cheesy-on-purpose groaners, mostly cake / food /
 *  school flavoured so they stay in his world. Kid-safe, never mean. */
export const DAD_JOKES: readonly DadJoke[] = [
  { setup: 'Why did the cookie go to the doctor?', punchline: 'It was feeling crumby.' },
  { setup: 'What do you call a cake that works out?', punchline: 'A roll model.' },
  { setup: 'Why don’t eggs tell jokes?', punchline: 'They’d crack each other up.' },
  { setup: 'What did the sprinkle say to the cupcake?', punchline: '“You make me look GOOD.”' },
  { setup: 'Why did the math book look so sad?', punchline: 'It had way too many problems.' },
  { setup: 'What kind of key opens a banana?', punchline: 'A mon-key.' },
  { setup: 'Why did the cupcake pack an umbrella?', punchline: 'In case of a sprinkle shower.' },
  { setup: 'What do you call cheese that isn’t yours?', punchline: 'Nacho cheese.' },
  { setup: 'What did one plate say to the other plate?', punchline: '“Tonight, dinner’s on me.”' },
  { setup: 'Why is Cakey so wise?', punchline: 'He’s got a LOT of layers of experience.' },
  { setup: 'How does a cake say hi at a baseball game?', punchline: '“Hey — batter, batter!”' },
  { setup: 'What’s a ghost’s favourite dessert?', punchline: 'I-scream.' },
];

/** Repeat-avoiding random dad-joke pick (mirrors pickLine). Returns the joke and
 *  its index so the caller can pass it back as `excludeIndex` next time. */
export function pickJoke(excludeIndex = -1): { joke: DadJoke; index: number } {
  let i = Math.floor(Math.random() * DAD_JOKES.length);
  if (DAD_JOKES.length > 1 && i === excludeIndex) i = (i + 1) % DAD_JOKES.length;
  return { joke: DAD_JOKES[i], index: i };
}

/** Openers for "just saying hi" (tapped Cakey → hello). */
export const HELLO_LINES: readonly string[] = [
  "Hi! I'm Cakey. I live here. Probably.",
  'You again! Good. I like you.',
  'Oh good, a designer. This island needs one.',
  'Hello, hello. The island was just asking about you.',
];

/** Fired when Cakey wanders up close to the kid ("notices you"). */
export const NOTICE_PLAYER_LINES: readonly string[] = [
  'There you are!',
  'Oh! Didn’t see you. I was busy being a cake.',
  'Fancy meeting you on my island.',
  'You walk faster than me. Everyone does.',
];

/** Line shown right before a trivia round opens. */
/** Socks and shoes.
 *
 *  Getting footwear on is a daily negotiation in this house, so Cakey helps —
 *  from the only angle he can, which is bafflement. He has no feet. He is a
 *  cake. That gap is the joke, and it lets him nag without sounding like a
 *  parent: he is not telling anyone off, he is genuinely trying to understand
 *  the ritual.
 *
 *  Kept dry like the rest of him. A line that pleads or scolds would break the
 *  character AND stop working the second a kid noticed it was a rule in
 *  disguise. */
export const SOCKS_AND_SHOES_LINES: readonly string[] = [
  'Socks first. Then shoes. Humans are very firm about the order.',
  'I have no feet. You have two. Seems a waste not to put shoes on them.',
  'A sock is a tiny sleeping bag for a foot. I have thought about this a lot.',
  'Shoes on? Good. That is the hardest part of anybody’s day.',
  'Two socks. Not one. I have watched this go wrong.',
  'Nobody in recorded history has regretted putting their shoes on.',
  'The floor is out there. Socks are the only thing between you and it.',
  'Shoes go on the feet. I checked. Twice.',
  'You will want socks. The world is absolutely full of floor.',
  'Put your shoes on and I will stop mentioning it. Probably.',
  'Somewhere in this house there is one sock. There is always one sock.',
  'I am a cake and even I know shoes go on before you leave.',
];

export const TRIVIA_INTRO_LINES: readonly string[] = [
  'Okay — brain snack. Ready?',
  'Quick one. I probably know this. Probably.',
  "Here's a fun one. No pressure. Some pressure.",
];

/** What Cakey says when the weather turns. Storms come from a *mysterious force*
 *  (an unseen antagonist) — Cakey is wary but never frightened, and never blames
 *  the Story Oven (that's the neutral thing that ships land updates). One line is
 *  picked at random per weather onset. */
export const WEATHER_LINES: Record<WeatherKind, readonly string[]> = {
  sunny: [
    'Sun’s out. Perfect weather for standing here being a cake.',
    'Ahh. Blue skies and no crumbs. Ideal.',
  ],
  overcast: [
    'Cozy and cloudy. Perfect napping weather for a cake.',
    'Soft grey day. Well — soft pink-grey. We’re fancy here.',
  ],
  shower: [
    'Sprinkle shower! Quick, open wide!',
    'It’s raining sprinkles. This island has excellent taste.',
  ],
  snow: [
    'Powdered-sugar snow! Careful, it’s slippery-sweet.',
    'Snow day! Or… sugar day. Either way, brrr.',
  ],
  storm: [
    'That wind again… something out there doesn’t like a nice day.',
    'Uh oh. The fog’s creeping back. That’s not the Story Oven — this one’s meaner.',
    'Batten the frosting! Whoever sends these storms is at it again.',
  ],
  rainbow: [
    'All clear! Take that, whoever you are.',
    'A rainbow! I think I can taste the purple part.',
    'Sun’s back and the fog lost. Good. I had plans.',
  ],
};

/** A greeting that folds in the kid's name when we have it. */
export function greeting(displayName?: string): string {
  const name = displayName?.trim();
  if (!name) return HELLO_LINES[0];
  return `Hi ${name}! I’m Cakey. I live here. Probably.`;
}

/** Repeat-avoiding random pick from a pool (mirrors trivia's pickQuestion so
 *  the same line rarely shows twice in a row). Returns the line + its index so
 *  the caller can pass it back as `excludeIndex` next time. */
export function pickLine(
  pool: readonly string[],
  excludeIndex = -1,
): { line: string; index: number } {
  if (pool.length === 0) return { line: '', index: -1 };
  let i = Math.floor(Math.random() * pool.length);
  if (pool.length > 1 && i === excludeIndex) i = (i + 1) % pool.length;
  return { line: pool[i], index: i };
}

/** Turn a What's-New entry into a short sequence of Cakey-voiced lines about
 *  the "Story Oven" (the behind-the-scenes AI + code kids steer with feedback).
 *  The updates SURPRISE Cakey — nobody tells him anything — so the framing is
 *  dry wonder, not a patch note. Returns 3–5 lines the overlay steps through. */
export function whatsNewToCakeyLines(
  entry: WhatsNewEntry,
  displayName?: string,
): string[] {
  const who = displayName?.trim() || 'you';
  const lines: string[] = [
    'The Story Oven changed something. Nobody told me, of course.',
    `${entry.emoji} ${entry.area}: ${entry.headline}`,
  ];
  // Two of the concrete changes, in Cakey's telling.
  for (const c of entry.changes.slice(0, 2)) {
    lines.push(`${c.emoji} ${c.text}`);
  }
  lines.push(
    entry.fromKids
      ? `And a kid asked for that one. Could’ve been ${who}. Big deal, honestly.`
      : 'I didn’t do it. I was napping. But I approve.',
  );
  return lines;
}
