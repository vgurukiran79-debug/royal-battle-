import * as THREE from 'three';
import type { DestructionStyle, GraphicsQuality, PieceColor, PieceType } from '../types/chess';
import { getMaterials } from './pieceFactory';

interface ActiveFragment {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  rotVelocity: THREE.Vector3;
  life: number;
  maxLife: number;
  initialScale: number;
}

interface ShockwaveRing {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  life: number;
  maxLife: number;
}

interface SparkParticleSystem {
  points: THREE.Points;
  positions: Float32Array;
  velocities: Float32Array;
  life: number;
  maxLife: number;
}

export class DestructionSystem {
  private scene: THREE.Scene;
  private fragments: ActiveFragment[] = [];
  private shockwaves: ShockwaveRing[] = [];
  private sparkSystems: SparkParticleSystem[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /**
   * Spawns genuine 3D physical fragments when a piece is captured
   */
  public triggerDestruction(
    position: THREE.Vector3,
    pieceType: PieceType,
    pieceColor: PieceColor,
    style: DestructionStyle = 'shatter',
    quality: GraphicsQuality = 'high'
  ) {
    const mats = getMaterials(pieceColor);

    // Determine fragment count based on quality and piece importance
    let fragmentCount = quality === 'performance' ? 10 : (quality === 'balanced' ? 18 : 28);
    if (pieceType === 'q' || pieceType === 'k') {
      fragmentCount = Math.floor(fragmentCount * 1.3);
    } else if (pieceType === 'p') {
      fragmentCount = Math.max(8, Math.floor(fragmentCount * 0.8));
    }

    const fragmentGroup = new THREE.Group();

    // 1. Generate 3D Polyhedral Shards
    for (let i = 0; i < fragmentCount; i++) {
      // Create jagged shard geometry
      const shardGeom = this.createShardGeometry(style);
      
      // Alternate between main piece stone/metal material and gold accent
      const isAccent = Math.random() < 0.28;
      const shardMat = (isAccent ? mats.accent : mats.main).clone();
      shardMat.transparent = true;
      shardMat.opacity = 1.0;

      const shardMesh = new THREE.Mesh(shardGeom, shardMat);
      shardMesh.castShadow = quality !== 'performance';
      shardMesh.receiveShadow = false;

      // Position near center of piece volume
      const yOffset = Math.random() * 0.9 + 0.1;
      const rOffset = Math.random() * 0.22;
      const rAngle = Math.random() * Math.PI * 2;
      
      shardMesh.position.set(
        position.x + Math.cos(rAngle) * rOffset,
        position.y + yOffset,
        position.z + Math.sin(rAngle) * rOffset
      );

      // Random rotation
      shardMesh.rotation.set(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2
      );

      // Physics velocities
      const blastSpeed = style === 'burst' ? 4.5 + Math.random() * 4.0 : 3.0 + Math.random() * 3.5;
      const blastAngle = Math.random() * Math.PI * 2;
      const upVelocity = style === 'dissolve' ? 2.5 + Math.random() * 2.5 : 2.8 + Math.random() * 3.8;

      const velocity = new THREE.Vector3(
        Math.cos(blastAngle) * blastSpeed,
        upVelocity,
        Math.sin(blastAngle) * blastSpeed
      );

      const rotVelocity = new THREE.Vector3(
        (Math.random() - 0.5) * 14,
        (Math.random() - 0.5) * 14,
        (Math.random() - 0.5) * 14
      );

      const maxLife = style === 'dissolve' ? 1.8 + Math.random() * 0.6 : 1.3 + Math.random() * 0.5;

      this.scene.add(shardMesh);
      this.fragments.push({
        mesh: shardMesh,
        velocity,
        rotVelocity,
        life: 0,
        maxLife,
        initialScale: 1.0,
      });
    }

    // 2. Shockwave ring on board plane (for Energy Burst and Shatter)
    if (style === 'burst' || style === 'shatter') {
      const ringGeom = new THREE.RingGeometry(0.1, 0.25, 32);
      ringGeom.rotateX(-Math.PI / 2);
      const ringColor = style === 'burst' ? 0xffd700 : (pieceColor === 'w' ? 0xffeedd : 0x4488ff);
      const ringMat = new THREE.MeshBasicMaterial({
        color: ringColor,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const ringMesh = new THREE.Mesh(ringGeom, ringMat);
      ringMesh.position.set(position.x, position.y + 0.04, position.z);
      this.scene.add(ringMesh);

      this.shockwaves.push({
        mesh: ringMesh,
        material: ringMat,
        life: 0,
        maxLife: 0.55,
      });
    }

    // 3. Sparks / Embers Particle Burst
    if (quality !== 'performance') {
      this.createSparkShower(position, pieceColor, style);
    }
  }

  private createShardGeometry(style: DestructionStyle): THREE.BufferGeometry {
    const geom = new THREE.BufferGeometry();
    const size = style === 'dissolve' ? 0.07 + Math.random() * 0.06 : 0.12 + Math.random() * 0.14;

    // Build an irregular 3D triangular wedge/tetrahedron
    const p0 = [0, size * (1 + Math.random() * 0.5), 0];
    const p1 = [-size * 0.8, -size * 0.4, -size * 0.5];
    const p2 = [size * 0.9, -size * 0.5, -size * 0.4];
    const p3 = [0, -size * 0.3, size * 0.8];

    // 4 faces of a tetrahedron
    const vertices = new Float32Array([
      // Face 0: 0, 1, 2
      ...p0, ...p1, ...p2,
      // Face 1: 0, 2, 3
      ...p0, ...p2, ...p3,
      // Face 2: 0, 3, 1
      ...p0, ...p3, ...p1,
      // Face 3: 1, 3, 2 (bottom)
      ...p1, ...p3, ...p2,
    ]);

    geom.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geom.computeVertexNormals();
    return geom;
  }

  private createSparkShower(position: THREE.Vector3, pieceColor: PieceColor, style: DestructionStyle) {
    const count = style === 'burst' ? 50 : 25;
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      positions[i3] = position.x;
      positions[i3 + 1] = position.y + 0.5;
      positions[i3 + 2] = position.z;

      const angle = Math.random() * Math.PI * 2;
      const speed = 2.0 + Math.random() * 4.0;
      velocities[i3] = Math.cos(angle) * speed;
      velocities[i3 + 1] = 1.5 + Math.random() * 4.5;
      velocities[i3 + 2] = Math.sin(angle) * speed;
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const sparkColor = style === 'burst' ? 0xffcc33 : (pieceColor === 'w' ? 0xffffff : 0xd4af37);
    const mat = new THREE.PointsMaterial({
      color: sparkColor,
      size: 0.08,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const points = new THREE.Points(geom, mat);
    this.scene.add(points);

    this.sparkSystems.push({
      points,
      positions,
      velocities,
      life: 0,
      maxLife: 0.75,
    });
  }

  /**
   * Physics update called every frame via delta-time
   */
  public update(delta: number) {
    const gravity = -11.0;
    const groundY = 0.02;

    // 1. Update 3D fragments
    for (let i = this.fragments.length - 1; i >= 0; i--) {
      const f = this.fragments[i];
      f.life += delta;

      // Physics integration
      f.velocity.y += gravity * delta;
      f.mesh.position.x += f.velocity.x * delta;
      f.mesh.position.y += f.velocity.y * delta;
      f.mesh.position.z += f.velocity.z * delta;

      // Rotation tumbling
      f.mesh.rotation.x += f.rotVelocity.x * delta;
      f.mesh.rotation.y += f.rotVelocity.y * delta;
      f.mesh.rotation.z += f.rotVelocity.z * delta;

      // Board floor bounce
      if (f.mesh.position.y <= groundY) {
        f.mesh.position.y = groundY;
        // Restitution bounce
        f.velocity.y = -f.velocity.y * 0.38;
        // Friction on floor
        f.velocity.x *= 0.65;
        f.velocity.z *= 0.65;
        f.rotVelocity.multiplyScalar(0.7);
      }

      // Fade-out and scale dissipation
      const progress = f.life / f.maxLife;
      if (progress > 0.65) {
        const fadeProgress = (progress - 0.65) / 0.35;
        const scale = Math.max(0.01, (1.0 - fadeProgress) * f.initialScale);
        f.mesh.scale.set(scale, scale, scale);
        const mat = f.mesh.material as THREE.MeshStandardMaterial;
        mat.opacity = Math.max(0, 1.0 - fadeProgress);
      }

      // Cleanup when expired
      if (f.life >= f.maxLife) {
        this.scene.remove(f.mesh);
        f.mesh.geometry.dispose();
        if (Array.isArray(f.mesh.material)) {
          f.mesh.material.forEach(m => m.dispose());
        } else {
          f.mesh.material.dispose();
        }
        this.fragments.splice(i, 1);
      }
    }

    // 2. Update shockwaves
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.life += delta;
      const progress = sw.life / sw.maxLife;
      const scale = 1.0 + progress * 5.5;
      sw.mesh.scale.set(scale, scale, scale);
      sw.material.opacity = Math.max(0, (1.0 - progress) * 0.85);

      if (sw.life >= sw.maxLife) {
        this.scene.remove(sw.mesh);
        sw.mesh.geometry.dispose();
        sw.material.dispose();
        this.shockwaves.splice(i, 1);
      }
    }

    // 3. Update spark particle bursts
    for (let i = this.sparkSystems.length - 1; i >= 0; i--) {
      const sp = this.sparkSystems[i];
      sp.life += delta;
      const posAttr = sp.points.geometry.getAttribute('position') as THREE.BufferAttribute;
      const count = sp.positions.length / 3;

      for (let j = 0; j < count; j++) {
        const j3 = j * 3;
        sp.velocities[j3 + 1] += gravity * 0.6 * delta;
        sp.positions[j3] += sp.velocities[j3] * delta;
        sp.positions[j3 + 1] += sp.velocities[j3 + 1] * delta;
        sp.positions[j3 + 2] += sp.velocities[j3 + 2] * delta;

        if (sp.positions[j3 + 1] < groundY) {
          sp.positions[j3 + 1] = groundY;
          sp.velocities[j3 + 1] = -sp.velocities[j3 + 1] * 0.3;
        }
      }

      posAttr.needsUpdate = true;
      const progress = sp.life / sp.maxLife;
      (sp.points.material as THREE.PointsMaterial).opacity = Math.max(0, 1.0 - progress);

      if (sp.life >= sp.maxLife) {
        this.scene.remove(sp.points);
        sp.points.geometry.dispose();
        (sp.points.material as THREE.PointsMaterial).dispose();
        this.sparkSystems.splice(i, 1);
      }
    }
  }

  public dispose() {
    this.fragments.forEach(f => {
      this.scene.remove(f.mesh);
      f.mesh.geometry.dispose();
      if (Array.isArray(f.mesh.material)) {
        f.mesh.material.forEach(m => m.dispose());
      } else {
        f.mesh.material.dispose();
      }
    });
    this.fragments = [];

    this.shockwaves.forEach(sw => {
      this.scene.remove(sw.mesh);
      sw.mesh.geometry.dispose();
      sw.material.dispose();
    });
    this.shockwaves = [];

    this.sparkSystems.forEach(sp => {
      this.scene.remove(sp.points);
      sp.points.geometry.dispose();
      (sp.points.material as THREE.PointsMaterial).dispose();
    });
    this.sparkSystems = [];
  }
}
