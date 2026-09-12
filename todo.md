# TODO: репилот интерфейса штурвала (HelmComputer) на нативный tgui

> Документ для следующего агента. Контекст собран в треде от 2026-09-12.
> Все решения ниже уже СОГЛАСОВАНЫ с пользователем — implementing, не переспрашивай
> по каждому пункту; отклонения обсуждать только если что-то из «фактов» ниже окажется неверным.

---

## СТАТУС (обновлено 2026-09-12, после итерации HelmPlane + ShipPreview)

- **Шаг 0 (deps) — СДЕЛАНО.** `react-zoom-pan-pinch@4.2.0` + `@uidotdev/usehooks@2.4.1`
  в `tgui/packages/tgui/package.json`. Ставились `bun add --ignore-scripts` (чистый
  `bun add` падает на postinstall `ttf2woff2` под Windows/bun — не связано с нами).
- **Шаг 1 (HelmPlane) — СДЕЛАНО.** `tgui/packages/tgui/interfaces/common/HelmPlane.tsx`
  + `tgui/packages/tgui/styles/interfaces/HelmPlane.scss` (зарегистрирован в `styles/main.scss`).
  Реальный API — см. §3, шаг 1 (отличается от первоначальной прикидки).
- **Фаза 2 (ShipPreview) — СДЕЛАНО.** `ShipUpgradeSelector.tsx` переписан на HelmPlane
  (см. §5). Камера сохраняется при смене темы/модуля (без remount), рамки модулей —
  `outline`, фон остался старый radial-gradient.
- **Шаг 2 — сам Helm-консоль СДЕЛАНО (v1).** `interfaces/Helm/`: `data.ts`, `icons.ts`,
  `geometry.ts`, `hooks.ts`, `Chart.tsx` (на `HelmPlane`), `Panels.tsx`, `Controls.tsx`,
  `Keys.tsx`, `Drawer.tsx`, `Menu.tsx`, `overlays.tsx`; `interfaces/HelmComputer.tsx` —
  тонкий entry. Стили — **нативный tgui** для всего, кроме карты; `HelmComputer.scss`
  и кастомный шрифт удалены, остался только `HelmPlane.scss` под саму плоскость.
  Карта больше не автоследит за кораблём (был постоянный ресет) — «Recentre» по кнопке.
- **UI-полировка — СДЕЛАНО.** Fuel → `Button.Checkbox` (имя движка + `ProgressBar` внутри);
  Sensors без gauge (`LabeledList` «Range/Status» + кнопки сканов); Drive → «Propulsion»;
  Throttle → `Knob`; тултипы нод карты counter-scale (`KeepScale`, больше не растут с зумом);
  карта всегда рисует базовую копию контакта (дальние больше не пропадают) + fallback-кружок
  до загрузки `iconRefMap`; корабль — `DmIcon` `ship` с amber-тинтом (тумблер
  `ROTATE_SHIP_BY_COURSE` в `Chart.tsx`); drift/autopilot — SVG-линии, не квадратики/точки.
- **Осталось:** in-game проверка (поворот корабля, палитры/размеры меток, компоновка панелей),
  DM-зачистка фейсплейта (Шаг 4).
- **Побочно:** репо теперь собирается на **BYOND 516.1687** — см. §7 (числовые ключи
  `list()`→`alist()`, CSS `ms` в `stylesheet.dm`, `FORCE_MAP_DIRECTORY`).

---

## 0. Предыстория: сплит DM-стороны уже сделан (не переделывать!)

`/obj/structure/overmap/ship` был монолитом на 4695 строк. Теперь в
`voidcrew/modules/overmap/code/ship/` (папка была создана пользователем, пути в
tgstation.dme починены от устаревших include'ов — дубли/мёртвые строки удалены,
`#include` всех новых файлов на месте):

