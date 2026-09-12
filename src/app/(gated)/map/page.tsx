// `/map` — retired. The 2D map/land-picker has been replaced by the 3D
// Gamecakes City at /town, which is now the sole hub. This route stays as a
// permanent redirect so old links, bookmarks, and any lingering "Back to Map"
// buttons land in the city instead of 404ing.

import { redirect } from 'next/navigation';

export default function MapRedirect(): never {
  redirect('/town');
}
