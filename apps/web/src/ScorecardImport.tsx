import { useState } from "react";
import { api } from "./api.ts";
import type { MatchDetail, OcrReading } from "./api.ts";
import { getStoredJoinCode } from "./lib/identity.ts";
import "./ScorecardImport.css";

/** One editable row: a reading resolved (or not) to a real player, with
 *  the score a person can still correct before anything is applied. Keyed
 *  by array index rather than playerId+hole, because an unmatched reading
 *  has no playerId yet to key on. */
interface Row {
  playerName: string;
  playerId: string | null;
  holeNumber: number;
  gross: number | null;
}

/** Longest edge a photo is downscaled to before it's sent. Past roughly
 *  1500px a photo has no more legible detail to offer a model reading
 *  printed or handwritten numbers, so sending it larger only adds upload
 *  time and cost for the same result. */
const MAX_EDGE = 1568;

/** Reads a File into a downscaled JPEG data URL, drawn through a canvas
 *  rather than sent as-is -- a phone photo can be 4000px+/8MB+, which is
 *  pure waste over this connection for no gain in what the model can
 *  actually read off it. */
function toDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("could not read the photo"));
    reader.onload = () => {
      img.onerror = () => reject(new Error("could not read the photo"));
      img.onload = () => {
        const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("could not read the photo"));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * "Import photo" on the Enter screen -- see the API's lib/scorecardOcr.ts
 * for why this exists (no scoring app worth using has an export; a photo
 * is the only thing that ever leaves one, or a paper card). Reads a
 * scorecard photo, shows every hole it found as an editable grid, and
 * only touches real data once "Apply" is tapped -- at which point it's
 * just a batch of the same enqueue calls a manual tap makes, through
 * `onApply`, which the Enter screen already owns.
 */
export default function ScorecardImport({
  match,
  onApply,
  onClose,
}: {
  match: MatchDetail;
  /** Writes the confirmed rows through the same enqueue+flush path a
   *  manual tap uses -- owned by MatchScreen, not this component, so
   *  there's exactly one place hole_score ever gets written from. */
  onApply: (entries: { playerId: string; holeNumber: number; gross: number | null }[]) => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);

  const onFile = async (file: File) => {
    setError(null);
    setBusy(true);
    try {
      const dataUrl = await toDataUrl(file);
      const result = await api.scorecardOcr(match.matchId, dataUrl, getStoredJoinCode() ?? undefined);
      setNote(result.note);
      setRows(
        result.readings.map((r: OcrReading) => ({
          playerName: r.playerName,
          playerId: r.playerId,
          holeNumber: r.holeNumber,
          gross: r.gross,
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!rows) {
    return (
      <div className="ocr-import">
        <div className="ocr-import-header">
          <h3>Import from a photo</h3>
          <button className="ocr-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <p className="ocr-hint">
          A screenshot from another scoring app, or a photo of a paper card. Every hole it can read comes back
          editable before anything is saved.
        </p>
        <label className="ocr-file-btn">
          {busy ? "Reading scorecard…" : "Choose a photo"}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onFile(file);
              e.target.value = "";
            }}
          />
        </label>
        {error && <p className="ocr-error">{error}</p>}
      </div>
    );
  }

  const holeNumbers = [...new Set(rows.map((r) => r.holeNumber))].sort((a, b) => a - b);
  // Group by whatever the photo called the player -- one column per name
  // read, not per match.players, so a name the model couldn't match still
  // gets its own column to fix rather than disappearing.
  const names = [...new Set(rows.map((r) => r.playerName))];

  const cell = (name: string, hole: number) => rows.find((r) => r.playerName === name && r.holeNumber === hole);

  const setCell = (name: string, hole: number, patch: Partial<Row>) => {
    setRows((prev) =>
      (prev ?? []).map((r) => (r.playerName === name && r.holeNumber === hole ? { ...r, ...patch } : r)),
    );
  };

  const ready = rows.filter((r) => r.playerId && r.gross !== null);
  const unresolved = names.filter((n) => rows.some((r) => r.playerName === n && !r.playerId));

  return (
    <div className="ocr-import">
      <div className="ocr-import-header">
        <h3>Review before applying</h3>
        <button className="ocr-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>

      {note && <p className="ocr-note">Reader's note: {note}</p>}

      {unresolved.length > 0 && (
        <p className="ocr-note">
          {unresolved.join(", ")} {unresolved.length === 1 ? "wasn't" : "weren't"} matched to anyone in this match --
          pick a player below or those rows are skipped.
        </p>
      )}

      <div className="ocr-grid-wrap">
        <table className="ocr-grid">
          <thead>
            <tr>
              <th>Hole</th>
              {names.map((name) => {
                const sample = rows.find((r) => r.playerName === name);
                return (
                  <th key={name}>
                    {sample?.playerId ? (
                      match.players.find((p) => p.playerId === sample.playerId)?.name ?? name
                    ) : (
                      <select
                        className="ocr-player-select"
                        value=""
                        onChange={(e) => {
                          const playerId = e.target.value || null;
                          setRows((prev) => (prev ?? []).map((r) => (r.playerName === name ? { ...r, playerId } : r)));
                        }}
                      >
                        <option value="">"{name}" — pick who</option>
                        {match.players.map((p) => (
                          <option key={p.playerId} value={p.playerId}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {holeNumbers.map((hole) => (
              <tr key={hole}>
                <td className="ocr-hole-col">{hole}</td>
                {names.map((name) => {
                  const r = cell(name, hole);
                  return (
                    <td key={name}>
                      <input
                        className="ocr-cell-input"
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={20}
                        value={r?.gross ?? ""}
                        placeholder="–"
                        onChange={(e) => {
                          const v = e.target.value;
                          setCell(name, hole, { gross: v === "" ? null : Number(v) });
                        }}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="ocr-actions">
        <button className="admin-text-btn" onClick={() => setRows(null)}>
          Try another photo
        </button>
        <button
          className="who-option code-submit"
          disabled={ready.length === 0}
          onClick={() => {
            onApply(
              ready.map((r) => ({ playerId: r.playerId as string, holeNumber: r.holeNumber, gross: r.gross })),
            );
            onClose();
          }}
        >
          Apply {ready.length} score{ready.length === 1 ? "" : "s"}
        </button>
      </div>
    </div>
  );
}
