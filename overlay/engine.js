/**
 * Silkroad Web Macro Bot - Fast, Reliable Keyboard Combat Engine & Auto-Progression
 * With Strict Giant Lock, European/Chinese Masteries, Dynamic Buffs & Party Buffs,
 * Auto Res, Hunting Area Range Limit & Return to Center, and Anti-Stuck Rate Limiting
 */

class SroBotEngine {
  constructor(keyDispatcher, clickDispatcher, packetDispatcher, weaponDispatcher, assistConfigDispatcher, targetDispatcher, clearTargetDispatcher, speedScrollDispatcher) {
    this.speedScrollDispatcher = speedScrollDispatcher || (() => {
      window.postMessage({ source: 'sro-bot-content', type: 'USE_SPEED_SCROLL' }, '*');
    });
    this.keyDispatcher = keyDispatcher || ((key, duration) => {
      window.postMessage({ source: 'sro-bot-content', type: 'DISPATCH_KEY', payload: { key, duration } }, '*');
    });

    this.clickDispatcher = clickDispatcher || ((options) => {
      window.postMessage({ source: 'sro-bot-content', type: 'DISPATCH_CLICK', payload: options }, '*');
    });

    this.packetDispatcher = packetDispatcher || ((pkg) => {
      window.postMessage({ source: 'sro-bot-content', type: 'SEND_PACKET', payload: pkg }, '*');
    });

    this.weaponDispatcher = weaponDispatcher || ((payload) => {
      window.postMessage({ source: 'sro-bot-content', type: 'SWAP_WEAPON', payload }, '*');
    });

    this.assistConfigDispatcher = assistConfigDispatcher || ((payload) => {
      window.postMessage({ source: 'sro-bot-content', type: 'SET_ASSIST_CONFIG', payload }, '*');
    });

    this.targetDispatcher = targetDispatcher || ((payload) => {
      window.postMessage({ source: 'sro-bot-content', type: 'SET_TARGET_ENTITY', payload }, '*');
    });

    this.clearTargetDispatcher = clearTargetDispatcher || (() => {
      window.postMessage({ source: 'sro-bot-content', type: 'CLEAR_TARGET' }, '*');
    });

    this.audio = new (window.BotAudioSynth || class {
      playStart() {} playStop() {} playAlert() {} playRareDrop() {} playDeath() {} playClick() {} setVolume() {} setEnabled() {}
    })();

    this.running = false;
    this.paused = false;
    this.state = 'IDLE';

    this.lastSpeedScrollUsedTime = 0;
    this.speedScrollDurationMs = 3600000; // 60 min for Beginner scroll of movement
    this.lastStatAllocateTime = 0;
    this.lastMasteryUpgradeTime = 0;

    // Live Telemetry
    this.telemetry = {
      player: { id: null, name: "Ashera", level: 22, hp: 621, maxHp: 621, hpPercent: 100, mp: 1576, maxMp: 1576, mpPercent: 100, str: 41, int: 104, unspentStats: 0, x: 5286, z: 3128, y: -15.9, gold: 383948, inventory: { bag: [], equip: {} } },
      target: { hasTarget: false, id: null, name: "", level: 0, hpCurrent: 0, hpMax: 0, hpPercent: 0, isDead: false },
      party: { partyId: null, leaderCharId: null, members: [] },
      assistTarget: null,
      uniques: [],
      recentDrops: [],
      systemLogs: [],
      capturedPackets: [],
      lastItemReceivedTime: 0
    };

    this.config = this.getDefaultConfig();
    this.stats = {
      startTime: null,
      totalRunTimeMs: 0,
      mobsDefeated: 0,
      skillsCast: 0,
      dropsCollected: 0,
      actionsCount: 0,
      actionTimestamps: [],
      apm: 0
    };

    this.buffTimers = {};
    this.lastResAttemptTime = 0;
    this.lastTraceMoveTime = 0;
    this.buffExecutionInProgress = false;
    this.blacklistedTargets = new Map(); // targetId -> expiry timestamp
    this.rateLimitBackoffUntil = 0;
    this.targetEngagedTime = 0;
    this.targetLastDamageTime = 0;
    this.throttlePenaltyMs = 0; // Dynamically added delay when rate limit occurs
    this.consecutiveRateLimits = 0;
    this.lastRateLimitTime = 0;
    this.lastActionOrProgressTime = Date.now();

    // Callbacks
    this.onStateChange = null;
    this.onStatsUpdate = null;
    this.onLog = null;
    this.onTelemetryUpdate = null;
  }

