import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
  getDatabase,
  ref,
  set
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyA-wwrQoRTPGXc88C5DL9Nsn8cDSHHec-M",
  authDomain: "cipherroom-1df90.firebaseapp.com",
  databaseURL: "https://cipherroom-1df90-default-rtdb.firebaseio.com",
  projectId: "cipherroom-1df90",
  storageBucket: "cipherroom-1df90.firebasestorage.app",
  messagingSenderId: "680842122870",
  appId: "1:680842122870:web:52d26a3eb881ffd4f97157",
  measurementId: "G-YSYJ26PSJC"
};

const app = initializeApp(firebaseConfig);

const db = getDatabase(app);

set(ref(db, "test"), {
  message: "CipherRoom Connected!"
});

console.log("Firebase connected successfully!");
