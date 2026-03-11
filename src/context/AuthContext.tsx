"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { onAuthStateChanged, User as FirebaseUser } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";

interface AppUser {
  uid: string;
  email: string | null;
  username: string;
  isAdmin: boolean;
  teams: string[];
}

interface AuthContextType {
  user: AppUser | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
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
  
  return (
    <AuthContext.Provider value={{ user, loading }}>
    {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
