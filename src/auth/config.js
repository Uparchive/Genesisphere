// Copy the Firebase web configuration from Firebase Console > Project settings.
// These are public client identifiers, not private credentials.
export const firebaseConfig = {
  enabled: false,
  apiKey: "",
  authDomain: "",
  projectId: "",
  appId: ""
};

// Set this to the deployed Cloudflare Worker base URL (for example,
// https://genesisphere-api.<account>.workers.dev). Keep empty until configured.
export const cloudflareApiBaseUrl = "";

export const authReady = Boolean(
  firebaseConfig.enabled && firebaseConfig.apiKey && firebaseConfig.authDomain &&
  firebaseConfig.projectId && firebaseConfig.appId && cloudflareApiBaseUrl
);
