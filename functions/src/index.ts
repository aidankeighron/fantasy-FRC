import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import axios from "axios";
import { defineSecret } from "firebase-functions/params";

admin.initializeApp();
const db = admin.firestore();

const tbaKey = defineSecret("TBA_API_KEY");

const TBA_BASE_URL = "https://www.thebluealliance.com/api/v3";

async function requireAdmin(context: functions.https.CallableContext): Promise<admin.firestore.DocumentData> {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Login required.");
  }

  const user = await db.collection("users").doc(context.auth.uid).get();
  if (!user.data()?.isAdmin) {
    throw new functions.https.HttpsError("permission-denied", "Admin only.");
  }

  return user.data()!;
}

async function tbaRequest(endpoint: string): Promise<any> {
  const key = tbaKey.value();
  if (!key) {
    throw new Error("TBA API Key not configured.");
  }

  const res = await axios.get(`${TBA_BASE_URL}${endpoint}`, {
    headers: { "X-TBA-Auth-Key": key },
  });
  return res.data;
}

interface TeamAccumulator {
  oprSum: number;
  dprSum: number;
  ccwmSum: number;
  qualWins: number;
  qualMatches: number;
  elimWins: number;
  elimMatches: number;
  eventCount: number;
  maxPlayoffDepth: number;
}

function getPlayoffDepth(status: any): number {
  if (!status?.playoff) {
    return 0;
  }

  const level = status.playoff.level;
  const playoffStatus = status.playoff.status;

  if (playoffStatus === "won") {
    return 1;
  }

  switch (level) {
    case "f":
      return 0.75;
    case "sf":
      return 0.5;
    case "qf":
      return 0.25;
    default:
      return 0;
  }
}

async function fetchYearlyStats(year: string, teamFilter?: Set<string>): Promise<Map<string, any>> {
  const events = await tbaRequest(`/events/${year}/keys`);
  const teamStats = new Map<string, TeamAccumulator>();

  const chunkSize = 10;
  for (let i = 0; i < events.length; i += chunkSize) {
    const chunk = events.slice(i, i + chunkSize);
    await Promise.all(chunk.map(async (event: string) => {
      if (event.includes("week0")) {
        return;
      }

      let statuses: any = null;
      let oprs: any = null;

      try {
        [statuses, oprs] = await Promise.all([
          tbaRequest(`/event/${event}/teams/statuses`),
          tbaRequest(`/event/${event}/oprs`)
        ]);
      }
      catch (e) {
        console.warn(`Skipping event ${event}: failed to fetch data`, e);
        return;
      }

      if (!statuses) {
        return;
      }

      for (const [teamKey, status] of Object.entries(statuses)) {
        const teamNum = teamKey.replace("frc", "");
        if (teamFilter && !teamFilter.has(teamNum)) {
          continue;
        }

        if (!teamStats.has(teamNum)) {
          teamStats.set(teamNum, {
            oprSum: 0, dprSum: 0, ccwmSum: 0,
            qualWins: 0, qualMatches: 0,
            elimWins: 0, elimMatches: 0,
            eventCount: 0, maxPlayoffDepth: 0
          });
        }
        const acc = teamStats.get(teamNum)!;
        const s = status as any;

        if (oprs) {
          const teamOpr = oprs.oprs?.[teamKey] ?? null;
          const teamDpr = oprs.dprs?.[teamKey] ?? null;
          const teamCcwm = oprs.ccwms?.[teamKey] ?? null;

          if (teamOpr !== null) {
            acc.oprSum += teamOpr;
            acc.dprSum += teamDpr || 0;
            acc.ccwmSum += teamCcwm || 0;
            acc.eventCount++;
          }
        }

        if (s?.qual?.ranking) {
          acc.qualWins += s.qual.ranking.record?.wins || 0;
          acc.qualMatches += s.qual.ranking.matches_played || 0;
        }

        if (s?.playoff?.record) {
          acc.elimWins += s.playoff.record.wins || 0;
          acc.elimMatches += (s.playoff.record.wins + s.playoff.record.losses + (s.playoff.record.ties || 0)) || 0;
        }

        const depth = getPlayoffDepth(s);
        if (depth > acc.maxPlayoffDepth) {
          acc.maxPlayoffDepth = depth;
        }
      }
    }));
  }

  const rawStats = new Map<string, { opr: number, dpr: number, ccwm: number, winRate: number, playoffDepth: number }>();
  let minOpr = Infinity, maxOpr = -Infinity;
  let minCcwm = Infinity, maxCcwm = -Infinity;

  for (const [teamNum, acc] of teamStats.entries()) {
    if (acc.eventCount === 0) {
      continue;
    }

    const opr = acc.oprSum / acc.eventCount;
    const dpr = acc.dprSum / acc.eventCount;
    const ccwm = acc.ccwmSum / acc.eventCount;
    const totalWins = acc.qualWins + acc.elimWins;
    const totalMatches = acc.qualMatches + acc.elimMatches;
    const winRate = totalMatches > 0 ? totalWins / totalMatches : 0;

    rawStats.set(teamNum, { opr, dpr, ccwm, winRate, playoffDepth: acc.maxPlayoffDepth });

    if (opr < minOpr) minOpr = opr;
    if (opr > maxOpr) maxOpr = opr;
    if (ccwm < minCcwm) minCcwm = ccwm;
    if (ccwm > maxCcwm) maxCcwm = ccwm;
  }

  const oprRange = maxOpr - minOpr || 1;
  const ccwmRange = maxCcwm - minCcwm || 1;

  const finalStats = new Map<string, any>();
  for (const [teamNum, raw] of rawStats.entries()) {
    const normOpr = (raw.opr - minOpr) / oprRange;
    const normCcwm = (raw.ccwm - minCcwm) / ccwmRange;

    const score = (
      (0.35 * normOpr) +
      (0.3 * normCcwm) +
      (0.25 * raw.winRate) +
      (0.1 * raw.playoffDepth)
    ) * 100;

    finalStats.set(teamNum, {
      opr: Number.parseFloat(raw.opr.toFixed(2)),
      dpr: Number.parseFloat(raw.dpr.toFixed(2)),
      ccwm: Number.parseFloat(raw.ccwm.toFixed(2)),
      winRate: Number.parseFloat(raw.winRate.toFixed(4)),
      playoffDepth: raw.playoffDepth,
      score: Number.parseFloat(score.toFixed(2))
    });
  }

  return finalStats;
}

