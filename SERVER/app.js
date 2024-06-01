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

    async function authenticateOdoo() {
      const authPayload = {
        jsonrpc: "2.0",
        method: "call",
        params: {
          service: "common",
          method: "login",
          args: [odooConfig.db, odooConfig.username, odooConfig.password]
        },
        id: new Date().getTime()
      };

      const response = await axios.post(odooConfig.url, authPayload);
      if (response.data.result) {
        return response.data.result;
      } else {
        throw new Error("Authentication failed");
      }
    }

    async function getPartnerId(username, uid) {
      const partnerPayload = {
        jsonrpc: "2.0",
        method: "call",
        params: {
          model: "res.partner",
          method: "search",
          args: [[["name", "=", username]]],
          kwargs: { context: { uid } },
        },
        id: new Date().getTime(),
      };

      const response = await axios.post(odooConfig.url, partnerPayload);
      if (response.data.result && response.data.result.length > 0) {
        return response.data.result[0];
      } else {
        throw new Error(`Partner with username ${username} not found`);
      }
    }

    async function createInvoice(username, penalties, usageTime) {
      try {
        const uid = await authenticateOdoo();
        const partnerId = await getPartnerId(username, uid);
        const invoicePayload = {
          jsonrpc: "2.0",
          method: "call",
          params: {
            model: "account.move",
            method: "create",
            args: [
              {
                type: "out_invoice",
                partner_id: partnerId,
                invoice_line_ids: [
                  [
                    0,
                    0,
                    {
                      name: "Bicycle usage",
                      quantity: 1,
                      price_unit: usageTime,
                    },
                  ],
                  [
                    0,
                    0,
                    {
                      name: "Penalties",
                      quantity: penalties,
                      price_unit: 5,
                    },
                  ],
                ],
              },
            ],
            kwargs: { context: { uid } },
          },
          id: new Date().getTime(),
        };

        const response = await axios.post(odooConfig.url, invoicePayload);
        if (response.data.result) {
          console.log("Invoice created successfully:", response.data.result);
        } else {
          throw new Error("Failed to create invoice");
        }
      } catch (error) {
        console.error("Error creating invoice:", error);
      }
    }

    app.post("/generate-invoice", async (req, res) => {
      const { username } = req.body;
      const user = clients[username];
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      const { penalties, usageTime } = userViolations[username] || { penalties: 0, usageTime: 0 };
      try {
        await createInvoice(username, penalties, usageTime);
        res.status(200).json({ message: "Invoice created successfully" });
      } catch (error) {
        res.status(500).json({ error: "Error creating invoice", details: error.message });
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
      const usersData = Object.keys(clients).map(username => {
        return { username };
      });
      broadcastToClients({ type: "userList", data: usersData });
    }

    function broadcastToClients(message) {
      Object.values(clients).forEach(client => {
        client.send(JSON.stringify(message));
      });
    }

    server.listen(443, () => {
      console.log('Server running on https://bikely.mooo.com');
    });
  } catch (error) {
    console.error('Error connecting to MongoDB:', error.message);
    process.exit(1);
  }
})();
