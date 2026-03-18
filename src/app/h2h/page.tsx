"use client";

import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where, doc, getDoc, onSnapshot } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { useH2HTimers, formatCountdown, type H2HWeekTimestamps } from "@/lib/useH2HTimers";
import { H2H_CONFIG } from "@/lib/h2hConfig";
import styles from "./h2h.module.css";

interface H2HEvent {
  key: string;
  name: string;
  startDate: string;
  endDate: string;
  webcastUrl: string;
  teamCount: number;
  teams: string[];
}

interface Matchup {
  id: string;
  userA: string;
  userB: string;
  usernameA: string;
  usernameB: string;
}

interface MatchupResult {
  matchupId: string;
  userA: string;
  userB: string;
  userATeams: string[];
  userBTeams: string[];
  draftOrder: { round: number; pick: number; user: string; team: string }[];
  userAScore: number | null;
  userBScore: number | null;
  winner: string | null;
  pointsAwarded: number | null;
}

interface WeekData {
  year: string;
  weekNumber: number;
  status: string;
  draftOpensAt: any;
  draftClosesAt: any;
  eventsStartDate: any;
  eventsEndDate: any;
  scoringAt: any;
  events: H2HEvent[];
  competingTeams: string[];
  matchups: Matchup[];
}

interface TeamInfo {
  number: string;
  name: string;
  score: number;
}

