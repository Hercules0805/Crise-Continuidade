// ============================================================
// CONFIGURAÇÃO - URL da API do Google Apps Script
// ============================================================
const API_URL = 'https://script.google.com/macros/s/AKfycbz7NAIYV3DYGnaJI9ILs4hdjK7PL15k1TKfLmhvMQDgZR9wODrgf5o97FoJteu-i3rf/exec';

// ============================================================
// CONFIGURAÇÃO - Cloud Function de tokens externos (páginas públicas sem login)
// Atualize se a região/projeto mudar. Formato:
//   https://<region>-<projectId>.cloudfunctions.net/tokenApi
// ============================================================
const TOKEN_API_URL = 'https://us-central1-bia-forte-2025.cloudfunctions.net/tokenApi';

// ============================================================
// CONFIGURAÇÃO - Firebase
// ============================================================
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBYbL-91dHyFcRGHfplHLH2sij0xijJs-s",
  authDomain: "bia-forte-2025.firebaseapp.com",
  projectId: "bia-forte-2025",
  storageBucket: "bia-forte-2025.firebasestorage.app",
  messagingSenderId: "547222415029",
  appId: "1:547222415029:web:7b5243bb5560777f1f40fc"
};
