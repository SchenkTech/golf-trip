import { useEffect, useState } from "react";
import { api } from "./api.ts";
import type { EventSummary, PublicPayouts } from "./api.ts";
import { formatWeekday, formatLongDate, formatMoney } from "./lib/format.ts";
import "./Payouts.css";

const REFRESH_MS = 20_000;

/** The trip's real-money side bets, read-only and public (docs/DECISIONS.md
 *  #12's own follow-up note reverses "admin-only" once a group actually
 *  wanted players to see it, same reversed-narrowly shape as #11's photo
 *  album). Only exists once event.hasPayouts is true -- an admin has typed
 *  in at least one payout line somewhere -- same "doesn't exist until
 *  there's something to show" gate Photos.tsx uses for its own switch.
 *
 *  Nothing here is entered on this screen. Every dollar amount and every
 *  "who's ahead" comes from GET /:id/payouts, which Admin's own payout
 *  lines and lib/payoutLeaders.ts already compute -- this is a second
 *  window onto that same data, not a second copy of it. Polls like Board
 *  does, since a pot's leader can flip mid-round as holes are entered. */
export default function Payouts() {
  const [event, setEvent] = useState<EventSummary | null>(null);
  const [payouts, setPayouts] = useState<PublicPayouts | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .currentEvent()
      .then(setEvent)
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    if (!event || !event.hasPayouts) return;

    let cancelled = false;
    const load = () => {
      api
        .payouts(event.id)
        .then((r) => {
          if (!cancelled) setPayouts(r);
        })
        .catch((e) => {
          if (cancelled) return;
          // A 404 here just means the last payout line got deleted since
          // event.hasPayouts was read -- not an error worth showing.
          if (String(e).includes("404")) setNotConfigured(true);
          else setError(String(e));
        });
    };
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [event]);

  if (error) {
    return (
      <main className="board">
        <p className="load-error">Couldn't load payouts: {error}</p>
      </main>
    );
  }

  if (!event) {
    return (
      <main className="board">
        <p className="loading">Loading…</p>
      </main>
    );
  }

  if (!event.hasPayouts || notConfigured) {
    return (
      <main className="board">
        <header className="page-header">
          <h1>Payouts</h1>
        </header>
        <p className="page-sub">No side bets set up for this trip yet.</p>
      </main>
    );
  }

  return (
    <main className="board payouts-page">
      <header className="page-header">
        <h1>Payouts</h1>
        <p className="page-sub">
          Estimates from the current scores -- a pot only names a winner once that bet is finished, and updates as more holes go
          in. Set the buy-ins in Admin.
        </p>
      </header>

      {payouts === null ? (
        <p className="loading">Loading…</p>
      ) : (
        <>
          {payouts.rounds.map((r) => (
            <section key={r.roundId} className="payouts-round">
              <header className="payouts-round-header">
                <h3>{formatWeekday(r.date)}</h3>
                <p className="round-sub">{formatLongDate(r.date)}</p>
              </header>
              <div className="payouts-lines">
                {r.lines.map((l) => (
                  <div key={l.id} className="payouts-line">
                    <div className="payouts-line-top">
                      <span className="payouts-line-label">{l.label}</span>
                      <span className="payouts-line-amount">{formatMoney(l.payout)}</span>
                    </div>
                    <p className={`payouts-line-status payouts-line-status-${l.status}`}>
                      {l.status === "leading" && l.leaderNames ? l.leaderNames.join(", ") : l.status === "unknown" ? "Set by hand -- ask around" : "Not finished yet"}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          ))}

          {payouts.totalCost !== null && (
            <p className="payouts-remainder">
              {formatMoney(payouts.allocated)} in side bets, out of {formatMoney(payouts.totalCost)} total.{" "}
              {payouts.remainder !== null && payouts.remainder > 0
                ? `${formatMoney(payouts.remainder)} left over goes to the Cup's overall winner.`
                : ""}
            </p>
          )}
        </>
      )}
    </main>
  );
}
