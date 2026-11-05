const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadApp({endpoint, response, width = 1200, height = 800, storage = new Map(), url = 'http://localhost:2400/', withMap = false} = {}) {
  const elements = new Map();
  let document;
  function element(tagName = 'div') {
    const classes = new Set(), attributes = {}, handlers = {};
    let html = '', id = '';
    return {
      tagName: tagName.toUpperCase(), dataset: {}, style: {}, children: [], textContent: '', handlers,
      get id() { return id; }, set id(value) { id = value; elements.set(value, this); },
      get className() { return [...classes].join(' '); },
      set className(value) { classes.clear(); value.split(/\s+/).filter(Boolean).forEach(item => classes.add(item)); },
      get innerHTML() { return html; }, set innerHTML(value) { html = value; this.children = []; },
      classList: {
        add: value => classes.add(value), remove: value => classes.delete(value),
        contains: value => classes.has(value),
        toggle(value, enabled) {
          if (enabled ?? !classes.has(value)) classes.add(value);
          else classes.delete(value);
        },
      },
      addEventListener(type, handler) { (handlers[type] ??= []).push(handler); },
      setAttribute(name, value) { attributes[name] = String(value); },
      getAttribute(name) { return attributes[name] ?? null; },
      removeAttribute(name) { delete attributes[name]; },
      appendChild(child) { child.parentElement = this; this.children.push(child); },
      insertAdjacentHTML(position, value) { html += value; },
      closest(selector) {
        for (let node = this; node; node = node.parentElement) {
          if (selector === '#clist' && node.id === 'clist') return node;
          if (selector === '#clist .row' && node.classList.contains('row') && node.parentElement?.id === 'clist') return node;
        }
        return null;
      },
      focus() { if (document.activeElement === this) return; document.activeElement = this; this.onfocus?.({target: this}); },
      scrollIntoView() {},
      click() { if (!this.disabled) this.onclick?.({target: this}); },
      getBoundingClientRect: () => ({right: 900, bottom: 80}),
    };
  }
  const getElement = id => {
    if (!elements.has(id)) { const node = element(); node.id = id; }
    return elements.get(id);
  };
  const choices = (key, values) => values.map(value => {
    const button = element('button'); button.dataset[key] = value; return button;
  });
  const sizes = choices('size', ['small', 'medium', 'large']);
  const verdicts = choices('vf', ['all', 'go', 'conditional']);
  const layers = choices('v', ['streets', 'hybrid']);
  const resetMap = element('button'); resetMap.dataset.reset = '1';
  const selectors = {
    '.rfilt button[data-size]': sizes, '.rfilt button[data-vf]': verdicts,
    '#layers button[data-v]': layers,
  };
  document = {
    activeElement: null, handlers: {}, body: element('body'),
    getElementById: getElement,
    querySelector: selector => selector === '#layers button[data-reset]' ? resetMap : getElement(selector),
    querySelectorAll: selector => selector === '#clist .row' ? getElement('clist').children : selectors[selector] ?? [],
    createElement: element,
    addEventListener(type, handler) { (this.handlers[type] ??= []).push(handler); },
  };
  const coordinate = value => Array.isArray(value) ? {lat: value[0], lng: value[1]} : value;
  const bounds = (first, second) => {
    const [a, b] = second ? [coordinate(first), coordinate(second)] : first.map(coordinate);
    const south = Math.min(a.lat, b.lat), north = Math.max(a.lat, b.lat);
    const west = Math.min(a.lng, b.lng), east = Math.max(a.lng, b.lng);
    return {
      getSouth: () => south, getNorth: () => north, getWest: () => west, getEast: () => east,
      contains(value) { const point = coordinate(value); return point.lat >= south && point.lat <= north && point.lng >= west && point.lng <= east; },
    };
  };
  const layer = (...args) => ({args, addTo() { return this; }, on() { return this; }, setBounds(value) { this.bounds = value; }, setStyle() {}, setRadius() {}});
  const testMap = {
    removed: [], viewport: {center: [42.39, -71.101], zoom: 16},
    dragging: {enabled: true, enable() { this.enabled = true; }, disable() { this.enabled = false; }},
    removeLayer(value) { this.removed.push(value); }, getContainer: () => getElement('map'),
    getCenter() { return {lat: this.viewport.center[0], lng: this.viewport.center[1]}; },
    getZoom() { return this.viewport.zoom; },
    setView(center, zoom) { this.viewport = {center, zoom}; },
    flyTo(center, zoom) { this.setView(center, zoom); },
    flyToBounds() {}, invalidateSize() {},
  };
  let currentUrl = new URL(url);
  const location = {
    get href() { return currentUrl.href; }, set href(value) { currentUrl = new URL(value, currentUrl); },
    get search() { return currentUrl.search; }, get pathname() { return currentUrl.pathname; }, get hash() { return currentUrl.hash; },
  };
  const requests = [];
  const context = vm.createContext({
    console, URL, URLSearchParams, TextDecoder, AbortSignal, document, location, testMap,
    history: {replaceState(state, title, href) { location.href = href; }},
    sessionStorage: {getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key)},
    L: {latLngBounds: bounds, rectangle: layer, polyline: layer, circleMarker: layer, layerGroup: layer},
    SONDER_SURVEY_ENDPOINT: endpoint,
    fetch: async (requestUrl, options) => {
      requests.push(requestUrl);
      if (response) return response(requestUrl, options);
      throw new Error('Network disabled in tests');
    },
    setTimeout() {}, clearTimeout() {}, addEventListener() {}, innerWidth: width, innerHeight: height,
  });
  context.window = context;
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'data.js'), 'utf8'), context);
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const script = html.slice(html.indexOf('<script>\nconst M=') + '<script>\n'.length, html.lastIndexOf('</script>'));
  vm.runInContext(script.replace(/\ninit\(\);\s*$/, '\n'), context);
  vm.runInContext('applyModel()', context);
  if (withMap) vm.runInContext('map=testMap', context);
  function key(target, value) {
    const event = {target, key: value, preventDefault() { this.defaultPrevented = true; }};
    document.handlers.keydown.forEach(handler => handler(event));
    return event;
  }
  return {context, requests, storage, location, document, key, map: testMap, choices: {sizes, verdicts, layers}, element: getElement, run: code => vm.runInContext(code, context)};
}

