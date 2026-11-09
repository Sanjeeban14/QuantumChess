"""
Quantum Chess Signaling Server
Lightweight FastAPI server for WebRTC signaling.
After P2P connection is established, server is no longer involved.
"""

import asyncio
import os
import secrets
import time
from typing import Dict
from datetime import datetime, timedelta
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel


# Room storage (in-memory, for simplicity)
rooms: Dict[str, "Room"] = {}

# ---- Abuse / capacity guards -------------------------------------------------
# Cap total rooms so a burst can't exhaust memory on a small free-tier instance.
MAX_ROOMS = int(os.getenv("MAX_ROOMS", "500"))
# Simple per-IP rate limit on room creation (sliding window).
RATE_LIMIT_MAX = int(os.getenv("RATE_LIMIT_MAX", "30"))
RATE_LIMIT_WINDOW = int(os.getenv("RATE_LIMIT_WINDOW", "60"))  # seconds
_rate_buckets: Dict[str, list] = {}


def _check_rate_limit(ip: str) -> bool:
    """Return True if the IP is allowed to create another room right now."""
    now = time.monotonic()
    bucket = [t for t in _rate_buckets.get(ip, []) if now - t < RATE_LIMIT_WINDOW]
    if len(bucket) >= RATE_LIMIT_MAX:
        _rate_buckets[ip] = bucket
        return False
    bucket.append(now)
    _rate_buckets[ip] = bucket
    return True


class Room:
    """Represents a game room with two players"""
    def __init__(self, room_id: str, host_seed: int, max_superpositions: int = 2, is_public: bool = False,
                 time_control_minutes: int = 5, time_control_increment: int = 0):
        self.room_id = room_id
        self.host_seed = host_seed
        self.max_superpositions = max_superpositions
        self.is_public = is_public  # If True, room appears in open games lobby
        self.time_control_minutes = time_control_minutes  # Starting time in minutes
        self.time_control_increment = time_control_increment  # Increment per move in seconds
        self.guest_seed: int | None = None
        self.host_ws: WebSocket | None = None
        self.guest_ws: WebSocket | None = None
        self.created_at = datetime.now()

    @property
    def is_full(self) -> bool:
        return self.host_ws is not None and self.guest_ws is not None

    @property
    def is_waiting(self) -> bool:
        """Room has host connected but no guest yet"""
        return self.host_ws is not None and self.guest_ws is None

    @property
    def game_seed(self) -> int | None:
        if self.guest_seed is None:
            return None
        # XOR seeds for shared randomness
        return self.host_seed ^ self.guest_seed

    def get_other_ws(self, ws: WebSocket) -> WebSocket | None:
        if ws == self.host_ws:
            return self.guest_ws
        elif ws == self.guest_ws:
            return self.host_ws
        return None


class TimeControlModel(BaseModel):
    minutes: int = 5
    increment: int = 0


class CreateRoomRequest(BaseModel):
    seed: int
    maxSuperpositions: int = 2  # 1-7
    isPublic: bool = False  # If True, room appears in open games lobby
    timeControl: TimeControlModel = TimeControlModel()


class CreateRoomResponse(BaseModel):
    room_id: str
    player_color: str
    max_superpositions: int
    time_control_minutes: int
    time_control_increment: int


class JoinRoomRequest(BaseModel):
    room_id: str
    seed: int


class JoinRoomResponse(BaseModel):
    room_id: str
    player_color: str
    game_seed: int
    max_superpositions: int
    time_control_minutes: int
    time_control_increment: int


class OpenGameInfo(BaseModel):
    """Info about an open game in the lobby"""
    room_id: str
    max_superpositions: int
    time_control: str  # Display format like "5+0"
    created_at: str  # ISO format
    waiting_seconds: int  # How long host has been waiting


def generate_room_id() -> str:
    """Generate a short, readable room ID"""
    return secrets.token_urlsafe(6)[:8].upper()


def cleanup_old_rooms():
    """Remove rooms older than 1 hour or abandoned by both players.

    A short grace period protects brand-new rooms: a room is created via REST
    *before* the host opens its signaling socket, so during that window both
    sockets are None. Without the grace, a concurrent /api/rooms/open poll could
    delete the room before the host ever connects.
    """
    now = datetime.now()
    cutoff = now - timedelta(hours=1)
    grace = now - timedelta(seconds=60)
    expired = []

    for rid, room in rooms.items():
        # Remove if older than 1 hour
        if room.created_at < cutoff:
            expired.append(rid)
            continue

        # Remove if both players are disconnected AND the room is past its grace
        # period (so freshly-created rooms awaiting their host survive).
        if room.host_ws is None and room.guest_ws is None and room.created_at < grace:
            expired.append(rid)

    for rid in expired:
        del rooms[rid]


