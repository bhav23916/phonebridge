import http from "http";
import { createHash, randomInt } from "crypto";
import { WebSocketServer, WebSocket } from "ws";

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;

interface DeviceLocation {
  latitude: number;
  longitude: number;
  accuracy?: number;
  altitude?: number;
  speed?: number;
  timestamp?: number;
}

interface DeviceTelemetry {
  networkType: string;
  wifiSSID: string;
  totalRamMb: number;
  availRamMb: number;
  usedRamMb: number;
  isLowMem: boolean;
  totalStorageGb: number;
  availStorageGb: number;
  isScreenOn: boolean;
}

interface DeviceInfo {
  manufacturer: string;
  model: string;
  androidVersion: string;
  sdkInt: number;
  batteryLevel?: number;
  isCharging?: boolean;
  location?: DeviceLocation;
  telemetry?: DeviceTelemetry;
  lastCapturedPhoto?: string;
  screenCaptureActive?: boolean;
  lastCapturedScreen?: string;
  notifications?: Array<Record<string, unknown>>;
}

interface ExtWebSocket extends WebSocket {
  isAlive: boolean;
  deviceId?: string;
  clientType?: "PHONE" | "PENDING_PHONE" | "DASHBOARD";
  userId?: string;
  workspaceIds?: string[];
  authExpiresAt?: number;
  deviceTokenHash?: string;
  pairingCode?: string;
}

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || "";
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || "";

