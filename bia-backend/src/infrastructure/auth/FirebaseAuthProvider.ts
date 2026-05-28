import * as admin from 'firebase-admin';
import { env } from '../config/env';
import * as fs from 'fs';

export interface DecodedToken {
  email: string;
  uid: string;
}

export class FirebaseAuthProvider {
  private app: admin.app.App | null = null;
  private initialized = false;

  constructor() {
    this.initialize();
  }

  private initialize(): void {
    try {
      const credential = this.resolveCredential();

      if (!credential) {
        console.warn(
          '[FirebaseAuthProvider] No Firebase credentials configured. Running in development mode — token verification will be skipped.'
        );
        return;
      }

      this.app = admin.initializeApp({
        credential,
        projectId: env.firebaseProjectId || undefined,
      });

      this.initialized = true;
    } catch (error) {
      console.error('[FirebaseAuthProvider] Failed to initialize Firebase Admin SDK:', error);
    }
  }

  private resolveCredential(): admin.credential.Credential | null {
    const serviceAccountValue = env.firebaseServiceAccount;

    if (!serviceAccountValue) {
      return null;
    }

    // If the value looks like JSON (starts with '{'), parse it directly
    if (serviceAccountValue.trim().startsWith('{')) {
      try {
        const serviceAccount = JSON.parse(serviceAccountValue);
        return admin.credential.cert(serviceAccount);
      } catch {
        console.error('[FirebaseAuthProvider] Failed to parse FIREBASE_SERVICE_ACCOUNT as JSON.');
        return null;
      }
    }

    // Otherwise, treat it as a file path
    try {
      if (fs.existsSync(serviceAccountValue)) {
        const fileContent = fs.readFileSync(serviceAccountValue, 'utf-8');
        const serviceAccount = JSON.parse(fileContent);
        return admin.credential.cert(serviceAccount);
      } else {
        console.warn(
          `[FirebaseAuthProvider] Service account file not found: ${serviceAccountValue}`
        );
        return null;
      }
    } catch {
      console.error(
        `[FirebaseAuthProvider] Failed to read service account file: ${serviceAccountValue}`
      );
      return null;
    }
  }

  async verifyIdToken(idToken: string): Promise<DecodedToken> {
    if (!this.initialized || !this.app) {
      // Development mode: return a mock decoded token
      console.warn('[FirebaseAuthProvider] Token verification skipped (development mode).');
      return {
        email: 'dev@fortestecnologia.com.br',
        uid: 'dev-uid',
      };
    }

    const decodedToken = await this.app.auth().verifyIdToken(idToken);
    return {
      email: decodedToken.email || '',
      uid: decodedToken.uid,
    };
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}
