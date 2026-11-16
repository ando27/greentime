"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { friendlyError } from "@/lib/errors";

type ToastKind = "error" | "success";

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  /** Show a red error toast. Pass the raw error; it is made readable for you. */
  error: (err: unknown, fallback?: string) => void;
  /** Show a green confirmation toast. */
  success: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/**
 * Shared way to tell the user something worked or failed.
 *
 *   const toast = useToast();
 *   const { error } = await supabase.from("rsvps").delete().eq("id", id);
 *   if (error) return toast.error(error, "Couldn't remove your RSVP.");
 *   toast.success("RSVP removed");
 *
 * Rule: every Supabase call checks `error` and shows it (toast or inline).
 */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (kind: ToastKind, message: string) => {
      const id = nextId.current++;
      // Keep at most 3 on screen; drop an identical message already showing
      setToasts((prev) =>
        [...prev.filter((t) => t.message !== message), { id, kind, message }].slice(-3)
      );
      setTimeout(() => dismiss(id), kind === "error" ? 8000 : 4000);
    },
    [dismiss]
  );

  const api = useMemo<ToastApi>(
    () => ({
      error: (err, fallback) => {
        console.error(err);
        show("error", friendlyError(err, fallback));
      },
      success: (message) => show("success", message),
    }),
    [show]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="fixed bottom-4 inset-x-0 z-[100] flex flex-col items-center gap-2 px-4 pointer-events-none"
        aria-live="assertive"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.kind === "error" ? "alert" : "status"}
            className={`pointer-events-auto w-full max-w-sm flex items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-2xl ${
              t.kind === "error"
                ? "bg-[#2a1215] border-red-400/40 text-red-200"
                : "bg-[#0f2018] border-[#4ade80]/40 text-[#4ade80]"
            }`}
          >
            <span className="flex-1 min-w-0 break-words">{t.message}</span>
            <button
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              className="shrink-0 -mr-1 -mt-0.5 p-1 opacity-70 hover:opacity-100"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
