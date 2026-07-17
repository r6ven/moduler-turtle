# Zen Kaplumbaga - Proje Durumu

Son guncelleme: 17 Temmuz 2026
Uygulama surumu: `0.1.0`  
GitHub: `r6ven/moduler-turtle`  
Uygulama dizini: `turtle-game/`  
Belge, bulundugu Git commit'indeki uygulama durumunu anlatir.

## 1. Proje Ozeti

Zen Kaplumbaga, axial koordinatli altigen bir haritada su kanallarini dondurerek kaynaktan bitis deligine kesintisiz akis kurmaya dayanan, mobil oncelikli bir Canvas puzzle oyunudur. Uygulama Vanilla JavaScript ES modules ve Vite ile calisir. Oyun alani Canvas uzerinde cizilir; menuler, hesap ekranlari ve sonuc sahnesi HTML/CSS katmanidir.

Temel oyun dongusu:

1. Kullanici Supabase uzerinden kayit olur veya giris yapar.
2. Cozulebilir bir ana yol uretilir, gerekirse kontrollu ek baglantilar eklenir ve taslar karistirilir.
3. Oyuncu aktif hex taslarini 60 derece dondurur.
4. Kaynaktan erisilebilen eslesmis kanallarda su anlik olarak akmaya baslar.
5. Tum aktif taslar kaynaga baglandiginda ve bosta kanal ucu kalmadiginda bolum tamamlanir.
6. Kaplumbaga baslangictan bitise ana yolun tamamini yuzer, sevinme hareketini bitirir ve sonuc ekrani acilir.
7. Yildiz, en iyi hamle, en iyi sure ve acilan sonraki bolum Supabase'e kaydedilir.

## 2. Dosya Yapisi

```text
moduler-turtle/                 # Git deposunun koku
└─ turtle-game/                 # Render Root Directory
   ├─ index.html                # Canvas, HUD, menuler ve tum overlay iskeleti
   ├─ package.json              # Vite komutlari ve bagimliliklar
   ├─ README.md                 # Kisa kurulum ve karar bekleyen mekanik notu
   ├─ PROJECT_STATUS.md         # Bu durum ve devir belgesi
   ├─ public/
   │  └─ images/
   │     ├─ completion-lotus.png # Sonuc basliginin iki yanindaki seffaf nilufer asseti
   │     ├─ starfish.png        # Sonuc, bolum ve rekor ekranlarindaki deniz yildizi
   │     ├─ turtle-gameplay.png # Mevcut Canvas kaplumbagasinda kullanilmayan aday asset
   │     └─ turtle-menu.png     # Mevcut CSS marka isaretinde kullanilmayan aday asset
   └─ src/
      ├─ main.js                # CSS'i yukler, Game'i olusturur ve baslatir
      ├─ style.css              # HUD, menuler, overlay'ler ve sahil animasyonlari
      ├─ config.js              # Boyut, zorluk, renk paleti ve Supabase istemci ayarlari
      ├─ Game.js                # Ana orkestrasyon ve oyun durum makinesi
      ├─ HexMath.js             # Axial hex geometrisi ve yon yardimcilari
      ├─ Tile.js                # Hex tas durumu ve donus animasyonu
      ├─ Turtle.js              # Kaplumbaga hareketi, yonelme, idle ve iz durumu
      ├─ PuzzleGenerator.js     # Cozulebilir harita ve minimum hamle uretimi
      ├─ PuzzleValidator.js     # Baglanti, bosta uc ve tamamlama denetimi
      ├─ Renderer.js            # Canvas cizimi, dekor, su ve kaplumbaga render'i
      ├─ InputManager.js        # Pointer koordinatini hex koordinatina cevirir
      ├─ AudioSystem.js         # Web Audio ile prosedurel efektler
      ├─ ParticleSystem.js      # Ipucu ve kutlama parcaciklari
      ├─ ProgressSystem.js      # Hamle, sure, yildiz ve ilerleme kaydi
      ├─ UIController.js        # DOM olaylari ve ekranlarin guncellenmesi
      └─ UserAuthSystem.js      # Supabase RPC hesap ve ilerleme istemcisi
```

