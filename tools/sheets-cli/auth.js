import fs from 'fs/promises';
import path from 'path';
import { authenticate } from '@google-cloud/local-auth';
import { google } from 'googleapis';

// Scopes required for the API
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

// Paths for credentials and token
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');
const TOKEN_PATH = path.join(process.cwd(), 'token.json');

/**
 * Load saved credentials if they exist
 * Combines refresh token with client secrets from credentials.json
 */
async function loadSavedCredentials() {
  try {
    // Read token (contains only refresh_token)
    const tokenContent = await fs.readFile(TOKEN_PATH);
    const token = JSON.parse(tokenContent);

    // Read credentials to get client_id and client_secret
    const credContent = await fs.readFile(CREDENTIALS_PATH);
    const keys = JSON.parse(credContent);
    const key = keys.installed || keys.web;

    // Combine token with client credentials (but don't save client_secret to token)
    const credentials = {
      type: 'authorized_user',
      client_id: key.client_id,
      client_secret: key.client_secret,
      refresh_token: token.refresh_token,
    };

    return google.auth.fromJSON(credentials);
  } catch (err) {
    return null;
  }
}

/**
 * Save credentials to disk for future use
 * Only saves refresh_token, not client_secret (security)
 */
async function saveCredentials(client) {
  // Only save refresh_token, NOT client_secret
  const payload = JSON.stringify({
    type: 'authorized_user',
    refresh_token: client.credentials.refresh_token,
  });
  await fs.writeFile(TOKEN_PATH, payload);
}

/**
 * Authenticate with Google Sheets API
 * Will open browser for first-time authentication
 */
export async function authorize() {
  // Check if we have saved credentials
  let client = await loadSavedCredentials();
  if (client) {
    return client;
  }

  // If not, run through OAuth flow
  client = await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  });

  if (client.credentials) {
    await saveCredentials(client);
  }

  return client;
}
