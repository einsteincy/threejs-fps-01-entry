// Flare Yard 7 (DESIGN.md §13.4 + §14.2): a 48 x 32 m dusk fuel depot, three
// lanes (Long north, Mid, Short south), one bombsite (Fuel Depot, NE), a 12 m
// flare stack behind the site. All geometry is primitive boxes/cylinders;
// the only shadow-caster is the amber dusk sun. Metres, x east, z south, y up.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const SITE = { cx: 17, cz: -12, x0: 14, x1: 20, z0: -15, z1: -9 };
export const PLANT_SPOT = { x: 16, z: -11 };
export const FLARE_STACK = { x: 21, z: -14 };

export const ATTACKER_SPAWNS = {
  PLAYER: [-21, 12],
  VEX: [-21, 8],
  ORIN: [-19, 14],
  KITE: [-22, 6],
  SABLE: [-18, 10],
};
export const DEFENDER_SPAWNS = {
  'E-1': [13, -14],
  'E-2': [19, -9],
  'E-3': [0, -4],
  'E-4': [0, -12],
  'E-5': [0, 12],
};

// Waypoint graph: bots walk named nodes, never A*. Routes are lists of node names.
export const WAYPOINTS = {
  spawn: [-21, 12],
  longWest: [-18, -12],
  longMid: [0, -12],
  longGate: [12, -12],
  midWest: [-14, 0],
  midA: [-8, 0],
  midB: [8, 0],
  midEast: [12, -6],
  shortWest: [-14, 12],
  shortMid: [0, 12],
  shortEast: [12, 12],
  siteHoldA: [13, -14],
  siteHoldB: [19, -9],
  site: [17, -12],
  midHold: [0, -4],
  siteSouth: [12, -6],
};

export const ROUTES = {
  LONG: ['spawn', 'longWest', 'longMid', 'longGate', 'site'],
  SHORT: ['spawn', 'shortWest', 'shortMid', 'shortEast', 'midEast', 'site'],
  MID: ['spawn', 'midWest', 'midA', 'midB', 'midEast', 'site'],
};

const CONTAINER_COLORS = ['rust', 'teal', 'surface'];

