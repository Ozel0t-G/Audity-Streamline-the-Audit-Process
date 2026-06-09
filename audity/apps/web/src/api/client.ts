import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";

const apiBaseUrl = import.meta.env.VITE_AUDITY_API_URL ?? "";

export function useApi() {
  const { accessToken, csrfToken, expireSession, refreshSession } = useAuth();
  const navigate = useNavigate();

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

      let response = await send(accessToken, csrfToken);
      let error = (await response.json().catch(() => null)) as { code?: string; message?: string } | null;
      if (
        !response.ok &&
        (response.status === 401 || (response.status === 403 && error?.code === "CSRF_INVALID"))
      ) {
        const refreshed = await refreshSession();
        if (refreshed) {
          response = await send(refreshed.accessToken, refreshed.csrfToken);
          error = (await response.json().catch(() => null)) as { code?: string; message?: string } | null;
        }
      }
      if (!response.ok) {
        if (
          response.status === 401 ||
          (response.status === 403 && error?.code === "CSRF_INVALID")
        ) {
          expireSession("Your session expired. Please sign in again.");
          navigate("/login", { replace: true });
        }
        throw new Error(error?.message ?? `Request failed: ${response.status}`);
      }
      return error as T;
    },
    [accessToken, csrfToken, expireSession, navigate, refreshSession]
  );
}
