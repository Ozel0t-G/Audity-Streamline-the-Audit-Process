import { useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";

const apiBaseUrl = import.meta.env.VITE_AUDITY_API_URL ?? "";

export function useApi() {
  const { accessToken, csrfToken, expireSession, refreshSession } = useAuth();
  const navigate = useNavigate();

  const tokenRef = useRef({ accessToken, csrfToken });
  useEffect(() => {
    tokenRef.current = { accessToken, csrfToken };
  }, [accessToken, csrfToken]);

  return useCallback(
    async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
      const send = async (token: string | null, csrf: string | null) => {
        const headers = new Headers(init.headers);
        if (token) {
          headers.set("Authorization", `Bearer ${token}`);
        }
        if (csrf && init.method && init.method !== "GET") {
          headers.set("X-CSRF-Token", csrf);
        }
        if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
          headers.set("Content-Type", "application/json");
        }
        return fetch(`${apiBaseUrl}${path}`, {
          ...init,
          credentials: "include",
          headers
        });
      };

      const initialTokens = tokenRef.current;
      let response = await send(initialTokens.accessToken, initialTokens.csrfToken);
      let error = (await response.json().catch(() => null)) as { code?: string; message?: string } | null;
      let refreshFailed = false;

      if (
        !response.ok &&
        (response.status === 401 || (response.status === 403 && error?.code === "CSRF_INVALID"))
      ) {
        const refreshed = await refreshSession();
        if (refreshed) {
          response = await send(refreshed.accessToken, refreshed.csrfToken);
          error = (await response.json().catch(() => null)) as { code?: string; message?: string } | null;
        } else {
          refreshFailed = true;
        }
      }

      if (!response.ok) {
        // Only log the user out when the *refresh itself* failed — meaning the
        // session is truly dead. A 401 on a single endpoint after a successful
        // refresh is a permission issue on that endpoint, not a session expiry.
        if (refreshFailed && initialTokens.accessToken) {
          expireSession("Your session expired. Please sign in again.");
          navigate("/login", { replace: true });
        }
        throw new Error(error?.message ?? `Request failed: ${response.status}`);
      }
      return error as T;
    },
    // Identity-stable: token changes go through tokenRef, not through deps.
    // refreshSession/expireSession are themselves stable (useCallback with []).
    [expireSession, navigate, refreshSession]
  );
}
