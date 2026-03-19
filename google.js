const { google } = require('googleapis');
const { Config } = require('./database');

// Build OAuth2 client from env or stored config
function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

// Generate the Google login URL
function getAuthUrl() {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/business.manage',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
  });
}

// Exchange code for tokens and store them
async function handleCallback(code) {
  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);
  Config.set('google_tokens', tokens);
  client.setCredentials(tokens);

  // Fetch user info
  const oauth2 = google.oauth2({ version: 'v2', auth: client });
  const { data: userInfo } = await oauth2.userinfo.get();
  Config.set('google_user', { email: userInfo.email, name: userInfo.name, picture: userInfo.picture });

  // Fetch GBP accounts
  const accounts = await listGBPAccounts(client);
  return { userInfo, accounts };
}

// Get authenticated OAuth client with stored tokens
function getAuthenticatedClient() {
  const tokens = Config.get('google_tokens');
  if (!tokens) throw new Error('Not authenticated. Please connect Google account first.');
  const client = getOAuthClient();
  client.setCredentials(tokens);

  // Auto-refresh token handling
  client.on('tokens', (newTokens) => {
    if (newTokens.refresh_token) {
      Config.set('google_tokens', { ...tokens, ...newTokens });
    }
  });
  return client;
}

// List GBP accounts
async function listGBPAccounts(authClient) {
  try {
    const mybusiness = google.mybusinessaccountmanagement({ version: 'v1', auth: authClient });
    const res = await mybusiness.accounts.list();
    return res.data.accounts || [];
  } catch (e) {
    console.error('GBP accounts fetch error:', e.message);
    return [];
  }
}

// List locations for an account
async function listLocations(accountName) {
  const auth = getAuthenticatedClient();
  try {
    const mybusiness = google.mybusinessbusinessinformation({ version: 'v1', auth });
    const res = await mybusiness.accounts.locations.list({
      parent: accountName,
      readMask: 'name,title,storefrontAddress,websiteUri,categories',
    });
    return res.data.locations || [];
  } catch (e) {
    console.error('GBP locations fetch error:', e.message);
    return [];
  }
}

// Create a GBP post (Google calls these "localPosts")
async function createGBPPost({ locationName, title, body, ctaType, ctaUrl }) {
  const auth = getAuthenticatedClient();

  // Use the My Business Posts API
  const axios = require('axios');
  const accessToken = (await auth.getAccessToken()).token;

  // locationName format: accounts/{accountId}/locations/{locationId}
  const url = `https://mybusiness.googleapis.com/v4/${locationName}/localPosts`;

  const postBody = {
    languageCode: 'en-US',
    summary: `${title}\n\n${body}`,
    callToAction: ctaUrl ? {
      actionType: ctaType || 'LEARN_MORE',
      url: ctaUrl,
    } : undefined,
    topicType: 'STANDARD',
  };

  const res = await axios.post(url, postBody, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  return res.data;
}

// Check if we're authenticated
function isAuthenticated() {
  const tokens = Config.get('google_tokens');
  return !!tokens;
}

// Disconnect / logout
function disconnect() {
  Config.delete('google_tokens');
  Config.delete('google_user');
  Config.delete('gbp_account');
  Config.delete('gbp_location');
}

module.exports = {
  getAuthUrl,
  handleCallback,
  getAuthenticatedClient,
  listGBPAccounts,
  listLocations,
  createGBPPost,
  isAuthenticated,
  disconnect,
};
