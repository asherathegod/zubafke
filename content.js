/**
 * Silkroad Web Macro Bot - Content Script Bridge
 * Injects inpage.js into MAIN world and builds the isolated Shadow DOM HUD.
 */

(function () {
  console.log("%c[Silkroad Bot Pro]%c Content Script Initializing...", "color:#e67e22;font-weight:bold;", "color:#3498db;");

  // 1. Inject inpage.js into MAIN execution context
  function injectInpageScript() {
    try {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('inpage.js');
      script.onload = function () {
        this.remove();
      };
      (document.head || document.documentElement).appendChild(script);
    } catch (e) {
      console.error('[SRO Bot] Inpage injection failed:', e);
    }
  }

  injectInpageScript();

  // 2. Build Shadow DOM Host
  let hostEl = document.getElementById('sro-bot-host');
  if (!hostEl) {
    hostEl = document.createElement('div');
    hostEl.id = 'sro-bot-host';
    hostEl.style.position = 'absolute';
    hostEl.style.top = '0';
    hostEl.style.left = '0';
    hostEl.style.zIndex = '2147483647';
    (document.body || document.documentElement).appendChild(hostEl);
  }

  const shadowRoot = hostEl.attachShadow({ mode: 'open' });

  // 3. Dispatchers to inpage.js
  const keyDispatcher = (key, duration) => {
    window.postMessage({
      source: 'sro-bot-content',
      type: 'DISPATCH_KEY',
      payload: { key, duration }
    }, '*');
  };

  const clickDispatcher = (payload) => {
    window.postMessage({
      source: 'sro-bot-content',
      type: 'DISPATCH_CLICK',
      payload: payload
    }, '*');
  };

  const packetDispatcher = (payload) => {
    window.postMessage({
      source: 'sro-bot-content',
      type: 'SEND_PACKET',
      payload: payload
    }, '*');
  };

  const weaponDispatcher = (payload) => {
    window.postMessage({
      source: 'sro-bot-content',
      type: 'SWAP_WEAPON',
      payload: payload
    }, '*');
  };

  const assistConfigDispatcher = (payload) => {
    window.postMessage({
      source: 'sro-bot-content',
      type: 'SET_ASSIST_CONFIG',
      payload: payload
    }, '*');
  };

  const targetDispatcher = (payload) => {
    window.postMessage({
      source: 'sro-bot-content',
      type: 'SET_TARGET_ENTITY',
      payload: payload
    }, '*');
  };

  const clearTargetDispatcher = () => {
    window.postMessage({
      source: 'sro-bot-content',
      type: 'CLEAR_TARGET'
    }, '*');
  };

  const speedScrollDispatcher = () => {
    window.postMessage({
      source: 'sro-bot-content',
      type: 'USE_SPEED_SCROLL'
    }, '*');
  };

  try {
    const engine = new window.SroBotEngine(
      keyDispatcher,
      clickDispatcher,
      packetDispatcher,
      weaponDispatcher,
      assistConfigDispatcher,
      targetDispatcher,
      clearTargetDispatcher,
      speedScrollDispatcher
    );
    const hud = new window.SroHudController(shadowRoot, engine);

    // Listen to telemetry & hotkeys from inpage.js
    window.addEventListener('message', (event) => {
      if (event.source !== window || !event.data || event.data.source !== 'sro-bot-inpage') {
        return;
      }

      const { type, payload } = event.data;

      if (type === 'GAME_STATE_UPDATE') {
        engine.handleTelemetry(payload);
      } else if (type === 'TOO_MANY_REQUESTS') {
        engine.handleTooManyRequests(payload?.reason);
      } else if (type === 'REVIVE_ACCEPTED') {
        engine.log('PARTY', `✝️ Canlandırma teklifi otomatik kabul edildi! (Auto Res Accept)`, 'success');
      } else if (type === 'BUFFS_UPDATED') {
        if (payload?.buffs) {
          engine.telemetry.player.buffs = payload.buffs;
        }
      } else if (type === 'SPEED_SCROLL_USED') {
        engine.log('BUFF', `⚡ Hızlı Koşma Scrollu Basıldı: [${payload.item?.name || payload.item?.itemId || 'Speed Scroll'}] (Slot: ${payload.slot})`, 'success');
      } else if (type === 'PLAYER_CAST_START') {
        if (payload?.castMs) {
          engine.playerCastingUntil = Date.now() + payload.castMs;
        }
      } else if (type === 'PARTY_ASSIST_TARGET') {
        if (payload?.targetId) {
          engine.handlePartyAssistTarget(payload);
        }
      } else if (type === 'PACKET_CAPTURED') {
        if (payload?.packet) {
          engine.telemetry.capturedPackets.unshift(payload.packet);
          if (engine.telemetry.capturedPackets.length > 250) engine.telemetry.capturedPackets.pop();
          
          const pList = shadowRoot.getElementById('sro-packet-list');
          if (pList) {
            const p = payload.packet;
            const row = document.createElement('div');
            row.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
            row.style.padding = '2px 0';
            row.innerHTML = `<span style="color:#64748b;">[${p.timestamp}]</span> <span style="color:${p.dir === 'SEND' ? '#38bdf8' : '#c084fc'};font-weight:bold;">${p.dir}</span> <span style="color:#f1c40f;">${p.type}</span> <span style="color:#cbd5e1;">${p.raw}</span>`;
            pList.insertBefore(row, pList.firstChild);
            if (pList.children.length > 30) pList.lastChild.remove();
          }
        }
      } else if (type === 'SKILLS_DISCOVERED') {
        if (payload?.skills) {
          engine.telemetry.skills.discovered = payload.skills;
          hud.updateDiscoveredSkillsDropdown();
        }
      } else if (type === 'SKILLS_UPDATED') {
        if (payload?.known) engine.telemetry.skills.known = payload.known;
      } else if (type === 'UNIQUES_UPDATED') {
        if (payload?.uniques) engine.telemetry.uniques = payload.uniques;
        if (payload?.serverTime) {
          engine.telemetry.serverTime = payload.serverTime;
          engine.telemetry.serverTimeReceivedAt = Date.now();
        }
        hud.renderUniquesList();
      } else if (type === 'PARTY_UPDATED') {
        if (payload?.party) {
          engine.handlePartyUpdate(payload.party);
          hud.updatePartyUI();
        }
      } else if (type === 'TARGET_DIED') {
        engine.handleTargetDied(payload?.id);
      } else if (type === 'ITEM_DROPPED') {
        if (payload?.item) engine.handleDrop(payload.item);
      } else if (type === 'TOGGLE_HOTKEY') {
        engine.toggle();
      }
    });

    // Listen to messages from background / popup
    chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
      if (req.type === 'TOGGLE_BOT') {
        engine.toggle();
        sendResponse({ running: engine.running, state: engine.state });
      } else if (req.type === 'TOGGLE_HUD') {
        const panel = shadowRoot.getElementById('sro-hud-panel');
        const mini = shadowRoot.getElementById('sro-minimized');
        if (panel) {
          const isHidden = panel.classList.contains('hidden');
          if (isHidden) {
            panel.classList.remove('hidden');
            if (mini) mini.classList.add('hidden');
          } else {
            panel.classList.add('hidden');
          }
        }
        sendResponse({ visible: !panel?.classList.contains('hidden') });
      } else if (req.type === 'GET_STATUS') {
        sendResponse({
          running: engine.running,
          state: engine.state,
          stats: engine.stats,
          target: engine.telemetry.target
        });
      }
      return true;
    });

    console.log("%c[Silkroad Bot Pro]%c HUD & Mouse Automation Ready!", "color:#e67e22;font-weight:bold;", "color:#2ecc71;");

  } catch (err) {
    console.error('[SRO Bot] Overlay initialization error:', err);
  }

})();
