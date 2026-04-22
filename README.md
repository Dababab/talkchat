# 🎙️ TalkChat — Browser Voice Chat für kleine Gruppen

Minimaler, selbst gehosteter Voice-Chat-Server. Kein App-Download, keine Accounts — einfach URL aufrufen, Name + Kennwort eingeben, sprechen.

Gebaut für das Windrose-Gaming-Setup (Adrian & Jesse, osinova.de), nutzbar für jede kleine Gruppe.

---

## ✨ Features

- **Duplex-Sprache** via WebRTC (Peer-to-Peer Audio)
- **Mute/Unmute** mit Live-Statusanzeige bei allen Teilnehmern
- **Wer ist im Raum** — User-Cards mit Namen und Stumm-Status
- **Passwortschutz** — nur wer das Kennwort kennt kommt rein
- **Mobil-optimiert** — funktioniert direkt im Browser auf iPhone & Android
- **Kein Download, kein Account** nötig

---

## 🏗️ Tech Stack

| Komponente | Technologie |
|---|---|
| Signaling-Server | Node.js + Socket.io |
| Audio-Transport | WebRTC (Peer-to-Peer) |
| NAT-Traversal | STUN (Google Public STUN) |
| Frontend | Vanilla HTML/CSS/JS |
| Deployment | Docker + Traefik |

### Wie WebRTC funktioniert

```
Teilnehmer A                  Server (Socket.io)              Teilnehmer B
    │                               │                               │
    │──── join (Name, PW) ─────────>│                               │
    │<─── joined (User-Liste) ──────│                               │
    │                               │<──── join (Name, PW) ─────────│
    │<─── user-joined ──────────────│                               │
    │                               │                               │
    │──── offer (SDP) ─────────────>│──── offer (SDP) ─────────────>│
    │<─── answer (SDP) ─────────────│<──── answer (SDP) ─────────────│
    │──── ice-candidate ───────────>│──── ice-candidate ───────────>│
    │<─── ice-candidate ────────────│<──── ice-candidate ────────────│
    │                               │                               │
    │<════════════ Audio (direkt P2P, kein Server-Routing) ═════════>│
```

Der Server übermittelt nur den Verbindungsaufbau (Signaling). Das Audio läuft danach **direkt** zwischen den Browsern — der Server ist für Audio nicht mehr beteiligt.

---

## 📊 Kapazität

| Szenario | Gleichzeitig | Server-Last |
|---|---|---|
| Normaler Betrieb | 2–5 Personen | ~25 MB RAM, <1% CPU |
| Komfortables Maximum | ~10–15 Personen | ~80 MB RAM, <5% CPU |
| Technisches Limit (Signaling) | ~50–100 | Signal OK, P2P-Mesh wird komplex |

**Warum fällt das Limit bei ~10–15?**

WebRTC nutzt ein **Full-Mesh**-Modell: Jeder verbindet sich mit jedem direkt.

```
2 Personen →  1 Verbindung
3 Personen →  3 Verbindungen
5 Personen → 10 Verbindungen
10 Personen → 45 Verbindungen  ← spürbar auf Mobilgeräten
15 Personen → 105 Verbindungen ← Akku & CPU spürbar belastet
```

Für das Windrose-Setup (2–4 Spieler) ist die Kapazität weit mehr als ausreichend.

> **Falls mal >15 Personen nötig:** SFU-Server wie mediasoup oder LiveKit nachrüsten (jeder sendet nur 1x zum Server, Server verteilt).

---

## 🚀 Deployment (Docker + Traefik)

### Voraussetzungen
- Docker + Docker Compose
- Traefik mit Wildcard-TLS (z.B. `*.osinova.de`)
- Domain die auf den Server zeigt

### Verzeichnisstruktur

```
talkchat_stack/
├── docker-compose.yml
└── app/
    ├── server.js
    ├── package.json
    ├── .gitignore
    ├── README.md
    └── public/
        └── index.html
```

### docker-compose.yml

```yaml
networks:
  osinova-net:
    external: true

services:
  talkchat:
    image: node:20-alpine
    container_name: talkchat
    restart: unless-stopped
    working_dir: /app
    volumes:
      - ./app:/app
    command: sh -c "npm install --silent && node server.js"
    environment:
      - ROOM_PASSWORD=dein-kennwort-hier
      - PORT=3000
    networks:
      - osinova-net
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.talkchat.rule=Host(`talk.deinedomain.de`)"
      - "traefik.http.routers.talkchat.entrypoints=websecure"
      - "traefik.http.routers.talkchat.tls=true"
      - "traefik.http.services.talkchat.loadbalancer.server.port=3000"
```

### Starten

```bash
cd talkchat_stack
docker compose up -d
docker logs talkchat -f
```

### Umgebungsvariablen

| Variable | Default | Beschreibung |
|---|---|---|
| `ROOM_PASSWORD` | `windrose2026` | Kennwort für den Raum |
| `PORT` | `3000` | Interner Port |

---

## 📱 Benutzung

1. `https://talk.osinova.de` im Browser öffnen (Chrome/Firefox/Safari)
2. Namen eingeben
3. Kennwort eingeben
4. **Beitreten** klicken
5. Mikrofon-Zugriff im Browser erlauben
6. Sprechen 🎤

### Buttons

| Button | Funktion |
|---|---|
| 🎤 | Mikrofon stumm schalten |
| 🔇 | Wieder laut schalten |
| 📵 | Kanal verlassen |

---

## 🔧 Mögliche Erweiterungen

- [ ] TURN-Server für sehr restriktive Netzwerke (z.B. Schul-WLAN)
- [ ] Mehrere Räume (Room-ID in URL)
- [ ] Push-to-Talk Modus
- [ ] Text-Chat parallel zur Sprache
- [ ] Audio-Level-Visualisierung (Wellenform)
- [ ] Teilnehmer-Limit pro Raum

---

## 📄 Lizenz

MIT — frei nutzbar, anpassbar, weitergeben.

---

*Erstellt: April 2026 | Deployed auf osinova-01 via Docker + Traefik*