Yerel ortamda `node_modules/`, `dist/`, `pnpm-lock.yaml` ve `pnpm-workspace.yaml` bulunabilir. Bunlar bu belge hazirlandigi sirada Git tarafindan izlenmemektedir. `dist/` ve `node_modules/` kaynak dosya degildir ve commit edilmemelidir.

## 3. Teknoloji ve Mimari

- Frontend: Vanilla JavaScript, ES modules, HTML5 Canvas ve CSS.
- Build araci: Vite 5.
- Backend/veri: Supabase RPC fonksiyonlari ve Supabase veritabani.
- Ses: Harici ses dosyasi olmadan Web Audio API.
- Depolama: Giris yapmis kullanicida Supabase; eski/kimliksiz akis icin `localStorage` fallback kodu.
- Render modeli: Oyun Canvas'ta; menu, HUD, secim, rekor, onay ve sonuc ekranlari DOM'da.
- Koordinat sistemi: Pointy-top axial hex (`q`, `r`), alti komsu yonu.
- Mobil: Pointer Events, responsive hex yaricapi, safe-area bosluklari ve Fullscreen API.

## 4. Mevcut Oyun Sistemleri

### 4.1 Puzzle uretimi

- Harita merkezdeki `0,0` hexinden baslar.
- Once tum aktif taslari bir kez gezen, tekrar etmeyen cozulmus bir ana yol uretilir.
- Yolun ilk tasi kaynak, son tasi bitis olarak atanir.
- Seviye arttikca harita yaricapi ve aktif tas sayisi kontrollu artar.
- Seviye 6'dan sonra dusuk olasilikla ek dongu baglantilari eklenebilir.
- Cozulmus yapi olusturulduktan sonra rotasyonlar karistirilir.
- Baslangicta agin yuzde 45'inden fazlasi hazir bagliysa yeniden karistirma denenir.
- Her tas icin simetrik sekiller hesaba katilarak teorik minimum tiklama sayisi hesaplanir.
- Uretici cozulebilir bir harita olusturur; tamamlama icin bosta su ucu kabul edilmez.

### 4.2 Baglanti ve tamamlama

- `PuzzleValidator` merkezden BFS/flood-fill ile erisilebilen taslari hesaplar.
- Iki kanal ancak iki komsu yuzde de karsilikli cikis varsa eslesmis sayilir.
- Bir tasin tum cikislari eslesmeden o tas tam gecerli sayilmaz.
- Bolum ancak tum aktif taslar kaynaga bagli ve `danglingExitCount === 0` iken biter.
- Su ulasan ve cikislari tam eslesen taslarda cimen/bitki canlanma durumu etkinlesir.

### 4.3 Hex ve cevre cizimi

- Hexler ust yuzey, yan yuzey, golge, parlama ve settle glow katmanlariyla cizilir.
- Guncel sanat yonu sicak keten/kum zemin, petrol mavisi su, hardal-turuncu vurgu, zeytin yesili bitki ve toprak-kahve golge paletidir.
- Aktif, bagli/cozulmus ve pasif taslar farkli materyal ve renk durumlarina sahiptir.
- Kanal cizimi hex siniri icinde kirpilir; kanal yatagi, su ve yuzey parlakligi katmanlari vardir.
- Kum lekeleri, kum taneleri, taslar, cimenler ve yabani cicekler seeded rastgele dagitilir.
- Dekor sayisi kontrolludur; bazi hexler bos kalabilir, tek bir hexte asiri yigilma olusmaz.
- Bagli hexlerde cimen miktari hafif artar ve cimenlerin bir kismi ciceklenir.
- Tas, cimen, yabani cicek ve merkez cicegi icin birden fazla sekil varyanti vardir.
- Kayalar tek tip ve sabit konumlu degildir; bazi hexler bos kalirken digerlerinde sinirli sayida, farkli renk ve bicimlerde kucuk kaya kumeleri olusur.
- Bagli hexlerde cimen miktari kontrollu artar; cicekler tek sembol yerine farkli renk ve yaprak duzenlerine sahip kucuk yamalar halinde acabilir.
- Tas yukseltme, 60 derece donus, golge genislemesi ve yerine oturma animasyonu vardir.
- Ayni tas animasyon bitmeden tekrar dondurulemez; diger taslarla etkilesim devam eder.
- Cizim ve animasyonlar frame delta ile ilerler; baglanti ve yuzey sonuc cache'leri kullanilir.
- Ana Canvas ve onbellege alinan hex yuzeyleri cihaz piksel oranina gore 1x-2x backing resolution ile uretilir; yuksek DPI ekranlarda tarayici tarafindan buyutulmus dusuk cozunurluklu doku kullanilmaz.
- Kum yuzeyinde cok olcekli mikro taneler, yumusak ton kirilmalari ve ince izler; suda koyu kanal kenari, turkuaz govde, aydinlik merkez ve ince yansima katmanlari vardir.

