import {initializeApp} from 'firebase/app';
import {getAuth} from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyCraN7Bn309bkSdvuc9UjyvgfwCUFYdatU",
  authDomain: "bancodosonotaapp.firebaseapp.com",
  projectId: "bancodosonotaapp",
  storageBucket: "bancodosonotaapp.firebasestorage.app",
  messagingSenderId: "270403798224",
  appId: "1:270403798224:web:61a3d5ed1d3e87d3bb0ad5"
};

const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);