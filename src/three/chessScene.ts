import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { DestructionStyle, GraphicsQuality, PieceColor, PieceType } from '../types/chess';
import { sound } from '../audio/soundEffects';
import { BoardManager } from './boardManager';
import { createChessPieceModel } from './pieceFactory';
import { DestructionSystem } from './destructionSystem';

export interface SceneCallbacks {
  onSquareClick: (square: string) => void;
  onSquareHover?: (square: string | null) => void;
  onAnimationStateChange?: (isAnimating: boolean) => void;
}

export class ChessSceneManager {
  private container: HTMLElement;
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  public controls: OrbitControls;
  public boardManager: BoardManager;
  public destructionSystem: DestructionSystem;

  // Active pieces on the board: Map<square, THREE.Group>
  public pieces: Map<string, THREE.Group> = new Map();

  // Animation state
  private isAnimating = false;
  private animQueue: Array<() => Promise<void>> = [];
  private clock = new THREE.Clock();
  private frameId: number = 0;
  private isDisposed = false;

  // Raycasting & Interaction
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private callbacks: SceneCallbacks;

  // Camera transition state
  private targetCameraPos: THREE.Vector3 | null = null;
  private targetCameraLookAt: THREE.Vector3 | null = null;

  // Quality settings
  public quality: GraphicsQuality = 'high';
  public destructionStyle: DestructionStyle = 'shatter';
  public isSoftwareGl = false;

  constructor(container: HTMLElement, callbacks: SceneCallbacks) {
    this.container = container;
    this.callbacks = callbacks;

    // 1. Detect software WebGL
    this.isSoftwareGl = (() => {
      try {
        const gl = document.createElement('canvas').getContext('webgl2');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return false;
      }
    })();

    // 2. Initialize Three.js Scene & Renderer
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0d14); // Royal dark obsidian void
    this.scene.fog = new THREE.FogExp2(0x0a0d14, 0.022);

