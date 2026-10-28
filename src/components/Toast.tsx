"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AlertIcon, CheckIcon } from "./icons";

type ToastKind = "success" | "error";
interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}

const ToastContext = createContext<(message: string, kind?: ToastKind) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const show = useCallback((message: string, kind: ToastKind = "success") => {
    const id = ++nextId.current;
    // Keep at most 3 toasts on screen.
    setToasts((t) => [...t.slice(-2), { id, message, kind }]);
    timers.current.set(
      id,
      setTimeout(() => {
        setToasts((t) => t.filter((x) => x.id !== id));
        timers.current.delete(id);
      }, 2200),
    );
  }, []);

  useEffect(() => {
    const map = timers.current;
    return () => map.forEach(clearTimeout);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4"
        role="status"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex animate-toast-in items-center gap-2 rounded-md px-4 py-2 text-sm font-medium shadow-lg ${
              t.kind === "success" ? "bg-ink text-on-accent" : "bg-red-600 text-white"
            }`}
          >
            {t.kind === "success" ? <CheckIcon className="size-4" /> : <AlertIcon className="size-4" />}
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
