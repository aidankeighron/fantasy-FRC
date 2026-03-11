import * as admin from "firebase-admin";
import { defineSecret } from "firebase-functions/params";

admin.initializeApp();
export const db = admin.firestore();
export const tbaKey = defineSecret("TBA_API_KEY");
export const TBA_BASE_URL = "https://www.thebluealliance.com/api/v3";
