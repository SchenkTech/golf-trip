import { useEffect, useState } from "react";
import type { MatchDetail } from "./api.ts";
import { layoutReadings, matchPlayerName } from "./lib/scorecardOcr.ts";
import type { OcrWord } from "./lib/scorecardOcr.ts";
import { recognizeScorecard } from "./lib/tesseractRecognize.ts";
import "./ScorecardImport.css";

/** One editable cell, addressed by its column position (not yet a real
 *  player) and its OWN hole number -- not assumed from row order, because
 *  nothing here knows the photo shows all 18 holes starting at 1. A photo
 *  of just the back nine is a real, normal thing to hand this; the person
 *  says which holes they're looking at, same as they say how many
 *  columns there are. */
interface Cell {
  columnIndex: number;
  holeNumber: number;
  gross: number | null;
}

interface Column {
  columnIndex: number;
  playerId: string | null;
  /** What layoutReadings guessed the header said, shown next to the
   *  picker even when it didn't resolve to anyone -- "guessed: Fx" is
   *  useful context for picking the right player by hand, worse than
   *  useless if just thrown away. */
  headerGuess: string | null;
}

/** Longest edge a photo is resized to before OCR runs. A phone photo can
 *  be 4000px+; Tesseract's own accuracy on small digits improves with
 *  resolution up to a point, but a WASM engine running on a phone's CPU
 *  (no GPU, and typically single-threaded in a browser tab) pays for
 *  every extra pixel in wall-clock time. This is a balance, not a proven
 *  optimum -- worth revisiting once this has been run against real
 *  photos. */
const MAX_EDGE = 2200;

