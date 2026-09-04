/**
 * Silkroad Web Macro Bot - Background Service Worker
 * Handles global browser hotkeys and extension badge updates.
 */

chrome.commands.onCommand.addListener((command) => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || tabs.length === 0) return;
    const tabId = tabs[0].id;

    if (command === 'toggle-bot') {
      chrome.tabs.sendMessage(tabId, { type: 'TOGGLE_BOT' }, (response) => {
        if (chrome.runtime.lastError) return;
        updateBadge(response?.running);
      });
    } else if (command === 'toggle-hud') {
      chrome.tabs.sendMessage(tabId, { type: 'TOGGLE_HUD' }, () => {
        if (chrome.runtime.lastError) return;
      });
    }
  });
});

function updateBadge(isRunning) {
  if (isRunning) {
    chrome.action.setBadgeText({ text: 'ON' });
    chrome.action.setBadgeBackgroundColor({ color: '#27ae60' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

// Listen to status updates from content script
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'STATUS_CHANGE') {
    updateBadge(msg.running);
  }
  return true;
});
