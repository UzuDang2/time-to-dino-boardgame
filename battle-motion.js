/* Visual-only combat playback. Rules, action costs and saved HP have already settled. */
(()=>{
 'use strict';let live=null;
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function capture(root,type,before,after,art){
  if(type!=='battleStep'||!before.battle||!after.battleEffect||!window.DinoResourceMotion?.enabled())return null;
  return {combat:true,effect:after.battleEffect,player:before.players[before.turn],art,duration:after.battleEffect.killed?1350:2200,exclude:['.modal-scrim','.action-card','.plan-slot']};
 }
 function cancel(){live?.finish();}
 function play(root,plan){cancel();if(!plan||!window.DinoResourceMotion?.enabled())return Promise.resolve();return new Promise(resolve=>{
  let ended=false;const nodes=[],animations=[],timers=[],hidden=[];
  const finish=()=>{if(ended)return;ended=true;timers.forEach(clearTimeout);animations.forEach(a=>a.cancel());nodes.forEach(n=>n.remove());hidden.forEach(n=>n.classList.remove('battle-motion-awaiting'));if(live?.finish===finish)live=null;resolve();};live={finish};
  try{
   const e=plan.effect,E=window.DinoEngine,c=E.combatCardData(e.card),a=plan.art;
   root.querySelectorAll('.modal-scrim').forEach(n=>{n.classList.add('battle-motion-awaiting');hidden.push(n);});
   const theater=document.createElement('div');theater.className='battle-motion-theater';theater.setAttribute('aria-hidden','true');theater.inert=true;theater.dataset.combatStage='card';
   theater.innerHTML=`<section class="battle-motion-arena"><div class="combat-theater-heading"><span>사냥 라운드 ${e.round} · ${e.step}/3단계</span><small>Esc · 연출 넘기기</small></div><div class="combat-actors"><div class="combat-card-side"><div class="battle-motion-card">${a.cardMarkup(e.card,0,true)}</div><span>${esc(plan.player.name)}의 행동</span></div><div class="combat-versus">→</div><div class="combat-prey-side"><h3>${esc(E.PREY[e.kind].name)} <small>Lv.${e.level}</small></h3><div class="combat-prey-art">${a.animal(e.kind)}</div><div class="combat-health">${a.icon('heart',23)} <strong class="combat-prey-hp">${e.preyHp}</strong><small>/ ${e.maxHp}</small></div><div class="combat-hp-track"><i style="width:${e.preyHp/e.maxHp*100}%"></i></div></div></div><div class="combat-caption"><b>${esc(c.name)}</b><span>${c.atk?'공격 +'+(e.power||c.atk):'방어 +'+c.guard}</span>${e.weapons?.length?`<small>${e.weapons.map(w=>`${esc(E.RES[w.kind].name)} 내구도 ${w.before} → ${w.after}${w.broken?' · 파손':''}`).join(' / ')}</small>`:''}</div><div class="combat-player-health">${a.icon('heart',23)}<span>${esc(plan.player.name)}</span><strong>${e.playerHp}</strong><small>/ 8</small></div></section>`;
   document.body.append(theater);nodes.push(theater);
   const animate=(node,frames,options)=>{if(!node)return;const anim=node.animate(frames,options);animations.push(anim);return anim;};
   const later=(ms,fn)=>timers.push(setTimeout(()=>{if(!ended)fn();},ms));
   const prey=theater.querySelector('.combat-prey-side'),card=theater.querySelector('.battle-motion-card'),player=theater.querySelector('.combat-player-health'),caption=theater.querySelector('.combat-caption');
   const announce=(title,detail)=>{caption.innerHTML=`<b>${esc(title)}</b><span>${esc(detail)}</span>`;animate(caption,[{opacity:0,transform:'translateY(8px)'},{opacity:1,transform:'translateY(0)'}],{duration:180,fill:'both'});};
   const shake=node=>animate(node,[{transform:'translateX(0)'},{transform:'translateX(-8px)',offset:.2},{transform:'translateX(6px)',offset:.4},{transform:'translateX(-4px)',offset:.6},{transform:'translateX(0)'}],{duration:330});
   const float=(node,text,good=false)=>{const n=document.createElement('div');n.className='combat-impact '+(good?'good':'damage');n.textContent=text;node.append(n);animate(n,[{opacity:0,transform:'translate(-50%,10px) scale(.6)'},{opacity:1,transform:'translate(-50%,-12px) scale(1.2)',offset:.2},{opacity:1,transform:'translate(-50%,-22px) scale(1)',offset:.65},{opacity:0,transform:'translate(-50%,-44px) scale(1)'}],{duration:850,fill:'both'});};
   const health=(node,start,end)=>{const steps=Math.abs(start-end);if(!steps){node.textContent=end;return;}for(let i=1;i<=steps;i++)later(i*280/steps,()=>node.textContent=start+(end>start?i:-i));};
   animate(theater,[{opacity:0},{opacity:1}],{duration:160,fill:'both'});
   animate(card,[{transform:'translateY(25px) rotate(-8deg) scale(.75)',opacity:0},{transform:'translateY(-10px) rotate(3deg) scale(1.05)',opacity:1,offset:.65},{transform:'translateY(0) rotate(0) scale(1)',opacity:1}],{duration:380,fill:'both'});
   later(390,()=>{theater.dataset.combatStage='player-effect';animate(card,[{transform:'translateX(0) scale(1)'},{transform:`translateX(${c.atk?28:0}px) scale(1.09)`,offset:.45},{transform:'translateX(0) scale(1)'}],{duration:280});
    if(c.atk){float(prey,e.damage?'−'+e.damage:'막힘',!e.damage);if(e.damage){shake(prey);prey.classList.add('combat-hit');}health(theater.querySelector('.combat-prey-hp'),e.preyHp,e.preyAfter);theater.querySelector('.combat-hp-track i').style.width=e.preyAfter/e.maxHp*100+'%';announce(c.name,e.damage?'사냥감에게 피해 '+e.damage:'사냥감이 공격을 막았습니다');}
    else{float(player,'방어 +'+c.guard,true);player.classList.add('combat-guarding');announce(c.name,'이번 공격 피해를 '+c.guard+' 줄입니다');}
   });
   later(1000,()=>{prey.classList.remove('combat-hit');if(e.killed){theater.dataset.combatStage='victory';float(prey,'처치!',true);announce('사냥 성공','사냥감의 반격 없이 전리품을 얻습니다');animate(theater.querySelector('.combat-prey-art'),[{opacity:1,transform:'scale(1)'},{opacity:.3,transform:'translateY(14px) scale(.85)'}],{duration:260,fill:'both'});return;}
    theater.dataset.combatStage='monster-effect';const move=e.reaction;if(!move)return;
    if(move.type==='attack'){announce(move.name,'공격 '+e.monsterPower+' → 내 피해 '+e.playerDamage);shake(prey);float(player,e.playerDamage?'−'+e.playerDamage:'방어 성공',!e.playerDamage);if(e.playerDamage)shake(player);health(player.querySelector('strong'),e.playerHp,e.playerAfter);}
    else if(move.type==='guard'){announce(move.name,'사냥감의 다음 공격 방어 +'+move.value);float(prey,'방어 +'+move.value,true);}
    else if(move.type==='prepare'){announce(move.name,'사냥감의 다음 공격 +'+move.value);float(prey,'준비 +'+move.value,true);}
    else if(move.type==='flee'){announce(move.name,e.escaped?'다른 지형으로 도망쳤습니다':'이동할 지형이 없어 대기합니다');if(e.escaped)animate(theater.querySelector('.combat-prey-art'),[{transform:'translateX(0)',opacity:1},{transform:'translateX(60px)',opacity:0}],{duration:480,fill:'both'});}
   });
   later(plan.duration-180,()=>animate(theater,[{opacity:1},{opacity:0}],{duration:180,fill:'forwards'}));later(plan.duration,finish);
  }catch(error){console.warn('Combat motion skipped:',error.message);finish();}
 });}
 window.DinoBattleMotion={capture,play,cancel};
})();
