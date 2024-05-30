const express = require("express");
const https = require("https");
const fs = require("fs");
const cors = require("cors");
const WebSocket = require("ws");
const path = require("path");
const locationsRouter = require("./routes/locations");
const geofenceRouter = require("./routes/geofence");
const connectDB = require('./config/db');

// Leer certificados SSL
const privateKey = fs.readFileSync('/etc/letsencrypt/live/bikely.mooo.com/privkey.pem', 'utf8');
const certificate = fs.readFileSync('/etc/letsencrypt/live/bikely.mooo.com/fullchain.pem', 'utf8');
const credentials = { key: privateKey, cert: certificate };

const app = express();
const server = https.createServer(credentials, app);
const wss = new WebSocket.Server({ server });

let clients = {};
const exitTimers = {};
const geofences = []; // Replace with actual geofence data

(async () => {
  try {
    await connectDB();
    console.log('MongoDB connected...');

    // Configuración de CORS
    const corsOptions = {
      origin: 'https://bikely.mooo.com:3000',
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true,
    };
    app.use(cors(corsOptions));
    app.options('*', cors(corsOptions)); // Manejar todas las solicitudes OPTIONS globalmente

    app.use(express.json());

    // Definir rutas
    app.use("/client", express.static(path.join(__dirname, "../client")));
    app.use("/company", express.static(path.join(__dirname, "../company")));
    app.use("/locations", locationsRouter);
    app.use("/geofence", geofenceRouter); // Usar el enrutador de geofence

    app.get("/odoo/username", (req, res) => {
      res.status(200).json({ username: "testUser" });
    });

    // Manejar solicitudes POST a /geofence
    app.post("/geofence", async (req, res) => {
      const { name, coordinates } = req.body;

      if (!name || !coordinates) {
        return res.status(400).json({ error: 'Name and coordinates are required' });
      }

      // Aquí deberías guardar la geofence en la base de datos
      // ...

      res.status(200).json({ message: 'Geofence saved successfully' });
    });

    // Manejar conexiones WebSocket
    wss.on("connection", (ws) => {
      ws.on("message", (message) => {
        const parsedMessage = JSON.parse(message);
        if (parsedMessage.type === "register") {
          clients[parsedMessage.username] = { ws, location: null };
          sendUserList();
        } else if (parsedMessage.type === "locationUpdate") {
          const { username, location } = parsedMessage;
          if (clients[username]) {
            clients[username].location = location;
            checkGeofenceExit(username, location);
          }
        }
      });

      ws.on("close", () => {
        for (const [username, clientWs] of Object.entries(clients)) {
          if (clientWs.ws === ws) {
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
      Object.values(clients).forEach(client => client.ws.send(message));
    }

    function isInsideGeofence(location, geofence) {
      // Implement the logic to check if the location is inside the geofence
      // This is a placeholder implementation
      const [lat, lng] = location;
      const [geofenceLat, geofenceLng] = geofence.coordinates;
      return Math.sqrt((lat - geofenceLat) ** 2 + (lng - geofenceLng) ** 2) < geofence.radius;
    }

    function checkGeofenceExit(username, location) {
      const userGeofence = geofences.find(geofence => isInsideGeofence(location, geofence));

      if (userGeofence) {
        if (exitTimers[username]) {
          clearTimeout(exitTimers[username]);
          delete exitTimers[username];
        }
      } else {
        if (!exitTimers[username]) {
          exitTimers[username] = setTimeout(() => applyPenalty(username), 30000);
        }
      }
    }

    async function applyPenalty(username) {
      // Implement logic to apply penalty to the user
      console.log(`Applying penalty to user ${username}`);

      // Example: Update the user penalty in the database
      // await User.updateOne({ username }, { $inc: { penalties: 1 } });

      if (clients[username]) {
        clients[username].ws.send(JSON.stringify({ type: "penaltyApplied" }));
      }
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
