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

// Leer certificados SSL
const privateKey = fs.readFileSync('/etc/letsencrypt/live/bikely.mooo.com/privkey.pem', 'utf8');
const certificate = fs.readFileSync('/etc/letsencrypt/live/bikely.mooo.com/fullchain.pem', 'utf8');
const credentials = { key: privateKey, cert: certificate };

const app = express();
const server = https.createServer(credentials, app);
const wss = new WebSocket.Server({ server });

let clients = {};
const userViolations = {};

// Conectar a la base de datos
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
      username: 'i12sagud@uco.es', // Usuario de Odoo
      password: 'trabajosif123',   // Contraseña de Odoo
    };

    async function getOdooUid() {
      const payload = {
        jsonrpc: "2.0",
        method: "call",
        params: {
          service: "common",
          method: "login",
          args: [odooConfig.db, odooConfig.username, odooConfig.password]
        },
        id: new Date().getTime()
      };

      try {
        const response = await axios.post(odooConfig.url, payload);
        if (response.data.result) {
          return response.data.result;
        } else {
          throw new Error("Failed to authenticate with Odoo");
        }
      } catch (error) {
        console.error("Error connecting to Odoo:", error);
        throw error;
      }
    }

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
          console.error("Error response data:", error.response.data);
          console.error("Error response status:", error.response.status);
          console.error("Error response headers:", error.response.headers);
        } else if (error.request) {
          console.error("Error request:", error.request);
        } else {
          console.error("Error message:", error.message);
        }
        res.status(500).json({ valid: false, error: "Internal Server Error", details: error.message });
      }
    });

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

    app.post("/company/create-invoice", async (req, res) => {
      const { username, penalties, usageTime } = req.body;

      try {
        const uid = await getOdooUid(); // Get the uid

        const invoiceData = {
          partner_id: username, // ID del cliente en Odoo, cámbialo según tus necesidades
          move_type: 'out_invoice',
          invoice_line_ids: [
            [0, 0, {
              name: `Usage time and penalties for user ${username}`,
              quantity: 0.01,
              price_unit: (penalties * 10) + (usageTime * 0.5) // Precio por penalización y uso (modifica según tus necesidades)
            }]
          ]
        };

        console.log("Invoice data:", invoiceData); // Log invoice data

        const response = await axios.post(odooConfig.url, {
          jsonrpc: "2.0",
          method: "call",
          params: {
            service: "object",
            method: "execute_kw",
            args: [odooConfig.db, uid, odooConfig.password, "account.move", "create", [invoiceData]]
          },
          id: new Date().getTime()
        });

        console.log("Odoo create invoice response:", response.data); // Log the response data

        if (response.data.result) {
          console.log("Invoice created successfully:", response.data.result);
          res.status(200).json({ success: true, invoiceId: response.data.result });
        } else {
          console.error("Invoice creation failed:", response.data);
          res.status(500).json({ success: false, error: "Failed to create invoice" });
        }
      } catch (error) {
        console.error("Error creating invoice in Odoo:", error);
        if (error.response) {
          console.error("Error response data:", error.response.data);
          console.error("Error response status:", error.response.status);
          console.error("Error response headers:", error.response.headers);
        } else if (error.request) {
          console.error("Error request:", error.request);
        } else {
          console.error("Error message:", error.message);
        }
        res.status(500).json({ success: false, error: error.message });
      }
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
