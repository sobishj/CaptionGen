"use client";

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { PlatformLogo } from "./icons";

/**
 * A looping, self-playing demo of how to use CaptionGen: a cursor types a
 * description, picks a platform and tone, clicks "Write captions" and copies
 * a draft. Purely decorative for screen readers (the steps are listed as text).
 */

const TEXT = "Handmade soy candles, lavender scent, launching Friday";

const DRAFTS = [
  { caption: "Slow evenings, sorted. 🕯️ Our lavender soy candles land this Friday.", tags: "#soycandles #handmade #selfcare" },
  { caption: "Small batch. Hand poured. Smells like a deep breath. Friday it's yours.", tags: "#shopsmall #lavender #candlelover" },
];

const STEPS = ["Describe your post", "Pick platform & tone", "Write captions", "Copy & post"];

type Phase =
  | "idle"
  | "typing"
  | "toPlatform"
  | "toTone"
  | "toButton"
  | "writing"
  | "results"
  | "toCopy"
  | "copied"
  | "hold";

interface State {
  phase: Phase;
  typed: number;
  platform: boolean;
  tone: boolean;
  clicking: boolean;
}

const INITIAL: State = { phase: "idle", typed: 0, platform: false, tone: false, clicking: false };

function stepOf(phase: Phase): number {
  if (phase === "idle" || phase === "typing") return 0;
  if (phase === "toPlatform" || phase === "toTone") return 1;
  if (phase === "toButton" || phase === "writing") return 2;
  return 3;
}

