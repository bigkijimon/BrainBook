// The particle-signal brain behind BrainBook.
// Every Obsidian idea/project note is a neuron, grouped by life area around the core.
// Real links (Obsidian [[wikilinks]], Graphify, shared subjects) are the wiring, and signals travel along them.
// Background mode: slow, dim, never catches clicks. Focus mode (Brain button): orbit, hover, click a neuron.
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { LifeArea } from './types';

export type IdeaStage = 'done' | 'active' | 'shaped' | 'seed' | 'parked' | 'project';
export type IdeaProgress = { done: number; total: number; steps: number; shaped: boolean; lastDid: string | null; lastAt: string | null; next: string | null };
export type BrainNode = { id: string; title: string; kind: string; lifeArea: LifeArea; openCount: number; status?: string | null; stage?: IdeaStage; progress?: IdeaProgress | null; summary?: string; group?: string; domain?: string | null; completedAt?: string | null; updatedAt: string | null; modifiedAt?: string | null; url: string; concepts: number; conceptLabels: string[] };
export type BrainLink = { source: string; target: string; kind: 'branch' | 'wikilink' | 'graphify' | 'related'; weight: number };
export type BrainData = { nodes: BrainNode[]; links: BrainLink[]; sources: { obsidian: { notes: number }; graphify: { available: boolean; builtAt: string | null; notesCovered: number; noteLinks: number }; counts: Record<string, number> } };

export const AREA_COLOR: Record<LifeArea, number> = { finance: 0xffc44d, learning: 0x2be8d9, 'mental-health': 0x48f0c8, work: 0xff4fa3, play: 0xff7a45 };
const AREA_ANCHOR: Record<LifeArea, [number, number, number]> = {
  work: [0.9, 0.35, 1.9],
  finance: [2.0, 0.85, 0.3],
  learning: [-2.0, 0.9, 0.4],
  'mental-health': [-1.6, -1.1, -1.0],
  play: [1.7, -1.1, -1.0],
};
const LINK_STRENGTH = { branch: 1.15, wikilink: 0.95, graphify: 0.75, related: 0.34 };
const SIGNAL_POOL = 260;

const hash = (text: string) => { let h = 2166136261; for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; };

// Deterministic 3D force layout: area clusters + springs on links + repulsion + keep clear of the core.
function layout(nodes: BrainNode[], links: BrainLink[]) {
  const index = new Map(nodes.map((node, i) => [node.id, i]));
  const pos = nodes.map((node) => {
    const [x, y, z] = AREA_ANCHOR[node.lifeArea] || AREA_ANCHOR.work;
    return new THREE.Vector3(x + (hash(node.id) - 0.5) * 1.4, y + (hash(`${node.id}y`) - 0.5) * 1.2, z + (hash(`${node.id}z`) - 0.5) * 1.4);
  });
  const edges = links.map((link) => [index.get(link.source), index.get(link.target), link.kind === 'related' ? 0.02 : link.kind === 'branch' ? 0.09 : 0.05] as const).filter(([a, b]) => a !== undefined && b !== undefined) as [number, number, number][];
  const force = pos.map(() => new THREE.Vector3());
  const delta = new THREE.Vector3();
  for (let step = 0; step < 240; step += 1) {
    const cool = 1 - step / 260;
    force.forEach((f) => f.set(0, 0, 0));
    for (let i = 0; i < pos.length; i += 1) {
      for (let j = i + 1; j < pos.length; j += 1) {
        delta.subVectors(pos[i], pos[j]);
        const d2 = Math.max(delta.lengthSq(), 0.02);
        delta.multiplyScalar(0.016 / d2);
        force[i].add(delta); force[j].sub(delta);
      }
      const [ax, ay, az] = AREA_ANCHOR[nodes[i].lifeArea] || AREA_ANCHOR.work;
      force[i].x += (ax - pos[i].x) * 0.035; force[i].y += (ay - pos[i].y) * 0.035; force[i].z += (az - pos[i].z) * 0.035;
      const r = pos[i].length();
      if (r < 1.7) force[i].addScaledVector(pos[i], (1.7 - r) * 0.4 / Math.max(r, 0.01));
    }
    for (const [a, b, k] of edges) {
      delta.subVectors(pos[b], pos[a]);
      const d = delta.length() || 0.001;
      delta.multiplyScalar(((d - (k > 0.08 ? 0.55 : 0.7)) * k) / d);
      force[a].add(delta); force[b].sub(delta);
    }
    pos.forEach((p, i) => p.addScaledVector(force[i].clampLength(0, 0.2), cool));
  }
  pos.forEach((p) => { const r = p.length(); if (r > 3.5) p.multiplyScalar(3.5 / r); });
  return pos;
}

function glowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d')!;
  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.14, 'rgba(255,255,255,0.95)');
  gradient.addColorStop(0.36, 'rgba(255,255,255,0.3)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Points with per-point size and brightness (PointsMaterial has only one size).
const glowMaterial = (map: THREE.Texture) => new THREE.ShaderMaterial({
  uniforms: { map: { value: map }, uScale: { value: 1 } },
  vertexShader: `
    attribute float size; attribute vec3 color; attribute float glow;
    uniform float uScale; varying vec3 vColor; varying float vGlow;
    void main() {
      vColor = color; vGlow = glow;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = size * uScale * (330.0 / -mv.z);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: `
    uniform sampler2D map; varying vec3 vColor; varying float vGlow;
    void main() {
      float a = pow(texture2D(map, gl_PointCoord).r, 1.7) * vGlow;
      if (a < 0.01) discard;
      gl_FragColor = vec4(vColor * a, a);
    }`,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});

type Props = {
  data: BrainData | null;
  area: 'all' | LifeArea;
  focus: boolean;
  selected: string | null;
  pulse: { id: string; at: number } | null;
  onHover: (node: BrainNode | null, x: number, y: number) => void;
  onSelect: (node: BrainNode | null) => void;
};

export function BrainScene({ data, area, focus, selected, pulse, onHover, onSelect }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The scene controller owns all Three.js state; React only feeds it through this ref.
  const control = useRef<{ setData: (data: BrainData | null) => void; state: { area: 'all' | LifeArea; focus: boolean; selected: string | null }; burst: (id: string) => void; handlers: Pick<Props, 'onHover' | 'onSelect'> } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const state = { area: 'all' as 'all' | LifeArea, focus: false, selected: null as string | null };
    const handlers = { onHover, onSelect };
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 100);
    const HOME = new THREE.Vector3(0, 0.35, 9.4);
    camera.position.copy(HOME);
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 3.5;
    controls.maxDistance = 13;
    controls.enabled = false;
    const texture = glowTexture();
    const world = new THREE.Group();
    scene.add(world);

    // Core: the hub every area reports to.
    const coreMaterial = new THREE.MeshBasicMaterial({ color: 0xff4fa3, wireframe: true, transparent: true, opacity: 0.22, depthWrite: false });
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62, 2), coreMaterial);
    const innerMaterial = new THREE.MeshBasicMaterial({ color: 0x7b2ff7, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending });
    const inner = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4, 3), innerMaterial);
    const haloMaterial = new THREE.SpriteMaterial({ map: texture, color: 0xff4fa3, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending });
    const halo = new THREE.Sprite(haloMaterial);
    halo.scale.setScalar(3.2);
    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0x2be8d9, transparent: true, opacity: 0.18, depthWrite: false });
    const rings = [1.0, 1.18].map((radius, i) => { const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.006, 6, 128), ringMaterial); ring.rotation.set(1.1 + i * 0.5, 0.3 - i * 0.6, 0); return ring; });
    world.add(core, inner, halo, ...rings);

    // Ambient dust (cheap, static geometry; rotated as a whole).
    const dustCount = 520;
    const dustPos = new Float32Array(dustCount * 3);
    const dustCol = new Float32Array(dustCount * 3);
    const dustSize = new Float32Array(dustCount);
    const dustGlow = new Float32Array(dustCount).fill(0.28);
    const palette = [0xff4fa3, 0x2be8d9, 0xffc44d, 0x8a5fa0].map((c) => new THREE.Color(c));
    for (let i = 0; i < dustCount; i += 1) {
      const r = 3.6 + hash(`d${i}`) * 5; const th = hash(`t${i}`) * Math.PI * 2; const ph = Math.acos(2 * hash(`p${i}`) - 1);
      dustPos.set([r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph) * 0.7, r * Math.sin(ph) * Math.sin(th)], i * 3);
      const c = palette[i % palette.length]; dustCol.set([c.r, c.g, c.b], i * 3); dustSize[i] = 0.05 + hash(`s${i}`) * 0.08;
    }
    const dustGeometry = new THREE.BufferGeometry();
    dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    dustGeometry.setAttribute('color', new THREE.BufferAttribute(dustCol, 3));
    dustGeometry.setAttribute('size', new THREE.BufferAttribute(dustSize, 1));
    dustGeometry.setAttribute('glow', new THREE.BufferAttribute(dustGlow, 1));
    const dustMaterial = glowMaterial(texture);
    const dust = new THREE.Points(dustGeometry, dustMaterial);
    scene.add(dust);

    // Network (rebuilt when the vault changes).
    let network: {
      group: THREE.Group; nodes: BrainNode[]; pos: THREE.Vector3[]; links: BrainLink[]; ends: [number, number][];
      points: THREE.Points; nodeGlow: THREE.BufferAttribute; nodeSize: THREE.BufferAttribute; baseSize: Float32Array;
      lines: THREE.LineSegments; lineColor: THREE.BufferAttribute; spokes: THREE.LineSegments; spokeColor: THREE.BufferAttribute;
      signals: THREE.Points; sigPos: THREE.BufferAttribute; sigCol: THREE.BufferAttribute; sigSize: THREE.BufferAttribute; sigGlow: THREE.BufferAttribute;
      pool: { link: number; t: number; speed: number; dir: 1 | -1; life: number; toCore: number }[];
      byId: Map<string, number>; adjacency: number[][];
    } | null = null;
    // Titles float next to neurons in Map mode: the selected idea and its connections,
    // otherwise the most connected ideas. Plain DOM, positioned from the render loop.
    const labelLayer = document.createElement('div');
    labelLayer.className = 'brain-labels';
    canvas.parentElement?.appendChild(labelLayer);
    let labelled: { index: number; el: HTMLDivElement }[] = [];
    const setLabels = (indices: number[]) => {
      labelLayer.replaceChildren();
      labelled = indices.map((index) => {
        const el = document.createElement('div');
        const node = network!.nodes[index];
        el.className = `brain-label area-${node.lifeArea}${index === (state.selected ? network!.byId.get(state.selected) : -1) ? ' is-selected' : ''}`;
        el.textContent = node.title.length > 42 ? `${node.title.slice(0, 40)}…` : node.title;
        labelLayer.appendChild(el);
        return { index, el };
      });
    };
    const projected = new THREE.Vector3();
    const placeLabels = () => {
      if (!network || !labelled.length) return;
      const width = canvas.clientWidth; const height = canvas.clientHeight;
      for (const { index, el } of labelled) {
        projected.copy(network.pos[index]).applyMatrix4(world.matrixWorld).project(camera);
        const hidden = projected.z > 1;
        el.style.opacity = hidden ? '0' : '';
        el.style.transform = `translate(${((projected.x + 1) / 2) * width + 10}px, ${((1 - projected.y) / 2) * height - 8}px)`;
      }
    };
    const nodeMaterial = glowMaterial(texture);
    const signalMaterial = glowMaterial(texture);
    // Line brightness doubles as alpha: dim links fade out instead of drawing black on the page.
    const glowLine = () => new THREE.ShaderMaterial({
      vertexShader: 'attribute vec3 color; varying vec3 vColor; void main() { vColor = color; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'varying vec3 vColor; void main() { float a = max(max(vColor.r, vColor.g), vColor.b); gl_FragColor = vec4(vColor, a); }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const lineMaterial = glowLine();
    const spokeMaterial = glowLine();

    const disposeNetwork = () => {
      if (!network) return;
      labelLayer.replaceChildren(); labelled = [];
      world.remove(network.group);
      [network.points, network.lines, network.spokes, network.signals].forEach((object) => object.geometry.dispose());
      network = null;
    };

    const setData = (next: BrainData | null) => {
      disposeNetwork();
      if (!next || next.nodes.length === 0) return;
      const nodes = next.nodes;
      const pos = layout(nodes, next.links);
      const byId = new Map(nodes.map((node, i) => [node.id, i]));
      const ends: [number, number][] = [];
      const links: BrainLink[] = [];
      next.links.forEach((link) => { const a = byId.get(link.source); const b = byId.get(link.target); if (a !== undefined && b !== undefined) { ends.push([a, b]); links.push(link); } });
      const adjacency = nodes.map(() => [] as number[]);
      ends.forEach(([a, b], i) => { adjacency[a].push(i); adjacency[b].push(i); });

      const group = new THREE.Group();
      const n = nodes.length;
      const position = new Float32Array(n * 3); const color = new Float32Array(n * 3); const baseSize = new Float32Array(n);
      nodes.forEach((node, i) => {
        position.set([pos[i].x, pos[i].y, pos[i].z], i * 3);
        // Stage light: finished ideas burn warm white-gold, seeds stay dim, work in progress pulses (see tick).
        const c = node.stage === 'done' ? new THREE.Color(0xfff1c9) : new THREE.Color(AREA_COLOR[node.lifeArea] || AREA_COLOR.work).multiplyScalar(node.stage === 'seed' ? 0.55 : node.stage === 'parked' ? 0.3 : 1);
        color.set([c.r, c.g, c.b], i * 3);
        baseSize[i] = (node.kind === 'project' ? 0.42 : 0.26) + Math.min(0.28, Math.sqrt(node.openCount + adjacency[i].length) * 0.06);
      });
      const nodeGeometry = new THREE.BufferGeometry();
      nodeGeometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
      nodeGeometry.setAttribute('color', new THREE.BufferAttribute(color, 3));
      const nodeSize = new THREE.BufferAttribute(baseSize.slice(), 1); nodeSize.setUsage(THREE.DynamicDrawUsage);
      const nodeGlow = new THREE.BufferAttribute(new Float32Array(n).fill(1), 1); nodeGlow.setUsage(THREE.DynamicDrawUsage);
      nodeGeometry.setAttribute('size', nodeSize); nodeGeometry.setAttribute('glow', nodeGlow);
      const points = new THREE.Points(nodeGeometry, nodeMaterial);

      const linePos = new Float32Array(ends.length * 6);
      ends.forEach(([a, b], i) => linePos.set([pos[a].x, pos[a].y, pos[a].z, pos[b].x, pos[b].y, pos[b].z], i * 6));
      const lineGeometry = new THREE.BufferGeometry();
      lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePos, 3));
      const lineColor = new THREE.BufferAttribute(new Float32Array(ends.length * 6), 3); lineColor.setUsage(THREE.DynamicDrawUsage);
      lineGeometry.setAttribute('color', lineColor);
      const lines = new THREE.LineSegments(lineGeometry, lineMaterial);

      // Spokes: every neuron is faintly wired to the core.
      const spokePos = new Float32Array(n * 6);
      nodes.forEach((_, i) => spokePos.set([pos[i].x, pos[i].y, pos[i].z, 0, 0, 0], i * 6));
      const spokeGeometry = new THREE.BufferGeometry();
      spokeGeometry.setAttribute('position', new THREE.BufferAttribute(spokePos, 3));
      const spokeColor = new THREE.BufferAttribute(new Float32Array(n * 6), 3); spokeColor.setUsage(THREE.DynamicDrawUsage);
      spokeGeometry.setAttribute('color', spokeColor);
      const spokes = new THREE.LineSegments(spokeGeometry, spokeMaterial);

      const sigGeometry = new THREE.BufferGeometry();
      const sigPos = new THREE.BufferAttribute(new Float32Array(SIGNAL_POOL * 3), 3); sigPos.setUsage(THREE.DynamicDrawUsage);
      const sigCol = new THREE.BufferAttribute(new Float32Array(SIGNAL_POOL * 3), 3); sigCol.setUsage(THREE.DynamicDrawUsage);
      const sigSize = new THREE.BufferAttribute(new Float32Array(SIGNAL_POOL), 1); sigSize.setUsage(THREE.DynamicDrawUsage);
      const sigGlow = new THREE.BufferAttribute(new Float32Array(SIGNAL_POOL), 1); sigGlow.setUsage(THREE.DynamicDrawUsage);
      sigGeometry.setAttribute('position', sigPos); sigGeometry.setAttribute('color', sigCol); sigGeometry.setAttribute('size', sigSize); sigGeometry.setAttribute('glow', sigGlow);
      const signals = new THREE.Points(sigGeometry, signalMaterial);
      signals.frustumCulled = false;
      const pool = Array.from({ length: SIGNAL_POOL }, () => ({ link: -1, t: 0, speed: 0, dir: 1 as 1 | -1, life: 0, toCore: -1 }));

      group.add(spokes, lines, points, signals);
      world.add(group);
      network = { group, nodes, pos, links, ends, points, nodeGlow, nodeSize, baseSize, lines, lineColor, spokes, spokeColor, signals, sigPos, sigCol, sigSize, sigGlow, pool, byId, adjacency };
      applyStyle();
    };

    // Brightness follows the chosen life area and the selected neuron (no rebuild).
    const active = (i: number) => !network || state.area === 'all' || network.nodes[i].lifeArea === state.area;
    const applyStyle = () => {
      if (!network) return;
      const { nodes, ends, links, nodeGlow, lineColor, spokeColor, byId } = network;
      const selectedIndex = state.selected ? byId.get(state.selected) : undefined;
      const neighbours = new Set<number>();
      if (selectedIndex !== undefined) network.adjacency[selectedIndex].forEach((l) => { neighbours.add(ends[l][0]); neighbours.add(ends[l][1]); });
      const base = state.focus ? 0.95 : 0.55;
      nodes.forEach((_, i) => {
        let glow = active(i) ? base : 0.12;
        if (selectedIndex !== undefined) glow = i === selectedIndex ? 1.35 : neighbours.has(i) ? 1 : 0.14;
        nodeGlow.setX(i, glow);
      });
      nodeGlow.needsUpdate = true;
      const c = new THREE.Color();
      ends.forEach(([a, b], i) => {
        let k = LINK_STRENGTH[links[i].kind] * (0.45 + 0.55 * links[i].weight) * (state.focus ? 0.75 : 0.42);
        if (!(active(a) || active(b))) k *= 0.12;
        if (selectedIndex !== undefined) k = a === selectedIndex || b === selectedIndex ? 1 : k * 0.15;
        c.set(AREA_COLOR[nodes[a].lifeArea]).multiplyScalar(k); lineColor.setXYZ(i * 2, c.r, c.g, c.b);
        c.set(AREA_COLOR[nodes[b].lifeArea]).multiplyScalar(k); lineColor.setXYZ(i * 2 + 1, c.r, c.g, c.b);
      });
      lineColor.needsUpdate = true;
      nodes.forEach((node, i) => {
        const k = (active(i) ? (state.focus ? 0.07 : 0.035) : 0.008) * (selectedIndex === i ? 4 : 1);
        c.set(AREA_COLOR[node.lifeArea]).multiplyScalar(k); spokeColor.setXYZ(i * 2, c.r, c.g, c.b);
        c.set(0xff4fa3).multiplyScalar(k * 0.5); spokeColor.setXYZ(i * 2 + 1, c.r, c.g, c.b);
      });
      spokeColor.needsUpdate = true;
      if (!state.focus) { setLabels([]); return; }
      if (selectedIndex !== undefined) { setLabels([selectedIndex, ...[...neighbours].filter((i) => i !== selectedIndex)].slice(0, 12)); return; }
      const degree = nodes.map((_, i) => ({ i, d: network!.adjacency[i].length + (nodes[i].kind === 'project' ? 1 : 0) })).filter(({ i }) => active(i));
      setLabels(degree.sort((a, b) => b.d - a.d).slice(0, state.area === 'all' ? 10 : 14).map(({ i }) => i));
    };

    const spawn = (link: number, dir: 1 | -1, speed: number, life: number) => {
      if (!network) return;
      const slot = network.pool.find((s) => s.life <= 0);
      if (!slot) return;
      Object.assign(slot, { link, t: 0, speed, dir, life, toCore: -1 });
    };
    const spawnToCore = (node: number, speed: number) => {
      if (!network) return;
      const slot = network.pool.find((s) => s.life <= 0);
      if (slot) Object.assign(slot, { link: -1, t: 0, speed, dir: 1, life: 1, toCore: node });
    };
    const burst = (id: string) => {
      if (!network) return;
      const i = network.byId.get(id);
      if (i === undefined) return;
      network.adjacency[i].forEach((l) => spawn(l, network!.ends[l][0] === i ? 1 : -1, 0.55, 1));
      for (let k = 0; k < 4; k += 1) spawnToCore(i, 0.42 + k * 0.08);
      network.nodeSize.setX(i, network.baseSize[i] * 2.6);
    };

    const resize = () => {
      const width = canvas.clientWidth || window.innerWidth;
      const height = canvas.clientHeight || window.innerHeight;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      const scale = Math.min(1.25, Math.max(0.75, height / 900));
      [nodeMaterial, signalMaterial, dustMaterial].forEach((material) => { material.uniforms.uScale.value = scale; });
      // Narrow screens: pull the camera back so the whole brain fits.
      HOME.z = camera.aspect < 1 ? 13 : 9.4;
      if (!state.focus) camera.position.copy(HOME);
    };

    // Hover + click (focus mode only), throttled per the interaction skill.
    const raycaster = new THREE.Raycaster();
    raycaster.params.Points = { threshold: 0.16 };
    const mouse = new THREE.Vector2();
    let lastRay = 0;
    let hovered = -1;
    const pick = (event: PointerEvent) => {
      if (!network) return -1;
      const rect = canvas.getBoundingClientRect();
      mouse.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObject(network.points).filter((hit) => hit.index !== undefined && active(hit.index));
      hits.sort((a, b) => (a.distanceToRay || 0) - (b.distanceToRay || 0));
      return hits.length ? hits[0].index! : -1;
    };
    const onMove = (event: PointerEvent) => {
      if (!state.focus || !network) return;
      const now = performance.now();
      if (now - lastRay < 50) return;
      lastRay = now;
      const index = pick(event);
      if (index !== hovered) {
        if (hovered >= 0) network.nodeSize.setX(hovered, network.baseSize[hovered]);
        hovered = index;
        canvas.style.cursor = index >= 0 ? 'pointer' : 'grab';
      }
      handlers.onHover(index >= 0 ? network.nodes[index] : null, event.clientX, event.clientY);
    };
    let downAt = { x: 0, y: 0 };
    const onDown = (event: PointerEvent) => { downAt = { x: event.clientX, y: event.clientY }; };
    const onUp = (event: PointerEvent) => {
      if (!state.focus || !network) return;
      if (Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y) > 6) return; // that was a drag
      const index = pick(event);
      handlers.onSelect(index >= 0 ? network.nodes[index] : null);
      if (index >= 0) burst(network.nodes[index].id);
    };
    const onLeave = () => handlers.onHover(null, 0, 0);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointerleave', onLeave);
    window.addEventListener('resize', resize);
    resize();

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const clock = new THREE.Clock();
    const tmp = new THREE.Vector3();
    const sigColor = new THREE.Color();
    let frame = 0;
    const tick = () => {
      const dt = Math.min(clock.getDelta(), 0.05);
      const t = clock.elapsedTime;
      const motion = reduced ? 0 : 1;
      if (!state.focus) world.rotation.y += dt * 0.035 * motion;
      core.rotation.x += dt * 0.12 * motion; core.rotation.y += dt * 0.18 * motion;
      inner.scale.setScalar(1 + Math.sin(t * 1.6) * 0.05 * motion);
      halo.material.opacity = 0.28 + Math.sin(t * 1.1) * 0.06 * motion;
      rings.forEach((ring, i) => { ring.rotation.z += dt * (i ? -0.2 : 0.15) * motion; });
      dust.rotation.y -= dt * 0.012 * motion;

      if (network && !reduced) {
        // Owner 2026-09-30: no invented traffic. Signals exist only when burst() is called for a
        // real event (a note changed on disk, an agent run changed, the owner added/opened/ran an idea).
        const { pool, ends, pos, nodes, sigPos, sigCol, sigSize, sigGlow, nodeSize, baseSize } = network;
        pool.forEach((s, i) => {
          if (s.life <= 0) { sigGlow.setX(i, 0); sigSize.setX(i, 0); return; }
          s.t += dt * s.speed;
          if (s.t >= 1) { s.life = 0; sigGlow.setX(i, 0); if (s.toCore < 0) { const end = s.dir === 1 ? ends[s.link][1] : ends[s.link][0]; nodeSize.setX(end, Math.max(nodeSize.getX(end), baseSize[end] * 1.7)); } return; }
          let from: THREE.Vector3; let to: THREE.Vector3; let tone: LifeArea;
          if (s.toCore >= 0) { from = pos[s.toCore]; to = tmp.set(0, 0, 0); tone = nodes[s.toCore].lifeArea; }
          else { const [a, b] = ends[s.link]; from = pos[s.dir === 1 ? a : b]; to = pos[s.dir === 1 ? b : a]; tone = nodes[s.dir === 1 ? a : b].lifeArea; }
          const e = s.t * s.t * (3 - 2 * s.t);
          sigPos.setXYZ(i, from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e, from.z + (to.z - from.z) * e);
          sigColor.set(AREA_COLOR[tone]).lerp(new THREE.Color(0xffffff), 0.35);
          sigCol.setXYZ(i, sigColor.r, sigColor.g, sigColor.b);
          sigSize.setX(i, state.focus ? 0.26 : 0.2);
          sigGlow.setX(i, Math.sin(Math.PI * s.t) * (state.focus ? 1.2 : 0.85));
        });
        sigPos.needsUpdate = sigCol.needsUpdate = sigSize.needsUpdate = sigGlow.needsUpdate = true;
        // Neurons relax back to their resting size after a signal lands.
        for (let i = 0; i < baseSize.length; i += 1) {
          const target = i === hovered ? baseSize[i] * 1.9 : network.nodes[i].stage === 'active' ? baseSize[i] * (1.25 + 0.3 * Math.sin(t * 4 + i)) : baseSize[i];
          nodeSize.setX(i, nodeSize.getX(i) + (target - nodeSize.getX(i)) * Math.min(1, dt * 4));
        }
        nodeSize.needsUpdate = true;
      }
      // Measurable: how many signal dots are in flight now (owner 2026-09-30: dots = real events only).
      canvas.dataset.signals = String(network ? network.pool.reduce((count, slot) => count + (slot.life > 0 ? 1 : 0), 0) : 0);
      controls.update();
      renderer.render(scene, camera);
      if (state.focus) placeLabels();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    control.current = {
      setData,
      state,
      burst,
      handlers,
    };
    (control.current as unknown as { apply: () => void; focus: (on: boolean) => void }).apply = applyStyle;
    (control.current as unknown as { focus: (on: boolean) => void }).focus = (on: boolean) => {
      state.focus = on;
      controls.enabled = on;
      canvas.style.cursor = on ? 'grab' : '';
      if (!on) { camera.position.copy(HOME); controls.target.set(0, 0, 0); handlers.onHover(null, 0, 0); }
      applyStyle();
    };

    return () => {
      cancelAnimationFrame(frame);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('resize', resize);
      disposeNetwork();
      labelLayer.remove();
      controls.dispose();
      [core, inner, ...rings].forEach((mesh) => mesh.geometry.dispose());
      [coreMaterial, innerMaterial, haloMaterial, ringMaterial, nodeMaterial, signalMaterial, dustMaterial, lineMaterial, spokeMaterial].forEach((material) => material.dispose());
      dustGeometry.dispose();
      texture.dispose();
      renderer.dispose();
      control.current = null;
    };
  }, []);

  const api = () => control.current as (NonNullable<typeof control.current> & { apply: () => void; focus: (on: boolean) => void }) | null;
  useEffect(() => { if (control.current) control.current.handlers = { onHover, onSelect }; }, [onHover, onSelect]);
  useEffect(() => { api()?.setData(data); }, [data]);
  useEffect(() => { const c = api(); if (c) { c.state.area = area; c.state.selected = selected; c.apply(); } }, [area, selected, data]);
  useEffect(() => { api()?.focus(focus); }, [focus]);
  useEffect(() => { if (pulse) api()?.burst(pulse.id); }, [pulse]);

  return <canvas ref={canvasRef} className={`brain-scene ${focus ? 'is-focus' : ''}`} aria-hidden={!focus} aria-label={focus ? 'Brain: your notes and their links. Drag to turn, click a neuron.' : undefined} />;
}
