// The Cakey checkers opponents — who you actually play in Cakey Checkers.
//
// The five characters come from opponents/cast.ts, shared with Chess Challenge.
// Everything here is what differs when they sit down at a CHECKERS board: the
// bot config, the belt, the blurb, and the voice.
//
// ⚠️ BELTS, NOT NUMBERS. Chess Challenge shows "chess strength 950" and its own
// bot.ts admits the number is a difficulty label rather than a measurement. We
// did not repeat that here: there is no public checkers rating a parent would
// recognise, and (see bot.ts) a depth-8 checkers engine is genuinely strong, so
// any number we picked would over-claim. A belt says "harder than the last one"
// and claims nothing else.
//
// THE VOICE RULE, from cast.ts, and it is not negotiable:
//   Every line about a mistake is about the OPPONENT'S good luck, never the
//   kid's failure.
//
// Checkers needs two pools chess never had, and they exist for the same reason:
//   - `botCaptures` — a forced jump. The line puts the blame on THE RULES ("I
//     have to hop"), so the moment the kid loses a piece, nobody is talking
//     about the kid at all.
//   - `gotCrowned` — the kid crowned a piece. This is the emotional peak of a
//     game of checkers and every character should sound genuinely pleased.
//
// ⚠️ The gotCrowned lines below are a first draft and are the one pool that
// wants a real pass before it meets a child. Everything else can be tuned; this
// is the one a kid will remember.

import type { CheckersBotConfig } from './bot';
import { CAST, assertLevelCoverage, type OpponentAvatar } from '../opponents/cast';

export interface CheckersOpponent {
  id: string;
  name: string;
  /** Kid-facing difficulty label. A rank, not a rating — see the note above. */
  belt: string;
  /** Launcher levels this opponent covers. 1–10 exactly once, asserted below. */
  levels: readonly number[];
  blurb: string;
  avatar: OpponentAvatar;
  bot: CheckersBotConfig;
  lines: {
    greeting: readonly string[];
    /** The kid played a strong turn. */
    goodMove: readonly string[];
    /** The kid dropped something. ABOUT THE OPPONENT'S LUCK. */
    kidSlip: readonly string[];
    /** The kid took a piece. */
    kidCaptures: readonly string[];
    /** The kid took two or more in one turn. */
    kidChains: readonly string[];
    /** The kid crowned a man. The best moment in the game — sound like it. */
    gotCrowned: readonly string[];
    /** The opponent jumped the kid. Blame the RULES, never the kid. */
    botCaptures: readonly string[];
    /** The kid tapped a piece that cannot move because a jump exists elsewhere.
     *  This is a HINT, not a correction — it fires before any mistake has been
     *  made, and it must sound like help. */
    forcedJump: readonly string[];
    botCrowned: readonly string[];
    botWins: readonly string[];
    botLoses: readonly string[];
    draw: readonly string[];
  };
}

const avatarOf = (id: string): OpponentAvatar => {
  const member = CAST.find((c) => c.id === id);
  if (!member) throw new Error(`checkers/opponents: no cast member "${id}"`);
  return member.avatar;
};

const NODE_CAP = 200_000;

