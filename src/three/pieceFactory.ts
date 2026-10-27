import * as THREE from 'three';
import type { PieceColor, PieceType } from '../types/chess';

// Shared materials cache to save draw calls and memory
interface MaterialSet {
  main: THREE.MeshPhysicalMaterial;
  accent: THREE.MeshPhysicalMaterial;
  head: THREE.MeshPhysicalMaterial;
}

let materialsDark: MaterialSet | null = null;
let materialsLight: MaterialSet | null = null;

export function initPieceMaterials() {
  if (materialsDark && materialsLight) return;

  // Dark Pieces: Obsidian / Graphite Metallic with brushed gold accents
  materialsDark = {
    main: new THREE.MeshPhysicalMaterial({
      color: 0x151821,
      roughness: 0.22,
      metalness: 0.82,
      clearcoat: 0.4,
      clearcoatRoughness: 0.15,
    }),
    accent: new THREE.MeshPhysicalMaterial({
      color: 0xd4af37, // Royal gold
      roughness: 0.25,
      metalness: 0.95,
      clearcoat: 0.5,
    }),
    head: new THREE.MeshPhysicalMaterial({
      color: 0x1a1e29,
      roughness: 0.18,
      metalness: 0.78,
      clearcoat: 0.45,
    }),
  };

  // Light Pieces: Warm Polished Ivory / Alabaster with brushed gold accents
  materialsLight = {
    main: new THREE.MeshPhysicalMaterial({
      color: 0xede7da,
      roughness: 0.24,
      metalness: 0.12,
      clearcoat: 0.35,
      clearcoatRoughness: 0.1,
    }),
    accent: new THREE.MeshPhysicalMaterial({
      color: 0xd4af37, // Royal gold
      roughness: 0.25,
      metalness: 0.95,
      clearcoat: 0.5,
    }),
    head: new THREE.MeshPhysicalMaterial({
      color: 0xf5f1e8,
      roughness: 0.20,
      metalness: 0.08,
      clearcoat: 0.4,
    }),
  };
}

export function getMaterials(color: PieceColor): MaterialSet {
  initPieceMaterials();
  return color === 'w' ? materialsLight! : materialsDark!;
}

// Helper to create a multi-tier stepped piece base
function createPieceBase(radius: number, height: number, mats: MaterialSet): THREE.Group {
  const group = new THREE.Group();

  // Bottom ring (wider felt/gold base)
  const baseGeom1 = new THREE.CylinderGeometry(radius * 0.98, radius, height * 0.4, 24);
  const base1 = new THREE.Mesh(baseGeom1, mats.main);
  base1.position.y = height * 0.2;
  base1.castShadow = true;
  base1.receiveShadow = true;
  group.add(base1);

  // Gold accent ring
  const ringGeom = new THREE.CylinderGeometry(radius * 0.92, radius * 0.92, height * 0.18, 24);
  const ring = new THREE.Mesh(ringGeom, mats.accent);
  ring.position.y = height * 0.45;
  ring.castShadow = true;
  group.add(ring);

  // Upper bevel ring
  const baseGeom2 = new THREE.CylinderGeometry(radius * 0.75, radius * 0.9, height * 0.45, 24);
  const base2 = new THREE.Mesh(baseGeom2, mats.main);
  base2.position.y = height * 0.75;
  base2.castShadow = true;
  base2.receiveShadow = true;
  group.add(base2);

  return group;
}

// 1. Pawn: Weighted stepped base, tapered waist, collar ring, round head with pip
function createPawnGeometry(color: PieceColor): THREE.Group {
  const mats = getMaterials(color);
  const pawn = new THREE.Group();

  // Base (height 0.22)
  const base = createPieceBase(0.38, 0.22, mats);
  pawn.add(base);

  // Body waist
  const waistGeom = new THREE.CylinderGeometry(0.22, 0.32, 0.38, 24);
  const waist = new THREE.Mesh(waistGeom, mats.main);
  waist.position.y = 0.22 + 0.19;
  waist.castShadow = true;
  waist.receiveShadow = true;
  pawn.add(waist);

  // Neck collar
  const collarGeom = new THREE.TorusGeometry(0.23, 0.045, 12, 24);
  collarGeom.rotateX(Math.PI / 2);
  const collar = new THREE.Mesh(collarGeom, mats.accent);
  collar.position.y = 0.6;
  collar.castShadow = true;
  pawn.add(collar);

  // Head
  const headGeom = new THREE.SphereGeometry(0.22, 24, 20);
  const head = new THREE.Mesh(headGeom, mats.head);
  head.position.y = 0.78;
  head.castShadow = true;
  pawn.add(head);

  // Tiny top pip
  const pipGeom = new THREE.ConeGeometry(0.06, 0.08, 12);
  const pip = new THREE.Mesh(pipGeom, mats.accent);
  pip.position.y = 1.02;
  pawn.add(pip);

  pawn.scale.set(0.9, 0.9, 0.9);
  return pawn;
}

