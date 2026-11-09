// `/map/math` — retired. Math Land (the 2D overworld) is replaced by the 3D
// Gamecakes City at /town. Kept as a redirect so old "Back to Map" links and
// bookmarks resolve to the city.

import { redirect } from 'next/navigation';

export default function MathLandRedirect(): never {
  redirect('/town');
}
