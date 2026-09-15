// Browser-local "my leagues" store. The site has no accounts, so a
// connected league (Sleeper roster pick, or an ESPN league's own cookies
// for a private league) lives only in this browser's localStorage --
// never sent anywhere except back to our own backend to look the league up.

import type { ConnectedLeague, LeaguePlatform } from "./types";

const STORAGE_KEY = "ff.myLeagues";

const PLATFORM_LABELS: Record<LeaguePlatform, string> = {
  sleeper: "Sleeper",
  espn: "ESPN",
  custom: "Custom",
};

export function platformLabel(platform: LeaguePlatform): string {
  return PLATFORM_LABELS[platform];
}

export function loadLeagues(): ConnectedLeague[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ConnectedLeague[]) : [];
  } catch {
    return [];
  }
}

function saveLeagues(leagues: ConnectedLeague[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(leagues));
  } catch {
    // Private browsing / storage disabled -- the league just won't persist
    // across a reload, which is a reasonable degradation, not a crash.
  }
}

export function addLeague(league: ConnectedLeague): ConnectedLeague[] {
  const leagues = [...loadLeagues(), league];
  saveLeagues(leagues);
  return leagues;
}

export function removeLeague(id: string): ConnectedLeague[] {
  const leagues = loadLeagues().filter((l) => l.id !== id);
  saveLeagues(leagues);
  return leagues;
}
