import type { NextAction } from "./actions.js";

const SEVERITY_RANK: Record<NextAction["severity"], number> = {
  critical: 0,
  warning: 1,
  info: 2
};

type CursorPayload = {
  severityRank: number;
  overdueBy: number;
  customerId: string;
  id: string;
};

export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeCursor(value: string | undefined): CursorPayload | null {
  if (!value) return null;
  try {
    const json = Buffer.from(value, "base64url").toString("utf8");
    const obj = JSON.parse(json) as Partial<CursorPayload>;
    if (
      typeof obj.severityRank !== "number" ||
      typeof obj.overdueBy !== "number" ||
      typeof obj.customerId !== "string" ||
      typeof obj.id !== "string"
    ) {
      return null;
    }
    return obj as CursorPayload;
  } catch {
    return null;
  }
}

function compareCursors(a: CursorPayload, b: CursorPayload): number {
  if (a.severityRank !== b.severityRank) return a.severityRank - b.severityRank;
  if (a.overdueBy !== b.overdueBy) return b.overdueBy - a.overdueBy;
  if (a.customerId !== b.customerId) return a.customerId.localeCompare(b.customerId);
  return a.id.localeCompare(b.id);
}

function actionToCursor(action: NextAction): CursorPayload {
  return {
    severityRank: SEVERITY_RANK[action.severity],
    overdueBy: action.overdueBy ?? 0,
    customerId: action.customerId,
    id: action.id
  };
}

export type PaginatedActions = {
  items: NextAction[];
  nextCursor: string | null;
  hasMore: boolean;
};

/**
 * Stable sort + cursor slice.
 * Sort: severity ASC, overdueBy DESC, customerId ASC, id ASC.
 */
export function paginate(
  actions: NextAction[],
  cursor: CursorPayload | null,
  limit: number
): PaginatedActions {
  const sorted = [...actions].sort((a, b) =>
    compareCursors(actionToCursor(a), actionToCursor(b))
  );
  const filtered = cursor
    ? sorted.filter((action) => compareCursors(actionToCursor(action), cursor) > 0)
    : sorted;
  const slice = filtered.slice(0, limit);
  const hasMore = filtered.length > limit;
  const nextCursor = hasMore && slice.length
    ? encodeCursor(actionToCursor(slice[slice.length - 1]))
    : null;
  return { items: slice, nextCursor, hasMore };
}
