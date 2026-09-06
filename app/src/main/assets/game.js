/* Game Controller, UI synchronization, touch controls, and modal dialogs */
(function (root) {
  'use strict';

  const C = root.CoffeeCore;
  let engine = null;
  let world = null;
  let paused = false;
  let lastTime = 0;

  // DOM Elements cache
  const el = {};

  function init() {
    engine = new C.Engine();

    // Cache elements
    el.appUI = document.getElementById('appUI');
    el.scene = document.getElementById('scene');
    el.worldLabels = document.getElementById('worldLabels');
    el.money = document.getElementById('money');
    el.day = document.getElementById('day');
    el.reputation = document.getElementById('reputation');
    el.clock = document.getElementById('clock');
    el.clockLabel = document.getElementById('clockLabel');
    el.dayProgress = document.getElementById('dayProgress');
    el.ticketCount = document.getElementById('ticketCount');
    el.goal = document.getElementById('goal');
    el.goalProgress = document.getElementById('goalProgress');
    el.goalDetail = document.getElementById('goalDetail');
    el.tickets = document.getElementById('tickets');
    el.trayCount = document.getElementById('trayCount');
    el.slot0 = document.getElementById('slot0');
    el.slot1 = document.getElementById('slot1');
    el.slot2 = document.getElementById('slot2');
    el.shelfStatus = document.getElementById('shelfStatus');
    el.saveStatus = document.getElementById('saveStatus');
    el.machineBtn = document.getElementById('machineBtn');
    el.cleanBtn = document.getElementById('cleanBtn');
    el.brewProgress = document.getElementById('brewProgress');
    el.brewName = document.getElementById('brewName');
    el.brewFill = document.getElementById('brewFill');
    el.brewRemaining = document.getElementById('brewRemaining');
    el.toast = document.getElementById('toast');
    el.guide = document.getElementById('guide');
    el.selectedRecipe = document.getElementById('selectedRecipe');
    el.recipeBtn = document.getElementById('recipeBtn');
    el.hint = document.getElementById('hint');
    el.interactBtn = document.getElementById('interactBtn');
    el.actionLabel = document.getElementById('actionLabel');
    el.pauseBtn = document.getElementById('pauseBtn');
    el.audioBtn = document.getElementById('audioBtn');
    el.settingsBtn = document.getElementById('settingsBtn');
    el.helpBtn = document.getElementById('helpBtn');
    el.modal = document.getElementById('modal');
    el.panel = document.getElementById('panel');

    // 3D Scene Initialization
    try {
      world = new root.CoffeeWorld(el.scene, el.worldLabels, engine, (tableIndex) => {
        walkToTable(tableIndex);
      });
    } catch (e) {
      console.error('3D World initialization error:', e);
      showToast('Could not initialize 3D graphics.');
    }

    setupControls();
    setupTouchJoystick();
    updateUI();

    // Dismiss initial loading modal
    hideModal();
    if (el.appUI) el.appUI.removeAttribute('inert');

    // Start animation loop
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);

    window.addEventListener('resize', () => {
      if (world) world.resize();
    });
  }

  function showToast(msg) {
    if (!el.toast) return;
    el.toast.textContent = msg;
    el.toast.classList.add('show');
    clearTimeout(el.toast._t);
    el.toast._t = setTimeout(() => {
      el.toast.classList.remove('show');
    }, 2400);
  }

  function setupControls() {
    // Machine walk shortcut
    el.machineBtn.addEventListener('click', () => {
      engine.setPlayerDestination(engine.world.espressoPos.x, engine.world.espressoPos.z);
      C.sound('click');
    });

    // Find dirty table shortcut
    el.cleanBtn.addEventListener('click', () => {
      const dirty = engine.world.tables.find((t) => t.dirty);
      if (dirty) {
        walkToTable(dirty.index);
        C.sound('click');
      }
    });

    // Recipe selection button
    el.recipeBtn.addEventListener('click', openRecipeModal);

    // Primary action button (E or Tap)
    el.interactBtn.addEventListener('click', handleInteract);

    // Utility buttons
    el.pauseBtn.addEventListener('click', () => {
      paused = !paused;
      el.pauseBtn.textContent = paused ? '▶' : 'Ⅱ';
      if (paused) {
        openPauseModal();
      } else {
        hideModal();
      }
    });

    el.audioBtn.addEventListener('click', () => {
      engine.save.audio = !engine.save.audio;
      el.audioBtn.setAttribute('aria-pressed', String(engine.save.audio));
      el.audioBtn.style.opacity = engine.save.audio ? '1' : '0.5';
      engine.persist();
      showToast(engine.save.audio ? 'Audio unmuted' : 'Audio muted');
    });

    el.settingsBtn.addEventListener('click', openSettingsModal);
    el.helpBtn.addEventListener('click', openHelpModal);

    // Ticket click delegation
    el.tickets.addEventListener('click', (evt) => {
      const ticket = evt.target.closest('.ticket');
      if (ticket && ticket.dataset.table !== undefined) {
        walkToTable(Number(ticket.dataset.table));
        C.sound('click');
      }
    });

    // Canvas click to move
    el.scene.addEventListener('pointerdown', (evt) => {
      if (evt.target !== el.scene) return;
      const hit = world ? world.pick(evt.clientX, evt.clientY) : null;
      if (hit) {
        engine.setPlayerDestination(hit.x, hit.z);
      }
    });

    // Keyboard support (WASD, Arrows, E for interact, M for machine, R for recipe)
    const keysDown = new Set();
    window.addEventListener('keydown', (e) => {
      const key = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright'].includes(key)) {
        keysDown.add(key);
      } else if (key === 'e' || key === ' ') {
        handleInteract();
      } else if (key === 'm') {
        engine.setPlayerDestination(engine.world.espressoPos.x, engine.world.espressoPos.z);
      } else if (key === 'r') {
        openRecipeModal();
      } else if (key === 'escape') {
        paused = !paused;
        if (paused) openPauseModal();
        else hideModal();
      }
    });

    window.addEventListener('keyup', (e) => {
      keysDown.delete(e.key.toLowerCase());
    });

    // Keyboard movement integration
    setInterval(() => {
      if (keysDown.size === 0 || paused) return;
      let dx = 0, dz = 0;
      if (keysDown.has('w') || keysDown.has('arrowup')) dz -= 1;
      if (keysDown.has('s') || keysDown.has('arrowdown')) dz += 1;
      if (keysDown.has('a') || keysDown.has('arrowleft')) dx -= 1;
      if (keysDown.has('d') || keysDown.has('arrowright')) dx += 1;

      if (dx !== 0 || dz !== 0) {
        const len = Math.hypot(dx, dz);
        engine.setPlayerDestination(
          engine.s.player.pos.x + (dx / len) * 1.5,
          engine.s.player.pos.z + (dz / len) * 1.5
        );
      }
    }, 50);
  }

  function setupTouchJoystick() {
    const base = document.getElementById('joystickBase');
    const thumb = document.getElementById('joystickThumb');
    if (!base || !thumb) return;

    let activeTouchId = null;
    let baseRect = null;
    let moveInterval = null;
    let moveVector = { x: 0, z: 0 };

    function onTouchStart(e) {
      if (activeTouchId !== null) return;
      const touch = e.changedTouches[0];
      activeTouchId = touch.identifier;
      baseRect = base.getBoundingClientRect();
      updateThumb(touch.clientX, touch.clientY);
      e.preventDefault();

      if (!moveInterval) {
        moveInterval = setInterval(() => {
          if (activeTouchId !== null && (moveVector.x !== 0 || moveVector.z !== 0)) {
            engine.setPlayerDestination(
              engine.s.player.pos.x + moveVector.x * 1.8,
              engine.s.player.pos.z + moveVector.z * 1.8
            );
          }
        }, 60);
      }
    }

    function onTouchMove(e) {
      if (activeTouchId === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === activeTouchId) {
          updateThumb(e.changedTouches[i].clientX, e.changedTouches[i].clientY);
          break;
        }
      }
      e.preventDefault();
    }

    function onTouchEnd(e) {
      if (activeTouchId === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === activeTouchId) {
          activeTouchId = null;
          thumb.style.transform = 'translate(-50%, -50%)';
          moveVector = { x: 0, z: 0 };
          if (moveInterval) {
            clearInterval(moveInterval);
            moveInterval = null;
          }
          break;
        }
      }
    }

    function updateThumb(cx, cy) {
      const centerX = baseRect.left + baseRect.width / 2;
      const centerY = baseRect.top + baseRect.height / 2;
      let dx = cx - centerX;
      let dy = cy - centerY;
      const dist = Math.hypot(dx, dy);
      const maxRadius = baseRect.width / 2 - 12;

      if (dist > maxRadius) {
        dx = (dx / dist) * maxRadius;
        dy = (dy / dist) * maxRadius;
      }

      thumb.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      moveVector = {
        x: dx / maxRadius,
        z: dy / maxRadius
      };
    }

    base.addEventListener('touchstart', onTouchStart, { passive: false });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd, { passive: false });
    window.addEventListener('touchcancel', onTouchEnd, { passive: false });
  }

  function walkToTable(tableIndex) {
    const table = engine.world.tables[tableIndex];
    if (table) {
      engine.setPlayerDestination(table.x + 1.2, table.z);
    }
  }

  function handleInteract() {
    const action = engine.getNearestInteractive();
    if (!action) return;

    if (action.type === 'brew') {
      engine.startBrew(action.recipeId);
    } else if (action.type === 'pickup') {
      engine.pickupRack();
    } else if (action.type === 'take_order') {
      engine.takeOrder(action.tableIndex);
      showToast(`Took Table ${action.tableIndex + 1}'s order!`);
    } else if (action.type === 'serve') {
      engine.serveCustomer(action.tableIndex);
      showToast(`Drink served to Table ${action.tableIndex + 1}!`);
    } else if (action.type === 'collect') {
      const receipt = engine.collectPayment(action.tableIndex);
      if (receipt) {
        showToast(`Earned $${receipt.bill} + $${receipt.tip} tip!`);
      }
    } else if (action.type === 'wipe') {
      engine.cleanTable(action.tableIndex);
      showToast(`Table ${action.tableIndex + 1} is clean & ready!`);
    }
  }

  function gameLoop(now) {
    const dt = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;

    if (!paused && engine && world) {
      const state = engine.update(dt);
      world.draw(dt);
      updateUI();

      if (state === 'shift_complete') {
        endOfDayShift();
      }
    }

    requestAnimationFrame(gameLoop);
  }

  function setText(elem, val) {
    if (elem && elem.textContent !== val) {
      elem.textContent = val;
    }
  }

  function updateUI() {
    const s = engine.s;
    const save = engine.save;

    // Header values
    setText(el.money, `$${save.money}`);
    setText(el.day, String(save.day).padStart(2, '0'));
    setText(el.reputation, String(save.reputation));

    // Clock
    const mins = Math.floor(s.dayTime / 60);
    const secs = Math.floor(s.dayTime % 60);
    setText(el.clock, `${mins}:${String(secs).padStart(2, '0')}`);
    const shiftRatio = 1 - s.dayTime / s.dayLength;
    el.dayProgress.style.width = `${Math.min(100, Math.max(0, shiftRatio * 100))}%`;
    setText(el.clockLabel, s.doorsOpen ? 'DOORS OPEN' : 'DOORS CLOSED');

    // Goal
    const goalTitle = s.goal.done ? `${s.goal.title} (Done!)` : s.goal.title;
    setText(el.goal, goalTitle);
    setText(el.goalDetail, s.goal.detail);
    const goalRatio = Math.min(1, s.goal.current / s.goal.target);
    el.goalProgress.style.width = `${goalRatio * 100}%`;

    // Brewing Bar
    if (s.brew) {
      el.brewProgress.hidden = false;
      setText(el.brewName, s.brew.name);
      setText(el.brewRemaining, `${s.brew.remaining.toFixed(1)}s`);
      const brewPct = (s.brew.progress / s.brew.total) * 100;
      el.brewFill.style.width = `${brewPct}%`;
    } else {
      el.brewProgress.hidden = true;
    }

    // Tray Slots
    setText(el.trayCount, `${s.tray.length} / 3`);
    const slots = [el.slot0, el.slot1, el.slot2];
    slots.forEach((slot, idx) => {
      const drink = s.tray[idx];
      if (drink) {
        setText(slot, `${drink.icon} ${drink.name.split(' ')[0]}`);
        slot.classList.add('filled');
      } else {
        setText(slot, '·');
        slot.classList.remove('filled');
      }
    });

    // Shelf / Rack Status
    const shelfMsg = s.rack.length > 0 ? `${s.rack.length} drink ready on counter rack!` : 'Three cups. Plenty of possibility.';
    setText(el.shelfStatus, shelfMsg);

    // Clean Button
    const dirtyCount = engine.world.tables.filter((t) => t.dirty).length;
    el.cleanBtn.disabled = dirtyCount === 0;
    const cleanMsg = dirtyCount > 0 ? `◇ Wipe Table (${dirtyCount})` : '◇ No Dirty Tables';
    setText(el.cleanBtn, cleanMsg);

    // Tickets
    renderTickets();

    // Context Action Button
    const interactive = engine.getNearestInteractive();
    if (interactive) {
      el.interactBtn.disabled = false;
      setText(el.actionLabel, interactive.label);
      setText(el.hint, `Press E or tap to ${interactive.label}.`);
    } else {
      el.interactBtn.disabled = true;
      setText(el.actionLabel, 'Walk Around');
      setText(el.hint, 'Tap a ticket, table, or walk closer to interact.');
    }
  }

  const ticketMap = new Map();
  let showingEmptyTickets = false;

  function renderTickets() {
    const customers = engine.s.customers;
    setText(el.ticketCount, `${customers.length} guest${customers.length === 1 ? '' : 's'}`);

    if (customers.length === 0) {
      if (!showingEmptyTickets) {
        el.tickets.innerHTML = `
          <div class="empty-tickets">
            <span aria-hidden="true">♧</span>
            <strong>A quiet moment.</strong>
            <p>The next guest will arrive soon through the winter door.</p>
          </div>
        `;
        showingEmptyTickets = true;
        ticketMap.clear();
      }
      return;
    }

    if (showingEmptyTickets) {
      el.tickets.innerHTML = '';
      showingEmptyTickets = false;
    }

    const currentCustomerIds = new Set();
    customers.forEach((c) => {
      currentCustomerIds.add(c.id);
      let ticket = ticketMap.get(c.id);
      if (!ticket) {
        ticket = document.createElement('article');
        ticket.className = 'ticket';
        ticket.innerHTML = `
          <div class="ticket-top">
            <span class="ticket-name">Table ${c.table + 1}</span>
            <span class="ticket-location"></span>
          </div>
          <div class="ticket-drinks"></div>
          <div class="ticket-status">
            <span class="status-action"></span>
            <span class="status-pct"></span>
          </div>
          <div class="ticket-bar"><i></i></div>
        `;
        ticket._name = ticket.querySelector('.ticket-name');
        ticket._loc = ticket.querySelector('.ticket-location');
        ticket._drinks = ticket.querySelector('.ticket-drinks');
        ticket._action = ticket.querySelector('.status-action');
        ticket._pct = ticket.querySelector('.status-pct');
        ticket._bar = ticket.querySelector('.ticket-bar i');
        el.tickets.appendChild(ticket);
        ticketMap.set(c.id, ticket);
      }

      ticket.dataset.table = c.table;
      setText(ticket._name, `Table ${c.table + 1}`);

      let locText = 'Walking in';
      let actionText = 'Arriving';
      if (c.state === 'waiting_order') {
        locText = 'Ready';
        actionText = 'Order';
      } else if (c.state === 'ordered') {
        const remaining = c.order.slice(c.drinksDelivered).map((d) => `${d.icon} ${d.name.split(' ')[0]}`).join(', ');
        locText = 'Brewing';
        actionText = `Needs: ${remaining}`;
      } else if (c.state === 'drinking') {
        locText = 'Seated';
        actionText = 'Sipping brew';
      } else if (c.state === 'paying') {
        locText = 'Ready';
        actionText = `Pay $${c.bill}`;
      }

      setText(ticket._loc, locText);
      setText(ticket._action, actionText);

      const drinksText = c.order
        .map((d, i) => (i < c.drinksDelivered ? `<span class="done">${d.icon} ${d.name}</span>` : `<span>${d.icon} ${d.name}</span>`))
        .join(' ');
      if (ticket._drinksHtml !== drinksText) {
        ticket._drinks.innerHTML = drinksText;
        ticket._drinksHtml = drinksText;
      }

      const pctNum = Math.max(0, Math.min(100, Math.round(c.patience * 100)));
      setText(ticket._pct, `${pctNum}%`);
      ticket._bar.style.width = `${pctNum}%`;
      ticket.classList.toggle('low', c.patience < 0.35);
    });

    // Clean up tickets for departed guests
    for (const [id, ticket] of ticketMap) {
      if (!currentCustomerIds.has(id)) {
        ticket.remove();
        ticketMap.delete(id);
      }
    }
  }

  // Modals
  function showModal(contentHtml) {
    el.panel.innerHTML = contentHtml;
    el.modal.classList.add('visible');
    el.modal.style.display = 'flex';
  }

  function hideModal() {
    el.modal.classList.remove('visible');
    el.modal.style.display = 'none';
  }

  function openRecipeModal() {
    const recipes = C.RECIPES;
    const currentRecipe = engine.s.selectedRecipe;
    const machineTier = engine.save.up.machine || 0;

    let html = `
      <div class="eyebrow">BARISTA SELECTION</div>
      <h2>Select Recipe to Brew</h2>
      <div class="recipe-list">
    `;

    recipes.forEach((r) => {
      const locked = machineTier < r.need;
      html += `
        <button class="recipe-card ${r.id === currentRecipe ? 'selected' : ''}" data-recipe="${r.id}" ${locked ? 'disabled' : ''}>
          <div class="card-icon">${r.icon}</div>
          <div class="card-info">
            <strong>${r.name} · $${r.price}</strong>
            <p>${locked ? `(Requires Espresso Machine Tier ${r.need})` : r.desc}</p>
          </div>
        </button>
      `;
    });

    html += `
      </div>
      <button id="closeModalBtn" class="action-btn">Close</button>
    `;

    showModal(html);

    el.panel.querySelectorAll('.recipe-card').forEach((btn) => {
      btn.addEventListener('click', () => {
        const recipeId = btn.getAttribute('data-recipe');
        engine.s.selectedRecipe = recipeId;
        const recipe = recipes.find((r) => r.id === recipeId);
        el.selectedRecipe.textContent = `${recipe.icon} ${recipe.name}`;
        C.sound('click');
        hideModal();
      });
    });

    document.getElementById('closeModalBtn').addEventListener('click', hideModal);
  }

  function openPauseModal() {
    const html = `
      <div class="eyebrow">THE LAST COFFEE SHOP</div>
      <h2>Shift Paused</h2>
      <p>Outside the window, snow quietly dusts the old cobblestone street.</p>
      <div class="modal-buttons">
        <button id="resumeBtn" class="action-btn primary">Resume Shift</button>
        <button id="shopBtn" class="action-btn">Upgrades Shop</button>
        <button id="howToBtn" class="action-btn">How to Play</button>
      </div>
    `;
    showModal(html);

    document.getElementById('resumeBtn').addEventListener('click', () => {
      paused = false;
      el.pauseBtn.textContent = 'Ⅱ';
      hideModal();
    });
    document.getElementById('shopBtn').addEventListener('click', openUpgradesModal);
    document.getElementById('howToBtn').addEventListener('click', openHelpModal);
  }

  function openUpgradesModal() {
    let html = `
      <div class="eyebrow">CAFÉ RENOVATIONS</div>
      <h2>Shop & Equipment</h2>
      <p>Current Funds: <strong style="color:var(--gold);">$${engine.save.money}</strong></p>
      <div class="upgrades-list">
    `;

    C.UPGRADES.forEach((up) => {
      const currentTier = engine.save.up[up.id] || 0;
      const isMax = currentTier >= up.tiers.length;
      const nextTier = !isMax ? up.tiers[currentTier] : null;

      html += `
        <div class="upgrade-item">
          <div>
            <strong>${up.name} (Tier ${currentTier}/${up.tiers.length})</strong>
            <p>${isMax ? 'Fully upgraded.' : nextTier.detail}</p>
          </div>
          <div>
            ${
              isMax
                ? '<span class="pill-max">MAX</span>'
                : `<button class="buy-upgrade-btn" data-up="${up.id}" ${engine.save.money < nextTier.cost ? 'disabled' : ''}>Buy $${nextTier.cost}</button>`
            }
          </div>
        </div>
      `;
    });

    html += `
      </div>
      <button id="closeModalBtn" class="action-btn">Close</button>
    `;

    showModal(html);

    el.panel.querySelectorAll('.buy-upgrade-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const upId = btn.getAttribute('data-up');
        if (engine.buyUpgrade(upId)) {
          world.build();
          openUpgradesModal();
        }
      });
    });

    document.getElementById('closeModalBtn').addEventListener('click', hideModal);
  }

  function openHelpModal() {
    const html = `
      <div class="eyebrow">COZY GUIDE</div>
      <h2>How to Run The Last Coffee Shop</h2>
      <div class="help-content">
        <p><b>1. Greet Guests:</b> Guests arrive and sit at clean tables. Walk to their table to take their order.</p>
        <p><b>2. Brew:</b> Walk over to the Espresso Machine (or press M), select your recipe, and brew coffee.</p>
        <p><b>3. Serve:</b> Bring the warm drinks to the guest's table before their patience runs out.</p>
        <p><b>4. Collect:</b> Once they finish, collect your pay and tips!</p>
        <p><b>5. Wipe Tables:</b> Clean dirty tables so new guests can sit down.</p>
        <p><b>Controls:</b> On mobile, use the on-screen joystick or tap anywhere to move. On keyboard, use WASD and E to interact.</p>
      </div>
      <button id="closeModalBtn" class="action-btn primary">Back to Café</button>
    `;
    showModal(html);
    document.getElementById('closeModalBtn').addEventListener('click', hideModal);
  }

  function openSettingsModal() {
    const html = `
      <div class="eyebrow">PREFERENCES</div>
      <h2>Café Settings</h2>
      <div class="settings-content">
        <p><label><input type="checkbox" id="audioToggle" ${engine.save.audio ? 'checked' : ''}> Sound Effects</label></p>
        <p><label><input type="checkbox" id="motionToggle" ${engine.save.motion ? 'checked' : ''}> Subtle Character Sway & Snow</label></p>
        <p>
          Graphics Mode:
          <select id="qualitySelect">
            <option value="balanced" ${engine.save.quality === 'balanced' ? 'selected' : ''}>Balanced (Recommended)</option>
            <option value="high" ${engine.save.quality === 'high' ? 'selected' : ''}>High Details</option>
            <option value="battery" ${engine.save.quality === 'battery' ? 'selected' : ''}>Battery Saver</option>
          </select>
        </p>
      </div>
      <div class="modal-buttons">
        <button id="saveSettingsBtn" class="action-btn primary">Save</button>
        <button id="shopBtn" class="action-btn">Upgrades</button>
      </div>
    `;
    showModal(html);

    document.getElementById('saveSettingsBtn').addEventListener('click', () => {
      engine.save.audio = document.getElementById('audioToggle').checked;
      engine.save.motion = document.getElementById('motionToggle').checked;
      engine.save.quality = document.getElementById('qualitySelect').value;
      engine.persist();
      world.setQuality();
      hideModal();
      showToast('Settings saved.');
    });
    document.getElementById('shopBtn').addEventListener('click', openUpgradesModal);
  }

  function endOfDayShift() {
    paused = true;
    const stats = engine.s.stats;
    const totalDayEarned = stats.earned + stats.tips;

    const html = `
      <div class="eyebrow">SHIFT COMPLETE</div>
      <h2>Day ${engine.save.day} Wrap-up</h2>
      <p>The street lamps flicker on as the evening snow falls.</p>
      <div class="summary-stats">
        <div class="stat-row"><span>Guests Served:</span><strong>${stats.served}</strong></div>
        <div class="stat-row"><span>Guests Missed:</span><strong>${stats.missed}</strong></div>
        <div class="stat-row"><span>Tables Wiped:</span><strong>${stats.tablesCleaned}</strong></div>
        <div class="stat-row"><span>Drink Earnings:</span><strong>$${stats.earned}</strong></div>
        <div class="stat-row"><span>Tips Received:</span><strong>$${stats.tips}</strong></div>
        <div class="stat-row total"><span>Total Day Income:</span><strong style="color:var(--gold);">$${totalDayEarned}</strong></div>
      </div>
      <div class="modal-buttons">
        <button id="nextDayBtn" class="action-btn primary">Open Day ${engine.save.day + 1}</button>
        <button id="shopBtn" class="action-btn">Spend on Upgrades</button>
      </div>
    `;

    showModal(html);

    document.getElementById('nextDayBtn').addEventListener('click', () => {
      engine.save.day++;
      engine.persist();
      engine.initDay();
      world.build();
      paused = false;
      hideModal();
      showToast(`Welcome to Day ${engine.save.day}!`);
    });

    document.getElementById('shopBtn').addEventListener('click', () => {
      openUpgradesModal();
    });
  }

  // Initialize once DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : this);
