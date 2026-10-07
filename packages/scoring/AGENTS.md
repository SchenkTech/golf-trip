# @gc/scoring

Pure scoring. No database, no network, no framework — functions from hole data
to results.

That purity is the point: this same code runs on the phone (so a tapped score
updates the match instantly, with no signal) and on the server (so the
scoreboard everyone else sees agrees). Anything impure would have to be
duplicated, and the two copies would drift.

## Rules for changes here

- **No I/O. No imports outside this package.** If something needs a database,
  it belongs in the API, not here.
- **Points are computed, never stored.** See `docs/SCORING.md` at the repo root.
  If a caller wants to cache a result that is their business; this package has
  no memory.
- **Every format is a strategy.** Adding one means adding an entry to the
  registry and its tests, not an `if` in the middle of an existing function.
- **Tests carry the golf, not just the arithmetic.** A test named
  `closed out 5&4 but the back nine is still live` says why it exists; one named
  `test nassau 3` does not.
