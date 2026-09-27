"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ws_1 = __importDefault(require("ws"));
const socket = new ws_1.default("ws://localhost:8080");
socket.on("open", () => {
    console.log("Test client connected.");
    socket.send("Hello from PhoneBridge test client");
});
socket.on("message", (data) => {
    console.log("Server response:", data.toString());
    socket.close();
});
socket.on("close", () => {
    console.log("Test client disconnected.");
});
