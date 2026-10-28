"use client";

import { PLATFORM_RULES } from "@/lib/platforms";
import type { GeneratedVariation, Platform } from "@/lib/schemas";
import { copyText } from "@/lib/client/clipboard";
import { useToast } from "./Toast";
import { AlertIcon, CopyIcon, HashIcon, RefreshIcon } from "./icons";

interface Props {
  index: number;
  variation: GeneratedVariation;
  platform: Platform;
  regenerating: boolean;
  disabled: boolean;
  onRegenerate: () => void;
}

export function fullPost(v: Pick<GeneratedVariation, "caption" | "hashtags">) {
  return v.hashtags.length ? `${v.caption}\n\n${v.hashtags.join(" ")}` : v.caption;
}

export function ResultCard({ index, variation, platform, regenerating, disabled, onRegenerate }: Props) {
  const toast = useToast();
  const rules = PLATFORM_RULES[platform];
  const length = [...fullPost(variation)].length;
  const over = length > rules.recommendedLength;

  async function copy(text: string, what: string) {
    const ok = await copyText(text);
    toast(ok ? `${what} copied` : "Couldn't copy. Select the text and copy it manually.", ok ? "success" : "error");
  }

  return (
    <article
      className="relative animate-fade-in rounded-lg border border-line bg-surface p-5 sm:p-6"
      aria-labelledby={`variation-${variation.id}`}
      aria-busy={regenerating}
    >
      <header className="mb-4 flex items-baseline justify-between gap-3">
        <h3 id={`variation-${variation.id}`} className="font-display text-2xl text-brand-700 tabular-nums">
          <span className="sr-only">Draft </span>
          {String(index + 1).padStart(2, "0")}
        </h3>
        <span className="truncate text-xs text-muted" title="The AI model that wrote this draft">
          by {variation.model}
        </span>
      </header>

      <p className="text-[15px] leading-relaxed break-words whitespace-pre-wrap text-ink">{variation.caption}</p>

      {variation.hashtags.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Hashtags">
          {variation.hashtags.map((tag) => (
            <li key={tag} className="rounded border border-line bg-bg/50 px-2 py-0.5 text-[13px] text-brand-800">
              {tag}
            </li>
          ))}
        </ul>
      )}

      <div className={`mt-4 flex items-center gap-1.5 text-xs ${over ? "text-amber-700" : "text-muted"}`}>
        {over && <AlertIcon className="size-3.5" />}
        <span className="tabular-nums">
          {length.toLocaleString("en-US")} / {rules.recommendedLength.toLocaleString("en-US")} characters
        </span>
        {over && <span>· longer than {platform === "facebook" ? "ideal" : "the limit"} for {rules.label}</span>}
      </div>

      <footer className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
        <ActionButton onClick={() => copy(variation.caption, "Caption")} icon={<CopyIcon className="size-4" />}>
          Copy caption
        </ActionButton>
        <ActionButton
          onClick={() => copy(variation.hashtags.join(" "), "Hashtags")}
          icon={<HashIcon className="size-4" />}
          disabled={variation.hashtags.length === 0}
        >
          Copy hashtags
        </ActionButton>
        <ActionButton onClick={() => copy(fullPost(variation), "Caption and hashtags")} icon={<CopyIcon className="size-4" />}>
          Copy all
        </ActionButton>
        <ActionButton
          onClick={onRegenerate}
          disabled={disabled}
          icon={<RefreshIcon className={`size-4 ${regenerating ? "animate-spin" : ""}`} />}
          className="sm:ml-auto"
        >
          {regenerating ? "Rewriting…" : "Try another"}
        </ActionButton>
      </footer>

      {regenerating && <div className="absolute inset-0 rounded-lg bg-surface/70" aria-hidden="true" />}
    </article>
  );
}

function ActionButton({
  children,
  icon,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon: React.ReactNode }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-sm text-ink-2 transition hover:border-muted hover:bg-surface-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}
