import * as functions from "firebase-functions";
import { db } from "./config";
import { rateLimit } from "./utils";

const STANDARD_COUNT = 8;
const WILDCARD_COUNT = 2;
const TOTAL_TEAMS = STANDARD_COUNT + WILDCARD_COUNT;
const WILDCARD_MIN_TEAM_NUMBER = 5000;

export const submitDraft = functions.https.onCall(async (data: any, context: functions.https.CallableContext) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Login required.");
  }

  const uid = context.auth.uid;
  await rateLimit(uid, "submitDraft", 10, 60 * 60 * 1000);

  // Validate input
  const teams: unknown = data.teams;
  if (!Array.isArray(teams) || teams.length !== TOTAL_TEAMS) {
    throw new functions.https.HttpsError("invalid-argument", `You must pick exactly ${TOTAL_TEAMS} teams.`);
  }

  // Ensure all entries are strings of digits
  for (const t of teams) {
    if (typeof t !== "string" || !/^\d+$/.test(t)) {
      throw new functions.https.HttpsError("invalid-argument", `Invalid team number: ${t}`);
    }
  }

  // Check for duplicates
  if (new Set(teams).size !== teams.length) {
    throw new functions.https.HttpsError("invalid-argument", "Duplicate teams are not allowed.");
  }

  // Check draft lock and active year
  const dsSnap = await db.collection("draft_state").doc("global").get();
  const dsData = dsSnap.data();
  const activeYear = dsData?.active_year;
  if (!activeYear) {
    throw new functions.https.HttpsError("failed-precondition", "No active year/season set.");
  }
  if (dsData?.team_picking_locked === true) {
    throw new functions.https.HttpsError("failed-precondition", "Team picking is currently locked.");
  }

  // Split into standard and wildcard
  const standardTeams = teams.filter(t => parseInt(t) <= WILDCARD_MIN_TEAM_NUMBER);
  const wildcardTeams = teams.filter(t => parseInt(t) > WILDCARD_MIN_TEAM_NUMBER);

  if (standardTeams.length !== STANDARD_COUNT) {
    throw new functions.https.HttpsError("invalid-argument", `You must pick exactly ${STANDARD_COUNT} standard teams (number <= ${WILDCARD_MIN_TEAM_NUMBER}).`);
  }
  if (wildcardTeams.length !== WILDCARD_COUNT) {
    throw new functions.https.HttpsError("invalid-argument", `You must pick exactly ${WILDCARD_COUNT} wildcard teams (number > ${WILDCARD_MIN_TEAM_NUMBER}).`);
  }

  // Fetch team documents to verify existence and get region data
  const teamDocs = await Promise.all(
    standardTeams.map(t => db.collection("teams").doc(t).get())
  );

  const usStates = new Set<string>();
  const intlCountries = new Set<string>();

  for (let i = 0; i < standardTeams.length; i++) {
    const doc = teamDocs[i];
    if (!doc.exists) {
      throw new functions.https.HttpsError("not-found", `Team ${standardTeams[i]} does not exist.`);
    }

    const teamData = doc.data()!;
    const activeYears = teamData.activeYears || [];
    if (!activeYears.includes(activeYear)) {
      throw new functions.https.HttpsError("invalid-argument", `Team ${standardTeams[i]} is not active in the ${activeYear} season.`);
    }

    const country = teamData.country || "";
    const state = teamData.state || "";
    const isUS = country === "USA" || country === "United States";

    if (isUS && state) {
      if (usStates.has(state)) {
        throw new functions.https.HttpsError("invalid-argument", `You already have a team from ${state}. No two standard teams can be from the same US state.`);
      }
      usStates.add(state);
    } else if (country) {
      if (intlCountries.has(country)) {
        throw new functions.https.HttpsError("invalid-argument", `You already have a team from ${country}. No two standard teams can be from the same country.`);
      }
      intlCountries.add(country);
    }
  }

  // Verify wildcard teams exist
  const wildcardDocs = await Promise.all(
    wildcardTeams.map(t => db.collection("teams").doc(t).get())
  );
  for (let i = 0; i < wildcardTeams.length; i++) {
    const doc = wildcardDocs[i];
    if (!doc.exists) {
      throw new functions.https.HttpsError("not-found", `Team ${wildcardTeams[i]} does not exist.`);
    }
    const teamData = doc.data()!;
    const activeYears = teamData.activeYears || [];
    if (!activeYears.includes(activeYear)) {
      throw new functions.https.HttpsError("invalid-argument", `Team ${wildcardTeams[i]} is not active in the ${activeYear} season.`);
    }
  }

  // Write using admin SDK (bypasses Firestore rules)
  await db.collection("users").doc(uid).update({ teams });

  return { success: true };
});
