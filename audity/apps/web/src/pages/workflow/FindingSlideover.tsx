import { useEffect, useState } from "react";
import { useApi } from "../../api/client";
import { Slideover, useToast } from "../../components/ui";
import type { Finding, HistoryEvent, ReviewComment } from "./types";
import {
  FINDING_STATUS_LABEL,
  legalNextFindingStatuses,
  type FindingStatus
} from "./transitions";

const findingPriorities = ["low", "medium", "high", "critical"];

type Props = {
  open: boolean;
  assessmentId: string;
  finding: Finding | null;
  canEdit: boolean;
  onClose: () => void;
  onChanged: () => void;
};

const POSITIVE_TRANSITIONS: FindingStatus[] = ["in_review", "confirmed", "approved"];
const NEUTRAL_TRANSITIONS: FindingStatus[] = ["needs_changes"];
const DESTRUCTIVE_TRANSITIONS: FindingStatus[] = ["dismissed"];

function transitionLabel(target: FindingStatus): string {
  switch (target) {
    case "in_review":
      return "Mark in review";
    case "needs_changes":
      return "Send back: needs changes";
    case "confirmed":
      return "Confirm finding";
    case "approved":
      return "Approve for report";
    case "dismissed":
      return "Reject finding";
    case "suggested":
      return "Move to suggested";
    default:
      return target;
  }
}

