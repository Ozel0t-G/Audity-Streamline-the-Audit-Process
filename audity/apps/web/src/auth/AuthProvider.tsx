import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

const apiBaseUrl = import.meta.env.VITE_AUDITY_API_URL ?? "http://localhost:3000";

type User = {
  sub?: string;
  id?: string;
  email: string;
  role: string;
  permissions: string[];
};

type AuthContextValue = {
  accessToken: string | null;
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(() =>
    window.localStorage.getItem("audity_access_token")
  );
  const [user, setUser] = useState<User | null>(() => {
    const stored = window.localStorage.getItem("audity_user");
    return stored ? (JSON.parse(stored) as User) : null;
  });

  const login = useCallback(async (email: string, password: string) => {
    const response = await fetch(`${apiBaseUrl}/api/auth/login`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    if (!response.ok) {
      const error = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new Error(error?.message ?? "Login failed");
    }
    const payload = (await response.json()) as { accessToken: string; user: User };
    window.localStorage.setItem("audity_access_token", payload.accessToken);
    window.localStorage.setItem("audity_user", JSON.stringify(payload.user));
    setAccessToken(payload.accessToken);
    setUser(payload.user);
  }, []);

  const logout = useCallback(async () => {
    await fetch(`${apiBaseUrl}/api/auth/logout`, {
      method: "POST",
      credentials: "include",
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined
    });
    window.localStorage.removeItem("audity_access_token");
    window.localStorage.removeItem("audity_user");
    setAccessToken(null);
    setUser(null);
  }, [accessToken]);

  const value = useMemo(
    () => ({ accessToken, user, login, logout }),
    [accessToken, user, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
