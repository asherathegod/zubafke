/**
 * Silkroad Web Macro Bot - Inpage Engine & Live Skill Harvester
 * Runs in the MAIN page execution context.
 */

(function () {
  if (window.__SRO_BOT_INPAGE_INITIALIZED__) return;
  window.__SRO_BOT_INPAGE_INITIALIZED__ = true;

  console.log("%c[Silkroad Bot Pro]%c Native WebSocket Engine, Memory Scanner & Live Skill Harvester Active!", "color:#e67e22;font-weight:bold;", "color:#2ecc71;");

  window.__SRO_BOT_LOG_PACKETS__ = true;

  let activeWs = null;
  let localPlayerId = null;

  // Live dynamic game state
  const gameState = {
    player: {
      id: null,
      name: "Ashera",
      level: 22,
      hp: 621, maxHp: 621, hpPercent: 100,
      mp: 1576, maxMp: 1576, mpPercent: 100,
      str: 41, int: 104, unspentStats: 0,
      gold: 383948,
      x: 5286, z: 3128, y: -15.9,
      inventory: { bag: [], equip: {} }
    },
    target: {
      hasTarget: false,
      id: null,
      name: "",
      level: 0,
      hpCurrent: 0,
      hpMax: 0,
      hpPercent: 0,
      isDead: false,
      lastSeen: 0
    },
    skills: {
      discovered: [], // Dynamically harvested from game memory / DOM / packets
      known: []
    },
    party: {
      partyId: null,
      leaderCharId: null,
      members: []
    },
    uniques: [],
    monsters: new Map(),
    serverTime: 0,
    serverTimeReceivedAt: 0,
    lastTooManyRequestNotified: 0,
    systemLogs: [],
    capturedPackets: [],
    lastItemReceivedTime: 0,
    settings: {
      autoAcceptRes: true,
      assistMemberName: ""
    },
    assistTargetId: null
  };

  /* =========================================================================
   * 1. WEBSOCKET PROXY (Sniffs, Intercepts, & Sends Packets)
   * ========================================================================= */
  try {
    const NativeWebSocket = window.WebSocket;

    window.WebSocket = new Proxy(NativeWebSocket, {
      construct(target, args, newTarget) {
        const ws = Reflect.construct(target, args, newTarget);
        activeWs = ws;
        window.__SRO_ACTIVE_WS__ = ws;

        try {
          ws.addEventListener('message', (event) => {
            try {
              handleIncomingPacket(event.data);
            } catch (e) {}
          });

          const origSend = ws.send;
          ws.send = function (data) {
            try {
              handleOutgoingPacket(data);
            } catch (e) {}
            return origSend.apply(this, arguments);
          };
        } catch (err) {}

        return ws;
      }
    });

    window.WebSocket.prototype = NativeWebSocket.prototype;
    window.WebSocket.CONNECTING = NativeWebSocket.CONNECTING;
    window.WebSocket.OPEN = NativeWebSocket.OPEN;
    window.WebSocket.CLOSING = NativeWebSocket.CLOSING;
    window.WebSocket.CLOSED = NativeWebSocket.CLOSED;
  } catch (e) {}

  function sendPacket(pkg) {
    if (activeWs && activeWs.readyState === WebSocket.OPEN) {
      const payload = typeof pkg === 'string' ? pkg : JSON.stringify(pkg);
      activeWs.send(payload);
      return true;
    }
    return false;
  }

  function recordPacket(dir, pkgObj, rawStr) {
    const record = {
      timestamp: new Date().toLocaleTimeString(),
      timeMs: Date.now(),
      dir: dir,
      type: pkgObj?.t || 'unknown',
      data: pkgObj?.d || null,
      raw: rawStr?.length > 250 ? rawStr.substring(0, 250) + "..." : rawStr
    };

    gameState.capturedPackets.unshift(record);
    if (gameState.capturedPackets.length > 250) gameState.capturedPackets.pop();

    if (window.__SRO_BOT_LOG_PACKETS__) {
      const color = dir === 'SEND' ? 'color:#3498db;font-weight:bold;' : 'color:#9b59b6;font-weight:bold;';
      console.log(`%c[SRO-WS ${dir}] %c${record.type}`, color, 'color:#f1c40f;', record.data || "");
    }

    notifyContentScript('PACKET_CAPTURED', { packet: record });
  }

  function handleIncomingPacket(rawData) {
    if (!rawData || typeof rawData !== 'string') return;

    try {
      const pkg = JSON.parse(rawData);
      recordPacket('RECV', pkg, rawData);

      const type = pkg.t;
      const data = pkg.d;

      // 1. Batch Packets
      if (type === 'batch' && Array.isArray(data)) {
        for (const sub of data) {
          processSubPacket(sub.t, sub.d);
        }
        return;
      }

      // 2. Direct Packets
      processSubPacket(type, data);

    } catch (e) {}
  }

  function processSubPacket(type, data) {
    if (!type || !data) return;

    // Vitals (HP / MP)
    if (type === 'vitals.update') {
      if (data.hp !== undefined) gameState.player.hp = data.hp;
      if (data.mp !== undefined) gameState.player.mp = data.mp;
      if (gameState.player.maxHp > 0) {
        gameState.player.hpPercent = Math.round((gameState.player.hp / gameState.player.maxHp) * 100);
      }
      notifyContentScript('GAME_STATE_UPDATE', { player: gameState.player });
    }

    // Stats & Unspent Points
    if (type === 'stats.update') {
      if (data.base) {
        gameState.player.str = data.base.str || gameState.player.str;
        gameState.player.int = data.base.int || gameState.player.int;
        gameState.player.unspentStats = typeof data.base.unspent === 'number' ? data.base.unspent : 0;
      }
      if (data.derived) {
        gameState.player.maxHp = data.derived.maxHp || gameState.player.maxHp;
        gameState.player.maxMp = data.derived.maxMp || gameState.player.maxMp;
      }
      notifyContentScript('STATS_UPDATED', { player: gameState.player });
    }

    // Level Up Event
    if (type === 'progress.levelUp' && data) {
      if (data.level !== undefined) gameState.player.level = data.level;
      if (data.statPoints !== undefined) gameState.player.unspentStats = data.statPoints;
      notifyContentScript('GAME_STATE_UPDATE', { player: gameState.player });
    }

    // Mastery Update Event (Live level & SP)
    if (type === 'mastery.update' && data) {
      if (!gameState.player.masteries) gameState.player.masteries = {};
      if (data.masteryId) gameState.player.masteries[data.masteryId] = data.level;
      if (data.sp !== undefined) gameState.player.sp = data.sp;
      notifyContentScript('GAME_STATE_UPDATE', { player: gameState.player });
    }

    // Inventory Update
    if (type === 'inv.update') {
      if (data.gold !== undefined) gameState.player.gold = data.gold;
      if (data.bag) gameState.player.inventory.bag = data.bag;
      if (data.equip) gameState.player.inventory.equip = data.equip;
      notifyContentScript('INVENTORY_UPDATED', { inventory: gameState.player.inventory, gold: gameState.player.gold });
    }

    // Entity Move / Stop (Player & Target & Party Coords)
    if (type === 'entity.stop') {
      if (!localPlayerId && data.id) {
        localPlayerId = data.id;
        gameState.player.id = data.id;
      }
      if (data.id === localPlayerId || !localPlayerId) {
        gameState.player.x = data.x ?? gameState.player.x;
        gameState.player.z = data.z ?? gameState.player.z;
        gameState.player.y = data.y ?? gameState.player.y;
        gameState.player.targetX = null;
        gameState.player.targetZ = null;
        notifyContentScript('GAME_STATE_UPDATE', { player: gameState.player });
      }

      if (gameState.party?.members) {
        const member = gameState.party.members.find(m => m.entityId === data.id);
        if (member) {
          member.x = Math.round(data.x ?? member.x);
          member.z = Math.round(data.z ?? member.z);
          member.targetX = null;
          member.targetZ = null;
          notifyContentScript('PARTY_UPDATED', { party: gameState.party });
        }
      }
      if (gameState.monsters && gameState.monsters.has(data.id)) {
        const m = gameState.monsters.get(data.id);
        if (data.x !== undefined) m.x = data.x;
        if (data.z !== undefined) m.z = data.z;
      }
    } else if (type === 'entity.move') {
      if (!localPlayerId && data.id) {
        localPlayerId = data.id;
        gameState.player.id = data.id;
      }
      if (data.id === localPlayerId || !localPlayerId) {
        if (data.tx !== undefined && data.tz !== undefined) {
          gameState.player.targetX = data.tx;
          gameState.player.targetZ = data.tz;
        }
        if (data.x !== undefined) {
          gameState.player.x = data.x;
          gameState.player.z = data.z;
        }
        notifyContentScript('GAME_STATE_UPDATE', { player: gameState.player });
      }

      if (gameState.party?.members) {
        const member = gameState.party.members.find(m => m.entityId === data.id);
        if (member) {
          if (data.tx !== undefined && data.tz !== undefined) {
            member.x = Math.round(data.tx);
            member.z = Math.round(data.tz);
            member.targetX = Math.round(data.tx);
            member.targetZ = Math.round(data.tz);
          } else if (data.x !== undefined) {
            member.x = Math.round(data.x);
            member.z = Math.round(data.z);
          }
          notifyContentScript('PARTY_UPDATED', { party: gameState.party });
        }
      }
      if (gameState.monsters && gameState.monsters.has(data.id)) {
        const m = gameState.monsters.get(data.id);
        if (data.tx !== undefined) m.x = data.tx;
        if (data.tz !== undefined) m.z = data.tz;
        else if (data.x !== undefined) m.x = data.x;
      }
    }

    // Buffs Update directly from server
    if (type === 'buffs.update' && data) {
      if (data.id === localPlayerId || !localPlayerId) {
        gameState.player.buffs = data.buffs || [];
        notifyContentScript('BUFFS_UPDATED', { buffs: gameState.player.buffs });
      }
    }

    if (type === 'state.delta' && data) {
      if (data.buffs && (data.id === localPlayerId || !localPlayerId)) {
        gameState.player.buffs = data.buffs;
        notifyContentScript('BUFFS_UPDATED', { buffs: gameState.player.buffs });
      }
      if (Array.isArray(data.add)) {
        for (const ent of data.add) {
          if (ent && ent.kind === 'monster') {
            gameState.monsters.set(ent.id, ent);
          }
        }
      }
      if (Array.isArray(data.rem)) {
        for (const remId of data.rem) {
          gameState.monsters.delete(remId);
        }
      }
    }

    // Party Update directly from server
    if (type === 'party.update' && data) {
      gameState.party = data;
      notifyContentScript('PARTY_UPDATED', { party: data });
    }

    // Auto Resurrection Offer Received
    if (type === 'revive.offer' && data) {
      console.log("%c[Silkroad Bot Pro] ✝️ Canlandırma (Revive) Teklifi Geldi!", "color:#2ecc71;font-weight:bold;", data);
      notifyContentScript('REVIVE_OFFER_RECEIVED', { offer: data });
      if (gameState.settings?.autoAcceptRes !== false) {
        setTimeout(() => {
          sendPacket({
            t: 'revive.respond',
            d: { offerId: data.offerId, accept: true }
          });
          notifyContentScript('REVIVE_ACCEPTED', { offer: data });
          console.log("%c[Silkroad Bot Pro] ⚡ Canlandırma Teklifi Otomatik Kabul Edildi (accept: true)!", "color:#2ecc71;font-weight:bold;");
        }, 300);
      }
    }

    // Combat Death - Immediate authoritative kill detection
    if (type === 'combat.death' && data) {
      if (gameState.target.id === data.id || !gameState.target.id) {
        gameState.target.isDead = true;
        gameState.target.hpPercent = 0;
        gameState.target.hpCurrent = 0;
        notifyContentScript('TARGET_DIED', { id: data.id });
      }
      if (gameState.assistTargetId === data.id) {
        gameState.assistTargetId = null;
      }
    }

    // Combat Event - Track target damage, 0 HP death, & Party Member Assist
    if (type === 'combat.event' && data) {
      if (gameState.target.id && data.dst === gameState.target.id) {
        if (data.dstHp !== undefined) {
          gameState.target.hpCurrent = data.dstHp;
          if (gameState.target.hpMax > 0) {
            gameState.target.hpPercent = Math.round((data.dstHp / gameState.target.hpMax) * 100);
          }
          if (data.dstHp === 0) {
            gameState.target.isDead = true;
            gameState.target.hpPercent = 0;
            notifyContentScript('TARGET_DIED', { id: data.dst });
          }
        }
      }

      // Party Member Target Assist Sniffer
      if (gameState.settings?.assistMemberName && gameState.party?.members) {
        const assistMember = gameState.party.members.find(m => m.name && m.name.toLowerCase() === gameState.settings.assistMemberName.toLowerCase());
        if (assistMember && (data.src === assistMember.entityId || data.srcId === assistMember.entityId)) {
          const isPartyMember = gameState.party.members.some(m => m.entityId === data.dst);
          if (data.dst && data.dst !== localPlayerId && !isPartyMember) {
            gameState.assistTargetId = data.dst;
            const mInfo = gameState.monsters?.get(data.dst);
            notifyContentScript('PARTY_ASSIST_TARGET', {
              targetId: data.dst,
              memberName: assistMember.name,
              targetName: mInfo?.name || 'Canavar',
              targetX: mInfo?.x,
              targetZ: mInfo?.z,
              hpCurrent: data.dstHp ?? mInfo?.hp,
              hpMax: mInfo?.maxHp
            });
          }
        }
      }
    }

    // Cast Start - Capture exact target entity ID & Party Assist
    if (type === 'cast.start' && data) {
      if (data.targetId && (data.id === localPlayerId || !localPlayerId)) {
        gameState.target.id = data.targetId;
      }

      // Assist tracking on cast (filter out friendly buffs/heals on party members!)
      if (gameState.settings?.assistMemberName && gameState.party?.members) {
        const assistMember = gameState.party.members.find(m => m.name && m.name.toLowerCase() === gameState.settings.assistMemberName.toLowerCase());
        if (assistMember && data.id === assistMember.entityId) {
          const isPartyMember = gameState.party.members.some(m => m.entityId === data.targetId);
          if (data.targetId && data.targetId !== localPlayerId && !isPartyMember) {
            gameState.assistTargetId = data.targetId;
            const mInfo = gameState.monsters?.get(data.targetId);
            notifyContentScript('PARTY_ASSIST_TARGET', {
              targetId: data.targetId,
              memberName: assistMember.name,
              targetName: mInfo?.name || 'Canavar',
              targetX: mInfo?.x,
              targetZ: mInfo?.z,
              hpCurrent: mInfo?.hp,
              hpMax: mInfo?.maxHp
            });
          }
        }
      }
    }

    // Skill Fire - Assist tracking (filter out friendly buffs/heals on party members!)
    if (type === 'skill.fire' && data) {
      if (gameState.settings?.assistMemberName && gameState.party?.members) {
        const assistMember = gameState.party.members.find(m => m.name && m.name.toLowerCase() === gameState.settings.assistMemberName.toLowerCase());
        if (assistMember && data.id === assistMember.entityId) {
          const isPartyMember = gameState.party.members.some(m => m.entityId === data.targetId);
          if (data.targetId && data.targetId !== localPlayerId && !isPartyMember) {
            gameState.assistTargetId = data.targetId;
            const mInfo = gameState.monsters?.get(data.targetId);
            notifyContentScript('PARTY_ASSIST_TARGET', {
              targetId: data.targetId,
              memberName: assistMember.name,
              targetName: mInfo?.name || 'Canavar',
              targetX: mInfo?.x,
              targetZ: mInfo?.z,
              hpCurrent: mInfo?.hp,
              hpMax: mInfo?.maxHp
            });
          }
        }
      }
    }

    // Known Skills Update directly from server
    if (type === 'skills.update' && data.known) {
      data.known.forEach(sk => {
        addDiscoveredSkill({
          id: sk,
          groupId: sk.replace(/_\d+$/, ''),
          name: sk.replace(/_/g, ' ').toUpperCase(),
          source: 'server_packet'
        });
      });
    }

    // Unique Boss Timers
    if (type === 'unique.timers' && data.uniques) {
      gameState.uniques = data.uniques;
      gameState.serverTime = data.serverTime || Date.now();
      gameState.serverTimeReceivedAt = Date.now();
      notifyContentScript('UNIQUES_UPDATED', { uniques: data.uniques, serverTime: gameState.serverTime });
    }
  }

  function handleOutgoingPacket(rawData) {
    if (!rawData || typeof rawData !== 'string') return;
    try {
      const pkg = JSON.parse(rawData);
      recordPacket('SEND', pkg, rawData);

      if (pkg.t === 'move.click' && pkg.d) {
        gameState.player.targetX = pkg.d.x;
        gameState.player.targetZ = pkg.d.z;
      }

      // Live Skill Sniffer: Whenever the user or bot casts a skill, capture its exact groupId!
      if (pkg.t === 'skill.cast' && pkg.d?.groupId) {
        const gid = pkg.d.groupId;
        if (pkg.d.targetId) {
          gameState.target.id = pkg.d.targetId;
        }
        addDiscoveredSkill({
          id: gid,
          groupId: gid,
          name: gid.replace(/_/g, ' ').toUpperCase(),
          source: 'live_cast_packet'
        });
      }

      if (pkg.t === 'skill.learn' && pkg.d?.skillId) {
        const sid = pkg.d.skillId;
        addDiscoveredSkill({
          id: sid,
          groupId: sid.replace(/_\d+$/, ''),
          name: sid.replace(/_/g, ' ').toUpperCase(),
          source: 'live_learn_packet'
        });
      }
    } catch (e) {}
  }

  function addDiscoveredSkill(skillObj) {
    if (!skillObj || !skillObj.groupId) return;
    const exists = gameState.skills.discovered.some(s => s.groupId === skillObj.groupId || s.id === skillObj.id);
    if (!exists) {
      gameState.skills.discovered.push(skillObj);
      if (!gameState.skills.known.includes(skillObj.groupId)) {
        gameState.skills.known.push(skillObj.groupId);
      }
      console.log(`%c[Silkroad Bot Pro] 🎯 Yeni Skill Yakalandı: %c${skillObj.groupId}`, "color:#e67e22;font-weight:bold;", "color:#2ecc71;font-weight:bold;");
      notifyContentScript('SKILLS_DISCOVERED', { skills: gameState.skills.discovered, newSkill: skillObj });
    }
  }


  /* =========================================================================
   * 2. DEEP IN-MEMORY & WEBPACK & DOM GAME SKILL SCANNER
   * ========================================================================= */
  window.scanGameSkills = function () {
    console.log("%c[Silkroad Bot Pro]%c Oyun Belleği & DOM Taranıyor...", "color:#e67e22;font-weight:bold;", "color:#3498db;");
    const foundSkills = [];

    // A. Webpack Bundle Deep Scanner
    try {
      if (window.webpackChunk) {
        Object.keys(window.webpackChunk).forEach(key => {
          try {
            const chunk = window.webpackChunk[key];
            if (Array.isArray(chunk)) {
              chunk.forEach(sub => {
                if (sub && typeof sub === 'object') {
                  searchObjectForSkills(sub, foundSkills);
                }
              });
            }
          } catch (e) {}
        });
      }
    } catch (e) {}

    // B. Global Window Objects Scanner
    const candidateGlobals = ['game', 'app', 'Client', 'store', '__STORE__', 'state', 'skills', 'skillManager', 'SkillDB', 'core', 'Engine'];
    candidateGlobals.forEach(gKey => {
      if (window[gKey] && typeof window[gKey] === 'object') {
        try {
          searchObjectForSkills(window[gKey], foundSkills);
        } catch (e) {}
      }
    });

    // C. Action Bar & Mastery Window DOM Elements Scanner
    try {
      const skillElements = document.querySelectorAll(
        '[data-slot], [data-skill], [data-id], [class*="skill"], [class*="action-slot"], [class*="mastery"] [class*="item"], [class*="quick-slot"]'
      );
      skillElements.forEach(el => {
        const skillId = el.getAttribute('data-skill') || el.getAttribute('data-id') || el.getAttribute('data-key');
        const title = el.getAttribute('title') || el.getAttribute('aria-label') || el.innerText?.trim();

        if (skillId && skillId.length > 2) {
          foundSkills.push({
            id: skillId,
            groupId: skillId.replace(/_\d+$/, ''),
            name: title || skillId.replace(/_/g, ' ').toUpperCase(),
            source: 'dom_action_slot'
          });
        }
      });
    } catch (e) {}

    // Add all unique found skills
    foundSkills.forEach(sk => addDiscoveredSkill(sk));

    console.group("%c[Silkroad Bot Pro] Tarama Tamamlandı! Bulunan Skiller:", "color:#2ecc71;font-weight:bold;");
    console.table(gameState.skills.discovered);
    console.groupEnd();

    notifyContentScript('SKILLS_DISCOVERED', { skills: gameState.skills.discovered });
    return gameState.skills.discovered;
  };

  function searchObjectForSkills(obj, results, depth = 0) {
    if (!obj || depth > 4 || typeof obj !== 'object') return;
    try {
      for (const k in obj) {
        if (!obj.hasOwnProperty(k)) continue;
        const val = obj[k];

        if (typeof val === 'string' && /^(sword|heuksal|pacheon|fire|lightning|cold|blade|spear|bow|skill)_/i.test(val)) {
          results.push({
            id: val,
            groupId: val.replace(/_\d+$/, ''),
            name: val.replace(/_/g, ' ').toUpperCase(),
            source: 'memory_inspection'
          });
        } else if (val && typeof val === 'object') {
          if (val.groupId || val.skillId || (val.id && typeof val.id === 'string' && val.cooldown !== undefined)) {
            const id = val.groupId || val.skillId || val.id;
            results.push({
              id: id,
              groupId: id.replace(/_\d+$/, ''),
              name: val.name || id.replace(/_/g, ' ').toUpperCase(),
              cooldownMs: val.cooldown || val.cooldownMs || 3000,
              castDelayMs: val.castTime || val.castDelayMs || 1000,
              source: 'memory_object'
            });
          } else {
            searchObjectForSkills(val, results, depth + 1);
          }
        }
      }
    } catch (e) {}
  }

  // Auto scan on load & after delay
  setTimeout(() => window.scanGameSkills(), 2000);
  setTimeout(() => window.scanGameSkills(), 6000);


  /* =========================================================================
   * 3. LIVE DOM HUD & TARGET SCRAPER
   * ========================================================================= */
  function scrapeDomHud() {
    try {
      // 1. Live Coordinates Scraper
      const allTextNodes = document.querySelectorAll('div, span, p, label');
      for (const el of allTextNodes) {
        if (el.children.length === 0 && el.innerText) {
          const txt = el.innerText.trim();
          const coordMatch = txt.match(/^(\d{3,6})\s*,\s*(\d{3,6})$/);
          if (coordMatch) {
            gameState.player.x = parseInt(coordMatch[1], 10);
            gameState.player.z = parseInt(coordMatch[2], 10);
            break;
          }
        }
      }

      // 2. Exact Target Frame Scraper
      const targetFrames = document.querySelectorAll(
        '[class*="target"], [id*="target"], [class*="enemy"], [id*="enemy"], [class*="unit-frame"]:not([class*="player"])'
      );
      let foundTarget = false;

      for (const el of targetFrames) {
        if (el.closest('#sro-bot-host') || el.closest('.sro-hud-panel')) continue;

        if (el.offsetParent !== null && el.offsetWidth > 35 && el.offsetHeight > 15) {
          const text = el.innerText || "";
          const fractionMatch = text.match(/(\d+)\s*\/\s*(\d+)/);
          let calculatedHpPct = null;
          let currentHpVal = 0;
          let maxHpVal = 0;

          if (fractionMatch) {
            currentHpVal = parseInt(fractionMatch[1], 10);
            maxHpVal = parseInt(fractionMatch[2], 10);
            if (maxHpVal > 0) {
              calculatedHpPct = Math.round((currentHpVal / maxHpVal) * 100);
            }
          }

          if (calculatedHpPct === null) {
            const hpBar = el.querySelector('[class*="hp"], [class*="health"], [class*="bar"], [role="progressbar"]');
            if (hpBar) {
              const w = hpBar.style.width || hpBar.getAttribute('aria-valuenow') || "";
              if (w.includes('%')) calculatedHpPct = Math.round(parseFloat(w));
            }
          }

          const finalHpPct = calculatedHpPct !== null ? Math.max(0, Math.min(100, calculatedHpPct)) : 100;
          const isTargetDead = (currentHpVal === 0 && maxHpVal > 0) || (calculatedHpPct !== null && calculatedHpPct <= 0);

          const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
          const nameMatch = text.match(/([a-zA-Z0-9_\u00C0-\u017F\s]{2,24})\s*(?:Lv\.?|Level)?\s*(\d+)?/i);

          gameState.target.hasTarget = true;
          gameState.target.name = nameMatch ? nameMatch[1].replace(/Lv\s*\d+/i, '').trim() : (lines[0] || "Canavar");
          gameState.target.level = nameMatch && nameMatch[2] ? parseInt(nameMatch[2], 10) : (gameState.target.level || 0);
          gameState.target.hpCurrent = currentHpVal;
          gameState.target.hpMax = maxHpVal;
          gameState.target.hpPercent = finalHpPct;
          gameState.target.isDead = isTargetDead;
          gameState.target.lastSeen = Date.now();
          foundTarget = true;
          break;
        }
      }

      // ONLY declare dead / lost if absent continuously for more than 4000ms!
      if (!foundTarget) {
        if (gameState.target.hasTarget && (Date.now() - gameState.target.lastSeen > 4000)) {
          gameState.target.hasTarget = false;
          gameState.target.isDead = true;
          gameState.target.hpPercent = 0;
        }
      }

      // 3. System Log & Toast Monitor
      const sysLogBox = document.querySelector('[class*="system"], [id*="system"], [class*="chat-log"], [class*="log-container"], .chat-messages');
      if (sysLogBox) {
        const lastEntry = sysLogBox.querySelector('li:last-child, p:last-child, div:last-child');
        if (lastEntry && lastEntry.innerText) {
          const logText = lastEntry.innerText.trim();
          if (logText && !gameState.systemLogs.includes(logText)) {
            gameState.systemLogs.unshift(logText);
            if (gameState.systemLogs.length > 20) gameState.systemLogs.pop();
            
            if (/gold|altın|drop|item|kazandın|aldın|picked/i.test(logText)) {
              gameState.lastItemReceivedTime = Date.now();
              notifyContentScript('ITEM_DROPPED', { item: logText, timestamp: Date.now() });
            }

            if (/too many requests|slow down/i.test(logText)) {
              const now = Date.now();
              if (now - (gameState.lastTooManyRequestNotified || 0) > 1500) {
                gameState.lastTooManyRequestNotified = now;
                notifyContentScript('TOO_MANY_REQUESTS', { reason: logText });
              }
            }
          }
        }
      }


      // 4. Auto Res Accept DOM Fallback & Wait For Help Automation
      if (gameState.settings?.autoAcceptRes !== false) {
        // A. If death overlay appears (we died), automatically click "Wait for help" so we don't go to town!
        const deathOverlay = document.querySelector('.death-overlay');
        if (deathOverlay) {
          const btns = deathOverlay.querySelectorAll('button');
          btns.forEach(b => {
            const txt = (b.innerText || "").toLowerCase();
            if (txt.includes('wait') || txt.includes('help') || txt.includes('bekle') || txt.includes('yardım')) {
              b.click();
            }
          });
        }

        // B. If resurrection offer prompt appears on screen, click "Accept"
        const reviveToast = document.querySelector('.revive-offer, .prompt-toast');
        if (reviveToast) {
          const btns = reviveToast.querySelectorAll('button');
          btns.forEach(b => {
            const txt = (b.innerText || "").toLowerCase();
            if (txt.includes('accept') || txt.includes('kabul') || txt.includes('evet') || txt.includes('yes') || txt.includes('ok')) {
              b.click();
            }
          });
        }
      }

      notifyContentScript('GAME_STATE_UPDATE', {
        player: gameState.player,
        target: gameState.target,
        skills: gameState.skills,
        lastItemReceivedTime: gameState.lastItemReceivedTime
      });

    } catch (e) {}
  }

  setInterval(scrapeDomHud, 80);


  /* =========================================================================
   * 4. GLOBAL CONSOLE UTILITIES
   * ========================================================================= */
  window.dumpSkills = () => {
    return window.scanGameSkills();
  };

  window.dumpCapturedPackets = () => {
    console.group("%c[Silkroad Bot] Son Yakalanan Paketler", "color:#9b59b6;font-weight:bold;");
    console.table(gameState.capturedPackets.slice(0, 30));
    console.groupEnd();
    return gameState.capturedPackets;
  };


  /* =========================================================================
   * 5. KEYBOARD & MOUSE EVENT SIMULATORS
   * ========================================================================= */
  function getGameCanvas() {
    const canvases = document.querySelectorAll('canvas');
    if (canvases.length > 0) {
      let largest = canvases[0];
      let maxArea = 0;
      canvases.forEach(c => {
        const rect = c.getBoundingClientRect();
        const area = rect.width * rect.height;
        if (area > maxArea) {
          maxArea = area;
          largest = c;
        }
      });
      return largest;
    }
    return document.body;
  }

  function simulateMouseClick(options = {}) {
    const canvas = getGameCanvas();
    const rect = canvas.getBoundingClientRect();

    let clientX, clientY;
    if (options.isRelative) {
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      clientX = centerX + (options.offsetX || 0);
      clientY = centerY + (options.offsetY || 0);
    } else {
      clientX = rect.left + rect.width / 2;
      clientY = rect.top + rect.height / 2;
    }

    clientX = Math.max(rect.left + 50, Math.min(rect.right - 50, clientX));
    clientY = Math.max(rect.top + 50, Math.min(rect.bottom - 50, clientY));

    const mouseInit = {
      bubbles: true, cancelable: true, view: window,
      clientX: clientX, clientY: clientY, button: 0, buttons: 1
    };

    try { canvas.dispatchEvent(new PointerEvent('pointerdown', mouseInit)); } catch (e) {}
    canvas.dispatchEvent(new MouseEvent('mousedown', mouseInit));

    setTimeout(() => {
      try { canvas.dispatchEvent(new PointerEvent('pointerup', mouseInit)); } catch (e) {}
      canvas.dispatchEvent(new MouseEvent('mouseup', mouseInit));
      canvas.dispatchEvent(new MouseEvent('click', mouseInit));
    }, 40);
  }

  const KEY_MAP = {
    'Tab': { key: 'Tab', code: 'Tab', keyCode: 9, which: 9 },
    'Space': { key: ' ', code: 'Space', keyCode: 32, which: 32 },
    ' ': { key: ' ', code: 'Space', keyCode: 32, which: 32 },
    'Enter': { key: 'Enter', code: 'Enter', keyCode: 13, which: 13 },
    '1': { key: '1', code: 'Digit1', keyCode: 49, which: 49 },
    '2': { key: '2', code: 'Digit2', keyCode: 50, which: 50 },
    '3': { key: '3', code: 'Digit3', keyCode: 51, which: 51 },
    '4': { key: '4', code: 'Digit4', keyCode: 52, which: 52 },
    '5': { key: '5', code: 'Digit5', keyCode: 53, which: 53 },
    '6': { key: '6', code: 'Digit6', keyCode: 54, which: 54 },
    '7': { key: '7', code: 'Digit7', keyCode: 55, which: 55 },
    '8': { key: '8', code: 'Digit8', keyCode: 56, which: 56 },
    '9': { key: '9', code: 'Digit9', keyCode: 57, which: 57 },
    '0': { key: '0', code: 'Digit0', keyCode: 48, which: 48 },
    'F1': { key: 'F1', code: 'F1', keyCode: 112, which: 112 },
    'F2': { key: 'F2', code: 'F2', keyCode: 113, which: 113 },
    'F3': { key: 'F3', code: 'F3', keyCode: 114, which: 114 },
    'F4': { key: 'F4', code: 'F4', keyCode: 115, which: 115 },
    'F8': { key: 'F8', code: 'F8', keyCode: 119, which: 119 }
  };

  function simulateKeyPress(keyStr, durationMs = 45) {
    if (keyStr === 'Escape' || keyStr === 'Esc') return;

    const keyInfo = KEY_MAP[keyStr] || { key: keyStr, code: keyStr, keyCode: 0, which: 0 };
    const canvas = getGameCanvas();

    const eventInit = {
      key: keyInfo.key, code: keyInfo.code, keyCode: keyInfo.keyCode, which: keyInfo.which,
      bubbles: true, cancelable: true, view: window
    };

    const createEvt = (type) => {
      const evt = new KeyboardEvent(type, eventInit);
      Object.defineProperty(evt, 'keyCode', { get: () => keyInfo.keyCode });
      Object.defineProperty(evt, 'which', { get: () => keyInfo.which });
      return evt;
    };

    canvas.dispatchEvent(createEvt('keydown'));
    window.dispatchEvent(createEvt('keydown'));
    document.dispatchEvent(createEvt('keydown'));

    if (keyInfo.key.length === 1) canvas.dispatchEvent(createEvt('keypress'));

    setTimeout(() => {
      canvas.dispatchEvent(createEvt('keyup'));
      window.dispatchEvent(createEvt('keyup'));
      document.dispatchEvent(createEvt('keyup'));
    }, Math.max(20, durationMs));
  }

  /* =========================================================================
   * 6. AUTO WEAPON SWAP HELPER (Cleric / Bard / Wizard / Warrior)
   * ========================================================================= */
  function findWeaponInBag(type) {
    const bag = gameState.player.inventory?.bag || [];
    const normalized = (type || "").toLowerCase().trim();
    if (!normalized || normalized === 'auto') return null;

    for (let slot = 0; slot < bag.length; slot++) {
      const item = bag[slot];
      if (!item || !item.itemId) continue;
      const id = item.itemId.toLowerCase();

      if (normalized === 'cleric' || normalized === 'rod' || normalized === 'eu_staff') {
        if (id.startsWith('eu_staff') || id.includes('cleric') || id.includes('wand')) {
          return { slot, item };
        }
      } else if (normalized === 'bard' || normalized === 'harp' || normalized === 'eu_harp') {
        if (id.startsWith('eu_harp') || id.includes('harp')) {
          return { slot, item };
        }
      } else if (normalized === 'wizard' || normalized === 'staff' || normalized === 'eu_tstaff') {
        if (id.startsWith('eu_tstaff') || id.includes('staff')) {
          return { slot, item };
        }
      } else if (normalized === 'shield' || normalized === 'eu_shield' || normalized === 'ch_shield') {
        if (id.includes('shield')) {
          return { slot, item };
        }
      } else if (normalized === 'warrior_2h' || normalized === 'eu_tsword') {
        if (id.startsWith('eu_tsword') || id.includes('tsword')) {
          return { slot, item };
        }
      } else if (normalized === 'warrior_1h' || normalized === 'eu_sword') {
        if (id.startsWith('eu_sword') || (id.includes('sword') && !id.includes('tsword'))) {
          return { slot, item };
        }
      } else if (normalized === 'axe' || normalized === 'eu_axe') {
        if (id.startsWith('eu_axe')) {
          return { slot, item };
        }
      } else if (normalized === 'bow' || id.includes('bow')) {
        if (id.includes('bow')) {
          return { slot, item };
        }
      } else if (id.includes(normalized)) {
        return { slot, item };
      }
    }
    return null;
  }

  function equipWeaponByType(type) {
    const found = findWeaponInBag(type);
    if (found) {
      console.log(`%c[Silkroad Bot Pro] ⚔️ Silah Değiştiriliyor: [${type.toUpperCase()}] -> Slot ${found.slot} (${found.item.itemId})`, "color:#f39c12;font-weight:bold;");
      sendPacket({
        t: 'inv.use',
        d: { bagSlot: found.slot }
      });
      return true;
    }
    // Fallback: If 'auto' or main weapon, pick the first weapon in bag that is not a rod/harp
    if (type === 'auto' || type === 'main') {
      const bag = gameState.player.inventory?.bag || [];
      for (let slot = 0; slot < bag.length; slot++) {
        const item = bag[slot];
        if (!item || !item.itemId) continue;
        const id = item.itemId.toLowerCase();
        if ((id.startsWith('eu_') || id.startsWith('ch_')) && !id.startsWith('eu_staff') && !id.startsWith('eu_harp') && !id.includes('shield')) {
          console.log(`%c[Silkroad Bot Pro] ⚔️ Ana Silaha Dönülüyor: Slot ${slot} (${item.itemId})`, "color:#f39c12;font-weight:bold;");
          sendPacket({ t: 'inv.use', d: { bagSlot: slot } });
          return true;
        }
      }
    }
    return false;
  }

  function equipShield() {
    const found = findWeaponInBag('shield');
    if (found) {
      console.log(`%c[Silkroad Bot Pro] 🛡️ Kalkan Takılıyor: Slot ${found.slot} (${found.item.itemId})`, "color:#3498db;font-weight:bold;");
      sendPacket({
        t: 'inv.use',
        d: { bagSlot: found.slot }
      });
      return true;
    }
    return false;
  }

  /* =========================================================================
   * 7. SPEED SCROLL & TARGET STORE HELPERS
   * ========================================================================= */
  function findSpeedScrollInBag() {
    const bag = gameState.player.inventory?.bag || [];
    for (let slot = 0; slot < bag.length; slot++) {
      const item = bag[slot];
      if (!item || !item.itemId) continue;
      const id = (item.itemId || "").toLowerCase();
      const name = (item.name || "").toLowerCase();
      if (
        id === 'speed_potion_01' ||
        id.startsWith('speed_potion') ||
        id.includes('speed') ||
        id.includes('movement') ||
        name.includes('scroll of movement') ||
        name.includes('speed potion') ||
        name.includes('drug of typhoon')
      ) {
        return { slot, item };
      }
    }
    return null;
  }

  function findZustandTargetStore() {
    if (window.__SRO_TARGET_STORE__) return window.__SRO_TARGET_STORE__;
    try {
      const root = document.querySelector('#root') || document.body;
      if (!root) return null;
      const fiberKey = Object.keys(root).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactContainer'));
      if (!fiberKey) return null;

      const stack = [root[fiberKey]];
      const visited = new Set();
      let iterations = 0;

      while (stack.length > 0 && iterations < 2500) {
        iterations++;
        const fiber = stack.pop();
        if (!fiber || visited.has(fiber)) continue;
        visited.add(fiber);

        let hook = fiber.memoizedState;
        while (hook) {
          if (hook.memoizedState && typeof hook.memoizedState === 'object') {
            if (typeof hook.memoizedState.setTarget === 'function') {
              window.__SRO_TARGET_STORE__ = hook.memoizedState;
              return window.__SRO_TARGET_STORE__;
            }
          }
          hook = hook.next;
        }

        if (fiber.memoizedProps) {
          for (const key of Object.keys(fiber.memoizedProps)) {
            const val = fiber.memoizedProps[key];
            if (val && typeof val.setTarget === 'function') {
              window.__SRO_TARGET_STORE__ = val;
              return window.__SRO_TARGET_STORE__;
            }
          }
        }

        if (fiber.child) stack.push(fiber.child);
        if (fiber.sibling) stack.push(fiber.sibling);
      }
    } catch (e) {}
    return null;
  }

  function notifyContentScript(type, payload) {
    window.postMessage({
      source: 'sro-bot-inpage',
      type: type,
      payload: payload
    }, '*');
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data || event.data.source !== 'sro-bot-content') return;
    const { type, payload } = event.data;

    if (type === 'DISPATCH_KEY') {
      simulateKeyPress(payload.key, payload.duration || 45);
    } else if (type === 'DISPATCH_CLICK') {
      simulateMouseClick(payload);
    } else if (type === 'SEND_PACKET') {
      sendPacket(payload);
    } else if (type === 'SCAN_SKILLS_REQUEST') {
      window.scanGameSkills();
    } else if (type === 'SWAP_WEAPON') {
      equipWeaponByType(payload?.weaponType);
      if (payload?.equipShield) {
        setTimeout(() => equipShield(), 180);
      }
    } else if (type === 'SET_ASSIST_CONFIG') {
      if (payload?.assistMemberName !== undefined) gameState.settings.assistMemberName = payload.assistMemberName;
      if (payload?.autoAcceptRes !== undefined) gameState.settings.autoAcceptRes = payload.autoAcceptRes;
    } else if (type === 'USE_SPEED_SCROLL') {
      const found = findSpeedScrollInBag();
      if (found) {
        console.log(`%c[Silkroad Bot Pro] ⚡ Hızlı Koşma Scrollu Basılıyor: Slot ${found.slot} (${found.item.name || found.item.itemId})`, "color:#38bdf8;font-weight:bold;");
        sendPacket({
          t: 'inv.use',
          d: { bagSlot: found.slot }
        });
        notifyContentScript('SPEED_SCROLL_USED', { slot: found.slot, item: found.item });
      }
    } else if (type === 'SET_TARGET_ENTITY') {
      if (payload?.id) {
        gameState.target.id = payload.id;
        gameState.target.hasTarget = true;
        gameState.target.isDead = false;
        try {
          const store = findZustandTargetStore();
          if (store?.setTarget) {
            store.setTarget(payload.id);
          }
        } catch (e) {}
      }
    } else if (type === 'CLEAR_TARGET') {
      sendPacket({ t: 'combat.stop', d: {} });
      try {
        const store = findZustandTargetStore();
        if (store?.setTarget) store.setTarget(null);
      } catch (e) {}
      simulateKeyPress('Escape', 50);
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'F8' || e.code === 'F8') {
      notifyContentScript('TOGGLE_HOTKEY', {});
    }
  }, true);

})();
