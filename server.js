const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;
const MASTER_PASSWORD = process.env.ROOM_PASSWORD || 'windrose2026';

const rooms = {};
rooms['main'] = {
  name: '🎮 Hauptraum',
  password: MASTER_PASSWORD,
  isDefault: true,
  users: {}
};

// Cache-Control: HTML nie cachen, Assets normal
app.get('/', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get('/index.html', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.js') && !filePath.includes('socket.io')) {
      res.setHeader('Cache-Control', 'no-store');
    }
  }
}));
app.use(express.json());

app.get('/health', (req, res) => {
  const info = Object.entries(rooms).map(([id, r]) => ({
    id, name: r.name,
    users: Object.values(r.users).map(u => u.name)
  }));
  res.json({ status: 'ok', rooms: info });
});

app.get('/api/rooms', (req, res) => {
  const list = Object.entries(rooms).map(([id, r]) => ({
    id,
    name: r.name,
    userCount: Object.keys(r.users).length,
    isDefault: !!r.isDefault,
    hasPassword: !r.isDefault
  }));
  res.json(list);
});

app.post('/api/rooms', (req, res) => {
  const { name, password, masterPassword } = req.body;
  if (masterPassword !== MASTER_PASSWORD) return res.status(403).json({ error: 'Falsches Hauptkennwort' });
  if (!name || name.trim().length < 2) return res.status(400).json({ error: 'Name zu kurz' });
  const id = 'room_' + Date.now();
  rooms[id] = { name: name.trim(), password: password || MASTER_PASSWORD, isDefault: false, users: {} };
  console.log(`[ROOM CREATED] ${name} (${id})`);
  io.emit('rooms-updated', getRoomList());
  res.json({ id, name: rooms[id].name });
});

function getRoomList() {
  return Object.entries(rooms).map(([id, r]) => ({
    id, name: r.name,
    userCount: Object.keys(r.users).length,
    isDefault: !!r.isDefault
  }));
}

io.on('connection', (socket) => {
  let currentRoom = null;

  socket.emit('rooms-updated', getRoomList());

  socket.on('join', ({ name, password, roomId }) => {
    // Normalisieren - trim alles
    const rid = (roomId || 'main').trim();
    const pw  = (password || '').trim();
    const nm  = (name || '').trim();

    console.log(`[JOIN ATTEMPT] name="${nm}" roomId="${rid}" pw_len=${pw.length} pw="${pw}"`);
    console.log(`[ROOMS AVAILABLE] ${Object.keys(rooms).join(', ')}`);

    const room = rooms[rid];
    if (!room) {
      console.log(`[ERROR] Room "${rid}" not found!`);
      socket.emit('error', `Raum "${rid}" nicht gefunden.`);
      return;
    }
    if (pw !== room.password) {
      console.log(`[ERROR] Wrong password. Expected "${room.password}" got "${pw}"`);
      socket.emit('error', 'Falsches Kennwort!');
      return;
    }
    if (nm.length < 2) {
      socket.emit('error', 'Bitte gib deinen Namen ein.');
      return;
    }

    if (currentRoom && rooms[currentRoom]) leaveRoom(socket, currentRoom);

    currentRoom = rid;
    room.users[socket.id] = { name: nm };
    socket.join(rid);

    console.log(`[JOIN OK] ${nm} → ${room.name}`);

    socket.to(rid).emit('user-joined', { id: socket.id, name: nm });

    const others = Object.entries(room.users)
      .filter(([id]) => id !== socket.id)
      .map(([id, u]) => ({ id, name: u.name }));

    socket.emit('joined', { myId: socket.id, users: others, roomId: rid, roomName: room.name });
    io.emit('rooms-updated', getRoomList());
  });

  socket.on('offer',         ({ to, offer })     => socket.to(to).emit('offer',         { from: socket.id, offer }));
  socket.on('answer',        ({ to, answer })    => socket.to(to).emit('answer',        { from: socket.id, answer }));
  socket.on('ice-candidate', ({ to, candidate }) => socket.to(to).emit('ice-candidate', { from: socket.id, candidate }));

  socket.on('mute-status', ({ muted }) => {
    const name = currentRoom && rooms[currentRoom]?.users[socket.id]?.name;
    if (name) socket.to(currentRoom).emit('user-mute-changed', { id: socket.id, name, muted });
  });

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
      if (!room.isDefault && Object.keys(room.users).length === 0) {
        delete rooms[rid];
        console.log(`[ROOM DELETED] ${rid}`);
      }
      io.emit('rooms-updated', getRoomList());
    }
  }
});

server.listen(PORT, () => console.log(`TalkChat läuft auf Port ${PORT}`));
