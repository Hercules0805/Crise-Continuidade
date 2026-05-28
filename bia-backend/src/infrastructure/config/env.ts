import 'dotenv/config';

export interface EnvConfig {
  port: number;
  nodeEnv: string;

  // Database
  databaseUrl: string;

  // Firebase
  firebaseProjectId: string;
  firebaseServiceAccount: string;

  // SMTP
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;

  // CORS
  corsOrigin: string;

  // Notifications
  notificationEmail: string;

  // Token
  tokenBaseUrl: string;
}

function getEnvOrDefault(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function buildDatabaseUrl(): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const host = getEnvOrDefault('DB_HOST', 'localhost');
  const port = getEnvOrDefault('DB_PORT', '5432');
  const name = getEnvOrDefault('DB_NAME', 'bia_db');
  const user = getEnvOrDefault('DB_USER', 'user');
  const password = getEnvOrDefault('DB_PASSWORD', 'password');

  return `postgresql://${user}:${password}@${host}:${port}/${name}`;
}

export const env: EnvConfig = {
  port: parseInt(getEnvOrDefault('PORT', '3000'), 10),
  nodeEnv: getEnvOrDefault('NODE_ENV', 'development'),

  databaseUrl: buildDatabaseUrl(),

  firebaseProjectId: getEnvOrDefault('FIREBASE_PROJECT_ID', ''),
  firebaseServiceAccount: getEnvOrDefault('FIREBASE_SERVICE_ACCOUNT', './firebase-service-account.json'),

  smtpHost: getEnvOrDefault('SMTP_HOST', 'smtp.example.com'),
  smtpPort: parseInt(getEnvOrDefault('SMTP_PORT', '587'), 10),
  smtpUser: getEnvOrDefault('SMTP_USER', ''),
  smtpPass: getEnvOrDefault('SMTP_PASS', ''),

  corsOrigin: getEnvOrDefault('CORS_ORIGIN', 'https://bia-forte-2025.web.app'),

  notificationEmail: getEnvOrDefault('NOTIFICATION_EMAIL', ''),

  tokenBaseUrl: getEnvOrDefault('TOKEN_BASE_URL', 'http://localhost:3000'),
};
