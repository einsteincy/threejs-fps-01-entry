// HUD (DESIGN.md §9 + §13.7): DOM only, never touches the simulation. main.js
// pushes numbers in; this file renders them with last-value guards so the DOM
// is only written when a value changes. Radar is a 140x140 canvas.
const OVERLAY_COPY = {
  start: {
    title: 'DUSKLINE — Flare Yard 7',
    copy: '5v5 tactical FPS. Plant the bomb at Fuel Depot, or eliminate the enemy team. Click to play.',
    action: 'Click to play',
  },
  paused: {
    title: 'PAUSED',
    copy: 'The round is frozen. Click to resume, or press P.',
    action: 'Click to resume',
  },
  round: {
    title: 'Round over',
    copy: '',
    action: 'Next round',
  },
  end: {
    title: 'Match over',
    copy: '',
    action: 'Play again',
  },
};

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const els = {
    overlay: $('overlay'),
    title: $('overlay-title'),
    copy: $('overlay-copy'),
    play: $('play'),
    healthBar: $('health-fill'),
    healthNum: $('health-num'),
    armorBar: $('armor-fill'),
    armorNum: $('armor-num'),
    ammoMag: $('ammo-mag'),
    ammoReserve: $('ammo-reserve'),
    weaponName: $('weapon-name'),
    money: $('money'),
    timer: $('timer'),
    score: $('score-line'),
    plan: $('plan-line'),
    vent: $('vent-line'),
    teamPanel: $('team-panel'),
    radioFeed: $('radio-feed'),
    killFeed: $('kill-feed'),
    radar: $('radar'),
    crosshair: $('crosshair'),
    hitmarker: $('hitmarker'),
    banner: $('banner'),
    bannerTitle: $('banner-title'),
    bannerSub: $('banner-sub'),
    plantBar: $('plant-bar'),
    plantFill: $('plant-fill'),
    plantLabel: $('plant-label'),
    buyMenu: $('buy-menu'),
    buyGrid: $('buy-grid'),
    buyMoney: $('buy-money'),
    buyTimer: $('buy-timer'),
    spectate: $('spectate'),
    spectateName: $('spectate-name'),
    ordersHint: $('orders-hint'),
    vignette: $('damage-vignette'),
    flashOverlay: $('flash-overlay'),
  };
  const radarCtx = els.radar ? els.radar.getContext('2d') : null;
  const last = {};
  let hitTimer = 0;
  let radioLines = [];
  let killLines = [];

  function setText(el, key, value) {
    if (!el || last[key] === value) return;
    last[key] = value;
    el.textContent = value;
  }
  function setWidth(el, key, pct) {
    const v = `${Math.max(0, Math.min(100, pct))}%`;
    if (last[key] === v) return;
    last[key] = v;
    el.style.width = v;
  }
  function fmtTime(seconds) {
    const s = Math.max(0, Math.ceil(seconds));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  const hud = {
    setHealth(hp, armor) {
      setWidth(els.healthBar, 'hpW', hp);
      setText(els.healthNum, 'hp', String(hp));
      setWidth(els.armorBar, 'arW', armor);
      setText(els.armorNum, 'ar', String(armor));
      els.healthBar?.parentElement?.classList.toggle('low', hp <= 30);
    },
    setAmmo(mag, reserve, name) {
      setText(els.ammoMag, 'mag', String(mag));
      setText(els.ammoReserve, 'res', `/ ${reserve}`);
      setText(els.weaponName, 'wname', name ?? '');
      els.ammoMag?.parentElement?.classList.toggle('empty', mag === 0);
    },
    setMoney(value) {
      setText(els.money, 'money', `$${value.toLocaleString('en-US')}`);
    },
    setTimer(seconds, fuse) {
      setText(els.timer, 'timer', fmtTime(seconds));
      els.timer?.classList.toggle('fuse', !!fuse);
    },
    setScore(dusk, bots) {
      setText(els.score, 'score', `DUSK ${dusk} : ${bots} BOTS`);
    },
    setPlan(plan, ordered) {
      setText(els.plan, 'plan', plan ? `PLAN: ${plan}${ordered ? ' — ORDER' : ''}` : '');
    },
    setVent(active) {
      setText(els.vent, 'vent', active ? 'FLARE VENT — SOUND MASKED' : '');
    },
    setCrosshairGap(px) {
      const v = Math.round(px);
      if (last.gap === v) return;
      last.gap = v;
      els.crosshair?.style.setProperty('--gap', `${v}px`);
    },
    hitMarker(killed, holdMs = 90) {
      els.hitmarker?.classList.add('on');
      if (els.hitmarker) {
        els.hitmarker.style.transform = killed
          ? 'translate(-50%, -50%) rotate(45deg) scale(1.3)'
          : '';
      }
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => {
        els.hitmarker?.classList.remove('on');
        if (els.hitmarker) els.hitmarker.style.transform = '';
      }, holdMs);
    },
    damageFlash() {
      if (!els.vignette) return;
      els.vignette.classList.add('on');
      setTimeout(() => els.vignette?.classList.remove('on'), 180);
    },
    flashWhite() {
      if (!els.flashOverlay) return;
      els.flashOverlay.classList.add('on');
      setTimeout(() => els.flashOverlay?.classList.remove('on'), 1200);
    },
    // Teammate panel: 4 rows — callsign, HP bar, weapon, alive/dead, bomb icon.
    setTeammates(rows) {
      if (!els.teamPanel) return;
      const key = JSON.stringify(rows);
      if (last.team === key) return;
      last.team = key;
      els.teamPanel.innerHTML = rows.map((r) => {
        const cls = r.alive ? '' : ' dead';
        const bomb = r.carrier ? ' 💣' : '';
        return `<div class="tm${cls}"><span class="tm-name">${r.name}${bomb}</span>` +
          `<span class="tm-hp"><i style="width:${r.hp}%"></i></span>` +
          `<span class="tm-wpn">${r.weapon}</span></div>`;
      }).join('');
    },
    radio(line, t) {
      radioLines.push({ line, t });
      if (radioLines.length > 6) radioLines.shift();
      if (els.radioFeed) {
        els.radioFeed.innerHTML = radioLines.map((r) => `<div>${r.line}</div>`).join('');
      }
    },
    clearRadio() {
      radioLines = [];
      if (els.radioFeed) els.radioFeed.innerHTML = '';
    },
    killfeed(text) {
      killLines.push(text);
      if (killLines.length > 5) killLines.shift();
      if (els.killFeed) {
        els.killFeed.innerHTML = killLines.map((l) => `<div>${l}</div>`).join('');
      }
      setTimeout(() => {
        killLines = killLines.filter((l) => l !== text);
        if (els.killFeed) els.killFeed.innerHTML = killLines.map((l) => `<div>${l}</div>`).join('');
      }, 4000);
    },
    showBanner(title, sub) {
      setText(els.bannerTitle, 'bT', title);
      setText(els.bannerSub, 'bS', sub ?? '');
      if (els.banner) els.banner.hidden = false;
    },
    hideBanner() {
      if (els.banner) els.banner.hidden = true;
    },
    setPlant(progress, label) {
      if (!els.plantBar) return;
      els.plantBar.hidden = progress === null;
      if (progress !== null) {
        setWidth(els.plantFill, 'plW', progress * 100);
        setText(els.plantLabel, 'plL', label ?? '');
      }
    },
    showOverlay(mode, detail) {
      const text = OVERLAY_COPY[mode];
      if (!text || !els.overlay) return;
      setText(els.title, 'ovT', text.title);
      setText(els.copy, 'ovC', mode === 'round' || mode === 'end' ? (detail ?? text.copy) : text.copy);
      setText(els.play, 'ovP', text.action);
      els.overlay.hidden = false;
      els.play?.focus();
    },
    hideOverlay() {
      if (els.overlay) els.overlay.hidden = true;
    },
    onPlay(handler) {
      els.play?.addEventListener('click', handler);
    },
    setSpectate(name) {
      if (!els.spectate) return;
      if (name) {
        setText(els.spectateName, 'spec', `SPECTATING ${name} — ROUND CONTINUES`);
        els.spectate.hidden = false;
      } else {
        els.spectate.hidden = true;
      }
    },
    // Buy menu: grid of BUY_MENU rows; click buys, keys 1-8 buy too.
    renderBuy(menu, money, timerSeconds, onBuy) {
      if (!els.buyMenu) return;
      els.buyMenu.hidden = false;
      setText(els.buyMoney, 'bMoney', `$${money.toLocaleString('en-US')}`);
      setText(els.buyTimer, 'bTimer', `BUY ${Math.ceil(timerSeconds)}s`);
      const key = JSON.stringify([menu.map((m) => [m.id, m.owned, m.price]), money]);
      if (last.buy === key) return;
      last.buy = key;
      els.buyGrid.innerHTML = menu.map((m) => {
        const afford = money >= m.price && !m.owned;
        const cls = m.owned ? 'owned' : afford ? '' : 'cant';
        return `<button type="button" class="buy-item ${cls}" data-id="${m.id}" ${m.owned || !afford ? 'disabled' : ''}>` +
          `<span class="buy-key">[${m.key}]</span> ${m.label} <b>$${m.price}</b></button>`;
      }).join('');
      els.buyGrid.querySelectorAll('button').forEach((b) => {
        b.addEventListener('click', () => onBuy(b.dataset.id));
      });
    },
    hideBuy() {
      if (els.buyMenu) els.buyMenu.hidden = true;
      last.buy = null;
    },
    // Radar: yard outline, site, player arrow, teammates blue, enemies red
    // when seen/heard else grey, bomb marker, smoke puffs.
    drawRadar(view) {
      if (!radarCtx || !els.radar) return;
      const c = radarCtx;
      const W = els.radar.width;
      const H = els.radar.height;
      c.clearRect(0, 0, W, H);
      c.fillStyle = 'rgba(16,29,31,0.85)';
      c.fillRect(0, 0, W, H);
      const sx = (x) => ((x + 24) / 48) * (W - 12) + 6;
      const sy = (z) => ((z + 16) / 32) * (H - 12) + 6;
      c.strokeStyle = '#1f5f5b';
      c.lineWidth = 1;
      c.strokeRect(sx(-24), sy(-16), sx(24) - sx(-24), sy(16) - sy(-16));
      c.fillStyle = '#b4552a';
      c.fillRect(sx(14), sy(-15), sx(20) - sx(14), sy(-9) - sy(-15));
      c.fillStyle = '#e9e6df';
      c.font = '8px sans-serif';
      c.fillText('A', sx(16.4), sy(-11.4));
      for (const s of view.smokes ?? []) {
        c.fillStyle = 'rgba(154,168,168,0.8)';
        c.beginPath();
        c.arc(sx(s.x), sy(s.z), 7, 0, Math.PI * 2);
        c.fill();
      }
      if (view.bomb) {
        c.fillStyle = '#e8c832';
        c.beginPath();
        c.arc(sx(view.bomb.x), sy(view.bomb.z), 3.5, 0, Math.PI * 2);
        c.fill();
      }
      for (const e of view.enemies ?? []) {
        c.fillStyle = e.seen ? '#ff5a3c' : '#98a0a8';
        c.beginPath();
        c.arc(sx(e.x), sy(e.z), 3, 0, Math.PI * 2);
        c.fill();
      }
      for (const t of view.teammates ?? []) {
        c.fillStyle = '#4db8c9';
        c.beginPath();
        c.arc(sx(t.x), sy(t.z), 3, 0, Math.PI * 2);
        c.fill();
      }
      if (view.player) {
        c.fillStyle = '#e9e6df';
        c.save();
        c.translate(sx(view.player.x), sy(view.player.z));
        c.rotate(-view.player.yaw);
        c.beginPath();
        c.moveTo(0, -5);
        c.lineTo(3.5, 4);
        c.lineTo(-3.5, 4);
        c.closePath();
        c.fill();
        c.restore();
      }
    },
  };
  return hud;
}
