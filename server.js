const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;
const ROOM_PASSWORD = process.env.ROOM_PASSWORD || 'windrose2026';

// Verbundene User tracken
const users = {}; // socket.id → { name }

app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => res.json({ status: 'ok', users: Object.keys(users).length }));

io.on('connection', (socket) => {

  // Login: Name + Passwort prüfen
  socket.on('join', ({ name, password }) => {
    if (password !== ROOM_PASSWORD) {
      socket.emit('error', 'Falsches Kennwort!');
      return;
    }
    if (!name || name.trim().length < 2) {
      socket.emit('error', 'Bitte gib deinen Namen ein.');
      return;
    }

    users[socket.id] = { name: name.trim() };
    socket.join('voice-room');
    console.log(`[JOIN] ${name} (${socket.id})`);

    // Allen anderen Bescheid geben
    socket.to('voice-room').emit('user-joined', { id: socket.id, name: name.trim() });

    // Neuem User alle vorhandenen User schicken
    const others = Object.entries(users)
      .filter(([id]) => id !== socket.id)
      .map(([id, u]) => ({ id, name: u.name }));
    socket.emit('joined', { myId: socket.id, users: others });
  });

  // WebRTC Signaling
  socket.on('offer', ({ to, offer }) => {
    socket.to(to).emit('offer', { from: socket.id, offer });
  });

  socket.on('answer', ({ to, answer }) => {
    socket.to(to).emit('answer', { from: socket.id, answer });
  });

  socket.on('ice-candidate', ({ to, candidate }) => {
    socket.to(to).emit('ice-candidate', { from: socket.id, candidate });
  });

  // Mute-Status senden
  socket.on('mute-status', ({ muted }) => {
    const name = users[socket.id]?.name || 'Unbekannt';
    socket.to('voice-room').emit('user-mute-changed', { id: socket.id, name, muted });
  });

  // Disconnect
  socket.on('disconnect', () => {
    const name = users[socket.id]?.name;
    if (name) {
      console.log(`[LEAVE] ${name} (${socket.id})`);
      socket.to('voice-room').emit('user-left', { id: socket.id, name });
      delete users[socket.id];
    }
  });
});

server.listen(PORT, () => console.log(`TalkChat läuft auf Port ${PORT}`));
