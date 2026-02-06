const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Servir archivos estáticos desde la carpeta actual
app.use(express.static(path.join(__dirname, 'public')));

// Manejo de conexiones WebSocket (Signaling)
// Estructura de salas: { roomId: { receiver: ws, sender: ws } }
const rooms = {};

wss.on('connection', (ws) => {
    
    ws.on('message', (message) => {
        let data;
        try {
            data = JSON.parse(message);
        } catch (e) {
            console.error("Mensaje no válido recibido");
            return;
        }

        const { type, roomId } = data;

        // 1. Crear Sala (PC / Receptor)
        if (type === 'create') {
            rooms[roomId] = rooms[roomId] || {};
            rooms[roomId].receiver = ws;
            ws.roomId = roomId; // Asociar socket a la sala
            console.log(`Sala creada: ${roomId}`);
        }

        // 2. Unirse a Sala (Teléfono / Emisor)
        else if (type === 'join') {
            if (rooms[roomId] && rooms[roomId].receiver) {
                rooms[roomId].sender = ws;
                ws.roomId = roomId;
                
                // Notificar al receptor que alguien entró (opcional, para UI)
                if (rooms[roomId].receiver.readyState === WebSocket.OPEN) {
                    rooms[roomId].receiver.send(JSON.stringify({ type: 'user-joined' }));
                }
                console.log(`Usuario unido a sala: ${roomId}`);
            } else {
                ws.send(JSON.stringify({ type: 'error', message: 'Sala no encontrada' }));
            }
        }

        // 3. Señalización WebRTC (Offer, Answer, ICE Candidates)
        // El servidor simplemente retransmite el mensaje al OTRO par en la misma sala
        else if (['offer', 'answer', 'candidate'].includes(type)) {
            if (!rooms[roomId]) return;

            const targetWs = ws === rooms[roomId].sender ? rooms[roomId].receiver : rooms[roomId].sender;

            if (targetWs && targetWs.readyState === WebSocket.OPEN) {
                targetWs.send(JSON.stringify(data));
            }
        }
    });

    ws.on('close', () => {
        // Limpieza básica de salas si se desconecta alguien
        // En una app prod, habría lógica más robusta para reconexión
        if (ws.roomId && rooms[ws.roomId]) {
            const room = rooms[ws.roomId];
            if (room.sender === ws) room.sender = null;
            if (room.receiver === ws) {
                // Si el host se va, la sala muere
                delete rooms[ws.roomId];
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
    console.log(`Para probar en red local, usa tu IP local (ej. http://192.168.1.X:${PORT})`);
});