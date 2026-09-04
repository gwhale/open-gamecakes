// What's-New changelog — the kid-facing "here's what changed" feed.
//
// This is deliberately a plain data module, not hand-written JSX: each update
// is one object, so shipping a new feature is a one-entry append here and the
// /whats-new page re-renders it. Keep the language kid-friendly (a 6–8-year-old
// should get it) and keep entries NEWEST FIRST — the page renders them in array
// order.
//
// `fromKids` flags updates that started life as a kid's Story Oven idea, so the
// page can show a "🧁 You baked this!" badge — closing the loop between popping
// an idea in the oven and seeing it come out is the whole point of the system.

export interface WhatsNewChange {
  emoji: string;
  text: string;
}

export interface WhatsNewEntry {
  /** Stable slug (used as the React key + anchor). */
  id: string;
  /** Human month label shown on the card, e.g. "July 2026". */
  dateLabel: string;
  /** Big emoji for the card. */
  emoji: string;
  /** Which part of Gamecakes changed, e.g. "Marble Math" or "Gamecakes City". */
  area: string;
  /** One punchy kid-friendly headline. */
  headline: string;
  /** A sentence or two setting up what's new. */
  blurb: string;
  /** True when this shipped from a kid's Story Oven idea → shows the "🧁 You baked this!" badge. */
  fromKids?: boolean;
  /** Optional "try it now" deep link into the game/place that changed. */
  playHref?: string;
  playLabel?: string;
  /** The specific things that changed, as a bulleted list of emoji + text. */
  changes: WhatsNewChange[];
}

