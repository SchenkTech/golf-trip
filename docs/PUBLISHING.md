# Publishing, and keeping a trip's data out of it

This codebase is meant to be two things at once: a template anyone can run, and
one specific group's live scoreboard. That works only if the split is explicit,
so here it is.

## The split

**The code and every doc but one are generic.** Nothing in `apps/`, `packages/`
or `docs/` (except `docs/TRIP.md`) names a group, a player, a course, a captain
or a domain. Two teams are `RED` and `BLUE` to the engine; what they are
*called* comes from the data. If a pull request adds a real name to a comment, a
test fixture or a default value, that's a bug.

**One group's copy adds a private layer on top**, and that layer is the only
thing that knows whose trip this is:

| Private-only | What it holds |
|---|---|
| `docs/TRIP.md` | The trip: who, where, when, the roster, the identity, the origin story |
| `apps/api/wrangler.toml` | Real account id, database id, domains, admin emails |
| `apps/api/*.sql` (except `seed-example.sql`) | Real players, handicaps, scores, courses |
| `apps/web/public/logos/**` | The group's artwork |
| `apps/web/public/icons/**` | PWA icons cut from that artwork |
| `apps/web/public/manifest.webmanifest` | The installed app's name and colours |
| `.github/workflows/deploy-api.yml` | Deploys to that group's own domain |
| `scripts/` | The publish tooling, including the denylist (which is a list of the private names, so it can never ship) |
| `public-overlay/` | The generic icons and manifest that *replace* the private ones in the published copy |

Everything else is shared, byte for byte -- including `.github/workflows/ci.yml`,
which runs tests, typechecks and a build, deploys nothing and needs no secrets.

## Why two unrelated repos, not a fork

A GitHub fork shares object storage with its upstream. A commit pushed to any
repo in a fork network stays reachable from the others **even after it's
deleted** — so one accidental commit of a roster, and the fix doesn't unpublish
it. The public repo and the private repo are therefore two separate repos with
no relationship GitHub knows about.

For the same reason the public repo is created from a **snapshot with fresh
history**, not from a history rewrite: there is no old commit to audit, because
there are no old commits.

## The rule that keeps syncing painless

> **No file may exist in both repos with different content.** Every difference
> is "present in one, absent in the other."

Hold that and a patch from either repo applies cleanly to the other, forever,
even though the histories share no ancestor. Break it — publish a *rewritten*
version of a file the private repo also edits — and every future sync conflicts
on exactly the files that change most.

That is why the genericization is done here, in the source repo, rather than by
a filter on the way out.

The exception is the branding assets in the table above (logos, icons,
manifest). Those share paths but differ in bytes. Nothing edits them in the
course of normal work; if a sync ever does conflict on one, keep yours.

## Publishing a release

`scripts/publish-public.sh`, from the private repo:

1. Refuses to run unless the tree is clean, on `main`, and in sync with origin
   -- it publishes committed state, never what happens to be on disk.
2. Exports the tree with `git archive HEAD`, so nothing untracked or ignored
   can ride along.
3. Deletes the private-only paths above and copies `public-overlay/` over the
   result.
4. **Verifies**: no private path survived, and no string from
   `scripts/publish-denylist.txt` (the trip's name, the players, the emails,
   the domains, the database id) appears anywhere in the snapshot. Any hit
   aborts.
5. `rsync --delete`s the snapshot into a checkout of the public repo, so a file
   removed here actually disappears there.
6. Shows the diff and **stops**. `--push` is required to go further.
7. Scans the staged diff against the denylist one more time -- the last check
   before anything leaves the machine.
8. Pushes a `sync/<date>` branch and opens a PR, whose body lists the private
   commit subjects in the snapshot.

The PR exists so the template's CI runs before the change lands on `main`, and
so each sync is a reviewable record. **It is not a safety boundary**: pushing
that branch publishes its contents, and a PR branch on a public repo is visible
to anyone. Step 4 is the boundary.

The public repo is `SchenkTech/golf-trip`, cloned at `~/git-projects/golf-trip`;
override with `PUBLIC_REPO` and `PUBLIC_DIR` if that ever changes.

**Push over SSH.** A `gh`-issued HTTPS token usually lacks the `workflow`
scope, and GitHub refuses any push that creates or changes a file under
`.github/workflows/` without it. If port 22 is blocked on the network you're
on, either wait it out or `gh auth refresh -s workflow` — do not work around it
by dropping the workflow from the snapshot.

## When the public repo changes on its own

The published repo has Renovate on it and can take outside PRs, so its `main`
will sometimes contain commits that never existed here. The sync is a snapshot
with `rsync --delete` behind it, so publishing over those would silently revert
them.

`publish-public.sh` refuses to run when it finds a commit on the public `main`
whose message isn't one of its own, and names them. Cherry-pick them back here
first (below), then sync. That is the same rule as everything else in this
file: the private repo is the source of truth, so anything that is only public
has to come home before the next snapshot goes out.

## Merging a sync PR

Squash-merge it. The guard above recognises this repo's own commits by
subject (`Initial public release`, `Sync from upstream …`), and a squash
keeps the PR title as the commit subject. A regular merge commit
("Merge pull request #N from …") would trip the guard on the next sync.

## Pulling a change back

An outside contribution, or a fix made in the public repo:

```bash
git remote add public git@github.com:<you>/<public-repo>.git   # once
git fetch public
git cherry-pick <sha>                    # or a range: public/main~3..public/main
```

Cherry-pick applies a diff, so unrelated histories don't matter. Do **not**
`git merge` the public remote: it needs `--allow-unrelated-histories` and will
fight you every time.

## Starting your own trip's copy

Fork the public repo, then add your own private layer:

1. Copy `apps/api/wrangler.example.toml` to `wrangler.toml` and fill in your
   database id, domain, OAuth client and admin emails.
2. Replace the icons and manifest with your own, and drop your logos in
   `apps/web/public/logos/`.
3. Write your roster and courses as a seed, starting from
   `apps/api/seed-example.sql` — or skip it and build the event in Admin.
4. Write your own `docs/TRIP.md`, and keep it private.

If you want your copy private while still pulling updates, make it a **separate
private repo** rather than a fork, for the reason above, and pull with
`git cherry-pick` or `git remote add upstream` + `git fetch`.
