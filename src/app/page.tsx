"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { collection, getDocs, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getCachedRawTeams } from "@/lib/teamsCache";
import { useVirtualizer } from "@tanstack/react-virtual";
import styles from "./page.module.css";

interface Team {
  number: string;
  name: string;
  state: string;
  country: string;
  opr: number;
  ccwm: number;
  score: number;
  winPercent: number;
  activeYears?: string[];
}

interface UserData {
  id: string;
  name: string;
  score: number;
  rank: number;
  teams: string[];
}

export default function Home() {
  const [showHero, setShowHero] = useState(true);
  const [teams, setTeams] = useState<Team[]>([]);
  const [users, setUsers] = useState<UserData[]>([]);
  const [teamSearch, setTeamSearch] = useState("");
  const [activeYear, setActiveYear] = useState<string>("");
  const [selectedYear, setSelectedYear] = useState<string>("");
  const [availableYears, setAvailableYears] = useState<string[]>([]);
  
  const [teamSortConfig, setTeamSortConfig] = useState<{ key: keyof Team; direction: "asc" | "desc" }>({
    key: "score",
    direction: "desc",
  });
  
  const [userSortConfig, setUserSortConfig] = useState<{ key: keyof UserData; direction: "asc" | "desc" }>({
    key: "rank",
    direction: "asc",
  });

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const heroHidden = localStorage.getItem("hideHero") === "true";
    if (heroHidden) setShowHero(false);
    
    const fetchData = async () => {
      try {
        const { doc, getDoc } = await import("firebase/firestore");
        const dsRef = doc(db, "draft_state", "global");
        const dsSnap = await getDoc(dsRef);
        const activeYearStr = dsSnap.exists() ? dsSnap.data().active_year : new Date().getFullYear().toString();
        setActiveYear(activeYearStr);
        
        const yearToFetch = selectedYear || activeYearStr;
        if (!selectedYear) {
          setSelectedYear(activeYearStr);
        }

        const usersSnapshot = await getDocs(query(collection(db, "users")));
        const usersData: UserData[] = usersSnapshot.docs.map(doc => {
          const data = doc.data();
          const seasonData = data.seasons?.[yearToFetch];
          
          return {
            id: doc.id,
            name: data.username || data.email?.split("@")[0] || "Unknown",
            score: (yearToFetch === activeYearStr) ? (data.score || 0) : (seasonData?.score || 0),
            rank: (yearToFetch === activeYearStr) ? (data.rank || 0) : (seasonData?.rank || 0),
            teams: (yearToFetch === activeYearStr) ? (data.teams || []) : (seasonData?.teams || []),
            seasons: data.seasons // Used to extract all years
          };
        });

        // Extract all years from all users
        const allYearsSet = new Set<string>();
        allYearsSet.add(activeYearStr);
        usersSnapshot.docs.forEach(doc => {
          const seasons = doc.data().seasons;
          if (seasons) {
            Object.keys(seasons).forEach(y => allYearsSet.add(y));
          }
        });
        setAvailableYears(Array.from(allYearsSet).sort((a, b) => b.localeCompare(a)));
        
        const rawTeams = await getCachedRawTeams(db, activeYearStr);
        const teamsData: Team[] = rawTeams
          .filter(tData => (tData.activeYears || []).includes(yearToFetch))
          .map(tData => {
            const yrStats = tData.stats?.[yearToFetch] || {};
            return {
              number: tData.id,
              name: tData.name || "",
              state: tData.state || "",
              country: tData.country || "",
              opr: yrStats.opr || 0,
              ccwm: yrStats.ccwm || 0,
              score: yrStats.score || 0,
              winPercent: yrStats.winRate || 0,
              activeYears: tData.activeYears || []
            };
          });
        
        setUsers(usersData);
        setTeams(teamsData);
      } 
      catch (error) {
        console.error("Error fetching data:", error);
      } 
      finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [selectedYear]);

  const hideHero = () => {
    setShowHero(false);
    localStorage.setItem("hideHero", "true");
  };

  // Sorting and Filtering logic
  const handleTeamSort = (key: keyof Team) => {
    let direction: "asc" | "desc" = "desc";
    if (teamSortConfig.key === key && teamSortConfig.direction === "desc") {
      direction = "asc";
    }
    setTeamSortConfig({ key, direction });
  };

  const handleUserSort = (key: keyof UserData) => {
    let direction: "asc" | "desc" = "asc";
    if (userSortConfig.key === key && userSortConfig.direction === "asc") {
      direction = "desc";
    }
    setUserSortConfig({ key, direction });
  };

  const sortedUsers = useMemo(() => {
    const sorted = [...users].sort((a, b) => {
      let aVal = a[userSortConfig.key];
      let bVal = b[userSortConfig.key];

      if (userSortConfig.key === "rank") {
        aVal = aVal === 0 ? 999999 : aVal;
        bVal = bVal === 0 ? 999999 : bVal;
      }

      if (aVal < bVal) return userSortConfig.direction === "asc" ? -1 : 1;
      if (aVal > bVal) return userSortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [users, userSortConfig]);

  const teamMap = useMemo(() => {
    const map: Record<string, Team> = {};
    teams.forEach((t) => {
      map[t.number] = t;
    });
    return map;
  }, [teams]);

  const filteredAndSortedTeams = useMemo(() => {
    let filtered = teams;
    if (teamSearch) {
      const isNumberSearch = !isNaN(Number(teamSearch));
      filtered = teams.filter((t) => {
        if (isNumberSearch) return t.number.includes(teamSearch);
        return t.name.toLowerCase().includes(teamSearch.toLowerCase());
      });
    }

    const sorted = filtered.sort((a, b) => {
      let aVal: any = a[teamSortConfig.key];
      let bVal: any = b[teamSortConfig.key];

      if (teamSortConfig.key === "number") {
        aVal = Number(aVal) || 0;
        bVal = Number(bVal) || 0;
      }

      if (aVal < bVal) return teamSortConfig.direction === "asc" ? -1 : 1;
      if (aVal > bVal) return teamSortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });
    
    return sorted;
  }, [teams, teamSearch, teamSortConfig]);

  // Virtualizer for Teams
  const parentRef = useRef<HTMLDivElement>(null);
  
  const rowVirtualizer = useVirtualizer({
    count: filteredAndSortedTeams.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 50,
    overscan: 10,
  });

  if (loading) {
    return (
      <div className={styles.container}>
        <div className="flex-center" style={{ height: "400px" }}>
          <p className="text-muted">Loading Data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Rules / Info Blurb */}
      {showHero && (
        <div className={`glass-panel ${styles.heroCard}`}>
          <button onClick={hideHero} className={styles.closeButton} aria-label="Hide info block">
            &times;
          </button>
          <div className={styles.heroContent}>
            <h1 className={styles.heroTitle}>Welcome to Fantasy FRC</h1>
            <p className={styles.heroSubtitle}>
              Draft your dream alliance. Compete with players worldwide. Our new drafting 
              system ensures a fair, asynchronous selection process. Score points based on your 
              teams&apos; actual performance in the FIRST Robotics Competition!
            </p>
          </div>
        </div>
      )}

      <div className={styles.grid}>
        {/* Users / Ranking Table */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>
              {selectedYear === activeYear ? "Current Rankings" : `${selectedYear} Rankings`}
            </h2>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span className="text-muted" style={{ fontSize: "0.875rem" }}>Year:</span>
              <select 
                value={selectedYear} 
                onChange={(e) => setSelectedYear(e.target.value)}
                className={styles.searchInput}
                style={{ width: "auto", padding: "4px 8px", cursor: "pointer" }}
              >
                {availableYears.map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
          </div>
          <div className={`glass ${styles.tableContainer}`}>
            <table className="data-table">
              <thead>
                <tr>
                   <th onClick={() => handleUserSort("rank")}>Rank {userSortConfig.key === 'rank' && (userSortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                   <th onClick={() => handleUserSort("name")}>Player {userSortConfig.key === 'name' && (userSortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                   <th onClick={() => handleUserSort("score")}>Score {userSortConfig.key === 'score' && (userSortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                   <th>Teams</th>
                 </tr>
               </thead>
               <tbody>
                 {sortedUsers.map((user) => (
                   <tr key={user.id} className={styles.userRow}>
                     <td>
                       <span className={`${styles.rankBadge} ${user.rank === 1 ? styles.rank1 : user.rank === 2 ? styles.rank2 : user.rank === 3 ? styles.rank3 : ""}`}>
                         {user.rank === 0 ? "-" : user.rank}
                       </span>
                     </td>
                     <td>{user.name}</td>
                     <td>{user.score.toFixed(2)}</td>
                     <td>
                       <div className={styles.teamBadgeList}>
                         {user.teams.map((tNum) => (
                           <span key={tNum} className={styles.teamBadge} title={teamMap[tNum]?.name || "Unknown Team"}>
                             {tNum}
                           </span>
                         ))}
                       </div>
                     </td>
                   </tr>
                 ))}
                 {sortedUsers.length === 0 && (
                   <tr>
                     <td colSpan={4} className="text-center text-muted" style={{ padding: "2rem" }}>
                       No players drafted yet.
                     </td>
                   </tr>
                 )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Teams Table */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>All Teams</h2>
            <input
              type="text"
              placeholder="Search team name or number..."
              className={styles.searchInput}
              value={teamSearch}
              onChange={(e) => setTeamSearch(e.target.value)}
            />
          </div>
          
          <div className={`glass ${styles.tableContainer} ${styles.virtualScroll}`} ref={parentRef}>
            <table className="data-table data-table-virtual" style={{ position: "relative" }}>
              <thead style={{ position: "sticky", top: 0, background: "var(--surface)", zIndex: 5, backdropFilter: "blur(4px)" }}>
                <tr>
                  <th className="col-narrow" onClick={() => handleTeamSort("number")}>Team {teamSortConfig.key === 'number' && (teamSortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                  <th className="col-wide" onClick={() => handleTeamSort("name")}>Name {teamSortConfig.key === 'name' && (teamSortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                  <th onClick={() => handleTeamSort("score")}>Score {teamSortConfig.key === 'score' && (teamSortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                  <th onClick={() => handleTeamSort("ccwm")}>CCWM {teamSortConfig.key === 'ccwm' && (teamSortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                  <th onClick={() => handleTeamSort("winPercent")}>Win % {teamSortConfig.key === 'winPercent' && (teamSortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                </tr>
              </thead>
              <tbody style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: "relative" }}>
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const team = filteredAndSortedTeams[virtualRow.index];
                  return (
                    <tr key={team.number} style={{position: "absolute", top: 0, left: 0, width: "100%",
                        height: `${virtualRow.size}px`, transform: `translateY(${virtualRow.start}px)`, display: "flex", alignItems: "center"}}>
                      <td className="col-narrow">{team.number}</td>
                      <td className="col-wide">{team.name}</td>
                      <td>{team.score.toFixed(2)}</td>
                      <td>{team.ccwm.toFixed(2)}</td>
                      <td>{(team.winPercent * 100).toFixed(1)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            
            {filteredAndSortedTeams.length === 0 && (
              <div className="text-center text-muted flex-center" style={{ height: "200px" }}>
                No teams found matching &quot;{teamSearch}&quot;.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
