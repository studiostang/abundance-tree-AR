// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: "abundance-tree.firebaseapp.com",
  projectId: "abundance-tree",
  storageBucket: "abundance-tree.firebasestorage.app",
  messagingSenderId: "893663544560",
  appId: "1:893663544560:web:e775bebf16086bbc0eee35",
  measurementId: "G-4L9YEG3DB8"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
export const db = getFirestore(app);