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

async function fetchYearlyStats(year: string, teamFilter?: Set<string>): Promise<Map<string, any>> {
  const events = await tbaRequest(`/events/${year}/keys`);
  const teamStats = new Map<string, {
    teamAvg: number, teamQualWins: number, teamQualMatches: number, teamElimWins: number, teamElimMatches: number, playedQuals: number, playedElims: number
  }>();

  // Process events in chunks to avoid TBA rate limits while still being fast
  const chunkSize = 10;
  for (let i = 0; i < events.length; i += chunkSize) {
    const chunk = events.slice(i, i + chunkSize);
    await Promise.all(chunk.map(async (event: string) => {
      if (event.includes("week0")) return;
      
      let statuses: any = null;
      try {
        statuses = await tbaRequest(`/event/${event}/statuses`);
      } catch (e) {
        return;
      }
      
      if (!statuses) return;

      for (const [teamKey, status] of Object.entries(statuses)) {
        const teamNum = teamKey.replace("frc", "");
        if (teamFilter && !teamFilter.has(teamNum)) continue;

        if (!teamStats.has(teamNum)) {
          teamStats.set(teamNum, { teamAvg: 0, teamQualWins: 0, teamQualMatches: 0, teamElimWins: 0, teamElimMatches: 0, playedQuals: 0, playedElims: 0 });
        }
        const stats = teamStats.get(teamNum)!;
        const s = status as any;

        if (s && s.qual && s.qual.ranking) {
          stats.teamAvg += s.qual.ranking.sort_orders?.[2] || 0;
          stats.teamQualWins += s.qual.ranking.record?.wins || 0;
          stats.teamQualMatches += s.qual.ranking.matches_played || 0;
          stats.playedQuals++;
        }

        if (s && s.playoff && s.playoff.record) {
          stats.teamElimWins += s.playoff.record.wins || 0;
          stats.teamElimMatches += (s.playoff.record.wins + s.playoff.record.losses + s.playoff.record.ties) || 0;
          stats.playedElims++;
        }
      }
    }));
  }

  const finalStats = new Map<string, any>();
  for (const [teamNum, stats] of teamStats.entries()) {
    if (stats.playedQuals === 0) continue;
    
    const avg = stats.teamAvg / stats.playedQuals;
    const qualWinPercent = stats.teamQualMatches > 0 ? (stats.teamQualWins / stats.teamQualMatches) : 0;
    
    let finalWinPercent = qualWinPercent;
    if (stats.playedElims > 0) {
      finalWinPercent = (stats.teamQualWins + stats.teamElimWins) / (stats.teamQualMatches + stats.teamElimMatches);
    }
    
    const score = finalWinPercent * avg;
    finalStats.set(teamNum, { average: avg, score: score, winPercent: finalWinPercent });
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

  return await performTeamDataSync(year);
});

