"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { db, functions } from "@/lib/firebase";
import { collection, getDocs, getDoc, doc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { useRouter } from "next/navigation";

interface UserData {
  id: string;
  email: string;
  username: string;
  isAdmin: boolean;
}

export default function AdminPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  
  const [users, setUsers] = useState<UserData[]>([]);
  const [draftYear, setDraftYear] = useState(new Date().getFullYear().toString());
  const [activeYear, setActiveYear] = useState("");
  
  const [actionLoading, setActionLoading] = useState(false);
  const [forcePickUser, setForcePickUser] = useState("");
  const [forcePickTeam, setForcePickTeam] = useState("");

  useEffect(() => {
    if (!loading && (!user || !user.isAdmin)) {
      router.push("/");
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (user?.isAdmin) {
      fetchAdminData();
    }
  }, [user]);

  const fetchAdminData = async () => {
    try {
      const usersSnap = await getDocs(collection(db, "users"));
      setUsers(usersSnap.docs.map(d => ({ id: d.id, ...d.data() } as UserData)));
      
      const draftStateRef = doc(db, "draft_state", "global");
      const dsSnap = await getDoc(draftStateRef);
      if (dsSnap.exists()) {
        setActiveYear(dsSnap.data().active_year || "");
      }
    } 
    catch (err) {
      console.error("Failed to fetch admin data", err);
    }
  };



  const toggleAdmin = async (userId: string) => {
    setActionLoading(true);
    try {
      const toggleFn = httpsCallable(functions, "toggleUserAdmin");
      await toggleFn({ userId });
      fetchAdminData();
    } 
    catch (err) {
      console.error(err);
      alert("Failed to update user.");
    } 
    finally {
      setActionLoading(false);
    }
  };

  const deleteUser = async (userId: string) => {
    if (!confirm("Are you sure? This will delete the user's data and they won't be able to log in. You must also delete them from Authentication tab manually unless a cloud function is set up.")) return;
    setActionLoading(true);
    try {
      // Deletes their user document. Complete deletion requires Admin SDK via Callable Function.
      const deleteUserFn = httpsCallable(functions, "deleteUserAccount");
      await deleteUserFn({ uid: userId });
      fetchAdminData();
    } 
    catch (err) {
      console.error(err);
      alert("Failed to delete user. Make sure the Firebase function is deployed.");
    } 
    finally {
      setActionLoading(false);
    }
  };

  const startDraft = async () => {
    if (!confirm("This will CLEAR all previous draft results and start a new draft. Proceed?")) return;
    setActionLoading(true);
    try {
      const startDraftFn = httpsCallable(functions, "startNewDraft");
      await startDraftFn();
      alert("Draft started!");
    } 
    catch (err) {
      console.error(err);
      alert("Failed to start draft. Make sure function is deployed.");
    } 
    finally {
      setActionLoading(false);
    }
  };

  const updateYear = async () => {
    setActionLoading(true);
    try {
      const syncTeamsFn = httpsCallable(functions, "syncTeamData");
      await syncTeamsFn({ year: draftYear });
      alert("Team synchronization initiated for year: " + draftYear);
      fetchAdminData();
    } 
    catch (err) {
      console.error(err);
      alert("Failed to update year and sync teams.");
    } 
    finally {
      setActionLoading(false);
    }
  };

  const forcePick = async () => {
    if (!forcePickUser || !forcePickTeam) return alert("Select user and enter team.");
    setActionLoading(true);
    try {
      const forcePickFn = httpsCallable(functions, "processDraftPick");
      await forcePickFn({ userId: forcePickUser, teamNumber: forcePickTeam, force: true });
      alert("Force pick successful!");
      setForcePickTeam("");
    } 
    catch (err) {
      console.error(err);
      alert("Failed to force pick.");
    } 
    finally {
      setActionLoading(false);
    }
  };

  if (loading || !user?.isAdmin) {
    return <div className="flex-center" style={{ minHeight: "50vh" }}>Loading...</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem", padding: "2rem 0" }}>
      <h1 style={{ fontSize: "2rem", color: "white" }}>Admin Dashboard</h1>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(350px, 1fr))", gap: "2rem" }}>
        
        {/* User Management */}
        <div className="glass" style={{ padding: "1.5rem" }}>
          <h2 style={{ fontSize: "1.25rem", color: "white", marginBottom: "1rem" }}>User Management</h2>
          <div style={{ maxHeight: "300px", overflowY: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Admin</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td>{u.username || u.email?.split("@")[0] || "Unknown"}</td>
                    <td>{u.isAdmin ? "Yes" : "No"}</td>
                    <td>
                      <button onClick={() => toggleAdmin(u.id)} className="btn-secondary" disabled={actionLoading || u.id === user.uid}
                        style={{ padding: "4px 8px", fontSize: "0.75rem", marginRight: "8px" }}>
                        Toggle Admin
                      </button>
                      <button onClick={() => deleteUser(u.id)} className="btn-secondary" disabled={actionLoading || u.id === user.uid}
                        style={{ padding: "4px 8px", fontSize: "0.75rem", color: "var(--accent)", borderColor: "var(--accent)" }}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>


        {/* Draft Controls */}
        <div className="glass" style={{ padding: "1.5rem" }}>
          <h2 style={{ fontSize: "1.25rem", color: "white", marginBottom: "1rem" }}>Draft & Data Settings</h2>
          
          <div style={{ marginBottom: "1.5rem" }}>
            <p className="text-muted" style={{ fontSize: "0.875rem", marginBottom: "0.5rem" }}>Active Year: {activeYear || "Not Set"}</p>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <input type="text" value={draftYear} onChange={e => setDraftYear(e.target.value)} 
                className="input-field" style={{ width: "100px" }} />
              <button onClick={updateYear} disabled={actionLoading} className="btn-secondary">Pull Data & Sync All</button>
            </div>
            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.5rem" }}>
              Sets the active draft year, retrieves team statistics from The Blue Alliance, and calculates user points across the entire database. This may take a few seconds.
            </p>
          </div>

          <hr style={{ borderTop: "1px solid rgba(255,255,255,0.1)", margin: "1.5rem 0" }} />
          
          <div style={{ marginBottom: "1.5rem" }}>
            <button onClick={startDraft} disabled={actionLoading} className="btn-primary" style={{ width: "100%", background: "#f87171", color: "white" }}>
              Start New Draft
            </button>
            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.5rem", textAlign: "center" }}>
              Warning: This clears drafted teams for all users!
            </p>
          </div>

          <hr style={{ borderTop: "1px solid rgba(255,255,255,0.1)", margin: "1.5rem 0" }} />

          <div>
            <h3 style={{ fontSize: "1rem", color: "var(--text-main)", marginBottom: "0.5rem" }}>Force Pick (Failsafe)</h3>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <select value={forcePickUser} onChange={e => setForcePickUser(e.target.value)} 
                className="input-field" style={{ flex: 1 }} >
                <option value="">Select User...</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.username || u.email?.split("@")[0] || "Unknown"}</option>)}
              </select>
              <input type="text" placeholder="Team #" value={forcePickTeam} style={{ width: "80px" }}
                onChange={e => setForcePickTeam(e.target.value)} className="input-field" />
              <button onClick={forcePick} disabled={actionLoading} className="btn-secondary">Pick</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
