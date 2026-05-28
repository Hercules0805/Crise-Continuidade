import * as fs from 'fs';

// Mock firebase-admin before importing the provider
const mockVerifyIdToken = jest.fn();
const mockInitializeApp = jest.fn();
const mockCert = jest.fn();

jest.mock('firebase-admin', () => ({
  initializeApp: (...args: unknown[]) => {
    mockInitializeApp(...args);
    return {
      auth: () => ({
        verifyIdToken: mockVerifyIdToken,
      }),
    };
  },
  credential: {
    cert: (serviceAccount: unknown) => {
      mockCert(serviceAccount);
      return { type: 'service_account' };
    },
  },
}));

jest.mock('fs');

describe('FirebaseAuthProvider', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('initialization', () => {
    it('should initialize with JSON string from environment variable', async () => {
      const serviceAccount = {
        project_id: 'test-project',
        private_key: 'test-key',
        client_email: 'test@test.iam.gserviceaccount.com',
      };

      process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify(serviceAccount);
      process.env.FIREBASE_PROJECT_ID = 'test-project';

      const { FirebaseAuthProvider } = await import(
        '../../../../src/infrastructure/auth/FirebaseAuthProvider'
      );
      const provider = new FirebaseAuthProvider();

      expect(provider.isInitialized()).toBe(true);
      expect(mockCert).toHaveBeenCalledWith(serviceAccount);
      expect(mockInitializeApp).toHaveBeenCalled();
    });

    it('should initialize with service account from file path', async () => {
      const serviceAccount = {
        project_id: 'test-project',
        private_key: 'test-key',
        client_email: 'test@test.iam.gserviceaccount.com',
      };

      process.env.FIREBASE_SERVICE_ACCOUNT = '/path/to/service-account.json';
      process.env.FIREBASE_PROJECT_ID = 'test-project';

      const mockFs = jest.requireMock('fs') as jest.Mocked<typeof fs>;
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(serviceAccount));

      const { FirebaseAuthProvider } = await import(
        '../../../../src/infrastructure/auth/FirebaseAuthProvider'
      );
      const provider = new FirebaseAuthProvider();

      expect(provider.isInitialized()).toBe(true);
      expect(mockCert).toHaveBeenCalledWith(serviceAccount);
    });

    it('should not initialize when no credentials are configured', async () => {
      process.env.FIREBASE_SERVICE_ACCOUNT = '';

      const { FirebaseAuthProvider } = await import(
        '../../../../src/infrastructure/auth/FirebaseAuthProvider'
      );
      const provider = new FirebaseAuthProvider();

      expect(provider.isInitialized()).toBe(false);
      expect(mockInitializeApp).not.toHaveBeenCalled();
    });

    it('should not initialize when service account file does not exist', async () => {
      process.env.FIREBASE_SERVICE_ACCOUNT = '/nonexistent/path.json';

      const mockFs = jest.requireMock('fs') as jest.Mocked<typeof fs>;
      mockFs.existsSync.mockReturnValue(false);

      const { FirebaseAuthProvider } = await import(
        '../../../../src/infrastructure/auth/FirebaseAuthProvider'
      );
      const provider = new FirebaseAuthProvider();

      expect(provider.isInitialized()).toBe(false);
    });

    it('should not initialize when JSON parsing fails', async () => {
      process.env.FIREBASE_SERVICE_ACCOUNT = '{ invalid json }';

      const { FirebaseAuthProvider } = await import(
        '../../../../src/infrastructure/auth/FirebaseAuthProvider'
      );
      const provider = new FirebaseAuthProvider();

      expect(provider.isInitialized()).toBe(false);
    });
  });

  describe('verifyIdToken', () => {
    it('should return decoded token with email and uid when initialized', async () => {
      const serviceAccount = {
        project_id: 'test-project',
        private_key: 'test-key',
        client_email: 'test@test.iam.gserviceaccount.com',
      };

      process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify(serviceAccount);
      process.env.FIREBASE_PROJECT_ID = 'test-project';

      mockVerifyIdToken.mockResolvedValue({
        email: 'user@fortestecnologia.com.br',
        uid: 'firebase-uid-123',
      });

      const { FirebaseAuthProvider } = await import(
        '../../../../src/infrastructure/auth/FirebaseAuthProvider'
      );
      const provider = new FirebaseAuthProvider();

      const result = await provider.verifyIdToken('valid-token');

      expect(result).toEqual({
        email: 'user@fortestecnologia.com.br',
        uid: 'firebase-uid-123',
      });
      expect(mockVerifyIdToken).toHaveBeenCalledWith('valid-token');
    });

    it('should return empty email when decoded token has no email', async () => {
      const serviceAccount = {
        project_id: 'test-project',
        private_key: 'test-key',
        client_email: 'test@test.iam.gserviceaccount.com',
      };

      process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify(serviceAccount);
      process.env.FIREBASE_PROJECT_ID = 'test-project';

      mockVerifyIdToken.mockResolvedValue({
        uid: 'firebase-uid-456',
      });

      const { FirebaseAuthProvider } = await import(
        '../../../../src/infrastructure/auth/FirebaseAuthProvider'
      );
      const provider = new FirebaseAuthProvider();

      const result = await provider.verifyIdToken('valid-token');

      expect(result).toEqual({
        email: '',
        uid: 'firebase-uid-456',
      });
    });

    it('should return dev mock token when not initialized (development mode)', async () => {
      process.env.FIREBASE_SERVICE_ACCOUNT = '';

      const { FirebaseAuthProvider } = await import(
        '../../../../src/infrastructure/auth/FirebaseAuthProvider'
      );
      const provider = new FirebaseAuthProvider();

      const result = await provider.verifyIdToken('any-token');

      expect(result).toEqual({
        email: 'dev@fortestecnologia.com.br',
        uid: 'dev-uid',
      });
      expect(mockVerifyIdToken).not.toHaveBeenCalled();
    });
  });
});
