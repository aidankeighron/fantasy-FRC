"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { db, functions } from "@/lib/firebase";
import { collection, doc, getDocs, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { useVirtualizer } from "@tanstack/react-virtual";

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
  email: string;
  username: string;
  teams: string[];
}

interface DraftState {
  status: "pending" | "active" | "completed";
  current_turn_userId: string | null;
  draft_order: string[];
  active_year: string;
}

export default function DraftPage() {
  const { user, loading: authLoading } = useAuth();
  
  const [teams, setTeams] = useState<Map<string, Team>>(new Map());
  const [users, setUsers] = useState<UserData[]>([]);
  const [draftState, setDraftState] = useState<DraftState | null>(null);
  const [teamSearch, setTeamSearch] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);

  const [sortConfig, setSortConfig] = useState<{ key: keyof Team; direction: "asc" | "desc" }>({
    key: "score",
    direction: "desc",
  });

  // Fetch static teams data once
  useEffect(() => {
    const fetchTeams = async () => {
      try {
        const { getDoc } = await import("firebase/firestore");
        const dsRef = doc(db, "draft_state", "global");
        const dsSnap = await getDoc(dsRef);
        const activeYearStr = dsSnap.exists() ? dsSnap.data().active_year : new Date().getFullYear().toString();
        const prevYear = (parseInt(activeYearStr) - 1).toString();

        const teamsSnap = await getDocs(collection(db, "teams"));
        const teamsMap = new Map<string, Team>();
        teamsSnap.docs.forEach(d => {
          const tData = d.data();
          const activeYrs = tData.activeYears || [];
          if (!activeYrs.includes(activeYearStr)) return;

          const pStats = tData.stats?.[prevYear] || {};
          teamsMap.set(d.id, {
            number: d.id,
            name: tData.name || "",
            state: tData.state || "",
            country: tData.country || "",
            opr: pStats.opr || 0,
            ccwm: pStats.ccwm || 0,
            score: pStats.score || 0,
            winPercent: pStats.winRate || 0,
          });
        });
        setTeams(teamsMap);
      } 
      catch (err) {
        console.error("Failed to fetch teams:", err);
      }
    };
    fetchTeams();
  }, []);

  // Real-time listeners for users and draft state
  useEffect(() => {
    const unsubscribeUsers = onSnapshot(collection(db, "users"), (snap) => {
      const usersData = snap.docs.map(d => ({
        id: d.id,
        email: d.data().email || "",
        username: d.data().username || d.data().email?.split("@")[0] || "Unknown",
        teams: d.data().teams || [],
      }));
      setUsers(usersData);
    });

    const unsubscribeDraft = onSnapshot(doc(db, "draft_state", "global"), (doc) => {
      if (doc.exists()) {
        setDraftState(doc.data() as DraftState);
      } 
      else {
        setDraftState(null);
      }
      setDataLoading(false);
    });

    return () => {
      unsubscribeUsers();
      unsubscribeDraft();
    };
  }, []);

  // Derived state
  const isMyTurn = draftState?.current_turn_userId === user?.uid && draftState?.status === "active";
  
  const allDraftedTeamNumbers = useMemo(() => {
    const drafted = new Set<string>();
    users.forEach(u => u.teams.forEach(t => drafted.add(t)));
    return drafted;
  }, [users]);

  const currentUserData = useMemo(() => users.find(u => u.id === user?.uid), [users, user]);
  
  const myDraftedTeamsDetails = useMemo(() => {
    if (!currentUserData) return [];
    return currentUserData.teams.map(t => teams.get(t)).filter((t): t is Team => !!t);
  }, [currentUserData, teams]);

  // Culling + Sorting logic
  const availableTeams = useMemo(() => {
    const result: Team[] = [];
    
    teams.forEach((team) => {
      // Not already drafted
      if (allDraftedTeamNumbers.has(team.number)) return;

      // State/Country availability
      let available = true;
      if (team.country === "USA" || team.country === "United States") {
         const hasState = myDraftedTeamsDetails.some(t => (t.country === "USA" || t.country === "United States") && t.state === team.state);
         if (hasState && team.state) available = false;
      } 
      else {
         const hasCountry = myDraftedTeamsDetails.some(t => t.country !== "USA" && t.country !== "United States" && t.country === team.country);
         if (hasCountry && team.country) available = false;
      }
      
      if (!available) return;

      // Search filter
      if (teamSearch) {
        const isNum = !isNaN(Number(teamSearch));
        if (isNum && !team.number.includes(teamSearch)) return;
        if (!isNum && !team.name.toLowerCase().includes(teamSearch.toLowerCase())) return;
      }

      result.push(team);
    });

    // Sort
    result.sort((a, b) => {
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

    return result;
  }, [teams, allDraftedTeamNumbers, myDraftedTeamsDetails, teamSearch, sortConfig]);

  const handleSort = (key: keyof Team) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === "desc" ? "asc" : "desc"
    }));
  };

  const handleDraftPick = async (teamNumber: string) => {
    if (!isMyTurn) return;
    setActionLoading(true);
    try {
      const processPick = httpsCallable(functions, "processDraftPick");
      await processPick({ userId: user?.uid, teamNumber });
    } 
    catch (err: any) {
      console.error(err);
      alert(err.message || "Failed to draft team.");
    } 
    finally {
      setActionLoading(false);
    }
  };

  // Virtualizer
  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: availableTeams.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 50,
    overscan: 10,
  });

  if (authLoading || dataLoading) {
    return <div className="flex-center" style={{ minHeight: "60vh" }}>Loading Draft Data...</div>;
  }

  if (draftState?.status !== "active") {
    return (
      <div className="flex-center" style={{ minHeight: "60vh", flexDirection: "column", gap: "1rem" }}>
        <h1 style={{ fontSize: "2rem", color: "white" }}>Draft is not active.</h1>
        <p className="text-muted">The draft is either waiting to start or has already been completed.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: "2rem 0", display: "flex", flexDirection: "column", gap: "2rem" }}>
      
      {/* Draft Status Banner */}
      <div className="glass-panel" style={{ padding: "1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center", borderLeft: isMyTurn ? "4px solid var(--accent)" : "none" }}>
        <div>
          <h2 style={{ fontSize: "1.25rem", color: "white", marginBottom: "0.25rem" }}>
            {isMyTurn ? "🎉 It's your turn to pick!" : "Waiting for next pick..."}
          </h2>
          <p className="text-muted">
            Current Player Turn: {" "}
            <span style={{ color: "white", fontWeight: "bold" }}>
              {users.find(u => u.id === draftState.current_turn_userId)?.username || "Unknown"}
            </span>
          </p>
        </div>
        <div style={{ textAlign: "right" }}>
          <p className="text-muted" style={{ fontSize: "0.875rem" }}>Round</p>
          <p style={{ fontSize: "1.5rem", color: "white", fontWeight: "bold" }}>
            {currentUserData?.teams.length ? currentUserData.teams.length + 1 : 1} / 8
          </p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "2rem" }}>
        
        {/* Desktop Layout Uses Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "minmax(300px, 1fr) 2fr", gap: "2rem", alignItems: "start" }}>
          
          {/* Left Column: All users picks + My Picks */}
          <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
            
            {/* My Picks */}
            <div className="glass" style={{ padding: "1.5rem" }}>
              <h3 style={{ fontSize: "1.1rem", color: "white", marginBottom: "1rem" }}>Your Drafted Teams</h3>
              {myDraftedTeamsDetails.length === 0 ? (
                <p className="text-muted" style={{ fontSize: "0.875rem" }}>No picks yet.</p>
              ) : (
                <ul style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {myDraftedTeamsDetails.map(t => (
                    <li key={t.number} style={{ display: "flex", justifyContent: "space-between", background: "var(--surface-hover)", padding: "0.5rem 1rem", borderRadius: "8px", fontSize: "0.875rem" }}>
                      <span style={{ color: "white", fontWeight: "bold" }}>{t.number}</span>
                      <span className="text-muted">{t.country === "USA" ? t.state : t.country}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* All Users */}
            <div className="glass" style={{ padding: "1.5rem", maxHeight: "400px", overflowY: "auto" }}>
              <h3 style={{ fontSize: "1.1rem", color: "white", marginBottom: "1rem" }}>Draft Board</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                {draftState.draft_order?.map((userId, idx) => {
                  const u = users.find(user => user.id === userId);
                  if (!u) return null;
                  const isCurrent = draftState.current_turn_userId === userId;
                  return (
                    <div key={userId} style={{ padding: "0.75rem", borderRadius: "8px", background: isCurrent ? "var(--accent-glow)" : "var(--surface)", border: isCurrent ? "1px solid var(--accent)" : "1px solid transparent" }}>
                      <p style={{ color: "white", fontSize: "0.875rem", fontWeight: "bold", marginBottom: "0.25rem" }}>
                        {idx + 1}. {u.username}
                      </p>
                      <p className="text-muted" style={{ fontSize: "0.75rem" }}>
                        Picks: {u.teams.length > 0 ? u.teams.join(", ") : "None"}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
            
          </div>

          {/* Right Column: Available Teams Table */}
          <div className="glass" style={{ display: "flex", flexDirection: "column", height: "800px" }}>
            <div style={{ padding: "1.5rem", borderBottom: "1px solid var(--surface-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ fontSize: "1.25rem", color: "white" }}>Available Teams</h3>
              <input 
                type="text" 
                placeholder="Search..." 
                value={teamSearch}
                onChange={e => setTeamSearch(e.target.value)}
                className="input-field"
                style={{ width: "200px", padding: "8px 12px" }}
              />
            </div>

            <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
              <div ref={parentRef} style={{ height: "100%", overflow: "auto" }}>
                <table className="data-table data-table-virtual" style={{ width: "100%", position: "relative" }}>
                  <thead style={{ position: "sticky", top: 0, background: "var(--surface)", zIndex: 10, backdropFilter: "blur(4px)" }}>
                    <tr>
                      <th onClick={() => handleSort("number")}>Team {sortConfig.key === 'number' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
                      <th onClick={() => handleSort("name")}>Name {sortConfig.key === 'name' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
                      <th onClick={() => handleSort("state")}>Region {sortConfig.key === 'state' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
                      <th onClick={() => handleSort("score")} style={{ textAlign: "right" }}>Score (Last Yr) {sortConfig.key === 'score' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
                      <th style={{ textAlign: "right", width: "100px" }}>Action</th>
                    </tr>
                  </thead>
                  <tbody style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: "relative" }}>
                    {rowVirtualizer.getVirtualItems().map(virtualRow => {
                      const team = availableTeams[virtualRow.index];
                      return (
                        <tr key={team.number} style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          width: "100%",
                          height: `${virtualRow.size}px`,
                          transform: `translateY(${virtualRow.start}px)`,
                          display: "flex",
                          alignItems: "center",
                        }}>
                          <td style={{ fontWeight: "bold" }}>{team.number}</td>
                          <td style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "200px" }}>{team.name}</td>
                          <td className="text-muted">{team.country === "USA" || team.country === "United States" ? team.state : team.country}</td>
                          <td style={{ textAlign: "right", color: "var(--accent)", fontWeight: "bold" }}>{team.score.toFixed(1)}</td>
                          <td style={{ textAlign: "right" }}>
                            <button className="btn-primary" disabled={!isMyTurn || actionLoading} onClick={() => handleDraftPick(team.number)}
                              style={{ padding: "6px 12px", fontSize: "0.75rem", opacity: (!isMyTurn || actionLoading) ? 0.5 : 1 }}>
                              Draft
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {availableTeams.length === 0 && (
                  <div className="flex-center text-muted" style={{ height: "200px" }}>
                    No teams available matching your criteria and region restrictions.
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