test('GO counts use the same threshold as the verdict filter and respect hard gates', () => {
  const app = loadApp();
  assert.equal(app.run('activeSites().length'), 113);
  assert.equal(app.run("activeSites().filter(s=>verdictKey(s)==='go').length"), 12);
  assert.equal(app.run("verdictFilter='go'; activeSites().length"), 12);
  assert.equal(app.run("screenVerdict({score:100,gate:'Pavement failed'})"), 'no_go');
  assert.equal(app.run('screenVerdict({score:74.9})'), 'conditional');
  assert.equal(app.run('screenVerdict({score:75})'), 'go');
});

test('an empty frontage filter clears the selected report and both map selection layers', () => {
  const app = loadApp();
  app.element('report').classList.add('open');
  app.run("buildPins=()=>{};buildFaint=()=>{};map={removed:[],removeLayer(layer){this.removed.push(layer)}};sel=S[0].id;selRing='ring';footprint='segment';stationSize='large';rerender()");
  assert.equal(app.run('activeSites().length'), 0);
  assert.equal(app.run('sel'), null);
  assert.equal(app.run('selRing'), null);
  assert.equal(app.run('footprint'), null);
  assert.equal(app.run('map.removed.join(",")'), 'ring,segment');
  assert.equal(app.element('report').classList.contains('open'), false);
  assert.match(app.element('clist').innerHTML, /84 ft of mapped segment length/);
});

test('filtered-out selection also clears when other matching sites remain', () => {
  const app = loadApp();
  app.run("buildPins=()=>{};buildFaint=()=>{};sel=S[0].id;query='summer';rerender()");
  assert.ok(app.run('activeSites().length') > 0);
  assert.equal(app.run('sel'), null);
});

