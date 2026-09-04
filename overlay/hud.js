/**
 * Silkroad Web Macro Bot - Modern 4-Tab Streamlined Floating HUD
 * 1. ⚔️ Savaş & Hedef (Skills, Delays, Giant Lock, Loot, Party Assist, Hunting Range)
 * 2. 🛡️ Buff & Res (Dynamic Buffs, Single Target Party Buffs, F1-F4 Pages + Slots, Auto Res & Accept, Weapon Swap)
 * 3. 👥 Parti & Takip (Auto Trace, Distance, Live Party Member List)
 * 4. ⚙️ Ayarlar & Araçlar (Auto Stat, CH/EU Masteries, Profiles, Updates & Tools)
 */

class SroHudController {
  constructor(shadowRoot, engine) {
    this.shadowRoot = shadowRoot;
    this.engine = engine;
    this.profiles = {};
    this.activeRaceTab = 'chinese';

    this.render();
    this.bindEvents();
    this.bindEngineCallbacks();
    this.loadSavedSettings();

    setInterval(() => this.updatePartyUI(), 1000);
    setInterval(() => this.renderUniquesList(), 1000);
    setInterval(() => this.updateLiveRangeUI(), 1000);
  }

  render() {
    this.shadowRoot.innerHTML = `
      <link rel="stylesheet" href="${chrome.runtime.getURL('overlay/hud.css')}">

      <!-- Minimized Floating Bubble -->
      <div id="sro-minimized" class="sro-minimized-badge hidden">
        <span style="font-size:14px;">🤖</span>
        <span id="sro-mini-status" class="sro-status-pill sro-status-idle">IDLE</span>
        <button id="sro-restore-btn" class="sro-btn sro-btn-primary" style="padding:2px 8px;font-size:11px;">Genişlet 🗖</button>
      </div>

      <!-- Main HUD Window -->
      <div id="sro-hud-panel" class="sro-hud-panel">
        
        <!-- Header -->
        <div id="sro-drag-header" class="sro-header">
          <div class="sro-title-box">
            <span style="font-size:16px;">⚔️</span>
            <span class="sro-title">Silkroad Macro Bot Pro</span>
            <span style="font-size:10px;background:#b45309;color:#fff;padding:1px 5px;border-radius:3px;font-weight:bold;">v3.6.4 Pro</span>
          </div>
          <div class="sro-header-controls">
            <button id="sro-minimize-btn" class="sro-icon-btn" title="Simge Durumuna Küçült">—</button>
          </div>
        </div>

        <!-- Live Target Bar -->
        <div class="sro-telemetry-banner">
          <div class="sro-target-header">
            <div id="sro-target-name" class="sro-target-name">
              <span>🎯</span> <span>Hedef: [Yok / Aranıyor]</span>
            </div>
            <div id="sro-target-hp-text" style="font-size:11px;color:#f1c40f;font-weight:bold;">%0</div>
          </div>
          <div class="sro-hp-track">
            <div id="sro-target-hp-bar" class="sro-hp-fill" style="width: 0%;"></div>
          </div>
        </div>

        <!-- Quick Control Bar -->
        <div class="sro-quick-bar">
          <div class="sro-btn-group">
            <button id="sro-start-btn" class="sro-btn sro-btn-primary">▶ BAŞLAT (F8)</button>
            <button id="sro-pause-btn" class="sro-btn sro-btn-secondary" style="display:none;">⏸ Duraklat</button>
            <button id="sro-stop-btn" class="sro-btn sro-btn-danger" style="display:none;">⏹ DURDUR</button>
          </div>
          <div id="sro-main-status" class="sro-status-pill sro-status-idle">IDLE</div>
        </div>

        <!-- Modern 4-Tab Navigation -->
        <div class="sro-tabs-nav">
          <button class="sro-tab-btn active" data-tab="tab-combat">⚔️ Savaş & Alan</button>
          <button class="sro-tab-btn" data-tab="tab-buffs">🛡️ Buff & Res</button>
          <button class="sro-tab-btn" data-tab="tab-party">👥 Parti & Takip</button>
          <button class="sro-tab-btn" data-tab="tab-settings">⚙️ Ayarlar & Araçlar</button>
        </div>

        <!-- Tab Body -->
        <div class="sro-tab-body">
          
          <!-- ========================================================= -->
          <!-- TAB 1: SAVAŞ & ALAN (Skills, Delays, Range, Assist, Loot) -->
          <!-- ========================================================= -->
          <div id="tab-combat" class="sro-tab-pane active">
            
            <!-- Skill Sequence -->
            <div class="sro-field-group">
              <label class="sro-label">⚡ Saldırı Skill Tuş Sırası (Sırasıyla Basılacak Tuşlar)</label>
              <div class="sro-row">
                <input id="cfg-skill-keys" type="text" class="sro-input" value="1,2,3,4" style="flex:1;font-weight:bold;color:#f1c40f;font-size:13px;" placeholder="Örn: 1,2,3,4 veya 1,2,3,4,5">
              </div>
              <div style="display:flex;gap:4px;margin-top:4px;">
                <button class="sro-preset-btn" data-keys="1,2,3,4">1, 2, 3, 4</button>
                <button class="sro-preset-btn" data-keys="1,2,3,4,5">1, 2, 3, 4, 5</button>
                <button class="sro-preset-btn" data-keys="1,2,3">1, 2, 3</button>
                <button class="sro-preset-btn" data-keys="1,2">1, 2</button>
                <button class="sro-preset-btn" data-keys="1">Sadece 1</button>
              </div>
            </div>

            <!-- Delays & Anti-Stuck & Giant Timeout -->
            <div class="sro-row sro-field-group" style="margin-top:8px;">
              <div style="flex:1;">
                <label class="sro-label">Tuş Gecikmesi (ms)</label>
                <input id="cfg-skill-delay" type="number" class="sro-input" value="280" min="160" max="1000">
              </div>
              <div style="flex:1;">
                <label class="sro-label">Hedef Tuşu</label>
                <input id="cfg-target-key" type="text" class="sro-input" value="Tab">
              </div>
              <div style="flex:1;">
                <label class="sro-label">Arama Bekleme (ms)</label>
                <input id="cfg-target-search-delay" type="number" class="sro-input" value="400" min="150" max="1500">
              </div>
            </div>

            <div class="sro-row sro-field-group">
              <div style="flex:1.2;">
                <label class="sro-label">Sıfır Hasar Engel Bırakma (sn)</label>
                <input id="cfg-stuck-timeout" type="number" class="sro-input" value="18" min="5" max="60">
              </div>
              <div style="flex:1;">
                <label class="sro-label">Dev/Giant Kilit Süresi (sn)</label>
                <input id="cfg-target-timeout" type="number" class="sro-input" value="35" min="10" max="90">
              </div>
            </div>
            <div style="font-size:9px;color:#94a3b8;margin-top:-6px;margin-bottom:8px;">
              *Mob engelin/tepenin ardında kalıp 5sn hasar almazsa hedef hemen bırakılır. Giant moblar hasar aldıkça asla bırakılmaz.*
            </div>

            <!-- 📍 KASILMA ALANI & RANGE SINIRI (HUNTING RANGE) -->
            <div class="sro-field-group" style="background:rgba(16,185,129,0.1);padding:10px;border-radius:6px;border:1px solid rgba(16,185,129,0.3);margin-top:10px;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                <label class="sro-checkbox-label">
                  <input id="cfg-range-enable" type="checkbox" checked>
                  <strong style="color:#10b981;">📍 Kasılma Alanı Sınırı (Range Limit)</strong>
                </label>
                <button id="btn-set-center" class="sro-btn sro-btn-secondary" style="font-size:10px;padding:3px 8px;">📍 Konumu Merkez Yap</button>
              </div>

              <div class="sro-row" style="margin-top:6px;align-items:center;">
                <label class="sro-label" style="margin:0;flex:1;">Menzil Yarıçapı: <span id="lbl-range-val" style="color:#f1c40f;font-weight:bold;">35m</span></label>
                <input id="cfg-range-radius" type="range" min="10" max="100" value="35" style="flex:1.5;">
              </div>

              <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;font-size:11px;color:#cbd5e1;">
                <span>Merkez: <strong id="lbl-center-coords" style="color:#38bdf8;">(Oto Belirlenecek)</strong></span>
                <span>Uzaklık: <strong id="lbl-current-dist" style="color:#f1c40f;">0m</strong></span>
              </div>

              <div style="font-size:9px;color:#94a3b8;margin-top:4px;">
                *Menzil dışına çıkıldığında bot atağı durdurup merkeze geri yürür. "Konumu Merkez Yap" butonuyla merkezi güncelleyebilirsiniz.*
              </div>
            </div>

            <!-- 🎯 PARTİ HEDEF DESTEĞİ (TARGET ASSIST) -->
            <div class="sro-field-group" style="background:rgba(217,119,6,0.12);padding:10px;border-radius:6px;border:1px solid rgba(245,158,11,0.3);margin-top:10px;">
              <label class="sro-checkbox-label">
                <input id="cfg-party-assist-enable" type="checkbox">
                <strong style="color:#f59e0b;">🎯 Parti Hedef Yardımı (Target Assist) Aktif</strong>
              </label>
              <div class="sro-row" style="margin-top:6px;">
                <select id="cfg-party-assist-target" class="sro-input" style="flex:1;">
                  <option value="">(Hedefi takip edilecek parti üyesi)</option>
                </select>
              </div>
              <div style="font-size:9px;color:#cbd5e1;margin-top:4px;">
                *Bu mod açıkken bot rastgele Tab basmaz. Yalnızca seçilen parti üyesinin vurduğu moba kilitlenir ve o mob ölene kadar sadece ona vurur.*
              </div>
            </div>

            <!-- ⚡ HIZLI KUTU TOPLAMA (SPACE LOOT) -->
            <div class="sro-field-group" style="background:rgba(0,0,0,0.25);padding:10px;border-radius:6px;border:1px solid rgba(255,255,255,0.08);margin-top:10px;">
              <label class="sro-checkbox-label">
                <input id="cfg-loot-enable" type="checkbox" checked>
                <strong style="color:#f1c40f;">⚡ Mob Ölünce Kutu Toplama (Space Loot)</strong>
              </label>
              <div class="sro-row" style="margin-top:6px;">
                <div style="flex:1;">
                  <label class="sro-label">Tuş</label>
                  <input id="cfg-loot-key" type="text" class="sro-input" value="Space">
                </div>
                <div style="flex:1;">
                  <label class="sro-label">Space Sayısı</label>
                  <input id="cfg-loot-burst-count" type="number" class="sro-input" value="10" min="3" max="20">
                </div>
                <div style="flex:1;">
                  <label class="sro-label">Aralık (ms)</label>
                  <input id="cfg-loot-burst-interval" type="number" class="sro-input" value="160" min="120" max="350">
                </div>
                <div style="flex:1.2;">
                  <label class="sro-label">Dinamik Durma (ms)</label>
                  <input id="cfg-loot-dynamic-stop" type="number" class="sro-input" value="500">
                </div>
              </div>
            </div>

          </div>

          <!-- ========================================================= -->
          <!-- TAB 2: BUFF & RES & DYNAMIC BUFF MANAGER                  -->
          <!-- ========================================================= -->
          <div id="tab-buffs" class="sro-tab-pane">
            
            <!-- ⚡ OTOMATİK HIZLI KOŞMA SCROLLU (SPEED SCROLL) -->
            <div class="sro-field-group" style="background:rgba(56,189,248,0.12);padding:10px;border-radius:6px;border:1px solid rgba(56,189,248,0.3);margin-bottom:10px;">
              <label class="sro-checkbox-label">
                <input id="cfg-auto-speed-scroll-enable" type="checkbox" checked>
                <strong style="color:#38bdf8;">⚡ Otomatik Hızlı Koşma Scrollu Bas (Speed Scroll)</strong>
              </label>
              <div style="font-size:9px;color:#cbd5e1;margin-top:4px;">
                *Çantadaki "Beginner scroll of movement" veya Hızlı Koşma İksirini otomatik basar. Yalnızca buff bittiğinde basar, israf etmez.*
              </div>
            </div>

            <!-- ⚔️ OTOMATİK SİLAH DEĞİŞİMİ (WEAPON SWAP) -->
            <div class="sro-field-group" style="background:rgba(139,92,246,0.12);padding:10px;border-radius:6px;border:1px solid rgba(168,85,247,0.35);">
              <label class="sro-checkbox-label">
                <input id="cfg-weapon-swap-enable" type="checkbox">
                <strong style="color:#c084fc;">⚔️ Buff & Res Basarken Otomatik Silah Değişimi (Swap)</strong>
              </label>
              <div class="sro-row" style="margin-top:6px;">
                <div style="flex:1;">
                  <label class="sro-label">Ana Silah</label>
                  <select id="cfg-main-weapon-type" class="sro-input">
                    <option value="auto">Otomatik Algıla</option>
                    <option value="eu_tstaff">Wizard Staff (2H)</option>
                    <option value="eu_tsword">Warrior 2H Sword</option>
                    <option value="eu_sword">Warrior 1H Sword</option>
                    <option value="eu_axe">Warrior Dual Axe</option>
                    <option value="bow">Okçu / Bow</option>
                    <option value="spear">Spear / Glavie</option>
                    <option value="sword">Sword / Blade</option>
                  </select>
                </div>
                <div style="flex:1;">
                  <label class="sro-label">Kalkan Seçeneği</label>
                  <div style="padding-top:4px;">
                    <label class="sro-checkbox-label" style="font-size:11px;">
                      <input id="cfg-swap-shield-enable" type="checkbox" checked>
                      <span>Cleric Rod takarken Kalkanı da tak</span>
                    </label>
                  </div>
                </div>
              </div>
              <div style="font-size:9px;color:#cbd5e1;margin-top:4px;">
                *Wizard/Cleric ve Bard oyuncuları için: Buff basılmadan önce envanterden Rod/Harp takılır, buff basılır ve anında ana silaha dönülür.*
              </div>
            </div>

            <!-- ✝️ CANLANDIRMA (RESURRECTION) SİSTEMİ -->
            <div class="sro-field-group" style="background:rgba(239,68,68,0.12);padding:10px;border-radius:6px;border:1px solid rgba(239,68,68,0.3);margin-top:10px;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                <label class="sro-checkbox-label">
                  <input id="cfg-auto-res-enable" type="checkbox">
                  <strong style="color:#f87171;">✝️ Ölen Parti Üyesini Dirilt (Auto Res)</strong>
                </label>
              </div>
              
              <div class="sro-row" style="align-items:center;">
                <div style="flex:1;">
                  <label class="sro-label">Hotbar Sayfası</label>
                  <select id="cfg-res-page" class="sro-input">
                    <option value="current">Mevcut Sayfa</option>
                    <option value="F1">F1</option>
                    <option value="F2" selected>F2</option>
                    <option value="F3">F3</option>
                    <option value="F4">F4</option>
                  </select>
                </div>
                <div style="flex:1;">
                  <label class="sro-label">Skill Slotu</label>
                  <select id="cfg-res-slot" class="sro-input">
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="4">4</option>
                    <option value="5">5</option>
                    <option value="6">6</option>
                    <option value="7">7</option>
                    <option value="8" selected>8</option>
                    <option value="9">9</option>
                    <option value="0">0</option>
                  </select>
                </div>
              </div>

              <!-- AUTO RES ACCEPT -->
              <div style="margin-top:10px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.08);">
                <label class="sro-checkbox-label">
                  <input id="cfg-auto-accept-res" type="checkbox" checked>
                  <strong style="color:#2ecc71;">⚡ Gelen Canlandırmayı Otomatik Kabul Et (Auto Accept Res)</strong>
                </label>
                <div style="font-size:9px;color:#94a3b8;margin-top:3px;">
                  *Karakteriniz öldüğünde şehre dönmeyip 'Wait for help' moduna geçer; birisi dirilttiğinde teklifi anında onaylar.*
                </div>
              </div>
            </div>

            <!-- 🛡️ DİNAMİK BUFF LİSTESİ -->
            <div style="display:flex;justify-content:space-between;align-items:center;margin:12px 0 6px 0;">
              <span style="font-weight:700;color:#f1c40f;font-size:12px;">🛡️ Aktif Bufflar & İmbue Yönetimi</span>
              <button id="btn-add-buff" class="sro-btn sro-btn-primary" style="font-size:10px;padding:3px 8px;">+ Yeni Buff Ekle</button>
            </div>

            <div id="sro-buff-list-container" style="display:flex;flex-direction:column;gap:6px;">
              <!-- Dynamic Buff cards inserted here -->
            </div>

          </div>

          <!-- ========================================================= -->
          <!-- TAB 3: PARTİ & TAKİP (Auto Trace & Member Status)         -->
          <!-- ========================================================= -->
          <div id="tab-party" class="sro-tab-pane">
            
            <div class="sro-field-group" style="background:rgba(0,0,0,0.35);padding:10px;border-radius:6px;border:1px solid rgba(56,189,248,0.25);">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                <strong style="color:#38bdf8;font-size:12px;">🚶 Otomatik Parti Takibi (Auto Trace)</strong>
                <button id="sro-toggle-trace-btn" class="sro-btn sro-btn-secondary" style="font-size:10px;padding:3px 10px;">Takip: KAPALI</button>
              </div>
              <div class="sro-row">
                <select id="cfg-trace-target-select" class="sro-input" style="flex:1;">
                  <option value="">(Parti üyesi seçin)</option>
                </select>
              </div>
              <div class="sro-row" style="margin-top:8px;align-items:center;">
                <label class="sro-label" style="margin:0;flex:1;">Takip Mesafesi: <span id="cfg-trace-dist-val" style="color:#f1c40f;">7m</span></label>
                <input id="cfg-trace-dist" type="range" min="3" max="25" value="7" style="flex:1.5;">
              </div>
              <div style="font-size:9px;color:#94a3b8;margin-top:4px;">
                *Lider veya seçilen parti üyesi hareket ettiğinde bot geriye adım atmaksızın güvenli mesafeyle takip eder.*
              </div>
            </div>

            <div style="display:flex;justify-content:space-between;align-items:center;margin:12px 0 6px 0;">
              <span class="sro-label" style="margin:0;">Canlı Parti Üyeleri (<span id="sro-party-count">0</span> Üye)</span>
              <button id="sro-refresh-party-btn" class="sro-icon-btn" style="font-size:10px;">Yenile 🔄</button>
            </div>

            <div id="sro-party-members-list" style="display:flex;flex-direction:column;gap:6px;">
              <div style="text-align:center;padding:12px;color:#64748b;font-size:11px;">
                Henüz bir partide değilsiniz veya parti bilgisi bekleniyor.
              </div>
            </div>

          </div>

          <!-- ========================================================= -->
          <!-- TAB 4: AYARLAR & ARAÇLAR (Stat, Mastery, Update, Tools)  -->
          <!-- ========================================================= -->
          <div id="tab-settings" class="sro-tab-pane">
            
            <!-- 🚀 OTOMATİK GÜNCELLEME & SÜRÜM BİLGİSİ -->
            <div class="sro-field-group" style="background:rgba(59,130,246,0.12);padding:10px;border-radius:6px;border:1px solid rgba(59,130,246,0.35);">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <div>
                  <strong style="color:#60a5fa;font-size:12px;">🚀 Bot Sürümü & Otomatik Güncelleme</strong>
                  <div style="font-size:10px;color:#cbd5e1;margin-top:2px;">Mevcut Sürüm: <span style="color:#f1c40f;font-weight:bold;">v3.6.4 Pro</span></div>
                </div>
                <button id="btn-check-updates" class="sro-btn sro-btn-primary" style="font-size:10px;padding:4px 10px;">🔄 Güncellemeleri Denetle</button>
              </div>

              <div style="margin-top:8px;">
                <label class="sro-label">⚡ Otomatik Güncelleme Komutu (Tıkla ve Kopyala):</label>
                <input id="cmd-update-box" type="text" class="sro-input" readonly value="irm https://raw.githubusercontent.com/asherathegod/zubafke/main/update.ps1 | iex" style="cursor:pointer;background:#090d16;color:#38bdf8;font-family:monospace;font-size:11px;" title="Tıklayarak kopyalayabilirsiniz">
              </div>
              <div style="margin-top:6px;">
                <label class="sro-label">👥 Arkadaşların İçin Tek Satır Kurulum Komutu:</label>
                <input id="cmd-install-box" type="text" class="sro-input" readonly value="irm https://raw.githubusercontent.com/asherathegod/zubafke/main/install.ps1 | iex" style="cursor:pointer;background:#090d16;color:#a855f7;font-family:monospace;font-size:11px;" title="Arkadaşına gönder, PowerShell'e yapıştırsın">
              </div>
              <div id="update-status-msg" style="font-size:11px;color:#10b981;margin-top:6px;padding:6px;background:rgba(0,0,0,0.3);border-radius:4px;display:none;">
              </div>
            </div>

            <!-- Stat Allocation -->
            <div class="sro-field-group" style="margin-top:10px;">
              <label class="sro-checkbox-label">
                <input id="cfg-auto-stat-enable" type="checkbox">
                <strong style="color:#2ecc71;">🧬 Otomatik Stat Dağıtıcı (Auto INT/STR)</strong>
              </label>
              <div class="sro-row" style="margin-top:6px;">
                <select id="cfg-stat-build" class="sro-input" style="flex:1;">
                  <option value="pure_int">Pure INT Nuker (Tüm puanlar INT)</option>
                  <option value="pure_str">Pure STR Tank (Tüm puanlar STR)</option>
                  <option value="hybrid_2_1_int">Hybrid 2:1 INT (2 INT / 1 STR)</option>
                  <option value="hybrid_2_1_str">Hybrid 2:1 STR (2 STR / 1 INT)</option>
                </select>
              </div>
            </div>

            <!-- CH / EU Multi Mastery -->
            <div class="sro-field-group" style="margin-top:10px;border-top:1px solid rgba(255,255,255,0.08);padding-top:10px;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                <label class="sro-checkbox-label">
                  <input id="cfg-auto-mastery-enable" type="checkbox">
                  <strong style="color:#f1c40f;">📜 Otomatik Çoklu Mastery Yükseltici</strong>
                </label>
              </div>

              <!-- Race Switcher Buttons -->
              <div style="display:flex;gap:4px;margin-bottom:8px;">
                <button id="btn-race-ch" class="sro-btn sro-btn-primary" style="flex:1;font-size:11px;">🇨🇳 Chinese (CH)</button>
                <button id="btn-race-eu" class="sro-btn sro-btn-secondary" style="flex:1;font-size:11px;">🇪🇺 European (EU)</button>
              </div>

              <!-- Chinese Masteries -->
              <div id="grid-masteries-ch" style="display:grid;grid-template-columns:repeat(2, 1fr);gap:6px;background:rgba(0,0,0,0.3);padding:8px;border-radius:4px;">
                <label class="sro-checkbox-label"><input type="checkbox" class="cfg-mastery-chk" value="lightning"> Lightning (Şimşek)</label>
                <label class="sro-checkbox-label"><input type="checkbox" class="cfg-mastery-chk" value="fire"> Fire (Ateş)</label>
                <label class="sro-checkbox-label"><input type="checkbox" class="cfg-mastery-chk" value="cold"> Cold (Buz)</label>
                <label class="sro-checkbox-label"><input type="checkbox" class="cfg-mastery-chk" value="heuksal"> Heuksal (Glaive/Spear)</label>
                <label class="sro-checkbox-label"><input type="checkbox" class="cfg-mastery-chk" value="bicheon"> Bicheon (Kılıç/Kalkan)</label>
                <label class="sro-checkbox-label"><input type="checkbox" class="cfg-mastery-chk" value="pacheon"> Pacheon (Okçu/Bow)</label>
              </div>

              <!-- European Masteries -->
              <div id="grid-masteries-eu" style="display:none;grid-template-columns:repeat(2, 1fr);gap:6px;background:rgba(0,0,0,0.3);padding:8px;border-radius:4px;">
                <label class="sro-checkbox-label"><input type="checkbox" class="cfg-mastery-chk" value="warrior"> Warrior (Savaşçı)</label>
                <label class="sro-checkbox-label"><input type="checkbox" class="cfg-mastery-chk" value="wizard"> Wizard (Büyücü)</label>
                <label class="sro-checkbox-label"><input type="checkbox" class="cfg-mastery-chk" value="rogue"> Rogue (Dagger/Crossbow)</label>
                <label class="sro-checkbox-label"><input type="checkbox" class="cfg-mastery-chk" value="warlock"> Warlock (Kara Büyü)</label>
                <label class="sro-checkbox-label"><input type="checkbox" class="cfg-mastery-chk" value="bard"> Bard (Müzisyen)</label>
                <label class="sro-checkbox-label"><input type="checkbox" class="cfg-mastery-chk" value="cleric"> Cleric (Rahip / Healer)</label>
              </div>
            </div>

            <!-- Profil Yönetimi -->
            <div class="sro-field-group" style="margin-top:10px;border-top:1px solid rgba(255,255,255,0.08);padding-top:10px;">
              <label class="sro-label">💾 Kayıtlı Profil Seç & Yükle</label>
              <div class="sro-row">
                <select id="sro-profile-select" class="sro-input" style="flex:1;">
                  <option value="default_int">Varsayılan Pure INT Nuker</option>
                  <option value="default_str">Varsayılan Pure STR Tank</option>
                  <option value="eu_wizard">EU Wizard / Cleric</option>
                  <option value="eu_warrior">EU Warrior / Cleric</option>
                </select>
                <button id="sro-load-profile-btn" class="sro-btn sro-btn-secondary" style="font-size:11px;">Yükle</button>
              </div>
              <div class="sro-row" style="margin-top:6px;">
                <input id="sro-new-profile-name" type="text" class="sro-input" placeholder="Yeni Profil İsmi" style="flex:1;">
                <button id="sro-save-profile-btn" class="sro-btn sro-btn-secondary" style="font-size:11px;">Kaydet</button>
              </div>
            </div>

            <!-- Boss Timers & Packet Logger -->
            <div class="sro-field-group" style="margin-top:10px;border-top:1px solid rgba(255,255,255,0.08);padding-top:10px;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                <strong style="color:#ef4444;font-size:12px;">👑 Unique Boss Takipçisi</strong>
                <button id="btn-refresh-uniques" class="sro-icon-btn" style="font-size:10px;">Yenile 🔄</button>
              </div>
              <div id="sro-uniques-list" style="max-height:90px;overflow-y:auto;background:rgba(0,0,0,0.25);border-radius:4px;padding:6px;font-size:11px;">
                <div style="color:#64748b;text-align:center;">Boss zamanları taranıyor...</div>
              </div>
            </div>

            <!-- 📦 CANLI PAKET YAKALAYICI (PACKET HARVESTER) -->
            <div class="sro-field-group" style="margin-top:10px;border-top:1px solid rgba(255,255,255,0.08);padding-top:10px;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                <strong style="color:#a855f7;font-size:12px;">📦 Canlı Paket Yakalayıcı (Packet Harvester)</strong>
                <div style="display:flex;gap:4px;">
                  <button id="btn-clear-packets" class="sro-icon-btn" style="font-size:10px;">Temizle 🗑️</button>
                  <button id="btn-copy-packets" class="sro-icon-btn" style="font-size:10px;background:#8b5cf6;color:#fff;font-weight:bold;">Kopyala 📋</button>
                </div>
              </div>
              <div id="sro-packet-list" style="max-height:130px;overflow-y:auto;background:#090d16;border-radius:4px;padding:6px;font-family:monospace;font-size:10px;border:1px solid rgba(255,255,255,0.08);color:#94a3b8;">
                <div style="color:#64748b;text-align:center;">Paketler dinleniyor...</div>
              </div>
            </div>

          </div>

        </div>

        <!-- Real-Time Console Logs -->
        <div style="padding: 6px 14px 0 14px;">
          <div class="sro-console" id="sro-console-logs">
            <div class="sro-log-row"><span class="sro-log-time">[${new Date().toLocaleTimeString()}]</span> <span class="sro-log-tag tag-SYS">SYS</span> Silkroad Bot Pro v3.6 hazır. F8 ile başlatabilirsiniz.</div>
          </div>
        </div>

        <!-- Footer -->
        <div class="sro-footer">
          <div>APM: <span id="sro-stat-apm" style="color:#f1c40f;font-weight:bold;">0</span> | Kesilen: <span id="sro-stat-kills" style="color:#2ecc71;font-weight:bold;">0</span> | İtem: <span id="sro-stat-drops" style="color:#38bdf8;font-weight:bold;">0</span></div>
          <div>Kısayol: <strong style="color:#f1c40f;">F8</strong></div>
        </div>

      </div>
    `;

    this.renderDynamicBuffList();
  }

