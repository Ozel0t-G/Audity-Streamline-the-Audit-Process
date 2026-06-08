import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

const apiBaseUrl = import.meta.env.VITE_AUDITY_API_URL ?? "";

type User = {
  sub?: string;
  id?: string;
  email: string;
  role: string;
  permissions: string[];
  alphaAcceptedAt?: string | null;
};

type AuthContextValue = {
  accessToken: string | null;
  csrfToken: string | null;
  user: User | null;
  setupInitialAdmin: (input: { email: string; name: string; password: string }) => Promise<void>;
  login: (email: string, password: string) => Promise<{ mfaRequired: false } | { mfaRequired: true; challengeToken: string }>;
  acceptAlphaDisclaimer: () => Promise<void>;
  verifyMfaChallenge: (challengeToken: string, code: string) => Promise<void>;
  setupMfa: () => Promise<{ secret: string; otpauthUrl: string; qrCodeDataUrl: string }>;
  verifyMfaSetup: (code: string) => Promise<string[]>;
  expireSession: (notice?: string) => void;
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

  const expireSession = useCallback((notice = "Your session expired. Please sign in again.") => {
    window.localStorage.removeItem("audity_access_token");
    window.localStorage.removeItem("audity_csrf_token");
    window.localStorage.removeItem("audity_user");
    window.localStorage.setItem("audity_login_notice", notice);
    setAccessToken(null);
    setCsrfToken(null);
    setUser(null);
  }, []);

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

  const setupInitialAdmin = useCallback(async (input: { email: string; name: string; password: string }) => {
    const response = await fetch(`${apiBaseUrl}/api/auth/setup`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    });
    if (!response.ok) {
      const error = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new Error(error?.message ?? "Setup failed");
    }
    storeSession((await response.json()) as { accessToken: string; csrfToken: string; user: User });
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
      if (response.status === 401) {
        expireSession("Your session expired. Please sign in again.");
      }
      throw new Error("MFA setup failed");
    }
    return (await response.json()) as { secret: string; otpauthUrl: string; qrCodeDataUrl: string };
  }, [accessToken, expireSession]);

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
      if (response.status === 401) {
        expireSession("Your session expired. Please sign in again.");
      }
      throw new Error(error?.message ?? "MFA verification failed");
    }
    const payload = (await response.json()) as { recoveryCodes: string[] };
    return payload.recoveryCodes;
  }, [accessToken, expireSession]);

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

  const acceptAlphaDisclaimer = useCallback(async () => {
    const response = await fetch(`${apiBaseUrl}/api/auth/alpha-accept`, {
      method: "POST",
      credentials: "include",
      headers: accessToken && csrfToken
        ? { Authorization: `Bearer ${accessToken}`, "X-CSRF-Token": csrfToken }
        : undefined
    });
    if (!response.ok) {
      const error = (await response.json().catch(() => null)) as { message?: string } | null;
      if (response.status === 401 || response.status === 403) {
        expireSession("Your session expired. Please sign in again.");
      }
      throw new Error(error?.message ?? "Disclaimer acceptance failed");
    }
    const payload = (await response.json()) as { user: User };
    if (payload.user) {
      window.localStorage.setItem("audity_user", JSON.stringify(payload.user));
      setUser(payload.user);
    }
  }, [accessToken, csrfToken, expireSession]);

  const value = useMemo(
    () => ({
      accessToken,
      csrfToken,
      user,
      setupInitialAdmin,
      login,
      acceptAlphaDisclaimer,
      verifyMfaChallenge,
      setupMfa,
      verifyMfaSetup,
      expireSession,
      logout
    }),
    [
      accessToken,
      csrfToken,
      user,
      setupInitialAdmin,
      login,
      acceptAlphaDisclaimer,
      verifyMfaChallenge,
      setupMfa,
      verifyMfaSetup,
      expireSession,
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
