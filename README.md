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

`dist/` altında kurulum (`SSH Master Setup x.y.z.exe`) ve taşınabilir (`SSH-Master-Portable-x.y.z.exe`) sürüm oluşur.

> Not: NSIS 260 karakterden uzun yolları desteklemez. Proje çok derin bir klasördeyse kısa bir yola (ör. `C:\dev\ssh-master`) taşıyıp derleyin.
> electron-builder'ın imzalama paketi açılırken "Cannot create symbolic link" hatası alırsanız Windows'ta Geliştirici Modu'nu açın veya derlemeyi yönetici olarak çalıştırın.

İkonu değiştirmek için `build/icon.svg` dosyasını düzenleyip `npm run icon` çalıştırın.

## Özellikler

- **Ana ekran:** “Yeni” kartıyla bağlantı oluşturma (ad, IP/sunucu, port, kullanıcı, şifre veya özel anahtar), kaydetmeden **bağlantı testi**, **“Son kaldığım klasöre git”** seçeneği, renk etiketi.
- **Klasörler:** iç içe klasörler; kartları sürükleyip klasöre veya üst seviyeye (yol çubuğuna) bırakarak taşıma; arama (Ctrl+F).
- **Terminal:** karta çift tıklayınca ayrı pencerede xterm tabanlı SSH konsolu (256 renk, Ctrl+C/Ctrl+Shift+V, sağ tık menüsü, yeniden bağlanma).
- **Konsol renk paleti (bağlantı başına):** formdan veya terminalde bölme başlığındaki palet düğmesinden seçilir (SSH Master, Campbell, Ubuntu, Dracula, One Dark, Monokai, Nord, Gruvbox, Tokyo Night, Solarized Dark/Light, Matrix, GitHub Light). Terminalde seçim anında önizlenir; kaydedilince o bağlantının tüm açık oturumlarına uygulanır.
- **Bölünmüş görünüm:** Ana ekranda Ctrl+tık ile birden fazla kart seçip **Bölünmüş aç** (veya Enter) ile hepsi tek pencerede açılır (2 → yan yana, 4 → 2×2, en fazla 6). Klasöre sağ tık → “Klasördeki bağlantıları bölünmüş aç”. Terminalde her bölmenin başlığından veya Ctrl+Shift+E (sağa) / Ctrl+Shift+O (aşağı) ile yeni bölme açılır, Ctrl+Shift+W kapatır, Alt+ok tuşları bölmeler arasında geçer. Ayırıcılar sürüklenerek boyutlandırılır. **Tüm bölmelere yaz** açıkken klavye girdisi ve kısayollar tüm bağlı sunuculara gider.
- **Sol panel — her bölmede ayrı** (bölme başlığındaki panel düğmesi veya Ctrl+B o bölmeninkini, üst çubuktaki düğme hepsini aç/kapatır; genişlik ve iç bölümler sürüklenerek ayarlanır, iç bölümler başlıklarından daraltılır):
  1. **Kısayollar** — çift tıklayınca komut imlecin olduğu yere yazılır (isteğe bağlı otomatik Enter), sürükleyerek sıralama.
  2. **Sunucu dosyaları (SFTP)** — gezinme, terminal klasörünü takip etme, sağ tık → **İndir** (alttaki Windows klasörüne), yeniden adlandır, sil, yeni klasör.
  3. **Bilgisayarım** — Windows klasörleri/sürücüler, sağ tık → **Yükle** (üstteki sunucu klasörüne). Paneller arasında ve Windows Gezgini'nden sürükle-bırak da desteklenir.
- **Ayarlar:** küçültüldüğünde sistem tepsisinde göster, kapatıldığında tepsiye gizle, terminal yazı boyutu. Tepsi menüsünden klasör yapısına göre hızlı bağlanma.
- **Güvenlik:** şifreler Windows DPAPI (Electron `safeStorage`) ile şifrelenir; sunucu host anahtarı ilk bağlantıda kaydedilir, değişirse bağlantı reddedilir.

Veriler `%APPDATA%\SSH Master\store.json` içinde tutulur.
