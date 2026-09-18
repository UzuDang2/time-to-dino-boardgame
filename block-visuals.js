/* A construction piece has one outline; neighboring pieces keep separate edges. */
(() => {
 const directions=[['n',0,-1],['e',1,0],['s',0,1],['w',-1,0]];
 function joins(cells,x,y){const used=new Set(cells.map(c=>c.join(',')));return directions.filter(([,dx,dy])=>used.has(`${x+dx},${y+dy}`)).map(([name])=>'join-'+name).join(' ');}
 function svg(cells,{color,outline='#826942',unit=20,unitY=unit,hitCells=false,stroke=1.5}={}){
  const used=new Set(cells.map(c=>c.join(','))),w=(Math.max(...cells.map(c=>c[0]))+1)*unit,h=(Math.max(...cells.map(c=>c[1]))+1)*unitY;
  const fill=cells.map(([x,y])=>`M${x*unit},${y*unitY}h${unit}v${unitY}h-${unit}Z`).join('');
  const border=cells.map(([x,y])=>{const a=x*unit,b=y*unitY;return [!used.has(`${x},${y-1}`)?`M${a},${b}h${unit}`:'',!used.has(`${x+1},${y}`)?`M${a+unit},${b}v${unitY}`:'',!used.has(`${x},${y+1}`)?`M${a},${b+unitY}h${unit}`:'',!used.has(`${x-1},${y}`)?`M${a},${b}v${unitY}`:''].join('');}).join('');
  return `<svg class="connected-piece" viewBox="-2 -2 ${w+4} ${h+4}" aria-hidden="true"><path d="${fill}" fill="${color}"/><path d="${border}" fill="none" stroke="${outline}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"/>${hitCells?cells.map(([x,y])=>`<rect data-piece-x="${x}" data-piece-y="${y}" x="${x*unit}" y="${y*unitY}" width="${unit}" height="${unitY}" fill="transparent"/>`).join(''):''}</svg>`;
 }
 window.DinoBlocks={joins,svg};
})();
