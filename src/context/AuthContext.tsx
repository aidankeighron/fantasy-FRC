"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { onAuthStateChanged, User as FirebaseUser } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";

interface SeasonData {
  teams: string[];
  score: number;
  rank: number;
}

interface H2HYearData {
  totalWins: number;
  totalLosses: number;
  totalTies: number;
  totalBonusPoints: number;
  weeks: Record<string, any>;
}

interface AppUser {
  uid: string;
  email: string | null;
  username: string;
  isAdmin: boolean;
  teams: string[];
  seasons?: Record<string, SeasonData>;
  h2h?: Record<string, H2HYearData>;
}

interface AuthContextType {
  user: AppUser | null;
  loading: boolean;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  refreshUser: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      if (firebaseUser) {
        try {
          // Fetch user details from Firestore
          const userDocRef = doc(db, "users", firebaseUser.uid);
          const userDoc = await getDoc(userDocRef);
          let userData = userDoc.exists() ? userDoc.data() : null;
          
          if (!userData) {
            // Create user document if it doesn't exist (e.g., manually created in console)
            userData = {
              email: firebaseUser.email,
              username: "Player" + Math.floor(Math.random() * 100000),
              isAdmin: false,
              teams: [],
              score: 0,
              rank: 0,
              createdAt: new Date().toISOString(),
            };
            await setDoc(userDocRef, userData);
          }
          
          setUser({
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            username: userData?.username || firebaseUser.email?.split("@")[0] || "Unknown",
            isAdmin: userData?.isAdmin || false,
            teams: userData?.teams || [],
            seasons: userData?.seasons || {},
            h2h: userData?.h2h || {},
          });
        }
        catch (error) {
          console.error("Error fetching user data:", error);
          setUser({
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            username: firebaseUser.email?.split("@")[0] || "Unknown",
            isAdmin: false,
            teams: [],
          });
        }
      } 
      else {
        setUser(null);
      }
      setLoading(false);
    });
    
    return () => unsubscribe();
  }, []);

  const refreshUser = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    try {
      const userDocRef = doc(db, "users", currentUser.uid);
      const userDoc = await getDoc(userDocRef);
      if (userDoc.exists()) {
        const userData = userDoc.data();
        setUser({
          uid: currentUser.uid,
          email: currentUser.email,
          username: userData.username || currentUser.email?.split("@")[0] || "Unknown",
          isAdmin: userData.isAdmin || false,
          teams: userData.teams || [],
          seasons: userData.seasons || {},
          h2h: userData.h2h || {},
        });
      }
    } catch (error) {
      console.error("Error refreshing user data:", error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, refreshUser }}>
    {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