### 4.4 Su sistemi

- Kaynak ve bitis disindaki hex merkezlerinde mavi portal dairesi yoktur.
- Kaynakta suyun ciktigi acik portal, bitiste suyun girdigi koyu portal cizilir.
- Kaynaktan erisilen her yeni eslesmis kol, puzzle tamamlanmadan anlik olarak akar.
- Akis yonu BFS derinligine gore kaynaktan disa dogru belirlenir.
- Esit derinlikli dongu kenarlarinda kararli siralama/anahtar eslemesi kullanilir.
- Su katmanlari: kanal yatagi, ana su, yanal yuzey isiltisi, hareketli ince kesik izler ve kabarciklar.
- Akis izleri tek kalin orta cizgi degil; kanal icinde farkli yanal konumlarda birden fazla ince kesik cizgidir.
- Bagli olmayan kanallar acik ve hareketsiz gorunur.
- Ana menudeki dekoratif akis da kaynak-kanal-bitis fikrini ayni gorsel dille anlatir.

### 4.5 Kaplumbaga

- Oyun ici kaplumbaga sprite degil, `Renderer` tarafindan cizilen geometrik Canvas karakteridir.
- Renkleri hikaye kitabi sahil paletiyle uyumludur.
- Yuz/mimik cizilmez; kafa hareketleri sallanma ve yonelme ile sinirlidir.
- Yuzgecler yuzerken ritmik hareket eder, beklerken aralikli sikilma/idle hareketi yapar.
- Hareket ederken govde salinimi, su golgesi, ripple ve kisa wake izi vardir.
- Hiz arttiginda kafa/yon donus tepkisi de artar; yan kayiyormus gorunmesi azaltilmistir.
- Oyuncu bir tasi cevirdikten sonra o tas kaynaga bagli ve tum cikislari eslesmis hale gelirse kaplumbaga o hexe gider.
- Bu davranis bilerek korunmustur; ileride odul mekanigine baglanmasi planlanir.
- Bolum sonunda kaplumbaga kaynak hexine alinip uretilen ana yolun butun aktif hexlerini sirayla gecerek bitis hexine yuzer.
- Sonuc ekrani yuzme turu ve 720 ms sevinme hareketi tamamlanmadan acilmaz.

### 4.6 Ilerleme, sure ve puanlama

- Her bolumde hamle, kullanilan ipucu ve aktif oynama suresi tutulur.
- Menu acikken sure durur; oyuna donunce devam eder.
- Sure simdilik yildiz hesabini etkilemez.
- 3 deniz yildizi: Uc yildiz hamle hedefi icinde ve ipucu kullanmadan bitirme.
- 2 deniz yildizi: Genisletilmis iki yildiz hamle hedefi icinde bitirme.
- 1 deniz yildizi: Bolumu tamamlama.
- Teorik minimum hamlede bitirilirse sonuc deniz yildizlarinin cevresinde ekstra parilti oynar.
- Her bolum icin en yuksek yildiz, en dusuk hamle ve en dusuk sure saklanir.
- Tamamlanan bolumler yeniden oynanabilir; bolum secim ekraninda sadece tamamlanmis bolumler listelenir.
- Son tamamlanan bolumden sonraki seviye `lastLevel` olarak acilir.

