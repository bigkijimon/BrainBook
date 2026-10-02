// Office VR (Hermes3D goal, step 5): where each room of /api/office stands in 3D, in metres.
// The 2D grid of OfficeView becomes a grid of floor tiles in front of the viewer. The viewer starts
// at the origin facing -z, with Yuma's desk just ahead; the rooms fill the space behind it.
// Pure functions only, so the layout can be checked without a GPU.

export type OfficeCard = { id: string; board: string; title: string; status: string; who: string | null; room: string; why: string; reason: string | null; at: number | null; summary?: string; needsYuma?: boolean };
export type OfficeAgent = { name: string; profiles: string[]; hermes: boolean; state: 'idle' | 'working' | 'stopped'; card: { id: string; title: string } | null };
export type OfficeRoom = { id: string; label: string; group: string | null; zone: string | null; shared: boolean; auto?: boolean; teams?: string[]; agents: OfficeAgent[]; board: { waiting: OfficeCard[]; working: OfficeCard[]; stopped: OfficeCard[] }; shelf: OfficeCard[]; delivered: number };
export type Office = { rooms: OfficeRoom[]; desk: OfficeCard[]; totals?: { waiting: number; working: number; stopped: number; delivered: number; agents: number; profiles: number }; boards?: string[]; days?: number; readAt?: number; error?: string;
  routing?: { source: string; teams: number; auto: string[]; error?: string | null } };

export const ROOM_SIZE = 5;
export const ROOM_GAP = 1.2;
export const DESK_Z = -2;

// Same rule as the 2D panel: a shared room with nobody and nothing in it is not drawn.
export const visibleRooms = (office: Office) => office.rooms.filter((room) => {
  const busy = room.board.working.length + room.board.stopped.length + room.board.waiting.length;
  return !(room.shared && !room.agents.length && !busy && !room.shelf.length);
});

export type PlacedRoom = { room: OfficeRoom; x: number; z: number; agents: { agent: OfficeAgent; x: number; z: number }[]; spot: { x: number; z: number } };

export function layoutOffice(office: Office): PlacedRoom[] {
  const rooms = visibleRooms(office);
  const cols = Math.max(1, Math.ceil(Math.sqrt(rooms.length)));
  const pitch = ROOM_SIZE + ROOM_GAP;
  const width = cols * pitch - ROOM_GAP;
  return rooms.map((room, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = -width / 2 + ROOM_SIZE / 2 + col * pitch;
    const z = DESK_Z - 3 - ROOM_SIZE / 2 - row * pitch;
    // Agents stand in one row in front of the room's whiteboard, at most 1 m apart, in a 3 m strip.
    const step = room.agents.length > 1 ? Math.min(1, (ROOM_SIZE - 2) / (room.agents.length - 1)) : 0;
    const agents = room.agents.map((agent, i) => ({ agent, x: x + (i - (room.agents.length - 1) / 2) * step, z: z + 0.4 }));
    // Where a teleport into this room puts the viewer: near the front edge, facing the board.
    return { room, x, z, agents, spot: { x, z: z + ROOM_SIZE * 0.38 } };
  });
}

export const roomTone = (room: OfficeRoom) => room.board.working.length ? '#2fd6a3' : room.board.stopped.length ? '#ff6b82' : room.shared ? '#8f86b8' : '#7ff3e8';
