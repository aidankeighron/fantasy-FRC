"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { auth, db } from "@/lib/firebase";
import { updatePassword } from "firebase/auth";
import { doc, updateDoc } from "firebase/firestore";

export default function SettingsPage() {
  const { user, loading } = useAuth();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [statusMsg, setStatusMsg] = useState({ text: "", type: "" });
  const [actionLoading, setActionLoading] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [isUsernameLoading, setIsUsernameLoading] = useState(false);

  useEffect(() => {
    if (user?.username) {
      setNewUsername(user.username);
    }
  }, [user]);

  const handleUsernameChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg({ text: "", type: "" });

    if (!newUsername.trim()) {
      setStatusMsg({ text: "Username cannot be empty.", type: "error" });
      return;
    }

    if (!user?.uid) return;

    setIsUsernameLoading(true);
    try {
      await updateDoc(doc(db, "users", user.uid), {
        username: newUsername.trim()
      });
      setStatusMsg({ text: "Username updated successfully! Refresh the page to see changes globally.", type: "success" });
    } catch (err: any) {
      console.error(err);
      setStatusMsg({ text: err.message || "Failed to update username.", type: "error" });
    } finally {
      setIsUsernameLoading(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg({ text: "", type: "" });
    
    if (newPassword !== confirmPassword) {
      setStatusMsg({ text: "Passwords do not match.", type: "error" });
      return;
    }
    
    if (newPassword.length < 6) {
      setStatusMsg({ text: "Password must be at least 6 characters.", type: "error" });
      return;
    }

    if (!auth.currentUser) return;

    setActionLoading(true);
    try {
      await updatePassword(auth.currentUser, newPassword);
      setStatusMsg({ text: "Password updated successfully!", type: "success" });
      setNewPassword("");
      setConfirmPassword("");
    } 
    catch (err: any) {
      console.error(err);
      if (err.code === "auth/requires-recent-login") {
        setStatusMsg({ text: "Please log out and log back in to change your password.", type: "error" });
      } 
      else {
        setStatusMsg({ text: err.message || "Failed to update password.", type: "error" });
      }
    } 
    finally {
      setActionLoading(false);
    }
  };

  if (loading) return <div className="flex-center" style={{ minHeight: "50vh" }}>Loading...</div>;

  if (!user) {
    return (
      <div className="flex-center" style={{ minHeight: "50vh" }}>
        <p className="text-muted">Please log in to view settings.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: "2rem 0", maxWidth: "600px", margin: "0 auto" }}>
      <h1 style={{ fontSize: "2rem", color: "white", marginBottom: "2rem" }}>Account Settings</h1>
      
      {statusMsg.text && (
        <div style={{
          padding: "1rem", 
          borderRadius: "8px", 
          marginBottom: "1.5rem",
          background: statusMsg.type === "error" ? "rgba(225,29,72,0.1)" : "rgba(16,185,129,0.1)",
          color: statusMsg.type === "error" ? "#f87171" : "#34d399",
          border: `1px solid ${statusMsg.type === "error" ? "rgba(225,29,72,0.2)" : "rgba(16,185,129,0.2)"}`
        }}>
          {statusMsg.text}
        </div>
      )}

      <div className="glass" style={{ padding: "2rem", marginBottom: "2rem" }}>
        <h2 style={{ fontSize: "1.25rem", color: "white", marginBottom: "1.5rem" }}>Change Username</h2>
        
        <form onSubmit={handleUsernameChange} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.875rem", color: "var(--text-muted)" }}>
              Username
            </label>
            <input type="text" value={newUsername} onChange={(e) => setNewUsername(e.target.value)}
              className="input-field" required />
          </div>
          <button type="submit" className="btn-primary" disabled={isUsernameLoading} style={{ marginTop: "1rem" }}>
            {isUsernameLoading ? "Updating..." : "Update Username"}
          </button>
        </form>
      </div>

      <div className="glass" style={{ padding: "2rem" }}>
        <h2 style={{ fontSize: "1.25rem", color: "white", marginBottom: "1.5rem" }}>Change Password</h2>

        <form onSubmit={handlePasswordChange} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.875rem", color: "var(--text-muted)" }}>
              New Password
            </label>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
              className="input-field" placeholder="••••••••" required />
          </div>
          
          <div>
            <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.875rem", color: "var(--text-muted)" }}>
              Confirm Password
            </label>
            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
              className="input-field" placeholder="••••••••" required />
          </div>

          <button type="submit" className="btn-primary" disabled={actionLoading} style={{ marginTop: "1rem" }}>
            {actionLoading ? "Updating..." : "Update Password"}
          </button>
        </form>
      </div>
    </div>
  );
}