| файл | содержимое |
|---|---|
| `ship.dm` (577) | var-блок ядра, Initialize/setup_from_template/Destroy, `process()`, `ship_notify`, combat-target API, update_screen/push_helm_frame, missions, combat-alarm хендлеры |
| `shields.dm` | shared shield pool + `update_ship_processing` |
| `engines.dm` | `refresh_engines`, engine diagnostics |
| `crew.dm` | roster/капитаны/join password/airlocks/`set_ship_name` |
| `lifecycle.dm` | abandon/claim/destroy/despawn, dead-site undock |
| `docking.dm` | dock/undock к местам, warmups, stalled watchdog, site load |
| `ship_to_ship.dm` | ship-to-ship docking, `ship_act`, `is_in_ship_to_ship_dock` |
| `movement.dm` | скорость/burn/cruise/parallax/zone transitions |
| `stealth.dm` | interdiction + LOS + nebula concealment |
| `mass.dm` | mass tracking + integrity latch |

- `BURN_NONE`/`BURN_STOP`/`SHIP_SPEED_MULTIPLIER_DEFAULT`/`SHIP_VIEW_RANGE` → `voidcrew/_DEFINES/overmap.dm`.
- Существующие сайдкары переименованы без префикса: `autopilot.dm`, `damage.dm`, `distress.dm`, `orbit_poi.dm`, `sensors.dm`, `transmissions.dm`, `waypoints.dm`.
- Локальные define'ы переехали к своим процессам с `#undef` в хвосте файла.
- ~50 комментариев со старыми путями по всему репо поправлены.

---

## 1. Задача

Переписать `tgui/packages/voidcrew_tgui/interfaces/HelmComputer.tsx` (4725 строк,
монолит) на нативный tgui: без pre-baked PNG-фейсплейта, без самописной камеры-плоскости,
без кастомного CSS-хрома.

Согласованные решения:
1. **Плоскость карты** — полный порт `NanoMap` (подход bandastation) с АДАПТАЦИЕЙ под наш кейс (не дословный vendor).
2. **Метки контактов** — `DmIcon` из world-dmi + CSS-тинт (mask/multiply) там, где цвет не в спрайте.
3. **Стили** — удалить всё (`HelmComputer.scss`, GEOMETRY-фрейм, `helm_faceplate.png`); допустимы только минимальные inline-стили (позиции нод, transitions) + small scss общего компонента плоскости.
4. Монолит не повторять: новая структура — папка `interfaces/Helm/` (см. шаг 2).

DM-сторона (`ui_data()`/`ui_act()` в `voidcrew/modules/shuttle/helm/_helm.dm`) менять
НЕЛЬЗЯ, кроме двух разрешённых случаев: (а) добавить `icon_state`/`chart_icon` в payload
контактов в `get_contact_snapshot()` (см. шаг 2, `icons.ts`), если client-маппинга variant→state
не хватает; (б) удаление asset-датума фейсплейта (шаг 4).

---

## 2. Исследования: факты, на которых построен план

### tgui-компонентура этого репо
- Компонентов в репо НЕТ (`tgui/packages/tgui/components/` отсутствует). Всё из npm-пакета
  **`tgui-core`**: `package.json` пинит `^4.2.3`, `tgui/bun.lock` резолвит **4.3.3**.
- Экспортируемые компоненты (проверено по dist-листу 4.3.3):
  `AnimatedNumber, Autofocus, Blink, Box, Button, Chart, Collapsible, ColorBox, Dialog,
  Dimmer, Divider, DmIcon, DraggableControl, Dropdown, FitText, Flex, Floating, Icon, Image,
  ImageButton, InfinitePlane, Input, KeyListener, Knob, LabeledControls, LabeledList, MenuBar,
  Modal, NoticeBox, NumberInput, Popper, ProgressBar, RestrictedInput, RoundGauge, Section,
  Slider, Stack, Stat, StyleableSection, Table, Tabs, TextArea, TimeDisplay, Tooltip,
  TrackOutsideClicks, VirtualList`.
- Layouts свои: `tgui/packages/tgui/layouts/` (`Window`, `NtosWindow`, `Pane`).
- Контекст-меню (правый клик) в core НЕТ → строить на `Popper`/`Floating`.
- Примеры DmIcon в репо: `interfaces/Cargo/CargoCatalog.tsx` (через `ImageButton dmIcon=...`),
  `LootPanel/IconDisplay.tsx`, `Orbit/JobIcon.tsx`, `PlantAnalyzer/*`, loadout-предпочтения.

