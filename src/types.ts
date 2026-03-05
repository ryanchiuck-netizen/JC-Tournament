export interface Tournament {
  name: string;
  dates: string;
  link: string;
  ageGroup: string;
  source: "HK" | "AUS";
  distance?: string;
  mapsLink?: string;
  closingDeadline?: string;
}

export type Region = "HK" | "AUS" | "BOTH";
export type AgeFilter = "ALL" | "U10" | "U12";

export interface PlayerMatch {
  tournamentName: string;
  tournamentLink: string;
  drawName: string;
  drawLink?: string;
}

export interface PlayerWatchResult {
  playerName: string;
  matches: PlayerMatch[];
}

export interface StaticData {
  lastUpdated: string;
  tournaments: Tournament[];
  isScraping?: boolean;
}
