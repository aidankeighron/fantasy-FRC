import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import axios from "axios";
import { db, tbaKey, TBA_BASE_URL } from "./config";

export async function requireAdmin(context: functions.https.CallableContext): Promise<FirebaseFirestore.DocumentData> {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Login required.");
  }
  
  const user = await db.collection("users").doc(context.auth.uid).get();
  if (!user.data()?.isAdmin) {
    throw new functions.https.HttpsError("permission-denied", "Admin only.");
  }
  
  return user.data()!;
}

export async function rateLimit(uid: string, action: string, limit: number, windowMs: number): Promise<void> {
  const now = Date.now();
  const rateLimitRef = db.collection("rate_limits").doc(`${uid}_${action}`);
  
  const doc = await rateLimitRef.get();
  const data = doc.data();
  
  if (data) {
    const { count, startTime } = data;
    if (now - startTime < windowMs) {
      if (count >= limit) {
        throw new functions.https.HttpsError("resource-exhausted", "Rate limit exceeded. Please try again later.");
      }
      await rateLimitRef.update({ count: count + 1 });
    }
    else {
      await rateLimitRef.set({ count: 1, startTime: now });
    }
  }
  else {
    await rateLimitRef.set({ count: 1, startTime: now });
  }
}

export async function tbaRequest(endpoint: string, options: { useCache?: boolean } = {}): Promise<any> {
  const key = tbaKey.value();
  if (!key) {
    throw new Error("TBA API Key not configured.");
  }
  
  const cacheRef = db.collection("tba_cache").doc(Buffer.from(endpoint).toString("base64"));
  let lastModified: string | undefined;
  let cachedData: any;
  
  if (options.useCache) {
    const cacheDoc = await cacheRef.get();
    if (cacheDoc.exists) {
      const data = cacheDoc.data();
      lastModified = data?.lastModified;
      cachedData = data?.content;
    }
  }
  
  const headers: any = { "X-TBA-Auth-Key": key };
  if (lastModified) {
    headers["If-Modified-Since"] = lastModified;
  }
  
  try {
    const res = await axios.get(`${TBA_BASE_URL}${endpoint}`, { headers, validateStatus: (status) => status < 500 });
    
    if (res.status === 304 && cachedData) {
      return cachedData;
    }
    
    if (options.useCache && res.headers["last-modified"]) {
      await cacheRef.set({
        lastModified: res.headers["last-modified"],
        content: res.data,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
    
    return res.data;
  }
  catch (e) {
    if (options.useCache && cachedData) {
      console.warn(`TBA request failed for ${endpoint}, using stale cache`, e);
      return cachedData;
    }
    throw e;
  }
}

export interface TeamAccumulator {
  oprSum: number;
  dprSum: number;
  ccwmSum: number;
  qualWins: number;
  qualMatches: number;
  elimWins: number;
  elimMatches: number;
  eventCount: number;
  maxPlayoffDepth: number;
}
