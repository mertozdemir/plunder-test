# Plunder

Oyuncular için davetli sunucular: yazılı sohbet, sesli sohbet ve ekran paylaşımı. Bu depo ilk prototiptir (mobil öncelikli PWA).

## Yapı

| Klasör | Ne var |
| --- | --- |
| `apps/web` | React + Vite PWA. Giriş, yaş kapısı, sunucular, davetler, yazılı kanal, sesli kanal ve ekran paylaşımı, Faz 0 laboratuvarı (`#/lab`). |
| `packages/core` | Web, Electron ve Expo'nun ortak kullanacağı mantık: tipli Supabase API'si, yaş ve davet yardımcıları, MLS denemesi (`@plunder/core/mls`). |
| `services/livekit-token` | Railway'de çalışan küçük Node servisi. Supabase oturumunu doğrular, kullanıcı o sesli kanalın sunucusundaysa LiveKit jetonu verir. |
| `supabase/migrations` | Şema ve erişim kuralları (RLS). Doğum tarihi saklanmaz, sadece yaş kontrolünün geçtiği kaydedilir. |
| `supabase/tests` | Docker gerektirmeyen RLS testleri (`supabase/tests/run.sh`). |
| `infra/livekit` | VPS üzerinde LiveKit + Caddy (TLS) + TURN ayarları. |

## Yerelde çalıştırma

```bash
pnpm install
cp .env.example apps/web/.env.local   # VITE_* değerlerini doldur
pnpm dev                              # http://localhost:5173 (telefondan aynı ağdaki IP ile)
```

Supabase: projede `supabase/migrations` içindeki SQL'i çalıştır (`supabase db push` ya da SQL editörü). Authentication > Email açık olmalı.

Ses için: `infra/livekit` ile VPS'i kur, sonra token servisini başlat:

```bash
SUPABASE_URL=... SUPABASE_ANON_KEY=... LIVEKIT_API_KEY=... LIVEKIT_API_SECRET=... \
LIVEKIT_URL=wss://livekit.example.com ALLOWED_ORIGINS=http://localhost:5173 pnpm dev:token
```

Kontroller: `pnpm typecheck && pnpm test && pnpm build && supabase/tests/run.sh`

## Faz 0 denemeleri

`#/lab` sayfası hesap gerektirmez.

- **MLS + SFrame:** Tarayıcıda 2-50 kişilik MLS grubu kurar, herkesin aynı 32 baytlık SFrame anahtarını türettiğini doğrular, adımları ölçer. Üyelik değişince anahtar döner (testlerde doğrulanıyor).
- **Arka planda ses:** Mikrofonu yerel bir WebRTC döngüsünden geçirir; sayfa arka plandayken gönderilen ve alınan bayt sayısını 5 saniyede bir kaydeder. Gerçek sesli kanalda da aynı kayıt tutulur. Asıl cevap telefonda denenince çıkar.

Sesli kanalda uçtan uca şifreleme `VITE_FEATURE_E2EE=true` bayrağının arkasında. Şimdilik herkesin girdiği ortak bir parola kullanıyor; sonraki adım MLS'ten türetilen dönemsel anahtarı (`sframeKey`) LiveKit'e vermek.

## Bilinçli olarak sonraya kalanlar

- MLS anahtar paketlerinin ve commit'lerin Supabase üzerinden dağıtımı (şu an tek tarayıcıda simülasyon).
- Yazılı mesajların şifrelenmesi (şimdilik düz metin, RLS ile korunuyor).
- DeepFilterNet gürültü engelleme (şimdilik tarayıcının kendi `noiseSuppression`'ı).
- Gerçek yaş doğrulama sağlayıcısı (şimdilik beyan; arayüz `packages/core/src/age.ts`).
- Çeviri modülü, Electron ve Expo uygulamaları.
