# CLAUDE.md

Контекст для Claude Code при роботі в цьому репозиторії.

## Що це за проєкт

**Wind & Ball** — фізична аркада на HTML5 Canvas, одна сторінка, без збірки й без залежностей.
Українськомовний UI. М'ячик рухається по полю під дією гравітації/вітру, взаємодіє з блоками
(стінки, вентилятори, труби, пружні бампери, кільця-пастки) — щось на кшталт pinball-пісочниці
з вбудованим редактором рівнів.

## Структура

- `index.html` — HTML-розмітка, CSS (inline `<style>`) і 12 `<script src="js/*.js">`,
  завантажених у фіксованому порядку.
- `js/` — логіка гри, розбита по файлах (див. нижче). Це **класичні скрипти, не ES
  modules** — жодного `import`/`export`. Усі top-level `let`/`const`/`function` живуть у
  спільному глобальному лексичному оточенні документа (браузерна особливість: top-level
  `let`/`const` у різних `<script>`-тегах однієї сторінки шарять один Global Environment
  Record), тому файли й далі бачать змінні одне одного напряму — так само, як раніше все
  бачило одне одного всередині єдиного IIFE. Порядок `<script>`-тегів у `index.html` =
  порядок оголошень у колишньому монолітному файлі, міняти його не можна без ризику
  "used before declaration".
- `LICENSE` — MIT.

Раніше в репозиторії був ще й `wind-ball.html` — точна копія `index.html`. Дублікат прибрано.

## Чому не ES modules

Проєкт відкривається просто подвійним кліком (`file://`) — без білд-кроку і без сервера.
ES modules (`<script type="module">`) блокуються CORS-політикою браузерів на `file://`,
тож обраний варіант — класичні скрипти, розрізані по логічних файлах, без формальної
інкапсуляції (namespace/IIFE per file навмисно не робили, щоб зберегти 100% ідентичну
поведінку "як було", без ризику зламати порядок ініціалізації на живому canvas-коді,
який неможливо прогнати тестами).

## Файли в `js/` (порядок завантаження = порядок нижче)

| Файл | Роль | Що всередині |
|---|---|---|
| `camera.js` | **Camera** | `resize`, `screenToWorld`, `clampCamera`, `minFitZoom`, DPR/viewport |
| `extra-balls.js` | Billiard-режим | `spawnExtraBall`, `updateExtraBalls`, `drawExtraBalls` |
| `constants.js` | **Constants** | світові константи (мм/с, гравітація, пороги швидкості) |
| `entities.js` | **Entities** | `BLOCK_KINDS`, стан `ball`/`ring`/`blocks`, `initWorld`, `resetBall`, `placeRing` |
| `storage.js` | Persistence (score) | `loadBest`/`saveBest` (найкращий рахунок) |
| `input.js` | **InputController** | `onPointerDown/Move/Up`, drag, `blockNativeGesture` |
| `scene-manager.js` | **SceneManager** | `startGame`, `goHome`, перемикання режимів (billiard/gravity/big-field), стартове меню |
| `level-io.js` | **LevelIO** | `LEVEL_1`/`LEVEL_2`, `loadLevel`, `buildLevelDefFromCurrentBlocks`, `customLevels` + `window.storage` (persistent artifact storage, не localStorage) |
| `ui-block-editor.js` | UI редактора | `openBlockSettingsPopup`, drawer з блоками, grid/import попапи |
| `physics.js` | **PhysicsEngine** | wind field, геометрія труб (`pipeToWorld`, `arcSegmentPenetration`), зіткнення (`collideBallWithBlocks`, `separateBlocks`), `step` — найбільший і найкрихкіший файл (~1000 рядків) |
| `renderer.js` | **Renderer** | усі `draw*`, `render`, частинки (confetti/burst) |
| `game.js` | **GameLoop** | `loop` (rAF), bootstrap: `createVelourPattern`/`initWorld`/`loadBest`/`requestAnimationFrame(loop)` |

## Важливі нюанси

- Немає класів, немає явних модулів — розділення файлове й іменне (за коментарями-
  секціями `// ---------- ... ----------`, які лишились у коді), а не через
  encapsulation. Спільний мутабельний стан (`blocks`, `ball`, `camera`, `ring`,
  `extraBalls`, `bgTiles`) і далі глобальний — просто фізично розкиданий по файлах
  за зоною відповідальності.
- Одиниці фізики — "мм/с" у назвах змінних (`fanEscapeThreshold`, `maxBallSpeed`,
  `gravityStrength`) — умовна одиниця цього конкретного солвера, не прив'язана до
  реальних міліметрів екрана.
- Є debug-режим (`debugLog`, `renderDebugConsole`, `toggleDebugPanel`,
  `gravityEnabled`) для налагодження фізики прямо в грі (у `physics.js`/`entities.js`).
- Копірайт у `LICENSE` — Danylo Oliinyk, 2026, MIT.
- Рефакторинг перевірявся лише `node --check` на кожен файл (синтаксис) і звіркою
  кількості рядків до/після розрізу — **не** прогонявся в реальному браузері. Перед
  релізом варто відкрити `index.html` і пройтись основними сценаріями (гра, редактор
  рівнів, збереження) вручну, бо тестів у проєкті немає.

## Що варто уточнювати в задачах

Якщо задача стосується фізики (труби, вентилятори, зіткнення) — варто явно перевіряти
поведінку в браузері (файл самодостатній, відкривається просто як `index.html`), бо
юніт-тестів у проєкті немає.