async def _cleanup_loop():
    """Periodically reclaim stale rooms even when no API calls arrive."""
    while True:
        await asyncio.sleep(300)  # every 5 minutes
        cleanup_old_rooms()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup/shutdown logic"""
    # Plain ASCII — emoji in stdout crashes uvicorn on Windows consoles (cp1252).
    print("Quantum Chess Signaling Server starting...")
    cleanup_task = asyncio.create_task(_cleanup_loop())
    yield
    print("Signaling server shutting down...")
    cleanup_task.cancel()
    rooms.clear()


app = FastAPI(
    title="Quantum Chess Signaling Server",
    description="WebRTC signaling for P2P quantum chess",
    version="1.0.0",
    lifespan=lifespan
)

# CORS for frontend.
# The app uses no cookies/auth, so credentials are disabled — that keeps a
# wildcard origin valid (browsers reject "*" + credentials). Lock this down to
# your deployed frontend by setting ALLOWED_ORIGINS="https://you.example.com".
_origins_env = os.getenv("ALLOWED_ORIGINS", "*").strip()
ALLOWED_ORIGINS = ["*"] if _origins_env == "*" else [
    o.strip() for o in _origins_env.split(",") if o.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    """Root endpoint - server info"""
    return {
        "name": "Quantum Chess Signaling Server",
        "version": "1.0.0",
        "status": "running",
        "endpoints": {
            "health": "/api/health",
            "create_room": "POST /api/rooms",
            "join_room": "POST /api/rooms/join",
            "websocket": "/ws/{room_id}"
        },
        "active_rooms": len(rooms)
    }


@app.get("/api/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "ok", "rooms": len(rooms)}


@app.post("/api/rooms", response_model=CreateRoomResponse)
async def create_room(request: CreateRoomRequest, http_request: Request):
    """Create a new game room"""
    cleanup_old_rooms()

    # Per-IP rate limit to prevent room-spam abuse
    ip = http_request.client.host if http_request.client else "unknown"
    if not _check_rate_limit(ip):
        raise HTTPException(status_code=429, detail="Too many rooms created — slow down")

    # Capacity guard so memory can't be exhausted on a small free instance
    if len(rooms) >= MAX_ROOMS:
        raise HTTPException(status_code=503, detail="Server at capacity — try again shortly")

    room_id = generate_room_id()
    while room_id in rooms:
        room_id = generate_room_id()

    # Clamp maxSuperpositions to 1-7
    max_sup = max(1, min(7, request.maxSuperpositions))
    # Clamp time control values
    time_minutes = max(1, min(180, request.timeControl.minutes))
    time_increment = max(0, min(60, request.timeControl.increment))

    room = Room(
        room_id, request.seed, max_sup, request.isPublic,
        time_control_minutes=time_minutes,
        time_control_increment=time_increment
    )
    rooms[room_id] = room

    return CreateRoomResponse(
        room_id=room_id,
        player_color="white",  # Host is always white
        max_superpositions=max_sup,
        time_control_minutes=time_minutes,
        time_control_increment=time_increment
    )


@app.get("/api/rooms/open", response_model=list[OpenGameInfo])
async def list_open_games():
    """List all public rooms waiting for opponents"""
    cleanup_old_rooms()

    open_games = []
    now = datetime.now()

    for room in rooms.values():
        # Only show public rooms that are waiting (host connected, no guest)
        if room.is_public and room.is_waiting:
            waiting_seconds = int((now - room.created_at).total_seconds())
            time_control_str = f"{room.time_control_minutes}+{room.time_control_increment}"
            open_games.append(OpenGameInfo(
                room_id=room.room_id,
                max_superpositions=room.max_superpositions,
                time_control=time_control_str,
                created_at=room.created_at.isoformat(),
                waiting_seconds=waiting_seconds
            ))

    # Sort by most recent first
    open_games.sort(key=lambda g: g.created_at, reverse=True)
    return open_games


@app.post("/api/rooms/join", response_model=JoinRoomResponse)
async def join_room(request: JoinRoomRequest):
    """Join an existing room"""
    room = rooms.get(request.room_id.upper())

    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    if room.is_full:
        raise HTTPException(status_code=400, detail="Room is full")

    room.guest_seed = request.seed

    return JoinRoomResponse(
        room_id=room.room_id,
        player_color="black",  # Guest is always black
        game_seed=room.game_seed or 0,
        max_superpositions=room.max_superpositions,
        time_control_minutes=room.time_control_minutes,
        time_control_increment=room.time_control_increment
    )


@app.websocket("/ws/{room_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str):
    """WebSocket for signaling (SDP/ICE exchange)."""
    room_id = room_id.upper()
    room = rooms.get(room_id)

    if not room:
        await websocket.close(code=4004, reason="Room not found")
        return

    await websocket.accept()

    role: str | None = None

    # Assign to first available slot
    if room.host_ws is None:
        room.host_ws = websocket
        role = "host"
    elif room.guest_ws is None:
        room.guest_ws = websocket
        role = "guest"
        # Notify host that guest joined
        if room.host_ws:
            await room.host_ws.send_json({
                "type": "peer_joined",
                "game_seed": room.game_seed
            })
    else:
        await websocket.close(code=4001, reason="Room is full")
        return

    try:
        # Send role confirmation
        await websocket.send_json({
            "type": "connected",
            "role": role,
            "game_seed": room.game_seed
        })

        # Relay messages between peers
        while True:
            data = await websocket.receive_json()

            # Only relay JSON objects (SDP / ICE signaling payloads)
            if not isinstance(data, dict):
                continue

            other_ws = room.get_other_ws(websocket)
            if other_ws:
                # Relay signaling messages
                await other_ws.send_json(data)

    except WebSocketDisconnect:
        # Get the other WebSocket BEFORE clearing the reference
        other_ws = room.get_other_ws(websocket)

        # Clear the WebSocket reference
        if room.host_ws == websocket:
            room.host_ws = None
        elif room.guest_ws == websocket:
            room.guest_ws = None

        # Notify other peer that connection is lost (game ends)
        if other_ws:
            try:
                await other_ws.send_json({
                    "type": "peer_disconnected"
                })
            except:
                pass


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