test('default demo does not call a survey service and explicit endpoints require real health', async () => {
  const app = loadApp();
  assert.equal(app.run('SWARM'), null);
  await app.run('dispatchSurvey()');
  assert.equal(await app.run('checkSurveyBackend()'), false);
  assert.equal(app.requests.length, 0);
  assert.equal(app.run('configuredSurveyEndpoint("http://localhost:8000/")'), 'http://localhost:8000');
  assert.equal(app.run('configuredSurveyEndpoint("https://example.com/api/")'), 'https://example.com/api');
  assert.equal(app.run('configuredSurveyEndpoint("http://example.com")'), null);
  assert.equal(app.run('configuredSurveyEndpoint("https://user:password@example.com")'), null);
  assert.equal(app.run('surveyAvailable'), false);
});

test('a configured mock backend stays disabled and a healthy real backend can be enabled', async () => {
  for (const mode of ['mock', 'real']) {
    const app = loadApp({
      endpoint: 'http://localhost:8000',
      response: async () => ({ok: true, json: async () => ({mode})}),
    });
    assert.equal(await app.run('checkSurveyBackend()'), mode === 'real');
    assert.equal(app.run('surveyAvailable'), mode === 'real');
    assert.ok(app.requests.every(url => url === 'http://localhost:8000/health'));
  }
});

test('a successful review respects selected sites and preserves conditional results without inventing a winner', async () => {
  let payload;
  const app = loadApp({
    endpoint: 'http://localhost:8000',
    response: async (url, options) => {
      if (url.endsWith('/health')) return {ok: true, json: async () => ({mode: 'real'})};
      payload = JSON.parse(options.body);
      const site = payload.finalists[0];
      const verdict = {site_id: site.site_id, verdict: 'conditional', source: 'swarm.breadth', one_line_reason: 'Inspect the curb'};
      const bytes = new TextEncoder().encode(`event: verdict\ndata: ${JSON.stringify(verdict)}\n\nevent: done\ndata: {"count":1}\n\n`);
      let sent = false;
      return {ok: true, body: {getReader: () => ({read: async () => {
        if (sent) return {done: true};
        sent = true;
        return {done: false, value: bytes};
      }})}};
    },
  });
  await app.run('checkSurveyBackend()');
  app.run("stationSize='medium';ready=true;buildPins=()=>{};buildFaint=()=>{};fxResolve=()=>{}");
  const selectedId = app.run('activeSites()[0].id');
  await app.run('dispatchSurvey()');
  assert.deepEqual(payload.finalists.map(site => site.site_id), [selectedId]);
  assert.equal(app.run('Object.keys(LIVE).length'), 1);
  assert.equal(app.run('Object.values(LIVE)[0].verdict'), 'conditional');
  assert.equal(app.run('liveWinner'), null);
  assert.equal(app.run('surveying'), false);
  assert.equal(app.element('dLabel').textContent, 'Review complete');
});

test('survey results cannot inject an unselected site or pass off mock/error results as real', () => {
  const app = loadApp();
  app.run("allowed=new Set(['IA02251']);result={site_id:'IA02251',verdict:'conditional',source:'swarm.breadth',one_line_reason:'Needs a site visit'}");
  assert.equal(app.run('isRealVerdict(result,allowed)'), true);
  assert.equal(app.run("isRealVerdict({...result,site_id:'IA17248'},allowed)"), false);
  assert.equal(app.run("isRealVerdict({...result,source:'swarm.breadth.mock'},allowed)"), false);
  assert.equal(app.run("isRealVerdict({...result,error:'timeout'},allowed)"), false);
  assert.equal(app.run('typeof forceSchoolWinner'), 'undefined');
});

