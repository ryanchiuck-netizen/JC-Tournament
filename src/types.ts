export interface Tournament {
  name: string;
  dates: string;
  link: string;
  ageGroup: string;
  source: "HK" | "AUS";
  location?: string;
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
  tournamentDates: string;
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

export interface PlayerScoutReport {
  summary: string;
  strengths: string[];
  tactics: string[];
  recentFormAnalysis: string;
  keyMatchups?: string;
}

export interface DrawAnalysisReport {
  bracketOverview: string;
  potentialRoadmap: string[];
  dangerousFloaters: string[];
  tacticalAdvice: string[];
}

export interface ScheduleOptimizationReport {
  optimalPlan: string[];
  clashesDetected: { tournaments: string[]; reason: string }[];
  deadlineAlerts: string[];
  recommendations: string[];
}

