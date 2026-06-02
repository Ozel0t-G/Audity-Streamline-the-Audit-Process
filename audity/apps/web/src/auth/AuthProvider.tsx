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
  csrfToken: string | null;
  user: User | null;
  login: (email: string, password: string) => Promise<{ mfaRequired: false } | { mfaRequired: true; challengeToken: string }>;
  verifyMfaChallenge: (challengeToken: string, code: string) => Promise<void>;
  setupMfa: () => Promise<{ secret: string; otpauthUrl: string; qrCodeDataUrl: string }>;
  verifyMfaSetup: (code: string) => Promise<string[]>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(() =>
    window.localStorage.getItem("audity_access_token")
  );
  const [csrfToken, setCsrfToken] = useState<string | null>(() =>
    window.localStorage.getItem("audity_csrf_token")
  );
  const [user, setUser] = useState<User | null>(() => {
    const stored = window.localStorage.getItem("audity_user");
    return stored ? (JSON.parse(stored) as User) : null;
  });

  function storeSession(payload: { accessToken: string; csrfToken: string; user: User }) {
    window.localStorage.setItem("audity_access_token", payload.accessToken);
    window.localStorage.setItem("audity_csrf_token", payload.csrfToken);
    window.localStorage.setItem("audity_user", JSON.stringify(payload.user));
    setAccessToken(payload.accessToken);
    setCsrfToken(payload.csrfToken);
    setUser(payload.user);
  }

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
    const payload = (await response.json()) as
      | { mfaRequired: true; challengeToken: string }
      | { accessToken: string; csrfToken: string; user: User };
    if ("mfaRequired" in payload) {
      return payload;
    }
    storeSession(payload);
    return { mfaRequired: false as const };
  }, []);

  const verifyMfaChallenge = useCallback(async (challengeToken: string, code: string) => {
    const response = await fetch(`${apiBaseUrl}/api/auth/mfa/verify`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challengeToken, code })
    });
    if (!response.ok) {
      const error = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new Error(error?.message ?? "MFA verification failed");
    }
    storeSession((await response.json()) as { accessToken: string; csrfToken: string; user: User });
  }, []);

  const setupMfa = useCallback(async () => {
    const response = await fetch(`${apiBaseUrl}/api/auth/mfa/setup`, {
      method: "POST",
      credentials: "include",
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined
    });
    if (!response.ok) {
      throw new Error("MFA setup failed");
    }
    return (await response.json()) as { secret: string; otpauthUrl: string; qrCodeDataUrl: string };
  }, [accessToken]);

  const verifyMfaSetup = useCallback(async (code: string) => {
    const response = await fetch(`${apiBaseUrl}/api/auth/mfa/verify`, {
      method: "POST",
      credentials: "include",
      headers: accessToken
        ? { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }
        : { "Content-Type": "application/json" },
      body: JSON.stringify({ code })
    });
    if (!response.ok) {
      const error = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new Error(error?.message ?? "MFA verification failed");
    }
    const payload = (await response.json()) as { recoveryCodes: string[] };
    return payload.recoveryCodes;
  }, [accessToken]);

  const logout = useCallback(async () => {
    await fetch(`${apiBaseUrl}/api/auth/logout`, {
      method: "POST",
      credentials: "include",
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined
    });
    window.localStorage.removeItem("audity_access_token");
    window.localStorage.removeItem("audity_csrf_token");
    window.localStorage.removeItem("audity_user");
    setAccessToken(null);
    setCsrfToken(null);
    setUser(null);
  }, [accessToken]);

  const value = useMemo(
    () => ({
      accessToken,
      csrfToken,
      user,
      login,
      verifyMfaChallenge,
      setupMfa,
      verifyMfaSetup,
      logout
    }),
    [
      accessToken,
      csrfToken,
      user,
      login,
      verifyMfaChallenge,
      setupMfa,
      verifyMfaSetup,
      logout
    ]
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
