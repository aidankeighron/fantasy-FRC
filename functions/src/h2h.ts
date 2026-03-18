import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { db, tbaKey } from "./config";
import { requireAdmin, tbaRequest, rateLimit } from "./utils";
import { H2H_CONFIG } from "./h2hConfig";

function seededShuffle<T>(arr: T[], seed: string): T[] {
  const out = [...arr];
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  }
  for (let i = out.length - 1; i > 0; i--) {
    h = ((h << 5) - h + i) | 0;
    const j = Math.abs(h) % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function getWebcastUrl(webcast: any): string {
  if (!webcast) return "";
  if (webcast.type === "twitch") return `https://www.twitch.tv/${webcast.channel}`;
  if (webcast.type === "youtube") return `https://www.youtube.com/watch?v=${webcast.channel}`;
  if (webcast.type === "iframe") return webcast.channel || "";
  return "";
}

interface DraftPick {
  round: number;
  pick: number;
  user: string;
  team: string;
}

function runAlternatingDraft(
  prefsA: string[],
  prefsB: string[],
  userAId: string,
  userBId: string,
  weekNumber: number,
  competingTeams: string[],
  teamScores: Map<string, number>
): { teamsA: string[]; teamsB: string[]; draftOrder: DraftPick[] } {
  const totalPicks = H2H_CONFIG.PICKS_PER_USER;
  const firstPicker = weekNumber % 2 === 0 ? "A" : "B";

  // Build alternating sequence: A, B, A, B, ... (or B, A, B, A, ...)
  const sequence: string[] = [];
  for (let i = 0; i < totalPicks; i++) {
    sequence.push(i % 2 === 0 ? firstPicker : (firstPicker === "A" ? "B" : "A"));
  }

  const drafted = new Set<string>();
  const teamsA: string[] = [];
  const teamsB: string[] = [];
  const draftOrder: DraftPick[] = [];

  // Fallback pool sorted by score
  const fallback = [...competingTeams].sort(
    (a, b) => (teamScores.get(b) || 0) - (teamScores.get(a) || 0)
  );

  let pickNum = 0;
  for (const side of sequence) {
    pickNum++;
    const round = Math.ceil(pickNum / 2);
    const prefs = side === "A" ? prefsA : prefsB;
    const bucket = side === "A" ? teamsA : teamsB;
    const userId = side === "A" ? userAId : userBId;

    let picked = false;
    for (const team of prefs) {
      if (!drafted.has(team)) {
        bucket.push(team);
        drafted.add(team);
        draftOrder.push({ round, pick: pickNum, user: userId, team });
        picked = true;
        break;
      }
    }

    if (!picked) {
      for (const team of fallback) {
        if (!drafted.has(team)) {
          bucket.push(team);
          drafted.add(team);
          draftOrder.push({ round, pick: pickNum, user: userId, team });
          break;
        }
      }
    }
  }

  return { teamsA, teamsB, draftOrder };
}

export const h2hSyncWeeklyEvents = functions
  .runWith({ secrets: [tbaKey], timeoutSeconds: 300, memory: "512MB" })
  .pubsub.schedule("0 3 * * *")
  .timeZone("America/New_York")
  .onRun(async () => {
    const ds = await db.collection("draft_state").doc("global").get();
    const year = ds.data()?.active_year;
    if (!year) {
      console.log("No active year set, skipping H2H sync.");
      return;
    }

    const events = await tbaRequest(`/events/${year}`, { useCache: true });
    if (!Array.isArray(events)) return;

    // Group events by week
    const weekMap = new Map<number, any[]>();
    for (const evt of events) {
      if (!H2H_CONFIG.VALID_EVENT_TYPES.includes(evt.event_type)) continue;
      const week = evt.week;
      if (week == null) continue;
      if (!weekMap.has(week)) weekMap.set(week, []);
      weekMap.get(week)!.push(evt);
    }

    const now = new Date();

    for (const [weekNum, weekEvents] of weekMap.entries()) {
      const weekId = `${year}_week${weekNum}`;

      // Compute date boundaries
      let earliest = new Date("2099-01-01");
      let latest = new Date("2000-01-01");
      for (const evt of weekEvents) {
        const start = new Date(evt.start_date);
        const end = new Date(evt.end_date || evt.start_date);
        if (start < earliest) earliest = start;
        if (end > latest) latest = end;
      }

      const draftOpensAt = new Date(earliest.getTime() - H2H_CONFIG.DRAFT_OPEN_HOURS_BEFORE * 3600000);
      const draftClosesAt = new Date(earliest.getTime() - H2H_CONFIG.DRAFT_CLOSE_HOURS_BEFORE * 3600000);
      const scoringAt = new Date(latest.getTime() + H2H_CONFIG.SCORING_BUFFER_DAYS * 24 * 3600000);

      // Determine status
      let status: string;
      if (now < draftOpensAt) {
        status = "upcoming";
      } else if (now < draftClosesAt) {
        status = "drafting";
      } else if (now < scoringAt) {
        status = "active";
      } else {
        status = "completed";
      }

      // Check if already completed — don't overwrite
      const existingDoc = await db.collection("h2h_weeks").doc(weekId).get();
      if (existingDoc.exists && existingDoc.data()?.status === "completed") {
        continue;
      }

      // Fetch teams for each event
      const eventData: any[] = [];
      const allTeamNumbers = new Set<string>();

      const chunkSize = 5;
      for (let i = 0; i < weekEvents.length; i += chunkSize) {
        const chunk = weekEvents.slice(i, i + chunkSize);
        await Promise.all(
          chunk.map(async (evt: any) => {
            try {
              const teams = await tbaRequest(`/event/${evt.key}/teams`, { useCache: true });
              const teamNums: string[] = [];
              if (Array.isArray(teams)) {
                for (const t of teams) {
                  const num = t.team_number.toString();
                  teamNums.push(num);
                  allTeamNumbers.add(num);
                }
              }

              const webcastUrl = evt.webcasts?.length > 0 ? getWebcastUrl(evt.webcasts[0]) : "";

              eventData.push({
                key: evt.key,
                name: evt.name,
                startDate: evt.start_date,
                endDate: evt.end_date || evt.start_date,
                webcastUrl,
                teamCount: teamNums.length,
                teams: teamNums,
              });
            } catch (e) {
              console.warn(`Failed to fetch teams for event ${evt.key}`, e);
            }
          })
        );
      }

      await db.collection("h2h_weeks").doc(weekId).set(
        {
          year,
          weekNumber: weekNum,
          status,
          eventsStartDate: admin.firestore.Timestamp.fromDate(earliest),
          eventsEndDate: admin.firestore.Timestamp.fromDate(latest),
          draftOpensAt: admin.firestore.Timestamp.fromDate(draftOpensAt),
          draftClosesAt: admin.firestore.Timestamp.fromDate(draftClosesAt),
          scoringAt: admin.firestore.Timestamp.fromDate(scoringAt),
          events: eventData,
          competingTeams: Array.from(allTeamNumbers),
          matchups: existingDoc.exists ? (existingDoc.data()?.matchups || []) : [],
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      console.log(`H2H week ${weekId}: ${status}, ${allTeamNumbers.size} teams, ${eventData.length} events`);
    }
  });

export const h2hCreateMatchups = functions
  .runWith({ timeoutSeconds: 120, memory: "256MB" })
  .pubsub.schedule("30 3 * * *")
  .timeZone("America/New_York")
  .onRun(async () => {
    const weeksSnap = await db
      .collection("h2h_weeks")
      .where("status", "==", "drafting")
      .get();

    for (const weekDoc of weeksSnap.docs) {
      const weekData = weekDoc.data();
      if (weekData.matchups && weekData.matchups.length > 0) continue;

      // Get users with main draft
      const usersSnap = await db.collection("users").get();
      const eligibleUsers: { uid: string; username: string }[] = [];
      for (const u of usersSnap.docs) {
        const data = u.data();
        if (data.teams && data.teams.length > 0) {
          eligibleUsers.push({ uid: u.id, username: data.username || "Unknown" });
        }
      }

      if (eligibleUsers.length < 2) {
        // Single user gets auto-bye
        if (eligibleUsers.length === 1) {
          const byeUser = eligibleUsers[0];
          const matchups = [
            {
              id: "matchup_0",
              userA: byeUser.uid,
              userB: "bye",
              usernameA: byeUser.username,
              usernameB: "BYE",
            },
          ];
          await weekDoc.ref.update({ matchups });

          // Create auto-win result
          await weekDoc.ref.collection("results").doc("matchup_0").set({
            matchupId: "matchup_0",
            userA: byeUser.uid,
            userB: "bye",
            userATeams: [],
            userBTeams: [],
            draftOrder: [],
            userAScore: 0,
            userBScore: 0,
            winner: byeUser.uid,
            pointsAwarded: H2H_CONFIG.WIN_POINTS,
            scoredAt: null,
          });
        }
        continue;
      }

      // Try to avoid same opponent as last week
      let prevOpponents = new Map<string, string>();
      const prevWeekNum = weekData.weekNumber - 1;
      if (prevWeekNum >= 0) {
        const prevDoc = await db.collection("h2h_weeks").doc(`${weekData.year}_week${prevWeekNum}`).get();
        if (prevDoc.exists) {
          const prevMatchups = prevDoc.data()?.matchups || [];
          for (const m of prevMatchups) {
            if (m.userB !== "bye") {
              prevOpponents.set(m.userA, m.userB);
              prevOpponents.set(m.userB, m.userA);
            }
          }
        }
      }

      // Shuffle deterministically
      const shuffled = seededShuffle(eligibleUsers, weekDoc.id);

      // Simple pairing with optional swap to avoid repeat
      const matchups: any[] = [];
      const paired = new Set<string>();

      for (let i = 0; i < shuffled.length - 1; i += 2) {
        let a = shuffled[i];
        let b = shuffled[i + 1];

        // If a played b last week and there's an alternative, try swapping
        if (prevOpponents.get(a.uid) === b.uid && i + 3 < shuffled.length) {
          const c = shuffled[i + 2];
          const d = shuffled[i + 3];
          if (prevOpponents.get(a.uid) !== c.uid && prevOpponents.get(b.uid) !== d.uid) {
            shuffled[i + 1] = c;
            shuffled[i + 2] = b;
            b = c;
          }
        }

        paired.add(a.uid);
        paired.add(b.uid);
        matchups.push({
          id: `matchup_${matchups.length}`,
          userA: a.uid,
          userB: b.uid,
          usernameA: a.username,
          usernameB: b.username,
        });
      }

      // Odd user gets bye
      if (shuffled.length % 2 === 1) {
        const byeUser = shuffled[shuffled.length - 1];
        const matchupId = `matchup_${matchups.length}`;
        matchups.push({
          id: matchupId,
          userA: byeUser.uid,
          userB: "bye",
          usernameA: byeUser.username,
          usernameB: "BYE",
        });

        await weekDoc.ref.collection("results").doc(matchupId).set({
          matchupId,
          userA: byeUser.uid,
          userB: "bye",
          userATeams: [],
          userBTeams: [],
          draftOrder: [],
          userAScore: 0,
          userBScore: 0,
          winner: byeUser.uid,
          pointsAwarded: H2H_CONFIG.WIN_POINTS,
          scoredAt: null,
        });
      }

      await weekDoc.ref.update({ matchups });
      console.log(`Created ${matchups.length} matchups for ${weekDoc.id}`);
    }
  });

export const submitH2HPicks = functions.https.onCall(
  async (data: any, context: functions.https.CallableContext) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Login required.");
    }

    await rateLimit(context.auth.uid, "submitH2HPicks", 20, 60 * 60 * 1000);

    const { weekId, preferences } = data;
    if (!weekId || typeof weekId !== "string") {
      throw new functions.https.HttpsError("invalid-argument", "weekId is required.");
    }
    if (
      !Array.isArray(preferences) ||
      preferences.length !== H2H_CONFIG.PICKS_PER_USER ||
      !preferences.every((p: any) => typeof p === "string" && /^\d+$/.test(p))
    ) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        `Must provide exactly ${H2H_CONFIG.PICKS_PER_USER} team numbers.`
      );
    }

    // Check for duplicates
    if (new Set(preferences).size !== preferences.length) {
      throw new functions.https.HttpsError("invalid-argument", "Duplicate teams not allowed.");
    }

    // Fetch week
    const weekRef = db.collection("h2h_weeks").doc(weekId);
    const weekSnap = await weekRef.get();
    if (!weekSnap.exists) {
      throw new functions.https.HttpsError("not-found", "Week not found.");
    }

    const weekData = weekSnap.data()!;
    if (weekData.status !== "drafting") {
      throw new functions.https.HttpsError("failed-precondition", "Draft is not open for this week.");
    }

    // Check draft deadline
    const now = admin.firestore.Timestamp.now();
    if (now.toMillis() >= weekData.draftClosesAt.toMillis()) {
      throw new functions.https.HttpsError("failed-precondition", "Draft period has ended.");
    }

    // Validate all teams are competing this week
    const competingSet = new Set(weekData.competingTeams || []);
    for (const team of preferences) {
      if (!competingSet.has(team)) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          `Team ${team} is not competing this week.`
        );
      }
    }

    // Validate user is in a matchup
    const matchups = weekData.matchups || [];
    const uid = context.auth.uid;
    const inMatchup = matchups.some(
      (m: any) => m.userA === uid || m.userB === uid
    );
    if (!inMatchup) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "You are not assigned a matchup this week."
      );
    }

    // Write picks
    await weekRef.collection("picks").doc(uid).set({
      userId: uid,
      preferences,
      submittedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { success: true };
  }
);

