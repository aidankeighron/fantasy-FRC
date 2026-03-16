"use client";

import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc, onSnapshot } from "firebase/firestore";
import { getCachedRawTeams } from "@/lib/teamsCache";
import { DRAFT_CONFIG } from "@/lib/draftConfig";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import styles from "./draft.module.css";

interface Team {
  number: string;
  name: string;
  state: string;
  country: string;
  opr: number;
  ccwm: number;
  score: number;
  winPercent: number;
}

type SortKey = keyof Team;

interface SortConfig {
  key: SortKey;
  direction: "asc" | "desc";
}

function isUSTeam(team: Team): boolean {
  return team.country === "USA" || team.country === "United States";
}

function getRegionLabel(team: Team): string {
  return isUSTeam(team) ? team.state : team.country;
}

type TeamPickerColumnProps = {
  label: string;
  rules: string[];
  pickedTeams: Team[];
  availableTeams: Team[];
  maxSlots: number;
  onPick: (teamNumber: string) => void;
  onRemove: (teamNumber: string) => void;
  isLocked: boolean;
};

function TeamPickerColumn({label, rules, pickedTeams, availableTeams, maxSlots, onPick, onRemove, isLocked}: TeamPickerColumnProps) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    key: "score",
    direction: "desc",
  });

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(handler);
  }, [search]);

  const isFull = pickedTeams.length >= maxSlots;

  const filteredTeams = useMemo(() => {
    let result = [...availableTeams];

    if (debouncedSearch) {
      const isNumericSearch = !isNaN(Number(debouncedSearch));
      result = result.filter((team) => {
        if (isNumericSearch) {
          return team.number.includes(debouncedSearch);
        }
        return team.name.toLowerCase().includes(debouncedSearch.toLowerCase());
      });
    }

    result.sort((a, b) => {
      let aValue: string | number = a[sortConfig.key];
      let bValue: string | number = b[sortConfig.key];

      if (sortConfig.key === "number") {
        aValue = Number(aValue) || 0;
        bValue = Number(bValue) || 0;
      }

      if (aValue < bValue) {
        return sortConfig.direction === "asc" ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortConfig.direction === "asc" ? 1 : -1;
      }
      return 0;
    });

    return result;
  }, [availableTeams, debouncedSearch, sortConfig]);

  const handleSort = (key: SortKey): void => {
    setSortConfig((previous) => ({
      key,
      direction: previous.key === key && previous.direction === "desc" ? "asc" : "desc",
    }));
  };

  const getSortIndicator = (key: SortKey): string => {
    if (sortConfig.key !== key) {
      return "";
    }
    return sortConfig.direction === "asc" ? " ↑" : " ↓";
  };

  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: filteredTeams.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48,
    overscan: 10,
  });

  return (
    <div className={styles.column}>
      <div className={`glass ${styles.rulesCard}`}>
        <h3>
          {label}
          <span className={`${styles.slotCounter} ${isFull ? styles.slotCounterFull : ""}`}>
            {pickedTeams.length} / {maxSlots}
          </span>
        </h3>
        <ul className={styles.rulesList}>
          {rules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      </div>

      <div className={`glass ${styles.pickedSection}`}>
        <h4>Your Picks</h4>
        {pickedTeams.length === 0 ? (
          <p className={styles.emptyPicks}>No teams picked yet.</p>
        ) : (
          <div className={styles.pickedList}>
            {pickedTeams.map((team) => (
              <div key={team.number} className={styles.pickedTeam}>
                <div className={styles.pickedTeamInfo}>
                  <span className={styles.pickedTeamNumber}>{team.number}</span>
                  <span className={styles.pickedTeamRegion}>{getRegionLabel(team)}</span>
                </div>
                {!isLocked && (
                  <button className={styles.removeButton} onClick={() => onRemove(team.number)}>
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={`glass ${styles.tableContainer}`}>
        <div className={styles.tableHeader}>
          <h3>Available Teams</h3>
          <input type="text" placeholder="Search..." value={search}
            onChange={(event) => setSearch(event.target.value)} className={`input-field ${styles.searchInput}`} />
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
                  <th onClick={() => handleSort("state")}>
                    Region{getSortIndicator("state")}
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
                      <td className="col-narrow" style={{ fontWeight: "bold" }}>{team.number}</td>
                      <td className="col-wide" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "200px" }}>
                        {team.name}
                      </td>
                      <td className="text-muted">{getRegionLabel(team)}</td>
                      <td style={{ textAlign: "right", color: "var(--accent)", fontWeight: "bold" }}>
                        {team.score.toFixed(1)}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <button
                          className={`btn-primary ${styles.draftButton}`}
                          disabled={isFull || isLocked}
                          onClick={() => onPick(team.number)}
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
  );
}

export default function DraftPage() {
  const { user, loading: authLoading, refreshUser } = useAuth();
  const router = useRouter();
  const toast = useToast();

  const [allTeams, setAllTeams] = useState<Map<string, Team>>(new Map());
  const [standardPicks, setStandardPicks] = useState<string[]>([]);
  const [wildcardPicks, setWildcardPicks] = useState<string[]>([]);
  const [pickingLocked, setPickingLocked] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, "draft_state", "global"), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setPickingLocked(data.team_picking_locked === true);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const fetchTeams = async () => {
      try {
        const dsRef = doc(db, "draft_state", "global");
        const dsSnap = await getDoc(dsRef);
        const activeYearStr = dsSnap.exists() ? dsSnap.data().active_year : new Date().getFullYear().toString();
        const previousYear = (parseInt(activeYearStr) - 1).toString();

        const rawTeams = await getCachedRawTeams(db, activeYearStr);
        const teamsMap = new Map<string, Team>();

        rawTeams.forEach((teamData) => {
          const activeYears = teamData.activeYears || [];
          if (!activeYears.includes(activeYearStr)) {
            return;
          }

          const previousStats = teamData.stats?.[previousYear] || {};
          teamsMap.set(teamData.id, {
            number: teamData.id,
            name: teamData.name || "",
            state: teamData.state || "",
            country: teamData.country || "",
            opr: previousStats.opr || 0,
            ccwm: previousStats.ccwm || 0,
            score: previousStats.score || 0,
            winPercent: previousStats.winRate || 0,
          });
        });

        setAllTeams(teamsMap);
      }
      catch (error) {
        console.error("Failed to fetch teams:", error);
      }
      finally {
        setDataLoading(false);
      }
    };

    fetchTeams();
  }, []);

  useEffect(() => {
    if (!user || !user.teams || user.teams.length === 0) {
      return;
    }

    const standard: string[] = [];
    const wildcard: string[] = [];

    user.teams.forEach((teamNumber) => {
      const teamNum = parseInt(teamNumber);
      if (teamNum > DRAFT_CONFIG.WILDCARD_MIN_TEAM_NUMBER) {
        wildcard.push(teamNumber);
      }
      else {
        standard.push(teamNumber);
      }
    });

    setStandardPicks(standard);
    setWildcardPicks(wildcard);
  }, [user]);

  const standardPickedTeams = useMemo(() => {
    return standardPicks.map((number) => allTeams.get(number)).filter((team): team is Team => !!team);
  }, [standardPicks, allTeams]);

  const wildcardPickedTeams = useMemo(() => {
    return wildcardPicks.map((number) => allTeams.get(number)).filter((team): team is Team => !!team);
  }, [wildcardPicks, allTeams]);

  const availableStandardTeams = useMemo(() => {
    const result: Team[] = [];
    const pickedSet = new Set([...standardPicks, ...wildcardPicks]);

    allTeams.forEach((team) => {
      if (pickedSet.has(team.number)) {
        return;
      }

      const teamNumber = parseInt(team.number);
      if (teamNumber > DRAFT_CONFIG.WILDCARD_MIN_TEAM_NUMBER) {
        return;
      }

      if (isUSTeam(team) && team.state) {
        const hasSameState = standardPickedTeams.some(
          (picked) => isUSTeam(picked) && picked.state === team.state
        );
        if (hasSameState) {
          return;
        }
      }
      else if (team.country) {
        const hasSameCountry = standardPickedTeams.some(
          (picked) => !isUSTeam(picked) && picked.country === team.country
        );
        if (hasSameCountry) {
          return;
        }
      }

      result.push(team);
    });

    return result;
  }, [allTeams, standardPicks, wildcardPicks, standardPickedTeams]);

  const availableWildcardTeams = useMemo(() => {
    const result: Team[] = [];
    const pickedSet = new Set([...standardPicks, ...wildcardPicks]);

    allTeams.forEach((team) => {
      if (pickedSet.has(team.number)) {
        return;
      }

      const teamNumber = parseInt(team.number);
      if (teamNumber <= DRAFT_CONFIG.WILDCARD_MIN_TEAM_NUMBER) {
        return;
      }

      result.push(team);
    });

    return result;
  }, [allTeams, standardPicks, wildcardPicks]);

  const handleStandardPick = useCallback((teamNumber: string): void => {
    if (standardPicks.length >= DRAFT_CONFIG.STANDARD.count) {
      return;
    }
    setStandardPicks((previous) => [...previous, teamNumber]);
  }, [standardPicks]);

  const handleWildcardPick = useCallback((teamNumber: string): void => {
    if (wildcardPicks.length >= DRAFT_CONFIG.WILDCARD.count) {
      return;
    }
    setWildcardPicks((previous) => [...previous, teamNumber]);
  }, [wildcardPicks]);

  const handleStandardRemove = useCallback((teamNumber: string): void => {
    setStandardPicks((previous) => previous.filter((number) => number !== teamNumber));
  }, []);

  const handleWildcardRemove = useCallback((teamNumber: string): void => {
    setWildcardPicks((previous) => previous.filter((number) => number !== teamNumber));
  }, []);

  const handleConfirm = async (): Promise<void> => {
    if (!user) {
      return;
    }

    const allPicks = [...standardPicks, ...wildcardPicks];
    if (allPicks.length !== DRAFT_CONFIG.TOTAL_TEAMS) {
      toast.error(`You must pick exactly ${DRAFT_CONFIG.TOTAL_TEAMS} teams (${DRAFT_CONFIG.STANDARD.count} standard + ${DRAFT_CONFIG.WILDCARD.count} wildcard).`);
      return;
    }

    setSaving(true);
    try {
      const userRef = doc(db, "users", user.uid);
      await updateDoc(userRef, { teams: allPicks });
      await refreshUser();
      toast.success("Your team has been saved!");
      router.push("/team");
    }
    catch (error) {
      console.error("Failed to save team:", error);
      toast.error("Failed to save your team. Please try again.");
    }
    finally {
      setSaving(false);
    }
  };

  if (authLoading || dataLoading) {
    return (
      <div className="flex-center" style={{ minHeight: "60vh" }}>
        Loading Draft Data...
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (pickingLocked) {
    return (
      <div className="flex-center" style={{ minHeight: "60vh" }}>
        <div className={`glass-panel ${styles.lockedBanner}`}>
          <h2>Team Picking is Locked</h2>
          <p>
            An administrator has locked team picking. You cannot create or edit your team at this time.
            Check back later when the season opens.
          </p>
          <button className="btn-secondary" onClick={() => router.push("/team")}>
            ← Back to Team Management
          </button>
        </div>
      </div>
    );
  }

  const totalPicked = standardPicks.length + wildcardPicks.length;
  const isComplete = totalPicked === DRAFT_CONFIG.TOTAL_TEAMS;

  return (
    <div className={styles.draftContainer}>
      <div className={styles.header}>
        <div>
          <button className={styles.backLink} onClick={() => router.push("/team")}>
            ← Back to Team Management
          </button>
          <h1>Draft Your Team</h1>
        </div>
        <span className={`${styles.slotCounter} ${isComplete ? styles.slotCounterFull : ""}`}>
          {totalPicked} / {DRAFT_CONFIG.TOTAL_TEAMS} Total
        </span>
      </div>

      <div className={styles.columnsGrid}>
        <TeamPickerColumn
          label={DRAFT_CONFIG.STANDARD.label}
          rules={DRAFT_CONFIG.STANDARD.rules}
          pickedTeams={standardPickedTeams}
          availableTeams={availableStandardTeams}
          maxSlots={DRAFT_CONFIG.STANDARD.count}
          onPick={handleStandardPick}
          onRemove={handleStandardRemove}
          isLocked={pickingLocked}
        />

        <TeamPickerColumn
          label={DRAFT_CONFIG.WILDCARD.label}
          rules={DRAFT_CONFIG.WILDCARD.rules}
          pickedTeams={wildcardPickedTeams}
          availableTeams={availableWildcardTeams}
          maxSlots={DRAFT_CONFIG.WILDCARD.count}
          onPick={handleWildcardPick}
          onRemove={handleWildcardRemove}
          isLocked={pickingLocked}
        />
      </div>

      <div className={styles.confirmSection}>
        <button
          className={`btn-primary ${styles.confirmButton}`}
          disabled={!isComplete || saving}
          onClick={handleConfirm}
        >
          {saving ? "Saving..." : "Confirm Team"}
        </button>
        {!isComplete && (
          <p className={styles.confirmHint}>
            Pick {DRAFT_CONFIG.STANDARD.count - standardPicks.length} more standard and{" "}
            {DRAFT_CONFIG.WILDCARD.count - wildcardPicks.length} more wildcard teams to confirm.
          </p>
        )}
      </div>
    </div>
  );
}