### DmIcon и тинт (КЛЮЧЕВОЕ)
- `DmIcon` (dist/components/DmIcon.js) = `Image` c `src = Byond.iconRefMap[icon] + '?state=&dir=&movement=&frame='`.
  Протокол URL **не поддерживает color**. У компонента нет color-пропа.
- `Byond.iconRefMap` на BYOND 515 покрывает dmi из RSC бесплатно, в т.ч.
  `voidcrew/modules/overmap/icons/effects/overmap.dmi` — DM-ассет-датум НЕ НУЖЕН
  (в отличие от старых `/datum/asset/simple`, в репо нет `/datum/asset/icon_library`;
  работают через reference map).
- Тинт из интерфейса возможен стандартным CSS, т.к. это `<img>` (BoxProps принимают `style`/`className`):
  - `mask-image: url(<тот же ref-url>) + background-color: <hex>` — точная монохромная перекраска по alpha;
  - два слоя `img` + `multiply`-оверлей — тинт с сохранением шейдинга спрайта;
  - `filter: hue-rotate()` — грубое.
- ⚠️ `ImageButton`'s `color` красит КОНТЕЙНЕР (класс `ImageButton__color--...`), НЕ спрайт. Не перепутать.

### Мир already раскрашен
- Планеты: `planet.dm:112` `icon_state = planet_info.icon_state` — terrain-варианты это ОТДЕЛЬНЫЕ
  цветные состояния dmi. Штормы: `ion[1-4]`, `electrical[1-4]`, `meteor[1-4]` (frame по severity!).
  Туманность: `nebula`. Руины: `strange_event` / `object`. => тинтить нужно только
  суда (hostile/неопознанные/SOS) и, возможно, миссии/маркеры.

### NanoMap из bandastation (источник паттерна)
- Файлы: `https://github.com/ss220club/BandaStation` (branch master):
  - `tgui/packages/tgui/interfaces/NtosNavigator.tsx` — пример применения;
  - `tgui/packages/tgui/interfaces/common/NanoMap.tsx` — сам компонент;
  - `tgui/packages/tgui/styles/interfaces/NanoMap.scss` — его стили.
- Внутри: **`react-zoom-pan-pinch`** (`TransformWrapper`, `TransformComponent`, `KeepScale`,
  `MiniMap`, `useControls`) + **`@uidotdev/usehooks`** (`useLocalStorage` для состояния камеры).
  Обе зависимости ОТСУТСТВУЮТ в нашем `tgui/bun.lock` → шаг 0 плана: `bun add` в `tgui/packages/tgui`.
- Что ценно для нас (адаптировать, не тащить станционное):
  - `MapButton`: `position` через `transform: translate(posToPx(x), posToPx(y)) scale(var(--map-button-scale))`,
    обёртка `KeepScale` (нода не растёт с зумом), `direction`-стрелка (dir→deg),
    `tracking` + `zoomToElement('selected', scale, 1000, 'linear')` = плавное автослежение камеры;
  - MiniMap целой карты; `useControls` (zoomIn/Out/centerView/zoomToElement);
  - throttle записи состояния камеры в localStorage (1/сек).
- Станционное (lavaland/этажности/stairs/лестницы/`Image('${name}_nanomap_zN.png')`) — ВЫБРОСИТЬ;
  фон плоскости сделать слот-пропом (мы рисуем свой SVG-фон: сетка/кольца зон/солнце).

### InfinitePlane НЕ выбран, но факт на будущее
- `InfinitePlane` ЕСТЬ в tgui-core 4.3.3 и уже используется в репо
  (`interfaces/PlaneMasterDebug/index.tsx`, `MCDependencyDebug.tsx`, helper
  `interfaces/common/Connections.tsx`). Его минус для нас: zoom-диапазон/кнопки фиксированы,
  `zoomToX/Y` = snap (transition внутри жёстко `0.075s linear`), нет counter-scale нод,
  нет миникарты/слежения. Пользователь выбрал порт NanoMap.

