import { useEffect, useState, type FormEvent } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Chrome,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import type { Session, User } from "@supabase/supabase-js";
import {
  connectGoogleAndGmail,
  getAuthRedirectUrl,
  normalizeAuthEmail,
  sendPasswordResetEmail,
  signInWithEmail,
  signUpWithEmail,
  updatePassword,
} from "../../lib/supabase";

export type AuthMode = "sign-in" | "sign-up" | "forgot-password" | "reset-password";
export type SignupState = "confirmation-required" | "immediate-session";

export interface SignupCompleted {
  email: string;
  user: User | null;
  session: Session | null;
  requiresEmailConfirmation: boolean;
}

export interface AuthScreenProps {
  initialMode?: AuthMode;
  defaultEmail?: string;
  emailRedirectTo?: string;
  resetRedirectTo?: string;
  enableGoogleAuth?: boolean;
  onGoogleSignIn?: () => void | Promise<void>;
  onAuthenticated?: (session: Session) => void | Promise<void>;
  onSignedIn?: (session: Session) => void | Promise<void>;
  onSignedUp?: (result: SignupCompleted) => void | Promise<void>;
  onPasswordResetRequested?: (email: string) => void | Promise<void>;
  onPasswordUpdated?: () => void | Promise<void>;
  onContinueInBrowser?: () => void | Promise<void>;
  onModeChange?: (mode: AuthMode) => void;
  className?: string;
}

interface Notice {
  kind: "error" | "success";
  message: string;
}

interface PasswordFieldProps {
  id: string;
  label: string;
  value: string;
  autoComplete: string;
  visible: boolean;
  disabled: boolean;
  onChange: (value: string) => void;
  onToggle: () => void;
}

function recoveryLinkIsActive() {
  if (typeof window === "undefined") return false;
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const search = new URLSearchParams(window.location.search);
  return hash.get("type") === "recovery" || search.get("type") === "recovery" || search.get("auth") === "reset";
}

function initialAuthMode(requestedMode?: AuthMode): AuthMode {
  if (requestedMode) return requestedMode;
  return recoveryLinkIsActive() ? "reset-password" : "sign-in";
}

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error && "message" in error && typeof error.message === "string") return error.message;
  return "We couldn’t complete that request. Please try again.";
}

function PasswordField({
  id,
  label,
  value,
  autoComplete,
  visible,
  disabled,
  onChange,
  onToggle,
}: PasswordFieldProps) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-slate-600">{label}</label>
      <div className="relative">
        <input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          autoComplete={autoComplete}
          required
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 pr-11 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-slate-50"
        />
        <button
          type="button"
          onClick={onToggle}
          disabled={disabled}
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 inline-flex w-11 items-center justify-center rounded-r-xl text-slate-400 transition hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-300 disabled:cursor-not-allowed"
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