// 2. Rook: Sturdy base, castle tower fluting, cornice ring, 4 crenellated battlements
function createRookGeometry(color: PieceColor): THREE.Group {
  const mats = getMaterials(color);
  const rook = new THREE.Group();

  // Base (height 0.25)
  const base = createPieceBase(0.42, 0.24, mats);
  rook.add(base);

  // Tower body
  const bodyGeom = new THREE.CylinderGeometry(0.32, 0.36, 0.52, 24);
  const body = new THREE.Mesh(bodyGeom, mats.main);
  body.position.y = 0.24 + 0.26;
  body.castShadow = true;
  body.receiveShadow = true;
  rook.add(body);

  // Cornice gold ring
  const corniceGeom = new THREE.CylinderGeometry(0.42, 0.33, 0.12, 24);
  const cornice = new THREE.Mesh(corniceGeom, mats.accent);
  cornice.position.y = 0.82;
  cornice.castShadow = true;
  rook.add(cornice);

  // Tower top platform ring
  const platformGeom = new THREE.CylinderGeometry(0.42, 0.42, 0.08, 24);
  const platform = new THREE.Mesh(platformGeom, mats.main);
  platform.position.y = 0.91;
  rook.add(platform);

  // 4 Battlement crenellations
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2;
    const battleGeom = new THREE.BoxGeometry(0.18, 0.16, 0.18);
    const battlement = new THREE.Mesh(battleGeom, mats.head);
    battlement.position.set(
      Math.cos(angle + Math.PI / 4) * 0.32,
      1.02,
      Math.sin(angle + Math.PI / 4) * 0.32
    );
    battlement.castShadow = true;
    rook.add(battlement);
  }

  rook.scale.set(0.92, 0.92, 0.92);
  return rook;
}

// 3. Knight: Stepped base, sculpted horse neck, muzzle, pointed ears, mane crest
function createKnightGeometry(color: PieceColor): THREE.Group {
  const mats = getMaterials(color);
  const knight = new THREE.Group();

  // Base (height 0.24)
  const base = createPieceBase(0.40, 0.24, mats);
  knight.add(base);

  // Lower chest
  const chestGeom = new THREE.CylinderGeometry(0.28, 0.34, 0.26, 20);
  const chest = new THREE.Mesh(chestGeom, mats.main);
  chest.position.y = 0.36;
  chest.castShadow = true;
  knight.add(chest);

  // Neck (arched forward)
  const neckGeom = new THREE.BoxGeometry(0.24, 0.44, 0.32);
  const neck = new THREE.Mesh(neckGeom, mats.main);
  neck.position.set(0, 0.64, 0.04);
  neck.rotation.x = 0.25; // leaning forward
  neck.castShadow = true;
  knight.add(neck);

  // Horse Head / Muzzle
  const headGeom = new THREE.BoxGeometry(0.22, 0.24, 0.38);
  const head = new THREE.Mesh(headGeom, mats.head);
  head.position.set(0, 0.88, 0.16);
  head.rotation.x = -0.15;
  head.castShadow = true;
  knight.add(head);

  // Snout bevel
  const snoutGeom = new THREE.CylinderGeometry(0.10, 0.12, 0.18, 16);
  snoutGeom.rotateX(Math.PI / 2);
  const snout = new THREE.Mesh(snoutGeom, mats.accent);
  snout.position.set(0, 0.82, 0.36);
  snout.castShadow = true;
  knight.add(snout);

  // Left & Right Ears
  const earGeom = new THREE.ConeGeometry(0.06, 0.16, 8);
  const leftEar = new THREE.Mesh(earGeom, mats.accent);
  leftEar.position.set(0.07, 1.06, 0.08);
  leftEar.rotation.z = -0.2;
  leftEar.castShadow = true;
  knight.add(leftEar);

  const rightEar = new THREE.Mesh(earGeom, mats.accent);
  rightEar.position.set(-0.07, 1.06, 0.08);
  rightEar.rotation.z = 0.2;
  rightEar.castShadow = true;
  knight.add(rightEar);

  // Mane ridge along back
  const maneGeom = new THREE.BoxGeometry(0.08, 0.42, 0.12);
  const mane = new THREE.Mesh(maneGeom, mats.accent);
  mane.position.set(0, 0.68, -0.12);
  mane.rotation.x = 0.25;
  mane.castShadow = true;
  knight.add(mane);

  // Rotate knights so they face the opposing army
  knight.scale.set(0.92, 0.92, 0.92);
  return knight;
}