    this.camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.1,
      100
    );
    this.camera.position.set(0, 10.2, 10.8);

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2)
    );
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.appendChild(this.renderer.domElement);

    // 3. Procedural Studio Environment for realistic metallic and ivory reflections
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    // 4. OrbitControls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = !this.isSoftwareGl;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = 5.5;
    this.controls.maxDistance = 20.0;
    this.controls.maxPolarAngle = Math.PI / 2.05; // Prevent viewing underneath
    this.controls.target.set(0, 0, 0);

    // 5. Setup Lighting Rig
    this.setupLighting();

    // 6. Board & Destruction Systems
    this.boardManager = new BoardManager();
    this.scene.add(this.boardManager.group);

    this.destructionSystem = new DestructionSystem(this.scene);

    // 7. Event Listeners
    this.setupEventListeners();

    // 8. Start Animation Loop
    this.animate();
  }

  private setupLighting() {
    // Warm key directional light with soft shadows
    const keyLight = new THREE.DirectionalLight(0xfff5ea, 2.2);
    keyLight.position.set(6, 12, 8);
    keyLight.castShadow = !this.isSoftwareGl;
    if (keyLight.castShadow) {
      keyLight.shadow.mapSize.width = 2048;
      keyLight.shadow.mapSize.height = 2048;
      keyLight.shadow.camera.near = 0.5;
      keyLight.shadow.camera.far = 30;
      const d = 6.5;
      keyLight.shadow.camera.left = -d;
      keyLight.shadow.camera.right = d;
      keyLight.shadow.camera.top = d;
      keyLight.shadow.camera.bottom = -d;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
    }
    this.scene.add(keyLight);

    // Cool fill light for balanced ambient depth
    const hemiLight = new THREE.HemisphereLight(0x4a658a, 0x111622, 1.1);
    this.scene.add(hemiLight);

    // Rim/Backlight to carve out sharp silhouettes of obsidian pieces
    const rimLight = new THREE.DirectionalLight(0x7090c0, 1.4);
    rimLight.position.set(-8, 9, -10);
    this.scene.add(rimLight);

    // Subtle golden under-glow for royal citadel mood
    const underLight = new THREE.PointLight(0xd4af37, 1.0, 15, 2);
    underLight.position.set(0, -0.6, 0);
    this.scene.add(underLight);
  }

  public setupPiecesFromFEN(fen: string) {
    // Clear existing pieces
    this.pieces.forEach(mesh => {
      this.scene.remove(mesh);
      mesh.traverse(child => {
        if (child instanceof THREE.Mesh) {
          child.geometry?.dispose();
        }
      });
    });
    this.pieces.clear();

    const [positionPart] = fen.split(' ');
    const ranks = positionPart.split('/');

    for (let r = 0; r < 8; r++) {
      const rankStr = ranks[r];
      const rankNum = 8 - r;
      let fileIdx = 0;

      for (let i = 0; i < rankStr.length; i++) {
        const char = rankStr[i];
        if (char >= '1' && char <= '8') {
          fileIdx += parseInt(char, 10);
        } else {
          const fileChar = String.fromCharCode('a'.charCodeAt(0) + fileIdx);
          const square = `${fileChar}${rankNum}`;
          const isWhite = char === char.toUpperCase();
          const color: PieceColor = isWhite ? 'w' : 'b';
          const type = char.toLowerCase() as PieceType;

          const pieceMesh = createChessPieceModel(type, color);
          const pos = this.boardManager.getSquarePosition(square);
          if (pos) {
            pieceMesh.position.copy(pos);
            pieceMesh.userData = { square, pieceType: type, pieceColor: color };
            this.scene.add(pieceMesh);
            this.pieces.set(square, pieceMesh);
          }

          fileIdx++;
        }
      }
    }
  }

  public animateMove(
    from: string,
    to: string,
    captured: PieceType | undefined,
    promotionPiece?: PieceType
  ): Promise<void> {
    return new Promise(resolve => {
      this.setAnimating(true);
      const pieceMesh = this.pieces.get(from);
      if (!pieceMesh) {
        this.setAnimating(false);
        resolve();
        return;
      }

      const fromPos = this.boardManager.getSquarePosition(from)!;
      const toPos = this.boardManager.getSquarePosition(to)!;
      const victimMesh = this.pieces.get(to);

      // Remove from map under old key
      this.pieces.delete(from);

      const duration = 0.38; // fast, responsive movement
      let elapsed = 0;

      const startPos = fromPos.clone();
      const endPos = toPos.clone();

      // Peak arc height based on move distance
      const distance = startPos.distanceTo(endPos);
      const peakHeight = Math.min(1.4, 0.4 + distance * 0.15);

      const animStep = () => {
        const delta = Math.min(0.04, this.clock.getDelta());
        elapsed += delta;
        const t = Math.min(1.0, elapsed / duration);

        // Smooth easeInOutQuad
        const easeT = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

        // Quadratic Bezier interpolation for natural physical arc
        const midY = Math.max(startPos.y, endPos.y) + peakHeight;
        const currentX = (1 - easeT) * (1 - easeT) * startPos.x + 2 * (1 - easeT) * easeT * ((startPos.x + endPos.x) / 2) + easeT * easeT * endPos.x;
        const currentY = (1 - easeT) * (1 - easeT) * startPos.y + 2 * (1 - easeT) * easeT * midY + easeT * easeT * endPos.y;
        const currentZ = (1 - easeT) * (1 - easeT) * startPos.z + 2 * (1 - easeT) * easeT * ((startPos.z + endPos.z) / 2) + easeT * easeT * endPos.z;

        pieceMesh.position.set(currentX, currentY, currentZ);

        // Slight dynamic bank tilt in direction of movement
        const dirX = endPos.x - startPos.x;
        const dirZ = endPos.z - startPos.z;
        const tiltFactor = Math.sin(t * Math.PI) * 0.12;
        pieceMesh.rotation.z = -dirX * tiltFactor * 0.2;
        pieceMesh.rotation.x = dirZ * tiltFactor * 0.2;

        if (t < 1.0) {
          requestAnimationFrame(animStep);
        } else {
          // Final landing position
          pieceMesh.position.copy(endPos);
          pieceMesh.rotation.x = 0;
          pieceMesh.rotation.z = 0;
          pieceMesh.userData.square = to;

          // If capture: trigger destruction!
          if (captured && victimMesh) {
            const victimColor = (victimMesh.userData.pieceColor as PieceColor) || (pieceMesh.userData.pieceColor === 'w' ? 'b' : 'w');
            this.scene.remove(victimMesh);
            this.pieces.delete(to);

            // Audio & 3D Destruction Physics
            sound.playCapture();
            this.destructionSystem.triggerDestruction(
              toPos,
              captured,
              victimColor,
              this.destructionStyle,
              this.quality
            );
          } else {
            sound.playMove();
          }

          // Handle pawn promotion visual model replacement
          if (promotionPiece) {
            this.scene.remove(pieceMesh);
            const promotedColor = pieceMesh.userData.pieceColor as PieceColor;
            const newModel = createChessPieceModel(promotionPiece, promotedColor);
            newModel.position.copy(endPos);
            newModel.userData = { square: to, pieceType: promotionPiece, pieceColor: promotedColor };
            this.scene.add(newModel);
            this.pieces.set(to, newModel);
          } else {
            this.pieces.set(to, pieceMesh);
          }

          this.setAnimating(false);
          resolve();
        }
      };

      requestAnimationFrame(animStep);
    });
  }

  // Camera preset views
  public resetCamera() {
    this.targetCameraPos = new THREE.Vector3(0, 10.2, 10.8);
    this.targetCameraLookAt = new THREE.Vector3(0, 0, 0);
  }

  public flipCamera(isBlackView: boolean) {
    if (isBlackView) {
      this.targetCameraPos = new THREE.Vector3(0, 10.2, -10.8);
    } else {
      this.targetCameraPos = new THREE.Vector3(0, 10.2, 10.8);
    }
    this.targetCameraLookAt = new THREE.Vector3(0, 0, 0);
  }

  public setQuality(quality: GraphicsQuality) {
    this.quality = quality;
    if (quality === 'performance') {
      this.renderer.shadowMap.enabled = false;
      this.renderer.setPixelRatio(1);
    } else {
      this.renderer.shadowMap.enabled = !this.isSoftwareGl;
      this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    }
  }

  private setAnimating(val: boolean) {
    this.isAnimating = val;
    this.callbacks.onAnimationStateChange?.(val);
  }

  private setupEventListeners() {
    const el = this.renderer.domElement;

    // Pointer move for hover raycast
    el.addEventListener('pointermove', this.onPointerMove);
    // Click for selection
    el.addEventListener('pointerdown', this.onPointerDown);
    // Window resize
    window.addEventListener('resize', this.onWindowResize);
  }

  private onPointerDown = (event: PointerEvent) => {
    if (this.isAnimating) return;
    if (event.button !== 0) return; // Left click only

    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);

    // Raycast against pieces first
    const pieceMeshes: THREE.Object3D[] = [];
    this.pieces.forEach(group => {
      pieceMeshes.push(group);
    });

    const pieceHits = this.raycaster.intersectObjects(pieceMeshes, true);
    if (pieceHits.length > 0) {
      let topObj: THREE.Object3D | null = pieceHits[0].object;
      while (topObj && !topObj.userData?.square && topObj.parent !== this.scene) {
        topObj = topObj.parent;
      }
      if (topObj && topObj.userData?.square) {
        this.callbacks.onSquareClick(topObj.userData.square);
        return;
      }
    }

    // Otherwise raycast against board tiles
    const tileMeshes = Array.from(this.boardManager.tileMeshes.values());
    const tileHits = this.raycaster.intersectObjects(tileMeshes, false);
    if (tileHits.length > 0) {
      const hitTile = tileHits[0].object as THREE.Mesh;
      if (hitTile.userData?.square) {
        this.callbacks.onSquareClick(hitTile.userData.square);
      }
    }
  };

  private onPointerMove = (event: PointerEvent) => {
    if (this.isAnimating) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const tileMeshes = Array.from(this.boardManager.tileMeshes.values());
    const tileHits = this.raycaster.intersectObjects(tileMeshes, false);

    if (tileHits.length > 0) {
      const hitTile = tileHits[0].object as THREE.Mesh;
      this.callbacks.onSquareHover?.(hitTile.userData?.square || null);
    } else {
      this.callbacks.onSquareHover?.(null);
    }
  };

  private onWindowResize = () => {
    if (!this.container || this.isDisposed) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  private animate = () => {
    if (this.isDisposed) return;
    this.frameId = requestAnimationFrame(this.animate);

    const delta = this.clock.getDelta();

    // 1. Smooth camera interpolation if transitioning
    if (this.targetCameraPos) {
      this.camera.position.lerp(this.targetCameraPos, 0.08);
      if (this.camera.position.distanceTo(this.targetCameraPos) < 0.05) {
        this.camera.position.copy(this.targetCameraPos);
        this.targetCameraPos = null;
      }
    }
    if (this.targetCameraLookAt) {
      this.controls.target.lerp(this.targetCameraLookAt, 0.08);
      if (this.controls.target.distanceTo(this.targetCameraLookAt) < 0.05) {
        this.controls.target.copy(this.targetCameraLookAt);
        this.targetCameraLookAt = null;
      }
    }

    // 2. Update controls
    this.controls.update();

    // 3. Update destruction physics and fragments
    this.destructionSystem.update(delta);

    // 4. Render
    this.renderer.render(this.scene, this.camera);
  };

  public dispose() {
    this.isDisposed = true;
    cancelAnimationFrame(this.frameId);

    window.removeEventListener('resize', this.onWindowResize);
    this.renderer.domElement.removeEventListener('pointermove', this.onPointerMove);
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown);

    this.destructionSystem.dispose();
    this.controls.dispose();

    this.pieces.forEach(mesh => {
      this.scene.remove(mesh);
      mesh.traverse(child => {
        if (child instanceof THREE.Mesh) {
          child.geometry?.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material?.dispose();
          }
        }
      });
    });
    this.pieces.clear();

    this.renderer.dispose();
    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }
  }
}
