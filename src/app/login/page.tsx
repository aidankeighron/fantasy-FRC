"use client";

import { useState } from "react";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (isSignup) {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        await setDoc(doc(db, "users", user.uid), {
          email: user.email,
          username: "Player" + Math.floor(Math.random() * 100000),
          isAdmin: false,
          teams: [],
          score: 0,
          rank: 0,
          createdAt: new Date().toISOString(),
        });

        router.push("/team");
      } 
      else {
        await signInWithEmailAndPassword(auth, email, password);
        router.push("/");
      }
    } 
    catch (err: unknown) {
      console.error("Auth error:", err);
      setError(isSignup ? "Failed to create account. Email may be in use." : "Invalid email or password.");
    }  
    finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-center" style={{ minHeight: "80vh" }}>
      <div className="glass-panel" style={{ width: "100%", maxWidth: "400px", padding: "2rem" }}>
        <h1 style={{ fontSize: "1.75rem", marginBottom: "0.5rem", color: "white", textAlign: "center" }}>
          {isSignup ? "Create Account" : "Welcome Back"}
        </h1>
        <p className="text-muted" style={{ textAlign: "center", marginBottom: "2rem" }}>
          {isSignup ? "Join Fantasy FRC today" : "Log in to manage your Fantasy FRC team"}
        </p>

        {error && (
          <div style={{ background: "var(--error-bg)", color: "var(--error)", padding: "0.75rem", borderRadius: "8px", marginBottom: "1rem", fontSize: "0.875rem" }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label htmlFor="email" style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.875rem", color: "var(--text-muted)" }}>
              Email Address
            </label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              className="input-field" placeholder="you@example.com" required />
          </div>

          <div>
            <label htmlFor="password" style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.875rem", color: "var(--text-muted)" }}>
              Password
            </label>
            <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              className="input-field" placeholder="••••••••" required minLength={isSignup ? 6 : undefined} />
          </div>

          <button type="submit" className="btn-primary" style={{ width: "100%", marginTop: "1rem", opacity: loading ? 0.7 : 1 }}
            disabled={loading} >
            {loading && isSignup && "Creating Account..."}
            {loading && !isSignup && "Logging in..."}
            {!loading && isSignup && "Sign Up"}
            {!loading && !isSignup && "Log In"}
          </button>
        </form>

        <div style={{ marginTop: "1.5rem", textAlign: "center", fontSize: "0.875rem", color: "var(--text-muted)" }}>
          {isSignup ? "Already have an account? " : "Don't have an account? "}
          <button type="button" onClick={() => { setIsSignup(!isSignup); setError(""); setPassword(""); }} 
            style={{ color: "var(--accent)", textDecoration: "underline", background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: "inherit", fontFamily: "inherit" }}>
            {isSignup ? "Log In" : "Sign Up"}
          </button>
        </div>

        <div style={{ marginTop: "2rem", textAlign: "center", fontSize: "0.875rem", color: "var(--text-muted)" }}>
          <Link href="/" style={{ textDecoration: "underline" }}>
            Return to Rankings
          </Link>
        </div>
      </div>
    </div>
  );
}
