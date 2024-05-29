const express = require('express');
const https = require('https');
const fs = require('fs');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();

// Configuración para servir archivos estáticos (si es necesario)
app.use(express.static('public'));

// Configurar el proxy inverso
app.use('/ws', createProxyMiddleware({
  target: 'wss://localhost:3000',  // URL del servidor WebSocket
  ws: true,  // Habilitar soporte para WebSockets
  changeOrigin: true,
  secure: false,  // Si el servidor WebSocket no está detrás de un proxy HTTPS
}));

// Configuración para el servidor HTTPS
const privateKeyPath = '/etc/letsencrypt/live/bikely.mooo.com/privkey.pem';
const certificatePath = '/etc/letsencrypt/live/bikely.mooo.com/fullchain.pem';

const credentials = {
  key: fs.readFileSync(privateKeyPath, 'utf8'),
  cert: fs.readFileSync(certificatePath, 'utf8'),
};

const httpsServer = https.createServer(credentials, app);

// Escuchar en el puerto 443
const PORT = process.env.PORT || 443;
httpsServer.listen(PORT, () => {
  console.log(`Proxy server running on port ${PORT}`);
});
