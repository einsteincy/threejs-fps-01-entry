// Player body (DESIGN.md §5): accel/friction/gravity/crouch/jump, resolved as an
// AABB against the map colliders one axis at a time. Health 100; armor absorbs
// half the damage while it lasts. Footsteps emit noise the bots hear.
import * as THREE from 'three';

const RADIUS = 0.34;
const STAND_HEIGHT = 1.72;
const CROUCH_HEIGHT = 1.12;
const STAND_EYE = 1.6;
const CROUCH_EYE = 1.02;
const WALK = 5.2;
const CROUCH_WALK = 2.4;
const ADS_WALK = 3.1;
const GROUND_ACCEL = 42;
const AIR_ACCEL = 9;
const FRICTION = 9;
const GRAVITY = 20;
const JUMP = 6.2;
const STEP_PERIOD = 0.42;

export function createPlayer(colliders, onNoise) {
  const body = {
    position: new THREE.Vector3(-21, 0, 12),
    velocity: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    eye: STAND_EYE,
    height: STAND_HEIGHT,
    onGround: true,
    crouching: false,
    ads: false,
    health: 100,
    armor: 0,
    alive: true,
    stepClock: 0,
  };
  const probe = new THREE.Box3();
  const wish = new THREE.Vector3();

  function hitsBox(x, y, z, height, lift) {
    probe.min.set(x - RADIUS, y + lift, z - RADIUS);
    probe.max.set(x + RADIUS, y + height - lift, z + RADIUS);
    for (const c of colliders) if (probe.intersectsBox(c)) return c;
    return null;
  }

  function look(dx, dy, sensitivity) {
    body.yaw -= dx * sensitivity;
    const next = body.pitch - dy * sensitivity;
    body.pitch = Math.max(-1.45, Math.min(1.45, next));
  }

  function recoil(pitchKick, yawKick) {
    body.pitch = Math.min(1.45, body.pitch + pitchKick);
    body.yaw += yawKick;
  }

  // Damage splits 50/50 between armor and health while armor lasts.
  function damage(amount) {
    if (!body.alive) return 0;
    let left = amount;
    if (body.armor > 0) {
      const absorbed = Math.min(body.armor, left * 0.5);
      body.armor -= absorbed;
      left -= absorbed;
    }
    body.health = Math.max(0, body.health - left);
    if (body.health <= 0) body.alive = false;
    return amount;
  }

  function step(dt, keys) {
    if (!body.alive) return;
    const wantCrouch = keys.has('ControlLeft') || keys.has('ControlRight');
    if (wantCrouch && !body.crouching) {
      body.crouching = true;
      body.height = CROUCH_HEIGHT;
    } else if (!wantCrouch && body.crouching && !hitsBox(body.position.x, body.position.y, body.position.z, STAND_HEIGHT, 0.02)) {
      body.crouching = false;
      body.height = STAND_HEIGHT;
    }
    const eyeGoal = body.crouching ? CROUCH_EYE : STAND_EYE;
    body.eye += (eyeGoal - body.eye) * Math.min(1, dt * 12);

    const fwd = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    wish.set(0, 0, 0);
    if (fwd || strafe) {
      const s = Math.sin(body.yaw);
      const c = Math.cos(body.yaw);
      wish.set(-s * fwd + c * strafe, 0, -c * fwd - s * strafe).normalize();
    }
    const top = body.crouching ? CROUCH_WALK : body.ads ? ADS_WALK : WALK;
    const blend = Math.min(1, ((body.onGround ? GROUND_ACCEL : AIR_ACCEL) * dt) / top);
    body.velocity.x += (wish.x * top - body.velocity.x) * blend;
    body.velocity.z += (wish.z * top - body.velocity.z) * blend;
    if (body.onGround && wish.lengthSq() === 0) {
      const damp = Math.max(0, 1 - FRICTION * dt);
      body.velocity.x *= damp;
      body.velocity.z *= damp;
    }
    if (keys.has('Space') && body.onGround) {
      body.velocity.y = JUMP;
      body.onGround = false;
    }
    body.velocity.y -= GRAVITY * dt;

    const nx = body.position.x + body.velocity.x * dt;
    if (!hitsBox(nx, body.position.y, body.position.z, body.height, 0.04)) body.position.x = nx;
    else body.velocity.x = 0;
    const nz = body.position.z + body.velocity.z * dt;
    if (!hitsBox(body.position.x, body.position.y, nz, body.height, 0.04)) body.position.z = nz;
    else body.velocity.z = 0;

    body.position.y += body.velocity.y * dt;
    body.onGround = false;
    const floor = hitsBox(body.position.x, body.position.y, body.position.z, body.height, 0);
    if (floor && body.velocity.y <= 0) {
      body.position.y = floor.max.y;
      body.velocity.y = 0;
      body.onGround = true;
    } else if (floor) {
      body.position.y = floor.min.y - body.height;
      body.velocity.y = 0;
    }
    if (body.position.y < 0) {
      body.position.y = 0;
      body.velocity.y = 0;
      body.onGround = true;
    }
    body.velocity.y = Math.max(-30, body.velocity.y);

    // Footstep noise: running radius 10 (nearest bot), walking 3, crouch 0.
    const speed = Math.hypot(body.velocity.x, body.velocity.z);
    if (body.onGround && speed > 0.5) {
      body.stepClock += dt * speed;
      if (body.stepClock >= STEP_PERIOD * 5.2) {
        body.stepClock = 0;
        const radius = body.crouching ? 0 : speed > 4 ? 10 : 3;
        if (radius > 0 && onNoise) onNoise(body.position.x, body.position.z, radius, speed > 4 ? 2 : 1);
      }
    }
  }

  return {
    state: body,
    step,
    look,
    recoil,
    damage,
    groundSpeed() {
      return Math.hypot(body.velocity.x, body.velocity.z);
    },
    reset(x, z, yaw) {
      body.position.set(x, 0, z);
      body.velocity.set(0, 0, 0);
      body.yaw = yaw;
      body.pitch = 0;
      body.eye = STAND_EYE;
      body.height = STAND_HEIGHT;
      body.onGround = true;
      body.crouching = false;
      body.ads = false;
      body.health = 100;
      body.armor = 0;
      body.alive = true;
      body.stepClock = 0;
    },
  };
}
