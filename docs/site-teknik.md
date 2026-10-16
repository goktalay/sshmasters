# SSH Master — teknik bilgi föyü

Bu föydeki her bilgi kaynak koddan ve yayınlanmış sürümlerden doğrulanmıştır (depo: `goktalay/sshmasters`). Yayınlanmış son sürüm **1.2.0**; geliştirme dalındaki yayınlanmamış değişiklikler en altta ayrıca belirtilmiştir.

## Sistem gereksinimleri

| | |
| --- | --- |
| İşletim sistemi | Windows 10 veya üzeri (Electron 33'ün desteklediği en eski Windows sürümü) |
| Mimari | x64 (64 bit) |
| Kurulum dosyası | `SSH-Master-Setup-1.2.0.exe` — 82,4 MB |
| Taşınabilir sürüm | `SSH-Master-Portable-1.2.0.exe` — 82,1 MB, kurulum gerektirmez |
| Kurulu boyut | yaklaşık 275 MB (Electron çalışma zamanı dahil) |
| Kurulum klasörü | Varsayılan `Program Files\Mastertool\SSH Master` (tek kullanıcı kurulumunda `%LOCALAPPDATA%\Programs\Mastertool\SSH Master`); kurulumda değiştirilebilir |
| İnternet | SSH bağlantıları için ağ erişimi; hesap girişi ve senkron için sshmasters.com. “Beni hatırla” açıkken uygulama internetsiz de açılır |
| İmza | Exe dijital olarak imzalı değildir; ilk açılışta Windows SmartScreen uyarısı çıkabilir |

## Teknoloji

| Bileşen | Sürüm | Görevi |
| --- | --- | --- |
| Electron | 33.4.11 | Masaüstü uygulama çatısı |
| Chromium | 130.0.6723.191 | Arayüz motoru (Electron ile gelir) |
| Node.js | 20.18.3 | Ana süreç çalışma zamanı (Electron ile gelir) |
| ssh2 | 1.17.0 | SSH istemcisi ve SFTP (saf JavaScript) |
| xterm.js (`@xterm/xterm`) | 5.5.0 | Terminal öykünücüsü |
| `@xterm/addon-fit` | 0.10.0 | Terminali bölme boyutuna uydurma |
| `@xterm/addon-web-links` | 0.11.0 | Terminaldeki bağlantıları tıklanabilir yapma |
| electron-builder | 25.1.8 | NSIS kurulum ve taşınabilir exe üretimi |

## Protokoller ve biçimler

**Bağlantı:** SSH-2 (terminal kabuğu) ve SFTP (dosya yönetimi, aktarım). Varsayılan port 22, bağlantı başına değiştirilebilir.

**Kimlik doğrulama yöntemleri**
- Şifre
- Özel anahtar (isteğe bağlı anahtar parolası ile)
- Klavye etkileşimli (keyboard-interactive) — sorulara kayıtlı şifre verilir

**Özel anahtar biçimleri** (ssh2 ile okunur)
- OpenSSH yeni biçimi (`-----BEGIN OPENSSH PRIVATE KEY-----`): Ed25519, ECDSA, RSA
- PEM: `RSA`, `DSA`, `EC PRIVATE KEY` (şifreli PEM dahil)
- PuTTY PPK sürüm 2 (`ssh-rsa`, `ssh-dss`; şifresiz veya aes256-cbc)

**Algoritmalar** (ssh2 varsayılanları; uygulama listeyi kısıtlamaz)

| Tür | Algoritmalar |
| --- | --- |
| Anahtar değişimi | curve25519-sha256 (@libssh.org dahil), ecdh-sha2-nistp256/384/521, diffie-hellman-group-exchange-sha256, diffie-hellman-group14-sha256, group15/16/17/18-sha512 |
| Sunucu anahtarı | ssh-ed25519, ecdsa-sha2-nistp256/384/521, rsa-sha2-512, rsa-sha2-256, ssh-rsa |
| Şifreleme | aes128-gcm@openssh.com, aes256-gcm@openssh.com, aes128-ctr, aes192-ctr, aes256-ctr, chacha20-poly1305@openssh.com |
| Bütünlük (MAC) | hmac-sha2-256-etm, hmac-sha2-512-etm, hmac-sha1-etm (@openssh.com), hmac-sha2-256, hmac-sha2-512, hmac-sha1 |
| Sıkıştırma | none, zlib@openssh.com, zlib |

**Terminal**
- Terminal türü: `xterm-256color` (256 renk); ilk boyut 120×30, pencere boyutu değişince sunucuya bildirilir
- Kodlama: UTF-8
- Klasör izleme: kabuk her komut isteminde OSC 7 ile bulunduğu klasörü bildirir; dosya paneli bu klasörü izler (bash `PROMPT_COMMAND`, zsh `precmd`)
- 13 konsol renk paleti: SSH Master, Campbell (Windows), Ubuntu, Dracula, One Dark, Monokai, Nord, Gruvbox Dark, Tokyo Night, Solarized Dark, Matrix, Solarized Light, GitHub Light

## Güvenlik

- **Yerel şifreleme:** bağlantı şifreleri, anahtar parolaları ve hesap oturumu Windows DPAPI ile (Electron `safeStorage`) şifrelenerek saklanır; yalnız aynı Windows kullanıcısı çözebilir.
- **Sunucu anahtarı doğrulama:** ilk bağlantıda sunucu anahtarının SHA-256 parmak izi kaydedilir. Sonraki bağlantılarda parmak izi değişmişse bağlantı reddedilir ve eski/yeni parmak izi gösterilir. Bağlantı testi parmak izini gösterir.
- **Uçtan uca şifreli senkron** (bağlantılar — şifreler ve özel anahtar içerikleri dahil —, klasörler, kısayollar):
  - Anahtar türetme: `master = PBKDF2-SHA256(şifre, tuz, yineleme, 32 bayt)`; tuz ve yineleme sayısı sunucudan gelir.
  - Şifreleme anahtarı: `HKDF-SHA256(master, info = "sshm-enc-v1")`.
  - Şifreleme: AES-256-GCM, her yüklemede rastgele 12 baytlık IV, 16 baytlık doğrulama etiketi.
  - Girişte sunucuya şifre gönderilmez; yalnız türetilmiş `auth_hash = PBKDF2-SHA256(master, şifre, 1, 32)` gönderilir.
  - Sunucu kütüphane içeriğini çözemez. Cihaz ayarları (tema, dil, yazı boyutu, tepsi) senkronlanmaz.
- **Uygulama yalıtımı:** pencerelerde `contextIsolation` açık, `nodeIntegration` kapalı; arayüz yalnız önceden tanımlı köprü işlevlerini çağırabilir.
- **Hesap web sayfaları:** yalnız izin verilen üç adres açılır (`/sifremi-unuttum`, `/kayit`, `/hesabim`).

## Performans ve sınırlar

| | |
| --- | --- |
| Bir penceredeki en çok bölme | 6 |
| SFTP aktarım hızı yöntemi | Dosya başına 64 eşzamanlı istek × 32 KB parça |
| Aktarım kanalı | Her aktarım ayrı SFTP kanalında; aktarım sürerken dosya listesi takılmaz |
| Aktarım sırası | Bir penceredeki aktarımlar sırayla işlenir; iptal edilebilir, yarım dosya silinir |
| İlerleme penceresi eşiği | 5 MB üstü veya 20'den fazla dosya |
| Bağlantı zaman aşımı | 15 sn |
| Bağlantıyı canlı tutma | 20 sn'de bir keepalive |
| Hesap sunucusu istek zaman aşımı | 20 sn |
| Senkron | Değişiklikten 3 sn sonra, ayrıca 5 dakikada bir |
| Senkron kütüphane boyutu | En çok 5 MB (şifreli) |
| Silinen öğelerin izlenmesi | 30 gün (diğer cihazlarda da silinsin diye) |

## Klavye kısayolları

**Ana pencere**

| Kısayol | İşlem |
| --- | --- |
| Ctrl+F | Bağlantılarda ara |
| Esc (aramada) | Aramayı temizle |
| Ctrl+N | Yeni bağlantı |
| Ctrl+tık | Birden fazla bağlantı seç |
| Ctrl+A | Görünen tüm bağlantıları seç |
| Enter | Seçili bağlantıları aç (birden fazlaysa bölünmüş) |
| F2 | Seçili bağlantıyı düzenle |
| Delete | Seçili bağlantıyı sil |
| Backspace | Üst klasöre çık |

**Terminal penceresi**

| Kısayol | İşlem |
| --- | --- |
| Ctrl+C (seçim varken) / Ctrl+Shift+C | Kopyala |
| Ctrl+Shift+V | Yapıştır |
| Ctrl+Shift+E | Etkin bölmeyi sağa böl |
| Ctrl+Shift+O | Etkin bölmeyi aşağı böl |
| Ctrl+Shift+W | Etkin bölmeyi kapat |
| Alt+Ok tuşları | Komşu bölmeye geç |
| Ctrl+B | Etkin bölmenin sol panelini aç/kapat |
| Enter (bağlantı koptuysa) | Yeniden bağlan |

**Dosya panelleri (sunucu ve Bilgisayarım)**

| Kısayol | İşlem |
| --- | --- |
| Enter | Klasörü / dosyayı aç |
| Backspace | Üst klasör |
| F5 | Yenile |
| Ctrl+A | Tümünü seç |
| Ctrl+tık, Shift+tık | Çoklu seçim |
| Delete | Seçilenleri sil |
| Sürükle-bırak | Bilgisayardan sunucuya yükle, sunucudan bilgisayara indir |

## İçe / dışa aktarım

- Bağlantılar için ayrı bir içe/dışa aktarma dosya biçimi yoktur; cihazlar arası taşıma hesap üzerinden uçtan uca şifreli senkronla yapılır.
- Aynı bilgisayarda farklı bir hesapla girilirse önceki yerel bağlantılar `store-backup-<tarih>.json` adıyla uygulama veri klasörüne yedeklenir (JSON; şifreler DPAPI ile şifreli kalır).

## Diller ve erişilebilirlik

- **1.2.0'da 7 dil:** Türkçe, English, Français, Español, Deutsch, العربية, 中文. Varsayılan Windows dilidir, Ayarlar'dan değiştirilebilir.
- **Arapça:** sağdan sola yerleşim; terminal, dosya yolları ve boyutlar soldan sağa kalır.
- **Tema:** Gece, Gündüz veya Sistem tercihi; Windows başlık çubukları da uyar.
- **Klavye:** ana işlemlerin tümü klavyeyle yapılabilir (yukarıdaki tablolar).
- **Hareket:** Windows'ta “animasyonları azalt” açıksa Mastertool düğmesinin animasyonu durur.
- **Terminal yazı boyutu:** 9–28 punto arası ayarlanabilir.

## Sürüm geçmişi

| Sürüm | Tarih | Öne çıkanlar |
| --- | --- | --- |
| 1.2.0 | 15 Ekim 2026 | sshmasters.com hesabıyla giriş (“Beni hatırla”, şifremi unuttum, hesap oluştur), uçtan uca şifreli senkron, hesap ve senkron ayarları, yeni sürüm bildirimi |
| 1.1.0 | 15 Ekim 2026 | Aktarım ilerlemesi ve arka planda aktarım, aktarım iptali, Gece/Gündüz/Sistem teması, 7 dil |
| 1.0.0 | 15 Ekim 2026 | İlk sürüm: bağlantı kartları ve klasörler, bağlantı testi, son klasöre dönme, bölünmüş terminal ve tüm bölmelere yazma, kısayollar, SFTP ve Windows dosya yöneticisi, konsol renk paletleri, sistem tepsisi, DPAPI ile şifreli saklama |

### Geliştirme dalında (henüz yayınlanmadı)

Ekran görüntüleri bu geliştirme sürümünden alınmıştır.
- 8 dil (Русский eklendi); sıra tr, en, fr, de, es, ar, zh, ru. Sistem dili desteklenmiyorsa İngilizce.
- Varsayılan tema Sistem tercihi.
- Bölümlü ayarlar: Genel (dil, tema, başlangıç), Hesap, Terminal, Dosya aktarımları, Hakkında (sürüm, güncelleme denetimi, açık kaynak lisansları).
- Windows oturumu açılınca başlatma (tepsiye küçültme açıksa tepside başlar).
- Kurulumda Başlat menüsü klasörü “Master Tool”.
- Düzeltmeler: palet seçicide palet adları; aktarım yüzdesi dilin biçiminde (ör. en “5%”).