  /* =========================================================================
   * DYNAMIC BUFF LIST RENDERING & CONTROLS
   * ========================================================================= */
  renderDynamicBuffList() {
    const container = this.shadowRoot.getElementById('sro-buff-list-container');
    if (!container) return;

    const buffs = this.engine.getBuffList();
    if (buffs.length === 0) {
      container.innerHTML = `<div style="text-align:center;padding:10px;color:#64748b;font-size:11px;">Ekli buff yok. "+ Yeni Buff Ekle" butonuna basarak ekleyebilirsiniz.</div>`;
      return;
    }

    const partyMembers = this.engine.telemetry.party?.members || [];

    let html = '';
    buffs.forEach((b, idx) => {
      const isPartySingle = b.targetType === 'party_single';

      let partyMemberOptions = '<option value="">(Parti Üyesi Seçin)</option>';
      partyMembers.forEach(m => {
        const isSel = (b.partyMemberName || '').toLowerCase() === (m.name || '').toLowerCase() ? 'selected' : '';
        partyMemberOptions += `<option value="${m.name}" ${isSel}>${m.name} (Lv.${m.level || '?'})</option>`;
      });

      html += `
        <div class="sro-skill-item" data-buff-id="${b.id}" style="background:rgba(30,41,59,0.7);padding:8px;border-radius:6px;border:1px solid rgba(255,255,255,0.08);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <label class="sro-checkbox-label" style="font-weight:bold;color:#f1c40f;flex:1;">
              <input type="checkbox" class="buff-prop-enable" ${b.enabled ? 'checked' : ''}>
              <input type="text" class="buff-prop-name sro-input" value="${b.name || 'Buff'}" style="width:140px;padding:2px 6px;font-size:11px;font-weight:bold;display:inline-block;margin-left:4px;">
            </label>
            <button class="sro-btn sro-btn-danger buff-del-btn" data-buff-id="${b.id}" style="padding:2px 6px;font-size:10px;">🗑️ Sil</button>
          </div>

          <div class="sro-row" style="gap:6px;align-items:center;margin-bottom:6px;">
            <div style="flex:1.2;">
              <label class="sro-label" style="margin-bottom:2px;">Hedef Türü</label>
              <select class="buff-prop-target-type sro-input" style="font-size:11px;padding:3px 4px;">
                <option value="self" ${b.targetType === 'self' ? 'selected' : ''}>Kişisel (Self)</option>
                <option value="party_single" ${b.targetType === 'party_single' ? 'selected' : ''}>Parti Üyesi (Tekli)</option>
                <option value="party_all" ${b.targetType === 'party_all' ? 'selected' : ''}>Tüm Parti (Alan)</option>
              </select>
            </div>

            <div class="buff-party-member-box" style="flex:1.3;display:${isPartySingle ? 'block' : 'none'};">
              <label class="sro-label" style="margin-bottom:2px;">Hedef Parti Üyesi</label>
              <select class="buff-prop-party-member sro-input" style="font-size:11px;padding:3px 4px;">
                ${partyMemberOptions}
              </select>
            </div>

            <div style="flex:1;">
              <label class="sro-label" style="margin-bottom:2px;">Silah Şartı</label>
              <select class="buff-prop-weapon sro-input" style="font-size:11px;padding:3px 4px;">
                <option value="none" ${b.weaponReq === 'none' ? 'selected' : ''}>Yok</option>
                <option value="cleric" ${b.weaponReq === 'cleric' ? 'selected' : ''}>Cleric Rod</option>
                <option value="bard" ${b.weaponReq === 'bard' ? 'selected' : ''}>Bard Harp</option>
              </select>
            </div>
          </div>

          <div class="sro-row" style="gap:6px;align-items:center;">
            <div style="flex:1;">
              <label class="sro-label" style="margin-bottom:2px;">Sayfa</label>
              <select class="buff-prop-page sro-input" style="font-size:11px;padding:3px 4px;">
                <option value="current" ${b.page === 'current' ? 'selected' : ''}>Mevcut</option>
                <option value="F1" ${b.page === 'F1' ? 'selected' : ''}>F1</option>
                <option value="F2" ${b.page === 'F2' ? 'selected' : ''}>F2</option>
                <option value="F3" ${b.page === 'F3' ? 'selected' : ''}>F3</option>
                <option value="F4" ${b.page === 'F4' ? 'selected' : ''}>F4</option>
              </select>
            </div>

            <div style="flex:1;">
              <label class="sro-label" style="margin-bottom:2px;">Slot</label>
              <select class="buff-prop-slot sro-input" style="font-size:11px;padding:3px 4px;">
                ${[1,2,3,4,5,6,7,8,9,0].map(s => `<option value="${s}" ${b.slot == s ? 'selected' : ''}>${s}</option>`).join('')}
              </select>
            </div>

            <div style="flex:1;">
              <label class="sro-label" style="margin-bottom:2px;">Süre (sn)</label>
              <input type="number" class="buff-prop-sec sro-input" value="${b.intervalSec || 120}" min="5" max="900" style="padding:3px 4px;font-size:11px;">
            </div>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
    this.bindDynamicBuffEvents();
  }

  bindDynamicBuffEvents() {
    const container = this.shadowRoot.getElementById('sro-buff-list-container');
    if (!container) return;

    // Delete Buff Button
    container.querySelectorAll('.buff-del-btn').forEach(btn => {
      btn.onclick = (e) => {
        const id = btn.getAttribute('data-buff-id');
        this.engine.config.buffList = this.engine.getBuffList().filter(b => b.id !== id);
        this.renderDynamicBuffList();
        this.saveSettings();
      };
    });

    // Inputs inside cards
    container.querySelectorAll('.sro-skill-item').forEach(itemEl => {
      const id = itemEl.getAttribute('data-buff-id');
      const buff = this.engine.getBuffList().find(b => b.id === id);
      if (!buff) return;

      const chkEnable = itemEl.querySelector('.buff-prop-enable');
      const inpName = itemEl.querySelector('.buff-prop-name');
      const selTargetType = itemEl.querySelector('.buff-prop-target-type');
      const boxPartyMember = itemEl.querySelector('.buff-party-member-box');
      const selPartyMember = itemEl.querySelector('.buff-prop-party-member');
      const selWeapon = itemEl.querySelector('.buff-prop-weapon');
      const selPage = itemEl.querySelector('.buff-prop-page');
      const selSlot = itemEl.querySelector('.buff-prop-slot');
      const inpSec = itemEl.querySelector('.buff-prop-sec');

      chkEnable.onchange = () => { buff.enabled = chkEnable.checked; this.saveSettings(); };
      inpName.onchange = () => { buff.name = inpName.value; this.saveSettings(); };
      selTargetType.onchange = () => {
        buff.targetType = selTargetType.value;
        boxPartyMember.style.display = buff.targetType === 'party_single' ? 'block' : 'none';
        this.saveSettings();
      };
      if (selPartyMember) selPartyMember.onchange = () => { buff.partyMemberName = selPartyMember.value; this.saveSettings(); };
      selWeapon.onchange = () => { buff.weaponReq = selWeapon.value; this.saveSettings(); };
      selPage.onchange = () => { buff.page = selPage.value; this.saveSettings(); };
      selSlot.onchange = () => { buff.slot = selSlot.value; this.saveSettings(); };
      inpSec.onchange = () => { buff.intervalSec = parseInt(inpSec.value, 10) || 120; this.saveSettings(); };
    });
  }

  updateLiveRangeUI() {
    const lblDist = this.shadowRoot.getElementById('lbl-current-dist');
    const lblCenter = this.shadowRoot.getElementById('lbl-center-coords');
    if (!lblDist || !lblCenter) return;

    const hunting = this.engine.config.hunting;
    if (hunting?.centerX != null) {
      lblCenter.innerText = `(${hunting.centerX}, ${hunting.centerZ})`;
      const p = this.engine.telemetry.player;
      if (p.x && p.z) {
        const dist = Math.round(Math.hypot(p.x - hunting.centerX, p.z - hunting.centerZ));
        lblDist.innerText = `${dist}m / ${hunting.radius || 35}m`;
        lblDist.style.color = dist > (hunting.radius || 35) ? '#ef4444' : '#f1c40f';
      }
    } else {
      lblCenter.innerText = '(Oto Belirlenecek)';
      lblDist.innerText = '0m';
    }
  }

  bindEvents() {
    const $ = (id) => this.shadowRoot.getElementById(id);

    // Minimize & Restore
    $('sro-minimize-btn').onclick = () => {
      $('sro-hud-panel').classList.add('hidden');
      $('sro-minimized').classList.remove('hidden');
    };
    $('sro-restore-btn').onclick = () => {
      $('sro-minimized').classList.add('hidden');
      $('sro-hud-panel').classList.remove('hidden');
    };

    // Bot Controls
    $('sro-start-btn').onclick = () => this.engine.start();
    $('sro-stop-btn').onclick = () => this.engine.stop();
    $('sro-pause-btn').onclick = () => this.engine.setPaused(!this.engine.paused);

    // Tab Switching
    this.shadowRoot.querySelectorAll('.sro-tab-btn').forEach(btn => {
      btn.onclick = () => {
        this.shadowRoot.querySelectorAll('.sro-tab-btn').forEach(b => b.classList.remove('active'));
        this.shadowRoot.querySelectorAll('.sro-tab-pane').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const pane = $(btn.getAttribute('data-tab'));
        if (pane) pane.classList.add('active');
      };
    });

    // Presets
    this.shadowRoot.querySelectorAll('.sro-preset-btn').forEach(btn => {
      btn.onclick = () => {
        const keys = btn.getAttribute('data-keys');
        $('cfg-skill-keys').value = keys;
        this.engine.config.combat.skillKeySequence = keys;
        this.saveSettings();
      };
    });

    // Skill keys & Delays
    $('cfg-skill-keys').onchange = () => {
      this.engine.config.combat.skillKeySequence = $('cfg-skill-keys').value;
      this.saveSettings();
    };
    $('cfg-skill-delay').onchange = () => {
      this.engine.config.combat.keyDelayMs = parseInt($('cfg-skill-delay').value, 10);
      this.saveSettings();
    };
    $('cfg-target-key').onchange = () => {
      this.engine.config.targeting.key = $('cfg-target-key').value;
      this.saveSettings();
    };
    $('cfg-target-search-delay').onchange = () => {
      this.engine.config.targeting.searchDelayMs = parseInt($('cfg-target-search-delay').value, 10);
      this.saveSettings();
    };
    $('cfg-target-timeout').onchange = () => {
      this.engine.config.targeting.mobStallTimeoutSec = parseInt($('cfg-target-timeout').value, 10);
      this.saveSettings();
    };
    $('cfg-stuck-timeout').onchange = () => {
      this.engine.config.targeting.stuckTimeoutSec = parseInt($('cfg-stuck-timeout').value, 10);
      this.saveSettings();
    };

    // Range controls
    $('cfg-range-enable').onchange = () => {
      this.engine.config.hunting.rangeEnabled = $('cfg-range-enable').checked;
      this.saveSettings();
    };
    $('cfg-range-radius').oninput = () => {
      const rad = parseInt($('cfg-range-radius').value, 10);
      $('lbl-range-val').innerText = `${rad}m`;
      this.engine.config.hunting.radius = rad;
      this.saveSettings();
    };
    $('btn-set-center').onclick = () => {
      this.engine.setHuntingCenter();
      this.updateLiveRangeUI();
      this.saveSettings();
    };

    // Target Assist
    $('cfg-party-assist-enable').onchange = () => {
      this.engine.config.party.assistEnabled = $('cfg-party-assist-enable').checked;
      this.engine.assistConfigDispatcher({ assistMemberName: this.engine.config.party.assistMemberName, autoAcceptRes: this.engine.config.party.autoAcceptRes });
      this.saveSettings();
    };
    $('cfg-party-assist-target').onchange = () => {
      this.engine.config.party.assistMemberName = $('cfg-party-assist-target').value;
      this.engine.assistConfigDispatcher({ assistMemberName: $('cfg-party-assist-target').value, autoAcceptRes: this.engine.config.party.autoAcceptRes });
      this.saveSettings();
    };

    // Loot
    $('cfg-loot-enable').onchange = () => {
      this.engine.config.looting.enabled = $('cfg-loot-enable').checked;
      this.saveSettings();
    };
    $('cfg-loot-key').onchange = () => {
      this.engine.config.looting.key = $('cfg-loot-key').value;
      this.saveSettings();
    };
    $('cfg-loot-burst-count').onchange = () => {
      this.engine.config.looting.spaceBurstCount = parseInt($('cfg-loot-burst-count').value, 10);
      this.saveSettings();
    };
    $('cfg-loot-burst-interval').onchange = () => {
      this.engine.config.looting.burstIntervalMs = parseInt($('cfg-loot-burst-interval').value, 10);
      this.saveSettings();
    };
    $('cfg-loot-dynamic-stop').onchange = () => {
      this.engine.config.looting.dynamicLogStopMs = parseInt($('cfg-loot-dynamic-stop').value, 10);
      this.saveSettings();
    };

    // Weapon Swap
    $('cfg-weapon-swap-enable').onchange = () => {
      this.engine.config.buffs.autoWeaponSwap = $('cfg-weapon-swap-enable').checked;
      this.saveSettings();
    };
    $('cfg-main-weapon-type').onchange = () => {
      this.engine.config.buffs.mainWeapon = $('cfg-main-weapon-type').value;
      this.saveSettings();
    };
    $('cfg-swap-shield-enable').onchange = () => {
      this.engine.config.buffs.equipShield = $('cfg-swap-shield-enable').checked;
      this.saveSettings();
    };

    // Speed Scroll
    if ($('cfg-auto-speed-scroll-enable')) {
      $('cfg-auto-speed-scroll-enable').onchange = () => {
        if (!this.engine.config.buffs) this.engine.config.buffs = {};
        this.engine.config.buffs.autoSpeedScroll = $('cfg-auto-speed-scroll-enable').checked;
        this.saveSettings();
      };
    }

    // Packet Harvester Clear & Copy
    const btnClearPackets = $('btn-clear-packets');
    if (btnClearPackets) {
      btnClearPackets.onclick = () => {
        this.engine.telemetry.capturedPackets = [];
        const pList = $('sro-packet-list');
        if (pList) pList.innerHTML = '<div style="color:#64748b;text-align:center;">Paketler temizlendi.</div>';
        this.engine.log('TOOL', 'Paket listesi temizlendi.', 'info');
      };
    }

    const btnCopyPackets = $('btn-copy-packets');
    if (btnCopyPackets) {
      btnCopyPackets.onclick = async () => {
        const packets = this.engine.telemetry.capturedPackets || [];
        const json = JSON.stringify(packets, null, 2);
        try {
          await navigator.clipboard.writeText(json);
          btnCopyPackets.innerText = 'Kopyalandı! ✅';
          setTimeout(() => { btnCopyPackets.innerText = 'Kopyala 📋'; }, 2000);
          this.engine.log('TOOL', `📋 ${packets.length} adet paket panoya kopyalandı!`, 'success');
        } catch (e) {
          const ta = document.createElement('textarea');
          ta.value = json;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          ta.remove();
          btnCopyPackets.innerText = 'Kopyalandı! ✅';
          setTimeout(() => { btnCopyPackets.innerText = 'Kopyala 📋'; }, 2000);
          this.engine.log('TOOL', `📋 ${packets.length} adet paket panoya kopyalandı!`, 'success');
        }
      };
    }

    // Auto Res & Accept
    $('cfg-auto-res-enable').onchange = () => {
      this.engine.config.party.autoResEnabled = $('cfg-auto-res-enable').checked;
      this.saveSettings();
    };
    $('cfg-res-page').onchange = () => {
      this.engine.config.party.resPage = $('cfg-res-page').value;
      this.saveSettings();
    };
    $('cfg-res-slot').onchange = () => {
      this.engine.config.party.resSlot = $('cfg-res-slot').value;
      this.saveSettings();
    };
    $('cfg-auto-accept-res').onchange = () => {
      this.engine.config.party.autoAcceptRes = $('cfg-auto-accept-res').checked;
      this.engine.assistConfigDispatcher({ assistMemberName: this.engine.config.party.assistMemberName, autoAcceptRes: $('cfg-auto-accept-res').checked });
      this.saveSettings();
    };

    // Dynamic Buff Manager Button
    $('btn-add-buff').onclick = () => {
      const list = this.engine.getBuffList();
      list.push({
        id: 'buff_' + Date.now(),
        name: 'Yeni Buff',
        enabled: true,
        page: 'current',
        slot: '1',
        intervalSec: 120,
        targetType: 'self',
        partyMemberName: '',
        weaponReq: 'none',
        castDelayMs: 400
      });
      this.renderDynamicBuffList();
      this.saveSettings();
    };

    // Auto Trace
    $('sro-toggle-trace-btn').onclick = () => {
      const active = !this.engine.config.party.autoTraceEnabled;
      this.engine.config.party.autoTraceEnabled = active;
      $('sro-toggle-trace-btn').innerText = active ? 'Takip: AÇIK 🟢' : 'Takip: KAPALI';
      $('sro-toggle-trace-btn').className = active ? 'sro-btn sro-btn-primary' : 'sro-btn sro-btn-secondary';
      this.saveSettings();
    };
    $('cfg-trace-target-select').onchange = () => {
      this.engine.config.party.traceTargetName = $('cfg-trace-target-select').value;
      this.saveSettings();
    };
    $('cfg-trace-dist').oninput = () => {
      const val = $('cfg-trace-dist').value;
      $('cfg-trace-dist-val').innerText = `${val}m`;
      this.engine.config.party.traceDistance = parseInt(val, 10);
      this.saveSettings();
    };
    $('sro-refresh-party-btn').onclick = () => this.updatePartyUI();

    // Auto Stat
    $('cfg-auto-stat-enable').onchange = () => {
      this.engine.config.autoProgression.autoStatEnabled = $('cfg-auto-stat-enable').checked;
      this.saveSettings();
    };
    $('cfg-stat-build').onchange = () => {
      this.engine.config.autoProgression.statBuild = $('cfg-stat-build').value;
      this.saveSettings();
    };

    // Auto Mastery
    $('cfg-auto-mastery-enable').onchange = () => {
      this.engine.config.autoProgression.autoMasteryEnabled = $('cfg-auto-mastery-enable').checked;
      this.saveSettings();
    };
    $('btn-race-ch').onclick = () => {
      this.activeRaceTab = 'chinese';
      $('btn-race-ch').className = 'sro-btn sro-btn-primary';
      $('btn-race-eu').className = 'sro-btn sro-btn-secondary';
      $('grid-masteries-ch').style.display = 'grid';
      $('grid-masteries-eu').style.display = 'none';
      this.engine.config.autoProgression.race = 'chinese';
      this.saveSettings();
    };
    $('btn-race-eu').onclick = () => {
      this.activeRaceTab = 'european';
      $('btn-race-eu').className = 'sro-btn sro-btn-primary';
      $('btn-race-ch').className = 'sro-btn sro-btn-secondary';
      $('grid-masteries-eu').style.display = 'grid';
      $('grid-masteries-ch').style.display = 'none';
      this.engine.config.autoProgression.race = 'european';
      this.saveSettings();
    };

    this.shadowRoot.querySelectorAll('.cfg-mastery-chk').forEach(chk => {
      chk.onchange = () => {
        const val = chk.value;
        this.engine.config.autoProgression.masteries[val] = chk.checked;
        this.saveSettings();
      };
    });

    // Update Box & Install Box (Click to Copy)
    $('cmd-update-box').onclick = () => {
      navigator.clipboard.writeText($('cmd-update-box').value);
      const msg = $('update-status-msg');
      msg.innerHTML = "✓ Güncelleme komutu panoya kopyalandı! PowerShell'e yapıştırıp Enter'a basmanız yeterlidir.";
      msg.style.color = "#10b981";
      msg.style.display = "block";
      setTimeout(() => { msg.style.display = 'none'; }, 5000);
    };

    $('cmd-install-box').onclick = () => {
      navigator.clipboard.writeText($('cmd-install-box').value);
      const msg = $('update-status-msg');
      msg.innerHTML = "✓ Arkadaş kurulum komutu kopyalandı! Arkadaşına gönder, PowerShell'e yapıştırsın.";
      msg.style.color = "#c084fc";
      msg.style.display = "block";
      setTimeout(() => { msg.style.display = 'none'; }, 5000);
    };

    // Live In-Game GitHub Updater
    $('btn-check-updates').onclick = async () => {
      const btn = $('btn-check-updates');
      const msg = $('update-status-msg');
      btn.innerText = 'Denetleniyor... ⏳';
      btn.disabled = true;

      try {
        const resp = await fetch('https://raw.githubusercontent.com/asherathegod/zubafke/main/manifest.json?t=' + Date.now());
        if (resp.ok) {
          const remoteManifest = await resp.json();
          const remoteVer = remoteManifest.version || '1.0.1';
          const localVer = (typeof chrome !== 'undefined' && chrome.runtime?.getManifest) ? chrome.runtime.getManifest()?.version : '1.0.1';

          if (remoteVer !== localVer) {
            msg.innerHTML = `⚡ <strong>Yeni Güncelleme Bulundu (v${remoteVer})!</strong><br>Aşağıdaki komutu kopyalayıp PowerShell'e yapıştırın veya <code>update.bat</code> dosyasına çift tıklayın.`;
            msg.style.color = '#f59e0b';
            msg.style.display = 'block';
            this.engine.log('SYS', `⚡ Yeni bot sürümü mevcut: v${remoteVer}`, 'warn');
          } else {
            msg.innerHTML = `✓ <strong>Botunuz En Güncel Sürümde! (v${localVer})</strong><br>GitHub üzerindeki en son sürümdesiniz.`;
            msg.style.color = '#10b981';
            msg.style.display = 'block';
            this.engine.log('SYS', `✓ Bot sürümü güncel (v${localVer}).`, 'success');
          }
        } else {
          msg.innerHTML = `✓ GitHub reposu bağlandı. Güncellemek için kutudaki PowerShell komutunu çalıştırabilir veya <code>update.bat</code> dosyasına çift tıklayabilirsiniz.`;
          msg.style.color = '#38bdf8';
          msg.style.display = 'block';
        }
      } catch (err) {
        msg.innerHTML = `ℹ️ GitHub bağlantısı kontrol edildi. Güncelleme için aşağıdaki PowerShell komutunu çalıştırabilir veya <code>update.bat</code> dosyasına tıklayabilirsiniz.`;
        msg.style.color = '#38bdf8';
        msg.style.display = 'block';
      } finally {
        btn.innerText = '🔄 Güncellemeleri Denetle';
        btn.disabled = false;
      }
    };

    // Profiles
    $('sro-save-profile-btn').onclick = () => {
      const name = $('sro-new-profile-name').value.trim();
      if (!name) return;
      this.profiles[name] = JSON.parse(JSON.stringify(this.engine.config));
      this.updateProfileDropdown();
      this.saveProfilesToStorage();
      alert(`[${name}] profili başarıyla kaydedildi.`);
      $('sro-new-profile-name').value = '';
    };

    $('sro-load-profile-btn').onclick = () => {
      const name = $('sro-profile-select').value;
      if (this.profiles[name]) {
        this.engine.config = JSON.parse(JSON.stringify(this.profiles[name]));
        this.applyConfigToForm();
        this.renderDynamicBuffList();
        this.saveSettings();
        alert(`[${name}] profili yüklendi!`);
      }
    };

    // Dragging
    this.makeDraggable($('sro-drag-header'), $('sro-hud-panel'));
  }

  makeDraggable(handle, panel) {
    let isDragging = false;
    let startX, startY, initialLeft, initialTop;

    handle.addEventListener('mousedown', (e) => {
      if (e.target.closest('.sro-header-controls')) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = panel.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;
      panel.style.right = 'auto';
      panel.style.left = `${initialLeft}px`;
      panel.style.top = `${initialTop}px`;
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });

    const onMouseMove = (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      panel.style.left = `${Math.max(10, initialLeft + dx)}px`;
      panel.style.top = `${Math.max(10, initialTop + dy)}px`;
    };

    const onMouseUp = () => {
      isDragging = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }

  bindEngineCallbacks() {
    this.engine.onStateChange = (state) => {
      const pill = this.shadowRoot.getElementById('sro-main-status');
      const miniPill = this.shadowRoot.getElementById('sro-mini-status');
      const startBtn = this.shadowRoot.getElementById('sro-start-btn');
      const pauseBtn = this.shadowRoot.getElementById('sro-pause-btn');
      const stopBtn = this.shadowRoot.getElementById('sro-stop-btn');

      if (pill) {
        pill.innerText = state;
        pill.className = `sro-status-pill sro-status-${state.toLowerCase()}`;
      }
      if (miniPill) {
        miniPill.innerText = state;
        miniPill.className = `sro-status-pill sro-status-${state.toLowerCase()}`;
      }

      if (state === 'IDLE') {
        if (startBtn) startBtn.style.display = 'inline-flex';
        if (pauseBtn) pauseBtn.style.display = 'none';
        if (stopBtn) stopBtn.style.display = 'none';
      } else {
        if (startBtn) startBtn.style.display = 'none';
        if (pauseBtn) pauseBtn.style.display = 'inline-flex';
        if (stopBtn) stopBtn.style.display = 'inline-flex';
      }
    };

    this.engine.onStatsUpdate = (stats) => {
      const apmEl = this.shadowRoot.getElementById('sro-stat-apm');
      const killsEl = this.shadowRoot.getElementById('sro-stat-kills');
      const dropsEl = this.shadowRoot.getElementById('sro-stat-drops');
      if (apmEl) apmEl.innerText = stats.apm || 0;
      if (killsEl) killsEl.innerText = stats.mobsDefeated || 0;
      if (dropsEl) dropsEl.innerText = stats.dropsCollected || 0;
    };

    this.engine.onLog = (logObj) => {
      const consoleBox = this.shadowRoot.getElementById('sro-console-logs');
      if (!consoleBox) return;

      const row = document.createElement('div');
      row.className = 'sro-log-row';
      const tagClass = `tag-${logObj.tag.toUpperCase()}` || 'tag-SYS';
      row.innerHTML = `<span class="sro-log-time">[${logObj.timestamp}]</span> <span class="sro-log-tag ${tagClass}">${logObj.tag}</span> ${logObj.msg}`;
      consoleBox.appendChild(row);
      if (consoleBox.children.length > 50) consoleBox.removeChild(consoleBox.firstChild);
      consoleBox.scrollTop = consoleBox.scrollHeight;
    };

    this.engine.onTelemetryUpdate = (telemetry) => {
      const targetNameEl = this.shadowRoot.getElementById('sro-target-name');
      const hpTextEl = this.shadowRoot.getElementById('sro-target-hp-text');
      const hpBarEl = this.shadowRoot.getElementById('sro-target-hp-bar');

      if (telemetry.target.hasTarget && !telemetry.target.isDead) {
        if (targetNameEl) targetNameEl.innerHTML = `<span>🎯</span> <span>${telemetry.target.name} (Lv:${telemetry.target.level || '?'})</span>`;
        if (hpTextEl) hpTextEl.innerText = `%${telemetry.target.hpPercent}`;
        if (hpBarEl) hpBarEl.style.width = `${telemetry.target.hpPercent}%`;
      } else {
        if (targetNameEl) targetNameEl.innerHTML = `<span>🎯</span> <span>Hedef: [Yok / Aranıyor]</span>`;
        if (hpTextEl) hpTextEl.innerText = `%0`;
        if (hpBarEl) hpBarEl.style.width = `0%`;
      }
    };
  }

  updatePartyUI() {
    const party = this.engine.telemetry.party;
    const members = party?.members || [];
    const countEl = this.shadowRoot.getElementById('sro-party-count');
    if (countEl) countEl.innerText = members.length;

    const selectTrace = this.shadowRoot.getElementById('cfg-trace-target-select');
    const selectAssist = this.shadowRoot.getElementById('cfg-party-assist-target');

    const curTraceVal = (selectTrace && selectTrace.value) ? selectTrace.value : (this.engine.config.party?.traceTargetName || '');
    const curAssistVal = (selectAssist && selectAssist.value) ? selectAssist.value : (this.engine.config.party?.assistMemberName || '');

    if (selectTrace) {
      selectTrace.innerHTML = '<option value="">(Parti üyesi seçin)</option>' + members.map(m => `<option value="${m.name}" ${m.name.toLowerCase() === curTraceVal.toLowerCase() ? 'selected' : ''}>${m.name} (Lv.${m.level || '?'})</option>`).join('');
    }
    if (selectAssist) {
      selectAssist.innerHTML = '<option value="">(Hedefi takip edilecek üye)</option>' + members.map(m => `<option value="${m.name}" ${m.name.toLowerCase() === curAssistVal.toLowerCase() ? 'selected' : ''}>${m.name} (Lv.${m.level || '?'})</option>`).join('');
    }

    // Ensure inpage.js has the latest assist config
    if (this.engine.config.party?.assistMemberName) {
      this.engine.assistConfigDispatcher({
        assistMemberName: this.engine.config.party.assistMemberName,
        autoAcceptRes: this.engine.config.party.autoAcceptRes !== false
      });
    }

    const listEl = this.shadowRoot.getElementById('sro-party-members-list');
    if (!listEl) return;

    if (members.length === 0) {
      listEl.innerHTML = `<div style="text-align:center;padding:12px;color:#64748b;font-size:11px;">Henüz bir partide değilsiniz veya veri bekleniyor.</div>`;
      return;
    }

    listEl.innerHTML = members.map(m => `
      <div style="background:rgba(15,23,42,0.8);border:1px solid rgba(255,255,255,0.08);border-radius:6px;padding:6px 8px;display:flex;justify-content:space-between;align-items:center;">
        <div>
          <span style="font-weight:600;color:#f8fafc;font-size:11px;">${m.name}</span>
          <span style="font-size:9px;color:#94a3b8;margin-left:4px;">Lv.${m.level || '?'}</span>
        </div>
        <div style="font-size:10px;font-weight:bold;color:${m.dead ? '#ef4444' : '#2ecc71'};">
          ${m.dead ? '💀 ÖLÜ' : '❤️ %' + (m.hpPercent || 100)}
        </div>
      </div>
    `).join('');
  }

  renderUniquesList() {
    const uniques = this.engine.telemetry.uniques || [];
    const container = this.shadowRoot.getElementById('sro-uniques-list');
    if (!container) return;

    if (uniques.length === 0) {
      container.innerHTML = `<div style="color:#64748b;text-align:center;padding:8px 0;">Boss zamanları taranıyor (unique.timers)...</div>`;
      return;
    }

    const BOSS_MAP = {
      'mob_tigerwoman': { name: 'Tiger Girl', zone: 'Jangan', icon: '🐯' },
      'mob_uruchi': { name: 'Uruchi', zone: 'Donwhang', icon: '🏹' },
      'mob_isyutaru': { name: 'Isyutaru', zone: 'Hotan', icon: '❄️' },
      'mob_bonelord': { name: 'Lord Yarkan', zone: 'Karakoram', icon: '💀' },
      'mob_kerberos': { name: 'Cerberus', zone: 'Constantinople', icon: '🐺' },
      'mob_ivy': { name: 'Captain Ivy', zone: 'Samarkand', icon: '🏹' },
      'mob_demonshaitan': { name: 'Demon Shaitan', zone: 'Roc Mountain', icon: '👿' }
    };

    const sTime = this.engine.telemetry.serverTime;
    const rAt = this.engine.telemetry.serverTimeReceivedAt;
    const currentServerTime = (sTime && rAt) ? (sTime + (Date.now() - rAt)) : Date.now();

    container.innerHTML = uniques.map(u => {
      const mId = u.monsterId || u.id || '';
      const bInfo = BOSS_MAP[mId] || {
        name: mId.replace(/^mob_/, '').replace(/_/g, ' ').toUpperCase() || 'Bilinmeyen Unique',
        zone: (u.zoneId || '').replace(/_province$/, '').toUpperCase(),
        icon: '👑'
      };

      let statusHtml = '';
      if (u.live) {
        statusHtml = `<span style="color:#22c55e;font-weight:bold;background:rgba(34,197,94,0.15);padding:1px 6px;border-radius:4px;border:1px solid rgba(34,197,94,0.3);font-size:10px;">🔴 CANLI / ÇIKTI!</span>`;
      } else if (u.spawnAtMs) {
        const diffMs = Math.max(0, u.spawnAtMs - currentServerTime);
        const totalSec = Math.floor(diffMs / 1000);
        const hrs = Math.floor(totalSec / 3600);
        const mins = Math.floor((totalSec % 3600) / 60);
        const secs = totalSec % 60;
        let timeStr = '';
        if (hrs > 0) timeStr = `${hrs}s ${mins}dk ${secs}sn`;
        else if (mins > 0) timeStr = `${mins}dk ${secs}sn`;
        else timeStr = `${secs}sn`;

        statusHtml = `<span style="color:#f59e0b;font-family:monospace;font-weight:600;font-size:11px;">⏱️ ${timeStr}</span>`;
      } else {
        statusHtml = `<span style="color:#94a3b8;font-size:10px;">${u.status || 'Bekleniyor'}</span>`;
      }

      return `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:3px 4px;border-bottom:1px solid rgba(255,255,255,0.05);">
          <div>
            <span style="font-size:12px;">${bInfo.icon}</span>
            <span style="color:#f8fafc;font-weight:600;font-size:11px;margin-left:3px;">${bInfo.name}</span>
            <span style="color:#64748b;font-size:9px;margin-left:4px;">(${bInfo.zone})</span>
          </div>
          <div>${statusHtml}</div>
        </div>
      `;
    }).join('');
  }

  saveSettings() {
    try {
      const cfgJson = JSON.stringify(this.engine.config);
      localStorage.setItem('sro_macro_bot_settings_v4', cfgJson);
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ sro_macro_bot_settings_v4: this.engine.config });
      }
    } catch (e) {}
  }

  loadSavedSettings() {
    try {
      const raw = localStorage.getItem('sro_macro_bot_settings_v4') || localStorage.getItem('sro_macro_bot_settings_v3');
      if (raw) {
        const saved = JSON.parse(raw);
        Object.assign(this.engine.config, saved);
        this.applyConfigToForm();
        this.renderDynamicBuffList();
        if (this.engine.config.party?.assistMemberName) {
          this.engine.assistConfigDispatcher({
            assistMemberName: this.engine.config.party.assistMemberName,
            autoAcceptRes: this.engine.config.party.autoAcceptRes !== false
          });
        }
      }
    } catch (e) {}

    try {
      const rawProfiles = localStorage.getItem('sro_macro_bot_profiles_v4');
      if (rawProfiles) {
        this.profiles = JSON.parse(rawProfiles);
        this.updateProfileDropdown();
      }
    } catch (e) {}
  }

  saveProfilesToStorage() {
    try {
      localStorage.setItem('sro_macro_bot_profiles_v4', JSON.stringify(this.profiles));
    } catch (e) {}
  }

  updateProfileDropdown() {
    const sel = this.shadowRoot.getElementById('sro-profile-select');
    if (!sel) return;
    sel.innerHTML = Object.keys(this.profiles).map(name => `<option value="${name}">${name}</option>`).join('');
  }

  applyConfigToForm() {
    const $ = (id) => this.shadowRoot.getElementById(id);
    const cfg = this.engine.config;

    if ($('cfg-skill-keys')) $('cfg-skill-keys').value = cfg.combat?.skillKeySequence || '1,2,3,4';
    if ($('cfg-skill-delay')) $('cfg-skill-delay').value = cfg.combat?.keyDelayMs || 280;
    if ($('cfg-target-key')) $('cfg-target-key').value = cfg.targeting?.key || 'Tab';
    if ($('cfg-target-search-delay')) $('cfg-target-search-delay').value = cfg.targeting?.searchDelayMs || 400;
    if ($('cfg-target-timeout')) $('cfg-target-timeout').value = cfg.targeting?.mobStallTimeoutSec || 35;
    if ($('cfg-stuck-timeout')) $('cfg-stuck-timeout').value = cfg.targeting?.stuckTimeoutSec || 18;

    // Range
    if ($('cfg-range-enable')) $('cfg-range-enable').checked = cfg.hunting?.rangeEnabled !== false;
    if ($('cfg-range-radius')) {
      $('cfg-range-radius').value = cfg.hunting?.radius || 35;
      if ($('lbl-range-val')) $('lbl-range-val').innerText = `${cfg.hunting?.radius || 35}m`;
    }

    // Party assist
    if ($('cfg-party-assist-enable')) $('cfg-party-assist-enable').checked = !!cfg.party?.assistEnabled;

    // Loot
    if ($('cfg-loot-enable')) $('cfg-loot-enable').checked = cfg.looting?.enabled !== false;
    if ($('cfg-loot-key')) $('cfg-loot-key').value = cfg.looting?.key || 'Space';
    if ($('cfg-loot-burst-count')) $('cfg-loot-burst-count').value = cfg.looting?.spaceBurstCount || 10;
    if ($('cfg-loot-burst-interval')) $('cfg-loot-burst-interval').value = cfg.looting?.burstIntervalMs || 160;
    if ($('cfg-loot-dynamic-stop')) $('cfg-loot-dynamic-stop').value = cfg.looting?.dynamicLogStopMs || 500;

    // Swap
    if ($('cfg-weapon-swap-enable')) $('cfg-weapon-swap-enable').checked = !!cfg.buffs?.autoWeaponSwap;
    if ($('cfg-main-weapon-type')) $('cfg-main-weapon-type').value = cfg.buffs?.mainWeapon || 'auto';
    if ($('cfg-swap-shield-enable')) $('cfg-swap-shield-enable').checked = cfg.buffs?.equipShield !== false;

    // Speed Scroll
    if ($('cfg-auto-speed-scroll-enable')) {
      $('cfg-auto-speed-scroll-enable').checked = cfg.buffs?.autoSpeedScroll !== false;
    }

    // Res
    if ($('cfg-auto-res-enable')) $('cfg-auto-res-enable').checked = !!cfg.party?.autoResEnabled;
    if ($('cfg-res-page')) $('cfg-res-page').value = cfg.party?.resPage || 'F2';
    if ($('cfg-res-slot')) $('cfg-res-slot').value = cfg.party?.resSlot || '8';
    if ($('cfg-auto-accept-res')) $('cfg-auto-accept-res').checked = cfg.party?.autoAcceptRes !== false;

    // Stat & Mastery
    if ($('cfg-auto-stat-enable')) $('cfg-auto-stat-enable').checked = !!cfg.autoProgression?.autoStatEnabled;
    if ($('cfg-stat-build')) $('cfg-stat-build').value = cfg.autoProgression?.statBuild || 'pure_int';
    if ($('cfg-auto-mastery-enable')) $('cfg-auto-mastery-enable').checked = !!cfg.autoProgression?.autoMasteryEnabled;

    const masteries = cfg.autoProgression?.masteries || {};
    this.shadowRoot.querySelectorAll('.cfg-mastery-chk').forEach(chk => {
      chk.checked = !!masteries[chk.value];
    });
  }
}

window.SroHudController = SroHudController;
