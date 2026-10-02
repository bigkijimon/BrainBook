import { useEffect, useRef } from 'react';
import * as THREE from 'three';

function createGlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 96;
  const context = canvas.getContext('2d');
  if (!context) return null;
  const gradient = context.createRadialGradient(48, 48, 0, 48, 48, 48);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.12, 'rgba(255,255,255,0.9)');
  gradient.addColorStop(0.34, 'rgba(255,255,255,0.28)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 96, 96);
  return new THREE.CanvasTexture(canvas);
}

const coreVertexShader = `
  uniform float uTime;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  void main() {
    vec3 displaced = position;
    float ripple = sin(position.y * 8.0 + uTime * 1.2) * 0.012;
    ripple += sin(position.x * 11.0 - uTime * 0.8) * 0.008;
    displaced += normal * ripple;
    vec4 worldPosition = modelMatrix * vec4(displaced, 1.0);
    vWorldPosition = worldPosition.xyz;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const coreFragmentShader = `
  uniform float uTime;
  uniform vec3 colorA;
  uniform vec3 colorB;
  uniform vec3 colorC;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  void main() {
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    float fresnel = pow(1.0 - max(dot(normalize(vNormal), viewDirection), 0.0), 2.5);
    float latitude = 0.5 + 0.5 * sin(vWorldPosition.y * 5.0 + uTime * 0.8);
    float longitude = 0.5 + 0.5 * sin(vWorldPosition.x * 8.0 - vWorldPosition.z * 5.0 - uTime * 0.5);
    vec3 color = mix(colorA, colorB, latitude * 0.65 + longitude * 0.2);
    color += colorC * (fresnel * 1.25 + latitude * 0.18);
    float alpha = 0.68 + fresnel * 0.28;
    gl_FragColor = vec4(color, alpha);
  }
