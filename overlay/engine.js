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
    this.buffTickerInterval = null;
    this.apmTickerInterval = null;
    this.partyTraceInterval = null;

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
        keyDelayMs: 450
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
    let curX = x != null ? Math.round(x) : (this.telemetry.player.x != null ? Math.round(this.telemetry.player.x) : null);
    let curZ = z != null ? Math.round(z) : (this.telemetry.player.z != null ? Math.round(this.telemetry.player.z) : null);

    if (curX == null || curZ == null || (curX === 0 && curZ === 0)) {
      this.log('RANGE', `⚠️ Karakter koordinatları henüz hazır değil. Oyunda birkaç adım atıp tekrar deneyin.`, 'warn');
      return false;
    }

    this.config.hunting.centerX = curX;
    this.config.hunting.centerZ = curZ;
    this.log('RANGE', `📍 Yeni Merkez Belirlendi: (${curX}, ${curZ})`, 'info');
    return true;
  }

  resetHuntingCenter() {
    this.config.hunting.centerX = null;
    this.config.hunting.centerZ = null;
    this.log('RANGE', `📍 Kasılma alanı merkezi sıfırlandı.`, 'info');
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

  isFriendlyPartyMember(id, name) {
    if (!id && !name) return false;
    if (id === this.telemetry.player?.id) return true;
    const members = this.telemetry.party?.members || [];
    return members.some(m =>
      (id && m.entityId === id) ||
      (name && m.name && m.name.toLowerCase() === name.toLowerCase())
    );
  }

  isAssistTargetMatched(telemetryTarget, assist) {
    if (!telemetryTarget || !telemetryTarget.hasTarget || telemetryTarget.isDead) return false;
    if (!assist) return false;

    // Never match friendly party members or self
    if (this.isFriendlyPartyMember(telemetryTarget.id, telemetryTarget.name) || telemetryTarget.id === this.telemetry.player?.id) {
      return false;
    }

    // 1. Exact entity ID match if both IDs are known
    if (assist.targetId && telemetryTarget.id) {
      return Number(telemetryTarget.id) === Number(assist.targetId);
    }

    // 2. If telemetryTarget has no ID (scraped from DOM text only):
    // Name match (case-insensitive substring, e.g. "Niya Soldier")
    if (!telemetryTarget.id) {
      const tName = (telemetryTarget.name || '').trim().toLowerCase();
      const aName = (assist.targetName || '').trim().toLowerCase();
      if (tName && aName && aName !== 'canavar' && aName !== 'mob') {
        if (tName.includes(aName) || aName.includes(tName)) {
          return true;
        }
      }
      if ((!aName || aName === 'canavar' || aName === 'mob') && tName && !tName.includes('player')) {
        return true;
      }
    }

    return false;
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
    if (!this.running || this.paused) return;
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
    if (!this.running || this.paused) return;
    if (!this.config.autoProgression?.autoMasteryEnabled) return;

    const p = this.telemetry.player;
    const playerLevel = p.level;
    // If player level is not known yet or <= 1, do not upgrade blindly
    if (!playerLevel || playerLevel <= 1) return;

    const currentSp = p.sp ?? 999999;
    if (currentSp <= 0) return;

    const masteries = this.config.autoProgression.masteries || {};
    const selectedMasteries = Object.keys(masteries).filter(m => masteries[m]);
    if (selectedMasteries.length === 0) return;

    const playerMasteries = p.masteries;
    // CRITICAL: If we don't have the player's actual mastery data yet, DO NOT assume 0!
    // That causes "Your level is too low for that" spam when masteries are already learned/capped!
    if (!playerMasteries || Object.keys(playerMasteries).length === 0) return;

    // Filter masteries that are ACTUALLY lower than the player's level
    const upgradable = selectedMasteries.filter(mId => {
      const currentMasteryLvl = playerMasteries[mId];
      return currentMasteryLvl !== undefined && currentMasteryLvl < playerLevel;
    });

    // IF THERE ARE NO MASTERIES TO UPGRADE, DO ABSOLUTELY NOTHING!
    if (upgradable.length === 0) return;

    const now = Date.now();
    if (now - this.lastMasteryUpgradeTime < 10000) return; // Prevent spamming server
    this.lastMasteryUpgradeTime = now;

    // Upgrade one mastery per check interval to be safe
    const mId = upgradable[0];
    const currentLvl = playerMasteries[mId] || 0;
    this.sendGamePacket({ t: 'mastery.raise', d: { masteryId: mId } });
    this.log('MASTERY', `📜 Mastery Yükseltildi: [${mId.toUpperCase()}] (${currentLvl} -> ${currentLvl + 1}, Karakter: Lv.${playerLevel})`, 'info');
    playerMasteries[mId] = currentLvl + 1;
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
    if (!this.running || this.paused) return;
    if (!buff || !buff.enabled) return;
    this.buffExecutionInProgress = true;

    const needSwap = this.config.buffs?.autoWeaponSwap && buff.weaponReq && buff.weaponReq !== 'none';
    const mainWep = this.config.buffs?.mainWeapon || 'auto';
    const pageKey = buff.page;
    const needPageSwitch = pageKey && pageKey !== 'current' && pageKey !== 'F1';

    try {
      if (needSwap) {
        this.log('SWAP', `⚔️ Buff için [${buff.weaponReq.toUpperCase()}] takılıyor...`, 'info');
        this.weaponDispatcher({
          weaponType: buff.weaponReq,
          equipShield: this.config.buffs?.equipShield !== false && buff.weaponReq === 'cleric'
        });
        await this.sleep(900);
      }

      if (!this.running || this.paused) return;

      // Single-Target Party Buff: Target the specific party member first
      if (buff.targetType === 'party_single' && buff.partyMemberName) {
        const members = this.telemetry.party?.members || [];
        const member = members.find(m => m.name && m.name.toLowerCase() === buff.partyMemberName.toLowerCase());
        if (member && member.entityId) {
          this.log('BUFF', `🎯 Parti Üyesi [${member.name}] hedefleniyor...`, 'info');
          this.targetDispatcher({ id: member.entityId, name: member.name, isPartyMember: true });
          await this.sleep(250);
        }
      }

      if (!this.running || this.paused) return;

      // Hotbar Page switch (F1, F2, F3, F4)
      if (needPageSwitch) {
        this.dispatchKey(pageKey, 60);
        await this.sleep(220);
      }

      if (!this.running || this.paused) return;

      // Slot key press
      const slotKey = buff.slot || '1';
      this.log('BUFF', `🛡️ Buff Basılıyor: ${buff.name} [Sayfa: ${pageKey || 'Mevcut'} | Slot: ${slotKey}]`, 'info');
      this.dispatchKey(slotKey, 60);
      const castWait = Math.max(900, (buff.castDelayMs || 500) + (this.throttlePenaltyMs || 0));
      await this.sleep(this.applyJitter(castWait));

    } catch (e) {
      console.error('[SRO Bot] Buff execution error:', e);
    } finally {
      // ALWAYS restore hotbar page to F1
      if (needPageSwitch) {
        this.dispatchKey('F1', 60);
        await this.sleep(200);
      }

      // ALWAYS restore main weapon
      if (needSwap) {
        this.log('SWAP', `⚔️ Ana silaha dönülüyor: [${mainWep.toUpperCase()}]`, 'info');
        this.weaponDispatcher({ weaponType: mainWep, equipShield: false });
        await this.sleep(950);
        this.dispatchKey('F1', 60);
        await this.sleep(150);

        this.telemetry.target.hasTarget = false;
        this.telemetry.target.id = null;
        this.clearTargetDispatcher();
      }

      this.buffExecutionInProgress = false;
    }
  }

  async checkAndExecuteDynamicBuffs() {
    if (!this.running || this.paused) return;
    if (this.buffExecutionInProgress) return;
    // Never interrupt active combat with buff executions or weapon swaps!
    if (this.state === 'ATTACKING' && this.telemetry.target.hasTarget && !this.telemetry.target.isDead) return;
    const now = Date.now();
    const list = this.getBuffList();

    for (const buff of list) {
      if (!this.running || this.paused) break;
      if (!buff.enabled) continue;
      const lastTime = this.buffTimers[buff.id] || 0;
      const intervalMs = (buff.intervalSec || 120) * 1000;

      if (now - lastTime > intervalMs) {
        this.buffTimers[buff.id] = now;
        await this.executeDynamicBuff(buff);
        await this.sleep(350);
      }
    }
  }

  async checkAndExecuteAutoRes() {
    if (!this.running || this.paused) return;
    if (!this.config.party?.autoResEnabled || this.buffExecutionInProgress) return;
    const members = this.telemetry.party?.members || [];
    const deadMember = members.find(m => m.dead || m.hp === 0);

    if (deadMember) {
      const now = Date.now();
      if (!this.lastResAttemptTime || (now - this.lastResAttemptTime > 9000)) {
        this.lastResAttemptTime = now;
        const resPage = this.config.party.resPage || 'F2';
        const resSlot = this.config.party.resSlot || '8';
        this.log('PARTY', `✝️ [${deadMember.name}] öldü! Canlandırma (Res) başlatılıyor...`, 'warn');
        this.buffExecutionInProgress = true;

        const needSwap = this.config.buffs?.autoWeaponSwap;
        const needPageSwitch = resPage && resPage !== 'current' && resPage !== 'F1';
        const mainWep = this.config.buffs?.mainWeapon || 'auto';

        try {
          // 1. Move into Res range if too far away! (Cleric Res range is ~15m)
          const p = this.telemetry.player;
          if (p.x != null && p.z != null && deadMember.x != null && deadMember.z != null) {
            const distToDead = Math.hypot(p.x - deadMember.x, p.z - deadMember.z);
            if (distToDead > 10) {
              this.setState('WALKING');
              this.log('PARTY', `🏃 [${deadMember.name}] canlandırmak için yanına koşuluyor (${Math.round(distToDead)}m)...`, 'info');
              const dx = p.x - deadMember.x;
              const dz = p.z - deadMember.z;
              const angle = Math.atan2(dz, dx);
              const approachX = deadMember.x + Math.cos(angle) * 5;
              const approachZ = deadMember.z + Math.sin(angle) * 5;
              this.sendGamePacket({ t: 'move.click', d: { x: approachX, z: approachZ } });

              const walkStart = Date.now();
              while (this.running && !this.paused && (Date.now() - walkStart < 4000)) {
                await this.sleep(300);
                const curP = this.telemetry.player;
                if (curP.x != null && curP.z != null && Math.hypot(curP.x - deadMember.x, curP.z - deadMember.z) <= 8) {
                  break;
                }
              }
            }
          }

          if (!this.running || this.paused) return;

          // 2. Equip Cleric Rod if swap enabled
          if (needSwap) {
            this.log('SWAP', `⚔️ Res için Cleric Rod'a geçiliyor...`, 'info');
            this.weaponDispatcher({ weaponType: 'cleric', equipShield: this.config.buffs?.equipShield !== false });
            await this.sleep(900);
          }

          if (!this.running || this.paused) return;

          // 3. Target the dead party member (Zustand store + DOM click)
          if (deadMember.entityId) {
            this.targetDispatcher({ id: deadMember.entityId, name: deadMember.name, isPartyMember: true });
            await this.sleep(350);
          }

          if (!this.running || this.paused) return;

          // 4. Hotbar page switch to Res page (e.g. F2)
          if (needPageSwitch) {
            this.dispatchKey(resPage, 60);
            await this.sleep(220);
          }

          if (!this.running || this.paused) return;

          // 5. Press Res slot key
          this.log('PARTY', `✝️ Res Skill basılıyor [${resPage !== 'current' ? resPage + '-' : ''}${resSlot}]...`, 'info');
          this.dispatchKey(resSlot, 60);

          // Direct skill.cast packet fallback (Cleric Reverse / Grad Reverse / Rebirth or Force Rebirth)
          const resSkill = (this.telemetry.skills?.discovered || []).find(s => {
            const gid = (s.groupId || s.id || "").toLowerCase();
            return gid.includes('rebirth') || gid.includes('reverse') || gid.includes('resurrect') || gid.includes('revive') || gid.includes('reincarnat');
          });
          if (resSkill && deadMember.entityId) {
            this.log('PARTY', `✝️ Sunucuya Doğrudan Res Paketi Gönderiliyor: [${resSkill.name || resSkill.groupId}] -> [${deadMember.name}]`, 'info');
            this.sendGamePacket({
              t: 'skill.cast',
              d: { groupId: resSkill.groupId || resSkill.id, targetId: deadMember.entityId }
            });
          }

          // 6. Full cast channeling time: Cleric Resurrection cast takes 3.0s!
          this.log('PARTY', `⏳ Canlandırma okunuyor (3.2sn kesintisiz bekleniyor)...`, 'info');
          await this.sleep(3200);
          this.log('PARTY', `✨ [${deadMember.name}] için Canlandırma tamamlandı!`, 'success');

        } catch (err) {
          console.error('[SRO Bot] Auto Res error:', err);
        } finally {
          if (needPageSwitch) {
            this.dispatchKey('F1', 60);
            await this.sleep(200);
          }

          if (needSwap) {
            this.log('SWAP', `⚔️ Ana silaha dönülüyor: [${mainWep.toUpperCase()}]`, 'info');
            this.weaponDispatcher({ weaponType: mainWep, equipShield: false });
            await this.sleep(1300);
            this.dispatchKey('F1', 60);
            await this.sleep(150);
            this.telemetry.target.hasTarget = false;
            this.telemetry.target.id = null;
            this.clearTargetDispatcher();
          }

          this.buffExecutionInProgress = false;
        }
      }
    }
  }

  traceSpecificMember(memberName) {
    if (!this.running || this.paused) return;
    if (!memberName) return;
    // PAUSE movement only during ACTIVE valid mob combat!
    const isAttackingValidMob = (this.state === 'ATTACKING' && this.telemetry.target.hasTarget && !this.telemetry.target.isDead && !this.isFriendlyPartyMember(this.telemetry.target.id, this.telemetry.target.name));
    if (isAttackingValidMob) {
      return;
    }
    const members = this.telemetry.party?.members || [];
    const targetMember = members.find(m => m.name && m.name.toLowerCase() === memberName.trim().toLowerCase());
    if (!targetMember || targetMember.dead) return;

    const p = this.telemetry.player;
    if (p.x == null || p.z == null || targetMember.x == null || targetMember.z == null) return;

    const dx = p.x - targetMember.x;
    const dz = p.z - targetMember.z;
    const dist = Math.hypot(dx, dz);
    const followDist = Math.max(3, this.config.party.traceDistance || 5);

    const now = Date.now();
    if (dist > (followDist + 1.2) && (now - this.lastTraceMoveTime > 500)) {
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

  checkAndExecuteAutoTrace() {
    if (!this.running || this.paused) return;
    if (this.state === 'ATTACKING') return;

    // Check party assist member first if assist is enabled
    if (this.config.party?.assistEnabled && this.config.party?.assistMemberName) {
      this.traceSpecificMember(this.config.party.assistMemberName);
      return;
    }

    if (!this.config.party?.autoTraceEnabled) return;
    const targetName = (this.config.party.traceTargetName || "").trim().toLowerCase();
    if (!targetName) return;
    this.traceSpecificMember(targetName);
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

    const previousAssistId = this.telemetry.assistTarget?.targetId;

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

    // If assist target changed to a new mob, immediately update client Zustand store!
    if (previousAssistId !== targetId) {
      this.targetDispatcher({ id: targetId, name: this.telemetry.assistTarget.targetName, isPartyMember: false });
    }
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
      // NEVER allow a friendly party member to be stored as attack target!
      if (data.target.name && this.isFriendlyPartyMember(null, data.target.name)) {
        this.telemetry.target.hasTarget = false;
        this.telemetry.target.id = null;
        this.telemetry.target.name = '';
        this.clearTargetDispatcher();
      } else {
        Object.assign(this.telemetry.target, data.target);
      }
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
    if (this.telemetry.party?.members && Array.isArray(partyData.members)) {
      const oldMap = new Map(this.telemetry.party.members.map(m => [m.entityId, m]));
      partyData.members.forEach(newM => {
        const oldM = oldMap.get(newM.entityId);
        if (oldM) {
          if (newM.x == null && oldM.x != null) newM.x = oldM.x;
          if (newM.z == null && oldM.z != null) newM.z = oldM.z;
        }
      });
    }
    this.telemetry.party = partyData;

    // Extract player level and masteries if in party
    if (Array.isArray(partyData.members)) {
      const myMember = partyData.members.find(m =>
        (this.telemetry.player.id && m.entityId === this.telemetry.player.id) ||
        (this.telemetry.player.name && m.name && m.name.toLowerCase() === this.telemetry.player.name.toLowerCase()) ||
        m.isLeader || m.leader
      );
      if (myMember) {
        if (myMember.level) this.telemetry.player.level = myMember.level;
        if (myMember.name) this.telemetry.player.name = myMember.name;
        if (myMember.entityId) this.telemetry.player.id = myMember.entityId;
        if (Array.isArray(myMember.topMasteries)) {
          if (!this.telemetry.player.masteries) this.telemetry.player.masteries = {};
          myMember.topMasteries.forEach(tm => {
            if (tm && tm.masteryId) this.telemetry.player.masteries[tm.masteryId] = tm.level;
          });
        }
      }
    }

    if (this.running && !this.paused) {
      this.checkAndExecuteAutoTrace();
      this.checkAndExecuteAutoRes();
    }
    if (this.onTelemetryUpdate) {
      this.onTelemetryUpdate(this.telemetry);
    }
  }

  handleTargetDied(id) {
    if (!id || this.telemetry.target.id === id || !this.telemetry.target.id) {
      this.telemetry.target.isDead = true;
      this.telemetry.target.hpPercent = 0;
      this.telemetry.target.hpCurrent = 0;
      this.telemetry.target.hasTarget = false;
      this.telemetry.target.id = null;
    }
    if (this.telemetry.assistTarget && (!id || this.telemetry.assistTarget.targetId === id)) {
      this.telemetry.assistTarget = null;
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
      if (this.telemetry.player.x !== 0 || this.telemetry.player.z !== 0) {
        this.config.hunting.centerX = Math.round(this.telemetry.player.x);
        this.config.hunting.centerZ = Math.round(this.telemetry.player.z);
      }
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

    if (this.buffTickerInterval) clearInterval(this.buffTickerInterval);
    if (this.apmTickerInterval) clearInterval(this.apmTickerInterval);
    if (this.partyTraceInterval) clearInterval(this.partyTraceInterval);

    this.startBuffTicker();
    this.startApmTicker();
    this.startPartyTraceTicker();
    this.runCombatLoop();
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    this.paused = false;
    this.buffExecutionInProgress = false;

    if (this.buffTickerInterval) {
      clearInterval(this.buffTickerInterval);
      this.buffTickerInterval = null;
    }
    if (this.apmTickerInterval) {
      clearInterval(this.apmTickerInterval);
      this.apmTickerInterval = null;
    }
    if (this.partyTraceInterval) {
      clearInterval(this.partyTraceInterval);
      this.partyTraceInterval = null;
    }

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
        const isAssist = !!(this.config.party?.assistEnabled && this.config.party?.assistMemberName);
        if (!isAssist && this.config.hunting?.rangeEnabled && this.config.hunting?.centerX != null) {
          const p = this.telemetry.player;
          if (p.x != null && p.z != null) {
            // Ignore invalid (0, 0) center coordinates
            if (!(this.config.hunting.centerX === 0 && this.config.hunting.centerZ === 0)) {
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

              // Dynamically adjust approach distance: 7m for ranged, 3.5m for melee
              const isRanged = this.config.buffs?.mainWeapon === 'eu_tstaff' || this.config.buffs?.mainWeapon === 'bow' || (this.telemetry.skills?.discovered || []).some(s => (s.groupId || '').includes('firea') || (s.groupId || '').includes('colda') || (s.groupId || '').includes('lightninga') || (s.groupId || '').includes('pacheon'));
              const desiredDist = isRanged ? 7 : 3.5;

              if (p.x != null && p.z != null && fightX != null && fightZ != null) {
                const distToFight = Math.hypot(p.x - fightX, p.z - fightZ);
                // Move closer if farther than attack distance
                if (distToFight > (desiredDist + 2)) {
                  this.setState('WALKING');
                  this.log('ASSIST', `🏃 Savaşa yaklaşılıyor (${Math.round(distToFight)}m -> ${desiredDist}m) -> [${assist.targetName || 'Mob'}]`, 'info');
                  const dx = p.x - fightX;
                  const dz = p.z - fightZ;
                  const angle = Math.atan2(dz, dx);
                  const approachX = fightX + Math.cos(angle) * desiredDist;
                  const approachZ = fightZ + Math.sin(angle) * desiredDist;
                  this.sendGamePacket({ t: 'move.click', d: { x: approachX, z: approachZ } });

                  const walkStart = Date.now();
                  while (this.running && !this.paused && (Date.now() - walkStart < 3500)) {
                    await this.sleep(250);
                    const curP = this.telemetry.player;
                    if (curP.x != null && curP.z != null && Math.hypot(curP.x - fightX, curP.z - fightZ) <= (desiredDist + 2)) {
                      break;
                    }
                  }
                }
              }

              // 2. Set client target & TAB-LOCK: Ensure target is locked natively in the game!
              this.targetDispatcher({ id: targetMobId, name: assist.targetName, isPartyMember: false });

              const targetKey = this.config.targeting.key || 'Tab';
              let targetMatched = false;
              const maxTabAttempts = 6;

              for (let attempt = 0; attempt < maxTabAttempts; attempt++) {
                if (!this.running || this.paused) break;

                // Check if current native target matches
                if (this.isAssistTargetMatched(this.telemetry.target, assist)) {
                  targetMatched = true;
                  break;
                }

                this.log('ASSIST', `🎯 [${memberName}] hedefi aranıyor [${targetKey}] (${attempt + 1}/${maxTabAttempts}) -> [${assist.targetName || 'Mob'}]`, 'info');
                this.dispatchKey(targetKey, 50);
                await this.sleep(160);

                if (this.isAssistTargetMatched(this.telemetry.target, assist)) {
                  targetMatched = true;
                  break;
                }
              }

              if (targetMatched) {
                this.targetLastSeenTime = Date.now();
                this.log('TARGET', `🎯 Parti hedefi Tab ile kilitlendi: [${this.telemetry.target.name}] (Can: %${this.telemetry.target.hpPercent})`, 'success');
              } else {
                // If Tab cycle didn't land on it, but client target was set in Zustand store:
                if (this.telemetry.target.id === targetMobId) {
                  this.targetLastSeenTime = Date.now();
                  this.log('TARGET', `🎯 Parti hedefi Store ile kilitlendi: [${this.telemetry.target.name || assist.targetName}]`, 'success');
                } else {
                  // Step closer to fight coordinates and retry
                  if (fightX != null && fightZ != null) {
                    this.sendGamePacket({ t: 'move.click', d: { x: fightX, z: fightZ } });
                  }
                  await this.sleep(250);
                  continue;
                }
              }
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

          // 4. Looting: Only loot if we successfully killed the mob AND looting is enabled
          if (targetKilled && this.config.looting && this.config.looting.enabled) {
            this.setState('LOOTING');
            await this.executeSafeLooting();
          } else if (targetKilled && isAssist) {
            // When looting is disabled, immediately trace the party member so we don't get left behind!
            this.traceSpecificMember(memberName);
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

    const keyDelay = Math.max(300, (this.config.combat.keyDelayMs || 400) + (this.throttlePenaltyMs || 0));
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

      // Check if assisted party member switched to a new target
      if (this.config.party?.assistEnabled && this.config.party?.assistMemberName) {
        const currentAssist = this.telemetry.assistTarget;
        if (currentAssist?.targetId && this.telemetry.target.id && Number(currentAssist.targetId) !== Number(this.telemetry.target.id)) {
          this.log('ASSIST', `🔄 [${this.config.party.assistMemberName}] yeni hedefe geçti -> [${currentAssist.targetName || 'Yeni Mob'}]. Hedef değiştiriliyor.`, 'info');
          this.telemetry.target.hasTarget = false;
          this.telemetry.target.id = null;
          this.targetDispatcher({ id: currentAssist.targetId, name: currentAssist.targetName, isPartyMember: false });
          break;
        }
      }

      // 1. Authoritative Death Check: HP is 0%
      if (this.telemetry.target.isDead || (this.telemetry.target.hasTarget && this.telemetry.target.hpPercent <= 0)) {
        const willLoot = !!(this.config.looting && this.config.looting.enabled);
        this.log('COMBAT', `💀 [${mobName}] imha edildi (%0 HP).${willLoot ? ' Loot aşamasına geçiliyor.' : ''}`, 'success');
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
        if (now - targetAbsentStartTime > 800) {
          this.log('COMBAT', `💀 [${mobName}] kayboldu / öldü.`, 'success');
          mobDiedSuccessfully = true;
          this.telemetry.target.isDead = true;
          this.telemetry.target.hasTarget = false;
          break;
        }
        await this.sleep(100);
        continue;
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
      if (!this.telemetry.target.hasTarget || this.telemetry.target.isDead) {
        break;
      }
      const keyToPress = keys[keyIdx % keys.length];
      keyIdx++;

      // If player is currently casting a skill, WAIT for cast animation to finish!
      // In Silkroad, pressing the next skill key or moving while casting cancels the active animation!
      const castWaitStart = Date.now();
      while (this.running && !this.paused && this.playerCastingUntil && this.playerCastingUntil > Date.now()) {
        const remaining = Math.min(2500, this.playerCastingUntil - Date.now());
        await this.sleep(Math.max(60, remaining));
        if (Date.now() - castWaitStart > 3500) break; // Timeout safety
      }

      this.stats.skillsCast++;
      // Set expected cast window (at least 1000ms) so rapid loop doesn't immediately send next key
      if (!this.playerCastingUntil || this.playerCastingUntil < Date.now()) {
        this.playerCastingUntil = Date.now() + 1100;
      }
      this.dispatchKey(keyToPress, 55);

      const currentHp = this.telemetry.target.hpPercent !== undefined ? `%${this.telemetry.target.hpPercent}` : '?';
      this.log('SKILL', `⚡ Vuruş: [${keyToPress}] -> [${mobName}] Canı: ${currentHp}`, 'info');

      // Wait keyDelay plus allow server cast.start to register
      await this.sleep(this.applyJitter(keyDelay));

      // Wait for skill animation/cast to fully complete before attempting next key!
      while (this.running && !this.paused && this.playerCastingUntil && this.playerCastingUntil > Date.now()) {
        const remaining = Math.min(2500, this.playerCastingUntil - Date.now());
        await this.sleep(Math.max(60, remaining));
      }
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
    if (this.buffTickerInterval) clearInterval(this.buffTickerInterval);
    this.buffTickerInterval = setInterval(() => {
      if (this.running && !this.paused) {
        this.checkAndExecuteDynamicBuffs();
        this.checkAndUpgradeMasteries();
        this.checkAndUseSpeedScroll();
      }
    }, 1000);
  }

  checkAndUseSpeedScroll() {
    if (!this.running || this.paused) return;
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
    if (this.partyTraceInterval) clearInterval(this.partyTraceInterval);
    this.partyTraceInterval = setInterval(() => {
      if (this.running && !this.paused) {
        this.checkAndExecuteAutoTrace();
        this.checkAndExecuteAutoRes();
      }
    }, 450);
  }

  startApmTicker() {
    if (this.apmTickerInterval) clearInterval(this.apmTickerInterval);
    this.apmTickerInterval = setInterval(() => {
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
