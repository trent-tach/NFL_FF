// Browser-local store for custom (hand-built) matchups -- the second half
// of "Your Matchups," alongside whatever's pulled live from connected
// leagues. Same no-accounts-yet pattern as lib/myLeagues.ts.

import type { CustomMatchup } from "./types";

const STORAGE_KEY = "ff.customMatchups";

export function loadCustomMatchups(): CustomMatchup[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CustomMatchup[]) : [];
  } catch {
    return [];
  }
}

function saveCustomMatchups(matchups: CustomMatchup[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(matchups));
  } catch {
    // Private browsing / storage disabled -- degrades to "doesn't persist."
  }
}

export function addCustomMatchup(matchup: CustomMatchup): CustomMatchup[] {
  const matchups = [...loadCustomMatchups(), matchup];
  saveCustomMatchups(matchups);
  return matchups;
}

export function removeCustomMatchup(id: string): CustomMatchup[] {
  const matchups = loadCustomMatchups().filter((m) => m.id !== id);
  saveCustomMatchups(matchups);
  return matchups;
}
