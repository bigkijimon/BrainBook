// Office in 3D and VR (Hermes3D goal, step 5). Page: /vr (opened from the Office panel's "3D / VR").
// The same read-only /api/office data as the 2D panel (real Hermes Kanban boards and profiles),
// drawn with three.js: each room is a floor tile with its whiteboard (Working / Stopped / Waiting),
// its agents (the card they work on above their head), and its shelf of delivered results.
// Yuma's desk (every stopped card) stands in front of the viewer.
// - Browser: drag to look around, click a room to walk to it and read its details.
// - VR headset (WebXR immersive-vr): point a controller at a room and pull the trigger to teleport
//   there; squeeze to come back to the desk. Viewing only: instructions still go to Bigkiji.
// WebXR only runs on https:// or this Mac's localhost (a browser rule); the page says so instead of failing.
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { DESK_Z, ROOM_SIZE, layoutOffice, roomTone, type Office, type OfficeCard, type PlacedRoom } from './officeLayout';
import { memberTone } from './TeamRail';

type XrState = { state: 'checking' | 'ready' | 'no-https' | 'no-webxr' | 'no-headset' | 'starting' | 'in-vr' | 'error'; message?: string };
type Line = { text: string; size?: number; color?: string; bold?: boolean };

const XR_TEXT: Record<XrState['state'], string> = {
  checking: 'Looking for a VR headset…',
  ready: 'Enter VR',
  'no-https': 'VR needs https:// (or localhost)',
  'no-webxr': 'This browser has no WebXR',
  'no-headset': 'No VR headset found',
  starting: 'Starting VR…',
  'in-vr': 'Exit VR',
  error: 'Enter VR',
};
const XR_HELP: Partial<Record<XrState['state'], string>> = {
  'no-https': 'Browsers start VR only on https:// pages or on this Mac\'s localhost. The 3D view below still works.',
  'no-webxr': 'Open this page in the headset\'s browser (Meta Quest Browser, Safari on Vision Pro, Chrome with a PC headset). The 3D view below still works.',
  'no-headset': 'WebXR is here but no headset answered. Connect one and this button turns on by itself.',
};

const fit = (ctx: CanvasRenderingContext2D, text: string, max: number) => {
  if (ctx.measureText(text).width <= max) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > max) cut = cut.slice(0, -1);
  return `${cut}…`;
};