export const triggerTeamDataSync = functions.runWith({ secrets: [tbaKey] }).https.onCall(async (data, context) => {
  await requireAdmin(context);
  const ds = await db.collection("draft_state").doc("global").get();
  const activeYear = ds.data()?.active_year;
  if (!activeYear) {
    throw new functions.https.HttpsError("failed-precondition", "No active year.");
  }
  const result = await performTeamDataSync(activeYear);
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

export const createTrade = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Login required.");
  }

  const { receiverId, offeredTeams, requestedTeams } = data;

  if (typeof receiverId !== "string" || !receiverId) {
    throw new functions.https.HttpsError("invalid-argument", "Invalid receiver ID.");
  }

  if (!Array.isArray(offeredTeams) || !Array.isArray(requestedTeams)) {
    throw new functions.https.HttpsError("invalid-argument", "Teams must be arrays.");
  }

  if (!offeredTeams.every((t: unknown) => typeof t === "string") || !requestedTeams.every((t: unknown) => typeof t === "string")) {
    throw new functions.https.HttpsError("invalid-argument", "Team entries must be strings.");
  }

  if (offeredTeams.length === 0 && requestedTeams.length === 0) {
    throw new functions.https.HttpsError("invalid-argument", "Must offer or request at least one team.");
  }

  if (receiverId === context.auth.uid) {
    throw new functions.https.HttpsError("invalid-argument", "Cannot trade with yourself.");
  }

  const ds = await db.collection("draft_state").doc("global").get();
  if (ds.data()?.status !== "completed") {
    throw new functions.https.HttpsError("failed-precondition", "Trading requires completed draft.");
  }

  const senderDoc = await db.collection("users").doc(context.auth.uid).get();
  const senderTeams: string[] = senderDoc.data()?.teams || [];
  for (const team of offeredTeams) {
    if (!senderTeams.includes(team)) {
      throw new functions.https.HttpsError("invalid-argument", `You do not own team ${team}.`);
    }
  }

  const receiverDoc = await db.collection("users").doc(receiverId).get();
  if (!receiverDoc.exists) {
    throw new functions.https.HttpsError("not-found", "Receiver not found.");
  }

  const receiverTeams: string[] = receiverDoc.data()?.teams || [];
  for (const team of requestedTeams) {
    if (!receiverTeams.includes(team)) {
      throw new functions.https.HttpsError("invalid-argument", `Receiver does not own team ${team}.`);
    }
  }

  await db.collection("trades").add({
    senderId: context.auth.uid,
    receiverId,
    offeredTeams,
    requestedTeams,
    status: "pending",
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
  
  return { success: true };
});

export const acceptTrade = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Login required.");
  }

  const { tradeId } = data;
  if (typeof tradeId !== "string" || !tradeId) {
    throw new functions.https.HttpsError("invalid-argument", "Invalid trade ID.");
  }

  const tradeRef = db.collection("trades").doc(tradeId);
  
  await db.runTransaction(async (t) => {
    const tradeSnap = await t.get(tradeRef);
    if (!tradeSnap.exists) {
      throw new functions.https.HttpsError("not-found", "Trade missing");
    }

    const tradeData = tradeSnap.data()!;
    if (tradeData.receiverId !== context.auth!.uid) {
      throw new functions.https.HttpsError("permission-denied", "Only receiver can accept.");
    }

    if (tradeData.status !== "pending") {
      throw new functions.https.HttpsError("failed-precondition", "Not pending.");
    }

    const senderRef = db.collection("users").doc(tradeData.senderId);
    const receiverRef = db.collection("users").doc(tradeData.receiverId);
    
    const senderSnap = await t.get(senderRef);
    const receiverSnap = await t.get(receiverRef);
    
    let senderTeams: string[] = senderSnap.data()?.teams || [];
    let receiverTeams: string[] = receiverSnap.data()?.teams || [];

    for (const team of tradeData.offeredTeams) {
      if (!senderTeams.includes(team)) {
        throw new functions.https.HttpsError("failed-precondition", `Sender no longer owns team ${team}.`);
      }
    }

    for (const team of tradeData.requestedTeams) {
      if (!receiverTeams.includes(team)) {
        throw new functions.https.HttpsError("failed-precondition", `Receiver no longer owns team ${team}.`);
      }
    }

    const nextReceiverCount = receiverTeams.length - tradeData.requestedTeams.length + tradeData.offeredTeams.length;
    if (nextReceiverCount < 5) {
      throw new functions.https.HttpsError("failed-precondition", "Receiver must maintain minimum 5 teams.");
    }
    
    const nextSenderCount = senderTeams.length - tradeData.offeredTeams.length + tradeData.requestedTeams.length;
    if (nextSenderCount < 5) {
      throw new functions.https.HttpsError("failed-precondition", "Sender must maintain minimum 5 teams.");
    }

    tradeData.offeredTeams.forEach((team: string) => {
      senderTeams = senderTeams.filter(t => t !== team);
      receiverTeams.push(team);
    });
    
    tradeData.requestedTeams.forEach((team: string) => {
      receiverTeams = receiverTeams.filter(t => t !== team);
      senderTeams.push(team);
    });
    
    t.update(senderRef, { teams: senderTeams });
    t.update(receiverRef, { teams: receiverTeams });
    t.update(tradeRef, { status: "accepted" });
  });
  
  return { success: true };
});

export const cancelTrade = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Login required.");
  }

  if (typeof data.tradeId !== "string" || !data.tradeId) {
    throw new functions.https.HttpsError("invalid-argument", "Invalid trade ID.");
  }

  const tradeRef = db.collection("trades").doc(data.tradeId);
  const snap = await tradeRef.get();

  if (!snap.exists) {
    throw new functions.https.HttpsError("not-found", "Trade not found.");
  }

  if (snap.data()?.senderId !== context.auth.uid && snap.data()?.receiverId !== context.auth.uid) {
    throw new functions.https.HttpsError("permission-denied", "Not your trade.");
  }
  
  await tradeRef.update({ status: "cancelled" });
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

export const triggerTeamPointsUpdate = functions.runWith({ secrets: [tbaKey] }).https.onCall(async (data, context) => {
  await requireAdmin(context);
  await performTeamPointsUpdate();
  return { success: true };
});