async function performTeamDataSync(year: string): Promise<{ success: boolean, total: number, year: string }> {
  await db.collection("draft_state").doc("global").set({ active_year: year }, { merge: true });
  
  const allTeamStats = await fetchYearlyStats(year);

  let pageNum = 0;
  let fetching = true;
  let batch = db.batch();
  let count = 0;
  let batchCount = 0;

  while (fetching) {
    try {
      const teams = await tbaRequest(`/teams/${year}/${pageNum}`);
      if (!teams || teams.length === 0) {
        fetching = false;
        break;
      }
      
      for (const t of teams) {
        const teamNum = t.team_number.toString();
        const docRef = db.collection("teams").doc(teamNum);
        
        const updateData: any = {
          name: t.nickname || t.name,
          state: t.state_prov || "",
          country: t.country || "",
          activeYears: admin.firestore.FieldValue.arrayUnion(year)
        };

        if (allTeamStats.has(teamNum)) {
          updateData.stats = {
            [year]: allTeamStats.get(teamNum)
          };
        }

        batch.set(docRef, updateData, { merge: true });
        count++;
        batchCount++;

        if (batchCount >= 400) {
          await batch.commit();
          batch = db.batch();
          batchCount = 0;
        }
      }
      pageNum++;
    }
    catch (e) {
      console.error("Error fetching TBA page", pageNum, e);
      fetching = false;
    }
  }

  if (batchCount > 0) {
    await batch.commit();
  }

  return { success: true, total: count, year };
}

export const syncTeamData = functions.runWith({ secrets: [tbaKey] }).https.onCall(async (data, context) => {
  await requireAdmin(context);

  const year = typeof data.year === "string" && /^\d{4}$/.test(data.year)
    ? data.year
    : new Date().getFullYear().toString();

  const result = await performTeamDataSync(year);
  await performTeamPointsUpdate();
  return result;
});

export const startNewDraft = functions.https.onCall(async (data, context) => {
  await requireAdmin(context);

  const usersSnap = await db.collection("users").get();
  const batch = db.batch();
  const userIds: string[] = [];
  
  usersSnap.docs.forEach(doc => {
    userIds.push(doc.id);
    batch.update(doc.ref, { teams: [], score: 0 });
  });

  const shuffled = userIds.sort(() => 0.5 - Math.random());

  const draftStateRef = db.collection("draft_state").doc("global");
  batch.set(draftStateRef, {
    status: "active",
    draft_order: shuffled,
    current_turn_userId: shuffled[0] || null,
    pick_count: 0
  }, { merge: true });
  
  await batch.commit();
  return { success: true };
});

