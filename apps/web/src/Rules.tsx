import { useEffect, useState } from "react";
import { api } from "./api.ts";
import type { QuickRule } from "./api.ts";
import "./Rules.css";

/** Quick Rules come from the API now -- see apps/api's schema.ts on
 *  quick_rule -- editable from Admin without a redeploy. Everything below
 *  this section (Nassau/Formats/Handicaps/Entering/Winning) stays static
 *  content on purpose: it describes actual @gc/scoring behavior, and an
 *  editable copy of that risks disagreeing with the code it's describing.
 *  See docs/SPEC.md: "Worth real writing: if Nassau is in play, this page
 *  is what stops the 'wait, so the back nine is separate?' conversation
 *  happening on the first tee." */
export default function Rules() {
  const [quickRules, setQuickRules] = useState<QuickRule[] | null>(null);

  useEffect(() => {
    api.rules().then((r) => setQuickRules(r.rules));
  }, []);

  return (
    <main className="board rules-page">
      <header className="page-header">
        <h1>Rules</h1>
        <p className="page-sub">Three days, three courses, one Cup.</p>
      </header>

      {quickRules && quickRules.length > 0 && (
        <section className="rules-section">
          <h2>Quick Rules</h2>
          <div className="rules-grid">
            {quickRules.map((r) => (
              <div key={r.id} className="rule-card">
                <h3>{r.title}</h3>
                <p>{r.body}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rules-section">
        <h2>Nassau</h2>
        <p>
          Every match is three separate bets: the front nine, the back nine,
          and the overall eighteen — front, back, and overall are each their
          own match play game, not one score for the day.
        </p>
        <p>
          The back nine is still live even after a match closes out early.
          A match that finishes 5&amp;4 has already decided the front and the
          overall, but the back nine keeps going if there are holes left to
          play in it — it's a separate bet from the one that just ended.
        </p>
        <p>
          A nine nobody has teed off on yet is worth nothing to either side,
          not split down the middle. Points only move once holes have actually
          been played.
        </p>
        <p>
          The overall bet isn't worth the same as either nine on its own —
          see Formats below for how a match's points actually split.
        </p>
      </section>

      <section className="rules-section">
        <h2>Formats</h2>
        <div className="rules-table-wrap">
          <table className="rules-table">
            <thead>
              <tr>
                <th>Format</th>
                <th>Team shape</th>
                <th>Points</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Fourball</td>
                <td>Better ball, two or three a side</td>
                <td>Nassau, 2 pts (0.5 / 0.5 / 1)</td>
              </tr>
              <tr>
                <td>Foursomes</td>
                <td>Alternate shot, one ball per side</td>
                <td>Nassau, 2 pts (0.5 / 0.5 / 1)</td>
              </tr>
              <tr>
                <td>Singles</td>
                <td>One on one</td>
                <td>Nassau, 3 pts (1 / 1 / 1)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="rules-section">
        <h2>Handicaps</h2>
        <p>
          Strokes are given off the course's stroke index — the hardest holes
          get the shots first. A small dot next to a player's name on a hole
          means they get a stroke there. Net score is what decides the hole.
        </p>
      </section>

      <section className="rules-section">
        <h2>Entering scores</h2>
        <p>
          Anyone playing in a match can enter its scores — there's no lock to
          a single scorer. Every entry is attributed and timestamped, and the
          last write wins, so a disagreement becomes a conversation on the tee
          rather than a number that silently changed.
        </p>
        <p>
          No signal on the course is normal. Scores entered offline are queued
          on the device and sync automatically once it reconnects — nothing is
          lost to a dead patch.
        </p>
      </section>

      <section className="rules-section">
        <h2>Winning</h2>
        <p>
          Add up every match's points across the weekend — most points wins
          the Cup. The Board shows the running total and how many points are
          still on the table.
        </p>
      </section>
    </main>
  );
}