test('sidebar and printable report disclose proxies instead of generated economics or compliance', () => {
  const app = loadApp();
  app.run('reportSkeleton(S[0])');
  const sidebar = app.element('rbody').innerHTML;
  const report = app.run('reportDocHtml(S[0])');
  for (const content of [sidebar, report]) {
    assert.doesNotMatch(content, /\$\d|\d+ mo\b|ADA ramp.*Pass|Usable frontage|Surface · PCI|Brickbottom/);
    assert.match(content, /[Ss]egment length/);
    assert.match(content, /[Nn]ot (?:a confirmed electrical connection|measured usable curb space)/);
  }
  assert.doesNotMatch(sidebar, /Agent surveying|Stage 2 · AI Survey/);
  assert.match(report, /Somerville, MA/);
});

test('report text escapes supplied names and the scan evidence starts collapsed', () => {
  const app = loadApp();
  assert.match(app.run("reportDocHtml({...S[0],addr:'<script>alert(1)</script>'})"), /&lt;script&gt;/);
  app.run("SAM={[S[0].id]:{n:29,overlay:'scan.jpg',obstructions:[]}};insertSam(S[0])");
  assert.match(app.element('rbody').innerHTML, /<details class="evidence"><summary>View scan evidence · 29 detections/);
  assert.doesNotMatch(app.element('rbody').innerHTML, /<details[^>]*\bopen/);
});

test('two-corner selection preserves the prior area on Escape or a tiny redraw', () => {
  const app = loadApp({withMap: true});
  app.run('setRegion(L.latLngBounds([[42.38,-71.11],[42.395,-71.098]]))');
  const oldRegion = app.run('region'), oldOutline = app.run('regionBox');
  app.element('drawBtn').click();
  app.run('onMapClick({latlng:{lat:42.39,lng:-71.105}})');
  assert.ok(app.run('draftRegionBox'));
  app.key(app.element('drawBtn'), 'Escape');
  assert.equal(app.run('armed'), false);
  assert.equal(app.run('draftRegionBox'), null);
  assert.equal(app.run('region'), oldRegion);
  assert.equal(app.run('regionBox'), oldOutline);
  assert.equal(app.map.dragging.enabled, true);
  assert.equal(app.element('map').style.cursor, '');
  app.run('startDrawing();onMapClick({latlng:{lat:42.39,lng:-71.105}});onMapClick({latlng:{lat:42.39,lng:-71.105}})');
  assert.equal(app.run('region'), oldRegion);
  assert.equal(app.run('regionBox'), oldOutline);
  assert.equal(app.run('armed'), false);
});

test('two map taps commit an area and make the selected-area filter removable', () => {
  const app = loadApp({withMap: true, width: 700});
  app.run('startDrawing();onMapClick({latlng:{lat:42.381,lng:-71.107}});onMapClick({latlng:{lat:42.39,lng:-71.099}})');
  assert.equal(app.run('region.getSouth()'), 42.381);
  assert.equal(app.run('region.getEast()'), -71.099);
  assert.equal(app.run('draftRegionBox'), null);
  assert.equal(app.run('armed'), false);
  assert.equal(app.element('results').classList.contains('open'), true);
  assert.equal(app.element('regionStatus').hidden, false);
  app.element('clearRegion').click();
  assert.equal(app.run('region'), null);
  assert.equal(app.element('regionStatus').hidden, true);
});

test('mobile and tablet browse and report panels never cover each other', () => {
  for (const width of [390, 1000]) {
    const app = loadApp({withMap: true, width});
    app.run('rerender();openResults();select(S[0].id)');
    assert.equal(app.element('report').classList.contains('open'), true);
    assert.equal(app.element('results').classList.contains('open'), false);
    const selection = app.run('sel');
    app.element('countChip').click();
    assert.equal(app.element('report').classList.contains('open'), false);
    assert.equal(app.element('results').classList.contains('open'), true);
    assert.equal(app.run('sel'), selection);
    app.run('select(S[0].id)');
    app.element('repX').click();
    assert.equal(app.element('report').classList.contains('open'), false);
    assert.equal(app.element('results').classList.contains('open'), true);
    assert.equal(app.document.activeElement.getAttribute('role'), 'option');
  }
});

