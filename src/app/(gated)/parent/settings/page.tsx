// /parent/settings — family-level grown-up settings. Currently just the weekly
// email; this is the natural home for anything else that is per-family rather
// than per-kid.

import { requireCurrentFamily } from '@/lib/auth/family';
import { supabaseServer } from '@/lib/supabase/server';
import { emailConfigured } from '@/lib/email/send';
import { can } from '@/lib/auth/tier';
import { ChromeNavLink } from '@/components/ui/ChromeNavLink';
import DigestEmailsForm from './DigestEmailsForm';

export const dynamic = 'force-dynamic';

export default async function ParentSettingsPage() {
  const family = await requireCurrentFamily();
  const sb = supabaseServer();
  const { data } = await sb
    .from('families')
    .select('digest_emails')
    .eq('id', family.id)
    .maybeSingle();

  return (
    <main className="mx-auto w-full max-w-xl p-5 sm:p-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="mt-1 text-sm text-zinc-500">Grown-up settings for this family.</p>
        </div>
        <ChromeNavLink href="/parent" size="sm">← Parents</ChromeNavLink>
      </header>
      {can(family.tier, 'family:settings') ? (
        <DigestEmailsForm
          initial={(data?.digest_emails as string[] | null) ?? []}
          configured={emailConfigured()}
        />
      ) : (
        <p className="rounded-2xl border border-zinc-200 bg-white p-5 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          The weekly email is not part of this plan. Everything else on the
          parent screens works as normal.
        </p>
      )}
    </main>
  );
}