export function createMap(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'amber' || name === 'hazard' ? 0.55 : 0.92,
      metalness: name === 'rust' ? 0.25 : 0.03,
    });
  }
  const flameMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(PALETTE.amber),
    transparent: true,
    opacity: 0.95,
  });
  const plumeMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#0a0f0f'),
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const colliders = [];
  const shootables = [];
  const tmpBox = new THREE.Box3();

  function box(w, h, d, x, y, z, material, opts = {}) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials[material]);
    mesh.position.set(x, y, z);
    if (opts.ry) mesh.rotation.y = opts.ry;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (!opts.ghost) {
      tmpBox.setFromObject(mesh);
      colliders.push(tmpBox.clone());
      shootables.push(mesh);
    }
    return mesh;
  }

  // Floor + perimeter walls (4 m high).
  box(48.4, 0.4, 32.4, 0, -0.2, 0, 'ground');
  box(0.4, 4, 32.4, -24.2, 2, 0, 'surface');
  box(0.4, 4, 32.4, 24.2, 2, 0, 'surface');
  box(48.4, 4, 0.4, 0, 2, -16.2, 'surface');
  box(48.4, 4, 0.4, 0, 2, 16.2, 'surface');

  // Long lane (z ~ -12): two stacks staggered to the lane edges so the 14 m
  // sightline from the mid-connector (x=0) to the site gate (x=14) stays open.
  box(6, 2.4, 2.4, -8, 1.2, -14.4, 'rust');
  box(6, 2.4, 2.4, -8, 3.6, -14.4, 'teal');
  box(6, 2.4, 2.4, 4, 1.2, -9.6, 'teal');
  // Mid lane cover.
  box(6, 2.4, 2.4, -12, 1.2, -2, 'surface');
  box(6, 2.4, 2.4, 6, 1.2, 2, 'rust');
  box(6, 2.4, 2.4, 6, 3.6, 2, 'surface');
  // Short lane cover.
  box(6, 2.4, 2.4, -6, 1.2, 12, 'teal');
  box(6, 2.4, 2.4, 10, 1.2, 10, 'rust');
  // Crates (1.2 m crouch cover) and pipe stacks (0.9 m) and pillars.
  box(1.2, 1.2, 1.2, -2, 0.6, -6, 'surface');
  box(1.2, 1.2, 1.2, 14, 0.6, -2, 'surface');
  box(1.2, 1.2, 1.2, -14, 0.6, 6, 'rust');
  box(1.2, 1.2, 1.2, 2, 0.6, 14, 'surface');
  box(2.4, 0.9, 0.9, -4, 0.45, -14, 'teal');
  box(2.4, 0.9, 0.9, 16, 0.45, 4, 'teal');
  box(0.9, 1.6, 0.9, -20, 0.8, -4, 'surface');
  box(0.9, 1.6, 0.9, 20, 0.8, 6, 'surface');
  box(0.9, 1.6, 0.9, 8, 0.8, -14, 'surface');
  box(0.9, 1.6, 0.9, -12, 0.8, 14, 'surface');

  // Fuel tank (site centre): cylinder mesh, AABB-approximated collider.
  const tank = new THREE.Mesh(
    new THREE.CylinderGeometry(1.5, 1.5, 3, 18),
    materials.rust,
  );
  tank.position.set(SITE.cx, 1.5, SITE.cz);
  tank.castShadow = true;
  tank.receiveShadow = true;
  group.add(tank);
  colliders.push(new THREE.Box3(
    new THREE.Vector3(SITE.cx - 1.5, 0, SITE.cz - 1.5),
    new THREE.Vector3(SITE.cx + 1.5, 3, SITE.cz + 1.5),
  ));
  shootables.push(tank);

  // Hazard stripes + site marking (flat planes, ghost: no collision).
  box(6, 0.02, 0.5, SITE.cx, 0.01, SITE.z0 + 0.3, 'hazard', { ghost: true });
  box(6, 0.02, 0.5, SITE.cx, 0.01, SITE.z1 - 0.3, 'hazard', { ghost: true });
  box(0.5, 0.02, 6, SITE.x0 + 0.3, 0.01, SITE.cz, 'hazard', { ghost: true });
  box(0.5, 0.02, 6, SITE.x1 - 0.3, 0.01, SITE.cz, 'hazard', { ghost: true });

  // Flare stack (§14.2): 12 m rust cylinder behind the site + flame cone +
  // flickering orange light + smoke plume planes. Does not block the Long
  // lane sightline or the site.
  const stack = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.7, 12, 12),
    materials.rust,
  );
  stack.position.set(FLARE_STACK.x, 6, FLARE_STACK.z);
  stack.castShadow = true;
  group.add(stack);
  colliders.push(new THREE.Box3(
    new THREE.Vector3(FLARE_STACK.x - 0.7, 0, FLARE_STACK.z - 0.7),
    new THREE.Vector3(FLARE_STACK.x + 0.7, 12, FLARE_STACK.z + 0.7),
  ));
  shootables.push(stack);
  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.55, 1.6, 10),
    flameMaterial,
  );
  flame.position.set(FLARE_STACK.x, 12.8, FLARE_STACK.z);
  group.add(flame);
  const plume = [];
  for (let i = 0; i < 3; i += 1) {
    const puff = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.4), plumeMaterial);
    puff.position.set(FLARE_STACK.x + 0.4 * i, 13.6 + i * 1.1, FLARE_STACK.z - 0.3 * i);
    puff.rotation.y = i * 1.1;
    group.add(puff);
    plume.push(puff);
  }
  const flareLight = new THREE.PointLight(new THREE.Color(PALETTE.amber), 26, 26, 1.6);
  flareLight.position.set(FLARE_STACK.x, 12.4, FLARE_STACK.z);
  scene.add(flareLight);

  // Lighting: low amber dusk sun (the ONLY shadow-caster), teal hemisphere,
  // 3 sodium points (site / mid / spawn, no shadows), fog teal 20-60 m.
  scene.background = new THREE.Color(PALETTE.canvas);
  scene.fog = new THREE.Fog(new THREE.Color('#0d2b2e'), 20, 60);
  const sky = new THREE.HemisphereLight(new THREE.Color(PALETTE.teal), new THREE.Color(PALETTE.canvas), 1.3);
  scene.add(sky);
  const sun = new THREE.DirectionalLight(new THREE.Color(PALETTE.amber), 2.8);
  sun.position.set(18, 16, 10);
  sun.target.position.set(-4, 0, -4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -26;
  sun.shadow.camera.right = 26;
  sun.shadow.camera.top = 20;
  sun.shadow.camera.bottom = -20;
  sun.shadow.camera.far = 60;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const sodiumSites = [[17, -12], [0, 0], [-21, 12]];
  for (const [x, z] of sodiumSites) {
    const lamp = new THREE.PointLight(new THREE.Color(PALETTE.amber), 14, 18, 1.8);
    lamp.position.set(x, 3.4, z);
    scene.add(lamp);
  }

  let ventBoost = 0;
  return {
    colliders,
    shootables,
    group,
    flareLight,
    // Vent flash (P3): main.js raises ventBoost during the 3 s flare vent.
    setVentBoost(v) {
      ventBoost = v;
    },
    update(t) {
      const flicker = 0.86 + 0.14 * Math.sin(t * 7.3) * Math.sin(t * 3.1 + 1.7);
      flareLight.intensity = 26 * flicker * (1 + ventBoost * 2);
      flame.scale.set(1 + 0.12 * Math.sin(t * 9.1), 1 + 0.18 * Math.sin(t * 11.7), 1);
      flameMaterial.opacity = 0.85 + 0.15 * flicker;
      for (let i = 0; i < plume.length; i += 1) {
        plume[i].position.y = 13.6 + i * 1.1 + 0.25 * Math.sin(t * 0.7 + i * 2.1);
      }
    },
  };
}
