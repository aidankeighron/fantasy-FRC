import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { db } from "./config";
import { requireAdmin } from "./utils";

export const toggleTeamPickingLock = functions.https.onCall(async (data, context) => {
  await requireAdmin(context);
  
  const dsRef = db.collection("draft_state").doc("global");
  const dsSnap = await dsRef.get();
  
  let currentLock = false;
  if (dsSnap.exists) {
    currentLock = dsSnap.data()?.team_picking_locked || false;
  }
  
  const newLockStatus = !currentLock;
  
  await dsRef.set({
    team_picking_locked: newLockStatus
  }, { merge: true });
  
  return { success: true, locked: newLockStatus };
});

export const deleteUserAccount = functions.https.onCall(async (data, context) => {
  await requireAdmin(context);
  
  const { uid } = data;
  if (typeof uid !== "string" || !uid) {
    throw new functions.https.HttpsError("invalid-argument", "Invalid user ID.");
  }
  
  if (uid === context.auth!.uid) {
    throw new functions.https.HttpsError("invalid-argument", "Cannot delete your own account.");
  }
  
  await admin.auth().deleteUser(uid);
  await db.collection("users").doc(uid).delete();
  return { success: true };
});

export const toggleUserAdmin = functions.https.onCall(async (data, context) => {
  await requireAdmin(context);
  
  if (typeof data.userId !== "string" || !data.userId) {
    throw new functions.https.HttpsError("invalid-argument", "Invalid user ID.");
  }
  
  if (data.userId === context.auth!.uid) {
    throw new functions.https.HttpsError("invalid-argument", "Cannot modify your own admin status.");
  }
  
  const userRef = db.collection("users").doc(data.userId);
  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    throw new functions.https.HttpsError("not-found", "User not found.");
  }
  
  const currentStatus = userSnap.data()?.isAdmin || false;
  await userRef.update({ isAdmin: !currentStatus });
  return { success: true, isAdmin: !currentStatus };
});
