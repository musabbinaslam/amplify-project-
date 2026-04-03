import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';

export async function saveOnboarding(uid, data) {
  await setDoc(
    doc(db, 'users', uid),
    {
      onboarding: {
        phone: data.phone || '',
        weeklySpend: data.weeklySpend || '',
        usedInbound: data.usedInbound || '',
        verticals: data.verticals || '',
        hearAbout: data.hearAbout || '',
        completedAt: new Date().toISOString(),
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function getOnboarding(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.data()?.onboarding || null;
}
