"use client";

import { useCallback, useEffect, useState } from "react";
import { getProvider } from "@/lib/admin/providers";
import type { AdminModel, ModelInputDraft, ModelsListing, SessionInfo, TestResult } from "@/lib/admin/schemas";
import { adminApi } from "@/lib/client/admin-api";
import { ModelEditor } from "./ModelEditor";
import { Alert, Badge, Button, Card, Modal, Toggle, formatAgo, formatMs } from "./ui";

interface Props {
  session: SessionInfo;
  onAuthError: (err: unknown) => boolean;
}

/** Form values for an existing model; blank secrets keep the saved ones. */
export function toDraft(m: AdminModel, patch: Partial<ModelInputDraft> = {}): ModelInputDraft {
  return {
    name: m.name,
    provider: m.provider,
    baseUrl: m.baseUrl,
    modelName: m.modelName,
    apiKey: "",
    clearApiKey: false,
    headers: m.headerNames.map((name) => ({ name, value: "" })),
    temperature: m.temperature,
    maxTokens: m.maxTokens,
    timeoutSeconds: m.timeoutSeconds,
    jsonMode: m.jsonMode,
    enabled: m.enabled,
    ...patch,
  };
}

export function ModelsPage({ session, onAuthError }: Props) {
  const [data, setData] = useState<ModelsListing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminModel | "new" | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [testing, setTesting] = useState<{ model: AdminModel; result: TestResult | null } | null>(null);

  const run = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
      setError(null);
      try {
        return await fn();
      } catch (err) {
        if (!onAuthError(err)) setError(err instanceof Error ? err.message : "Something went wrong.");
        return undefined;
      }
    },
    [onAuthError],
  );

  useEffect(() => {
    void run(async () => setData(await adminApi<ModelsListing>("models")));
  }, [run]);

  async function toggleEnabled(m: AdminModel) {
    setBusyId(m.id);
    await run(async () =>
      setData(await adminApi<ModelsListing>(`models/${m.id}`, { method: "PUT", body: toDraft(m, { enabled: !m.enabled }) })),
    );
    setBusyId(null);
  }

  async function makeDefault(m: AdminModel) {
    setBusyId(m.id);
    await run(async () => setData(await adminApi<ModelsListing>(`models/${m.id}/default`, { method: "POST" })));
    setBusyId(null);
  }

  async function test(m: AdminModel) {
    setTesting({ model: m, result: null });
    const r = await run(() =>
      adminApi<{ result: TestResult; listing: ModelsListing }>(`models/${m.id}/test`, { method: "POST" }),
    );
    if (r) {
      setData(r.listing);
      setTesting({ model: m, result: r.result });
    } else {
      setTesting(null);
    }
  }

  async function move(index: number, delta: number) {
    if (!data) return;
    const ids = data.models.map((m) => m.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    setBusyId(ids[target]!);
    await run(async () => setData(await adminApi<ModelsListing>("models/priority", { method: "PUT", body: { modelIds: ids } })));
    setBusyId(null);
  }

  if (!data) {
    return error ? <Alert kind="error">{error}</Alert> : <p className="text-sm text-muted" role="status">Loading models…</p>;
  }

  const enabledCount = data.models.filter((m) => m.enabled).length;

  return (
    <div className="space-y-6">
      {error && <Alert kind="error">{error}</Alert>}

      {enabledCount === 0 &&
        (data.builtin ? (
          <Alert kind="info">
            No models are available to users yet, so the generator uses the built-in model{" "}
            <strong>{data.builtin.label}</strong> from the server&apos;s <code>LLM_*</code> settings. Add a model below to take
            over.
          </Alert>
        ) : (
          <Alert kind="warning">
            Users can&apos;t generate captions yet. Add a model below and make it available to users.
          </Alert>
        ))}

      <Card
        title="AI models"
        subtitle="Add any cloud model or a self-hosted one (e.g. Qwen on Ollama or vLLM). API keys are encrypted and never shown again."
        actions={
          <Button kind="primary" onClick={() => setEditing("new")} icon={<span aria-hidden="true">+</span>}>
            Add model
          </Button>
        }
      >
        {data.models.length === 0 ? (
          <div className="py-8 text-center">
            <p className="font-medium">No models yet</p>
            <p className="mt-1 text-sm text-muted">
              Add OpenAI, Claude, Gemini, Groq, OpenRouter, a Qwen server you host, or any OpenAI-compatible API.
            </p>
            <Button kind="primary" className="mt-4" onClick={() => setEditing("new")}>
              Add your first model
            </Button>
          </div>
        ) : (
          <>
            <p className="mb-4 text-sm text-muted">
              Users get the <strong className="text-ink-2">default</strong> model (top of the list) unless they pick
              another. If a model fails (down, busy or too slow), CaptionGen automatically retries once with the next
              available model in this order.
            </p>
            <ol className="divide-y divide-line rounded-xl border border-line">
              {data.models.map((m, i) => (
                <li key={m.id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
                  <div className="flex items-center gap-1 lg:flex-col" aria-label="Order">
                    <OrderButton dir="up" disabled={i === 0 || busyId !== null} onClick={() => void move(i, -1)} name={m.name} />
                    <span className="w-5 text-center text-xs font-semibold text-muted tabular-nums">{i + 1}</span>
                    <OrderButton
                      dir="down"
                      disabled={i === data.models.length - 1 || busyId !== null}
                      onClick={() => void move(i, 1)}
                      name={m.name}
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{m.name}</span>
                      {m.isDefault && <Badge color="brand">Default</Badge>}
                      {!m.enabled && <Badge>Hidden from users</Badge>}
                    </div>
                    <div className="mt-0.5 truncate font-mono text-xs text-muted">{m.modelName}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                      <span>{getProvider(m.provider)?.label ?? m.provider}</span>
                      <span>{m.hasApiKey ? `Key ${m.apiKeyHint}` : "No key"}</span>
                      <LastTestBadge model={m} />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <label className="mr-1 flex items-center gap-2 text-sm text-ink-2">
                      <Toggle
                        checked={m.enabled}
                        onChange={() => void toggleEnabled(m)}
                        disabled={busyId === m.id}
                        label={`Available to users: ${m.name}`}
                      />
                      <span aria-hidden="true">Available</span>
                    </label>
                    <Button size="sm" onClick={() => void test(m)} disabled={testing !== null}>
                      Test
                    </Button>
                    {!m.isDefault && (
                      <Button size="sm" onClick={() => void makeDefault(m)} disabled={busyId !== null}>
                        Make default
                      </Button>
                    )}
                    <Button size="sm" onClick={() => setEditing(m)}>
                      Edit
                    </Button>
                  </div>
                </li>
              ))}
            </ol>
          </>
        )}
      </Card>

      {editing && (
        <ModelEditor
          model={editing === "new" ? null : editing}
          session={session}
          onClose={() => setEditing(null)}
          onSaved={(listing) => {
            setData(listing);
            setEditing(null);
          }}
          onAuthError={onAuthError}
        />
      )}

      {testing && (
        <Modal
          title={`Test: ${testing.model.name}`}
          onClose={() => setTesting(null)}
          footer={<Button onClick={() => setTesting(null)}>Close</Button>}
        >
          {!testing.result ? (
            <p className="flex items-center gap-2 text-sm text-ink-2" role="status">
              <span className="size-4 animate-spin rounded-full border-2 border-line border-t-brand-500" aria-hidden="true" />
              Generating a sample caption… local models can take a little longer.
            </p>
          ) : (
            <TestOutput result={testing.result} />
          )}
        </Modal>
      )}
    </div>
  );
}

export function TestOutput({ result }: { result: TestResult }) {
  return result.ok ? (
    <div className="space-y-2" role="status">
      <Badge color="green">Working · {formatMs(result.ms)}</Badge>
      <p className="text-xs font-medium text-muted">Sample caption for &ldquo;Handmade soy candles…&rdquo;:</p>
      <p className="rounded-lg bg-surface-2 p-3 text-sm whitespace-pre-wrap">{result.reply}</p>
    </div>
  ) : (
    <div className="space-y-2" role="alert">
      <Badge color="red">Failed · {formatMs(result.ms)}</Badge>
      <Alert kind="error">{result.error}</Alert>
    </div>
  );
}

function LastTestBadge({ model }: { model: AdminModel }) {
  const t = model.lastTest;
  if (!t) return <span>Not tested</span>;
  return (
    <span title={t.message} className={t.ok ? "text-emerald-700" : "text-red-700"}>
      {t.ok ? "✓ Working" : "✕ Failed"} · {formatMs(t.ms)} · {formatAgo(t.at)}
    </span>
  );
}

function OrderButton({ dir, disabled, onClick, name }: { dir: "up" | "down"; disabled: boolean; onClick: () => void; name: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={`Move ${name} ${dir}`}
      className="inline-flex size-6 items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
    >
      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d={dir === "up" ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6"} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
