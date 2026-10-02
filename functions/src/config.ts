import * as admin from "firebase-admin";
import { defineSecret } from "firebase-functions/params";

admin.initializeApp();
export const db = admin.firestore();
export const tbaKey = defineSecret("TBA_API_KEY");
export const TBA_BASE_URL = "https://www.thebluealliance.com/api/v3";

export const SEASON_CONFIG = {
  START_MONTH: 1, // January
  START_DAY: 1,
  END_MONTH: 5, // May
  END_DAY: 31,
};

export function isInSeason(date: Date = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);
  const afterStart =
    month > SEASON_CONFIG.START_MONTH ||
    (month === SEASON_CONFIG.START_MONTH && day >= SEASON_CONFIG.START_DAY);
  const beforeEnd =
    month < SEASON_CONFIG.END_MONTH ||
    (month === SEASON_CONFIG.END_MONTH && day <= SEASON_CONFIG.END_DAY);
  return afterStart && beforeEnd;
}
