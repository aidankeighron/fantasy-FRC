"use client";

import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { db, functions } from "@/lib/firebase";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { useH2HTimers, formatCountdown, type H2HWeekTimestamps } from "@/lib/useH2HTimers";
import { H2H_CONFIG } from "@/lib/h2hConfig";
import styles from "./h2hDraft.module.css";

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

interface TeamRow {
  number: string;
  name: string;
  score: number;
  eventName: string;
  eventKey: string;
  webcastUrl: string;
}

type SortKey = "number" | "name" | "score" | "eventName";

interface SortConfig {
  key: SortKey;
  direction: "asc" | "desc";
}

export default function H2HDraftPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const toast = useToast();

  const [weekId, setWeekId] = useState<string>("");
  const [weekData, setWeekData] = useState<WeekData | null>(null);
  const [teamRows, setTeamRows] = useState<TeamRow[]>([]);
  const [preferences, setPreferences] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: "score", direction: "desc" });
  const [eventFilter, setEventFilter] = useState<string>("all");

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(handler);
  }, [search]);

  // Fetch the current drafting week
  useEffect(() => {
    const fetchDraftWeek = async () => {
      try {
        const weeksSnap = await getDocs(collection(db, "h2h_weeks"));
        let bestId = "";
        let bestData: WeekData | null = null;

        weeksSnap.forEach((d) => {
          const data = d.data() as WeekData;
          if (data.status === "drafting") {
            if (!bestData || data.weekNumber > bestData.weekNumber) {
              bestId = d.id;
              bestData = data;
            }
          }
        });

        if (!bestData || !bestId) {
          setDataLoading(false);
          return;
        }

        const draftingWeek = { id: bestId, data: bestData as WeekData };

        setWeekId(draftingWeek.id);
        setWeekData(draftingWeek.data);

        // Build team rows from events
        const teamMap = new Map<string, TeamRow>();
        const year = draftingWeek.data.year;

        // First, build event lookup
        for (const evt of draftingWeek.data.events) {
          for (const teamNum of evt.teams) {
            if (!teamMap.has(teamNum)) {
              teamMap.set(teamNum, {
                number: teamNum,
                name: "",
                score: 0,
                eventName: evt.name,
                eventKey: evt.key,
                webcastUrl: evt.webcastUrl || "",
              });
            }
          }
        }

        // Fetch team details in chunks
        const teamNumbers = Array.from(teamMap.keys());
        for (let i = 0; i < teamNumbers.length; i += 30) {
          const chunk = teamNumbers.slice(i, i + 30);
          const docs = await Promise.all(
            chunk.map((t) => getDoc(doc(db, "teams", t)))
          );
          for (const d of docs) {
            if (d.exists()) {
              const data = d.data();
              const existing = teamMap.get(d.id);
              if (existing) {
                existing.name = data.name || "";
                existing.score = data.stats?.[year]?.score || 0;
              }
            }
          }
        }

        setTeamRows(Array.from(teamMap.values()));

        // Load existing picks
        if (user) {
          const pickSnap = await getDoc(
            doc(db, "h2h_weeks", draftingWeek.id, "picks", user.uid)
          );
          if (pickSnap.exists()) {
            setPreferences(pickSnap.data().preferences || []);
          }
        }
      } catch (e) {
        console.error("Failed to fetch draft week:", e);
      } finally {
        setDataLoading(false);
      }
    };

    fetchDraftWeek();
  }, [user]);

  const timer = useH2HTimers(weekData as H2HWeekTimestamps | null);

  // User's matchup info
  const userMatchup = useMemo(() => {
    if (!user || !weekData) return null;
    return weekData.matchups.find((m) => m.userA === user.uid || m.userB === user.uid) || null;
  }, [user, weekData]);

  const opponentName = useMemo(() => {
    if (!userMatchup || !user) return null;
    if (userMatchup.userB === "bye") return "BYE";
    return userMatchup.userA === user.uid ? userMatchup.usernameB : userMatchup.usernameA;
  }, [userMatchup, user]);

  // Team lookup map
  const teamLookup = useMemo(() => {
    const map = new Map<string, TeamRow>();
    teamRows.forEach((t) => map.set(t.number, t));
    return map;
  }, [teamRows]);

  // Event list for filter
  const eventList = useMemo(() => {
    if (!weekData) return [];
    return weekData.events.map((e) => ({ key: e.key, name: e.name }));
  }, [weekData]);

  // Picked team objects
  const pickedTeams = useMemo(() => {
    return preferences.map((num) => teamLookup.get(num)).filter((t): t is TeamRow => !!t);
  }, [preferences, teamLookup]);

  // Available teams (not yet picked)
  const pickedSet = useMemo(() => new Set(preferences), [preferences]);

  // Filtered + sorted teams
  const filteredTeams = useMemo(() => {
    let result = teamRows.filter((t) => !pickedSet.has(t.number));

    if (eventFilter !== "all") {
      result = result.filter((t) => t.eventKey === eventFilter);
    }

    if (debouncedSearch) {
      const isNumeric = !isNaN(Number(debouncedSearch));
      result = result.filter((t) => {
        if (isNumeric) return t.number.includes(debouncedSearch);
        return t.name.toLowerCase().includes(debouncedSearch.toLowerCase());
      });
    }

    result.sort((a, b) => {
      let aVal: string | number = a[sortConfig.key];
      let bVal: string | number = b[sortConfig.key];
      if (sortConfig.key === "number") {
        aVal = Number(aVal) || 0;
        bVal = Number(bVal) || 0;
      }
      if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });

    return result;
  }, [teamRows, pickedSet, eventFilter, debouncedSearch, sortConfig]);

  const handleSort = (key: SortKey): void => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "desc" ? "asc" : "desc",
    }));
  };

  const getSortIndicator = (key: SortKey): string => {
    if (sortConfig.key !== key) return "";
    return sortConfig.direction === "asc" ? " \u2191" : " \u2193";
  };

  const handlePick = useCallback(
    (teamNumber: string): void => {
      if (preferences.length >= H2H_CONFIG.PICKS_PER_USER) return;
      setPreferences((prev) => [...prev, teamNumber]);
    },
    [preferences]
  );

  const handleRemove = useCallback((teamNumber: string): void => {
    setPreferences((prev) => prev.filter((n) => n !== teamNumber));
  }, []);

  const handleMoveUp = useCallback((index: number): void => {
    if (index <= 0) return;
    setPreferences((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  }, []);

  const handleMoveDown = useCallback((index: number): void => {
    setPreferences((prev) => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
  }, []);

  const handleConfirm = async (): Promise<void> => {
    if (!user || !weekId) return;
    if (preferences.length !== H2H_CONFIG.PICKS_PER_USER) {
      toast.error(`You must pick exactly ${H2H_CONFIG.PICKS_PER_USER} teams.`);
      return;
    }

    setSaving(true);
    try {
      const submitPicks = httpsCallable(functions, "submitH2HPicks");
      await submitPicks({ weekId, preferences });
      toast.success("Your H2H picks have been submitted!");
      router.push("/h2h");
    } catch (error: any) {
      console.error("Failed to submit H2H picks:", error);
      toast.error(error?.message || "Failed to submit picks. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // Virtual table
  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: filteredTeams.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48,
    overscan: 10,
  });

  const isFull = preferences.length >= H2H_CONFIG.PICKS_PER_USER;

  if (authLoading || dataLoading) {
    return (
      <div className="flex-center" style={{ minHeight: "60vh" }}>
        Loading H2H Draft...
      </div>
    );
  }

  if (!user) return null;

  if (!weekData) {
    return (
      <div className="flex-center" style={{ minHeight: "60vh" }}>
        <div className="glass-panel" style={{ padding: "2rem", textAlign: "center", maxWidth: "500px" }}>
          <h2 style={{ color: "var(--text-heading)", marginBottom: "0.5rem" }}>No Active Draft</h2>
          <p style={{ color: "var(--text-muted)" }}>
            There is no H2H draft currently open. Check back when a new competition week begins.
          </p>
          <button className="btn-secondary" style={{ marginTop: "1rem" }} onClick={() => router.push("/h2h")}>
            &larr; Back to H2H
          </button>
        </div>
      </div>
    );
  }

  if (!userMatchup) {
    return (
      <div className="flex-center" style={{ minHeight: "60vh" }}>
        <div className="glass-panel" style={{ padding: "2rem", textAlign: "center", maxWidth: "500px" }}>
          <h2 style={{ color: "var(--text-heading)", marginBottom: "0.5rem" }}>No Matchup Assigned</h2>
          <p style={{ color: "var(--text-muted)" }}>
            You don&apos;t have a matchup this week. Make sure you have a main season team drafted first.
          </p>
          <button className="btn-secondary" style={{ marginTop: "1rem" }} onClick={() => router.push("/h2h")}>
            &larr; Back to H2H
          </button>
        </div>
      </div>
    );
  }

  if (userMatchup.userB === "bye") {
    return (
      <div className="flex-center" style={{ minHeight: "60vh" }}>
        <div className="glass-panel" style={{ padding: "2rem", textAlign: "center", maxWidth: "500px" }}>
          <h2 style={{ color: "var(--accent)", marginBottom: "0.5rem" }}>BYE Week</h2>
          <p style={{ color: "var(--text-muted)" }}>
            You have a bye this week and automatically receive +{H2H_CONFIG.WIN_POINTS} points. No draft needed!
          </p>
          <button className="btn-secondary" style={{ marginTop: "1rem" }} onClick={() => router.push("/h2h")}>
            &larr; Back to H2H
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <button className={styles.backLink} onClick={() => router.push("/h2h")}>
            &larr; Back to Head-to-Head
          </button>
          <h1>H2H Draft &mdash; Week {weekData.weekNumber}</h1>
        </div>
        <span className={`${styles.slotCounter} ${isFull ? styles.slotCounterFull : ""}`}>
          {preferences.length} / {H2H_CONFIG.PICKS_PER_USER} Picks
        </span>
      </div>

      {/* Timer */}
      {timer && timer.phase === "drafting" && (
        <div className={`glass ${styles.timerBar}`}>
          <div className={styles.phaseDot} />
          <span className={styles.timerPhase}>{timer.label}</span>
          <span className={styles.timerCountdown}>{formatCountdown(timer.remaining)}</span>
        </div>
      )}

      {/* Opponent bar */}
      {opponentName && (
        <div className={`glass ${styles.opponentBar}`}>
          <span className={styles.opponentLabel}>Your opponent:</span>
          <span className={styles.opponentName}>{opponentName}</span>
        </div>
      )}

      {/* Instructions */}
      <div className={`glass ${styles.instructions}`}>
        <h3>
          {H2H_CONFIG.LABEL}
          <span className={styles.slotCounter}>{H2H_CONFIG.PICKS_PER_USER} picks</span>
        </h3>
        <ul className={styles.rulesList}>
          <li>{H2H_CONFIG.DESCRIPTION}</li>
          <li>Pick {H2H_CONFIG.PICKS_PER_USER} teams from this week&apos;s events, ordered by preference (1 = most wanted).</li>
          <li>An alternating draft will assign {H2H_CONFIG.TEAMS_PER_USER} teams to each player after the deadline.</li>
          <li>The player whose {H2H_CONFIG.TEAMS_PER_USER} teams score more points wins +{H2H_CONFIG.WIN_POINTS} bonus points.</li>
        </ul>
      </div>

      {/* Main grid: preferences + available teams */}
      <div className={styles.mainGrid}>
        {/* Left: Preference list */}
        <div className={`glass ${styles.prefsPanel}`}>
          <div className={styles.prefsTitle}>
            <span>Your Preferences</span>
            <span className={`${styles.slotCounter} ${isFull ? styles.slotCounterFull : ""}`}>
              {preferences.length} / {H2H_CONFIG.PICKS_PER_USER}
            </span>
          </div>
          <div className={styles.prefSlots}>
            {Array.from({ length: H2H_CONFIG.PICKS_PER_USER }).map((_, i) => {
              const team = pickedTeams[i];
              return (
                <div key={i} className={styles.prefSlot}>
                  <span className={styles.prefSlotNumber}>{i + 1}</span>
                  {team ? (
                    <>
                      <div className={styles.prefSlotTeam}>
                        <span className={styles.prefSlotTeamNum}>{team.number}</span>
                        <span className={styles.prefSlotTeamName}>{team.name}</span>
                      </div>
                      <span className={styles.prefSlotEvent}>{team.eventName}</span>
                      <div className={styles.moveButtons}>
                        <button className={styles.moveBtn} onClick={() => handleMoveUp(i)} disabled={i === 0}>
                          &uarr;
                        </button>
                        <button
                          className={styles.moveBtn}
                          onClick={() => handleMoveDown(i)}
                          disabled={i >= preferences.length - 1}
                        >
                          &darr;
                        </button>
                      </div>
                      <button className={styles.removeButton} onClick={() => handleRemove(team.number)}>
                        &times;
                      </button>
                    </>
                  ) : (
                    <span className={styles.prefSlotEmpty}>Empty</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Available teams table */}
        <div className={`glass ${styles.tablePanel}`}>
          <div className={styles.tableHeader}>
            <h3>Available Teams</h3>
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={`input-field ${styles.searchInput}`}
            />
          </div>

          {/* Event filters */}
          <div className={styles.eventFilters}>
            <button
              className={`${styles.eventFilter} ${eventFilter === "all" ? styles.eventFilterActive : ""}`}
              onClick={() => setEventFilter("all")}
            >
              All Events
            </button>
            {eventList.map((evt) => (
              <button
                key={evt.key}
                className={`${styles.eventFilter} ${eventFilter === evt.key ? styles.eventFilterActive : ""}`}
                onClick={() => setEventFilter(evt.key)}
              >
                {evt.name.length > 25 ? evt.name.substring(0, 25) + "..." : evt.name}
              </button>
            ))}
          </div>

          <div className={styles.tableBody}>
            <div ref={parentRef} className="hidden-scrollbar" style={{ height: "100%", overflow: "auto" }}>
              <table className="data-table data-table-virtual" style={{ width: "100%", position: "relative" }}>
                <thead style={{ position: "sticky", top: 0, background: "var(--surface)", zIndex: 10 }}>
                  <tr>
                    <th className="col-narrow" onClick={() => handleSort("number")}>
                      Team{getSortIndicator("number")}
                    </th>
                    <th className="col-wide" onClick={() => handleSort("name")}>
                      Name{getSortIndicator("name")}
                    </th>
                    <th onClick={() => handleSort("eventName")}>
                      Event{getSortIndicator("eventName")}
                    </th>
                    <th style={{ textAlign: "center", width: "40px" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "middle" }}>
                        <polygon points="5 3 19 12 5 21 5 3" />
                      </svg>
                    </th>
                    <th onClick={() => handleSort("score")} style={{ textAlign: "right" }}>
                      Score{getSortIndicator("score")}
                    </th>
                    <th style={{ textAlign: "right", width: "80px" }}>Action</th>
                  </tr>
                </thead>
                <tbody style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: "relative" }}>
                  {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const team = filteredTeams[virtualRow.index];
                    return (
                      <tr
                        key={team.number}
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          width: "100%",
                          height: `${virtualRow.size}px`,
                          transform: `translateY(${virtualRow.start}px)`,
                          display: "flex",
                          alignItems: "center",
                        }}
                      >
                        <td className="col-narrow" style={{ fontWeight: "bold" }}>
                          {team.number}
                        </td>
                        <td
                          className="col-wide"
                          style={{
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            maxWidth: "200px",
                          }}
                        >
                          {team.name}
                        </td>
                        <td className="text-muted" style={{ fontSize: "0.8rem" }}>
                          {team.eventName.length > 20
                            ? team.eventName.substring(0, 20) + "..."
                            : team.eventName}
                        </td>
                        <td style={{ textAlign: "center" }}>
                          {team.webcastUrl ? (
                            <a
                              href={team.webcastUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={styles.streamIcon}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polygon points="5 3 19 12 5 21 5 3" />
                              </svg>
                            </a>
                          ) : (
                            <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>-</span>
                          )}
                        </td>
                        <td style={{ textAlign: "right", color: "var(--accent)", fontWeight: "bold" }}>
                          {team.score.toFixed(1)}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <button
                            className={`btn-primary ${styles.pickButton}`}
                            disabled={isFull}
                            onClick={() => handlePick(team.number)}
                          >
                            Pick
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredTeams.length === 0 && (
                <div className="flex-center text-muted" style={{ height: "150px" }}>
                  No teams available matching your criteria.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Confirm */}
      <div className={styles.confirmSection}>
        <button
          className={`btn-primary ${styles.confirmButton}`}
          disabled={!isFull || saving}
          onClick={handleConfirm}
        >
          {saving ? "Submitting..." : "Confirm Picks"}
        </button>
        {!isFull && (
          <p className={styles.confirmHint}>
            Pick {H2H_CONFIG.PICKS_PER_USER - preferences.length} more team
            {H2H_CONFIG.PICKS_PER_USER - preferences.length !== 1 ? "s" : ""} to confirm.
          </p>
        )}
      </div>
    </div>
  );
}
