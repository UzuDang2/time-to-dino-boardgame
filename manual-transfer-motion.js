/* Visual transfers only. The engine and save have already committed each action. */
(() => {
  'use strict';
  const SPECIAL = new Set(['ration','battery','knife','spear','engine','cooler']);
  const AUTOMATIC = new Set(['autoSupplyTile','autoCollectLoot','autoGather']);
  const EASE = 'cubic-bezier(.22,.68,.25,1)';
  let live = null;
  const E = () => window.DinoEngine;
  const attr = value => String(value).replace(/\\/g,'\\\\').replace(/"/g,'\\"');
  const query = (root,s) => { try { return root?.querySelector(s); } catch (_) { return null; } };
  const rect = node => {
    if (!node?.getBoundingClientRect) return null;
    const r=node.getBoundingClientRect();
    return r.width>0&&r.height>0 ? {left:r.left,top:r.top,width:r.width,height:r.height} : null;
  };
  const usable = r => r&&Number.isFinite(r.left)&&Number.isFinite(r.top)&&r.width>0&&r.height>0;
  const union = rs => {
    const a=rs.filter(usable);if(!a.length)return null;
    const left=Math.min(...a.map(r=>r.left)),top=Math.min(...a.map(r=>r.top));
    return {left,top,width:Math.max(...a.map(r=>r.left+r.width))-left,height:Math.max(...a.map(r=>r.top+r.height))-top};
  };
  const center = r => ({x:r.left+r.width/2,y:r.top+r.height/2});
  function endpoint(root,selectors=[],fallback=null,frozen=false) {
    const list=Array.isArray(selectors)?selectors:[selectors];
    const node=list.map(s=>query(root,s)).find(n=>usable(rect(n)));
    return {selectors:list,node,rect:rect(node)||fallback,frozen};
  }
  function footprint(root,selectors,fallback=null) {
    const oldCells=selectors.map(selector=>{const node=query(root,selector);return {selector,rect:rect(node),clone:window.DinoMotion?.cloneVisual(node)};}).filter(c=>c.rect&&c.clone);
    return {selectors,rect:union(selectors.map(s=>rect(query(root,s))))||fallback,union:true,oldCells};
  }
  function resolve(root,point) {
    if(!point)return null;if(point.frozen)return point.rect;
    const rs=point.selectors.map(s=>rect(query(root,s)));
    return (point.union?union(rs):rs.find(usable))||point.rect;
  }
  function locations(g) {
    const map=new Map();
    const put=(item,place)=>{map.set(item.id,{item,...place});if(item.topping)map.set(item.topping.id,{item:item.topping,...place,layer:true,parent:item});};
    for(const p of g.players){
      for(const item of p.bag)put(item,{area:'bag',owner:p.id});
      for(const b of [...p.storage,...p.boards])for(const item of b.cells.filter(Boolean))if(!map.has(item.id))put(item,{area:'board',owner:p.id,board:b.id});
    }
    for(const item of g.loot)put(item,{area:'loot',owner:item.owner});
    for(const [tile,t] of Object.entries(g.tiles))for(const item of t.groundItems||[])put(item,{area:'ground',tile});
    for(const item of g.pending)put(item,{area:'pending',owner:E().active(g).id});
    for(const [zone,b] of Object.entries(g.aircraft?.zones||{}))for(const item of b.cells.filter(Boolean))if(!map.has(item.id))put(item,{area:'plane',zone,owner:item.owner});
    return map;
  }
  function capture(root,type,before,after,art={},data={},origin={}) {
    if(!root||!before||!after||AUTOMATIC.has(type))return null;
    art=art||{};data=data||{};origin=origin||{};
    const engine=E(),old=locations(before),next=locations(after),shots=[],panels=[],handled=new Set();
    const shown=engine.lootOwner(before).id,bagRect=rect(query(root,'.bag-grid'));
    const fallback=rect(query(root,'.resource-table-head'))||rect(query(root,'.board-area'));
    const pouch=kind=>endpoint(root,SPECIAL.has(kind)?'.tile-pouch-main':`.supply-bag[data-rsource="supply:${attr(kind)}"]`,fallback);
    const piecePouch=item=>endpoint(root,[`[data-recipe$=":${attr(item.material)}:${attr(item.shape)}"]`,'.camp-material-tabs','.camp-production','.resource-table-head'],fallback);
    const bag=(item,owner)=>{
      const cs=engine.itemCells(item),w=Math.max(...cs.map(c=>c[0]))+1,h=Math.max(...cs.map(c=>c[1]))+1;
      const r=owner===shown&&bagRect?{left:bagRect.left+item.x*bagRect.width/5,top:bagRect.top+item.y*bagRect.height/5,width:w*bagRect.width/5,height:h*bagRect.height/5}:null;
      return endpoint(root,`.bag-piece[data-item="${attr(item.id)}"]`,r||fallback);
    };
    const ground=(tile,item)=>endpoint(root,[`.resource-lanes [data-rsource="ground:${attr(tile)}:${attr(item.id)}"]`,`[data-rsource="ground:${attr(tile)}:${attr(item.id)}"]`,`[data-hex="${attr(tile)}"]`],fallback);
    const raw=(tile,index)=>endpoint(root,[`[data-rsource="maptile:${attr(tile)}:${index}"]`,`.resource-lanes [data-rsource="tile:${index}"]`,`[data-hex="${attr(tile)}"]`],fallback);
    const pending=item=>endpoint(root,['.piece-preview svg','.piece-preview','.camp-production'],piecePouch(item).rect);
    const board=(g,loc)=>{
      const p=g.players.find(p=>p.id===loc.owner),b=engine.board(p,loc.board);
      const selectors=b.cells.flatMap((c,i)=>c?.id===loc.item.id?[`[data-cell="${attr(b.id)}:${i%b.w}:${Math.floor(i/b.w)}"]`]:[]);
      return footprint(root,selectors,rect(query(root,`[data-board="${attr(b.id)}"]`))||fallback);
    };
    const plane=loc=>{
      const z=engine.AIRCRAFT_ZONES.find(z=>z.id===loc.zone),b=after.aircraft.zones[loc.zone];
      return footprint(root,b.cells.flatMap((c,i)=>c?.id===loc.item.id?[`[data-resource-drop="plane:${attr(z.id)}:${i%z.w}:${Math.floor(i/z.w)}"]`]:[]),fallback);
    };
    const point=(g,loc)=>{
      if(!loc)return null;
      if(loc.area==='bag')return bag(loc.layer?loc.parent:loc.item,loc.owner);
      if(loc.area==='loot')return pouch(loc.item.kind);
      if(loc.area==='ground')return ground(loc.tile,loc.item);
      if(loc.area==='pending')return pending(loc.item);
      if(loc.area==='board')return board(g,loc);
      if(loc.area==='plane')return plane(loc);
      return null;
    };
    function keepPanel(selector,exit=false) {
      if(panels.some(p=>p.selector===selector))return;
      const node=query(root,selector),r=rect(node),clone=window.DinoMotion?.cloneVisual(node);
      if(r&&clone){const originals=[node,...node.querySelectorAll('*')],copies=[clone,...clone.querySelectorAll('*')];panels.push({selector,rect:r,clone,exit,copies:new Map(originals.map((n,i)=>[n,copies[i]]))});}
    }
    function payment(item,empty=false) {
      const offered=endpoint(root,`[data-rsource="offered:${attr(item.id)}"]`);
      if(!empty&&offered.rect)return offered;
      const slot=query(root,`.payment-slot[data-pay-kind="${attr(item.kind)}"]`);
      return endpoint(root,[],rect(slot)||offered.rect||rect(query(root,'.payment-slots'))||fallback,true);
    }
    const primaryId=data.id||data.source||null;
    function add(item,from,to,options={}) {
      if(!item||!from||!to)return;
      const isPrimary=options.primary||item.id===primaryId;
      if(isPrimary&&usable(origin.rect))from={...from,rect:{left:origin.rect.left,top:origin.rect.top,width:origin.rect.width,height:origin.rect.height},frozen:true};
      let dropped=false;
      if(isPrimary&&origin.dragged&&origin.dropPoint){
        const p=origin.dropPoint,x=Number(p.x??p.clientX??p[0]),y=Number(p.y??p.clientY??p[1]);
        if(Number.isFinite(x)&&Number.isFinite(y)){const r=from.rect||to.rect||{width:36,height:36};from={selectors:[],rect:{left:x-r.width/2,top:y-r.height/2,width:r.width,height:r.height},frozen:true};dropped=true;}
      }
      if(!usable(from.rect)&&!usable(to.rect))return;
      shots.push({item:{...item},from,to,dropped,travel:dropped?190:360,...options});
      if(item.id)handled.add(item.id);
    }
    const byId=id=>old.get(id);
    if(type==='supplyTile'){
      const setup=before.tileSetup,index=setup?.remaining.indexOf(data.kind),slot=query(root,'.tile-stock')?.querySelectorAll('.tile-slot')[index];
      const tile=setup?.tile||data.to,at=(before.tiles[tile]?.resources||[]).length;
      const target=endpoint(root,[`[data-rsource="maptile:${attr(tile)}:${at}"]`,`.resource-lanes [data-rsource="tile:${at}"]`],rect(slot)||raw(tile,at).rect);
      add({kind:data.kind},pouch(data.kind),target,{primary:true,feedback:rect(slot)});
      keepPanel('.resource-lanes',!after.tileSetup);
    }else if(type==='hide'){
      // Erasing traces replenishes a printed raw resource; it is not loot and
      // therefore has no item ID. Camp/no-resource actions produce no flight.
      for(const [tile,t] of Object.entries(after.tiles)){
        const count=(before.tiles[tile]?.resources||[]).length;
        for(const [offset,kind] of (t.resources||[]).slice(count).entries()){
          const target=endpoint(root,[`[data-rsource="maptile:${attr(tile)}:${count+offset}"]`,`.resource-lanes [data-rsource="tile:${count+offset}"]`,`[data-hex="${attr(tile)}"]`],raw(tile,count+offset).rect);
          add({kind},pouch(kind),target);
        }
      }
    }else if(type==='gatherTake'){
      const tile=before.gathering?.tile||data.tile;
      const incoming=[...next.values()].find(loc=>loc.area==='bag'&&!loc.layer&&(data.groundId?loc.item.id===data.groundId:!old.has(loc.item.id)));
      if(incoming)add(incoming.item,data.groundId?ground(tile,incoming.item):raw(tile,data.index),bag(incoming.item,incoming.owner),{primary:true});
    }else if(type==='offerPayment'){
      const loc=byId(data.id);if(loc){add(loc.item,bag(loc.item,loc.owner),payment(loc.item,true),{primary:true});keepPanel('.resource-pay-zone');}
    }else if(type==='returnPayment'||type==='cancelPayment'||type==='commitPayment'){
      const combining=type==='commitPayment'&&before.payment?.type==='combineFood';
      const ids=(type==='returnPayment'?[data.id]:before.payment?.offered||[]).slice();
      // The preserved base comes back first; its topping follows even when the
      // herb was paid first or the original drag direction was reversed.
      if(combining)ids.sort((a,b)=>Number(!!next.get(a)?.layer)-Number(!!next.get(b)?.layer));
      for(const id of ids){const loc=byId(id);if(!loc)continue;const dest=next.get(id);
        const item=combining&&dest&&!dest.layer?{...dest.item,topping:undefined}:dest?.item||loc.item;
        add(item,payment(loc.item),dest?.area==='bag'?point(after,dest):pouch(loc.item.kind),{primary:type==='returnPayment',consume:!dest,flip:!!dest&&loc.item.kind!==dest.item.kind,oldItem:loc.item,combineRoot:combining?(dest?.parent?.id||dest?.item.id):null,combineLast:combining&&!!dest?.layer});
      }
      if(ids.length)keepPanel('.resource-pay-zone',!after.payment);
    }else if(type==='stackFood'){
      const source=byId(data.source),target=byId(data.target);
      if(source&&target){const combined=[...next.values()].find(l=>l.area==='bag'&&!l.layer&&l.item.topping&&(l.item.id===data.source||l.item.id===data.target));if(combined)add(source.item,bag(source.item,source.owner),bag(combined.item,combined.owner),{primary:true,stack:true});handled.add(data.target);}
    }else if(type==='splitFood'){
      const loc=byId(data.id),top=loc?.item.topping,dest=top&&next.get(top.id);if(dest){add(top,bag(loc.item,loc.owner),bag(dest.item,dest.owner),{primary:true});handled.add(data.id);}
    }else if(type==='eat'||type==='discardItem'){
      const loc=byId(data.id);if(loc)add(loc.item,bag(loc.item,loc.owner),type==='eat'?endpoint(root,'[data-resource-drop="eat"]',fallback):pouch(loc.item.kind),{primary:true,consume:true});
    }else if(type==='discardPiece'){
      const loc=data.source==='pending'?byId(before.pending[0]?.id):byId(data.source);if(loc)add(loc.item,point(before,loc),piecePouch(loc.item),{primary:true,consume:true});
    }
    // Stable IDs cover manual receipt, bag relocation, trading, ground overflow,
    // aircraft installation and construction without duplicating multi-cell pieces.
    for(const [id,dest] of next){
      if(handled.has(id)||dest.layer)continue;const src=old.get(id);
      if(src?.layer)continue;
      const changed=src&&(src.area!==dest.area||src.owner!==dest.owner||src.tile!==dest.tile||src.board!==dest.board||src.zone!==dest.zone||src.item.x!==dest.item.x||src.item.y!==dest.item.y||src.item.rotation!==dest.item.rotation||src.item.flip!==dest.item.flip);
      if(changed){
        if(src.area==='bag'&&dest.area==='loot')add(dest.item,bag(src.item,src.owner),endpoint(root,`[data-resource-drop="trade:${dest.owner}"]`,pouch(dest.item.kind).rect),{primary:true});
        else {const item=dest.area==='plane'?{...src.item,...dest.item,rotation:data.rotation??src.item.rotation??0,flip:data.flip??src.item.flip??false}:dest.item;add(item,point(before,src),point(after,dest),{primary:id===data.id||type==='place'&&id===(data.source==='pending'?before.pending[0]?.id:data.source)});}
      }else if(!src&&dest.area==='pending')add(dest.item,piecePouch(dest.item),pending(dest.item));
      else if(!src&&dest.area==='ground')add(dest.item,pouch(dest.item.kind),ground(dest.tile,dest.item));
    }
    // A rescue scatters raw resources without IDs; nested food becomes two tokens.
    for(const [id,src] of old){
      if(handled.has(id)||next.has(id)||src.layer||src.area!=='bag')continue;
      const p=before.players.find(p=>p.id===src.owner),q=after.players.find(p=>p.id===src.owner);
      if(p.pos!==q.pos&&q.pos==='0,0'){
        const countBefore=(before.tiles[p.pos]?.resources||[]).length+shots.filter(s=>s.rescueTile===p.pos).length;
        for(const [n,item] of [src.item,...(src.item.topping?[src.item.topping]:[])].entries())add(item,bag(src.item,src.owner),raw(p.pos,countBefore+n),{rescueTile:p.pos});
      }else if(type==='battleStep'&&['spear','knife'].includes(src.item.kind))add(src.item,bag(src.item,src.owner),pouch(src.item.kind),{consume:true});
    }
    if(!shots.length)return null;
    if(shots.some(s=>next.get(s.item.id)?.area==='bag')&&engine.lootOwner(after).id!==shown)keepPanel('.dock-inventory');
    const duration=shots.reduce((n,s)=>n+s.travel+70,0)+(panels.some(p=>p.exit)?220:50);
    return {transfer:true,type,duration,shots,panels,art,exclude:['.bag-piece','.resource-lanes','.loot-tray','.tile-claims','.piece-preview','.storage-piece']};
  }
  function pieceArt(item) {
    const cells=E().pieceCells(item),w=Math.max(...cells.map(c=>c[0]))+1,h=Math.max(...cells.map(c=>c[1]))+1,color=E().MATERIALS[item.material]?.color||'#c59761';
    return `<svg viewBox="0 0 ${w*30} ${h*30}" width="100%" height="100%">${cells.map(([x,y])=>`<rect x="${x*30+1}" y="${y*30+1}" width="28" height="28" rx="4" fill="${color}" stroke="#6e805a" stroke-width="1.5"/>`).join('')}</svg>`;
  }
  function setFixed(node,r,z) {
    const styles={position:'fixed',inset:'auto',left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px',maxWidth:'none',maxHeight:'none',minWidth:'0',minHeight:'0',margin:'0',boxSizing:'border-box',transform:'none',translate:'none',scale:'none',rotate:'none',zIndex:String(z),pointerEvents:'none'};
    for(const [k,v] of Object.entries(styles))node.style[k]=v;
    node.inert=true;node.setAttribute('aria-hidden','true');node.setAttribute('data-dino-motion-ghost','');
  }
  function cancel(){live?.finish();}
  function play(root,plan) {
    cancel();if(!plan?.shots?.length)return Promise.resolve();
    return new Promise(resolvePromise=>{
      let finished=false;const nodes=[],animations=[],timers=new Set(),hidden=new Map(),combinedVisuals=new Map();
      const finish=()=>{if(finished)return;finished=true;for(const t of timers)clearTimeout(t);for(const a of animations){try{a.cancel();}catch(_){}}for(const n of nodes)n.remove();for(const [n,value] of hidden){if(value)n.style.setProperty('visibility',value.value,value.priority);else n.style.removeProperty('visibility');}if(live?.finish===finish)live=null;resolvePromise();};
      live={finish};
      const later=(fn,ms)=>{const t=setTimeout(()=>{timers.delete(t);if(!finished)fn();},ms);timers.add(t);return t;};
      const hide=n=>{if(!n||hidden.has(n))return;const value=n.style.getPropertyValue('visibility');hidden.set(n,value?{value,priority:n.style.getPropertyPriority('visibility')}:null);n.style.setProperty('visibility','hidden','important');};
      const show=n=>{if(!hidden.has(n))return;const value=hidden.get(n);if(value)n.style.setProperty('visibility',value.value,value.priority);else n.style.removeProperty('visibility');hidden.delete(n);};
      const animate=(node,frames,options)=>{try{const a=node.animate(frames,{easing:EASE,fill:'forwards',...options});animations.push(a);return a;}catch(_){return null;}};
      try {
        for(const panel of plan.panels){
          const clone=panel.clone;if(!clone)continue;clone.classList.add('transfer-panel');clone.dataset.transferAction=plan.type;setFixed(clone,panel.rect,1200);document.body.append(clone);nodes.push(clone);hide(query(root,panel.selector));
          for(const n of [clone,...clone.querySelectorAll('*')])if(n.__dinoScroll){n.scrollLeft=n.__dinoScroll[0];n.scrollTop=n.__dinoScroll[1];}
        }
        const prepared=plan.shots.map(shot=>{
          const to=resolve(root,shot.to)||shot.from.rect,from=shot.from.rect||to;
          const targets=shot.to.selectors.map(s=>query(root,s)).filter(Boolean);
          const actuals=targets.filter(n=>n.matches('.bag-piece,.table-token,.map-resource-token,.plane-cell,.grid-cell'));
          if(shot.item.kind==='engine'&&shot.to.union&&shot.to.selectors.some(s=>s.includes('plane:engine:'))){const overlay=query(root,'.zone-engine .engine-footprint');if(overlay)actuals.push(overlay);}
          if(!shot.stack)actuals.forEach(hide);
          const oldCells=[];
          for(const cell of shot.to.oldCells||[]){const clone=cell.clone;if(!clone)continue;clone.classList.add('transfer-cell-before');setFixed(clone,cell.rect,1201);document.body.append(clone);nodes.push(clone);oldCells.push(clone);}
          return {shot,to,from,actuals,oldCells};
        });
        let elapsed=0;
        for(const {shot,from,to,actuals,oldCells} of prepared){
          if(!usable(from)||!usable(to))continue;
          const start=elapsed;elapsed+=shot.travel+70;
          later(()=>{
            for(const panel of plan.panels){const source=panel.copies?.get(shot.from.node);if(source&&!source.classList.contains('supply-bag'))source.style.setProperty('opacity','0','important');}
            const visual=document.createElement('div');visual.className='transfer-flight';visual.dataset.transferAction=plan.type;visual.dataset.transferItem=shot.item.id||shot.item.kind||'';visual.dataset.transferPhase='flying';
            visual.dataset.transferFrom=[from.left,from.top,from.width,from.height].join(',');visual.dataset.transferTo=[to.left,to.top,to.width,to.height].join(',');
            const w=Math.max(20,Math.min(160,to.width)),h=Math.max(20,Math.min(160,to.height)),end=center(to),begin=center(from);
            const target={left:end.x-w/2,top:end.y-h/2,width:w,height:h};setFixed(visual,target,1205);visual.style.filter='drop-shadow(0 5px 5px #294b3c40)';visual.style.transformOrigin='center';
            const renderItem=item=>item.material?pieceArt(item):plan.art.itemShape?plan.art.itemShape(item,40):plan.art.icon?.(item.kind,38)||'';
            visual.innerHTML=renderItem(shot.flip?shot.oldItem:shot.item);const svg=visual.querySelector('svg');if(svg){svg.style.width='100%';svg.style.height='100%';svg.style.display='block';}
            document.body.append(visual);nodes.push(visual);
            if(shot.combineRoot){const group=combinedVisuals.get(shot.combineRoot)||[];group.push(visual);combinedVisuals.set(shot.combineRoot,group);}
            const dx=begin.x-end.x,dy=begin.y-end.y,scale=Math.max(.4,Math.min(1.2,from.width/w));
            animate(visual,[{transform:`translate(${dx}px,${dy}px) scale(${scale})`,opacity:1},{transform:`translate(${dx*.42}px,${dy*.42-Math.min(28,Math.abs(dx)*.05)}px) scale(1.05)`,opacity:1,offset:.57},{transform:'translate(0,0) scale(1)',opacity:1}],{duration:shot.travel});
            if(shot.flip)later(()=>{visual.innerHTML=renderItem(shot.item);const svg=visual.querySelector('svg');if(svg){svg.style.width='100%';svg.style.height='100%';}animate(visual,[{scale:'1 1'},{scale:'.05 1',offset:.48},{scale:'1 1'}],{duration:160});},Math.max(0,shot.travel-130));
            later(()=>{
              visual.dataset.transferPhase='landed';oldCells.forEach(n=>n.remove());
              if(shot.consume)animate(visual,[{opacity:1,scale:'1'},{opacity:0,scale:'.5'}],{duration:70});
              else if(shot.combineRoot){if(shot.combineLast){actuals.forEach(show);for(const n of combinedVisuals.get(shot.combineRoot)||[])n.style.opacity='0';}else animate(visual,[{scale:'.94'},{scale:'1.035',offset:.5},{scale:'1'}],{duration:70});}
              else if(actuals.length){actuals.forEach(show);if(!plan.panels.some(p=>p.clone)||shot.to.union||shot.feedback)visual.style.opacity='0';}
              else animate(visual,[{scale:'.94'},{scale:'1.035',offset:.5},{scale:'1'}],{duration:70});
              if(shot.feedback){const feedback=document.createElement('div');feedback.className='transfer-slot-feedback';setFixed(feedback,shot.feedback,1202);feedback.innerHTML=renderItem(shot.item);const svg=feedback.querySelector('svg');if(svg){svg.style.width='100%';svg.style.height='100%';}document.body.append(feedback);nodes.push(feedback);animate(feedback,[{scale:'.7',opacity:.2},{scale:'1',opacity:1}],{duration:100});}
            },shot.travel);
          },start);
        }
        if(plan.panels.some(p=>p.exit))later(()=>{for(const n of nodes.filter(n=>n.classList.contains('transfer-panel')))animate(n,[{opacity:1,translate:'0 0'},{opacity:0,translate:'0 28px'}],{duration:220});},elapsed);
        // A fixed deadline also resolves cancellation/interrupted WAAPI timelines.
        later(finish,Math.max(plan.duration,elapsed+50));
      } catch(error){console.warn('Resource transfer skipped:',error.message);finish();}
    });
  }
  window.addEventListener('resize',cancel,{passive:true});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)cancel();});
  window.DinoTransferMotion=Object.freeze({capture,play,cancel});
})();