### Текущая карта (что портируется как логика, а не как хром)
- `HelmComputer.tsx` глоссарий: `useContacts` (merge live `waypoints` + static
  `chartedContacts`, дедуп по `target`, dist/bearing считаются клиентом),
  `useTravelClock` (Chebyshev-шаги × `moveIntervalMs`, wrap `size-2`), `useDrift`
  (экстраполяция инерции по `driftDirection`, стоп на границе зоны = `hold`, `intercept`
  по контактам), `bearingOf` (порт `overmap_delta_to_compass`), `utils/HelmMapGeometry.ts`
  (`isChartTile/wrappedDelta/clampCameraAxis/visibleCourseSegments`).
- Глид: DM пушит UI-фрейм при каждом пересечении тайла (`push_helm_frame()` в
  `ship/ship.dm`), `moveIntervalMs` = тот же таймер, камера+токен едут
  `transition: transform ${moveIntervalMs}ms linear`; прыжок >2.5 тайла = телепорт (snap).
- `BURN_NONE = 0 / BURN_STOP = -1` задублированы в TS руками — при переносе не потерять
  синхрон с `voidcrew/_DEFINES/overmap.dm`.
- WASD-пилотирование: `acquireHotKey/releaseHotKey` (tgui-core/hotkeys), `globalEvents.on
  ('window-focus-change')`, гейты `keyGuards`, `STEER_KEYCODES=[87,65,83,68,88]` — перенести 1-в-1.
- Throttle-слайдер: ручной троттлинг `act('change_burn_percentage')` (не чаще 1 раза/200мс
  + финальный value; BYOND topic-limit иначе кикает пилота) — сохранить как есть на core `Slider`.
- Панели-«зачем кнопка мертва»: `undockReason()/dockReason()` — тексты перенести дословно
  (пользователю они нравятся), оформить через `Button.title`/`Tooltip`.
- Имя экспорта `HelmComputer` обязательно сохранить (регистрация интерфейсов tgui по имени).

---

## 3. План работ (порядок коммитов)

### Шаг 0 — deps (СДЕЛАНО)
`react-zoom-pan-pinch@4.2.0`, `@uidotdev/usehooks@2.4.1` в `tgui/packages/tgui/package.json`.
⚠️ Ставить `bun add --ignore-scripts`: postinstall `ttf2woff2` под Windows/bun падает.

### Шаг 1 — `HelmPlane` (СДЕЛАНО, актуальный API)
Файлы: `tgui/packages/tgui/interfaces/common/HelmPlane.tsx`,
`tgui/packages/tgui/styles/interfaces/HelmPlane.scss` (регистрируется в `styles/main.scss`).

Свойства `<HelmPlane>`:
- `mapWidth`/`mapHeight` — размер карты в **пикселях** (не тайлы; Helm-карта передаёт
  `51 * tileSize`, Chart сам считает);
- `background` — узел в map-space (наш SVG/`<img>`);
- `stageBackground` — узел позади плоскости (виньетка/подложка, НЕ трансформируется);
- `children` — ноды (см. `HelmPlane.Button`);
- `minScale` (по умолчанию `fit/2`), `maxScale` (default 4), `initialScale`,
  `fitOnInit`, `centerOnInit`, `controls`, `minimap`, `storageKey` (для персиста камеры;
  без него — транзиентная камера, чистится на unmount), `onTransform`, `className`.

`<HelmPlane.Button>`: `x,y` (map-space px), `anchor` (`center`|`top-left`), `id`,
`selected`, `tracking` + `trackingDuration`, `hidden`, `direction` (deg, стрелка-указатель),
`keepScale` (counter-scale через `KeepScale`), `tooltip`, `onClick`, `onContextMenu`,
`className`, `style`, `zIndex`, `children`.

