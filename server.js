const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Configuración crítica: Forzar UTF-8 para todos los archivos HTML
express.static.mime.define({'text/html': ['html']});

// Servir la carpeta 'public' donde estará el frontend
app.use(express.static(path.join(__dirname, 'public'), {
    setHeaders: (res, path) => {
        if (path.endsWith('.html')) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
        }
    }
}));

// Almacenamiento temporal de las salas en memoria
const rooms = {};

wss.on('connection', (ws) => {
    
    ws.on('message', (message) => {
        let data;
        try {
            data = JSON.parse(message);
        } catch (e) {
            console.error("Mensaje JSON inválido");
            return;
        }

        const { type, roomId } = data;

        // Caso 1: La PC crea una nueva sala
        if (type === 'create') {
            rooms[roomId] = rooms[roomId] || {};
            rooms[roomId].receiver = ws;
            ws.roomId = roomId;
            ws.role = 'receiver';
            console.log(`Sala creada: ${roomId}`);
        }

        // Caso 2: El celular se une a la sala
        else if (type === 'join') {
            if (rooms[roomId] && rooms[roomId].receiver) {
                rooms[roomId].sender = ws;
                ws.roomId = roomId;
                ws.role = 'sender';
                
                // Avisar a la PC que alguien entró
                if (rooms[roomId].receiver.readyState === WebSocket.OPEN) {
                    rooms[roomId].receiver.send(JSON.stringify({ type: 'user-joined' }));
                }
                console.log(`Usuario unido a sala: ${roomId}`);
            } else {
                ws.send(JSON.stringify({ type: 'error', message: 'Código de sala no válido o expirado.' }));
            }
        }

        // Caso 3: Intercambio de datos WebRTC (Offer, Answer, ICE Candidates)
        else if (['offer', 'answer', 'candidate'].includes(type)) {
            if (!rooms[roomId]) return;

            // Enviar el mensaje al "otro" participante de la sala
            const targetWs = ws === rooms[roomId].sender ? rooms[roomId].receiver : rooms[roomId].sender;

            if (targetWs && targetWs.readyState === WebSocket.OPEN) {
                targetWs.send(JSON.stringify(data));
            }
        }
    });

    // Limpieza cuando alguien se desconecta
    ws.on('close', () => {
        if (ws.roomId && rooms[ws.roomId]) {
            const room = rooms[ws.roomId];
            
            // Si se va el Host (PC), eliminamos la sala
            if (room.receiver === ws) {
                if (room.sender && room.sender.readyState === WebSocket.OPEN) {
                    room.sender.send(JSON.stringify({ type: 'error', message: 'El host se ha desconectado.' }));
                }
                delete rooms[ws.roomId];
            } 
            // Si se va el Emisor (Celular), solo limpiamos su referencia
            else if (room.sender === ws) {
                room.sender = null;
                if (room.receiver && room.receiver.readyState === WebSocket.OPEN) {
                    // Opcional: Avisar al PC que el usuario se fue
                }
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor iniciado en puerto ${PORT}`);
});
