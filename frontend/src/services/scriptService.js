import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';

export async function loadScriptData(uid, scriptId) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.data()?.scriptValues?.[scriptId] || {};
}

export async function saveScriptData(uid, scriptId, values) {
  await setDoc(
    doc(db, 'users', uid),
    { scriptValues: { [scriptId]: values }, updatedAt: serverTimestamp() },
    { merge: true },
  );
}