Контролы (`controls`): `−`, `Reset` (масштаб ровно `1x`, позиция сохраняется через
`setTransform`), `+`, `Centre` (`centerView`), toggle миникарты.

Важные нюансы, уже решённые (не сломать при доработке):
- `smooth={false}` — иначе v4 множит шаг колёсика на `|deltaY|` и даёт ~1x скачок;
- `autoAlignment={{ disabled: true }}` — иначе вью перецентровывается при смене
  размера контента (смене халла/темы);
- `limitToBounds={false}` — бесконечная плоскость, wrap рисуем сами;
- камера персистится throttle 1/с через `useLocalStorage`; `onTransform` отдаёт live state
  (для HUD/токена), `persistCamera` пишет отдельно.

### Шаг 2 — `tgui/packages/voidcrew_tgui/interfaces/Helm/` (СДЕЛАНО)

> Факт: реализовано (`data`, `icons`, `geometry`, `hooks`, `Chart`, `Panels`, `Controls`,
> `Keys`, `Drawer`, `Menu`, `overlays`). Отличия от таблицы ниже: чистая геометрия вынесена
> в `geometry.ts` (не `hooks.ts`); Throttle на `Knob`; Fuel на `Button.Checkbox`; Sensors без
> `RoundGauge`; Drive переименован в «Propulsion»; тултипы нод counter-scale.
> Таблица оставлена как исходная задумка.

