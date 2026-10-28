"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { SessionInfo } from "@/lib/admin/schemas";
import { AdminApiError, adminApi } from "@/lib/client/admin-api";
import { LogoMark } from "../icons";
import { AccountPage } from "./AccountPage";
import { ModelsPage } from "./ModelsPage";
import { UsersPage } from "./UsersPage";
import { Alert, Button, Field, inputClass } from "./ui";

type Tab = "models" | "users" | "account";

const TABS: { key: Tab; label: string }[] = [
  { key: "models", label: "AI models" },
  { key: "users", label: "Admin users" },
  { key: "account", label: "Account" },
];

export function AdminApp() {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("models");

  const refresh = useCallback(async () => {
    try {
      setSession(await adminApi<SessionInfo>("auth/me"));
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Couldn't load the admin panel.");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** Any 401 from a page means the session expired: go back to sign-in. */
  const onAuthError = useCallback((err: unknown) => {
    if (err instanceof AdminApiError && err.status === 401) {
      setSession((s) => (s ? { ...s, user: null } : s));
      return true;
    }
    return false;
  }, []);

  async function signOut() {
    await adminApi("auth/logout", { method: "POST" }).catch(() => {});
    setSession((s) => (s ? { ...s, user: null } : s));
    setTab("models");
  }

  if (loadError) {
    return (
      <Centered>
        <Alert kind="error">{loadError}</Alert>
        <Button className="mt-4" onClick={() => void refresh()}>
          Try again
        </Button>
      </Centered>
    );
  }

  if (!session) {
    return (
      <Centered>
        <p className="text-center text-sm text-muted" role="status">
          Loading…
        </p>
      </Centered>
    );
  }

  if (!session.user) return <LoginPage session={session} onSignedIn={refresh} />;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line bg-surface/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <a href="/" className="flex items-center gap-2.5" title="Open the caption generator">
            <LogoMark className="size-8" />
            <span className="font-display text-lg tracking-tight">CaptionGen</span>
            <span className="rounded border border-line px-1.5 py-0.5 text-[11px] font-semibold tracking-wide text-ink-2 uppercase">
              Admin
            </span>
          </a>
          <div className="flex items-center gap-2">
            <span className="hidden text-sm text-muted sm:inline">{session.user.email}</span>
            <Button size="sm" onClick={() => void signOut()}>
              Sign out
            </Button>
          </div>
        </div>
        <nav className="mx-auto max-w-6xl overflow-x-auto px-4 sm:px-6" aria-label="Admin sections">
          <ul className="flex gap-1">
            {TABS.map((t) => (
              <li key={t.key}>
                <button
                  type="button"
                  onClick={() => setTab(t.key)}
                  aria-current={tab === t.key ? "page" : undefined}
                  className={`border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition ${
                    tab === t.key
                      ? "border-brand-500 text-ink"
                      : "border-transparent text-muted hover:text-ink"
                  }`}
                >
                  {t.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        {!session.encryption && (
          <Alert kind="error">
            <strong>ENCRYPTION_KEY isn&apos;t set.</strong> API keys can&apos;t be saved until you add it as a secret
            (<code>npx wrangler secret put ENCRYPTION_KEY</code>) and redeploy.
          </Alert>
        )}
        {session.storage === "memory" && (
          <Alert kind="warning">
            Settings are only kept in memory and will be lost when the server restarts. Bind the <code>SETTINGS</code>{" "}
            KV namespace (see the README) to store them permanently.
          </Alert>
        )}
        {tab === "models" && <ModelsPage session={session} onAuthError={onAuthError} />}
        {tab === "users" && <UsersPage onAuthError={onAuthError} />}
        {tab === "account" && <AccountPage user={session.user} onAuthError={onAuthError} onSignOut={signOut} />}
      </main>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}

function LoginPage({ session, onSignedIn }: { session: SessionInfo; onSignedIn: () => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await adminApi("auth/login", { body: { email, password } });
      await onSignedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
      setBusy(false);
    }
  }

  return (
    <Centered>
      <div className="mb-6 flex flex-col items-center text-center">
        <LogoMark className="mb-3 size-11" />
        <h1 className="font-display text-2xl tracking-tight">CaptionGen admin</h1>
        <p className="mt-1 text-sm text-muted">Sign in to manage AI models and admins.</p>
      </div>
      <div className="rounded-lg border border-line bg-surface p-6">
        {!session.configured ? (
          <Alert kind="warning">
            Admin sign-in isn&apos;t set up yet. Set the <code>ADMIN_PASSWORD</code> secret on the server (and optionally{" "}
            <code>ADMIN_EMAIL</code>), then reload this page.
          </Alert>
        ) : (
          <form onSubmit={submit} className="space-y-4" noValidate>
            <Field label="Email or username" htmlFor="login-email">
              <input
                id="login-email"
                className={inputClass}
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </Field>
            <Field label="Password" htmlFor="login-password">
              <input
                id="login-password"
                type="password"
                className={inputClass}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Field>
            {error && <Alert kind="error">{error}</Alert>}
            <Button type="submit" kind="primary" className="w-full" loading={busy} disabled={!email || !password}>
              Sign in
            </Button>
          </form>
        )}
      </div>
      <p className="mt-6 text-center text-sm">
        <a href="/" className="text-muted hover:text-ink">
          ← Back to CaptionGen
        </a>
      </p>
    </Centered>
  );
}
