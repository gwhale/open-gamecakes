// `/admin/decisions` now lives as the Decisions section of `/admin`. This keeps
// old links working. The section's own guard applies there; a redirect leaks
// nothing because `/admin` answers 404 to anyone but the operator.

import { redirect } from 'next/navigation';

export default function DecisionsRedirect() {
  redirect('/admin#decisions');
}