function toDownscaledFile(file: File): Promise<File> {
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
        canvas.toBlob(
          (blob) => (blob ? resolve(new File([blob], file.name, { type: "image/jpeg" })) : reject(new Error("could not read the photo"))),
          "image/jpeg",
          0.92,
        );
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

type Stage =
  | { kind: "idle" }
  | { kind: "recognizing"; progress: number; status: string; previewUrl: string }
  | { kind: "calibrate"; words: OcrWord[]; previewUrl: string; columnCount: number; rowCount: number }
  | { kind: "review"; columns: Column[]; cells: Cell[]; previewUrl: string; words: OcrWord[]; columnCount: number; rowCount: number }
  | { kind: "error"; message: string };

/**
 * "Import photo" on the Enter screen. Reads a scorecard photo entirely on
 * this device -- see docs/DECISIONS.md #9 for why: the group's other
 * scoring app has no export to connect to, so a photo was always the only
 * option, and a hosted vision API was tried and dropped specifically for
 * being this app's first paid, metered, third-party dependency. Local OCR
 * (Tesseract, see lib/tesseractRecognize.ts) has no per-call cost, no
 * account, and the photo never leaves the phone -- the tradeoff is that it
 * has no idea a scorecard is a grid, so lib/scorecardOcr.ts's layout step
 * needs a person to say how many columns and rows the photo actually
 * shows before it can propose readings at all.
 *
 * Nothing gets written until "Apply" -- at which point it's exactly the
 * same batch write a manual tap makes, through `onApply`, which the Enter
 * screen already owns.
 */
export default function ScorecardImport({
  match,
  onApply,
  onClose,
}: {
  match: MatchDetail;
  onApply: (entries: { playerId: string; holeNumber: number; gross: number | null }[]) => void;
  onClose: () => void;
}) {
  const [stage, setStage] = useState<Stage>({ kind: "idle" });

  // Revoke the preview's object URL when it's no longer the one on
  // screen -- these are real memory (a whole decoded image) that a
  // garbage collector won't reclaim on its own until the page unloads.
  useEffect(() => {
    const url = "previewUrl" in stage ? stage.previewUrl : null;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [stage]);

  const onFile = async (file: File) => {
    const previewUrl = URL.createObjectURL(file);
    setStage({ kind: "recognizing", progress: 0, status: "starting", previewUrl });
    try {
      const resized = await toDownscaledFile(file);
      const words = await recognizeScorecard(resized, (p) =>
        setStage((s) => (s.kind === "recognizing" ? { ...s, progress: p.progress, status: p.status } : s)),
      );
      setStage({
        kind: "calibrate",
        words,
        previewUrl,
        columnCount: match.players.length,
        rowCount: match.holes.length,
      });
    } catch (e) {
      setStage({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  };

  const buildGrid = (words: OcrWord[], previewUrl: string, columnCount: number, rowCount: number) => {
    const { readings, columnHeaderGuesses } = layoutReadings(words, columnCount, rowCount);
    const roster = match.players.map((p) => ({ playerId: p.playerId, name: p.name }));
    const columns: Column[] = columnHeaderGuesses.map((guess, columnIndex) => ({
      columnIndex,
      headerGuess: guess,
      playerId: matchPlayerName(guess, roster),
    }));
    const cells: Cell[] = readings.map((r) => ({
      columnIndex: r.columnIndex,
      holeNumber: r.rowIndex + 1, // a starting guess -- see the Cell comment; the person can retarget any row
      gross: r.gross,
    }));
    setStage({ kind: "review", columns, cells, previewUrl, words, columnCount, rowCount });
  };

  if (stage.kind === "idle" || stage.kind === "error") {
    return (
      <div className="ocr-import">
        <div className="ocr-import-header">
          <h3>Import from a photo</h3>
          <button className="ocr-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <p className="ocr-hint">
          A screenshot from another scoring app, or a photo of a paper card. Read entirely on this device -- nothing
          is sent anywhere. You'll say how many columns and holes the photo shows, then fix anything it misread
          before saving.
        </p>
        <label className="ocr-file-btn">
          Choose a photo
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onFile(file);
              e.target.value = "";
            }}
          />
        </label>
        {stage.kind === "error" && <p className="ocr-error">{stage.message}</p>}
      </div>
    );
  }

  if (stage.kind === "recognizing") {
    return (
      <div className="ocr-import">
        <div className="ocr-import-header">
          <h3>Reading photo…</h3>
          <button className="ocr-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="ocr-progress-track">
          <div className="ocr-progress-fill" style={{ width: `${Math.round(stage.progress * 100)}%` }} />
        </div>
        <p className="ocr-hint">
          {stage.status === "recognizing text" ? "Reading the numbers…" : "Loading the reader…"} This runs on your
          device and can take a little while on an older phone.
        </p>
      </div>
    );
  }

  if (stage.kind === "calibrate") {
    return (
      <div className="ocr-import">
        <div className="ocr-import-header">
          <h3>How is the photo laid out?</h3>
          <button className="ocr-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <img className="ocr-preview" src={stage.previewUrl} alt="" />
        <p className="ocr-hint">
          The reader found the numbers; it just doesn't know a scorecard is a grid. Two counts, and it'll lay them
          out for you to fix.
        </p>
        <label className="ocr-calibrate-field">
          Columns (players) in this photo
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={8}
            value={stage.columnCount}
            onChange={(e) => setStage({ ...stage, columnCount: Math.max(1, Number(e.target.value) || 1) })}
          />
        </label>
        <label className="ocr-calibrate-field">
          Rows (holes) in this photo
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={18}
            value={stage.rowCount}
            onChange={(e) => setStage({ ...stage, rowCount: Math.max(1, Number(e.target.value) || 1) })}
          />
        </label>
        <button
          className="who-option code-submit"
          onClick={() => buildGrid(stage.words, stage.previewUrl, stage.columnCount, stage.rowCount)}
        >
          Build grid
        </button>
      </div>
    );
  }

  // stage.kind === "review"
  const { columns, cells, previewUrl, words, columnCount, rowCount } = stage;
  const setCell = (columnIndex: number, holeNumber: number, patch: Partial<Cell>) => {
    setStage({
      ...stage,
      cells: cells.map((c) => (c.columnIndex === columnIndex && c.holeNumber === holeNumber ? { ...c, ...patch } : c)),
    });
  };
  const setColumnPlayer = (columnIndex: number, playerId: string | null) => {
    setStage({ ...stage, columns: columns.map((c) => (c.columnIndex === columnIndex ? { ...c, playerId } : c)) });
  };
  // Sorted for display, not for identity -- a person can retarget any
  // row's hole number, so display order (by whatever it's currently set
  // to) is just a convenience, never assumed elsewhere.
  const rowsByHole = [...new Set(cells.map((c) => c.holeNumber))].sort((a, b) => a - b);
  const ready = cells.filter((c) => {
    const col = columns.find((k) => k.columnIndex === c.columnIndex);
    return col?.playerId && c.gross !== null;
  });

  return (
    <div className="ocr-import">
      <div className="ocr-import-header">
        <h3>Review before applying</h3>
        <button className="ocr-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>

      <div className="ocr-grid-wrap">
        <table className="ocr-grid">
          <thead>
            <tr>
              <th>Hole</th>
              {columns.map((col) => (
                <th key={col.columnIndex}>
                  <select
                    className="ocr-player-select"
                    value={col.playerId ?? ""}
                    onChange={(e) => setColumnPlayer(col.columnIndex, e.target.value || null)}
                  >
                    <option value="">{col.headerGuess ? `guessed "${col.headerGuess}"` : "pick who"}</option>
                    {match.players.map((p) => (
                      <option key={p.playerId} value={p.playerId}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rowsByHole.map((hole) => (
              <tr key={hole}>
                <td>
                  <input
                    className="ocr-cell-input ocr-hole-input"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={18}
                    value={hole}
                    onChange={(e) => {
                      const next = Math.min(18, Math.max(1, Number(e.target.value) || 1));
                      setStage({
                        ...stage,
                        cells: cells.map((c) => (c.holeNumber === hole ? { ...c, holeNumber: next } : c)),
                      });
                    }}
                  />
                </td>
                {columns.map((col) => {
                  const cell = cells.find((c) => c.columnIndex === col.columnIndex && c.holeNumber === hole);
                  return (
                    <td key={col.columnIndex}>
                      <input
                        className="ocr-cell-input"
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={20}
                        value={cell?.gross ?? ""}
                        placeholder="–"
                        onChange={(e) => {
                          const v = e.target.value;
                          setCell(col.columnIndex, hole, { gross: v === "" ? null : Number(v) });
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

      <img className="ocr-preview ocr-preview-small" src={previewUrl} alt="" />

      <div className="ocr-actions">
        <button
          className="admin-text-btn"
          onClick={() => setStage({ kind: "calibrate", words, previewUrl, columnCount, rowCount })}
        >
          Adjust layout
        </button>
        <button
          className="who-option code-submit"
          disabled={ready.length === 0}
          onClick={() => {
            onApply(
              ready.map((c) => {
                const playerId = columns.find((k) => k.columnIndex === c.columnIndex)!.playerId as string;
                return { playerId, holeNumber: c.holeNumber, gross: c.gross };
              }),
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
