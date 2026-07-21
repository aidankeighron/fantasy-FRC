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

  // Split into standard and wildcard
  const allNewTeams = teams as string[];
  const standardTeams = allNewTeams.filter(t => parseInt(t) <= WILDCARD_MIN_TEAM_NUMBER);
  const wildcardTeams = allNewTeams.filter(t => parseInt(t) > WILDCARD_MIN_TEAM_NUMBER);

  if (standardTeams.length !== STANDARD_COUNT) {
    throw new functions.https.HttpsError("invalid-argument", `You must pick exactly ${STANDARD_COUNT} standard teams (number <= ${WILDCARD_MIN_TEAM_NUMBER}).`);
  }
  if (wildcardTeams.length !== WILDCARD_COUNT) {
    throw new functions.https.HttpsError("invalid-argument", `You must pick exactly ${WILDCARD_COUNT} wildcard teams (number > ${WILDCARD_MIN_TEAM_NUMBER}).`);
  }

  // Run all validation and the write atomically so the draft-lock check and
  // inter-user conflict check cannot race with concurrent submissions.
  await db.runTransaction(async (transaction) => {
    // Read draft state — lock check and active year must be inside the
    // transaction so a lock toggle cannot slip between our check and our write.
    const dsRef = db.collection("draft_state").doc("global");
    const dsSnap = await transaction.get(dsRef);
    const dsData = dsSnap.data();
    const activeYear = dsData?.active_year;
    if (!activeYear) {
      throw new functions.https.HttpsError("failed-precondition", "No active year/season set.");
    }
    if (dsData?.team_picking_locked === true) {
      throw new functions.https.HttpsError("failed-precondition", "Team picking is currently locked.");
    }

    // Read current user doc to discover previously claimed teams so we can
    // release them if the user is updating their picks.
    const userRef = db.collection("users").doc(uid);
    const userSnap = await transaction.get(userRef);
    const prevTeams: string[] = userSnap.exists ? (userSnap.data()?.teams || []) : [];

    // Read team docs for geographic and active-year validation.
    const standardSnaps = await Promise.all(
      standardTeams.map(t => transaction.get(db.collection("teams").doc(t)))
    );
    const wildcardSnaps = await Promise.all(
      wildcardTeams.map(t => transaction.get(db.collection("teams").doc(t)))
    );

    // Read draftedTeams docs to detect inter-user conflicts atomically.
    const draftedSnaps = await Promise.all(
      allNewTeams.map(t => transaction.get(db.collection("draftedTeams").doc(t)))
    );

    // Validate standard teams: existence, active season, geographic uniqueness.
    const usStates = new Set<string>();
    const intlCountries = new Set<string>();

    for (let i = 0; i < standardTeams.length; i++) {
      const snap = standardSnaps[i];
      if (!snap.exists) {
        throw new functions.https.HttpsError("not-found", `Team ${standardTeams[i]} does not exist.`);
      }
      const teamData = snap.data()!;
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

    // Validate wildcard teams: existence and active season.
    for (let i = 0; i < wildcardTeams.length; i++) {
      const snap = wildcardSnaps[i];
      if (!snap.exists) {
        throw new functions.https.HttpsError("not-found", `Team ${wildcardTeams[i]} does not exist.`);
      }
      const teamData = snap.data()!;
      const activeYears = teamData.activeYears || [];
      if (!activeYears.includes(activeYear)) {
        throw new functions.https.HttpsError("invalid-argument", `Team ${wildcardTeams[i]} is not active in the ${activeYear} season.`);
      }
    }

    // Check inter-user team conflicts: reject if any team is already owned by
    // a different user.  Because this read is inside the transaction, two
    // concurrent submissions for the same team will serialize and the second
    // will see the first user's ownership record.
    for (let i = 0; i < allNewTeams.length; i++) {
      const draftedSnap = draftedSnaps[i];
      if (draftedSnap.exists) {
        const owner = draftedSnap.data()?.owner;
        if (owner && owner !== uid) {
          throw new functions.https.HttpsError(
            "already-exists",
            `Team ${allNewTeams[i]} has already been picked by another player.`
          );
        }
      }
    }

    // All checks passed — write atomically.

    // Update the user's teams array.
    transaction.update(userRef, { teams: allNewTeams });

    // Release previously claimed slots that are no longer in this submission.
    const newTeamSet = new Set(allNewTeams);
    for (const prev of prevTeams) {
      if (!newTeamSet.has(prev)) {
        transaction.delete(db.collection("draftedTeams").doc(prev));
      }
    }

    // Claim each new team under this user's uid.
    for (const team of allNewTeams) {
      transaction.set(db.collection("draftedTeams").doc(team), { owner: uid });
    }
  });

  return { success: true };
});
