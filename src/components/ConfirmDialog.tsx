"use client";

import { useEffect } from "react";

interface Props {
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  /** Shown on the confirm button while the action runs */
  busyLabel?: string;
  busy?: boolean;
  /** Red confirm button for destructive actions (the default) */
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** "Are you sure?" dialog for actions that can't be undone. */
export default function ConfirmDialog({
  title,
  message,
  confirmLabel,
  busyLabel,
  busy = false,
  danger = true,
  onConfirm,
  onCancel,
}: Props) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && !busy && onCancel();
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [busy, onCancel]);

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 px-4 pb-4 sm:pb-0"
      onClick={(e) => e.target === e.currentTarget && !busy && onCancel()}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="bg-[#0f2018] border border-[#2d5040] rounded-2xl p-7 w-full max-w-sm shadow-2xl"
      >
        <h2 className="text-white font-semibold text-lg mb-2">{title}</h2>
        <div className="text-white/50 text-sm mb-6">{message}</div>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={busy}
            className="flex-1 border border-[#2d5040] text-white/50 text-sm font-medium py-3 rounded-lg hover:border-[#4d7a5d] hover:text-white/70 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className={`flex-1 font-semibold text-sm py-3 rounded-lg active:scale-[0.98] transition-all disabled:opacity-50 ${
              danger
                ? "bg-rose-500 text-white hover:bg-rose-400"
                : "bg-[#4ade80] text-[#0f2018] hover:bg-[#6ee7a0]"
            }`}
          >
            {busy ? (busyLabel ?? "Working…") : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
