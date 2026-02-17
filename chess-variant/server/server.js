const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = 888;
const rooms = new Map(); // roomId -> { players: [], state: {}, metadata: {name, isPublic, gameType} }

function getPublicRooms(gameType) {
    const publicRooms = [];
    rooms.forEach((room, id) => {
        if (room.metadata && room.metadata.isPublic &&
            room.players.length < 2 &&
            room.metadata.gameType === gameType) {
            publicRooms.push({
                id,
                name: room.metadata.name || `Salon ${id}`,
                playerCount: room.players.length
            });
        }
    });
    return publicRooms;
}

function broadcastLobbyUpdate() {
    // We can emit to a specific 'lobby' room or to everyone not in a game
    io.emit('roomsUpdate', {
        chess: getPublicRooms('chess'),
        morpion: getPublicRooms('morpion')
    });
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Send initial list to the connecting client
    socket.emit('roomsUpdate', {
        chess: getPublicRooms('chess'),
        morpion: getPublicRooms('morpion')
    });

    socket.on('joinRoom', (data) => {
        const roomId = (typeof data === 'string') ? data : data.roomId;
        const preferredColor = data.preferredColor || 'random';
        // New metadata fields
        const roomName = data.roomName;
        const isPublic = data.isPublic !== undefined ? data.isPublic : false;
        const gameType = data.gameType || 'chess';

        if (!rooms.has(roomId)) {
            rooms.set(roomId, {
                players: [],
                state: null,
                preferredColor,
                metadata: { name: roomName, isPublic, gameType }
            });
        }

        const room = rooms.get(roomId);
        if (room.players.length >= 2) {
            socket.emit('error', 'Le salon est complet.');
            return;
        }

        room.players.push(socket.id);
        socket.join(roomId);

        let color;
        if (room.players.length === 1) {
            // First player preference
            if (preferredColor === 'random') {
                color = 'waiting';
            } else {
                color = preferredColor;
                room.assignedColor = color;
            }
        } else {
            // Second player joins
            if (room.preferredColor === 'random') {
                const p1Color = Math.random() < 0.5 ? 'white' : 'black';
                room.assignedColor = p1Color;
                const p1Socket = io.sockets.sockets.get(room.players[0]);
                if (p1Socket) p1Socket.emit('roleAssignment', { color: p1Color, roomId });
                color = p1Color === 'white' ? 'black' : 'white';
            } else {
                color = room.assignedColor === 'white' ? 'black' : 'white';
            }
        }

        if (color !== 'waiting') {
            socket.emit('roleAssignment', { color, roomId });
        }

        console.log(`User ${socket.id} joined room ${roomId} as ${color} (${gameType})`);

        if (room.players.length === 2) {
            io.to(roomId).emit('gameStart');
        }

        // Broadcast update to lobby (room either became full or was created)
        broadcastLobbyUpdate();
    });

    socket.on('move', ({ roomId, moveData }) => {
        socket.to(roomId).emit('opponentMove', moveData);
    });

    socket.on('morpionMove', ({ roomId, moveData }) => {
        socket.to(roomId).emit('opponentMorpionMove', moveData);
    });

    socket.on('morpionConfig', ({ roomId, config }) => {
        socket.to(roomId).emit('opponentMorpionConfig', config);
    });

    socket.on('placeSquare', ({ roomId, x, y }) => {
        socket.to(roomId).emit('opponentPlace', { x, y });
    });

    socket.on('resetGame', (roomId) => {
        socket.to(roomId).emit('opponentReset');
    });

    socket.on('morpionRestart', (roomId) => {
        socket.to(roomId).emit('opponentMorpionRestart');
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        rooms.forEach((room, roomId) => {
            if (room.players.includes(socket.id)) {
                socket.to(roomId).emit('opponentDisconnected');
                rooms.delete(roomId);
                broadcastLobbyUpdate(); // Room closed
            }
        });
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
