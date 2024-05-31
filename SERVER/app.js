const express = require("express");
const https = require("https");
const fs = require("fs");
const cors = require("cors");
const WebSocket = require("ws");
const path = require("path");
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

    // CORS configuration
    const corsOptions = {
      origin: 'https://bikely.mooo.com:3000',
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true,
    };
    app.use(cors(corsOptions));
    app.options('*', cors(corsOptions)); // Handle all OPTIONS requests globally

    app.use(express.json());

    // Define routes
    app.use("/client", express.static(path.join(__dirname, "../client")));
    app.use("/company", express.static(path.join(__dirname, "../company")));
    app.use("/locations", locationsRouter);
    app.use("/geofence", geofenceRouter);

    app.get("/odoo/username", (req, res) => {
      res.status(200).json({ username: "testUser" });
    });

    app.post("/geofence/penalties", async (req, res) => {
      const { coords } = req.body;
      const penalties = await calculatePenaltiesForUsers(coords);
      res.status(200).json(penalties);
    });

    app.post("/geofence", (req, res) => {
      const { geofenceId, name, coordinates } = req.body;
      broadcastToClients({ type: "geofence", data: { geofenceId, name, coordinates } });
      res.sendStatus(200);
    });

    async function calculatePenaltiesForUsers(coords) {
      const users = await getUsersWithinGeofence(coords);
      const currentTime = new Date();

      const penalties = users.map((user) => {
        if (!userViolations[user.username]) {
          userViolations[user.username] = { violations: 0, enterTime: currentTime, locations: [], outsideGeofenceStart: null };
        }

        const userViolation = userViolations[user.username];
        const userInsideGeofence = isWithinGeofence(user.location, coords);

        if (!userInsideGeofence) {
          if (!userViolation.outsideGeofenceStart) {
            userViolation.outsideGeofenceStart = currentTime;
          } else if (currentTime - userViolation.outsideGeofenceStart >= 30000) { // 30 seconds
            userViolation.violations += 1;
            userViolation.outsideGeofenceStart = null; // Reset the timer
            userViolation.locations.push(user.location);

            return {
              username: user.username,
              reason: "Outside geofence",
              violations: userViolation.violations,
              duration: currentTime - userViolation.enterTime,
              locations: userViolation.locations,
            };
          }
        } else {
          userViolation.outsideGeofenceStart = null; // Reset if user is back inside
        }

        return null;
      }).filter(penalty => penalty !== null);

      penalties.forEach((penalty) => {
        if (clients[penalty.username]) {
          clients[penalty.username].send(JSON.stringify({ type: "penalty", data: penalty }));
        }
      });

      return penalties;
    }

    function isWithinGeofence(location, geofenceCoords) {
      // Implement your geofence check logic here
      return true; // Placeholder implementation
    }

    async function getUsersWithinGeofence(coords) {
      // Query your database to get users within the geofence
      return [
        { username: "usuario1", location: { lat: 37.914954, lng: -4.716284 } },
      ];
    }

    app.post("/company/location", async (req, res) => {
      const { location, username } = req.body;
      console.log("Received coordinates:", location);
      console.log("User:", username);
      // Store location in the database
      broadcastToClients({
        type: "locationUpdate",
        data: { username, location, enterTime: new Date() }
      });
      res.sendStatus(200);
    });

    wss.on("connection", (ws) => {
      ws.on("message", (message) => {
        const parsedMessage = JSON.parse(message);
        if (parsedMessage.type === "register") {
          clients[parsedMessage.username] = ws;
          sendUserList();
        } else if (parsedMessage.type === "usageTime") {
          if (userViolations[parsedMessage.username]) {
            userViolations[parsedMessage.username].usageTime = parsedMessage.usageTime;
            broadcastToClients({
              type: "usageTimeUpdate",
              data: { username: parsedMessage.username, usageTime: parsedMessage.usageTime }
            });
          }
        }
      });

      ws.on("close", () => {
        for (const [username, clientWs] of Object.entries(clients)) {
          if (clientWs === ws) {
            delete clients[username];
            sendUserList();
            break;
          }
        }
      });
    });

    function sendUserList() {
      const users = Object.keys(clients).map(username => ({ username }));
      const message = JSON.stringify({ type: "userList", data: users });
      broadcastToClients(message);
    }

    function broadcastToClients(message) {
      const messageStr = typeof message === 'string' ? message : JSON.stringify(message);
      Object.values(clients).forEach(client => client.send(messageStr));
    }

    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });

  } catch (err) {
    console.error('Error connecting to MongoDB:', err.message);
    process.exit(1);
  }
})();
