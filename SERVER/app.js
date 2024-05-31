const express = require("express");
const https = require("https");
const fs = require("fs");
const cors = require("cors");
const WebSocket = require("ws");
const path = require("path");
const axios = require("axios");
const connectDB = require('./config/db');
const locationsRouter = require("./routes/locations");
const geofenceRouter = require("./routes/geofence");
const Geofence = require("./models/geofence");

// Read SSL certificates
const privateKey = fs.readFileSync('/etc/letsencrypt/live/bikely.mooo.com/privkey.pem', 'utf8');
const certificate = fs.readFileSync('/etc/letsencrypt/live/bikely.mooo.com/fullchain.pem', 'utf8');
const credentials = { key: privateKey, cert: certificate };

const app = express();
const server = https.createServer(credentials, app);
const wss = new WebSocket.Server({ server });

let clients = {};
const userViolations = {};

const odooConfig = {
  url: 'https://bikely.csproject.org/jsonrpc',
  db: 'CSProject',
  uid: 'i12sagud@uco.es',
  password: 'trabajosif123',
};

const corsOptions = {
  origin: 'https://bikely.mooo.com:3000',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};

(async () => {
  try {
    await connectDB();
    console.log('MongoDB connected...');

    app.use(cors(corsOptions));
    app.options('*', cors(corsOptions));

    app.use(express.json());
    app.use("/client", express.static(path.join(__dirname, "../client")));
    app.use("/company", express.static(path.join(__dirname, "../company")));
    app.use("/locations", locationsRouter);
    app.use("/geofence", geofenceRouter);

    app.post("/validate-user", async (req, res) => {
      const { username, password } = req.body;
      try {
        const response = await axios.post(odooConfig.url, {
          jsonrpc: "2.0",
          method: "call",
          params: {
            service: "object",
            method: "execute_kw",
            args: [
              odooConfig.db,
              odooConfig.uid,
              odooConfig.password,
              "res.users",
              "search_read",
              [["login", "=", username]],
              ["id", "login", "password"]
            ]
          },
          id: new Date().getTime()
        });

        if (response.data.result.length > 0 && response.data.result[0].password === password) {
          res.status(200).json({ valid: true });
        } else {
          res.status(404).json({ valid: false });
        }
      } catch (error) {
        console.error("Error connecting to Odoo:", error);
        res.status(500).json({ valid: false, error: "Internal Server Error" });
      }
    });

    // WebSocket handlers
    wss.on('connection', (ws, req) => {
      ws.on('message', (message) => {
        const data = JSON.parse(message);
        if (data.type === 'register') {
          clients[data.username] = ws;
        }
      });

      ws.on('close', () => {
        // Handle disconnection
      });
    });

    // Watch for changes in Geofence collection
    const geofenceChangeStream = Geofence.watch();
    geofenceChangeStream.on('change', (change) => {
      if (change.operationType === 'insert') {
        const newGeofence = change.fullDocument;
        broadcastGeofenceUpdate(newGeofence);
      }
    });

    function broadcastGeofenceUpdate(geofence) {
      const message = JSON.stringify({ type: 'geofenceUpdate', data: geofence });
      Object.values(clients).forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message);
        }
      });
    }

    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });

  } catch (err) {
    console.error('Error connecting to MongoDB:', err.message);//hola
    process.exit(1);
  }
})();