### 4.7 Menu ve UI

- Kayit/giris ekrani ve giris sonrasi ana menu vardir.
- Ana menu kart gorunumunden arindirilmis, sicak keten zeminli, ortalanmis iki satirli baslik ve dokunsal petrol mavisi/hardal dugmeler kullanan sakin bir oyun sahnesidir.
- Ana menu oyunun kaynak-kanal-bitis fikrini gosteren animasyonlu marka ve akis seridine sahiptir.
- Marka amblemi kum/cimen hex adasi, kaynak-bitis kanali ve yuzgecli geometrik kaplumbagayi tek simgede birlestirir.
- Kullanici adi, kayitli ada ve tamamlanan bolum sayisi gosterilir.
- Devam et, oyuna don, bolumler, rekorlar, kaydi sifirla ve cikis eylemleri vardir.
- Kayit sifirlama geri alinamaz uyarili ikinci bir onay ekranindan sonra calisir.
- HUD'da seviye, hamle, ipucu ve sure ust kisimda; ipucu altta yer alir.
- Sol altta tam ekran ac/kapat dugmesi vardir.
- Mobil safe-area ve dar ekran duzenleri uygulanmistir.
- `prefers-reduced-motion` icin sonuc sahnesinde azaltmis hareket alternatifi vardir.

### 4.8 Bolum sonu sahnesi

- Sonuc ekrani tepeden gorunen kum ve deniz sahnesidir.
- Prosedurel SVG/CSS dalga kutle, cam katmani, kirilan kopuk, kopuk parcalari, sprey, geri cekilen su ve islak kum izi kullanir.
- Her acilista dalga egimi, ilerleme mesafesi, kopuk suruklenmesi, runoff acisi ve SVG noise seed'i kontrollu rastgele degisir.
- Dalga ileri vurur, geri cekilir ve kumu koyulastirir; deniz yildizlari geri cekilme boyunca soldan saga aralikli olarak kumdan aciga cikar.
- Kazanilan 1-3 derece `public/images/starfish.png` ile deniz yildizi olarak gosterilir.
- Eski hizli deniz yildizi belirme animasyonu CSS'te pasif `legacy-star-reveal` geri donus modu olarak korunur.
- Bolum listesi ve rekor ekranindaki tum derece ikonlari da ayni deniz yildizi assetini kullanir.
- Basligin iki yaninda seffaf `public/images/completion-lotus.png` nilufer asseti vardir.
- Sonuc basligi 1-2 yildizda `Tebrikler!`, normal 3 yildizda `Profesyonel!`, minimum hamleli parlak 3 yildizda `Harika bir uyum!` olur.
- Sonuc basligi beyaz, siyah golgeli ve sahne uzaktan okunacak boyuttadir.
- Sonraki bolum dugmesi ana animasyon tamamlanana kadar kilitlidir.

### 4.9 Ses ve efekt

- Tas donusu, ipucu ve basari icin prosedurel Web Audio efektleri vardir.
- Ses ac/kapat kontrolu vardir.
- Ipucu ve basari icin parcacik efektleri vardir.
- Harici muzik veya surekli ortam sesi yoktur.

### 4.10 Performans ve uyarlanabilir kalite

- Son 120 karelik pencereyle gorunmez FPS ve frame-time olcumu yapilir.
- Yuksek, orta ve dusuk kalite profilleri otomatik histerezisle secilir; kalite tek bir kotu karede degismez.
- Kalite profilleri puzzle geometrisini degil, Canvas ic cozunurlugunu, su izi/kabarcik sayisini, parcacik yogunlugunu ve wake izi orneklemesini ayarlar.
- Degismeyen tile yerlesimi ve akis baglantisi cache'lenir; baglanti cache'i yalnizca tas rotasyonunda veya yeni gridde gecersiz olur.
- Menu acikken arka plan Canvas'i profile gore 20-30 FPS ile sinirlanir.
- Uyarlanabilir kalite dususu hex geometrisini veya dokunma koordinatini kucultmez; yalnizca backing piksel yogunlugu, parcacik ve su efekti sayisini kontrollu azaltir.
- Sekme gizlendiginde oyun guncellemeleri ve aktif sure durur; geri donuste animasyon saatleri sifirlanir.
- HUD zaman metni her kare yerine yalnizca saniye degistiginde guncellenir.
- Parcacik hareketi frame delta ile ilerler; dusuk FPS'te animasyon suresi uzamaz.
- Gelistirme modunda `debugPerf=1` ve `quality=high|medium|low` sorgulari test icin kullanilabilir; production oyuncu akisini etkilemez.

