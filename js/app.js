(function () {
  const CATS = {
    landmark: ['Landmarks & buildings', '#8e44ad', 'landmark', '🏛'],
    historic: ['Historic sites', '#a0522d', 'historic site', '🏰'],
    museum: ['Museums & galleries', '#2980b9', 'museum', '🖼'],
    culture: ['Theatres & culture', '#d35400', 'theatre & culture', '🎭'],
    park: ['Parks & gardens', '#27ae60', 'park', '🌳'],
    church: ['Places of worship', '#7f8c8d', 'place of worship', '⛪'],
    view: ['Viewpoints', '#16a085', 'viewpoint', '🔭'],
    pub: ['Pubs & bars', '#c0392b', 'pub', '🍺'],
  };
  const CAT_KEYS = Object.keys(CATS);
  const CENTRE = [51.5074, -0.1278], RADIUS = 43000;
  const WALK = 80; // metres per minute
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = m => `${(m / 1000).toFixed(1)} km (${(m / 1609).toFixed(1)} mi)`;
  const short = m => m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;
  const POI_INDEX = new Map(POIS.map((p, i) => [p, i]));

  // OpenStreetMap's own tiles: fine for a light-traffic site that shows attribution.
  // (CARTO's basemaps now need an API key and serve a placeholder without one.)
  const tiles = () => L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  });
  const map = L.map('map').setView(CENTRE, 12);
  tiles().addTo(map);
  L.circle(CENTRE, { radius: RADIUS, color: '#999', weight: 1, fill: false, dashArray: '4 6', interactive: false }).addTo(map);

  // ---- Tabs
  function showTab(id) {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === id));
    document.querySelectorAll('.pane').forEach(p => { p.hidden = p.id !== id; });
  }
  document.querySelectorAll('.tab').forEach(t => t.onclick = () => showTab(t.dataset.tab));

  // ---- Category checkboxes
  for (const [k, [label, colour]] of Object.entries(CATS)) {
    const n = POIS.filter(p => p[3] === k).length;
    $('cats').insertAdjacentHTML('beforeend',
      `<label><input type="checkbox" value="${k}" ${k === 'pub' ? '' : 'checked'}><span class="dot" style="background:${colour}"></span>${label} <span class="muted small">${n}</span></label>`);
  }
  const catBoxes = () => [...document.querySelectorAll('#cats input')];
  const setCats = f => catBoxes().forEach(c => { c.checked = f(c.value); });
  $('pubOnly').onclick = () => { setCats(k => k === 'pub'); setPlanBy('stops', settings.stops); };
  $('allCats').onclick = () => setCats(() => true);

  // ---- Plan-by setting
  const settings = { mode: 'distance', km: 6, stops: 8 };
  let kmTouched = false; // once the user picks a distance, stop suggesting one
  function setPlanBy(mode, value) {
    settings.mode = mode;
    if (value != null) { if (mode === 'distance') settings.km = value; else settings.stops = value; }
    document.querySelector(`input[name=mode][value=${mode}]`).checked = true;
    const d = mode === 'distance';
    $('amount').step = d ? 0.5 : 1;
    $('amount').value = d ? settings.km : settings.stops;
    $('unit').textContent = d ? 'km' : 'stops';
    renderAlt();
  }
  function renderAlt() {
    const v = +$('amount').value;
    $('alt').textContent = settings.mode === 'distance' ? `≈ ${(v / 1.609).toFixed(1)} mi · ${Math.round(v * 1000 / WALK)} min walking` : '';
  }
  document.querySelectorAll('input[name=mode]').forEach(r => r.onchange = () => setPlanBy(r.value));
  $('amount').oninput = () => {
    const v = Math.min(60, Math.max(1, +$('amount').value || 1));
    if (settings.mode === 'distance') { settings.km = v; kmTouched = true; } else settings.stops = Math.round(v);
    renderAlt();
  };
  setPlanBy('distance', 6);

  // ---- Start / end markers
  let start = null, end = null;
  const endIcon = t => L.divIcon({ className: '', html: `<div class="pin end">${t}</div>`, iconSize: [28, 28], iconAnchor: [14, 14] });
  function pin(ll, t) {
    const m = L.marker(ll, { draggable: true, icon: endIcon(t), zIndexOffset: 1000 }).bindTooltip(t === 'S' ? 'Start' : 'End').addTo(map);
    m.on('drag', () => { $(t === 'S' ? 'startQ' : 'endQ').value = 'Dropped pin'; showPts(); });
    m.on('dragend', () => { if (route) plan(); });
    return m;
  }
  function showPts() {
    $('pts').textContent = !start ? '…or click the map.'
      : !end ? '…or click the map for the end.' : 'Drag either pin to move it.';
    const crow = start && end ? Router.dist(ll(start), ll(end)) / Router.DETOUR : 0;
    $('crow').hidden = !crow;
    if (crow) $('crow').textContent = `${fmt(crow)} apart as the crow flies`;
    // Suggest a walk half as long again as the straight line, until the user picks their own.
    if (crow && !kmTouched) {
      settings.km = Math.max(1, Math.round(crow * 1.5 / 500) / 2);
      if (settings.mode === 'distance') setPlanBy('distance');
    }
  }
  const ll = m => { const p = m.getLatLng(); return [p.lat, p.lng]; };
  map.on('click', e => {
    if (!start || !end) placePoint(start ? 'E' : 'S', [e.latlng.lat, e.latlng.lng], 'Dropped pin');
  });
  // Set or move the start ('S') or end ('E'), from a map click or a search result.
  function placePoint(which, p, label) {
    if (map.distance(p, CENTRE) > RADIUS) return alert('Outside the covered area (M25 + 10 miles).');
    if (which === 'S') { if (start) start.setLatLng(p); else start = pin(p, 'S'); }
    else { if (end) end.setLatLng(p); else end = pin(p, 'E'); }
    $(which === 'S' ? 'startQ' : 'endQ').value = label;
    showPts();
    if (route) plan();
  }

  // ---- Search: our own places by name, plus UK postcodes (full or district) via postcodes.io
  const NAMES = POIS.map(p => p[2].toLowerCase());
  const POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i, OUTCODE = /^[A-Z]{1,2}\d[A-Z\d]?$/i;
  async function postcode(q) {
    const full = POSTCODE.test(q);
    if (!full && !OUTCODE.test(q)) return null;
    try {
      const j = await (await fetch(`https://api.postcodes.io/${full ? 'postcodes' : 'outcodes'}/${encodeURIComponent(q)}`)).json();
      const r = j.result;
      return r && { label: (r.postcode || r.outcode).toUpperCase(), sub: [].concat(r.admin_district || [])[0] || 'postcode', ll: [r.latitude, r.longitude] };
    } catch { return null; }
  }
  function setupSearch(input, which) {
    const ul = input.nextElementSibling;
    let timer, seq = 0, results = [];
    const close = () => { ul.innerHTML = ''; results = []; };
    const choose = r => { close(); placePoint(which, r.ll, r.label); map.setView(r.ll, Math.max(map.getZoom(), 14)); };
    input.oninput = () => { clearTimeout(timer); timer = setTimeout(search, 200); };
    input.onblur = () => setTimeout(close, 150);
    input.onkeydown = e => {
      if (e.key === 'Enter' && results.length) choose(results[0]);
      if (e.key === 'Escape') close();
    };
    async function search() {
      const q = input.value.trim(), lq = q.toLowerCase(), me = ++seq;
      if (q.length < 2) return close();
      const hits = [];
      for (let i = 0; i < NAMES.length && hits.length < 300; i++) if (NAMES[i].includes(lq)) hits.push(i);
      hits.sort((a, b) => (NAMES[b].startsWith(lq) - NAMES[a].startsWith(lq)) || POIS[b][4] - POIS[a][4]);
      const pc = await postcode(q);
      if (me !== seq) return;
      results = [...(pc ? [pc] : []),
        ...hits.slice(0, 8).map(i => ({ label: POIS[i][2], sub: CATS[POIS[i][3]][2], ll: [POIS[i][0], POIS[i][1]] }))];
      ul.innerHTML = results.length ? '' : '<li class="muted">No matches</li>';
      results.forEach(r => {
        const li = document.createElement('li');
        li.innerHTML = `${esc(r.label)} <span class="muted small">${esc(r.sub)}</span>`;
        li.onmousedown = () => choose(r);
        ul.appendChild(li);
      });
    }
  }
  setupSearch($('startQ'), 'S');
  setupSearch($('endQ'), 'E');
  $('clear').onclick = () => {
    [start, end].forEach(m => m && m.remove());
    start = end = route = null;
    $('startQ').value = $('endQ').value = '';
    layer.clearLayers();
    $('summary').textContent = '';
    $('shareRow').hidden = true;
    $('list').innerHTML = '';
    $('itinBtn').disabled = true;
    showView('mapView');
    $('routeTabBtn').disabled = true;
    history.replaceState(null, '', location.pathname);
    showPts();
  };

  // ---- Planning
  const layer = L.layerGroup().addTo(map);
  let seed = 1, runId = 0, route = null, routeLine = null;
  $('go').onclick = () => { seed = 1; plan(); };
  $('shuffle').onclick = () => { seed = 1 + Math.floor(Math.random() * 1e9); plan(); };

  async function plan() {
    if (!start) return alert('Click the map to set a start point first.');
    const id = ++runId;
    const cats = new Set(catBoxes().filter(c => c.checked).map(c => c.value));
    const target = settings.km * 1000;
    const opts = { start: ll(start), end: ll(end || start), pois: POIS.filter(p => cats.has(p[3])), mode: settings.mode,
      metres: target, stops: settings.stops, variety: +$('variety').value, seed };
    $('summary').textContent = 'Planning…';

    let directPath = null;
    if ($('snap').checked && end) {
      directPath = await footpath([opts.start, opts.end]).catch(() => null);
      if (id !== runId) return;
      // Calibrate the crow-flies estimate against how winding the real streets are here.
      if (directPath) opts.metres *= Router.dist(opts.start, opts.end) / directPath.metres;
    }
    let r = Router.plan(opts), path = null;
    if ($('snap').checked) {
      // Real paths run longer than estimated, especially between many close stops:
      // drop the least worthwhile stops until the real walk fits.
      for (let i = 0; i < 5; i++) {
        path = await footpath(r).catch(() => null);
        if (id !== runId) return;
        if (!path || settings.mode !== 'distance' || path.metres <= target * 1.08) break;
        // Convert the real excess into estimate units using how the detours (not the
        // direct line) compare, since short hops between stops are what we underestimate.
        const directEst = Router.dist(opts.start, opts.end), directReal = directPath ? directPath.metres : directEst;
        const ratio = (Router.length(r) - directEst) / Math.max(1, path.metres - directReal);
        r = Router.trim(r, (path.metres - target) * ratio);
      }
    }
    await finish(id, r, path, directPath);
  }

  // Route is fixed; work out the comparison distance and draw it.
  async function finish(id, r, path, directPath) {
    // What the sensible person would have walked. Zero for a loop.
    let direct = end ? Router.dist(r[0], r[r.length - 1]) : 0, directReal = false;
    if (directPath) { direct = directPath.metres; directReal = true; }
    else if ($('snap').checked && end) {
      const d = await footpath([r[0], r[r.length - 1]]).catch(() => null);
      if (id !== runId) return;
      if (d) { direct = d.metres; directReal = true; }
    }
    route = r;
    routeLine = path ? path.coords : r.map(p => [p[0], p[1]]);
    draw(r, path, direct, directReal);
    saveToUrl();
  }

  // The FOSSGIS router is a free shared service: remember answers so replans, shuffles
  // and reopened share links don't ask twice. Kept in localStorage, newest ~150 only.
  const CACHE_KEY = 'ir-osrm';
  let osrmCache = new Map();
  try { osrmCache = new Map(JSON.parse(localStorage.getItem(CACHE_KEY)) || []); } catch {}
  async function osrm(q) {
    if (osrmCache.has(q)) return osrmCache.get(q);
    const res = await fetch(`https://routing.openstreetmap.de/routed-foot/route/v1/foot/${q}?overview=full&geometries=geojson`);
    const j = await res.json();
    if (j.code !== 'Ok') throw new Error(j.code);
    osrmCache.set(q, j);
    while (osrmCache.size > 150) osrmCache.delete(osrmCache.keys().next().value);
    try { localStorage.setItem(CACHE_KEY, JSON.stringify([...osrmCache])); } catch {}
    return j;
  }

  // OSRM foot routing, chunked to stay under the server's waypoint limit.
  // Returns the full line plus one { coords, metres } per leg between consecutive points.
  async function footpath(r) {
    const coords = [], legs = [], CH = 50;
    let metres = 0;
    for (let i = 0; i < r.length - 1; i += CH - 1) {
      const part = r.slice(i, i + CH);
      const q = part.map(p => `${p[1].toFixed(5)},${p[0].toFixed(5)}`).join(';');
      const j = await osrm(q);
      const line = j.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
      metres += j.routes[0].distance;
      coords.push(...line);
      // Split the line at the point nearest each snapped waypoint, walking forwards.
      let from = 0;
      j.routes[0].legs.forEach((leg, k) => {
        const w = j.waypoints[k + 1].location, target = [w[1], w[0]];
        let best = from, bd = Infinity;
        for (let n = from; n < line.length; n++) {
          const d = (line[n][0] - target[0]) ** 2 + (line[n][1] - target[1]) ** 2;
          if (d < bd) { bd = d; best = n; }
          if (d === 0) break;
        }
        legs.push({ coords: line.slice(from, best + 1), metres: leg.distance });
        from = best;
      });
    }
    return { coords, metres, legs };
  }

  const stopIcon = (n, cat) => L.divIcon({ className: '',
    html: `<div class="pin" style="background:${CATS[cat][1]}">${n}</div>`, iconSize: [24, 24], iconAnchor: [12, 12] });
  let legLayer = null;

  function draw(r, path, direct, directReal) {
    layer.clearLayers();
    const line = r.map(p => [p[0], p[1]]);
    const legs = path ? path.legs
      : line.slice(1).map((p, i) => ({ coords: [line[i], p], metres: Router.dist(line[i], p) }));
    const metres = path ? path.metres : Router.length(r);
    L.polyline(path ? path.coords : line, { color: '#c0392b', weight: 4, opacity: 0.8, dashArray: path ? null : '6 6' }).addTo(layer);
    legLayer = L.polyline([], { color: '#f1c40f', weight: 8, opacity: 0.9 }).addTo(layer);

    const stops = r.slice(1, -1);
    const markers = stops.map((p, i) => L.marker([p[0], p[1]], { icon: stopIcon(i + 1, p[3]) })
      .bindTooltip(`${i + 1}. ${esc(p[2])}`).addTo(layer));

    const target = settings.km * 1000;
    $('summary').innerHTML = `${stops.length} stops · ${fmt(metres)}${path ? '' : ' estimated'}`
      + (settings.mode === 'distance' && metres > target * 1.15 ? ' — longer than asked; the direct route alone is that far' : '')
      + `<div class="muted small">${direct
        ? `Direct route: ${fmt(direct)}${directReal ? '' : ' estimated'} · ${(metres / direct).toFixed(1)}× as far`
        : 'Loop: the direct route is staying put'}</div>`
      + `<button id="seeStops" class="link">See the stops →</button>`;
    $('seeStops').onclick = () => showTab('routeTab');
    $('shareRow').hidden = false;
    $('shareMsg').textContent = '';
    $('routeTabBtn').disabled = false;
    $('routeTabBtn').textContent = `Stops (${stops.length})`;
    $('list').innerHTML = '';
    stops.forEach((p, i) => {
      const li = document.createElement('li');
      li.innerHTML = `${esc(p[2])} <span>${CATS[p[3]][2]}</span>`;
      li.onclick = () => { map.setView([p[0], p[1]], 17); markers[i].openTooltip(); };
      $('list').appendChild(li);
    });
    renderStops(r, legs, markers, metres);
    renderItinerary(r, legs, metres, direct);
    $('itinBtn').disabled = false;
    map.fitBounds(L.latLngBounds(line).pad(0.1));
  }

  function renderStops(r, legs, markers, metres) {
    $('routeHead').textContent = `${fmt(metres)} · about ${Math.round(metres / WALK / 60 * 10) / 10} hours walking, not counting stops`;
    const ol = $('stops');
    ol.innerHTML = '';
    const legLi = (leg, i) => {
      const li = document.createElement('li');
      li.className = 'leg';
      li.textContent = `${short(leg.metres)} · ${Math.max(1, Math.round(leg.metres / WALK))} min`;
      li.title = 'Show this section on the map';
      li.onclick = () => {
        document.querySelectorAll('.leg.on').forEach(x => x.classList.remove('on'));
        li.classList.add('on');
        legLayer.setLatLngs(leg.coords);
        map.fitBounds(L.latLngBounds(leg.coords).pad(0.3), { maxZoom: 17 });
      };
      return li;
    };
    const terminal = (t, label) => {
      const li = document.createElement('li');
      li.className = 'stop terminal';
      li.innerHTML = `<div class="pin end">${t}</div><div><b>${label}</b></div>`;
      return li;
    };
    ol.appendChild(terminal('S', 'Start'));
    r.slice(1, -1).forEach((p, i) => {
      ol.appendChild(legLi(legs[i], i));
      const [, , name, cat, , wiki] = p;
      const li = document.createElement('li');
      li.className = 'stop';
      li.innerHTML = `<div class="pin" style="background:${CATS[cat][1]}">${i + 1}</div>
        <div class="thumb none">${CATS[cat][3]}</div>
        <div><b>${esc(name)}</b><span class="muted small">${CATS[cat][2]}</span><p></p></div>`;
      li.onclick = e => {
        if (e.target.tagName === 'A') return;
        map.setView([p[0], p[1]], 17);
        markers[i].openTooltip();
      };
      ol.appendChild(li);
      fillWiki(li, wiki);
    });
    ol.appendChild(legLi(legs[legs.length - 1], legs.length - 1));
    ol.appendChild(terminal(end ? 'E' : 'S', end ? 'End' : 'Back to the start'));
  }

  function fillWiki(el, wiki) {
    Wiki.info(wiki).then(w => {
      if (!w) return;
      if (w.thumb) el.querySelector('.thumb').outerHTML = `<img class="thumb" loading="lazy" alt="" src="${esc(w.thumb)}">`;
      if (w.text) el.querySelector('p').innerHTML = `${esc(w.text)} <a href="${esc(w.url)}" target="_blank" rel="noopener">More</a>`;
    });
  }

  // ---- Outer views: the planning map, or a full-page itinerary
  function showView(id) {
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.dataset.view === id));
    document.querySelectorAll('.viewpane').forEach(p => { p.hidden = p.id !== id; });
    if (id === 'mapView') map.invalidateSize();
  }
  document.querySelectorAll('.view').forEach(v => v.onclick = () => showView(v.dataset.view));

  // Each leg gets a small static map, built only when scrolled near (Leaflet needs a visible box).
  let legMaps = [], io = null;
  const pinHtml = (label, cat) => cat
    ? `<div class="pin" style="background:${CATS[cat][1]}">${label}</div>` : `<div class="pin end">${label}</div>`;

  function renderItinerary(r, legs, metres, direct) {
    legMaps.forEach(m => m.remove());
    legMaps = [];
    if (io) io.disconnect();
    io = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) { io.unobserve(e.target); e.target.make(); }
    }), { root: $('itinView'), rootMargin: '400px' });

    const el = $('itin'), stops = r.slice(1, -1);
    const add = html => { el.insertAdjacentHTML('beforeend', html); return el.lastElementChild; };
    const label = i => i === 0 ? 'S' : i === r.length - 1 ? (end ? 'E' : 'S') : String(i);
    el.innerHTML = `<h2>${stops.length} stops · ${fmt(metres)}</h2>
      <p class="muted">About ${Math.round(metres / WALK / 60 * 10) / 10} hours walking, not counting stops${direct ? ` · the direct route is ${fmt(direct)}` : ''}.
      Maps © OpenStreetMap contributors.</p>`;
    add(`<div class="istop terminal">${pinHtml('S')}<h3>Start</h3></div>`);
    legs.forEach((leg, i) => {
      const a = r[i], b = r[i + 1];
      const box = add(`<div class="ileg"><p class="legtext">${short(leg.metres)} · ${Math.max(1, Math.round(leg.metres / WALK))} min walk</p><div class="legmap"></div></div>`)
        .querySelector('.legmap');
      box.make = () => {
        const m = L.map(box, { zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false,
          doubleClickZoom: false, boxZoom: false, keyboard: false, touchZoom: false });
        tiles().addTo(m);
        L.polyline(leg.coords, { color: '#c0392b', weight: 5, opacity: 0.85 }).addTo(m);
        [[a, i], [b, i + 1]].forEach(([p, n]) => L.marker([p[0], p[1]], {
          icon: L.divIcon({ className: '', html: pinHtml(label(n), p[3]), iconSize: [24, 24], iconAnchor: [12, 12] }) }).addTo(m));
        m.fitBounds(L.latLngBounds([...leg.coords, [a[0], a[1]], [b[0], b[1]]]).pad(0.15), { maxZoom: 17 });
        legMaps.push(m);
      };
      io.observe(box);
      if (i < stops.length) {
        const [, , name, cat, , wiki] = b;
        const div = add(`<div class="istop">${pinHtml(i + 1, cat)}<div class="thumb none">${CATS[cat][3]}</div>
          <div><h3>${esc(name)}</h3><span class="muted small">${CATS[cat][2]}</span><p></p></div></div>`);
        fillWiki(div, wiki);
      }
    });
    add(`<div class="istop terminal">${pinHtml(end ? 'E' : 'S')}<h3>${end ? 'End' : 'Back to the start'}</h3></div>`);
  }

  // ---- Share links: everything needed to redraw the same route lives in the query string.
  // r= holds the chosen stops as indices into POIS; n= guards against a rebuilt data file.
  function saveToUrl() {
    const q = new URLSearchParams();
    const c = p => p.map(x => x.toFixed(5)).join(',');
    q.set('s', c(ll(start)));
    if (end) q.set('e', c(ll(end)));
    q.set('by', settings.mode === 'distance' ? `${settings.km}km` : `${settings.stops}stops`);
    q.set('c', catBoxes().filter(x => x.checked).map(x => CAT_KEYS.indexOf(x.value)).join(''));
    q.set('v', $('variety').value);
    if (!$('snap').checked) q.set('f', '0');
    q.set('r', route.slice(1, -1).map(p => POI_INDEX.get(p)).join('.'));
    q.set('n', POIS.length);
    history.replaceState(null, '', '?' + q);
  }
  $('share').onclick = async () => {
    try { await navigator.clipboard.writeText(location.href); $('shareMsg').textContent = 'Copied'; }
    catch { prompt('Copy this link', location.href); }
  };

  // ---- Exports
  // Google Maps takes the points in the URL path; it copes with about 25, so long routes are cut short.
  const GMAPS_MAX = 25;
  $('gmaps').onclick = () => {
    const pts = route.length > GMAPS_MAX ? [...route.slice(0, GMAPS_MAX - 1), route[route.length - 1]] : route;
    window.open('https://www.google.com/maps/dir/' + pts.map(p => `${p[0].toFixed(5)},${p[1].toFixed(5)}`).join('/')
      + '/data=!4m2!4m1!3e2', '_blank', 'noopener');
    $('shareMsg').textContent = route.length > GMAPS_MAX ? `Google Maps shows the first ${GMAPS_MAX - 2} stops only` : '';
  };
  $('gpx').onclick = () => {
    const x = s => esc(s).replace(/'/g, '&apos;');
    const pt = (tag, p, inner = '') => `<${tag} lat="${p[0].toFixed(6)}" lon="${p[1].toFixed(6)}">${inner}</${tag}>`;
    const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Inconvenient Routing" xmlns="http://www.topografix.com/GPX/1/1">
<metadata><name>Inconvenient route</name><link href="${x(location.href)}"/></metadata>
${route.slice(1, -1).map((p, i) => pt('wpt', p, `<name>${i + 1}. ${x(p[2])}</name><type>${CATS[p[3]][2]}</type>`)).join('\n')}
<trk><name>Inconvenient route</name><trkseg>
${routeLine.map(p => pt('trkpt', p)).join('\n')}
</trkseg></trk>
</gpx>`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([gpx], { type: 'application/gpx+xml' }));
    a.download = 'inconvenient-route.gpx';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  function loadFromUrl() {
    const q = new URLSearchParams(location.search);
    const pt = k => q.get(k) && q.get(k).split(',').map(Number);
    if (!pt('s')) return;
    start = pin(pt('s'), 'S');
    $('startQ').value = 'Shared start';
    if (pt('e')) { end = pin(pt('e'), 'E'); $('endQ').value = 'Shared end'; }
    const by = (q.get('by') || '').match(/^([\d.]+)(km|stops)$/);
    if (by) { setPlanBy(by[2] === 'km' ? 'distance' : 'stops', +by[1]); kmTouched = by[2] === 'km'; }
    if (q.has('c')) setCats(k => q.get('c').includes(CAT_KEYS.indexOf(k)));
    if (q.has('v')) $('variety').value = q.get('v');
    $('snap').checked = q.get('f') !== '0';
    showPts();
    const idx = (q.get('r') || '').split('.').filter(Boolean).map(Number);
    if (+q.get('n') === POIS.length && idx.every(i => POIS[i])) {
      const r = [ll(start), ...idx.map(i => POIS[i]), ll(end || start)];
      const id = ++runId;
      $('summary').textContent = 'Loading shared route…';
      ($('snap').checked ? footpath(r).catch(() => null) : Promise.resolve(null)).then(path => finish(id, r, path));
    } else {
      plan(); // data has changed since the link was made; plan afresh with the same settings
    }
  }

  showPts();
  loadFromUrl();
})();
