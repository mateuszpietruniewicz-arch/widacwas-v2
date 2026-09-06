# WidaćWas v2

Statyczna strona WidaćWas z mocno rozbudowaną warstwą animacji. Mechanika przejść
odtworzona z szablonu Framer "Agero" na podstawie inspekcji jego DOM i bundle'a
(wartości sprężyn, krzywe easing, opóźnienia, progi obserwatora, transformacje scrollowe).
Kod własny, bez kopiowania cudzych plików, treść i zdjęcia WidaćWas.

## Uruchomienie

Zwykła strona statyczna. Bez builda, bez npm, bez frameworka.

```
python3 -m http.server 8000
```

Potem otwórz http://localhost:8000

Wrzucenie na serwer: skopiuj całą zawartość repozytorium do katalogu strony.

## Pliki

```
index.html   struktura i treść
style.css    tokeny wizualne (:root) + układ sekcji
script.js    silnik animacji, zero zależności
images/      zdjęcia i zrzuty realizacji
assets/      logo i favicon
```

## Silnik animacji

`script.js` nie wie nic o treści tej strony. Sterujesz nim atrybutami w HTML,
więc da się go przenieść na inny projekt bez zmian.

| Hak | Działanie |
|---|---|
| `data-appear="up40 delay:.2"` | wejście elementu; gotowe presety sprężyn w stałej `PRESETS` |
| `data-text-fx` | nagłówek składa się litera po literze (blur 10px, przesunięcie 10px, odstęp 0,05 s) |
| `data-count="32.5" data-suffix="%"` | licznik odliczający przy wejściu w viewport |
| `data-scale-parallax="1.25,1"` | powolny zoom sterowany scrollem |
| `data-loop-rotate="5"` | obrót 360° w pętli, wartość to czas w sekundach |
| `data-loop-float="-8"` | powolne unoszenie w górę i w dół |
| `data-clock` | zegar odświeżany co sekundę |
| `data-top` | płynny powrót na górę strony |
| klasa `ticker` | nieskończony pasek; `data-speed` w px/s, `data-direction` |
| klasa `work-pin` | karty przypinające się i przykrywane przez kolejne |
| klasa `reveal-text` | tekst zapalający się słowo po słowie |
| klasa `faq-item` | akordeon na `grid-template-rows` |

Dwa moduły są przywiązane do nazw klas z tej strony: zakładki usług
(`.services .tab` i `.services .panel`) oraz karuzela opinii
(`.slider .track`, `.prev`, `.next`, `.cur`).

Przenośna część `style.css` to blok `:root` na górze pliku: kolory, krzywe
animacji, promienie zaokrągleń i fonty.

## Dostępność i wydajność

- Wszystkie efekty wyłączają się pod `prefers-reduced-motion: reduce`.
- Paski przewijające się zatrzymują się poza widokiem (IntersectionObserver).
- Nagłówki mają `aria-label` z pełnym tekstem, bo są rozbite na pojedyncze litery.
- Sprężyny liczone są analitycznie i zamieniane na klatki Web Animations API,
  więc krzywe ruchu odpowiadają Framer Motion, a nie przybliżeniu krzywą Béziera.

## Zanim trafi na produkcję

- Usunąć `<meta name="robots" content="noindex, nofollow">` z sekcji `head`.
  Teraz blokuje indeksowanie, żeby podgląd nie konkurował z widacwas.pl w Google.
- Opinie w karuzeli są oznaczone jako `[przykładowa opinia]` i czekają na prawdziwe.
- Fonty Cal Sans i Inter ładują się z Google Fonts. Dla zera zapytań na zewnątrz
  trzeba je pobrać i podpiąć lokalnie.
