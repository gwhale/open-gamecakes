// Invite-code helpers for closed-beta signup.
//
// Flow:
//   1. Admin (you) generates a code via scripts/admin/create-invite.ts
//      and shares it with a parent.
//   2. Parent visits /signup, enters code + email + family name +
//      checks "I am the parent and consent to my kid using Gamecakes."
//   3. The /signup route handler validates the code (exists, not
//      expired, not redeemed), creates a Supabase Auth user (sends a
//      magic link to their email), creates the families row owned by
//      that user, marks the invite code redeemed.
//   4. Parent clicks magic link, lands on /auth/callback, session is
//      set, redirect to /parent.
//
// All redemption logic runs server-side with the secret key (bypasses
// RLS) so the unauthenticated signup form works without RLS exceptions.

import crypto from 'node:crypto';
import { supabaseServer } from '@/lib/supabase/server';

/** Code shape: 'CAKE-' + 8 base32 chars. ~40 bits of entropy, brute-
 *  force-resistant for closed beta scale, short enough to type by hand. */
const CODE_PREFIX = 'CAKE-';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 to avoid confusion

export function generateInviteCode(): string {
  const buf = crypto.randomBytes(8);
  let body = '';
  for (let i = 0; i < 8; i++) body += ALPHABET[buf[i] % ALPHABET.length];
  return CODE_PREFIX + body;
}

export interface InviteCodeRow {
  code: string;
  notes: string | null;
  created_at: string;
  expires_at: string | null;
  redeemed_at: string | null;
  redeemed_by_user_id: string | null;
  redeemed_by_family_id: string | null;
}

/**
 * Validate that a code is real, not expired, and not yet redeemed.
 * Returns the row if usable; throws a descriptive error otherwise.
 *
 * Server-side only — uses the secret key to read invite_codes.
 */
export async function validateInviteCode(code: string): Promise<InviteCodeRow> {
  const trimmed = code.trim().toUpperCase();
  if (!trimmed.startsWith(CODE_PREFIX)) {
    throw new Error('That doesn\'t look like a Gamecakes invite code.');
  }
  const sb = supabaseServer();
  const { data, error } = await sb
    .from('invite_codes')
    .select('*')
    .eq('code', trimmed)
    .maybeSingle();
  if (error) throw new Error(`Invite lookup failed: ${error.message}`);
  if (!data) throw new Error('That code doesn\'t exist. Double-check with whoever sent it.');

  const row = data as InviteCodeRow;
  if (row.redeemed_at) throw new Error('That code has already been used.');
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
    throw new Error('That code has expired. Ask for a fresh one.');
  }
  return row;
}

/**
 * Mark a code redeemed. Caller must have already validated it. Idempotent
 * (won't double-redeem) thanks to the `redeemed_at is null` guard.
 */
export async function markInviteCodeRedeemed(args: {
  code: string;
  userId: string;
  familyId: string;
}): Promise<void> {
  const { code, userId, familyId } = args;
  const sb = supabaseServer();
  const { error } = await sb
    .from('invite_codes')
    .update({
      redeemed_at: new Date().toISOString(),
      redeemed_by_user_id: userId,
      redeemed_by_family_id: familyId,
    })
    .eq('code', code)
    .is('redeemed_at', null);
  if (error) throw new Error(`Mark redeemed failed: ${error.message}`);
}

/**
 * Insert a new unredeemed invite code. Returns the generated code string.
 * Used by the admin script — never invoked from a public route.
 */
export async function createInviteCode(args: {
  notes?: string;
  expiresAt?: Date;
} = {}): Promise<string> {
  const code = generateInviteCode();
  const sb = supabaseServer();
  const { error } = await sb
    .from('invite_codes')
    .insert({
      code,
      notes: args.notes ?? null,
      expires_at: args.expiresAt?.toISOString() ?? null,
    });
  if (error) throw new Error(`Create invite failed: ${error.message}`);
  return code;
}
