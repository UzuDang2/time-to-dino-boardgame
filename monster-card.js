(function(root){
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icons={attack:'spear',guard:'shield',prepare:'eye',flee:'boot'};
  function render(g,art){
    const E=root.DinoEngine,b=g.battle;if(!b)return '';
    const m=E.PREY[b.kind],pattern=E.battlePattern(b),icon=(kind,size=20)=>art.icon(kind,size);
    const strip=pattern.map((mark,i)=>{
      const action=E.battleAction(b,i),hidden=mark==='?'&&b.stage!=='resolve';
      const symbol=mark==='?'?'??':mark;
      return `${i?'<span class="prey-pattern-arrow" aria-hidden="true">→</span>':''}<div class="prey-pattern-step ${mark==='?'?'unknown':''} ${b.stage==='resolve'&&i===b.step?'next':''} ${b.stage==='resolve'&&i<b.step?'resolved':''}" data-pattern-step="${i}" aria-label="${i+1}단계 ${symbol}${hidden?' 미공개':' '+esc(action.name)}"><span class="prey-pattern-icon">${hidden?'<b>?</b>':icon(icons[action.type]||'paw',24)}</span><strong>${symbol}</strong><small>${hidden?'미공개':esc(action.name)}${mark==='?'&&action.letter?' · '+action.letter:''}</small></div>`;
    }).join('');
    const levels=[1,2].map(level=>`<section class="prey-level ${level===b.level?'active':''}" data-prey-level="${level}" aria-label="${level}레벨 행동${level===b.level?' · 현재 레벨':''}"><h4>Lv.${level}${level===b.level?'<span>현재 레벨</span>':''}</h4><div class="prey-action-table">${['A','B','C'].map(letter=>{const action=E.preyAction(b.kind,level,letter);return `<div class="prey-action-row" data-prey-action="${level}:${letter}"><b class="prey-letter">${letter}</b>${icon(icons[action.type],18)}<span class="prey-action-name">${esc(action.name)}</span><strong class="prey-action-effect">${esc(action.effect)}</strong></div>`;}).join('')}</div></section>`).join('');
    return `<article class="monster-card monster-letter-card" aria-label="${esc(m.name)} 사냥감 카드"><div class="prey-pattern" aria-label="사냥감 기본 행동 순서">${strip}</div><header class="prey-heading"><h3>${esc(m.name)}</h3><span class="prey-level-badge">Lv.${b.level}</span></header><div class="prey-portrait">${art.animal(b.kind)}<div class="prey-health">${icon('heart',20)}<b>${b.hp}</b><span>/ ${b.maxHp}</span></div></div><div class="prey-current-status"><span>${icon('shield',16)} 방어 ${b.armor||0}</span>${b.prepared?`<span class="prey-prepared">${icon('eye',16)} 준비 · 다음 공격 +${b.prepared}</span>`:'<span>나 → 사냥감 순서로 해결</span>'}</div>${levels}<div class="prey-skill"><b>고유 능력</b><p>${esc(m.skill)}</p></div><div class="prey-loot"><span>전리품</span><div>${m.loot.map(k=>icon(k,22)).join('')}${b.level===2?icon('metal',22):''}</div><b>+${b.level}점</b></div></article>`;
  }
  root.DinoMonsterCard={render};
  if(typeof module!=='undefined')module.exports=root.DinoMonsterCard;
})(typeof globalThis!=='undefined'?globalThis:this);
