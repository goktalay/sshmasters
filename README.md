# SSH Master

Windows için SSH bağlantı yöneticisi: bağlantı kartları ve klasörler, tam özellikli terminal, komut kısayolları, SFTP dosya yöneticisi ve yerel dosya yöneticisi arasında indirme/yükleme.

## Çalıştırma (geliştirme)

```bash
npm install
npm start
```

## Exe derleme

```bash
npm run dist
```

Kurulum varsayılan olarak `%LOCALAPPDATA%\Programs\Mastertool\SSH Master` (tüm kullanıcılar için `C:\Program Files\Mastertool\SSH Master`) klasörüne yapılır ve Başlat menüsünde **Master Tool › SSH Master** olarak görünür; eski klasördeki bir sürümden yükseltmede eski klasör temizlenir (`build/installer.nsh`).

`dist/` altında kurulum (`SSH Master Setup x.y.z.exe`) ve taşınabilir (`SSH-Master-Portable-x.y.z.exe`) sürüm oluşur.

> Not: NSIS 260 karakterden uzun yolları desteklemez. Proje çok derin bir klasördeyse kısa bir yola (ör. `C:\dev\ssh-master`) taşıyıp derleyin.
> electron-builder'ın imzalama paketi açılırken "Cannot create symbolic link" hatası alırsanız Windows'ta Geliştirici Modu'nu açın veya derlemeyi yönetici olarak çalıştırın.

### GitHub üzerinden sürüm yayınlama

Derlenmiş exe'ler [Releases](https://github.com/goktalay/sshmasters/releases) sayfasından indirilir. Yeni sürüm için bir etiket göndermek yeterli; GitHub Actions exe'leri derleyip Release'e ekler:

```bash
git tag v1.0.1
```

```bash
git push origin v1.0.1
```