export function HowItWorksDemo() {
  const [s, setS] = useState<State>(INITIAL);
  const [reduced, setReduced] = useState(false);
  const [paused, setPaused] = useState(false);
  const [cursor, setCursor] = useState({ x: 0, y: 0 });

  const box = useRef<HTMLDivElement>(null);
  const refs = {
    text: useRef<HTMLDivElement>(null),
    platform: useRef<HTMLSpanElement>(null),
    tone: useRef<HTMLSpanElement>(null),
    button: useRef<HTMLDivElement>(null),
    copy: useRef<HTMLSpanElement>(null),
  };

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  // The timeline: each phase schedules the next one.
  useEffect(() => {
    if (reduced || paused) return;
    let t: ReturnType<typeof setTimeout>;
    const next = (ms: number, patch: Partial<State>) => {
      t = setTimeout(() => setS((cur) => ({ ...cur, ...patch })), ms);
    };
    switch (s.phase) {
      case "idle":
        next(900, { phase: "typing" });
        break;
      case "typing":
        if (s.typed < TEXT.length) next(s.typed === 0 ? 400 : 38 + Math.random() * 40, { typed: s.typed + 1 });
        else next(500, { phase: "toPlatform" });
        break;
      case "toPlatform":
        if (!s.platform) next(800, { platform: true, clicking: true });
        else if (s.clicking) next(180, { clicking: false });
        else next(250, { phase: "toTone" });
        break;
      case "toTone":
        if (!s.tone) next(700, { tone: true, clicking: true });
        else if (s.clicking) next(180, { clicking: false });
        else next(250, { phase: "toButton" });
        break;
      case "toButton":
        if (!s.clicking) next(750, { clicking: true });
        else next(180, { clicking: false, phase: "writing" });
        break;
      case "writing":
        next(1300, { phase: "results" });
        break;
      case "results":
        next(1400, { phase: "toCopy" });
        break;
      case "toCopy":
        if (!s.clicking) next(800, { clicking: true });
        else next(180, { clicking: false, phase: "copied" });
        break;
      case "copied":
        next(1500, { phase: "hold" });
        break;
      case "hold":
        next(1800, { ...INITIAL });
        break;
    }
    return () => clearTimeout(t);
  }, [s, reduced, paused]);

  // Move the cursor to whatever the current phase is pointing at.
  const target: RefObject<HTMLElement | null> | null =
    s.phase === "typing"
      ? refs.text
      : s.phase === "toPlatform"
        ? refs.platform
        : s.phase === "toTone"
          ? refs.tone
          : s.phase === "toButton" || s.phase === "writing"
            ? refs.button
            : s.phase === "toCopy" || s.phase === "copied"
              ? refs.copy
              : null;

  useLayoutEffect(() => {
    const container = box.current;
    if (!container) return;
    const place = () => {
      const c = container.getBoundingClientRect();
      const el = target?.current;
      if (!el) {
        setCursor({ x: c.width * 0.82, y: c.height * 0.88 });
        return;
      }
      const r = el.getBoundingClientRect();
      const typingOffset = s.phase === "typing" ? Math.min(r.width - 24, 18 + s.typed * 4.2) : r.width / 2;
      setCursor({ x: r.left - c.left + typingOffset, y: r.top - c.top + r.height / 2 });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.phase, s.phase === "typing" ? Math.floor(s.typed / 6) : 0]);

  const view: State = reduced ? { phase: "copied", typed: TEXT.length, platform: true, tone: true, clicking: false } : s;
  const showResults = view.phase === "results" || view.phase === "toCopy" || view.phase === "copied" || view.phase === "hold";
  const current = stepOf(view.phase);

  return (
    <figure className="m-0">
      <div
        ref={box}
        className="relative overflow-hidden rounded-lg border border-line bg-bg shadow-[0_20px_45px_-28px_rgba(20,35,59,0.35)]"
        aria-hidden="true"
      >
        {/* window chrome */}
        <div className="flex items-center gap-1.5 border-b border-line px-3 py-2">
          <span className="size-2.5 rounded-full bg-line" />
          <span className="size-2.5 rounded-full bg-line" />
          <span className="size-2.5 rounded-full bg-line" />
          <span className="ml-3 text-[11px] text-muted">captiongen</span>
        </div>

        <div className="grid gap-3 p-3 text-[12px] sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] sm:p-4">
          {/* mini form */}
          <div className="space-y-3 rounded-md border border-line bg-surface p-3">
            <div
              ref={refs.text}
              className={`min-h-[52px] rounded border bg-bg/60 px-2 py-1.5 leading-snug transition-colors ${
                view.phase === "typing" ? "border-brand-500" : "border-line"
              }`}
            >
              {view.typed === 0 ? (
                <span className="text-muted">What are you posting about?</span>
              ) : (
                <span className="text-ink">{TEXT.slice(0, view.typed)}</span>
              )}
              {view.phase === "typing" && <span className="ml-px inline-block h-3 w-px animate-pulse bg-ink align-middle" />}
            </div>

            <div className="grid grid-cols-3 gap-1 rounded border border-line bg-bg/60 p-0.5">
              <span
                ref={refs.platform}
                className={`flex items-center justify-center gap-1 rounded-[3px] py-1 transition-colors ${
                  view.platform ? "bg-surface font-semibold text-ink ring-1 ring-line" : "text-ink-2"
                }`}
              >
                <PlatformLogo platform="instagram" size={13} />
                <span className="hidden sm:inline">Insta</span>
              </span>
              <span className="flex items-center justify-center gap-1 py-1 text-ink-2">
                <PlatformLogo platform="linkedin" size={13} />
              </span>
              <span className="flex items-center justify-center gap-1 py-1 text-ink-2">
                <PlatformLogo platform="facebook" size={13} />
              </span>
            </div>

            <div className="flex flex-wrap gap-1">
              <span className="rounded-full border border-line px-2 py-0.5 text-ink-2">Professional</span>
              <span
                ref={refs.tone}
                className={`rounded-full border px-2 py-0.5 transition-colors ${
                  view.tone ? "border-brand-500 bg-brand-500/15 text-brand-800" : "border-line text-ink-2"
                }`}
              >
                Friendly
              </span>
            </div>

            <div
              ref={refs.button}
              className={`rounded bg-brand-600 py-1.5 text-center font-semibold text-on-accent transition-transform ${
                view.clicking && view.phase === "toButton" ? "scale-[0.97]" : ""
              }`}
            >
              {view.phase === "writing" ? "Writing…" : "Write captions"}
            </div>
          </div>

          {/* mini results */}
          <div className="relative min-h-[170px] space-y-2">
            {view.phase === "writing" &&
              [0, 1].map((i) => (
                <div key={i} className="animate-pulse space-y-1.5 rounded-md border border-line bg-surface p-3">
                  <div className="h-2 w-5/6 rounded bg-surface-2" />
                  <div className="h-2 w-2/3 rounded bg-surface-2" />
                  <div className="h-2 w-1/2 rounded bg-surface-2" />
                </div>
              ))}
            {showResults &&
              DRAFTS.map((d, i) => (
                <div
                  key={i}
                  className="animate-fade-in rounded-md border border-line bg-surface p-3"
                  style={{ animationDelay: `${i * 120}ms`, animationFillMode: "backwards" }}
                >
                  <div className="mb-1 flex items-baseline justify-between">
                    <span className="font-display text-sm text-brand-700">0{i + 1}</span>
                    {i === 0 && (
                      <span
                        ref={refs.copy}
                        className={`rounded border px-1.5 py-0.5 text-[10px] transition-colors ${
                          view.phase === "copied" || view.phase === "hold" ? "border-brand-500 text-brand-800" : "border-line text-ink-2"
                        }`}
                      >
                        {view.phase === "copied" || view.phase === "hold" ? "Copied ✓" : "Copy"}
                      </span>
                    )}
                  </div>
                  <p className="leading-snug text-ink">{d.caption}</p>
                  <p className="mt-1 text-brand-800/90">{d.tags}</p>
                </div>
              ))}
            {view.phase !== "writing" && !showResults && (
              <div className="flex h-full min-h-[170px] items-center justify-center rounded-md border border-dashed border-line text-muted">
                Drafts appear here
              </div>
            )}
          </div>
        </div>

        {/* cursor */}
        {!reduced && (
          <div
            className="pointer-events-none absolute top-0 left-0 z-10 transition-transform duration-700 ease-[cubic-bezier(0.45,0,0.2,1)]"
            style={{ transform: `translate(${cursor.x}px, ${cursor.y}px)` }}
          >
            <svg
              width="18"
              height="22"
              viewBox="0 0 18 22"
              className={`-translate-x-[3px] -translate-y-[2px] drop-shadow transition-transform duration-150 ${s.clicking ? "scale-90" : ""}`}
            >
              <path d="M2 1.5l13.5 12.2-6.3.6 3.6 6.6-2.6 1.3-3.6-6.6L2 20z" fill="#14233b" stroke="#ffffff" strokeWidth="1.3" strokeLinejoin="round" />
            </svg>
            {s.clicking && <span className="absolute -top-2 -left-2 size-5 animate-ping rounded-full bg-brand-500/50" />}
          </div>
        )}
      </div>

      <figcaption className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <ol className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
          {STEPS.map((label, i) => (
            <li
              key={label}
              className={`flex items-center gap-1.5 transition-colors ${i === current && !reduced ? "text-ink" : "text-muted"}`}
            >
              <span
                className={`inline-flex size-4 items-center justify-center rounded-full text-[10px] font-semibold tabular-nums transition-colors ${
                  i === current && !reduced ? "bg-brand-600 text-on-accent" : "bg-surface-2 text-muted"
                }`}
              >
                {i + 1}
              </span>
              {label}
            </li>
          ))}
        </ol>
        {!reduced && (
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            className="rounded-md border border-line px-2.5 py-1 text-xs text-ink-2 hover:bg-surface-2 hover:text-ink"
          >
            {paused ? "Play demo" : "Pause demo"}
          </button>
        )}
      </figcaption>
    </figure>
  );
}