// 4. Bishop: Slender body, mitre-shaped head with diagonal slit and jewel sphere
function createBishopGeometry(color: PieceColor): THREE.Group {
  const mats = getMaterials(color);
  const bishop = new THREE.Group();

  // Base
  const base = createPieceBase(0.40, 0.25, mats);
  bishop.add(base);

  // Slender fluted body
  const bodyGeom = new THREE.CylinderGeometry(0.22, 0.32, 0.54, 24);
  const body = new THREE.Mesh(bodyGeom, mats.main);
  body.position.y = 0.52;
  body.castShadow = true;
  bishop.add(body);

  // Collar ring
  const collarGeom = new THREE.TorusGeometry(0.25, 0.045, 12, 24);
  collarGeom.rotateX(Math.PI / 2);
  const collar = new THREE.Mesh(collarGeom, mats.accent);
  collar.position.y = 0.81;
  collar.castShadow = true;
  bishop.add(collar);

  // Mitre lower oval
  const mitreLowerGeom = new THREE.SphereGeometry(0.24, 24, 20);
  mitreLowerGeom.scale(0.9, 1.25, 0.9);
  const mitre = new THREE.Mesh(mitreLowerGeom, mats.head);
  mitre.position.y = 1.08;
  mitre.castShadow = true;
  bishop.add(mitre);

  // Mitre diagonal gold slash inlay
  const slashGeom = new THREE.BoxGeometry(0.32, 0.04, 0.16);
  slashGeom.rotateZ(Math.PI / 4);
  const slash = new THREE.Mesh(slashGeom, mats.accent);
  slash.position.set(0.05, 1.15, 0.12);
  bishop.add(slash);

  // Top ball finial
  const finialGeom = new THREE.SphereGeometry(0.08, 16, 16);
  const finial = new THREE.Mesh(finialGeom, mats.accent);
  finial.position.y = 1.38;
  finial.castShadow = true;
  bishop.add(finial);

  bishop.scale.set(0.92, 0.92, 0.92);
  return bishop;
}

// 5. Queen: Elaborate royal flared base, coronet crown with 8 jeweled tips
function createQueenGeometry(color: PieceColor): THREE.Group {
  const mats = getMaterials(color);
  const queen = new THREE.Group();

  // Base
  const base = createPieceBase(0.44, 0.26, mats);
  queen.add(base);

  // Regal tiered body
  const bodyGeom = new THREE.CylinderGeometry(0.24, 0.36, 0.64, 24);
  const body = new THREE.Mesh(bodyGeom, mats.main);
  body.position.y = 0.58;
  body.castShadow = true;
  queen.add(body);

  // Upper waist gold girdle
  const girdleGeom = new THREE.TorusGeometry(0.26, 0.045, 12, 24);
  girdleGeom.rotateX(Math.PI / 2);
  const girdle = new THREE.Mesh(girdleGeom, mats.accent);
  girdle.position.y = 0.92;
  queen.add(girdle);

  // Neck
  const neckGeom = new THREE.CylinderGeometry(0.24, 0.22, 0.16, 24);
  const neck = new THREE.Mesh(neckGeom, mats.main);
  neck.position.y = 1.04;
  queen.add(neck);

  // Coronet crown flared bowl
  const crownBowlGeom = new THREE.CylinderGeometry(0.38, 0.22, 0.26, 24);
  const crownBowl = new THREE.Mesh(crownBowlGeom, mats.head);
  crownBowl.position.y = 1.22;
  crownBowl.castShadow = true;
  queen.add(crownBowl);

  // 8 Crown points/spikes with pearls
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI * 2) / 8;
    const spikeGeom = new THREE.ConeGeometry(0.04, 0.14, 8);
    const spike = new THREE.Mesh(spikeGeom, mats.accent);
    spike.position.set(Math.cos(angle) * 0.35, 1.40, Math.sin(angle) * 0.35);
    queen.add(spike);

    const pearlGeom = new THREE.SphereGeometry(0.04, 10, 10);
    const pearl = new THREE.Mesh(pearlGeom, mats.accent);
    pearl.position.set(Math.cos(angle) * 0.35, 1.48, Math.sin(angle) * 0.35);
    queen.add(pearl);
  }

  // Central royal pearl
  const centerPearlGeom = new THREE.SphereGeometry(0.10, 16, 16);
  const centerPearl = new THREE.Mesh(centerPearlGeom, mats.accent);
  centerPearl.position.y = 1.34;
  queen.add(centerPearl);

  queen.scale.set(0.95, 0.95, 0.95);
  return queen;
}

