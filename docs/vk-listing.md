# VK Games — готовые тексты карточки

Все поля ниже можно копировать в форму VK. Название, краткое и полное описание,
«Как играть» и «Об игре» даны на английском, потому что поля в форме подписаны
`(EN)`. Русские варианты — в конце файла.

Перед отправкой замени:

- `Mensori Dev` — если хочешь другое имя разработчика;
- адрес игры: `https://s3.eponesh.com/games/draft/32533/v1/` — открывается, 200 OK;
- «Состояние для пользователей» уже включено.

## Иконки

Все файлы уже готовы в `assets/vk/`:

| Поле VK | Файл | Размер |
| --- | --- | --- |
| Универсальная иконка | `assets/vk/icon-576.png` | 576×576, PNG |
| Иконка для каталога и сниппетов | `assets/vk/icon-278.png` | 278×278, PNG |
| Маленькая иконка | `assets/vk/icon-150.png` | 150×150, PNG |
| Фавикон | `assets/vk/favicon-32.png` | 32×32, PNG, 1,7 КБ |
| Анимированная иконка | `assets/vk/icon-animated.json` | 96×96, Lottie, 14 КБ |

Универсальной иконки достаточно для карточки. Иконку каталога можно не
загружать отдельно: VK возьмёт универсальную. Фавикон — для вкладки браузера
на десктопе. Анимированная иконка необязательна: без неё VK покажет маленькую
статичную. Цвет фона за иконкой — `#17618F`.

## Скриншоты и видео

Скриншоты — 1200×600, альбомная ориентация, минимум 3. Готовы пять:

| Файл | Что на экране |
| --- | --- |
| `dist/vk-assets/screenshots/01-menu-1200x600.png` | меню с профилем и рейтингом |
| `dist/vk-assets/screenshots/02-placement-1200x600.png` | расстановка флота |
| `dist/vk-assets/screenshots/03-prepare-1200x600.png` | выбор тактических способностей |
| `dist/vk-assets/screenshots/04-battle-1200x600.png` | начало боя |
| `dist/vk-assets/screenshots/05-battle-shots-1200x600.png` | бой с выстрелами |

Промовидео: `dist/vk-assets/promo.mp4` — 1200×600 (2:1), 17 секунд, без звука,
H.264. Подходит и для блока «Рекомендуемые сегодня»: лимит VK — 30 секунд.

Большой сниппет: `dist/vk-assets/big-snippet-1120x630.png` (есть и `.jpg`) —
1120×630, для карточки и каталога.

## Основные поля

| Поле | Значение |
| --- | --- |
| Название игры (EN), до 48 | `Sea Battle — Sea Arena` |
| Краткое описание (EN), до 255 | `Classic sea battle with a smart bot, ELO rating, ranks, tactical abilities and a daily challenge. Single-player, offline, no ads.` |
| Категории (до 3) | `Games → Board games`, `Games → Logic`, `Games → Strategy` |
| Теги (до 10) | `sea battle`, `battleship`, `board game`, `logic`, `strategy`, `single player`, `offline`, `ELO`, `tactics`, `casual` |
| Ключевые слова (до 10) | `sea battle`, `battleship`, `board game`, `logic game`, `strategy`, `single player`, `offline game`, `rating`, `tactics`, `daily challenge` |
| Движок | `HTML5` (если есть «Другое» — `Custom HTML5 / JavaScript`) |
| Возрастное ограничение | `6+` |
| Почта техподдержки | `mensoridev@gmail.com` |
| Имя разработчика (EN), до 128 | `Mensori Dev` |
| Дополнительные языки | не добавлять: игра только на русском |

## Полное описание игры (EN), до 1024

