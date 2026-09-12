// Cakey on the radio — what he says from inside the submarine.
//
// A plain content module, exactly like cakey-lines.ts (no `three`, no React,
// no DB), so his persona underwater is tunable in one file. The engine reports
// only WHAT HAPPENED; the host decides when he talks and pulls the words here.
//
// VOICE. Same Cakey as the town — optimistic, self-aware, curious, mildly
// sarcastic, funny at his own expense and never at the kid's. Two things are
// different down here and both matter:
//
//   1. HE DOES NOT KNOW WHAT ANY OF IT MEANS. He is not a guide with the
//      answers withheld for pacing; he is finding out at the same time the kid
//      is. Every line about an artefact must be a REACTION, never an
//      explanation. If a line could be rewritten as a hint, it is wrong.
//   2. He is a cake in an ocean, which he has opinions about.
//
// The copy rules from story-events.ts still apply: short, present tense, one
// idea per line, everyday words, at most one all-caps wow-word, never scary.
// A kid at the depth limit in black water is as tense as this game ever gets,
// and Cakey's job there is to be delighted rather than to be ominous.

import { pickLine } from '@/lib/town/cakey-lines';

/** Boarding, before the dive. Sets up that he has no idea what he is doing. */
export const BOARDING_LINES: readonly string[] = [
  'According to my maritime training, oceans are mostly downstairs.',
  'I have never been in a submarine. I have strong opinions about it already.',
  'Sub-Cake One. I named it. Nobody stopped me.',
  'A cake, in a boat, under the sea. Nobody planned this.',
];

/** First time the sub goes under on a given dive. */
export const DESCENT_LINES: readonly string[] = [
  'Oh, that is a LOT of water above us now.',
  'Down we go. The floor is somewhere. Probably.',
  'Everything is blue and I am fine with it.',
];

/** Ambient, while driving around the reef. Same one-in-five rate as the town's
 *  socks-and-shoes bit, and for the same reason written into that code: a nag
 *  heard every time is a nag nobody hears. */
export const REEF_LINES: readonly string[] = [
  'The fish are pretending not to look at us. I can tell.',
  'That coral is the same colour as sprinkles. I refuse to think about why.',
  'I could live here. I would get soggy, but I could live here.',
  'Nothing down here has asked me a single question. Very relaxing.',
];

/** Entering the drop — the reef floor has gone and it is open blue. */
export const DROP_LINES: readonly string[] = [
  'The bottom just... left. Where did the bottom go.',
  'Okay. Open water. Nothing under us. Totally normal.',
  'It is getting darker and I am pretending that is cosy.',
];

/** In the canyon, headlights on. */
export const CANYON_LINES: readonly string[] = [
  'The ocean has become noticeably less welcoming.',
  'Headlights on. Everything outside them is a rumour.',
  'These cliffs are older than cake. Which is saying something.',
];

/** Sonar came back with nothing. This has to be a REAL answer, not a failure —
 *  "empty here" is how a kid learns that somewhere else is not empty. */
export const SONAR_EMPTY_LINES: readonly string[] = [
  'Nothing out there. Which is its own kind of information.',
  'All quiet. Try somewhere with more... somewhere.',
  'Empty water. Let us go be nosy elsewhere.',
];

/** Sonar found something. Never says what — that is the entire mechanic. */
export const SONAR_HIT_LINES: readonly string[] = [
  'Excellent. Something out there knows we are here.',
  'That is a real echo. Something solid is sitting in the dark.',
  'Ping came back funny. I love it when the ping comes back funny.',
];

/** Reaching the hull's depth limit, with the glow visible below. The last beat
 *  of the whole dive, so it carries the hook: he WANTS to go and cannot. */
export const DEPTH_LIMIT_LINES: readonly string[] = [
  'That is as deep as we go. Which is a shame, because look at it.',
  'Sub-Cake One says no. Sub-Cake One is being very firm.',
  'Something down there is glowing and we are not allowed. Rude.',
];

/** What he says at the whisk. The one line in the build that touches the story.
 *  Note what it does NOT do: it does not tell the kid what the whisk means,
 *  because he genuinely does not know. */
export const WHISK_LINES: readonly string[] = [
  'I do not want to overreact, but that looks suspiciously relevant to me.',
  'A whisk. Down HERE. Someone was baking, and it was not me. Probably.',
  'I forget my own recipe. I did not expect to find bits of it lying about.',
];

/** Coming back to something he has already met. The whole reason discoveries
 *  are saved at all right now: greeting a thing twice as though it were new is
 *  the exact tell that nothing is being remembered. He is not bored of it — he
 *  has just had time to think, and is no closer to an answer. */
export const WHISK_AGAIN_LINES: readonly string[] = [
  'Still here. Still a whisk. Still no idea.',
  'I have thought about this a lot since last time. No progress.',
  'Hello again, mystery kitchen object. You are looking well.',
];

/** Surfacing / heading home. */
/** Any chest but the whisk's. Ten of them, so these have to work for a crate
 *  of eggs and for a tin at 300m in the dark -- which means they are about the
 *  ACT of opening one, never about what is inside. He does not know what is
 *  inside. Nor does the kid, until the lid is up. */
export const CHEST_LINES: readonly string[] = [
  'It opened. I did not think it was going to open.',
  'Somebody packed this. Down here. On purpose.',
  'A box, at the bottom of the sea, with something in it. I have questions.',
  'The lid still works. After all this time, the lid still works.',
  'Baking things keep turning up down here and nobody will tell me why.',
];