| файл | из чего |
|---|---|
| `data.ts` | типы из текущего `HelmComputer.tsx` (89-333); комментарии-ссылки на DM поправить на НОВЫЕ пути (`ship/sensors.dm`, `ship/distress.dm`, `ship/waypoints.dm`, `ship/transmissions.dm` — сейчас в tsx везде старые `ship_*.dm`) |
| `icons.ts` | маппинг `kind/variant → { dmi, icon_state, dir?, tint? }`. Планка: планеты/штормы/туманности/руины — состояния `overmap.dmi` как есть; суда — базовый state (см. base_icon_state: `ship`/`shuttle` + `_moving`) + mask-тинт (hostile `#cf4a38`, unknown `#8c9ea2`, sos-обводка). ЕСЛИ строк `variant` не хватает для точного state-маппинга — добавить в DM `get_contact_snapshot()` поле `icon_state` (файл `ship/sensors.dm`, минимальная правка). **Список состояний `voidcrew/modules/overmap/icons/effects/overmap.dmi` уже снят пользователем:** `ship, ship_moving, sector, object, meteor1..meteor4, event, strange_event, dust1..dust4, electrical1..electrical4, globe, carp1..carp4, ion1..ion4, shuttle, shuttle_moving, station, nebula, wormhole, nebule_filled, wormhole_filled, asteroid, star1` |
| `hooks.ts` | Selection/ChartFocus/MenuControl/DockMenuControl контексты, `useLocked`, `useContacts`, `useTravelClock`, `useDrift`; pure-геометрию из `utils/HelmMapGeometry.ts` перенести сюда (`clampCameraAxis` скорее всего не нужен — плоскость бесконечная) |
| `Chart.tsx` | HelmPlane: bg-SVG (сетка 51×51+fine grid при зуме, кольца зон `bandOf`/sun — данные `chart.centre/ringInner/ringMiddle/viewRange/sensorRange`), ноды контактов (DmIcon/`Blink` для SOS-пульса, severity→масштаб/фреймы `ion1-4`), токен корабля (glide transition по `moveIntervalMs`, телепорт-эвристика >2.5 тайла, курс/нос по `burnDirection??driftDirection`, view/sensor кольца — ноды), autopilot route + drift track + transmission pulses + destination mark — как SVG/nodes-дети плоскости; follow/pan/Recentre; right-click меню через `Popper`; HUD-углы (HDG/POS/CUR/ENDS/PATH) — `Box` + inline |
| `Panels.tsx` | Ident (`Input`+rename по Enter, без useFitToWidth — имени дать нативный ellipsis), ZoneBadge (`Icon`+`Tooltip`), AlertStrip (список `NoticeBox`-компакт или строки `Table`; таблица приоритетов alert'ов сохраняется!), Hull/Fuel/Drive/Sensor (`ProgressBar`, `RoundGauge`/`Knob`, `LabeledList`; scan-кнопки = `Button`) |
| `Controls.tsx` | Throttle (`Slider` + перенос троттлинга отправки), Rose (3×3 `Button` с FA-иконками стрелок; подсветка от `commandedCourse`, клик по горящему = coast), Velocity (`Table`/`Stat`), OpsRow (5 `Button`, `title`-тексты `undockReason/dockReason` дословно; DockOptions пикер на `Popper`), Drawer (`Tabs` + списки: Contacts с collapse полей nebula/hazard, At location, Comms (Input+Transmit+лог+SOS-панель), Intel) |
| `Keys.tsx` | WASD-хук с `acquireHotKey` — перенос 1-в-1 (плюс тумблер live/armed на кнопке Rose-панели) |
| `overlays.tsx` | CrashOverlay (`ProgressBar`), AbandonedOverlay (claim) |
| `HelmComputer.tsx` (entry в `interfaces/`) | тонкий ре-экспорт композиции из `Helm/`, сохранить имя |

### Шаг 3 — вычистить старое (СДЕЛАНО)
- удалены `styles/interfaces/HelmComputer.scss` (1898 строк) и его регистрация в `main.scss`;
  `utils/HelmMapGeometry.ts` → `interfaces/Helm/geometry.ts`, тест → `utils/HelmGeometry.test.ts`;
- `interfaces/HelmComputer.tsx` **не удалён**, а заменён тонким entry (по нему регистрируется
  интерфейс); `resolveAsset` в Helm больше не используется, фейсплейт-арт клиентом не грузится.

### Шаг 4 — DM-зачистка
`voidcrew/modules/shuttle/helm/_helm.dm`:
- удалить `/datum/asset/simple/helm_faceplate` (строки ~231-242) и override `ui_assets()`;
- удалить `voidcrew/modules/shuttle/helm/helm_faceplate.png`;
- (опционально) полить `icon_state` в `ship/sensors.dm get_contact_snapshot()` — см. шаг 2;
- проверить компиляцию (BYOND 516.1687): `& "C:\Program Files (x86)\BYOND\bin\dm.exe" tgstation.dme -DCBT -DCIBUILDING -DCITESTING -DALL_MAPS`
  (DreamMaker.exe — GUI, из скрипта зависает; для CLI использовать `dm.exe`).
  Полная сборка ~1 мин, сейчас проходит с 0 ошибок.

### Шаг 5 — проверка tgui
В `tgui/` актуальны скрипты: `bun run tgui:tsc`, `bun run tgui:build`,
`bun run tgui:test`, `bun run tgui:lint-render`. Отдельных tgui-джоб в
`.github/workflows/ci_suite.yml` НЕТ (CI компилит только DM), поэтому tgui проверяем локально.
Затем in-game прогон:
полёт+глид на разных `moveIntervalMs`, WASD, throttle drag, стыковка/расстыковка, SOS-метки,
hostile-тинт, right-click меню, миникарта, зум, Recentre, автопилот-маршрут, drift-track,
zone-transition hold.

---

## 4. Риски / открытые вопросы (решать в имплементации)

1. **Глид**: `zoomToElement` в NanoMap = 1000ms linear — идеально под медленный полёт, но на
   быстром (тайл за ~200мс) будет отставать. Варианты: параметризовать длительность
   (= `moveIntervalMs`), либо при `state==='flying' && speed` high использовать snap. Замерить вживую.
2. **Wraparound**: плоскость бесконечна, мир 51×51 с wrap. Метки за краем не дублируем (как
   сейчас); тайлящийся фон может выглядеть «бесконечным космосом» — это плюс, проверить визуал.
3. **Точные имена icon_state**: снять из `overmap.dmi` перед написанием `icons.ts`;
   сверить с тем, что отдаёт `get_contact_variant()` (`ship/sensors.dm`).
4. Палитра: amber=своё, ice=внешний мир, sos-розовый — донести через color-пропы;
   семантические цвета (`#cf4a38/#d9a230/#59b871`) уже есть как нативные цвета тем tgui — предпочитать их.
5. `ui_static_data` (chartedContacts) и коалесинг push'ей — не сломать: следование/миникарта
   не должны дёргать act(); только чтение.
6. Старые комментарии-ссылки в TS на `ship_*.dm` обновить на новые пути в ходе переноса.

## 5. Фаза 2 (СДЕЛАНО): зум/пан превью корабля в ShipUpgradeSelector

> РЕАЛИЗОВАНО в `tgui/packages/tgui/interfaces/ShipUpgradeSelector.tsx`:
> `ShipPreview` живёт на `HelmPlane`; hull-PNG — `background`, module-PNG — ноды в
> map-space, label слота — `keepScale`; click по слоту переключает на вкладку Upgrades
> и подсвечивает секцию (`selectedSlot`). Рамки модулей — `outline` (не `border`:
> `box-sizing: border-box` иначе съедает 2px спрайта). `HelmPlane` НЕ ремонтируется по
> `key` при смене темы — камера сохраняется. `minScale=fit/2`, `maxScale=3`, MiniMap 150px.
> Окно осталось 1200×900. `hoverModule`/`hoverTheme` — 1-в-1.


Идея пользователя: в окне выбора корабля/апгрейдов сделать НЕ статичную картинку,
а интерактивную (зумить и двигать) — на том же HelmPlane.

ЦЕЛЬ (уточнено пользователем): это НЕ карта флота в ShipJoinMenu. Это `ShipPreview`
в shipyard-окне, в которое уводит `ShipJoinMenu` кнопкой «Open Shipyard»:
- клиент: `tgui/packages/tgui/interfaces/ShipUpgradeSelector.tsx` (1452 строк),
  компонент `ShipPreview` (строка ~1110): композит hull-PNG + module-PNG по
  slot-маркерам с connector-выравниванием; сейчас только fit-to-container, без зума;
- ассеты уже есть: `voidcrew/modules/ship_upgrades/ship_preview_assets.dm`
  (`/datum/asset/simple/ship_previews`), манифест
  `voidcrew/modules/ship_upgrades/previews/manifest.json`
  (`tile_px: 32`, hulls{png,width,height,slots{key:[tx,ty]}}, modules{png,w,h,connector,themes}) —
  259 png, генерация `tools/ship_previews/generate_ship_previews.py` (перезапускать после правки DMM);
- `ui_data["preview"]` уже отдаёт весь манифест клиенту — DM-менять ничего не нужно.

Имплементация (после шага 1 — нужен готовый `interfaces/common/HelmPlane.tsx`):
1. Заменить статичный div `ShipPreview` на HelmPlane: map-space = `hull.width*tile_px × hull.height*tile_px` px,
   фон-слой = `<img src={resolveAsset(hull.png)} style={{imageRendering:'pixelated'}}>`.
2. Module-оверлеи оставить `<img>` в map-space (масштабируются вместе с картой — это и нужно,
   карта = сам корабль; НЕ KeepScale). Перевод % → px по tile_px.
3. Slot-маркеры (пунктирная рамка + label) → ноды HelmPlane: рамка в map-space,
   label через KeepScale (читаем при любом зуме). Клик по ноде = выбрать этот слот
   в сайдбаре (или открыть пикер модулей слота).
4. Начальный зум = fit (как сейчас), minZoom=fit/2, maxZoom ≈ 3 (1 тайл крупно);
   MiniMap = весь корабль целиком (~150px) — маленький, но даёт «где я» на больших халлах.
5. Hover-превью модулей/темов (текущий функционал `hoverModule`/`hoverTheme`) сохранить 1-в-1.
6. Окно: с plane можно вернуть фиксированную ширину поменьше (зум решает проблему места) —
   не обязательно 1200×900 при превью; проверить компановку.

Побочный бонус: тот же HelmPlane затем идёт в Helm/Chart (шаг 2) — превью корабля
это первый потребитель и обкатка компонента.

## 6. Полезные пути

- Shipyard-выбор корабля: `tgui/packages/tgui/interfaces/ShipUpgradeSelector.tsx` (компонент `ShipPreview`)
  + `voidcrew/modules/ship_upgrades/ship_upgrade_selector.dm` + `ship_preview_assets.dm`
  + `voidcrew/modules/ship_upgrades/previews/manifest.json` (tile_px/slots/connector) +
  `tools/ship_previews/generate_ship_previews.py`
- Join-меню (список без картинок, вход в shipyard): `tgui/packages/tgui/interfaces/ShipJoinMenu.tsx`
  + `voidcrew/edits/mobs/ship_join_menu.dm`
- Фейсплейт-арт (DM, удалить в Шаге 4): `voidcrew/modules/shuttle/helm/helm_faceplate.png`
- Entry UI: `tgui/packages/voidcrew_tgui/interfaces/HelmComputer.tsx` (тонкая композиция `Helm/`)
- Старый scss (УДАЛЁН): `tgui/packages/tgui/styles/interfaces/HelmComputer.scss`
- Бывшая pure-геометрия (УДАЛЕНА): `tgui/packages/voidcrew_tgui/utils/HelmMapGeometry.ts`
  → теперь `tgui/packages/voidcrew_tgui/interfaces/Helm/geometry.ts`
- DM helm-консоль: `voidcrew/modules/shuttle/helm/_helm.dm` (`ui_data/ui_act/ui_assets`)
- DM снимок карты: `voidcrew/modules/overmap/code/ship/sensors.dm` (`get_contact_snapshot`)
- World-dmi: `voidcrew/modules/overmap/icons/effects/overmap.dmi` (+`overmap_large.dmi`)
- Bandastation-этalon: `ss220club/BandaStation@master` → `NtosNavigator.tsx`, `common/NanoMap.tsx`, `styles/interfaces/NanoMap.scss`
- tgui-core docs (stories): https://tgstation.github.io/tgui-core/ ; npm-версия в lock: 4.3.3

## 7. BYOND 516 (СДЕЛАНО, побочная работа)

Репо переехало на BYOND 516.1687, который сломал несколько мест; всё уже починено,
полная сборка `dm.exe ... -DCBT -DCIBUILDING -DCITESTING -DALL_MAPS` даёт 0 ошибок
(dreamchecker тоже 0). На будущее:

- **Числовые ключи в `list()` запрещены** → `alist()`. Правились:
  `processing/station.dm`, `research/ordnance/_scipaper.dm`, `scipaper_partner.dm`,
  `game/objects/items/tanks/tanks.dm`, `__DEFINES/food.dm` (3 глобала),
  `datums/hud.dm` (2), `dynamic_ruleset_midround.dm` (10), `dynamic_ruleset_roundstart.dm` (6),
  `mob_spawn/corpses/mining_corpses.dm`, `atmospherics/gasmixtures/reactions.dm`,
  `controllers/subsystem/timer.dm` (2), `quirks/neutral_quirks/transhumanist.dm`,
  `admin/smites/boneless.dm`.
- **Лексер 516 ругается на «число+буквы» даже внутри `{"..."}`** (`1500ms`). Форк добавлял
  `animation`/`@keyframes` в `interface/stylesheet.dm` — убраны (в tgui-chat
  `tgui-panel/styles/tgchat/chat-*.scss` они уже есть).
- **`FORCE_MAP_DIRECTORY`** определялся только под `#ifdef LOWMEMORYMODE`, а `-DFORCE_MAP`
  приходит отдельно → добавили безусловный дефолт в `code/_compile_options.dm`.

Прочее из этой итерации (уже в рабочем дереве, к Helm прямого отношения не имеет):
`dreamchecker` доведён до 0 ошибок — корни: `say()`/`grow_to_fit()`/`Release()`/
`spawn_shield_walls()` сделаны `set waitfor = FALSE`, worldgen-очистка вынесена из `Destroy`,
courier-gloves `return_to_hand` вместо `put_in_hands`.