test('reset from an empty state restores all filters without changing basemap or viewport', () => {
  const app = loadApp({withMap: true});
  app.choices.layers[1].classList.add('on');
  const viewport = JSON.stringify(app.map.viewport);
  app.run("query='school';addr.value='school';stationSize='large';minScore=95;verdictFilter='conditional';region=L.latLngBounds([[42.38,-71.11],[42.39,-71.1]]);rerender()");
  assert.equal(app.run('activeSites().length'), 0);
  app.element('emptyReset').click();
  assert.equal(app.run('activeSites().length'), 113);
  assert.equal(app.run('region'), null);
  assert.equal(app.run('sel'), null);
  assert.equal(app.element('addr').value, '');
  assert.equal(app.element('clearSearch').hidden, true);
  assert.equal(app.element('minScore').value, 60);
  assert.equal(app.choices.sizes[0].getAttribute('aria-pressed'), 'true');
  assert.equal(app.choices.verdicts[0].getAttribute('aria-pressed'), 'true');
  assert.equal(app.choices.layers[1].classList.contains('on'), true);
  assert.equal(JSON.stringify(app.map.viewport), viewport);
});

test('Review means only conditional results and native filter controls activate once', () => {
  const app = loadApp({withMap: true});
  app.choices.verdicts[2].click();
  assert.equal(app.run('activeSites().length'), 101);
  assert.equal(app.run("activeSites().every(s=>verdictKey(s)==='conditional')"), true);
  assert.equal(app.choices.verdicts[2].getAttribute('aria-pressed'), 'true');
  assert.equal(app.choices.verdicts[2].handlers.keydown, undefined);
});

test('list keyboard navigation has one tab stop, supports arrows and selects with Enter', () => {
  const app = loadApp({withMap: true});
  app.run('rerender();openResults()');
  let rows = app.element('clist').children;
  assert.equal(rows.filter(row => row.tabIndex === 0).length, 1);
  rows[0].focus();
  app.key(rows[0], 'ArrowDown');
  assert.equal(app.document.activeElement, rows[1]);
  assert.equal(rows.filter(row => row.tabIndex === 0).length, 1);
  app.key(rows[1], 'End');
  assert.equal(app.document.activeElement, rows.at(-1));
  app.key(rows.at(-1), 'Home');
  app.key(rows[0], 'Enter');
  assert.equal(app.run('sel'), rows[0].dataset.siteId);
  assert.equal(rows[0].getAttribute('aria-selected'), 'true');
  app.run('rerender()');
  rows = app.element('clist').children;
  assert.equal(app.document.activeElement, rows[0]);
});

test('search preserves typed spaces and exposes working Arrow/Enter suggestions', () => {
  const app = loadApp({withMap: true});
  const input = app.element('addr');
  input.focus();input.value = 'School ';
  input.handlers.input[0]();
  assert.equal(input.value, 'School ');
  input.value = 'School Street';input.handlers.input[0]();
  assert.ok(app.run('activeSites().length') > 0);
  app.key(input, 'ArrowDown');
  assert.equal(input.getAttribute('aria-activedescendant'), app.element('clist').children[0].id);
  app.key(input, 'Enter');
  assert.equal(app.run('S.find(s=>s.id===sel).addr'), 'School Street');
  app.element('clearSearch').click();
  assert.equal(input.value, '');
  assert.equal(app.run('activeSites().length'), 113);
});

test('return from street view restores filters, selection, region and viewport once', () => {
  const original = loadApp({withMap: true});
  original.run("query='school';addr.value='school';minScore=60;setRegion(DATAB);select(S[0].id);map.setView([42.39,-71.102],16.5);saveWorkspace()");
  const selected = original.run('sel');
  const app = loadApp({withMap: true, width: 700, storage: original.storage, url: 'http://localhost:2400/?restore=1&other=value#map'});
  app.run('settle()');
  assert.equal(app.run('query'), 'school');
  assert.equal(app.run('sel'), selected);
  assert.equal(app.element('addr').value, 'school');
  assert.equal(app.run('region.getSouth()'), original.run('region.getSouth()'));
  assert.equal(JSON.stringify(app.map.viewport), JSON.stringify(original.map.viewport));
  assert.equal(app.element('report').classList.contains('open'), true);
  assert.equal(app.element('results').classList.contains('open'), false);
  assert.equal(app.storage.size, 0);
  assert.equal(app.location.search, '?other=value');
  assert.equal(app.run('restoreWorkspace()'), null);
});

