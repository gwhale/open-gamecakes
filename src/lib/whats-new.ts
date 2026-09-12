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
    id: 'cakey-road-moves-to-race-island-2026-09',
    dateLabel: 'September 2026',
    emoji: '🏁',
    area: 'Race Island',
    headline: 'Cakey Road moved to the car island, where it belongs.',
    blurb:
      'Cakey Road was sitting in Caramel Cove, which made sense back when the cove was a straight bit of beach. Then the cove got carved into a real bay with a submarine parked in it, and a game about hopping across busy traffic looked very odd next to a jetty. So it has moved to Pit Row on Race Island — tyre stacks, toolboxes, engines revving — which is where a road full of moving cars actually belongs.',
    fromKids: true,
    playHref: '/games/cakey-road',
    playLabel: 'Play Cakey Road',
    changes: [
      { emoji: '🏁', text: 'Cakey Road is on Race Island now, at Pit Row, right where the bridge lands. Pit Stop is still there too.' },
      { emoji: '⚓', text: 'Caramel Cove has no game booth at all any more. It is the harbour: the pier, the submarine, and the way down.' },
      { emoji: '🧱', text: 'Cakey Stacks has a new icon. It is a stack now, because that is what the game is.' },
    ],
  },
  {
    id: 'cakey-knows-what-he-found-2026-09',
    dateLabel: 'September 2026',
    emoji: '🧁',
    area: 'The Sunken Batterlands',
    headline: 'Cakey has something to say about every single thing you find.',
    blurb:
      'Until now, opening any chest except the whisk one got the same few lines out of Cakey, so the ninth chest sounded exactly like the second. Now he actually looks at what you pulled out. He is delighted about the sprinkles. He is suspicious of the flour. He has genuinely no idea why there is an oven mitt at the bottom of the sea, and he says so.',
    playHref: '/town/deep',
    playLabel: 'Go diving',
    changes: [
      { emoji: '💬', text: 'All ten items have their own lines. Open a chest and he talks about THAT thing, not about boxes in general.' },
      { emoji: '🤷', text: 'He still does not know what any of it is for. Neither do you. That bit is on purpose.' },
      { emoji: '🥚', text: 'Some of them are worth finding twice just to hear what he says.' },
    ],
  },
  {
    id: 'chest-gate-2026-09',
    dateLabel: 'September 2026',
    emoji: '🔐',
    area: 'The Sunken Batterlands',
    headline: 'The treasure chests are locked now. Three questions opens one.',
    blurb:
      'Up to now a chest opened the moment you tapped it, which was nice for about a minute. Now every chest is locked, and it asks you three questions to let you in. They are not random questions: Cakey picks the thing YOU have been meaning to practise, and asks about that one thing three times. Get three right and the lid swings open.',
    playHref: '/town/deep',
    playLabel: 'Go diving',
    changes: [
      { emoji: '3️⃣', text: 'Three correct answers opens a chest. Three dots at the top fill in as you get them.' },
      { emoji: '💚', text: 'You CANNOT lose. A wrong answer does not take a dot away and does not take the chest away — it just asks you a different one. Keep going until you have three.' },
      { emoji: '🎯', text: 'The questions are picked for you. If you have not done take-aways in a while, the chest will ask you about take-aways.' },
      { emoji: '🏊', text: 'You can swim away in the middle and come back later. The chest will still be there, still shut.' },
      { emoji: '📈', text: 'The questions count as practice, the same as playing a game does. Answering them helps you level up that skill.' },
    ],
  },
  {
    id: 'deep-water-surface-2026-09',
    dateLabel: 'September 2026',
    emoji: '🌊',
    area: 'The Sunken Batterlands',
    headline: 'The sea looks like water now — especially when you come back up.',
    blurb:
      'If you drove Sub-Cake One all the way back to the top, something strange happened: the sea vanished. You popped out and there was nothing there. That was a real bug — the water was only ever drawn from underneath, so the moment the camera came up out of it there was nothing left to draw. Now there is a proper surface with ripples moving across it, and underneath it there is that net of wobbling light you get in a swimming pool on a sunny day.',
    playHref: '/town/deep',
    playLabel: 'Go diving',
    changes: [
      { emoji: '✨', text: 'Look UP near the reef and you will see light moving across the ceiling of the water, like the bottom of a swimming pool.' },
      { emoji: '🚀', text: 'Surfacing works. Come all the way up and there is a real sea around you with a horizon, instead of empty blue.' },
      { emoji: '🌊', text: 'The water rolls gently. There is a slow swell, and a bright patch where the sun is that moves as you drive.' },
      { emoji: '🕳️', text: 'The deeper you go the more the surface fades away behind you, so the dark part of the ocean does not have a lid on it.' },
    ],
  },
  {
    id: 'deep-bigger-and-better-seated-2026-09',
    dateLabel: 'September 2026',
    emoji: '🤿',
    area: 'The Sunken Batterlands',
    headline: 'The ocean got bigger, and the treasure sits flat now.',
    blurb:
      'We went down to look at the ten treasure chests properly, and found two things. The sea was a bit small once you had a submarine, and the chests were not really sitting on the sand — on a slope, one corner sank into the seabed and the opposite corner hung in the water. Both are fixed. The ocean is wider, you can dive deeper than before, and every chest now lies along the ground the way a heavy box actually would.',
    playHref: '/town/deep',
    playLabel: 'Go diving',
    changes: [
      { emoji: '🌊', text: 'The ocean is WIDER. There is more water in every direction, so a sonar ping covers less of it and finding a chest is more of a hunt.' },
      { emoji: '⬇️', text: 'Sub-Cake One can now go down to 370 metres instead of 320. The canyon starts higher up too, so there is more dark water to explore at the bottom.' },
      { emoji: '🎁', text: 'Treasure chests lie FLAT on the seabed now, tilted to match the slope they are on. Before, the ones on steep ground were half-buried — one was sunk over two metres into the sand.' },
      { emoji: '✨', text: 'The glowing lights at the very bottom moved deeper, so they stay properly out of reach. For a while they were close enough to almost touch, which spoiled the point of them.' },
      { emoji: '🗺️', text: 'Some chests moved to new spots. If you had already opened one it stays opened — the ocean has not forgotten anything you found.' },
    ],
  },
  {
    id: 'cakey-tower-rules-2026-09',
    dateLabel: 'September 2026',
    emoji: '🍡',
    area: 'Cakey Tower',
    headline: 'Cakey Tower’s rules make sense now.',
    blurb:
      'Someone said the rules of Cakey Tower made no sense, and they were right. A few of them were actually broken, not just badly explained — a mint that fell off the plate could make the tower impossible to finish, and a lucky gobstopper gave you MORE to do. Here is how it works now, in one breath: answer a question to earn a bite, tap a mint to eat it, eat every mint to win, and don’t let a gummy fall off the plate or you lose a heart.',
    playHref: '/games/cakey-tower',
    playLabel: 'Play Cakey Tower',
    changes: [
      { emoji: '🔤', text: 'The numbers at the top say what they are now: Bites, Lives, Mints left.' },
      { emoji: '💬', text: 'When a gummy falls off the plate, the game TELLS you — “A gummy fell off the plate! −1 ❤️” — instead of a heart just quietly disappearing.' },
      { emoji: '💨', text: 'A mint that gets knocked off the plate tumbles away. You don’t lose a heart, and you don’t need it to win any more.' },
      { emoji: '🟣', text: 'A gobstopper is either a mint you eat on the spot (lucky!) or a gummy you have to keep on the plate. It never gives you extra mints to find.' },
      { emoji: '🍫', text: 'Chocolate brittle can’t be eaten, but it can fall now. It used to float in the air once you ate everything under it.' },
      { emoji: '↺', text: 'The spin-the-camera buttons moved to the bottom corners, so tapping a candy near the edge eats it instead of turning the tower.' },
      { emoji: '💔', text: 'The “out of lives” screen counts the candies you actually ate. It used to count all of them.' },
    ],
  },
  {
    id: 'caramel-cove-harbour-2026-09',
    dateLabel: 'September 2026',
    emoji: '⚓',
    area: 'Caramel Cove',
    headline: 'Caramel Cove is a real cove now, and the submarine is floating in it.',
    blurb:
      'Caramel Cove used to be a straight bit of beach with a jetty lying along it, and if you walked out to the end of that jetty you found Sub-Cake One sitting on the SAND. Which is not where a submarine goes. So we cut a proper bay into the island — water with land curving round both sides of it — and moved the jetty to the back of the bay so it points straight out of the mouth. The submarine is tied up at the far end of it, in actual water.',
    playHref: '/town',
    playLabel: 'Go and look at it',
    changes: [
      { emoji: '🏖️', text: 'The coast at Caramel Cove bends INWARDS now, with a point of land sticking out on each side of the bay. You can see the shape of it from up by the arch.' },
      { emoji: '🛶', text: 'The jetty starts at the back of the bay and runs out of the mouth. It is narrower than the big pier at Sprinkle Shore — this one is for one submarine, not a row of shops.' },
      { emoji: '🤿', text: 'Sub-Cake One is bigger, it sits UP on the water instead of half under it, and it has mint fins on the back like the one you actually drive. There is a little blue flag on top so you can spot it from the top of the cove.' },
      { emoji: '🔵', text: 'The DIVE button turns up much earlier now. You used to have to be standing on the last two planks before it noticed you.' },
      { emoji: '⚓', text: 'You still need Caramel Cove unlocked to get out there. No cove, no jetty, no submarine.' },
    ],
  },
  {
    id: 'word-puzzles-2026-09',
    dateLabel: 'September 2026',
    emoji: '🔍',
    area: 'Puzzle Island',
    headline: 'Two word games on Puzzle Island — and they know your spelling list.',
    blurb:
      'The first two booths on Puzzle Island are open, and both are about words. If a grown-up has typed in your spelling words or sight words on the parent page, BOTH games use those words — the ones on Friday’s test, not just any words. If nobody has added a list yet, they use the Gamecakes words for your level instead, and the game tells you which one it is doing.',
    playHref: '/town',
    playLabel: 'Take the blue boat',
    changes: [
      { emoji: '🔍', text: 'SPRINKLE SEARCH is a word search. Drag across a word to find it, or tap its first letter and then its last. Little grids with words going across and down to start; big grids with backwards and diagonal words when you are ready.' },
      { emoji: '🎧', text: 'CAKEY SAYS is a listening game. Cakey says a word out loud and you spell it, one letter at a time. You never see the word until you have spelled it — so listen! Tap 🔊 to hear it again as many times as you like.' },
      { emoji: '🕯️', text: 'Every wrong letter blows out one candle on Cakey’s cake. When they are all out, you get to see the word and hear it once more, then it is on to the next one. Nobody gets in trouble for a wrong letter.' },
      { emoji: '📝', text: 'Both games say "From your word list" at the top when they are using yours. If your list has words too long for a small grid, Sprinkle Search uses the library for that level and tells you before you press play — pick a higher level for a bigger grid that fits them.' },
    ],
  },
  {
    id: 'cake-shift-2026-09',
    dateLabel: 'September 2026',
    emoji: '🗼',
    area: 'Puzzle Island',
    headline: 'Cake Shift: the party cake is on the wrong stand.',
    blurb:
      'A new booth on Puzzle Island. Three cake stands, one cake, and one rule: move the whole cake to the last stand, one layer at a time, and never put a big layer on a little one. Try it — it bumps. No maths questions, no word questions, just thinking.',
    playHref: '/games/hanoi',
    playLabel: 'Move the cake',
    changes: [
      { emoji: '🗼', text: 'Tap a stand to pick up its top layer, then tap another stand to set it down. Or drag it across.' },
      { emoji: '🕯️', text: 'The candles light up on the stands where your layer is allowed to go.' },
      { emoji: '🍰', text: 'Big layers are dark and little layers are light — heavy things go underneath.' },
      { emoji: '💡', text: 'Stuck? Three hints per cake. A ghost layer shows you the next move.' },
      { emoji: '🎂', text: 'Beat "Best" (the fewest moves possible) and your next cake gets one layer taller. Up to eight!' },
    ],
  },
  {
    id: 'waffle-sudoku-2026-09',
    dateLabel: 'September 2026',
    emoji: '🧇',
    area: 'Puzzle Island',
    headline: 'The first puzzle booth is open: Waffle Sudoku.',
    blurb:
      'Take the blue boat to Puzzle Island and there is a waffle iron waiting on the counter. Every waffle has some numbers baked in and some squares missing. Your job is to fill the squares so every row, every column and every box has each number exactly once. No maths questions, no words — just looking and thinking. It starts with a tiny 4×4 waffle and gets bigger and emptier as you solve them.',
    playHref: '/games/sudoku',
    playLabel: 'Bake a waffle',
    changes: [
      { emoji: '🧇', text: 'Little waffles first: 4×4, then 6×6, then the big 9×9. You pick where to start, and every clean solve makes the next one a bit trickier.' },
      { emoji: '⏱️', text: 'There is NO clock. Take as long as you like.' },
      { emoji: '🍪', text: 'A wrong number never stays on the board. It wobbles, crumbles and disappears, and you try again.' },
      { emoji: '💡', text: 'Stuck? The Hint button butters one square for you. It counts the same as a slip, so save it for when you really need it.' },
      { emoji: '✏️', text: 'On the big waffle you can pencil in little notes in a square while you work it out.' },
      { emoji: '✨', text: 'Each box lights up mint when you finish it, so a 9×9 has nine little wins inside it.' },
    ],
  },
  {
    id: 'puzzle-island-2026-09',
    dateLabel: 'September 2026',
    emoji: '🧩',
    area: 'Puzzle Island',
    headline: 'A new island out past the castle, and a second ferry to reach it.',
    blurb:
      'Walk to the north-east shore and you will find a new glowing dock with a blue-sailed boat tied up at it. It is a second Cakey Ferry, and it sails to Puzzle Island. The island is for games you win by thinking — no maths questions, no word questions, just puzzles. It is quiet out there right now. The first puzzle booths are being built.',
    playHref: '/town',
    playLabel: 'Go find the blue boat',
    changes: [
      { emoji: '⛴️', text: 'There are TWO ferries now. The purple one still goes to Chess Island. The blue one goes to Puzzle Island.' },
      { emoji: '🗺️', text: 'The little map shows both boat routes, each in its own colour.' },
      { emoji: '🪙', text: 'Puzzle Island costs the same as Chess Island: 1 Sugar Token for the ride plus the island, once. Every trip after that is free, and the trip home is always free.' },
      { emoji: '🧩', text: 'Nothing to play there yet. Sudoku is coming first, then a tower puzzle made of cake.' },
    ],
  },
  {
    id: 'deep-fauna-2026-09',
    dateLabel: 'September 2026',
    emoji: '🐟',
    area: 'The Sunken Batterlands',
    headline: 'The ocean was empty. Now there are fish in it.',
    blurb:
      'Somebody dived all the way to the bottom, came back up and said "where are all the fish", which was fair, because there were none. There are now. Five different animals live down there, and they do not all live in the same place — some are up in the bright water by the coral and some are down where it goes dark, so the only way to meet a new one is to go to where it lives. The plain blue bit in the middle of the dive is a KELP FOREST now.',
    playHref: '/town/deep',
    playLabel: 'Go and look',
    changes: [
      { emoji: '🐠', text: 'SPRINKLEFISH live up on the reef near the top. They are never on their own — they go about in a crowd, and when one of them turns they ALL turn at the same time.' },
      { emoji: '🪨', text: 'A CRUMBLER sits on the reef floor pretending to be a rock. You will never spot one looking straight ahead. You have to point the sub down and actually look.' },
      { emoji: '🥞', text: 'MANTA PANCAKES glide across the shelf. They are the first big thing you meet, and they are completely uninterested in you.' },
      { emoji: '🍩', text: 'JELLY DONUTS drift down out of the kelp into the dark — and they GLOW. They are the first thing you see making its own light down there.' },
      { emoji: '🐍', text: 'WHISKER EELS live below where your headlights stop helping. Some of them are deeper than 370 metres, which is as far as Sub-Cake One goes — so you can see one and never get to it.' },
      { emoji: '🌿', text: 'The KELP FOREST grows right round the edge of the shelf, so now you sink down THROUGH it instead of past nothing. It sways.' },
      { emoji: '🔦', text: 'Nothing has its name floating over it and there is no list to tick off. If you want to know what something is, get close and look at it.' },
    ],
  },
  {
    id: 'sunken-batterlands-2026-09',
    dateLabel: 'September 2026',
    emoji: '🤿',
    area: 'The Sunken Batterlands',
    headline: 'There is a submarine in Caramel Cove. It goes UNDER the island.',
    blurb:
      'Walk out along the jetty at Caramel Cove and you will find a little submarine tied up there. It is called Sub-Cake One. Get in and you can dive down under Gamecakes Island into a whole ocean nobody has been to yet. Near the top it is bright and sandy and full of coloured coral. Keep going and the floor drops away, the blue gets darker, and your headlights come on by themselves.',
    playHref: '/town',
    playLabel: 'Go find the submarine',
    changes: [
      { emoji: '🕹️', text: 'Drive with the round pad on the left. Push it forward to go, tilt it to steer. Up and down are the big arrows on the right.' },
      { emoji: '📡', text: 'SONAR is the big one. Press it and a ring spreads out around you. If it touches something it tells you HOW FAR and WHICH WAY TO STEER — like "163m, ahead and a bit to your left" — and then it forgets.' },
      { emoji: '🗺️', text: 'There is no map, and nothing has an arrow floating over it. That is on purpose. Sonar gives you a direction and finding it is your job.' },
      { emoji: '🔍', text: 'Something is down there in the reef. We are not telling you what it is. Ping around until you get an echo, then go and look.' },
      { emoji: '🧁', text: 'Cakey rides along inside the submarine and talks to you. He has never been in the sea before and he has opinions about it.' },
      { emoji: '🛑', text: 'You cannot reach the bottom yet. Sub-Cake One stops at 370 metres and says no — and there is something glowing below that, where you are not allowed. Yet.' },
      { emoji: '🌊', text: 'It is the SAME ocean for both of you. Same reef, same canyon, same everything in the same places — so you can tell each other where to go.' },
      { emoji: '⚓', text: 'You need Caramel Cove unlocked to reach the jetty. No cove, no submarine.' },
      { emoji: '💾', text: 'The ocean remembers you now. It keeps the deepest you have ever been and everything you have found, and if you surface and come straight back it drops you where you left off instead of all the way up at the reef.' },
    ],
  },
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
      { emoji: '🍬', text: 'Answer a question to earn a bite, then tap a mint candy to eat it.' },
      { emoji: '🍒', text: 'Mint petit fours (the ones with a cherry on top) are the good ones — eat them all to win.' },
      { emoji: '🐻', text: 'Don’t let the strawberry gummy creatures fall off the plate! Each one that falls costs a heart.' },
      { emoji: '🍫', text: 'Chocolate brittle can’t be eaten — but it’s heavy, so it CAN fall and knock things over.' },
      { emoji: '🟣', text: 'Purple gobstoppers are a mystery: tap one and it’s either a mint you eat right away (lucky!) or a gummy you now have to keep on the plate.' },
      { emoji: '💨', text: 'A mint that gets knocked off the plate just tumbles away. No heart lost, and you don’t need it any more.' },
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
