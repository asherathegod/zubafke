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
      level: null,
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

    // Entity HP Update (Party Members & Target Live HP/MaxHP)
    if (type === 'entity.hp' && data) {
      if (gameState.party?.members) {
        const member = gameState.party.members.find(m => m.entityId === data.id);
        if (member) {
          if (data.hp !== undefined) member.hp = data.hp;
          if (data.maxHp !== undefined) member.maxHp = data.maxHp;
          notifyContentScript('PARTY_UPDATED', { party: gameState.party });
        }
      }
      if (data.id === gameState.target?.id) {
        gameState.target.hpCurrent = data.hp;
        if (data.maxHp !== undefined) gameState.target.hpMax = data.maxHp;
        if (gameState.target.hpMax > 0) {
          gameState.target.hpPercent = Math.round((data.hp / gameState.target.hpMax) * 100);
        }
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
      if (gameState.party?.members && Array.isArray(data.members)) {
        const oldMap = new Map(gameState.party.members.map(m => [m.entityId, m]));
        data.members.forEach(newM => {
          const oldM = oldMap.get(newM.entityId);
          if (oldM) {
            if (newM.x == null && oldM.x != null) newM.x = oldM.x;
            if (newM.z == null && oldM.z != null) newM.z = oldM.z;
            if (newM.targetX == null && oldM.targetX != null) newM.targetX = oldM.targetX;
            if (newM.targetZ == null && oldM.targetZ != null) newM.targetZ = oldM.targetZ;
          }
        });
      }
      gameState.party = data;

      // Extract local player level and masteries from party members
      if (Array.isArray(data.members)) {
        const myMember = data.members.find(m =>
          (localPlayerId && m.entityId === localPlayerId) ||
          (gameState.player.name && m.name && m.name.toLowerCase() === gameState.player.name.toLowerCase()) ||
          m.isLeader || m.leader
        );
        if (myMember) {
          if (myMember.level) gameState.player.level = myMember.level;
          if (myMember.name) gameState.player.name = myMember.name;
          if (myMember.entityId) {
            gameState.player.id = myMember.entityId;
            localPlayerId = myMember.entityId;
          }
          if (Array.isArray(myMember.topMasteries)) {
            if (!gameState.player.masteries) gameState.player.masteries = {};
            myMember.topMasteries.forEach(tm => {
              if (tm && tm.masteryId) gameState.player.masteries[tm.masteryId] = tm.level;
            });
          }
          notifyContentScript('GAME_STATE_UPDATE', { player: gameState.player });
        }
      }

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
      if (gameState.target.id && gameState.target.id === data.id) {
        gameState.target.isDead = true;
        gameState.target.hpPercent = 0;
        gameState.target.hpCurrent = 0;
        notifyContentScript('TARGET_DIED', { id: data.id });
      }
      if (gameState.assistTargetId === data.id) {
        gameState.assistTargetId = null;
        notifyContentScript('PARTY_ASSIST_DIED', { id: data.id });
      }
    }

    // Combat Event - Track target damage, 0 HP death, & Party Member Assist
    if (type === 'combat.event' && data) {
      if (gameState.target.id && data.dst === gameState.target.id) {
        gameState.target.hasTarget = true;
        gameState.target.isDead = false;
        gameState.target.lastSeen = Date.now();
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
            const entInfo = getEntityCoords(data.dst);
            notifyContentScript('PARTY_ASSIST_TARGET', {
              targetId: data.dst,
              memberName: assistMember.name,
              targetName: entInfo?.name || 'Canavar',
              targetX: entInfo?.x,
              targetZ: entInfo?.z,
              hpCurrent: data.dstHp ?? entInfo?.hp,
              hpMax: entInfo?.maxHp
            });
          }
        }
      }
    }

    // Auto Windup - Party Assist & Player Attack
    if (type === 'auto.windup' && data) {
      if (data.id === localPlayerId || !localPlayerId) {
        if (data.targetId) {
          gameState.target.id = data.targetId;
          gameState.target.hasTarget = true;
          gameState.target.isDead = false;
          gameState.target.lastSeen = Date.now();
        }
        const windupMs = data.durationMs || data.windupMs || 1000;
        notifyContentScript('PLAYER_CAST_START', { castMs: windupMs, groupId: data.groupId });
      }
      if (gameState.settings?.assistMemberName && gameState.party?.members) {
        const assistMember = gameState.party.members.find(m => m.name && m.name.toLowerCase() === gameState.settings.assistMemberName.toLowerCase());
        if (assistMember && data.id === assistMember.entityId) {
          const isPartyMember = gameState.party.members.some(m => m.entityId === data.targetId);
          if (data.targetId && data.targetId !== localPlayerId && !isPartyMember) {
            gameState.assistTargetId = data.targetId;
            const entInfo = getEntityCoords(data.targetId);
            notifyContentScript('PARTY_ASSIST_TARGET', {
              targetId: data.targetId,
              memberName: assistMember.name,
              targetName: entInfo?.name || 'Canavar',
              targetX: entInfo?.x,
              targetZ: entInfo?.z,
              hpCurrent: entInfo?.hp,
              hpMax: entInfo?.maxHp
            });
          }
        }
      }
    }

    // Cast Start - Capture exact target entity ID & Party Assist
    if (type === 'cast.start' && data) {
      if (data.id === localPlayerId || !localPlayerId) {
        if (data.targetId) {
          gameState.target.id = data.targetId;
          gameState.target.hasTarget = true;
          gameState.target.isDead = false;
          gameState.target.lastSeen = Date.now();
        }
        notifyContentScript('PLAYER_CAST_START', { castMs: data.castMs || 1200, groupId: data.groupId });
      }

      // Assist tracking on cast (filter out friendly buffs/heals on party members!)
      if (gameState.settings?.assistMemberName && gameState.party?.members) {
        const assistMember = gameState.party.members.find(m => m.name && m.name.toLowerCase() === gameState.settings.assistMemberName.toLowerCase());
        if (assistMember && data.id === assistMember.entityId) {
          const isPartyMember = gameState.party.members.some(m => m.entityId === data.targetId);
          if (data.targetId && data.targetId !== localPlayerId && !isPartyMember) {
            gameState.assistTargetId = data.targetId;
            const entInfo = getEntityCoords(data.targetId);
            notifyContentScript('PARTY_ASSIST_TARGET', {
              targetId: data.targetId,
              memberName: assistMember.name,
              targetName: entInfo?.name || 'Canavar',
              targetX: entInfo?.x,
              targetZ: entInfo?.z,
              hpCurrent: entInfo?.hp,
              hpMax: entInfo?.maxHp
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
            const entInfo = getEntityCoords(data.targetId);
            notifyContentScript('PARTY_ASSIST_TARGET', {
              targetId: data.targetId,
              memberName: assistMember.name,
              targetName: entInfo?.name || 'Canavar',
              targetX: entInfo?.x,
              targetZ: entInfo?.z,
              hpCurrent: entInfo?.hp,
              hpMax: entInfo?.maxHp
            });
          }
        }
      }
    }

    // Server Error Packet (e.g. ERR_NOT_FOUND)
    if (type === 'err' && data) {
      console.warn(`%c[Silkroad Bot Pro] ⚠️ Sunucu Hata Paketi (err): [${data.code || 'UNKNOWN'}]`, "color:#ef4444;font-weight:bold;", data);
      if (data.code === 'ERR_NOT_FOUND') {
        const deadId = gameState.target.id;
        gameState.target.hasTarget = false;
        gameState.target.isDead = true;
        gameState.target.id = null;
        if (gameState.assistTargetId === deadId) {
          gameState.assistTargetId = null;
        }
        clearClientTarget();
        notifyContentScript('TARGET_LOST', { id: deadId, reason: 'ERR_NOT_FOUND' });
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
          const coordMatch = txt.match(/^(-?\d{1,7})\s*,\s*(-?\d{1,7})$/);
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

      // Target frame lost: clear target after 450ms of absence (~5 ticks)
      if (!foundTarget) {
        if (gameState.target.hasTarget && (Date.now() - (gameState.target.lastSeen || 0) > 450)) {
          gameState.target.hasTarget = false;
          gameState.target.isDead = true;
          gameState.target.hpPercent = 0;
          gameState.target.id = null;
          gameState.target.name = '';
        }
      }

      // 2b. Player Level Scraper from DOM
      const playerFrames = document.querySelectorAll(
        '[class*="player"], [id*="player"], [class*="hero"], [id*="hero"], [class*="character-info"]'
      );
      for (const pf of playerFrames) {
        if (pf.closest('#sro-bot-host') || pf.closest('.sro-hud-panel')) continue;
        if (pf.offsetParent !== null && pf.innerText) {
          const lvlM = pf.innerText.match(/(?:Lv\.?|Level)\s*(\d+)/i);
          if (lvlM && lvlM[1]) {
            const pLvl = parseInt(lvlM[1], 10);
            if (pLvl > 0 && pLvl <= 150) {
              if (gameState.player.level !== pLvl) {
                gameState.player.level = pLvl;
                notifyContentScript('GAME_STATE_UPDATE', { player: gameState.player });
              }
              break;
            }
          }
        }
      }

      // 2c. Target ID synchronization from Zustand store
      const store = findZustandTargetStore();
      const currentStoreTargetId = store?.getState ? store.getState()?.targetId : (store?.targetId || window.QQ?.getState?.()?.targetId || window.QQ?.targetId);
      if (currentStoreTargetId && gameState.target.hasTarget && !gameState.target.id) {
        gameState.target.id = currentStoreTargetId;
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

      // Cleric Rod (1H) - NEVER match staff!
      if (normalized === 'cleric' || normalized === 'rod') {
        if ((id.includes('rod') || id.includes('cleric') || id.includes('wand') || id.startsWith('eu_crod')) && !id.includes('staff')) {
          return { slot, item };
        }
      }
      // Bard Harp (2H)
      else if (normalized === 'bard' || normalized === 'harp' || normalized === 'eu_harp') {
        if (id.includes('harp') || id.includes('bard') || id.startsWith('eu_harp')) {
          return { slot, item };
        }
      }
      // Wizard Staff (2H)
      else if (normalized === 'wizard' || normalized === 'staff' || normalized === 'eu_tstaff') {
        if (id.includes('staff') || id.includes('wizard') || id.startsWith('eu_tstaff')) {
          return { slot, item };
        }
      }
      // Shield
      else if (normalized === 'shield' || normalized === 'eu_shield' || normalized === 'ch_shield') {
        if (id.includes('shield')) {
          return { slot, item };
        }
      }
      // Warrior 2H Sword
      else if (normalized === 'warrior_2h' || normalized === 'eu_tsword') {
        if (id.includes('tsword') || id.includes('twohand') || id.startsWith('eu_tsword')) {
          return { slot, item };
        }
      }
      // Warrior 1H Sword
      else if (normalized === 'warrior_1h' || normalized === 'eu_sword') {
        if (id.startsWith('eu_sword') || (id.includes('sword') && !id.includes('tsword'))) {
          return { slot, item };
        }
      }
      // Warrior Dual Axe
      else if (normalized === 'axe' || normalized === 'eu_axe') {
        if (id.includes('axe') || id.startsWith('eu_axe')) {
          return { slot, item };
        }
      }
      // Bow
      else if (normalized === 'bow') {
        if (id.includes('bow')) {
          return { slot, item };
        }
      }
      // Spear / Glavie
      else if (normalized === 'spear' || normalized === 'glavie') {
        if (id.includes('spear') || id.includes('glavie')) {
          return { slot, item };
        }
      }
      // Sword / Blade (Chinese)
      else if (normalized === 'sword' || normalized === 'blade') {
        if (id.includes('sword') || id.includes('blade')) {
          return { slot, item };
        }
      }
      else if (id.includes(normalized)) {
        return { slot, item };
      }
    }
    return null;
  }

  function unequipShield() {
    // 1. Find the first empty slot in inventory bag
    const bag = gameState.player.inventory?.bag || [];
    let emptySlot = -1;
    for (let i = 0; i < 160; i++) {
      if (!bag[i] || !bag[i].itemId) {
        emptySlot = i;
        break;
      }
    }

    if (emptySlot >= 0) {
      console.log(`%c[Silkroad Bot Pro] 🛡️ Kalkan Çıkarılıyor: Equip Slot 1 -> Bag Slot ${emptySlot}`, "color:#e74c3c;font-weight:bold;");
      // Opcode 48: inv.move { from: { c: 'equip', i: 1 }, to: { c: 'bag', i: emptySlot } }
      sendPacket({
        t: 'inv.move',
        d: {
          from: { c: 'equip', i: 1 },
          to: { c: 'bag', i: emptySlot }
        }
      });
    }

    // 2. Also simulate contextmenu/click on equipped shield slot in DOM
    try {
      const shieldSlotEl = document.querySelector('.doll-slot.doll-shield, [class*="doll-shield"], [data-slot="shield"]');
      if (shieldSlotEl) {
        shieldSlotEl.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
        shieldSlotEl.click();
      }
    } catch (e) {}
  }

  function equipWeaponByType(type, wantEquipShield = false) {
    const normalized = (type || "").toLowerCase().trim();
    const is2Handed = normalized.includes('staff') || normalized.includes('wizard') || normalized.includes('harp') || normalized.includes('tsword') || normalized.includes('bow') || normalized.includes('spear');

    const doEquip = (slot, itemId) => {
      console.log(`%c[Silkroad Bot Pro] ⚔️ Silah Takılıyor: Slot ${slot} (${itemId})`, "color:#f39c12;font-weight:bold;");
      sendPacket({ t: 'inv.use', d: { bagSlot: slot } });
      sendPacket({
        t: 'inv.move',
        d: {
          from: { c: 'bag', i: slot },
          to: { c: 'equip', i: 0 }
        }
      });
    };

    if (is2Handed) {
      // 1. Unequip shield first so 2-handed weapon can be equipped
      unequipShield();
      // 2. Wait 300ms for server before equipping 2-handed weapon!
      setTimeout(() => {
        const found = findWeaponInBag(type);
        if (found) {
          doEquip(found.slot, found.item.itemId);
        } else if (type === 'auto' || type === 'main') {
          findAndEquipMainFallback(false);
        }
      }, 300);
      return true;
    }

    // 1-Handed weapon (e.g. cleric rod, 1h sword)
    const found = findWeaponInBag(type);
    if (found) {
      doEquip(found.slot, found.item.itemId);
      if (wantEquipShield) {
        setTimeout(() => equipShield(), 300);
      }
      return true;
    }

    if (type === 'auto' || type === 'main') {
      return findAndEquipMainFallback(wantEquipShield);
    }
    return false;
  }

  function findAndEquipMainFallback(wantEquipShield = false) {
    const bag = gameState.player.inventory?.bag || [];
    for (let slot = 0; slot < bag.length; slot++) {
      const item = bag[slot];
      if (!item || !item.itemId) continue;
      const id = item.itemId.toLowerCase();
      const isClericOrBard = id.includes('rod') || id.includes('cleric') || id.includes('wand') || id.includes('harp');
      const isWeapon = id.includes('staff') || id.includes('sword') || id.includes('spear') || id.includes('blade') || id.includes('bow') || id.includes('axe') || id.includes('glavie') || id.includes('tsword');
      if (!isClericOrBard && !id.includes('shield') && isWeapon) {
        const is2H = id.includes('staff') || id.includes('tsword') || id.includes('bow') || id.includes('spear');
        if (is2H) {
          unequipShield();
          setTimeout(() => {
            console.log(`%c[Silkroad Bot Pro] ⚔️ Ana Silaha Dönülüyor (2H): Slot ${slot} (${item.itemId})`, "color:#f39c12;font-weight:bold;");
            sendPacket({ t: 'inv.use', d: { bagSlot: slot } });
            sendPacket({
              t: 'inv.move',
              d: {
                from: { c: 'bag', i: slot },
                to: { c: 'equip', i: 0 }
              }
            });
          }, 300);
        } else {
          console.log(`%c[Silkroad Bot Pro] ⚔️ Ana Silaha Dönülüyor: Slot ${slot} (${item.itemId})`, "color:#f39c12;font-weight:bold;");
          sendPacket({ t: 'inv.use', d: { bagSlot: slot } });
          sendPacket({
            t: 'inv.move',
            d: {
              from: { c: 'bag', i: slot },
              to: { c: 'equip', i: 0 }
            }
          });
          if (wantEquipShield) {
            setTimeout(() => equipShield(), 300);
          }
        }
        return true;
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

  function selectPartyMemberDom(entityId, name) {
    try {
      const cards = document.querySelectorAll('button.party-card, [class*="party-card"], button[class*="party"]');
      for (const card of cards) {
        if (card.closest('#sro-bot-host')) continue;
        let matched = false;

        const fiberKey = Object.keys(card).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
        if (fiberKey && card[fiberKey]) {
          const fiber = card[fiberKey];
          const m = fiber.memoizedProps?.m;
          if (m && (m.entityId === entityId || (name && m.name && m.name.toLowerCase() === name.toLowerCase()))) {
            matched = true;
          }

          if (matched) {
            // Extract & cache QQ store if available in fiber ancestry
            let cur = fiber;
            while (cur && !window.__SRO_TARGET_STORE__) {
              if (cur.memoizedState) {
                let h = cur.memoizedState;
                while (h) {
                  if (isTargetStore(h.memoizedState)) {
                    window.__SRO_TARGET_STORE__ = h.memoizedState;
                    window.QQ = h.memoizedState;
                    break;
                  }
                  h = h.next;
                }
              }
              cur = cur.return;
            }

            if (typeof fiber.memoizedProps?.onClick === 'function') {
              try {
                fiber.memoizedProps.onClick({ preventDefault: () => {}, stopPropagation: () => {} });
              } catch (err) {}
            }
          }
        }

        if (!matched && name && card.innerText) {
          const lines = card.innerText.split('\n').map(s => s.trim().toLowerCase());
          if (lines.includes(name.toLowerCase()) || lines.some(l => l.startsWith(name.toLowerCase()))) {
            matched = true;
          }
        }

        if (matched) {
          card.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, view: window }));
          card.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
          card.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, view: window }));
          card.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
          card.click();
          console.log(`%c[Silkroad Bot Pro] 🎯 Parti Üyesi Seçildi: [${name || entityId}]`, "color:#10b981;font-weight:bold;");
          return true;
        }
      }
    } catch (e) {
      console.warn('[Silkroad Bot Pro] selectPartyMemberDom error:', e);
    }
    return false;
  }

  function getWebpackRequire() {
    if (window.__SRO_WEBPACK_REQ__) return window.__SRO_WEBPACK_REQ__;
    if (typeof window.__webpack_require__ === 'function') {
      window.__SRO_WEBPACK_REQ__ = window.__webpack_require__;
      return window.__SRO_WEBPACK_REQ__;
    }
    try {
      for (const k of Object.keys(window)) {
        if (k.startsWith('webpackChunk') || k.startsWith('webpackJsonp')) {
          const chunk = window[k];
          if (Array.isArray(chunk) && typeof chunk.push === 'function') {
            const probeId = 'sro_probe_' + Math.floor(Math.random() * 1000000);
            chunk.push([
              [probeId],
              {},
              (req) => { window.__SRO_WEBPACK_REQ__ = req; }
            ]);
            if (window.__SRO_WEBPACK_REQ__) return window.__SRO_WEBPACK_REQ__;
          }
        }
      }
    } catch (e) {}
    return null;
  }

  function findGameEntities() {
    if (window.__SRO_GAME_ENTITIES__) return window.__SRO_GAME_ENTITIES__;
    if (window.Q?.entities) {
      window.__SRO_GAME_ENTITIES__ = window.Q.entities;
      return window.__SRO_GAME_ENTITIES__;
    }

    const globals = [window.Q, window.game, window.app, window.Client, window.world, window.engine];
    for (const g of globals) {
      if (g && g.entities && (g.entities instanceof Map || Array.isArray(g.entities) || typeof g.entities === 'object')) {
        window.__SRO_GAME_ENTITIES__ = g.entities;
        return g.entities;
      }
    }

    try {
      const req = getWebpackRequire();
      if (req?.c) {
        for (const mId in req.c) {
          const exp = req.c[mId]?.exports;
          if (!exp) continue;
          if (exp.entities && (exp.entities instanceof Map || Array.isArray(exp.entities) || typeof exp.entities === 'object')) {
            window.__SRO_GAME_ENTITIES__ = exp.entities;
            return exp.entities;
          }
          if (exp.Q?.entities) {
            window.__SRO_GAME_ENTITIES__ = exp.Q.entities;
            return exp.Q.entities;
          }
        }
      }
    } catch (e) {}

    return null;
  }

  function getEntityCoords(id) {
    if (!id) return null;
    const numId = typeof id === 'string' && /^\d+$/.test(id) ? parseInt(id, 10) : id;
    const strId = String(id);

    // 1. Try Q.entities or cached game entities
    try {
      const entities = findGameEntities();
      if (entities) {
        let ent = null;
        if (typeof entities.get === 'function') {
          ent = entities.get(numId) || entities.get(strId) || entities.get(id);
        } else if (Array.isArray(entities)) {
          ent = entities.find(e => e && (e.id === numId || e.id === strId || e.id === id));
        } else if (typeof entities === 'object') {
          ent = entities[numId] || entities[strId] || entities[id];
        }
        if (ent) {
          const x = ent.x ?? ent.position?.x ?? ent.pos?.x ?? ent.transform?.position?.x;
          const z = ent.z ?? ent.position?.z ?? ent.pos?.z ?? ent.transform?.position?.z;
          const y = ent.y ?? ent.position?.y ?? ent.pos?.y;
          if (x != null && z != null) {
            return {
              x: Math.round(x),
              z: Math.round(z),
              y: y != null ? Math.round(y) : null,
              name: ent.name || ent.model?.name,
              hp: ent.hp ?? ent.vitals?.hp,
              maxHp: ent.maxHp ?? ent.vitals?.maxHp
            };
          }
        }
      }
    } catch (e) {}

    // 2. Fallback to gameState.monsters (live network packet tracking)
    if (gameState.monsters) {
      const m = gameState.monsters.get(numId) || gameState.monsters.get(strId) || gameState.monsters.get(id);
      if (m && m.x != null && m.z != null) {
        return {
          x: Math.round(m.x),
          z: Math.round(m.z),
          y: m.y != null ? Math.round(m.y) : null,
          name: m.name,
          hp: m.hp,
          maxHp: m.maxHp
        };
      }
    }

    // 3. Fallback to party members
    if (gameState.party?.members) {
      const mem = gameState.party.members.find(m => m.entityId === numId || m.entityId === strId || m.entityId === id);
      if (mem && mem.x != null && mem.z != null) {
        return {
          x: Math.round(mem.x),
          z: Math.round(mem.z),
          name: mem.name,
          hp: mem.hp,
          maxHp: mem.maxHp
        };
      }
    }

    return null;
  }

  function isTargetStore(obj) {
    if (!obj || (typeof obj !== 'object' && typeof obj !== 'function')) return false;

    // 1. Standard Zustand store hook (useStore with getState)
    if (typeof obj.getState === 'function') {
      try {
        const state = obj.getState();
        if (state && (typeof state.setTarget === 'function' || 'targetId' in state || 'target' in state)) {
          return true;
        }
      } catch (e) {}
    }

    // 2. Direct state object / store with setTarget and (targetId or target)
    if (typeof obj.setTarget === 'function' && ('targetId' in obj || 'target' in obj)) {
      return true;
    }

    // 3. Zustand store with setState and subscribe
    if (typeof obj.setState === 'function' && typeof obj.subscribe === 'function') {
      try {
        if (typeof obj.getState === 'function') {
          const s = obj.getState();
          if (s && ('targetId' in s || typeof s.setTarget === 'function')) return true;
        }
      } catch (e) {}
    }

    return false;
  }

  function findZustandTargetStore() {
    if (window.__SRO_TARGET_STORE__) return window.__SRO_TARGET_STORE__;

    // 1. Check window.QQ and candidate globals
    if (isTargetStore(window.QQ)) {
      window.__SRO_TARGET_STORE__ = window.QQ;
      return window.QQ;
    }

    const candGlobals = [
      window.QQ,
      window.Q?.QQ, window.Q?.targetStore, window.Q?.store, window.Q?.target, window.Q,
      window.targetStore, window.useTargetStore, window.store, window.__STORE__,
      window.game?.targetStore, window.game?.store, window.game?.QQ, window.game,
      window.app?.targetStore, window.app?.store, window.app,
      window.Client?.targetStore, window.Client?.store, window.Client?.QQ, window.Client,
      window.core?.targetStore, window.core?.store, window.core
    ];
    for (const g of candGlobals) {
      if (isTargetStore(g)) {
        window.__SRO_TARGET_STORE__ = g;
        window.QQ = g;
        return g;
      }
    }

    // 2. Search Webpack 5 initialized modules
    try {
      const req = getWebpackRequire();
      if (req?.c) {
        for (const mId in req.c) {
          const exp = req.c[mId]?.exports;
          if (!exp) continue;
          if (isTargetStore(exp)) {
            window.__SRO_TARGET_STORE__ = exp;
            window.QQ = exp;
            return exp;
          }
          if (typeof exp === 'object' || typeof exp === 'function') {
            for (const key of Object.keys(exp)) {
              try {
                const val = exp[key];
                if (isTargetStore(val)) {
                  window.__SRO_TARGET_STORE__ = val;
                  window.QQ = val;
                  return val;
                }
              } catch (e) {}
            }
          }
        }
      }
    } catch (e) {}

    // 3. Search via party card / target frame / action bar React Fibers (fastest, most reliable)
    try {
      const domTargets = document.querySelectorAll(
        'button.party-card, [class*="party-card"], button[class*="party"], [class*="target-frame"], [class*="unit-frame"], [class*="action-bar"], canvas, #root'
      );
      for (const el of domTargets) {
        const fiberKey = Object.keys(el).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
        if (!fiberKey || !el[fiberKey]) continue;

        let cur = el[fiberKey];
        let depth = 0;
        while (cur && depth < 35) {
          depth++;
          // Check memoizedState hooks
          let hook = cur.memoizedState;
          while (hook) {
            if (isTargetStore(hook.memoizedState)) {
              window.__SRO_TARGET_STORE__ = hook.memoizedState;
              window.QQ = hook.memoizedState;
              return hook.memoizedState;
            }
            if (hook.memoizedState?.current && isTargetStore(hook.memoizedState.current)) {
              window.__SRO_TARGET_STORE__ = hook.memoizedState.current;
              window.QQ = hook.memoizedState.current;
              return hook.memoizedState.current;
            }
            if (typeof hook.memoizedState?.getSnapshot === 'function') {
              try {
                const snap = hook.memoizedState.getSnapshot();
                if (isTargetStore(snap)) {
                  window.__SRO_TARGET_STORE__ = snap;
                  window.QQ = snap;
                  return snap;
                }
              } catch (e) {}
            }
            if (isTargetStore(hook.queue)) {
              window.__SRO_TARGET_STORE__ = hook.queue;
              window.QQ = hook.queue;
              return hook.queue;
            }
            hook = hook.next;
          }

          // Check memoizedProps
          if (cur.memoizedProps) {
            for (const key of Object.keys(cur.memoizedProps)) {
              const val = cur.memoizedProps[key];
              if (isTargetStore(val)) {
                window.__SRO_TARGET_STORE__ = val;
                window.QQ = val;
                return val;
              }
            }
          }

          // Check stateNode
          if (cur.stateNode && isTargetStore(cur.stateNode)) {
            window.__SRO_TARGET_STORE__ = cur.stateNode;
            window.QQ = cur.stateNode;
            return cur.stateNode;
          }

          cur = cur.return;
        }
      }
    } catch (e) {}

    // 4. Breadth-First Fiber search from #root
    try {
      const root = document.querySelector('#root') || document.querySelector('#app') || document.body;
      if (root) {
        const fiberKey = Object.keys(root).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactContainer'));
        if (fiberKey && root[fiberKey]) {
          const stack = [root[fiberKey]];
          const visited = new Set();
          let iterations = 0;

          while (stack.length > 0 && iterations < 3000) {
            iterations++;
            const fiber = stack.pop();
            if (!fiber || visited.has(fiber)) continue;
            visited.add(fiber);

            let hook = fiber.memoizedState;
            while (hook) {
              if (isTargetStore(hook.memoizedState)) {
                window.__SRO_TARGET_STORE__ = hook.memoizedState;
                window.QQ = hook.memoizedState;
                return hook.memoizedState;
              }
              if (hook.memoizedState?.current && isTargetStore(hook.memoizedState.current)) {
                window.__SRO_TARGET_STORE__ = hook.memoizedState.current;
                window.QQ = hook.memoizedState.current;
                return hook.memoizedState.current;
              }
              if (typeof hook.memoizedState?.getSnapshot === 'function') {
                try {
                  const snap = hook.memoizedState.getSnapshot();
                  if (isTargetStore(snap)) {
                    window.__SRO_TARGET_STORE__ = snap;
                    window.QQ = snap;
                    return snap;
                  }
                } catch (e) {}
              }
              if (isTargetStore(hook.queue)) {
                window.__SRO_TARGET_STORE__ = hook.queue;
                window.QQ = hook.queue;
                return hook.queue;
              }
              hook = hook.next;
            }

            if (fiber.memoizedProps) {
              for (const key of Object.keys(fiber.memoizedProps)) {
                const val = fiber.memoizedProps[key];
                if (isTargetStore(val)) {
                  window.__SRO_TARGET_STORE__ = val;
                  window.QQ = val;
                  return val;
                }
              }
            }

            if (fiber.stateNode && isTargetStore(fiber.stateNode)) {
              window.__SRO_TARGET_STORE__ = fiber.stateNode;
              window.QQ = fiber.stateNode;
              return fiber.stateNode;
            }

            if (fiber.child) stack.push(fiber.child);
            if (fiber.sibling) stack.push(fiber.sibling);
          }
        }
      }
    } catch (e) {}

    return null;
  }

  // Eager background discovery of native target store
  setTimeout(() => { findZustandTargetStore(); }, 1200);
  setTimeout(() => { findZustandTargetStore(); }, 3500);
  setInterval(() => {
    if (!window.__SRO_TARGET_STORE__) findZustandTargetStore();
  }, 4000);

  function setClientTarget(targetId) {
    if (targetId == null) return false;
    const numId = typeof targetId === 'string' && /^\d+$/.test(targetId) ? parseInt(targetId, 10) : targetId;
    const store = findZustandTargetStore();

    let success = false;
    if (store) {
      try {
        if (typeof store.getState === 'function') {
          const state = store.getState();
          if (typeof state?.setTarget === 'function') {
            state.setTarget(numId);
            success = true;
          }
          if (typeof store.setState === 'function') {
            store.setState({ targetId: numId, target: numId });
            success = true;
          }
        }
        if (typeof store.setTarget === 'function') {
          store.setTarget(numId);
          success = true;
        }
        if (typeof store.setState === 'function' && !success) {
          store.setState({ targetId: numId, target: numId });
          success = true;
        }
      } catch (err) {
        console.warn('[Silkroad Bot Pro] store setTarget error:', err);
      }
    }

    if (window.QQ && window.QQ !== store) {
      try {
        if (typeof window.QQ.getState === 'function') {
          const s = window.QQ.getState();
          if (typeof s?.setTarget === 'function') s.setTarget(numId);
          if (typeof window.QQ.setState === 'function') window.QQ.setState({ targetId: numId, target: numId });
        } else if (typeof window.QQ.setTarget === 'function') {
          window.QQ.setTarget(numId);
        } else if (typeof window.QQ === 'object') {
          window.QQ.targetId = numId;
        }
      } catch (e) {}
    }

    if (store && !window.QQ) {
      window.QQ = store;
    }

    if (success) {
      console.log(`%c[Silkroad Bot Pro] 🎯 Hedef Zustand Store'a aktarıldı: [${numId}]`, "color:#10b981;font-weight:bold;");
    } else {
      console.warn(`[Silkroad Bot Pro] ⚠️ Target store henüz bulunamadı, id: ${numId}`);
    }
    return success;
  }

  function clearClientTarget() {
    const store = findZustandTargetStore();
    if (store) {
      try {
        if (typeof store.getState === 'function') {
          const state = store.getState();
          if (typeof state?.setTarget === 'function') state.setTarget(null);
          if (typeof store.setState === 'function') store.setState({ targetId: null, target: null });
        }
        if (typeof store.setTarget === 'function') store.setTarget(null);
        if (typeof store.setState === 'function') store.setState({ targetId: null, target: null });
      } catch (e) {}
    }
    if (window.QQ) {
      try {
        if (typeof window.QQ.getState === 'function') {
          const s = window.QQ.getState();
          if (typeof s?.setTarget === 'function') s.setTarget(null);
          if (typeof window.QQ.setState === 'function') window.QQ.setState({ targetId: null, target: null });
        } else if (typeof window.QQ.setTarget === 'function') {
          window.QQ.setTarget(null);
        } else if (typeof window.QQ === 'object') {
          window.QQ.targetId = null;
        }
      } catch (e) {}
    }
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
      equipWeaponByType(payload?.weaponType, payload?.equipShield);
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
        // DEFENSE: Never target party members or friendly players during assist/mob combat!
        const isParty = !payload.isPartyMember && gameState.party?.members?.some(m => m.entityId === payload.id);
        if (isParty) {
          console.warn(`[Silkroad Bot Pro] ⚠️ Dost parti üyesi hedef seçilmek istendi, engellendi! Entity ID: ${payload.id}`);
          return;
        }

        gameState.target.id = payload.id;
        gameState.target.hasTarget = true;
        gameState.target.isDead = false;
        gameState.target.lastSeen = Date.now();
        if (payload.hpPercent != null) gameState.target.hpPercent = payload.hpPercent;
        if (payload.name) gameState.target.name = payload.name;

        // 1. Set target in client native Zustand store (QQ)
        setClientTarget(payload.id);

        // 2. Only if explicitly targeting a friendly party member (for resurrection or party buffs), click their DOM card
        if (payload.isPartyMember) {
          selectPartyMemberDom(payload.id, payload.name);
        }

        notifyContentScript('GAME_STATE_UPDATE', { target: gameState.target });

        // NO opcode 18 (target.set)! The official client NEVER sends target.set!
        // When hotbar skill keys (1, 2, 3...) are pressed, the client's t1() function
        // automatically reads QQ.getState().targetId and sends skill.cast / combat.attack!
      }
    } else if (type === 'CLEAR_TARGET') {
      sendPacket({ t: 'combat.stop', d: {} });
      clearClientTarget();
      simulateKeyPress('Escape', 50);
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'F8' || e.code === 'F8') {
      notifyContentScript('TOGGLE_HOTKEY', {});
    }
  }, true);

})();
