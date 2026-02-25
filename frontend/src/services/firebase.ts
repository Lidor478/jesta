/**
 * @file firebase.ts
 * @description Firebase JS SDK initialization for web + native.
 * Reads config from EXPO_PUBLIC_FIREBASE_* environment variables.
 *
 * @hebrew אתחול Firebase JS SDK — עובד גם בווב וגם בנייטיב
 */

import { initializeApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? '',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? '',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? '',
};

let app: FirebaseApp;
let firebaseAuth: Auth;

try {
  app = initializeApp(firebaseConfig);
  firebaseAuth = getAuth(app);
} catch (err) {
  console.warn('[Firebase] Init failed — missing config? Auth will not work.', err);
  // Create a dummy app so imports don't crash the entire UI
  app = initializeApp({ apiKey: 'dummy', projectId: 'dummy', appId: 'dummy' }, 'fallback');
  firebaseAuth = getAuth(app);
}

export { firebaseAuth };
export const isDevAuth = process.env.EXPO_PUBLIC_DEV_AUTH === 'true';
export default app;
