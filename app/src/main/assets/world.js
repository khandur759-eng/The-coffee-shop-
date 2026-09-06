/* Original café/character concept retained; scene resources now have an explicit lifecycle. */
(function (root) {
  'use strict';

  class CoffeeWorld {
    constructor(canvas, labelLayer, engine, onTable) {
      if (!root.THREE) throw new Error('The bundled 3D library could not be loaded.');
      this.T = root.THREE;
      this.canvas = canvas;
      this.labelLayer = labelLayer;
      this.engine = engine;
      this.onTable = onTable;

      canvas.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        console.warn('WebGL context lost handled gracefully.');
      }, false);

      canvas.addEventListener('webglcontextrestored', () => {
        console.info('WebGL context restored, reinitializing scene...');
        try {
          this.build();
        } catch (err) {
          console.error('Error rebuilding scene after context restore:', err);
        }
      }, false);

      try {
        this.renderer = new this.T.WebGLRenderer({
          canvas,
          antialias: false,
          alpha: false,
          powerPreference: 'default',
          failIfMajorPerformanceCaveat: false,
          precision: 'mediump'
        });
      } catch (err) {
        console.warn('WebGL default renderer fallback:', err);
        this.renderer = new this.T.WebGLRenderer({ canvas, antialias: false });
      }

      if (this.T.SRGBColorSpace) this.renderer.outputColorSpace = this.T.SRGBColorSpace;
      this.renderer.toneMapping = this.T.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.2;
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = this.T.BasicShadowMap;

      this.camera = new this.T.OrthographicCamera(-14, 14, 10, -10, 0.1, 100);
      this.raycaster = new this.T.Raycaster();
      this.pointer = new this.T.Vector2();
      this.projected = new this.T.Vector3();

      this.characters = new Map();
      this.time = 0;
      this.materials = new Map();
      this.labels = [];
      this.tableMeshes = [];
      this.floors = [];
      this.rackCups = [];
      this.steam = [];
      this.build();
    }

    material(color, roughness = 0.75, metalness = 0.04) {
      const key = `${color}/${roughness}/${metalness}`;
      if (!this.materials.has(key)) {
        this.materials.set(key, new this.T.MeshStandardMaterial({ color, roughness, metalness }));
      }
      return this.materials.get(key);
    }

    mesh(geometry, material, x, y, z, parent = this.scene, cast = true) {
      const m = new this.T.Mesh(geometry, material);
      m.position.set(x, y, z);
      m.castShadow = cast;
      m.receiveShadow = true;
      parent.add(m);
      return m;
    }

    box(x, y, z, w, h, d, color, parent, cast = true) {
      return this.mesh(
        new this.T.BoxGeometry(w, h, d),
        typeof color === 'number' ? this.material(color) : color,
        x, y, z, parent, cast
      );
    }

    cylinder(x, y, z, r, h, color, parent, segments = 16) {
      return this.mesh(
        new this.T.CylinderGeometry(r, r, h, segments),
        typeof color === 'number' ? this.material(color) : color,
        x, y, z, parent
      );
    }

    texture(width, height, draw) {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      draw(canvas.getContext('2d'), width, height);
      const texture = new this.T.CanvasTexture(canvas);
      if (this.T.SRGBColorSpace) texture.colorSpace = this.T.SRGBColorSpace;
      return texture;
    }

    makeFloor() {
      const texture = this.texture(512, 512, (ctx) => {
        ctx.fillStyle = '#916648';
        ctx.fillRect(0, 0, 512, 512);
        const shades = ['#8c6144', '#93694b', '#9a7050', '#885e43', '#a07552'];
        for (let row = 0; row < 16; row++) {
          ctx.fillStyle = shades[row % shades.length];
          ctx.fillRect(0, row * 32, 512, 31);
          ctx.fillStyle = '#644a37';
          ctx.fillRect((row % 3) * 170 + 24, row * 32, 1, 32);
          ctx.fillStyle = 'rgba(255,227,184,.07)';
          ctx.fillRect(0, row * 32 + 3, 512, 1);
        }
      });
      texture.wrapS = texture.wrapT = this.T.RepeatWrapping;
      texture.repeat.set(2, 2);
      const material = new this.T.MeshStandardMaterial({ map: texture, roughness: 0.82 });
      const floor = this.box(0, -0.11, 0, 22, 0.22, 15, material, undefined, false);
      floor.name = 'floor';
      this.floors = [floor];
      this.box(0, -0.5, 0, 22.35, 0.6, 15.3, 0x292c2b);

      if (this.engine.save.up.expansion) {
        const annex = this.box(0, -0.1, 8.3, 22, 0.2, 3.7, material, undefined, false);
        annex.name = 'annex';
        this.floors.push(annex);
        this.box(0, -0.48, 8.3, 22.35, 0.6, 3.9, 0x292c2b);
        this.box(0, 0.05, 6.55, 22, 0.08, 0.1, 0xd5b78b, undefined, false);
      }
    }

    makeWindows() {
      const T = this.T;
      this.box(0, 0.9, -7.45, 22, 1.8, 0.3, 0x314c48);
      this.box(0, 5.25, -7.45, 22, 0.55, 0.32, 0x29413f);
      this.box(0, 1.8, -7.19, 22, 0.12, 0.35, 0xcba679);
      this.box(0, 3, -13, 32, 16, 0.1, 0x192d3f, undefined, false);
      for (let i = 0; i < 6; i++) {
        const x = -10.5 + i * 4.2;
        this.box(x, 3.2, -7.45, 0.3, 3.7, 0.3, 0x29413f);
      }
      for (let i = 0; i < 5; i++) {
        const x = -8.4 + i * 4.2;
        const glass = new T.MeshStandardMaterial({
          color: 0x618294,
          transparent: true,
          opacity: 0.2,
          roughness: 0.25,
          depthWrite: false
        });
        this.box(x, 3.35, -7.43, 3.85, 2.9, 0.05, glass, undefined, false);
        this.box(x, 3.35, -7.21, 0.07, 2.95, 0.12, 0xc3a17b);
        this.box(x, 3.55, -7.21, 3.95, 0.07, 0.12, 0xc3a17b);
        this.box(x, 4.5, -11.5, 2.4, 7 + (i % 3), 0.9, 0x233a4b, undefined, false);
        for (let j = 0; j < 3; j++) {
          this.box(x + 0.5, 2.7 + j * 1.5, -10.99, 0.32, 0.5, 0.04, j % 2 ? 0x425561 : 0x9c9570, undefined, false);
        }
      }

      // Low cutaway walls keep every playable corner visible
      this.box(-11, 0.55, 0, 0.22, 1.1, 15, 0x314c48);
      this.box(11, 0.55, 0, 0.22, 1.1, 15, 0x314c48);
      this.box(-11, 1.12, 0, 0.3, 0.12, 15, 0xc9a778);
      this.box(11, 1.12, 0, 0.3, 0.12, 15, 0xc9a778);

      const mat = new T.MeshBasicMaterial({ color: 0xd1e5ed, transparent: true, opacity: 0.16 });
      this.box(-10.75, 2, 0, 0.08, 3.8, 2.5, mat, undefined, false);
      this.box(-10.7, 3.9, 0, 0.2, 0.13, 2.6, 0xbf9c72);
      const rug = this.box(-9.4, 0.02, 0, 1.5, 0.035, 2.4, 0x414e49, undefined, false);
      rug.name = 'welcome-mat';
    }

    sign(text, x, y, z, w, h, dark = false) {
      const map = this.texture(768, 160, (ctx, width, height) => {
        ctx.fillStyle = dark ? '#223a35' : '#efddbb';
        ctx.fillRect(0, 0, width, height);
        ctx.strokeStyle = dark ? '#c0a478' : '#ab8355';
        ctx.lineWidth = 4;
        ctx.strokeRect(12, 12, width - 24, height - 24);
        ctx.fillStyle = dark ? '#ead6ac' : '#29433d';
        ctx.font = 'bold 44px Georgia';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, width / 2, height / 2);
      });
      const material = new this.T.MeshBasicMaterial({ map });
      return this.box(x, y, z, w, h, 0.075, material, undefined, false);
    }

    makeCounter() {
      this.box(5.6, 0.95, -4.9, 7.2, 1.9, 1.3, 0x304a43);
      for (let x = 2.3; x < 9; x += 0.3) {
        this.box(x, 0.98, -4.235, 0.045, 1.65, 0.06, 0x5a6d55);
      }
      this.box(5.6, 1.98, -4.9, 7.45, 0.16, 1.5, 0xe0cda8);
      const tier = this.engine.save.up.machine;
      this.box(2.5, 2.4, -4.95, 1.9, 0.74, 0.85, tier ? 0x4b6860 : 0x332f2b);
      this.box(2.5, 2.87, -5, 1.7, 0.22, 0.72, this.material(tier > 1 ? 0xceaa69 : 0xa38f73, 0.35, 0.6));
      this.box(2.5, 2.13, -4.37, 1.7, 0.08, 0.4, 0x303836);
      for (let i = 0; i < 2 + (tier === 3 ? 1 : 0); i++) {
        this.cylinder(2.06 + i * 0.44, 2.46, -4.44, 0.09, 0.15, 0xbfa06e);
        this.box(2.09 + i * 0.44, 2.52, -4.24, 0.14, 0.08, 0.28, 0x28332f);
      }
      this.cylinder(4.13, 2.45, -4.93, 0.25, 0.74, 0x674632);
      this.cylinder(4.13, 2.86, -4.93, 0.28, 0.12, 0xcbb082);
      this.box(7.5, 2.04, -4.9, 1.24, 0.04, 0.85, 0x718582);
      this.cylinder(7.5, 2.4, -5.1, 0.035, 0.65, 0xc4b98c);
      this.box(7.5, 2.72, -4.94, 0.075, 0.065, 0.35, 0xc4b98c);
      this.sign('BREW  /  PICKUP', 5.8, 3.4, -6.92, 4.1, 0.85, true);
      this.sign('THE LAST COFFEE SHOP', -3.75, 4.9, -7.05, 9.2, 0.9);
      this.box(9.2, 0.7, 4.4, 1.7, 1.4, 1.2, 0x70543a);
      this.box(9.05, 1.48, 4.34, 0.65, 0.08, 0.78, 0xd7c39b);
      this.box(9.06, 1.53, 4.34, 0.07, 0.025, 0.78, 0x4d5e4d);
      this.rackCups = [];
      for (let i = 0; i < 3; i++) {
        const cup = this.makeCup(0.18);
        cup.position.set(5.12 + i * 0.48, 2.08, -4.56);
        this.scene.add(cup);
        this.rackCups.push(cup);
      }
    }

    makeCup(radius = 0.14) {
      const group = new this.T.Group();
      this.cylinder(0, radius, 0, radius, radius * 1.8, 0xf2e5cb, group, 12);
      this.cylinder(0, radius * 1.95, 0, radius * 0.8, 0.018, 0x543b29, group, 12);
      const handle = this.mesh(
        new this.T.TorusGeometry(radius * 0.65, radius * 0.22, 6, 10),
        this.material(0xf2e5cb),
        radius * 1.1, radius, 0, group
      );
      handle.rotation.y = Math.PI / 2;
      return group;
    }

    makeTable(table) {
      const g = new this.T.Group();
      g.position.set(table.x, 0, table.z);
      this.scene.add(g);
      this.cylinder(0, 1.24, 0, 1.17, 0.16, 0xb57b4c, g, 24);
      this.cylinder(0, 0.61, 0, 0.1, 1.2, 0x2e3a32, g);
      this.cylinder(0, 0.07, 0, 0.56, 0.12, 0x2e3a32, g);
      for (const [x, z] of [[1.62, 0], [-1.62, 0], [0, 1.62], [0, -1.62]]) {
        const chair = new this.T.Group();
        chair.position.set(x, 0, z);
        chair.rotation.y = Math.atan2(x, z);
        g.add(chair);
        this.box(0, 0.58, 0, 0.62, 0.14, 0.62, 0x5e7762, chair);
        this.box(0, 0.98, 0.29, 0.62, 0.65, 0.09, 0x5e7762, chair);
        for (const sx of [-0.24, 0.24]) {
          for (const sz of [-0.23, 0.23]) {
            this.box(sx, 0.27, sz, 0.05, 0.52, 0.05, 0x343c30, chair);
          }
        }
      }
      this.cylinder(0.25, 1.42, -0.18, 0.12, 0.21, 0xc5b084, g, 12);
      const leaf = this.mesh(new this.T.SphereGeometry(0.14, 6, 6), this.material(0x61805c), 0.25, 1.59, -0.18, g);
      leaf.scale.set(1, 1.6, 1);
      const dishes = new this.T.Group();
      dishes.position.set(-0.32, 1.33, 0.24);
      g.add(dishes);
      dishes.add(this.makeCup(0.17));
      this.tableMeshes.push({ table, dishes });

      const label = document.createElement('button');
      label.type = 'button';
      label.className = 'world-label';
      label.addEventListener('click', () => this.onTable(table.index));
      this.labelLayer.append(label);
      this.labels.push({ element: label, point: new this.T.Vector3(table.x, 2.7, table.z), table });
    }

    makePlant(x, z, size = 1) {
      const g = new this.T.Group();
      g.position.set(x, 0, z);
      g.scale.setScalar(size);
      this.scene.add(g);
      this.cylinder(0, 0.32, 0, 0.34, 0.64, 0xb77851, g);
      this.cylinder(0, 0.65, 0, 0.3, 0.02, 0x413f2c, g);
      for (let i = 0; i < 7; i++) {
        const angle = i * 2.4;
        const leaf = this.mesh(
          new this.T.SphereGeometry(0.38, 7, 6),
          this.material(i % 2 ? 0x557649 : 0x75905b),
          Math.cos(angle) * 0.25, 1.04 + (i % 3) * 0.16, Math.sin(angle) * 0.25, g
        );
        leaf.scale.set(0.4, 1.25, 0.62);
        leaf.rotation.z = Math.cos(angle) * 0.55;
      }
    }

    makeLamp(x, z) {
      this.cylinder(x, 4.75, z, 0.023, 1.7, 0x494535);
      const shade = this.mesh(
        new this.T.ConeGeometry(0.48, 0.34, 16, true),
        this.material(0xba995b, 0.45, 0.3),
        x, 3.83, z
      );
      shade.material.side = this.T.DoubleSide;
      const bulb = this.mesh(
        new this.T.SphereGeometry(0.11, 8, 6),
        new this.T.MeshBasicMaterial({ color: 0xffe0a4 }),
        x, 3.74, z, undefined, false
      );
      const glow = new this.T.PointLight(0xffbd73, 1.8, 8, 1.5);
      glow.position.copy(bulb.position);
      glow.castShadow = false;
      this.scene.add(glow);
    }

    makeCharacter(color, isPlayer = false) {
      const T = this.T, g = new T.Group();
      this.mesh(new T.CapsuleGeometry(0.3, 0.57, 4, 8), this.material(color), 0, 0.95, 0, g);
      this.mesh(new T.SphereGeometry(0.27, 10, 8), this.material(0xe3ae80), 0, 1.65, 0, g);
      this.mesh(new T.SphereGeometry(0.285, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), this.material(0x38302a), 0, 1.72, 0, g);
      this.box(-0.14, 0.24, 0, 0.2, 0.4, 0.24, 0x293932, g);
      this.box(0.14, 0.24, 0, 0.2, 0.4, 0.24, 0x293932, g);
      if (isPlayer) {
        this.box(0, 0.92, 0.285, 0.41, 0.55, 0.06, 0xf2e2c0, g);
        this.cylinder(0, 0.83, 0.58, 0.45, 0.055, 0xbd985d, g);
        g.userData.cups = [];
        for (let i = 0; i < 3; i++) {
          const cup = this.makeCup(0.105);
          cup.position.set((i - 1) * 0.25, 0.87, 0.58);
          g.add(cup);
          g.userData.cups.push(cup);
        }
      } else {
        const scarf = this.mesh(new T.TorusGeometry(0.27, 0.073, 6, 12), this.material(0xc9945d), 0, 1.42, 0, g);
        scarf.rotation.x = Math.PI / 2;
      }
      return g;
    }

    buildSnow() {
      const positions = new Float32Array(180 * 3);
      for (let i = 0; i < 180; i++) {
        positions[i * 3] = Math.random() * 28 - 14;
        positions[i * 3 + 1] = Math.random() * 8;
        positions[i * 3 + 2] = -7.8 - Math.random() * 3;
      }
      const geometry = new this.T.BufferGeometry();
      geometry.setAttribute('position', new this.T.BufferAttribute(positions, 3));
      this.snow = new this.T.Points(
        geometry,
        new this.T.PointsMaterial({ color: 0xd7e8f4, size: 0.09, transparent: true, opacity: 0.65, depthWrite: false })
      );
      this.scene.add(this.snow);

      this.steam = [];
      const material = new this.T.MeshBasicMaterial({ color: 0xffefdc, transparent: true, opacity: 0.28, depthWrite: false });
      for (let i = 0; i < 6; i++) {
        const puff = this.mesh(new this.T.SphereGeometry(0.055, 6, 6), material, 2.4, 2.9, -4.9, undefined, false);
        this.steam.push(puff);
      }
    }

    releaseScene() {
      if (!this.scene) return;
      const geometries = new Set(), materials = new Set(), textures = new Set();
      this.scene.traverse((o) => {
        if (o.geometry) geometries.add(o.geometry);
        if (o.material) {
          const list = Array.isArray(o.material) ? o.material : [o.material];
          list.forEach((m) => materials.add(m));
        }
        if (o.shadow) o.shadow.dispose();
      });
      for (const m of this.materials.values()) materials.add(m);
      for (const m of materials) {
        for (const value of Object.values(m)) {
          if (value && value.isTexture) textures.add(value);
        }
      }
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
      this.materials.clear();
      this.characters.clear();
      this.labelLayer.replaceChildren();
      this.labels = [];
      if (this.renderer && this.renderer.renderLists) {
        this.renderer.renderLists.dispose();
      }
    }

    build() {
      this.releaseScene();
      this.tableMeshes = [];
      const T = this.T;
      this.scene = new T.Scene();
      this.scene.background = new T.Color(0x1a2c31);

      const hemi = new T.HemisphereLight(0xffe8c6, 0x354545, 2.25);
      this.scene.add(hemi);

      const key = new T.DirectionalLight(0xffdbad, 2.5);
      key.position.set(-3, 14, 9);
      key.castShadow = true;
      key.shadow.mapSize.set(512, 512);
      key.shadow.camera.left = -14;
      key.shadow.camera.right = 14;
      key.shadow.camera.top = 15;
      key.shadow.camera.bottom = -12;
      this.scene.add(key);

      this.makeFloor();
      this.makeWindows();
      this.makeCounter();

      this.engine.world.tables.forEach((t) => this.makeTable(t));

      this.makePlant(-9.3, 5.3, 1.2);
      this.makePlant(9.7, -6.1, 1.35);
      for (let i = 0; i < (this.engine.save.up.decor || 0); i++) {
        this.makePlant(-3.6 + i * 2.2, -5.9, 1.15 + i * 0.12);
      }
      if (this.engine.save.up.expansion) {
        this.makePlant(-9.2, 8.3, 1.35);
        this.makePlant(9.6, 8.3, 1.2);
      }

      this.makeLamp(-6, -1.5);
      this.makeLamp(-1, 2.8);
      this.makeLamp(6, 1.8);

      this.player = this.makeCharacter(0xb56e46, true);
      this.scene.add(this.player);

      const ringMaterial = new T.MeshBasicMaterial({ color: 0xe7c080, transparent: true, opacity: 0.85, depthWrite: false });
      this.halo = this.mesh(new T.RingGeometry(0.46, 0.52, 32), ringMaterial, 1, 0.035, 5.5, undefined, false);
      this.halo.rotation.x = -Math.PI / 2;

      this.destination = this.mesh(new T.RingGeometry(0.2, 0.29, 24), ringMaterial, 0, 0.045, 0, undefined, false);
      this.destination.rotation.x = -Math.PI / 2;

      if (this.engine.save.up.staff) {
        const barista = this.makeCharacter(0x5c7f6a, true);
        barista.position.set(5, 0, -3.25);
        barista.userData.cups.forEach((c) => (c.visible = false));
        this.scene.add(barista);
      }
      if (this.engine.save.up.staff > 1) {
        const waiter = this.makeCharacter(0x516c7b, true);
        waiter.position.set(7.7, 0, -3.15);
        waiter.userData.cups.forEach((c) => (c.visible = false));
        this.scene.add(waiter);
      }

      this.buildSnow();
      this.setQuality();
      this.resize();
    }

    setQuality() {
      const quality = this.engine.save.quality || 'balanced';
      this.renderer.shadowMap.enabled = quality !== 'battery';
      const maxDpr = quality === 'high' ? 1.5 : quality === 'battery' ? 1.0 : 1.25;
      this.renderer.setPixelRatio(Math.min(root.devicePixelRatio || 1, maxDpr));
      if (this.snow) this.snow.visible = quality !== 'battery';
    }

    resize() {
      const r = this.canvas.getBoundingClientRect();
      this.canvasRect = r;
      const width = Math.max(1, r.width || window.innerWidth);
      const height = Math.max(1, r.height || window.innerHeight);
      const aspect = width / height;
      const baseSpan = this.engine.save.up.expansion ? 26 : 24;
      let viewWidth, viewHeight;
      if (aspect < 1.0) {
        // Mobile portrait orientation: ensure horizontal span comfortably fits the cafe
        viewWidth = baseSpan;
        viewHeight = baseSpan / aspect;
      } else {
        // Landscape orientation
        viewHeight = this.engine.save.up.expansion ? 18.5 : 16.5;
        viewWidth = viewHeight * aspect;
      }
      this.camera.left = -viewWidth / 2;
      this.camera.right = viewWidth / 2;
      this.camera.top = viewHeight / 2;
      this.camera.bottom = -viewHeight / 2;
      const centerZ = this.engine.save.up.expansion ? 1.6 : 0.4;
      this.camera.position.set(0, 23, 24 + centerZ);
      this.camera.lookAt(0, 1.25, centerZ);
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height, false);
      this.draw(0);
    }

    pick(clientX, clientY) {
      const r = (this.canvasRect && this.canvasRect.width > 0) ? this.canvasRect : this.canvas.getBoundingClientRect();
      this.canvasRect = r;
      if (r.width === 0 || r.height === 0) return null;
      this.pointer.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hits = this.raycaster.intersectObjects(this.floors, false);
      if (hits.length > 0) {
        return { x: hits[0].point.x, z: hits[0].point.z };
      }
      const plane = new this.T.Plane(new this.T.Vector3(0, 1, 0), 0);
      const targetPoint = new this.T.Vector3();
      if (this.raycaster.ray.intersectPlane(plane, targetPoint)) {
        return { x: targetPoint.x, z: targetPoint.z };
      }
      return null;
    }

    removeCharacter(group) {
      this.scene.remove(group);
      group.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
      });
    }

    draw(dt) {
      const s = this.engine.s;
      const motion = this.engine.save.motion !== false;
      this.time += dt;

      this.player.position.set(
        s.player.pos.x,
        motion && s.player.moving ? Math.abs(Math.sin(this.time * 12)) * 0.055 : 0,
        s.player.pos.z
      );
      this.player.rotation.y = s.player.facing;
      this.halo.position.set(s.player.pos.x, 0.035, s.player.pos.z);
      this.player.userData.cups.forEach((cup, i) => {
        cup.visible = i < s.tray.length;
      });

      this.destination.visible = (s.player.path && s.player.path.length > 0) || s.player.moving;
      if (s.player.target) {
        this.destination.position.set(s.player.target.x, 0.045, s.player.target.z);
      }

      const ids = new Set();
      const colors = [0x586f8a, 0x9a6459, 0x62836a, 0x897493, 0xbe9354];
      for (const c of s.customers) {
        ids.add(c.id);
        if (!this.characters.has(c.id)) {
          const group = this.makeCharacter(colors[(c.id - 1) % colors.length]);
          this.characters.set(c.id, group);
          this.scene.add(group);
        }
        const group = this.characters.get(c.id);
        group.position.set(
          c.pos.x,
          motion && c.moving ? Math.abs(Math.sin(this.time * 10 + c.id)) * 0.045 : 0,
          c.pos.z
        );
        group.rotation.y = c.moving ? c.facing : c.table !== null ? Math.PI / 2 : 0;
      }
      for (const [id, group] of this.characters) {
        if (!ids.has(id)) {
          this.removeCharacter(group);
          this.characters.delete(id);
        }
      }

      this.rackCups.forEach((cup, i) => {
        cup.visible = i < s.rack.length;
      });
      this.tableMeshes.forEach((t) => {
        t.dishes.visible = Boolean(t.table.dirty);
      });

      this.steam.forEach((puff, i) => {
        puff.visible = Boolean(s.brew);
        const f = motion ? (this.time * 0.6 + i / 6) % 1 : i / 6;
        puff.position.set(2.4 + Math.sin(f * 7 + i) * 0.12, 2.9 + f * 1.4, -4.8);
        puff.scale.setScalar(1 + f * 1.4);
      });

      if (motion && dt && this.snow && this.snow.visible) {
        const p = this.snow.geometry.attributes.position;
        for (let i = 0; i < p.count; i++) {
          p.array[i * 3 + 1] -= dt * 0.85;
          if (p.array[i * 3 + 1] < 0) p.array[i * 3 + 1] = 8;
        }
        p.needsUpdate = true;
      }

      this.scene.updateMatrixWorld();
      this.camera.updateMatrixWorld();

      const r = (this.canvasRect && this.canvasRect.width > 0) ? this.canvasRect : (this.canvasRect = this.canvas.getBoundingClientRect());
      for (const label of this.labels) {
        this.projected.copy(label.point).project(this.camera);
        label.element.style.transform = `translate(${((this.projected.x + 1) * r.width) / 2}px,${
          ((1 - this.projected.y) * r.height) / 2
        }px) translate(-50%,-50%)`;

        const c = s.customers.find((c) => c.id === label.table.customerId);
        let status = '';
        let isActive = false;

        if (label.table.dirty) {
          status = 'Wipe';
          isActive = true;
        } else if (c) {
          if (c.state === 'waiting_order') {
            status = 'Order';
            isActive = true;
          } else if (c.state === 'ordered') {
            status = c.order.map((d) => d.icon).join('');
            isActive = false;
          } else if (c.state === 'drinking') {
            status = 'Enjoying';
            isActive = false;
          } else if (c.state === 'paying') {
            status = '$' + c.bill;
            isActive = true;
          }
        }

        if (status) {
          label.element.hidden = false;
          label.element.textContent = `Table ${label.table.index + 1} · ${status}`;
          label.element.className = isActive ? 'world-label active' : 'world-label';
        } else {
          label.element.hidden = true;
        }
      }

      this.renderer.render(this.scene, this.camera);
    }

    destroy() {
      this.releaseScene();
      if (this.renderer) this.renderer.dispose();
    }
  }

  root.CoffeeWorld = CoffeeWorld;
})(typeof window !== 'undefined' ? window : this);
