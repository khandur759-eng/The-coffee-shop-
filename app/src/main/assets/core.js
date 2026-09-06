/* Simulation engine, state management, economy, and audio synthesis */
(function (root) {
  'use strict';

  const RECIPES = [
    { id: 'espresso', name: 'Espresso', price: 7, time: 3.0, need: 0, icon: '☕', desc: 'Rich, dark and brisk.' },
    { id: 'tea', name: 'Calm Herbal Tea', price: 8, time: 2.5, need: 0, icon: '🍵', desc: 'Warm calming botanical brew.' },
    { id: 'latte', name: 'Velvet Latte', price: 10, time: 4.0, need: 1, icon: '🥛', desc: 'Silky microfoam over espresso.' },
    { id: 'mocha', name: 'Midnight Mocha', price: 13, time: 5.0, need: 2, icon: '🍫', desc: 'Rich chocolate and dark roast.' }
  ];

  const UPGRADES = [
    {
      id: 'machine',
      name: 'Espresso Machine',
      desc: 'Unlock Velvet Latte, Midnight Mocha, and speed up brewing.',
      tiers: [
        { cost: 75, detail: 'Tier 1: Unlocks Velvet Latte ($10)' },
        { cost: 150, detail: 'Tier 2: Unlocks Midnight Mocha ($13)' },
        { cost: 260, detail: 'Tier 3: Commercial 3-group boiler (25% faster brew)' }
      ]
    },
    {
      id: 'tables',
      name: 'Café Seating',
      desc: 'Add more handmade wooden tables for higher guest volume.',
      tiers: [
        { cost: 65, detail: 'Tier 1: Table 4 added to floor' },
        { cost: 120, detail: 'Tier 2: Table 5 added to floor' },
        { cost: 190, detail: 'Tier 3: Table 6 added to floor' }
      ]
    },
    {
      id: 'decor',
      name: 'Botanical Decor',
      desc: 'Potted plants that boost guest patience and tip generosity.',
      tiers: [
        { cost: 40, detail: 'Tier 1: Window ferns (+10% tip rate)' },
        { cost: 80, detail: 'Tier 2: Counter herbarium (+15% patience)' },
        { cost: 140, detail: 'Tier 3: Lush botanical wall' }
      ]
    },
    {
      id: 'expansion',
      name: 'Winter Annex',
      desc: 'Knock down back wall to open the sunlit winter room.',
      tiers: [
        { cost: 220, detail: 'Tier 1: Annex room with cozy booth table' }
      ]
    },
    {
      id: 'staff',
      name: 'Café Crew',
      desc: 'Hire skilled automated staff to assist during rush hours.',
      tiers: [
        { cost: 110, detail: 'Tier 1: Apprentice Barista (brews drinks automatically)' },
        { cost: 240, detail: 'Tier 2: Floor Waiter (serves orders and wipes tables)' }
      ]
    }
  ];

  function defaultSave() {
    return {
      day: 1,
      money: 55,
      total: 0,
      reputation: 75,
      up: { machine: 0, tables: 0, decor: 0, expansion: 0, staff: 0 },
      audio: true,
      quality: 'balanced',
      motion: true,
      seenIntro: false
    };
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function dist(a, b) {
    return Math.hypot(a.x - b.x, a.z - b.z);
  }

  // Audio synthesis
  let audioCtx = null;
  function sound(name) {
    try {
      const AudioClass = window.AudioContext || window.webkitAudioContext;
      if (!audioCtx && AudioClass) audioCtx = new AudioClass();
      if (!audioCtx) return;
      if (audioCtx.state === 'suspended') audioCtx.resume();

      const t = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      if (name === 'ping') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(540, t);
        osc.frequency.exponentialRampToValueAtTime(820, t + 0.08);
        gain.gain.setValueAtTime(0.08, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        osc.start(t);
        osc.stop(t + 0.1);
      } else if (name === 'brew_start') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(180, t);
        osc.frequency.linearRampToValueAtTime(260, t + 0.2);
        gain.gain.setValueAtTime(0.09, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        osc.start(t);
        osc.stop(t + 0.22);
      } else if (name === 'brew_done') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(660, t);
        osc.frequency.setValueAtTime(880, t + 0.1);
        gain.gain.setValueAtTime(0.1, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
        osc.start(t);
        osc.stop(t + 0.25);
      } else if (name === 'coin') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(980, t);
        osc.frequency.setValueAtTime(1320, t + 0.07);
        gain.gain.setValueAtTime(0.12, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        osc.start(t);
        osc.stop(t + 0.22);
      } else if (name === 'wipe') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(220, t);
        osc.frequency.linearRampToValueAtTime(160, t + 0.12);
        gain.gain.setValueAtTime(0.06, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
        osc.start(t);
        osc.stop(t + 0.14);
      } else if (name === 'click') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, t);
        gain.gain.setValueAtTime(0.05, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
        osc.start(t);
        osc.stop(t + 0.04);
      }
    } catch (_) {}
  }

  function triggerHaptic(type = 'light') {
    try {
      if (window.AndroidBridge && window.AndroidBridge.triggerHaptic) {
        window.AndroidBridge.triggerHaptic(type);
      } else if (navigator.vibrate) {
        navigator.vibrate(type === 'heavy' ? 40 : 20);
      }
    } catch (_) {}
  }

  class CoffeeEngine {
    constructor() {
      this.save = defaultSave();
      this.load();
      this.initWorld();
      this.initDay();
    }

    load() {
      try {
        let raw = null;
        if (window.AndroidBridge && window.AndroidBridge.loadSaveData) {
          raw = window.AndroidBridge.loadSaveData();
        }
        if (!raw) {
          raw = localStorage.getItem('last_coffee_save_v3');
        }
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            this.save.day = clamp(Math.floor(Number(parsed.day) || 1), 1, 9999);
            this.save.money = clamp(Math.floor(Number(parsed.money) || 0), 0, 999999);
            this.save.total = clamp(Math.floor(Number(parsed.total) || 0), 0, 9999999);
            this.save.reputation = clamp(Math.floor(Number(parsed.reputation) || 75), 10, 100);
            this.save.audio = parsed.audio !== false;
            this.save.quality = parsed.quality || 'balanced';
            this.save.motion = parsed.motion !== false;
            this.save.seenIntro = Boolean(parsed.seenIntro);
            if (parsed.up && typeof parsed.up === 'object') {
              for (const k of ['machine', 'tables', 'decor', 'expansion', 'staff']) {
                this.save.up[k] = clamp(Math.floor(Number(parsed.up[k]) || 0), 0, 3);
              }
            }
          }
        }
      } catch (e) {
        console.warn('Save load exception:', e);
      }
    }

    persist() {
      try {
        const json = JSON.stringify(this.save);
        localStorage.setItem('last_coffee_save_v3', json);
        if (window.AndroidBridge && window.AndroidBridge.saveGameData) {
          window.AndroidBridge.saveGameData(json);
        }
      } catch (_) {}
    }

    initWorld() {
      // Table coordinate definitions
      const allTableCoords = [
        { x: -6, z: -1 },
        { x: -6, z: 3 },
        { x: -1, z: -1 },
        { x: -1, z: 3 },
        { x: 3, z: 3 },
        { x: 7, z: 1 },
        { x: 5, z: 7.2 }
      ];

      const activeCount = Math.min(6, 3 + (this.save.up.tables || 0));
      const activeCoords = allTableCoords.slice(0, activeCount);
      if (this.save.up.expansion) {
        activeCoords.push(allTableCoords[6]);
      }

      this.world = {
        tables: activeCoords.map((coord, i) => ({
          index: i,
          x: coord.x,
          z: coord.z,
          dirty: false,
          customerId: null
        })),
        espressoPos: { x: 2.5, z: -3.2 },
        counterPos: { x: 5.8, z: -3.2 },
        doorPos: { x: -9.2, z: 0 }
      };
    }

    initDay() {
      const day = this.save.day;
      const goals = [
        { target: 3, reward: 14, title: 'Serve 3 guests', detail: 'A $14 thank-you when you do.' },
        { target: 5, reward: 22, title: 'Serve 5 guests', detail: 'Patron tip bonus of $22.' },
        { target: 8, reward: 35, title: 'Serve 8 guests', detail: 'City journal award of $35.' },
        { target: 12, reward: 50, title: 'Serve 12 guests', detail: 'Grand warmth bonus of $50.' }
      ];
      const goalTemplate = goals[Math.min(goals.length - 1, Math.floor((day - 1) / 2))];

      this.s = {
        player: {
          pos: { x: 0, z: 3.5 },
          target: { x: 0, z: 3.5 },
          facing: 0,
          moving: false,
          speed: 5.8,
          path: []
        },
        tray: [],
        rack: [],
        brew: null,
        customers: [],
        dayTime: 120,
        dayLength: 120,
        doorsOpen: true,
        selectedRecipe: 'espresso',
        nextCustomerId: 1,
        spawnTimer: 2.0,
        baristaTimer: 8.0,
        waiterTimer: 9.0,
        stats: {
          served: 0,
          missed: 0,
          earned: 0,
          tips: 0,
          tablesCleaned: 0
        },
        goal: {
          title: goalTemplate.title,
          target: goalTemplate.target,
          current: 0,
          reward: goalTemplate.reward,
          detail: goalTemplate.detail,
          done: false
        }
      };
    }

    setPlayerDestination(x, z) {
      const maxZ = this.save.up.expansion ? 9.2 : 6.2;
      const tx = clamp(x, -9.6, 9.6);
      const tz = clamp(z, -6.0, maxZ);
      this.s.player.target = { x: tx, z: tz };
      this.s.player.moving = true;
    }

    update(dt) {
      const s = this.s;

      // Update shift clock
      if (s.dayTime > 0) {
        s.dayTime = Math.max(0, s.dayTime - dt);
        if (s.dayTime === 0) {
          s.doorsOpen = false;
        }
      }

      // Player Movement
      if (s.player.moving) {
        const dx = s.player.target.x - s.player.pos.x;
        const dz = s.player.target.z - s.player.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.1) {
          s.player.pos.x = s.player.target.x;
          s.player.pos.z = s.player.target.z;
          s.player.moving = false;
        } else {
          const step = Math.min(d, s.player.speed * dt);
          s.player.pos.x += (dx / d) * step;
          s.player.pos.z += (dz / d) * step;
          s.player.facing = Math.atan2(dx, dz);
        }
      }

      // Brewing process
      if (s.brew) {
        s.brew.progress += dt;
        s.brew.remaining = Math.max(0, s.brew.total - s.brew.progress);
        if (s.brew.progress >= s.brew.total) {
          const recipe = s.brew.recipe;
          s.brew = null;
          if (s.tray.length < 3) {
            s.tray.push(recipe);
          } else if (s.rack.length < 3) {
            s.rack.push(recipe);
          }
          if (this.save.audio) sound('brew_done');
          triggerHaptic('heavy');
        }
      }

      // Customer Spawning
      if (s.doorsOpen) {
        s.spawnTimer -= dt;
        if (s.spawnTimer <= 0) {
          const openTable = this.world.tables.find((t) => !t.dirty && t.customerId === null);
          if (openTable) {
            this.spawnCustomer(openTable);
            const rate = clamp(11 - (this.save.reputation / 20), 4.5, 9.0);
            s.spawnTimer = rate;
          } else {
            s.spawnTimer = 2.0;
          }
        }
      }

      // Customers Lifecycle
      for (let i = s.customers.length - 1; i >= 0; i--) {
        const c = s.customers[i];
        this.updateCustomer(c, dt, i);
      }

      // Staff Automation
      if (this.save.up.staff >= 1) {
        s.baristaTimer -= dt;
        if (s.baristaTimer <= 0) {
          s.baristaTimer = 8.0;
          this.runBaristaStaff();
        }
      }
      if (this.save.up.staff >= 2) {
        s.waiterTimer -= dt;
        if (s.waiterTimer <= 0) {
          s.waiterTimer = 9.0;
          this.runWaiterStaff();
        }
      }

      // Check Shift Complete
      if (!s.doorsOpen && s.customers.length === 0) {
        return 'shift_complete';
      }
      return 'running';
    }

    spawnCustomer(table) {
      const unlockedRecipes = RECIPES.filter((r) => (this.save.up.machine || 0) >= r.need);
      const drink1 = unlockedRecipes[Math.floor(Math.random() * unlockedRecipes.length)];
      const order = [drink1];
      if (Math.random() < 0.35) {
        const drink2 = unlockedRecipes[Math.floor(Math.random() * unlockedRecipes.length)];
        order.push(drink2);
      }
      const bill = order.reduce((sum, r) => sum + r.price, 0);

      const customer = {
        id: this.s.nextCustomerId++,
        pos: { x: this.world.doorPos.x, z: this.world.doorPos.z },
        target: { x: table.x + 1.2, z: table.z },
        facing: 0,
        moving: true,
        speed: 3.4,
        table: table.index,
        state: 'walking_to_table',
        patience: 1.0,
        order,
        drinksDelivered: 0,
        bill,
        tip: Math.max(1, Math.round(bill * 0.2)),
        timer: 0
      };

      table.customerId = customer.id;
      this.s.customers.push(customer);
    }

    updateCustomer(c, dt, index) {
      const s = this.s;
      const table = this.world.tables[c.table];

      if (c.moving) {
        const dx = c.target.x - c.pos.x;
        const dz = c.target.z - c.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.15) {
          c.pos.x = c.target.x;
          c.pos.z = c.target.z;
          c.moving = false;
          if (c.state === 'walking_to_table') {
            c.state = 'waiting_order';
            c.patience = 1.0;
          } else if (c.state === 'leaving') {
            if (table) {
              table.dirty = true;
              table.customerId = null;
            }
            s.customers.splice(index, 1);
            return;
          }
        } else {
          const step = Math.min(d, c.speed * dt);
          c.pos.x += (dx / d) * step;
          c.pos.z += (dz / d) * step;
          c.facing = Math.atan2(dx, dz);
        }
      }

      const patienceRate = (this.save.up.decor ? 0.02 : 0.025);

      if (c.state === 'waiting_order') {
        c.patience -= dt * patienceRate;
        if (c.patience <= 0) {
          // Missed guest
          s.stats.missed++;
          this.save.reputation = Math.max(15, this.save.reputation - 4);
          c.state = 'leaving';
          c.target = { x: this.world.doorPos.x, z: this.world.doorPos.z };
          c.moving = true;
        }
      } else if (c.state === 'ordered') {
        c.patience -= dt * (patienceRate * 0.9);
        if (c.patience <= 0) {
          s.stats.missed++;
          this.save.reputation = Math.max(15, this.save.reputation - 5);
          c.state = 'leaving';
          c.target = { x: this.world.doorPos.x, z: this.world.doorPos.z };
          c.moving = true;
        }
      } else if (c.state === 'drinking') {
        c.timer += dt;
        if (c.timer >= 5.0) {
          c.state = 'paying';
          c.patience = 1.0;
        }
      } else if (c.state === 'paying') {
        c.patience -= dt * patienceRate;
        if (c.patience <= 0) {
          // Leaves without paying
          c.state = 'leaving';
          c.target = { x: this.world.doorPos.x, z: this.world.doorPos.z };
          c.moving = true;
        }
      }
    }

    startBrew(recipeId) {
      if (this.s.brew) return false;
      const recipe = RECIPES.find((r) => r.id === recipeId) || RECIPES[0];
      const speedMultiplier = this.save.up.machine >= 3 ? 0.75 : 1.0;
      const duration = recipe.time * speedMultiplier;
      this.s.brew = {
        recipe,
        progress: 0,
        total: duration,
        remaining: duration,
        name: recipe.name
      };
      if (this.save.audio) sound('brew_start');
      triggerHaptic('light');
      return true;
    }

    pickupRack() {
      if (this.s.rack.length > 0 && this.s.tray.length < 3) {
        const drink = this.s.rack.shift();
        this.s.tray.push(drink);
        if (this.save.audio) sound('ping');
        triggerHaptic('light');
        return true;
      }
      return false;
    }

    takeOrder(tableIndex) {
      const table = this.world.tables[tableIndex];
      if (!table || table.customerId === null) return false;
      const c = this.s.customers.find((c) => c.id === table.customerId);
      if (c && c.state === 'waiting_order') {
        c.state = 'ordered';
        c.patience = 1.0;
        if (this.save.audio) sound('click');
        triggerHaptic('light');
        return true;
      }
      return false;
    }

    serveCustomer(tableIndex) {
      const table = this.world.tables[tableIndex];
      if (!table || table.customerId === null) return false;
      const c = this.s.customers.find((c) => c.id === table.customerId);
      if (!c || c.state !== 'ordered') return false;

      // Find any drink in tray matching remaining needed drinks
      const neededRecipe = c.order[c.drinksDelivered];
      if (!neededRecipe) return false;

      const trayIndex = this.s.tray.findIndex((d) => d.id === neededRecipe.id);
      if (trayIndex !== -1) {
        this.s.tray.splice(trayIndex, 1);
        c.drinksDelivered++;
        if (c.drinksDelivered >= c.order.length) {
          c.state = 'drinking';
          c.timer = 0;
          this.s.stats.served++;
          this.checkGoalProgress();
        }
        if (this.save.audio) sound('ping');
        triggerHaptic('heavy');
        return true;
      }
      return false;
    }

    collectPayment(tableIndex) {
      const table = this.world.tables[tableIndex];
      if (!table || table.customerId === null) return false;
      const c = this.s.customers.find((c) => c.id === table.customerId);
      if (!c || c.state !== 'paying') return false;

      const tipMultiplier = 1 + (this.save.up.decor ? 0.25 : 0);
      const tipEarned = Math.round(c.tip * c.patience * tipMultiplier);
      const totalEarned = c.bill + tipEarned;

      this.save.money += totalEarned;
      this.save.total += totalEarned;
      this.s.stats.earned += c.bill;
      this.s.stats.tips += tipEarned;
      this.save.reputation = Math.min(100, this.save.reputation + 2);

      c.state = 'leaving';
      c.target = { x: this.world.doorPos.x, z: this.world.doorPos.z };
      c.moving = true;

      this.persist();
      if (this.save.audio) sound('coin');
      triggerHaptic('heavy');
      return { bill: c.bill, tip: tipEarned, total: totalEarned };
    }

    cleanTable(tableIndex) {
      const table = this.world.tables[tableIndex];
      if (!table || !table.dirty) return false;
      table.dirty = false;
      this.s.stats.tablesCleaned++;
      if (this.save.audio) sound('wipe');
      triggerHaptic('light');
      return true;
    }

    checkGoalProgress() {
      const g = this.s.goal;
      if (!g.done) {
        g.current = this.s.stats.served;
        if (g.current >= g.target) {
          g.done = true;
          this.save.money += g.reward;
          this.save.total += g.reward;
          this.persist();
          if (this.save.audio) sound('coin');
          triggerHaptic('heavy');
        }
      }
    }

    runBaristaStaff() {
      const s = this.s;
      if (s.brew) return;
      // Check if any customer in 'ordered' needs a drink that isn't on the tray
      const waiting = s.customers.find((c) => c.state === 'ordered');
      if (waiting) {
        const needed = waiting.order[waiting.drinksDelivered];
        if (needed) {
          const hasInTray = s.tray.some((d) => d.id === needed.id);
          const hasInRack = s.rack.some((d) => d.id === needed.id);
          if (!hasInTray && !hasInRack) {
            this.startBrew(needed.id);
          }
        }
      }
    }

    runWaiterStaff() {
      // Find dirty table and clean it
      const dirty = this.world.tables.find((t) => t.dirty);
      if (dirty) {
        this.cleanTable(dirty.index);
        return;
      }
      // Or find paying customer
      const paying = this.s.customers.find((c) => c.state === 'paying');
      if (paying && paying.table !== null) {
        this.collectPayment(paying.table);
        return;
      }
      // Or find customer waiting to order
      const waitingOrder = this.s.customers.find((c) => c.state === 'waiting_order');
      if (waitingOrder && waitingOrder.table !== null) {
        this.takeOrder(waitingOrder.table);
        return;
      }
      // Or serve ready drink
      const ordered = this.s.customers.find((c) => c.state === 'ordered');
      if (ordered && ordered.table !== null) {
        this.serveCustomer(ordered.table);
      }
    }

    getNearestInteractive() {
      const p = this.s.player.pos;
      const REACH = 2.4;

      // 1. Espresso machine
      const mDist = dist(p, this.world.espressoPos);
      if (mDist < REACH) {
        if (this.s.brew) {
          return { type: 'brew_progress', label: `Brewing (${this.s.brew.remaining.toFixed(1)}s)` };
        }
        const recipe = RECIPES.find((r) => r.id === this.s.selectedRecipe) || RECIPES[0];
        return { type: 'brew', label: `Brew ${recipe.name}`, recipeId: recipe.id };
      }

      // 2. Counter pickup rack
      const cDist = dist(p, this.world.counterPos);
      if (cDist < REACH && this.s.rack.length > 0 && this.s.tray.length < 3) {
        return { type: 'pickup', label: `Pick Up ${this.s.rack[0].name}` };
      }

      // 3. Tables (order, serve, pay, wipe)
      for (const table of this.world.tables) {
        const tDist = dist(p, { x: table.x, z: table.z });
        if (tDist < REACH + 0.6) {
          if (table.dirty) {
            return { type: 'wipe', tableIndex: table.index, label: 'Wipe Table' };
          }
          if (table.customerId !== null) {
            const c = this.s.customers.find((c) => c.id === table.customerId);
            if (c) {
              if (c.state === 'waiting_order') {
                return { type: 'take_order', tableIndex: table.index, label: 'Take Order' };
              }
              if (c.state === 'ordered') {
                const needed = c.order[c.drinksDelivered];
                if (needed && this.s.tray.some((d) => d.id === needed.id)) {
                  return { type: 'serve', tableIndex: table.index, label: `Serve ${needed.name}` };
                }
                return { type: 'waiting_drink', label: `Needs ${needed ? needed.name : 'drink'}` };
              }
              if (c.state === 'paying') {
                return { type: 'collect', tableIndex: table.index, label: `Collect $${c.bill}` };
              }
            }
          }
        }
      }

      return null;
    }

    buyUpgrade(upgradeId) {
      const up = UPGRADES.find((u) => u.id === upgradeId);
      if (!up) return false;
      const currentTier = this.save.up[upgradeId] || 0;
      if (currentTier >= up.tiers.length) return false;
      const tierInfo = up.tiers[currentTier];
      if (this.save.money < tierInfo.cost) return false;

      this.save.money -= tierInfo.cost;
      this.save.up[upgradeId] = currentTier + 1;
      this.persist();
      this.initWorld();
      if (this.save.audio) sound('coin');
      triggerHaptic('heavy');
      return true;
    }
  }

  root.CoffeeCore = {
    RECIPES,
    UPGRADES,
    sound,
    triggerHaptic,
    clamp,
    dist,
    Engine: CoffeeEngine
  };
})(typeof window !== 'undefined' ? window : this);
