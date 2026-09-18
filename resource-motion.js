/* Visual-only resource choreography. The rules and save are committed before this runs. */
(() => {
 'use strict';
 let live=null;
 const enabled=()=>{try{return localStorage.getItem('time-to-dino-resource-motion')!=='off';}catch{return true;}};
 const box=el=>el?el.getBoundingClientRect():null;
 const point=r=>r?{x:r.left+r.width/2,y:r.top+r.height/2}:null;
 const visible=r=>r&&r.width>0&&r.height>0;
 const special=new Set(['ration','battery','knife','spear','engine','cooler']);
 function capture(root,type,before,after,art,data={},origin=null){
  if(!enabled())return null;
  if(!['autoSupplyTile','autoCollectLoot','autoGather'].includes(type))return window.DinoTransferMotion?.capture(root,type,before,after,art,data,origin)||null;
  const E=window.DinoEngine,owner=type==='autoCollectLoot'?E.lootOwner(before):E.active(before),selector=type==='autoCollectLoot'?'.dock-inventory':'.resource-lanes',panel=root.querySelector(selector),rect=box(panel);
  if(!visible(rect))return null;
  const shots=[],sources=[...root.querySelectorAll('.resource-lanes .table-token')],used=new Set(),bagRect=box(root.querySelector('.bag-grid'));
  const pouch=kind=>{const el=root.querySelector(special.has(kind)?'.tile-pouch-main':`.supply-bag[data-rsource="supply:${kind}"]`),r=box(el?.querySelector('svg')||el)||box(root.querySelector('.resource-table-head'));if(!r)return null;const shelf=box(el?.closest('.supply-shelf')),left=Math.max(8,shelf?.left||8),right=Math.min(innerWidth-8,shelf?.right||innerWidth-8),x=Math.max(left+18,Math.min(right-18,r.left+r.width/2)),y=Math.max(20,Math.min(innerHeight-20,r.top+r.height/2));return {left:x-18,top:y-18,width:36,height:36};};
  if(type==='autoSupplyTile'){
   const slots=[...panel.querySelectorAll('.tile-slot')];
   (before.tileSetup?.remaining||[]).forEach((kind,i)=>shots.push({kind,from:pouch(kind),to:box(slots[i]),slot:i,mapIndex:before.tiles[before.tileSetup.tile].resources.length+i}));
  }else{
   const ids=new Set(owner.bag.map(i=>i.id)),added=after.players.find(p=>p.id===owner.id).bag.filter(i=>!ids.has(i.id));
   for(const item of added){let from=before.loot.find(i=>i.id===item.id)?.source==='crafted'?box(root.querySelector(`.crafted-token[data-rsource="loot:${item.id}"]`))||pouch(item.kind):pouch(item.kind),sourceIndex=-1;
    if(type==='autoGather'){
     sourceIndex=sources.findIndex((el,i)=>!used.has(i)&&el.dataset.rsource?.startsWith('ground:')&&el.dataset.rsource.endsWith(':'+item.id));
     if(sourceIndex<0)sourceIndex=sources.findIndex((el,i)=>!used.has(i)&&el.dataset.rsource?.startsWith('tile:')&&before.tiles[owner.pos].resources[+el.dataset.rsource.slice(5)]===item.kind);
     if(sourceIndex>=0){used.add(sourceIndex);from=box(sources[sourceIndex]);}
    }
    const cs=E.itemCells(item),w=Math.max(...cs.map(c=>c[0]))+1,h=Math.max(...cs.map(c=>c[1]))+1;
    const to=bagRect?{left:bagRect.left+item.x*bagRect.width/5,top:bagRect.top+item.y*bagRect.height/5,width:w*bagRect.width/5,height:h*bagRect.height/5}:null;
    shots.push({kind:item.kind,item,from,to,sourceIndex});
   }
  }
  if(!shots.length)return null;
  const stagger=shots.length>1?Math.min(105,1200/(shots.length-1)):0,duration=620+(shots.length-1)*stagger+330;
  return {type,selector,rect,clone:window.DinoMotion.cloneVisual(panel),shots,stagger,duration,art,tile:before.tileSetup?.tile,owner:owner.id,placedBefore:before.tileSetup?before.tiles[before.tileSetup.tile].resources.length:0,exclude:type==='autoCollectLoot'?['.dock-inventory','.loot-tray','.tile-claims','.bag-piece']:['.resource-lanes','.bag-piece'],nextOwner:E.lootOwner(after).id};
 }
 function cancel(){if(live)live.finish();window.DinoTransferMotion?.cancel();}
 function play(root,plan){
  cancel();if(!plan||!enabled())return Promise.resolve();if(plan.transfer)return window.DinoTransferMotion.play(root,plan);
  return new Promise(resolve=>{
   let ended=false;const nodes=[],animations=[],timers=[],hidden=[];
   const finish=()=>{if(ended)return;ended=true;timers.forEach(clearTimeout);animations.forEach(a=>a.cancel());nodes.forEach(n=>n.remove());hidden.forEach(n=>n.classList.remove('motion-target-pending'));root.querySelectorAll('.motion-target-pending').forEach(n=>n.classList.remove('motion-target-pending'));if(live?.finish===finish)live=null;resolve();};
   live={finish};
   try{
    const panel=plan.clone;panel.classList.add('resource-motion-panel');Object.assign(panel.style,{position:'fixed',inset:'auto',maxWidth:'none',maxHeight:'none',minWidth:'0',minHeight:'0',boxSizing:'border-box',translate:'none',left:plan.rect.left+'px',top:plan.rect.top+'px',width:plan.rect.width+'px',height:plan.rect.height+'px',margin:'0',transform:'none',zIndex:'1001',pointerEvents:'none'});document.body.append(panel);[panel,...panel.querySelectorAll('*')].forEach(n=>{if(n.__dinoScroll){n.scrollLeft=n.__dinoScroll[0];n.scrollTop=n.__dinoScroll[1];}});nodes.push(panel);
    const hide=el=>{if(el){el.classList.add('motion-target-pending');hidden.push(el);}};
    const sameOwner=plan.type==='autoCollectLoot'&&plan.owner===plan.nextOwner;
    if(plan.type==='autoCollectLoot'&&!sameOwner)hide(root.querySelector('.dock-inventory'));
    if(sameOwner)panel.querySelectorAll('.inventory-pack,:scope > .section-label').forEach(n=>n.style.opacity='0');
    if(plan.type==='autoSupplyTile'){
     const all=root.querySelector(`[data-hex="${plan.tile}"]`)?.querySelectorAll('.map-resource-token');
     [...(all||[])].slice(-plan.shots.length).forEach(hide);
    }
    const slots=[...panel.querySelectorAll('.tile-slot')],oldTokens=[...panel.querySelectorAll('.table-token')];
    plan.shots.forEach((shot,i)=>{
     let target=shot.to,actual=shot.item?root.querySelector(`.bag-piece[data-item="${shot.item.id}"]`):null;
     if(plan.type==='autoSupplyTile'){actual=root.querySelector(`[data-hex="${plan.tile}"]`)?.querySelectorAll('.map-resource-token')[shot.mapIndex];if(actual)target=box(actual);}
     if((plan.type==='autoGather'||sameOwner)&&actual){target=box(actual);hide(actual);}
     const from=point(shot.from),to=point(target);if(!from||!to)return;
     const flight=document.createElement('div');flight.className='resource-flight';flight.dataset.flightIndex=i;flight.dataset.itemId=shot.item?.id||'';flight.setAttribute('aria-hidden','true');flight.inert=true;
     const cs=shot.item?window.DinoEngine.itemCells(shot.item):[[0,0]],w=Math.max(...cs.map(c=>c[0]))+1,h=Math.max(...cs.map(c=>c[1]))+1,unit=Math.min(34,60/Math.max(w,h));
     flight.innerHTML=shot.item?plan.art.itemShape(shot.item,unit):plan.art.icon(shot.kind,32);
     const fw=shot.item?w*unit:40,fh=shot.item?h*unit:40;
     Object.assign(flight.style,{left:(from.x-fw/2)+'px',top:(from.y-fh/2)+'px',width:fw+'px',height:fh+'px'});document.body.append(flight);nodes.push(flight);
     const dx=to.x-from.x,dy=to.y-from.y,delay=i*plan.stagger,landingScale=Math.max(.3,Math.min(1,target.width/fw));flight.dataset.motionFrom=JSON.stringify(from);flight.dataset.motionTo=JSON.stringify(to);
     const animation=flight.animate([{transform:'translate(0,0) scale(.65) rotate(-8deg)',opacity:0},{transform:`translate(${dx*.42}px,${dy*.42-35}px) scale(1.08) rotate(4deg)`,opacity:1,offset:.42},{transform:`translate(${dx}px,${dy}px) scale(${landingScale}) rotate(0deg)`,opacity:1}],{duration:620,delay,easing:'cubic-bezier(.22,.72,.22,1)',fill:'both'});animations.push(animation);
     animation.finished.then(()=>{
      if(ended)return;flight.remove();
      if(shot.slot!==undefined){const slot=slots[shot.slot];if(slot){slot.classList.add('resource-arrived');slot.querySelectorAll('*').forEach(n=>n.style.opacity='1');slot.animate([{scale:'.8'},{scale:'1.08',offset:.6},{scale:'1'}],{duration:190});}}
      if(plan.type==='autoCollectLoot'&&!sameOwner&&shot.item){const layer=panel.querySelector('.bag-pieces');if(layer){const placed=document.createElement('div');placed.className='motion-landed-piece';const r=shot.to;Object.assign(placed.style,{left:shot.item.x*20+'%',top:shot.item.y*20+'%',width:(Math.max(...cs.map(c=>c[0]))+1)*20+'%',height:(Math.max(...cs.map(c=>c[1]))+1)*20+'%'});placed.innerHTML=plan.art.itemShape(shot.item,44);layer.append(placed);}}
      if(actual&&(plan.type==='autoGather'||plan.type==='autoSupplyTile'||sameOwner)){actual.classList.remove('motion-target-pending');animations.push(actual.animate([{scale:'.86'},{scale:'1.05',offset:.6},{scale:'1'}],{duration:170}));}
      if(plan.type==='autoSupplyTile'){const heading=panel.querySelector('.lane-heading>span');if(heading)heading.textContent=`배치 ${plan.placedBefore+i+1} / ${plan.placedBefore+plan.shots.length}`;}
      if(shot.sourceIndex>=0&&oldTokens[shot.sourceIndex])oldTokens[shot.sourceIndex].style.opacity='.15';
     }).catch(()=>{});
    });
    timers.push(setTimeout(()=>{
     if(ended)return;
     if(plan.type==='autoSupplyTile'||(plan.type==='autoCollectLoot'&&plan.owner===plan.nextOwner))hidden.forEach(n=>n.classList.remove('motion-target-pending'));
     if(plan.type==='autoCollectLoot'&&plan.owner===plan.nextOwner){panel.querySelectorAll('.inventory-pack,:scope > .section-label').forEach(n=>n.style.opacity='0');}
     const exit=panel.animate([{translate:'0 0',opacity:1},{translate:'0 44px',opacity:0}],{duration:240,easing:'cubic-bezier(.4,0,.7,.2)',fill:'forwards'});animations.push(exit);exit.finished.then(finish).catch(()=>{});
    },plan.duration-240));
    timers.push(setTimeout(finish,plan.duration+300));
   }catch(error){console.warn('Resource motion skipped:',error.message);finish();}
  });
 }
 window.DinoResourceMotion={capture,play,cancel,enabled};
})();
