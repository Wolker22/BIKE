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
      username: 'i12sagud@uco.es',  // This should be the user's login
      password: 'trabajosif123',   // This should be the user's password
    };

    app.post("/validate-user", async (req, res) => {
      const { username, password } = req.body;
      console.log("Received username:", username); // Log received username

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

      console.log("Odoo request payload:", payload); // Log the request payload

      try {
        const response = await axios.post(odooConfig.url, payload);
        console.log("Odoo response:", response.data); // Log Odoo response

        if (response.data.result) {
          res.status(200).json({ valid: true });
        } else {
          res.status(401).json({ valid: false }); // Use 401 for unauthorized
        }
      } catch (error) {
        console.error("Error connecting to Odoo:", error);
        if (error.response) {
          // The request was made and the server responded with a status code
          // that falls out of the range of 2xx
          console.error("Error response data:", error.response.data);
          console.error("Error response status:", error.response.status);
          console.error("Error response headers:", error.response.headers);
        } else if (error.request) {
          // The request was made but no response was received
          console.error("Error request:", error.request);
        } else {
          // Something happened in setting up the request that triggered an Error
          console.error("Error message:", error.message);
        }
        res.status(500).json({ valid: false, error: "Internal Server Error", details: error.message });
      }
    });

    // Define the /company/location route
    app.post("/company/location", (req, res) => {
      const { location, username } = req.body;
      console.log("Received location data:", location, "from user:", username);
      
      // Perform any necessary operations with the location data here
      // For example, you could save it to the database or perform some validation

      res.status(200).json({ success: true, message: "Location received" });
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

    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });

  } catch (err) {
    console.error('Error connecting to MongoDB:', err.message);
    process.exit(1);
  }
})();
