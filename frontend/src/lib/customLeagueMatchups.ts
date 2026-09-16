// Browser-local store for custom leagues' week-by-week matchups. Unlike
// Sleeper/ESPN, a custom league has no API of its own, so each week's
// matchup is entered by hand and kept here, one entry per (league, week).

import type { CustomLeagueMatchup } from "./types";

const STORAGE_KEY = "ff.customLeagueMatchups";

export function loadCustomLeagueMatchups(): CustomLeagueMatchup[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CustomLeagueMatchup[]) : [];
  } catch {
    return [];
  }
}

function saveAll(matchups: CustomLeagueMatchup[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(matchups));
  } catch {
    // Private browsing / storage disabled -- degrades to "doesn't persist."
  }
}

export function getCustomLeagueMatchup(leagueId: string, week: number): CustomLeagueMatchup | undefined {
  return loadCustomLeagueMatchups().find((m) => m.leagueId === leagueId && m.week === week);
}

/** Upserts by (leagueId, week) -- entering the same week twice edits it. */
export function saveCustomLeagueMatchup(matchup: CustomLeagueMatchup): void {
  const rest = loadCustomLeagueMatchups().filter(
    (m) => !(m.leagueId === matchup.leagueId && m.week === matchup.week),
  );
  saveAll([...rest, matchup]);
}