  getDefaultConfig() {
    return {
      profileName: "Dengeli Farm & Auto Stat",
      targeting: {
        key: "Tab",
        searchDelayMs: 400,
        mobStallTimeoutSec: 35, // Strict Giant lock: up to 35s if damage is continuous
        stuckTimeoutSec: 18 // Target abandoned if ZERO damage dealt in 5 seconds
      },
      combat: {
        skillKeySequence: "1,2,3,4",
        keyDelayMs: 280
      },
      hunting: {
        rangeEnabled: true,
        radius: 35, // meters
        returnToCenter: true,
        attackOutsideRange: false,
        centerX: null,
        centerZ: null
      },
      buffs: {
        autoWeaponSwap: false,
        mainWeapon: "auto",
        buffWeapon: "cleric",
        equipShield: true,
        autoSpeedScroll: true
      },
      buffList: [
        { id: "b_imbue", name: "Silah İmbue", enabled: true, page: "current", slot: "5", intervalSec: 16, targetType: "self", partyMemberName: "", weaponReq: "none", castDelayMs: 350 },
        { id: "b_def", name: "Defans Buffı", enabled: true, page: "current", slot: "6", intervalSec: 120, targetType: "self", partyMemberName: "", weaponReq: "none", castDelayMs: 400 },
        { id: "b_speed", name: "Hız / Mana Shield", enabled: true, page: "F1", slot: "7", intervalSec: 300, targetType: "self", partyMemberName: "", weaponReq: "none", castDelayMs: 400 }
      ],
      party: {
        autoTraceEnabled: false,
        traceTargetName: "",
        traceDistance: 7,
        autoResEnabled: false,
        autoAcceptRes: true,
        resPage: "F2",
        resSlot: "8",
        assistEnabled: false,
        assistMemberName: ""
      },
      looting: {
        enabled: true,
        key: "Space",
        spaceBurstCount: 10,
        burstIntervalMs: 160,
        dynamicLogStopMs: 500
      },
      autoProgression: {
        autoStatEnabled: false,
        statBuild: "pure_int",
        autoMasteryEnabled: false,
        race: "chinese",
        masteries: {
          lightning: false,
          fire: false,
          cold: false,
          heuksal: false,
          bicheon: false,
          pacheon: false,
          warrior: false,
          wizard: false,
          rogue: false,
          warlock: false,
          bard: false,
          cleric: false
        }
      },
      humanizer: {
        jitterPercent: 12
      },
      alerts: {
        soundEnabled: true,
        volume: 0.5
      }
    };
  }

  log(tag, msg, level = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    if (this.onLog) {
      this.onLog({ timestamp, tag, msg, level });
    }
  }

  setState(newState) {
    if (this.state !== newState) {
      this.state = newState;
      if (this.onStateChange) {
        this.onStateChange(this.state);
      }
    }
  }