/** Coming back to one already open. Short: he has said his piece about it. */
export const CHEST_AGAIN_LINES: readonly string[] = [
  'Still open. Still empty. We got there first.',
  'We have done this one. I remember the lid.',
  'Empty. Because of us. I am counting that as ours.',
];

export const SURFACE_LINES: readonly string[] = [
  'Back to the cove. I need a moment and possibly a towel.',
  'Up we go. I have a lot to think about and no brain to do it with.',
];

/** What he says about the THING, once the lid is up.
 *
 * CHEST_LINES above are about the act of opening, and had to be, because until
 * the gate shipped a kid could not know what was inside either -- so a line
 * naming it would have been Cakey reading ahead. Now the lid comes up on a
 * named item and he can finally react to the object itself.
 *
 * He still does not know what any of it is FOR. Every line here is a reaction
 * to a thing being where it has no business being; none of them hint at what
 * the collection becomes. If a line could be rewritten as a clue, it is wrong.
 */
export const ITEM_LINES: Record<string, readonly string[]> = {
  // The whisk keeps the lines it already had -- it is the one he has a story
  // about, and it was down here on its own long before the other nine.
  whisk: WHISK_LINES,
  eggs: [
    'Eggs. Six of them. Not one cracked. In the SEA. I want to sit down.',
    'Somebody carried eggs down here and did not break a single one.',
    'A carton of eggs, at the bottom of the ocean, in perfect condition.',
  ],
  sprinkles: [
    'Sprinkles. Still rattling. Nothing down here has any business rattling.',
    'A jar of sprinkles. I have never been so pleased and so confused.',
    'Sprinkles. Somebody down here likes the same things I like.',
  ],
  bowl: [
    'A mixing bowl. Empty. Waiting. It has been waiting a very long time.',
    'Somebody was going to mix something. Then the sea happened.',
    'A bowl. Just a bowl. It is somehow the strangest one yet.',
  ],
  flour: [
    'A bag of flour. Dry. Completely DRY. I refuse to explain that.',
    'Flour, underwater, still flour. The ocean is not playing fair.',
    'It should be soup by now. It is not soup. I checked.',
  ],
  butter: [
    'Butter. Cold. Well. Yes. Everything down here is cold.',
    'A block of butter, keeping beautifully. Of course it is.',
    'Butter at the bottom of the sea. Planned badly, or planned perfectly.',
  ],
  milk: [
    'A bottle of milk. The lid is on. The lid is ON.',
    'Milk. Clinking. In the quietest place I have ever been.',
    'Somebody bottled this and left it here and I would love to know why.',
  ],
  sugar: [
    'A tin of sugar. Heavy. It came a long way down to sit here.',
    'Sugar. Sealed. Patient. I think it has been waiting for somebody.',
    'A whole tin of it, in the dark. Nobody was coming back for this.',
  ],
  'oven-mitt': [
    'An oven mitt. Down here. Nothing down here is remotely hot.',
    'A mitt for a hot thing, in the coldest place I know.',
    'Somebody was ready to pick something up. I do not know what.',
  ],
  candle: [
    'One birthday candle. One. Somebody was counting something.',
    'A candle. Unlit. It has never been lit. That is the part that gets me.',
    'Somebody was going to celebrate down here. I hope they did.',
  ],
};

export type RadioMoment =
  | 'boarding'
  | 'descent'
  | 'reef'
  | 'drop'
  | 'canyon'
  | 'sonar-empty'
  | 'sonar-hit'
  | 'depth-limit'
  | 'whisk'
  | 'whisk-again'
  | 'chest'
  | 'chest-again'
  | 'surface';

const POOLS: Record<RadioMoment, readonly string[]> = {
  boarding: BOARDING_LINES,
  descent: DESCENT_LINES,
  reef: REEF_LINES,
  drop: DROP_LINES,
  canyon: CANYON_LINES,
  'sonar-empty': SONAR_EMPTY_LINES,
  'sonar-hit': SONAR_HIT_LINES,
  'depth-limit': DEPTH_LIMIT_LINES,
  whisk: WHISK_LINES,
  'whisk-again': WHISK_AGAIN_LINES,
  chest: CHEST_LINES,
  'chest-again': CHEST_AGAIN_LINES,
  surface: SURFACE_LINES,
};

/** Pick a line for a moment, avoiding an immediate repeat. Reuses the town's
 *  pickLine so the repeat-avoidance behaves identically in both worlds. */
export function radioLine(
  moment: RadioMoment,
  excludeIndex = -1,
): { line: string; index: number } {
  return pickLine(POOLS[moment], excludeIndex);
}

/** Cakey's reaction to a specific find. Falls back to the generic chest lines
 *  for anything the item catalog grows before this file catches up -- a new
 *  item should never be able to ship him into silence. */
export function itemLine(
  itemSlug: string,
  excludeIndex = -1,
): { line: string; index: number } {
  return pickLine(ITEM_LINES[itemSlug] ?? CHEST_LINES, excludeIndex);
}

/** Every line, for the test that keeps the copy rules honest. */
export const ALL_RADIO_LINES: readonly string[] = [
  ...new Set([...Object.values(POOLS).flat(), ...Object.values(ITEM_LINES).flat()]),
];
