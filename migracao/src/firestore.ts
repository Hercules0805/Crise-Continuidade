import * as admin from 'firebase-admin';
import * as fs from 'fs';
import { env } from './config';

let app: admin.app.App | null = null;

/**
 * Inicializa o firebase-admin.
 *
 * Usa GOOGLE_CREDENTIALS_PATH (service account JSON) e FIREBASE_PROJECT_ID.
 * Se FIRESTORE_EMULATOR_HOST estiver definido, o admin SDK conecta no emulador
 * automaticamente (útil para testes locais sem tocar em produção).
 */
export function getFirestore(): admin.firestore.Firestore {
  if (!app) {
    const projectId = env('FIREBASE_PROJECT_ID', 'bia-forte-2025');
    if (process.env.FIRESTORE_EMULATOR_HOST) {
      app = admin.initializeApp({ projectId });
    } else {
      const credPath = env('GOOGLE_CREDENTIALS_PATH');
      const serviceAccount = JSON.parse(fs.readFileSync(credPath, 'utf8'));
      app = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId,
      });
    }
  }
  return admin.firestore();
}
