# Mastertool ortak uygulama iskeleti

SSH Master'da uygulanmış hâli (commit `bb00fb6`). FTP Masters, SQL Master, Notepad Master ve Convert Master aynı yapıyı kullanır.

## Dosyalar

| Dosya | Görevi |
| --- | --- |
| `src/i18n.js` | UMD modül: `LANGUAGES`, `STRINGS`, `resolveLanguage(pref, systemLocale)`, `createT(lang)`. Hem ana süreçte (`require`) hem pencerelerde (`<script>`) çalışır. |
| `src/main.js` | Ayar deposu, `applyAppTheme`, `currentLang()`, `app:lang` (senkron), `app:about`, `app:checkUpdate`, `app:openLicenses`, `account:openWeb`, `applyOpenAtLogin`. |
| `src/preload.js` | `lang: ipcRenderer.sendSync('app:lang')`, `about()`, `checkUpdate()`, `openLicenses()`, `openWeb(page)`, `openMastertool()`. |
| `src/renderer/ui.js` | `LANG`, `t()`, `<html lang dir>` ayarı, `mastertoolButton()`. |
| `src/renderer/common.css` | Tema değişkenleri (koyu varsayılan + `@media (prefers-color-scheme: light)`), RTL kuralları, Mastertool düğmesi. |
| `src/renderer/app.js` → `openSettings()` | Bölümlü ayarlar penceresi. |
| `src/renderer/app.css` | `.set-wrap`, `.set-nav`, `.set-pages`, `.about-*`, `.oss`. |
| `build/installer.nsh` | Program Files\Mastertool\<Uygulama> kurulumu. |

## Diller

Sıra sabittir: `tr, en, fr, de, es, ar, zh, ru`.

```js
const LANGUAGES = {
  tr: { name: 'Türkçe' }, en: { name: 'English' }, fr: { name: 'Français' }, de: { name: 'Deutsch' },
  es: { name: 'Español' }, ar: { name: 'العربية', dir: 'rtl' }, zh: { name: '中文' }, ru: { name: 'Русский' },
};
```

- Ayar `language: null` ise sistem dili (`app.getLocale()`) kullanılır; listede yoksa **İngilizce**.
- `t(key, vars)`: önce seçili dil, sonra `en`, en son anahtarın kendisi. Değişkenler `{name}` biçiminde.
- Anahtarlar alan önekleriyle gruplanır: `auth.*`, `acct.*`, `sync.*`, `update.*`, `common.*`, `set.*`, `about.*`, sonra uygulamaya özel önekler.
- Her dilde anahtar sayısı eşit olmalı (eşlik testi).
- Arapça: `<html dir="rtl">`, CSS'te mantıksal özellikler (`margin-inline-start`, `inset-inline-end`…). Boyut/sayı gibi soldan sağa kalması gereken metinler LRI/PDI (`⁦…⁩`) ile sarılır.
- Dil değişince pencereler yeniden yüklenir (pencereler dili açılışta senkron alır).

## Tema

- Ayar `appTheme`: `'dark' | 'light' | 'system'`, **varsayılan `'system'`**.
- Ana süreç: `nativeTheme.themeSource = v === 'dark' || v === 'light' ? v : 'system'` (başlık çubukları da uyar).
- CSS yalnız `prefers-color-scheme` ile değişir; ek sınıf gerekmez.
- Ayarlarda tema seçimi anında önizlenir, İptal'de eski temaya döner.

## Ayarlar penceresi

Solda sekme listesi, sağda sayfa; genişlik 760 px. Sıra:

1. **Genel**
   - Dil (seçim kutusu; altında “açık pencereler yeniden açılınca yeni dili kullanır” notu).
   - Tema (Gece / Gündüz / Sistem tercihi; ay, güneş, monitör simgeleri).
   - **Başlangıç** başlığı altında:
     - *Windows oturumu açılınca başlat* — `app.setLoginItemSettings({ openAtLogin, args: ['--hidden'] })`, yalnız `app.isPackaged` iken. `--hidden` ile açılınca ve tepsiye küçültme açıksa uygulama tepside başlar.
     - *Küçültüldüğünde sistem tepsisinde göster*.
     - *Kapatıldığında tepsiye gizle*.