  applyJitter(ms) {
    const jitterFactor = (this.config.humanizer?.jitterPercent || 12) / 100;
    const variation = (Math.random() * 2 - 1) * jitterFactor;
    return Math.max(20, Math.round(ms * (1 + variation)));
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  dispatchKey(key, durationMs = 50) {
    this.stats.actionsCount++;
    this.stats.actionTimestamps.push(Date.now());
    this.lastActionOrProgressTime = Date.now();
    this.keyDispatcher(key, durationMs);
  }

  sendGamePacket(pkg) {
    this.packetDispatcher(pkg);
  }

  setHuntingCenter(x, z) {
    const curX = Math.round(x ?? this.telemetry.player.x ?? 0);
    const curZ = Math.round(z ?? this.telemetry.player.z ?? 0);
    this.config.hunting.centerX = curX;
    this.config.hunting.centerZ = curZ;
    this.log('RANGE', `📍 Yeni Merkez Belirlendi: (${curX}, ${curZ})`, 'info');
  }

  handleTooManyRequests(reason) {
    const now = Date.now();
    // Decay old rate limit counter if more than 6 seconds passed since last one
    if (this.lastRateLimitTime && (now - this.lastRateLimitTime > 6000)) {
      this.consecutiveRateLimits = 0;
      this.throttlePenaltyMs = Math.max(0, (this.throttlePenaltyMs || 0) - 40);
    }

    this.consecutiveRateLimits = (this.consecutiveRateLimits || 0) + 1;
    this.lastRateLimitTime = now;

    // Gentle penalty: only add 10ms per occurrence, capped at 120ms
    this.throttlePenaltyMs = Math.min(120, (this.throttlePenaltyMs || 0) + 10);

    // Minor breath delay (only 200-350ms, never freezing for multiple seconds!)
    const backoffMs = Math.min(350, 180 + this.consecutiveRateLimits * 10);
    this.rateLimitBackoffUntil = now + backoffMs;

    this.log('WARN', `⚠️ İstek sınırı uyarısı (${this.consecutiveRateLimits}/20). Hız hafifçe dengeleniyor (+${this.throttlePenaltyMs}ms)`, 'warn');
    
    // As requested by user: ONLY abandon target if rate limits exceed 20 in a row! Never stop the bot.
    if (this.consecutiveRateLimits >= 20 && (this.telemetry.target.hasTarget || this.telemetry.target.id)) {
      this.abandonTarget("20+ Üst Üste İstek Sınırı");
      this.consecutiveRateLimits = 0;
    }
  }

  abandonTarget(reason = "Takılma / Ulaşılamıyor") {
    const tid = this.telemetry.target.id;
    if (tid) {
      this.blacklistedTargets.set(tid, Date.now() + 15000);
      this.log('TARGET', `⚠️ Hedef terk edildi & 15s engellendi [ID: ${tid}] (${reason})`, 'warn');
    }
    this.telemetry.target.hasTarget = false;
    this.telemetry.target.isDead = true;
    this.telemetry.target.id = null;
    this.telemetry.target.hpPercent = 0;
    if (this.telemetry.assistTarget?.targetId === tid) {
      this.telemetry.assistTarget = null;
    }
    this.clearTargetDispatcher();
    this.dispatchKey('Escape', 50);
  }

  /* =========================================================================
   * 1. STAT ALLOCATION & MULTI MASTERY UPGRADE
   * ========================================================================= */
  checkAndAllocateStats() {
    if (!this.config.autoProgression?.autoStatEnabled) return;
    const unspent = this.telemetry.player.unspentStats || 0;
    if (unspent <= 0) return;

    const now = Date.now();
    if (now - this.lastStatAllocateTime < 5000) return; // Prevent spamming server
    this.lastStatAllocateTime = now;

    const build = this.config.autoProgression.statBuild || 'pure_int';
    let strToAdd = 0;
    let intToAdd = 0;

    if (build === 'pure_int') {
      intToAdd = unspent;
    } else if (build === 'pure_str') {
      strToAdd = unspent;
    } else if (build === 'hybrid_2_1_int') {
      intToAdd = Math.floor((unspent * 2) / 3);
      strToAdd = unspent - intToAdd;
    } else if (build === 'hybrid_2_1_str') {
      strToAdd = Math.floor((unspent * 2) / 3);
      intToAdd = unspent - strToAdd;
    }

    // Official game packet: stats.allocate { str, int }
    this.sendGamePacket({
      t: 'stats.allocate',
      d: { str: strToAdd, int: intToAdd }
    });
    this.log('STAT', `🧬 Stat Dağıtıldı: +${intToAdd} INT, +${strToAdd} STR (Kalan: ${unspent})`, 'success');

    this.telemetry.player.unspentStats = 0;
  }

  checkAndUpgradeMasteries() {
    if (!this.config.autoProgression?.autoMasteryEnabled) return;

    const p = this.telemetry.player;
    const playerLevel = p.level || 1;
    const currentSp = p.sp ?? 999999;
    
    // If player has 0 SP, cannot upgrade any mastery
    if (currentSp <= 0) return;

    const masteries = this.config.autoProgression.masteries || {};
    const selectedMasteries = Object.keys(masteries).filter(m => masteries[m]);
    if (selectedMasteries.length === 0) return;

    const playerMasteries = p.masteries || {};

    // Filter masteries that are ACTUALLY lower than the player's level
    const upgradable = selectedMasteries.filter(mId => {
      const currentMasteryLvl = playerMasteries[mId] || 0;
      return currentMasteryLvl < playerLevel;
    });

    // IF THERE ARE NO MASTERIES TO UPGRADE, DO ABSOLUTELY NOTHING!
    if (upgradable.length === 0) return;

    const now = Date.now();
    if (now - this.lastMasteryUpgradeTime < 10000) return; // Prevent spamming server
    this.lastMasteryUpgradeTime = now;

    // Official game packet: mastery.raise { masteryId }
    for (const mId of upgradable) {
      const currentLvl = playerMasteries[mId] || 0;
      this.sendGamePacket({ t: 'mastery.raise', d: { masteryId: mId } });
      this.log('MASTERY', `📜 Mastery Yükseltildi: [${mId.toUpperCase()}] (${currentLvl} -> ${currentLvl + 1}, Karakter: Lv.${playerLevel})`, 'info');
      playerMasteries[mId] = currentLvl + 1;
    }
  }

  /* =========================================================================
   * 2. DYNAMIC BUFFS, AUTO RES, AUTO WEAPON SWAP & AUTO TRACE
   * ========================================================================= */
  getBuffList() {
    if (Array.isArray(this.config.buffList) && this.config.buffList.length > 0) {
      return this.config.buffList;
    }
    this.config.buffList = this.getDefaultConfig().buffList;
    return this.config.buffList;
  }

  async executeDynamicBuff(buff) {
    if (!buff || !buff.enabled) return;
    this.buffExecutionInProgress = true;

    try {
      const needSwap = this.config.buffs?.autoWeaponSwap && buff.weaponReq && buff.weaponReq !== 'none';
      if (needSwap) {
        this.log('SWAP', `⚔️ Buff için [${buff.weaponReq.toUpperCase()}] takılıyor...`, 'info');
        this.weaponDispatcher({
          weaponType: buff.weaponReq,
          equipShield: this.config.buffs?.equipShield !== false && buff.weaponReq === 'cleric'
        });
        await this.sleep(450);
      }

      // Single-Target Party Buff: Target the specific party member first
      if (buff.targetType === 'party_single' && buff.partyMemberName) {
        const members = this.telemetry.party?.members || [];
        const member = members.find(m => m.name && m.name.toLowerCase() === buff.partyMemberName.toLowerCase());
        if (member && member.entityId) {
          this.log('BUFF', `🎯 Parti Üyesi [${member.name}] hedefleniyor...`, 'info');
          this.targetDispatcher({ id: member.entityId });
          await this.sleep(250);
        }
      }

      // Hotbar Page switch (F1, F2, F3, F4)
      const pageKey = buff.page;
      const needPageSwitch = pageKey && pageKey !== 'current' && pageKey !== 'F1';
      if (needPageSwitch) {
        this.dispatchKey(pageKey, 60);
        await this.sleep(220);
      }

      // Slot key press
      const slotKey = buff.slot || '1';
      this.log('BUFF', `🛡️ Buff Basılıyor: ${buff.name} [Sayfa: ${pageKey || 'Mevcut'} | Slot: ${slotKey}]`, 'info');
      this.dispatchKey(slotKey, 60);
      await this.sleep(this.applyJitter((buff.castDelayMs || 400) + (this.throttlePenaltyMs || 0)));

      // Restore hotbar page to F1
      if (needPageSwitch) {
        this.dispatchKey('F1', 60);
        await this.sleep(200);
      }

      // Restore main weapon
      if (needSwap) {
        const mainWep = this.config.buffs?.mainWeapon || 'auto';
        this.log('SWAP', `⚔️ Ana silaha dönülüyor: [${mainWep.toUpperCase()}]`, 'info');
        this.weaponDispatcher({ weaponType: mainWep, equipShield: false });
        await this.sleep(450);
      }
    } catch (e) {
      console.error('[SRO Bot] Buff execution error:', e);
    } finally {
      this.buffExecutionInProgress = false;
    }
  }

  async checkAndExecuteDynamicBuffs() {
    if (this.buffExecutionInProgress) return;
    const now = Date.now();
    const list = this.getBuffList();

    for (const buff of list) {
      if (!buff.enabled) continue;
      const lastTime = this.buffTimers[buff.id] || 0;
      const intervalMs = (buff.intervalSec || 120) * 1000;

      if (now - lastTime > intervalMs) {
        this.buffTimers[buff.id] = now;
        await this.executeDynamicBuff(buff);
        await this.sleep(300);
      }
    }
  }

  async checkAndExecuteAutoRes() {
    if (!this.config.party?.autoResEnabled || this.buffExecutionInProgress) return;
    const members = this.telemetry.party?.members || [];
    const deadMember = members.find(m => m.dead || m.hp === 0);

    if (deadMember) {
      const now = Date.now();
      if (!this.lastResAttemptTime || (now - this.lastResAttemptTime > 6000)) {
        this.lastResAttemptTime = now;
        const resPage = this.config.party.resPage || 'F2';
        const resSlot = this.config.party.resSlot || '8';
        this.log('PARTY', `✝️ [${deadMember.name}] öldü! Canlandırma (Res) [${resPage !== 'current' ? resPage + '-' : ''}${resSlot}] uygulanıyor...`, 'warn');
        this.buffExecutionInProgress = true;

        try {
          const needSwap = this.config.buffs?.autoWeaponSwap;
          if (needSwap) {
            this.log('SWAP', `⚔️ Res için Cleric Rod'a geçiliyor...`, 'info');
            this.weaponDispatcher({ weaponType: 'cleric', equipShield: this.config.buffs?.equipShield !== false });
            await this.sleep(450);
          }

          if (deadMember.entityId) {
            this.targetDispatcher({ id: deadMember.entityId });
            await this.sleep(250);
          }

          const needPageSwitch = resPage && resPage !== 'current' && resPage !== 'F1';
          if (needPageSwitch) {
            this.dispatchKey(resPage, 60);
            await this.sleep(220);
          }

          this.dispatchKey(resSlot, 60);
          await this.sleep(750);

          if (needPageSwitch) {
            this.dispatchKey('F1', 60);
            await this.sleep(200);
          }

          if (needSwap) {
            const mainWep = this.config.buffs?.mainWeapon || 'auto';
            this.log('SWAP', `⚔️ Ana silaha dönülüyor: [${mainWep.toUpperCase()}]`, 'info');
            this.weaponDispatcher({ weaponType: mainWep, equipShield: false });
            await this.sleep(450);
          }
        } finally {
          this.buffExecutionInProgress = false;
        }
      }
    }
  }

  traceSpecificMember(memberName) {
    if (!memberName) return;
    // PAUSE movement during combat: in Silkroad moving cancels skill cast animations!
    if (this.state === 'ATTACKING' || (this.telemetry.target.hasTarget && !this.telemetry.target.isDead)) {
      return;
    }
    const members = this.telemetry.party?.members || [];
    const targetMember = members.find(m => m.name && m.name.toLowerCase() === memberName.trim().toLowerCase());
    if (!targetMember || targetMember.dead) return;

    const p = this.telemetry.player;
    if (!p.x || !p.z || !targetMember.x || !targetMember.z) return;

    const dx = p.x - targetMember.x;
    const dz = p.z - targetMember.z;
    const dist = Math.hypot(dx, dz);
    const followDist = this.config.party.traceDistance || 7;

    const now = Date.now();
    if (dist > (followDist + 1.5) && (now - this.lastTraceMoveTime > 650)) {
      this.lastTraceMoveTime = now;
      const angle = Math.atan2(dz, dx);
      const targetX = targetMember.x + Math.cos(angle) * (followDist * 0.7);
      const targetZ = targetMember.z + Math.sin(angle) * (followDist * 0.7);

      this.sendGamePacket({
        t: 'move.click',
        d: { x: targetX, z: targetZ }
      });
      this.log('TRACE', `🚶 [${targetMember.name}] takip ediliyor (${Math.round(dist)}m)`, 'info');
    }
  }

  checkAndExecuteAutoTrace() {
    if (!this.config.party?.autoTraceEnabled) return;
    // PAUSE movement during combat: in Silkroad moving cancels skill cast animations!
    if (this.state === 'ATTACKING' || (this.telemetry.target.hasTarget && !this.telemetry.target.isDead)) {
      return;
    }
    const targetName = (this.config.party.traceTargetName || "").trim().toLowerCase();
    if (!targetName) return;

    const members = this.telemetry.party?.members || [];
    const targetMember = members.find(m => m.name && m.name.toLowerCase() === targetName);
    if (!targetMember || targetMember.dead) return;

    const p = this.telemetry.player;
    if (!p.x || !p.z || !targetMember.x || !targetMember.z) return;

    const dx = p.x - targetMember.x;
    const dz = p.z - targetMember.z;
    const dist = Math.hypot(dx, dz);
    const followDist = this.config.party.traceDistance || 7;

    const now = Date.now();
    // Only move if significantly farther than follow distance and not spammed
    if (dist > (followDist + 1.5) && (now - this.lastTraceMoveTime > 650)) {
      this.lastTraceMoveTime = now;
      const angle = Math.atan2(dz, dx);
      const targetX = targetMember.x + Math.cos(angle) * (followDist * 0.7);
      const targetZ = targetMember.z + Math.sin(angle) * (followDist * 0.7);

      this.sendGamePacket({
        t: 'move.click',
        d: { x: targetX, z: targetZ }
      });
      this.log('TRACE', `🚶 [${targetMember.name}] takip ediliyor (${Math.round(dist)}m > ${followDist}m)`, 'info');
    }
  }

  handlePartyAssistTarget(payload, legacyMemberName) {
    if (!this.config.party?.assistEnabled) return;
    const targetId = (typeof payload === 'object' && payload !== null) ? payload.targetId : payload;
    const memberName = (typeof payload === 'object' && payload !== null) ? payload.memberName : legacyMemberName;
    if (!targetId) return;

    if (this.blacklistedTargets.has(targetId) && Date.now() < this.blacklistedTargets.get(targetId)) {
      return; // Skip blacklisted/stuck target
    }
    // NEVER target a party member or self (friendly buffs/heals trigger targetId)
    if (targetId === this.telemetry.player?.id) return;
    const isPartyMember = this.telemetry.party?.members?.some(m => m.entityId === targetId);
    if (isPartyMember) return;

    this.telemetry.assistTarget = {
      targetId: targetId,
      memberName: memberName,
      targetName: (typeof payload === 'object' && payload?.targetName) ? payload.targetName : `[Assist] ${memberName}`,
      targetX: (typeof payload === 'object') ? payload.targetX : null,
      targetZ: (typeof payload === 'object') ? payload.targetZ : null,
      hpCurrent: (typeof payload === 'object') ? payload.hpCurrent : null,
      hpMax: (typeof payload === 'object') ? payload.hpMax : null,
      time: Date.now()
    };
  }

  /* =========================================================================
   * 3. TELEMETRY & PACKET HANDLERS
   * ========================================================================= */
  handleTelemetry(data) {
    if (!data) return;
    if (data.player) {
      Object.assign(this.telemetry.player, data.player);
      this.checkAndAllocateStats();
    }
    if (data.target) {
      Object.assign(this.telemetry.target, data.target);
    }
    if (data.lastItemReceivedTime) {
      this.telemetry.lastItemReceivedTime = data.lastItemReceivedTime;
    }
    if (data.uniques) {
      this.telemetry.uniques = data.uniques;
    }

    if (this.onTelemetryUpdate) {
      this.onTelemetryUpdate(this.telemetry);
    }
  }

  handlePartyUpdate(partyData) {
    if (!partyData) return;
    this.telemetry.party = partyData;
    this.checkAndExecuteAutoTrace();
    this.checkAndExecuteAutoRes();
    if (this.onTelemetryUpdate) {
      this.onTelemetryUpdate(this.telemetry);
    }
  }

  handleTargetDied(id) {
    if (this.telemetry.target.id === id || !this.telemetry.target.id) {
      this.telemetry.target.isDead = true;
      this.telemetry.target.hpPercent = 0;
      this.telemetry.target.hpCurrent = 0;
      this.telemetry.target.hasTarget = false;
    }
  }

  handleDrop(item) {
    this.stats.dropsCollected++;
    this.telemetry.lastItemReceivedTime = Date.now();
    this.audio.playRareDrop();
    this.log('DROP', `✨ İtem Alındı: [${item}]`, 'gold');
    this.updateStatsDisplay();
  }

  /* =========================================================================
   * 4. BOT CONTROL & COMBAT LOOP (RANGE LIMIT & ANTI-STUCK)
   * ========================================================================= */
  start() {
    if (this.running) return;
    this.running = true;
    this.paused = false;
    this.stats.startTime = Date.now();
    this.buffTimers = {};
    this.blacklistedTargets.clear();
    this.rateLimitBackoffUntil = 0;

    // Set Hunting Center if not yet defined
    if (this.config.hunting?.centerX == null && this.telemetry.player.x && this.telemetry.player.z) {
      this.config.hunting.centerX = Math.round(this.telemetry.player.x);
      this.config.hunting.centerZ = Math.round(this.telemetry.player.z);
    }

    this.audio.setEnabled(this.config.alerts?.soundEnabled !== false);
    this.audio.setVolume(this.config.alerts?.volume ?? 0.5);
    this.audio.playStart();

    this.log('SYS', '🚀 Silkroad Macro Bot Başlatıldı!', 'success');
    this.setState('SEARCHING');

    // Sync assist config immediately on start
    if (this.config.party?.assistMemberName) {
      this.assistConfigDispatcher({
        assistMemberName: this.config.party.assistMemberName,
        autoAcceptRes: this.config.party.autoAcceptRes !== false
      });
    }

    this.startBuffTicker();
    this.startApmTicker();
    this.startPartyTraceTicker();
    this.runCombatLoop();
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    this.paused = false;
    this.setState('IDLE');
    this.audio.playStop();
    this.log('SYS', '🛑 Bot durduruldu.', 'warn');
  }

  toggle() {
    if (this.running) {
      this.stop();
    } else {
      this.start();
    }
  }

  setPaused(val) {
    this.paused = !!val;
    this.setState(this.paused ? 'PAUSED' : 'SEARCHING');
    this.log('SYS', this.paused ? '⏸️ Bot duraklatıldı.' : '▶️ Bot devam ediyor.', 'info');
  }

  async runCombatLoop() {
    while (this.running) {
      if (this.paused) {
        await this.sleep(200);
        continue;
      }

      if (this.buffExecutionInProgress) {
        await this.sleep(200);
        continue;
      }

      if (this.rateLimitBackoffUntil > Date.now()) {
        await this.sleep(300);
        continue;
      }

      try {
        await this.checkAndExecuteDynamicBuffs();
        this.checkAndExecuteAutoTrace();
        this.checkAndExecuteAutoRes();

        // 1. Range Check: If outside hunting radius, return to center!
        if (this.config.hunting?.rangeEnabled && this.config.hunting?.centerX != null) {
          const p = this.telemetry.player;
          if (p.x && p.z) {
            const distToCenter = Math.hypot(p.x - this.config.hunting.centerX, p.z - this.config.hunting.centerZ);
            const radius = this.config.hunting.radius || 35;

            if (distToCenter > radius) {
              this.log('RANGE', `📍 Kasılma alanından uzaklaşıldı (${Math.round(distToCenter)}m > ${radius}m). Merkeze dönülüyor...`, 'warn');
              this.setState('WALKING');
              this.sendGamePacket({
                t: 'move.click',
                d: { x: this.config.hunting.centerX, z: this.config.hunting.centerZ }
              });

              const walkStart = Date.now();
              while (this.running && !this.paused && (Date.now() - walkStart < 5000)) {
                await this.sleep(400);
                const curDist = Math.hypot(this.telemetry.player.x - this.config.hunting.centerX, this.telemetry.player.z - this.config.hunting.centerZ);
                if (curDist <= 6) break;
              }
              continue;
            }
          }
        }

        // Clean expired blacklist
        const now = Date.now();
        for (const [tid, exp] of this.blacklistedTargets.entries()) {
          if (now > exp) this.blacklistedTargets.delete(tid);
        }

        // 2. Target Acquisition (Tab OR Party Assist)
        if (!this.telemetry.target.hasTarget || this.telemetry.target.isDead) {
          const isAssist = !!(this.config.party?.assistEnabled && this.config.party?.assistMemberName);

          if (isAssist) {
            const memberName = this.config.party.assistMemberName;
            this.setState('SEARCHING');

            const assist = this.telemetry.assistTarget;
            if (assist?.targetId && (Date.now() - assist.time < 12000)) {
              const targetMobId = assist.targetId;

              // Check blacklist
              if (this.blacklistedTargets.has(targetMobId)) {
                this.telemetry.assistTarget = null;
                await this.sleep(200);
                continue;
              }

              // Verify target is NOT a party member or self
              const isPartyMember = this.telemetry.party?.members?.some(m => m.entityId === targetMobId);
              if (isPartyMember || targetMobId === this.telemetry.player?.id) {
                this.telemetry.assistTarget = null;
                await this.sleep(200);
                continue;
              }

              // 1. Move into combat range if too far away!
              const members = this.telemetry.party?.members || [];
              const targetMember = members.find(m => m.name && m.name.toLowerCase() === memberName.trim().toLowerCase());
              const p = this.telemetry.player;

              let fightX = assist.targetX ?? targetMember?.x;
              let fightZ = assist.targetZ ?? targetMember?.z;

              if (p.x != null && p.z != null && fightX != null && fightZ != null) {
                const distToFight = Math.hypot(p.x - fightX, p.z - fightZ);
                // If more than 13m away, move closer to combat area
                if (distToFight > 13) {
                  this.setState('WALKING');
                  this.log('ASSIST', `🏃 Savaşa yaklaşılıyor (${Math.round(distToFight)}m) -> [${assist.targetName || 'Mob'}]`, 'info');
                  const dx = p.x - fightX;
                  const dz = p.z - fightZ;
                  const angle = Math.atan2(dz, dx);
                  const approachX = fightX + Math.cos(angle) * 7;
                  const approachZ = fightZ + Math.sin(angle) * 7;
                  this.sendGamePacket({ t: 'move.click', d: { x: approachX, z: approachZ } });

                  const walkStart = Date.now();
                  while (this.running && !this.paused && (Date.now() - walkStart < 3500)) {
                    await this.sleep(300);
                    const curP = this.telemetry.player;
                    if (curP.x != null && curP.z != null && Math.hypot(curP.x - fightX, curP.z - fightZ) <= 11) {
                      break;
                    }
                  }
                }
              }

              // 2. Lock on target: Send target dispatcher, combat.attack and Tab
              this.telemetry.target.id = targetMobId;
              this.telemetry.target.hasTarget = true;
              this.telemetry.target.isDead = false;
              this.telemetry.target.name = assist.targetName || `[Assist] ${memberName}`;
              this.telemetry.target.hpPercent = (assist.hpCurrent && assist.hpMax) ? Math.round((assist.hpCurrent / assist.hpMax) * 100) : 100;
              this.telemetry.target.hpMax = assist.hpMax || 0;
              this.telemetry.target.hpCurrent = assist.hpCurrent || 0;

              this.targetDispatcher({ id: targetMobId });
              this.sendGamePacket({
                t: 'combat.attack',
                d: { id: targetMobId }
              });
              this.dispatchKey('Tab', 50);

              this.log('TARGET', `🎯 Parti Üyesi [${memberName}] hedefine kilitlenildi: [${this.telemetry.target.name}]`, 'success');
              await this.sleep(150);
            } else {
              // No mob to attack right now: Follow the designated party member!
              this.traceSpecificMember(memberName);
              await this.sleep(350);
              continue;
            }
          } else {
            this.setState('SEARCHING');
            const targetKey = this.config.targeting.key || 'Tab';
            this.log('TARGET', `🎯 Düşman aranıyor [${targetKey}]`, 'info');
            this.dispatchKey(targetKey, 50);

            const searchDelay = this.applyJitter(this.config.targeting.searchDelayMs || 400);
            await this.sleep(searchDelay);
          }
        }

        if (!this.running || this.paused) break;

        // Check if acquired target is blacklisted
        if (this.telemetry.target.id && this.blacklistedTargets.has(this.telemetry.target.id)) {
          this.abandonTarget("Kara Listedeki Hedef");
          continue;
        }

        // 3. Attack Sequence
        if (this.telemetry.target.hasTarget && !this.telemetry.target.isDead) {
          this.setState('ATTACKING');
          const targetKilled = await this.executeSkillKeySequence();

          if (!this.running || this.paused) break;

          if (targetKilled && this.telemetry.assistTarget?.targetId === this.telemetry.target.id) {
            this.telemetry.assistTarget = null;
          }

          if (!this.running || this.paused) break;

          // 4. Looting: Only loot if we successfully killed the mob
          if (targetKilled && this.config.looting && this.config.looting.enabled) {
            this.setState('LOOTING');
            await this.executeSafeLooting();
          }

          if (targetKilled) {
            this.stats.mobsDefeated++;
            this.updateStatsDisplay();
          }
        }

        await this.sleep(this.applyJitter(150));

      } catch (err) {
        console.error('[SRO Bot] Combat Loop error:', err);
        await this.sleep(400);
      }
    }
  }

  /**
   * Attack Sequence with Anti-Stuck & Strict Giant Lock
   */
  async executeSkillKeySequence() {
    // Ensure combat bar (F1) is active
    this.dispatchKey('F1', 40);

    const rawKeys = this.config.combat.skillKeySequence || "1,2,3,4";
    const keys = rawKeys.split(',').map(k => k.trim()).filter(Boolean);
    if (keys.length === 0) keys.push("1");

    const keyDelay = Math.max(180, (this.config.combat.keyDelayMs || 280) + (this.throttlePenaltyMs || 0));
    let keyIdx = 0;
    let targetAbsentStartTime = 0;
    let mobDiedSuccessfully = false;

    let initialHp = this.telemetry.target.hpPercent || 100;
    let lastSeenHp = initialHp;
    let engagementStart = Date.now();
    let lastDamageDealtTime = engagementStart;

    const giantStallTimeoutMs = (this.config.targeting.mobStallTimeoutSec || 35) * 1000;
    const zeroDamageStuckTimeoutMs = (this.config.targeting.stuckTimeoutSec || 5) * 1000;

    const mobName = this.telemetry.target.name || "Canavar";
    this.log('COMBAT', `⚔️ Hedefe Kilitlenildi: [${mobName}] (Can: %${this.telemetry.target.hpPercent})`, 'info');

    while (this.running && !this.paused) {
      const now = Date.now();

      if (this.rateLimitBackoffUntil > now) {
        const waitTime = Math.min(1500, this.rateLimitBackoffUntil - now);
        await this.sleep(waitTime);
        continue;
      }

      // 1. Authoritative Death Check: HP is 0%
      if (this.telemetry.target.isDead || (this.telemetry.target.hasTarget && this.telemetry.target.hpPercent <= 0)) {
        this.log('COMBAT', `💀 [${mobName}] imha edildi (%0 HP). Loot aşamasına geçiliyor.`, 'success');
        mobDiedSuccessfully = true;
        this.telemetry.target.isDead = true;
        this.telemetry.target.hasTarget = false;
        break;
      }

      // 2. Active Damage Tracker
      if (this.telemetry.target.hasTarget) {
        targetAbsentStartTime = 0;
        if (this.telemetry.target.hpPercent < lastSeenHp) {
          lastSeenHp = this.telemetry.target.hpPercent;
          lastDamageDealtTime = now; // Damage dealt!
        }
      } else {
        if (!targetAbsentStartTime) targetAbsentStartTime = now;
        if (now - targetAbsentStartTime > 4000 && now - lastDamageDealtTime > 4000) {
          this.log('COMBAT', `💀 [${mobName}] kayboldu / öldü (4sn sessizlik).`, 'success');
          mobDiedSuccessfully = true;
          this.telemetry.target.isDead = true;
          this.telemetry.target.hasTarget = false;
          break;
        }
      }

      // If player is running to target or casting buffs, reset engagementStart so running across map doesn't trigger stuck!
      const p = this.telemetry.player;
      const isPlayerMoving = !!(p.targetX != null && p.targetZ != null);
      if (isPlayerMoving || this.buffExecutionInProgress) {
        engagementStart = now;
        lastDamageDealtTime = now;
      }

      // 3. ZERO DAMAGE STUCK MOB PROTECTION:
      // Only trigger if character has arrived/stopped AND has dealt 0 damage for stuckTimeoutSec
      if (!isPlayerMoving && !this.buffExecutionInProgress && lastSeenHp >= initialHp && (now - engagementStart > zeroDamageStuckTimeoutMs)) {
        this.log('COMBAT', `⚠️ [${mobName}] hedefine ${this.config.targeting.stuckTimeoutSec || 18}s boyunca hiç hasar verilemedi (Engel/Ulaşılamıyor). Hedef bırakılıyor.`, 'warn');
        this.abandonTarget("Sıfır Hasar / Engel");
        return false;
      }

      // 4. Giant Stall Timeout (Only if taking damage but stalled for 35s)
      if (now - lastDamageDealtTime > giantStallTimeoutMs) {
        this.log('COMBAT', `⏱️ [${mobName}] hedefine ${this.config.targeting.mobStallTimeoutSec || 35}s boyunca yeni hasar verilemedi. Hedef bırakılıyor.`, 'warn');
        this.abandonTarget("Zaman Aşımı");
        return false;
      }

      // 5. Auto Resurrect check during combat
      this.checkAndExecuteAutoRes();

      // 6. Dispatch skill key
      const keyToPress = keys[keyIdx % keys.length];
      keyIdx++;

      this.stats.skillsCast++;
      this.dispatchKey(keyToPress, 55);

      const currentHp = this.telemetry.target.hpPercent !== undefined ? `%${this.telemetry.target.hpPercent}` : '?';
      this.log('SKILL', `⚡ Vuruş: [${keyToPress}] -> [${mobName}] Canı: ${currentHp}`, 'info');

      await this.sleep(this.applyJitter(keyDelay));
    }

    return mobDiedSuccessfully;
  }

  async executeSafeLooting() {
    const burstCount = Math.max(3, Math.min(20, this.config.looting.spaceBurstCount || 10));
    const burstInterval = Math.max(130, (this.config.looting.burstIntervalMs || 160) + Math.round((this.throttlePenaltyMs || 0) * 0.5));
    const lootKey = this.config.looting.key || "Space";
    const dynamicStopMs = this.config.looting.dynamicLogStopMs || 500;

    this.log('LOOT', `📦 Kutu Toplama Başladı (Maksimum ${burstCount}x [${lootKey}])`, 'info');

    let lastLootReceivedCheck = this.telemetry.lastItemReceivedTime || 0;
    let consecutiveIdleSpurts = 0;

    for (let i = 1; i <= burstCount; i++) {
      if (!this.running || this.paused) break;

      this.dispatchKey(lootKey, 45);
      await this.sleep(this.applyJitter(burstInterval));

      const currentItemTime = this.telemetry.lastItemReceivedTime || 0;
      if (currentItemTime > lastLootReceivedCheck) {
        lastLootReceivedCheck = currentItemTime;
        consecutiveIdleSpurts = 0;
      } else {
        consecutiveIdleSpurts++;
      }

      if (i >= 5 && consecutiveIdleSpurts >= 3 && (Date.now() - lastLootReceivedCheck > dynamicStopMs)) {
        this.log('LOOT', `✨ Yer tamamen temizlendi. (${i}. basışta durduruldu)`, 'success');
        break;
      }
    }
  }

  /* =========================================================================
   * 5. TICKERS & STATS
   * ========================================================================= */
  startBuffTicker() {
    setInterval(() => {
      if (this.running && !this.paused) {
        this.checkAndExecuteDynamicBuffs();
        this.checkAndUpgradeMasteries();
        this.checkAndUseSpeedScroll();
      }
    }, 1000);
  }

  checkAndUseSpeedScroll() {
    if (!this.config.buffs || this.config.buffs.autoSpeedScroll === false) return;
    const now = Date.now();

    if (now - this.lastSpeedScrollUsedTime < 5000) return;

    // Check if player has active speed buff from server
    const buffs = this.telemetry.player.buffs || [];
    const hasActiveSpeed = buffs.some(b => {
      if (!b) return false;
      const gId = (b.groupId || b.skillId || "").toLowerCase();
      const cat = (b.category || "").toLowerCase();
      const isSpeed = gId.includes('speed') || gId.includes('movement') || (cat === 'stat' && b.mods?.moveSpeedPct > 0);
      if (!isSpeed) return false;
      if (b.expiresAt && b.expiresAt <= now) return false;
      return true;
    });

    if (hasActiveSpeed) return;

    // If no buff list received yet, fallback to local duration timer
    if (buffs.length === 0 && this.lastSpeedScrollUsedTime > 0 && (now - this.lastSpeedScrollUsedTime < this.speedScrollDurationMs)) {
      return;
    }

    this.lastSpeedScrollUsedTime = now;
    this.speedScrollDispatcher();
  }

  startPartyTraceTicker() {
    setInterval(() => {
      if (this.running && !this.paused) {
        this.checkAndExecuteAutoTrace();
        this.checkAndExecuteAutoRes();
      }
    }, 450);
  }

  startApmTicker() {
    setInterval(() => {
      const oneMinuteAgo = Date.now() - 60000;
      this.stats.actionTimestamps = this.stats.actionTimestamps.filter(t => t > oneMinuteAgo);
      this.stats.apm = this.stats.actionTimestamps.length;
      if (this.running && this.stats.startTime) {
        this.stats.totalRunTimeMs = Date.now() - this.stats.startTime;
      }

      // Gracefully decay throttle penalty when running smoothly for >16s
      if (this.throttlePenaltyMs > 0 && (Date.now() - this.lastRateLimitTime > 16000)) {
        this.throttlePenaltyMs = Math.max(0, this.throttlePenaltyMs - 25);
        if (this.throttlePenaltyMs === 0) {
          this.consecutiveRateLimits = 0;
        }
      }

      // Anti-Freeze Watchdog: if stuck in ATTACKING/WALKING for >12s without key progress
      if (this.running && !this.paused && (this.state === 'ATTACKING' || this.state === 'WALKING')) {
        if (Date.now() - this.lastActionOrProgressTime > 12000) {
          this.log('SYS', '🔄 Donma önleyici (Watchdog): Kilitlenmeler sıfırlandı, yeni hedefe geçiliyor.', 'warn');
          this.buffExecutionInProgress = false;
          this.rateLimitBackoffUntil = 0;
          this.abandonTarget("Watchdog Kurtarma");
          this.setState('SEARCHING');
          this.lastActionOrProgressTime = Date.now();
        }
      }

      this.updateStatsDisplay();
    }, 1000);
  }

  updateStatsDisplay() {
    if (this.onStatsUpdate) {
      this.onStatsUpdate(this.stats);
    }
  }
}

window.SroBotEngine = SroBotEngine;
