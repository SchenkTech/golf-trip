import type { OcrWord } from "./scorecardOcr.ts";

/**
 * The one file that actually talks to Tesseract -- a thin, un-unit-tested
 * wrapper (there's no way to run real OCR inside `node --test` without a
 * browser and a multi-megabyte WASM download, so this stays a shell
 * around a well-documented library call; scorecardOcr.ts holds everything
 * that IS worth testing without one).
 *
 * Dynamically imported (see ScorecardImport.tsx), not a static import at
 * the top of this app -- tesseract.js pulls in its own WASM core and
 * trained-language data on first use, multiple megabytes nobody who never
 * opens "Import photo" should have to download before the Board even
 * renders.
 *
 * Where those pieces come from, and why they're not all self-hosted:
 * tesseract.js's own default is to fetch all three -- its worker script,
 * the WASM recognition engine, and the English trained-data file -- from
 * cdn.jsdelivr.net the first time a page uses it. That default was never
 * meant to leave silently: it's a free, static, no-account CDN fetch of
 * open-source engine files, categorically different from the earlier
 * design's metered, account-requiring vision API (see docs/DECISIONS.md
 * #9), and no PHOTO or score data is ever part of it -- but it is still an
 * external fetch that wasn't disclosed anywhere, which isn't good enough.
 *
 * WORKER_PATH below is this app's own copy (public/tesseract/worker.min.js,
 * ~109KB), served from this same origin -- cheap enough to bundle and it
 * fully removes that one fetch. CORE_PATH and the trained-data file are
 * left on the CDN default: the WASM engine alone is ~3.8MB and the English
 * trained data ~11MB, and vite-plugin-pwa's injectManifest globs
 * `**\/*.js` into the PWA's PRECACHE -- the list every visitor downloads
 * on first load, whether or not they ever touch "Import photo." Bundling
 * the WASM file under this app's own assets would sweep it into that list
 * and add megabytes to install size for a feature most visits never use.
 * The CDN fetch happens once per device -- Tesseract's own worker caches
 * the trained-data file in IndexedDB after the first successful load (see
 * its worker-script/index.js) -- and is worth revisiting if this app ever
 * gains a real asset-serving story that can keep large, rarely-used files
 * out of the eager precache.
 */

/** This app's own copy of tesseract.js's worker script -- see the module
 *  comment above for why this one file is self-hosted and the rest
 *  aren't. */
const WORKER_PATH = "/tesseract/worker.min.js";

export interface RecognizeProgress {
  status: string;
  progress: number; // 0..1
}

/** Runs OCR on one image and flattens Tesseract's nested block -> paragraph
 *  -> line -> word structure into the flat word list scorecardOcr.ts's
 *  layoutReadings actually works with -- it only ever needs text,
 *  confidence and a bounding box, not the document structure they came
 *  wrapped in. */
export async function recognizeScorecard(
  image: File | Blob,
  onProgress?: (p: RecognizeProgress) => void,
): Promise<OcrWord[]> {
  const { createWorker, PSM } = await import("tesseract.js");

  const worker = await createWorker("eng", 1, {
    workerPath: WORKER_PATH,
    logger: onProgress
      ? (m) => {
          if (typeof m.progress === "number") onProgress({ status: m.status, progress: m.progress });
        }
      : undefined,
  });

  try {
    // Scattered short fragments in cells, not flowing prose -- SPARSE_TEXT
    // tells Tesseract's layout analysis not to assume the image is one
    // paragraph, which is the wrong assumption for a grid of numbers.
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });

    const { data } = await worker.recognize(image, {}, { blocks: true });

    const words: OcrWord[] = [];
    for (const block of data.blocks ?? []) {
      for (const paragraph of block.paragraphs) {
        for (const line of paragraph.lines) {
          for (const word of line.words) {
            words.push({
              text: word.text,
              confidence: word.confidence,
              x0: word.bbox.x0,
              y0: word.bbox.y0,
              x1: word.bbox.x1,
              y1: word.bbox.y1,
            });
          }
        }
      }
    }
    return words;
  } finally {
    // Always terminate, even on failure -- an abandoned worker keeps its
    // WASM instance alive in the tab for as long as the page stays open,
    // which on a phone browser is exactly the kind of thing that gets an
    // app blamed for "eating battery."
    await worker.terminate();
  }
}
