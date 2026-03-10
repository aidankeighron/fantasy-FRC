"use client";

import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, documentId, where } from "firebase/firestore";
import { useRouter } from "next/navigation";

interface Team {
  number: string;
  name: string;
  opr: number;
  average: number;
  score: number;
  winPercent: number;
}

export default function TeamManagementPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [teams, setTeams] = useState<Team[]>([]);
  const [userRank, setUserRank] = useState<number>(0);
  const [dataLoading, setDataLoading] = useState(true);

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

        if (user.teams && user.teams.length > 0) {
          // Batch fetch teams based on user.teams IDs
          // Firestore 'in' query supports up to 10 elements. Since a user has max 8 teams (per rules), this is safe.
          const teamsQuery = query(collection(db, "teams"), where(documentId(), "in", user.teams));
          const teamsSnap = await getDocs(teamsQuery);
          
          const fetchedTeams: Team[] = teamsSnap.docs.map(doc => ({
            number: doc.id,
            name: doc.data().name || "",
            opr: doc.data().opr || 0,
            average: doc.data().average || 0,
            score: doc.data().score || 0,
            winPercent: doc.data().winPercent || 0,
          }));
          
          setTeams(fetchedTeams);
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
      <h1 style={{ fontSize: "2rem", color: "white" }}>Team Management</h1>

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
              <th onClick={() => handleSort("average")}>Avg {sortConfig.key === 'average' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
              <th onClick={() => handleSort("opr")}>OPR {sortConfig.key === 'opr' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
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
                  <td>{t.average.toFixed(2)}</td>
                  <td>{t.opr.toFixed(2)}</td>
                  <td>{(t.winPercent * 100).toFixed(1)}%</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>
                  You haven&apos;t drafted any teams yet. Wait for the draft to begin!
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
}