export const h2hRunDrafts = functions
  .runWith({ timeoutSeconds: 300, memory: "512MB" })
  .pubsub.schedule("0 * * * *")
  .timeZone("America/New_York")
  .onRun(async () => {
    const now = admin.firestore.Timestamp.now();

    const weeksSnap = await db
      .collection("h2h_weeks")
      .where("status", "==", "drafting")
      .get();

    for (const weekDoc of weeksSnap.docs) {
      const weekData = weekDoc.data();
      if (now.toMillis() < weekData.draftClosesAt.toMillis()) continue;

      const competingTeams: string[] = weekData.competingTeams || [];
      const matchups: any[] = weekData.matchups || [];

      // Build team score lookup
      const teamScores = new Map<string, number>();
      const year = weekData.year;
      // Fetch scores in chunks
      const chunkSize = 30;
      for (let i = 0; i < competingTeams.length; i += chunkSize) {
        const chunk = competingTeams.slice(i, i + chunkSize);
        const docs = await Promise.all(
          chunk.map((t) => db.collection("teams").doc(t).get())
        );
        for (const d of docs) {
          if (d.exists) {
            teamScores.set(d.id, d.data()?.stats?.[year]?.score || 0);
          }
        }
      }

      // Process each matchup
      for (const matchup of matchups) {
        if (matchup.userB === "bye") continue;

        // Check if result already exists
        const existingResult = await weekDoc.ref
          .collection("results")
          .doc(matchup.id)
          .get();
        if (existingResult.exists) continue;

        // Get picks
        const picksASnap = await weekDoc.ref.collection("picks").doc(matchup.userA).get();
        const picksBSnap = await weekDoc.ref.collection("picks").doc(matchup.userB).get();

        // Auto-generate picks if not submitted
        const topTeams = [...competingTeams]
          .sort((a, b) => (teamScores.get(b) || 0) - (teamScores.get(a) || 0))
          .slice(0, H2H_CONFIG.PICKS_PER_USER);

        const prefsA: string[] = picksASnap.exists
          ? picksASnap.data()!.preferences
          : topTeams;
        const prefsB: string[] = picksBSnap.exists
          ? picksBSnap.data()!.preferences
          : topTeams;

        const { teamsA, teamsB, draftOrder } = runAlternatingDraft(
          prefsA,
          prefsB,
          matchup.userA,
          matchup.userB,
          weekData.weekNumber,
          competingTeams,
          teamScores
        );

        await weekDoc.ref.collection("results").doc(matchup.id).set({
          matchupId: matchup.id,
          userA: matchup.userA,
          userB: matchup.userB,
          userATeams: teamsA,
          userBTeams: teamsB,
          draftOrder,
          userAScore: null,
          userBScore: null,
          winner: null,
          pointsAwarded: null,
          scoredAt: null,
        });
      }

      // Update status
      await weekDoc.ref.update({ status: "active" });
      console.log(`Drafts completed for ${weekDoc.id}`);
    }
  });

