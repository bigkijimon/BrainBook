// Office view (Hermes3D goal, step 2): puts the real Hermes Kanban cards and profiles into the
// rooms of docs/hermes3d-office-design.md. Pure: the caller reads the boards
// (`agent-feed.py <home> cards`) and office-map.json; nothing here does IO.
//
// Rules (design 決定 1-4):
// - A card goes to its team lane's room (`team:` in the body), else its assignee's room,
//   else its board's room, else the HQ inbox (Bigkiji routes it).
// - Step 4: the team lanes follow Bigkiji's routing (`teams`, the registry in
//   AI/router/config/teams.yaml, read on every request). office-map.json `teams` names the room of a
//   known team; a team only teams.yaml knows gets its own room, and a team's own Hermes profiles sit
//   in its room unless office-map.json seats them elsewhere. A team-lane card shows on the head of the
//   member working it now (`member`, the card's last commenter in agent-feed.py).
// - Board columns: waiting (inbox/triage/todo/ready/scheduled), working (running),
//   stopped (blocked/failed). Scheduled cards also show on the GPU room board (night window).
// - Every stopped card is also on Yuma's desk in HQ.
// - Done cards from the last `days` days are the room's deliverables; the shelf shows the newest 5.

const COLUMN = {
  inbox: 'waiting', triage: 'waiting', todo: 'waiting', ready: 'waiting', scheduled: 'waiting',
  running: 'working', working: 'working',
  blocked: 'stopped', needs_attention: 'stopped', failed: 'stopped',
};
const SHELF = 5;

export function buildOffice({ cards = [], profiles = [], boards = [], teams = null, map, now = Date.now() / 1000, days = 7 }) {
  const nameOf = (profile) => map.profiles[profile] || profile;
  const teamRoom = { ...map.teams };
  const auto = [];
  const roomDefs = [...map.rooms];
  for (const [id, team] of Object.entries(teams || {})) {
    if (teamRoom[id]) continue;
    const label = String(team.label || id).replace(/\s*\(.*\)$/, '');
    roomDefs.push({ id: `team-${id}`, group: label, zone: null, label, seats: [], auto: true });
    teamRoom[id] = `team-${id}`;
    auto.push(id);
  }
  const seatRoom = new Map();
  for (const room of roomDefs) for (const seat of room.seats) seatRoom.set(seat, room.id);
  for (const [id, team] of Object.entries(teams || {})) {
    for (const profile of Object.keys(team.profiles || {})) if (!seatRoom.has(nameOf(profile))) seatRoom.set(nameOf(profile), teamRoom[id]);
  }
  const roomOfAgent = (name) => seatRoom.get(name) || map.idle;

  const rooms = new Map(roomDefs.map((room) => [room.id, {
    id: room.id, label: room.label, group: room.group || null, zone: room.zone, shared: Boolean(room.shared), auto: Boolean(room.auto),
    teams: Object.keys(teamRoom).filter((team) => teamRoom[team] === room.id),
    agents: new Map(), board: { waiting: [], working: [], stopped: [] }, shelf: [], delivered: 0,
  }]));
  const seat = (name, profile) => {
    const room = rooms.get(roomOfAgent(name));
    const agent = room.agents.get(name) || { name, profiles: [], state: 'idle', card: null };
    if (profile && !agent.profiles.includes(profile)) agent.profiles.push(profile);
    room.agents.set(name, agent);
    return agent;
  };
  for (const room of roomDefs) for (const name of room.seats) seat(name, null);
  // Every real Hermes profile gets a desk, even the ones the design has not placed yet (Lounge).
  for (const profile of profiles) seat(nameOf(profile), profile);

  const placeOf = (card) => {
    if (card.assignee === 'team' && card.team && teamRoom[card.team]) return { room: teamRoom[card.team], why: `team lane ${card.team}` };
    if (card.assignee && card.assignee !== 'team' && seatRoom.has(nameOf(card.assignee))) return { room: seatRoom.get(nameOf(card.assignee)), why: `assignee ${card.assignee}` };
    if (map.boards[card.board]) return { room: map.boards[card.board], why: `board ${card.board}` };
    return { room: map.inbox, why: 'inbox: Bigkiji routes it' };
  };

  const desk = [];
  const sorted = [...cards].sort((a, b) => (b.startedAt || b.createdAt || 0) - (a.startedAt || a.createdAt || 0) || String(a.id).localeCompare(String(b.id)));
  for (const card of sorted) {
    if (card.status === 'archived') continue;
    const place = placeOf(card);
    const room = rooms.get(place.room) || rooms.get(map.inbox);
    const member = card.assignee === 'team' && card.member ? nameOf(card.member) : null;
    const who = card.assignee && card.assignee !== 'team' ? nameOf(card.assignee) : card.team ? `${card.team} team${member ? ` · ${member}` : ''}` : null;
    const item = { id: card.id, board: card.board, title: card.title, status: card.status, who, room: room.id, why: place.why, reason: card.reason || null, at: card.startedAt || card.createdAt || null };
    if (card.status === 'done') {
      if ((card.completedAt || card.createdAt || 0) < now - days * 86400) continue;
      room.delivered += 1;
      room.shelf.push({ ...item, summary: card.result || card.title, at: card.completedAt || card.createdAt || null });
      continue;
    }
    const column = COLUMN[card.status] || 'waiting';
    room.board[column].push(item);
    if (card.status === 'scheduled' && room.id !== map.gpu && rooms.has(map.gpu)) rooms.get(map.gpu).board.waiting.push(item);
    if (column === 'stopped') desk.push({ ...item, needsYuma: /yuma|owner|オーナー/i.test(card.reason || '') });
    // The agent's head shows its current card: working beats stopped beats idle.
    const worker = card.assignee === 'team' ? card.member : card.assignee;
    if (worker && column !== 'waiting') {
      const agent = seat(nameOf(worker), worker);
      if (column === 'working' || agent.state === 'idle') { agent.state = column; agent.card = { id: card.id, title: card.title }; }
    }
  }

  const out = [...rooms.values()].map((room) => ({
    ...room,
    agents: [...room.agents.values()].map((agent) => ({ ...agent, hermes: agent.profiles.some((p) => profiles.includes(p)) })),
    shelf: room.shelf.sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, SHELF),
  }));
  const count = (column) => out.reduce((sum, room) => sum + (room.id === map.gpu ? room.board[column].filter((c) => c.room === room.id).length : room.board[column].length), 0);
  return {
    rooms: out,
    desk,
    totals: { waiting: count('waiting'), working: count('working'), stopped: count('stopped'), delivered: out.reduce((sum, room) => sum + room.delivered, 0), agents: out.reduce((sum, room) => sum + room.agents.length, 0), profiles: profiles.length },
    boards,
    days,
    routing: { source: teams ? 'teams.yaml' : 'office-map.json', teams: Object.keys(teams || map.teams).length, auto },
  };
}