2. **Hesap** (değişiklikler anında uygulanır, Kaydet beklemez)
   - “{email} olarak giriş yapıldı”.
   - Web ile senkronize et (aç/kapat) + açıklama.
   - Son senkron durumu.
   - Şimdi senkronize et · Sunucudaki kopyayı sil.
   - Hesabım (web) · Çıkış yap.
3. **Uygulamaya özel bölümler** (SSH Master'da: Terminal, Dosya aktarımları).
4. **Hakkında**
   - Simge, uygulama adı, “Sürüm {version}” (`app.getVersion()`).
   - “Mastertool ailesinin bir parçasıdır: SSH Master · FTP Masters · SQL Master · Notepad Master · Convert Master”.
   - *Güncellemeleri denetle* düğmesi: `GET /api/<app>/releases/latest`, sonuç yanında yeşil “güncel”, vurgulu “yeni sürüm var” ya da kırmızı hata.
   - **Açık kaynak lisansları** listesi (ad – lisans) ve *Chromium lisanslarını aç* düğmesi (`LICENSES.chromium.html`, exe'nin yanında). Altında Electron/Chromium sürümü.

Kaydet: `appTheme, language, openAtLogin, minimizeToTray, closeToTray` + uygulamaya özel alanlar. Dil değişmediyse “Ayarlar kaydedildi” bildirimi.

## Ortak anahtarlar (SSH Master'daki Türkçe metinler)

```
set.general        Genel
set.account        Hesap
set.about          Hakkında
set.language       Dil
set.languageHint   Açık terminal pencereleri yeniden açıldığında yeni dili kullanır. (uygulamaya göre uyarlanır)
set.theme          Tema
set.themeDark      Gece
set.themeLight     Gündüz
set.themeSystem    Sistem tercihi
set.startup        Başlangıç
set.openAtLogin    Windows oturumu açılınca başlat
set.openAtLoginHint Tepsiye küçültme açıksa uygulama tepside başlar.
set.minTray        Küçültüldüğünde sistem tepsisinde göster
set.closeTray      Kapatıldığında tepsiye gizle
set.saved          Ayarlar kaydedildi
about.version      Sürüm {version}
about.family       Mastertool ailesinin bir parçasıdır: SSH Master · FTP Masters · SQL Master · Notepad Master · Convert Master
about.checkUpdate  Güncellemeleri denetle
about.checking     Denetleniyor…
about.upToDate     SSH Master güncel.
about.checkFailed  Güncelleme denetlenemedi: {msg}
about.licenses     Açık kaynak lisansları
about.licensesIntro SSH Master şu açık kaynak bileşenleri kullanır:
about.chromium     Chromium lisanslarını aç
```

8 dilin tamamı `src/i18n.js` içindedir; uygulama adını değiştirerek kopyalanabilir.

## Hesap web sayfaları

```js
const allowed = { forgot: '/sifremi-unuttum', register: '/kayit', account: '/hesabim' };
const q = new URLSearchParams({ lang: currentLang(), theme: nativeTheme.shouldUseDarkColors ? 'dark' : 'light', app: '<kod>' }); // sm, fm, sq, np, cv
shell.openExternal(`${API_BASE}${allowed[page]}?${q}`);
```

`theme` her zaman o anki gerçek temadır (`system` gönderilmez). `app` kısa uygulama kodudur: SSH Master `sm`, FTP Masters `fm`, SQL Master `sq`, Notepad Master `np`, Convert Master `cv`.

## Mastertool düğmesi

Ana pencerenin üst çubuğunda ve giriş ekranında. `https://mastertool.download/?lang=<dil>&theme=<dark|light>` açar. Stil `common.css` içinde (`.mtk-mt`), dar pencerede yalnız simge.

## Kurulum

`build/installer.nsh` + package.json `build.nsis`:
`oneClick: false`, `allowToChangeInstallationDirectory: true`, `include: "build/installer.nsh"`, `menuCategory: "Master Tool"` (Başlat menüsü klasörü, boşluklu). Varsayılan kurulum: `Program Files\Mastertool\<Uygulama>`; eski konumdaki kurulum yükseltmede kaldırılır.
