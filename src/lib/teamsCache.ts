import { collection, getDocs, Firestore, query, where } from "firebase/firestore";

const CACHE_KEY = "frc_teams_cache";
const CACHE_DURATION_MS = 12 * 60 * 60 * 1000; // 12 hours

interface CachedData {
  timestamp: number;
  activeYear: string;
  data: any[];
}

export async function getCachedRawTeams(db: Firestore, activeYear?: string): Promise<any[]> {
  const cacheKey = activeYear ? `${CACHE_KEY}_${activeYear}` : CACHE_KEY;
  
  if (typeof window !== "undefined") {
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsedCache: CachedData = JSON.parse(cached);
        const now = Date.now();
        if (now - parsedCache.timestamp < CACHE_DURATION_MS) {
          console.log(`Using cached teams data for year: ${activeYear || "unknown"}`);
          return parsedCache.data;
        }
      }
    }
    catch (e) {
      console.warn("Failed to read teams cache from localStorage", e);
    }
  }

  // Fetch from Firestore
  console.log(`Fetching teams data from Firestore for year: ${activeYear || "all"}...`);
  const teamsCollection = collection(db, "teams");
  const q = activeYear 
    ? query(teamsCollection, where("activeYears", "array-contains", activeYear))
    : teamsCollection;
  
  const teamsSnap = await getDocs(q);
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
        activeYear: activeYear || "",
        data: rawData
      };
      localStorage.setItem(cacheKey, JSON.stringify(cacheEntry));
    }
    catch (e) {
      console.warn("Failed to save teams cache to localStorage", e);
    }
  }

  return rawData;
}
