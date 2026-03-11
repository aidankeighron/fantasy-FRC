import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { db, tbaKey } from "./config";
import { requireAdmin, tbaRequest, TeamAccumulator } from "./utils";

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
  
  const rawStats = new Map<string, any>();
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

async function performTeamPointsUpdate(year: string): Promise<void> {
  console.log("Running Daily Point Updates");
  
  const yearlyStats = await fetchYearlyStats(year);
  
  let teamBatch = db.batch();
  let bCount = 0;
  for (const [teamNum, stats] of yearlyStats.entries()) {
    teamBatch.set(db.collection("teams").doc(teamNum), {
      activeYears: admin.firestore.FieldValue.arrayUnion(year),
      stats: {
        [year]: stats
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
  
  const teamsCache = new Map<string, number>();
  const updatedTeamsSnap = await db.collection("teams").get();
  updatedTeamsSnap.docs.forEach(d => {
    const data = d.data();
    teamsCache.set(d.id, data.stats?.[year]?.score || 0);
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
    const userDoc = updatedUsersSnap.docs.find(d => d.id === ms.uid);
    const userTeams = userDoc?.data().teams || [];

    userBatch.set(db.collection("users").doc(ms.uid), {
      score: ms.score,
      rank: idx + 1,
      seasons: {
        [year]: {
          score: ms.score,
          rank: idx + 1,
          teams: userTeams
        }
      }
    }, { merge: true });
  });
  await userBatch.commit();
  
  console.log("Daily point updates completed.");
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

export const syncTeamData = functions.runWith({ secrets: [tbaKey], timeoutSeconds: 540, memory: "1GB" }).https.onCall(async (data: any, context: functions.https.CallableContext) => {
  await requireAdmin(context);
  
  const year = typeof data.year === "string" && /^\d{4}$/.test(data.year) ? data.year : new Date().getFullYear().toString();
  
  const result = await performTeamDataSync(year);
  await performTeamPointsUpdate(year);
  return result;
});

export const updateDraftedTeamsPoints = functions.runWith({ secrets: [tbaKey], timeoutSeconds: 540, memory: "1GB" }).pubsub.schedule("0 2 * * *").timeZone("America/New_York").onRun(async () => {
  const ds = await db.collection("draft_state").doc("global").get();
  const activeYear = ds.data()?.active_year;
  if (activeYear) {
    await performTeamDataSync(activeYear);
    await performTeamPointsUpdate(activeYear);
  }
});

export const recalcUserScores = functions.https.onCall(async (_data: any, context: functions.https.CallableContext) => {
  await requireAdmin(context);

  const ds = await db.collection("draft_state").doc("global").get();
  const year = ds.data()?.active_year;
  if (!year) {
    throw new functions.https.HttpsError("failed-precondition", "No active year set.");
  }

  const teamsSnap = await db.collection("teams").get();
  const teamsCache = new Map<string, number>();
  teamsSnap.docs.forEach(d => {
    teamsCache.set(d.id, d.data().stats?.[year]?.score || 0);
  });

  const usersSnap = await db.collection("users").get();
  const userScores: { uid: string, score: number }[] = [];

  for (const u of usersSnap.docs) {
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
    const userDoc = usersSnap.docs.find(d => d.id === ms.uid);
    const userTeams = userDoc?.data().teams || [];
    batch.set(db.collection("users").doc(ms.uid), {
      score: ms.score,
      rank: idx + 1,
      seasons: {
        [year]: {
          score: ms.score,
          rank: idx + 1,
          teams: userTeams
        }
      }
    }, { merge: true });
  });
  await batch.commit();

  return { updated: userScores.length, year };
});
