import { authReady, cloudflareApiBaseUrl } from "./config.js";
import { createFirebaseAuth } from "./firebase-client.js";

const engine = globalThis.Genesisphere;
const runtime = globalThis.GenesisphereRuntime;
if (!engine || !runtime) throw new Error("Genesisphere não terminou de inicializar.");

function mount() {
  const style = document.createElement("style");
  style.textContent = `
    .auth-screen{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:20px;background:radial-gradient(ellipse at 50% 20%,#152843,#050811 62%,#010208);font-family:system-ui,sans-serif;color:#eaf3ff}.auth-screen[hidden],.auth-account[hidden]{display:none}
    .auth-card{width:min(420px,100%);padding:30px;border:1px solid #8cc8ff3b;border-radius:20px;background:#07101ded;box-shadow:0 24px 90px #000a;backdrop-filter:blur(16px)}
    .auth-kicker{color:#7bd9ff;font-size:10px;font-weight:800;letter-spacing:3px}.auth-card h1{margin:9px 0 6px;font-size:24px}.auth-card p{color:#a9bad0;font-size:13px;line-height:1.5}
    .auth-form{display:grid;gap:11px;margin-top:22px}.auth-form label{display:grid;gap:6px;color:#cbd9eb;font-size:12px}.auth-form input{width:100%;height:43px;padding:0 12px;border:1px solid #ffffff26;border-radius:10px;background:#030913;color:#eff7ff;font:inherit;outline:none}.auth-form input:focus{border-color:#68c8ff}
    .auth-button{min-height:43px;border:1px solid #ffffff25;border-radius:10px;background:#10203a;color:#eaf3ff;padding:10px 12px;font:700 13px system-ui,sans-serif;cursor:pointer}.auth-button.primary{border-color:#63bfff75;background:linear-gradient(120deg,#166087,#3e397c)}.auth-button:disabled{opacity:.55;cursor:wait}
    .auth-separator{display:flex;align-items:center;gap:10px;margin:4px 0;color:#7e91aa;font-size:11px}.auth-separator:before,.auth-separator:after{content:"";height:1px;flex:1;background:#ffffff20}.auth-switch{margin-top:16px;text-align:center;color:#9fb3cd;font-size:12px}.auth-link{border:0;background:none;color:#85d5ff;font:inherit;text-decoration:underline;cursor:pointer}.auth-error{min-height:18px;margin-top:10px;color:#ffad9b;font-size:12px}.auth-account{position:fixed;z-index:20;right:16px;top:68px;display:flex;gap:8px;align-items:center;padding:7px 10px;border:1px solid #ffffff24;border-radius:10px;background:#050a12dd;color:#cbd9eb;font:11px system-ui,sans-serif}.auth-account button{border:0;background:none;color:#87d6ff;font:inherit;cursor:pointer}
    @media(max-width:640px){.auth-card{padding:24px}.auth-account{top:auto;bottom:75px;right:10px}}
  `;
  document.head.append(style);
  const screen = document.createElement("section");
  screen.className = "auth-screen";
  screen.hidden = false;
  screen.setAttribute("aria-label", "Acesso ao Genesisphere");
  screen.innerHTML = `<div class="auth-card"><span class="auth-kicker">GENESISPHERE · UNIVERSO PESSOAL</span><h1 id="authTitle">Entre no seu universo</h1><p id="authIntro">Crie sua conta ou entre para continuar de onde parou.</p><form id="authForm" class="auth-form"><label>E-mail<input id="authEmail" type="email" autocomplete="email" required maxlength="254"></label><label>Senha<input id="authPassword" type="password" autocomplete="current-password" required minlength="6" maxlength="128"></label><button class="auth-button primary" id="authSubmit" type="submit">Entrar</button><div class="auth-separator">ou</div><button class="auth-button" id="authGoogle" type="button">Continuar com Google</button></form><div id="authError" class="auth-error" role="alert" aria-live="polite"></div><div class="auth-switch"><span id="authSwitchText">Ainda não tem conta?</span> <button id="authSwitch" class="auth-link" type="button">Criar conta</button></div></div>`;
  document.body.append(screen);
  document.querySelector("#game").inert = true;
  const account = document.createElement("div");
  account.className = "auth-account";
  account.hidden = true;
  account.innerHTML = `<span id="authUserLabel"></span><button type="button" id="authLogout">Sair</button>`;
  document.body.append(account);
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
  return {
    version: 1,
    simulationTime: runtime.getSimulationTime(),
    timeScale: runtime.getTimeScale(),
    paused: runtime.getPaused(),
    world: engine.world.snapshot(),
    gravity: runtime.collisions.snapshot()
  };
}

