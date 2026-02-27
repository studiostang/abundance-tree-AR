// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyA3_HOkbkYD7whfMdL9SanyDFYA-AP6CHw",
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