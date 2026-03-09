"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateDraftedTeamsPoints = exports.deleteUserAccount = exports.cancelTrade = exports.acceptTrade = exports.createTrade = exports.processDraftPick = exports.startNewDraft = exports.syncTeamData = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios_1 = require("axios");
const params_1 = require("firebase-functions/params");
admin.initializeApp();
const db = admin.firestore();
// Define the TBA API key secret
const tbaKey = (0, params_1.defineSecret)("TBA_API_KEY");
const TBA_BASE_URL = "https://www.thebluealliance.com/api/v3";
async function tbaRequest(endpoint) {
    const key = tbaKey.value();
    if (!key) {
        throw new Error("TBA API Key not configured.");
    }
    const res = await axios_1.default.get(`${TBA_BASE_URL}${endpoint}`, {
        headers: { "X-TBA-Auth-Key": key },
    });
    return res.data;
}
exports.syncTeamData = functions.runWith({ secrets: [tbaKey] }).https.onCall(async (data, context) => {
    var _a;
    if (!context.auth)
        throw new functions.https.HttpsError("unauthenticated", "Login required.");
    const user = await db.collection("users").doc(context.auth.uid).get();
    if (!((_a = user.data()) === null || _a === void 0 ? void 0 : _a.isAdmin))
        throw new functions.https.HttpsError("permission-denied", "Admin only.");
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
exports.startNewDraft = functions.https.onCall(async (data, context) => {
    var _a;
    if (!context.auth)
        throw new functions.https.HttpsError("unauthenticated", "Login required.");
    const user = await db.collection("users").doc(context.auth.uid).get();
    if (!((_a = user.data()) === null || _a === void 0 ? void 0 : _a.isAdmin))
        throw new functions.https.HttpsError("permission-denied", "Admin only.");
    // Clear all users' teams
    const usersSnap = await db.collection("users").get();
    const batch = db.batch();
    const userIds = [];
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
exports.processDraftPick = functions.https.onCall(async (data, context) => {
    var _a, _b;
    if (!context.auth)
        throw new functions.https.HttpsError("unauthenticated", "Login required.");
    const { teamNumber, userId, force } = data;
    const targetUser = userId || context.auth.uid;
    if (force) {
        const adminDoc = await db.collection("users").doc(context.auth.uid).get();
        if (!((_a = adminDoc.data()) === null || _a === void 0 ? void 0 : _a.isAdmin))
            throw new functions.https.HttpsError("permission-denied", "Admin only.");
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
    if (!teamSnap.exists)
        throw new functions.https.HttpsError("not-found", "Team not found.");
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
    const draftedTeams = ((_b = userSnap.data()) === null || _b === void 0 ? void 0 : _b.teams) || [];
    if (draftedTeams.length >= 8) {
        throw new functions.https.HttpsError("out-of-range", "User already has 8 teams.");
    }
    const newTeamsList = [...draftedTeams, teamNumber];
    await userRef.update({ teams: newTeamsList });
    // Update global draft turn
    const order = draftState.draft_order;
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
exports.createTrade = functions.https.onCall(async (data, context) => {
    var _a;
    if (!context.auth)
        throw new functions.https.HttpsError("unauthenticated", "Login required.");
    const { receiverId, offeredTeams, requestedTeams } = data;
    if (!receiverId || (!offeredTeams.length && !requestedTeams.length)) {
        throw new functions.https.HttpsError("invalid-argument", "Missing trade data.");
    }
    // Draft must be completed
    const ds = await db.collection("draft_state").doc("global").get();
    if (((_a = ds.data()) === null || _a === void 0 ? void 0 : _a.status) !== "completed") {
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
exports.acceptTrade = functions.https.onCall(async (data, context) => {
    if (!context.auth)
        throw new functions.https.HttpsError("unauthenticated", "Login required.");
    const { tradeId } = data;
    const tradeRef = db.collection("trades").doc(tradeId);
    await db.runTransaction(async (t) => {
        var _a, _b;
        const tradeSnap = await t.get(tradeRef);
        if (!tradeSnap.exists)
            throw new functions.https.HttpsError("not-found", "Trade missing");
        const tradeData = tradeSnap.data();
        if (tradeData.receiverId !== context.auth.uid)
            throw new functions.https.HttpsError("permission-denied", "Only receiver can accept.");
        if (tradeData.status !== "pending")
            throw new functions.https.HttpsError("failed-precondition", "Not pending.");
        const senderRef = db.collection("users").doc(tradeData.senderId);
        const receiverRef = db.collection("users").doc(tradeData.receiverId);
        const senderSnap = await t.get(senderRef);
        const receiverSnap = await t.get(receiverRef);
        let senderTeams = ((_a = senderSnap.data()) === null || _a === void 0 ? void 0 : _a.teams) || [];
        let receiverTeams = ((_b = receiverSnap.data()) === null || _b === void 0 ? void 0 : _b.teams) || [];
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
        tradeData.offeredTeams.forEach((team) => {
            senderTeams = senderTeams.filter(t => t !== team);
            receiverTeams.push(team);
        });
        tradeData.requestedTeams.forEach((team) => {
            receiverTeams = receiverTeams.filter(t => t !== team);
            senderTeams.push(team);
        });
        t.update(senderRef, { teams: senderTeams });
        t.update(receiverRef, { teams: receiverTeams });
        t.update(tradeRef, { status: "accepted" });
    });
    return { success: true };
});
exports.cancelTrade = functions.https.onCall(async (data, context) => {
    var _a, _b;
    if (!context.auth)
        throw new functions.https.HttpsError("unauthenticated", "Login required.");
    const tradeRef = db.collection("trades").doc(data.tradeId);
    const snap = await tradeRef.get();
    if (((_a = snap.data()) === null || _a === void 0 ? void 0 : _a.senderId) !== context.auth.uid && ((_b = snap.data()) === null || _b === void 0 ? void 0 : _b.receiverId) !== context.auth.uid) {
        throw new functions.https.HttpsError("permission-denied", "Not your trade.");
    }
    await tradeRef.update({ status: "cancelled" });
    return { success: true };
});
exports.deleteUserAccount = functions.https.onCall(async (data, context) => {
    var _a;
    if (!context.auth)
        throw new functions.https.HttpsError("unauthenticated", "Login required");
    const adminDoc = await db.collection("users").doc(context.auth.uid).get();
    if (!((_a = adminDoc.data()) === null || _a === void 0 ? void 0 : _a.isAdmin))
        throw new functions.https.HttpsError("permission-denied", "Admin only.");
    const { uid } = data;
    await admin.auth().deleteUser(uid);
    await db.collection("users").doc(uid).delete();
    return { success: true };
});
exports.updateDraftedTeamsPoints = functions.runWith({ secrets: [tbaKey] }).pubsub.schedule("0 2 * * *").timeZone("America/New_York").onRun(async (context) => {
    var _a, _b, _c;
    console.log("Running Daily Point Updates");
    // Get active year
    const ds = await db.collection("draft_state").doc("global").get();
    const activeYear = (_a = ds.data()) === null || _a === void 0 ? void 0 : _a.active_year;
    if (!activeYear)
        return;
    // Get all drafted teams
    const usersSnap = await db.collection("users").get();
    const draftedTeamIds = new Set();
    usersSnap.docs.forEach(u => { var _a; return (_a = u.data().teams) === null || _a === void 0 ? void 0 : _a.forEach((t) => draftedTeamIds.add(t)); });
    if (draftedTeamIds.size === 0)
        return;
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
                if (event.includes("week0"))
                    continue;
                // Qual Status
                let statusRes = null;
                try {
                    statusRes = await tbaRequest(`/team/frc${teamNum}/event/${event}/status`);
                }
                catch (e) { }
                if (statusRes && statusRes.qual && statusRes.qual.ranking) {
                    teamAvg += ((_b = statusRes.qual.ranking.sort_orders) === null || _b === void 0 ? void 0 : _b[2]) || 0;
                    teamQualWins += ((_c = statusRes.qual.ranking.record) === null || _c === void 0 ? void 0 : _c.wins) || 0;
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
            if (playedQuals === 0)
                continue;
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
        catch (err) {
            console.error(`Failed to update points for ${teamNum}`, err);
        }
    }
    // Now recalculate users' scores and ranks
    const updatedUsersSnap = await db.collection("users").get();
    const userScores = [];
    const teamsCache = new Map();
    const updatedTeamsSnap = await db.collection("teams").get();
    updatedTeamsSnap.docs.forEach(d => teamsCache.set(d.id, d.data().score || 0));
    for (const u of updatedUsersSnap.docs) {
        let uScore = 0;
        const uTeams = u.data().teams || [];
        uTeams.forEach((t) => {
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
//# sourceMappingURL=index.js.map