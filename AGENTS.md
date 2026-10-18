<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# A migration is not done until the baseline is regenerated

`supabase/baseline/0001_baseline.sql` is the **entire schema** for everyone who
is not this deployment. `scripts/opensource/publish.mjs` deletes
`supabase/migrations/` from the public cut and ships that one file instead.

So a migration without a regenerated baseline is **invisible here and broken
there**. There is no local symptom at all — the person who finds it is someone
who just cloned the repo and concluded it does not work.

It has already happened: 0048 and 0049 added `class_material.modes` and
`.glosses`, the code selects both, the baseline went out without them, and a
fresh install 500'd on the parent skills tab.

Apply the migration by hand in the SQL editor first (the baseline is generated
from the **live schema**, never by concatenating migration files), then:

```bash
node scripts/opensource/baseline.mjs generate <project-ref> \
  > supabase/baseline/0001_baseline.sql
```

Both go in the same commit. `npm run check:baseline` enforces it and CI runs
it. If your migration genuinely changes no schema, regenerate anyway — the diff
will be empty and the check passes.
