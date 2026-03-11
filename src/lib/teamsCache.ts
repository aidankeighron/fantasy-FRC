import { collection, getDocs, Firestore } from "firebase/firestore";

const CACHE_KEY = "frc_teams_cache";
const CACHE_DURATION_MS = 12 * 60 * 60 * 1000; // 12 hours

interface CachedData {
  timestamp: number;
  data: any[];
}

export async function getCachedRawTeams(db: Firestore): Promise<any[]> {
  if (typeof window !== "undefined") {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsedCache: CachedData = JSON.parse(cached);
        const now = Date.now();
        if (now - parsedCache.timestamp < CACHE_DURATION_MS) {
          console.log("Using cached teams data.");
          return parsedCache.data;
        }
      }
    } 
    catch (e) {
      console.warn("Failed to read teams cache from localStorage", e);
    }
  }

  // Fetch from Firestore
  console.log("Fetching teams data from Firestore...");
  const teamsSnap = await getDocs(collection(db, "teams"));
  const rawData = teamsSnap.docs.map(doc => {
    return {
      id: doc.id,
      ...doc.data()
    };
  });

  if (typeof window !== "undefined") {
    try {
      const cacheEntry: CachedData = {
        timestamp: Date.now(),
        data: rawData
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(cacheEntry));
    } 
    catch (e) {
      console.warn("Failed to save teams cache to localStorage", e);
    }
  }

  return rawData;
}
