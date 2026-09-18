/* DOM-only transitions. Game state and input locking belong to app.js. */
(function () {
  'use strict';
  const PANEL_SELECTOR = '.modal-scrim,.recipe-scrim,.recipe-board,.action-picker,.action-guide,.camp-in-map,.resource-lanes,.loot-tray,.tile-claims';
  const KEY_SELECTOR = '[data-motion-key],.bag-piece[data-item],.shared-detection-marker';
  const EXIT = 240, ENTER = 220, MOVE = 300;
  const EASE = 'cubic-bezier(.22,.7,.25,1)';
  // Capture resolved visual/layout properties rather than the browser's 400+ computed
  // properties. SVG primitives already retain geometry and presentation attributes.
  const TEXT_STYLE = ['color','font-family','font-size','font-weight','font-style','line-height','letter-spacing','word-spacing','text-align','text-transform','text-decoration','white-space','word-break','overflow-wrap'];
  const HTML_STYLE = ['display','visibility','position','inset','z-index','box-sizing','width','height','min-width','max-width','min-height','max-height','aspect-ratio','margin','padding','border-top','border-right','border-bottom','border-left','border-radius','background','box-shadow','overflow-x','overflow-y','flex','flex-direction','flex-wrap','order','align-items','align-content','align-self','justify-content','justify-items','justify-self','gap','grid-template-columns','grid-template-rows','grid-auto-flow','grid-auto-columns','grid-auto-rows','grid-column','grid-row','vertical-align','text-overflow','list-style','object-fit','object-position','opacity','filter','backdrop-filter','clip-path','transform','transform-origin','translate','rotate','scale',...TEXT_STYLE];
  const SVG_STYLE = ['display','visibility','color','fill','fill-opacity','fill-rule','stroke','stroke-width','stroke-opacity','stroke-linecap','stroke-linejoin','stroke-miterlimit','stroke-dasharray','stroke-dashoffset','vector-effect','paint-order','opacity','filter','clip-path','transform','transform-origin','translate','rotate','scale'];
  const CLONE_RESET = ';pointer-events:none!important;animation:none!important;transition:none!important;caret-color:transparent!important;';
  const reduced = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  let current = null;

  const all = (root, selector) => {
    if (!root || !root.querySelectorAll) return [];
    return [...(root.matches && root.matches(selector) ? [root] : []), ...root.querySelectorAll(selector)];
  };
  function matches(el, selector) {
    try { return !!el.closest(selector); } catch (_) { return false; }
  }
  function excluded(el, selectors) {
    return selectors.some(selector => typeof selector === 'string' && matches(el, selector));
  }
  function rectOf(el) {
    const r = el.getBoundingClientRect();
    return { left:r.left, top:r.top, width:r.width, height:r.height, right:r.right, bottom:r.bottom };
  }
  function visible(el) {
    if (!el.isConnected || el.closest('[data-dino-motion-ghost],[hidden]')) return false;
    const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden' && s.visibility !== 'collapse';
  }
  function cleanClone(el) {
    for (const attr of [...el.attributes]) {
      if (/^(id|on.*|data-.*|tabindex|autofocus|name|form|for|href|xlink:href|srcdoc|contenteditable|draggable|aria-.*)$/i.test(attr.name)) el.removeAttribute(attr.name);
    }
    el.setAttribute('tabindex', '-1');
    if ('inert' in el) el.inert = true;
  }
  /** A detached, inert HTML visual. Caller owns positioning and eventual removal. */
  function cloneVisual(el) {
    if (!el || !el.cloneNode) return null;
    const clone = el.cloneNode(true), originals = [el, ...el.querySelectorAll('*')], copies = [clone, ...clone.querySelectorAll('*')];
    originals.forEach((source, i) => {
      const target = copies[i];
      if (!target || !target.style) return;
      const s = getComputedStyle(source);
      const svg = source.namespaceURI === 'http://www.w3.org/2000/svg';
      const props = svg && source.localName !== 'svg' ? SVG_STYLE : HTML_STYLE;
      let css = target.style.cssText + ';';
      for (const prop of props) { const value = s.getPropertyValue(prop); if (value) css += prop + ':' + value + ';'; }
      if (svg && /^(svg|text|tspan|textPath)$/.test(source.localName)) {
        for (const prop of source.localName === 'svg' ? SVG_STYLE : TEXT_STYLE) { const value = s.getPropertyValue(prop); if (value) css += prop + ':' + value + ';'; }
      }
      // One parse/write per clone avoids repeatedly reparsing an expanding declaration.
      target.style.cssText = css + CLONE_RESET;
      if ('value' in source && 'value' in target) target.value = source.value;
      if ('checked' in source && 'checked' in target) target.checked = source.checked;
      cleanClone(target);
      if (source.localName === 'canvas') {
        try { target.getContext('2d').drawImage(source, 0, 0); } catch (_) { /* A protected canvas is simply omitted. */ }
      }
      // Scrollers are restored after insertion; detached elements cannot retain scroll offsets.
      target.__dinoScroll = [source.scrollLeft || 0, source.scrollTop || 0];
    });
    let result = clone;
    if (el.namespaceURI === 'http://www.w3.org/2000/svg') {
      result = document.createElement('div');
      const r = rectOf(el);
      result.style.width = r.width + 'px';
      result.style.height = r.height + 'px';
      if (el.localName === 'svg') {
        clone.style.width = '100%'; clone.style.height = '100%';
        clone.style.display = 'block';
        result.append(clone);
      } else {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        let box;
        try { box = el.getBBox(); } catch (_) { box = {x:0,y:0,width:r.width,height:r.height}; }
        svg.setAttribute('viewBox', [box.x,box.y,box.width || 1,box.height || 1].join(' '));
        svg.setAttribute('width', '100%'); svg.setAttribute('height', '100%');
        svg.style.cssText = 'display:block;overflow:visible;pointer-events:none';
        clone.removeAttribute('transform');
        clone.style.transform = 'none'; clone.style.translate = 'none';
        svg.append(clone); result.append(svg);
      }
    }
    result.setAttribute('data-dino-motion-ghost', '');
    result.setAttribute('aria-hidden', 'true');
    result.setAttribute('inert', '');
    result.inert = true;
    result.style.setProperty('pointer-events', 'none', 'important');
    result.classList.add('dino-motion-ghost');
    return result;
  }
  function restoreScroll(el) {
    [el, ...el.querySelectorAll('*')].forEach(node => {
      if (node.__dinoScroll) { node.scrollLeft = node.__dinoScroll[0]; node.scrollTop = node.__dinoScroll[1]; }
    });
  }
  function stableClasses(el) {
    return [...el.classList].filter(c => !/^(on|active|selected|open|ready|working|idle|warning|full|pursued|step-\d+|is-.*)$/.test(c)).sort().join('.');
  }
  function labelKey(el) {
    return el.getAttribute('data-motion-panel') || el.getAttribute('aria-labelledby') || el.getAttribute('aria-label') || '';
  }
  function panelType(el) {
    if (el.matches('.modal-scrim,.recipe-scrim')) {
      const modal = el.querySelector('.modal,[role="dialog"],.intro-modal') || el.firstElementChild || el;
      const structure = ['setup','intro-modal','recipe-board','aircraft-modal','event-modal','pass-modal','winner','battle-layout','cook-choices'].find(c => modal.classList.contains(c) || modal.querySelector('.' + c));
      // Generic simple modals are distinguished by their static close label (e.g. cooking / dinosaur).
      const close = modal.querySelector('.close[aria-label]');
      return 'dialog:' + (modal.getAttribute('data-motion-panel') || structure || labelKey(modal) || close?.getAttribute('aria-label') || stableClasses(modal));
    }
    if (el.matches('.resource-lanes')) return 'resources:' + (el.querySelector('.resource-pay-zone') ? 'payment' : el.querySelector('.awaiting-stock') ? 'supply' : el.querySelector('[data-do="finish-gather"]') ? 'gather' : 'tile');
    if (el.matches('.action-guide')) return 'guide:' + (labelKey(el) || (el.querySelector('[data-do="auto-supply-tile"]') ? 'supply' : 'destination'));
    if (el.matches('.action-picker')) return 'picker:' + (labelKey(el) || stableClasses(el));
    if (el.matches('.camp-in-map')) return 'camp';
    if (el.matches('.loot-tray')) return 'loot';
    if (el.matches('.tile-claims')) return 'claims';
    return 'panel:' + (labelKey(el) || stableClasses(el));
  }
  function enumerate(root) {
    const panels = [], keys = [], counts = new Map();
    const unique = base => { const n = counts.get(base) || 0; counts.set(base, n + 1); return base + ':' + n; };
    all(root, PANEL_SELECTOR).forEach(el => {
      if (!visible(el) || panels.some(p => p.el.contains(el))) return;
      panels.push({key:unique(panelType(el)),el,type:'panel'});
    });
    const seenKeys = new Set();
    all(root, KEY_SELECTOR).forEach(el => {
      if (!visible(el)) return;
      const explicit = el.getAttribute('data-motion-key');
      const key = explicit ? 'key:' + explicit : el.matches('.bag-piece') ? 'bag:' + el.getAttribute('data-item') : 'shared-marker';
      // Duplicate explicit keys are invalid identities; first visible occurrence wins.
      if (seenKeys.has(key)) return;
      seenKeys.add(key);
      keys.push({key,el,type:'item'});
    });
    return [...panels, ...keys];
  }
  function capture(root, options = {}) {
    const snapshot = {root,entries:[],width:window.innerWidth,height:window.innerHeight};
    if ((reduced?.matches && !options.essential) || document.hidden || !root) return snapshot;
    snapshot.entries = enumerate(root).map(item => ({...item,rect:rectOf(item.el),visual:cloneVisual(item.el)}));
    return snapshot;
  }
  function cancel() {
    if (current) current.finish();
  }
  function splitTranslate(value) {
    if (!value || value === 'none') return ['0px','0px'];
    const parts = []; let level = 0, part = '';
    for (const ch of value) {
      if (ch === '(') level++;
      if (ch === ')') level--;
      if (/\s/.test(ch) && !level) { if (part) { parts.push(part); part = ''; } }
      else part += ch;
    }
    if (part) parts.push(part);
    return [parts[0] || '0px',parts[1] || '0px',...parts.slice(2)];
  }
  function offsetTranslate(base, dx, dy) {
    const p = splitTranslate(base);
    p[0] = `calc(${p[0]} + ${dx}px)`; p[1] = `calc(${p[1]} + ${dy}px)`;
    return p.join(' ');
  }
  function localDelta(el, dx, dy) {
    // SVG CSS translations use SVG units, while captured rectangles use screen pixels.
    if (typeof el.getScreenCTM === 'function') {
      const m = el.getScreenCTM();
      if (m) { const det = m.a*m.d-m.b*m.c; if (det) return [(m.d*dx-m.c*dy)/det,(-m.b*dx+m.a*dy)/det]; }
    }
    return [dx,dy];
  }
  function play(root, snapshot, options = {}) {
    cancel();
    if (!snapshot || snapshot.root !== root || (reduced?.matches && !options.essential) || document.hidden || snapshot.width !== window.innerWidth || snapshot.height !== window.innerHeight) return Promise.resolve();
    const exclude = Array.isArray(options.exclude) ? options.exclude : [];
    const delay = Math.max(0,Number(options.delay) || 0);
    const before = snapshot.entries.filter(v => !excluded(v.el,exclude));
    const after = enumerate(root).filter(v => !excluded(v.el,exclude));
    const oldByKey = new Map(before.map(v => [v.key,v])), newByKey = new Map(after.map(v => [v.key,v]));
    const removed = before.filter(v => !newByKey.has(v.key));
    const added = after.filter(v => !oldByKey.has(v.key));
    const oldPanels = removed.filter(v => v.type === 'panel'), newPanels = added.filter(v => v.type === 'panel');
    const inside = (v,panels) => panels.some(p => p.el !== v.el && p.el.contains(v.el));
    const jobs = [];
    let resolve, timer, finished = false;
    const completion = new Promise(r => { resolve = r; });
    const run = {animations:[],ghosts:[],finish() {
      if (finished) return; finished = true;
      clearTimeout(timer);
      run.animations.forEach(a => { try { a.cancel(); } catch (_) {} });
      run.ghosts.forEach(g => g.remove());
      if (current === run) current = null;
      resolve();
    }};
    current = run;
    function animate(el, frames, duration, wait = 0) {
      if (!el.animate) return;
      try {
        const a = el.animate(frames,{duration,delay:wait,easing:EASE,fill:'both'});
        run.animations.push(a);
        jobs.push(a.finished.catch(() => {}));
      } catch (_) { /* Browsers without individual translate support show the final DOM immediately. */ }
    }
    function exit(v) {
      if (!v.visual) return;
      const ghost = v.visual, r = v.rect;
      // A captured visual already includes its transform in r; neutralise its own transform.
      ghost.style.setProperty('position','fixed','important');
      ghost.style.setProperty('inset','auto','important');
      ghost.style.setProperty('left',r.left+'px','important');
      ghost.style.setProperty('top',r.top+'px','important');
      ghost.style.setProperty('width',r.width+'px','important');
      ghost.style.setProperty('height',r.height+'px','important');
      ghost.style.setProperty('max-width','none','important');
      ghost.style.setProperty('max-height','none','important');
      ghost.style.setProperty('min-width','0','important');
      ghost.style.setProperty('min-height','0','important');
      ghost.style.setProperty('margin','0','important');
      ghost.style.setProperty('transform','none','important');
      ghost.style.setProperty('translate','none');
      ghost.style.setProperty('box-sizing','border-box','important');
      ghost.style.setProperty('z-index',v.el.matches('.modal-scrim,.recipe-scrim')?'1001':'900','important');
      document.body.append(ghost); restoreScroll(ghost); run.ghosts.push(ghost);
      const face = v.type === 'panel' && v.el.matches('.modal-scrim,.recipe-scrim') ? ghost.querySelector('.modal,[role="dialog"],.intro-modal') : ghost;
      animate(ghost,[{opacity:getComputedStyle(ghost).opacity},{opacity:0}],EXIT);
      if (face) {
        const base = getComputedStyle(face).translate;
        animate(face,[{translate:base},{translate:offsetTranslate(base,0,v.type === 'panel'?30:12)}],EXIT);
      }
    }
    removed.filter(v => !inside(v,oldPanels)).forEach(exit);
    added.filter(v => !inside(v,newPanels)).forEach(v => {
      const s = getComputedStyle(v.el), wait = v.type === 'panel' ? delay + (oldPanels.length ? EXIT : 0) : 0;
      const face = v.type === 'panel' && v.el.matches('.modal-scrim,.recipe-scrim') ? v.el.querySelector('.modal,[role="dialog"],.intro-modal') : v.el;
      animate(v.el,[{opacity:0},{opacity:s.opacity}],ENTER,wait);
      if (face) {
        const base = getComputedStyle(face).translate, delta = localDelta(face,0,v.type === 'panel'?20:10);
        animate(face,[{translate:offsetTranslate(base,...delta)},{translate:base}],ENTER,wait);
      }
    });
    after.filter(v => v.type === 'item' && !inside(v,newPanels)).forEach(v => {
      const old = oldByKey.get(v.key);
      if (!old || inside(old,oldPanels)) return;
      const next = rectOf(v.el), dx = old.rect.left-next.left, dy = old.rect.top-next.top;
      if (Math.abs(dx)<.5 && Math.abs(dy)<.5) return;
      const base = getComputedStyle(v.el).translate, delta = localDelta(v.el,dx,dy);
      animate(v.el,[{translate:offsetTranslate(base,...delta)},{translate:base}],MOVE);
    });
    // Fixed deadline covers removed documents, hidden tabs and unfinished browser animations.
    timer = setTimeout(run.finish,600+delay);
    Promise.all(jobs).then(run.finish);
    return completion;
  }
  window.addEventListener('resize',cancel,{passive:true});
  document.addEventListener('visibilitychange',cancel);
  if (reduced?.addEventListener) reduced.addEventListener('change',cancel);
  else if (reduced?.addListener) reduced.addListener(cancel);
  window.DinoMotion = Object.freeze({capture,play,cancel,cloneVisual,isAnimating:()=>!!current});
})();
