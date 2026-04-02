import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';

export async function loadSettings(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.data()?.settings || {};
}

export async function saveSettings(uid, settings) {
  await setDoc(
    doc(db, 'users', uid),
    { settings, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

export async function exportUserData(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  const data = snap.exists() ? snap.data() : {};
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `agentcalls-data-${uid}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function revokeAllSessions(token) {
  const res = await fetch(
    `${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/auth/revoke`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to revoke sessions');
  }
}
