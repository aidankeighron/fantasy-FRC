"use client";

import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { db, functions } from "@/lib/firebase";
import { collection, onSnapshot, doc, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

interface UserData {
  id: string;
  email: string;
  teams: string[];
}

interface Trade {
  id: string;
  senderId: string;
  receiverId: string;
  offeredTeams: string[];
  requestedTeams: string[];
  status: "pending" | "accepted" | "cancelled";
}

export default function TradePage() {
  const { user, loading: authLoading } = useAuth();

  const [users, setUsers] = useState<UserData[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [draftStatus, setDraftStatus] = useState<string>("pending");
  const [dataLoading, setDataLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [mySelectedTeams, setMySelectedTeams] = useState<string[]>([]);
  const [theirSelectedTeams, setTheirSelectedTeams] = useState<string[]>([]);

  useEffect(() => {
    if (!user) return;

    // Realtime listeners
    const unsubscribeUsers = onSnapshot(collection(db, "users"), (snap) => {
      setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() } as UserData)));
    });

    const q1 = query(collection(db, "trades"), where("senderId", "==", user.uid), where("status", "==", "pending"));
    const unsubscribeTradesSender = onSnapshot(q1, (snap) => {
      const senderTrades = snap.docs.map(d => ({ id: d.id, ...d.data() } as Trade));
      setTrades(prev => {
         const others = prev.filter(t => t.senderId !== user.uid);
         return [...others, ...senderTrades];
      });
    });
    
    const q2 = query(collection(db, "trades"), where("receiverId", "==", user.uid), where("status", "==", "pending"));
    const unsubscribeTradesReceiver = onSnapshot(q2, (snap) => {
      const receiverTrades = snap.docs.map(d => ({ id: d.id, ...d.data() } as Trade));
      setTrades(prev => {
         const others = prev.filter(t => t.receiverId !== user.uid);
         return [...others, ...receiverTrades];
      });
    });

    const unsubscribeDraft = onSnapshot(doc(db, "draft_state", "global"), (doc) => {
      if (doc.exists()) {
        setDraftStatus(doc.data().status || "pending");
      }
      setDataLoading(false);
    });

    return () => {
      unsubscribeUsers();
      unsubscribeTradesSender();
      unsubscribeTradesReceiver();
      unsubscribeDraft();
    };
  }, [user]);

  const currentUserData = useMemo(() => users.find(u => u.id === user?.uid), [users, user]);
  const selectedUserData = useMemo(() => users.find(u => u.id === selectedUserId), [users, selectedUserId]);

  const activeTeamsInTrades = useMemo(() => {
    const active = new Set<string>();
    trades.forEach(t => {
      if (t.status === "pending") {
        t.offeredTeams.forEach(team => active.add(team));
        t.requestedTeams.forEach(team => active.add(team));
      }
    });
    return active;
  }, [trades]);

  const toggleMyTeam = (team: string) => {
    if (activeTeamsInTrades.has(team)) return; // disabled
    setMySelectedTeams(prev => {
      if (prev.includes(team)) return prev.filter(t => t !== team);
      if (prev.length >= 3) return prev;
      return [...prev, team];
    });
  };

  const toggleTheirTeam = (team: string) => {
    if (activeTeamsInTrades.has(team)) return; // disabled
    setTheirSelectedTeams(prev => {
      if (prev.includes(team)) return prev.filter(t => t !== team);
      if (prev.length >= 3) return prev;
      return [...prev, team];
    });
  };

  const proposeTrade = async () => {
    if (!selectedUserId || (mySelectedTeams.length === 0 && theirSelectedTeams.length === 0)) return;
    setActionLoading(true);
    try {
      const createTradeFn = httpsCallable(functions, "createTrade");
      await createTradeFn({
        receiverId: selectedUserId,
        offeredTeams: mySelectedTeams,
        requestedTeams: theirSelectedTeams,
      });
      setMySelectedTeams([]);
      setTheirSelectedTeams([]);
      setSelectedUserId("");
      alert("Trade proposed successfully!");
    } 
    catch (err: any) {
      console.error(err);
      alert(err.message || "Failed to propose trade.");
    } 
    finally {
      setActionLoading(false);
    }
  };

  const acceptTrade = async (tradeId: string) => {
    setActionLoading(true);
    try {
      const acceptFn = httpsCallable(functions, "acceptTrade");
      await acceptFn({ tradeId });
      alert("Trade accepted!");
    } 
    catch (err: any) {
      console.error(err);
      alert(err.message || "Failed to accept trade.");
    } 
    finally {
      setActionLoading(false);
    }
  };

  const cancelTrade = async (tradeId: string) => {
    setActionLoading(true);
    try {
      const cancelFn = httpsCallable(functions, "cancelTrade");
      await cancelFn({ tradeId });
    } 
    catch (err: any) {
      console.error(err);
      alert(err.message || "Failed to cancel trade.");
    } 
    finally {
      setActionLoading(false);
    }
  };

  if (authLoading || dataLoading) {
    return <div className="flex-center" style={{ minHeight: "50vh" }}><p className="text-muted">Loading...</p></div>;
  }

  if (draftStatus !== "completed") {
    return (
      <div className="flex-center" style={{ minHeight: "60vh", flexDirection: "column", gap: "1rem" }}>
        <h1 style={{ fontSize: "2rem", color: "white" }}>Trading Unavailable</h1>
        <p className="text-muted">Trading is only available after all users have drafted 8 teams and the draft is completed.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: "2rem 0", display: "flex", flexDirection: "column", gap: "2rem" }}>
      <h1 style={{ fontSize: "2rem", color: "white" }}>Trading Block</h1>

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "2rem" }}>
        
        {/* Propose Trade Area */}
        <div className="glass" style={{ padding: "1.5rem" }}>
          <h2 style={{ fontSize: "1.25rem", color: "white", marginBottom: "1rem" }}>Propose Trade</h2>
          
          <div style={{ marginBottom: "1.5rem" }}>
            <label style={{ display: "block", marginBottom: "0.5rem", color: "var(--text-muted)", fontSize: "0.875rem" }}>Select User</label>
            <select className="input-field" value={selectedUserId} style={{ maxWidth: "400px" }}
              onChange={e => { setSelectedUserId(e.target.value); setTheirSelectedTeams([]); }}>
              <option value="">-- Choose User --</option>
              {users.filter(u => u.id !== user?.uid).map(u => (
                <option key={u.id} value={u.id}>{u.email}</option>
              ))}
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2rem" }}>
            {/* My Teams */}
            <div>
              <h3 style={{ fontSize: "1rem", color: "white", marginBottom: "0.5rem" }}>
                Your Teams (Select up to 3)
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {currentUserData?.teams.length ? currentUserData.teams.map(team => {
                  const inTrade = activeTeamsInTrades.has(team);
                  const isSelected = mySelectedTeams.includes(team);
                  return (
                    <button key={team} onClick={() => toggleMyTeam(team)} disabled={inTrade}
                      style={{ 
                        textAlign: "left", padding: "0.75rem", borderRadius: "8px",
                        background: isSelected ? "rgba(225,29,72,0.2)" : (inTrade ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.05)"),
                        border: isSelected ? "1px solid var(--accent)" : "1px solid transparent",
                        color: inTrade ? "var(--text-muted)" : "white",
                        cursor: inTrade ? "not-allowed" : "pointer"
                      }}
                    >
                      Team {team} {inTrade && "(In active trade)"}
                    </button>
                  );
                }) : <p className="text-muted">You have no teams.</p>}
              </div>
            </div>

            {/* Their Teams */}
            <div>
              <h3 style={{ fontSize: "1rem", color: "white", marginBottom: "0.5rem" }}>
                Their Teams (Select up to 3)
              </h3>
              {selectedUserId ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {selectedUserData?.teams.length ? selectedUserData.teams.map(team => {
                    const inTrade = activeTeamsInTrades.has(team);
                    const isSelected = theirSelectedTeams.includes(team);
                    return (
                      <button key={team} onClick={() => toggleTheirTeam(team)} disabled={inTrade}
                        style={{ 
                          textAlign: "left", padding: "0.75rem", borderRadius: "8px",
                          background: isSelected ? "rgba(59,130,246,0.2)" : (inTrade ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.05)"),
                          border: isSelected ? "1px solid var(--secondary)" : "1px solid transparent",
                          color: inTrade ? "var(--text-muted)" : "white",
                          cursor: inTrade ? "not-allowed" : "pointer"
                        }}
                      >
                        Team {team} {inTrade && "(In active trade)"}
                      </button>
                    );
                  }) : <p className="text-muted">They have no teams.</p>}
                </div>
              ) : (
                <p className="text-muted" style={{ padding: "1rem 0" }}>Select a user to view their teams.</p>
              )}
            </div>
          </div>

          <div style={{ marginTop: "2rem", textAlign: "right" }}>
            <button className="btn-primary" onClick={proposeTrade}
              disabled={actionLoading || !selectedUserId || (mySelectedTeams.length === 0 && theirSelectedTeams.length === 0)}>
              Propose Trade
            </button>
          </div>
        </div>

        {/* Active Trades */}
        <div className="glass" style={{ padding: "1.5rem" }}>
          <h2 style={{ fontSize: "1.25rem", color: "white", marginBottom: "1rem" }}>Pending Trades</h2>
          
          {trades.length === 0 ? <p className="text-muted">No active trades.</p> : (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {trades.filter(t => t.status === "pending").map(trade => {
                const isReceiver = trade.receiverId === user?.uid;
                const partnerId = isReceiver ? trade.senderId : trade.receiverId;
                const partnerEmail = users.find(u => u.id === partnerId)?.email?.split("@")[0] || "Unknown";

                return (
                  <div key={trade.id} style={{ padding: "1rem", borderRadius: "8px", background: "rgba(255,255,255,0.03)", border: "1px solid var(--surface-border)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                      <p style={{ fontWeight: "bold", color: "white" }}>
                        {isReceiver ? `Received from ${partnerEmail}` : `Proposed to ${partnerEmail}`}
                      </p>
                      <span className="text-muted" style={{ fontSize: "0.75rem" }}>Status: Pending</span>
                    </div>
                    
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
                      <div>
                        <p className="text-muted" style={{ fontSize: "0.875rem" }}>You Output:</p>
                        <p style={{ color: "white" }}>{isReceiver ? trade.requestedTeams.join(", ") || "None" : trade.offeredTeams.join(", ") || "None"}</p>
                      </div>
                      <div>
                        <p className="text-muted" style={{ fontSize: "0.875rem" }}>You Receive:</p>
                        <p style={{ color: "var(--accent)" }}>{isReceiver ? trade.offeredTeams.join(", ") || "None" : trade.requestedTeams.join(", ") || "None"}</p>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      {isReceiver && (
                        <button className="btn-primary" onClick={() => acceptTrade(trade.id)} disabled={actionLoading}>
                          Accept Trade
                        </button>
                      )}
                      <button className="btn-secondary" onClick={() => cancelTrade(trade.id)} disabled={actionLoading}>
                        Cancel Trade
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
