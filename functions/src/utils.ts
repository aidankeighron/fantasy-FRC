import * as functions from "firebase-functions";
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

export async function tbaRequest(endpoint: string): Promise<any> {
  const key = tbaKey.value();
  if (!key) {
    throw new Error("TBA API Key not configured.");
  }
  
  const res = await axios.get(`${TBA_BASE_URL}${endpoint}`, {
    headers: { "X-TBA-Auth-Key": key },
  });
  return res.data;
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
