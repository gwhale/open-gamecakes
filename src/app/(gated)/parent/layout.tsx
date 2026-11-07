// `(gated)/parent/layout.tsx`
//
// The parent section is grown-up-only. The outer (gated) layout already
// guarantees a valid family session; here we additionally require GROWN-UP
// MODE — a valid, short-lived signed elevation cookie (see
// src/lib/auth/parent-mode.ts). A kid in the driver's seat is bounced to
// /grownups, the PIN gate, instead of ever seeing parent content.
//
// This is the screen half of "lock API + screens": the parent-only /api/*
// routes enforce the same check server-side via requireParentModeOrJson.

import { requireCurrentFamily } from '@/lib/auth/family';
import { requireParentModePage } from '@/lib/auth/parent-mode';

export default async function ParentLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const family = await requireCurrentFamily();
  await requireParentModePage(family.id);
  return <>{children}</>;
}
