"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = __importDefault(require("http"));
const crypto_1 = require("crypto");
const ws_1 = require("ws");
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;
const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || "";
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || "";
const SUPABASE_RECORDINGS_BUCKET = process.env.SUPABASE_RECORDINGS_BUCKET || "phonebridge-recordings";
const FIREBASE_SERVICE_ACCOUNT_JSON = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "";
let firebaseAccessToken = null;
const wakeSentAt = new Map();
const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>PhoneBridge Dashboard</title>
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <style>
    * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { min-height: 100vh; background: radial-gradient(ellipse at 50% -18%, #18395a 0, #101a2c 42%, #0b1220 100%); color: #f8fafc; margin: 0; padding: 24px clamp(18px, 4vw, 56px); }
    header { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(148,163,184,.18); padding-bottom: 16px; margin-bottom: 24px; }
    h1 { margin: 0; font-size: 22px; font-weight: 700; color: #38bdf8; letter-spacing: -.4px; }
    .status-badge { background: #1e293b; padding: 6px 12px; border-radius: 9999px; font-size: 13px; border: 1px solid #475569; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(380px, 1fr)); gap: 16px; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 20px; box-shadow: 0 4px 6px rgba(0,0,0,0.3); }
    .card h2 { margin: 0 0 8px 0; font-size: 18px; color: #f1f5f9; }
    .device-meta { font-size: 13px; color: #94a3b8; margin-bottom: 14px; line-height: 1.5; }
    .connection-state { display: inline-flex; align-items: center; gap: 7px; margin: 2px 0 8px; padding: 5px 9px; border-radius: 999px; font-size: 12px; font-weight: 650; background: #102b21; color: #86efac; border: 1px solid #166534; }
    .connection-state.offline { background: #321c20; color: #fca5a5; border-color: #7f1d1d; }
    .connection-state.waking { background: #302814; color: #fde68a; border-color: #854d0e; }
    .last-seen { margin: 0 0 8px; color: #94a3b8; font-size: 12px; }
    .meta-tag { font-family: monospace; font-size: 11px; background: #0f172a; padding: 2px 6px; border-radius: 4px; }
    
    .telemetry-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; }
    .tele-stat { background: #090d16; border: 1px solid #1e293b; border-radius: 6px; padding: 8px; font-size: 11px; }
    .tele-stat .label { color: #64748b; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
    .tele-stat .val { color: #f1f5f9; font-weight: 600; font-family: monospace; margin-top: 2px; }

    .loc-box { background: #090d16; border: 1px solid #1e293b; border-radius: 6px; padding: 10px; margin-top: 10px; font-size: 12px; font-family: monospace; color: #38bdf8; }
    .loc-box a { color: #f59e0b; text-decoration: underline; margin-top: 4px; display: inline-block; font-weight: bold; }
    
    .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
    button { background: #2563eb; color: white; border: none; padding: 8px 12px; border-radius: 6px; font-size: 12px; font-weight: 500; cursor: pointer; transition: background 0.15s; }
    button:hover { background: #1d4ed8; }
    button.locate { background: #059669; }
    button.locate:hover { background: #047857; }
    button.tele { background: #7c3aed; }
    button.tele:hover { background: #6d28d9; }
    button.cam { background: #0284c7; }
    button.cam:hover { background: #0369a1; }
    button.torch-off { background: #475569; }
    button.torch-off:hover { background: #334155; }
    button.alarm-on { background: #dc2626; }
    button.alarm-on:hover { background: #b91c1c; }
    button.alarm-off { background: #64748b; }
    button.alarm-off:hover { background: #475569; }
    button.screen { background: #0f766e; }
    button.screen:hover { background: #115e59; }
    button.screen-stop { background: #be123c; }
    button.screen-stop:hover { background: #9f1239; }
    .screen-status { margin-top: 10px; padding: 8px 10px; border-radius: 6px; background: #090d16; border: 1px solid #1e293b; font-size: 11px; font-family: monospace; }
    
    .log-box { margin-top: 24px; background: #020617; border: 1px solid #1e293b; border-radius: 8px; padding: 12px; height: 180px; overflow-y: auto; font-family: monospace; font-size: 12px; color: #a5f3fc; }

    .modal-backdrop { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 100; align-items: center; justify-content: center; }
    .modal-backdrop.active { display: flex; }
    .modal-content { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 20px; max-width: 90vw; max-height: 90vh; text-align: center; }
    .modal-content img { max-width: 100%; max-height: 70vh; border-radius: 8px; border: 1px solid #0f172a; object-fit: contain; }
    #recordsBody { max-height: 65vh; overflow: auto; text-align: left; }
    .records-table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .records-table th, .records-table td { border: 1px solid #334155; padding: 8px; vertical-align: top; text-align: left; overflow-wrap: anywhere; }
    .records-table th { position: sticky; top: 0; background: #0f172a; color: #7dd3fc; }
    .auth-shell { max-width: 1000px; min-height: min(680px, calc(100vh - 140px)); margin: 3vh auto 0; display: grid; grid-template-columns: 1.1fr .9fr; overflow: hidden; border: 1px solid rgba(148,163,184,.18); border-radius: 24px; background: rgba(15,23,42,.76); box-shadow: 0 28px 80px rgba(0,0,0,.32); }
    .auth-intro { display: flex; flex-direction: column; justify-content: space-between; padding: clamp(28px, 5vw, 64px); background: linear-gradient(145deg, rgba(14,165,233,.18), rgba(30,41,59,.25) 58%, rgba(99,102,241,.12)); }
    .brand-mark { display: inline-grid; place-items: center; width: 46px; height: 46px; border-radius: 14px; background: linear-gradient(135deg,#38bdf8,#6366f1); color: #071525; font-weight: 800; letter-spacing: -1px; box-shadow: 0 8px 24px rgba(56,189,248,.2); }
    .auth-intro h2 { max-width: 440px; margin: 28px 0 14px; font-size: clamp(32px, 4vw, 48px); line-height: 1.08; letter-spacing: -1.5px; }
    .auth-intro p { max-width: 430px; color: #b9c7d9; line-height: 1.7; font-size: 15px; }
    .intro-foot { color: #91a3b9; font-size: 12px; }
    .auth-panel { align-self: center; max-width: 440px; width: calc(100% - 48px); margin: 36px auto; padding: clamp(24px, 4vw, 40px); background: rgba(30,41,59,.8); border: 1px solid rgba(148,163,184,.18); border-radius: 20px; }
    .auth-panel h3 { margin: 0 0 9px; font-size: 23px; letter-spacing: -.5px; }
    .auth-panel p { margin: 0 0 24px; color: #b8c5d6; line-height: 1.55; font-size: 14px; }
    .auth-panel button { width: 100%; min-height: 48px; padding: 12px 16px; font-size: 14px; border: 1px solid rgba(147,197,253,.45); border-radius: 10px; background: #2563eb; box-shadow: 0 8px 22px rgba(37,99,235,.2); }
    .auth-panel button:hover { background: #1d4ed8; transform: translateY(-1px); }
    .auth-panel button:disabled { opacity: .7; cursor: wait; transform: none; }
    .auth-error { color: #fca5a5; min-height: 0; margin-top: 12px; font-size: 13px; line-height: 1.45; }
    .auth-error:not(:empty) { padding: 10px 12px; border-radius: 8px; background: rgba(127,29,29,.22); border: 1px solid rgba(248,113,113,.2); }
    .auth-note { margin-top: 18px; color: #8293aa; font-size: 12px; line-height: 1.5; text-align: center; }
    @media (max-width: 720px) { body { padding: 16px; } .auth-shell { min-height: auto; grid-template-columns: 1fr; margin-top: 18px; } .auth-intro { padding: 24px; } .auth-intro h2 { font-size: 30px; margin: 20px 0 8px; } .auth-intro p { margin: 0; } .intro-foot { display: none; } .auth-panel { width: calc(100% - 32px); margin: 16px auto; padding: 24px; } }
    .account-actions { display: flex; align-items: center; gap: 10px; color: #cbd5e1; font-size: 13px; }
    .pair-panel { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin: 0 0 18px; padding: 14px 16px; background: #1e293b; border: 1px solid #334155; border-radius: 12px; }
    .pair-panel input { width: 150px; padding: 9px 10px; color: #f8fafc; background: #090d16; border: 1px solid #475569; border-radius: 6px; letter-spacing: 2px; }
  </style>
</head>
<body>
  <header>
    <h1>PhoneBridge Command Deck</h1>
    <div class="account-actions" id="accountActions" style="display:none">
      <span id="accountEmail"></span>
      <button type="button" onclick="signOut()">Sign out</button>
      <div class="status-badge" id="deckStatus">Connecting to deck...</div>
    </div>
  </header>

  <section class="auth-shell" id="authLoading" aria-live="polite">
    <div class="auth-intro"><div class="brand-mark" aria-hidden="true">PB</div><div><h2>Welcome back.</h2><p>Restoring your secure PhoneBridge session…</p></div><div class="intro-foot">PRIVATE DEVICE DASHBOARD&nbsp; · &nbsp;SECURE SIGN-IN</div></div>
    <div class="auth-panel"><h3>Loading your workspace</h3><p id="authLoadingMessage">Checking your saved sign-in…</p></div>
  </section>
  <section class="auth-shell" id="authPanel" style="display:none">
    <div class="auth-intro">
      <div class="brand-mark" aria-hidden="true">PB</div>
      <div>
        <h2>Your devices,<br>within reach.</h2>
        <p>PhoneBridge brings your connected phone status and tools together in one secure dashboard.</p>
      </div>
      <div class="intro-foot">PRIVATE DEVICE DASHBOARD&nbsp; · &nbsp;SECURE SIGN-IN</div>
    </div>
    <div class="auth-panel">
      <h3>Welcome back</h3>
      <p>Sign in with Google to open your PhoneBridge workspace and paired devices.</p>
      <button id="googleSignIn" type="button" onclick="signInWithGoogle()">Continue with Google</button>
      <div class="auth-error" id="authError" role="status" aria-live="polite"></div>
      <div class="auth-note">Only devices paired to your account appear in your dashboard.</div>
    </div>
  </section>

  <main id="dashboardContent" style="display:none">
    <section class="pair-panel">
      <strong>Pair a phone you own</strong>
      <span>Enter the 6-digit code shown in the PhoneBridge app.</span>
      <input id="pairCode" inputmode="numeric" autocomplete="one-time-code" maxlength="6" aria-label="Phone pairing code" placeholder="000000">
      <button type="button" onclick="pairDevice()">Pair device</button>
      <span id="pairStatus" role="status"></span>
    </section>
    <div class="grid" id="deviceList">
      <div style="color: #64748b; font-size: 14px;">No phones connected yet.</div>
    </div>

    <h3 style="margin-top: 28px; margin-bottom: 8px; font-size: 14px; color: #94a3b8;">Event Activity</h3>
    <div class="log-box" id="activityLog"></div>
  </main>

  <div class="modal-backdrop" id="photoModal" onclick="closePhotoModal()">
    <div class="modal-content" onclick="event.stopPropagation()">
      <h3 id="modalTitle" style="margin-top: 0; color: #f8fafc; font-size: 16px;">Captured Frame</h3>
      <img id="modalImg" src="" alt="Captured Frame" />
      <div style="margin-top: 14px; display: flex; justify-content: space-between; align-items: center;">
        <a id="downloadLink" download="capture.jpg" style="color: #38bdf8; font-size: 13px; text-decoration: none;">Download Image</a>
        <button onclick="closePhotoModal()" style="background: #475569;">Close</button>
      </div>
    </div>
  </div>

  <div class="modal-backdrop" id="recordsModal" onclick="closeRecordsModal()">
    <div class="modal-content" onclick="event.stopPropagation()" style="max-width: 96vw; width: 900px; text-align: left;">
      <h3 id="recordsTitle" style="margin-top: 0; color: #f8fafc; font-size: 16px;"></h3>
      <div id="recordsBody"></div>
      <div style="margin-top: 14px; text-align: right;">
        <button onclick="closeRecordsModal()" style="background: #475569;">Close</button>
      </div>
    </div>
  </div>

  <script>
    const SUPABASE_URL = __SUPABASE_URL__;
    const SUPABASE_PUBLISHABLE_KEY = __SUPABASE_PUBLISHABLE_KEY__;
    const supabaseClient = (window.supabase && SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY)
      ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
      : null;
    const protocol = window.location.protocol === "https:" ? "wss://" : "ws://";
    let ws = null;
    let currentSession = null;
    let dashboardAuthenticated = false;
    let authInitialized = false;
    let authConnectionToken = "";
    const wakeRequestById = new Map();
    const deviceListEl = document.getElementById("deviceList");
    const deckStatusEl = document.getElementById("deckStatus");
    const activityLogEl = document.getElementById("activityLog");
    const notificationsByDevice = new Map();
    const remoteRecordingStateByDevice = new Map();
    const recordingsByDevice = new Map();
    const wakeStateByDevice = new Map();
    const wakeTimers = new Map();
    let lastDeviceSnapshot = [];

    function logEvent(text) {
      const line = document.createElement("div");
      line.textContent = "[" + new Date().toLocaleTimeString() + "] " + text;
      activityLogEl.prepend(line);
    }

    function escapeHtml(value) {
      return String(value == null ? "" : value).replace(/[&<>"']/g, character => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", "\\\"": "&quot;", "'": "&#39;"
      })[character]);
    }

    function showPhotoModal(title, base64Data) {
      const src = base64Data.startsWith("data:") ? base64Data : "data:image/jpeg;base64," + base64Data;
      document.getElementById("modalTitle").textContent = title;
      const img = document.getElementById("modalImg");
      img.src = src;
      const dl = document.getElementById("downloadLink");
      dl.href = src;
      document.getElementById("photoModal").classList.add("active");
    }

    function closePhotoModal() {
      document.getElementById("photoModal").classList.remove("active");
    }

    function closeRecordsModal() {
      document.getElementById("recordsModal").classList.remove("active");
    }

    function showRecordsModal(title, records) {
      document.getElementById("recordsTitle").textContent = title;
      const body = document.getElementById("recordsBody");
      body.replaceChildren();

      if (!Array.isArray(records) || records.length === 0) {
        const empty = document.createElement("div");
        empty.style.color = "#94a3b8";
        empty.textContent = "No records available.";
        body.appendChild(empty);
      } else {
        const columns = [...new Set(records.flatMap(record => Object.keys(record || {})))];
        const table = document.createElement("table");
        table.className = "records-table";
        const head = table.createTHead().insertRow();
        columns.forEach(key => {
          const cell = document.createElement("th");
          cell.textContent = key;
          head.appendChild(cell);
        });
        const tableBody = table.createTBody();
        records.forEach(record => {
          const row = tableBody.insertRow();
          columns.forEach(key => {
            const cell = row.insertCell();
            const value = record ? record[key] : "";
            if ((key === "date" || key === "timestamp") && Number.isFinite(Number(value)) && Number(value) > 0) {
              cell.textContent = new Date(Number(value)).toLocaleString();
            } else if (key === "duration" && Number.isFinite(Number(value))) {
              cell.textContent = Number(value) + " sec";
            } else if (key === "read" && typeof value === "boolean") {
              cell.textContent = value ? "Read" : "Unread";
            } else {
              cell.textContent = value == null ? "" : (typeof value === "object" ? JSON.stringify(value) : String(value));
            }
          });
        });
        body.appendChild(table);
      }

      document.getElementById("recordsModal").classList.add("active");
    }

    function showDeviceNotifications(deviceId) {
      showRecordsModal("Notifications — " + deviceId.slice(0, 8), notificationsByDevice.get(deviceId) || []);
    }

    function setAuthError(message) {
      document.getElementById("authError").textContent = message || "";
    }

    function showAuthLoading(message) {
      document.getElementById("authLoadingMessage").textContent = message || "Checking your saved sign-in…";
      document.getElementById("authLoading").style.display = "grid";
      document.getElementById("authPanel").style.display = "none";
      document.getElementById("dashboardContent").style.display = "none";
      document.getElementById("accountActions").style.display = "none";
    }

    function showSignIn() {
      document.getElementById("authLoading").style.display = "none";
      document.getElementById("authPanel").style.display = "grid";
      document.getElementById("dashboardContent").style.display = "none";
      document.getElementById("accountActions").style.display = "none";
    }

    async function signInWithGoogle() {
      const button = document.getElementById("googleSignIn");
      if (!supabaseClient) {
        setAuthError(!window.supabase
          ? "The sign-in library did not load. Check your connection, refresh the page, and try again."
          : "The server's Supabase settings are missing. Check the Render environment settings.");
        return;
      }
      button.disabled = true;
      button.textContent = "Connecting to Google…";
      setAuthError("A Google sign-in page should open in a moment.");
      try {
        const startingUrl = window.location.href;
        const { data, error } = await supabaseClient.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: window.location.origin + "/" }
        });
        if (error) throw error;
        if (data && data.url && window.location.href === startingUrl) {
          window.location.assign(data.url);
          return;
        }
        if (!data || !data.url) throw new Error("Google sign-in did not return a redirect URL. Check that Google is enabled in Supabase.");
      } catch (error) {
        setAuthError(error && error.message ? error.message : "Could not start Google sign-in. Please refresh and try again.");
        button.disabled = false;
        button.textContent = "Continue with Google";
      }
    }

    async function signOut() {
      dashboardAuthenticated = false;
      currentSession = null;
      if (ws) { ws.close(); ws = null; }
      if (supabaseClient) await supabaseClient.auth.signOut();
      document.getElementById("authPanel").style.display = "block";
      document.getElementById("dashboardContent").style.display = "none";
      document.getElementById("accountActions").style.display = "none";
      deckStatusEl.textContent = "Signed out";
    }

    function pairDevice() {
      const code = document.getElementById("pairCode").value.trim();
      const status = document.getElementById("pairStatus");
      if (!/^\\d{6}$/.test(code)) { status.textContent = "Enter the 6-digit code shown in the phone app."; return; }
      if (!ws || ws.readyState !== WebSocket.OPEN || !dashboardAuthenticated) { status.textContent = "Connect to the dashboard first."; return; }
      ws.send(JSON.stringify({ type: "PAIR_DEVICE", code }));
      status.textContent = "Checking pairing code…";
    }

    function connectDashboard(session) {
      if (!session || !session.access_token) { showSignIn(); return; }
      if (authConnectionToken === session.access_token && ws && ws.readyState <= WebSocket.OPEN) return;
      authConnectionToken = session.access_token;
      currentSession = session;
      showAuthLoading("Connecting securely to your PhoneBridge workspace…");
      if (ws) { try { ws.close(); } catch (_) {} }
      const socket = new WebSocket(protocol + window.location.host);
      ws = socket;

      socket.onopen = () => {
        deckStatusEl.textContent = "Authenticating...";
        socket.send(JSON.stringify({ type: "DASHBOARD_AUTH", accessToken: session.access_token }));
      };

      socket.onclose = () => {
        if (ws !== socket) return;
        authConnectionToken = "";
        dashboardAuthenticated = false;
        deckStatusEl.textContent = "● Deck Offline";
        deckStatusEl.style.borderColor = "#ef4444";
        deckStatusEl.style.color = "#f87171";
        if (currentSession) logEvent("Lost connection to server.");
      };

      socket.onmessage = (event) => {
      if (ws !== socket) return;
      const msg = JSON.parse(event.data);

      if (msg.type === "DASHBOARD_AUTHENTICATED") {
        dashboardAuthenticated = true;
        document.getElementById("authLoading").style.display = "none";
        document.getElementById("authPanel").style.display = "none";
        document.getElementById("dashboardContent").style.display = "block";
        document.getElementById("accountActions").style.display = "flex";
        document.getElementById("accountEmail").textContent = session.user.email || "Signed in";
        deckStatusEl.textContent = "● Deck Connected";
        deckStatusEl.style.borderColor = "#22c55e";
        deckStatusEl.style.color = "#4ade80";
        logEvent("Signed in and connected to PhoneBridge.");
      } else if (msg.type === "AUTH_ERROR") {
        setAuthError(msg.message || "Sign-in could not be verified by the server.");
        authConnectionToken = "";
        showSignIn();
        ws.close();
      } else if (msg.type === "PAIR_RESULT") {
        document.getElementById("pairStatus").textContent = msg.message || (msg.ok ? "Phone paired." : "Pairing failed.");
        if (msg.ok) document.getElementById("pairCode").value = "";
      } else if (msg.type === "DEVICE_UPDATE") {
        for (const device of (msg.devices || [])) {
          if (device.online && wakeStateByDevice.get(device.id) !== "test-received") {
            wakeStateByDevice.delete(device.id);
            clearTimeout(wakeTimers.get(device.id));
            wakeTimers.delete(device.id);
          }
        }
        renderDevices(msg.devices);
      } else if (msg.type === "WAKE_STATUS") {
        clearTimeout(wakeTimers.get(msg.deviceId));
        if (msg.status === "sent") {
          wakeStateByDevice.set(msg.deviceId, msg.test ? "test-sent" : "waking");
          wakeTimers.set(msg.deviceId, setTimeout(() => {
            const state = wakeStateByDevice.get(msg.deviceId);
            if (state === "test-sent") {
              wakeStateByDevice.set(msg.deviceId, "test-timeout");
              logEvent("Firebase accepted the test push, but the phone has not confirmed receipt within 45 seconds.");
              renderDevices(lastDeviceSnapshot);
            } else if (state === "waking") {
              wakeStateByDevice.set(msg.deviceId, "timeout");
              logEvent("No wake response yet from " + msg.deviceId.slice(0, 8) + ". The request may still arrive when the phone reconnects.");
              renderDevices(lastDeviceSnapshot);
            }
          }, 45000));
        } else if (msg.status === "online") {
          wakeStateByDevice.delete(msg.deviceId);
        } else {
          wakeStateByDevice.set(msg.deviceId, "failed");
        }
        if (msg.message) logEvent(msg.message);
        renderDevices(lastDeviceSnapshot);
      } else if (msg.type === "WAKE_ACK") {
        if (wakeRequestById.get(msg.deviceId) === msg.requestId) {
          clearTimeout(wakeTimers.get(msg.deviceId));
          wakeRequestById.delete(msg.deviceId);
          wakeStateByDevice.set(msg.deviceId, "test-received");
          logEvent("Wake test confirmed: this phone received the Firebase push.");
          renderDevices(lastDeviceSnapshot);
        }
      } else if (msg.type === "DEVICE_FORGOTTEN") {
        logEvent(msg.message || "Phone removed from your dashboard.");
        pushDeviceListUpdate();
      } else if (msg.type === "LIVE_AUDIO_STATUS") {
        remoteRecordingStateByDevice.set(msg.deviceId, msg.error ? "error: " + msg.error : msg.active ? "Recording · microphone active" : msg.ready ? "Standby · start from dashboard" : "Standby is off on phone");
        if (msg.active) logEvent("Voice recording started on " + msg.deviceId.slice(0, 8) + ". Android microphone indicator is active.");
        else if (msg.error) logEvent("Recording unavailable: " + msg.error);
        else if (msg.ready) logEvent("Voice recording stopped on " + msg.deviceId.slice(0, 8) + ". Upload will continue when the phone is online.");
        renderDevices(lastDeviceSnapshot);
      } else if (msg.type === "RECORDINGS_LIST") {
        recordingsByDevice.set(msg.deviceId, Array.isArray(msg.recordings) ? msg.recordings : []);
        showRecordingsModal(msg.deviceId, recordingsByDevice.get(msg.deviceId));
      } else if (msg.type === "RECORDING_STORED") {
        const recordings = recordingsByDevice.get(msg.deviceId) || [];
        recordings.unshift(msg);
        recordingsByDevice.set(msg.deviceId, recordings.slice(0, 100));
        remoteRecordingStateByDevice.set(msg.deviceId, "Uploaded · ready to play");
        logEvent("Voice recording uploaded from " + msg.deviceId.slice(0, 8) + ".");
        showRecordingsModal(msg.deviceId, recordingsByDevice.get(msg.deviceId));
        renderDevices(lastDeviceSnapshot);
      } else if (msg.type === "RECORDING_DELETED") {
        const recordings = (recordingsByDevice.get(msg.deviceId) || []).filter(recording => recording.recordingId !== msg.recordingId);
        recordingsByDevice.set(msg.deviceId, recordings);
        showRecordingsModal(msg.deviceId, recordings);
        logEvent("Voice recording deleted from Supabase storage.");
      } else if (msg.type === "ACTIVITY") {
        // Screenshot status, completion, and error events are also
        // delivered with dedicated message types below. Avoid logging
        // their generic ACTIVITY mirror a second time.
        if (!String(msg.message || "").startsWith("Screen capture ")) {
          logEvent(msg.message);
        }
      } else if (msg.type === "PHOTO_RECEIVED") {
        logEvent("Captured photo received from " + msg.deviceId.slice(0, 8) + " (" + msg.lens + ")");
        showPhotoModal("Capture (" + msg.lens + ") - " + msg.deviceId.slice(0, 8), msg.image);
      } else if (msg.type === "SCREENSHOT_RECEIVED") {
        const frameText = msg.total > 1 ? "Frame " + (msg.index + 1) + "/" + msg.total : "Snapshot";
        logEvent("Screen " + frameText.toLowerCase() + " received from " + msg.deviceId.slice(0, 8));
        showPhotoModal("Screen " + frameText + " - " + msg.deviceId.slice(0, 8), msg.image);
      } else if (msg.type === "SCREENSHOT_COMPLETE") {
        logEvent("Screen capture completed on " + msg.deviceId.slice(0, 8) + " (" + msg.total + " frame" + (msg.total === 1 ? "" : "s") + ")");
      } else if (msg.type === "SCREEN_CAPTURE_STATUS") {
        logEvent("Screen capture " + (msg.active ? "started" : "stopped") + " on " + msg.deviceId.slice(0, 8));
      } else if (msg.type === "SCREENSHOT_ERROR") {
        logEvent("Screen capture error from " + msg.deviceId.slice(0, 8) + ": " + msg.error);
      } else if (msg.type === "CALL_LOG_DATA") {
        showRecordsModal("Call Logs — " + msg.deviceId.slice(0, 8), msg.entries || []);
      } else if (msg.type === "SMS_DATA") {
        showRecordsModal("SMS — " + msg.deviceId.slice(0, 8), msg.entries || []);
      } else if (msg.type === "NOTIFICATION_DATA") {
        const records = notificationsByDevice.get(msg.deviceId) || [];
        const notification = msg.notification || {};
        const alreadyCached = records.some(record =>
          record.id === notification.id &&
          record.package === notification.package &&
          record.timestamp === notification.timestamp
        );
        if (!alreadyCached) {
          records.unshift(notification);
          notificationsByDevice.set(msg.deviceId, records.slice(0, 50));
        }
        logEvent("Notification from " + (notification.package || "app") + ": " + (notification.title || notification.text || "New notification"));
      }
      };
    }

    if (supabaseClient) {
      showAuthLoading("Checking your saved sign-in…");
      supabaseClient.auth.onAuthStateChange((event, session) => {
        if (!authInitialized && event === "INITIAL_SESSION") authInitialized = true;
        if (!authInitialized) return;
        if (session) {
          setAuthError("");
          connectDashboard(session);
        } else {
          authConnectionToken = "";
          currentSession = null;
          dashboardAuthenticated = false;
          if (ws) { ws.close(); ws = null; }
          showSignIn();
        }
      });
      supabaseClient.auth.getSession().then(({ data, error }) => {
        if (authInitialized) return;
        authInitialized = true;
        if (error) setAuthError("Could not restore your sign-in. Please sign in again.");
        if (data.session) connectDashboard(data.session);
        else showSignIn();
      }).catch(() => {
        if (!authInitialized) { authInitialized = true; showSignIn(); }
      });
    } else {
      setAuthError("Server Supabase configuration is missing.");
    }

    function sendCommand(deviceId, command, options) {
      const payload = {
        type: "DASHBOARD_COMMAND",
        deviceId: deviceId,
        command: command
      };

      if (options) {
        Object.assign(payload, options);
      }

      ws.send(JSON.stringify(payload));
      logEvent("Dispatched " + command + " to " + deviceId.slice(0, 8) + "...");
    }

    function wakeDevice(deviceId) {
      wakeStateByDevice.set(deviceId, "sending");
      renderDevices(lastDeviceSnapshot);
      sendCommand(deviceId, "WAKE_DEVICE");
    }

    function testWake(deviceId) {
      const requestId = crypto.randomUUID();
      wakeRequestById.set(deviceId, requestId);
      wakeStateByDevice.set(deviceId, "testing");
      renderDevices(lastDeviceSnapshot);
      sendCommand(deviceId, "TEST_WAKE", { requestId });
    }

    function forgetDevice(deviceId) {
      if (!window.confirm("Remove this phone from your dashboard? It will need to be paired again to reconnect.")) return;
      sendCommand(deviceId, "FORGET_DEVICE");
    }

    function startRemoteRecording(deviceId) {
      remoteRecordingStateByDevice.set(deviceId, "Starting · waiting for phone");
      renderDevices(lastDeviceSnapshot);
      sendCommand(deviceId, "START_LIVE_AUDIO");
    }

    function stopRemoteRecording(deviceId) {
      sendCommand(deviceId, "STOP_LIVE_AUDIO");
    }

    function requestRecordings(deviceId) {
      sendCommand(deviceId, "LIST_RECORDINGS");
    }

    function showRecordingsModal(deviceId, recordings) {
      document.getElementById("recordsTitle").textContent = "Voice recordings — " + deviceId.slice(0, 8);
      const body = document.getElementById("recordsBody");
      body.innerHTML = "";
      if (!Array.isArray(recordings) || recordings.length === 0) {
        const empty = document.createElement("p");
        empty.textContent = "No recordings are saved yet.";
        body.appendChild(empty);
      } else {
        recordings.forEach(recording => {
          if (!recording || typeof recording.url !== "string") return;
          const item = document.createElement("div");
          item.style.cssText = "padding:12px 0;border-bottom:1px solid #334155";
          const label = document.createElement("div");
          label.textContent = recording.createdAt ? new Date(recording.createdAt).toLocaleString() : "Saved recording";
          label.style.marginBottom = "8px";
          const player = document.createElement("audio");
          player.controls = true;
          player.preload = "none";
          player.src = recording.url;
          player.style.width = "100%";
          const remove = document.createElement("button");
          remove.textContent = "Delete recording";
          remove.className = "torch-off";
          remove.style.marginTop = "8px";
          remove.addEventListener("click", () => deleteRecording(deviceId, recording.recordingId));
          item.append(label, player, remove);
          body.appendChild(item);
        });
      }
      document.getElementById("recordsModal").classList.add("active");
    }

    function deleteRecording(deviceId, recordingId) {
      if (!window.confirm("Permanently delete this voice recording?")) return;
      sendCommand(deviceId, "DELETE_RECORDING", { recordingId });
    }

    function renderDevices(devices) {
      lastDeviceSnapshot = Array.isArray(devices) ? devices : [];
      if (devices.length === 0) {
        deviceListEl.innerHTML = '<div style="color: #64748b; font-size: 14px;">No phones paired yet.</div>';
        return;
      }

      deviceListEl.innerHTML = devices.map(d => {
        if (Array.isArray(d.notifications)) {
          notificationsByDevice.set(d.id, d.notifications);
        }
        if (!remoteRecordingStateByDevice.has(d.id) && typeof d.remoteAudioReady === "boolean") {
          remoteRecordingStateByDevice.set(d.id, d.remoteAudioActive ? "Recording · microphone active" : d.remoteAudioReady ? "Standby · start from dashboard" : "Standby is off on phone");
        }
        const batteryStr = d.batteryLevel !== undefined 
          ? d.batteryLevel + "%" + (d.isCharging ? " (Charging)" : "") 
          : "Unknown";

        const t = d.telemetry;
        const wakeState = wakeStateByDevice.get(d.id);
        const isOnline = Boolean(d.online);
        const internetText = isOnline
          ? (t && typeof t.internetAvailable === "boolean" ? (t.internetAvailable ? "Internet available" : "No internet connection") : "Network reachable")
          : (typeof d.lastInternetAvailable === "boolean" ? (d.lastInternetAvailable ? "Last reported: internet available" : "Last reported: no internet") : "Current network state unavailable");
        const connectionText = isOnline ? "Online" : wakeState === "testing" ? "Testing push…" : wakeState === "test-sent" ? "Push sent · waiting for phone" : wakeState === "test-received" ? "Push received" : wakeState === "test-timeout" ? "Push not confirmed" : wakeState === "waking" || wakeState === "sending" ? "Waking…" : wakeState === "timeout" ? "No response" : "Offline / not reachable";
        const connectionClass = isOnline ? "" : wakeState && wakeState.startsWith("test") ? "waking" : wakeState === "waking" || wakeState === "sending" ? "waking" : "offline";
        const lastSeenText = d.lastSeenAt ? "Last seen " + new Date(d.lastSeenAt).toLocaleString() : "Not connected yet";
        const networkLabel = d.lastNetworkType ? "Last reported network: " + d.lastNetworkType : "";
        const liveAudioState = remoteRecordingStateByDevice.get(d.id) || "Standby is off on phone";
        const latitude = Number(d.location && d.location.latitude);
        const longitude = Number(d.location && d.location.longitude);
        const accuracy = Number(d.location && d.location.accuracy);
        const telemetryHtml = t ? \`
          <div class="telemetry-grid">
            <div class="tele-stat">
              <div class="label">Network / SSID</div>
              <div class="val">\${escapeHtml(t.networkType)} \${t.wifiSSID !== "N/A" ? "(" + escapeHtml(t.wifiSSID) + ")" : ""}</div>
            </div>
            <div class="tele-stat">
              <div class="label">Screen State</div>
              <div class="val" style="color: \${t.isScreenOn ? '#4ade80' : '#94a3b8'}">\${t.isScreenOn ? "ON (Interactive)" : "OFF (Locked)"}</div>
            </div>
            <div class="tele-stat">
              <div class="label">RAM Usage</div>
              <div class="val">\${escapeHtml(t.usedRamMb)}MB / \${escapeHtml(t.totalRamMb)}MB</div>
            </div>
            <div class="tele-stat">
              <div class="label">Free Storage</div>
              <div class="val">\${escapeHtml(t.availStorageGb)}GB / \${escapeHtml(t.totalStorageGb)}GB</div>
            </div>
          </div>
        \` : '';

        const locHtml = d.location && Number.isFinite(latitude) && Number.isFinite(longitude) ? \`
          <div class="loc-box">
            <div>GPS: \${latitude.toFixed(6)}, \${longitude.toFixed(6)}</div>
            <div>Accuracy: ±\${Number.isFinite(accuracy) && accuracy ? accuracy.toFixed(1) : "?"}m</div>
            <a href="https://www.google.com/maps?q=\${latitude},\${longitude}" target="_blank" rel="noopener">Open in Google Maps →</a>
          </div>
        \` : '<div class="loc-box" style="color: #64748b;">GPS: Not acquired yet</div>';

        return \`
          <div class="card">
            <h2>\${escapeHtml(d.manufacturer || "Android")} \${escapeHtml(d.model || "Device")}</h2>
            <div class="device-meta">
              <div class="connection-state \${connectionClass}">\${escapeHtml(connectionText)}</div>
              <div class="last-seen">\${escapeHtml(lastSeenText)}\${networkLabel ? " · " + escapeHtml(networkLabel) : ""}</div>
              <div class="last-seen">\${escapeHtml(internetText)}\${d.lastNetworkAt ? " · reported " + escapeHtml(new Date(d.lastNetworkAt).toLocaleString()) : ""}</div>
              <div>OS: Android \${escapeHtml(d.androidVersion || "?")} (SDK \${escapeHtml(d.sdkInt || "?")})</div>
              <div>Battery: \${escapeHtml(batteryStr)}</div>
              <div style="margin-top: 4px;">ID: <span class="meta-tag">\${escapeHtml(d.id)}</span></div>
              \${telemetryHtml}
              \${locHtml}
              <div class="screen-status" style="color: \${d.screenCaptureActive ? '#4ade80' : '#94a3b8'}">
                Screen Capture: \${d.screenCaptureActive ? 'ACTIVE' : 'INACTIVE'}
              </div>
              <div class="screen-status">Voice recording: \${escapeHtml(liveAudioState)}</div>
              <div class="last-seen">Recordings are saved on the phone first and uploaded privately to your Supabase project.</div>
            </div>
            <div class="actions">
              \${isOnline ? "" : "<button class=\\\"tele\\\" onclick=\\\"wakeDevice('" + d.id + "')\\\">Wake phone</button>"}
              <button class="tele" onclick="testWake('\${d.id}')">Test wake</button>
              <button class="torch-off" onclick="forgetDevice('\${d.id}')">Forget device</button>
              <button class="tele" onclick="startRemoteRecording('\${d.id}')">Start recording</button>
              <button class="torch-off" onclick="stopRemoteRecording('\${d.id}')">Stop recording</button>
              <button onclick="requestRecordings('\${d.id}')">Recordings</button>
              <button class="cam" onclick="sendCommand('\${d.id}', 'CAPTURE_PHOTO_BACK')">📸 Back Cam</button>
              <button class="cam" onclick="sendCommand('\${d.id}', 'CAPTURE_PHOTO_FRONT')">🤳 Front Cam</button>
              <button class="tele" onclick="sendCommand('\${d.id}', 'GET_TELEMETRY')">Sync Telemetry</button>
              <button class="locate" onclick="sendCommand('\${d.id}', 'GET_LOCATION')">Locate</button>
              <button onclick="sendCommand('\${d.id}', 'GET_CALL_LOG')">Call Logs</button>
              <button onclick="sendCommand('\${d.id}', 'GET_SMS')">SMS</button>
              <button onclick="showDeviceNotifications('\${d.id}')">Notifications (\${(d.notifications || []).length})</button>
              <button onclick="sendCommand('\${d.id}', 'PING')">Ping</button>
              <button onclick="sendCommand('\${d.id}', 'VIBRATE')">Vibrate</button>
              <button onclick="sendCommand('\${d.id}', 'TORCH_ON')">Torch ON</button>
              <button class="torch-off" onclick="sendCommand('\${d.id}', 'TORCH_OFF')">Torch OFF</button>
              <button class="alarm-on" onclick="sendCommand('\${d.id}', 'ALARM_START')">Ring Alarm</button>
              <button class="alarm-off" onclick="sendCommand('\${d.id}', 'ALARM_STOP')">Stop Alarm</button>
              <button class="screen" onclick="sendCommand('\${d.id}', 'SCREENSHOT')">🖥 Snapshot</button>
              <button class="screen" onclick="sendCommand('\${d.id}', 'BURST_SCREENSHOT', { count: 5, intervalMs: 2000 })">🖥 Burst (5)</button>
              <button class="screen-stop" onclick="sendCommand('\${d.id}', 'STOP_SCREEN_CAPTURE')">Stop Screen</button>
            </div>
          </div>
        \`;
      }).join("");
    }
  </script>
</body>
</html>`;
const httpServer = http_1.default.createServer((req, res) => {
    if (req.url === "/health") {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("OK");
        return;
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    const safeConfigValue = (value) => JSON.stringify(value).replace(/</g, "\\u003c");
    res.end(DASHBOARD_HTML
        .replace("__SUPABASE_URL__", safeConfigValue(SUPABASE_URL))
        .replace("__SUPABASE_PUBLISHABLE_KEY__", safeConfigValue(SUPABASE_PUBLISHABLE_KEY)));
});
const wss = new ws_1.WebSocketServer({
    server: httpServer,
    maxPayload: 15 * 1024 * 1024,
});
const connectedDevices = new Map();
const deviceRegistry = new Map();
const deviceOwnerIds = new Map();
const dashboardSockets = new Set();
const pendingPairings = new Map();
const pairingAttemptsByUser = new Map();
const pendingRecordingUploads = new Map();
function sha256(value) {
    return (0, crypto_1.createHash)("sha256").update(value).digest("hex");
}
async function authenticateSupabaseUser(accessToken) {
    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || !accessToken)
        return null;
    try {
        const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
            headers: {
                apikey: SUPABASE_PUBLISHABLE_KEY,
                Authorization: `Bearer ${accessToken}`,
            },
        });
        if (!response.ok)
            return null;
        const user = await response.json();
        return typeof user.id === "string" ? user.id : null;
    }
    catch (error) {
        console.error("Supabase token verification failed:", error);
        return null;
    }
}
function getVerifiedTokenExpiry(accessToken) {
    try {
        const payload = JSON.parse(Buffer.from(accessToken.split(".")[1], "base64url").toString("utf8"));
        return typeof payload.exp === "number" ? payload.exp * 1000 : null;
    }
    catch {
        return null;
    }
}
async function getUserWorkspaceIds(userId) {
    const url = new URL(`${SUPABASE_URL}/rest/v1/phonebridge_workspace_members`);
    url.searchParams.set("user_id", `eq.${userId}`);
    url.searchParams.set("select", "workspace_id");
    const response = await fetch(url, {
        headers: {
            apikey: SUPABASE_SECRET_KEY,
            Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
        },
    });
    if (!response.ok) {
        console.error("Could not load account workspaces:", response.status, await response.text());
        return [];
    }
    const rows = await response.json();
    return rows.map((row) => row.workspace_id);
}
async function getPairedDevice(deviceId) {
    if (!SUPABASE_URL || !SUPABASE_SECRET_KEY)
        return null;
    const url = new URL(`${SUPABASE_URL}/rest/v1/phonebridge_devices`);
    url.searchParams.set("device_id", `eq.${deviceId}`);
    url.searchParams.set("select", "workspace_id,device_token_hash");
    url.searchParams.set("limit", "1");
    const response = await fetch(url, {
        headers: {
            apikey: SUPABASE_SECRET_KEY,
            Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
        },
    });
    if (!response.ok) {
        console.error("Could not load paired device:", response.status, await response.text());
        throw new Error(`Device lookup returned ${response.status}`);
    }
    const rows = await response.json();
    const row = rows[0];
    return row ? { workspaceId: row.workspace_id, tokenHash: row.device_token_hash } : null;
}
async function getWorkspaceDevices(workspaceIds) {
    if (!SUPABASE_URL || !SUPABASE_SECRET_KEY || workspaceIds.length === 0)
        return [];
    const url = new URL(`${SUPABASE_URL}/rest/v1/phonebridge_devices`);
    url.searchParams.set("workspace_id", `in.(${workspaceIds.join(",")})`);
    url.searchParams.set("select", "device_id,workspace_id,last_seen_at,last_network_type,last_network_at,last_internet_available");
    url.searchParams.set("order", "created_at.desc");
    url.searchParams.set("limit", "200");
    const response = await fetch(url, {
        headers: { apikey: SUPABASE_SECRET_KEY, Authorization: `Bearer ${SUPABASE_SECRET_KEY}` },
    });
    if (!response.ok) {
        console.error("Could not list paired devices:", response.status, await response.text());
        return [];
    }
    return await response.json();
}
async function updateDevicePresence(deviceId, networkType, internetAvailable) {
    if (!SUPABASE_URL || !SUPABASE_SECRET_KEY)
        return;
    const body = { last_seen_at: new Date().toISOString() };
    if (networkType !== undefined)
        body.last_network_type = networkType;
    if (internetAvailable !== undefined)
        body.last_internet_available = internetAvailable;
    if (networkType !== undefined || internetAvailable !== undefined)
        body.last_network_at = new Date().toISOString();
    const response = await fetch(`${SUPABASE_URL}/rest/v1/phonebridge_devices?device_id=eq.${encodeURIComponent(deviceId)}`, {
        method: "PATCH",
        headers: {
            apikey: SUPABASE_SECRET_KEY,
            Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
            "Content-Type": "application/json",
            Prefer: "return=minimal",
        },
        body: JSON.stringify(body),
    });
    if (!response.ok)
        console.error("Could not update device presence:", response.status, await response.text());
}
async function saveDevicePushToken(deviceId, token) {
    if (!SUPABASE_URL || !SUPABASE_SECRET_KEY || !token)
        return;
    const response = await fetch(`${SUPABASE_URL}/rest/v1/phonebridge_device_push_tokens?on_conflict=device_id`, {
        method: "POST",
        headers: {
            apikey: SUPABASE_SECRET_KEY,
            Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
            "Content-Type": "application/json",
            Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify({ device_id: deviceId, fcm_token: token, updated_at: new Date().toISOString() }),
    });
    if (!response.ok)
        console.error("Could not save device push token:", response.status, await response.text());
}
async function getDevicePushToken(deviceId) {
    if (!SUPABASE_URL || !SUPABASE_SECRET_KEY)
        return null;
    const url = new URL(`${SUPABASE_URL}/rest/v1/phonebridge_device_push_tokens`);
    url.searchParams.set("device_id", `eq.${deviceId}`);
    url.searchParams.set("select", "fcm_token");
    url.searchParams.set("limit", "1");
    const response = await fetch(url, {
        headers: { apikey: SUPABASE_SECRET_KEY, Authorization: `Bearer ${SUPABASE_SECRET_KEY}` },
    });
    if (!response.ok) {
        console.error("Could not load device push token:", response.status, await response.text());
        return null;
    }
    const rows = await response.json();
    return rows[0]?.fcm_token || null;
}
function base64Url(value) {
    return Buffer.from(value).toString("base64url");
}
async function getFirebaseAccessToken() {
    if (!FIREBASE_SERVICE_ACCOUNT_JSON)
        return null;
    if (firebaseAccessToken && firebaseAccessToken.expiresAt > Date.now() + 60_000) {
        try {
            const account = JSON.parse(FIREBASE_SERVICE_ACCOUNT_JSON);
            if (account.project_id)
                return { token: firebaseAccessToken.value, projectId: account.project_id };
        }
        catch {
            return null;
        }
    }
    try {
        const account = JSON.parse(FIREBASE_SERVICE_ACCOUNT_JSON);
        if (!account.client_email || !account.private_key || !account.project_id)
            return null;
        const tokenUri = account.token_uri || "https://oauth2.googleapis.com/token";
        const now = Math.floor(Date.now() / 1000);
        const unsigned = `${base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64Url(JSON.stringify({
            iss: account.client_email,
            scope: "https://www.googleapis.com/auth/firebase.messaging",
            aud: tokenUri,
            iat: now,
            exp: now + 3600,
        }))}`;
        const signer = (0, crypto_1.createSign)("RSA-SHA256");
        signer.update(unsigned);
        const assertion = `${unsigned}.${signer.sign(account.private_key, "base64url")}`;
        const response = await fetch(tokenUri, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
                assertion,
            }),
        });
        const payload = await response.json();
        if (!response.ok || !payload.access_token) {
            console.error("Firebase OAuth token request failed:", response.status, payload.error || "no access token");
            return null;
        }
        firebaseAccessToken = { value: payload.access_token, expiresAt: Date.now() + (payload.expires_in || 3600) * 1000 };
        return { token: payload.access_token, projectId: account.project_id };
    }
    catch (error) {
        console.error("Firebase service account configuration is invalid:", error);
        return null;
    }
}
async function sendWakePush(deviceId, token, requestId = "") {
    const credentials = await getFirebaseAccessToken();
    if (!credentials)
        return { ok: false, reason: "Firebase server credentials are not configured." };
    try {
        const response = await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(credentials.projectId)}/messages:send`, {
            method: "POST",
            headers: { Authorization: `Bearer ${credentials.token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ message: {
                    token,
                    data: { type: "WAKE", deviceId, ...(requestId ? { requestId } : {}) },
                    android: { priority: "HIGH", ttl: "86400s" },
                } }),
        });
        if (response.ok)
            return { ok: true };
        const errorText = await response.text();
        console.error("FCM wake send failed:", response.status, errorText);
        if (response.status === 404 || errorText.includes("UNREGISTERED")) {
            return { ok: false, reason: "The saved phone push token has expired. Open PhoneBridge on that phone once to refresh it." };
        }
        return { ok: false, reason: `Firebase could not send the wake request (HTTP ${response.status}).` };
    }
    catch (error) {
        console.error("FCM wake request failed:", error);
        return { ok: false, reason: "Could not contact Firebase Cloud Messaging." };
    }
}
async function wakeOfflineDevicesForDashboard(dashboard) {
    if (!dashboard.workspaceIds?.length || dashboard.readyState !== ws_1.WebSocket.OPEN)
        return;
    let rows;
    try {
        rows = await getWorkspaceDevices(dashboard.workspaceIds);
    }
    catch (error) {
        console.error("Could not load paired devices for automatic wake:", error);
        return;
    }
    for (const row of rows) {
        deviceOwnerIds.set(row.device_id, row.workspace_id);
        if (connectedDevices.get(row.device_id)?.readyState === ws_1.WebSocket.OPEN)
            continue;
        const now = Date.now();
        if (now - (wakeSentAt.get(row.device_id) || 0) < 60_000)
            continue;
        wakeSentAt.set(row.device_id, now);
        const token = await getDevicePushToken(row.device_id);
        if (!token) {
            dashboard.send(JSON.stringify({
                type: "WAKE_STATUS", deviceId: row.device_id, status: "unavailable",
                message: `No wake token for ${row.device_id.slice(0, 8)} yet. Open PhoneBridge on that phone with internet once.`,
            }));
            continue;
        }
        const result = await sendWakePush(row.device_id, token);
        dashboard.send(JSON.stringify({
            type: "WAKE_STATUS", deviceId: row.device_id,
            status: result.ok ? "sent" : "failed",
            message: result.ok ? `Wake request sent to ${row.device_id.slice(0, 8)}; waiting for it to reconnect…` : result.reason,
        }));
    }
}
async function saveDevicePairing(deviceId, workspaceId, pairedBy, tokenHash) {
    if (!SUPABASE_URL || !SUPABASE_SECRET_KEY)
        return false;
    const response = await fetch(`${SUPABASE_URL}/rest/v1/phonebridge_devices`, {
        method: "POST",
        headers: {
            apikey: SUPABASE_SECRET_KEY,
            Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
            "Content-Type": "application/json",
            Prefer: "return=minimal",
        },
        body: JSON.stringify({ device_id: deviceId, workspace_id: workspaceId, paired_by: pairedBy, device_token_hash: tokenHash }),
    });
    if (!response.ok) {
        console.error("Could not save device pairing:", response.status, await response.text());
        return false;
    }
    return true;
}
async function removeDevicePairing(deviceId, workspaceId) {
    if (!SUPABASE_URL || !SUPABASE_SECRET_KEY)
        return false;
    const url = new URL(`${SUPABASE_URL}/rest/v1/phonebridge_devices`);
    url.searchParams.set("device_id", `eq.${deviceId}`);
    url.searchParams.set("workspace_id", `eq.${workspaceId}`);
    const response = await fetch(url, {
        method: "DELETE",
        headers: { apikey: SUPABASE_SECRET_KEY, Authorization: `Bearer ${SUPABASE_SECRET_KEY}`, Prefer: "return=minimal" },
    });
    if (!response.ok) {
        console.error("Could not remove paired device:", response.status, await response.text());
        return false;
    }
    return true;
}
function issuePairingCode(socket) {
    if (!socket.deviceId || !socket.deviceTokenHash || socket.readyState !== ws_1.WebSocket.OPEN)
        return;
    if (socket.pairingCode)
        pendingPairings.delete(socket.pairingCode);
    let code = String((0, crypto_1.randomInt)(0, 1_000_000)).padStart(6, "0");
    while (pendingPairings.has(code))
        code = String((0, crypto_1.randomInt)(0, 1_000_000)).padStart(6, "0");
    const expiresAt = Date.now() + 10 * 60 * 1000;
    socket.clientType = "PENDING_PHONE";
    socket.pairingCode = code;
    pendingPairings.set(code, { socket, expiresAt });
    socket.send(JSON.stringify({ type: "PAIRING_REQUIRED", code, expiresAt }));
}
function registerPairedDevice(socket, deviceId, workspaceId) {
    socket.clientType = "PHONE";
    socket.deviceId = deviceId;
    deviceOwnerIds.set(deviceId, workspaceId);
    const previous = connectedDevices.get(deviceId);
    if (previous && previous !== socket)
        previous.terminate();
    connectedDevices.set(deviceId, socket);
    void updateDevicePresence(deviceId);
    if (socket.pendingFcmToken)
        void saveDevicePushToken(deviceId, socket.pendingFcmToken);
    if (!deviceRegistry.has(deviceId)) {
        deviceRegistry.set(deviceId, {
            manufacturer: "Unknown",
            model: "Device",
            androidVersion: "?",
            sdkInt: 0,
        });
    }
    const deviceInfo = deviceRegistry.get(deviceId);
    deviceInfo.remoteAudioReady = socket.remoteAudioReady === true;
    deviceInfo.remoteAudioActive = false;
    socket.send(JSON.stringify({ type: "REGISTRATION_SUCCESS", deviceId }));
    socket.send(JSON.stringify({ type: "COMMAND", command: "GET_DEVICE_INFO" }));
    socket.send(JSON.stringify({ type: "COMMAND", command: "GET_BATTERY" }));
    socket.send(JSON.stringify({ type: "COMMAND", command: "GET_TELEMETRY" }));
    pushDeviceListUpdate();
    broadcastToDashboards({
        type: "ACTIVITY",
        deviceId,
        message: `Device connected: ${deviceId.slice(0, 8)}...`,
    });
}
async function registerPhone(socket, message) {
    const deviceId = typeof message.deviceId === "string" ? message.deviceId : "";
    const deviceToken = typeof message.deviceToken === "string" ? message.deviceToken : "";
    const fcmToken = typeof message.fcmToken === "string" ? message.fcmToken : "";
    socket.remoteAudioReady = message.remoteAudioReady === true;
    const wakeRequestId = typeof message.wakeRequestId === "string" && /^[0-9a-f-]{36}$/i.test(message.wakeRequestId) ? message.wakeRequestId : "";
    if (fcmToken.length > 0 && fcmToken.length <= 500)
        socket.pendingFcmToken = fcmToken;
    if (!/^[0-9a-fA-F-]{36}$/.test(deviceId) || deviceToken.length < 32 || deviceToken.length > 256) {
        socket.close(1008, "Invalid device credentials");
        return;
    }
    if (!SUPABASE_SECRET_KEY || !SUPABASE_URL) {
        socket.close(1011, "Server database is not configured");
        return;
    }
    const tokenHash = sha256(deviceToken);
    let pairedDevice;
    try {
        pairedDevice = await getPairedDevice(deviceId);
    }
    catch (error) {
        console.error("Device pairing lookup failed:", error);
        socket.close(1011, "Device verification failed");
        return;
    }
    if (pairedDevice) {
        if (pairedDevice.tokenHash !== tokenHash) {
            socket.close(1008, "Device credential rejected");
            return;
        }
        registerPairedDevice(socket, deviceId, pairedDevice.workspaceId);
        if (wakeRequestId) {
            socket.send(JSON.stringify({ type: "WAKE_ACK_CONFIRMED", requestId: wakeRequestId }));
            broadcastToDashboards({ type: "WAKE_ACK", deviceId, requestId: wakeRequestId });
        }
        return;
    }
    // Unpaired phones stay isolated: they send no telemetry and accept no commands.
    socket.deviceId = deviceId;
    socket.deviceTokenHash = tokenHash;
    issuePairingCode(socket);
}
async function pairPendingDevice(dashboard, code) {
    if (!dashboard.userId || !dashboard.workspaceIds?.length)
        return;
    const pending = pendingPairings.get(code);
    if (!pending || pending.expiresAt <= Date.now() || pending.socket.readyState !== ws_1.WebSocket.OPEN) {
        pendingPairings.delete(code);
        dashboard.send(JSON.stringify({ type: "PAIR_RESULT", ok: false, message: "Code not found or expired. Use the current code shown in PhoneBridge." }));
        return;
    }
    const phone = pending.socket;
    const deviceId = phone.deviceId;
    if (!deviceId || !phone.deviceTokenHash || phone.clientType !== "PENDING_PHONE") {
        pendingPairings.delete(code);
        dashboard.send(JSON.stringify({ type: "PAIR_RESULT", ok: false, message: "This phone is no longer waiting to be paired." }));
        return;
    }
    const workspaceId = dashboard.workspaceIds[0];
    const saved = await saveDevicePairing(deviceId, workspaceId, dashboard.userId, phone.deviceTokenHash);
    if (!saved) {
        dashboard.send(JSON.stringify({ type: "PAIR_RESULT", ok: false, message: "Could not save pairing. Check the Supabase server key and migration." }));
        return;
    }
    pendingPairings.delete(code);
    phone.pairingCode = undefined;
    dashboard.send(JSON.stringify({ type: "PAIR_RESULT", ok: true, message: "Phone paired to your account." }));
    registerPairedDevice(phone, deviceId, workspaceId);
    if (phone.pendingFcmToken)
        await saveDevicePushToken(deviceId, phone.pendingFcmToken);
}
function broadcastToDashboards(messageObj) {
    const payload = JSON.stringify(messageObj);
    const deviceId = messageObj.deviceId;
    const workspaceId = deviceId ? deviceOwnerIds.get(deviceId) : undefined;
    dashboardSockets.forEach((dash) => {
        if (dash.readyState === ws_1.WebSocket.OPEN && dash.userId && (dash.authExpiresAt || 0) > Date.now() && (!deviceId || dash.workspaceIds?.includes(workspaceId || ""))) {
            dash.send(payload);
        }
    });
}
function supabaseStorageHeaders(extra = {}) {
    return { apikey: SUPABASE_SECRET_KEY, Authorization: `Bearer ${SUPABASE_SECRET_KEY}`, ...extra };
}
async function ensureRecordingsBucket() {
    if (!SUPABASE_URL || !SUPABASE_SECRET_KEY)
        throw new Error("Supabase server storage credentials are not configured.");
    const base = `${SUPABASE_URL}/storage/v1`;
    const existing = await fetch(`${base}/bucket/${encodeURIComponent(SUPABASE_RECORDINGS_BUCKET)}`, { headers: supabaseStorageHeaders() });
    if (existing.ok)
        return;
    const created = await fetch(`${base}/bucket`, {
        method: "POST",
        headers: supabaseStorageHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
            id: SUPABASE_RECORDINGS_BUCKET,
            name: SUPABASE_RECORDINGS_BUCKET,
            public: false,
            file_size_limit: 67_108_864,
            allowed_mime_types: ["audio/mp4"],
        }),
    });
    if (!created.ok && created.status !== 409) {
        throw new Error(`Could not create the private recordings bucket (${created.status}): ${(await created.text()).slice(0, 300)}`);
    }
}
async function createRecordingSignedUrl(deviceId, filename) {
    const objectPath = `${encodeURIComponent(deviceId)}/${encodeURIComponent(filename)}`;
    const response = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${encodeURIComponent(SUPABASE_RECORDINGS_BUCKET)}/${objectPath}`, {
        method: "POST",
        headers: supabaseStorageHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ expiresIn: 86_400 }),
    });
    if (!response.ok)
        throw new Error(`Could not create recording playback link (${response.status}).`);
    const result = await response.json();
    const signed = result.signedURL || result.signedUrl;
    if (!signed)
        throw new Error("Supabase returned no recording playback link.");
    if (/^https?:\/\//i.test(signed))
        return signed;
    if (signed.startsWith("/storage/v1/"))
        return `${SUPABASE_URL}${signed}`;
    return `${SUPABASE_URL}/storage/v1${signed.startsWith("/") ? signed : `/${signed}`}`;
}
async function storeRecording(deviceId, recordingId, bytes) {
    await ensureRecordingsBucket();
    const filename = `${recordingId}.m4a`;
    const objectPath = `${encodeURIComponent(deviceId)}/${encodeURIComponent(filename)}`;
    const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(SUPABASE_RECORDINGS_BUCKET)}/${objectPath}`, {
        method: "POST",
        headers: supabaseStorageHeaders({ "Content-Type": "audio/mp4", "x-upsert": "true" }),
        body: bytes,
    });
    if (!response.ok)
        throw new Error(`Supabase could not store the recording (${response.status}): ${(await response.text()).slice(0, 300)}`);
    return { url: await createRecordingSignedUrl(deviceId, filename), createdAt: new Date().toISOString() };
}
async function listDeviceRecordings(deviceId) {
    if (!SUPABASE_URL || !SUPABASE_SECRET_KEY)
        return [];
    const response = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${encodeURIComponent(SUPABASE_RECORDINGS_BUCKET)}`, {
        method: "POST",
        headers: supabaseStorageHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ prefix: `${deviceId}/`, limit: 100, offset: 0, sortBy: { column: "created_at", order: "desc" } }),
    });
    if (response.status === 404)
        return [];
    if (!response.ok)
        throw new Error(`Could not list recordings (${response.status}).`);
    const rows = await response.json();
    const recordings = rows.filter(row => typeof row.name === "string" && /^[0-9a-f-]{36}\.m4a$/i.test(row.name));
    return Promise.all(recordings.map(async (row) => ({
        recordingId: row.name.slice(0, -4),
        url: await createRecordingSignedUrl(deviceId, row.name),
        createdAt: row.created_at,
        size: row.metadata?.size,
    })));
}
function pushDeviceListUpdate() {
    dashboardSockets.forEach(async (dash) => {
        if (!dash.userId || dash.readyState !== ws_1.WebSocket.OPEN || (dash.authExpiresAt || 0) <= Date.now())
            return;
        try {
            const pairedRows = await getWorkspaceDevices(dash.workspaceIds || []);
            if (dash.readyState !== ws_1.WebSocket.OPEN)
                return;
            const devices = pairedRows.map((row) => {
                deviceOwnerIds.set(row.device_id, row.workspace_id);
                const info = deviceRegistry.get(row.device_id) || {
                    manufacturer: "Unknown",
                    model: "Device",
                    androidVersion: "?",
                    sdkInt: 0,
                };
                const online = connectedDevices.get(row.device_id)?.readyState === ws_1.WebSocket.OPEN;
                return {
                    id: row.device_id,
                    ...info,
                    online,
                    lastSeenAt: online ? new Date().toISOString() : row.last_seen_at,
                    lastNetworkType: row.last_network_type,
                    lastNetworkAt: row.last_network_at,
                    lastInternetAvailable: row.last_internet_available,
                };
            });
            dash.send(JSON.stringify({ type: "DEVICE_UPDATE", devices }));
        }
        catch (error) {
            console.error("Could not refresh dashboard device list:", error);
        }
    });
}
// Active heartbeat to prune dead sockets every 10 seconds
const pingInterval = setInterval(() => {
    for (const [code, pending] of pendingPairings) {
        if (pending.expiresAt <= Date.now()) {
            pendingPairings.delete(code);
            if (pending.socket.readyState === ws_1.WebSocket.OPEN && pending.socket.clientType === "PENDING_PHONE") {
                issuePairingCode(pending.socket);
            }
        }
    }
    wss.clients.forEach((ws) => {
        const extWs = ws;
        if (extWs.clientType === "DASHBOARD" && (extWs.authExpiresAt || 0) <= Date.now()) {
            extWs.terminate();
            return;
        }
        if (extWs.isAlive === false) {
            if (extWs.deviceId && connectedDevices.get(extWs.deviceId) === extWs) {
                connectedDevices.delete(extWs.deviceId);
                console.log(`[Heartbeat] Removed unresponsive device: ${extWs.deviceId}`);
                pushDeviceListUpdate();
            }
            return extWs.terminate();
        }
        extWs.isAlive = false;
        extWs.ping();
    });
}, 10000);
wss.on("close", () => {
    clearInterval(pingInterval);
});
wss.on("connection", (socket) => {
    const extWs = socket;
    extWs.isAlive = true;
    extWs.on("pong", () => {
        extWs.isAlive = true;
    });
    extWs.on("message", async (data) => {
        extWs.isAlive = true;
        try {
            const parsed = JSON.parse(data.toString());
            if (parsed.type === "DASHBOARD_AUTH") {
                const accessToken = String(parsed.accessToken || "");
                const userId = await authenticateSupabaseUser(accessToken);
                if (!userId) {
                    extWs.send(JSON.stringify({ type: "AUTH_ERROR", message: "Your sign-in expired or could not be verified. Please sign in again." }));
                    extWs.close(1008, "Dashboard authentication failed");
                    return;
                }
                let workspaceIds;
                try {
                    workspaceIds = await getUserWorkspaceIds(userId);
                }
                catch (error) {
                    console.error("Workspace lookup failed:", error);
                    workspaceIds = [];
                }
                if (workspaceIds.length === 0) {
                    extWs.send(JSON.stringify({ type: "AUTH_ERROR", message: "Your PhoneBridge workspace is not ready. Apply the database setup, then sign in again." }));
                    extWs.close(1011, "Account workspace unavailable");
                    return;
                }
                if (extWs.clientType && extWs.clientType !== "DASHBOARD") {
                    extWs.close(1008, "Connection already registered");
                    return;
                }
                if (extWs.userId && extWs.userId !== userId) {
                    extWs.close(1008, "Account changed; reconnect to continue");
                    return;
                }
                const expiresAt = getVerifiedTokenExpiry(accessToken);
                if (!expiresAt || expiresAt <= Date.now()) {
                    extWs.send(JSON.stringify({ type: "AUTH_ERROR", message: "Your sign-in token has expired. Please sign in again." }));
                    extWs.close(1008, "Expired dashboard token");
                    return;
                }
                extWs.clientType = "DASHBOARD";
                extWs.userId = userId;
                extWs.workspaceIds = workspaceIds;
                extWs.authExpiresAt = expiresAt;
                dashboardSockets.add(extWs);
                extWs.send(JSON.stringify({ type: "DASHBOARD_AUTHENTICATED" }));
                console.log("[Deck] Authenticated dashboard connected.");
                pushDeviceListUpdate();
                void wakeOfflineDevicesForDashboard(extWs);
                return;
            }
            if (extWs.clientType === "DASHBOARD" && (!extWs.userId || (extWs.authExpiresAt || 0) <= Date.now())) {
                extWs.close(1008, "Dashboard sign-in expired");
                return;
            }
            if (parsed.type === "REGISTER_DEVICE") {
                await registerPhone(extWs, parsed);
                return;
            }
            if (parsed.type === "PUSH_TOKEN") {
                const token = typeof parsed.token === "string" ? parsed.token : "";
                if (token.length < 20 || token.length > 500 || extWs.clientType === "DASHBOARD")
                    return;
                extWs.pendingFcmToken = token;
                if (extWs.clientType === "PHONE" && extWs.deviceId) {
                    await saveDevicePushToken(extWs.deviceId, token);
                }
                return;
            }
            if (extWs.clientType === "PENDING_PHONE")
                return;
            if (extWs.clientType === "PHONE" && extWs.deviceId && parsed.type === "LIVE_AUDIO_STATUS") {
                const info = deviceRegistry.get(extWs.deviceId);
                if (info) {
                    info.remoteAudioReady = Boolean(parsed.ready);
                    info.remoteAudioActive = Boolean(parsed.active);
                }
                broadcastToDashboards({
                    type: "LIVE_AUDIO_STATUS",
                    deviceId: extWs.deviceId,
                    ready: Boolean(parsed.ready),
                    active: Boolean(parsed.active),
                    ...(typeof parsed.error === "string" ? { error: parsed.error.slice(0, 240) } : {}),
                });
                pushDeviceListUpdate();
                return;
            }
            if (extWs.clientType === "PHONE" && extWs.deviceId && parsed.type === "RECORDING_UPLOAD_START") {
                const recordingId = typeof parsed.recordingId === "string" ? parsed.recordingId : "";
                const size = Number(parsed.size);
                const workspaceId = deviceOwnerIds.get(extWs.deviceId);
                if (!workspaceId || !recordingId.match(/^[0-9a-f-]{36}$/i) || !Number.isSafeInteger(size) || size < 1_024 || size > 64 * 1024 * 1024) {
                    extWs.send(JSON.stringify({ type: "RECORDING_UPLOAD_DONE", recordingId, ok: false, error: "Recording upload metadata is invalid or exceeds the 64 MB limit." }));
                    return;
                }
                const old = pendingRecordingUploads.get(extWs.deviceId);
                if (old && Date.now() - old.startedAt < 15 * 60_000 && old.recordingId !== recordingId) {
                    extWs.send(JSON.stringify({ type: "RECORDING_UPLOAD_DONE", recordingId, ok: false, error: "Another recording upload is already in progress." }));
                    return;
                }
                const pendingBytes = [...pendingRecordingUploads.values()].reduce((total, item) => total + item.expectedSize, 0) - (old?.expectedSize || 0);
                if (pendingBytes + size > 128 * 1024 * 1024) {
                    extWs.send(JSON.stringify({ type: "RECORDING_UPLOAD_DONE", recordingId, ok: false, error: "The server is temporarily busy receiving recordings. Try again in a few minutes." }));
                    return;
                }
                pendingRecordingUploads.set(extWs.deviceId, { recordingId, expectedSize: size, receivedSize: 0, nextChunk: 0, chunks: [], startedAt: Date.now() });
                extWs.send(JSON.stringify({ type: "RECORDING_UPLOAD_ACK", recordingId, nextChunk: 0 }));
                return;
            }
            if (extWs.clientType === "PHONE" && extWs.deviceId && parsed.type === "RECORDING_UPLOAD_CHUNK") {
                const upload = pendingRecordingUploads.get(extWs.deviceId);
                const data = typeof parsed.data === "string" ? parsed.data : "";
                const chunkIndex = Number(parsed.index);
                if (!upload || upload.recordingId !== parsed.recordingId || chunkIndex !== upload.nextChunk || data.length > 40_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data))
                    return;
                const chunk = Buffer.from(data, "base64");
                if (!chunk.length || chunk.length > 24 * 1024 || upload.receivedSize + chunk.length > upload.expectedSize)
                    return;
                upload.chunks.push(chunk);
                upload.receivedSize += chunk.length;
                upload.nextChunk += 1;
                extWs.send(JSON.stringify({ type: "RECORDING_UPLOAD_ACK", recordingId: upload.recordingId, nextChunk: upload.nextChunk }));
                return;
            }
            if (extWs.clientType === "PHONE" && extWs.deviceId && parsed.type === "RECORDING_UPLOAD_FINISH") {
                const upload = pendingRecordingUploads.get(extWs.deviceId);
                const recordingId = typeof parsed.recordingId === "string" ? parsed.recordingId : "";
                if (!upload || upload.recordingId !== recordingId)
                    return;
                pendingRecordingUploads.delete(extWs.deviceId);
                try {
                    if (upload.receivedSize !== upload.expectedSize)
                        throw new Error("The uploaded recording was incomplete; the phone will retry it later.");
                    const bytes = Buffer.concat(upload.chunks, upload.receivedSize);
                    const stored = await storeRecording(extWs.deviceId, upload.recordingId, bytes);
                    extWs.send(JSON.stringify({ type: "RECORDING_UPLOAD_DONE", recordingId, ok: true }));
                    broadcastToDashboards({ type: "RECORDING_STORED", deviceId: extWs.deviceId, recordingId, url: stored.url, createdAt: stored.createdAt, size: bytes.length });
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : "Could not save recording.";
                    extWs.send(JSON.stringify({ type: "RECORDING_UPLOAD_DONE", recordingId, ok: false, error: message.slice(0, 240) }));
                    broadcastToDashboards({ type: "ACTIVITY", deviceId: extWs.deviceId, message: `Recording upload failed: ${message.slice(0, 180)}` });
                }
                return;
            }
            if (extWs.clientType === "PHONE" && parsed.type === "WAKE_RECEIVED" && extWs.deviceId) {
                const requestId = typeof parsed.requestId === "string" && /^[0-9a-f-]{36}$/i.test(parsed.requestId) ? parsed.requestId : "";
                if (requestId) {
                    extWs.send(JSON.stringify({ type: "WAKE_ACK_CONFIRMED", requestId }));
                    broadcastToDashboards({ type: "WAKE_ACK", deviceId: extWs.deviceId, requestId });
                }
                return;
            }
            if (extWs.clientType === "DASHBOARD" && parsed.type === "PAIR_DEVICE") {
                const now = Date.now();
                let attemptWindow = pairingAttemptsByUser.get(extWs.userId || "");
                if (!attemptWindow || now - attemptWindow.windowStartedAt > 60_000) {
                    attemptWindow = { count: 0, windowStartedAt: now };
                }
                attemptWindow.count += 1;
                pairingAttemptsByUser.set(extWs.userId || "", attemptWindow);
                if (attemptWindow.count > 10) {
                    extWs.send(JSON.stringify({ type: "PAIR_RESULT", ok: false, message: "Too many attempts. Wait one minute, then try again." }));
                    return;
                }
                const code = String(parsed.code || "").trim();
                if (!/^\d{6}$/.test(code)) {
                    extWs.send(JSON.stringify({ type: "PAIR_RESULT", ok: false, message: "Enter a valid 6-digit pairing code." }));
                    return;
                }
                await pairPendingDevice(extWs, code);
                return;
            }
            if (parsed.type === "DASHBOARD_COMMAND") {
                if (extWs.clientType !== "DASHBOARD" || !extWs.userId || (extWs.authExpiresAt || 0) <= Date.now()) {
                    extWs.close(1008, "Dashboard sign-in required");
                    return;
                }
                const targetId = parsed.deviceId;
                const command = parsed.command;
                if (typeof targetId !== "string" || !extWs.workspaceIds?.includes(deviceOwnerIds.get(targetId) || "")) {
                    extWs.send(JSON.stringify({ type: "ACTIVITY", message: "That phone is not paired to your account." }));
                    return;
                }
                const targetSocket = connectedDevices.get(targetId);
                if (command === "FORGET_DEVICE") {
                    const workspaceId = deviceOwnerIds.get(targetId);
                    if (!workspaceId || !extWs.workspaceIds?.includes(workspaceId))
                        return;
                    const removed = await removeDevicePairing(targetId, workspaceId);
                    if (!removed) {
                        extWs.send(JSON.stringify({ type: "ACTIVITY", message: "Could not remove this phone. Check the server database settings." }));
                        return;
                    }
                    connectedDevices.delete(targetId);
                    deviceOwnerIds.delete(targetId);
                    deviceRegistry.delete(targetId);
                    wakeSentAt.delete(targetId);
                    if (targetSocket?.readyState === ws_1.WebSocket.OPEN)
                        targetSocket.terminate();
                    extWs.send(JSON.stringify({ type: "DEVICE_FORGOTTEN", deviceId: targetId, message: `Forgot ${targetId.slice(0, 8)}. Pair it again if you reinstall or want to reconnect.` }));
                    pushDeviceListUpdate();
                    return;
                }
                if (command === "WAKE_DEVICE" || command === "TEST_WAKE") {
                    const isTest = command === "TEST_WAKE";
                    if (!isTest && targetSocket?.readyState === ws_1.WebSocket.OPEN) {
                        extWs.send(JSON.stringify({ type: "WAKE_STATUS", deviceId: targetId, status: "online" }));
                        return;
                    }
                    const requestId = isTest && typeof parsed.requestId === "string" && /^[0-9a-f-]{36}$/i.test(parsed.requestId) ? parsed.requestId : "";
                    if (isTest && !requestId) {
                        extWs.send(JSON.stringify({ type: "WAKE_STATUS", deviceId: targetId, status: "failed", test: true, message: "Could not create a valid test request. Refresh and try again." }));
                        return;
                    }
                    const pushToken = await getDevicePushToken(targetId);
                    if (!pushToken) {
                        extWs.send(JSON.stringify({
                            type: "WAKE_STATUS",
                            deviceId: targetId,
                            status: "unavailable",
                            test: isTest,
                            message: "No wake token is registered yet. Open PhoneBridge on the phone with internet once, then try again.",
                        }));
                        return;
                    }
                    const result = await sendWakePush(targetId, pushToken, requestId);
                    extWs.send(JSON.stringify({
                        type: "WAKE_STATUS",
                        deviceId: targetId,
                        status: result.ok ? "sent" : "failed",
                        test: isTest,
                        message: result.ok ? (isTest ? "Firebase accepted the test push. Waiting for the phone to confirm receipt…" : "Wake request sent. Waiting for the phone to reconnect…") : result.reason,
                    }));
                    if (result.ok) {
                        broadcastToDashboards({ type: "ACTIVITY", deviceId: targetId, message: `Wake request sent to ${targetId.slice(0, 8)}; waiting for the phone.` });
                    }
                    return;
                }
                if (command === "LIST_RECORDINGS") {
                    try {
                        const recordings = await listDeviceRecordings(targetId);
                        extWs.send(JSON.stringify({ type: "RECORDINGS_LIST", deviceId: targetId, recordings }));
                    }
                    catch (error) {
                        const message = error instanceof Error ? error.message : "Could not load recordings.";
                        extWs.send(JSON.stringify({ type: "ACTIVITY", deviceId: targetId, message }));
                    }
                    return;
                }
                if (command === "DELETE_RECORDING") {
                    const recordingId = typeof parsed.recordingId === "string" ? parsed.recordingId : "";
                    if (!/^[0-9a-f-]{36}$/i.test(recordingId))
                        return;
                    try {
                        const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(SUPABASE_RECORDINGS_BUCKET)}`, {
                            method: "DELETE",
                            headers: supabaseStorageHeaders({ "Content-Type": "application/json" }),
                            body: JSON.stringify({ prefixes: [`${targetId}/${recordingId}.m4a`] }),
                        });
                        if (!response.ok)
                            throw new Error(`Storage delete returned ${response.status}.`);
                        extWs.send(JSON.stringify({ type: "RECORDING_DELETED", deviceId: targetId, recordingId }));
                    }
                    catch (error) {
                        const message = error instanceof Error ? error.message : "Could not delete recording.";
                        extWs.send(JSON.stringify({ type: "ACTIVITY", deviceId: targetId, message }));
                    }
                    return;
                }
                if (!targetSocket || targetSocket.readyState !== ws_1.WebSocket.OPEN) {
                    connectedDevices.delete(targetId);
                    pushDeviceListUpdate();
                    broadcastToDashboards({
                        type: "ACTIVITY",
                        deviceId: targetId,
                        message: `Command failed: Device ${targetId.slice(0, 8)} is offline.`,
                    });
                    return;
                }
                const outboundCommand = {
                    type: "COMMAND",
                    command: command,
                };
                if (parsed.count !== undefined) {
                    outboundCommand.count = parsed.count;
                }
                if (parsed.intervalMs !== undefined) {
                    outboundCommand.intervalMs = parsed.intervalMs;
                }
                targetSocket.send(JSON.stringify(outboundCommand));
                console.log(`[Deck -> Phone] Dispatched ${command} to ${targetId}`);
                return;
            }
            if (extWs.clientType !== "PHONE" || !extWs.deviceId)
                return;
            if (parsed.type === "DEVICE_INFO" && extWs.deviceId) {
                const devId = extWs.deviceId;
                const current = deviceRegistry.get(devId) || {
                    manufacturer: parsed.manufacturer,
                    model: parsed.model,
                    androidVersion: parsed.androidVersion,
                    sdkInt: parsed.sdkInt,
                };
                current.manufacturer = parsed.manufacturer;
                current.model = parsed.model;
                current.androidVersion = parsed.androidVersion;
                current.sdkInt = parsed.sdkInt;
                deviceRegistry.set(devId, current);
                pushDeviceListUpdate();
                return;
            }
            if (parsed.type === "BATTERY_INFO" && extWs.deviceId) {
                const devId = extWs.deviceId;
                const current = deviceRegistry.get(devId) || {
                    manufacturer: "Unknown",
                    model: "Device",
                    androidVersion: "?",
                    sdkInt: 0,
                };
                current.batteryLevel = parsed.level;
                current.isCharging = parsed.isCharging;
                deviceRegistry.set(devId, current);
                pushDeviceListUpdate();
                return;
            }
            if (parsed.type === "TELEMETRY_DATA" && extWs.deviceId) {
                const devId = extWs.deviceId;
                const current = deviceRegistry.get(devId) || {
                    manufacturer: "Unknown",
                    model: "Device",
                    androidVersion: "?",
                    sdkInt: 0,
                };
                current.telemetry = {
                    networkType: parsed.networkType,
                    internetAvailable: typeof parsed.internetAvailable === "boolean" ? parsed.internetAvailable : undefined,
                    wifiSSID: parsed.wifiSSID,
                    totalRamMb: parsed.totalRamMb,
                    availRamMb: parsed.availRamMb,
                    usedRamMb: parsed.usedRamMb,
                    isLowMem: parsed.isLowMem,
                    totalStorageGb: parsed.totalStorageGb,
                    availStorageGb: parsed.availStorageGb,
                    isScreenOn: parsed.isScreenOn,
                };
                deviceRegistry.set(devId, current);
                void updateDevicePresence(devId, typeof parsed.networkType === "string" ? parsed.networkType : undefined, typeof parsed.internetAvailable === "boolean" ? parsed.internetAvailable : undefined);
                pushDeviceListUpdate();
                broadcastToDashboards({
                    type: "ACTIVITY",
                    deviceId: devId,
                    message: `Telemetry synced from ${devId.slice(0, 8)}: ${parsed.networkType}, RAM: ${parsed.usedRamMb}/${parsed.totalRamMb}MB`,
                });
                return;
            }
            if (parsed.type === "LOCATION_DATA" && extWs.deviceId) {
                const devId = extWs.deviceId;
                const current = deviceRegistry.get(devId) || {
                    manufacturer: "Unknown",
                    model: "Device",
                    androidVersion: "?",
                    sdkInt: 0,
                };
                current.location = {
                    latitude: parsed.latitude,
                    longitude: parsed.longitude,
                    accuracy: parsed.accuracy,
                    altitude: parsed.altitude,
                    speed: parsed.speed,
                    timestamp: parsed.timestamp,
                };
                deviceRegistry.set(devId, current);
                pushDeviceListUpdate();
                broadcastToDashboards({
                    type: "ACTIVITY",
                    deviceId: devId,
                    message: `Location received from ${devId.slice(0, 8)}: ${parsed.latitude.toFixed(4)}, ${parsed.longitude.toFixed(4)}`,
                });
                return;
            }
            if (parsed.type === "CALL_LOG_DATA" && extWs.deviceId) {
                broadcastToDashboards({
                    type: "CALL_LOG_DATA",
                    deviceId: extWs.deviceId,
                    entries: Array.isArray(parsed.entries) ? parsed.entries : [],
                });
                return;
            }
            if (parsed.type === "SMS_DATA" && extWs.deviceId) {
                broadcastToDashboards({
                    type: "SMS_DATA",
                    deviceId: extWs.deviceId,
                    entries: Array.isArray(parsed.entries) ? parsed.entries : [],
                });
                return;
            }
            if (parsed.type === "NOTIFICATION_DATA" && extWs.deviceId) {
                const devId = extWs.deviceId;
                const notification = parsed.notification && typeof parsed.notification === "object"
                    ? parsed.notification
                    : {};
                const current = deviceRegistry.get(devId) || {
                    manufacturer: "Unknown",
                    model: "Device",
                    androidVersion: "?",
                    sdkInt: 0,
                };
                current.notifications = [
                    notification,
                    ...(current.notifications || []),
                ].slice(0, 50);
                deviceRegistry.set(devId, current);
                pushDeviceListUpdate();
                broadcastToDashboards({
                    type: "NOTIFICATION_DATA",
                    deviceId: devId,
                    notification,
                });
                return;
            }
            if ((parsed.type === "PHOTO_DATA" || parsed.type === "IMAGE_CAPTURE") && extWs.deviceId) {
                const devId = extWs.deviceId;
                const base64Image = parsed.image || parsed.data || parsed.base64;
                const lensFacing = parsed.lens || parsed.camera || "CAMERA";
                if (base64Image) {
                    const current = deviceRegistry.get(devId);
                    if (current) {
                        current.lastCapturedPhoto = base64Image;
                    }
                    broadcastToDashboards({
                        type: "PHOTO_RECEIVED",
                        deviceId: devId,
                        lens: lensFacing,
                        image: base64Image,
                    });
                    broadcastToDashboards({
                        type: "ACTIVITY",
                        deviceId: devId,
                        message: `Photo captured via ${lensFacing} by ${devId.slice(0, 8)}`,
                    });
                }
                return;
            }
            if (parsed.type === "SCREEN_CAPTURE_STATUS" && extWs.deviceId) {
                const devId = extWs.deviceId;
                const current = deviceRegistry.get(devId) || {
                    manufacturer: "Unknown",
                    model: "Device",
                    androidVersion: "?",
                    sdkInt: 0,
                };
                current.screenCaptureActive = Boolean(parsed.active);
                deviceRegistry.set(devId, current);
                pushDeviceListUpdate();
                broadcastToDashboards({
                    type: "SCREEN_CAPTURE_STATUS",
                    deviceId: devId,
                    active: Boolean(parsed.active),
                });
                broadcastToDashboards({
                    type: "ACTIVITY",
                    deviceId: devId,
                    message: `Screen capture ${parsed.active ? "started" : "stopped"} on ${devId.slice(0, 8)}`,
                });
                return;
            }
            if (parsed.type === "SCREENSHOT_DATA" && extWs.deviceId) {
                const devId = extWs.deviceId;
                const base64Image = parsed.image || parsed.data || parsed.base64;
                if (base64Image) {
                    const current = deviceRegistry.get(devId) || {
                        manufacturer: "Unknown",
                        model: "Device",
                        androidVersion: "?",
                        sdkInt: 0,
                    };
                    current.lastCapturedScreen = base64Image;
                    deviceRegistry.set(devId, current);
                    broadcastToDashboards({
                        type: "SCREENSHOT_RECEIVED",
                        deviceId: devId,
                        index: Number.isFinite(parsed.index) ? parsed.index : 0,
                        total: Number.isFinite(parsed.total) ? parsed.total : 1,
                        image: base64Image,
                        timestamp: parsed.timestamp,
                    });
                }
                return;
            }
            if (parsed.type === "SCREENSHOT_COMPLETE" && extWs.deviceId) {
                const devId = extWs.deviceId;
                const total = Number.isFinite(parsed.total) ? parsed.total : 1;
                broadcastToDashboards({
                    type: "SCREENSHOT_COMPLETE",
                    deviceId: devId,
                    total: total,
                    timestamp: parsed.timestamp,
                });
                broadcastToDashboards({
                    type: "ACTIVITY",
                    deviceId: devId,
                    message: `Screen capture completed on ${devId.slice(0, 8)} (${total} frame${total === 1 ? "" : "s"})`,
                });
                return;
            }
            if (parsed.type === "SCREENSHOT_ERROR" && extWs.deviceId) {
                const devId = extWs.deviceId;
                const error = parsed.error || "Unknown screen capture error";
                broadcastToDashboards({
                    type: "SCREENSHOT_ERROR",
                    deviceId: devId,
                    error: error,
                });
                broadcastToDashboards({
                    type: "ACTIVITY",
                    deviceId: devId,
                    message: `Screen capture error from ${devId.slice(0, 8)}: ${error}`,
                });
                return;
            }
            if (parsed.type === "CAMERA_ERROR" && extWs.deviceId) {
                broadcastToDashboards({
                    type: "ACTIVITY",
                    deviceId: extWs.deviceId,
                    message: `Camera error from ${extWs.deviceId.slice(0, 8)}: ${parsed.error}`,
                });
                return;
            }
            if (parsed.type === "LOCATION_ERROR" && extWs.deviceId) {
                broadcastToDashboards({
                    type: "ACTIVITY",
                    deviceId: extWs.deviceId,
                    message: `Location failed for ${extWs.deviceId.slice(0, 8)}: ${parsed.error}`,
                });
                return;
            }
            if (parsed.type === "COMMAND_ACK" && extWs.deviceId) {
                broadcastToDashboards({
                    type: "ACTIVITY",
                    deviceId: extWs.deviceId,
                    message: `Device ${extWs.deviceId.slice(0, 8)} completed ${parsed.command} (${parsed.status})`,
                });
                return;
            }
            if (parsed.type === "PONG" && extWs.deviceId) {
                broadcastToDashboards({
                    type: "ACTIVITY",
                    deviceId: extWs.deviceId,
                    message: `Pong received from ${extWs.deviceId.slice(0, 8)} - Online`,
                });
                return;
            }
        }
        catch (err) {
            console.error("Failed to parse incoming WS message:", err);
        }
    });
    socket.on("close", () => {
        if (extWs.pairingCode)
            pendingPairings.delete(extWs.pairingCode);
        if (extWs.clientType === "DASHBOARD") {
            dashboardSockets.delete(extWs);
            console.log("[Deck] Browser dashboard disconnected.");
        }
        else if (extWs.deviceId) {
            const devId = extWs.deviceId;
            pendingRecordingUploads.delete(devId);
            if (connectedDevices.get(devId) === extWs) {
                connectedDevices.delete(devId);
                const deviceInfo = deviceRegistry.get(devId);
                if (deviceInfo) {
                    deviceInfo.remoteAudioReady = false;
                }
                broadcastToDashboards({ type: "LIVE_AUDIO_STATUS", deviceId: devId, ready: false, active: Boolean(deviceInfo?.remoteAudioActive), error: "Phone disconnected. An active recording may continue locally; use the phone notification to stop it." });
                console.log(`Device disconnected: ${devId}`);
                pushDeviceListUpdate();
                broadcastToDashboards({
                    type: "ACTIVITY",
                    deviceId: devId,
                    message: `Device disconnected: ${devId.slice(0, 8)}...`,
                });
            }
        }
    });
    socket.on("error", (err) => {
        console.error("Socket error encountered:", err);
    });
});
httpServer.listen(PORT, () => {
    console.log(`PhoneBridge server & dashboard running on port ${PORT}`);
});
