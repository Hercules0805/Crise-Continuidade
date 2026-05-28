#!/usr/bin/env ts-node

/**
 * CLI entry point for running the Google Sheets → PostgreSQL migration.
 *
 * Usage:
 *   npx ts-node tools/migration/run-migration.ts
 *
 * Required environment variables:
 *   SPREADSHEET_ID          - Google Sheets spreadsheet ID
 *   GOOGLE_CREDENTIALS_PATH - Path to Google service account JSON key file
 *   DATABASE_URL            - PostgreSQL connection string (or DB_HOST, DB_PORT, etc.)
 *
 * Optional:
 *   DRY_RUN=true            - Print what would be migrated without writing to DB
 */

import 'reflect-metadata';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { AppDataSource } from '../../src/infrastructure/database/data-source';
import { SheetsMigrator } from './SheetsMigrator';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function main(): Promise<void> {
  const spreadsheetId = process.env.SPREADSHEET_ID;
  const credentialsPath = process.env.GOOGLE_CREDENTIALS_PATH;

  if (!spreadsheetId) {
    console.error('Error: SPREADSHEET_ID environment variable is required.');
    console.error('Set it to the Google Sheets spreadsheet ID to migrate from.');
    process.exit(1);
  }

  if (!credentialsPath) {
    console.error('Error: GOOGLE_CREDENTIALS_PATH environment variable is required.');
    console.error('Set it to the path of the Google service account JSON key file.');
    process.exit(1);
  }

  const resolvedCredentials = path.resolve(credentialsPath);

  console.log('=== BIA Migration Tool ===');
  console.log(`Spreadsheet ID: ${spreadsheetId}`);
  console.log(`Credentials: ${resolvedCredentials}`);
  console.log(`Database: ${process.env.DATABASE_URL ? '[from DATABASE_URL]' : `${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || '5432'}/${process.env.DB_NAME || 'bia_db'}`}`);
  console.log('');

  try {
    const migrator = new SheetsMigrator(spreadsheetId, resolvedCredentials, AppDataSource);
    const reports = await migrator.migrate();

    const totalErrors = reports.reduce((sum, r) => sum + r.errors.length, 0);

    if (totalErrors > 0) {
      console.log(`\nMigration completed with ${totalErrors} error(s).`);
      process.exit(2); // Non-zero exit for CI/CD pipelines
    } else {
      console.log('\nMigration completed successfully!');
      process.exit(0);
    }
  } catch (err: any) {
    console.error('\nFatal error during migration:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
}

main();
