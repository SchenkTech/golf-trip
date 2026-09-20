import type { BatchItem } from "drizzle-orm/batch";

/**
 * `db.batch()` requires a non-empty tuple type, not a plain array -- but
 * every real call site here builds its statement list dynamically
 * (`.flatMap`/`.map` over rows fetched first), which TypeScript can only
 * ever infer as `T[]`. This asserts what every call site already relies on
 * (D1 and libSQL both reject an empty batch at runtime too, so this just
 * makes the assumption explicit and fails loudly instead of confusingly).
 */
export function asBatch<T extends BatchItem>(items: T[]): [T, ...T[]] {
  if (items.length === 0) throw new Error("asBatch() called with no statements");
  return items as [T, ...T[]];
}
