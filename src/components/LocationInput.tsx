"use client";

import { useEffect, useRef, useState } from "react";
import { searchPlaces, type Place } from "@/lib/geo";
import type { HomeLocation } from "@/lib/profile";

// Wait this long after the last keystroke before searching (Nominatim allows
// at most 1 request per second; see src/lib/geo.ts)
const DEBOUNCE_MS = 600;

interface Props {
  id: string;
  /** The currently picked location (null = none picked). */
  value: HomeLocation | null;
  /**
   * Called on every change. `location` is null while the user is typing and
   * set once they pick a suggestion. `text` is what is in the box, so the
   * parent can tell "empty" from "typed but not picked".
   */
  onChange: (location: HomeLocation | null, text: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}

type Status = "idle" | "searching" | "results" | "empty" | "error";

/** Text box that searches for a place and lets the user pick one. */
export default function LocationInput({
  id,
  value,
  onChange,
  placeholder = "Augusta, GA",
  autoFocus,
}: Props) {
  const [text, setText] = useState(value?.label ?? "");
  const [status, setStatus] = useState<Status>("idle");
  const [results, setResults] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);

  const wrapRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const abortRef = useRef<AbortController | null>(null);

  // Close the dropdown when clicking elsewhere
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Stop any pending search when the box goes away
  useEffect(
    () => () => {
      clearTimeout(timerRef.current);
      abortRef.current?.abort();
    },
    []
  );

  async function runSearch(query: string) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const places = await searchPlaces(query, 5, controller.signal);
      if (controller.signal.aborted) return;
      setResults(places);
      setStatus(places.length > 0 ? "results" : "empty");
      setOpen(true);
    } catch {
      if (controller.signal.aborted) return;
      setResults([]);
      setStatus("error");
      setOpen(true);
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    setText(next);
    onChange(null, next);

    clearTimeout(timerRef.current);
    abortRef.current?.abort();

    if (next.trim().length < 3) {
      setResults([]);
      setStatus("idle");
      setOpen(false);
      return;
    }

    // Wait until typing pauses before searching
    setStatus("searching");
    timerRef.current = setTimeout(() => runSearch(next), DEBOUNCE_MS);
  }

  function handlePick(place: Place) {
    setText(place.label);
    setResults([]);
    setStatus("idle");
    setOpen(false);
    onChange({ lat: place.lat, lng: place.lng, label: place.label }, place.label);
  }

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <input
          id={id}
          type="text"
          value={text}
          onChange={handleChange}
          onFocus={() => status !== "idle" && status !== "searching" && setOpen(true)}
          placeholder={placeholder}
          autoComplete="off"
          autoFocus={autoFocus}
          aria-describedby={`${id}-status`}
          className="w-full rounded-lg bg-[#1a3a2a] border border-[#2d5040] text-white placeholder-[#4d7a5d] px-4 py-3 pr-9 text-base sm:text-sm outline-none focus:border-[#4ade80] focus:ring-1 focus:ring-[#4ade80] transition-colors"
        />
        {status === "searching" && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="w-4 h-4 border-2 border-[#4ade80]/30 border-t-[#4ade80] rounded-full animate-spin" />
          </div>
        )}
        {value && status !== "searching" && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              className="text-[#4ade80]"
              aria-label="Location selected"
            >
              <path
                d="M2 7l3.5 3.5 6.5-6.5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        )}
      </div>

      <p id={`${id}-status`} className="sr-only" aria-live="polite">
        {status === "searching"
          ? "Searching"
          : status === "results"
            ? `${results.length} suggestions`
            : ""}
      </p>

      {status === "searching" && (
        <p className="text-xs text-[#4d7a5d] mt-1.5">Searching…</p>
      )}

      {open && status === "results" && (
        <ul className="absolute top-full mt-1 left-0 right-0 z-20 bg-[#0f2018] border border-[#2d5040] rounded-lg overflow-hidden shadow-xl">
          {results.map((place, i) => (
            <li key={`${place.lat},${place.lng},${i}`}>
              <button
                type="button"
                onClick={() => handlePick(place)}
                className="w-full text-left px-4 py-3 text-sm text-white/80 hover:bg-[#1a3a2a] hover:text-white transition-colors truncate"
              >
                {place.label}
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && status === "empty" && (
        <p className="text-xs text-amber-400/90 mt-1.5">
          No places found for &ldquo;{text.trim()}&rdquo;. Try a city and
          state, or a zip code.
        </p>
      )}

      {status === "error" && (
        <p className="text-xs text-red-400 mt-1.5" role="alert">
          Location search isn&apos;t responding.{" "}
          <button
            type="button"
            className="underline"
            onClick={() => {
              setStatus("searching");
              void runSearch(text);
            }}
          >
            Try again
          </button>
        </p>
      )}
    </div>
  );
}