// A text panel as a texture. 256 px per metre keeps titles readable at arm's length in a headset.
function textTexture(lines: Line[], widthPx: number, accent: string, background = 'rgba(14,8,28,0.88)') {
  const pad = 22;
  const heights = lines.map((line) => (line.size || 30) * 1.35);
  const canvas = document.createElement('canvas');
  canvas.width = widthPx;
  canvas.height = Math.ceil(pad * 2 + heights.reduce((a, b) => a + b, 0));
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = background;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(2, 2, canvas.width - 4, canvas.height - 4, 18);
  ctx.fill();
  ctx.stroke();
  let y = pad;
  lines.forEach((line, i) => {
    const size = line.size || 30;
    ctx.font = `${line.bold ? 800 : 500} ${size}px Manrope, "Hiragino Sans", system-ui, sans-serif`;
    ctx.fillStyle = line.color || '#f6e9ff';
    ctx.textBaseline = 'top';
    ctx.fillText(fit(ctx, line.text, canvas.width - pad * 2), pad, y + size * 0.15);
    y += heights[i];
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return { texture, aspect: canvas.height / canvas.width };
}

function panel(lines: Line[], widthM: number, accent: string, background?: string) {
  const { texture, aspect } = textTexture(lines, Math.round(widthM * 256), accent, background);
  return new THREE.Mesh(new THREE.PlaneGeometry(widthM, widthM * aspect), new THREE.MeshBasicMaterial({ map: texture, transparent: true }));
}

// Sprites always face the viewer, in the browser and in the headset.
function label(lines: Line[], widthM: number, accent: string) {
  const { texture, aspect } = textTexture(lines, Math.round(widthM * 256), accent);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(widthM, widthM * aspect, 1);
  return sprite;
}

// The whiteboard: three columns, newest first, five titles each.
function whiteboard(placed: PlacedRoom, tone: string) {
  const { board } = placed.room;
  const canvas = document.createElement('canvas');
  canvas.width = 900;
  canvas.height = 520;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(244,240,255,0.95)';
  ctx.beginPath();
  ctx.roundRect(0, 0, 900, 520, 20);
  ctx.fill();
  ctx.strokeStyle = tone;
  ctx.lineWidth = 8;
  ctx.stroke();
  const columns: [string, OfficeCard[], string][] = [['Working', board.working, '#0f9f74'], ['Stopped', board.stopped, '#d8304e'], ['Waiting', board.waiting, '#6a5a8c']];
  columns.forEach(([name, cards, color], col) => {
    const x = 24 + col * 292;
    ctx.fillStyle = color;
    ctx.font = '800 34px Manrope, "Hiragino Sans", system-ui, sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText(`${name} ${cards.length}`, x, 22);
    ctx.font = '500 24px Manrope, "Hiragino Sans", system-ui, sans-serif';
    ctx.fillStyle = '#25163a';
    cards.slice(0, 5).forEach((card, row) => {
      ctx.fillStyle = color;
      ctx.fillRect(x, 84 + row * 82, 6, 62);
      ctx.fillStyle = '#25163a';
      ctx.fillText(fit(ctx, card.title, 256), x + 14, 86 + row * 82);
      ctx.fillStyle = '#6a5a8c';
      ctx.font = '500 19px Manrope, system-ui, sans-serif';
      ctx.fillText(fit(ctx, `${card.who || card.board} · ${card.id}`, 256), x + 14, 118 + row * 82);
      ctx.font = '500 24px Manrope, "Hiragino Sans", system-ui, sans-serif';
    });
    if (cards.length > 5) { ctx.fillStyle = '#6a5a8c'; ctx.fillText(`+${cards.length - 5} more`, x + 14, 494 - 28); }
    if (col) { ctx.fillStyle = 'rgba(37,22,58,0.15)'; ctx.fillRect(x - 14, 20, 2, 480); }
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return new THREE.Mesh(new THREE.PlaneGeometry(3, 3 * 520 / 900), new THREE.MeshBasicMaterial({ map: texture }));
}

type Bob = { object: THREE.Object3D; base: number; phase: number };

function buildRoom(placed: PlacedRoom, floors: THREE.Object3D[], bobs: Bob[]) {
  const { room, x, z } = placed;
  const tone = roomTone(room);
  const group = new THREE.Group();
  group.name = `room:${room.id}`;
  const half = ROOM_SIZE / 2;

  const floor = new THREE.Mesh(new THREE.BoxGeometry(ROOM_SIZE, 0.06, ROOM_SIZE),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(tone).multiplyScalar(0.18), emissive: tone, emissiveIntensity: room.board.working.length ? 0.12 : 0.04, roughness: 0.85 }));
  floor.position.set(x, 0.03, z);
  floor.userData = { roomId: room.id, spot: placed.spot };
  floors.push(floor);
  group.add(floor);

  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(ROOM_SIZE, 0.06, ROOM_SIZE)), new THREE.LineBasicMaterial({ color: tone }));
  edge.position.copy(floor.position);
  group.add(edge);

  const wall = new THREE.Mesh(new THREE.BoxGeometry(ROOM_SIZE, 1, 0.08), new THREE.MeshStandardMaterial({ color: '#2a1b45', transparent: true, opacity: 0.75 }));
  wall.position.set(x, 0.5, z - half + 0.04);
  group.add(wall);

  const board = whiteboard(placed, tone);
  board.position.set(x - 0.7, 1.55, z - half + 0.12);
  group.add(board);

  const title = panel([
    { text: room.label, size: 44, bold: true, color: tone },
    { text: [room.shared ? 'shared' : room.group, room.teams?.length ? `team ${room.teams.join(', ')}` : null, room.auto ? 'new team' : room.zone].filter(Boolean).join(' · '), size: 24, color: '#c9b3dc' },
  ], 3, tone);
  title.position.set(x - 0.7, 2.75, z - half + 0.12);
  group.add(title);

  // Shelf: one box per recent delivered result, with their summaries above.
  const rack = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.1, 0.4), new THREE.MeshStandardMaterial({ color: '#3a2a5c', transparent: true, opacity: 0.6 }));
  rack.position.set(x + 1.7, 0.55, z - half + 0.35);
  group.add(rack);
  room.shelf.slice(0, 5).forEach((card, i) => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), new THREE.MeshStandardMaterial({ color: '#ffc44d', emissive: '#ff7a45', emissiveIntensity: 0.25 }));
    box.position.set(x + 1.25 + (i % 3) * 0.32, 1.22 + Math.floor(i / 3) * 0.22, z - half + 0.35);
    box.name = `shelf:${card.id}`;
    group.add(box);
  });
  const shelfText = panel([
    { text: `Shelf · ${room.delivered} delivered`, size: 30, bold: true, color: '#ffc44d' },
    ...(room.shelf.length ? room.shelf.slice(0, 5).map((card) => ({ text: `📦 ${card.summary || card.title}`, size: 22 })) : [{ text: 'Nothing delivered yet', size: 22, color: '#9c88b0' }]),
  ], 1.3, '#ffc44d');
  shelfText.position.set(x + 1.7, 1.75 + (shelfText.geometry.parameters.height / 2), z - half + 0.2);
  group.add(shelfText);

  for (const { agent, x: ax, z: az } of placed.agents) {
    const color = memberTone(agent.name);
    const body = new THREE.Group();
    body.name = `agent:${agent.name}`;
    const material = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: agent.state === 'working' ? 0.45 : 0.12, roughness: 0.5 });
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.5, 4, 12), material);
    torso.position.y = 0.45;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 20, 14), material);
    head.position.y = 1.0;
    body.add(torso, head);
    if (agent.state === 'stopped') {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.03, 8, 32), new THREE.MeshBasicMaterial({ color: '#ff4f6e' }));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.08;
      body.add(ring);
    }
    const name = label([{ text: `${agent.name}${agent.hermes ? ' · H' : ''}`, size: 30, bold: true, color }], 0.8, color);
    name.position.y = 1.35;
    body.add(name);
    if (agent.card) {
      const bubble = label([{ text: agent.card.title, size: 26, color: agent.state === 'stopped' ? '#ffb0bc' : '#f6e9ff' }], 1.5, agent.state === 'stopped' ? '#ff4f6e' : '#2fd6a3');
      bubble.position.y = 1.68;
      body.add(bubble);
    }
    body.position.set(ax, 0.06, az);
    if (agent.state === 'working') bobs.push({ object: body, base: 0.06, phase: ax * 1.7 + az });
    group.add(body);
  }
  return group;
}

