const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;
const MASTER_PASSWORD = process.env.ROOM_PASSWORD || 'windrose2026';

// Räume: { roomId → { name, password, users: { socketId → { name } } } }
const rooms = {};

// Standard-Raum immer vorhanden
rooms['main'] = {
  name: '🎮 Hauptraum',
  password: MASTER_PASSWORD,
  isDefault: true,
  users: {}
};

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

app.get('/health', (req, res) => {
  const info = Object.entries(rooms).map(([id, r]) => ({
    id, name: r.name,
    users: Object.values(r.users).map(u => u.name)
  }));
  res.json({ status: 'ok', rooms: info });
});

// Raumliste (ohne Passwörter)
app.get('/api/rooms', (req, res) => {
  const list = Object.entries(rooms).map(([id, r]) => ({
    id,
    name: r.name,
    userCount: Object.keys(r.users).length,
    isDefault: !!r.isDefault,
    hasPassword: r.password !== MASTER_PASSWORD || !r.isDefault
  }));
  res.json(list);
});

// Raum erstellen
app.post('/api/rooms', (req, res) => {
  const { name, password, masterPassword } = req.body;
  if (masterPassword !== MASTER_PASSWORD) {
    return res.status(403).json({ error: 'Falsches Hauptkennwort' });
  }
  if (!name || name.trim().length < 2) {
    return res.status(400).json({ error: 'Name zu kurz' });
  }
  const id = 'room_' + Date.now();
  rooms[id] = {
    name: name.trim(),
    password: password || MASTER_PASSWORD,
    isDefault: false,
    users: {}
  };
  console.log(`[ROOM CREATED] ${name} (${id})`);
  // Allen Clients neue Raumliste schicken
  io.emit('rooms-updated', getRoomList());
  res.json({ id, name: rooms[id].name });
});

function getRoomList() {
  return Object.entries(rooms).map(([id, r]) => ({
    id,
    name: r.name,
    userCount: Object.keys(r.users).length,
    isDefault: !!r.isDefault
  }));
}

io.on('connection', (socket) => {
  let currentRoom = null;

  // Raumliste senden beim Connect
  socket.emit('rooms-updated', getRoomList());

  // Raum beitreten
  socket.on('join', ({ name, password, roomId }) => {
    const rid = roomId || 'main';
    const room = rooms[rid];

    if (!room) {
      socket.emit('error', 'Raum nicht gefunden.'); return;
    }
    if (password !== room.password) {
      socket.emit('error', 'Falsches Kennwort!'); return;
    }
    if (!name || name.trim().length < 2) {
      socket.emit('error', 'Bitte gib deinen Namen ein.'); return;
    }

    // Alten Raum verlassen falls vorhanden
    if (currentRoom && rooms[currentRoom]) {
      leaveRoom(socket, currentRoom);
    }

    currentRoom = rid;
    room.users[socket.id] = { name: name.trim() };
    socket.join(rid);

    console.log(`[JOIN] ${name} → ${room.name}`);

    // Allen im Raum Bescheid
    socket.to(rid).emit('user-joined', { id: socket.id, name: name.trim() });

    // Neuem User alle vorhandenen schicken
    const others = Object.entries(room.users)
      .filter(([id]) => id !== socket.id)
      .map(([id, u]) => ({ id, name: u.name }));

    socket.emit('joined', {
      myId: socket.id,
      users: others,
      roomId: rid,
      roomName: room.name
    });

    // Raumliste updaten
    io.emit('rooms-updated', getRoomList());
  });

  // Raum wechseln
  socket.on('switch-room', ({ roomId, password }) => {
    const room = rooms[roomId];
    if (!room) { socket.emit('error', 'Raum nicht gefunden.'); return; }
    if (password !== room.password) { socket.emit('error', 'Falsches Kennwort!'); return; }

    const name = currentRoom && rooms[currentRoom]?.users[socket.id]?.name;
    if (!name) return;

    socket.emit('room-switch-start');
    // join-Event mit neuem Raum
    socket.emit('do-join', { roomId, name, password });
  });

  // WebRTC Signaling
  socket.on('offer',         ({ to, offer })     => socket.to(to).emit('offer',         { from: socket.id, offer }));
  socket.on('answer',        ({ to, answer })    => socket.to(to).emit('answer',        { from: socket.id, answer }));
  socket.on('ice-candidate', ({ to, candidate }) => socket.to(to).emit('ice-candidate', { from: socket.id, candidate }));

  // Mute
  socket.on('mute-status', ({ muted }) => {
    const name = currentRoom && rooms[currentRoom]?.users[socket.id]?.name;
    if (name) socket.to(currentRoom).emit('user-mute-changed', { id: socket.id, name, muted });
  });

  // Disconnect
  socket.on('disconnect', () => {
    if (currentRoom) leaveRoom(socket, currentRoom);
  });

  function leaveRoom(socket, rid) {
    const room = rooms[rid];
    if (!room) return;
    const name = room.users[socket.id]?.name;
    if (name) {
      socket.to(rid).emit('user-left', { id: socket.id, name });
      delete room.users[socket.id];
      socket.leave(rid);
      console.log(`[LEAVE] ${name} ← ${room.name}`);
      // Leere nicht-default Räume löschen
      if (!room.isDefault && Object.keys(room.users).length === 0) {
        delete rooms[rid];
        console.log(`[ROOM DELETED] ${rid} (leer)`);
      }
      io.emit('rooms-updated', getRoomList());
    }
  }
});

server.listen(PORT, () => console.log(`TalkChat läuft auf Port ${PORT}`));