const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>PhoneBridge Dashboard</title>
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <style>
    * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background: #0f172a; color: #f8fafc; margin: 0; padding: 24px; }
    header { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #334155; padding-bottom: 16px; margin-bottom: 24px; }
    h1 { margin: 0; font-size: 22px; font-weight: 700; color: #38bdf8; }
    .status-badge { background: #1e293b; padding: 6px 12px; border-radius: 9999px; font-size: 13px; border: 1px solid #475569; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(380px, 1fr)); gap: 16px; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 20px; box-shadow: 0 4px 6px rgba(0,0,0,0.3); }
    .card h2 { margin: 0 0 8px 0; font-size: 18px; color: #f1f5f9; }
    .device-meta { font-size: 13px; color: #94a3b8; margin-bottom: 14px; line-height: 1.5; }
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
    .auth-panel { max-width: 480px; margin: 12vh auto; padding: 28px; background: #1e293b; border: 1px solid #334155; border-radius: 16px; }
    .auth-panel p { color: #cbd5e1; line-height: 1.5; }
    .auth-panel button { width: 100%; padding: 12px 16px; font-size: 14px; }
    .auth-error { color: #fca5a5; min-height: 20px; font-size: 13px; }
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

  <section class="auth-panel" id="authPanel">
    <h2>Sign in to PhoneBridge</h2>
    <p>Sign in with Google to access devices paired to your account.</p>
    <button id="googleSignIn" type="button" onclick="signInWithGoogle()">Continue with Google</button>
    <div class="auth-error" id="authError" role="status"></div>
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
    const deviceListEl = document.getElementById("deviceList");
    const deckStatusEl = document.getElementById("deckStatus");
    const activityLogEl = document.getElementById("activityLog");
    const notificationsByDevice = new Map();

    function logEvent(text) {
      const line = document.createElement("div");
      line.textContent = "[" + new Date().toLocaleTimeString() + "] " + text;
      activityLogEl.prepend(line);
    }

    function escapeHtml(value) {
      return String(value == null ? "" : value).replace(/[&<>"']/g, character => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
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

    async function signInWithGoogle() {
      if (!supabaseClient) {
        setAuthError("The dashboard authentication settings are missing. Ask the server administrator to configure them.");
        return;
      }
      setAuthError("");
      const { error } = await supabaseClient.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin + "/" }
      });
      if (error) setAuthError(error.message);
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
      currentSession = session;
      if (ws) { try { ws.close(); } catch (_) {} }
      const socket = new WebSocket(protocol + window.location.host);
      ws = socket;

      socket.onopen = () => {
        deckStatusEl.textContent = "Authenticating...";
        socket.send(JSON.stringify({ type: "DASHBOARD_AUTH", accessToken: session.access_token }));
      };

      socket.onclose = () => {
        if (ws !== socket) return;
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
        ws.close();
      } else if (msg.type === "PAIR_RESULT") {
        document.getElementById("pairStatus").textContent = msg.message || (msg.ok ? "Phone paired." : "Pairing failed.");
        if (msg.ok) document.getElementById("pairCode").value = "";
      } else if (msg.type === "DEVICE_UPDATE") {
        renderDevices(msg.devices);
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
      supabaseClient.auth.onAuthStateChange((event, session) => {
        if (session) {
          setAuthError("");
          connectDashboard(session);
        } else {
          currentSession = null;
          dashboardAuthenticated = false;
          if (ws) { ws.close(); ws = null; }
          document.getElementById("authPanel").style.display = "block";
          document.getElementById("dashboardContent").style.display = "none";
          document.getElementById("accountActions").style.display = "none";
        }
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

    function renderDevices(devices) {
      if (devices.length === 0) {
        deviceListEl.innerHTML = '<div style="color: #64748b; font-size: 14px;">No phones connected.</div>';
        return;
      }

      deviceListEl.innerHTML = devices.map(d => {
        if (Array.isArray(d.notifications)) {
          notificationsByDevice.set(d.id, d.notifications);
        }
        const batteryStr = d.batteryLevel !== undefined 
          ? d.batteryLevel + "%" + (d.isCharging ? " (Charging)" : "") 
          : "Unknown";

        const t = d.telemetry;
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
              <div>OS: Android \${escapeHtml(d.androidVersion || "?")} (SDK \${escapeHtml(d.sdkInt || "?")})</div>
              <div>Battery: \${escapeHtml(batteryStr)}</div>
              <div style="margin-top: 4px;">ID: <span class="meta-tag">\${escapeHtml(d.id)}</span></div>
              \${telemetryHtml}
              \${locHtml}
              <div class="screen-status" style="color: \${d.screenCaptureActive ? '#4ade80' : '#94a3b8'}">
                Screen Capture: \${d.screenCaptureActive ? 'ACTIVE' : 'INACTIVE'}
              </div>
            </div>
            <div class="actions">
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

const httpServer = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("OK");
    return;
  }

  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  const safeConfigValue = (value: string) => JSON.stringify(value).replace(/</g, "\\u003c");
  res.end(
    DASHBOARD_HTML
      .replace("__SUPABASE_URL__", safeConfigValue(SUPABASE_URL))
      .replace("__SUPABASE_PUBLISHABLE_KEY__", safeConfigValue(SUPABASE_PUBLISHABLE_KEY))
  );
});

const wss = new WebSocketServer({
  server: httpServer,
  maxPayload: 15 * 1024 * 1024,
});

const connectedDevices = new Map<string, ExtWebSocket>();
const deviceRegistry = new Map<string, DeviceInfo>();
const deviceOwnerIds = new Map<string, string>();
const dashboardSockets = new Set<ExtWebSocket>();
const pendingPairings = new Map<string, { socket: ExtWebSocket; expiresAt: number }>();
const pairingAttemptsByUser = new Map<string, { count: number; windowStartedAt: number }>();

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function authenticateSupabaseUser(accessToken: string): Promise<string | null> {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || !accessToken) return null;
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (!response.ok) return null;
    const user = await response.json() as { id?: string };
    return typeof user.id === "string" ? user.id : null;
  } catch (error) {
    console.error("Supabase token verification failed:", error);
    return null;
  }
}

function getVerifiedTokenExpiry(accessToken: string): number | null {
  try {
    const payload = JSON.parse(Buffer.from(accessToken.split(".")[1], "base64url").toString("utf8")) as { exp?: number };
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

async function getUserWorkspaceIds(userId: string): Promise<string[]> {
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
  const rows = await response.json() as Array<{ workspace_id: string }>;
  return rows.map((row) => row.workspace_id);
}

async function getPairedDevice(deviceId: string): Promise<{ workspaceId: string; tokenHash: string } | null> {
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) return null;
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
  const rows = await response.json() as Array<{ workspace_id: string; device_token_hash: string }>;
  const row = rows[0];
  return row ? { workspaceId: row.workspace_id, tokenHash: row.device_token_hash } : null;
}

async function saveDevicePairing(deviceId: string, workspaceId: string, pairedBy: string, tokenHash: string): Promise<boolean> {
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) return false;
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

function issuePairingCode(socket: ExtWebSocket) {
  if (!socket.deviceId || !socket.deviceTokenHash || socket.readyState !== WebSocket.OPEN) return;
  if (socket.pairingCode) pendingPairings.delete(socket.pairingCode);
  let code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  while (pendingPairings.has(code)) code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const expiresAt = Date.now() + 10 * 60 * 1000;
  socket.clientType = "PENDING_PHONE";
  socket.pairingCode = code;
  pendingPairings.set(code, { socket, expiresAt });
  socket.send(JSON.stringify({ type: "PAIRING_REQUIRED", code, expiresAt }));
}

function registerPairedDevice(socket: ExtWebSocket, deviceId: string, workspaceId: string) {
  socket.clientType = "PHONE";
  socket.deviceId = deviceId;
  deviceOwnerIds.set(deviceId, workspaceId);
  const previous = connectedDevices.get(deviceId);
  if (previous && previous !== socket) previous.terminate();
  connectedDevices.set(deviceId, socket);
  if (!deviceRegistry.has(deviceId)) {
    deviceRegistry.set(deviceId, {
      manufacturer: "Unknown",
      model: "Device",
      androidVersion: "?",
      sdkInt: 0,
    });
  }
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

async function registerPhone(socket: ExtWebSocket, message: Record<string, unknown>) {
  const deviceId = typeof message.deviceId === "string" ? message.deviceId : "";
  const deviceToken = typeof message.deviceToken === "string" ? message.deviceToken : "";
  if (!/^[0-9a-fA-F-]{36}$/.test(deviceId) || deviceToken.length < 32 || deviceToken.length > 256) {
    socket.close(1008, "Invalid device credentials");
    return;
  }
  if (!SUPABASE_SECRET_KEY || !SUPABASE_URL) {
    socket.close(1011, "Server database is not configured");
    return;
  }

  const tokenHash = sha256(deviceToken);
  let pairedDevice: { workspaceId: string; tokenHash: string } | null;
  try {
    pairedDevice = await getPairedDevice(deviceId);
  } catch (error) {
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
    return;
  }

  // Unpaired phones stay isolated: they send no telemetry and accept no commands.
  socket.deviceId = deviceId;
  socket.deviceTokenHash = tokenHash;
  issuePairingCode(socket);
}

async function pairPendingDevice(dashboard: ExtWebSocket, code: string) {
  if (!dashboard.userId || !dashboard.workspaceIds?.length) return;
  const pending = pendingPairings.get(code);
  if (!pending || pending.expiresAt <= Date.now() || pending.socket.readyState !== WebSocket.OPEN) {
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
}

function broadcastToDashboards(messageObj: object) {
  const payload = JSON.stringify(messageObj);
  const deviceId = (messageObj as { deviceId?: string }).deviceId;
  const workspaceId = deviceId ? deviceOwnerIds.get(deviceId) : undefined;
  dashboardSockets.forEach((dash) => {
    if (dash.readyState === WebSocket.OPEN && dash.userId && (dash.authExpiresAt || 0) > Date.now() && (!deviceId || dash.workspaceIds?.includes(workspaceId || ""))) {
      dash.send(payload);
    }
  });
}

function pushDeviceListUpdate() {
  dashboardSockets.forEach((dash) => {
    if (!dash.userId || dash.readyState !== WebSocket.OPEN || (dash.authExpiresAt || 0) <= Date.now()) return;
    const devices: Array<{ id: string } & Partial<DeviceInfo>> = [];
    connectedDevices.forEach((_, id) => {
      if (!dash.workspaceIds?.includes(deviceOwnerIds.get(id) || "")) return;
      const info = deviceRegistry.get(id) || {
        manufacturer: "Unknown",
        model: "Device",
        androidVersion: "?",
        sdkInt: 0,
      };
      devices.push({ id, ...info });
    });
    dash.send(JSON.stringify({ type: "DEVICE_UPDATE", devices }));
  });
}

// Active heartbeat to prune dead sockets every 10 seconds
const pingInterval = setInterval(() => {
  for (const [code, pending] of pendingPairings) {
    if (pending.expiresAt <= Date.now()) {
      pendingPairings.delete(code);
      if (pending.socket.readyState === WebSocket.OPEN && pending.socket.clientType === "PENDING_PHONE") {
        issuePairingCode(pending.socket);
      }
    }
  }
  wss.clients.forEach((ws) => {
    const extWs = ws as ExtWebSocket;
    if (extWs.clientType === "DASHBOARD" && (extWs.authExpiresAt || 0) <= Date.now()) {
      extWs.terminate();
      return;
    }
    if (extWs.isAlive === false) {
      if (extWs.deviceId && connectedDevices.get(extWs.deviceId) === extWs) {
        connectedDevices.delete(extWs.deviceId);
        deviceRegistry.delete(extWs.deviceId);
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

wss.on("connection", (socket: WebSocket) => {
  const extWs = socket as ExtWebSocket;
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
        let workspaceIds: string[];
        try {
          workspaceIds = await getUserWorkspaceIds(userId);
        } catch (error) {
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

      if (extWs.clientType === "PENDING_PHONE") return;

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

        if (!targetSocket || targetSocket.readyState !== WebSocket.OPEN) {
          connectedDevices.delete(targetId);
          deviceRegistry.delete(targetId);
          pushDeviceListUpdate();
          broadcastToDashboards({
            type: "ACTIVITY",
            deviceId: targetId,
            message: `Command failed: Device ${targetId.slice(0, 8)} is offline.`,
          });
          return;
        }

        const outboundCommand: Record<string, unknown> = {
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

      if (extWs.clientType !== "PHONE" || !extWs.deviceId) return;

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
        const notification =
          parsed.notification && typeof parsed.notification === "object"
            ? parsed.notification as Record<string, unknown>
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
    } catch (err) {
      console.error("Failed to parse incoming WS message:", err);
    }
  });

  socket.on("close", () => {
    if (extWs.pairingCode) pendingPairings.delete(extWs.pairingCode);
    if (extWs.clientType === "DASHBOARD") {
      dashboardSockets.delete(extWs);
      console.log("[Deck] Browser dashboard disconnected.");
    } else if (extWs.deviceId) {
      const devId = extWs.deviceId;
      if (connectedDevices.get(devId) === extWs) {
        connectedDevices.delete(devId);
        deviceRegistry.delete(devId);
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