export default function H2HPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [weeks, setWeeks] = useState<Map<string, WeekData>>(new Map());
  const [selectedWeekId, setSelectedWeekId] = useState<string>("");
  const [results, setResults] = useState<Map<string, MatchupResult>>(new Map());
  const [teamInfoMap, setTeamInfoMap] = useState<Map<string, TeamInfo>>(new Map());
  const [userPicks, setUserPicks] = useState<string[] | null>(null);
  const [allUsers, setAllUsers] = useState<Map<string, { username: string; h2h: any }>>(new Map());
  const [dataLoading, setDataLoading] = useState(true);
  const [showDraftTrace, setShowDraftTrace] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  // Fetch all weeks
  useEffect(() => {
    const fetchWeeks = async () => {
      try {
        const dsSnap = await getDoc(doc(db, "draft_state", "global"));
        const year = dsSnap.exists() ? dsSnap.data().active_year : new Date().getFullYear().toString();

        const weeksSnap = await getDocs(collection(db, "h2h_weeks"));
        const weeksMap = new Map<string, WeekData>();
        let latestActiveWeek = "";

        weeksSnap.forEach((d) => {
          const data = d.data() as WeekData;
          if (data.year === year) {
            weeksMap.set(d.id, data);
            if (
              !latestActiveWeek ||
              (data.status !== "completed" && data.weekNumber >= (weeksMap.get(latestActiveWeek)?.weekNumber || 0))
            ) {
              latestActiveWeek = d.id;
            }
          }
        });

        // If no active week, pick latest completed
        if (!latestActiveWeek && weeksMap.size > 0) {
          let maxWeek = -1;
          for (const [id, data] of weeksMap) {
            if (data.weekNumber > maxWeek) {
              maxWeek = data.weekNumber;
              latestActiveWeek = id;
            }
          }
        }

        setWeeks(weeksMap);
        if (latestActiveWeek) setSelectedWeekId(latestActiveWeek);

        // Fetch users for standings
        const usersSnap = await getDocs(collection(db, "users"));
        const usersMap = new Map<string, { username: string; h2h: any }>();
        usersSnap.forEach((d) => {
          const data = d.data();
          usersMap.set(d.id, { username: data.username || "Unknown", h2h: data.h2h || {} });
        });
        setAllUsers(usersMap);
      } catch (e) {
        console.error("Failed to fetch H2H weeks:", e);
      } finally {
        setDataLoading(false);
      }
    };

    fetchWeeks();
  }, []);

  // Fetch results and picks for selected week
  useEffect(() => {
    if (!selectedWeekId) return;

    const fetchWeekDetails = async () => {
      try {
        // Results
        const resultsSnap = await getDocs(
          collection(db, "h2h_weeks", selectedWeekId, "results")
        );
        const resultsMap = new Map<string, MatchupResult>();
        resultsSnap.forEach((d) => {
          resultsMap.set(d.id, d.data() as MatchupResult);
        });
        setResults(resultsMap);

        // User picks
        if (user) {
          const pickSnap = await getDoc(
            doc(db, "h2h_weeks", selectedWeekId, "picks", user.uid)
          );
          setUserPicks(pickSnap.exists() ? pickSnap.data().preferences : null);
        }
      } catch (e) {
        console.error("Failed to fetch week details:", e);
      }
    };

    fetchWeekDetails();
  }, [selectedWeekId, user]);

  // Fetch team info for competing teams
  useEffect(() => {
    const week = weeks.get(selectedWeekId);
    if (!week || week.competingTeams.length === 0) return;

    const fetchTeamInfo = async () => {
      const infoMap = new Map<string, TeamInfo>();
      const teamNumbers = week.competingTeams;

      // Fetch in chunks
      for (let i = 0; i < teamNumbers.length; i += 30) {
        const chunk = teamNumbers.slice(i, i + 30);
        const docs = await Promise.all(
          chunk.map((t) => getDoc(doc(db, "teams", t)))
        );
        for (const d of docs) {
          if (d.exists()) {
            const data = d.data();
            infoMap.set(d.id, {
              number: d.id,
              name: data.name || "",
              score: data.stats?.[week.year]?.score || 0,
            });
          }
        }
      }
      setTeamInfoMap(infoMap);
    };

    fetchTeamInfo();
  }, [selectedWeekId, weeks]);

  const currentWeek = weeks.get(selectedWeekId) || null;
  const timer = useH2HTimers(currentWeek as H2HWeekTimestamps | null);

  // Find user's matchup
  const userMatchup = useMemo(() => {
    if (!user || !currentWeek) return null;
    return currentWeek.matchups.find(
      (m) => m.userA === user.uid || m.userB === user.uid
    ) || null;
  }, [user, currentWeek]);

  const userResult = useMemo(() => {
    if (!userMatchup) return null;
    return results.get(userMatchup.id) || null;
  }, [userMatchup, results]);

  // Sorted week tabs
  const sortedWeekIds = useMemo(() => {
    return Array.from(weeks.entries())
      .sort((a, b) => a[1].weekNumber - b[1].weekNumber)
      .map(([id]) => id);
  }, [weeks]);

  // H2H standings
  const standings = useMemo(() => {
    if (!currentWeek) return [];
    const year = currentWeek.year;
    const entries: { uid: string; username: string; wins: number; losses: number; ties: number; bonus: number }[] = [];

    allUsers.forEach((data, uid) => {
      const h2hYear = data.h2h?.[year];
      if (h2hYear) {
        entries.push({
          uid,
          username: data.username,
          wins: h2hYear.totalWins || 0,
          losses: h2hYear.totalLosses || 0,
          ties: h2hYear.totalTies || 0,
          bonus: h2hYear.totalBonusPoints || 0,
        });
      }
    });

    return entries.sort((a, b) => b.bonus - a.bonus || b.wins - a.wins);
  }, [allUsers, currentWeek]);

  if (authLoading || dataLoading) {
    return (
      <div className="flex-center" style={{ minHeight: "60vh" }}>
        Loading Head-to-Head...
      </div>
    );
  }

  if (!user) return null;

  if (weeks.size === 0) {
    return (
      <div className={styles.container}>
        <h1 style={{ fontSize: "2rem", color: "white" }}>Head-to-Head</h1>
        <div className="glass-panel" style={{ padding: "2rem", textAlign: "center" }}>
          <h2 style={{ color: "var(--text-muted)", fontSize: "1.25rem" }}>No H2H Weeks Available</h2>
          <p style={{ color: "var(--text-muted)", marginTop: "0.5rem" }}>
            Weekly matchups will appear here once the competition season begins and events are synced.
          </p>
        </div>
      </div>
    );
  }

  const getUserResult = (matchup: Matchup, uid: string): string | null => {
    const result = results.get(matchup.id);
    if (!result || !result.winner) return null;
    if (result.winner === "tie") return "tie";
    return result.winner === uid ? "win" : "loss";
  };

  const getTeamName = (teamNum: string): string => {
    return teamInfoMap.get(teamNum)?.name || `Team ${teamNum}`;
  };

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <h1>Head-to-Head</h1>
        <div className={styles.weekTabs}>
          {sortedWeekIds.map((id) => {
            const w = weeks.get(id)!;
            const badgeLabel =
              w.status === "drafting" ? "Draft Open" :
              w.status === "active" ? "Live" :
              w.status === "completed" ? "Done" :
              "Upcoming";
            const badgeClass =
              w.status === "drafting" ? styles.weekStatusDrafting :
              w.status === "active" ? styles.weekStatusActive :
              w.status === "completed" ? styles.weekStatusCompleted :
              styles.weekStatusScoring;
            return (
              <button
                key={id}
                className={`${styles.weekTab} ${id === selectedWeekId ? styles.weekTabActive : ""}`}
                onClick={() => setSelectedWeekId(id)}
              >
                Week {w.weekNumber}
                <span className={`${styles.weekStatusBadge} ${badgeClass}`}>{badgeLabel}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Timer Bar */}
      {timer && (
        <div className={`glass ${styles.timerBar}`}>
          {timer.phase !== "completed" && <div className={styles.phaseDot} />}
          <span className={styles.timerPhase}>{timer.label}</span>
          <span className={`${styles.timerCountdown} ${timer.phase === "completed" ? styles.timerCompleted : ""}`}>
            {timer.phase === "completed" ? "Finalized" : formatCountdown(timer.remaining)}
          </span>
        </div>
      )}

      {/* Submit Picks CTA */}
      {currentWeek?.status === "drafting" && !userPicks && userMatchup && userMatchup.userB !== "bye" && (
        <div className={`glass ${styles.ctaBar}`}>
          <span className={styles.ctaText}>Draft is open! Submit your team preferences.</span>
          <button className="btn-primary" onClick={() => router.push("/h2h/draft")}>
            Submit Picks
          </button>
        </div>
      )}

      {currentWeek?.status === "drafting" && userPicks && (
        <div className={`glass ${styles.ctaBar}`}>
          <span className={styles.ctaText}>Picks submitted! You can update them before the deadline.</span>
          <button className="btn-secondary" onClick={() => router.push("/h2h/draft")}>
            Update Picks
          </button>
        </div>
      )}

      {/* Your Matchup Card */}
      {userMatchup && (
        <div className={`glass-panel ${styles.matchupCard}`}>
          <h3 className={styles.matchupCardTitle}>Your Matchup</h3>
          <div className={styles.matchupVs}>
            {/* User A side */}
            <div className={styles.matchupSide}>
              <span className={styles.matchupUsername}>
                {userMatchup.usernameA}
                {userMatchup.userA === user.uid && " (You)"}
              </span>
              {userResult && (
                <>
                  <span className={styles.matchupScore}>
                    {userResult.userAScore !== null ? userResult.userAScore.toFixed(1) : "-"}
                  </span>
                  <div className={styles.matchupTeams}>
                    {userResult.userATeams.map((t) => (
                      <span key={t} className={styles.matchupTeam}>
                        <span className={styles.matchupTeamNumber}>{t}</span>
                        {getTeamName(t)}
                      </span>
                    ))}
                  </div>
                  {userResult.winner && (
                    <span className={`${styles.resultBadge} ${
                      getUserResult(userMatchup, userMatchup.userA) === "win" ? styles.resultWin :
                      getUserResult(userMatchup, userMatchup.userA) === "loss" ? styles.resultLoss :
                      getUserResult(userMatchup, userMatchup.userA) === "tie" ? styles.resultTie :
                      styles.resultPending
                    }`}>
                      {getUserResult(userMatchup, userMatchup.userA) || "Pending"}
                    </span>
                  )}
                </>
              )}
            </div>

            <span className={styles.vsDivider}>VS</span>

            {/* User B side */}
            <div className={`${styles.matchupSide} ${styles.matchupSideRight}`}>
              <span className={styles.matchupUsername}>
                {userMatchup.usernameB}
                {userMatchup.userB === user.uid && " (You)"}
              </span>
              {userResult && userMatchup.userB !== "bye" && (
                <>
                  <span className={styles.matchupScore}>
                    {userResult.userBScore !== null ? userResult.userBScore.toFixed(1) : "-"}
                  </span>
                  <div className={styles.matchupTeams}>
                    {userResult.userBTeams.map((t) => (
                      <span key={t} className={styles.matchupTeam}>
                        <span className={styles.matchupTeamNumber}>{t}</span>
                        {getTeamName(t)}
                      </span>
                    ))}
                  </div>
                  {userResult.winner && (
                    <span className={`${styles.resultBadge} ${
                      getUserResult(userMatchup, userMatchup.userB) === "win" ? styles.resultWin :
                      getUserResult(userMatchup, userMatchup.userB) === "loss" ? styles.resultLoss :
                      getUserResult(userMatchup, userMatchup.userB) === "tie" ? styles.resultTie :
                      styles.resultPending
                    }`}>
                      {getUserResult(userMatchup, userMatchup.userB) || "Pending"}
                    </span>
                  )}
                </>
              )}
              {userMatchup.userB === "bye" && (
                <span className={`${styles.resultBadge} ${styles.resultWin}`}>BYE WIN</span>
              )}
            </div>
          </div>

          {/* Draft Trace */}
          {userResult && userResult.draftOrder.length > 0 && (
            <div className={styles.draftTrace}>
              <button
                className={styles.draftTraceToggle}
                onClick={() => setShowDraftTrace(!showDraftTrace)}
              >
                {showDraftTrace ? "Hide" : "Show"} Draft Details
              </button>
              {showDraftTrace && (
                <div className={styles.draftTraceList}>
                  {userResult.draftOrder.map((pick, i) => (
                    <div key={i} className={styles.draftTracePick}>
                      <span className={styles.draftTracePickNum}>Pick {pick.pick}</span>
                      <span className={styles.draftTracePickUser}>
                        {pick.user === userMatchup.userA
                          ? userMatchup.usernameA
                          : userMatchup.usernameB}
                      </span>
                      <span className={styles.draftTracePickTeam}>
                        {pick.team} - {getTeamName(pick.team)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* H2H Stats */}
      {user && (() => {
        const h2hYear = (user as any).h2h?.[currentWeek?.year || ""];
        if (!h2hYear) return null;
        return (
          <div className={styles.statsGrid}>
            <div className={`glass ${styles.statCard}`}>
              <p className={styles.statLabel}>H2H Wins</p>
              <p className={`${styles.statValue} ${styles.statValueAccent}`}>{h2hYear.totalWins || 0}</p>
            </div>
            <div className={`glass ${styles.statCard}`}>
              <p className={styles.statLabel}>H2H Losses</p>
              <p className={styles.statValue}>{h2hYear.totalLosses || 0}</p>
            </div>
            <div className={`glass ${styles.statCard}`}>
              <p className={styles.statLabel}>H2H Ties</p>
              <p className={styles.statValue}>{h2hYear.totalTies || 0}</p>
            </div>
            <div className={`glass ${styles.statCard}`}>
              <p className={styles.statLabel}>Bonus Points</p>
              <p className={`${styles.statValue} ${styles.statValueAccent}`}>+{h2hYear.totalBonusPoints || 0}</p>
            </div>
          </div>
        );
      })()}

      {/* All Matchups */}
      {currentWeek && currentWeek.matchups.length > 0 && (
        <div className={`glass ${styles.matchupsSection}`}>
          <h3 className={styles.sectionTitle}>All Matchups</h3>
          <table className="data-table">
            <thead>
              <tr>
                <th>Player A</th>
                <th style={{ textAlign: "center" }}>Score</th>
                <th style={{ textAlign: "center" }}>vs</th>
                <th style={{ textAlign: "center" }}>Score</th>
                <th>Player B</th>
                <th style={{ textAlign: "center" }}>Result</th>
              </tr>
            </thead>
            <tbody>
              {currentWeek.matchups.map((m) => {
                const result = results.get(m.id);
                return (
                  <tr key={m.id}>
                    <td style={{ fontWeight: m.userA === user.uid ? "bold" : "normal", color: m.userA === user.uid ? "var(--accent)" : "white" }}>
                      {m.usernameA}
                    </td>
                    <td style={{ textAlign: "center", color: "var(--accent)", fontWeight: "bold" }}>
                      {result?.userAScore !== null && result?.userAScore !== undefined ? result.userAScore.toFixed(1) : "-"}
                    </td>
                    <td style={{ textAlign: "center", color: "var(--text-muted)" }}>vs</td>
                    <td style={{ textAlign: "center", color: "var(--accent)", fontWeight: "bold" }}>
                      {m.userB === "bye" ? "-" : (result?.userBScore !== null && result?.userBScore !== undefined ? result.userBScore.toFixed(1) : "-")}
                    </td>
                    <td style={{ fontWeight: m.userB === user.uid ? "bold" : "normal", color: m.userB === user.uid ? "var(--accent)" : "white" }}>
                      {m.usernameB}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      {result?.winner ? (
                        result.winner === "tie" ? (
                          <span className={`${styles.resultBadge} ${styles.resultTie}`}>Tie</span>
                        ) : (
                          <span className={`${styles.resultBadge} ${styles.resultWin}`}>
                            {result.winner === m.userA ? m.usernameA : m.usernameB}
                          </span>
                        )
                      ) : (
                        <span className={`${styles.resultBadge} ${styles.resultPending}`}>Pending</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Events Grid */}
      {currentWeek && currentWeek.events.length > 0 && (
        <div>
          <h3 style={{ fontSize: "1.1rem", color: "var(--text-heading)", marginBottom: "1rem" }}>
            Events This Week
          </h3>
          <div className={styles.eventsGrid}>
            {currentWeek.events.map((evt) => (
              <div key={evt.key} className={`glass ${styles.eventCard}`}>
                <span className={styles.eventName}>{evt.name}</span>
                <span className={styles.eventDates}>
                  {evt.startDate} — {evt.endDate}
                </span>
                <div className={styles.eventMeta}>
                  <span className={styles.eventTeamCount}>{evt.teamCount} teams</span>
                  {evt.webcastUrl && (
                    <a
                      href={evt.webcastUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.eventStreamLink}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="5 3 19 12 5 21 5 3" />
                      </svg>
                      Watch
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* H2H Standings */}
      {standings.length > 0 && (
        <div className={`glass ${styles.standingsSection}`}>
          <h3 className={styles.sectionTitle}>H2H Standings</h3>
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Player</th>
                <th style={{ textAlign: "center" }}>W</th>
                <th style={{ textAlign: "center" }}>L</th>
                <th style={{ textAlign: "center" }}>T</th>
                <th style={{ textAlign: "right" }}>Bonus Pts</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((s, idx) => (
                <tr key={s.uid}>
                  <td style={{ fontWeight: "bold", color: "var(--text-muted)" }}>{idx + 1}</td>
                  <td style={{ fontWeight: s.uid === user.uid ? "bold" : "normal", color: s.uid === user.uid ? "var(--accent)" : "white" }}>
                    {s.username}
                    {s.uid === user.uid && " (You)"}
                  </td>
                  <td style={{ textAlign: "center", color: "var(--success)" }}>{s.wins}</td>
                  <td style={{ textAlign: "center", color: "var(--error)" }}>{s.losses}</td>
                  <td style={{ textAlign: "center", color: "var(--text-muted)" }}>{s.ties}</td>
                  <td style={{ textAlign: "right", color: "var(--accent)", fontWeight: "bold" }}>+{s.bonus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
