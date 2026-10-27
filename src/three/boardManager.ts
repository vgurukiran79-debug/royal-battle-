import * as THREE from 'three';

export interface TileCoordinate {
  file: string; // 'a' - 'h'
  rank: number; // 1 - 8
  square: string; // 'e4'
  position: THREE.Vector3;
}

export class BoardManager {
  public group: THREE.Group;
  public tileMeshes: Map<string, THREE.Mesh> = new Map();
  public squareCoords: Map<string, THREE.Vector3> = new Map();
  
  // Highlight indicator meshes
  private highlightGroup: THREE.Group;
  private selectedSquareMesh: THREE.Mesh | null = null;
  private destinationMarkers: THREE.Mesh[] = [];
  private lastMoveOriginMesh: THREE.Mesh | null = null;
  private lastMoveDestMesh: THREE.Mesh | null = null;
  private checkIndicatorMesh: THREE.Mesh | null = null;

  // Materials
  private darkTileMat!: THREE.MeshPhysicalMaterial;
  private lightTileMat!: THREE.MeshPhysicalMaterial;
  private goldBorderMat!: THREE.MeshPhysicalMaterial;
  private pedestalMat!: THREE.MeshPhysicalMaterial;

  // Highlight indicator textures & materials
  private dottedEmptyMat!: THREE.MeshBasicMaterial;
  private dottedCaptureMat!: THREE.MeshBasicMaterial;
  private emptyMoveGeom!: THREE.PlaneGeometry;
  private captureMoveGeom!: THREE.PlaneGeometry;

  constructor() {
    this.group = new THREE.Group();
    this.highlightGroup = new THREE.Group();
    this.group.add(this.highlightGroup);

    this.initMaterials();
    this.initHighlightMaterials();
    this.buildCitadelPedestal();
    this.buildTiles();
    this.buildCoordinatesBorder();
  }

  private initMaterials() {
    // Dark obsidian granite tile
    this.darkTileMat = new THREE.MeshPhysicalMaterial({
      color: 0x181d26,
      roughness: 0.28,
      metalness: 0.65,
      clearcoat: 0.45,
      clearcoatRoughness: 0.15,
    });

    // Warm ivory / alabaster light tile
    this.lightTileMat = new THREE.MeshPhysicalMaterial({
      color: 0xe6dfd1,
      roughness: 0.32,
      metalness: 0.15,
      clearcoat: 0.4,
      clearcoatRoughness: 0.15,
    });

    // Royal gold inlay border
    this.goldBorderMat = new THREE.MeshPhysicalMaterial({
      color: 0xd4af37,
      roughness: 0.22,
      metalness: 0.92,
      clearcoat: 0.6,
    });

    // Dark charcoal obsidian pedestal
    this.pedestalMat = new THREE.MeshPhysicalMaterial({
      color: 0x0d1117,
      roughness: 0.45,
      metalness: 0.4,
    });
  }

  private buildCitadelPedestal() {
    // 1. Heavy base tier (width 9.8, depth 9.8, height 0.6)
    const baseGeom = new THREE.BoxGeometry(9.8, 0.5, 9.8);
    const baseMesh = new THREE.Mesh(baseGeom, this.pedestalMat);
    baseMesh.position.y = -0.32;
    baseMesh.receiveShadow = true;
    this.group.add(baseMesh);

    // 2. Gold trim tier step
    const trimGeom = new THREE.BoxGeometry(9.4, 0.08, 9.4);
    const trimMesh = new THREE.Mesh(trimGeom, this.goldBorderMat);
    trimMesh.position.y = -0.04;
    trimMesh.receiveShadow = true;
    this.group.add(trimMesh);

    // 3. Top board bed with beveled surround
    const bedGeom = new THREE.BoxGeometry(9.1, 0.12, 9.1);
    const bedMesh = new THREE.Mesh(bedGeom, this.pedestalMat);
    bedMesh.position.y = -0.01;
    bedMesh.receiveShadow = true;
    this.group.add(bedMesh);

    // 4. Inlaid gold divider frame around the 8x8 active tile zone
    const frameInner = 8.04;
    const frameOuter = 8.16;
    const frameShape = new THREE.Shape();
    frameShape.moveTo(-frameOuter / 2, -frameOuter / 2);
    frameShape.lineTo(frameOuter / 2, -frameOuter / 2);
    frameShape.lineTo(frameOuter / 2, frameOuter / 2);
    frameShape.lineTo(-frameOuter / 2, frameOuter / 2);
    frameShape.closePath();

    const hole = new THREE.Path();
    hole.moveTo(-frameInner / 2, -frameInner / 2);
    hole.lineTo(-frameInner / 2, frameInner / 2);
    hole.lineTo(frameInner / 2, frameInner / 2);
    hole.lineTo(frameInner / 2, -frameInner / 2);
    hole.closePath();
    frameShape.holes.push(hole);

    const frameGeom = new THREE.ExtrudeGeometry(frameShape, {
      depth: 0.06,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.02,
      bevelThickness: 0.02,
    });
    frameGeom.rotateX(Math.PI / 2);
    const frameMesh = new THREE.Mesh(frameGeom, this.goldBorderMat);
    frameMesh.position.y = 0.04;
    this.group.add(frameMesh);
  }

