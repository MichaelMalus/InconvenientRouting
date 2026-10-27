// Route planning: pick POIs between a start and end, either to fill a distance
// budget (as many notable stops as fit) or to visit a fixed number of stops as
// cheaply as possible. Distances are straight-line metres times a detour factor
// that approximates walking on real streets.
(function () {
  const DETOUR = 1.3;
  // Minimum metres between stops, so one block doesn't eat the route; grows with route length.
  const minGap = metres => Math.max(120, metres / 50);

  function dist(a, b) {
    const dy = (a[0] - b[0]) * 111320;
    const dx = (a[1] - b[1]) * 111320 * Math.cos((a[0] + b[0]) * Math.PI / 360);
    return Math.hypot(dx, dy) * DETOUR;
  }

  function length(route) {
    let s = 0;
    for (let i = 1; i < route.length; i++) s += dist(route[i - 1], route[i]);
    return s;
  }

  // Cheapest place to insert p into route; returns [extra metres, index].
  function bestInsert(route, p) {
    let best = Infinity, at = 1;
    for (let i = 1; i < route.length; i++) {
      const d = dist(route[i - 1], p) + dist(p, route[i]) - dist(route[i - 1], route[i]);
      if (d < best) { best = d; at = i; }
    }
    return [best, at];
  }

  // 2-opt over the interior stops; start and end stay fixed.
  function twoOpt(route) {
    let improved = true;
    while (improved) {
      improved = false;
      for (let i = 1; i < route.length - 2; i++) {
        for (let j = i + 1; j < route.length - 1; j++) {
          const before = dist(route[i - 1], route[i]) + dist(route[j], route[j + 1]);
          const after = dist(route[i - 1], route[j]) + dist(route[i], route[j + 1]);
          if (after < before - 1) {
            route.splice(i, j - i + 1, ...route.slice(i, j + 1).reverse());
            improved = true;
          }
        }
      }
    }
    return route;
  }

  // opts: { start, end, pois, mode: 'distance'|'stops', metres, stops, variety (0..1), seed }
  function plan(opts) {
    const { start, end, mode } = opts;
    let rnd = opts.seed || 1;
    const rand = () => (rnd = (rnd * 16807) % 2147483647) / 2147483647;
    const jitter = new Map(opts.pois.map(p => [p, 1 + opts.variety * 2 * rand()]));

    const direct = dist(start, end);
    const reach = mode === 'distance'
      ? opts.metres
      : direct + Math.max(3000, opts.stops * 600);
    let cands = opts.pois.filter(p => dist(start, p) + dist(p, end) <= reach);

    const gap = minGap(reach);
    const route = [start, end];
    const maxStops = mode === 'stops' ? opts.stops : 200;
    let len = direct;

    while (route.length - 2 < maxStops && cands.length) {
      let best = null, bestVal = -Infinity, bestAt = 0, bestCost = 0;
      for (const p of cands) {
        const [cost, at] = bestInsert(route, p);
        if (mode === 'distance' && len + cost > opts.metres) continue;
        const w = p[4] * jitter.get(p);
        // Distance mode: value per metre. Stops mode: cheapest stops, nudged by notability.
        const val = mode === 'distance' ? w / (cost + 60) : -cost / Math.sqrt(w);
        if (val > bestVal) { bestVal = val; best = p; bestAt = at; bestCost = cost; }
      }
      if (!best) break;
      route.splice(bestAt, 0, best);
      len += bestCost;
      cands = cands.filter(p => p !== best && dist(p, best) / DETOUR > gap);
      if (route.length % 8 === 0) { twoOpt(route); len = length(route); }
    }
    twoOpt(route);
    return route;
  }

  // Remove stops, least score per metre saved first, until about `metres` (estimated) is saved.
  function trim(route, metres) {
    route = route.slice();
    let saved = 0;
    while (saved < metres && route.length > 2) {
      let worst = 1, worstVal = Infinity, worstSave = 0;
      for (let i = 1; i < route.length - 1; i++) {
        const save = dist(route[i - 1], route[i]) + dist(route[i], route[i + 1]) - dist(route[i - 1], route[i + 1]);
        const val = route[i][4] / (save + 60);
        if (val < worstVal) { worstVal = val; worst = i; worstSave = save; }
      }
      route.splice(worst, 1);
      saved += worstSave;
    }
    return route;
  }

  window.Router = { plan, trim, dist, length, DETOUR };
})();