## 5. Supabase Yapisi

### 5.1 Istemci

- `UserAuthSystem`, `@supabase/supabase-js` ile istemci olusturur.
- Supabase URL ve anon key su anda `src/config.js` icinde bulunur.
- Anon key istemci uygulamalarinda gizli anahtar degildir; yine de yetki guvenligi mutlaka RLS ve RPC fonksiyonlarinda saglanmalidir.
- Uygulama Supabase Auth yerine proje icin yazilmis ozel kullanici adi/sifre RPC akisini kullanir.
- Aktif kullanici adi ve sifre yalnizca sayfa calisirken JavaScript bellekte tutulur; yenilemede tekrar giris gerekir.

### 5.2 Kullanilan RPC fonksiyonlari

```text
register_player(p_username, p_password)
login_player(p_username, p_password)
save_player_progress(p_username, p_password, p_last_level, p_best_by_level)
reset_player_progress(p_username, p_password)
get_leaderboard()
```

### 5.3 Beklenen veri bicimi

Istemci RPC cevaplarindan asagidaki alanlari bekler:

```json
{
  "last_level": 8,
  "best_by_level": {
    "1": {
      "stars": 3,
      "bestMoves": 14,
      "bestTimeSeconds": 52
    }
  }
}
```

Liderlik tablosunda her kayit icin `username`, `last_level` ve `best_by_level` beklenir. Konusmalarda kullanilan SQL tasarimi `public.players` tablosuna isaret eder; fakat tablo DDL'i, RLS politikalari ve RPC fonksiyon SQL'leri repoda bulunmamaktadir. Bu nedenle backend sifirdan yalnizca bu repo ile yeniden kurulamamakta ve parola hashleme/yetkilendirme uygulamasi kaynak koddan denetlenememektedir.

### 5.4 Kayit davranisi

- Giristen sonra uzak ilerleme `ProgressSystem` icine yuklenir.
- Bolum basinda `lastLevel`, bolum sonunda derece/hamle/sure ve sonraki seviye kaydedilir.
- Sifirlama aktif kullanicinin ilerlemesini Supabase'de temizler; hesabi silmez.
- `localStorage` kodu eski veya kimliksiz kayitlar icin fallback olarak kalir; normal oyun akisi giris gerektirir.

## 6. Gelistirme Plani Durumu

### Tamamlanan gorsel yol haritasi

- [x] Asama 1 - Hex golge, malzeme, ust/yan yuzey ve durum farklari.
- [x] Asama 2 - Katmanli kanal yatagi, su, parlaklik ve kaynaktan ilerleyen akis.
- [x] Asama 3 - Hizli yukseltme, donme, oturma ve settle glow animasyonu.
- [x] Asama 4 - Oyun ici kaplumbaganin geometrik Canvas stilinde yeniden tasarimi.
- [x] Asama 5 - Yuzgec, idle, kafa sallama, yuzme ve bolum sonu animasyonlari.
- [x] Asama 6 - Su golgesi, ripple, wake izi ve hizla uyumlu yonelme.
- [x] Asama 7 - Kontrollu kum, tas, cimen ve cicek cesitliligi.
- [x] Asama 8 - Uyarlanabilir kalite, render/cache optimizasyonu ve tarayici viewport matrisi tamamlandi.
- [~] Asama 8 gercek cihaz dogrulamasi - Android/iOS dokunma hissi, isinma ve uzun oyun testi kullanici cihazinda bekleniyor.

### Tamamlanan urun ozellikleri

