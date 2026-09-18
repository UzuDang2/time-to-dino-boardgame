// Food recipe and cooking UI regressions; Node standard library only.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const game=__dirname;
const E=require(path.join(game,'engine.js'));
const context={window:{DinoEngine:E}};
vm.runInNewContext(fs.readFileSync(path.join(game,'cooking-ui.js'),'utf8'),context);
const UI=context.window.DinoCookingUI;
const plain=value=>JSON.parse(JSON.stringify(value));

function fixture(kinds=[],{field=false,kitchen=false}={}) {
  const g=E.newGame({players:1,seed:182});g.loot=[];
  const p=E.active(g);p.hand=['explore','gather','harvest','hide'];
  if(field){g.tiles['1,0']={terrain:'forest',level:1,resources:[],resourcePlan:[],groundItems:[],safe:false};p.pos='1,0';}
  if(kitchen)p.boards.find(b=>b.id==='kitchen').complete=true;
  for(const kind of kinds)assert(E.addItem(g,p,kind),'Fixture must fit '+kind);
  return g;
}
const ids=(g,kind)=>E.active(g).bag.filter(i=>i.kind===kind).map(i=>i.id);
function completePayment(g) {
  for(const [kind,n]of Object.entries(g.payment.cost)) {
    const required=g.payment.requiredIds.filter(id=>E.active(g).bag.find(i=>i.id===id)?.kind===kind);
    const offered=[...required,...ids(g,kind).filter(id=>!required.includes(id))].slice(0,n);
    for(const id of offered)E.act(g,'offerPayment',{id});
  }
  E.act(g,'commitPayment');
}
function unchangedReject(g,type,data) {
  const before=JSON.stringify(g);assert.throws(()=>E.act(g,type,data));assert.equal(JSON.stringify(g),before);
}

for(const [raw,cooked,food]of [['fish','cookedFish',3],['meat','cookedMeat',2],['mushroom','cookedMushroom',2]]) {
  test('field cooking '+raw+' flips one identity in its original bag slot',()=>{
    const g=fixture([raw,'branch'],{field:true}),item={...E.active(g).bag[0]};
    E.act(g,'cook',{card:0,items:[item.id]});assert.equal(g.actions,2);assert.equal(E.active(g).hand.length,4);
    completePayment(g);const result=E.active(g).bag[0];
    assert.equal(result.id,item.id);assert.deepEqual([result.x,result.y],[item.x,item.y]);assert.equal(result.kind,cooked);assert.equal(E.foodValue(result),food);
    assert.equal(g.actions,2);assert.equal(E.active(g).hand.length,3);assert.equal(ids(g,'branch').length,0);assert.equal(g.loot.length,0);
  });
}

test('camp two-item batch costs two distinct cards, one AP and one fuel',()=>{
  const g=fixture(['fish','fish','branch']),items=ids(g,'fish');
  unchangedReject(g,'cook',{card:0,items});unchangedReject(g,'cook',{cards:[0,0],items});
  unchangedReject(g,'cook',{cards:[0,1],items:[items[0],items[0]]});
  E.act(g,'cook',{cards:[0,2],items});assert.deepEqual(g.payment.cards,[0,2]);assert.equal(g.payment.cost.branch,1);
  completePayment(g);assert.equal(g.actions,2);assert.deepEqual(E.active(g).hand,['gather','hide']);
  assert.deepEqual(ids(g,'cookedFish'),items);assert.equal(ids(g,'branch').length,0);
});

test('kitchen preserves three-item batch while base camp and field enforce their limits',()=>{
  const g=fixture(['fish','meat','mushroom','branch']),items=E.active(g).bag.filter(i=>i.kind!=='branch').map(i=>i.id);
  unchangedReject(g,'cook',{cards:[0,1,2],items});
  E.active(g).boards.find(b=>b.id==='kitchen').complete=true;
  unchangedReject(g,'cook',{cards:[0,1],items});
  E.act(g,'cook',{cards:[0,1,2],items});completePayment(g);
  assert.equal(E.active(g).hand.length,1);assert.equal(g.actions,2);assert.equal(E.active(g).bag.length,3);
  const field=fixture(['fish','meat','branch'],{field:true,kitchen:true});
  unchangedReject(field,'cook',{cards:[0,1],items:ids(field,'fish').concat(ids(field,'meat'))});
});

for(const [kind,food]of [['berry',2],['water',2],['cookedFish',4],['cookedMeat',3],['cookedMushroom',3]]) {
  test('paid herb combination '+kind+' keeps base and topping IDs',()=>{
    const g=fixture([kind,'herb'],{field:true}),base={...E.active(g).bag[0]},herb={...E.active(g).bag[1]};
    E.act(g,'beginPayment',{type:'combineFood',data:{card:1,source:herb.id,target:base.id}});
    assert.equal(g.actions,2);assert.equal(E.active(g).bag.length,2);completePayment(g);
    const result=E.active(g).bag[0];assert.equal(result.id,base.id);assert.equal(result.topping.id,herb.id);assert.equal(E.foodValue(result),food);
    assert.deepEqual([result.x,result.y],[base.x,base.y]);assert.equal(g.actions,2);assert.equal(E.active(g).hand.length,3);
    E.act(g,'splitFood',{id:base.id,x:herb.x,y:herb.y});
    assert.equal(g.actions,2);assert.equal(E.active(g).hand.length,3);assert.equal(E.active(g).bag.length,2);assert.equal(E.active(g).bag.find(i=>i.kind==='herb').id,herb.id);
  });
}

