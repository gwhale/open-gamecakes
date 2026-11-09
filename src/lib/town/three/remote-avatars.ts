// The other kids in the family, drawn in the town. The React host owns the
// network; this owns the scene. Each peer is a normal createAvatar cupcake, so
// a sibling looks exactly like the treat they built.

import type * as THREE from 'three';
import type { CupcakeConfig } from '@/lib/cupcake/config';
import type { PosPacket } from '@/lib/realtime/town-channel';
import { createAvatar, type Avatar } from './avatar';
import { createPeerMotion, type PeerMotion } from './remote-motion';
import { PX_PER_UNIT, pxToSceneX, pxToSceneZ } from './types';

type ThreeNS = typeof THREE;

export interface RemotePeerProfile {
  kid_id: string;
  name: string;
  cupcake: CupcakeConfig;
}

export interface RemoteAvatarDeps {
  /** Surface height at a city-px spot, water included. */
  surfaceY(px: number, py: number): number;
  /** True where this viewer shouldn't see a peer: inside a land still fogged
   *  for them. */
  hiddenAt(px: number, py: number): boolean;
}

export interface RemoteAvatars {
  upsertPeer(profile: RemotePeerProfile): void;
  applyPos(packet: PosPacket, nowMs: number): void;
  removePeer(kidId: string): void;
  update(dtMs: number, nowMs: number): void;
  dispose(): void;
}

interface Peer {
  name: string;
  cupcakeKey: string;
  avatar: Avatar;
  motion: PeerMotion;
  tag: NameTag;
}

interface NameTag {
  sprite: THREE.Sprite;
  dispose(): void;
}

const NAME_MAX_CHARS = 16;
const NAME_TAG_Y_U = 1.55;
const NAME_TAG_HEIGHT_U = 0.36;

/** The universal dark pill, so a name reads over any bright part of the town. */
function createNameTag(three: ThreeNS, name: string): NameTag {
  const text = name.slice(0, NAME_MAX_CHARS);
  const font = '600 40px Fredoka, "Segoe UI", system-ui, sans-serif';
  const height = 64;
  const pad = 24;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  ctx.font = font;
  canvas.width = Math.ceil(ctx.measureText(text).width) + pad * 2;
  canvas.height = height;
  ctx.font = font; // resizing a canvas resets its state
  ctx.fillStyle = 'rgba(24, 24, 27, 0.85)';
  ctx.beginPath();
  ctx.roundRect(0, 0, canvas.width, height, height / 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, height / 2 + 2);

  const texture = new three.CanvasTexture(canvas);
  texture.colorSpace = three.SRGBColorSpace;
  const material = new three.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const sprite = new three.Sprite(material);
  sprite.scale.set(NAME_TAG_HEIGHT_U * (canvas.width / height), NAME_TAG_HEIGHT_U, 1);
  sprite.position.y = NAME_TAG_Y_U;
  return {
    sprite,
    dispose() {
      texture.dispose();
      material.dispose();
    },
  };
}

export function createRemoteAvatars(
  three: ThreeNS,
  scene: THREE.Scene,
  deps: RemoteAvatarDeps,
): RemoteAvatars {
  const peers = new Map<string, Peer>();

  const destroy = (peer: Peer): void => {
    scene.remove(peer.avatar.group);
    peer.avatar.dispose();
    peer.tag.dispose();
  };

  return {
    upsertPeer({ kid_id, name, cupcake }) {
      const cupcakeKey = JSON.stringify(cupcake);
      const existing = peers.get(kid_id);
      if (existing && existing.cupcakeKey === cupcakeKey && existing.name === name) return;

      const avatar = createAvatar(three, undefined, cupcake);
      const tag = createNameTag(three, name);
      avatar.group.add(tag.sprite);
      // Unplaced until a position arrives, rather than drawn at the map origin.
      avatar.group.visible = false;
      scene.add(avatar.group);

      if (existing) {
        avatar.group.position.copy(existing.avatar.group.position);
        avatar.group.visible = existing.avatar.group.visible;
        destroy(existing);
      }
      peers.set(kid_id, {
        name,
        cupcakeKey,
        avatar,
        tag,
        motion: existing?.motion ?? createPeerMotion(),
      });
    },

    applyPos(packet, nowMs) {
      peers.get(packet.k)?.motion.push(packet, nowMs);
    },

    removePeer(kidId) {
      const peer = peers.get(kidId);
      if (!peer) return;
      destroy(peer);
      peers.delete(kidId);
    },

    update(dtMs, nowMs) {
      for (const peer of peers.values()) {
        const pose = peer.motion.sample(nowMs);
        if (!pose) continue;
        const group = peer.avatar.group;
        group.visible = !deps.hiddenAt(pose.x, pose.y);
        if (!group.visible) continue;
        group.position.set(pxToSceneX(pose.x), deps.surfaceY(pose.x, pose.y), pxToSceneZ(pose.y));
        peer.avatar.update(dtMs, pose.moving, pose.vx / PX_PER_UNIT, pose.vy / PX_PER_UNIT);
      }
    },

    dispose() {
      for (const peer of peers.values()) destroy(peer);
      peers.clear();
    },
  };
}