export const WHATS_NEW: WhatsNewEntry[] = [
  {
    id: 'cakey-crane-2026-08',
    dateLabel: 'August 2026',
    emoji: '🏗️',
    area: 'Cakey Crane',
    headline: 'New in Town Square: build the tallest cake!',
    blurb:
      'A candy-cane crane swings a cake tin back and forth over your cake. You pick the moment — tap DROP and it lands. Line it up dead centre for a PERFECT and the layer even grows back a little. Anything hanging over the edge gets sliced off and tumbles onto the bakery counter. Four different tins come down the crane, from a great big party tin to a tiny petit four, and how tall you get is up to you.',
    playHref: '/games/cakey-crane',
    playLabel: 'Go build a cake',
    changes: [
      { emoji: '👆', text: 'One button: tap DROP (or tap anywhere, or press space). The timing is the game.' },
      { emoji: '🎉', text: 'FOUR tin sizes. A big party tin is easy to land. A tiny petit four is worth THREE TIMES the points — if you can thread it.' },
      { emoji: '🎯', text: 'Land one dead centre for a PERFECT — you keep the whole layer and get a bit of it back.' },
      { emoji: '🧁', text: 'A small tin that lands inside your cake does not shrink it. The big layer underneath is still there to build on.' },
      { emoji: '🔥', text: 'Perfects in a row build a streak, and the streak is worth big points.' },
      { emoji: '🍰', text: 'The slice you miss really falls — it tips off the cake and lands on the counter.' },
      { emoji: '📋', text: 'Every 5 drops the bakery calls an order check. Get it right and the baker patches your next layer wider.' },
      { emoji: '🍒', text: 'Frosting drips, sprinkles, a doily, a sprinkle jar — and a cherry on top when the round ends.' },
      { emoji: '🪙', text: 'This one you buy! It costs 25 Sugar Tokens, once — then it is yours forever. Its booth is right in Town Square.' },
    ],
  },
  {
    id: 'cakey-stacks-2026-08',
    dateLabel: 'August 2026',
    emoji: '🍰',
    area: 'Cakey Stacks',
    headline: 'A new game in Town Square: stack the cake!',
    blurb:
      'Cake slices fall into a big baking pan. Slide them, spin them and pack them so a whole row is full — that row bakes into a layer and pops right out with sprinkles. You can play it in 3D, where the pan sits on the bakery counter, or flip it to Classic, which is flat and fast. Same game, you pick which one you like.',
    playHref: '/games/cakey-stacks',
    playLabel: 'Go stack some cake',
    changes: [
      { emoji: '👆', text: 'Drag a slice with your finger and it follows you. Tap to spin it, flick down to slam it, flick up to save it for later.' },
      { emoji: '🎛️', text: 'Big buttons at the bottom do everything too — hold one down and it keeps going.' },
      { emoji: '👻', text: 'A dotted outline shows exactly where your slice will land.' },
      { emoji: '🍒', text: 'Answer a question to bake a Cherry Bomb, then pop it to clear the bottom of the pan.' },
      { emoji: '🚨', text: 'If the pan fills up you are not out — solve one more and the oven scoops the bottom layers away.' },
      { emoji: '🟥', text: 'New "How it looks" picker: 3D cake pan or 2D Classic.' },
      { emoji: '🪙', text: 'This one you buy! It costs 25 Sugar Tokens, once — then it is yours forever. Its booth is right in Town Square.' },
    ],
  },
  {
    id: 'story-oven-fits-the-screen-2026-08',
    dateLabel: 'August 2026',
    emoji: '🔥',
    area: 'The Story Oven',
    headline: 'The Story Oven fits on the screen now!',
    blurb:
      'You told us the "What should we bake?" box was too big and fell off the bottom of the screen, and that you could not see all the games in the list. Both of those were the same bug: the box had no way to stop growing, so once we had 22 games it grew taller than the whole iPad and the ends got chopped off. Now the box always fits, the game list scrolls, and the big green "Into the oven!" button never runs away.',
    fromKids: true,
    playHref: '/tickets',
    playLabel: 'Go pop in an idea',
    changes: [
      { emoji: '📏', text: 'The Story Oven box can never be taller than your screen.' },
      { emoji: '👆', text: 'The game list scrolls, so you can reach every single game.' },
      { emoji: '🔥', text: '"Into the oven!" and "Cancel" stay put at the bottom where you can tap them.' },
    ],
  },
  {
    id: 'sandcastle-guide-line-stays-2026-08',
    dateLabel: 'August 2026',
    emoji: '🏖️',
    area: 'Sandcastle Siege',
    headline: 'The aiming line stopped vanishing!',
    blurb:
      'You spotted that the dotted line showing where your shot will go sometimes just disappeared while you were aiming. It turned out the game was hiding it on purpose by mistake — it thought the line had wandered off the screen, when really it was right in front of you. Now it stays visible the whole time you aim, no matter which way you swing the cannon.',
    fromKids: true,
    playHref: '/games/sandcastle-siege',
    playLabel: 'Go knock down a castle',
    changes: [
      { emoji: '➰', text: 'The aiming line stays on screen for every angle.' },
      { emoji: '🎯', text: 'No more guessing where your water balloon will land.' },
    ],
  },
  {
    id: 'land-structures-rebuilt-2026-08',
    dateLabel: 'August 2026',
    emoji: '🏰',
    area: 'Your Land',
    headline: 'Your cottage, tower and castle got rebuilt!',
    blurb:
      'The buildings on your land used to be drawn by code, one block at a time. Now they are real sculpted models — so the cottage is cozier, the tower is taller and stripier, and the castle has four corner spires, a wall all the way around, and a flag right at the very top.',
    playHref: '/town',
    playLabel: 'Go see your land',
    changes: [
      { emoji: '🏡', text: 'Cottage: a squat candy house with a cherry on the roof.' },
      { emoji: '🗼', text: 'Tower: taller, with candy-cane stripes and a pennant on top.' },
      { emoji: '🏰', text: 'Castle: four spires, a wall all the way around, and a flag.' },
    ],
  },
  {
    id: 'soccer-field-back-on-land-2026-08',
    dateLabel: 'August 2026',
    emoji: '⚽',
    area: 'Gamecakes City',
    headline: 'The soccer field came back out of the sea!',
    blurb:
      'You were right — the soccer field really was floating in the water. It had been slowly drifting out to sea every time Chess Island got bigger, and nobody noticed until you told us. It is back on the grass now, right next to Town Square, and it cannot wander off again.',
    fromKids: true,
    playHref: '/town',
    playLabel: 'Go play soccer',
    changes: [
      { emoji: '⚽', text: 'The soccer field is on dry grass beside Town Square.' },
      { emoji: '🏃', text: 'You can run onto every corner of it now instead of swimming.' },
      { emoji: '🔒', text: 'We added a check so it can never float away again.' },
    ],
  },
  {
    id: 'checkers-west-wing-2026-08',
    dateLabel: 'August 2026',
    emoji: '🔴',
    area: 'Chess Island',
    headline: 'Checkers got its own end of the island!',
    blurb:
      'Cakey Checkers used to share the plaza with the chess booths. Now it has its own place: walk WEST from the king statue and there is a giant checkers board laid into the grass, with twenty-four big checkers standing on it and the Cakey Checkers booth right beside it. Chess keeps the east side. The king in the middle belongs to both.',
    playHref: '/games/cakey-checkers',
    playLabel: 'Play Cakey Checkers',
    changes: [
      { emoji: '🔴', text: 'A giant walk-on checkers board on the west side of Chess Island.' },
      { emoji: '👟', text: 'Run into the checkers and they skate across the board.' },
      { emoji: '🏠', text: 'Leave them a while and they slide back home by themselves.' },
      { emoji: '♟️', text: 'The chess board and its booths have not moved a bit.' },
    ],
  },
  {
    id: 'town-flicker-and-bubble-2026-08',
    dateLabel: 'August 2026',
    emoji: '✨',
    area: 'Gamecakes City',
    headline: 'The town stopped shimmering!',
    blurb:
      'When you rode a car or the Sugar Express, the bridge and the soccer field used to shimmer and flicker as you went past. They sit right on the ground, and the town could not decide which one to draw on top. Now it always knows. Cakey also keeps his speech bubble on his head while you zoom around, instead of leaving it behind.',
    playHref: '/town',
    playLabel: 'Go for a ride',
    changes: [
      { emoji: '🌉', text: 'The bridge stays still when you drive or ride over it.' },
      { emoji: '⚽', text: 'The soccer field stopped flickering too.' },
      { emoji: '💬', text: 'Cakey’s speech bubble sticks with him, even at top speed.' },
    ],
  },
  {
    id: 'cakey-lightning-quiz-2026-07',
    dateLabel: 'July 2026',
    emoji: '⚡',
    area: 'Cakey',
    headline: 'Cakey can find your just-right level!',
    blurb:
      'Tap Cakey in town and pick Quiz me. He has ten quick sprinkles for you: five math questions and five word questions. Your answers help Gamecakes choose a level that is challenging without being a cake avalanche.',
    playHref: '/town',
    playLabel: 'Quiz me',
    changes: [
      { emoji: '➕', text: 'Five math questions matched to the level you are working on.' },
      { emoji: '📚', text: 'Five word questions, from sounds and spelling to story sense.' },
      { emoji: '⚡', text: 'The whole lightning round is only ten questions.' },
      { emoji: '🎯', text: 'Once a week, Cakey can tune your game levels up or down by one.' },
    ],
  },
  {
    id: 'race-island-booths-free-2026-07',
    dateLabel: 'July 2026',
    emoji: '🏁',
    area: 'Race Island',
    headline: 'Race Island games are free — and you got your tokens back!',
    blurb:
      'Race Island was charging you twice. Once to get to the island, and then AGAIN at each booth once you were standing right in front of it. That was a mistake. When you buy an island, you buy everything on it — so Cakey Racer and Cakey Pit Stop are free now, and we put the Sugar Tokens you already spent on them straight back in your pocket.',
    playHref: '/games/cakey-racer',
    playLabel: 'Play Cakey Racer',
    changes: [
      { emoji: '🏎️', text: 'Cakey Racer is free now — no more paying at the door.' },
      { emoji: '🔧', text: 'Cakey Pit Stop is free now too.' },
      { emoji: '🪙', text: 'You got every token back that you spent on those two games.' },
      { emoji: '🏝️', text: 'One island, one price — buying an island opens every game on it, just like Chess Island.' },
    ],
  },
  {
    id: 'cakey-checkers-2026-07',
    dateLabel: 'July 2026',
    emoji: '🔴',
    area: 'Chess Island',
    headline: 'Checkers came to Chess Island — in proper 3D!',
    blurb:
      'There is a third booth on Chess Island now, and it is not chess. Cakey Checkers is a real 3D board you look into, on a cake stand, with cookies for pieces. Pick which pieces you want to play with, pick which side you are, and pick which Cakey you want to beat.',
    playHref: '/games/cakey-checkers',
    playLabel: 'Play Cakey Checkers',
    changes: [
      { emoji: '🍪', text: 'New game: Cakey Checkers — a whole game of checkers in 3D.' },
      { emoji: '🎨', text: 'Five sets of pieces to choose from: sandwich cookies, layer cakes, chip cookies, macarons and doughnuts.' },
      { emoji: '⚫', text: 'Pick chocolate or cream. Your pieces are always at the bottom of the screen.' },
      { emoji: '🧁', text: 'The same five Cakeys from Chess Challenge, playing checkers instead.' },
      { emoji: '👑', text: 'Get a piece all the way across and it gets a real gold crown.' },
      { emoji: '🐰', text: 'If you can hop, you have to hop — but the board lights up the hop first, so you always know.' },
    ],
  },
  {
    id: 'sugar-express-loop-2026-07',
    dateLabel: 'July 2026',
    emoji: '🚂',
    area: 'Gamecakes City',
    headline: 'The Sugar Express never stops now!',
    blurb:
      'The candy train used to stop and wait at five little stations. Now it just keeps going, round and round, all day. It also takes a much bigger loop — right along the beach around the outside of town, instead of chugging straight through the middle of everyone’s land.',
    playHref: '/town',
    playLabel: 'Go ride the train',
    changes: [
      { emoji: '🚂', text: 'No more stops — the train loops around and around without stopping.' },
      { emoji: '🏖️', text: 'The track moved out to the beach, all the way around the edge of town.' },
      { emoji: '🏡', text: 'It used to drive right through five lands. Now it goes around them.' },
      { emoji: '🎫', text: 'Stand anywhere next to the track and wave it down — you don’t need a station.' },
    ],
  },
  {
    id: 'pit-stop-2026-07',
    dateLabel: 'July 2026',
    emoji: '🔧',
    area: 'Cakey Pit Stop',
    headline: 'A brand-new game: Cakey Pit Stop!',
    blurb:
      'A race car screeches into your pit box and the clock starts. Four jobs, in order: jack it up, swap the front tyre, swap the rear tyre, fill it with syrup. Every job asks you a question — answer it and the job gets done. Can you send the car back out fast?',
    playHref: '/games/pit-stop',
    playLabel: 'Play Cakey Pit Stop',
    changes: [
      { emoji: '🏎️', text: 'Find it on Race Island, over at Pit Row.' },
      { emoji: '🔧', text: 'Four jobs per stop: jack, front tyre, rear tyre, syrup.' },
      { emoji: '⏱️', text: 'Get one wrong and the job still gets done — but it costs you time.' },
      { emoji: '🪙', text: 'Costs 25 Sugar Tokens to open the first time.' },
    ],
  },
  {
    // Keeps master's id: this entry shipped to production ahead of this branch
    // and /whats-new#<id> is a real anchor. Merged with the branch's own
    // 'chess-island-bigger' entry, which described the same shipment — two
    // near-identical cards would have told kids about one island twice.
    id: 'chess-island-challenge-2026-07',
    dateLabel: 'July 2026',
    emoji: '♞',
    area: 'Chess Island',
    headline: 'Chess Island got much bigger — and someone to play!',
    blurb:
      'Chess Island grew and grew. The giant chess board moved out to its own arena, so you can stroll right across the squares without bumping into anything, and a new booth opened where you can play a whole game of chess against a Cakey. The board used to flicker and overlap in a funny way too — that’s all fixed.',
    playHref: '/games/chess-challenge',
    playLabel: 'Play Chess Challenge',
    changes: [
      { emoji: '🏝️', text: 'The whole island is much bigger, with room for two game booths.' },
      { emoji: '♞', text: 'New game: Chess Challenge — play a whole game against a Cakey.' },
      { emoji: '🧁', text: 'Five opponents, from Crumb (easiest) up to Chef Gâteau (champion).' },
      { emoji: '↩︎', text: 'One take-back and one hint per game, so you can try things out.' },
      { emoji: '👣', text: 'The walk-on board got bigger and moved to its own arena.' },
      { emoji: '🔧', text: 'Fixed: the board used to flicker and overlap itself.' },
      { emoji: '⛴️', text: 'Catch the Cakey Ferry at the glowing dock to sail there.' },
    ],
  },
  {
    id: 'cakey-rent-anywhere-2026-07',
    dateLabel: 'July 2026',
    emoji: '🚙',
    area: 'Cakey',
    headline: 'Rent a ride from Cakey, wherever he is!',
    blurb:
      'Before, the only place to rent a skateboard or a jeep was the garage back in Town Square. That was a long walk if you were way out at the far end of the island. Now you can just tap Cakey wherever you bump into him and rent a ride on the spot.',
    playHref: '/town',
    playLabel: 'Go find Cakey',
    changes: [
      { emoji: '🚙', text: 'Tap Cakey anywhere and pick “Rent me a ride”.' },
      { emoji: '🛹', text: 'Same rides and same prices as the garage — just closer to you.' },
      { emoji: '🌉', text: 'Really handy for Race Island, which you can’t reach on foot.' },
    ],
  },
  {
    id: 'race-island-is-the-track-2026-07',
    dateLabel: 'July 2026',
    emoji: '🏁',
    area: 'Race Island',
    headline: 'The whole island turned into the racetrack!',
    blurb:
      'Race Island used to be mostly empty grass with a track squeezed into the middle. Now the racetrack loops all the way around the island itself, so Pit Row and Victory Lane are the two ends of one big circuit.',
    playHref: '/town',
    playLabel: 'Visit Race Island',
    changes: [
      { emoji: '🏁', text: 'The track now runs right around the whole island.' },
      { emoji: '🏎️', text: 'Pit Row and Victory Lane are the two ends of the same circuit.' },
      { emoji: '🌉', text: 'The bridge lands you neatly on a proper start line.' },
      { emoji: '🌴', text: 'Tidied up the scenery that was accidentally floating out at sea.' },
    ],
  },
  {
    id: 'cakey-tower-2026-07',
    dateLabel: 'July 2026',
    emoji: '🍡',
    area: 'Cakey Tower',
    headline: 'A brand-new game: Cakey Tower!',
    blurb:
      'A wobbly tower of candy sits on a cake stand. Answer a question to earn a BITE, then tap a candy to pull it out — and watch the whole tower shift and settle. Eat all the good ones to win, but don’t let the gummy creatures tumble off the plate!',
    playHref: '/games/cakey-tower',
    playLabel: 'Play Cakey Tower',
    changes: [
      { emoji: '🍬', text: 'Answer a question to earn a bite, then tap a candy to eat it.' },
      { emoji: '🍒', text: 'Mint petit fours are the good ones — eat them all to win.' },
      { emoji: '🐻', text: 'Don’t let the strawberry gummy creatures fall off the plate!' },
      { emoji: '🍫', text: 'Chocolate brittle can’t be moved — it’s holding things up.' },
      { emoji: '🟣', text: 'Purple gobstoppers are a mystery: tap one and find out.' },
    ],
  },
  {
    id: 'cakey-racer-2026-07',
    dateLabel: 'July 2026',
    emoji: '🏎️',
    area: 'Cakey Racer',
    headline: 'A brand-new game: Cakey Racer!',
    blurb:
      'A proper lap racer out on Race Island’s Victory Lane. Drive the candy car around the circuit and answer questions to keep your speed up. The steering used to be mirrored and the road went invisible sometimes — both fixed!',
    playHref: '/games/cakey-racer',
    playLabel: 'Play Cakey Racer',
    changes: [
      { emoji: '🏎️', text: 'Race real laps around Victory Lane on Race Island.' },
      { emoji: '🕹️', text: 'Fixed: steering used to go the wrong way when you turned.' },
      { emoji: '🛣️', text: 'Fixed: the road sometimes vanished, and the speedo was hidden.' },
      { emoji: '🪙', text: 'Costs 25 Sugar Tokens to open the first time.' },
    ],
  },
  {
    id: 'land-building-2026-07',
    dateLabel: 'July 2026',
    emoji: '🏠',
    area: 'My Land',
    headline: 'You can build on your own land now!',
    blurb:
      'Your land can grow from a plain plot into a cottage, then a tower, then a whole castle. If you tried to build before and it would not let you — that was our fault, and it is fixed now. Go build!',
    playHref: '/town',
    playLabel: 'Go build',
    changes: [
      { emoji: '🏠', text: 'Grow your land: Plot → Cottage → Tower → Castle.' },
      { emoji: '🪙', text: 'A cottage costs 15 Sugar Tokens, a tower 40, a castle 90.' },
      { emoji: '🏡', text: 'Every stage makes your land bigger and grander in town.' },
      { emoji: '✨', text: 'Tap your own land in town, then pick “Grow my land”.' },
    ],
  },
  {
    id: 'race-island-2026-07',
    dateLabel: 'July 2026',
    emoji: '🏁',
    area: 'Gamecakes City',
    headline: 'A race island opened out at sea!',
    blurb:
      'There is a brand-new island south of town with a giant race track on it. A long candy bridge runs all the way out there — but it is a road, not a path, so you cannot walk across. Ride over on wheels, or catch the bus!',
    playHref: '/town',
    playLabel: 'Visit the town',
    changes: [
      { emoji: '🏝️', text: 'A new race island appeared out at sea, south of town.' },
      { emoji: '🌉', text: 'A long bridge goes there — but only wheels are allowed on it.' },
      { emoji: '🚌', text: 'No skateboard or jeep? Ride the bus. It waits at the bridge.' },
      { emoji: '🪙', text: 'Getting there costs Sugar Tokens the first time. After that, rides are free.' },
      { emoji: '🏁', text: 'Pit Row has the race track. Victory Lane has the golden cup.' },
      { emoji: '✨', text: 'Tap the “See what happened” story card to watch it arrive.' },
    ],
  },
  {
    id: 'chess-club-island-2026-07',
    dateLabel: 'July 2026',
    emoji: '♟️',
    area: 'Gamecakes City',
    headline: 'Chess Club sailed to its own island!',
    blurb:
      'The whole Chess Club floated up to the quiet top corner of the island, so now it has room for bigger games. Look for its Story Alert in town to watch what happened!',
    playHref: '/town',
    playLabel: 'Visit the town',
    changes: [
      { emoji: '🏝️', text: 'Chess Club moved to its own island in the top-left corner.' },
      // Was "Reach it by walking up past the kid land" — true when this entry
      // was written, but Chess became a real moated island and the walk-up was
      // closed server-side. Telling a kid to walk somewhere they cannot walk is
      // the kind of small lie that makes them think the game is broken.
      { emoji: '⛴️', text: 'Catch the Cakey Ferry at the glowing dock to sail there.' },
      { emoji: '♟️', text: 'More room means room for bigger, cooler chess games.' },
      { emoji: '✨', text: 'Tap the “See what happened” story card to watch it arrive.' },
    ],
  },
  {
    id: 'cakey-dad-jokes-2026-07',
    dateLabel: 'July 2026',
    emoji: '🤪',
    area: 'Cakey',
    headline: 'Cakey tells dad jokes now!',
    blurb:
      'Find Cakey wandering the town and tap him — there’s a brand-new thing to do. Ask for a dad joke and get ready to groan (in a good way).',
    playHref: '/town',
    playLabel: 'Go find Cakey',
    changes: [
      { emoji: '🤪', text: 'Tap Cakey and pick “Tell me a dad joke.”' },
      { emoji: '🥁', text: 'He gives you the setup first — tap “…go on” to hear the punchline.' },
      { emoji: '😂', text: 'Loved it? Hit “Another one!” for joke after joke after joke.' },
      { emoji: '🍰', text: 'They’re super cheesy… er, extra cakey. You’ve been warned.' },
    ],
  },
  {
    id: 'castle-crumble-cannon-ship-2026-07',
    dateLabel: 'July 2026',
    emoji: '🏰',
    area: 'Castle Crumble',
    headline: 'Fire from a candy ship!',
    blurb:
      'Castle Crumble got a big glow-up. Your cannon now rides a candy ship in a syrup pool, lobbing shots across the water at a giant chocolate castle.',
    playHref: '/games/castle-crumble',
    playLabel: 'Play Castle Crumble',
    changes: [
      { emoji: '🚢', text: 'Your cannon rides a candy ship floating in a blue-raspberry pool.' },
      { emoji: '🎯', text: 'Aim with the thumb stick and lob shots at the giant castle across the water.' },
      { emoji: '🧱', text: 'Each hit knocks out just that spot — no more whole castle toppling at once.' },
      { emoji: '🍒', text: 'Pick the gobstopper for a precise shot or the cherry bomb for a bigger boom.' },
    ],
  },
  {
    id: 'marble-more-mazes-2026-07',
    dateLabel: 'July 2026',
    emoji: '🎱',
    area: 'Marble Math',
    headline: 'So many more mazes!',
    blurb:
      'Before, when you rolled the marble to the flag the round was over. Now the fun keeps going — clear a maze and a brand-new one pops right up!',
    fromKids: true,
    playHref: '/games/marble-maze',
    playLabel: 'Play Marble Math',
    changes: [
      { emoji: '🏁', text: 'Reach the flag and a fresh maze appears — no more “just one and done.”' },
      { emoji: '🧩', text: 'A new counter shows how many mazes you’ve cleared this round.' },
      { emoji: '⏱️', text: 'Your timer and hearts keep going, so race to solve as many as you can!' },
      { emoji: '🔀', text: 'Every new maze is a little different, so it never feels the same twice.' },
    ],
  },
  {
    id: 'town-upgrades-2026-07',
    dateLabel: 'July 2026',
    emoji: '🏙️',
    area: 'Gamecakes City',
    headline: 'A bigger, bouncier town!',
    blurb:
      'The town got a huge makeover with brand-new things to play with all over the map. Go take a walk and try them out!',
    fromKids: true,
    playHref: '/town',
    playLabel: 'Explore the town',
    changes: [
      { emoji: '🤸', text: 'Trampolines everywhere! Bounce on the pads scattered all around town.' },
      { emoji: '⛰️', text: 'The land has rolling hills now instead of being flat.' },
      { emoji: '⚽', text: 'A brand-new soccer field — kick the ball into the goal to score!' },
      { emoji: '🏀', text: 'The beach balls (and the soccer ball) bounce and roll for real now.' },
    ],
  },
];
