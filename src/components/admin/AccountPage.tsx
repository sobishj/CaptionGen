"use client";

import { useId, useState, type FormEvent } from "react";
import type { AdminUserView } from "@/lib/admin/schemas";
import { adminApi } from "@/lib/client/admin-api";
import { Alert, Button, Card, Field, inputClass } from "./ui";

export function AccountPage({
  user,
  onAuthError,
  onSignOut,
}: {
  user: AdminUserView;
  onAuthError: (err: unknown) => boolean;
  onSignOut: () => void;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const ids = { current: useId(), next: useId(), confirm: useId() };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (next !== confirm) {
      setMessage({ kind: "error", text: "The new passwords don't match." });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await adminApi("auth/password", { body: { currentPassword: current, newPassword: next } });
      setCurrent("");
      setNext("");
      setConfirm("");
      setMessage({ kind: "success", text: "Password changed. Other sessions have been signed out." });
    } catch (err) {
      if (!onAuthError(err)) setMessage({ kind: "error", text: err instanceof Error ? err.message : "Couldn't change the password." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card title="Your account" subtitle={user.email}>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Name</dt>
            <dd className="font-medium">{user.name}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Role</dt>
            <dd className="font-medium">{user.owner ? "Owner" : "Admin"}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Session</dt>
            <dd className="font-medium">Signs out after 8 hours</dd>
          </div>
        </dl>
        <Button className="mt-5" onClick={onSignOut}>
          Sign out
        </Button>
      </Card>

      <Card title="Change password">
        {user.owner ? (
          <Alert kind="info">
            The owner password is the <code>ADMIN_PASSWORD</code> secret on the server. To change it, run{" "}
            <code>npx wrangler secret put ADMIN_PASSWORD</code> and redeploy. Existing owner sessions are signed out
            automatically.
          </Alert>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <Field label="Current password" htmlFor={ids.current}>
              <input id={ids.current} type="password" className={inputClass} value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
            </Field>
            <Field label="New password" htmlFor={ids.next} hint="At least 10 characters.">
              <input id={ids.next} type="password" className={inputClass} value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
            </Field>
            <Field label="Confirm new password" htmlFor={ids.confirm}>
              <input id={ids.confirm} type="password" className={inputClass} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
            </Field>
            {message && <Alert kind={message.kind}>{message.text}</Alert>}
            <Button type="submit" kind="primary" loading={busy} disabled={!current || !next || !confirm}>
              Change password
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
