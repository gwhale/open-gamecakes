// CSRF defense for state-changing form POSTs.
//
// Our sensitive POSTs (grown-up-mode unlock/lock) are plain HTML forms, so we
// can't rely on a custom header a browser withholds cross-site. Instead we
// check the browser-set request metadata:
//
//   - Sec-Fetch-Site: set by all modern browsers (incl. iPad Safari, our
//     target). 'same-origin' / 'none' (direct address-bar) are legitimate;
//     'cross-site' / 'same-site' subdomain POSTs are rejected.
//   - Origin vs Host: fallback for the rare client without Sec-Fetch-Site.
//
// If neither header is present we allow the request — the session cookie's
// SameSite=Lax is the backstop, and blocking would break old clients for no
// added protection over that backstop.

import type { NextRequest } from 'next/server';

export function isSameOriginRequest(request: NextRequest): boolean {
  const secFetchSite = request.headers.get('sec-fetch-site');
  if (secFetchSite) {
    return secFetchSite === 'same-origin' || secFetchSite === 'none';
  }

  const origin = request.headers.get('origin');
  if (!origin) return true; // no signal either way → rely on SameSite backstop
  try {
    return new URL(origin).host === request.headers.get('host');
  } catch {
    return false;
  }
}