export const h2hScoreWeek = functions
  .runWith({ secrets: [tbaKey], timeoutSeconds: 540, memory: "1GB" })
  .pubsub.schedule("15 * * * *")
  .timeZone("America/New_York")
  .onRun(async () => {
    const now = admin.firestore.Timestamp.now();

    const weeksSnap = await db
      .collection("h2h_weeks")
      .where("status", "==", "active")
      .get();

    for (const weekDoc of weeksSnap.docs) {
      const weekData = weekDoc.data();
      if (now.toMillis() < weekData.scoringAt.toMillis()) continue;

      const year = weekData.year;

      // Build team score cache
      const teamScores = new Map<string, number>();
      const competingTeams: string[] = weekData.competingTeams || [];
      const chunkSize = 30;
      for (let i = 0; i < competingTeams.length; i += chunkSize) {
        const chunk = competingTeams.slice(i, i + chunkSize);
        const docs = await Promise.all(
          chunk.map((t) => db.collection("teams").doc(t).get())
        );
        for (const d of docs) {
          if (d.exists) {
            teamScores.set(d.id, d.data()?.stats?.[year]?.score || 0);
          }
        }
      }

      // Score each matchup
      const resultsSnap = await weekDoc.ref.collection("results").get();
      const batch = db.batch();

      for (const resultDoc of resultsSnap.docs) {
        const result = resultDoc.data();
        if (result.scoredAt) continue; // Already scored

        if (result.userB === "bye") {
          // Bye: just mark scored
          batch.update(resultDoc.ref, {
            scoredAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          // Update user h2h data
          const userRef = db.collection("users").doc(result.userA);
          batch.set(
            userRef,
            {
              h2h: {
                [year]: {
                  totalWins: admin.firestore.FieldValue.increment(1),
                  totalBonusPoints: admin.firestore.FieldValue.increment(H2H_CONFIG.WIN_POINTS),
                  weeks: {
                    [weekDoc.id]: {
                      matchupId: result.matchupId,
                      opponent: "bye",
                      teams: [],
                      teamScoreSum: 0,
                      result: "win",
                      pointsEarned: H2H_CONFIG.WIN_POINTS,
                    },
                  },
                },
              },
            },
            { merge: true }
          );
          continue;
        }

        const scoreA = (result.userATeams || []).reduce(
          (sum: number, t: string) => sum + (teamScores.get(t) || 0),
          0
        );
        const scoreB = (result.userBTeams || []).reduce(
          (sum: number, t: string) => sum + (teamScores.get(t) || 0),
          0
        );

        let winner: string;
        let pointsA: number;
        let pointsB: number;

        if (scoreA > scoreB) {
          winner = result.userA;
          pointsA = H2H_CONFIG.WIN_POINTS;
          pointsB = H2H_CONFIG.LOSS_POINTS;
        } else if (scoreB > scoreA) {
          winner = result.userB;
          pointsA = H2H_CONFIG.LOSS_POINTS;
          pointsB = H2H_CONFIG.WIN_POINTS;
        } else {
          winner = "tie";
          pointsA = H2H_CONFIG.TIE_POINTS;
          pointsB = H2H_CONFIG.TIE_POINTS;
        }

        batch.update(resultDoc.ref, {
          userAScore: Number(scoreA.toFixed(2)),
          userBScore: Number(scoreB.toFixed(2)),
          winner,
          pointsAwarded: winner === "tie" ? H2H_CONFIG.TIE_POINTS : H2H_CONFIG.WIN_POINTS,
          scoredAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Update user A
        const resultA = scoreA > scoreB ? "win" : scoreA < scoreB ? "loss" : "tie";
        const userARef = db.collection("users").doc(result.userA);
        const h2hUpdateA: any = {
          [`h2h.${year}.totalBonusPoints`]: admin.firestore.FieldValue.increment(pointsA),
          [`h2h.${year}.weeks.${weekDoc.id}`]: {
            matchupId: result.matchupId,
            opponent: result.userB,
            teams: result.userATeams,
            teamScoreSum: Number(scoreA.toFixed(2)),
            result: resultA,
            pointsEarned: pointsA,
          },
        };
        if (resultA === "win") h2hUpdateA[`h2h.${year}.totalWins`] = admin.firestore.FieldValue.increment(1);
        else if (resultA === "loss") h2hUpdateA[`h2h.${year}.totalLosses`] = admin.firestore.FieldValue.increment(1);
        else h2hUpdateA[`h2h.${year}.totalTies`] = admin.firestore.FieldValue.increment(1);
        batch.set(userARef, h2hUpdateA, { merge: true });

        // Update user B
        const resultB = scoreB > scoreA ? "win" : scoreB < scoreA ? "loss" : "tie";
        const userBRef = db.collection("users").doc(result.userB);
        const h2hUpdateB: any = {
          [`h2h.${year}.totalBonusPoints`]: admin.firestore.FieldValue.increment(pointsB),
          [`h2h.${year}.weeks.${weekDoc.id}`]: {
            matchupId: result.matchupId,
            opponent: result.userA,
            teams: result.userBTeams,
            teamScoreSum: Number(scoreB.toFixed(2)),
            result: resultB,
            pointsEarned: pointsB,
          },
        };
        if (resultB === "win") h2hUpdateB[`h2h.${year}.totalWins`] = admin.firestore.FieldValue.increment(1);
        else if (resultB === "loss") h2hUpdateB[`h2h.${year}.totalLosses`] = admin.firestore.FieldValue.increment(1);
        else h2hUpdateB[`h2h.${year}.totalTies`] = admin.firestore.FieldValue.increment(1);
        batch.set(userBRef, h2hUpdateB, { merge: true });
      }

      await batch.commit();

      // Recalculate overall user scores including H2H bonus
      await recalcAllUserScores(year);

      await weekDoc.ref.update({ status: "completed" });
      console.log(`Scored week ${weekDoc.id}`);
    }
  });

async function recalcAllUserScores(year: string): Promise<void> {
  const teamsSnap = await db.collection("teams").get();
  const teamsCache = new Map<string, number>();
  teamsSnap.docs.forEach((d) => {
    teamsCache.set(d.id, d.data().stats?.[year]?.score || 0);
  });

  const usersSnap = await db.collection("users").get();
  const userScores: { uid: string; score: number }[] = [];

  for (const u of usersSnap.docs) {
    const data = u.data();
    let uScore = 0;
    (data.teams || []).forEach((t: string) => {
      uScore += teamsCache.get(t) || 0;
    });
    // Add H2H bonus
    uScore += data.h2h?.[year]?.totalBonusPoints || 0;
    userScores.push({ uid: u.id, score: uScore });
  }

  userScores.sort((a, b) => b.score - a.score);

  const batches: FirebaseFirestore.WriteBatch[] = [];
  let currentBatch = db.batch();
  let bCount = 0;

  userScores.forEach((ms, idx) => {
    const userDoc = usersSnap.docs.find((d) => d.id === ms.uid);
    const userTeams = userDoc?.data().teams || [];
    currentBatch.set(
      db.collection("users").doc(ms.uid),
      {
        score: ms.score,
        rank: idx + 1,
        seasons: {
          [year]: {
            score: ms.score,
            rank: idx + 1,
            teams: userTeams,
          },
        },
      },
      { merge: true }
    );
    bCount++;
    if (bCount >= 400) {
      batches.push(currentBatch);
      currentBatch = db.batch();
      bCount = 0;
    }
  });

  if (bCount > 0) batches.push(currentBatch);
  await Promise.all(batches.map((b) => b.commit()));
}

// Admin-callable function to kickstart the H2H pipeline on demand.
// Runs sync -> matchups -> drafts sequentially. All steps have built-in
// guards (skip completed weeks, skip existing matchups/results) so calling
// this multiple times or while a draft is in progress is safe.
export const h2hInitialize = functions
  .runWith({ secrets: [tbaKey], timeoutSeconds: 540, memory: "1GB" })
  .https.onCall(
    async (_data: any, context: functions.https.CallableContext) => {
      await requireAdmin(context);
      await rateLimit(context.auth!.uid, "h2hInitialize", 5, 60 * 60 * 1000);

      const ds = await db.collection("draft_state").doc("global").get();
      const year = ds.data()?.active_year;
      if (!year) {
        throw new functions.https.HttpsError("failed-precondition", "No active year set.");
      }

      const log: string[] = [];

      // ── Step 1: Sync weekly events from TBA ──
      const events = await tbaRequest(`/events/${year}`, { useCache: true });
      if (!Array.isArray(events)) {
        throw new functions.https.HttpsError("unavailable", "Failed to fetch events from TBA.");
      }

      const weekMap = new Map<number, any[]>();
      for (const evt of events) {
        if (!H2H_CONFIG.VALID_EVENT_TYPES.includes(evt.event_type)) continue;
        const week = evt.week;
        if (week == null) continue;
        if (!weekMap.has(week)) weekMap.set(week, []);
        weekMap.get(week)!.push(evt);
      }

      const now = new Date();
      let weeksCreated = 0;
      let matchupsCreated = 0;
      let draftsRun = 0;

      for (const [weekNum, weekEvents] of weekMap.entries()) {
        const weekId = `${year}_week${weekNum}`;

        // Compute date boundaries
        let earliest = new Date("2099-01-01");
        let latest = new Date("2000-01-01");
        for (const evt of weekEvents) {
          const start = new Date(evt.start_date);
          const end = new Date(evt.end_date || evt.start_date);
          if (start < earliest) earliest = start;
          if (end > latest) latest = end;
        }

        const draftOpensAt = new Date(earliest.getTime() - H2H_CONFIG.DRAFT_OPEN_HOURS_BEFORE * 3600000);
        const draftClosesAt = new Date(earliest.getTime() - H2H_CONFIG.DRAFT_CLOSE_HOURS_BEFORE * 3600000);
        const scoringAt = new Date(latest.getTime() + H2H_CONFIG.SCORING_BUFFER_DAYS * 24 * 3600000);

        let status: string;
        if (now < draftOpensAt) {
          status = "upcoming";
        } else if (now < draftClosesAt) {
          status = "drafting";
        } else if (now < scoringAt) {
          status = "active";
        } else {
          status = "completed";
        }

        // Skip completed weeks
        const existingDoc = await db.collection("h2h_weeks").doc(weekId).get();
        if (existingDoc.exists && existingDoc.data()?.status === "completed") {
          continue;
        }

        // Fetch teams for each event
        const eventData: any[] = [];
        const allTeamNumbers = new Set<string>();

        const chunkSize = 5;
        for (let i = 0; i < weekEvents.length; i += chunkSize) {
          const chunk = weekEvents.slice(i, i + chunkSize);
          await Promise.all(
            chunk.map(async (evt: any) => {
              try {
                const teams = await tbaRequest(`/event/${evt.key}/teams`, { useCache: true });
                const teamNums: string[] = [];
                if (Array.isArray(teams)) {
                  for (const t of teams) {
                    const num = t.team_number.toString();
                    teamNums.push(num);
                    allTeamNumbers.add(num);
                  }
                }

                const webcastUrl = evt.webcasts?.length > 0 ? getWebcastUrl(evt.webcasts[0]) : "";

                eventData.push({
                  key: evt.key,
                  name: evt.name,
                  startDate: evt.start_date,
                  endDate: evt.end_date || evt.start_date,
                  webcastUrl,
                  teamCount: teamNums.length,
                  teams: teamNums,
                });
              } catch (e) {
                console.warn(`Failed to fetch teams for event ${evt.key}`, e);
              }
            })
          );
        }

        await db.collection("h2h_weeks").doc(weekId).set(
          {
            year,
            weekNumber: weekNum,
            status,
            eventsStartDate: admin.firestore.Timestamp.fromDate(earliest),
            eventsEndDate: admin.firestore.Timestamp.fromDate(latest),
            draftOpensAt: admin.firestore.Timestamp.fromDate(draftOpensAt),
            draftClosesAt: admin.firestore.Timestamp.fromDate(draftClosesAt),
            scoringAt: admin.firestore.Timestamp.fromDate(scoringAt),
            events: eventData,
            competingTeams: Array.from(allTeamNumbers),
            matchups: existingDoc.exists ? (existingDoc.data()?.matchups || []) : [],
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        weeksCreated++;
        log.push(`H2H week ${weekId}: ${status}, ${allTeamNumbers.size} teams`);
      }

      // ── Step 2: Create matchups for drafting weeks ──
      const weeksSnap = await db
        .collection("h2h_weeks")
        .where("status", "==", "drafting")
        .get();

      for (const weekDoc of weeksSnap.docs) {
        const weekData = weekDoc.data();
        if (weekData.matchups && weekData.matchups.length > 0) continue;

        const usersSnap = await db.collection("users").get();
        const eligibleUsers: { uid: string; username: string }[] = [];
        for (const u of usersSnap.docs) {
          const data = u.data();
          if (data.teams && data.teams.length > 0) {
            eligibleUsers.push({ uid: u.id, username: data.username || "Unknown" });
          }
        }

        if (eligibleUsers.length < 2) {
          if (eligibleUsers.length === 1) {
            const byeUser = eligibleUsers[0];
            const matchups = [{
              id: "matchup_0",
              userA: byeUser.uid,
              userB: "bye",
              usernameA: byeUser.username,
              usernameB: "BYE",
            }];
            await weekDoc.ref.update({ matchups });
            await weekDoc.ref.collection("results").doc("matchup_0").set({
              matchupId: "matchup_0",
              userA: byeUser.uid,
              userB: "bye",
              userATeams: [],
              userBTeams: [],
              draftOrder: [],
              userAScore: 0,
              userBScore: 0,
              winner: byeUser.uid,
              pointsAwarded: H2H_CONFIG.WIN_POINTS,
              scoredAt: null,
            });
          }
          continue;
        }

        let prevOpponents = new Map<string, string>();
        const prevWeekNum = weekData.weekNumber - 1;
        if (prevWeekNum >= 0) {
          const prevDoc = await db.collection("h2h_weeks").doc(`${weekData.year}_week${prevWeekNum}`).get();
          if (prevDoc.exists) {
            const prevMatchups = prevDoc.data()?.matchups || [];
            for (const m of prevMatchups) {
              if (m.userB !== "bye") {
                prevOpponents.set(m.userA, m.userB);
                prevOpponents.set(m.userB, m.userA);
              }
            }
          }
        }

        const shuffled = seededShuffle(eligibleUsers, weekDoc.id);
        const matchups: any[] = [];

        for (let i = 0; i < shuffled.length - 1; i += 2) {
          let a = shuffled[i];
          let b = shuffled[i + 1];

          if (prevOpponents.get(a.uid) === b.uid && i + 3 < shuffled.length) {
            const c = shuffled[i + 2];
            const d = shuffled[i + 3];
            if (prevOpponents.get(a.uid) !== c.uid && prevOpponents.get(b.uid) !== d.uid) {
              shuffled[i + 1] = c;
              shuffled[i + 2] = b;
              b = c;
            }
          }

          matchups.push({
            id: `matchup_${matchups.length}`,
            userA: a.uid,
            userB: b.uid,
            usernameA: a.username,
            usernameB: b.username,
          });
        }

        if (shuffled.length % 2 === 1) {
          const byeUser = shuffled[shuffled.length - 1];
          const matchupId = `matchup_${matchups.length}`;
          matchups.push({
            id: matchupId,
            userA: byeUser.uid,
            userB: "bye",
            usernameA: byeUser.username,
            usernameB: "BYE",
          });

          await weekDoc.ref.collection("results").doc(matchupId).set({
            matchupId,
            userA: byeUser.uid,
            userB: "bye",
            userATeams: [],
            userBTeams: [],
            draftOrder: [],
            userAScore: 0,
            userBScore: 0,
            winner: byeUser.uid,
            pointsAwarded: H2H_CONFIG.WIN_POINTS,
            scoredAt: null,
          });
        }

        await weekDoc.ref.update({ matchups });
        matchupsCreated += matchups.length;
        log.push(`Created ${matchups.length} matchups for ${weekDoc.id}`);
      }

      // ── Step 3: Run drafts for weeks past deadline ──
      const nowTs = admin.firestore.Timestamp.now();
      const draftWeeksSnap = await db
        .collection("h2h_weeks")
        .where("status", "==", "drafting")
        .get();

      for (const weekDoc of draftWeeksSnap.docs) {
        const weekData = weekDoc.data();
        if (nowTs.toMillis() < weekData.draftClosesAt.toMillis()) continue;

        const competingTeams: string[] = weekData.competingTeams || [];
        const matchups: any[] = weekData.matchups || [];

        const teamScores = new Map<string, number>();
        const wy = weekData.year;
        const chunkSize2 = 30;
        for (let i = 0; i < competingTeams.length; i += chunkSize2) {
          const chunk = competingTeams.slice(i, i + chunkSize2);
          const docs = await Promise.all(
            chunk.map((t) => db.collection("teams").doc(t).get())
          );
          for (const d of docs) {
            if (d.exists) {
              teamScores.set(d.id, d.data()?.stats?.[wy]?.score || 0);
            }
          }
        }

        for (const matchup of matchups) {
          if (matchup.userB === "bye") continue;

          const existingResult = await weekDoc.ref.collection("results").doc(matchup.id).get();
          if (existingResult.exists) continue;

          const picksASnap = await weekDoc.ref.collection("picks").doc(matchup.userA).get();
          const picksBSnap = await weekDoc.ref.collection("picks").doc(matchup.userB).get();

          const topTeams = [...competingTeams]
            .sort((a, b) => (teamScores.get(b) || 0) - (teamScores.get(a) || 0))
            .slice(0, H2H_CONFIG.PICKS_PER_USER);

          const prefsA: string[] = picksASnap.exists ? picksASnap.data()!.preferences : topTeams;
          const prefsB: string[] = picksBSnap.exists ? picksBSnap.data()!.preferences : topTeams;

          const { teamsA, teamsB, draftOrder } = runAlternatingDraft(
            prefsA, prefsB, matchup.userA, matchup.userB,
            weekData.weekNumber, competingTeams, teamScores
          );

          await weekDoc.ref.collection("results").doc(matchup.id).set({
            matchupId: matchup.id,
            userA: matchup.userA,
            userB: matchup.userB,
            userATeams: teamsA,
            userBTeams: teamsB,
            draftOrder,
            userAScore: null,
            userBScore: null,
            winner: null,
            pointsAwarded: null,
            scoredAt: null,
          });
        }

        await weekDoc.ref.update({ status: "active" });
        draftsRun++;
        log.push(`Drafts completed for ${weekDoc.id}`);
      }

      return {
        success: true,
        year,
        weeksCreated,
        matchupsCreated,
        draftsRun,
        log,
      };
    }
  );

export const h2hRecalcScores = functions.https.onCall(
  async (_data: any, context: functions.https.CallableContext) => {
    await requireAdmin(context);
    await rateLimit(context.auth!.uid, "h2hRecalcScores", 5, 60 * 60 * 1000);

    const ds = await db.collection("draft_state").doc("global").get();
    const year = ds.data()?.active_year;
    if (!year) {
      throw new functions.https.HttpsError("failed-precondition", "No active year set.");
    }

    // Build team score cache
    const teamsSnap = await db.collection("teams").get();
    const teamScores = new Map<string, number>();
    teamsSnap.docs.forEach((d) => {
      teamScores.set(d.id, d.data().stats?.[year]?.score || 0);
    });

    // Re-score all completed weeks
    const weeksSnap = await db
      .collection("h2h_weeks")
      .where("year", "==", year)
      .where("status", "==", "completed")
      .get();

    // Reset all users' H2H data for this year
    const usersSnap = await db.collection("users").get();
    const resetBatch = db.batch();
    let rCount = 0;
    for (const u of usersSnap.docs) {
      resetBatch.set(
        u.ref,
        {
          h2h: {
            [year]: {
              totalWins: 0,
              totalLosses: 0,
              totalTies: 0,
              totalBonusPoints: 0,
              weeks: {},
            },
          },
        },
        { merge: true }
      );
      rCount++;
      if (rCount >= 400) break; // Safety
    }
    await resetBatch.commit();

    // Re-process each week
    for (const weekDoc of weeksSnap.docs) {
      const resultsSnap = await weekDoc.ref.collection("results").get();
      const batch = db.batch();

      for (const resultDoc of resultsSnap.docs) {
        const result = resultDoc.data();

        if (result.userB === "bye") {
          const userRef = db.collection("users").doc(result.userA);
          batch.set(
            userRef,
            {
              h2h: {
                [year]: {
                  totalWins: admin.firestore.FieldValue.increment(1),
                  totalBonusPoints: admin.firestore.FieldValue.increment(H2H_CONFIG.WIN_POINTS),
                  weeks: {
                    [weekDoc.id]: {
                      matchupId: result.matchupId,
                      opponent: "bye",
                      teams: [],
                      teamScoreSum: 0,
                      result: "win",
                      pointsEarned: H2H_CONFIG.WIN_POINTS,
                    },
                  },
                },
              },
            },
            { merge: true }
          );
          continue;
        }

        const scoreA = (result.userATeams || []).reduce(
          (sum: number, t: string) => sum + (teamScores.get(t) || 0),
          0
        );
        const scoreB = (result.userBTeams || []).reduce(
          (sum: number, t: string) => sum + (teamScores.get(t) || 0),
          0
        );

        let winner: string;
        let pointsA: number;
        let pointsB: number;

        if (scoreA > scoreB) {
          winner = result.userA;
          pointsA = H2H_CONFIG.WIN_POINTS;
          pointsB = H2H_CONFIG.LOSS_POINTS;
        } else if (scoreB > scoreA) {
          winner = result.userB;
          pointsA = H2H_CONFIG.LOSS_POINTS;
          pointsB = H2H_CONFIG.WIN_POINTS;
        } else {
          winner = "tie";
          pointsA = H2H_CONFIG.TIE_POINTS;
          pointsB = H2H_CONFIG.TIE_POINTS;
        }

        // Update result doc with fresh scores
        batch.update(resultDoc.ref, {
          userAScore: Number(scoreA.toFixed(2)),
          userBScore: Number(scoreB.toFixed(2)),
          winner,
          pointsAwarded: winner === "tie" ? H2H_CONFIG.TIE_POINTS : H2H_CONFIG.WIN_POINTS,
        });

        // Update users
        const resultA = scoreA > scoreB ? "win" : scoreA < scoreB ? "loss" : "tie";
        const userARef = db.collection("users").doc(result.userA);
        const wlFieldA = resultA === "win" ? "totalWins" : resultA === "loss" ? "totalLosses" : "totalTies";
        batch.set(
          userARef,
          {
            h2h: {
              [year]: {
                [wlFieldA]: admin.firestore.FieldValue.increment(1),
                totalBonusPoints: admin.firestore.FieldValue.increment(pointsA),
                weeks: {
                  [weekDoc.id]: {
                    matchupId: result.matchupId,
                    opponent: result.userB,
                    teams: result.userATeams,
                    teamScoreSum: Number(scoreA.toFixed(2)),
                    result: resultA,
                    pointsEarned: pointsA,
                  },
                },
              },
            },
          },
          { merge: true }
        );

        const resultB = scoreB > scoreA ? "win" : scoreB < scoreA ? "loss" : "tie";
        const userBRef = db.collection("users").doc(result.userB);
        const wlFieldB = resultB === "win" ? "totalWins" : resultB === "loss" ? "totalLosses" : "totalTies";
        batch.set(
          userBRef,
          {
            h2h: {
              [year]: {
                [wlFieldB]: admin.firestore.FieldValue.increment(1),
                totalBonusPoints: admin.firestore.FieldValue.increment(pointsB),
                weeks: {
                  [weekDoc.id]: {
                    matchupId: result.matchupId,
                    opponent: result.userA,
                    teams: result.userBTeams,
                    teamScoreSum: Number(scoreB.toFixed(2)),
                    result: resultB,
                    pointsEarned: pointsB,
                  },
                },
              },
            },
          },
          { merge: true }
        );
      }

      await batch.commit();
    }

    // Recalc overall scores
    await recalcAllUserScores(year);

    return { success: true, weeksProcessed: weeksSnap.size, year };
  }
);