`;

export function SceneBackdrop({ noteCount = 0 }: { noteCount?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 0.15, 8.2);
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));

    const group = new THREE.Group();
    scene.add(group);
    scene.add(new THREE.AmbientLight(0xaf95b9, 1.1));
    const key = new THREE.DirectionalLight(0xff5fab, 2.2);
    key.position.set(3, 4, 5);
    scene.add(key);
    const rim = new THREE.PointLight(0x2be8d9, 10, 14);
    rim.position.set(-4, 1, 3);
    scene.add(rim);

    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xef3f93, transparent: true, opacity: 0.13, wireframe: true });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.25, 0.012, 10, 128), ringMaterial);
    ring.rotation.set(0.7, -0.35, 0.2);
    group.add(ring);

    const innerRingMaterial = new THREE.MeshBasicMaterial({ color: 0x86a8ff, transparent: true, opacity: 0.15, wireframe: true });
    const innerRing = new THREE.Mesh(new THREE.TorusGeometry(1.34, 0.008, 8, 96), innerRingMaterial);
    innerRing.rotation.set(-0.8, 0.5, -0.2);
    group.add(innerRing);

    const coreAssembly = new THREE.Group();
    group.add(coreAssembly);

    const coreMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        colorA: { value: new THREE.Color(0x381753) },
        colorB: { value: new THREE.Color(0xc72a75) },
        colorC: { value: new THREE.Color(0xf54c9d) },
      },
      vertexShader: coreVertexShader,
      fragmentShader: coreFragmentShader,
      transparent: true,
      depthWrite: false,
    });
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.76, 4), coreMaterial);
    coreAssembly.add(core);

    const innerCoreMaterial = new THREE.MeshStandardMaterial({
      color: 0x9c235d,
      emissive: 0xd32d7c,
      emissiveIntensity: 1.8,
      roughness: 0.24,
      metalness: 0.38,
    });
    const innerCore = new THREE.Mesh(new THREE.IcosahedronGeometry(0.48, 3), innerCoreMaterial);
    innerCore.scale.set(0.92, 1.05, 0.92);
    coreAssembly.add(innerCore);

    const shellMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x5e4468,
      emissive: 0x230e36,
      emissiveIntensity: 0.35,
      roughness: 0.1,
      metalness: 0.08,
      transmission: 0.42,
      thickness: 0.28,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      iridescence: 0.7,
      iridescenceIOR: 1.4,
      transparent: true,
      opacity: 0.34,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(0.92, 2), shellMaterial);
    coreAssembly.add(shell);

    const facetMaterial = new THREE.MeshBasicMaterial({ color: 0xf35da5, transparent: true, opacity: 0.2, wireframe: true, depthWrite: false });
    const facets = new THREE.Mesh(new THREE.IcosahedronGeometry(0.965, 2), facetMaterial);
    coreAssembly.add(facets);

    const surfaceRings: THREE.Mesh[] = [];
    const ringColors = [0xf24e9c, 0x2be8d9, 0xffc44d, 0xe15498, 0xf24e9c];
    for (let index = 0; index < 5; index += 1) {
      const material = new THREE.MeshBasicMaterial({ color: ringColors[index], transparent: true, opacity: 0.16 - index * 0.018, depthWrite: false });
      const surfaceRing = new THREE.Mesh(new THREE.TorusGeometry(0.79 + index * 0.035, 0.006, 6, 96), material);
      surfaceRing.rotation.set(index * 0.47, index * 0.29 + 0.4, index * 0.23);
      coreAssembly.add(surfaceRing);
      surfaceRings.push(surfaceRing);
    }

    const glowTexture = createGlowTexture();
    const particleCount = 320 + noteCount * 24;
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const lime = new THREE.Color(0xee4797);
    const blue = new THREE.Color(0x2be8d9);
    const warm = new THREE.Color(0xffc44d);
    const color = new THREE.Color();
    for (let i = 0; i < particleCount; i += 1) {
      const radius = 2.35 + Math.random() * 4.2;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.cos(phi) * 0.78;
      positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta) * 0.56;
      const roll = Math.random();
      color.copy(roll < 0.57 ? lime : roll < 0.86 ? blue : warm);
      color.multiplyScalar(0.62 + Math.random() * 0.38);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const particleMaterial = new THREE.PointsMaterial({ size: 0.075, map: glowTexture, vertexColors: true, transparent: true, opacity: 0.52, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
    const particles = new THREE.Points(particleGeometry, particleMaterial);
    group.add(particles);

    const haloMaterial = new THREE.SpriteMaterial({ map: glowTexture, color: 0xee4797, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending });
    const halo = new THREE.Sprite(haloMaterial);
    halo.scale.set(4.5, 4.5, 1);
    group.add(halo);

    const satelliteGroup = new THREE.Group();
    group.add(satelliteGroup);
    const satellites: Array<{ mesh: THREE.Mesh; glow: THREE.Sprite; radius: number; speed: number; phase: number }> = [];
    for (let index = 0; index < 6; index += 1) {
      const material = new THREE.MeshStandardMaterial({ color: index % 2 ? 0x2be8d9 : 0xff4fa3, emissive: index % 2 ? 0x476cc4 : 0x91124f, emissiveIntensity: 1.7, roughness: 0.25, metalness: 0.25 });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.045 + (index % 3) * 0.012, 12, 12), material);
      const glowMaterial = new THREE.SpriteMaterial({ map: glowTexture, color: index % 2 ? 0x2be8d9 : 0xff4fa3, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending });
      const glow = new THREE.Sprite(glowMaterial);
      glow.scale.setScalar(0.16 + (index % 3) * 0.035);
      satelliteGroup.add(mesh, glow);
      satellites.push({ mesh, glow, radius: 1.04 + (index % 3) * 0.12, speed: 0.34 + index * 0.055, phase: index * 0.9 });
    }

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frame = 0;
    const resize = () => {
      const width = canvas.clientWidth || window.innerWidth;
      const height = canvas.clientHeight || window.innerHeight;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const pointer = { x: 0, y: 0 };
    const onPointer = (event: PointerEvent) => {
      pointer.x = (event.clientX / window.innerWidth - 0.5) * 0.22;
      pointer.y = (event.clientY / window.innerHeight - 0.5) * 0.14;
    };
    const render = (time: number) => {
      const t = time * 0.00028;
      if (!reduced) {
        group.rotation.x += (pointer.y - group.rotation.x) * 0.015;
        group.rotation.y += (pointer.x + t - group.rotation.y) * 0.015;
        coreMaterial.uniforms.uTime.value = time * 0.001;
        coreAssembly.rotation.x = t * 0.36;
        coreAssembly.rotation.y = t * 0.58;
        innerCore.rotation.x = -t * 0.95;
        innerCore.rotation.y = t * 1.25;
        shell.rotation.x = -t * 0.18;
        shell.rotation.z = t * 0.25;
        facets.rotation.x = t * 0.26;
        facets.rotation.y = -t * 0.32;
        surfaceRings.forEach((surfaceRing, index) => { surfaceRing.rotation.x += 0.0025 * (index % 2 ? 1 : -1); surfaceRing.rotation.y += 0.0018 * (index % 2 ? -1 : 1); });
        satellites.forEach((satellite) => {
          const angle = t * satellite.speed + satellite.phase;
          const x = Math.cos(angle) * satellite.radius;
          const y = Math.sin(angle * 1.4) * 0.24;
          const z = Math.sin(angle) * satellite.radius * 0.58;
          satellite.mesh.position.set(x, y, z);
          satellite.glow.position.copy(satellite.mesh.position);
        });
        particles.rotation.y = -t * 0.36;
        particles.rotation.x = t * 0.08;
        ring.rotation.z = t * 0.4;
        innerRing.rotation.z = -t * 0.7;
        halo.material.opacity = 0.13 + Math.sin(t * 8) * 0.025;
      }
      renderer.render(scene, camera);
      if (!reduced) frame = requestAnimationFrame(render);
    };
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', onPointer, { passive: true });
    resize();
    if (reduced) render(0); else frame = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointer);
      ring.geometry.dispose();
      ring.material.dispose();
      innerRing.geometry.dispose();
      innerRing.material.dispose();
      core.geometry.dispose();
      coreMaterial.dispose();
      innerCore.geometry.dispose();
      innerCoreMaterial.dispose();
      shell.geometry.dispose();
      shellMaterial.dispose();
      facets.geometry.dispose();
      facetMaterial.dispose();
      surfaceRings.forEach((surfaceRing) => { surfaceRing.geometry.dispose(); (surfaceRing.material as THREE.Material).dispose(); });
      satelliteGroup.children.forEach((child) => { if ('geometry' in child) (child as THREE.Mesh).geometry.dispose(); if ('material' in child) { const material = (child as THREE.Mesh).material; if (Array.isArray(material)) material.forEach((entry) => entry.dispose()); else material.dispose(); } });
      particleGeometry.dispose();
      particleMaterial.dispose();
      glowTexture?.dispose();
      halo.material.dispose();
      renderer.dispose();
    };
  }, [noteCount]);

  return <canvas ref={canvasRef} className="scene-backdrop" aria-hidden="true" />;
}
