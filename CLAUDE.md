# golfclassic

Scoreboard and scoring app for a Ryder-Cup-style buddies golf trip. Ground-up
rebuild, deliberately small.

The design constraint, from the group this was first built with, after they
reviewed an earlier attempt (a fork of an existing tournament-management
system): *too complicated, make it user friendly, remember who is actually
going to use it.* Every "no" in `docs/DECISIONS.md` comes back to that.

This repo is published as a template — see `docs/PUBLISHING.md`. Keep the code
and the docs generic: one group's names, roster, courses, artwork and config
live in `docs/TRIP.md` and the private-only files listed there, never in the
code or in the other docs.

**After any significant change — a feature, a schema migration, a fix worth
having — publish it**, so the template doesn't drift behind the copy that's
actually being used: `./scripts/publish-public.sh` to review the diff, then
`--push` to open the sync PR.

## What this is not

Not a tournament management system. No enrollment requests, no approval
workflows, no competition state machine. That is what the earlier attempt was,
and it is why we started over.

## Key technical decisions

- **PWA, not native.** Installs to the home screen, works on iOS and Android
  from one codebase. Native was rejected on distribution grounds, not
  capability: TestFlight builds expire after 90 days and this event runs once a
  year, so every year would start with walking a dozen people through
  installing a beta client. A web app also means a scoreboard bug on Saturday
  morning is a five-minute deploy rather than an App Store review.
- **Offline-first score entry.** Courses have dead patches. Entries queue
  locally and sync when signal returns. If a hole entry can be lost to bad
  reception, the scoreboard stops being trusted on day one.
- **Points are derived, never stored.** See `docs/SCORING.md`. This is the
  decision most likely to be undone by accident, and the most expensive to undo.
- **Public read, light auth to score, real auth to admin.** A dozen friends once
  a year do not need a password reset flow.

## Conventions

- Screens are named for what a player calls them (Board, Matches, Teams,
  History, Rules), not for the entities behind them.
- Copy is written from the player's side of the screen. Nobody on a golf trip
  says "enrollment" or "competition instance".
- Anything configurable is configured **per round**, not per tournament — one
  weekend runs different formats on different days.
- Nothing in the code hardcodes a team, player, course or trip name. Two teams
  are RED and BLUE to the engine; what they are *called* comes from the data.
- Comments explain *why*, especially where a rule of golf or a quirk of the
  event drove the code. The next reader is a golfer before they are a
  programmer.