export const OPPONENTS: readonly CheckersOpponent[] = [
  {
    id: 'crumb',
    name: 'Crumb',
    belt: 'Sprinkle Belt',
    levels: [1, 2],
    blurb: 'Crumb only learned the rules yesterday. He will take anything you leave out.',
    avatar: avatarOf('crumb'),
    bot: {
      depth: 2,
      // Does not believe in chains, so he walks into double jumps — the single
      // most beginner-looking thing a checkers bot can do.
      seesChains: false,
      // Does not know a king is worth more than a man, and will trade one away.
      kingValue: 1.0,
      usesAdvanceBonus: 0, // no idea he is meant to be heading somewhere
      usesBackRowBonus: 0,
      usesEdgeSafety: 0,
      blunderPct: 0.35,
      blunderKind: 'random',
      chainGreed: 140, // always takes the biggest jump, best or not
      slack: 150,
      takesWinInOne: false,
      guardsKings: false,
      avoidsSelfTraps: false,
      nodeCap: NODE_CAP,
    },
    lines: {
      greeting: [
        "I only learned this yesterday. Be nice!",
        "Which way do these go again? …Forward. Right. Forward.",
        "Hello! I'm Crumb. I mostly just move things about.",
      ],
      goodMove: ['Whoa. How did you see that?', "That was a good one. I'm writing it down.", 'Ooh, clever.'],
      kidSlip: [
        'Lucky me!',
        "Oh! I didn't even see that until you moved.",
        "Well, that's the nicest thing anyone's done for me all day.",
      ],
      kidCaptures: ['Aw, my cookie!', "Take it, take it. I've got loads.", "Fair's fair."],
      kidChains: ['TWO of them? At once?!', 'That was quite a hop.', 'Wow. Do that again, but slower.'],
      gotCrowned: ['You got a crown! Can I try it on?', "Ooh, royalty. I'd better be polite now.", "A crown! That's the best bit."],
      botCaptures: [
        'The rules made me! I had to hop.',
        "I'm not allowed to skip a jump, sorry.",
        'Jumps are compulsory, apparently. Lucky me.',
      ],
      forcedJump: [
        "Ooh — there's a jump going! You have to take those.",
        'Wait, wait — I think you can hop one!',
        "Jumps first, I'm told. That one's stuck.",
      ],
      botCrowned: ['I got a crown! I have no idea what to do with it.', "Look at me, I'm fancy."],
      botWins: ['I won? I WON? Best day.', "Good game! Want another? I probably can't manage that twice."],
      botLoses: ['Well played! That was fun.', "You're much better than me. Good."],
      draw: ['A tie! Nobody has to be sad.', 'Even. That feels about right.'],
    },
  },
  {
    id: 'sprinkle',
    name: 'Sprinkle',
    belt: 'Sugar Belt',
    levels: [3, 4],
    blurb: 'Sprinkle has worked out that crowns are worth having. She is coming for one.',
    avatar: avatarOf('sprinkle'),
    bot: {
      depth: 4,
      seesChains: false,
      kingValue: 1.2,
      usesAdvanceBonus: 2, // has noticed the far side of the board exists
      usesBackRowBonus: 0,
      usesEdgeSafety: 0,
      blunderPct: 0.2,
      blunderKind: 'random',
      chainGreed: 70,
      slack: 100,
      takesWinInOne: true,
      guardsKings: false,
      avoidsSelfTraps: false,
      nodeCap: NODE_CAP,
    },
    lines: {
      greeting: ["Hi! I'm Sprinkle. I'm getting quite good at this.", "Ready? I've been practising."],
      goodMove: ['Ooh, nice.', 'I did NOT expect that.', 'Good one!'],
      kidSlip: ['Lucky me!', "Ooh, I'll take that, thank you.", 'That one landed right in front of me.'],
      kidCaptures: ['Fair enough!', 'Go on then.', "You've earned it."],
      kidChains: ['A double! Show-off.', 'That was a proper hop.', 'Two in one go — lovely.'],
      gotCrowned: ['A crown! Nice one.', 'Now you can go backwards. Watch out, me.', 'Royalty! Congratulations.'],
      botCaptures: ["Got to jump if there's a jump.", 'Rules are rules — hop hop.', "That's the rule, not me being mean."],
      forcedJump: [
        "Ooh, you've got a jump! Those have to be taken.",
        "Hop first — that's the rule.",
        'Someone else can jump, so that one has to wait.',
      ],
      botCrowned: ['Crown for me!', 'Backwards, here I come.'],
      botWins: ['Yes! Good game though, really.', 'That was close. Want to go again?'],
      botLoses: ['You got me! Well played.', 'Good game — you were better.'],
      draw: ["A draw! We're evenly matched.", 'Tie. Rematch?'],
    },
  },
  {
    id: 'cakey',
    name: 'Cakey',
    belt: 'Cocoa Belt',
    levels: [5, 6],
    // The house sparring partner, NOT the final boss.
    blurb: 'Cakey plays a tidy game and will absolutely set a trap for you.',
    avatar: avatarOf('cakey'),
    bot: {
      depth: 6,
      seesChains: true, // from here up, a chain is visible before you spring it
      kingValue: 1.35,
      usesAdvanceBonus: 4,
      usesBackRowBonus: 3,
      usesEdgeSafety: 2,
      blunderPct: 0.12,
      blunderKind: 'second-best',
      chainGreed: 20,
      slack: 60,
      takesWinInOne: true,
      guardsKings: false,
      avoidsSelfTraps: false,
      nodeCap: NODE_CAP,
    },
    lines: {
      greeting: [
        "Right then. Let's have a game.",
        "I've set the board. Try not to be too good at this.",
        "Checkers! My favourite. Don't tell chess.",
      ],
      goodMove: ["Oh, that's good. That's annoying AND good.", "Right. I'm going to have to think now.", 'Nicely done.'],
      kidSlip: ['Lucky me!', "Well, I wasn't going to say no.", 'That one wandered right past me.'],
      kidCaptures: ['Ouch. Fair.', "Take it. I'll get over it.", "You've earned that."],
      kidChains: ['Two at once! I felt that.', 'A chain! Very tidy.', "That's the good stuff, that is."],
      gotCrowned: ['Crowned! Look at you.', 'A king. Now you can chase me both ways.', 'Well earned. Genuinely.'],
      botCaptures: [
        "Sorry — jumps are compulsory. I don't make the rules.",
        'The rule says hop, so I hop.',
        'Had to. Honest.',
      ],
      forcedJump: [
        "You've got a hop going. Jumps have to be taken.",
        "Not that one — there's a jump on the board.",
        'Rules say jump first. Have a look.',
      ],
      botCrowned: ["I got one! Don't panic.", "Crown for me. I'll try not to let it go to my head."],
      botWins: ['Good game! You made me work.', 'I got there. Barely.'],
      botLoses: ['You beat me! Properly beat me.', "Well played. I'll get you next time. Probably."],
      draw: ['A draw. Honestly, fair.', 'Dead even. Good game.'],
    },
  },
  {
    id: 'biscotti',
    name: 'Biscotti',
    belt: 'Caramel Belt',
    levels: [7, 8],
    blurb: 'Biscotti guards her kings and does not give pieces away. You will have to take them.',
    avatar: avatarOf('biscotti'),
    bot: {
      depth: 6,
      seesChains: true,
      kingValue: 1.6,
      usesAdvanceBonus: 5,
      usesBackRowBonus: 6,
      usesEdgeSafety: 3,
      blunderPct: 0.06,
      blunderKind: 'second-best',
      chainGreed: 0,
      slack: 30,
      takesWinInOne: true,
      guardsKings: true,
      avoidsSelfTraps: false,
      nodeCap: NODE_CAP,
    },
    lines: {
      greeting: ['Biscotti. Shall we?', "I've been looking forward to this.", "Let's see what you've got."],
      goodMove: ['Hm. Good.', "That's the move I'd have played.", 'Sharp.'],
      kidSlip: ['Lucky me.', "I'll take that, thank you.", 'That was kind of the board.'],
      kidCaptures: ['Yes, that was there.', 'Well spotted.', 'Fair.'],
      kidChains: ['A chain. Very good.', 'Two. That was properly set up.', 'I walked into that.'],
      gotCrowned: ['Crowned. Well earned.', 'A king. Now it gets interesting.', 'Good. You worked for that.'],
      botCaptures: ['The rules insist.', "A jump is compulsory — that one wasn't my idea.", 'Forced. Sorry.'],
      forcedJump: [
        "There's a jump available. It has to be taken.",
        'Not that piece — a jump is on the board.',
        'Jumps come first. Look again.',
      ],
      botCrowned: ['Crowned.', "That'll be useful."],
      botWins: ['Good game. You made that difficult.', "Close. Closer than I'd like."],
      botLoses: ['You beat me. Well played, genuinely.', 'That was better than me. Good.'],
      draw: ['A draw. Honestly earned.', 'Even. Good game.'],
    },
  },
  {
    id: 'chef-gateau',
    name: 'Chef Gâteau',
    belt: 'Golden Whisk',
    levels: [9, 10],
    blurb: 'Chef Gâteau sees the trap you are building. Beating him is a real thing to have done.',
    avatar: avatarOf('chef-gateau'),
    bot: {
      depth: 8,
      seesChains: true,
      kingValue: 1.75,
      usesAdvanceBonus: 5,
      usesBackRowBonus: 8,
      usesEdgeSafety: 3,
      blunderPct: 0.02,
      blunderKind: 'second-best',
      chainGreed: 0,
      slack: 10,
      takesWinInOne: true,
      guardsKings: true,
      // Will not hand over a multi-jump, so his rare mistakes read as
      // inaccuracies rather than as the engine glitching.
      avoidsSelfTraps: true,
      nodeCap: NODE_CAP,
    },
    lines: {
      greeting: ['Ah! A challenger. Delightful.', 'Sit, sit. Let us play.', 'I have been baking. Now I shall play.'],
      goodMove: ['Oh! Very good.', 'Magnifique. Truly.', 'You have been practising.'],
      kidSlip: ['Ah — lucky me.', 'The board was generous to me there.', 'I shall take that gift.'],
      kidCaptures: ['Ah, you saw it. Good.', 'Yes. That was there.', 'Take it, take it.'],
      kidChains: ['A chain! Beautiful.', 'Two at once. That was elegant.', 'Bravo. Genuinely, bravo.'],
      gotCrowned: ['A crown! You have earned it.', 'Royalty. I shall be careful now.', 'Magnifique. Well fought.'],
      botCaptures: ['The rules oblige me. A jump must be taken.', 'I must hop. It is the rule.', 'Forced, I am afraid.'],
      forcedJump: [
        'Ah — a jump is on the board. It must be taken.',
        'Not that one. There is a hop waiting.',
        'The rules: a jump first, always.',
      ],
      botCrowned: ['Ah, a crown.', 'Now I have a king. Be careful.'],
      botWins: ['A fine game. You pushed me.', 'I win — but only just.'],
      botLoses: ['You have beaten me! Wonderful.', 'Bravo. Genuinely, bravo.'],
      draw: ['A draw. A good one.', 'Even. That was a proper game.'],
    },
  },
];

