// The logic behind the grown-up spotlight tour (components/parent/ParentTour).
// Kept free of React and the DOM so it can be unit tested in node.

/** A family counts as new for this long, so an adult who signs up and comes
 *  back a few days later still gets the tour. Older families are never
 *  interrupted; they can start it from the link on /parent. */
export const NEW_FAMILY_WINDOW_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

export function isNewFamily(createdAt: string, now: number = Date.now()): boolean {
  const created = Date.parse(createdAt);
  if (Number.isNaN(created)) return false;
  return now - created < NEW_FAMILY_WINDOW_DAYS * DAY_MS;
}

/** Per family, so a second family logging in on the same tablet still gets it. */
export function tourSeenKey(familyId: string): string {
  return `gamecakes:parent-tour-seen-v1:${familyId}`;
}

export interface TourStep {
  /** Matches a `data-tour` attribute on /parent. A step whose target is not on
   *  the page (a tier-gated button, say) is left out of the tour. */
  target: string;
  title: string;
  body: string;
}

export function tourSteps(hasPlayers: boolean): TourStep[] {
  return [
    hasPlayers
      ? {
          target: 'players',
          title: 'Your players',
          body: 'Tap a player to see what they are practicing and how it is going. The app sets the difficulty for each of them as they play.',
        }
      : {
          target: 'players',
          title: 'Start with a player',
          body: 'Add a player first. They get their own corner of the town, five Sugar Tokens, and questions pitched at their grade.',
        },
    {
      target: 'tokens',
      title: 'Give Sugar Tokens',
      body: 'Kids earn Sugar Tokens by playing and spend them around the town. You can add some here as a reward for something they did off-screen.',
    },
    {
      target: 'gameplay',
      title: 'Gameplay',
      body: 'See which games each kid is choosing, finishing, and getting better at.',
    },
    {
      target: 'builds',
      title: 'Town builds',
      body: 'Every road and building your kids have placed in the town. You can remove one here, and the builder gets a refund.',
    },
    {
      target: 'settings',
      title: 'Settings',
      body: 'Change your grown-up PIN or your contact email here.',
    },
    {
      target: 'kid-mode',
      title: 'Hand back the tablet',
      body: 'Tap Kid mode when you are done. It locks this section behind your PIN, and it locks by itself after 30 minutes.',
    },
  ];
}

export interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

const SPOT_PADDING = 8;
const CARD_GAP = 16;
const EDGE_MARGIN = 16;

/** The lit area: the target plus padding, kept on screen so a target taller
 *  than the viewport (a long player list) still leaves a visible edge. */
export function spotlightBox(target: Box, viewport: Size): Box {
  const top = Math.max(EDGE_MARGIN / 2, target.top - SPOT_PADDING);
  const left = Math.max(EDGE_MARGIN / 2, target.left - SPOT_PADDING);
  const bottom = Math.min(viewport.height - EDGE_MARGIN / 2, target.top + target.height + SPOT_PADDING);
  const right = Math.min(viewport.width - EDGE_MARGIN / 2, target.left + target.width + SPOT_PADDING);
  return { top, left, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

/** Where the card goes: below the spotlight if it fits, then above, otherwise
 *  pinned to the bottom edge over the spotlight. Always fully on screen. */
export function cardPosition(spot: Box, card: Size, viewport: Size): { top: number; left: number } {
  const below = spot.top + spot.height + CARD_GAP;
  const above = spot.top - CARD_GAP - card.height;
  const maxTop = Math.max(EDGE_MARGIN, viewport.height - card.height - EDGE_MARGIN);

  let top: number;
  if (below + card.height <= viewport.height - EDGE_MARGIN) top = below;
  else if (above >= EDGE_MARGIN) top = above;
  else top = maxTop;

  const centered = spot.left + spot.width / 2 - card.width / 2;
  const maxLeft = Math.max(EDGE_MARGIN, viewport.width - card.width - EDGE_MARGIN);
  return { top, left: Math.min(maxLeft, Math.max(EDGE_MARGIN, centered)) };
}