function restore(value) {
  if (!value || value.version !== 1) throw new Error("Formato de universo salvo incompatível.");
  engine.world.restore(value.world);
  runtime.collisions.restore(value.gravity);
  runtime.setSimulationTime(Number.isFinite(value.simulationTime) ? value.simulationTime : 0);
}

function createWorldApi(auth) {
  const endpoint = `${cloudflareApiBaseUrl.replace(/\/$/, "")}/api/v1/world`;
  async function request(method, body) {
    const user = auth.auth.currentUser;
    if (!user) throw new Error("A sessão expirou. Entre novamente.");
    const token = await user.getIdToken();
    const response = await fetch(endpoint, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
    if (!response.ok) throw new Error(response.status === 401 ? "Sua sessão expirou. Entre novamente." : "Não foi possível acessar o universo salvo.");
    return response.json();
  }
  return { load: () => request("GET"), save: value => request("PUT", value) };
}

async function start() {
  if (!authReady) {
    console.info("Firebase/Cloudflare ainda não configurados; o modo de demonstração continua ativo.");
    return;
  }
  const { screen, account } = mount();
  const title = document.querySelector("#authTitle");
  const intro = document.querySelector("#authIntro");
  const form = document.querySelector("#authForm");
  const email = document.querySelector("#authEmail");
  const password = document.querySelector("#authPassword");
  const submit = document.querySelector("#authSubmit");
  const google = document.querySelector("#authGoogle");
  const error = document.querySelector("#authError");
  const switchText = document.querySelector("#authSwitchText");
  const switchButton = document.querySelector("#authSwitch");
  let creating = false;
  let saveTimer = 0;
  let syncTimer = 0;
  let saveInFlight = false;
  let unbindWorld = [];
  let activeUserId = null;
  const setBusy = busy => { for (const button of [submit, google, switchButton]) button.disabled = busy; };
  function mode() {
    title.textContent = creating ? "Crie seu universo" : "Entre no seu universo";
    intro.textContent = creating ? "Sua conta guarda o universo que você construir." : "Acesse para continuar de onde parou.";
    submit.textContent = creating ? "Criar conta" : "Entrar";
    password.autocomplete = creating ? "new-password" : "current-password";
    switchText.textContent = creating ? "Já tem uma conta?" : "Ainda não tem conta?";
    switchButton.textContent = creating ? "Entrar" : "Criar conta";
  }
  async function loadForUser(user) {
    error.textContent = "";
    screen.hidden = false;
    account.hidden = true;
    document.querySelector("#game").inert = true;
    const api = createWorldApi({ auth: { currentUser: user } });
    try {
      const result = await api.load();
      if (result.snapshot) restore(result.snapshot);
      else await api.save(snapshot());
      activeUserId = user.uid;
      document.querySelector("#authUserLabel").textContent = user.displayName || user.email || "Meu universo";
      screen.hidden = true;
      account.hidden = false;
      document.querySelector("#game").inert = false;
      unbindWorld.forEach(unbind => unbind());
      unbindWorld = [engine.bus.on("entity:created", scheduleSave), engine.bus.on("entity:destroyed", scheduleSave)];
      clearInterval(syncTimer);
      syncTimer = window.setInterval(() => { if (activeUserId === user.uid) saveNow(createWorldApi(globalAuth)); }, 30000);
    } catch (reason) {
      activeUserId = null;
      screen.hidden = false;
      error.textContent = `Falha ao carregar o universo: ${reason.message}`;
      document.querySelector("#game").inert = false;
    }
  }
  async function saveNow(api) {
    if (!activeUserId || saveInFlight) return;
    saveInFlight = true;
    try { await api.save(snapshot()); }
    catch (reason) { console.error("Universe autosave failed", reason); }
    finally { saveInFlight = false; }
  }
  function scheduleSave() {
    if (!activeUserId) return;
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      const user = globalAuth.auth.currentUser;
      if (user?.uid === activeUserId) saveNow(createWorldApi(globalAuth));
    }, 1200);
  }
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
    event.preventDefault(); error.textContent = ""; setBusy(true);
    try {
      if (creating) await globalAuth.register(email.value.trim(), password.value);
      else await globalAuth.login(email.value.trim(), password.value);
    } catch (reason) { error.textContent = messageFor(reason); }
    finally { setBusy(false); }
  });
  google.addEventListener("click", async () => {
    error.textContent = ""; setBusy(true);
    try { await globalAuth.googleLogin(); }
    catch (reason) { error.textContent = messageFor(reason); }
    finally { setBusy(false); }
  });
  switchButton.addEventListener("click", () => { creating = !creating; error.textContent = ""; mode(); });
  document.querySelector("#authLogout").addEventListener("click", async () => {
    if (activeUserId) await saveNow(createWorldApi(globalAuth));
    await globalAuth.logout();
  });
  mode();
}

start();
