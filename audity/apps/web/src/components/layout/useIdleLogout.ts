import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useApi } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";

export function useIdleLogout() {
  const api = useApi();
  const { accessToken, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!accessToken) return;
    let timer: number | undefined;
    let cancelled = false;
    let timeoutMinutes = 30;
    const activityEvents = ["click", "keydown", "mousemove", "scroll", "touchstart"];

    const schedule = () => {
      if (cancelled) return;
      window.clearTimeout(timer);
      const minutes = Math.max(1, Math.min(180, timeoutMinutes));
      timer = window.setTimeout(() => {
        void logout().finally(() => {
          window.localStorage.setItem("audity_login_notice", "Your session timed out because of inactivity.");
          navigate("/login", { replace: true });
        });
      }, minutes * 60 * 1000);
    };

    const loadTimeout = async () => {
      const payload = await api<{ sessionIdleTimeoutMinutes: number }>("/api/system/session-timeout").catch(() => ({
        sessionIdleTimeoutMinutes: 30
      }));
      if (cancelled) return;
      timeoutMinutes = payload.sessionIdleTimeoutMinutes;
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
  }, [accessToken, api, logout, navigate]);
}