Etiket gönderildiğinde exe'ler ayrıca sshmasters.com'a yüklenir (depo secret'ı `SSHM_RELEASE_KEY`; tanımlı değilse bu adım atlanır). Kullanıcılar exe'yi sshmasters.com › Hesabım'daki kişiye özel bağlantıdan indirir; uygulama yeni sürüm çıktığında bunu bildirir. Etiketin açıklaması sürüm notu olarak gönderilir (`git tag -a v1.2.0 -m "notlar"`).

Sürüm numarası etiketten alınır (`package.json`'ı elle değiştirmek gerekmez). Actions sekmesinden "Release" iş akışını elle çalıştırırsanız yalnızca derler ve exe'leri indirilebilir "artifact" olarak saklar.

İkonu değiştirmek için `build/icon.svg` dosyasını düzenleyip `npm run icon` çalıştırın.

## Özellikler

- **Hesap (sshmasters.com):** uygulama girişsiz açılmaz; e-posta + şifre, “Beni hatırla”, “Şifremi unuttum” ve “Hesap oluştur” (web). Hatırlanan oturumla internet yokken de yerel kütüphaneyle açılır.
- **Uçtan uca şifreli senkron:** bağlantılar (şifreler ve özel anahtar içerikleri dahil), klasörler ve kısayollar AES-256-GCM ile şifrelenip hesaba yedeklenir; anahtar şifreden istemcide türetilir (PBKDF2 + HKDF), sunucu şifreyi ve içeriği hiç görmez (girişte yalnız türetilmiş `auth_hash` gönderilir). Öğe düzeyinde birleştirme, çakışma (409) çözümü, silinenler 30 gün izlenir. Ayarlar › Hesap ve senkronizasyon: aç/kapat, şimdi senkronize et, sunucudaki kopyayı sil, çıkış. Cihaz ayarları (tema, dil, yazı boyutu, tepsi…) gönderilmez. Kod: `src/account.js`.
- **Mastertool ortak oturumu:** bu bilgisayardaki herhangi bir Mastertool uygulamasında (Master Tool, SSH Master, FTP Masters, SQL Master, Notepad Master, Convert Master) bir kez giriş yapılınca diğerleri şifre sormadan açılır; birinden çıkış yapılınca hepsi giriş ekranına döner (yerel bağlantılar silinmez). Şifreyle girişte sunucudan alınan `sso_token` ve senkron anahtarının kökü (`master`) Windows Kimlik Bilgisi Yöneticisi'ne (`Mastertool` / `sso`) yazılır; diğer uygulamalar `/api/sm/auth/sso` ile şifresiz girer. Değişiklikler `%APPDATA%\Mastertool\sso-state.json` durum işaretiyle (gizli bilgi içermez) duyurulur. Kimlik deposu açılamazsa uygulama ortak oturumsuz çalışır. Kod: `src/sso.js`, `src/account.js`; testler: `npm test`.
- **Ana ekran:** “Yeni” kartıyla bağlantı oluşturma (ad, IP/sunucu, port, kullanıcı, şifre veya özel anahtar), kaydetmeden **bağlantı testi**, **“Son kaldığım klasöre git”** seçeneği, renk etiketi.
- **Klasörler:** iç içe klasörler; kartları sürükleyip klasöre veya üst seviyeye (yol çubuğuna) bırakarak taşıma; arama (Ctrl+F).
- **Terminal:** karta çift tıklayınca ayrı pencerede xterm tabanlı SSH konsolu (256 renk, Ctrl+C/Ctrl+Shift+V, sağ tık menüsü, yeniden bağlanma).
- **Konsol renk paleti (bağlantı başına):** formdan veya terminalde bölme başlığındaki palet düğmesinden seçilir (SSH Master, Campbell, Ubuntu, Dracula, One Dark, Monokai, Nord, Gruvbox, Tokyo Night, Solarized Dark/Light, Matrix, GitHub Light). Terminalde seçim anında önizlenir; kaydedilince o bağlantının tüm açık oturumlarına uygulanır.
- **Bölünmüş görünüm:** Ana ekranda Ctrl+tık ile birden fazla kart seçip **Bölünmüş aç** (veya Enter) ile hepsi tek pencerede açılır (2 → yan yana, 4 → 2×2, en fazla 6). Klasöre sağ tık → “Klasördeki bağlantıları bölünmüş aç”. Terminalde her bölmenin başlığından veya Ctrl+Shift+E (sağa) / Ctrl+Shift+O (aşağı) ile yeni bölme açılır, Ctrl+Shift+W kapatır, Alt+ok tuşları bölmeler arasında geçer. Ayırıcılar sürüklenerek boyutlandırılır. **Tüm bölmelere yaz** açıkken klavye girdisi ve kısayollar tüm bağlı sunuculara gider.
- **Sol panel — her bölmede ayrı** (bölme başlığındaki panel düğmesi veya Ctrl+B o bölmeninkini, üst çubuktaki düğme hepsini aç/kapatır; genişlik ve iç bölümler sürüklenerek ayarlanır, iç bölümler başlıklarından daraltılır):
  1. **Kısayollar** — çift tıklayınca komut imlecin olduğu yere yazılır (isteğe bağlı otomatik Enter), sürükleyerek sıralama.
  2. **Sunucu dosyaları (SFTP)** — gezinme, terminal klasörünü takip etme, sağ tık → **İndir** (alttaki Windows klasörüne), yeniden adlandır, sil, yeni klasör.
  3. **Bilgisayarım** — Windows klasörleri/sürücüler, sağ tık → **Yükle** (üstteki sunucu klasörüne). Paneller arasında ve Windows Gezgini'nden sürükle-bırak da desteklenir.
- **Aktarım ilerlemesi:** büyük indirme/yüklemelerde (5 MB üstü veya 20'den fazla dosya) dosya sayısı, hız ve kalan süreyi gösteren ilerleme penceresi; **Arka planda göster** ile aktarım, bölmenin sol panelinin altındaki daraltılabilir **Aktarımlar** bölümüne geçer. Aktarımlar iptal edilebilir (yarım dosyalar silinir) ve her biri ayrı SFTP kanalında çalıştığı için dosya listesi takılmaz.
- **Tema:** Gece, Gündüz veya Sistem tercihi (varsayılan: Sistem; Windows başlık çubukları dahil).
- **Dil:** Türkçe, English, Français, Deutsch, Español, العربية (sağdan sola), 中文, Русский (Mastertool ailesinin ortak 8 dili ve sırası). Varsayılan olarak sistem dili, bulunamazsa İngilizce kullanılır; çeviriler `src/i18n.js` içindedir.
- **Ayarlar (Mastertool ortak iskeleti):** **Genel** (dil, tema, başlangıç: Windows oturumu açılınca başlat, tepsiye küçült, kapatınca tepsiye gizle) · **Hesap** (e-posta, senkron aç/kapat, son senkron, şimdi senkronize et, sunucu kopyasını sil, Hesabım, çıkış) · **Terminal** · **Dosya aktarımları** · **Hakkında** (sürüm, güncellemeleri denetle, açık kaynak lisansları). Hesap sayfaları `?lang=&theme=&app=sm` ile uygulamanın diliyle ve temasıyla açılır. Tepsi menüsünden klasör yapısına göre hızlı bağlanma.
- **Güvenlik:** şifreler Windows DPAPI (Electron `safeStorage`) ile şifrelenir; sunucu host anahtarı ilk bağlantıda kaydedilir, değişirse bağlantı reddedilir.

Veriler `%APPDATA%\SSH Master\store.json` içinde tutulur.
