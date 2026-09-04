/**
 * Silkroad Web Macro Bot - Extension Popup Controller
 */

document.addEventListener('DOMContentLoaded', () => {
  const statusBadge = document.getElementById('popup-status-badge');
  const targetName = document.getElementById('popup-target-name');
  const targetHp = document.getElementById('popup-target-hp');
  const statKills = document.getElementById('stat-kills');
  const statSkills = document.getElementById('stat-skills');
  const statApm = document.getElementById('stat-apm');
  const btnToggleBot = document.getElementById('btn-toggle-bot');
  const btnToggleHud = document.getElementById('btn-toggle-hud');

  let currentTabId = null;

  // Query active tab
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || tabs.length === 0) return;
    currentTabId = tabs[0].id;
    refreshStatus();
  });

  function refreshStatus() {
    if (!currentTabId) return;
    chrome.tabs.sendMessage(currentTabId, { type: 'GET_STATUS' }, (res) => {
      if (chrome.runtime.lastError || !res) return;

      // Update badge
      if (res.running) {
        statusBadge.className = 'status-badge status-running';
        statusBadge.innerText = res.state || 'RUNNING';
        btnToggleBot.className = 'btn btn-danger';
        btnToggleBot.innerText = '⏹ BOTU DURDUR';
      } else {
        statusBadge.className = 'status-badge status-idle';
        statusBadge.innerText = 'IDLE';
        btnToggleBot.className = 'btn btn-primary';
        btnToggleBot.innerText = '▶ BOTU BAŞLAT (F8)';
      }

      // Update Target Telemetry
      if (res.target && res.target.hasTarget) {
        targetName.innerText = `${res.target.name || 'Canavar'} (%${res.target.hpPercent})`;
        targetHp.style.width = `${res.target.hpPercent}%`;
      } else {
        targetName.innerText = 'Aranıyor / Yok';
        targetHp.style.width = '0%';
      }

      // Update Stats
      if (res.stats) {
        statKills.innerText = res.stats.mobsDefeated || 0;
        statSkills.innerText = res.stats.skillsCast || 0;
        statApm.innerText = res.stats.apm || 0;
      }
    });
  }

  // Periodic status poll in popup
  setInterval(refreshStatus, 800);

  btnToggleBot.onclick = () => {
    if (!currentTabId) return;
    chrome.tabs.sendMessage(currentTabId, { type: 'TOGGLE_BOT' }, () => {
      refreshStatus();
    });
  };

  btnToggleHud.onclick = () => {
    if (!currentTabId) return;
    chrome.tabs.sendMessage(currentTabId, { type: 'TOGGLE_HUD' });
  };
});