export function opponentForLevel(level: number): CheckersOpponent {
  const l = Math.max(1, Math.min(10, Math.round(level)));
  return OPPONENTS.find((o) => o.levels.includes(l)) ?? OPPONENTS[0];
}

export function opponentById(id: string): CheckersOpponent | undefined {
  return OPPONENTS.find((o) => o.id === id);
}

if (process.env.NODE_ENV !== 'production') {
  assertLevelCoverage('checkers/opponents', OPPONENTS);

  // Difficulty must be monotonic in the launcher's level order, or the level
  // grid stops meaning anything. Depth may plateau (it does, at 6) but the
  // blunder rate must never go back up.
  for (let i = 1; i < OPPONENTS.length; i += 1) {
    const prev = OPPONENTS[i - 1];
    const cur = OPPONENTS[i];
    if (cur.bot.blunderPct > prev.bot.blunderPct) {
      console.warn(`[checkers/opponents] ${cur.id} blunders more than the easier ${prev.id}`);
    }
    if (cur.bot.kingValue < prev.bot.kingValue) {
      console.warn(`[checkers/opponents] ${cur.id} values kings less than the easier ${prev.id}`);
    }
    if (cur.bot.depth < prev.bot.depth) {
      console.warn(`[checkers/opponents] ${cur.id} searches shallower than the easier ${prev.id}`);
    }
  }

  // An empty pool means a silent bubble at exactly the moment it matters.
  for (const o of OPPONENTS) {
    for (const [pool, lines] of Object.entries(o.lines)) {
      if (lines.length === 0) console.warn(`[checkers/opponents] ${o.id} has no ${pool} lines`);
    }
  }
}
