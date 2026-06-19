import { useEffect, useState } from "react";

const tooltipDictionary: Array<[RegExp, string]> = [
  [/change password/i, "Update your password after confirming the current one."],
  [/current password/i, "Enter the password you use to sign in today."],
  [/new password/i, "Choose a new password with at least 8 characters."],
  [/confirm password/i, "Repeat the new password so typos are caught before saving."],
  [/tooltips/i, "Show or hide small help text when hovering controls."],
  [/user settings/i, "Open your personal account and interface preferences."],
  [/notifications/i, "Open recent system messages and review reminders."],
  [/logout|sign out/i, "End this browser session and return to the login screen."],
  [/dashboard/i, "Open the overview with current audit metrics."],
  [/customers/i, "Open the customer and assessment workspace."],
  [/activity log/i, "Review traceable application events and workflow changes."],
  [/audit log/i, "Review security relevant events such as login and password activity."],
  [/user management/i, "Manage users, roles, status, and visible permissions."],
  [/apply/i, "Apply the selected filters to the current list."],
  [/export/i, "Download the currently shown data as a file."],
  [/verify hash/i, "Check whether the activity log hash chain is still intact."],
  [/invite/i, "Create a new user with the entered role and temporary password."],
  [/disable/i, "Disable this account so the user can no longer sign in."],
  [/save/i, "Store the changes shown in this form."],
  [/confirm finding/i, "Mark this suggested finding as confirmed by the reviewer."],
  [/mark residual risk accepted/i, "Record that the remaining risk is knowingly accepted."],
  [/reject finding/i, "Dismiss this finding while keeping an audit trail."],
  [/risk register/i, "Review, edit, import, export, and track assessment risks."],
  [/export csv/i, "Download the risk register as a CSV file."],
  [/csv template/i, "Download a CSV template for importing risks."],
  [/import csv/i, "Upload a CSV file and add its risks to this assessment."],
  [/clear filter/i, "Remove the matrix filter and show all risks again."],
  [/likelihood/i, "Set how probable the risk scenario is on a 1 to 5 scale."],
  [/impact/i, "Set the expected business impact on a 1 to 5 scale."],
  [/treatment/i, "Choose whether to mitigate, accept, transfer, or avoid the risk."],
  [/owner/i, "Name the person or team responsible for this item."],
  [/due date/i, "Set the target date for completing this action."],
  [/treatment plan/i, "Describe the concrete steps planned for this risk."],
  [/add review note/i, "Write a review comment that stays with this item."],
  [/auto-generate/i, "Create roadmap actions from high and critical risks."],
  [/generate from risk/i, "Create a roadmap action for the selected risk."],
  [/backup/i, "Create or manage backup and restore jobs."],
  [/restore/i, "Check or start a restore process from an existing backup."]
];

function tooltipFor(element: Element): string {
  const explicit = element.getAttribute("aria-label") || element.getAttribute("name");
  const text = element.textContent?.replace(/\s+/g, " ").trim();
  const tag = element.tagName.toLowerCase();
  const label = explicit || text;
  if (label) {
    const match = tooltipDictionary.find(([pattern]) => pattern.test(label));
    if (match) return match[1];
  }
  return "";
}

export function useTooltips() {
  const [enabled, setEnabled] = useState(() => window.localStorage.getItem("audity_tooltips_enabled") !== "false");

  useEffect(() => {
    const sync = () => setEnabled(window.localStorage.getItem("audity_tooltips_enabled") !== "false");
    window.addEventListener("audity-tooltips-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("audity-tooltips-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("audity-tooltips-off", !enabled);
    if (!enabled) return;
    let tooltip = document.getElementById("audity-tooltip-layer");
    if (!tooltip) {
      tooltip = document.createElement("div");
      tooltip.id = "audity-tooltip-layer";
      tooltip.className = "audity-tooltip-layer";
      document.body.appendChild(tooltip);
    }
    const scopeRoot = () => document.getElementById("audity-main") ?? document.body;
    const annotateOnDemand = (target: Element) => {
      if (target.hasAttribute("data-tooltip")) return;
      if (target.closest("[data-tooltip-skip]")) return;
      const text = tooltipFor(target);
      if (text) target.setAttribute("data-tooltip", text);
    };
    let scheduled = false;
    const scheduleAnnotate = () => {
      if (scheduled) return;
      scheduled = true;
      const run = () => {
        scheduled = false;
        scopeRoot().querySelectorAll("button, a, input, select, textarea, label").forEach(annotateOnDemand);
      };
      window.requestIdleCallback?.(run, { timeout: 500 }) ?? window.setTimeout(run, 250);
    };
    scheduleAnnotate();
    const show = (event: Event) => {
      if (!tooltip) return;
      const target = event.target instanceof Element ? event.target.closest("[data-tooltip]") : null;
      if (!target) return;
      const text = target.getAttribute("data-tooltip");
      if (!text) return;
      const rect = target.getBoundingClientRect();
      tooltip.textContent = text;
      tooltip.style.display = "block";
      const top = Math.max(8, rect.top + window.scrollY - tooltip.offsetHeight - 8);
      const left = Math.min(window.innerWidth - tooltip.offsetWidth - 12, Math.max(8, rect.left + window.scrollX));
      tooltip.style.top = `${top}px`;
      tooltip.style.left = `${left}px`;
    };
    const hide = () => {
      if (tooltip) tooltip.style.display = "none";
    };
    const observer = new MutationObserver(scheduleAnnotate);
    observer.observe(scopeRoot(), { childList: true, subtree: true });
    document.addEventListener("mouseover", show);
    document.addEventListener("focusin", show);
    document.addEventListener("mouseout", hide);
    document.addEventListener("focusout", hide);
    document.addEventListener("scroll", hide, true);
    return () => {
      observer.disconnect();
      document.removeEventListener("mouseover", show);
      document.removeEventListener("focusin", show);
      document.removeEventListener("mouseout", hide);
      document.removeEventListener("focusout", hide);
      document.removeEventListener("scroll", hide, true);
    };
  }, [enabled]);
}
