// Normative algorithm excerpts: independent design normalization, explicit override, and color calculation.
// No renderer, application state, or model implementation is included.
export const DASHBOARD_ACCENTS = {"cobalt":"#3d6dff","lime":"#b7ed62","cyan":"#55d9ed","violet":"#aa8aff","red":"#f56377","rose":"#f68bc9","orange":"#ffac65","mint":"#70f3c4"};
const DEFAULT_DESIGN = {"title":"검토 결과, 한눈에.","subtitle":"파일을 선택하면 항목별 판정과 근거를 볼 수 있습니다.","accent":"cobalt","focus":"overview","density":"comfortable","layout":"balanced","distribution":"doughnut","theme":"dark","emphasis":"balanced","chartSize":"standard","legend":"right","motion":"full","corners":"rounded","fileVisualization":"cards"};
function mixColor(color,target,weight){return "#"+[1,3,5].map(i=>Math.round(parseInt(color.slice(i,i+2),16)*(1-weight)+parseInt(target.slice(i,i+2),16)*weight).toString(16).padStart(2,"0")).join("");}
export function normalizeDashboardDesign(input) {
  const candidate = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const concise = (value, fallback, max) => typeof value === 'string' && value.trim() ? Array.from(value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, max).join('') : fallback;
  return {
    title: concise(candidate.title, DEFAULT_DESIGN.title, 60),
    subtitle: concise(candidate.subtitle, DEFAULT_DESIGN.subtitle, 100),
    accent: Object.hasOwn(DASHBOARD_ACCENTS, candidate.accent) || /^#[0-9a-f]{6}$/i.test(candidate.accent || '') ? candidate.accent.toLowerCase() : DEFAULT_DESIGN.accent,
    focus: ['overview', 'exceptions', 'documents'].includes(candidate.focus) ? candidate.focus : DEFAULT_DESIGN.focus,
    density: ['comfortable', 'compact'].includes(candidate.density) ? candidate.density : DEFAULT_DESIGN.density,
    layout: ['balanced', 'files-first', 'findings-first', 'charts-first'].includes(candidate.layout) ? candidate.layout : DEFAULT_DESIGN.layout,
    distribution: ['doughnut', 'pie', 'bar', 'polarArea'].includes(candidate.distribution) ? candidate.distribution : DEFAULT_DESIGN.distribution,
    theme: ['dark', 'light'].includes(candidate.theme) ? candidate.theme : DEFAULT_DESIGN.theme,
    emphasis: ['balanced', 'charts', 'findings'].includes(candidate.emphasis) ? candidate.emphasis : DEFAULT_DESIGN.emphasis,
    chartSize: ['standard', 'large'].includes(candidate.chartSize) ? candidate.chartSize : DEFAULT_DESIGN.chartSize,
    legend: ['right', 'bottom', 'hidden'].includes(candidate.legend) ? candidate.legend : DEFAULT_DESIGN.legend,
    motion: ['full', 'subtle', 'none'].includes(candidate.motion) ? candidate.motion : DEFAULT_DESIGN.motion,
    corners: ['rounded', 'square'].includes(candidate.corners) ? candidate.corners : DEFAULT_DESIGN.corners,
    fileVisualization: ['cards', 'bars'].includes(candidate.fileVisualization) ? candidate.fileVisualization : DEFAULT_DESIGN.fileVisualization,
  };
}
export function applyDashboardPreferences(design, instruction = '') {
  const request = String(instruction).slice(0, 1_500).toLowerCase();
  const overrides = {};
  const rejected = match => {
    const tail = request.slice(match.index + match[0].length, match.index + match[0].length + 40);
    const prefix = request.slice(Math.max(0, match.index - 22), match.index);
    return /^\s*(?:은|는|이|가|를|을|으로|로)?\s*(?:싫|제외|말고|아니|빼|대신|보다는|안\s|사용하지|쓰지|하지\s*마|넣지)/.test(tail)
      || /(?:\bnot(?:\s+(?:a|the))?|\bwithout|\bno|\bavoid|don't\s+use|안)\s*$/.test(prefix);
  };
  const choose = (key, choices, relevant = () => true) => {
    const matches = choices.flatMap(([pattern, value]) => [...request.matchAll(new RegExp(pattern.source, 'g'))].filter(match => !rejected(match) && relevant(match)).map(match => ({ index: match.index, value })));
    if (matches.length) overrides[key] = matches.sort((a, b) => a.index - b.index).at(-1).value;
  };
  const colorWords = /#[0-9a-f]{6}\b|빨간색|빨강|레드|\bred\b|분홍색?|핑크|로즈|\brose\b|주황색?|오렌지|\borange\b|보라색?|퍼플|바이올렛|\bviolet\b|민트색?|\bmint\b|청록색?|시안|\bcyan\b|라임색?|\blime\b|초록색?|녹색|\bgreen\b|파란색|파랑|블루|코발트|\bcobalt\b|\bblue\b/g;
  const aliases = [[/빨|레드|^red$/, 'red'], [/분홍|핑크|로즈|rose/, 'rose'], [/주황|오렌지|orange/, 'orange'], [/보라|퍼플|바이올렛|violet/, 'violet'], [/민트|mint/, 'mint'], [/청록|시안|cyan/, 'cyan'], [/라임|lime/, 'lime'], [/초록|녹색|green/, '#198b58']];
  for (const match of request.matchAll(colorWords)) {
    if (rejected(match)) continue;
    overrides.accent = match[0].startsWith('#') ? match[0] : aliases.find(([pattern]) => pattern.test(match[0]))?.[1] || 'cobalt';
  }
  choose('theme', [[/라이트(?:\s*모드)?|화이트\s*(?:모드|테마)|밝은\s*(?:배경|테마|화면|모드)|(?:흰색|하얀|흰)\s*배경|\blight(?:\s*mode)?\b|\bwhite\s+background\b/, 'light'], [/다크(?:\s*모드)?|어두운\s*(?:배경|테마|화면|모드)|\bdark(?:\s*mode)?\b/, 'dark']]);
  choose('distribution', [[/도넛|\bdoughnut\b|\bdonut\b/, 'doughnut'], [/파이(?:\s*차트)?|원형\s*(?:차트|그래프)|\bpie\b/, 'pie'], [/막대|바\s*차트|\bbar\b/, 'bar'], [/극좌표|방사형|\bpolar\s*area\b/, 'polarArea']], match => !/(?:파일|문서)(?:은|는|별)?\s*(?:비교\s*)?$/.test(request.slice(Math.max(0, match.index - 20), match.index)));
  choose('layout', [[/(?:항목|판정|상세|결과\s*목록).{0,12}(?:먼저|상단|위로|맨\s*위)|findings[ -]first/, 'findings-first'], [/(?:파일|문서).{0,12}(?:먼저|중심|우선|왼쪽)|files[ -]first/, 'files-first'], [/(?:그래프|차트).{0,12}(?:먼저|상단|맨\s*위)|charts?[ -]first/, 'charts-first']]);
  choose('emphasis', [[/(?:그래프|차트).{0,16}(?:강조|중심|크게|키워|돋보이)|(?:강조|큰)\s*(?:그래프|차트)|chart[ -]focused/, 'charts'], [/(?:항목|상세|목록).{0,16}(?:강조|중심|크게|키워)|findings[ -]focused/, 'findings'], [/균형\s*(?:잡|있)|\bbalanced\b/, 'balanced']]);
  choose('chartSize', [[/(?:그래프|차트).{0,16}(?:강조|크게|키워)|(?:큰|대형)\s*(?:차트|그래프)|\blarge\s+charts?\b/, 'large'], [/(?:그래프|차트).{0,12}(?:작게|줄여|기본\s*크기)|\bsmall\s+charts?\b/, 'standard']]);
  choose('density', [[/촘촘|컴팩트|\bcompact\b/, 'compact'], [/여유\s*있|여백.{0,10}(?:넓|많)|널찍|\b(?:airy|comfortable|spacious)\b/, 'comfortable']]);
  choose('legend', [[/범례.{0,10}(?:아래|하단)|legend.{0,15}bottom/, 'bottom'], [/범례.{0,10}(?:오른쪽|우측)|legend.{0,15}right/, 'right'], [/범례.{0,10}(?:숨|없애|제거|빼)|(?:no|without|hide)\s+(?:the\s+)?legend/, 'hidden']]);
  choose('motion', [[/(?:모션|애니메이션).{0,10}(?:없이|없애|끄|제거|빼)|(?:no|without|disable)\s+(?:the\s+)?(?:animation|motion)|정적인\s*(?:화면|대시보드)/, 'none'], [/(?:모션|애니메이션).{0,10}(?:은은|절제|줄여|약하게)|(?:은은|절제된).{0,5}(?:모션|애니메이션)|\bsubtle\s+(?:motion|animation)/, 'subtle'], [/(?:모션|애니메이션).{0,10}(?:풍부|화려|많이)|\bfull\s+(?:motion|animation)/, 'full']]);
  choose('corners', [[/각진|직각|모서리.{0,10}(?:각지|직각)|\bsquare\b/, 'square'], [/둥근|둥글|\brounded\b/, 'rounded']]);
  choose('fileVisualization', [[/(?:파일|문서).{0,12}(?:비교\s*막대|비교\s*띠|스트립)|comparison\s*strips?/, 'bars'], [/(?:파일|문서).{0,10}카드|file\s*cards?/, 'cards']]);
  return normalizeDashboardDesign({ ...design, ...overrides });
}
export function dashboardPalette(accent, theme = 'dark') {
  const base = DASHBOARD_ACCENTS[accent] || (/^#[0-9a-f]{6}$/i.test(accent || '') ? accent.toLowerCase() : DASHBOARD_ACCENTS.cobalt);
  const luminance = [1, 3, 5].map(index => parseInt(base.slice(index, index + 2), 16) / 255).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
  const light = theme === 'light';
  // Preserve the chosen hue, with readable contrast on the requested surface.
  const visible = light ? (luminance > 0.58 ? mixColor(base, '#17334f', 0.43) : base) : (luminance < 0.35 ? mixColor(base, '#ffffff', 0.32) : base);
  return {
    base, accent: visible, text: light ? mixColor(visible, '#17243b', 0.22) : mixColor(visible, '#ffffff', 0.28),
    charts: light ? [visible, mixColor(visible, '#ffffff', 0.38), mixColor(visible, '#17243b', 0.4)] : [visible, mixColor(visible, '#ffffff', 0.48), mixColor(visible, '#111318', 0.4)],
    background: light ? '#f3f6fc' : '#111318', panel: light ? '#ffffff' : '#1b2029',
    surface: light ? '#f7f9fe' : '#202734', hover: light ? '#edf2fc' : '#283448', detail: light ? '#f4f7fd' : '#171d27',
    ink: light ? '#17243b' : '#eef2f8', muted: light ? '#51617b' : '#9ba9be', secondary: light ? '#394b67' : '#b8c6dc',
    border: light ? '#d8e1ef' : '#343d4d', grid: light ? '#e2e8f3' : '#303a4b', tooltip: light ? '#ffffff' : '#252f41',
    pass: light ? '#187c5c' : '#70f3c4', fail: light ? '#c23751' : '#ff8494', review: light ? '#94610c' : '#f6cc7e',
  };
}
