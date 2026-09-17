import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { ApiError, api, clearToken, errorMessage, getToken, onUnauthorized, setToken } from "./api";

export type NotifyPreferences = {
  assigned: boolean;
  comments: boolean;
  mentions: boolean;
  completed: boolean;
  dueSoon: boolean;
  workspace: boolean;
  email: boolean;
};

export type Preferences = {
  riskAlerts: boolean;
  dailyBrief: boolean;
  lightMode: boolean;
  activeTeamId: string | null;
  notify: NotifyPreferences;
};

export type User = {
  id: string;
  name: string;
  email: string;
  title: string;
  initials: string;
  avatarUrl: string | null;
  /** Undefined when unknown; false for accounts created with Google sign-in. */
  hasPassword?: boolean;
  googleLinked: boolean;
  preferences: Preferences;
};

export type AuthConfig = { googleClientId: string | null; emailDelivery: "smtp" | "log" };

type AuthResponse = { token: string; user: User };
type AuthStatus = "loading" | "authenticated" | "guest";
export type ProfilePatch = Partial<Pick<User, "name" | "title" | "email">> & {
  avatarUrl?: string;
  preferences?: Partial<Omit<Preferences, "notify">> & { notify?: Partial<NotifyPreferences> };
};

type AuthValue = {
  status: AuthStatus;
  user: User | null;
  config: AuthConfig | null;
  /** Set when the stored session could not be checked (e.g. API unreachable). */
  bootError: string | null;
  login: (email: string, password: string, remember: boolean) => Promise<void>;
  register: (input: { name: string; email: string; password: string }, remember: boolean) => Promise<void>;
  googleSignIn: (credential: string, remember: boolean) => Promise<{ created: boolean }>;
  requestPasswordReset: (email: string) => Promise<string>;
  resetPassword: (token: string, password: string) => Promise<void>;
  changePassword: (currentPassword: string | undefined, newPassword: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Drops the local session without calling the API (it is already invalid server-side). */
  expireSession: () => void;
  updateProfile: (patch: ProfilePatch) => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

// Where the current token lives decides whether a replacement token is "remembered".
function tokenIsRemembered() {
  try {
    return Boolean(window.localStorage.getItem("taskflow.token"));
  } catch {
    return false;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // Cached workspace data belongs to one user; drop it whenever the session changes.
  const queryClient = useQueryClient();
  // Always "loading" on the server and first client render, so SSR markup matches.
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    api<AuthConfig>("/api/auth/config")
      .then(setConfig)
      .catch(() => setConfig({ googleClientId: null, emailDelivery: "log" }));

    if (!getToken()) {
      setStatus("guest");
      return;
    }
    api<{ user: User }>("/api/auth/me")
      .then(({ user }) => {
        setUser(user);
        setStatus("authenticated");
      })
      .catch((err) => {
        if (!(err instanceof ApiError && err.status === 401)) setBootError(errorMessage(err));
        setStatus("guest");
      });
  }, []);

  const expireSession = useCallback(() => {
    clearToken();
    queryClient.clear();
    setUser(null);
    setStatus("guest");
  }, [queryClient]);

  useEffect(() => onUnauthorized(expireSession), [expireSession]);

  const finish = useCallback(
    (res: AuthResponse, remember: boolean, { keepCache = false } = {}) => {
      if (!keepCache) queryClient.clear();
      setToken(res.token, remember);
      setBootError(null);
      setUser(res.user);
      setStatus("authenticated");
    },
    [queryClient],
  );

  const login = useCallback<AuthValue["login"]>(
    async (email, password, remember) => {
      finish(await api<AuthResponse>("/api/auth/login", { method: "POST", body: { email, password } }), remember);
    },
    [finish],
  );

  const register = useCallback<AuthValue["register"]>(
    async (input, remember) => {
      finish(await api<AuthResponse>("/api/auth/register", { method: "POST", body: input }), remember);
    },
    [finish],
  );

  const googleSignIn = useCallback<AuthValue["googleSignIn"]>(
    async (credential, remember) => {
      const res = await api<AuthResponse & { created: boolean }>("/api/auth/google", {
        method: "POST",
        body: { credential },
      });
      finish(res, remember);
      return { created: res.created };
    },
    [finish],
  );

  const requestPasswordReset = useCallback<AuthValue["requestPasswordReset"]>(async (email) => {
    const res = await api<{ message: string }>("/api/auth/forgot-password", { method: "POST", body: { email } });
    return res.message;
  }, []);

  const resetPassword = useCallback<AuthValue["resetPassword"]>(
    async (token, password) => {
      finish(await api<AuthResponse>("/api/auth/reset-password", { method: "POST", body: { token, password } }), true);
    },
    [finish],
  );

  // Other sessions are signed out server-side; this one continues with the new token.
  const changePassword = useCallback<AuthValue["changePassword"]>(
    async (currentPassword, newPassword) => {
      const res = await api<AuthResponse>("/api/auth/change-password", {
        method: "POST",
        body: { newPassword, ...(currentPassword ? { currentPassword } : {}) },
      });
      finish(res, tokenIsRemembered(), { keepCache: true });
    },
    [finish],
  );

  const logout = useCallback(async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {
      /* the local session is cleared regardless */
    }
    expireSession();
  }, [expireSession]);

  const updateProfile = useCallback<AuthValue["updateProfile"]>(async (patch) => {
    const res = await api<{ user: User }>("/api/auth/me", { method: "PATCH", body: patch });
    setUser(res.user);
  }, []);

  const value = useMemo(
    () => ({
      status,
      user,
      config,
      bootError,
      login,
      register,
      googleSignIn,
      requestPasswordReset,
      resetPassword,
      changePassword,
      logout,
      expireSession,
      updateProfile,
    }),
    [
      status,
      user,
      config,
      bootError,
      login,
      register,
      googleSignIn,
      requestPasswordReset,
      resetPassword,
      changePassword,
      logout,
      expireSession,
      updateProfile,
    ],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