- [x] Moduler Vite/Vanilla JS yapi.
- [x] Cozulebilir ve bosta ucsuz prosedurel puzzle.
- [x] Kontrollu seviye buyumesi ve ek donguler.
- [x] Hamle, ipucu, sure ve deniz yildizi puanlama.
- [x] Kullanici hesabi ve uzaktan ilerleme kaydi.
- [x] Kullaniciya ozel reset ve onay adimi.
- [x] Tamamlanan bolumleri secip yeniden oynama.
- [x] Tum kullanicilar icin rekor ekrani.
- [x] Mobil koordinat olceklemesi ve Pointer Events.
- [x] Tam ekran dugmesi.
- [x] Yenilenmis ana menu ve kaynak-bitis akis motifi.
- [x] Sicak keten, petrol mavisi, hardal-turuncu ve zeytin yesili guncel oyun paleti.
- [x] Kontrollu kaya kumeleri ile cesitlendirilmis cimen ve cicek yamalari.
- [x] Kaynak ve bitis portallari.
- [x] Kaynaktan disa dogru tutarli su yonu.
- [x] Kaplumbaganin kaynak-bitis zafer turu.
- [x] Deniz yildizli, dalga/kopuk/islak kum animasyonlu sonuc sahnesi.
- [x] Minimum hamle bitirisinde ozel derece pariltisi.

### Planlanan fakat tamamlanmayanlar

- [ ] Kaplumbaganin dogru baglanti kurulan hexe gitmesini odullendiren net mekanik.
- [ ] Kilitli/dondurulemeyen tas tipi.
- [ ] Ozel cicek veya bonus tas.
- [ ] Kopru, tek yonlu kanal veya ikinci kaynak gibi ileri puzzle taslari.
- [ ] Ada tema sistemi ve tema acma/ilerleme sistemi.
- [ ] Tema bazli cevre varliklari ve ses paletleri.
- [ ] Gunluk puzzle veya paylasilabilir gunluk sonuc.
- [ ] Tam bir bolum haritasi; mevcut ekran yalnizca tamamlanan bolumleri listeler.
- [ ] Muzik/ambient ortam sesi.
- [ ] Ayri ses seviyesi ve efekt/muzik ayarlari.
- [ ] Oyun ici kaplumbagayi sprite sheet/WebP animasyonuna gecirme; mevcut karar Canvas stilinde kalmaktir.
- [ ] E-posta kurtarma, sifre yenileme ve kalici guvenli oturum.
- [ ] Otomatik testler, CI ve tarayici E2E testleri.
- [x] Olculmus dusuk donanim profili ve dinamik efekt kalitesi.

## 7. Onemli Siniflar ve Gorevleri

| Sinif/modul | Ana gorev |
|---|---|
| `Game` | Tum sistemleri kurar; menu, bolum, input, tamamlanma, zafer turu ve ana donguyu yonetir. |
| `PuzzleGenerator` | Cozulmus ana yolu kurar, terminalleri atar, ek dongu ekler, taslari karistirir ve minimum hamleyi hesaplar. |
| `PuzzleValidator` | Kaynaktan erisimi, karsilikli cikislari, bosta uclari ve tamamlama durumunu denetler. |
| `Tile` | Tek hexin mantiksal rotasyonunu, aktif/kilitli/terminal durumunu ve gorsel animasyon state'ini tutar. |
| `Renderer` | Hex materyali, dekor, kanal, yonlu akis, portal, cicek ve kaplumbagayi Canvas'a cizer; cizim cache'lerini yonetir. |
| `Turtle` | Konum, hedef, hiz, aci, yuzgec/idle zamanlamasi, kutlama ve wake trail durumunu yonetir. |
| `ProgressSystem` | Hamle, ipucu, sure, hedefler, yildizlar, rekorlar ve yerel/uzak ilerlemeyi yonetir. |
| `UserAuthSystem` | Ozel Supabase RPC kayit, giris, cikis, kaydetme, reset ve leaderboard cagrilarini yapar. |
| `UIController` | DOM elemanlarini baglar; menu, overlay, HUD, rekor, bolum listesi ve sonuc sahnesini gunceller. |
| `InputManager` | Pointer koordinatini Canvas olcegine ve axial hex koordinatina donusturur. |
| `HexMath` | Hex-piksel donusumu, rounding, komsular, ters yon ve anahtar yardimcilarini saglar. |
| `AudioSystem` | Web Audio oscillator/gain ile click, hint ve success seslerini uretir. |
| `ParticleSystem` | Ipucu ve basari parcaciklarini olusturur, gunceller ve cizer. |

