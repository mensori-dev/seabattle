/* ============================================================
   Прицел для промо-автоигры (скриншоты и видео).

   Чистая функция: получает поле 10×10 и список размеров кораблей,
   возвращает клетку для выстрела. Состояния клеток:
     0 — неизвестно, 1 — промах, 2 — попадание (корабль ранен),
     3 — потоплен.

   Считаем плотность вероятности: перебираем все допустимые положения
   оставшихся кораблей и суммируем веса в клетки. Положения, которые
   накрывают раненые клетки, весят намного больше — поэтому добивание
   идёт вдоль корабля, а не случайно вокруг.

   Используется в scripts/make-yandex-promo.mjs (код вставляется в
   страницу через Function.prototype.toString) и в проверке винрейта.
   ============================================================ */

export function chooseShot(grid, fleet) {
  const N = grid.length;
  const at = (x, y) => grid[y][x];

  /* Клетка не может быть частью неизвестного корабля: промах или потоплен. */
  const usable = (x, y) => at(x, y) !== 1 && at(x, y) !== 3;

  /* Вокруг потопленного корабля клетки пустые (корабли не касаются). */
  const nearSunk = (x, y) => {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
        if (at(nx, ny) === 3) return true;
      }
    }
    return false;
  };

  /* Потопленные корабли: связные группы клеток со статусом 3. */
  const seen = Array.from({ length: N }, () => new Array(N).fill(false));
  const remaining = fleet.slice();
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (at(x, y) !== 3 || seen[y][x]) continue;
      let size = 0;
      const stack = [[x, y]];
      seen[y][x] = true;
      while (stack.length) {
        const [cx, cy] = stack.pop();
        size += 1;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
          if (seen[ny][nx] || at(nx, ny) !== 3) continue;
          seen[ny][nx] = true;
          stack.push([nx, ny]);
        }
      }
      const idx = remaining.indexOf(size);
      if (idx >= 0) remaining.splice(idx, 1);
    }
  }
  if (!remaining.length) return null;

  /* Плотность: сколько раз клетка попадает в допустимые положения кораблей. */
  const score = new Float64Array(N * N);
  const dirs = [[1, 0], [0, 1]]; // вправо и вниз — остальные положения зеркальны
  for (const size of remaining) {
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        for (const [dx, dy] of dirs) {
          const ex = x + dx * (size - 1);
          const ey = y + dy * (size - 1);
          if (ex >= N || ey >= N) continue;
          let hits = 0;
          let ok = true;
          for (let i = 0; i < size; i++) {
            const cx = x + dx * i;
            const cy = y + dy * i;
            if (!usable(cx, cy) || nearSunk(cx, cy)) { ok = false; break; }
            if (at(cx, cy) === 2) hits += 1;
          }
          if (!ok) continue;
          /* Раненый корабль надо добить: такие положения в приоритете. */
          const weight = 1 + hits * 40 + (hits >= 2 ? 400 : 0);
          for (let i = 0; i < size; i++) {
            const cx = x + dx * i;
            const cy = y + dy * i;
            score[cy * N + cx] += weight;
          }
        }
      }
    }
  }

  let best = -1;
  let bestCell = null;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (at(x, y) !== 0 || nearSunk(x, y)) continue;
      const s = score[y * N + x];
      if (s > best) { best = s; bestCell = { x, y }; }
    }
  }
  if (bestCell) return bestCell;

  /* Все оценки нулевые (обычно в начале) — берём любую неизвестную клетку. */
  const free = [];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) if (at(x, y) === 0) free.push({ x, y });
  }
  return free.length ? free[Math.floor(Math.random() * free.length)] : null;
}