test('bad or blocked session storage does not prevent opening or returning from a capture', () => {
  const storage = new Map([['sonder.screening.workspace.v1', '{broken']]);
  const app = loadApp({storage, url: 'http://localhost:2400/?restore=1'});
  assert.equal(app.run('restoreWorkspace()'), null);
  assert.equal(storage.size, 0);
  app.context.sessionStorage = {setItem() { throw new Error('Blocked'); }};
  assert.doesNotThrow(() => app.run('saveWorkspace()'));
});

test('street-view action is a separate native button and image failure does not disable available panoramas', () => {
  const app = loadApp({withMap: true});
  app.run('SITEPANO={[S[0].id]:[23,7]};select(S[0].id)');
  const button = app.element('streetViewBtn');
  assert.equal(button.disabled, false);
  app.element('rImg').onerror();
  assert.equal(app.element('#report .rphoto').classList.contains('image-unavailable'), true);
  assert.equal(button.disabled, false);
  button.click();
  assert.equal(new URL(app.location.href).pathname, '/lookaround.html');
  assert.equal(new URL(app.location.href).searchParams.get('return'), 'workspace');
  assert.equal(app.storage.size, 1);
  app.run('SITEPANO={};select(S[0].id)');
  assert.equal(button.disabled, true);
});

test('panorama return link requests restoration only for a workspace-originated visit', () => {
  const html = fs.readFileSync(path.join(__dirname, 'lookaround.html'), 'utf8');
  const script = html.slice(html.lastIndexOf('<script>') + '<script>'.length, html.lastIndexOf('</script>'));
  for (const [search, expected] of [['?return=workspace', './?restore=1'], ['?return=https://example.com', './'], ['', './']]) {
    const elements = new Map();
    const getElementById = id => {
      if (!elements.has(id)) elements.set(id, {style: {}, href: './'});
      return elements.get(id);
    };
    vm.runInNewContext(script, {window: {}, URLSearchParams, location: {search}, document: {getElementById}});
    assert.equal(getElementById('backBtn').href, expected);
  }
});

test('browsing cancels pending drawing while preserving the committed area', () => {
  const app = loadApp({withMap: true, width: 390});
  app.run('setRegion(DATAB);startDrawing();onMapClick({latlng:{lat:42.39,lng:-71.105}})');
  const committed = app.run('region');
  app.element('countChip').click();
  assert.equal(app.run('armed'), false);
  assert.equal(app.run('draftRegionBox'), null);
  assert.equal(app.run('region'), committed);
  assert.equal(app.element('results').classList.contains('open'), true);
});

test('map options stay above a bottom mobile anchor and below a desktop anchor', () => {
  for (const view of [
    {width: 390, height: 844, anchor: {top: 780, bottom: 824, right: 378}, direction: 'above'},
    {width: 1200, height: 800, anchor: {top: 70, bottom: 110, right: 1180}, direction: 'below'},
  ]) {
    const app = loadApp(view);
    const button = app.element('layersBtn'), panel = app.element('layers');
    button.getBoundingClientRect = () => view.anchor;
    panel.offsetHeight = 160;
    button.click();
    const top = parseFloat(panel.style.top), left = parseFloat(panel.style.left);
    assert.ok(top >= 0 && top + panel.offsetHeight <= view.height);
    assert.ok(left >= 0 && left + 190 <= view.width);
    assert.ok(view.direction === 'above' ? top < view.anchor.top : top > view.anchor.bottom);
    assert.equal(button.getAttribute('aria-expanded'), 'true');
    app.document.handlers.click[0]({target: app.document.body});
    assert.equal(panel.classList.contains('open'), false);
    assert.equal(button.getAttribute('aria-expanded'), 'false');
  }
});