export function FindingSlideover({ open, assessmentId, finding, canEdit, onClose, onChanged }: Props) {
  const api = useApi();
  const toast = useToast();
  const [form, setForm] = useState({
    title: "",
    priority: "medium",
    observation: "",
    recommendation: ""
  });
  const [history, setHistory] = useState<HistoryEvent[]>([]);
  const [comments, setComments] = useState<ReviewComment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [showComments, setShowComments] = useState(true);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!finding) return;
    setForm({
      title: finding.title,
      priority: finding.priority ?? "medium",
      observation: finding.observation ?? "",
      recommendation: finding.recommendation ?? ""
    });
  }, [finding]);

  useEffect(() => {
    if (!finding || !open) return;
    // Guard against a stale response overwriting a newer finding's history/comments
    // when the slideover's finding changes faster than a fetch resolves.
    let cancelled = false;
    void api<{ history: HistoryEvent[] }>(
      `/api/assessments/${assessmentId}/history?entityType=finding&entityId=${finding.id}`
    )
      .then((payload) => { if (!cancelled) setHistory(payload.history); })
      .catch(() => { if (!cancelled) setHistory([]); });
    void api<{ comments: ReviewComment[] }>(
      `/api/assessments/${assessmentId}/comments?entityType=finding&entityId=${finding.id}`
    )
      .then((payload) => { if (!cancelled) setComments(payload.comments); })
      .catch(() => { if (!cancelled) setComments([]); });
    return () => { cancelled = true; };
  }, [api, assessmentId, finding, open]);

  if (!finding) return null;

  const currentStatus = finding.status as FindingStatus;
  const nextStatuses = legalNextFindingStatuses(currentStatus);
  const positive = nextStatuses.filter((s) => POSITIVE_TRANSITIONS.includes(s));
  const neutral = nextStatuses.filter((s) => NEUTRAL_TRANSITIONS.includes(s));
  const destructive = nextStatuses.filter((s) => DESTRUCTIVE_TRANSITIONS.includes(s));

  async function transition(target: FindingStatus) {
    setWorking(true);
    try {
      await api(`/api/assessments/${assessmentId}/findings/${finding!.id}`, {
        method: "PUT",
        body: JSON.stringify({ action: "edit", status: target })
      });
      toast.success(`Moved to ${FINDING_STATUS_LABEL[target]}`);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Status change failed");
    } finally {
      setWorking(false);
    }
  }

  async function saveEdits() {
    setWorking(true);
    try {
      await api(`/api/assessments/${assessmentId}/findings/${finding!.id}`, {
        method: "PUT",
        body: JSON.stringify({ action: "edit", ...form })
      });
      toast.success("Saved");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setWorking(false);
    }
  }

  async function addComment() {
    if (!newComment.trim()) return;
    try {
      await api(`/api/assessments/${assessmentId}/comments`, {
        method: "POST",
        body: JSON.stringify({
          entityType: "finding",
          entityId: finding!.id,
          comment: newComment.trim()
        })
      });
      const refreshed = await api<{ comments: ReviewComment[] }>(
        `/api/assessments/${assessmentId}/comments?entityType=finding&entityId=${finding!.id}`
      );
      setComments(refreshed.comments);
      setNewComment("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Comment failed");
    }
  }

  return (
    <Slideover
      open={open}
      onClose={onClose}
      title={finding.title}
      width="lg"
    >
      <div className="space-y-4">
        <header className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-audity-primary">
            {finding.controlCode ?? "Untracked"} · {FINDING_STATUS_LABEL[currentStatus]}
          </p>
          {finding.sourceExplanation ? (
            <p className="text-xs text-audity-muted">{finding.sourceExplanation}</p>
          ) : null}
        </header>

        {/* Status transitions */}
        {canEdit && nextStatuses.length ? (
          <section className="rounded-audity border border-audity-border bg-audity-page p-3">
            <p className="audity-page-kicker mb-2">Move to</p>
            <div className="flex flex-wrap gap-2">
              {positive.map((target) => (
                <button
                  key={target}
                  className="audity-btn-primary text-xs"
                  disabled={working}
                  onClick={() => void transition(target)}
                >
                  {transitionLabel(target)}
                </button>
              ))}
              {neutral.map((target) => (
                <button
                  key={target}
                  className="audity-btn-secondary border-audity-warning text-xs text-audity-warning hover:border-audity-warning"
                  disabled={working}
                  onClick={() => void transition(target)}
                >
                  {transitionLabel(target)}
                </button>
              ))}
              {destructive.length ? (
                <div className="ml-auto flex gap-2">
                  {destructive.map((target) => (
                    <button
                      key={target}
                      className="audity-btn-secondary border-audity-error text-xs text-audity-error hover:bg-audity-error/10"
                      disabled={working}
                      onClick={() => void transition(target)}
                    >
                      {transitionLabel(target)}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {/* Edit form */}
        <section className="rounded-audity border border-audity-border bg-audity-page p-3">
          <p className="audity-page-kicker mb-2">Details</p>
          <label className="mb-2 block text-xs font-medium text-audity-secondary">
            Title
            <input
              className="audity-input mt-1"
              value={form.title}
              disabled={!canEdit}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
            />
          </label>
          <label className="mb-2 block text-xs font-medium text-audity-secondary">
            Priority
            <select
              className="audity-input mt-1"
              value={form.priority}
              disabled={!canEdit}
              onChange={(event) => setForm({ ...form, priority: event.target.value })}
            >
              {findingPriorities.map((priority) => (
                <option key={priority} value={priority}>
                  {priority}
                </option>
              ))}
            </select>
          </label>
          <label className="mb-2 block text-xs font-medium text-audity-secondary">
            Observation
            <textarea
              className="audity-input mt-1 min-h-[80px]"
              value={form.observation}
              disabled={!canEdit}
              onChange={(event) => setForm({ ...form, observation: event.target.value })}
            />
          </label>
          <label className="mb-2 block text-xs font-medium text-audity-secondary">
            Recommendation
            <textarea
              className="audity-input mt-1 min-h-[80px]"
              value={form.recommendation}
              disabled={!canEdit}
              onChange={(event) => setForm({ ...form, recommendation: event.target.value })}
            />
          </label>
          {canEdit ? (
            <button
              className="audity-btn-primary text-xs"
              disabled={working}
              onClick={() => void saveEdits()}
            >
              Save details
            </button>
          ) : null}
        </section>

        {/* Framework mapping */}
        {finding.mappings.length ? (
          <section className="rounded-audity border border-audity-border bg-audity-page p-3">
            <p className="audity-page-kicker mb-2">Framework mapping</p>
            <ul className="space-y-1 text-xs">
              {finding.mappings.map((mapping) => (
                <li
                  key={`${mapping.controlId}-${mapping.code}`}
                  className="flex items-baseline justify-between gap-3"
                >
                  <span className="font-semibold text-audity-primary">{mapping.code}</span>
                  <span className="text-audity-secondary">{mapping.title}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Comments accordion */}
        <section className="rounded-audity border border-audity-border bg-audity-page p-3">
          <button
            type="button"
            className="flex w-full items-center justify-between"
            onClick={() => setShowComments((v) => !v)}
          >
            <p className="audity-page-kicker">Comments ({comments.length})</p>
            <span className="text-xs text-audity-muted">{showComments ? "▾" : "▸"}</span>
          </button>
          {showComments ? (
            <div className="mt-2 space-y-2">
              {comments.length ? (
                <ul className="space-y-2 text-xs">
                  {comments.map((comment) => (
                    <li
                      key={comment.id}
                      className="rounded-audity border border-audity-border bg-audity-panel p-2"
                    >
                      <p className="text-audity-secondary">{comment.comment}</p>
                      <p className="mt-1 text-[10px] text-audity-muted">
                        {comment.userEmail ?? "—"} · {new Date(comment.createdAt).toLocaleString()}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-audity-muted">No comments.</p>
              )}
              {canEdit ? (
                <div className="flex gap-2">
                  <input
                    className="audity-input flex-1"
                    placeholder="Add review note"
                    value={newComment}
                    onChange={(event) => setNewComment(event.target.value)}
                  />
                  <button
                    className="audity-btn-secondary text-xs"
                    onClick={() => void addComment()}
                  >
                    Add
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>

        {/* History accordion */}
        <section className="rounded-audity border border-audity-border bg-audity-page p-3">
          <button
            type="button"
            className="flex w-full items-center justify-between"
            onClick={() => setShowHistory((v) => !v)}
          >
            <p className="audity-page-kicker">Change history ({history.length})</p>
            <span className="text-xs text-audity-muted">{showHistory ? "▾" : "▸"}</span>
          </button>
          {showHistory ? (
            <ul className="mt-2 space-y-1.5 text-xs">
              {history.length ? (
                history.map((event) => (
                  <li
                    key={event.id}
                    className="rounded-audity border border-audity-border bg-audity-panel p-2"
                  >
                    <p className="font-semibold text-audity-secondary">{event.action}</p>
                    <p className="text-[10px] text-audity-muted">
                      {event.userEmail ?? "—"} · {new Date(event.createdAt).toLocaleString()}
                    </p>
                  </li>
                ))
              ) : (
                <li className="text-audity-muted">No history yet.</li>
              )}
            </ul>
          ) : null}
        </section>
      </div>
    </Slideover>
  );
}