function buildDesk(office: Office, floors: THREE.Object3D[]) {
  const group = new THREE.Group();
  group.name = 'desk';
  const lobby = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshStandardMaterial({ color: '#2a0b45', emissive: '#7b2ff7', emissiveIntensity: 0.08 }));
  lobby.rotation.x = -Math.PI / 2;
  lobby.position.set(0, 0.02, 0);
  lobby.userData = { roomId: 'lobby', spot: { x: 0, z: 0 } };
  floors.push(lobby);
  group.add(lobby);
  const top = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 0.8), new THREE.MeshStandardMaterial({ color: '#5a3d7a' }));
  top.position.set(0, 0.75, DESK_Z);
  const leg = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.7, 0.6), new THREE.MeshStandardMaterial({ color: '#2a1b45' }));
  leg.position.set(0, 0.36, DESK_Z);
  group.add(top, leg);
  const totals = office.totals;
  const sheet = panel([
    { text: `Yuma’s desk · ${office.desk.length} stopped`, size: 36, bold: true, color: '#ffb0bc' },
    { text: totals ? `${totals.working} working · ${totals.waiting} waiting · ${totals.delivered} delivered in ${office.days}d · ${totals.profiles} Hermes profiles` : '', size: 22, color: '#c9b3dc' },
    ...office.desk.slice(0, 8).map((card) => ({ text: `${card.needsYuma ? '⛔' : '🟥'} ${card.title} — ${office.rooms.find((room) => room.id === card.room)?.label || card.room}`, size: 24, color: card.needsYuma ? '#ffb0bc' : '#f6e9ff' })),
    ...(office.desk.length > 8 ? [{ text: `+${office.desk.length - 8} more`, size: 22, color: '#9c88b0' }] : []),
  ], 2.6, '#ff8a9a');
  sheet.position.set(0, 0.85 + sheet.geometry.parameters.height / 2, DESK_Z - 0.3);
  sheet.name = 'desk-sheet'; // hidden while a room is picked: it stands on the path to the front rooms
  group.add(sheet);
  return group;
}

const dispose = (object: THREE.Object3D) => object.traverse((child) => {
  const mesh = child as THREE.Mesh;
  mesh.geometry?.dispose();
  const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
  for (const material of materials) { (material as THREE.MeshBasicMaterial).map?.dispose(); material.dispose(); }
});

