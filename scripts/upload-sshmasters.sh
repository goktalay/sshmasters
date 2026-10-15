#!/usr/bin/env bash
# Kurulum exe'sini sshmasters.com'a yükler (POST /api/sm/releases).
# Kullanım: upload-sshmasters.sh <sürüm> <setup.exe yolu> [notlar]
# Anahtar SSHM_RELEASE_KEY ortam değişkeninden okunur; tanımlı değilse uyarı verip çıkar.
set -euo pipefail

VERSION="$1"
SETUP="$2"
NOTES="${3:-}"
[ -n "$NOTES" ] || NOTES="SSH Master $VERSION"

if [ -z "${SSHM_RELEASE_KEY:-}" ]; then
  echo "::warning::SSHM_RELEASE_KEY tanımlı değil; sshmasters.com'a yükleme atlandı."
  exit 0
fi

SIZE=$(stat -c %s "$SETUP")
echo "Yükleniyor: $SETUP ($SIZE bayt), sürüm $VERSION"
# Cloudflare tek istekte 100 MB üstünü reddediyor (413)
if [ "$SIZE" -gt 99000000 ]; then
  echo "::error::Kurulum dosyası 100 MB sınırını aşıyor ($SIZE bayt)."
  exit 1
fi

HTTP=$(curl -sS -o response.json -w '%{http_code}' -X POST https://sshmasters.com/api/sm/releases \
  -H "X-Release-Key: $SSHM_RELEASE_KEY" \
  -F "version=$VERSION" -F "setup=@$SETUP" -F "notes=$NOTES")
cat response.json; echo
case "$HTTP" in
  200|201) echo "sshmasters.com: sürüm $VERSION yüklendi." ;;
  409) echo "::notice::sshmasters.com'da $VERSION zaten var (409 exists); atlandı." ;;
  *) echo "::error::sshmasters.com yüklemesi başarısız (HTTP $HTTP)."; exit 1 ;;
esac
