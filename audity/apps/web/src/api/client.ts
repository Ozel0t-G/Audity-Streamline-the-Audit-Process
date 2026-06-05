import { useCallback } from "react";
import { useAuth } from "../auth/AuthProvider";

const apiBaseUrl = import.meta.env.VITE_AUDITY_API_URL ?? "";

export function useApi() {
  const { accessToken, csrfToken } = useAuth();

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
        const error = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(error?.message ?? `Request failed: ${response.status}`);
      }
      return (await response.json()) as T;
    },
    [accessToken, csrfToken]
  );
}
