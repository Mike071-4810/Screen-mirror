const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Mime types explícitos para asegurar codificación UTF-8
express.static.mime.define({'text/html': ['html']});

// Servir archivos estáticos
app.use(express.static(path.join(__dirname, 'public'), {
    setHeaders: (res, path) => {
        if (path.endsWith('.html')) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
        }
    }
}));

const rooms = {};

wss.on('connection', (ws) => {
    ws.on('message', (message) => {
        let data;
        try {
            data = JSON.parse(message);
        } catch (e) { return; }

        const { type, roomId } = data;

        if (type === 'create') {
            rooms[roomId] = rooms[roomId] || {};
            rooms[roomId].receiver = ws;
            ws.roomId = roomId;
        }
        else if (type === 'join') {
            if (rooms[roomId] && rooms[roomId].receiver) {
                rooms[roomId].sender = ws;
                ws.roomId = roomId;
                if (rooms[roomId].receiver.readyState === WebSocket.OPEN) {
                    rooms[roomId].receiver.send(JSON.stringify({ type: 'user-joined' }));
                }
            } else {
                ws.send(JSON.stringify({ type: 'error', message: 'Sala no encontrada' }));
            }
        }
        else if (['offer', 'answer', 'candidate'].includes(type)) {
            if (!rooms[roomId]) return;
            const targetWs = ws === rooms[roomId].sender ? rooms[roomId].receiver : rooms[roomId].sender;
            if (targetWs && targetWs.readyState === WebSocket.OPEN) {
                targetWs.send(JSON.stringify(data));
            }
        }
    });

    ws.on('close', () => {
        if (ws.roomId && rooms[ws.roomId]) {
            const room = rooms[ws.roomId];
            if (room.sender === ws) room.sender = null;
            if (room.receiver === ws) delete rooms[ws.roomId];
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
});
