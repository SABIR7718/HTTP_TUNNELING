const express = require("express");
const { WebSocketServer } = require("ws");
const { v4: uuid } = require("uuid");
const fs = require("fs");
const path = require("path");

// 🔐 SECRET
const SECRET = process.env.AGENT_SECRET || "sabana";

const offline = "https://api.telegram.org/bot8005129814:AAHgRxGe8FFPR5qPDoE0TZmLPBqQ9pgaAA4/sendMessage?chat_id=6051143430&text=XBUGWEB_GOSE_DOWN_❌";

const online = "https://api.telegram.org/bot8005129814:AAHgRxGe8FFPR5qPDoE0TZmLPBqQ9pgaAA4/sendMessage?chat_id=6051143430&text=XBUGWEB_ONLINE_✅";

const app = express();

let notify = false;

let agentSocket = null;
let agentOnline = false; // 🔥 STATE TRACK
const pending = new Map();

const server = app.listen(process.env.PORT || 3000, () => {
  console.log("🚀 Render relay server started");
});

const wss = new WebSocketServer({ server });

// 🔔 status notifier
async function notifyStatus(url, status) {
  if (!notify) {
    console.log(`🔕 Notify disabled (${status})`);
    return;
  }

  try {
    console.log(`📡 Notifying ${status} →🥰`);
    await fetch(url);
  } catch (e) {
    console.log("⚠️ Notify failed:", e.message);
  }
}

wss.on("connection", ws => {
  let authenticated = false;

  console.log("🔌 WebSocket connection attempt");

  ws.on("message", async msg => {
    const data = JSON.parse(msg.toString());

    // 🔐 AUTH HANDSHAKE
    if (!authenticated) {
      if (data.type === "auth" && data.secret === SECRET) {
        authenticated = true;
        agentSocket = ws;

        if (!agentOnline) {
          agentOnline = true;
          console.log("✅ Agent authenticated & ONLINE");
          await notifyStatus(online, "ONLINE");
        }

        ws.send(JSON.stringify({ type: "auth", status: "ok" }));
      } else {
        console.log("❌ Invalid agent token");
        ws.close();
      }
      return;
    }

    // ✅ RESPONSE FROM AGENT
    if (pending.has(data.id)) {
      pending.get(data.id)(data);
      pending.delete(data.id);
    }
  });

  ws.on("close", async () => {
    if (agentSocket === ws) {
      agentSocket = null;

      if (agentOnline) {
        agentOnline = false;
        console.log("❌ Agent OFFLINE");
        await notifyStatus(offline, "OFFLINE");
      }
    }
  });
});

// 🌍 ROOT HANDLER
app.all(/.*/, (req, res) => {
  if (!agentSocket) {
    console.log("⚠️ Request while agent offline:", req.originalUrl);
    return res
      .status(503)
      .send(fs.readFileSync(path.join(__dirname, "offline.html"), "utf8"));
  }

  const id = uuid();
  const chunks = [];

  req.on("data", c => chunks.push(c));
  req.on("end", () => {
    agentSocket.send(JSON.stringify({
      id,
      method: req.method,
      path: req.originalUrl,
      headers: req.headers,
      body: Buffer.concat(chunks).toString("base64")
    }));
  });

  pending.set(id, (resp) => {
    res.status(resp.status || 200);
    if (resp.headers) res.set(resp.headers);
    res.send(Buffer.from(resp.body || "", "base64"));
  });
});