// 6. King: Tallest, stately regal body, imperial crown rim, and royal cross finial
function createKingGeometry(color: PieceColor): THREE.Group {
  const mats = getMaterials(color);
  const king = new THREE.Group();

  // Majestic broad base
  const base = createPieceBase(0.46, 0.28, mats);
  king.add(base);

  // Lower waist
  const waistGeom = new THREE.CylinderGeometry(0.28, 0.38, 0.72, 24);
  const waist = new THREE.Mesh(waistGeom, mats.main);
  waist.position.y = 0.64;
  waist.castShadow = true;
  king.add(waist);

  // Royal belt ring
  const beltGeom = new THREE.TorusGeometry(0.29, 0.05, 12, 24);
  beltGeom.rotateX(Math.PI / 2);
  const belt = new THREE.Mesh(beltGeom, mats.accent);
  belt.position.y = 1.02;
  king.add(belt);

  // Crown dome
  const domeGeom = new THREE.SphereGeometry(0.32, 24, 20);
  domeGeom.scale(1.0, 0.9, 1.0);
  const dome = new THREE.Mesh(domeGeom, mats.head);
  dome.position.y = 1.28;
  dome.castShadow = true;
  king.add(dome);

  // Imperial crown rim
  const rimGeom = new THREE.CylinderGeometry(0.36, 0.32, 0.12, 24);
  const rim = new THREE.Mesh(rimGeom, mats.accent);
  rim.position.y = 1.24;
  king.add(rim);

  // Royal Cross Finial
  const crossGroup = new THREE.Group();
  // Vertical beam
  const vBeamGeom = new THREE.BoxGeometry(0.08, 0.28, 0.06);
  const vBeam = new THREE.Mesh(vBeamGeom, mats.accent);
  vBeam.position.y = 1.62;
  vBeam.castShadow = true;
  crossGroup.add(vBeam);

  // Horizontal beam
  const hBeamGeom = new THREE.BoxGeometry(0.22, 0.08, 0.06);
  const hBeam = new THREE.Mesh(hBeamGeom, mats.accent);
  hBeam.position.y = 1.66;
  hBeam.castShadow = true;
  crossGroup.add(hBeam);

  king.add(crossGroup);

  king.scale.set(0.96, 0.96, 0.96);
  return king;
}

export function createChessPieceModel(type: PieceType, color: PieceColor): THREE.Group {
  let model: THREE.Group;

  switch (type) {
    case 'p':
      model = createPawnGeometry(color);
      break;
    case 'r':
      model = createRookGeometry(color);
      break;
    case 'n':
      model = createKnightGeometry(color);
      // Knights face towards opposing side by default
      if (color === 'w') {
        model.rotation.y = 0; // facing +Z
      } else {
        model.rotation.y = Math.PI; // facing -Z
      }
      break;
    case 'b':
      model = createBishopGeometry(color);
      break;
    case 'q':
      model = createQueenGeometry(color);
      break;
    case 'k':
      model = createKingGeometry(color);
      break;
    default:
      model = createPawnGeometry(color);
  }

  model.userData = {
    pieceType: type,
    pieceColor: color,
  };

  return model;
}
