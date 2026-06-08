import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";

const apiBaseUrl = import.meta.env.VITE_AUDITY_API_URL ?? "";

export function useApi() {
  const { accessToken, csrfToken, expireSession } = useAuth();
  const navigate = useNavigate();

  return useCallback(
    async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
      const headers = new Headers(init.headers);
      if (accessToken) {
        headers.set("Authorization", `Bearer ${accessToken}`);
      }
      if (csrfToken && init.method && init.method !== "GET") {
        headers.set("X-CSRF-Token", csrfToken);
      }
      if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }
      const response = await fetch(`${apiBaseUrl}${path}`, {
        ...init,
        credentials: "include",
        headers
      });
      if (!response.ok) {
        const error = (await response.json().catch(() => null)) as { code?: string; message?: string } | null;
        if (
          response.status === 401 ||
          (response.status === 403 && error?.code === "CSRF_INVALID")
        ) {
          expireSession("Your session expired. Please sign in again.");
          navigate("/login", { replace: true });
        }
        throw new Error(error?.message ?? `Request failed: ${response.status}`);
      }
      return (await response.json()) as T;
    },
    [accessToken, csrfToken, expireSession, navigate]
  );
}
