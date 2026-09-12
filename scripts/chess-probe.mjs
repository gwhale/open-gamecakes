// Probe a position: node scripts/chess-probe.mjs "<fen>" [oppMove]
// Prints side to move, check/mate status, and (for the side to move) every
// legal move in coord form, flagging checkmates with #.
import { Chess } from 'chess.js';
const [, , fen, oppMove] = process.argv;
const c = new Chess(fen);
if (oppMove) {
  c.move({ from: oppMove.slice(0, 2), to: oppMove.slice(2, 4), promotion: 'q' });
  console.log(`after ${oppMove}: ${c.fen()}`);
}
console.log('turn:', c.turn(), 'check:', c.inCheck(), 'mate:', c.isCheckmate());
const moves = c.moves({ verbose: true });
const mates = [];
for (const m of moves) {
  const t = new Chess(c.fen());
  t.move(m);
  const coord = m.from + m.to + (m.promotion || '');
  if (t.isCheckmate()) mates.push(coord);
}
console.log('legal:', moves.map((m) => m.from + m.to + (m.promotion || '')).join(' '));
console.log('MATES:', mates.join(' ') || '(none)');
