# Scoring

## The one rule that matters

**Store hole scores. Derive points on read. Never store computed points.**

Every format below is a pure function over the same input: a list of hole
results. Nothing about a match's *points* is written to the database.

The reason is that the rules will change. They will change between years, and
they will change mid-argument on a Saturday afternoon. If points are stored:

- changing a format silently leaves every past match wrong, and there is no way
  to recompute it;
- the History page's all-time record becomes a number somebody has to remember
  to update, which means it will be wrong;
- a corrected hole score does not flow through to the standings.

If points are derived, all three of those problems do not exist. Changing the
format on a round recomputes that round — and every past year — correctly and
instantly.

The cost is a little arithmetic on every read. For twelve players over three
days that is nothing.

## Configured per round, not per tournament

One weekend runs different formats on different days: fourball Friday,
foursomes Saturday, singles Sunday. Other groups run scramble, alternate shot,
Hi-Lo and singles inside a single trip. So the format lives on the round, not on
the event.

## Formats

| Format | Points per match | Notes |
|---|---|---|
| `MATCH_PLAY` | 1 win / 0.5 half | The default. What most people picture. |
| `NASSAU` | 3 | Front nine, back nine, and the overall eighteen scored separately. |
| `HI_LO` | varies | Best ball and worst ball each worth a point. |
| `STROKE` | — | Ranking, not match points. For a side game. |

`MATCH_PLAY` and `NASSAU` ship first. The others exist in this table so the
engine is written as a set of strategies from day one rather than an `if`.

Team shape (singles / fourball / foursomes / scramble / alt shot) is a
*separate* axis from how points are counted. Scramble scored at match play is
still match play. Do not conflate the two — the earlier attempt did, and it is
why it could not express Nassau without surgery.

## Nassau, and the trap in it

Nassau splits one match into three independent match-play bets: the front nine,
the back nine, and the overall eighteen. A match is worth 3 points, not 1.

Two consequences, both of which have already caught us out once:

**Every hole counts.** A match closed out 5&4 still has a live back nine. Code
that stops counting at the closeout point — which is the natural thing to write,
because that is what produces the string "5&4" — silently deletes a bet that is
still being played. The displayed *result* truncates at the closeout; the
*points* must not.

**An unplayed segment is worth nothing, not a half.** Holes not yet played are
simply absent from the data. Treating an empty back nine as "level" hands out
half a point each for a nine nobody has teed off on. If the group decides a
rained-off nine counts as halved, that is a deliberate rule change, not a
default.

Worked example — A wins 5&4, B wins the back nine:

```
              MATCH_PLAY        NASSAU
  Team A         1.0         2.0   (front + overall)
  Team B         0.0         1.0   (back)
```

## Porting from the earlier attempt

`golfclassic-api` has a tested implementation of both the Nassau maths and WHS
handicapping (playing handicap, stroke allocation by index, net double bogey
cap). That logic is correct and worth carrying over. Its 54 scoring tests port
as the new engine's test suite, and the two behaviours above are covered there.

Nothing else from that codebase should come with it.
