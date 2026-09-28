import { authReady, cloudflareApiBaseUrl, cloudSyncReady } from "./config.js";
import { createFirebaseAuth } from "./firebase-client.js";
import { deserializeUniverseSnapshot, serializeUniverseSnapshot } from "../core/persistence.js";
import { loadSnapshotWithRecovery, saveSnapshotWithRecovery } from "../core/snapshot-storage.js";
import { CloudflarePersistenceRepository } from "../adapters/cloudflare-persistence-repository.js";

const engine = globalThis.Genesisphere;
const runtime = globalThis.GenesisphereRuntime;
if (!engine || !runtime) throw new Error("Genesisphere não terminou de inicializar.");

function mount() {
  const style = document.createElement("style");
  style.textContent = `
    .auth-screen{position:fixed;inset:0;z-index:1000;display:grid;grid-template-columns:minmax(0,1.08fr) minmax(480px,.92fr);overflow:auto;background:#03070d url("assets/brand/genesisphere-login-scene.webp") left center/cover no-repeat;color:#f2eee8;font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif}.auth-screen[hidden],.auth-account[hidden]{display:none}
    .auth-visual{position:relative;min-height:100vh;background:transparent}.auth-visual:after{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(90deg,#02070d12 55%,#03070d50 100%),linear-gradient(0deg,#02070da8,transparent 27%,transparent 80%,#02070d22)}.auth-visual-brand{position:absolute;z-index:1;left:5%;bottom:27%;width:min(500px,44vw);text-align:center;text-shadow:0 3px 24px #000}.auth-visual-orbit{position:relative;display:block;width:76px;height:76px;margin:0 auto 20px;border:1px solid #eee9df;border-radius:50%;box-shadow:0 0 18px #d5e8ff24}.auth-visual-orbit:after{content:"";position:absolute;right:3px;top:4px;width:7px;height:7px;border-radius:50%;background:#fff3dc;box-shadow:0 0 9px #ffdda4}.auth-visual-brand strong{display:block;color:#f7f5f0;font-size:clamp(23px,2.8vw,36px);font-weight:300;letter-spacing:.43em;text-indent:.43em;white-space:nowrap}.auth-visual-brand p{margin:20px 0 0;color:#e2e1decc;font-size:10px;line-height:2.5;letter-spacing:3.5px}.auth-visual-footer{position:absolute;z-index:1;left:7%;bottom:5%;color:#c9b899;font-size:9px;line-height:2;letter-spacing:3px;text-shadow:0 2px 15px #000}
    .auth-topline{position:fixed;z-index:2;top:52px;right:7%;color:#e6e1d9b8;font-size:10px;letter-spacing:3px;white-space:nowrap}
    .auth-shell{position:relative;display:grid;place-items:center;min-height:100vh;padding:78px 38px 46px;background:linear-gradient(90deg,#03070d22 0%,#03070d9c 28%,#03070dea 100%)}
    .auth-card{width:min(100%,548px);padding:38px 42px 34px;border:1px solid #c8d1d532;border-radius:22px;background:linear-gradient(145deg,#101a20ed,#060c12f2 72%);box-shadow:0 30px 100px #0009,inset 0 1px #ffffff08;backdrop-filter:blur(18px)}
    .auth-logo{display:block;width:min(235px,72%);height:auto;max-height:146px;margin:0 auto 3px;object-fit:contain;mix-blend-mode:screen}.auth-kicker{display:block;margin:0 auto 34px;text-align:center;color:#c3c9cbad;font-size:9px;font-weight:500;line-height:1.9;letter-spacing:3.4px;text-transform:uppercase}.auth-card h1{margin:0 0 7px;text-align:center;font-size:25px;font-weight:500;letter-spacing:.3px}.auth-card p{margin:0;text-align:center;color:#b3b7b7;font-size:13px;line-height:1.55}
    .auth-form{display:grid;gap:15px;margin-top:32px}.auth-field{position:relative;display:flex;align-items:center;min-height:56px;border:1px solid #d5dce133;border-radius:13px;background:#0a1219a8;transition:border-color .18s,box-shadow .18s}.auth-field:focus-within{border-color:#c9d4dc8a;box-shadow:0 0 0 3px #c9d4dc0c}.auth-field-icon{flex:0 0 20px;width:20px;height:20px;margin-left:18px;color:#dedbd2}.auth-field input{width:100%;min-width:0;height:54px;padding:0 14px;border:0;background:transparent;color:#f5f2ec;font:inherit;font-size:14px;outline:0}.auth-field input::placeholder{color:#b0b8b9a8}.auth-password-toggle{flex:0 0 42px;width:42px;height:42px;margin-right:5px;border:0;border-radius:9px;background:transparent;color:#9da8ac;cursor:pointer}
    .auth-options{display:flex;justify-content:space-between;align-items:center;gap:12px;margin:1px 0 4px;color:#ddd;font-size:11px}.auth-options[hidden]{display:none}.auth-remember{display:flex;align-items:center;gap:8px;cursor:pointer}.auth-remember input{width:17px;height:17px;accent-color:#e9dbc4}.auth-link{padding:0;border:0;background:none;color:#d9c6a8;font:inherit;cursor:pointer;text-decoration:none}.auth-link:hover{color:#fff1d7;text-decoration:underline}
    .auth-button{min-height:48px;border:1px solid #ffffff25;border-radius:12px;background:#101921;color:#f1eee8;padding:11px 14px;font:600 13px system-ui,sans-serif;cursor:pointer;transition:filter .16s,transform .16s}.auth-button:hover{filter:brightness(1.12)}.auth-button:active{transform:translateY(1px)}.auth-button.primary{min-height:52px;border-color:#f6ead0;background:linear-gradient(105deg,#fbf0dc,#d7c7b0);border-radius:999px;color:#141517;font-size:14px}.auth-button:disabled{opacity:.55;cursor:wait}
    .auth-separator{display:flex;align-items:center;gap:18px;margin:17px 0 8px;color:#aeb3b3;font-size:12px}.auth-separator:before,.auth-separator:after{content:"";height:1px;flex:1;background:#ffffff20}.auth-google{display:flex;justify-content:center;align-items:center;gap:11px;width:100%;min-height:48px;border:1px solid #d4dce02e;border-radius:12px;background:#ffffff05;color:#e7e8e4;font-size:13px}.auth-google svg{width:20px;height:20px}
    .auth-switch{margin-top:26px;text-align:center;color:#aeb5b5;font-size:12px}.auth-switch .auth-link{margin-left:10px;font-size:13px;font-weight:600}
    .auth-error{min-height:18px;margin-top:11px;color:#ffad9b;font-size:12px;text-align:center}.auth-error.is-success{color:#a8e4c1}
    .auth-account{position:relative;z-index:14;display:flex;align-items:center}.auth-account[hidden]{display:none!important}.auth-account-toggle{display:grid;place-items:center;width:38px;height:40px;border:1px solid #ffffff24;border-radius:10px;background:#0b1728;color:#bdeaff;cursor:pointer}.auth-account-toggle svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}.auth-account-menu[hidden]{display:none}.auth-account-menu{position:absolute;z-index:16;left:50%;bottom:calc(100% + 10px);transform:translateX(-50%);width:min(205px,calc(100vw - 20px));padding:9px;border:1px solid #75c9ff70;border-radius:13px;background:#07101df5;box-shadow:0 14px 42px #000a;backdrop-filter:blur(14px)}.auth-account-menu span{display:block;overflow:hidden;padding:7px 8px 10px;color:#9fb4d1;font-size:11px;text-overflow:ellipsis;white-space:nowrap;border-bottom:1px solid #ffffff18}.auth-account-menu button{width:100%;margin-top:7px;padding:9px;border:1px solid #ffffff1b;border-radius:8px;background:#251716;color:#ffd9cf;text-align:left;font:700 11px system-ui,sans-serif;cursor:pointer}.auth-account-menu button:hover{background:#46201b}
    @media(max-width:1000px){.auth-screen{grid-template-columns:minmax(0,1fr) minmax(420px,.95fr)}.auth-visual-brand{left:3%;width:min(430px,45vw)}.auth-card{padding:32px 30px}.auth-topline{right:5%;font-size:9px;letter-spacing:2px}}
    @media(max-width:760px){.auth-screen{display:block;overflow:auto;background:#03070d url("assets/brand/genesisphere-login-scene.webp") 38% center/cover no-repeat}.auth-visual{position:absolute;inset:0;min-height:100%;background:transparent}.auth-visual-brand,.auth-visual-footer{display:none}.auth-visual:after{background:linear-gradient(90deg,#02070d33,#02070da8),linear-gradient(0deg,#02070df2 0%,#02070d38 58%,#02070d45)}.auth-topline{display:none}.auth-shell{position:relative;min-height:100svh;padding:22px 15px;background:transparent}.auth-card{width:min(100%,490px);padding:29px 24px 25px;border-radius:19px;background:#071019dc;backdrop-filter:blur(18px)}.auth-logo{width:min(205px,68%);max-height:128px}.auth-kicker{margin-bottom:24px;font-size:8px;letter-spacing:2.8px}.auth-card h1{font-size:22px}.auth-form{gap:12px;margin-top:25px}.auth-account-toggle{width:32px;height:38px}}
    @media(max-width:380px){.auth-card{padding:25px 18px 22px}.auth-options{font-size:10px}.auth-field{min-height:52px}.auth-field input{height:50px}.auth-account-toggle{width:26px;height:36px}}
  `;

  document.head.append(style);
  const screen = document.createElement("section");
  screen.className = "auth-screen";
  screen.hidden = false;
  screen.setAttribute("aria-label", "Acesso ao Genesisphere");
  screen.innerHTML = `<aside class="auth-visual" aria-label="Genesisphere, pessoas, ideias e impacto em um só planeta"><div class="auth-topline">CONECTAR&nbsp; · &nbsp;COLABORAR&nbsp; · &nbsp;TRANSFORMAR</div><div class="auth-visual-brand"><span class="auth-visual-orbit" aria-hidden="true"></span><strong>GENESISPHERE</strong><p>PESSOAS&nbsp; · &nbsp;IDEIAS&nbsp; · &nbsp;IMPACTO<br>EM UM SÓ PLANETA</p></div><div class="auth-visual-footer">CONSTRUINDO<br>UM AMANHÃ MAIS HUMANO</div></aside><main class="auth-shell"><section class="auth-card" aria-label="Entrar no Genesisphere"><img class="auth-logo" src="assets/brand/genesisphere-logo.webp" alt="Genesisphere"><span class="auth-kicker">Um ecossistema para<br>um futuro compartilhado</span><h1 id="authTitle">Entre no seu universo</h1><p id="authIntro">Acesse sua conta para continuar de onde parou.</p><form id="authForm" class="auth-form"><label class="auth-field"><svg class="auth-field-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="m4 7 8 6 8-6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg><input id="authEmail" type="email" autocomplete="email" required maxlength="254" placeholder="Seu e-mail" aria-label="Seu e-mail"></label><label class="auth-field"><svg class="auth-field-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M8 10V7a4 4 0 1 1 8 0v3m-4 5v2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg><input id="authPassword" type="password" autocomplete="current-password" required minlength="6" maxlength="128" placeholder="Sua senha" aria-label="Sua senha"><button id="authPasswordToggle" class="auth-password-toggle" type="button" aria-label="Mostrar senha" title="Mostrar senha"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true"><path d="M2.5 12s3.3-6 9.5-6 9.5 6 9.5 6-3.3 6-9.5 6-9.5-6-9.5-6Z" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="12" r="2.5" stroke="currentColor" stroke-width="1.5"/></svg></button></label><div id="authOptions" class="auth-options"><label class="auth-remember"><input id="authRemember" type="checkbox" checked><span>Lembrar de mim</span></label><button id="authForgot" class="auth-link" type="button">Esqueceu sua senha?</button></div><button class="auth-button primary" id="authSubmit" type="submit"><span id="authSubmitText">Entrar</span><span aria-hidden="true" style="margin-left:12px;font-size:19px">→</span></button></form><div class="auth-separator">Ou continue com</div><button class="auth-button auth-google" id="authGoogle" type="button" aria-label="Continuar com Google"><svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5.1h6.7c3.9-3.6 6-8.9 6-15Z"/><path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.8l-6.7-5.1c-1.9 1.3-4.1 2-6.8 2-5.2 0-9.7-3.5-11.3-8.2H5.8v5.2A20 20 0 0 0 24 44Z"/><path fill="#FBBC05" d="M12.7 27.9a12 12 0 0 1 0-7.8v-5.2H5.8a20 20 0 0 0 0 18.2l6.9-5.2Z"/><path fill="#EA4335" d="M24 12c3 0 5.7 1 7.8 3l5.9-5.9A19.6 19.6 0 0 0 24 4 20 20 0 0 0 5.8 14.9l6.9 5.2C14.3 15.5 18.8 12 24 12Z"/></svg>Continuar com Google</button><div id="authError" class="auth-error" role="alert" aria-live="polite"></div><div class="auth-switch"><span id="authSwitchText">Ainda não tem uma conta?</span><button id="authSwitch" class="auth-link" type="button">Criar agora</button></div></section></main>`;
  document.body.append(screen);
  document.querySelector("#game").inert = true;
  const account = document.createElement("div");
  account.className = "auth-account";
  account.hidden = true;
  account.innerHTML = `<button id="authAccountToggle" class="auth-account-toggle" type="button" aria-label="Abrir menu da conta" aria-expanded="false" title="Conta"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M4.5 20c.7-4 3.3-6 7.5-6s6.8 2 7.5 6"/></svg></button><div id="authAccountMenu" class="auth-account-menu" role="menu" hidden><span id="authUserLabel"></span><button type="button" id="authLogout" role="menuitem">Sair da conta</button></div>`;
  (document.querySelector("#accountAnchor") || document.body).append(account);
  return { screen, account };
}

