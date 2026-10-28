"use client";

import { useId, type FormEvent, type ReactNode } from "react";
import { PLATFORM_RULES, TONE_LABELS } from "@/lib/platforms";
import {
  DESCRIPTION_MAX,
  DESCRIPTION_MIN,
  PLATFORMS,
  TONES,
  type Platform,
  type PublicModel,
  type Tone,
} from "@/lib/schemas";
import { PlatformLogo } from "./icons";

export interface FormValues {
  description: string;
  platform: Platform;
  tone: Tone;
  count: number;
  emojis: boolean;
  /** Empty = the admin's default model. */
  modelId: string;
}

const COUNTS = [3, 4, 5] as const;

interface Props {
  values: FormValues;
  models: PublicModel[];
  onChange: (patch: Partial<FormValues>) => void;
  onPlatformChange: (platform: Platform) => void;
  onSubmit: () => void;
  loading: boolean;
  error: string | null;
  textareaRef?: React.Ref<HTMLTextAreaElement>;
}

function Label({ children, htmlFor, as = "label" }: { children: ReactNode; htmlFor?: string; as?: "label" | "legend" }) {
  const cls = "mb-2 block text-[13px] font-semibold tracking-wide text-ink-2";
  return as === "legend" ? (
    <legend className={cls}>{children}</legend>
  ) : (
    <label htmlFor={htmlFor} className={cls}>
      {children}
    </label>
  );
}

const segment =
  "flex cursor-pointer items-center justify-center gap-1.5 rounded-[5px] px-2 py-2 text-sm text-ink-2 transition select-none hover:text-ink peer-checked:bg-surface peer-checked:font-semibold peer-checked:text-ink peer-checked:shadow-[0_1px_2px_rgba(20,35,59,0.15)] peer-checked:ring-1 peer-checked:ring-line peer-focus-visible:outline-2 peer-focus-visible:outline-offset-1 peer-focus-visible:outline-brand-500";

export function GeneratorForm({ values, models, onChange, onPlatformChange, onSubmit, loading, error, textareaRef }: Props) {
  const ids = { desc: useId(), descHelp: useId(), descErr: useId(), emojis: useId(), model: useId() };
  const tooLong = values.description.length > DESCRIPTION_MAX;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!loading) onSubmit();
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-7">
      <div>
        <Label htmlFor={ids.desc}>What are you posting about?</Label>
        <textarea
          id={ids.desc}
          ref={textareaRef}
          value={values.description}
          onChange={(e) => onChange({ description: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(e);
          }}
          rows={5}
          maxLength={DESCRIPTION_MAX + 50}
          required
          aria-describedby={`${ids.descHelp}${error ? ` ${ids.descErr}` : ""}`}
          aria-invalid={error ? true : undefined}
          placeholder="e.g. Our bakery starts selling gluten-free sourdough this Saturday. Pre-orders open now."
          className={`block w-full resize-y rounded-md border bg-bg/60 px-3.5 py-3 text-[15px] leading-relaxed text-ink transition placeholder:text-muted/80 focus:outline-none focus:ring-2 ${
            error ? "border-red-400/70 focus:ring-red-400/40" : "border-line focus:border-brand-500 focus:ring-brand-500/30"
          }`}
        />
        <div className="mt-1.5 flex items-start justify-between gap-3 text-xs">
          <p id={ids.descHelp} className="text-muted">
            A product, an offer, an event, a tip. {DESCRIPTION_MIN}–{DESCRIPTION_MAX} characters.
          </p>
          <span className={`shrink-0 tabular-nums ${tooLong ? "font-semibold text-red-700" : "text-muted"}`} aria-live="polite">
            {values.description.length}/{DESCRIPTION_MAX}
          </span>
        </div>
        {error && (
          <p id={ids.descErr} className="mt-1.5 text-sm text-red-700">
            {error}
          </p>
        )}
      </div>

      <fieldset>
        <Label as="legend">Platform</Label>
        <div className="grid grid-cols-3 gap-1 rounded-md border border-line bg-bg/60 p-1">
          {PLATFORMS.map((p) => {
            return (
              <label key={p}>
                <input
                  type="radio"
                  name="platform"
                  value={p}
                  checked={values.platform === p}
                  onChange={() => onPlatformChange(p)}
                  className="peer sr-only"
                />
                <span className={segment}>
                  <PlatformLogo platform={p} size={18} />
                  {PLATFORM_RULES[p].label}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <Label as="legend">Tone</Label>
        <div className="flex flex-wrap gap-2">
          {TONES.map((t) => (
            <label key={t}>
              <input
                type="radio"
                name="tone"
                value={t}
                checked={values.tone === t}
                onChange={() => onChange({ tone: t })}
                className="peer sr-only"
              />
              <span className="inline-flex cursor-pointer items-center rounded-full border border-line px-3.5 py-1.5 text-sm text-ink-2 transition select-none hover:border-muted hover:text-ink peer-checked:border-brand-500 peer-checked:bg-brand-500/15 peer-checked:text-brand-800 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-500">
                {TONE_LABELS[t]}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-5">
        <fieldset>
          <Label as="legend">How many drafts</Label>
          <div className="inline-grid grid-cols-3 gap-1 rounded-md border border-line bg-bg/60 p-1">
            {COUNTS.map((c) => (
              <label key={c}>
                <input
                  type="radio"
                  name="count"
                  value={c}
                  checked={values.count === c}
                  onChange={() => onChange({ count: c })}
                  className="peer sr-only"
                />
                <span className={`${segment} w-11 py-1.5 tabular-nums`}>{c}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex items-center gap-3 pb-1.5">
          <span id={ids.emojis} className="text-sm text-ink-2">
            Emojis
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={values.emojis}
            aria-labelledby={ids.emojis}
            onClick={() => onChange({ emojis: !values.emojis })}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition ${
              values.emojis ? "border-brand-500 bg-brand-500" : "border-line bg-surface-2"
            }`}
          >
            <span
              className={`inline-block size-[18px] rounded-full shadow transition-transform ${
                values.emojis ? "translate-x-[22px] bg-on-accent" : "translate-x-[3px] bg-ink-2"
              }`}
            />
          </button>
        </div>
      </div>

      {models.length > 1 && (
        <div>
          <Label htmlFor={ids.model}>Writer</Label>
          <select
            id={ids.model}
            value={values.modelId}
            onChange={(e) => onChange({ modelId: e.target.value })}
            className="block w-full rounded-md border border-line bg-bg/60 px-3 py-2.5 text-sm text-ink focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 focus:outline-none"
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
                {m.isDefault ? " (default)" : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <button
          type="submit"
          disabled={loading}
          className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-brand-600 px-5 py-3 text-[15px] font-semibold text-on-accent transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {loading ? (
            <>
              <span className="size-4 animate-spin rounded-full border-2 border-on-accent/30 border-t-on-accent" aria-hidden="true" />
              Writing…
            </>
          ) : (
            "Write captions"
          )}
        </button>
        <p className="mt-2 text-center text-xs text-muted">
          or press <kbd className="font-sans font-semibold text-ink-2">Ctrl</kbd> +{" "}
          <kbd className="font-sans font-semibold text-ink-2">Enter</kbd>
        </p>
      </div>
    </form>
  );
}
