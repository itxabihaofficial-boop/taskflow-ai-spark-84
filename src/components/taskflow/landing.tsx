// Public landing page: sign in, sign up, Google sign-in, password reset and contact sales.
import { AlertTriangle, ArrowLeft, ArrowRight, Eye, EyeOff, Sparkles } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";

import { errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";

import { ContactSalesModal } from "./sales";
import { Avatar, Logo } from "./ui";

type Mode = "signin" | "signup" | "forgot" | "reset";

// Minimal typing for Google Identity Services (https://developers.google.com/identity/gsi/web).
type GoogleId = {
  initialize: (opts: { client_id: string; callback: (res: { credential?: string }) => void; ux_mode?: "popup"; context?: string }) => void;
  renderButton: (el: HTMLElement, opts: Record<string, string | number>) => void;
};
declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleId } };
  }
}

let gisScript: Promise<GoogleId> | null = null;
function loadGoogleIdentity(): Promise<GoogleId> {
  gisScript ??= new Promise<GoogleId>((resolve, reject) => {
    const done = () => (window.google?.accounts?.id ? resolve(window.google.accounts.id) : reject(new Error("Google sign-in didn’t load")));
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = done;
    script.onerror = () => reject(new Error("Couldn’t reach Google. Check your connection or continue with email."));
    document.head.appendChild(script);
  }).catch((err: unknown) => {
    gisScript = null;
    throw err;
  });
  return gisScript;
}

