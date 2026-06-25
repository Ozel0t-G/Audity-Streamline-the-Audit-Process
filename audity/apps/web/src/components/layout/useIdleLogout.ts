import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useApi } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";

export function useIdleLogout() {
  const api = useApi();
  const { accessToken, logout } = useAuth();
  const navigate = useNavigate();
  // Only the logged-in/out transition should (re)arm the idle timer. Depending on
  // the access token itself would reset the 30-min timer on every proactive token
  // refresh (~12 min) — shorter than the timeout — so idle logout would never fire.
  const isAuthenticated = Boolean(accessToken);

  // Access the latest logout/api via refs so the effect doesn't re-run (and reset
  // the timer) when these identities change on a token refresh.
  const logoutRef = useRef(logout);
  logoutRef.current = logout;
  const apiRef = useRef(api);
  apiRef.current = api;

  useEffect(() => {
    if (!isAuthenticated) return;
    let timer: number | undefined;
    let cancelled = false;
    let timeoutMinutes = 30;
    const activityEvents = ["click", "keydown", "mousemove", "scroll", "touchstart"];

    const schedule = () => {
      if (cancelled) return;
      window.clearTimeout(timer);
      const minutes = Math.max(1, Math.min(180, timeoutMinutes));
      timer = window.setTimeout(() => {
        void logoutRef.current().finally(() => {
          window.localStorage.setItem("audity_login_notice", "Your session timed out because of inactivity.");
          navigate("/login", { replace: true });
        });
      }, minutes * 60 * 1000);
    };

    const loadTimeout = async () => {
      const payload = await apiRef.current<{ sessionIdleTimeoutMinutes: number }>("/api/system/session-timeout").catch(() => ({
        sessionIdleTimeoutMinutes: 30
      }));
      if (cancelled) return;
      // Guard against a malformed-but-successful response. A non-numeric setting
      // serialises to JSON `null` (and a missing field is `undefined`), which would
      // make schedule()'s Math.min/Math.max produce 1 minute or NaN — the latter
      // makes setTimeout fire immediately, logging the user out almost at once.
      const minutes = Number(payload.sessionIdleTimeoutMinutes);
      timeoutMinutes = Number.isFinite(minutes) && minutes > 0 ? minutes : 30;
      schedule();
    };

    void loadTimeout();
    activityEvents.forEach((eventName) => window.addEventListener(eventName, reset, { passive: true }));
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, reset));
    };

    function reset() {
      schedule();
    }
  }, [isAuthenticated, navigate]);
}