type SceneApi = { show: (office: Office) => void; focus: (roomId: string | null) => void; enterVR: () => Promise<void>; exitVR: () => void };

// Read-only hook for scripts/test-office-vr.mjs: what was placed, and where a room is on screen.
declare global { interface Window { __brainbookOfficeVr?: { rooms: string[]; agents: number; picked: string | null; drawCalls: number; moving: boolean; deskInView: boolean; screenOf: (roomId: string) => { x: number; y: number } | null } } }

export default function OfficeVR() {
  const mountRef = useRef<HTMLDivElement>(null);
  const api = useRef<SceneApi | null>(null);
  const [office, setOffice] = useState<Office | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [xr, setXr] = useState<XrState>({ state: 'checking' });

  // Data: the same endpoint and rhythm as the 2D panel.
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const response = await fetch('/api/office', { cache: 'no-store' });
        const data = await response.json() as Office;
        const error = response.status === 404 ? 'Restart BrainBook to load the Office view.' : data.error || `HTTP ${response.status}`;
        if (alive) setOffice(Array.isArray(data.rooms) && !data.error ? data : { rooms: [], desk: [], error });
      } catch { /* keep last */ }
    };
    void load();
    const timer = window.setInterval(load, 20000);
    const onVisible = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { alive = false; window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, []);

  // Can this browser open an immersive VR session?
  useEffect(() => {
    if (!window.isSecureContext) { setXr({ state: 'no-https' }); return; }
    const system = navigator.xr;
    if (!system) { setXr({ state: 'no-webxr' }); return; }
    let alive = true;
    const check = () => system.isSessionSupported('immersive-vr')
      .then((ok) => { if (alive) setXr((now) => (now.state === 'in-vr' || now.state === 'starting' ? now : { state: ok ? 'ready' : 'no-headset' })); })
      .catch(() => { if (alive) setXr({ state: 'no-headset' }); });
    void check();
    system.addEventListener('devicechange', check);
    return () => { alive = false; system.removeEventListener('devicechange', check); };
  }, []);

  // The scene: built once; the office contents are swapped on every poll.
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    renderer.xr.setReferenceSpaceType('local-floor');
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0b0716');
    scene.fog = new THREE.Fog('#0b0716', 18, 48);
    scene.add(new THREE.HemisphereLight('#c9b3ff', '#1a0f2e', 1.6));
    const sun = new THREE.DirectionalLight('#ffe9d0', 1.4);
    sun.position.set(6, 12, 8);
    scene.add(sun);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshStandardMaterial({ color: '#120a22', roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
    const grid = new THREE.GridHelper(120, 120, '#3a2a5c', '#1f1436');
    grid.position.y = 0.005;
    scene.add(grid);

    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.05, 200);
    camera.position.set(0, 6, 7);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.minDistance = 2;
    controls.maxDistance = 45;
    controls.target.set(0, 0.8, -8);

    let content = new THREE.Group();
    scene.add(content);
    let floors: THREE.Object3D[] = [];
    let bobs: Bob[] = [];
    let placed: PlacedRoom[] = [];
    let pickedId: string | null = null;
    let deskSheet: THREE.Object3D | null = null;
    const flyTo = { target: null as THREE.Vector3 | null, camera: null as THREE.Vector3 | null };
    // Yuma's desk sheet grows with the stopped cards (1.6 m with 8+) and stands between the lobby and
    // the front rooms, so the camera flies through it. Show it only at the desk, in the browser and in VR.
    const pick = (roomId: string | null) => {
      pickedId = roomId;
      setPicked(roomId);
      if (deskSheet) deskSheet.visible = roomId === null;
    };

    const focus = (roomId: string | null) => {
      const room = placed.find((item) => item.room.id === roomId);
      pick(room ? room.room.id : null);
      if (room) { flyTo.target = new THREE.Vector3(room.x, 1.2, room.z); flyTo.camera = new THREE.Vector3(room.x, 3.2, room.z + 4.4); } // in front of the room, past Yuma's desk
      else { flyTo.target = new THREE.Vector3(0, 0.8, -8); flyTo.camera = new THREE.Vector3(0, 6, 7); }
    };

    const show = (next: Office) => {
      scene.remove(content);
      dispose(content);
      content = new THREE.Group();
      floors = [];
      bobs = [];
      placed = next.error ? [] : layoutOffice(next);
      if (!next.error) {
        content.add(buildDesk(next, floors));
        for (const item of placed) content.add(buildRoom(item, floors, bobs));
      }
      scene.add(content);
      deskSheet = content.getObjectByName('desk-sheet') || null;
      if (pickedId && !placed.some((item) => item.room.id === pickedId)) focus(null);
      else if (deskSheet) deskSheet.visible = pickedId === null;
      window.__brainbookOfficeVr = {
        rooms: placed.map((item) => item.room.id),
        agents: placed.reduce((sum, item) => sum + item.agents.length, 0),
        get picked() { return pickedId; },
        get drawCalls() { return renderer.info.render.calls; },
        get moving() { return flyTo.camera !== null; },
        get deskInView() {
          if (!deskSheet?.visible) return false;
          camera.updateMatrixWorld();
          const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
          return frustum.intersectsObject(deskSheet);
        },
        screenOf: (roomId) => {
          const room = placed.find((item) => item.room.id === roomId);
          if (!room) return null;
          camera.updateMatrixWorld();
          const point = new THREE.Vector3(room.x, 0.06, room.z + ROOM_SIZE * 0.3).project(camera);
          const rect = renderer.domElement.getBoundingClientRect();
          return { x: rect.left + (point.x + 1) / 2 * rect.width, y: rect.top + (1 - point.y) / 2 * rect.height };
        },
      };
    };

    // Click (not drag) on a room: walk to it.
    const raycaster = new THREE.Raycaster();
    let down: { x: number; y: number } | null = null;
    const onDown = (event: PointerEvent) => { down = { x: event.clientX, y: event.clientY }; };
    const onUp = (event: PointerEvent) => {
      if (!down || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 6) return;
      const rect = renderer.domElement.getBoundingClientRect();
      raycaster.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1), camera);
      const hit = raycaster.intersectObjects(floors, false)[0];
      if (hit) focus(hit.object.userData.roomId === 'lobby' ? null : hit.object.userData.roomId);
    };
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointerup', onUp);

    // VR: a ray from each controller; trigger = teleport to the room it points at, squeeze = back to the desk.
    let baseSpace: XRReferenceSpace | null = null;
    const marker = new THREE.Mesh(new THREE.RingGeometry(0.25, 0.32, 32), new THREE.MeshBasicMaterial({ color: '#7ff3e8' }));
    marker.rotation.x = -Math.PI / 2;
    marker.visible = false;
    scene.add(marker);
    const rayMatrix = new THREE.Matrix4();
    const aim = (controller: THREE.Object3D) => {
      rayMatrix.identity().extractRotation(controller.matrixWorld);
      raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
      raycaster.ray.direction.set(0, 0, -1).applyMatrix4(rayMatrix);
      return raycaster.intersectObjects(floors, false)[0] || null;
    };
    const teleport = (x: number, z: number) => {
      if (!baseSpace) return;
      renderer.xr.setReferenceSpace(baseSpace.getOffsetReferenceSpace(new XRRigidTransform({ x: -x, y: 0, z: -z, w: 1 }, { x: 0, y: 0, z: 0, w: 1 })));
    };
    const controllers = [0, 1].map((index) => {
      const controller = renderer.xr.getController(index);
      const ray = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]), new THREE.LineBasicMaterial({ color: '#7ff3e8' }));
      ray.scale.z = 8;
      controller.add(ray);
      controller.addEventListener('select', () => {
        const hit = aim(controller);
        if (!hit) return;
        const { roomId, spot } = hit.object.userData as { roomId: string; spot: { x: number; z: number } };
        teleport(spot.x, spot.z);
        pick(roomId === 'lobby' ? null : roomId);
      });
      controller.addEventListener('squeeze', () => { if (baseSpace) renderer.xr.setReferenceSpace(baseSpace); pick(null); });
      scene.add(controller);
      return controller;
    });
    renderer.xr.addEventListener('sessionstart', () => { baseSpace = renderer.xr.getReferenceSpace(); controls.enabled = false; setXr({ state: 'in-vr' }); });
    renderer.xr.addEventListener('sessionend', () => { baseSpace = null; controls.enabled = true; marker.visible = false; setXr({ state: 'ready' }); });

    const enterVR = async () => {
      if (!navigator.xr) return;
      setXr({ state: 'starting' });
      try {
        const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] });
        await renderer.xr.setSession(session);
      } catch (error) {
        setXr({ state: 'error', message: `VR did not start: ${error instanceof Error ? error.message : String(error)}` });
      }
    };
    const exitVR = () => { void renderer.xr.getSession()?.end(); };

    const clock = new THREE.Clock();
    renderer.setAnimationLoop(() => {
      const t = clock.getElapsedTime();
      for (const bob of bobs) bob.object.position.y = bob.base + Math.abs(Math.sin(t * 2.2 + bob.phase)) * 0.08;
      if (renderer.xr.isPresenting) {
        marker.visible = false;
        for (const controller of controllers) {
          const hit = aim(controller);
          if (hit) { const { spot } = hit.object.userData as { spot: { x: number; z: number } }; marker.position.set(spot.x, 0.08, spot.z); marker.visible = true; }
        }
      } else {
        if (flyTo.target && flyTo.camera) {
          controls.target.lerp(flyTo.target, 0.08);
          camera.position.lerp(flyTo.camera, 0.08);
          if (camera.position.distanceTo(flyTo.camera) < 0.05) { flyTo.target = null; flyTo.camera = null; }
        }
        controls.update();
      }
      renderer.render(scene, camera);
    });

    const onResize = () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); };
    window.addEventListener('resize', onResize);
    api.current = { show, focus, enterVR, exitVR };
    return () => {
      api.current = null;
      delete window.__brainbookOfficeVr;
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointerup', onUp);
      renderer.setAnimationLoop(null);
      void renderer.xr.getSession()?.end();
      controls.dispose();
      dispose(scene);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  useEffect(() => { if (office) api.current?.show(office); }, [office]);

  const room = office?.rooms.find((item) => item.id === picked) || null;
  const totals = office?.totals;
  const vrAction = xr.state === 'in-vr' ? () => api.current?.exitVR() : () => void api.current?.enterVR();
  const vrEnabled = xr.state === 'ready' || xr.state === 'error' || xr.state === 'in-vr';

  return <main className="office-vr">
    <div ref={mountRef} className="office-vr-stage" />
    <header className="office-vr-bar">
      <a href="/" className="office-vr-back">← BrainBook</a>
      <div>
        <h1>Office · 3D / VR</h1>
        <small>{office?.error || (totals ? `${totals.working} working · ${totals.stopped} stopped · ${totals.waiting} waiting · ${totals.delivered} delivered in ${office?.days}d · boards: ${office?.boards?.join(', ')}` : 'Reading Hermes…')}</small>
      </div>
      <button type="button" className="office-vr-enter" data-xr={xr.state} disabled={!vrEnabled} onClick={vrAction}>{XR_TEXT[xr.state]}</button>
    </header>
    {(xr.message || XR_HELP[xr.state]) && <p className="office-vr-note" role="status">{xr.message || XR_HELP[xr.state]}</p>}
    <p className="office-vr-hint">Drag to look around · click a room to walk to it · in VR: trigger = teleport, squeeze = back to the desk. Viewing only — tell Bigkiji in BrainBook to act.</p>
    {room && <aside className="office-vr-room" aria-label={`${room.label} details`}>
      <header><b>{room.label}</b><button type="button" onClick={() => api.current?.focus(null)}>Back to desk</button></header>
      <small>{room.shared ? 'shared' : room.group}{room.teams?.length ? ` · team ${room.teams.join(', ')}` : ''}</small>
      <ul>{room.agents.map((agent) => <li key={agent.name} className={`is-${agent.state}`}><b style={{ color: memberTone(agent.name) }}>{agent.name}</b> {agent.state}{agent.card ? ` · ${agent.card.title}` : ''}</li>)}</ul>
      {(['working', 'stopped', 'waiting'] as const).map((key) => <div key={key}>
        <small>{key} {room.board[key].length}</small>
        {room.board[key].slice(0, 6).map((card) => <p key={`${card.board}:${card.id}`}>{card.title}<span>{card.who ? ` · ${card.who}` : ''}{card.reason ? ` · ${card.reason}` : ''}</span></p>)}
      </div>)}
      {room.shelf.length > 0 && <div><small>shelf · {room.delivered} delivered</small>{room.shelf.map((card) => <p key={`${card.board}:${card.id}`}>📦 {card.summary}</p>)}</div>}
    </aside>}
  </main>;
}