  private buildTiles() {
    const tileSize = 1.0;
    const tileHeight = 0.06;

    for (let rank = 1; rank <= 8; rank++) {
      for (let f = 0; f < 8; f++) {
        const file = String.fromCharCode('a'.charCodeAt(0) + f);
        const square = `${file}${rank}`;
        const isDark = (f + rank) % 2 === 0;

        // Position: X from -3.5 to +3.5, Z from +3.5 to -3.5
        const posX = (f - 3.5) * tileSize;
        const posZ = (4.5 - rank) * tileSize;

        // Tile with slight bevel to give realistic gaps and stone edges
        const tileGeom = new THREE.BoxGeometry(0.97, tileHeight, 0.97);
        const mat = isDark ? this.darkTileMat : this.lightTileMat;
        const tileMesh = new THREE.Mesh(tileGeom, mat);

        tileMesh.position.set(posX, tileHeight / 2, posZ);
        tileMesh.receiveShadow = true;
        tileMesh.userData = { square, file, rank, isTile: true };

        this.group.add(tileMesh);
        this.tileMeshes.set(square, tileMesh);

        // Store piece center position (Y = tileHeight)
        this.squareCoords.set(square, new THREE.Vector3(posX, tileHeight, posZ));
      }
    }
  }

  private buildCoordinatesBorder() {
    // Generate clean canvas texture for coordinates on border
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, 1024, 1024);
    ctx.fillStyle = '#d4af37'; // Royal gold
    ctx.font = 'bold 36px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Letters A-H along bottom & top
    const files = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    for (let i = 0; i < 8; i++) {
      const x = 112 + i * 114;
      // Bottom side
      ctx.fillText(files[i], x, 980);
      // Top side
      ctx.fillText(files[i], x, 44);
    }

    // Numbers 1-8 along left & right
    for (let i = 1; i <= 8; i++) {
      const y = 980 - (i - 1) * 128;
      // Left side
      ctx.fillText(i.toString(), 44, y);
      // Right side
      ctx.fillText(i.toString(), 980, y);
    }

    const coordTexture = new THREE.CanvasTexture(canvas);
    coordTexture.colorSpace = THREE.SRGBColorSpace;

    const coordGeom = new THREE.PlaneGeometry(9.1, 9.1);
    coordGeom.rotateX(-Math.PI / 2);
    const coordMat = new THREE.MeshBasicMaterial({
      map: coordTexture,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });

    const coordMesh = new THREE.Mesh(coordGeom, coordMat);
    coordMesh.position.y = 0.055;
    this.group.add(coordMesh);
  }

  public getSquarePosition(square: string): THREE.Vector3 | null {
    const pos = this.squareCoords.get(square);
    return pos ? pos.clone() : null;
  }

  private initHighlightMaterials() {
    this.emptyMoveGeom = new THREE.PlaneGeometry(0.88, 0.88);
    this.emptyMoveGeom.rotateX(-Math.PI / 2);

    this.captureMoveGeom = new THREE.PlaneGeometry(0.97, 0.97);
    this.captureMoveGeom.rotateX(-Math.PI / 2);

    // Shared high-res dotted circle texture for empty squares
    const emptyTexture = this.createDottedCircleTexture();
    this.dottedEmptyMat = new THREE.MeshBasicMaterial({
      map: emptyTexture,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });

    // Shared high-res dotted capture ring texture for opponent pieces
    const captureTexture = this.createDottedCaptureRingTexture();
    this.dottedCaptureMat = new THREE.MeshBasicMaterial({
      map: captureTexture,
      transparent: true,
      opacity: 0.98,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
  }

  private createDottedCircleTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, 256, 256);

    const cx = 128;
    const cy = 128;
    const radius = 64; // Centered dotted ring
    const dotCount = 14;

    // 1. Soft glowing inner aura
    const innerGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 0.9);
    innerGrad.addColorStop(0, 'rgba(235, 215, 130, 0.38)');
    innerGrad.addColorStop(0.5, 'rgba(212, 175, 55, 0.16)');
    innerGrad.addColorStop(1, 'rgba(212, 175, 55, 0)');
    ctx.fillStyle = innerGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.9, 0, Math.PI * 2);
    ctx.fill();

    // 2. Translucent center target dot
    ctx.fillStyle = 'rgba(248, 230, 160, 0.72)';
    ctx.beginPath();
    ctx.arc(cx, cy, 11, 0, Math.PI * 2);
    ctx.fill();

    // 3. Crisp dotted circle perimeter
    ctx.fillStyle = 'rgba(240, 218, 128, 0.95)';
    ctx.shadowColor = 'rgba(212, 175, 55, 0.8)';
    ctx.shadowBlur = 6;
    const dotRadius = 5.5;

    for (let i = 0; i < dotCount; i++) {
      const angle = (i * Math.PI * 2) / dotCount;
      const x = cx + Math.cos(angle) * radius;
      const y = cy + Math.sin(angle) * radius;
      ctx.beginPath();
      ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    return texture;
  }

  private createDottedCaptureRingTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, 512, 512);

    const cx = 256;
    const cy = 256;
    const radius = 210; // Encircles piece base
    const dotCount = 24;

    // 1. Soft radial threat glow under piece
    const threatGrad = ctx.createRadialGradient(cx, cy, radius * 0.7, cx, cy, radius * 1.15);
    threatGrad.addColorStop(0, 'rgba(239, 68, 68, 0)');
    threatGrad.addColorStop(0.75, 'rgba(239, 68, 68, 0.22)');
    threatGrad.addColorStop(1, 'rgba(239, 68, 68, 0)');
    ctx.fillStyle = threatGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.15, 0, Math.PI * 2);
    ctx.fill();

    // 2. Concentric hairline dashed accent ring
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.65)';
    ctx.lineWidth = 4;
    ctx.setLineDash([16, 12]);
    ctx.beginPath();
    ctx.arc(cx, cy, radius - 16, 0, Math.PI * 2);
    ctx.stroke();

    // 3. Bold Dotted Ring with 24 crimson & gold pearl dots
    ctx.shadowColor = 'rgba(239, 68, 68, 0.9)';
    ctx.shadowBlur = 10;
    const dotRadius = 9;

    for (let i = 0; i < dotCount; i++) {
      const angle = (i * Math.PI * 2) / dotCount;
      const x = cx + Math.cos(angle) * radius;
      const y = cy + Math.sin(angle) * radius;

      // Alternate crimson alert with bright amber accent
      ctx.fillStyle = i % 2 === 0 ? 'rgba(244, 63, 94, 0.98)' : 'rgba(251, 191, 36, 0.98)';
      ctx.beginPath();
      ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    // 4. Four corner targeting notch brackets
    ctx.shadowBlur = 4;
    ctx.strokeStyle = 'rgba(244, 63, 94, 0.85)';
    ctx.lineWidth = 5;
    ctx.setLineDash([]);
    const bracketSize = 28;
    const margin = 20;

    // Top-left
    ctx.beginPath();
    ctx.moveTo(margin + bracketSize, margin);
    ctx.lineTo(margin, margin);
    ctx.lineTo(margin, margin + bracketSize);
    ctx.stroke();

    // Top-right
    ctx.beginPath();
    ctx.moveTo(512 - margin - bracketSize, margin);
    ctx.lineTo(512 - margin, margin);
    ctx.lineTo(512 - margin, margin + bracketSize);
    ctx.stroke();

    // Bottom-left
    ctx.beginPath();
    ctx.moveTo(margin, 512 - margin - bracketSize);
    ctx.lineTo(margin, 512 - margin);
    ctx.lineTo(margin + bracketSize, 512 - margin);
    ctx.stroke();

    // Bottom-right
    ctx.beginPath();
    ctx.moveTo(512 - margin - bracketSize, 512 - margin);
    ctx.lineTo(512 - margin, 512 - margin);
    ctx.lineTo(512 - margin, 512 - margin - bracketSize);
    ctx.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    return texture;
  }

  // Visual Highlighting APIs
  public setSelectedSquare(square: string | null) {
    if (this.selectedSquareMesh) {
      this.highlightGroup.remove(this.selectedSquareMesh);
      this.selectedSquareMesh.traverse(child => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material?.dispose();
          }
        }
      });
      this.selectedSquareMesh = null;
    }

    if (!square) return;

    const pos = this.getSquarePosition(square);
    if (!pos) return;

    const group = new THREE.Group();

    // 1. Soft glowing gold surface fill
    const fillGeom = new THREE.PlaneGeometry(0.96, 0.96);
    fillGeom.rotateX(-Math.PI / 2);
    const fillMat = new THREE.MeshBasicMaterial({
      color: 0xd4af37,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const fillMesh = new THREE.Mesh(fillGeom, fillMat);
    fillMesh.position.set(pos.x, pos.y + 0.012, pos.z);
    group.add(fillMesh);

    // 2. Elegant glowing gold perimeter frame
    const ringShape = new THREE.Shape();
    const s = 0.98;
    const w = 0.055;
    ringShape.moveTo(-s / 2, -s / 2);
    ringShape.lineTo(s / 2, -s / 2);
    ringShape.lineTo(s / 2, s / 2);
    ringShape.lineTo(-s / 2, s / 2);
    ringShape.closePath();

    const hole = new THREE.Path();
    hole.moveTo(-(s / 2 - w), -(s / 2 - w));
    hole.lineTo(-(s / 2 - w), s / 2 - w);
    hole.lineTo(s / 2 - w, s / 2 - w);
    hole.lineTo(s / 2 - w, -(s / 2 - w));
    hole.closePath();
    ringShape.holes.push(hole);

    const borderGeom = new THREE.ShapeGeometry(ringShape);
    borderGeom.rotateX(-Math.PI / 2);

    const borderMat = new THREE.MeshBasicMaterial({
      color: 0xffdf6d,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });

    const borderMesh = new THREE.Mesh(borderGeom, borderMat);
    borderMesh.position.set(pos.x, pos.y + 0.015, pos.z);
    group.add(borderMesh);

    this.selectedSquareMesh = group as unknown as THREE.Mesh;
    this.highlightGroup.add(group);
  }

  public setLegalMoves(squares: string[], hasCapture: (sq: string) => boolean) {
    // Clear old destination markers
    this.destinationMarkers.forEach(m => {
      this.highlightGroup.remove(m);
    });
    this.destinationMarkers = [];

    squares.forEach(sq => {
      const pos = this.getSquarePosition(sq);
      if (!pos) return;

      const isCapture = hasCapture(sq);

      if (isCapture) {
        // Larger dotted circular capture ring around the opponent piece
        const marker = new THREE.Mesh(this.captureMoveGeom, this.dottedCaptureMat);
        marker.position.set(pos.x, pos.y + 0.02, pos.z);
        this.highlightGroup.add(marker);
        this.destinationMarkers.push(marker);
      } else {
        // Small semi-transparent dotted circle centered on empty square
        const marker = new THREE.Mesh(this.emptyMoveGeom, this.dottedEmptyMat);
        marker.position.set(pos.x, pos.y + 0.02, pos.z);
        this.highlightGroup.add(marker);
        this.destinationMarkers.push(marker);
      }
    });
  }

  public setLastMove(from: string | null, to: string | null) {
    if (this.lastMoveOriginMesh) {
      this.highlightGroup.remove(this.lastMoveOriginMesh);
      this.lastMoveOriginMesh.geometry.dispose();
      (this.lastMoveOriginMesh.material as THREE.Material).dispose();
      this.lastMoveOriginMesh = null;
    }
    if (this.lastMoveDestMesh) {
      this.highlightGroup.remove(this.lastMoveDestMesh);
      this.lastMoveDestMesh.geometry.dispose();
      (this.lastMoveDestMesh.material as THREE.Material).dispose();
      this.lastMoveDestMesh = null;
    }

    if (!from || !to) return;

    const fromPos = this.getSquarePosition(from);
    const toPos = this.getSquarePosition(to);

    const makeHighlight = (pos: THREE.Vector3, color: number) => {
      const geom = new THREE.PlaneGeometry(0.95, 0.95);
      geom.rotateX(-Math.PI / 2);
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(pos.x, pos.y + 0.01, pos.z);
      return mesh;
    };

    if (fromPos) {
      this.lastMoveOriginMesh = makeHighlight(fromPos, 0xd4af37);
      this.highlightGroup.add(this.lastMoveOriginMesh);
    }
    if (toPos) {
      this.lastMoveDestMesh = makeHighlight(toPos, 0xd4af37);
      this.highlightGroup.add(this.lastMoveDestMesh);
    }
  }

  public setCheckIndicator(kingSquare: string | null) {
    if (this.checkIndicatorMesh) {
      this.highlightGroup.remove(this.checkIndicatorMesh);
      this.checkIndicatorMesh.geometry.dispose();
      (this.checkIndicatorMesh.material as THREE.Material).dispose();
      this.checkIndicatorMesh = null;
    }

    if (!kingSquare) return;
    const pos = this.getSquarePosition(kingSquare);
    if (!pos) return;

    // Glowing crimson danger square
    const geom = new THREE.PlaneGeometry(0.96, 0.96);
    geom.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xdc2626,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    this.checkIndicatorMesh = new THREE.Mesh(geom, mat);
    this.checkIndicatorMesh.position.set(pos.x, pos.y + 0.012, pos.z);
    this.highlightGroup.add(this.checkIndicatorMesh);
  }

  public clearHighlights() {
    this.setSelectedSquare(null);
    this.setLegalMoves([], () => false);
  }
}
