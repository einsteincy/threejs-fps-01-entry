// Grenades (DESIGN.md §8): HE / smoke / flash on a thrown arc with one
// bounce. Smoke blocks sight, never bullets: the sphere mesh is NOT in
// shootables; LOS checks segment-test against the smoke volumes instead.
// Enemies reuse this file for utility in P3.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const THROW_SPEED = 14;
const GRAVITY = 12;
const HE_RADIUS = 5;

export function createGrenades(scene, colliders) {
  const active = [];
  const smokes = [];
  const group = new THREE.Group();
  scene.add(group);

  function collide(p, r) {
    const box = new THREE.Box3(
      new THREE.Vector3(p.x - r, p.y - r, p.z - r),
      new THREE.Vector3(p.x + r, p.y + r, p.z + r),
    );
    for (const c of colliders) if (box.intersectsBox(c)) return c;
    return null;
  }

  function spawnMesh(type) {
    let mesh;
    if (type === 'smoke') {
      mesh = new THREE.Mesh(
        new THREE.SphereGeometry(3, 18, 12),
        new THREE.MeshBasicMaterial({ color: new THREE.Color('#9aa8a8'), transparent: true, opacity: 0.85, depthWrite: false }),
      );
      mesh.visible = false;
    } else if (type === 'flash') {
      mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.09, 8, 6),
        new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffffff') }),
      );
    } else {
      mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.09, 8, 6),
        new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.rust), roughness: 0.6 }),
      );
    }
    group.add(mesh);
    return mesh;
  }

  function throwGrenade(type, from, dir) {
    const mesh = spawnMesh(type);
    mesh.position.copy(from);
    const vel = dir.clone().multiplyScalar(THROW_SPEED);
    vel.y += 3.5;
    active.push({
      type, mesh, vel, bounced: false, life: type === 'smoke' ? 12 : 3, armed: type !== 'smoke',
    });
    return true;
  }

  function step(dt, ctx) {
    for (let i = active.length - 1; i >= 0; i -= 1) {
      const g = active[i];
      g.vel.y -= GRAVITY * dt;
      const p = g.mesh.position;
      p.x += g.vel.x * dt;
      p.y += g.vel.y * dt;
      p.z += g.vel.z * dt;
      const hit = p.y < 0.1 ? 'floor' : collide(p, 0.09);
      if (hit) {
        if (p.y < 0.1) p.y = 0.1;
        if (!g.bounced) {
          g.bounced = true;
          g.vel.multiplyScalar(0.4);
          g.vel.y = Math.abs(g.vel.y) * 0.4;
        } else {
          detonate(g, ctx);
          active.splice(i, 1);
          continue;
        }
      }
      if (g.type === 'smoke' && g.life > 0) {
        g.life -= dt;
        if (g.life <= 0 && g.mesh.visible) {
          g.mesh.visible = false;
          const idx = smokes.findIndex((s) => s.mesh === g.mesh);
          if (idx >= 0) smokes.splice(idx, 1);
        }
      }
    }
  }

  function detonate(g, ctx) {
    const p = g.mesh.position;
    if (g.type === 'he') {
      if (ctx.onExplosion) ctx.onExplosion(p.x, p.y, p.z, HE_RADIUS);
      group.remove(g.mesh);
    } else if (g.type === 'smoke') {
      g.mesh.visible = true;
      g.mesh.position.y = Math.max(1.2, p.y);
      smokes.push({ x: p.x, z: p.z, r: 3, mesh: g.mesh, life: 12 });
      g.life = 12;
    } else if (g.type === 'flash') {
      if (ctx.onFlash) ctx.onFlash(p.x, p.y, p.z);
      group.remove(g.mesh);
    }
  }

  return {
    active,
    smokes,
    throw: throwGrenade,
    step,
    reset() {
      for (const g of active) group.remove(g.mesh);
      active.length = 0;
      for (const s of smokes) group.remove(s.mesh);
      smokes.length = 0;
    },
  };
}
