"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { db, functions } from "@/lib/firebase";
import { collection, getDocs, getDoc, doc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";

interface UserData {
  id: string;
  email: string;
  username: string;
  isAdmin: boolean;
}

export default function AdminPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const toast = useToast();
  
  const [users, setUsers] = useState<UserData[]>([]);
  const [draftYear, setDraftYear] = useState(new Date().getFullYear().toString());
  const [activeYear, setActiveYear] = useState("");
  const [pickingLocked, setPickingLocked] = useState(false);
  
  const [actionLoading, setActionLoading] = useState<string | null>(null);

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
        setPickingLocked(dsSnap.data().team_picking_locked || false);
      }
    } 
    catch (err) {
      console.error("Failed to fetch admin data", err);
    }
  };



  const toggleAdmin = async (userId: string) => {
    setActionLoading(`toggleAdmin_${userId}`);
    try {
      const toggleFn = httpsCallable(functions, "toggleUserAdmin");
      await toggleFn({ userId });
      fetchAdminData();
    }
    catch (err) {
      console.error(err);
      toast.error("Failed to update user.");
    }
    finally {
      setActionLoading(null);
    }
  };

  const deleteUser = async (userId: string) => {
    if (!window.confirm("Are you sure? This will delete the user's data and they won't be able to log in. You must also delete them from Authentication tab manually unless a cloud function is set up.")) return;
    setActionLoading(`delete_${userId}`);
    try {
      // Deletes their user document. Complete deletion requires Admin SDK via Callable Function.
      const deleteUserFn = httpsCallable(functions, "deleteUserAccount");
      await deleteUserFn({ uid: userId });
      fetchAdminData();
    }
    catch (err) {
      console.error(err);
      toast.error("Failed to delete user. Make sure the Firebase function is deployed.");
    }
    finally {
      setActionLoading(null);
    }
  };

  const toggleLock = async () => {
    setActionLoading("toggleLock");
    try {
      const lockFn = httpsCallable(functions, "toggleTeamPickingLock");
      const res = await lockFn();
      const data = res.data as { locked: boolean };
      setPickingLocked(data.locked);
      toast.success(data.locked ? "Team picking is now LOCKED." : "Team picking is now UNLOCKED.");
    }
    catch (err) {
      console.error(err);
      toast.error("Failed to toggle picking lock.");
    }
    finally {
      setActionLoading(null);
    }
  };

  const recalcScores = async () => {
    setActionLoading("recalcScores");
    try {
      const recalcFn = httpsCallable(functions, "recalcUserScores");
      const res = await recalcFn();
      const data = res.data as { updated: number; year: string };
      toast.success(`Updated scores & ranks for ${data.updated} users (year ${data.year}).`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to recalculate scores.");
    } finally {
      setActionLoading(null);
    }
  };

  const kickstartH2H = async () => {
    setActionLoading("kickstartH2H");
    try {
      const initFn = httpsCallable(functions, "h2hInitialize", { timeout: 540_000 });
      const res = await initFn();
      const data = res.data as { weeksCreated: number; matchupsCreated: number; draftsRun: number; year: string };
      toast.success(`1v1 Draft initialized for ${data.year}: ${data.weeksCreated} weeks synced, ${data.matchupsCreated} matchups created, ${data.draftsRun} drafts run.`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to initialize 1v1 Draft.");
    } finally {
      setActionLoading(null);
    }
  };

  const updateYear = async () => {
    setActionLoading("updateYear");
    try {
      const syncTeamsFn = httpsCallable(functions, "syncTeamData", { timeout: 600_000 });
      await syncTeamsFn({ year: draftYear });
      toast.success("Team synchronization initiated for year: " + draftYear);
      fetchAdminData();
    }
    catch (err) {
      console.error(err);
      toast.error("Failed to update year and sync teams.");
    }
    finally {
      setActionLoading(null);
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
                      <button onClick={() => toggleAdmin(u.id)} className="btn-secondary" disabled={!!actionLoading || u.id === user.uid}
                        style={{ padding: "4px 8px", fontSize: "0.75rem", marginRight: "8px", opacity: actionLoading ? 0.5 : undefined }}>
                        {actionLoading === `toggleAdmin_${u.id}` ? "Processing..." : "Toggle Admin"}
                      </button>
                      <button onClick={() => deleteUser(u.id)} className="btn-secondary" disabled={!!actionLoading || u.id === user.uid}
                        style={{ padding: "4px 8px", fontSize: "0.75rem", color: "var(--accent)", borderColor: "var(--accent)", opacity: actionLoading ? 0.5 : undefined }}>
                        {actionLoading === `delete_${u.id}` ? "Processing..." : "Delete"}
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
              <button onClick={updateYear} disabled={!!actionLoading} className="btn-secondary" style={{ opacity: actionLoading ? 0.5 : undefined }}>
                {actionLoading === "updateYear" ? "Processing..." : "Pull Data & Sync All"}
              </button>
            </div>
            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.5rem" }}>
              Sets the active draft year, retrieves team statistics from The Blue Alliance, and calculates user points across the entire database. This may take a couple minutes.
            </p>
          </div>

          <hr style={{ borderTop: "1px solid var(--surface-border)", margin: "1.5rem 0" }} />

          <div style={{ marginBottom: "1.5rem" }}>
            <button onClick={recalcScores} disabled={!!actionLoading} className="btn-secondary" style={{ width: "100%", opacity: actionLoading ? 0.5 : undefined }}>
              {actionLoading === "recalcScores" ? "Processing..." : "Update All Scores & Rankings"}
            </button>
            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.5rem", textAlign: "center" }}>
              Recalculates every user's score and rank from existing team data. Does not fetch new data from TBA.
            </p>
          </div>

          <hr style={{ borderTop: "1px solid var(--surface-border)", margin: "1.5rem 0" }} />

          <div style={{ marginBottom: "1.5rem" }}>
            <button onClick={toggleLock} disabled={!!actionLoading} className="btn-primary" style={{ width: "100%", backgroundColor: pickingLocked ? "var(--success)" : "var(--error)", color: "#050505", border: "none", opacity: actionLoading ? 0.5 : undefined }}>
              {actionLoading === "toggleLock" ? "Processing..." : pickingLocked ? "Unlock Team Picking" : "Lock Team Picking"}
            </button>
            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.5rem", textAlign: "center" }}>
              {pickingLocked
                ? "Team picking is currently restricted. Users cannot create or edit their teams."
                : "Team picking is open! Users can freely create and edit their teams."}
            </p>
          </div>
        </div>

        {/* 1v1 Draft Controls */}
        <div className="glass" style={{ padding: "1.5rem" }}>
          <h2 style={{ fontSize: "1.25rem", color: "white", marginBottom: "1rem" }}>1v1 Draft</h2>

          <div style={{ marginBottom: "1.5rem" }}>
            <button onClick={kickstartH2H} disabled={!!actionLoading} className="btn-primary" style={{ width: "100%", opacity: actionLoading ? 0.5 : undefined }}>
              {actionLoading === "kickstartH2H" ? "Processing..." : "Initialize 1v1 Draft"}
            </button>
            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.5rem", textAlign: "center" }}>
              Syncs weekly events from TBA, creates matchups for any open draft weeks, and runs drafts for weeks past their deadline. Safe to press at any time — completed weeks and existing matchups are never modified.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
