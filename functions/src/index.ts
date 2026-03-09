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

export const syncTeamData = functions.runWith({ secrets: [tbaKey] }).https.onCall(async (data, context) => {
  await requireAdmin(context);

  const year = typeof data.year === "string" && /^\d{4}$/.test(data.year)
    ? data.year
    : new Date().getFullYear().toString();

  await db.collection("draft_state").doc("global").set({ active_year: year }, { merge: true });
  
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
        const docRef = db.collection("teams").doc(t.team_number.toString());
        batch.set(docRef, {
          name: t.nickname || t.name,
          state: t.state_prov || "",
          country: t.country || "",
        }, { merge: true });
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
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Login required.");
  
  const { teamNumber, userId, force } = data;
  const targetUser = userId || context.auth.uid;
  
  if (force) {
    const adminDoc = await db.collection("users").doc(context.auth.uid).get();
    if (!adminDoc.data()?.isAdmin) throw new functions.https.HttpsError("permission-denied", "Admin only.");
  }
  
  const dsRef = db.collection("draft_state").doc("global");
  const dsSnap = await dsRef.get();
  const draftState = dsSnap.data();
  
  if (!draftState || draftState.status !== "active") {
    throw new functions.https.HttpsError("failed-precondition", "Draft is not active.");
  }
  
  if (!force && draftState.current_turn_userId !== context.auth.uid) {
    throw new functions.https.HttpsError("permission-denied", "It is not your turn.");
  }
  
  // Check if team is available
  const teamSnap = await db.collection("teams").doc(teamNumber).get();
  if (!teamSnap.exists) throw new functions.https.HttpsError("not-found", "Team not found.");
  
  // TODO We could strictly enforce state/country logic on backend, but for draft continuity we trust the frontend
  if (!force) {
    const allUsersSnap = await db.collection("users").get();
    for (const u of allUsersSnap.docs) {
      if ((u.data().teams || []).includes(teamNumber)) {
        throw new functions.https.HttpsError("already-exists", "Team already drafted.");
      }
    }
  }
  
  // Update User
  const userRef = db.collection("users").doc(targetUser);
  const userSnap = await userRef.get();
  const draftedTeams = userSnap.data()?.teams || [];
  if (draftedTeams.length >= 8) {
    throw new functions.https.HttpsError("out-of-range", "User already has 8 teams.");
  }
  
  const newTeamsList = [...draftedTeams, teamNumber];
  await userRef.update({ teams: newTeamsList });
  
  // Update global draft turn
  const order: string[] = draftState.draft_order;
  let nextUser = draftState.current_turn_userId;
  
  // TODO make sure if this is the last pick it completes
  if (!force) {
    const nextPickCount = (draftState.pick_count || 0) + 1;
    // Simple serpentine or standard round robin logic. Let's do Standard Round Robin (Looping).
    const currentIndex = order.indexOf(draftState.current_turn_userId);
    let nextIndex = currentIndex + 1;
    let status = "active";
    
    if (nextIndex >= order.length) {
      nextIndex = 0; // new round
      // check if everyone has 8 teams
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
    
    await dsRef.update({ current_turn_userId: nextUser, pick_count: nextPickCount, status });
  }
  
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

export const updateDraftedTeamsPoints = functions.runWith({ secrets: [tbaKey] }).pubsub.schedule("0 2 * * *").timeZone("America/New_York").onRun(async (context) => {
export const generateSignupLink = functions.https.onCall(async (data, context) => {
  await requireAdmin(context);

  const token = crypto.randomBytes(24).toString("hex");
  await db.collection("signup_links").doc(token).set({
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { success: true, token };
});
  console.log("Running Daily Point Updates");

  const ds = await db.collection("draft_state").doc("global").get();
  const activeYear = ds.data()?.active_year;
  if (!activeYear) {
    return;
  }

  const usersSnap = await db.collection("users").get();
  const draftedTeamIds = new Set<string>();
  usersSnap.docs.forEach(u => u.data().teams?.forEach((t: string) => draftedTeamIds.add(t)));

  if (draftedTeamIds.size === 0) {
    return;
  }

  for (const teamNum of Array.from(draftedTeamIds)) {
    try {
      const events = await tbaRequest(`/team/frc${teamNum}/events/${activeYear}/keys`);
      let teamAvg = 0;
      let teamQualWins = 0;
      let teamQualMatches = 0;
      let teamElimWins = 0;
      let teamElimMatches = 0;
      let playedQuals = 0;
      let playedElims = 0;
      
      for (const event of events) {
        if (event.includes("week0")) {
          continue;
        }

        let statusRes = null;
        try {
          statusRes = await tbaRequest(`/team/frc${teamNum}/event/${event}/status`);
        }
        catch (e) {
          // Silently skip events with no status
        }

        if (statusRes && statusRes.qual && statusRes.qual.ranking) {
          teamAvg += statusRes.qual.ranking.sort_orders?.[2] || 0;
          teamQualWins += statusRes.qual.ranking.record?.wins || 0;
          teamQualMatches += statusRes.qual.ranking.matches_played || 0;
          playedQuals++;
        }

        if (statusRes && statusRes.playoff && statusRes.playoff.record) {
          teamElimWins += statusRes.playoff.record.wins || 0;
          teamElimMatches += (statusRes.playoff.record.wins + statusRes.playoff.record.losses + statusRes.playoff.record.ties) || 0;
          playedElims++;
        }
      }

      if (playedQuals === 0) {
        continue;
      }

      teamAvg /= playedQuals;
      const qualWinPercent = teamQualMatches > 0 ? (teamQualWins / teamQualMatches) : 0;
      
      let finalWinPercent = qualWinPercent;
      if (playedElims > 0) {
        finalWinPercent = (teamQualWins + teamElimWins) / (teamQualMatches + teamElimMatches);
      }
      
      const teamScore = finalWinPercent * teamAvg;
      
      await db.collection("teams").doc(teamNum).update({
        average: teamAvg,
        score: teamScore,
        winPercent: finalWinPercent,
      });
      
    } 
    catch(err) {
      console.error(`Failed to update points for ${teamNum}`, err);
    }
  }

  const updatedUsersSnap = await db.collection("users").get();
  const userScores: { uid: string, score: number }[] = [];
  
  const teamsCache = new Map();
  const updatedTeamsSnap = await db.collection("teams").get();
  updatedTeamsSnap.docs.forEach(d => teamsCache.set(d.id, d.data().score || 0));
  
  for (const u of updatedUsersSnap.docs) {
    let uScore = 0;
    const uTeams = u.data().teams || [];
    uTeams.forEach((t: string) => {
      uScore += teamsCache.get(t) || 0;
    });
    userScores.push({ uid: u.id, score: uScore });
  }
  
  userScores.sort((a, b) => b.score - a.score);
  
  const batch = db.batch();
  userScores.forEach((ms, idx) => {
    batch.update(db.collection("users").doc(ms.uid), {
      score: ms.score,
      rank: idx + 1
    });
  });
  await batch.commit();
  
  console.log("Daily point updates completed.");
});
