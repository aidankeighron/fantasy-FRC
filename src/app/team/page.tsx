"use client";

import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, documentId, where, doc, getDoc } from "firebase/firestore";
import { getCachedRawTeams } from "@/lib/teamsCache";
import { H2H_CONFIG } from "@/lib/h2hConfig";
import { useRouter } from "next/navigation";

interface Team {
  number: string;
  name: string;
  opr: number;
  ccwm: number;
  score: number;
  winPercent: number;
}

export default function TeamManagementPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [teams, setTeams] = useState<Team[]>([]);
  const [userRank, setUserRank] = useState<number>(0);
  const [dataLoading, setDataLoading] = useState(true);
  const [pickingLocked, setPickingLocked] = useState(false);
  const [activeYear, setActiveYear] = useState<string>("");
  const [selectedYear, setSelectedYear] = useState<string>("");
  const [availableYears, setAvailableYears] = useState<string[]>([]);

  const [sortConfig, setSortConfig] = useState<{ key: keyof Team; direction: "asc" | "desc" }>({
    key: "score",
    direction: "desc",
  });

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;

    const fetchTeamData = async () => {
      try {
        // Fetch rank by getting all users and sorting
        const usersSnap = await getDocs(collection(db, "users"));
        const allUsers = usersSnap.docs.map(d => ({ id: d.id, score: d.data().score || 0 }));
        allUsers.sort((a, b) => b.score - a.score);
        const rankIndex = allUsers.findIndex(u => u.id === user.uid);
        setUserRank(rankIndex !== -1 ? rankIndex + 1 : 0);

        const dsRef = doc(db, "draft_state", "global");
        const dsSnap = await getDoc(dsRef);
        const activeYearStr = dsSnap.exists() ? dsSnap.data().active_year : new Date().getFullYear().toString();
        setActiveYear(activeYearStr);
        
        const yearToFetch = selectedYear || activeYearStr;
        if (!selectedYear) {
          setSelectedYear(activeYearStr);
        }

        if (dsSnap.exists() && dsSnap.data().team_picking_locked !== undefined) {
          setPickingLocked(dsSnap.data().team_picking_locked);
        }

        // Determine available years from user seasons or at least current year
        const years = Object.keys(user.seasons || {}).sort((a, b) => b.localeCompare(a));
        if (!years.includes(activeYearStr)) {
          years.unshift(activeYearStr);
        }
        setAvailableYears(Array.from(new Set(years)));

        // Get teams for the selected year
        const seasonData = user.seasons?.[yearToFetch];
        const teamIds = (yearToFetch === activeYearStr) ? (user.teams || []) : (seasonData?.teams || []);
        
        if (yearToFetch === activeYearStr) {
          const usersSnap = await getDocs(collection(db, "users"));
          const allUsers = usersSnap.docs.map(d => ({ id: d.id, score: d.data().score || 0 }));
          allUsers.sort((a, b) => b.score - a.score);
          const rankIndex = allUsers.findIndex(u => u.id === user.uid);
          setUserRank(rankIndex !== -1 ? rankIndex + 1 : 0);
        } 
        else {
          setUserRank(seasonData?.rank || 0);
        }

        if (teamIds.length > 0) {
          const rawTeams = await getCachedRawTeams(db);
          const userTeamsRaw = rawTeams.filter(t => teamIds.includes(t.id));
          
          const fetchedTeams: Team[] = userTeamsRaw.map(tData => {
            const yrStats = tData.stats?.[yearToFetch] || {};
            return {
              number: tData.id,
              name: tData.name || "",
              opr: yrStats.opr || 0,
              ccwm: yrStats.ccwm || 0,
              score: yrStats.score || 0,
              winPercent: yrStats.winRate || 0,
            };
          });
          
          setTeams(fetchedTeams);
        }
        else {
          setTeams([]);
        }
      } 
      catch (err) {
        console.error("Error fetching team data:", err);
      } 
      finally {
        setDataLoading(false);
      }
    };

    fetchTeamData();
  }, [user]);

  const handleSort = (key: keyof Team) => {
    let direction: "asc" | "desc" = "desc";
    if (sortConfig.key === key && sortConfig.direction === "desc") {
      direction = "asc";
    }
    setSortConfig({ key, direction });
  };

  const sortedTeams = useMemo(() => {
    const sorted = [...teams].sort((a, b) => {
      let aVal: any = a[sortConfig.key];
      let bVal: any = b[sortConfig.key];

      if (sortConfig.key === "number") {
        aVal = Number(aVal) || 0;
        bVal = Number(bVal) || 0;
      }

      if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [teams, sortConfig]);

  // Derived Stats
  const totalPoints = teams.reduce((acc, t) => acc + t.score, 0);
  const avgPoints = teams.length > 0 ? totalPoints / teams.length : 0;
  const avgWinPercent = teams.length > 0 ? (teams.reduce((acc, t) => acc + t.winPercent, 0) / teams.length) * 100 : 0;

  if (loading || dataLoading) {
    return <div className="flex-center" style={{ minHeight: "50vh" }}><p className="text-muted">Loading your team...</p></div>;
  }

  if (!user) return null;

  return (
    <div style={{ padding: "2rem 0", display: "flex", flexDirection: "column", gap: "2rem" }}>
      
      {/* Header & Stats Dashboard */}
      <div className="flex-between">
        <div>
          <h1 style={{ fontSize: "2rem", color: "white" }}>Team Management</h1>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "0.5rem" }}>
            <span style={{ color: "var(--text-muted)" }}>Season:</span>
            <select 
              value={selectedYear} 
              onChange={(e) => setSelectedYear(e.target.value)}
              className="glass"
              style={{ 
                padding: "6px 12px", 
                borderRadius: "8px", 
                background: "rgba(255,255,255,0.05)", 
                color: "white", 
                border: "1px solid var(--surface-border)",
                cursor: "pointer",
                outline: "none"
              }}
            >
              {availableYears.map(year => (
                <option key={year} value={year} style={{ background: "var(--surface)" }}>{year}</option>
              ))}
            </select>
          </div>
        </div>
        <button 
          className="btn-primary" 
          onClick={() => router.push("/draft")}
          disabled={pickingLocked || selectedYear !== activeYear}
          style={{ 
            padding: "10px 24px", 
            opacity: (pickingLocked || selectedYear !== activeYear) ? 0.5 : 1, 
            cursor: (pickingLocked || selectedYear !== activeYear) ? "not-allowed" : "pointer" 
          }}
        >
          {selectedYear !== activeYear ? "View Only" : (pickingLocked ? "Picking Locked" : (user.teams?.length ? "Edit Team" : "Create Team"))}
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem" }}>
        <div className="glass" style={{ padding: "1.5rem", textAlign: "center" }}>
          <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: "0.25rem" }}>Current Rank</p>
          <p style={{ fontSize: "2rem", color: "white", fontWeight: "bold" }}>#{userRank || "-"}</p>
        </div>
        <div className="glass" style={{ padding: "1.5rem", textAlign: "center" }}>
          <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: "0.25rem" }}>Total Points</p>
          <p style={{ fontSize: "2rem", color: "var(--accent)", fontWeight: "bold" }}>{totalPoints.toFixed(2)}</p>
        </div>
        <div className="glass" style={{ padding: "1.5rem", textAlign: "center" }}>
          <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: "0.25rem" }}>Avg Points / Team</p>
          <p style={{ fontSize: "2rem", color: "white", fontWeight: "bold" }}>{avgPoints.toFixed(2)}</p>
        </div>
        <div className="glass" style={{ padding: "1.5rem", textAlign: "center" }}>
          <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: "0.25rem" }}>Total Win %</p>
          <p style={{ fontSize: "2rem", color: "white", fontWeight: "bold" }}>{avgWinPercent.toFixed(1)}%</p>
        </div>
      </div>

      {/* Roster Table */}
      <div className="glass" style={{ overflowX: "auto", borderRadius: "var(--radius-lg)" }}>
        <div style={{ padding: "1.5rem", borderBottom: "1px solid var(--surface-border)" }}>
          <h2 style={{ fontSize: "1.25rem", color: "white" }}>Your Drafted Roster</h2>
        </div>

        <table className="data-table">
          <thead>
            <tr>
              <th onClick={() => handleSort("number")}>Team {sortConfig.key === 'number' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
              <th onClick={() => handleSort("name")}>Name {sortConfig.key === 'name' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
              <th onClick={() => handleSort("score")}>Score {sortConfig.key === 'score' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
              <th onClick={() => handleSort("opr")}>OPR {sortConfig.key === 'opr' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
              <th onClick={() => handleSort("ccwm")}>CCWM {sortConfig.key === 'ccwm' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
              <th onClick={() => handleSort("winPercent")}>Win % {sortConfig.key === 'winPercent' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
            </tr>
          </thead>
          <tbody>
            {sortedTeams.length > 0 ? (
              sortedTeams.map(t => (
                <tr key={t.number}>
                  <td style={{ fontWeight: "bold", color: "white" }}>{t.number}</td>
                  <td>{t.name}</td>
                  <td style={{ color: "var(--accent)", fontWeight: "bold" }}>{t.score.toFixed(2)}</td>
                  <td>{t.opr.toFixed(2)}</td>
                  <td>{t.ccwm.toFixed(2)}</td>
                  <td>{(t.winPercent * 100).toFixed(1)}%</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>
                  You haven&apos;t created a team yet. Click &quot;Create Team&quot; to get started!
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 1v1 Draft Stats */}
      {(() => {
        const h2hYear = user.h2h?.[selectedYear];
        const wins = h2hYear?.totalWins || 0;
        const losses = h2hYear?.totalLosses || 0;
        const ties = h2hYear?.totalTies || 0;
        const bonusPoints = h2hYear?.totalBonusPoints || 0;
        const totalMatches = wins + losses + ties;
        const winRate = totalMatches > 0 ? ((wins / totalMatches) * 100).toFixed(1) : "0.0";

        return (
          <div className="glass" style={{ borderRadius: "var(--radius-lg)" }}>
            <div style={{ padding: "1.5rem", borderBottom: "1px solid var(--surface-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ fontSize: "1.25rem", color: "white" }}>1v1 Draft</h2>
              <button
                className="btn-secondary"
                onClick={() => router.push("/h2h")}
                style={{ padding: "6px 16px", fontSize: "0.85rem" }}
              >
                View Matchups &rarr;
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "1rem", padding: "1.5rem" }}>
              <div style={{ textAlign: "center" }}>
                <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: "0.25rem" }}>Bonus Points</p>
                <p style={{ fontSize: "2rem", color: "var(--accent)", fontWeight: "bold" }}>+{bonusPoints}</p>
              </div>
              <div style={{ textAlign: "center" }}>
                <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: "0.25rem" }}>Record</p>
                <p style={{ fontSize: "2rem", color: "white", fontWeight: "bold" }}>{wins}-{losses}-{ties}</p>
              </div>
              <div style={{ textAlign: "center" }}>
                <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: "0.25rem" }}>Win Rate</p>
                <p style={{ fontSize: "2rem", color: "white", fontWeight: "bold" }}>{winRate}%</p>
              </div>
              <div style={{ textAlign: "center" }}>
                <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: "0.25rem" }}>Matches Played</p>
                <p style={{ fontSize: "2rem", color: "white", fontWeight: "bold" }}>{totalMatches}</p>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
}
