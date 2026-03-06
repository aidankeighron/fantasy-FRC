import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import axios from "axios";

admin.initializeApp();
const db = admin.firestore();

// Use Firebase Functions config or Secret Manager for TBA Key
// For this rewrite, we assume `process.env.TBA_API_KEY` or `functions.config().tba.key` is set.
const getTbaKey = () => process.env.TBA_API_KEY || functions.config().tba?.key || "";

const TBA_BASE_URL = "https://www.thebluealliance.com/api/v3";

async function tbaRequest(endpoint: string) {
  const key = getTbaKey();
  if (!key) throw new Error("TBA API Key not configured.");
  const res = await axios.get(`${TBA_BASE_URL}${endpoint}`, {
    headers: { "X-TBA-Auth-Key": key },
  });
  return res.data;
}

export const syncTeamData = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Login required.");
  
  const user = await db.collection("users").doc(context.auth.uid).get();
  if (!user.data()?.isAdmin) throw new functions.https.HttpsError("permission-denied", "Admin only.");

  const year = data.year || new Date().getFullYear().toString();
  
  // Update Draft State active year
  await db.collection("draft_state").doc("global").set({ active_year: year }, { merge: true });

  let pageNum = 0;
  let fetching = true;
  const batch = db.batch();
  let count = 0;

  while (fetching) {
    try {
      const teams = await tbaRequest(`/teams/${year}/${pageNum}`);
      if (!teams || teams.length === 0) {
        fetching = false;
        break;
      }

      for (const t of teams) {
        const docRef = db.collection("teams").doc(t.team_number.toString());
        // Merge so we don't overwrite stats if they exist
        batch.set(docRef, {
          name: t.nickname || t.name,
          state: t.state_prov || "",
          country: t.country || "",
        }, { merge: true });
        count++;

        if (count % 400 === 0) {
          await batch.commit();
        }
      }
      pageNum++;
    } 
    catch (e) {
      console.error("Error fetching TBA page", pageNum, e);
      fetching = false;
    }
  }

  await batch.commit(); // commit remaining
  return { success: true, total: count, year };
});

export const startNewDraft = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Login required.");
  
  const user = await db.collection("users").doc(context.auth.uid).get();
  if (!user.data()?.isAdmin) throw new functions.https.HttpsError("permission-denied", "Admin only.");

  // Clear all users' teams
  const usersSnap = await db.collection("users").get();
  const batch = db.batch();
  const userIds: string[] = [];
  
  usersSnap.docs.forEach(doc => {
    userIds.push(doc.id);
    batch.update(doc.ref, { teams: [], score: 0 });
  });

  // Randomize order
  const shuffled = userIds.sort(() => 0.5 - Math.random());
  
  // Set draft state
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
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Login required.");
  
  const { receiverId, offeredTeams, requestedTeams } = data;
  if (!receiverId || (!offeredTeams.length && !requestedTeams.length)) {
    throw new functions.https.HttpsError("invalid-argument", "Missing trade data.");
  }

  // Draft must be completed
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
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Login required.");
    
    const { tradeId } = data;
    const tradeRef = db.collection("trades").doc(tradeId);
    
    await db.runTransaction(async (t) => {
        const tradeSnap = await t.get(tradeRef);
        if (!tradeSnap.exists) throw new functions.https.HttpsError("not-found", "Trade missing");
        
        const tradeData = tradeSnap.data()!;
        if (tradeData.receiverId !== context.auth!.uid) throw new functions.https.HttpsError("permission-denied", "Only receiver can accept.");
        if (tradeData.status !== "pending") throw new functions.https.HttpsError("failed-precondition", "Not pending.");

        const senderRef = db.collection("users").doc(tradeData.senderId);
        const receiverRef = db.collection("users").doc(tradeData.receiverId);
        
        const senderSnap = await t.get(senderRef);
        const receiverSnap = await t.get(receiverRef);
        
        let senderTeams: string[] = senderSnap.data()?.teams || [];
        let receiverTeams: string[] = receiverSnap.data()?.teams || [];

        // Check Minimum 5 teams rule for receiver
        // Receiver gives requestedTeams, gets offeredTeams
        const nextReceiverCount = receiverTeams.length - tradeData.requestedTeams.length + tradeData.offeredTeams.length;
        if (nextReceiverCount < 5) {
            throw new functions.https.HttpsError("failed-precondition", "Receiver must maintain minimum 5 teams.");
        }
        
        const nextSenderCount = senderTeams.length - tradeData.offeredTeams.length + tradeData.requestedTeams.length;
        if (nextSenderCount < 5) {
            throw new functions.https.HttpsError("failed-precondition", "Sender must maintain minimum 5 teams.");
        }

        // Apply trade
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
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Login required.");
  
  const tradeRef = db.collection("trades").doc(data.tradeId);
  const snap = await tradeRef.get();
  if (snap.data()?.senderId !== context.auth.uid && snap.data()?.receiverId !== context.auth.uid) {
      throw new functions.https.HttpsError("permission-denied", "Not your trade.");
  }
  
  await tradeRef.update({ status: "cancelled" });
  return { success: true };
});

export const deleteUserAccount = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Login required");
    const adminDoc = await db.collection("users").doc(context.auth.uid).get();
    if (!adminDoc.data()?.isAdmin) throw new functions.https.HttpsError("permission-denied", "Admin only.");

    const { uid } = data;
    await admin.auth().deleteUser(uid);
    await db.collection("users").doc(uid).delete();
    return { success: true };
});

export const updateDraftedTeamsPoints = functions.pubsub.schedule("0 2 * * *").timeZone("America/New_York").onRun(async (context) => {
    console.log("Running Daily Point Updates");
    
    // Get active year
    const ds = await db.collection("draft_state").doc("global").get();
    const activeYear = ds.data()?.active_year;
    if (!activeYear) return;

    // Get all drafted teams
    const usersSnap = await db.collection("users").get();
    const draftedTeamIds = new Set<string>();
    usersSnap.docs.forEach(u => u.data().teams?.forEach((t: string) => draftedTeamIds.add(t)));

    if (draftedTeamIds.size === 0) return;

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
                if (event.includes("week0")) continue;
                
                // Qual Status
                let statusRes = null;
                try { statusRes = await tbaRequest(`/team/frc${teamNum}/event/${event}/status`); } catch(e) {}
                
                if (statusRes && statusRes.qual && statusRes.qual.ranking) {
                    teamAvg += statusRes.qual.ranking.sort_orders?.[2] || 0;
                    teamQualWins += statusRes.qual.ranking.record?.wins || 0;
                    teamQualMatches += statusRes.qual.ranking.matches_played || 0;
                    playedQuals++;
                }

                // Elim status
                if (statusRes && statusRes.playoff && statusRes.playoff.record) {
                    teamElimWins += statusRes.playoff.record.wins || 0;
                    teamElimMatches += (statusRes.playoff.record.wins + statusRes.playoff.record.losses + statusRes.playoff.record.ties) || 0;
                    playedElims++;
                }
            }

            if (playedQuals === 0) continue;

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

    // Now recalculate users' scores and ranks
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