export function AuthScreen({
  initialMode: requestedMode,
  defaultEmail = "",
  emailRedirectTo,
  resetRedirectTo,
  enableGoogleAuth = false,
  onGoogleSignIn,
  onAuthenticated,
  onSignedIn,
  onSignedUp,
  onPasswordResetRequested,
  onPasswordUpdated,
  onContinueInBrowser,
  onModeChange,
  className = "",
}: AuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>(() => initialAuthMode(requestedMode));
  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmationVisible, setConfirmationVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [signupState, setSignupState] = useState<SignupState | null>(null);

  useEffect(() => {
    if (requestedMode === undefined && recoveryLinkIsActive()) setMode("reset-password");
  }, [requestedMode]);

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setNotice(null);
    setSignupState(null);
    setPassword("");
    setPasswordConfirmation("");
    setPasswordVisible(false);
    setConfirmationVisible(false);
    onModeChange?.(nextMode);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setNotice(null);

    const normalizedEmail = normalizeAuthEmail(email);

    try {
      if (mode === "sign-in") {
        const result = await signInWithEmail({ email: normalizedEmail, password });
        if (!result.session) throw new Error("Sign-in did not return an active session.");
        await onSignedIn?.(result.session);
        await onAuthenticated?.(result.session);
        setNotice({ kind: "success", message: "You’re signed in." });
      } else if (mode === "sign-up") {
        if (password !== passwordConfirmation) throw new Error("Passwords do not match.");
        const redirect = emailRedirectTo || getAuthRedirectUrl();
        const result = await signUpWithEmail(
          { email: normalizedEmail, password },
          redirect ? { emailRedirectTo: redirect } : undefined,
        );
        const session = result.session || null;
        const requiresEmailConfirmation = !session;
        const completed: SignupCompleted = {
          email: normalizedEmail,
          user: result.user || null,
          session,
          requiresEmailConfirmation,
        };
        await onSignedUp?.(completed);
        setSignupState(session ? "immediate-session" : "confirmation-required");
        if (session) await onAuthenticated?.(session);
      } else if (mode === "forgot-password") {
        const redirect = resetRedirectTo || getAuthRedirectUrl("/?auth=reset");
        await sendPasswordResetEmail({
          email: normalizedEmail,
          ...(redirect ? { redirectTo: redirect } : {}),
        });
        await onPasswordResetRequested?.(normalizedEmail);
        setNotice({
          kind: "success",
          message: "If an account matches that email, we’ll send a password reset link shortly.",
        });
      } else {
        if (password !== passwordConfirmation) throw new Error("Passwords do not match.");
        await updatePassword({ password });
        await onPasswordUpdated?.();
        setNotice({ kind: "success", message: "Your password has been updated. You can sign in now." });
        setPassword("");
        setPasswordConfirmation("");
        setMode("sign-in");
        onModeChange?.("sign-in");
      }
    } catch (error) {
      setNotice({ kind: "error", message: errorMessage(error) });
    } finally {
      setPending(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (pending) return;
    setPending(true);
    setNotice(null);
    try {
      if (onGoogleSignIn) await onGoogleSignIn();
      else await connectGoogleAndGmail();
    } catch (error) {
      setNotice({ kind: "error", message: errorMessage(error) });
    } finally {
      setPending(false);
    }
  };

  const showGoogle = (mode === "sign-in" || mode === "sign-up") && (Boolean(onGoogleSignIn) || enableGoogleAuth);
  const showBrowserOnly = typeof window !== "undefined" && Boolean(onContinueInBrowser);
  const isSignupResult = mode === "sign-up" && Boolean(signupState);
  const title = mode === "sign-in"
    ? "Welcome back"
    : mode === "sign-up"
      ? "Create your account"
      : mode === "forgot-password"
        ? "Reset your password"
        : "Choose a new password";
  const subtitle = mode === "sign-in"
    ? "Sign in to continue to your invoice workspace."
    : mode === "sign-up"
      ? "Use your work email to create a secure workspace account."
      : mode === "forgot-password"
        ? "Enter your email and we’ll send instructions if an account matches."
        : "Set a new password for your workspace account.";

  return (
    <main className={`flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8 text-slate-900 sm:px-6 ${className}`}>
      <section className="w-full max-w-md">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_18px_60px_-32px_rgba(15,23,42,0.42)] sm:p-7">
          <div className="mb-7 flex items-start justify-between gap-4">
            <div>
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-200">
                <LockKeyhole className="h-5 w-5" />
              </div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600">Invoice Operations</p>
              <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950">{title}</h1>
              <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">{subtitle}</p>
            </div>
            <ShieldCheck className="mt-1 h-5 w-5 shrink-0 text-slate-300" aria-hidden="true" />
          </div>

          {notice && (
            <div
              role={notice.kind === "error" ? "alert" : "status"}
              className={`mb-5 flex gap-2.5 rounded-2xl border px-3.5 py-3 text-xs leading-5 ${notice.kind === "error" ? "border-rose-200 bg-rose-50 text-rose-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}
            >
              {notice.kind === "error" ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />}
              <span>{notice.message}</span>
            </div>
          )}

          {isSignupResult ? (
            <div className="rounded-2xl border border-indigo-100 bg-indigo-50/70 p-5">
              {signupState === "confirmation-required" ? (
                <>
                  <Mail className="h-5 w-5 text-indigo-600" />
                  <h2 className="mt-3 text-lg font-black text-indigo-950">Check your email</h2>
                  <p className="mt-2 text-sm leading-6 text-indigo-900">
                    We sent a confirmation link if the address can receive email. Confirm it, then return here to sign in.
                  </p>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  <h2 className="mt-3 text-lg font-black text-slate-950">Your account is ready</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">You’re signed in and can continue to your workspace.</p>
                </>
              )}
              <div className="mt-5 flex flex-wrap gap-2">
                <button type="button" onClick={() => switchMode("sign-in")} className="rounded-xl bg-indigo-600 px-3.5 py-2.5 text-xs font-bold text-white transition hover:bg-indigo-700">
                  Go to sign in
                </button>
                <button type="button" onClick={() => switchMode("sign-up")} className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-700 transition hover:border-slate-300">
                  Use another email
                </button>
              </div>
            </div>
          ) : (
            <>
              {showGoogle && (
                <>
                  <button
                    type="button"
                    onClick={() => void handleGoogleSignIn()}
                    disabled={pending}
                    className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Chrome className="h-4 w-4 text-slate-500" />
                    Continue with Google
                  </button>
                  <div className="my-5 flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                    <span className="h-px flex-1 bg-slate-100" />
                    or use email
                    <span className="h-px flex-1 bg-slate-100" />
                  </div>
                </>
              )}

              <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
                {mode !== "reset-password" && (
                  <div>
                    <label htmlFor="auth-email" className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-slate-600">Email address</label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        id="auth-email"
                        type="email"
                        value={email}
                        autoComplete={mode === "sign-in" ? "email" : "username"}
                        required
                        disabled={pending}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder="you@company.com"
                        className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-3.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-slate-50"
                      />
                    </div>
                  </div>
                )}

                {(mode === "sign-in" || mode === "sign-up" || mode === "reset-password") && (
                  <PasswordField
                    id="auth-password"
                    label={mode === "reset-password" ? "New password" : "Password"}
                    value={password}
                    autoComplete={mode === "reset-password" ? "new-password" : mode === "sign-in" ? "current-password" : "new-password"}
                    visible={passwordVisible}
                    disabled={pending}
                    onChange={setPassword}
                    onToggle={() => setPasswordVisible((visible) => !visible)}
                  />
                )}

                {(mode === "sign-up" || mode === "reset-password") && (
                  <PasswordField
                    id="auth-password-confirmation"
                    label="Confirm password"
                    value={passwordConfirmation}
                    autoComplete="new-password"
                    visible={confirmationVisible}
                    disabled={pending}
                    onChange={setPasswordConfirmation}
                    onToggle={() => setConfirmationVisible((visible) => !visible)}
                  />
                )}

                <button
                  type="submit"
                  disabled={pending}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-100 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {pending ? "Working…" : mode === "sign-in" ? "Sign in" : mode === "sign-up" ? "Create account" : mode === "forgot-password" ? "Send reset link" : "Update password"}
                </button>
              </form>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs font-semibold">
                {mode === "sign-in" && (
                  <>
                    <button type="button" onClick={() => switchMode("forgot-password")} className="text-indigo-600 hover:text-indigo-800">Forgot password?</button>
                    <button type="button" onClick={() => switchMode("sign-up")} className="text-slate-600 hover:text-slate-900">Create an account</button>
                  </>
                )}
                {mode === "sign-up" && (
                  <button type="button" onClick={() => switchMode("sign-in")} className="text-indigo-600 hover:text-indigo-800">Already have an account? Sign in</button>
                )}
                {mode === "forgot-password" && (
                  <button type="button" onClick={() => switchMode("sign-in")} className="text-indigo-600 hover:text-indigo-800">Back to sign in</button>
                )}
                {mode === "reset-password" && (
                  <button type="button" onClick={() => switchMode("sign-in")} className="text-indigo-600 hover:text-indigo-800">Back to sign in</button>
                )}
              </div>
            </>
          )}
        </div>

        {showBrowserOnly && (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-white/80 p-4 text-center">
            <p className="text-xs leading-5 text-slate-500">Data is stored only in this browser and does not sync to other devices.</p>
            <button
              type="button"
              onClick={() => void onContinueInBrowser?.()}
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 underline decoration-slate-300 underline-offset-4 hover:text-slate-950"
            >
              <UserRound className="h-3.5 w-3.5" />
              Continue in browser-only mode
            </button>
          </div>
        )}

        <p className="mt-5 text-center text-[10px] leading-5 text-slate-400">
          Your password is handled by Supabase Auth and is never stored in this workspace.
        </p>
      </section>
    </main>
  );
}

export default AuthScreen;
