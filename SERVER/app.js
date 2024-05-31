const express = require("express");
const https = require("https");
const fs = require("fs");
const cors = require("cors");
const WebSocket = require("ws");
const path = require("path");
const axios = require("axios");
const locationsRouter = require("./routes/locations");
const geofenceRouter = require("./routes/geofence");
const connectDB = require('./config/db');

// Read SSL certificates
const privateKey = fs.readFileSync('/etc/letsencrypt/live/bikely.mooo.com/privkey.pem', 'utf8');
const certificate = fs.readFileSync('/etc/letsencrypt/live/bikely.mooo.com/fullchain.pem', 'utf8');
const credentials = { key: privateKey, cert: certificate };

const app = express();
const server = https.createServer(credentials, app);
const wss = new WebSocket.Server({ server });

let clients = {};
const userViolations = {};

// Connect to the database
(async () => {
  try {
    await connectDB();
    console.log('MongoDB connected...');

    const corsOptions = {
      origin: 'https://bikely.mooo.com',
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true,
    };
    app.use(cors(corsOptions));
    app.options('*', cors(corsOptions));

    app.use(express.json());
    app.use("/client", express.static(path.join(__dirname, "../client")));
    app.use("/company", express.static(path.join(__dirname, "../company")));
    app.use("/locations", locationsRouter);
    app.use("/geofence", geofenceRouter);

    const odooConfig = {
      url: 'https://bikely.csproject.org/jsonrpc',
      db: 'odoo16',
      username: 'i12sagud@uco.es',
      password: 'trabajosif123',
    };

    app.post("/validate-user", async (req, res) => {
      const { username, password } = req.body;
      console.log("Received username:", username);

      const payload = {
        jsonrpc: "2.0",
        method: "call",
        params: {
          service: "common",
          method: "login",
          args: [odooConfig.db, username, password]
        },
        id: new Date().getTime()
      };

      console.log("Odoo request payload:", payload);

      try {
        const response = await axios.post(odooConfig.url, payload);
        console.log("Odoo response:", response.data);

        if (response.data.result) {
          res.status(200).json({ valid: true });
        } else {
          res.status(401).json({ valid: false });
        }
      } catch (error) {
        console.error("Error connecting to Odoo:", error);
        res.status(500).json({ valid: false, error: "Internal Server Error", details: error.message });
      }
    });

    app.post("/company/location", (req, res) => {
      const { location, username } = req.body;
      console.log("Received location data:", location, "from user:", username);

      if (clients[username]) {
        clients[username].send(JSON.stringify({
          type: 'locationUpdate',
          data: { username, location }
        }));
      }

      res.status(200).json({ success: true, message: "Location received" });
    });

    wss.on('connection', (ws, req) => {
      console.log("New WebSocket connection");

      ws.on('message', (message) => {
        console.log("Message received from client:", message);
        const data = JSON.parse(message);
        if (data.type === 'register') {
          clients[data.username] = ws;
          console.log(`Client registered: ${data.username}`);
        }
      });

      ws.on('close', () => {
        console.log("WebSocket connection closed");
      });

      ws.on('error', (error) => {
        console.error("WebSocket error:", error);
      });
    });

    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });

  } catch (err) {
    console.error('Error connecting to MongoDB:', err.message);
    process.exit(1);
  }
})();
