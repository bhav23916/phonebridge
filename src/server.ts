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
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 16px; }
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
    button.torch-off { background: #475569; }
    button.torch-off:hover { background: #334155; }
    button.alarm-on { background: #dc2626; }
    button.alarm-on:hover { background: #b91c1c; }
    button.alarm-off { background: #64748b; }
    button.alarm-off:hover { background: #475569; }
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
            </div>
            <div class="actions">
              <button class="tele" onclick="sendCommand('\${d.id}', 'GET_TELEMETRY')">Sync Telemetry</button>
              <button class="locate" onclick="sendCommand('\${d.id}', 'GET_LOCATION')">Locate</button>
              <button onclick="sendCommand('\${d.id}', 'PING')">Ping</button>
              <button onclick="sendCommand('\${d.id}', 'VIBRATE')">Vibrate</button>
              <button onclick="sendCommand('\${d.id}', 'TORCH_ON')">Torch ON</button>
              <button class="torch-off" onclick="sendCommand('\${d.id}', 'TORCH_OFF')">Torch OFF</button>
              <button class="alarm-on" onclick="sendCommand('\${d.id}', 'ALARM_START')">Ring Alarm</button>
              <button class="alarm-off" onclick="sendCommand('\${d.id}', 'ALARM_STOP')">Stop Alarm</button>
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

const wss = new WebSocketServer({ server: httpServer });

const connectedDevices = new Map<string, WebSocket>();
const deviceRegistry = new Map<string, DeviceInfo>();
const dashboardSockets = new Set<WebSocket>();

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

function dispatchCommandToDevice(deviceId: string, commandName: string) {
    const socket = connectedDevices.get(deviceId);
    if (!socket || socket.readyState !== WebSocket.OPEN) {
        console.log(`Device ${deviceId} not available.`);
        return false;
    }

    socket.send(
        JSON.stringify({
            type: "COMMAND",
            command: commandName,
        })
    );
    return true;
}

wss.on("connection", (socket: WebSocket) => {
    let clientType: "PHONE" | "DASHBOARD" | null = null;
    let deviceId: string | null = null;

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
                if (!deviceId) return;

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

            if (parsed.type === "TELEMETRY_DATA" && deviceId) {
                const current = deviceRegistry.get(deviceId) || {
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
                deviceRegistry.set(deviceId, current);

                pushDeviceListUpdate();
                broadcastToDashboards({
                    type: "ACTIVITY",
                    message: `Telemetry synced from ${deviceId.slice(0, 8)}: ${parsed.networkType}, RAM: ${parsed.usedRamMb}/${parsed.totalRamMb}MB`,
                });
                return;
            }

            if (parsed.type === "LOCATION_DATA" && deviceId) {
                const current = deviceRegistry.get(deviceId) || {
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
                deviceRegistry.set(deviceId, current);

                pushDeviceListUpdate();
                broadcastToDashboards({
                    type: "ACTIVITY",
                    message: `Location received from ${deviceId.slice(0, 8)}: ${parsed.latitude.toFixed(4)}, ${parsed.longitude.toFixed(4)}`,
                });
                return;
            }

            if (parsed.type === "LOCATION_ERROR" && deviceId) {
                broadcastToDashboards({
                    type: "ACTIVITY",
                    message: `Location failed for ${deviceId.slice(0, 8)}: ${parsed.error}`,
                });
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
        } catch {
            // ignore non-json messages
        }
    });

    socket.on("close", () => {
        if (clientType === "DASHBOARD") {
            dashboardSockets.delete(socket);
            console.log("[Deck] Browser dashboard disconnected.");
        } else if (deviceId) {
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