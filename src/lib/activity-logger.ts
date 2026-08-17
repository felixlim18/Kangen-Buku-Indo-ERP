import { db } from './firebase';
import { collection, addDoc, serverTimestamp, writeBatch, doc } from 'firebase/firestore';
import { UserActivityLog } from '../types';

export const logUserActivity = async (
  userEmail: string,
  userDisplayName: string,
  userRole: string,
  action: 'CREATE' | 'UPDATE' | 'DELETE',
  entityType: 'SALES_ORDER' | 'PURCHASE_ORDER' | 'CATALOG',
  entityId: string,
  details?: string
) => {
  if (!userEmail) return;

  try {
    const newLog: UserActivityLog = {
      timestamp: serverTimestamp(),
      userEmail,
      userDisplayName: userDisplayName || userEmail,
      userRole: userRole || 'staff',
      action,
      entityType,
      entityId,
      details,
    };
    await addDoc(collection(db, 'userActivities'), newLog);
  } catch (error) {
    console.error("Error logging user activity:", error);
  }
};

/**
 * Helper to log activity when part of a batch transaction
 */
export const logUserActivityBatch = (
  batch: any, // WriteBatch
  userEmail: string,
  userDisplayName: string,
  userRole: string,
  action: 'CREATE' | 'UPDATE' | 'DELETE',
  entityType: 'SALES_ORDER' | 'PURCHASE_ORDER' | 'CATALOG',
  entityId: string,
  details?: string
) => {
  if (!userEmail) return;

  const newLog: UserActivityLog = {
    timestamp: serverTimestamp(),
    userEmail,
    userDisplayName: userDisplayName || userEmail,
    userRole: userRole || 'staff',
    action,
    entityType,
    entityId,
    details,
  };
  
  const activityRef = doc(collection(db, 'userActivities'));
  batch.set(activityRef, newLog);
};
