"use client";

import { useEffect, useState, Suspense } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc, setDoc, deleteDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function SignupForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [tokenValid, setTokenValid] = useState(false);

  useEffect(() => {
    const verifyToken = async () => {
      if (!token) {
        setError("Invalid or missing signup token.");
        setLoading(false);
        return;
      }

      try {
        const tokenDoc = await getDoc(doc(db, "signup_links", token));
        if (tokenDoc.exists()) {
          setTokenValid(true);
        } 
        else {
          setError("This signup link is invalid or has already been used.");
        }
      } 
      catch (err) {
        console.error("Token verification error:", err);
        setError("An error occurred while verifying your token.");
      } 
      finally {
        setLoading(false);
      }
    };

    verifyToken();
  }, [token]);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    if (!tokenValid || !token) {
      setError("Invalid token.");
      setSubmitting(false);
      return;
    }

    try {
      // Create user
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Create user document
      await setDoc(doc(db, "users", user.uid), {
        email: user.email,
        isAdmin: false,
        teams: [],
        score: 0,
        rank: 0,
        createdAt: new Date().toISOString(),
      });

      // Invalidate the token
      await deleteDoc(doc(db, "signup_links", token));

      router.push("/team");
    } 
    catch (err: any) {
      setError(err.message || "Failed to create account.");
    } 
    finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-center" style={{ minHeight: "80vh" }}>
        <p className="text-muted">Verifying your link...</p>
      </div>
    );
  }

  if (!tokenValid) {
    return (
      <div className="flex-center" style={{ minHeight: "80vh" }}>
        <div className="glass-panel" style={{ width: "100%", maxWidth: "400px", padding: "2rem", textAlign: "center" }}>
          <h1 style={{ color: "#f87171", fontSize: "1.5rem", marginBottom: "1rem" }}>Access Denied</h1>
          <p className="text-muted" style={{ marginBottom: "2rem" }}>{error}</p>
          <Link href="/" className="btn-primary">Return Home</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-center" style={{ minHeight: "80vh" }}>
      <div className="glass-panel" style={{ width: "100%", maxWidth: "400px", padding: "2rem" }}>
        <h1 style={{ fontSize: "1.75rem", marginBottom: "0.5rem", color: "white", textAlign: "center" }}>
          Create Account
        </h1>
        <p className="text-muted" style={{ textAlign: "center", marginBottom: "2rem" }}>
          Join Fantasy FRC using your exclusive invite link.
        </p>

        {error && (
          <div style={{ background: "rgba(225,29,72,0.1)", color: "#f87171", padding: "0.75rem", borderRadius: "8px", marginBottom: "1rem", fontSize: "0.875rem" }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSignup} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
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
              className="input-field" placeholder="••••••••" required minLength={6} />
          </div>

          <button type="submit" className="btn-primary" style={{ width: "100%", marginTop: "1rem", opacity: submitting ? 0.7 : 1 }}
            disabled={submitting} >
            {submitting ? "Creating Account..." : "Create Account"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={<div className="flex-center" style={{ minHeight: "80vh" }}><p className="text-muted">Loading...</p></div>}>
      <SignupForm />
    </Suspense>
  );
}
