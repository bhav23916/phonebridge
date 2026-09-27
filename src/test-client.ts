import WebSocket from "ws";

const socket = new WebSocket("ws://localhost:8080");

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