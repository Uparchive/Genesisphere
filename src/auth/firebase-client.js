import { firebaseConfig } from "./config.js";

const SDK_VERSION = "12.11.0";
const cdn = `https://www.gstatic.com/firebasejs/${SDK_VERSION}`;

export async function createFirebaseAuth() {
  const [appSdk, authSdk] = await Promise.all([
    import(`${cdn}/firebase-app.js`),
    import(`${cdn}/firebase-auth.js`)
  ]);
  const app = appSdk.initializeApp(firebaseConfig);
  const auth = authSdk.getAuth(app);
  await authSdk.setPersistence(auth, authSdk.browserLocalPersistence);
  const google = new authSdk.GoogleAuthProvider();
  google.setCustomParameters({ prompt: "select_account" });
  return {
    auth,
    onChange: callback => authSdk.onAuthStateChanged(auth, callback),
    register: (email, password) => authSdk.createUserWithEmailAndPassword(auth, email, password),
    login: (email, password) => authSdk.signInWithEmailAndPassword(auth, email, password),
    resetPassword: email => authSdk.sendPasswordResetEmail(auth, email),
    setRememberMe: remember => authSdk.setPersistence(auth, remember ? authSdk.browserLocalPersistence : authSdk.browserSessionPersistence),
    googleLogin: () => authSdk.signInWithPopup(auth, google),
    logout: () => authSdk.signOut(auth)
  };
}