```text
Sea Battle — Sea Arena is a modern take on the paper-game classic. Place your fleet, hunt enemy ships and climb the ELO ladder against a bot that actually plays well.

• Three board sizes: 8×8, 10×10 and 12×12, each with its own fleet.
• Classic and Admiral fleets; the Admiral fleet adds a five-deck flagship.
• Tactical abilities: choose 2 of 3 before battle — airstrike, anti-air defense or smoke. One charge each.
• Smart bot: hunts on a checkerboard pattern, finishes ships along a line and clears cells around sunk ships.
• ELO rating, seven ranks from Cabin Boy to Legend, win streaks, best rating and match history.
• Daily challenge: the same setup for everyone, three wins in a row for a rating bonus.
• Three visual themes, procedural music and sound, reduced-motion support.
• Fully playable offline. No ads, no analytics, no trackers. Progress stays on your device.

Rated play uses the classic 10×10 board without tactics. Custom boards and abilities are unrated, so the ladder cannot be farmed.

Age rating: 6+.
```

## Как играть (EN), до 1024

```text
1. Open the game and press «В бой» (Play).
2. Place your fleet manually or press «Случайно» (Random). Rotate ships with the button, the R key or the mouse wheel.
3. Press «Готов» (Ready) to start the battle.
4. Tap an enemy cell to fire. A hit lets you shoot again; a miss passes the turn to the bot.
5. Sink the whole enemy fleet before the bot sinks yours.
6. Before battle you can enable tactics and choose 2 of 3 abilities: airstrike (3×3 area), anti-air defense (blocks the first airstrike) and smoke (hides a 3×3 zone for three enemy turns).
7. In the daily challenge, win three battles in a row with the daily setup to earn a rating bonus.
```

## Об игре (EN), rich text

```text
Sea Battle — Sea Arena is a single-player HTML5 game for fans of the classic
paper-and-pencil sea battle. It keeps the familiar rules and adds an ELO ladder,
seven ranks, tactical abilities and a daily challenge.

The bot is not random: it searches the board on a checkerboard pattern, finishes
damaged ships along a line and marks the cells where a ship cannot be. Before
battle you choose two of three tactical abilities: airstrike, anti-air defense
and smoke. The game supports 8×8, 10×10 and 12×12 boards, classic and Admiral
fleets, three visual themes and reduced-motion mode.

No ads, no in-app purchases, no analytics and no account required. The game works
offline; progress is stored locally on the device.
```

## Русские варианты (если VK попросит локализацию)

### Название, до 48

```text
Морской бой — Морская арена
```

### Краткое описание, до 255

```text
Классический морской бой с умным ботом, ELO-рейтингом, рангами, тактикой и испытанием дня. Одиночная игра, офлайн, без рекламы.
```

### Полное описание, до 1024

```text
«Морской бой — Морская арена» — современная версия игры с бумажного поля. Расставь флот, ищи корабли соперника и поднимайся по ELO-лестнице против бота, который правда умеет играть.

• Три поля: 8×8, 10×10 и 12×12, у каждого свой флот.
• Классический и адмиральский флот; у адмиральского есть флагман на 5 клеток.
• Тактика: выбери 2 из 3 способностей — авиаудар, ПВО или дым. По одному заряду.
• Умный бот: ищет по шахматной сетке, добивает корабль по линии и вычёркивает соседние клетки.
• ELO-рейтинг, семь рангов от Юнги до Легенды, серии побед, рекорд и история матчей.
• Испытание дня: одинаковый конфиг для всех, три победы подряд дают бонус к рейтингу.
• Три темы оформления, процедурная музыка и звук, режим reduced-motion.
• Полностью офлайн. Без рекламы, аналитики и трекеров. Прогресс хранится на устройстве.

Рейтинг идёт только за классику 10×10 без тактики. Кастомные поля и способности не влияют на рейтинг.

Возрастной рейтинг: 6+.
```

### Как играть, до 1024

