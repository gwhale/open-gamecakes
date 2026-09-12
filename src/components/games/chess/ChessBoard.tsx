'use client';

// ChessBoard — a thin React wrapper around lichess's chessground.
//
// chessground is imperative + touches the DOM, so (like the Three/Phaser hosts)
// it's dynamically imported in a client effect. This component owns none of the
// chess *rules* — the parent drives it with a FEN, whose turn it is, the legal
// destinations for the kid's turn, and gets a callback on each move the kid
// makes (drag OR tap-tap; chessground supports both). The parent decides what
// the move MEANS and pushes the next FEN back down.
//
// That rules-agnosticism is why this lives under components/games/chess/ rather
// than inside one game: Chess Puzzles validates moves against a scripted puzzle
// line, Chess Challenge validates them against a bot's game, and neither
// difference reaches this file. Keep it that way — game rules belong in the
// parent, not here.
//
// Note it does NOT own promotion either: the parent supplies the promotion piece
// when it applies the move. Both games currently auto-queen.
//
// Board look: chessground's self-contained brown board + cburnett piece set
// (both embedded SVGs — no external assets), with cakey tweaks in
// chessground-cakey.css.

import { useEffect, useRef } from 'react';
import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.brown.css';
import 'chessground/assets/chessground.cburnett.css';
import './chessground-cakey.css';
import type { Api } from 'chessground/api';
import type { Config } from 'chessground/config';
import type { Key, Dests } from 'chessground/types';

export interface ChessBoardProps {
  fen: string;
  /** Board orientation — the solver's color sits at the bottom (lichess puzzles
   *  can have the kid playing either color). */
  orientation: 'white' | 'black';
  /** Whose move it is now (drives the turn indicator + which color can move). */
  turnColor: 'white' | 'black';
  /** True when it's the kid's turn to move. */
  movable: boolean;
  /** Legal destinations by from-square, for the kid's turn. */
  dests: Map<string, string[]>;
  lastMove?: [string, string];
  check?: boolean;
  /** Fired after the kid drags/taps a (legal) move; parent validates it. */
  onMove: (from: string, to: string) => void;
  className?: string;
}

export default function ChessBoard(props: ChessBoardProps): React.ReactElement {
  const elRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<Api | null>(null);
  // Keep the latest onMove reachable from chessground's once-bound handler.
  const onMoveRef = useRef(props.onMove);
  onMoveRef.current = props.onMove;

  const movableConfig = (): Config['movable'] => ({
    free: false,
    color: props.movable ? props.turnColor : undefined,
    dests: (props.movable ? props.dests : new Map<string, string[]>()) as unknown as Dests,
    showDests: true,
    events: { after: (orig: Key, dest: Key) => onMoveRef.current(orig, dest) },
  });

  // Mount once.
  useEffect(() => {
    let destroyed = false;
    (async () => {
      const { Chessground } = await import('chessground');
      if (destroyed || !elRef.current) return;
      apiRef.current = Chessground(elRef.current, {
        fen: props.fen,
        orientation: props.orientation,
        turnColor: props.turnColor,
        coordinates: true,   // show algebraic files/ranks (a–h / 1–8) on the board
        addPieceZIndex: false,
        animation: { enabled: true, duration: 230 },
        draggable: { enabled: true, showGhost: true },
        selectable: { enabled: true },
        highlight: { lastMove: true, check: true },
        movable: movableConfig(),
      });
    })();
    return () => {
      destroyed = true;
      apiRef.current?.destroy();
      apiRef.current = null;
    };
    // Mount-once; live state flows through the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push live state on every prop change.
  useEffect(() => {
    apiRef.current?.set({
      fen: props.fen,
      turnColor: props.turnColor,
      lastMove: props.lastMove as Key[] | undefined,
      check: props.check ?? false,
      movable: movableConfig(),
    });
    // movableConfig closes over the latest props each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.fen, props.turnColor, props.movable, props.dests, props.lastMove, props.check]);

  return <div ref={elRef} className={props.className} style={{ width: '100%', aspectRatio: '1 / 1' }} />;
}
