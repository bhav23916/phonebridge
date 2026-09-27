"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = __importDefault(require("http"));
const ws_1 = require("ws");
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;
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
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 20px; box-shadow: 0 4px 6px rgba(0,0,0,0.3); }
    .card h2 { margin: 0 0 8px 0; font-size: 18px; color: #f1f5f9; }
    .device-meta { font-size: 13px; color: #94a3b8; margin-bottom: 16px; line-height: 1.5; }
    .meta-tag { font-family: monospace; font-size: 11px; background: #0f172a; padding: 2px 6px; border-radius: 4px; }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
    button { background: #2563eb; color: white; border: none; padding: 8px 14px; border-radius: 6px; font-size: 13px; font-weight: 500; cursor: pointer; transition: background 0.15s; }
    button:hover { background: #1d4ed8; }
    button.torch-off { background: #475569; }
    button.torch-off:hover { background: #334155; }
    .log-box { margin-top: 24px; background: #020617; border: 1px solid #1e293b; border-radius: 8px; padding: 12px; height: 160px; overflow-y: auto; font-family: monospace; font-size: 12px; color: #a5f3fc; }
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
      }
    };

    function sendCommand(deviceId, command) {
      ws.send(JSON.stringify({
        type: "DASHBOARD_COMMAND",
        deviceId: deviceId,
        command: command
      }));
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

        return \`
          <div class="card">
            <h2>\${d.manufacturer || "Android"} \${d.model || "Device"}</h2>
            <div class="device-meta">
              <div>OS: Android \${d.androidVersion || "?"} (SDK \${d.sdkInt || "?"})</div>
              <div>Battery: \${batteryStr}</div>
              <div style="margin-top: 6px;">ID: <span class="meta-tag">\${d.id}</span></div>
            </div>
            <div class="actions">
              <button onclick="sendCommand('\${d.id}', 'PING')">Ping</button>
              <button onclick="sendCommand('\${d.id}', 'VIBRATE')">Vibrate</button>
              <button onclick="sendCommand('\${d.id}', 'GET_BATTERY')">Refresh Battery</button>
              <button onclick="sendCommand('\${d.id}', 'TORCH_ON')">Torch ON</button>
              <button class="torch-off" onclick="sendCommand('\${d.id}', 'TORCH_OFF')">Torch OFF</button>
            </div>
          </div>
        \`;
      }).join("");
    }
  </script>
</body>
</html>`;
const httpServer = http_1.default.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(DASHBOARD_HTML);
});
const wss = new ws_1.WebSocketServer({ server: httpServer });
const connectedDevices = new Map();
const deviceRegistry = new Map();
const dashboardSockets = new Set();
function broadcastToDashboards(messageObj) {
    const payload = JSON.stringify(messageObj);
    dashboardSockets.forEach((dash) => {
        if (dash.readyState === ws_1.WebSocket.OPEN) {
            dash.send(payload);
        }
    });
}
function pushDeviceListUpdate() {
    const devices = [];
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
function dispatchCommandToDevice(deviceId, commandName) {
    const socket = connectedDevices.get(deviceId);
    if (!socket || socket.readyState !== ws_1.WebSocket.OPEN) {
        console.log(`Device ${deviceId} not available.`);
        return false;
    }
    socket.send(JSON.stringify({
        type: "COMMAND",
        command: commandName,
    }));
    return true;
}
wss.on("connection", (socket) => {
    let clientType = null;
    let deviceId = null;
    socket.on("message", (data) => {
        try {
            const parsed = JSON.parse(data.toString());
            if (parsed.type === "REGISTER_DASHBOARD") {
                clientType = "DASHBOARD";
                dashboardSockets.add(socket);
                console.log("[Deck] Browser dashboard connected.");
                pushDeviceListUpdate();
                return;
            }
            if (parsed.type === "DASHBOARD_COMMAND") {
                const targetId = parsed.deviceId;
                const command = parsed.command;
                const ok = dispatchCommandToDevice(targetId, command);
                if (ok) {
                    console.log(`[Deck -> Phone] Dispatched ${command} to ${targetId}`);
                }
                return;
            }
            if (parsed.type === "REGISTER_DEVICE") {
                clientType = "PHONE";
                deviceId = parsed.deviceId;
                if (!deviceId)
                    return;
                connectedDevices.set(deviceId, socket);
                console.log(`Device registered: ${deviceId}`);
                socket.send(JSON.stringify({ type: "REGISTRATION_SUCCESS", deviceId }));
                socket.send(JSON.stringify({ type: "COMMAND", command: "GET_DEVICE_INFO" }));
                socket.send(JSON.stringify({ type: "COMMAND", command: "GET_BATTERY" }));
                pushDeviceListUpdate();
                broadcastToDashboards({
                    type: "ACTIVITY",
                    message: `Device connected: ${deviceId.slice(0, 8)}...`,
                });
                return;
            }
            if (parsed.type === "DEVICE_INFO" && deviceId) {
                const current = deviceRegistry.get(deviceId) || {
                    manufacturer: parsed.manufacturer,
                    model: parsed.model,
                    androidVersion: parsed.androidVersion,
                    sdkInt: parsed.sdkInt,
                };
                current.manufacturer = parsed.manufacturer;
                current.model = parsed.model;
                current.androidVersion = parsed.androidVersion;
                current.sdkInt = parsed.sdkInt;
                deviceRegistry.set(deviceId, current);
                pushDeviceListUpdate();
                return;
            }
            if (parsed.type === "BATTERY_INFO" && deviceId) {
                const current = deviceRegistry.get(deviceId) || {
                    manufacturer: "Unknown",
                    model: "Device",
                    androidVersion: "?",
                    sdkInt: 0,
                };
                current.batteryLevel = parsed.level;
                current.isCharging = parsed.isCharging;
                deviceRegistry.set(deviceId, current);
                pushDeviceListUpdate();
                return;
            }
            if (parsed.type === "COMMAND_ACK" && deviceId) {
                broadcastToDashboards({
                    type: "ACTIVITY",
                    message: `Device ${deviceId.slice(0, 8)} completed ${parsed.command} (${parsed.status})`,
                });
                return;
            }
            if (parsed.type === "PONG" && deviceId) {
                broadcastToDashboards({
                    type: "ACTIVITY",
                    message: `Pong received from ${deviceId.slice(0, 8)} - Online`,
                });
                return;
            }
        }
        catch {
            // ignore non-json messages
        }
    });
    socket.on("close", () => {
        if (clientType === "DASHBOARD") {
            dashboardSockets.delete(socket);
            console.log("[Deck] Browser dashboard disconnected.");
        }
        else if (deviceId) {
            connectedDevices.delete(deviceId);
            deviceRegistry.delete(deviceId);
            console.log(`Device disconnected: ${deviceId}`);
            pushDeviceListUpdate();
            broadcastToDashboards({
                type: "ACTIVITY",
                message: `Device disconnected: ${deviceId.slice(0, 8)}...`,
            });
        }
    });
});
httpServer.listen(PORT, () => {
    console.log(`PhoneBridge server & dashboard running on port ${PORT}`);
});