```text
1. Открой игру и нажми «В бой».
2. Расставь флот вручную или нажми «Случайно». Поворачивай корабль кнопкой, клавишей R или колесом мыши.
3. Нажми «Готов», чтобы начать бой.
4. Тапни по клетке соперника. Попал — стреляй ещё раз; промахнулся — ход переходит боту.
5. Потопи весь флот соперника раньше, чем он потопит твой.
6. Перед боем можно включить тактику и выбрать 2 из 3 способностей: авиаудар (зона 3×3), ПВО (гасит первый авиаудар) и дым (скрывает зону 3×3 на три хода соперника).
7. В испытании дня выиграй три боя подряд с конфигом дня, чтобы получить бонус к рейтингу.
```

### Описание для формы VK, до 2000

Это отдельное поле «Описание» в новой форме VK (не путать с полным описанием
игры на английском выше). Текст уже укладывается в лимит 2000 символов.

```text
⚓ Морской бой — Морская арена

Та самая игра с тетрадным полем — но теперь с рейтингом, рангами и ботом, который правда умеет играть.

🎯 КАК ИГРАЕМ
• Поле 8×8, 10×10 или 12×12 — флот подбирается под размер. На 10×10 классика: линкор (4), два крейсера (3), три эсминца (2) и четыре катера (1).
• Попал — стреляй ещё раз. Промахнулся — ход переходит противнику.
• Победа — потопить весь флот соперника.

🎯 ТАКТИКА
• Перед боем выбери 2 способности из 3 — по одному заряду на бой.
• Авиаудар бьёт область 3×3 (на 8×8 — 2×2).
• ПВО гасит первый авиаудар соперника до одной клетки.
• Дым накрывает 3×3 своего поля и прячет клетки на три хода соперника.

🧠 УМНЫЙ СОПЕРНИК
Бот ищет корабли по шахматной сетке, добивает по линии и вычёркивает пустые клетки после потопления. Каждый матч он получает рейтинг, близкий к вашему.

📈 РЕЙТИНГ И РАНГИ
• ELO-рейтинг, семь рангов: Юнга → Матрос → Боцман → Штурман → Капитан → Адмирал → Легенда.
• Рейтинг — только за классический бой 10×10 без тактики. Кастомные поля и способности прогресс не двигают.
• Статистика, серия побед, рекорд и история последних матчей.

🏆 ИСПЫТАНИЕ ДНЯ
Одинаковый конфиг для всех: три боя без поражения дают +60 к рейтингу раз в день.

🎨 ОФОРМЛЕНИЕ
Три темы, процедурная музыка и звук, режим reduced-motion, расстановка вручную или случайно.

📴 БЕЗ ИНТЕРНЕТА И РЕКЛАМЫ
Игра работает офлайн. Нет рекламы, аналитики и трекеров. Прогресс хранится только на устройстве.

Возрастной рейтинг: 6+.

Поднять якорь! ⚓
```

## Остальные поля формы VK

| Поле | Значение |
| --- | --- |
| Слоган, до 32 | `Морской бой` |
| Краткое описание, до 108 | `Морской бой с умным ботом: рейтинг ELO, ранги` |
| Состояние для пользователей | `Включено` |
| Мобильное приложение (WebView) | `https://s3.eponesh.com/games/draft/32533/v1/` |
| Web (iframe) | `https://s3.eponesh.com/games/draft/32533/v1/` |
| Мобильная версия сайта (iframe) | `https://s3.eponesh.com/games/draft/32533/v1/` |
| Режим разработки | выключен |
| Правовые документы | `Использовать типовые документы` |
| Консоль Eruda | `Отключена` |
| Таблица результатов | `По набранным очкам` |
| Цвет фона за иконкой | `#17618F` |
| Анимация иконки | `assets/vk/icon-animated.json` (96×96, Lottie, 14 КБ) |

Текущий адрес — `https://s3.eponesh.com/games/draft/32533/v1/`. Он открывается и
подходит для WebView и iframe. Если после публикации GamePush выдаст другой адрес,
замени его во всех трёх полях.

Таблица результатов пока не подключена к игре: VK будет показывать пустой
список. Если нужна реальная таблица, её надо отдельно связать с GamePush
Leaderboards — это следующий шаг, не блокирующий модерацию.