export const processDraftPick = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Login required.");
  }

  const teamNumber = data.teamNumber;
  if (typeof teamNumber !== "string" || !/^\d+$/.test(teamNumber)) {
    throw new functions.https.HttpsError("invalid-argument", "Invalid team number.");
  }

  const force = !!data.force;
  const targetUser = (typeof data.userId === "string" && data.userId) || context.auth.uid;

  if (force) {
    await requireAdmin(context);
  }

  await db.runTransaction(async (transaction) => {
    const dsRef = db.collection("draft_state").doc("global");
    const dsSnap = await transaction.get(dsRef);
    const draftState = dsSnap.data();

    if (!draftState || draftState.status !== "active") {
      throw new functions.https.HttpsError("failed-precondition", "Draft is not active.");
    }

    if (!force && draftState.current_turn_userId !== context.auth!.uid) {
      throw new functions.https.HttpsError("permission-denied", "It is not your turn.");
    }

    const teamSnap = await transaction.get(db.collection("teams").doc(teamNumber));
    if (!teamSnap.exists) {
      throw new functions.https.HttpsError("not-found", "Team not found.");
    }

    if (!force) {
      const allUsersSnap = await transaction.get(db.collection("users"));
      for (const u of allUsersSnap.docs) {
        if ((u.data().teams || []).includes(teamNumber)) {
          throw new functions.https.HttpsError("already-exists", "Team already drafted.");
        }
      }
    }

    const userRef = db.collection("users").doc(targetUser);
    const userSnap = await transaction.get(userRef);
    const draftedTeams = userSnap.data()?.teams || [];
    if (draftedTeams.length >= 8) {
      throw new functions.https.HttpsError("out-of-range", "User already has 8 teams.");
    }

    const newTeamsList = [...draftedTeams, teamNumber];
    transaction.update(userRef, { teams: newTeamsList });

    if (!force) {
      const order: string[] = draftState.draft_order;
      const nextPickCount = (draftState.pick_count || 0) + 1;
      const currentIndex = order.indexOf(draftState.current_turn_userId);
      let nextIndex = currentIndex + 1;
      let status = "active";
      let nextUser: string | null = draftState.current_turn_userId;

      if (nextIndex >= order.length) {
        nextIndex = 0;
        const nextRoundNum = Math.floor(nextPickCount / order.length);
        if (nextRoundNum >= 8) {
          status = "completed";
          nextUser = null;
        }
        else {
          nextUser = order[nextIndex];
        }
      }
      else {
        nextUser = order[nextIndex];
      }

      transaction.update(dsRef, { current_turn_userId: nextUser, pick_count: nextPickCount, status });
    }
  });

  return { success: true };
});


export const deleteUserAccount = functions.https.onCall(async (data, context) => {
  await requireAdmin(context);

  const { uid } = data;
  if (typeof uid !== "string" || !uid) {
    throw new functions.https.HttpsError("invalid-argument", "Invalid user ID.");
  }

  if (uid === context.auth!.uid) {
    throw new functions.https.HttpsError("invalid-argument", "Cannot delete your own account.");
  }

  await admin.auth().deleteUser(uid);
  await db.collection("users").doc(uid).delete();
  return { success: true };
});


export const toggleUserAdmin = functions.https.onCall(async (data, context) => {
  await requireAdmin(context);

  if (typeof data.userId !== "string" || !data.userId) {
    throw new functions.https.HttpsError("invalid-argument", "Invalid user ID.");
  }

  if (data.userId === context.auth!.uid) {
    throw new functions.https.HttpsError("invalid-argument", "Cannot modify your own admin status.");
  }

  const userRef = db.collection("users").doc(data.userId);
  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    throw new functions.https.HttpsError("not-found", "User not found.");
  }

  const currentStatus = userSnap.data()?.isAdmin || false;
  await userRef.update({ isAdmin: !currentStatus });
  return { success: true, isAdmin: !currentStatus };
});

async function performTeamPointsUpdate(): Promise<void> {
  console.log("Running Daily Point Updates");

  const ds = await db.collection("draft_state").doc("global").get();
  const activeYear = ds.data()?.active_year;
  if (!activeYear) {
    return;
  }

  const yearlyStats = await fetchYearlyStats(activeYear);

  let teamBatch = db.batch();
  let bCount = 0;
  for (const [teamNum, stats] of yearlyStats.entries()) {
    teamBatch.set(db.collection("teams").doc(teamNum), {
      activeYears: admin.firestore.FieldValue.arrayUnion(activeYear),
      stats: {
        [activeYear]: stats
      }
    }, { merge: true });
    bCount++;
    if (bCount >= 400) {
      await teamBatch.commit();
      teamBatch = db.batch();
      bCount = 0;
    }
  }
  if (bCount > 0) {
    await teamBatch.commit();
  }

  const updatedUsersSnap = await db.collection("users").get();
  const userScores: { uid: string, score: number }[] = [];
  
  const teamsCache = new Map();
  const updatedTeamsSnap = await db.collection("teams").get();
  updatedTeamsSnap.docs.forEach(d => {
    const data = d.data();
    teamsCache.set(d.id, data.stats?.[activeYear]?.score || 0);
  });
  
  for (const u of updatedUsersSnap.docs) {
    let uScore = 0;
    const uTeams = u.data().teams || [];
    uTeams.forEach((t: string) => {
      uScore += teamsCache.get(t) || 0;
    });
    userScores.push({ uid: u.id, score: uScore });
  }
  
  userScores.sort((a, b) => b.score - a.score);
  
  const userBatch = db.batch();
  userScores.forEach((ms, idx) => {
    userBatch.update(db.collection("users").doc(ms.uid), {
      score: ms.score,
      rank: idx + 1
    });
  });
  await userBatch.commit();
  
  console.log("Daily point updates completed.");
}

export const updateDraftedTeamsPoints = functions.runWith({ secrets: [tbaKey] }).pubsub.schedule("0 2 * * *").timeZone("America/New_York").onRun(async () => {
  const ds = await db.collection("draft_state").doc("global").get();
  const activeYear = ds.data()?.active_year;
  if (activeYear) {
    await performTeamDataSync(activeYear);
  }
  await performTeamPointsUpdate();
});