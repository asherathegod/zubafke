# ⚔️ Silkroad Web Macro Bot Pro (Chrome Extension - Manifest V3)

Tarayıcı tabanlı Silkroad oyunu için geliştirilmiş, **doğrudan WebSocket paket motoruna sahip**, **otomatik INT/STR stat verme**, **otomatik mastery yükseltme**, **Unique Boss takipçisi** ve **paket tabanlı yürüme** yetenekleriyle donatılmış profesyonel makro botudur.

---

## 🌟 Yakalanan WebSocket Paketleri & Otomasyonlar

| Özellik | WebSocket Paketi | İşlev |
| :--- | :--- | :--- |
| **Doğrudan Haritaya Yürüme** | `{"t":"move.click","d":{"x":5317,"z":3085}}` | Mouse tıklaması simüle etmeye gerek kalmadan sunucuya direkt hedef `(X, Z)` koordinatlarını gönderir. |
| **Otomatik Stat Verme** | `{"t":"stats.allocate","d":{"str":0,"int":3}}` | Level atlandığında biriken stat puanlarını otomatik Pure INT / Pure STR veya Hybrid oranına göre dağıtır. |
| **Otomatik Mastery Yükseltme** | `{"t":"mastery.raise","d":{"masteryId":"lightning"}}` | Lightning, Fire, Cold, Heuksal vb. mastery seviyesini otomatik yükseltir. |
| **Otomatik Skill Öğrenme** | `{"t":"skill.learn","d":{"skillId":"lightning_gigongta_a_1"}}` | SP biriktikçe seçilen skilleri bir üst seviyeye yükseltir. |
| **Unique Boss Takipçisi** | `{"t":"unique.timers","d":{"uniques":[...]}}` | Tiger Woman, Cerberus, Captain Ivy vb. unique bossların canlı spawn durumlarını HUD'da gösterir. |
| **Tam Sayısal Can Okuma** | `310/310` Formatı | Canavar canını piksellerle tahmin etmek yerine tam kesir olarak okur; canavar `0/310` olmadan vurmayı bırakmaz. |

---

## 🎮 HUD Sekmeleri & Kullanım

1. **⚔️ Skill Zinciri:** Öncelikli skill vuruş zinciri, bekleme süreleri (cooldown), vuruş gecikmeleri (cast).
2. **🛡️ Buff & İmbue:** Weapon Imbue (El yakma) ve uzun süreli defans/hız bufflarını süresi doldukça yenileme.
3. **💰 Hızlı Loot:** Güvenli, sunucu hız limitine takılmayan (`6x Space @ 190ms`) kutu toplama.
4. **🗺️ Spot & Navigasyon:** Canlı radar, anlık `(X, Z)` koordinatları, avlanma yarıçapı (`Radius`) ve doğrudan koordinata yürüme.
5. **🧬 Auto Stat & Skill:** Otomatik Pure INT / Pure STR stat dağıtıcısı ve mastery yükselticisi.
6. **👑 Unique Boss:** Sunucudan anlık gelen Unique Boss spawn listesi.
7. **📊 Veri & Log:** Canlı APM sayacı, kesilen moblar, toplanan itemler ve renkli olay akışı.
8. **💾 Profiller:** Glaive Pure STR, Bow Nuker, Spear Nuker, Loot Only hazır profilleri ve JSON dışa/içe aktarma.

---

## 🚀 Güncelleme & Çalıştırma Adımları

1. `chrome://extensions/` sayfasında **Silkroad Macro Bot Pro** kartının altındaki **Yenile (🔄)** butonuna bas.
2. Oyunu (**F5**) ile yenile.
3. HUD'daki **"🧬 Auto Stat & Skill"** sekmesinden build tipini seç (örn: *Pure INT Nuker*).
4. **"🗺️ Spot & Navigasyon"** sekmesinden **"📍 Mevcut Konumu Spot Yap"** butonuna tıkla.
5. **`F8`** tuşuna basarak botu başlat!