test('legacy stackFood cannot bypass costs; reverse drop preserves the base ID at target coordinates',()=>{
  const g=fixture(['berry','herb'],{field:true}),base={...E.active(g).bag[0]},herb={...E.active(g).bag[1]};
  unchangedReject(g,'stackFood',{source:base.id,target:herb.id});
  E.act(g,'stackFood',{card:0,source:base.id,target:herb.id});
  assert.equal(g.payment.type,'combineFood');assert.equal(E.active(g).bag.length,2);
  completePayment(g);const result=E.active(g).bag[0];
  assert.equal(result.id,base.id);assert.deepEqual([result.x,result.y],[herb.x,herb.y]);assert.equal(result.topping.id,herb.id);assert.equal(g.actions,2);
});

test('wrong same-kind ingredients cannot replace selected identities; partial payment cancels free',()=>{
  const g=fixture(['berry','berry','herb']),before=plain(E.active(g));
  E.act(g,'combineFood',{card:0,source:ids(g,'herb')[0],target:ids(g,'berry')[0]});
  unchangedReject(g,'offerPayment',{id:ids(g,'berry')[1]});
  E.act(g,'offerPayment',{id:ids(g,'herb')[0]});
  unchangedReject(g,'commitPayment',{});
  E.act(g,'cancelPayment');assert.deepEqual(E.active(g),before);assert.equal(g.actions,2);assert.equal(g.payment,null);
});

test('battle and unresolved action phases reject cooking without modifying state',()=>{
  for(const phase of ['battle','pendingDeparture','pendingEvent','pendingExplore','tileSetup','gathering','payment']) {
    const g=fixture(['fish','branch','berry','herb'],{field:true});g[phase]={};
    unchangedReject(g,'cook',{card:0,items:ids(g,'fish')});
    unchangedReject(g,'combineFood',{card:0,source:ids(g,'herb')[0],target:ids(g,'berry')[0]});
  }
});

test('new cooking payment survives save migration; old underpaid batches cancel without loss',()=>{
  let g=fixture(['fish','fish','branch']);E.act(g,'cook',{cards:[0,1],items:ids(g,'fish')});
  E.act(g,'offerPayment',{id:ids(g,'branch')[0]});const saved=plain(g.payment);g=E.migrateSave(g);
  assert.deepEqual(g.payment,saved);assert.equal(g.actions,2);
  g.payment.data={card:0,items:ids(g,'fish')};g.payment.cards=[0];g=E.migrateSave(g);
  assert.equal(g.payment,null);assert.equal(E.active(g).bag.length,3);assert.equal(E.active(g).hand.length,4);assert.equal(g.actions,2);
});

test('batchRecipe returns exact ingredient IDs, fixed fuel, quantities and legal availability',()=>{
  const g=fixture(['fish','fish','fish','branch','berry','herb']);
  assert.equal(UI.recipes(g).filter(r=>r.group==='food').length,8);assert.equal(UI.recipes(g).length,13);
  const batch=UI.batchRecipe(g,'cook-fish',2);
  assert.equal(batch.available,true);assert.deepEqual(plain(batch.inputs),[['fish',2],['branch',1]]);
  assert.deepEqual(plain(batch.data.items),ids(g,'fish').slice(0,2));assert.equal(batch.output.amount,2);
  assert.equal(UI.batchRecipe(g,'cook-fish',3).available,false);
  E.active(g).boards.find(b=>b.id==='kitchen').complete=true;assert.equal(UI.batchRecipe(g,'cook-fish',3).available,true);
  assert.equal(UI.batchRecipe(g,'combine-berry-herb',2).available,false);
  assert.equal(UI.batchRecipe(g,'cook-fish',0).available,false);assert.equal(UI.batchRecipe(g,'cook-fish',1.5).available,false);
  E.active(g).pos='1,0';assert.equal(UI.batchRecipe(g,'cook-fish',2).available,false);
});

test('cooking render exposes batch controls and requires exactly matching hand count',()=>{
  const g=fixture(['fish','fish','fish','branch'],{kitchen:true}),art={icon:()=>'<svg></svg>',itemShape:()=>'<svg></svg>',cardMarkup:(c,i)=>`<button class="action-card" data-card="${i}" aria-pressed="false">${c}</button>`};
  let html=UI.render(g,{cookingRecipe:'cook-fish',cookingCount:3,cookingCards:[0,1]},art);
  assert.match(html,/data-count="3"/);assert.match(html,/data-do="cooking-submit" disabled/);assert.match(html,/손패 <b>3장/);
  html=UI.render(g,{cookingRecipe:'cook-fish',cookingCount:3,cookingCards:[0,1,2]},art);
  assert.doesNotMatch(html,/data-do="cooking-submit" disabled/);assert.equal((html.match(/cooking-card-order/g)||[]).length,3);
  assert.equal((html.match(/data-do="cooking-recipe"/g)||[]).length,8);
});
