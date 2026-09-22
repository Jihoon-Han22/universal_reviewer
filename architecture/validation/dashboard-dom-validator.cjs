(function validateDashboardInSandbox() {
  'use strict';
  const fs = require('node:fs');
  const vm = require('node:vm');
  const checks = ['input', 'syntax', 'csp', 'offline', 'kpis', 'charts', 'files', 'findings', 'filters', 'details', 'escaping'];
  const report = { version: 1, ok: false, engine: 'node-dom', visualBrowser: false, checks: Object.fromEntries(checks.map(key => [key, false])), diagnostics: [], totals: { total: 0, pass: 0, fail: 0, review: 0 }, files: 0 };
  let dom;
  const fail = message => { throw new Error(message); };
  const assert = (condition, message) => { if (!condition) fail(message); };
  const normalize = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const compactCriterion = value => normalize(String(value ?? '').split(/\s*·\s*(?:단위|적용 범위|조건)\s*:/)[0]);
  const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
  const read = (path, max) => {
    const size = fs.statSync(path).size;
    assert(size > 0 && size <= max, path + ': input size limit exceeded');
    return fs.readFileSync(path, 'utf8');
  };
  try {
    const html = read('dashboard.html', 12 * 1024 * 1024);
    const snapshot = JSON.parse(read('data.json', 12 * 1024 * 1024));
    const plan = JSON.parse(read('plan.json', 16_000));
    assert(snapshot && Array.isArray(snapshot.items) && snapshot.items.length <= 2_000, 'snapshot: invalid item list');
    const ids = new Set();
    const grouped = new Map();
    const names = new Map((snapshot.documents || []).map(file => [String(file.id), String(file.name || '이름 없는 문서')]));
    const labels = { pass: '적합', fail: '부적합', review: '확인 필요' };
    report.totals.total = snapshot.items.length;
    for (const item of snapshot.items) {
      assert(item && typeof item.id === 'string' && item.id && !ids.has(item.id) && typeof item.documentId === 'string' && Object.hasOwn(labels, item.status), 'snapshot: duplicate ID or invalid verdict');
      ids.add(item.id);
      report.totals[item.status] += 1;
      if (!grouped.has(item.documentId)) grouped.set(item.documentId, []);
      grouped.get(item.documentId).push(item);
      if (!names.has(item.documentId)) names.set(item.documentId, item.documentName || '문서 정보 없음');
    }
    report.files = grouped.size;
    if (snapshot.summary) assert(Object.entries(report.totals).every(([key, value]) => snapshot.summary[key] === value), 'snapshot: summary differs from item verdicts');
    assert(plan && ['overview', 'exceptions', 'documents'].includes(plan.focus), 'plan: invalid design focus');
    assert(typeof plan.accent === 'string' && (['cobalt', 'lime', 'cyan', 'violet', 'red', 'rose', 'orange', 'mint'].includes(plan.accent) || /^#[\da-f]{6}$/i.test(plan.accent)), 'plan: invalid design accent');
    assert(['comfortable', 'compact'].includes(plan.density), 'plan: invalid design density');
    const presentationFields = {
      layout: { values: ['balanced', 'files-first', 'findings-first', 'charts-first'], fallback: 'balanced', dataset: 'layout', label: 'design layout' },
      distribution: { values: ['doughnut', 'pie', 'bar', 'polarArea'], fallback: 'doughnut', dataset: 'distribution', label: 'distribution chart' },
      theme: { values: ['dark', 'light'], fallback: 'dark', dataset: 'theme', label: 'design theme' },
      emphasis: { values: ['balanced', 'charts', 'findings'], fallback: 'balanced', dataset: 'emphasis', label: 'design emphasis' },
      chartSize: { values: ['standard', 'large'], fallback: 'standard', dataset: 'chartSize', label: 'chart size' },
      legend: { values: ['right', 'bottom', 'hidden'], fallback: 'right', dataset: 'legend', label: 'legend placement' },
      motion: { values: ['full', 'subtle', 'none'], fallback: 'full', dataset: 'motion', label: 'design motion' },
      corners: { values: ['rounded', 'square'], fallback: 'rounded', dataset: 'corners', label: 'design corners' },
      fileVisualization: { values: ['cards', 'bars'], fallback: 'cards', dataset: 'fileVisualization', label: 'file visualization' },
    };
    const presentation = {};
    for (const [key, definition] of Object.entries(presentationFields)) {
      assert(plan[key] === undefined || definition.values.includes(plan[key]), 'plan: invalid ' + definition.label);
      presentation[key] = plan[key] ?? definition.fallback;
    }
    report.checks.input = true;

    const { JSDOM, VirtualConsole } = require('jsdom');
    const runtimeErrors = [];
    const virtualConsole = new VirtualConsole();
    virtualConsole.on('jsdomError', error => runtimeErrors.push(error.message));
    dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://offline.invalid/', pretendToBeVisual: true, virtualConsole });
    const win = dom.window;
    const doc = win.document;
    const all = selector => [...doc.querySelectorAll(selector)];
    const roots = all('[data-dashboard="root"]');
    assert(roots.length === 1, 'root: expected exactly one dashboard');
    const root = roots[0];
    assert(root.dataset.reviewTotal === String(report.totals.total), 'root: item count differs from snapshot');
    assert(root.dataset.designFocus === plan.focus, 'root: design focus differs from the approved plan');
    assert(root.dataset.accent?.toLowerCase() === plan.accent.toLowerCase(), 'root: design accent differs from the approved plan');
    assert(root.dataset.density === plan.density, 'root: design density differs from the approved plan');
    for (const [key, definition] of Object.entries(presentationFields)) assert(root.dataset[definition.dataset] === presentation[key], 'root: ' + definition.label + ' differs from the approved plan');
    assert(['designed', 'builtin'].includes(root.dataset.dashboardMode), 'root: unrecognized presentation mode');

    const scripts = all('script');
    const libraries = scripts.filter(script => ['chartjs', 'react-chartjs-2'].includes(script.dataset.chartLibrary));
    const apps = scripts.filter(script => script.hasAttribute('data-dashboard-runtime') || script.dataset.dashboardScript === 'app');
    assert(libraries.length === 1 && apps.length === 1 && scripts.length === 2, 'scripts: expected only the trusted Chart.js library and dashboard runtime');
    for (const [index, script] of scripts.entries()) {
      assert(!script.hasAttribute('src') && script.textContent.length > 0, 'scripts: external or empty script');
      new vm.Script(script.textContent, { filename: index ? 'dashboard-runtime.js' : 'chart-library.js' });
    }
    report.checks.syntax = true;

    const policies = all('meta[http-equiv]').filter(element => element.getAttribute('http-equiv').toLowerCase() === 'content-security-policy');
    assert(policies.length === 1, 'CSP: expected one policy');
    const directives = new Map();
    for (const part of policies[0].content.split(';')) {
      const [key, ...values] = part.trim().split(/\s+/);
      if (!key) continue;
      assert(!directives.has(key), 'CSP: duplicate directive');
      directives.set(key, values.join(' '));
    }
    for (const key of ['default-src', 'connect-src', 'frame-src', 'object-src', 'base-uri', 'form-action', 'worker-src', 'script-src-attr', 'img-src', 'font-src']) assert(directives.get(key) === "'none'", 'CSP: ' + key + ' must block resources');
    const nonce = scripts[0].getAttribute('nonce');
    assert(nonce && /^[A-Za-z0-9+/_=-]{16,}$/.test(nonce) && scripts.every(script => script.getAttribute('nonce') === nonce), 'CSP: script nonce mismatch');
    assert(directives.get('script-src') === "'nonce-" + nonce + "'" && directives.get('style-src') === "'unsafe-inline'", 'CSP: only fixed nonce scripts and inline styles are allowed');
    report.checks.csp = true;

    function checkEscapingAndResources() {
      assert(!doc.querySelector('iframe,object,embed,base,link,form,img,video,audio,source,svg image'), 'offline: unexpected resource-bearing element');
      assert(!all('meta[http-equiv]').some(element => element.getAttribute('http-equiv').toLowerCase() === 'refresh'), 'offline: refresh redirect');
      for (const element of all('*')) {
        for (const attribute of element.attributes) {
          assert(!/^on/i.test(attribute.name), 'escaping: inline event handler');
          assert(!['src', 'srcset', 'href', 'xlink:href', 'action', 'formaction'].includes(attribute.name.toLowerCase()), 'offline: resource or navigation attribute');
        }
      }
      const styles = all('style').map(style => style.textContent).join('\n');
      assert(!/@import\b|url\s*\(/i.test(styles), 'offline: stylesheet external resource');
      assert(all('script').length === 2, 'escaping: unexpected script after interaction');
    }
    checkEscapingAndResources();
    report.checks.offline = true;

    const chartCalls = [];
    class ChartAdapter {
      constructor(target, config) {
        this.canvas = target?.canvas || target;
        this.config = config;
        this.data = config.data;
        this.options = config.options || {};
        chartCalls.push(this);
      }
      static defaults = { font: {}, plugins: {} };
      static register() {}
      static getChart(canvas) { return chartCalls.find(chart => chart.canvas === canvas); }
      update() {}
      stop() {}
      destroy() {}
      resize() {}
    }
    win.Chart = ChartAdapter;
    win.TraceCharts = {
      version: 'react-chartjs-2@5.3.1',
      mount(host, config, reducedMotion) {
        const canvas = doc.createElement('canvas');
        canvas.dataset.chart = host.dataset.chart || 'verdicts';
        host.replaceChildren(canvas);
        const chart = new ChartAdapter(canvas, config);
        chart.reducedMotion = reducedMotion;
        return {
          update(next) { chart.config = next; chart.data = next.data; chart.options = next.options || {}; },
          destroy() { canvas.remove(); },
          inspect() { return { type: chart.config.type, labels: chart.data.labels, datasets: chart.data.datasets, animated: false }; },
        };
      },
      inspect(host) {
        const chart = chartCalls.find(entry => host.contains(entry.canvas));
        return chart ? { type: chart.config.type, labels: chart.data.labels, datasets: chart.data.datasets, animated: false } : null;
      },
    };
    // The adapter does not animate pixels. A normal-motion environment lets the
    // validator distinguish the plan's full, subtle and disabled animation modes.
    win.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
    const noNetwork = () => { runtimeErrors.push('offline: attempted network request'); throw new Error('Network is disabled during DOM validation'); };
    for (const key of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'Worker']) win[key] = noNetwork;
    win.navigator.sendBeacon = noNetwork;
    win.open = noNetwork;
    win.HTMLCanvasElement.prototype.getContext = function () { return { canvas: this }; };
    const context = dom.getInternalVMContext();
    new vm.Script(apps[0].textContent, { filename: 'dashboard-runtime.js' }).runInContext(context, { timeout: 2_000 });
    assert(runtimeErrors.length === 0, 'runtime: ' + runtimeErrors.join('; ').slice(0, 500));

    assert(root.querySelectorAll('[data-dashboard="kpi"]').length === 4, 'KPI: expected four clear totals');
    for (const [key, value] of Object.entries(report.totals)) {
      const metrics = root.querySelectorAll('[data-metric="' + key + '"]');
      assert(metrics.length === 1 && normalize(metrics[0].textContent).replaceAll(',', '') === String(value), 'KPI: ' + key + ' differs from the snapshot');
    }
    report.checks.kpis = true;
    const charts = chartCalls.filter(chart => chart.canvas?.getAttribute('data-chart') === 'verdicts');
    assert(charts.length === 1 && charts[0].config.type === presentation.distribution, 'chart: verdict distribution differs from the approved plan');
    assert(same(Array.from(charts[0].data.labels || []), ['적합', '부적합', '확인 필요']), 'chart: verdict labels are not meaningful');
    assert(charts[0].data.datasets?.length === 1 && same(Array.from(charts[0].data.datasets[0].data || []), [report.totals.pass, report.totals.fail, report.totals.review]), 'chart: values differ from exact snapshot verdicts');
    const palette = JSON.parse(root.dataset.chartPalette || 'null');
    assert(Array.isArray(palette) && palette.length === 3 && palette.every(color => typeof color === 'string' && /^#[\da-f]{6}$/i.test(color)), 'chart: missing valid approved palette');
    const accentColors = { cobalt: '#3d6dff', lime: '#b7ed62', cyan: '#55d9ed', violet: '#aa8aff', red: '#f56377', rose: '#f68bc9', orange: '#ffac65', mint: '#70f3c4' };
    const accent = accentColors[plan.accent] || plan.accent.toLowerCase();
    const mixColor = (color, target, weight) => '#' + [1, 3, 5].map(index => Math.round(parseInt(color.slice(index, index + 2), 16) * (1 - weight) + parseInt(target.slice(index, index + 2), 16) * weight).toString(16).padStart(2, '0')).join('');
    const luminance = [1, 3, 5].reduce((sum, index, channel) => sum + parseInt(accent.slice(index, index + 2), 16) / 255 * [0.2126, 0.7152, 0.0722][channel], 0);
    const lightTheme = presentation.theme === 'light';
    const visibleAccent = lightTheme ? (luminance > 0.58 ? mixColor(accent, '#17334f', 0.43) : accent) : (luminance < 0.35 ? mixColor(accent, '#ffffff', 0.32) : accent);
    const approvedPalette = [visibleAccent, mixColor(visibleAccent, '#ffffff', lightTheme ? 0.38 : 0.48), mixColor(visibleAccent, lightTheme ? '#17243b' : '#111318', 0.4)];
    assert(same(palette.map(color => color.toLowerCase()), approvedPalette), 'chart: declared palette ignores the approved accent or theme');
    assert(same(Array.from(charts[0].data.datasets[0].backgroundColor || []).map(color => String(color).toLowerCase()), palette.map(color => color.toLowerCase())), 'chart: colors differ from the approved palette');
    const chartOptions = charts[0].options;
    const chartTheme = presentation.theme === 'light'
      ? { panel: '#ffffff', ink: '#17243b', muted: '#51617b', secondary: '#394b67', grid: '#e2e8f3', tooltip: '#ffffff' }
      : { panel: '#1b2029', ink: '#eef2f8', muted: '#9ba9be', secondary: '#b8c6dc', grid: '#303a4b', tooltip: '#252f41' };
    const rootStyles = win.getComputedStyle(root);
    assert(rootStyles.getPropertyValue('color-scheme').trim() === presentation.theme && ['panel', 'ink', 'muted', 'secondary', 'grid'].every(key => rootStyles.getPropertyValue('--' + key).trim() === chartTheme[key]), 'chart: dashboard stylesheet ignores the approved theme');
    const tooltip = chartOptions.plugins?.tooltip;
    assert(tooltip?.backgroundColor === chartTheme.tooltip && tooltip.titleColor === chartTheme.ink && tooltip.bodyColor === chartTheme.muted, 'chart: tooltip colors ignore the approved theme');
    assert(charts[0].data.datasets[0].borderColor === chartTheme.panel, 'chart: borders ignore the approved theme');
    assert(chartOptions.responsive === true && chartOptions.maintainAspectRatio === false, 'chart: plot does not follow the available chart size');
    if (presentation.distribution === 'bar') {
      assert(chartOptions.indexAxis === 'y' && chartOptions.scales?.x?.beginAtZero === true && chartOptions.scales.x.ticks?.precision === 0, 'chart: bar distribution requires an exact zero-based count axis');
      assert(chartOptions.scales.x.ticks.color === chartTheme.muted && chartOptions.scales.x.grid?.color === chartTheme.grid && chartOptions.scales.y?.ticks?.color === chartTheme.secondary, 'chart: bar labels ignore the approved theme');
    } else if (presentation.distribution === 'polarArea') {
      const radial = chartOptions.scales?.r;
      assert(radial?.beginAtZero === true && radial.ticks?.precision === 0, 'chart: polar distribution requires an exact zero-based count axis');
      assert(radial.ticks.color === chartTheme.muted && radial.ticks.backdropColor === chartTheme.panel && radial.grid?.color === chartTheme.grid && radial.angleLines?.color === chartTheme.grid, 'chart: radial labels ignore the approved theme');
    } else {
      assert(chartOptions.cutout === (presentation.distribution === 'pie' ? 0 : '78%'), 'chart: circular distribution cutout differs from the approved plan');
    }
    const reducedMotion = Boolean(doc.querySelector('meta[name="trace-reduced-motion"][content="true"]'));
    assert(charts[0].reducedMotion === (presentation.motion === 'none' || reducedMotion), 'chart: chart runtime ignores the approved motion setting');
    if (presentation.motion === 'none' || reducedMotion) assert(chartOptions.animation === false, 'chart: animation ignores the approved motion setting');
    else assert(chartOptions.animation?.duration === (presentation.motion === 'subtle' ? 240 : 1100) && chartOptions.animation.easing === (presentation.motion === 'subtle' ? 'easeOutQuad' : 'easeOutQuart'), 'chart: animation ignores the approved motion setting');
    const legend = root.querySelector('.distribution-legend');
    assert(legend && legend.hidden === (presentation.legend === 'hidden') && chartOptions.plugins?.legend?.display === false, 'chart: legend visibility differs from the approved plan');
    // jsdom does not consistently preserve !important when later class rules
    // also set display. Inspect the explicit hidden rule instead of claiming a
    // browser-computed visibility result for the hidden legend.
    const enforcesHidden = [...doc.styleSheets].some(sheet => [...sheet.cssRules].some(rule => rule.selectorText === '[hidden]' && rule.style?.getPropertyValue('display') === 'none' && rule.style.getPropertyPriority('display') === 'important'));
    assert(presentation.legend === 'hidden' ? enforcesHidden : win.getComputedStyle(legend).display !== 'none', 'chart: legend stylesheet ignores the approved visibility');
    const distributionContent = root.querySelector('.distribution-content');
    assert(distributionContent, 'chart: missing distribution layout');
    const distributionStyles = win.getComputedStyle(distributionContent);
    const bottomLegend = distributionStyles.gridTemplateRows.trim().endsWith(' auto') && win.getComputedStyle(legend).gridTemplateColumns.replace(/\s/g, '') === 'repeat(3,minmax(0,1fr))';
    assert(bottomLegend === (presentation.legend === 'bottom'), 'chart: legend placement ignores the approved plan');
    assert(legend.querySelectorAll('.legend-row').length === 3, 'chart: missing verdict legend');
    for (const [status, label] of Object.entries(labels)) {
      const row = legend.querySelector('.legend-row.' + status);
      assert(row && normalize(row.querySelector('.legend-label')?.textContent) === label && normalize(row.querySelector('.legend-count')?.textContent) === String(report.totals[status]), 'chart: legend differs from exact snapshot verdicts');
    }
    assert(root.style.getPropertyValue('--chart-size-factor').trim() === (presentation.chartSize === 'large' ? '1.35' : '1'), 'chart: plot size ignores the approved plan');
    if (presentation.chartSize === 'large') assert(rootStyles.getPropertyValue('--chart-min').includes('var(--chart-size-factor)') && rootStyles.gridTemplateRows.includes('var(--chart-min)'), 'chart: plot stylesheet ignores the approved size');
    const center = root.querySelector('.donut-center');
    assert(center && center.hidden === (presentation.distribution !== 'doughnut'), 'chart: center label obscures the approved distribution');
    report.checks.charts = true;

    const files = [...root.querySelectorAll('[data-document-id]')];
    assert(files.length === grouped.size && new Set(files.map(file => file.dataset.documentId)).size === grouped.size && files.every(file => grouped.has(file.dataset.documentId)), 'files: reviewed document selection is incomplete or duplicated');
    for (const file of files) {
      assert(file.tagName === 'BUTTON' && normalize(file.textContent).includes(normalize(names.get(file.dataset.documentId))), 'files: missing readable filename');
      const entries = grouped.get(file.dataset.documentId);
      const label = normalize(file.getAttribute('aria-label'));
      const expectedSuffix = Object.entries(labels).map(([status, word]) => word + ' ' + entries.filter(item => item.status === status).length).join(' · ');
      assert(label.endsWith(' · ' + expectedSuffix), 'files: inaccurate verdict label');
    }
    report.checks.files = true;
    assert(root.querySelectorAll('[data-dashboard="findings"]').length === 1, 'findings: missing named item list');
    assert(!root.querySelector('[data-dashboard="map"]'), 'findings: numbered item maps are not supported');
    const filters = [...root.querySelectorAll('[data-filter]')];
    for (const key of ['all', 'pass', 'fail', 'review']) assert(filters.filter(button => button.dataset.filter === key).length === 1, 'filters: missing or duplicate ' + key);
    const click = element => {
      assert(element, 'interaction: missing target');
      win.__traceValidationTarget = element;
      new vm.Script('__traceValidationTarget.click()').runInContext(context, { timeout: 2_000 });
      delete win.__traceValidationTarget;
      assert(runtimeErrors.length === 0, 'runtime: ' + runtimeErrors.join('; ').slice(0, 500));
    };
    const filterButton = key => [...root.querySelectorAll('[data-filter]')].find(button => button.dataset.filter === key);
    const rows = () => [...root.querySelectorAll('[data-review-id]')];
    const priority = plan.focus === 'exceptions' ? { fail: 0, review: 1, pass: 2 } : { review: 0, fail: 1, pass: 2 };
    const expectedItems = (fileId, filter) => [...(grouped.get(fileId) || [])].sort((left, right) => priority[left.status] - priority[right.status]).filter(item => filter === 'all' || (filter === 'attention' ? item.status !== 'pass' : item.status === filter));
    const verifyRows = (fileId, filter, limit = 100) => {
      const expected = expectedItems(fileId, filter).slice(0, limit);
      const rendered = rows();
      assert(same(rendered.map(row => row.dataset.reviewId), expected.map(item => item.id)), 'findings: file/filter rendered the wrong items');
      for (const [index, row] of rendered.entries()) {
        const item = expected[index];
        const content = normalize(row.textContent);
        assert(row.tagName === 'BUTTON' && content.includes(normalize(item.label || '이름 없는 항목')) && content.includes(labels[item.status]), 'findings: missing item name or verdict');
        if (item.value) assert(content.includes(normalize(item.value)), 'findings: measurement text changed');
        // The dense table shows only the threshold; the full criterion remains in
        // the expanded evidence checked below. Metadata suffixes must not cause a
        // valid designed dashboard to be replaced by the basic fallback.
        const criterion = row.querySelector('.finding-criterion');
        assert(criterion && normalize(criterion.textContent) === (compactCriterion(item.criterion) || '연결된 기준 없음'), 'findings: criterion text changed');
      }
      return expected;
    };
    const initialFile = root.dataset.activeDocument;
    const initialFilter = root.dataset.activeFilter;
    assert(grouped.size === 0 || grouped.has(initialFile), 'findings: invalid initial file selection');
    assert(['all', 'attention'].includes(initialFilter), 'findings: unexpected initial filter');
    verifyRows(initialFile, initialFilter);
    report.checks.findings = true;

    // Inspect all file labels/counts, then bounded first/last file interactions for large reports.
    const samples = files.length <= 24 ? files : [...files.slice(0, 12), ...files.slice(-12)];
    report.interactiveFilesChecked = samples.length;
    for (const file of samples) {
      click(file);
      assert(root.dataset.activeDocument === file.dataset.documentId && file.getAttribute('aria-pressed') === 'true', 'files: selection does not activate the requested file');
      for (const filter of ['all', 'pass', 'fail', 'review', ...(filterButton('attention') ? ['attention'] : [])]) {
        click(filterButton(filter));
        assert(root.dataset.activeFilter === filter && filterButton(filter).getAttribute('aria-pressed') === 'true', 'filters: selection state is wrong');
        const expected = verifyRows(file.dataset.documentId, filter);
        const badge = filterButton(filter).querySelector('strong');
        assert(badge && normalize(badge.textContent) === String(expectedItems(file.dataset.documentId, filter).length), 'filters: item count is wrong');
        if (expected.length) {
          const selected = expected[0];
          click(rows()[0]);
          const details = root.querySelectorAll('[data-dashboard="details"]');
          assert(details.length === 1 && rows()[0].getAttribute('aria-expanded') === 'true', 'details: finding selection did not expand one explanation');
          const content = normalize(details[0].textContent);
          for (const value of [selected.criterion, selected.explanation, selected.evidence?.quote, selected.humanNote]) if (value) assert(content.includes(normalize(value)), 'details: missing exact review evidence');
          checkEscapingAndResources();
          const close = details[0].querySelector('[data-close-details]');
          click(close);
          assert(!root.querySelector('[data-dashboard="details"]') && rows()[0].getAttribute('aria-expanded') === 'false', 'details: close did not restore the finding');
        }
      }
      const allItems = expectedItems(file.dataset.documentId, 'all');
      if (allItems.length > 100) {
        click(filterButton('all'));
        let limit = 100;
        while (limit < allItems.length) {
          const more = root.querySelector('[data-load-more]');
          assert(more && !more.hidden, 'findings: remaining source items are inaccessible');
          click(more);
          limit += 100;
          verifyRows(file.dataset.documentId, 'all', limit);
        }
        assert(root.querySelector('[data-load-more]')?.hidden, 'findings: pagination must stop after the last item');
      }
    }
    report.checks.filters = true;
    report.checks.details = true;
    checkEscapingAndResources();
    report.checks.escaping = true;
    report.ok = checks.every(key => report.checks[key] === true);
  } catch (error) {
    report.diagnostics.push(String(error?.message || error).slice(0, 1_000));
  } finally {
    if (dom) dom.window.close();
    fs.writeFileSync('validation.json', JSON.stringify(report));
    console.log('TRACE_DASHBOARD_VALIDATION:' + JSON.stringify(report));
    process.exitCode = report.ok ? 0 : 1;
  }
})();
