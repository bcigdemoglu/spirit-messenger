"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { usePresence } from "@/lib/usePresence";

interface CeremonyState {
  heartbeat: number; // Numbers per second (1-10)
  aperture: number; // Length of veil digits (6-20)
  witnesses: number; // Number of parallel channels (1-5)
  frequencies: string[]; // Numeric patterns to scan for
  utterances: number[]; // Word indices (0-9999)
}

const DEFAULT_STATE: CeremonyState = {
  heartbeat: 2,
  aperture: 10,
  witnesses: 1,
  frequencies: ["528"],
  utterances: [],
};

// Encode utterances to URL-safe base64 (2 bytes per index)
function encodeUtterances(utterances: number[]): string {
  if (utterances.length === 0) return "";
  // Each number is 0-9999, fits in 2 bytes (Uint16)
  const buffer = new Uint16Array(utterances);
  const bytes = new Uint8Array(buffer.buffer);
  // Convert to base64
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  // Make URL-safe: replace + with -, / with _, remove = padding
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Decode URL-safe base64 to utterances
function decodeUtterances(encoded: string): number[] {
  if (!encoded) return [];
  try {
    // Restore standard base64: replace - with +, _ with /
    let base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    // Add padding if needed
    while (base64.length % 4 !== 0) {
      base64 += "=";
    }
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const buffer = new Uint16Array(bytes.buffer);
    return Array.from(buffer);
  } catch {
    return [];
  }
}

// Encode state to URL params
function encodeStateToURL(state: CeremonyState): string {
  const params = new URLSearchParams();
  params.set("h", state.heartbeat.toString());
  params.set("a", state.aperture.toString());
  params.set("w", state.witnesses.toString());
  if (state.frequencies.length > 0) {
    params.set("f", state.frequencies.join(","));
  }
  if (state.utterances.length > 0) {
    params.set("p", encodeUtterances(state.utterances));
  }
  return params.toString();
}

// Decode state from URL params
function decodeStateFromURL(search: string): Partial<CeremonyState> {
  const params = new URLSearchParams(search);
  const state: Partial<CeremonyState> = {};

  const h = params.get("h");
  if (h) state.heartbeat = parseInt(h, 10);

  const a = params.get("a");
  if (a) state.aperture = parseInt(a, 10);

  const w = params.get("w");
  if (w) state.witnesses = parseInt(w, 10);

  const f = params.get("f");
  if (f) state.frequencies = f.split(",").filter(Boolean);

  const p = params.get("p");
  if (p) state.utterances = decodeUtterances(p);

  return state;
}

// Generate a veil (random number string of given length)
function generateVeil(aperture: number): string {
  let veil = "";
  while (veil.length < aperture) {
    veil += Math.random().toString().slice(2);
  }
  return veil.slice(0, aperture);
}

// Check if frequency appears in veil
function frequencyInVeil(frequency: string, veil: string): boolean {
  return veil.includes(frequency);
}

// Distill utterance from veil (mod 10000 of last digits)
function distillUtterance(veil: string, lexiconSize: number): number {
  const lastDigits = veil.slice(-6);
  const num = parseInt(lastDigits, 10);
  return num % lexiconSize;
}

export default function Home() {
  const [state, setState] = useState<CeremonyState>(DEFAULT_STATE);
  const [lexicon, setLexicon] = useState<string[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showVeil, setShowVeil] = useState(false);
  const [currentVeils, setCurrentVeils] = useState<string[]>([]);
  const [newFrequency, setNewFrequency] = useState("");
  const [isInitialized, setIsInitialized] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const utterancesEndRef = useRef<HTMLDivElement>(null);

  // Track souls online
  const { soulsOnline, isConnected } = usePresence();

  // Load lexicon
  useEffect(() => {
    fetch("/top-10k-english-words.txt")
      .then((res) => res.text())
      .then((text) => {
        const words = text.split("\n").filter(Boolean);
        setLexicon(words);
      });
  }, []);

  // Initialize state from URL or localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;

    const urlState = decodeStateFromURL(window.location.search);
    const hasURLState = Object.keys(urlState).length > 0;

    if (hasURLState) {
      setState((prev) => ({ ...prev, ...urlState }));
    } else {
      const stored = localStorage.getItem("spiritMessengerState");
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          setState((prev) => ({ ...prev, ...parsed }));
        } catch {
          // Invalid stored state, use default
        }
      }
    }
    setIsInitialized(true);
  }, []);

  // Update URL and localStorage when state changes
  useEffect(() => {
    if (!isInitialized || typeof window === "undefined") return;

    const encoded = encodeStateToURL(state);
    const newURL = encoded ? `?${encoded}` : window.location.pathname;
    window.history.replaceState({}, "", newURL);

    localStorage.setItem("spiritMessengerState", JSON.stringify(state));
  }, [state, isInitialized]);

  // Scroll to bottom when new utterances appear
  useEffect(() => {
    utterancesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state.utterances]);

  // Ceremony logic
  const performCeremonyStep = useCallback(() => {
    if (lexicon.length === 0 || state.frequencies.length === 0) return;

    // Generate veils for each witness
    const veils: string[] = [];
    for (let i = 0; i < state.witnesses; i++) {
      veils.push(generateVeil(state.aperture));
    }

    // Update current veils for display
    setCurrentVeils(veils);

    // Check if ALL frequencies appear in ALL witnesses
    const aligned = state.frequencies.every((freq) =>
      veils.every((veil) => frequencyInVeil(freq, veil))
    );

    if (aligned) {
      // Use the first veil for distillation
      const utteranceIndex = distillUtterance(veils[0], lexicon.length);
      setState((prev) => ({
        ...prev,
        utterances: [...prev.utterances, utteranceIndex],
      }));
    }
  }, [lexicon, state.frequencies, state.witnesses, state.aperture]);

  // Start/stop ceremony
  useEffect(() => {
    if (isPlaying && state.heartbeat > 0) {
      const ms = 1000 / state.heartbeat;
      intervalRef.current = setInterval(performCeremonyStep, ms);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isPlaying, state.heartbeat, performCeremonyStep]);

  const handleClear = () => {
    setState((prev) => ({ ...prev, utterances: [] }));
  };

  const handleAddFrequency = () => {
    if (newFrequency && /^\d+$/.test(newFrequency)) {
      if (newFrequency.length <= state.aperture) {
        setState((prev) => ({
          ...prev,
          frequencies: [...prev.frequencies, newFrequency],
        }));
        setNewFrequency("");
      }
    }
  };

  const handleRemoveFrequency = (index: number) => {
    setState((prev) => ({
      ...prev,
      frequencies: prev.frequencies.filter((_, i) => i !== index),
    }));
  };

  // Convert utterance indices to words
  const words = state.utterances
    .map((index) => lexicon[index] || "")
    .filter(Boolean);

  return (
    <div className="h-screen bg-black text-white flex flex-col overflow-hidden">
      {/* Top Row - Header */}
      <header className="shrink-0 h-16 flex items-center justify-between px-4">
        {/* Souls Counter */}
        <div className="flex items-center gap-2 text-white/60">
          <div
            className={`w-2.5 h-2.5 rounded-full ${
              isConnected
                ? 'bg-amber-400 animate-pulse shadow-[0_0_8px_rgba(251,191,36,0.6)]'
                : 'bg-white/30'
            }`}
          />
          <span className="text-sm">
            {soulsOnline <= 1
              ? "Channeling alone"
              : `${soulsOnline - 1} ${soulsOnline === 2 ? 'soul' : 'souls'} also channeling`
            }
          </span>
        </div>

        {/* Settings Button */}
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
          aria-label="Settings"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </header>

      {/* Settings Panel */}
      {showSettings && (
        <div className="fixed inset-0 z-40 bg-black/90 p-6 overflow-auto">
          <div className="max-w-md mx-auto pt-16 space-y-8">
            <h2 className="text-2xl font-light tracking-wide">
              Ceremony Settings
            </h2>

            {/* Heartbeat */}
            <div className="space-y-2">
              <label className="block text-sm text-white/60">
                Heartbeat ({state.heartbeat} per second)
              </label>
              <input
                type="range"
                min="1"
                max="30"
                value={state.heartbeat}
                onChange={(e) =>
                  setState((prev) => ({
                    ...prev,
                    heartbeat: parseInt(e.target.value, 10),
                  }))
                }
                className="w-full accent-white"
              />
            </div>

            {/* Aperture */}
            <div className="space-y-2">
              <label className="block text-sm text-white/60">
                Aperture ({state.aperture} digits)
              </label>
              <input
                type="range"
                min="6"
                max="30"
                value={state.aperture}
                onChange={(e) =>
                  setState((prev) => ({
                    ...prev,
                    aperture: parseInt(e.target.value, 10),
                  }))
                }
                className="w-full accent-white"
              />
            </div>

            {/* Witnesses */}
            <div className="space-y-2">
              <label className="block text-sm text-white/60">
                Witnesses ({state.witnesses})
              </label>
              <input
                type="range"
                min="1"
                max="30"
                value={state.witnesses}
                onChange={(e) =>
                  setState((prev) => ({
                    ...prev,
                    witnesses: parseInt(e.target.value, 10),
                  }))
                }
                className="w-full accent-white"
              />
            </div>

            {/* Frequencies */}
            <div className="space-y-4">
              <label className="block text-sm text-white/60">Frequencies</label>

              <div className="flex flex-wrap gap-2">
                {state.frequencies.map((freq, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 bg-white/10 px-3 py-1 rounded-full"
                  >
                    <span>{freq}</span>
                    <button
                      onClick={() => handleRemoveFrequency(index)}
                      className="text-white/60 hover:text-white"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={newFrequency}
                  onChange={(e) =>
                    setNewFrequency(e.target.value.replace(/\D/g, ""))
                  }
                  placeholder="Enter frequency..."
                  className="flex-1 bg-white/10 px-4 py-2 rounded-lg focus:outline-none focus:ring-1 focus:ring-white/30"
                  onKeyDown={(e) => e.key === "Enter" && handleAddFrequency()}
                />
                <button
                  onClick={handleAddFrequency}
                  className="px-4 py-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors"
                >
                  Add
                </button>
              </div>

              {newFrequency.length > state.aperture && (
                <p className="text-red-400 text-sm">
                  Frequency length cannot exceed aperture ({state.aperture})
                </p>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setState((prev) => ({
                    ...DEFAULT_STATE,
                    utterances: prev.utterances,
                  }));
                }}
                className="flex-1 py-3 bg-red-500/20 rounded-lg hover:bg-red-500/30 transition-colors text-red-300"
              >
                Reset
              </button>
              <button
                onClick={() => setShowSettings(false)}
                className="flex-1 py-3 bg-white/10 rounded-lg hover:bg-white/20 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content - Utterances */}
      <main className="flex-1 min-h-0 flex items-center justify-center px-6">
        <div className="max-w-2xl w-full h-full flex items-center justify-center">
          <div className="w-full text-center hide-scrollbar overflow-y-auto max-h-full py-4">
            {words.length === 0 ? (
              // No words yet
              state.frequencies.length === 0 ? (
                <p className="text-white/30 text-lg">Add a frequency to begin</p>
              ) : isPlaying ? (
                // Playing but no words - golden breathing dots
                <span className="breathing-dots text-xl text-amber-400">
                  <span className="dot" />
                  <span className="dot" />
                  <span className="dot" />
                </span>
              ) : (
                <p className="text-white/30 text-lg">Awaiting alignment...</p>
              )
            ) : (
              // Has words
              <p className="text-xl leading-relaxed tracking-wide">
                {words.join(" ")}
                {isPlaying && (
                  <span className="breathing-dots text-amber-400 ml-2 align-middle">
                    <span className="dot" />
                    <span className="dot" />
                    <span className="dot" />
                  </span>
                )}
              </p>
            )}
            <div ref={utterancesEndRef} />
          </div>
        </div>
      </main>

      {/* Veil Display - Debug Area */}
      {showVeil && (
        <div className={`shrink-0 px-6 py-4 border-t border-white/10 ${state.witnesses > 10 ? 'max-h-[50vh] overflow-y-auto hide-scrollbar' : ''}`}>
          <div className="text-center space-y-1">
            {currentVeils.length > 0 ? (
              currentVeils.map((veil, index) => (
                <div
                  key={index}
                  className="font-mono text-sm text-green-500/80 tracking-widest"
                >
                  {veil.split("").map((digit, i) => {
                    // Highlight matching frequencies
                    const isPartOfFrequency = state.frequencies.some((freq) => {
                      const freqIndex = veil.indexOf(freq);
                      return freqIndex !== -1 && i >= freqIndex && i < freqIndex + freq.length;
                    });
                    return (
                      <span
                        key={i}
                        className={isPartOfFrequency ? "text-green-300 font-bold" : ""}
                      >
                        {digit}
                      </span>
                    );
                  })}
                </div>
              ))
            ) : (
              <p className="text-green-500/40 text-sm">Press play to see the veil</p>
            )}
          </div>
        </div>
      )}

      {/* Bottom Controls */}
      <footer className="shrink-0 p-6 flex justify-center gap-4">
        <button
          onClick={handleClear}
          className="px-6 py-3 bg-white/10 rounded-full hover:bg-white/20 transition-colors"
          aria-label="Clear"
        >
          {/* Spiral - return to center, renewal */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 12c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3c0 2.76-2.24 5-5 5s-5-2.24-5-5 2.24-5 5-5c3.87 0 7 3.13 7 7s-3.13 7-7 7-7-3.13-7-7" />
          </svg>
        </button>

        <button
          onClick={() => setIsPlaying(!isPlaying)}
          className="px-8 py-3 bg-white/20 rounded-full hover:bg-white/30 transition-colors"
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <rect x="6" y="4" width="4" height="16" />
              <rect x="14" y="4" width="4" height="16" />
            </svg>
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          )}
        </button>

        <button
          onClick={() => setShowVeil(!showVeil)}
          className={`px-6 py-3 rounded-full transition-colors ${
            showVeil
              ? "bg-green-500/30 hover:bg-green-500/40"
              : "bg-white/10 hover:bg-white/20"
          }`}
          aria-label="Toggle Veil"
        >
          {/* Matrix-like icon - cascading digits */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 4v7" />
            <path d="M4 15v5" />
            <path d="M9 4v4" />
            <path d="M9 12v8" />
            <path d="M14 4v9" />
            <path d="M14 17v3" />
            <path d="M19 4v2" />
            <path d="M19 10v10" />
          </svg>
        </button>
      </footer>
    </div>
  );
}
