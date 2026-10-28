"use client";

import { useCallback, useEffect, useId, useState } from "react";
import type { AdminUserView } from "@/lib/admin/schemas";
import { adminApi } from "@/lib/client/admin-api";
import { Alert, Badge, Button, Card, Field, Modal, formatAgo, inputClass } from "./ui";

interface UsersResponse {
  users: AdminUserView[];
  me: string;
}

export function UsersPage({ onAuthError }: { onAuthError: (err: unknown) => boolean }) {
  const [data, setData] = useState<UsersResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminUserView | "new" | null>(null);
  const [removing, setRemoving] = useState<AdminUserView | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await adminApi<UsersResponse>("users"));
    } catch (err) {
      if (!onAuthError(err)) setError(err instanceof Error ? err.message : "Couldn't load admins.");
    }
  }, [onAuthError]);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(u: AdminUserView) {
    setBusy(true);
    setError(null);
    try {
      setData(await adminApi<UsersResponse>(`users/${u.id}`, { method: "DELETE" }));
      setRemoving(null);
    } catch (err) {
      if (!onAuthError(err)) setError(err instanceof Error ? err.message : "Couldn't remove the admin.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {error && <Alert kind="error">{error}</Alert>}
      <Card
        title="Admin users"
        subtitle="Everyone here can manage AI models and other admins."
        actions={
          <Button kind="primary" onClick={() => setEditing("new")}>
            + Add admin
          </Button>
        }
      >
        {!data ? (
          <p className="text-sm text-muted" role="status">
            Loading…
          </p>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {data.users.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-3 p-4">
                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-800 uppercase">
                  {(u.name || u.email).slice(0, 1)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{u.name}</span>
                    {u.owner && <Badge color="brand">Owner</Badge>}
                    {u.id === data.me && <Badge>You</Badge>}
                  </div>
                  <div className="truncate text-sm text-muted">{u.email}</div>
                </div>
                <div className="text-xs text-muted">
                  {u.owner ? "Set by ADMIN_EMAIL / ADMIN_PASSWORD" : `Last sign-in: ${formatAgo(u.lastLoginAt)}`}
                </div>
                {!u.owner && (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => setEditing(u)}>
                      Edit
                    </Button>
                    {u.id !== data.me && (
                      <Button size="sm" kind="ghost" className="text-red-700 hover:text-red-800" onClick={() => setRemoving(u)}>
                        Remove
                      </Button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {editing && (
        <UserEditor
          user={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(d) => {
            setData(d);
            setEditing(null);
          }}
          onAuthError={onAuthError}
        />
      )}

      {removing && (
        <Modal
          title="Remove admin?"
          onClose={() => setRemoving(null)}
          footer={
            <>
              <Button onClick={() => setRemoving(null)}>Cancel</Button>
              <Button kind="danger" loading={busy} onClick={() => void remove(removing)}>
                Remove
              </Button>
            </>
          }
        >
          <p className="text-sm">
            <strong>{removing.name}</strong> ({removing.email}) will be signed out and can no longer access the admin panel.
          </p>
        </Modal>
      )}
    </div>
  );
}

function UserEditor({
  user,
  onClose,
  onSaved,
  onAuthError,
}: {
  user: AdminUserView | null;
  onClose: () => void;
  onSaved: (d: UsersResponse) => void;
  onAuthError: (err: unknown) => boolean;
}) {
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const ids = { name: useId(), email: useId(), password: useId() };

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const body = { name, email, password };
      onSaved(
        user
          ? await adminApi<UsersResponse>(`users/${user.id}`, { method: "PUT", body })
          : await adminApi<UsersResponse>("users", { body }),
      );
    } catch (err) {
      if (!onAuthError(err)) setError(err instanceof Error ? err.message : "Couldn't save.");
      setSaving(false);
    }
  }

  return (
    <Modal
      title={user ? `Edit ${user.name}` : "Add admin"}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button kind="primary" loading={saving} onClick={() => void save()} disabled={!name.trim() || !email.trim() || (!user && !password)}>
            {user ? "Save changes" : "Add admin"}
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Field label="Name" htmlFor={ids.name}>
          <input id={ids.name} className={inputClass} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label="Email" htmlFor={ids.email}>
          <input id={ids.email} type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
        </Field>
        <Field
          label={user ? "New password (optional)" : "Password"}
          htmlFor={ids.password}
          hint={user ? "Leave blank to keep the current password. Changing it signs them out." : "At least 10 characters. Share it with them securely."}
        >
          <input
            id={ids.password}
            type="password"
            className={inputClass}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
        </Field>
        {error && <Alert kind="error">{error}</Alert>}
        <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  );
}