// Reads one-time links (?reset=…, ?signup=1&email=…) and removes them from the address bar.
function readLinkParams() {
  const params = new URLSearchParams(window.location.search);
  const reset = params.get("reset");
  const signup = params.get("signup") === "1";
  const email = params.get("email") ?? "";
  if (reset || signup) {
    ["reset", "signup", "email"].forEach((k) => params.delete(k));
    const rest = params.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${rest ? `?${rest}` : ""}${window.location.hash}`);
  }
  return { reset, signup, email };
}

export function Landing() {
  const { login, register, googleSignIn, requestPasswordReset, resetPassword, bootError, config } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" });
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [remember, setRemember] = useState(true);
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(bootError);
  const [notice, setNotice] = useState<string | null>(null);
  const [salesOpen, setSalesOpen] = useState(false);
  const rememberRef = useRef(remember);
  rememberRef.current = remember;

  useEffect(() => {
    const link = readLinkParams();
    if (link.reset) {
      setResetToken(link.reset);
      setMode("reset");
    } else if (link.signup) {
      setMode("signup");
      setForm((f) => ({ ...f, email: link.email }));
      setNotice(link.email ? `You’ve been invited. Create your account with ${link.email} to join the workspace.` : null);
    }
  }, []);

  const signup = mode === "signup";
  const field = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });
  const go = (next: Mode) => {
    setMode(next);
    setError(null);
    setNotice(null);
    setForm((f) => ({ ...f, password: "", confirm: "" }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === "signup") await register({ name: form.name, email: form.email, password: form.password }, remember);
      else if (mode === "signin") await login(form.email, form.password, remember);
      else if (mode === "forgot") {
        const message = await requestPasswordReset(form.email);
        setNotice(config?.emailDelivery === "log" ? `${message} (Email isn’t configured on this server, so the link is written to the API log.)` : message);
        setBusy(false);
      } else {
        if (form.password !== form.confirm) throw new Error("The passwords don’t match");
        await resetPassword(resetToken ?? "", form.password);
      }
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  const onGoogleCredential = async (credential: string | undefined) => {
    if (!credential) return setError("Google didn’t return an account. Please try again.");
    setBusy(true);
    setError(null);
    try {
      await googleSignIn(credential, rememberRef.current);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  const EyeIcon = showPw ? EyeOff : Eye;
  const title = { signin: "Welcome back", signup: "Create your account", forgot: "Reset your password", reset: "Choose a new password" }[mode];
  const subtitle = {
    signin: "Sign in to your workspace",
    signup: "Start a free workspace for your team",
    forgot: "We’ll email you a link to choose a new password",
    reset: "Use at least 8 characters. Other devices will be signed out.",
  }[mode];
  const submitLabel = busy
    ? { signin: "Signing in…", signup: "Creating account…", forgot: "Sending…", reset: "Saving…" }[mode]
    : { signin: "Sign in", signup: "Create account", forgot: "Send reset link", reset: "Save and sign in" }[mode];
  const passwordMode = mode === "signin" || mode === "signup" || mode === "reset";

  return (
    <div className="landing">
      <header>
        <div className="landing-brand">
          <Logo />
          <strong>
            TaskFlow <b>AI</b>
          </strong>
        </div>
        <button className="ghost-btn" onClick={() => setSalesOpen(true)}>
          Contact sales
        </button>
      </header>
      <section className="landing-main">
        <div className="login-intro">
          <span className="eyebrow">
            <Sparkles /> Intelligence built into every task
          </span>
          <h1>
            Where great teams
            <br />
            <em>find their flow.</em>
          </h1>
          <p>Plan work, surface blockers, and turn team conversations into clear action—all in one intelligent workspace.</p>
          <div className="proof">
            <div className="avatar-stack">
              {["AM", "SK", "LM", "JR"].map((x) => (
                <Avatar key={x} text={x} />
              ))}
            </div>
            <span>
              <b>2,400+ teams</b>
              <br />
              move faster with TaskFlow
            </span>
          </div>
        </div>
        <form className="login-card" onSubmit={submit}>
          <div className="login-icon">
            <Logo />
          </div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
          {(mode === "signin" || mode === "signup") && (
            <>
              <GoogleButton clientId={config?.googleClientId ?? null} disabled={busy} onCredential={onGoogleCredential} onError={setError} onNotice={setNotice} />
              <div className="divider">
                <span>or continue with email</span>
              </div>
            </>
          )}
          {signup && (
            <label>
              Full name
              <input value={form.name} onChange={field("name")} autoComplete="name" placeholder="Ava Morgan" required />
            </label>
          )}
          {mode !== "reset" && (
            <label>
              Email address
              <input type="email" value={form.email} onChange={field("email")} autoComplete="email" placeholder="ava@acme.io" required />
            </label>
          )}
          {passwordMode && (
            <label>
              {mode === "reset" ? "New password" : "Password"}
              <div className="password">
                <input
                  type={showPw ? "text" : "password"}
                  value={form.password}
                  onChange={field("password")}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  placeholder={mode === "signin" ? "••••••••" : "At least 8 characters"}
                  minLength={mode === "signin" ? 1 : 8}
                  required
                />
                <EyeIcon
                  role="button"
                  tabIndex={0}
                  aria-label={showPw ? "Hide password" : "Show password"}
                  onClick={() => setShowPw(!showPw)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setShowPw(!showPw);
                    }
                  }}
                />
              </div>
            </label>
          )}
          {mode === "reset" && (
            <label>
              Confirm new password
              <input type={showPw ? "text" : "password"} value={form.confirm} onChange={field("confirm")} autoComplete="new-password" minLength={8} required />
            </label>
          )}
          {(mode === "signin" || mode === "signup") && (
            <div className="login-meta">
              <label>
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Remember me
              </label>
              {mode === "signin" && (
                <button type="button" onClick={() => go("forgot")}>
                  Forgot password?
                </button>
              )}
            </div>
          )}
          {error && (
            <div className="auth-message error" role="alert">
              <AlertTriangle />
              {error}
            </div>
          )}
          {notice && (
            <div className="auth-message" role="status">
              {notice}
            </div>
          )}
          <button type="submit" className="login-submit" disabled={busy || (mode === "reset" && !resetToken)}>
            {submitLabel} <ArrowRight />
          </button>
          {mode === "signin" || mode === "signup" ? (
            <small>
              {signup ? "Already have an account? " : "Don’t have an account? "}
              <button type="button" onClick={() => go(signup ? "signin" : "signup")}>
                <b>{signup ? "Sign in" : "Start free"}</b>
              </button>
            </small>
          ) : (
            <small>
              {mode === "reset" && error && (
                <>
                  <button type="button" onClick={() => go("forgot")}>
                    <b>Request a new link</b>
                  </button>
                  {" · "}
                </>
              )}
              <button type="button" onClick={() => go("signin")}>
                <ArrowLeft /> <b>Back to sign in</b>
              </button>
            </small>
          )}
        </form>
      </section>
      <footer>
        <span>© 2026 TaskFlow AI</span>
        <span>Privacy · Terms · Security</span>
      </footer>
      {salesOpen && <ContactSalesModal onClose={() => setSalesOpen(false)} defaults={{ name: form.name, email: form.email }} />}
    </div>
  );
}

// Google's own button when a client id is configured; otherwise the original placeholder.
function GoogleButton({
  clientId,
  disabled,
  onCredential,
  onError,
  onNotice,
}: {
  clientId: string | null;
  disabled: boolean;
  onCredential: (credential: string | undefined) => void;
  onError: (msg: string) => void;
  onNotice: (msg: string | null) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const callback = useRef(onCredential);
  callback.current = onCredential;
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    loadGoogleIdentity()
      .then((gis) => {
        if (cancelled || !host.current) return;
        gis.initialize({ client_id: clientId, callback: (res) => callback.current(res.credential), ux_mode: "popup", context: "signin" });
        gis.renderButton(host.current, {
          type: "standard",
          theme: "filled_black",
          size: "large",
          text: "continue_with",
          shape: "rectangular",
          logo_alignment: "center",
          width: Math.min(400, Math.max(200, Math.round(host.current.offsetWidth))),
        });
        setReady(true);
      })
      .catch((err: unknown) => !cancelled && setFailed(errorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  if (!clientId || failed) {
    return (
      <button
        type="button"
        className="sso-btn"
        disabled={disabled}
        onClick={() => {
          if (failed) onError(failed);
          else onNotice("Google sign-in isn’t set up on this server yet. Continue with email instead.");
        }}
      >
        <span className="google-g">G</span> Continue with Google
      </button>
    );
  }
  return (
    <div className={disabled ? "google-host disabled" : "google-host"} aria-busy={!ready}>
      {!ready && (
        <span className="sso-btn">
          <span className="google-g">G</span> Loading Google…
        </span>
      )}
      <div ref={host} />
    </div>
  );
}