## 8. Karar Bekleyen Mekanik

Kaplumbaga, oyuncunun cevirdigi aktif tas hamleden sonra kaynaga baglanmis ve o tasin tum su cikislari komsulariyla eslesmis hale gelirse o hexe gider. Bu davranis rastgele degildir ve korunmustur.

Gelecekte su seceneklerden biriyle odullendirilebilir:

- Kisa bir parilti/su halkasi ve ozel ses.
- Ardisik dogru baglantilar icin sakinlik/uyum serisi.
- Sonuc ekraninda ayri bir basari rozeti.
- Kozmetik ciceklenme veya kaplumbaga tepkisi.

Simdilik yildiz ve skor hesabina etkisi yoktur.

## 9. Bilinen Hatalar, Riskler ve Teknik Borc

### Dogrulanmis sinirlamalar

- iOS/Safari Fullscreen API'yi sinirlayabilir; dugme tarayici sekme/cubugunu her cihazda tamamen gizleyemez.
- Sayfa yenilendiginde ozel Supabase oturumu korunmaz; kullanici tekrar giris yapar. Ilerleme kaybolmaz.
- Supabase erisilemezse normal giris gerektiren oyun akisi baslatilamaz.
- Sure saniye hassasiyetindedir ve menude durur; arka plan sekmesi davranisi tarayicinin `performance.now()` zamanlamasina baglidir.
- Oyun prosedureldir ve seviye ust siniri yoktur; yuksek seviyelerde zorluk esas olarak ayni boyuttaki daha yogun/loop'lu aglara dayanir.
- In-app tarayici Fullscreen API gecisini etkinlestirmedi; tam ekran davranisinin son kontrolu gercek Chrome/Safari cihazinda yapilmalidir.

### Teknik riskler

- Supabase SQL migration, tablo semasi, RLS ve RPC kaynaklari repoda yoktur. Backend tekrar kurulabilir degildir.
- Ozel auth sistemi kullanici sifresini aktif sayfa omru boyunca JS bellekte tutar ve her kayit RPC'sine yollar. Supabase Auth veya token tabanli oturuma gecis guvenligi iyilestirir.
- Supabase URL/anon key kaynak koda gomuludur. Anon key public olsa da ortam yonetimi icin `VITE_SUPABASE_URL` ve `VITE_SUPABASE_ANON_KEY` tercih edilmelidir.
- `ProgressSystem` bazi uzak kayitlari `void this.save()` ile beklemeden baslatir. Kullanici istek tamamlanmadan sekmeyi kapatirsa son ilerleme yazimi yarista kalabilir.
- Otomatik unit, integration, E2E ve gorsel regresyon testi yoktur.
- `npm test` ve CI kontrolu yoktur; kalite kapisi su an production build ve manuel tarayici testidir.
- `.gitignore` yoktur; `dist/` ve `node_modules/` yanlislikla commit edilebilir.
- Kilit dosyasi Git tarafindan izlenmedigi icin `npm install` farkli zamanlarda farkli alt bagimliliklar cozebilir.
- `@vitejs/plugin-legacy` bagimliligi vardir fakat `vite.config.js` yoktur; plugin etkin degildir ve su an gereksiz bagimlilik gibi durur.
- `turtle-gameplay.png` ve `turtle-menu.png` mevcut render akisinda kullanilmamaktadir.
- Leaderboard ve bolum listesi HTML stringleriyle uretilir. Kullanici adi karakterleri istemcide sinirli olsa da backend verisi guvenilmez kabul edilip escape edilmelidir.

### Bilinen acik oyun hatasi

