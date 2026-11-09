'use client';

// Create communities and choose which families are in them. This records
// membership only: families in a community can't see each other yet.

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { COMMUNITY_NAME_MAX } from '@/lib/admin/communities';

export interface CommunityView {
  id: string;
  name: string;
  familyIds: string[];
}

const buttonClass =
  'min-h-11 rounded-full border border-zinc-300 px-3 text-xs font-medium hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800';

const fieldClass =
  'min-h-11 rounded-xl border-2 border-zinc-200 bg-white px-3 text-sm focus:border-rose-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900';

export default function CommunitiesPanel({
  communities,
  families,
}: {
  communities: CommunityView[];
  families: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async (body: Record<string, string>): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/communities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.status === 401) throw new Error('Your 15 minutes ran out. Reload and enter your password.');
      if (!res.ok) throw new Error('That did not save. Try again.');
      router.refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not save. Try again.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const familyName = (id: string) => families.find((family) => family.id === id)?.name ?? 'Unknown family';

  return (
    <div className="mt-2 flex flex-col gap-4">
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        A list only, for now. Families in a community can&rsquo;t see each other or play together.
      </p>

      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void send({ action: 'create', name }).then((ok) => {
            if (ok) setName('');
          });
        }}
      >
        <label className="flex flex-wrap items-center gap-2 text-sm">
          New community
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={COMMUNITY_NAME_MAX}
            required
            className={fieldClass}
          />
        </label>
        <button type="submit" disabled={busy || !name.trim()} className={buttonClass}>
          Create
        </button>
      </form>

      {error ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}

      {communities.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No communities yet.</p>
      ) : (
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {communities.map((community) => {
            const available = families.filter((family) => !community.familyIds.includes(family.id));
            return (
              <li key={community.id} className="flex flex-col gap-2 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold">{community.name}</h3>
                  {confirmingDelete === community.id ? (
                    <span className="flex flex-wrap items-center gap-1.5 text-xs">
                      Delete {community.name}?
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setConfirmingDelete(null);
                          void send({ action: 'delete', communityId: community.id });
                        }}
                        className={`${buttonClass} border-red-400 text-red-700 dark:text-red-300`}
                      >
                        Yes, delete it
                      </button>
                      <button type="button" disabled={busy} onClick={() => setConfirmingDelete(null)} className={buttonClass}>
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button type="button" onClick={() => setConfirmingDelete(community.id)} className={buttonClass}>
                      Delete
                    </button>
                  )}
                </div>

                {community.familyIds.length === 0 ? (
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">No families yet.</p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {community.familyIds.map((familyId) => (
                      <li key={familyId} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        {familyName(familyId)}
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void send({ action: 'remove-family', communityId: community.id, familyId })}
                          className={buttonClass}
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {available.length > 0 ? (
                  <label className="flex flex-wrap items-center gap-2 text-sm">
                    Add a family
                    <select
                      value=""
                      disabled={busy}
                      onChange={(event) => {
                        if (event.target.value) {
                          void send({ action: 'add-family', communityId: community.id, familyId: event.target.value });
                        }
                      }}
                      className={fieldClass}
                    >
                      <option value="">Choose a family</option>
                      {available.map((family) => (
                        <option key={family.id} value={family.id}>
                          {family.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
