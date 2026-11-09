'use client';

// FamilyCapabilities — what the CURRENT family is allowed to do, for client
// components that render a control before any API is called.
//
// The tier map lives in lib/auth/tier.ts and the API guards enforce it. That
// was the whole design, and it held: a restricted family could not spend our
// model balance or file into our board. What it did not do is stop the UI
// from OFFERING those things. The free-account walkthrough (2026-09-25)
// found a kid typing an idea into the Story Oven, tapping "Into the oven!",
// and reading "not available on this plan" — after the effort, not before.
// Sixteen game hosts render that button and none of them know the tier.
//
// So the gated layout computes the capabilities once, server-side, and this
// provider hands them to any client component that wants to hide a control
// rather than let it 403. The guards stay; this is presentation only.
//
// DEFAULTS ARE PERMISSIVE ON PURPOSE. A component rendered outside the
// provider (the /ba guest arcade, a storybook, a test) sees everything
// allowed, which is the pre-existing behaviour. The provider only ever
// REMOVES controls; it can never grant a route that the guard would refuse.

import { createContext, useContext } from 'react';

export interface FamilyCapabilities {
  /** Story Oven: filing a ticket into the deployment's board. */
  canFileTicket: boolean;
  /** Anything that reaches a paid model: observation photos, transcription. */
  canAi: boolean;
  /** Family-wide settings: digest email recipients, Sugar Token grants. */
  canFamilySettings: boolean;
  /** The Story Oven design flow. */
  canCreateGame: boolean;
}

export const ALL_CAPABILITIES: FamilyCapabilities = {
  canFileTicket: true,
  canAi: true,
  canFamilySettings: true,
  canCreateGame: true,
};

const Ctx = createContext<FamilyCapabilities>(ALL_CAPABILITIES);

export function FamilyCapabilitiesProvider({
  value,
  children,
}: {
  value: FamilyCapabilities;
  children: React.ReactNode;
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFamilyCapabilities(): FamilyCapabilities {
  return useContext(Ctx);
}