function messageFor(error) {
  const code = error?.code || "";
  if (code.includes("email-already-in-use")) return "Este e-mail já tem uma conta. Entre em vez de criar outra.";
  if (code.includes("invalid-credential") || code.includes("user-not-found") || code.includes("wrong-password")) return "E-mail ou senha incorretos.";
  if (code.includes("weak-password")) return "Escolha uma senha com pelo menos 6 caracteres.";
  if (code.includes("popup-closed-by-user")) return "A janela do Google foi fechada antes da conclusão.";
  if (code.includes("unauthorized-domain")) return "Adicione o domínio atual à lista de domínios autorizados do Firebase.";
  if (code.includes("network-request-failed")) return "Não foi possível conectar. Verifique sua internet.";
  return "Não foi possível autenticar. Verifique a configuração do Firebase.";
}

function snapshot() {
  return serializeUniverseSnapshot({
    simulationTime: runtime.getSimulationTime(),
    timeScale: runtime.getTimeScale(),
    paused: runtime.getPaused(),
    world: engine.world.snapshot(),
    gravity: runtime.collisions.snapshot()
  });
}

function restore(value) {
  const state = deserializeUniverseSnapshot(value);
  engine.world.restore(state.world);
  runtime.collisions.restore(state.gravity);
  runtime.setSimulationTime(state.simulationTime);
  runtime.setTimeScale(state.timeScale);
  runtime.setPaused(state.paused);
}

