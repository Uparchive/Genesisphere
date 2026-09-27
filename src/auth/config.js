// Copy the Firebase web configuration from Firebase Console > Project settings.
// These are public client identifiers, not private credentials.
export const firebaseConfig = {
  enabled: true,
  apiKey: "AIzaSyBEIYEO2jjgjCtUysl_JKSIYCbPUbnCUhs",
  authDomain: "genesisphere.firebaseapp.com",
  projectId: "genesisphere",
  appId: "1:67795076008:web:5661f7aa1ec2c0f07c939d"
};

// Set this to the deployed Cloudflare Worker base URL (for example,
// https://genesisphere-api.<account>.workers.dev). Keep empty until configured.
export const cloudflareApiBaseUrl = "";

export const authReady = Boolean(
  firebaseConfig.enabled && firebaseConfig.apiKey && firebaseConfig.authDomain &&
  firebaseConfig.projectId && firebaseConfig.appId
);
export const cloudSyncReady = Boolean(authReady && cloudflareApiBaseUrl);