Bu belge hazirlanirken tekrar uretilebilen, production build'i engelleyen bilinen bir JavaScript soz dizimi hatasi yoktur. `360x640`, `390x844`, `768x1024` ve `1440x900` tarayici viewport kontrolleri hatasizdir; fiziksel Android/iOS cihaz testi henuz kullanici tarafinda yapilmamistir.

## 10. Build ve Deploy

### Yerel gelistirme

```powershell
cd turtle-game
npm install
npm run dev
```

Vite varsayilan olarak yerel bir URL verir; genellikle `http://localhost:5173/`.

### Production build

```powershell
cd turtle-game
npm install
npm run build
```

Uretilen statik cikti:

```text
turtle-game/dist/
```

Yerel production onizleme:

```powershell
npm run preview
```

### Render ayarlari

```text
Service Type: Static Site
Repository: r6ven/moduler-turtle
Branch: main
Root Directory: turtle-game
Build Command: npm install && npm run build
Publish Directory: dist
```

Render ayarlari repoda `render.yaml` olarak tutulmaz; Render Dashboard'da elle yapilandirilmistir. GitHub `main` branchine push sonrasinda otomatik deploy beklenir. Bu belgenin olusturulmasi yalnizca local commit ister; push/deploy ayri islemdir.

## 11. Dogrulama Kontrol Listesi

Her buyuk degisiklikten sonra en az su akislari elle kontrol edilmelidir:

1. Kayit olma, hatali giris, dogru giris ve cikis.
2. Bir bolumu ipucusuz ve ipucuyla tamamlama.
3. Minimum hamlede bitirip pariltiyi gorme.
4. Menu acikken surenin durmasi ve donuste devam etmesi.
5. Kaynaktan yeni baglanan her kolda akis yonunun disa dogru ilerlemesi.
6. Bosta kanal ucu varken bolumun bitmemesi.
7. Kaplumbaganin bitis turunu tamamlamadan sonuc ekraninin acilmamasi.
8. Sonuc dalgasi, kopuk, islak kum ve kazanilan deniz yildizlari.
9. Bolum secimi, rekor listesi ve en iyi sure/hamle kaydi.
10. Reset onayi, vazgecme ve onay sonrasi yalniz aktif kullanici ilerlemesinin silinmesi.
11. Masaustu ve mobil boyutlarda HUD/canvas cakismamasi.
12. Tam ekrana girme ve cikma.
13. `npm run build` production derlemesinin basarili olmasi.

## 12. Sonraki Mantikli Isler

Oncelik onerisi:

1. Supabase SQL migration/RLS/RPC kaynaklarini repoya eklemek ve ozel auth guvenligini gozden gecirmek.
2. `.gitignore` ve izlenen tek bir lockfile ekleyerek build tekrar edilebilirligini saglamak.
3. PuzzleGenerator/PuzzleValidator/ProgressSystem icin unit testler yazmak.
4. Playwright ile giris, puzzle tamamlama, sonuc ve mobil layout smoke testleri kurmak.
5. Kaplumbaganin dogru baglanti ziyaretini odullendirme kararini vermek.
6. Kilitli tas ve ozel cicek tasi ile ilk yeni oynanis paketini tasarlamak.
7. Dusuk donanimli Android ve iOS Safari'de FPS/fullscreen/manual test matrisi cikarmak.

## 13. Production Build Kaydi

- Standart proje komutu: `npm run build`
- Bu ortamda kullanilan esdeger dogrulama: paketli Node ile `node_modules/vite/bin/vite.js build`
- Vite: `5.4.21`
- Sonuc: Basarili; 60 modul donusturuldu.
- Cikti: `dist/index.html`, `dist/assets/index-B-D74QYL.css`, `dist/assets/index-Bi9m1XYS.js`
- Boyutlar: HTML 10.16 kB, CSS 32.06 kB, JS 276.01 kB.
- Tarih: 16 Temmuz 2026

Not: Sistem PATH'inde `npm` bulunmadigi icin ayni `build` scriptinin calistirdigi Vite production girisi Codex'in paketli Node runtime'i ile dogrudan yurutuldu. Derleme basariyla tamamlandi.