async function start() {
  if (!authReady) {
    console.info("Firebase/Cloudflare ainda não configurados; o modo de demonstração continua ativo.");
    return;
  }
  const { screen, account } = mount();
  const accountToggle = document.querySelector("#authAccountToggle");
  const accountMenu = document.querySelector("#authAccountMenu");
  accountToggle.addEventListener("click", () => { const open = accountMenu.hidden; accountMenu.hidden = !open; accountToggle.setAttribute("aria-expanded", String(open)); });
  document.addEventListener("pointerdown", event => { if (!account.contains(event.target)) { accountMenu.hidden = true; accountToggle.setAttribute("aria-expanded", "false"); } });
  document.addEventListener("keydown", event => { if (event.key === "Escape") { accountMenu.hidden = true; accountToggle.setAttribute("aria-expanded", "false"); } });
  const title = document.querySelector("#authTitle");
  const intro = document.querySelector("#authIntro");
  const form = document.querySelector("#authForm");
  const email = document.querySelector("#authEmail");
  const password = document.querySelector("#authPassword");
  const submit = document.querySelector("#authSubmit");
  const google = document.querySelector("#authGoogle");
  const remember = document.querySelector("#authRemember");
  const options = document.querySelector("#authOptions");
  const forgot = document.querySelector("#authForgot");
  const passwordToggle = document.querySelector("#authPasswordToggle");
  const submitText = document.querySelector("#authSubmitText");
  const error = document.querySelector("#authError");
  const switchText = document.querySelector("#authSwitchText");
  const switchButton = document.querySelector("#authSwitch");
  let creating = false;
  let saveTimer = 0;
  let syncTimer = 0;
  let saveInFlight = false;
  let saveRequested = false;
  let persistenceRevision = 0;
  let unbindWorld = [];
  let activeUserId = null;
  const persistenceUniverseId = engine.world.all().find(entity => entity.type === "cosmic.universe")?.id || "default";
  const setBusy = busy => { for (const button of [submit, google, switchButton]) button.disabled = busy; };
  function mode() {
    title.textContent = creating ? "Crie seu universo" : "Entre no seu universo";
    intro.textContent = cloudSyncReady
      ? (creating ? "Sua conta guarda o universo que você construir." : "Acesse para continuar de onde parou.")
      : (creating ? "Crie sua conta para começar. O universo ficará salvo neste navegador." : "Entre para continuar. O universo fica salvo neste navegador.");
    submitText.textContent = creating ? "Criar conta" : "Entrar";
    options.hidden = creating;
    password.autocomplete = creating ? "new-password" : "current-password";
    switchText.textContent = creating ? "Já tem uma conta?" : "Ainda não tem conta?";
    switchButton.textContent = creating ? "Entrar" : "Criar conta";
  }
  async function loadForUser(user) {
    error.textContent = "";
    screen.hidden = false;
    account.hidden = true;
    document.querySelector("#game").inert = true;
    const localKey = `genesisphere:universe:${encodeURIComponent(user.uid)}`;
    try {
      if (cloudSyncReady) {
        const repository = new CloudflarePersistenceRepository({ baseUrl: cloudflareApiBaseUrl, getCurrentUser: () => user });
        const result = await repository.load({ userId: user.uid, universeId: persistenceUniverseId });
        persistenceRevision = result.revision || 0;
        if (result.snapshot) restore(result.snapshot);
        else {
          const saved = loadSnapshotWithRecovery(localStorage, localKey).snapshot;
          if (saved) restore(saved);
          const savedResult = await repository.save({ userId: user.uid, universeId: persistenceUniverseId, snapshot: snapshot(), expectedRevision: persistenceRevision, operationId: crypto.randomUUID() });
          persistenceRevision = savedResult.revision;
        }
      } else {
        const saved = loadSnapshotWithRecovery(localStorage, localKey).snapshot;
        if (saved) restore(saved);
        else saveSnapshotWithRecovery(localStorage, localKey, snapshot());
      }
      activeUserId = user.uid;
      document.querySelector("#authUserLabel").textContent = user.displayName || user.email || "Meu universo";
      screen.hidden = true;
      account.hidden = false;
      document.querySelector("#game").inert = false;
      unbindWorld.forEach(unbind => unbind());
      unbindWorld = [engine.bus.on("entity:created", scheduleSave), engine.bus.on("entity:updated", scheduleSave), engine.bus.on("entity:destroyed", scheduleSave)];
      clearInterval(syncTimer);
      syncTimer = window.setInterval(() => { if (activeUserId === user.uid) saveNow(); }, 30000);
    } catch (reason) {
      activeUserId = null;
      screen.hidden = false;
      error.textContent = `Falha ao carregar o universo: ${reason.message}`;
      document.querySelector("#game").inert = false;
    }
  }
  async function saveNow() {
    if (!activeUserId) return;
    if (saveInFlight) { saveRequested = true; return; }
    const user = globalAuth.auth.currentUser;
    if (!user || user.uid !== activeUserId) return;
    saveInFlight = true;
    do {
      saveRequested = false;
      try {
        const value = snapshot();
        if (cloudSyncReady) {
          const repository = new CloudflarePersistenceRepository({ baseUrl: cloudflareApiBaseUrl, getCurrentUser: () => globalAuth.auth.currentUser });
          const result = await repository.save({ userId: user.uid, universeId: persistenceUniverseId, snapshot: value, expectedRevision: persistenceRevision, operationId: crypto.randomUUID() });
          persistenceRevision = result.revision;
        }
        else saveSnapshotWithRecovery(localStorage, `genesisphere:universe:${encodeURIComponent(user.uid)}`, value);
      } catch (reason) { console.error("Universe autosave failed", reason); }
    } while (saveRequested && activeUserId === user.uid);
    saveInFlight = false;
  }
  function scheduleSave() {
    if (!activeUserId) return;
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      const user = globalAuth.auth.currentUser;
      if (user?.uid === activeUserId) saveNow();
    }, 1200);
  }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") saveNow(); });
  window.addEventListener("pagehide", () => saveNow());
  let globalAuth;
  try {
    globalAuth = await createFirebaseAuth();
    globalAuth.onChange(user => {
      if (user) { if (activeUserId !== user.uid) loadForUser(user); }
      else { activeUserId = null; clearInterval(syncTimer); unbindWorld.forEach(unbind => unbind()); unbindWorld = []; account.hidden = true; screen.hidden = false; document.querySelector("#game").inert = false; }
    });
  } catch (reason) {
    screen.hidden = false;
    error.textContent = messageFor(reason);
    console.error("Firebase initialization failed", reason);
    return;
  }
  form.addEventListener("submit", async event => {
    event.preventDefault(); error.classList.remove("is-success"); error.textContent = ""; setBusy(true);
    try {
      await globalAuth.setRememberMe(remember.checked);
      if (creating) await globalAuth.register(email.value.trim(), password.value);
      else await globalAuth.login(email.value.trim(), password.value);
    } catch (reason) { error.textContent = messageFor(reason); }
    finally { setBusy(false); }
  });
  google.addEventListener("click", async () => {
    error.textContent = ""; setBusy(true);
    try { await globalAuth.setRememberMe(remember.checked); await globalAuth.googleLogin(); }
    catch (reason) { error.textContent = messageFor(reason); }
    finally { setBusy(false); }
  });
  passwordToggle.addEventListener("click", () => {
    const showing = password.type === "password";
    password.type = showing ? "text" : "password";
    passwordToggle.setAttribute("aria-label", showing ? "Ocultar senha" : "Mostrar senha");
    passwordToggle.title = showing ? "Ocultar senha" : "Mostrar senha";
  });
  forgot.addEventListener("click", async () => {
    error.classList.remove("is-success");
    error.textContent = "";
    const value = email.value.trim();
    if (!value) { email.focus(); error.textContent = "Digite seu e-mail para receber o link de redefinição."; return; }
    forgot.disabled = true;
    try {
      await globalAuth.resetPassword(value);
      error.classList.add("is-success");
      error.textContent = "Se esse e-mail estiver cadastrado, você receberá um link para redefinir sua senha.";
    } catch (reason) { error.textContent = messageFor(reason); }
    finally { forgot.disabled = false; }
  });
  switchButton.addEventListener("click", () => { creating = !creating; error.classList.remove("is-success"); error.textContent = ""; mode(); });
  document.querySelector("#authLogout").addEventListener("click", async () => {
    accountMenu.hidden = true; accountToggle.setAttribute("aria-expanded", "false");
    if (activeUserId) await saveNow();
    await globalAuth.logout();
  });
  mode();
}

start();
