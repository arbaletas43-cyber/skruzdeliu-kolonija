'use strict';
// ===== Skruzdėlynas =====
const C=16, W=80, H=110, ROWS=H+1, SKY=18, GY=SKY*C, WW=W*C, WH=GY+H*C, OS=1.5;
const SAVE_KEY='skruzdelynas_v1';
const LAYERS=[
 {name:'Minkšta žemė',from:0,hard:1.2,lvl:1,col:'#b5845a',dark:'#94673f',peb:'#c99b70'},
 {name:'Molis',from:25,hard:2.6,lvl:2,col:'#a9653f',dark:'#874c2b',peb:'#c07b54'},
 {name:'Akmuo',from:50,hard:4.5,lvl:4,col:'#8a8079',dark:'#6c635d',peb:'#a59b93'},
 {name:'Gelmės',from:80,hard:7,lvl:6,col:'#5e4a6b',dark:'#463554',peb:'#7a6390'}];
const LVL_THR=[0,6,10,16,24,32,42,55,70,90,115,140];
const ANT={w:{name:'Darbininkė',cost:5,lvl:1,hp:10,spd:2.4,eat:0.6},
           s:{name:'Kareivė',cost:10,lvl:2,hp:30,spd:2.2,eat:1},
           c:{name:'Žvalgė',cost:8,lvl:3,hp:8,spd:3.2,eat:0.8}};
const FOODT={crumb:{n:'Trupinys',amt:4,need:1},seed:{n:'Sėkla',amt:6,need:1},berry:{n:'Uoga',amt:12,need:2},
             beetle:{n:'Vabalas',amt:30,need:3},spider:{n:'Voras',amt:24,need:2}};
const ROOMN={1:'Karalienės urvas',2:'Sandėlis',3:'Peryklė',4:'Poilsis'};
const EGG_T=20, LARVA_T=30, LAY_T=7;

function layerOf(gy){for(let i=3;i>=0;i--) if(gy>=LAYERS[i].from) return i; return 0;}
const idx=(gx,row)=>row*W+gx;
const gxOf=i=>i%W, rowOf=i=>(i/W)|0;
function hash(a,b,s){let h=(a*374761393+b*668265263+s*2147483647)|0;h=Math.imul(h^(h>>>13),1274126177);h^=h>>>16;return (h>>>0)/4294967296;}
function treasureAt(gx,gy){const L=layerOf(gy);if(L===0)return 0;const r=hash(gx,gy,S.seed+7);
  if(L===1&&r<0.025)return 8; if(L===2&&r<0.04)return 20; if(L===3&&r<0.06)return 45; return 0;}
const rnd=(a,b)=>a+Math.random()*(b-a);

// ===== State =====
let S, dug, room, queued, digProg, revealed;
let ants=[], brood=[], items=[], enemies=[], bird=null, rooms=[];
let caps={food:60,nurs:2,pop:6};
let digTaken=new Set(), dugList=[];
let queen={x:0,y:0,phase:0};

function newGame(){
  S={seed:(Math.random()*1e9)|0,food:40,t:0,level:1,prod:'w',nextId:1,layT:0,spawnT:2,starve:0,
     weather:{phase:'clear',t:200+Math.random()*120},enemyT:150,birdT:240,tut:0,hints:{}};
  dug=new Uint8Array(W*ROWS); room=new Uint8Array(W*ROWS); queued=new Uint8Array(W*ROWS); digProg=new Float32Array(W*ROWS);
  revealed=new Uint8Array(W);
  for(let x=0;x<W;x++){dug[idx(x,0)]=1; if(Math.abs(x-40)<=11)revealed[x]=1;}
  const d=(gx,gy)=>dug[idx(gx,gy+1)]=1;
  [[40,0],[40,1],[40,2],[41,2],[41,3],[41,4],[41,5]].forEach(([a,b])=>d(a,b));
  for(let x=37;x<=44;x++)for(let y=6;y<=10;y++){
    if((x===37||x===44)&&(y===6||y===10))continue; d(x,y); room[idx(x,y+1)]=1;}
  ants=[];brood=[];items=[];enemies=[];bird=null;
  for(let k=0;k<4;k++)addAnt('w',cx(38+k*2),cy(9));
  for(let k=0;k<3;k++)spawnFood(true);
  afterLoad();
}
function cx(gx){return gx*C+C/2}
function cy(gy){return GY+gy*C+C/2}
function addAnt(t,x,y){const a={id:S.nextId++,t,x,y,hp:ANT[t].hp,path:[],st:'idle',wait:rnd(0,2),job:null,carry:0,ct:null,phase:Math.random()*6,ang:Math.random()*6,ox:rnd(-4,4),oy:rnd(-4,4)};ants.push(a);return a;}

function afterLoad(){
  queued.fill(0);digProg.fill(0);if(S.queue)S.queue.forEach(i=>queued[i]=1);
  rebuildRooms(); rebuildDugList(); buildSoil(); digTaken.clear();
  const q=rooms.find(r=>r.type===1); if(q){queen.x=q.cx;queen.y=q.cy+2;}
  items.forEach(it=>{it.ass=[];it.arr=[];});
  ants.forEach(a=>{a.path=[];a.st='idle';a.job=null;a.wait=rnd(0,1);const c=cellAt(a.x,a.y); if(!dug[c]){const h=randomHomeCell(); a.x=cxi(h);a.y=cyi(h);}
    if(a.carry>0){const h=cellAt(a.x,a.y);a.job={k:'carry',big:false};a.st='carry';
      a.path=bfs(h,c=>room[c]===2,false)||bfs(h,c=>room[c]===1,false)||[];}else{a.carry=0;a.ct=null;} });
}
function rebuildDugList(){dugList=[];for(let i=W;i<W*ROWS;i++)if(dug[i])dugList.push(i);}
function rebuildRooms(){
  rooms=[];const seen=new Uint8Array(W*ROWS);
  for(let i=W;i<W*ROWS;i++){if(!room[i]||seen[i])continue;const t=room[i],cells=[],st=[i];seen[i]=1;
    while(st.length){const c=st.pop();cells.push(c);for(const n of nb4(c))if(n>=W&&!seen[n]&&room[n]===t){seen[n]=1;st.push(n);}}
    let sx=0,sy=0,top=1e9;cells.forEach(c=>{sx+=cxi(c);sy+=cyi(c);top=Math.min(top,cyi(c));});
    const r={type:t,cells,cx:sx/cells.length,cy:sy/cells.length,top};
    // tag at a cell nearest to centroid
    let best=cells[0],bd=1e9;cells.forEach(c=>{const d=(cxi(c)-r.cx)**2+(cyi(c)-r.cy)**2;if(d<bd){bd=d;best=c;}});
    r.cx=cxi(best);r.cy=cyi(best);rooms.push(r);}
  let nS=0,nN=0,nR=0;for(let i=W;i<W*ROWS;i++){if(room[i]===2)nS++;else if(room[i]===3)nN++;else if(room[i]===4)nR++;}
  caps.food=60+nS*5; caps.nurs=2+Math.floor(nN/4); caps.pop=6+Math.floor(nR/2);
}
function nb4(i){const x=gxOf(i),r=[];if(x>0)r.push(i-1);if(x<W-1)r.push(i+1);if(i>=W)r.push(i-W);if(i<W*(ROWS-1))r.push(i+W);return r;}
function cxi(i){return gxOf(i)*C+C/2}
function cyi(i){const r=rowOf(i);return r===0?GY-6:GY+(r-1)*C+C/2}
function cellAt(x,y){const gx=Math.max(0,Math.min(W-1,Math.floor(x/C)));if(y<GY)return idx(gx,0);
  const r=Math.max(1,Math.min(ROWS-1,Math.floor((y-GY)/C)+1));return idx(gx,r);}

// ===== Path finding =====
const prev=new Int32Array(W*ROWS), seenB=new Int32Array(W*ROWS); let bfsGen=1;
function passable(i,noSurf){return dug[i]&&!(noSurf&&i<W);}
function bfs(start,goal,noSurf,maxN){
  bfsGen++;const q=[start];seenB[start]=bfsGen;prev[start]=-1;let h=0;
  if(goal(start))return [];
  while(h<q.length){const c=q[h++];if(maxN&&h>maxN)return null;
    const x=gxOf(c);
    const ns=[c-W,c+W,x>0?c-1:-1,x<W-1?c+1:-1];
    for(const n of ns){if(n<0||n>=W*ROWS||seenB[n]===bfsGen)continue;
      if(!passable(n,noSurf))continue;
      seenB[n]=bfsGen;prev[n]=c;
      if(goal(n)){const p=[];let k=n;while(k!==start){p.push(k);k=prev[k];}return p.reverse();}
      q.push(n);}}
  return null;
}
function randomHomeCell(){ // a cell inside a room or any dug underground
  const pool=rooms.length?rooms[(Math.random()*rooms.length)|0].cells:dugList;
  return pool[(Math.random()*pool.length)|0]||dugList[0];
}

// ===== Soil rendering (offscreen) =====
let soil, sctx;
function buildSoil(){
  soil=document.createElement('canvas');soil.width=WW*OS;soil.height=(H*C)*OS;sctx=soil.getContext('2d');
  drawRegion(0,0,W-1,H-1);
}
function drawRegion(x0,y0,x1,y1){
  x0=Math.max(0,x0);y0=Math.max(0,y0);x1=Math.min(W-1,x1);y1=Math.min(H-1,y1);
  const g=sctx;g.save();g.setTransform(OS,0,0,OS,0,0);
  g.beginPath();g.rect(x0*C,y0*C,(x1-x0+1)*C,(y1-y0+1)*C);g.clip();
  for(let L=0;L<4;L++){const a=LAYERS[L].from,b=L<3?LAYERS[L+1].from:H;
    if(b<=y0||a>y1+1)continue;g.fillStyle=LAYERS[L].col;g.fillRect(x0*C,Math.max(a,y0)*C,(x1-x0+1)*C,(Math.min(b,y1+1)-Math.max(a,y0))*C);}
  // wavy layer borders
  for(let L=1;L<4;L++){const a=LAYERS[L].from;if(a<y0-1||a>y1+2)continue;
    g.fillStyle=LAYERS[L].dark;g.beginPath();g.moveTo(x0*C-C,a*C);
    for(let x=x0-1;x<=x1+1;x++){g.lineTo(x*C+C/2,a*C+Math.sin(x*1.3)*2.5);}g.lineTo((x1+2)*C,a*C+5);g.lineTo(x0*C-C,a*C+5);g.fill();}
  // pebbles & treasures
  for(let gy=y0-1;gy<=y1+1;gy++)for(let gx=x0-1;gx<=x1+1;gx++){if(gy<0||gy>=H||gx<0||gx>=W)continue;
    const L=layerOf(gy),r=hash(gx,gy,S.seed);
    if(r<(L===2?0.16:0.07)){const px=gx*C+hash(gx,gy,3)*C,py=gy*C+hash(gx,gy,5)*C,s=2+hash(gx,gy,9)*(L===2?4:2.5);
      g.fillStyle=LAYERS[L].peb;g.beginPath();g.ellipse(px,py,s*1.3,s,hash(gx,gy,11)*3,0,7);g.fill();}
    if(!dug[idx(gx,gy+1)]){const t=treasureAt(gx,gy);if(t)drawTreasure(g,gx*C+C/2,gy*C+C/2,L);}
  }
  // labels
  for(let L=1;L<4;L++){const a=LAYERS[L].from;if(a<y0-2||a>y1+2||x0>8)continue;
    g.fillStyle='rgba(255,255,255,.55)';g.font='bold 9px -apple-system,sans-serif';g.fillText(LAYERS[L].name+' · '+LAYERS[L].lvl+' lyg.',6,a*C+15);}
  // tunnels
  const cells=[];for(let gy=y0-2;gy<=y1+2;gy++)for(let gx=x0-2;gx<=x1+2;gx++){if(gy<0||gy>=H||gx<0||gx>=W)continue;if(dug[idx(gx,gy+1)])cells.push([gx,gy]);}
  const pass=(rad,col)=>{g.fillStyle=col;g.strokeStyle=col;g.lineWidth=rad*2;g.lineCap='round';
    for(const [gx,gy] of cells){const x=gx*C+C/2,y=gy*C+C/2,j=1+(hash(gx,gy,21)-.5)*0.12;
      g.beginPath();g.arc(x,y,rad*j,0,7);g.fill();
      if(gy===0){g.fillRect(x-rad*0.8,-4,rad*1.6,y+4);}
      const R=gx<W-1&&dug[idx(gx+1,gy+1)],D=gy<H-1&&dug[idx(gx,gy+2)];
      if(R){g.beginPath();g.moveTo(x,y);g.lineTo(x+C,y);g.stroke();}
      if(D){g.beginPath();g.moveTo(x,y);g.lineTo(x,y+C);g.stroke();}
      if(R&&D&&dug[idx(gx+1,gy+2)])g.fillRect(x,y,C,C);
      else if(gx<W-1&&gy<H-1&&dug[idx(gx+1,gy+2)]&&(R||D)){g.beginPath();g.moveTo(x,y);g.lineTo(x+C,y+C);g.stroke();}
      if(gx>0&&gy<H-1&&dug[idx(gx-1,gy+2)]&&(D||dug[idx(gx-1,gy+1)])){g.beginPath();g.moveTo(x,y);g.lineTo(x-C,y+C);g.stroke();}
    }};
  pass(C*0.86,'rgba(60,35,20,.25)');
  pass(C*0.74,'#dcc7a3');
  pass(C*0.6,'#f3e7d0');
  g.restore();
}
function drawTreasure(g,x,y,L){
  if(L===1){g.fillStyle='#e8c66a';g.beginPath();g.ellipse(x,y,4,2.6,0.5,0,7);g.fill();g.strokeStyle='#a8842f';g.lineWidth=1;g.stroke();}
  else if(L===2){g.fillStyle='#f4efe6';g.fillRect(x-1.5,y,3,4);g.fillStyle='#d9534f';g.beginPath();g.arc(x,y,4.5,Math.PI,0);g.fill();
    g.fillStyle='#fff';g.beginPath();g.arc(x-1.8,y-2,1,0,7);g.arc(x+1.8,y-1.5,0.9,0,7);g.fill();}
  else {g.fillStyle='#7fe3ff';g.beginPath();g.moveTo(x,y-6);g.lineTo(x+4,y-1);g.lineTo(x,y+5);g.lineTo(x-4,y-1);g.closePath();g.fill();
    g.fillStyle='rgba(255,255,255,.7)';g.beginPath();g.moveTo(x,y-6);g.lineTo(x+1.5,y-1);g.lineTo(x-1,y-1);g.fill();}
}

// ===== Food =====
function spawnFood(nearOnly){
  const maxI=Math.min(12,4+ants.filter(a=>a.t==='c').length+Math.floor(S.level/2));
  const vis=items.filter(i=>revealed[i.x]).length,hid=items.length-vis;
  let near=nearOnly||Math.random()<0.6;if(near&&vis>=maxI)near=false;if(!near&&hid>=6)near=true;if(near&&vis>=maxI)return;
  let x;if(near){const rv=[];for(let i=2;i<W-2;i++)if(revealed[i])rv.push(i);x=rv[(Math.random()*rv.length)|0];}
  else x=2+((Math.random()*(W-4))|0);
  if(items.some(it=>Math.abs(it.x-x)<2)||Math.abs(x-40)<2)return;
  const r=Math.random();let t=r<0.4?'crumb':r<0.7?'seed':r<0.9?'berry':'beetle';if(t==='beetle'&&S.level<2)t='berry';
  items.push({id:S.nextId++,x,t,amt:FOODT[t].amt,need:FOODT[t].need,mk:false,age:0,ass:[],arr:[]});
}

// ===== Helpers =====
function toast(msg,cls,key){if(key){if(S.hints[key])return;S.hints[key]=1;}
  const el=document.createElement('div');el.className='toast '+(cls||'');el.textContent=msg;const box=document.getElementById('toasts');
  box.appendChild(el);while(box.children.length>3)box.firstChild.remove();setTimeout(()=>el.remove(),3200);}
let lastToast={};function toastT(key,msg,cls,sec){const n=performance.now();if(lastToast[key]&&n-lastToast[key]<(sec||8)*1000)return;lastToast[key]=n;toast(msg,cls);}
function surfDanger(){return S.weather.phase==='rain'||enemies.length>0||!!bird;}
function onSurface(a){return a.y<GY;}
function abortJob(a){
  if(a.job&&a.job.k==='food'){const it=items.find(i=>i.id===a.job.id);if(it){it.ass=it.ass.filter(x=>x!==a.id);it.arr=it.arr.filter(x=>x!==a.id);}}
  if(a.job&&a.job.k==='dig')digTaken.delete(a.job.c);
  a.job=null;
}
function goHome(a){abortJob(a);const p=bfs(cellAt(a.x,a.y),c=>c>=2*W&&dug[c]&&!queued[c],false);a.path=p||[];a.st='home';}
function digMult(){return 1+0.25*Math.max(0,S.level-3);}
function popNow(){return ants.length;}

// ===== AI =====
function assign(a){
  const here=cellAt(a.x,a.y),danger=surfDanger();
  if(a.t==='w'){
    // food fetch
    if(!danger&&S.food<caps.food-2){
      let best=null,bd=1e9;for(const it of items){if(!it.mk||!revealed[it.x]||it.ass.length>=it.need)continue;
        const d=Math.abs(it.x-gxOf(here))+rowOf(here)*1.5;if(d<bd){bd=d;best=it;}}
      if(best){const tgt=idx(best.x,0);const p=bfs(here,c=>c===tgt,false);
        if(p){best.ass.push(a.id);a.job={k:'food',id:best.id};a.path=p;a.st='toFood';return;}}
    }
    // dig
    let pick=-1;
    const p=bfs(here,c=>{if(danger&&c<W)return false;for(const n of nb4(c)){if(n>=W&&queued[n]&&!digTaken.has(n)&&layerOk(n)){pick=n;return true;}}return false;},false);
    if(p&&pick>=0){digTaken.add(pick);a.job={k:'dig',c:pick};a.path=p;a.st='toDig';return;}
  }
  if(a.t==='s'){
    const e=enemies[0]||(bird&&ants.find(b=>b.id===bird.tid));
    if(e&&S.weather.phase!=='rain'){const tgt=cellAt(e.x,GY-6);const p=bfs(here,c=>c===tgt,false);if(p){a.path=p;a.st='fight';a.wait=1;return;}}
  }
  if(a.t==='c'&&!danger&&S.weather.phase!=='clouds'){
    const gx=gxOf(here);let tx=-1;
    for(let d=0;d<W;d++){if(gx-d>=1&&!revealed[gx-d]){tx=gx-d;break;}if(gx+d<W-1&&!revealed[gx+d]){tx=gx+d;break;}}
    if(tx<0)tx=2+((Math.random()*(W-4))|0);
    const tgt=idx(tx,0);const p=bfs(here,c=>c===tgt,false);if(p){a.path=p;a.st='scout';return;}
  }
  // wander
  let tgt=-1;for(let k=0;k<10;k++){const c=randomHomeCell();if(c&&Math.abs(gxOf(c)-gxOf(here))+Math.abs(rowOf(c)-rowOf(here))<26){tgt=c;break;}}
  if(tgt<0)tgt=randomHomeCell();
  const p=bfs(here,c=>c===tgt,true);a.path=p||[];a.st='idle';a.wait=rnd(1.5,4);
}
function layerOk(i){return LAYERS[layerOf(rowOf(i)-1)].lvl<=S.level;}

function updAnt(a,dt){
  if(a.path.length){
    const t=a.path[0];const sur=t<W;const tx=cxi(t)+(sur?0:a.ox),ty=cyi(t)+(sur?0:a.oy);
    const dx=tx-a.x,dy=ty-a.y,d=Math.hypot(dx,dy);let sp=ANT[a.t].spd*C*dt;if(a.carry&&a.job&&a.job.big)sp*=0.6;
    if(d<=sp){a.x=tx;a.y=ty;a.path.shift();}else{a.x+=dx/d*sp;a.y+=dy/d*sp;}
    if(d>0.1){const ta=Math.atan2(dy,dx);let da=ta-a.ang;while(da>Math.PI)da-=6.283;while(da<-Math.PI)da+=6.283;a.ang+=da*Math.min(1,dt*12);}
    a.phase+=sp*0.7;
    if(a.st==='scout'&&a.y<GY){const gx=Math.floor(a.x/C);for(let k=-5;k<=5;k++){const x=gx+k;if(x>=0&&x<W&&!revealed[x]){revealed[x]=1;}}}
    if(a.st==='fight'){a.wait-=dt;if(a.wait<0)a.path=[];}
    return;
  }
  // arrived
  switch(a.st){
    case 'toFood':{const it=items.find(i=>i.id===a.job.id);if(!it){a.job=null;a.st='idle';a.wait=0;break;}
      if(!it.arr.includes(a.id))it.arr.push(a.id);a.st='waitFood';a.wait=0;break;}
    case 'waitFood':{const it=items.find(i=>i.id===(a.job&&a.job.id));if(!it){a.job=null;a.st='idle';break;}
      a.phase+=dt*3;
      if(it.arr.length>=it.need){const share=it.amt/it.need;
        it.arr.forEach(id=>{const b=ants.find(x=>x.id===id);if(!b)return;b.carry=share;b.ct=it.t;b.job={k:'carry',big:it.need>1};
          const p=bfs(cellAt(b.x,b.y),c=>room[c]===2,false)||bfs(cellAt(b.x,b.y),c=>room[c]===1,false);b.path=p||[];b.st='carry';});
        items.splice(items.indexOf(it),1);}
      break;}
    case 'carry':{const add=Math.min(a.carry,caps.food-S.food);S.food+=Math.max(0,add);
      if(add<a.carry-0.01)toastT('full','Sandėlis pilnas! Iškask ir paskirk daugiau sandėlių.','warn',15);
      a.carry=0;a.ct=null;a.job=null;a.st='idle';a.wait=0.3;break;}
    case 'toDig':a.st='digging';break;
    case 'digging':{const c=a.job.c;if(!queued[c]){abortJob(a);a.st='idle';break;}
      const L=layerOf(rowOf(c)-1);digProg[c]+=dt*digMult()/LAYERS[L].hard;a.phase+=dt*8;
      const dx=cxi(c)-a.x,dy=cyi(c)-a.y;a.ang=Math.atan2(dy,dx);
      if(Math.random()<dt*6)parts.push({x:a.x+dx*0.6,y:a.y+dy*0.6,vx:rnd(-20,20),vy:rnd(-30,0),l:0.5,c:LAYERS[L].peb});
      if(digProg[c]>=1){completeDig(c);abortJob(a);a.st='idle';a.wait=0;}
      break;}
    case 'scout':{a.st='scoutRest';a.wait=rnd(1.5,3);break;}
    case 'scoutRest':{a.wait-=dt;if(a.wait<=0){const h=randomHomeCell();a.path=bfs(cellAt(a.x,a.y),c=>c===h,false)||[];a.st='idle';a.wait=rnd(4,7);}break;}
    case 'fight':{a.st='idle';a.wait=0;break;}
    case 'home':{a.st='idle';a.wait=rnd(1,3);break;}
    default:{a.wait-=dt;if(a.wait<=0)assign(a);}
  }
}
function completeDig(c){
  dug[c]=1;queued[c]=0;digProg[c]=0;digTaken.delete(c);dugList.push(c);
  const gx=gxOf(c),gy=rowOf(c)-1;const t=treasureAt(gx,gy);
  if(t){const add=Math.min(t,caps.food-S.food);S.food+=Math.max(0,add);
    toast((gy>=80?'💎 Gelmių medus':gy>=50?'🍄 Grybas':'🌰 Sėkla')+' +'+t+' maisto!','good');fx.push({x:cxi(c),y:cyi(c),txt:'+'+t,l:1.5});}
  if(gy===0&&gxOf(c)!==40)toast('Naujas įėjimas į paviršių!','good','entr'+gx);
  drawRegion(gx-2,gy-2,gx+2,gy+2);
}

// ===== Simulation =====
let parts=[],fx=[];
function step(dt){
  S.t+=dt;
  // eating
  let eat=1;for(const a of ants)eat+=ANT[a.t].eat;for(const b of brood)if(b.st===1)eat+=0.5;
  S.food-=eat*dt/60;
  if(S.food<0){S.starve+=-S.food;S.food=0;
    if(S.starve>=3){S.starve=0;if(ants.length>2){let w=ants[0];for(const a of ants)if(a.hp/ANT[a.t].hp<w.hp/ANT[w.t].hp||(a.hp/ANT[a.t].hp===w.hp/ANT[w.t].hp&&a.id>w.id))w=a;
      killAnt(w);toast('Badas! Silpniausia skruzdė mirė iš bado. Rinkite maistą!','warn');}
      else if(brood.length){brood.pop();toast('Badas! Žuvo lerva.','warn');}}}
  else if(S.food>2)S.starve=0;
  // queen lays
  S.layT+=dt;
  if(S.layT>=LAY_T){S.layT=0;const t=S.prod;
    if(t!=='p'&&ANT[t].lvl<=S.level){const cost=ANT[t].cost;
      if(S.food>=cost+1&&brood.length<caps.nurs&&ants.length+brood.length<caps.pop){
        S.food-=cost;const nr=rooms.filter(r=>r.type===3);const pool=(nr.length?nr[(Math.random()*nr.length)|0]:rooms.find(r=>r.type===1)||{cells:dugList}).cells;
        const c=pool[(Math.random()*pool.length)|0];brood.push({t,st:0,tm:0,x:cxi(c)+rnd(-4,4),y:cyi(c)+rnd(-3,4)});}
      else if(brood.length>=caps.nurs)hintOnce('nurs','Peryklė pilna – iškask urvą ir paskirk jį „Peryklė“, kad karalienė dėtų daugiau kiaušinių.');
      else if(ants.length+brood.length>=caps.pop)hintOnce('pop','Pasiekta skruzdžių riba – iškask urvą ir paskirk jį „Poilsis“.');
    }}
  for(let i=brood.length-1;i>=0;i--){const b=brood[i];b.tm+=dt;
    if(b.st===0&&b.tm>=EGG_T){b.st=1;b.tm=0;}
    else if(b.st===1&&b.tm>=LARVA_T){brood.splice(i,1);addAnt(b.t,b.x,b.y);if(!S.hints['born'+b.t]){S.hints['born'+b.t]=1;toast('Išsirito '+ANT[b.t].name.toLowerCase()+'!','good');}}}
  // level
  let L=1;for(let i=0;i<LVL_THR.length;i++)if(ants.length>=LVL_THR[i])L=i+1;
  if(L>S.level){S.level=L;levelUp(L);}
  // food spawn
  S.spawnT-=dt;if(S.spawnT<=0){S.spawnT=rnd(4,7);spawnFood(false);}
  for(let i=items.length-1;i>=0;i--){const it=items[i];it.age+=dt;if(it.age>(revealed[it.x]?300:150)&&!it.mk&&!it.ass.length)items.splice(i,1);}
  weather(dt);enemiesStep(dt);
  for(const a of ants)updAnt(a,dt);
  // regen
  for(const a of ants)if(!onSurface(a))a.hp=Math.min(ANT[a.t].hp,a.hp+dt*0.5);
  queen.phase+=dt;
  for(let i=parts.length-1;i>=0;i--){const p=parts[i];p.l-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=80*dt;if(p.l<=0)parts.splice(i,1);}
  for(let i=fx.length-1;i>=0;i--){fx[i].l-=dt;fx[i].y-=15*dt;if(fx[i].l<=0)fx.splice(i,1);}
}
function hintOnce(k,m){if(S.hints[k])return;S.hints[k]=1;toast(m);}
function levelUp(L){const u={2:'Atrakinta: Kareivės ir Molio sluoksnis!',3:'Atrakinta: Žvalgės!',4:'Atrakinta: Akmens sluoksnis, kasimas greitesnis!',5:'Kasimas dar greitesnis!',6:'Atrakinta: Gelmės su retu maistu!'};
  toast('⭐ Lygis '+L+'! '+(u[L]||'Kasimas greitesnis!'),'good');updateProdButtons();}
function killAnt(a){abortJob(a);const i=ants.indexOf(a);if(i>=0)ants.splice(i,1);
  if(bird&&bird.tid===a.id)bird=null;}

function weather(dt){const w=S.weather;w.t-=dt;
  if(w.phase==='clear'&&w.t<=0){w.phase='clouds';w.t=15;toast('☁ Artėja lietus! Skruzdės greitai slėpsis.','warn');}
  else if(w.phase==='clouds'&&w.t<=0){w.phase='rain';w.t=30;enemies.forEach(e=>e.leave=true);
    ants.forEach(a=>{if(onSurface(a)||(a.job&&a.job.k==='food'))goHome(a);});}
  else if(w.phase==='rain'&&w.t<=0){w.phase='clear';w.t=rnd(240,420);toast('☀ Lietus baigėsi – darbai paviršiuje tęsiasi.','good');}
  const el=document.getElementById('weather');const txt=w.phase==='clouds'?'☁ Artėja lietus ('+Math.ceil(w.t)+' s)':w.phase==='rain'?'🌧 Lyja – darbai paviršiuje sustabdyti ('+Math.ceil(w.t)+' s)':'';
  if(el._t!==txt){el._t=txt;el.innerHTML=txt?'<div>'+txt+'</div>':'';}
}
function enemiesStep(dt){
  const rain=S.weather.phase==='rain';
  if(S.level>=2&&!rain&&!enemies.length){S.enemyT-=dt;if(S.enemyT<=0){S.enemyT=rnd(140,240);
    const left=Math.random()<0.5;enemies.push({x:left?-10:WW+10,y:GY-7,hp:40,life:40,leave:false,dir:left?1:-1,ph:0});
    toast('🕷 Voras paviršiuje! Skruzdės slepiasi, kareivės gina.','warn');
    ants.forEach(a=>{if(a.t!=='s'&&(onSurface(a)||(a.job&&a.job.k==='food')))goHome(a);});
    ants.forEach(a=>{if(a.t==='s'&&a.st==='idle'){a.path=[];a.wait=0;}});}}
  for(let i=enemies.length-1;i>=0;i--){const e=enemies[i];e.life-=dt;e.ph+=dt*10;if(e.life<=0)e.leave=true;
    let tgt=null,td=1e9;if(!e.leave)for(const a of ants){if(!onSurface(a))continue;const d=Math.abs(a.x-e.x);if(d<td){td=d;tgt=a;}}
    let vx;if(e.leave)vx=(e.x<WW/2?-1:1)*40;else if(tgt)vx=Math.sign(tgt.x-e.x)*(td>6?30:0);else vx=Math.sign(40*C-e.x)*20*(Math.abs(40*C-e.x)>60?1:0);
    e.x+=vx*dt;if(vx)e.dir=Math.sign(vx);
    if(tgt&&td<10){tgt.hp-=(tgt.t==='s'?3:5)*dt;if(tgt.hp<=0){killAnt(tgt);toast('Voras sugavo skruzdę!','warn');}}
    for(const a of ants)if(a.t==='s'&&onSurface(a)&&Math.abs(a.x-e.x)<16){e.hp-=8*dt;}
    if(e.hp<=0){enemies.splice(i,1);const gx=Math.max(2,Math.min(W-3,Math.floor(e.x/C)));
      items.push({id:S.nextId++,x:gx,t:'spider',amt:24,need:2,mk:true,age:0,ass:[],arr:[]});revealed[gx]=1;
      toast('⚔ Kareivės nugalėjo vorą! Jis tapo maistu.','good');continue;}
    if(e.leave&&(e.x<-20||e.x>WW+20)){enemies.splice(i,1);toastT('sleft','Voras pasitraukė.','',5);}
  }
  // bird
  if(S.level>=3&&!rain&&!bird){S.birdT-=dt;if(S.birdT<=0){S.birdT=rnd(150,260);
    const cand=ants.filter(a=>onSurface(a)&&a.t!=='s');if(cand.length){const t=cand[(Math.random()*cand.length)|0];
      bird={tid:t.id,t:4,x:t.x};toast('🐦 Paukštis! Slėpkitės!','warn');
      ants.forEach(a=>{if(a.t!=='s'&&(onSurface(a)||(a.job&&a.job.k==='food')))goHome(a);});}}}
  if(bird){const t=ants.find(a=>a.id===bird.tid);bird.t-=dt;if(t)bird.x+=(t.x-bird.x)*Math.min(1,dt*3);
    if(bird.t<=0){if(t&&onSurface(t)){const guard=ants.some(a=>a.t==='s'&&onSurface(a)&&Math.abs(a.x-t.x)<5*C);
        if(guard)toast('⚔ Kareivės nubaidė paukštį!','good');else{killAnt(t);toast('Paukštis pagavo skruzdę!','warn');}}
      bird=null;}}
}

// ===== Rendering =====
const cv=document.getElementById('cv'),ctx=cv.getContext('2d');
let VW=0,VH=0,DPR=1;const cam={x:0,y:0,z:1};
function resize(){DPR=Math.min(2.5,window.devicePixelRatio||1);VW=window.innerWidth;VH=window.innerHeight;cv.width=VW*DPR;cv.height=VH*DPR;clampCam();}
function minZ(){return Math.max(VW/WW,0.45);}
function clampCam(){cam.z=Math.max(minZ(),Math.min(3,cam.z));const vw=VW/cam.z,vh=VH/cam.z;
  cam.x=Math.max(0,Math.min(WW-vw,cam.x));cam.y=Math.max(-40,Math.min(WH+120/cam.z-vh,cam.y));}
function drawAnt(g,x,y,ang,t,ph,carry,ct){
  const s=t==='s'?1.25:t==='c'?0.95:1;const col=t==='s'?'#b2341f':t==='c'?'#2f6fd1':'#2a1d17';
  g.save();g.translate(x,y);g.rotate(ang);g.scale(s,s);
  g.strokeStyle=col;g.lineWidth=0.9;g.lineCap='round';
  for(let i=-1;i<=1;i++){const sw=Math.sin(ph+i*2.1)*1.6*(i===0?1:-1);
    for(const sd of [-1,1]){const sw2=sd>0?sw:-sw;g.beginPath();g.moveTo(i*1.8,0);g.lineTo(i*1.8+sw2+i*1.2,sd*3);g.lineTo(i*2.2+sw2*1.3+i*2,sd*5);g.stroke();}}
  g.beginPath();g.moveTo(5.2,-0.8);g.quadraticCurveTo(7,-2.5,8.6,-3.2);g.moveTo(5.2,0.8);g.quadraticCurveTo(7,2.5,8.6,3.2);g.stroke();
  g.fillStyle=col;
  g.beginPath();g.ellipse(-4.2,0,3.3,2.5,0,0,7);g.fill();
  g.beginPath();g.ellipse(0,0,2,1.4,0,0,7);g.fill();
  g.beginPath();g.ellipse(3.8,0,t==='s'?2.4:1.9,t==='s'?2.1:1.7,0,0,7);g.fill();
  if(t==='s'){g.strokeStyle=col;g.lineWidth=1;g.beginPath();g.moveTo(5.6,-1);g.lineTo(7,-0.2);g.moveTo(5.6,1);g.lineTo(7,0.2);g.stroke();}
  g.fillStyle='rgba(255,255,255,.35)';g.beginPath();g.ellipse(-4.6,-1,1.2,0.7,0,0,7);g.fill();
  if(carry){g.translate(7.5,0);drawFoodIcon(g,ct,0.55);}
  g.restore();
}
function drawFoodIcon(g,t,s){g.save();g.scale(s,s);
  if(t==='crumb'){g.fillStyle='#f1c27d';g.beginPath();g.moveTo(-5,2);g.lineTo(-3,-4);g.lineTo(4,-3);g.lineTo(5,3);g.closePath();g.fill();g.fillStyle='#d9a35b';g.fillRect(-2,-1,2,2);g.fillRect(1,0,2,1.5);}
  else if(t==='seed'){g.fillStyle='#8d5a2b';g.beginPath();g.ellipse(0,0,6,3.6,0.3,0,7);g.fill();g.strokeStyle='#c9965e';g.lineWidth=1;g.beginPath();g.moveTo(-4,-0.5);g.lineTo(4,1);g.stroke();}
  else if(t==='berry'){g.fillStyle='#e0344b';g.beginPath();g.arc(-2,1,4.2,0,7);g.arc(2.5,0,4.2,0,7);g.fill();g.fillStyle='#4caf50';g.beginPath();g.ellipse(0,-4.5,3,1.4,0.3,0,7);g.fill();g.fillStyle='rgba(255,255,255,.6)';g.beginPath();g.arc(-3,-0.5,1.1,0,7);g.fill();}
  else if(t==='beetle'){g.strokeStyle='#1e3d2a';g.lineWidth=1.3;for(const k of [-4,0,4]){g.beginPath();g.moveTo(k,-6);g.lineTo(k-1.5,6);g.stroke();}
    g.fillStyle='#2e7d4f';g.beginPath();g.ellipse(0,0,8,5.5,0,0,7);g.fill();g.fillStyle='#1e3d2a';g.beginPath();g.arc(8,0,3,0,7);g.fill();g.strokeStyle='#1e3d2a';g.beginPath();g.moveTo(-8,0);g.lineTo(8,0);g.stroke();
    g.fillStyle='rgba(255,255,255,.35)';g.beginPath();g.ellipse(-2,-2.5,3,1.3,0,0,7);g.fill();}
  else if(t==='spider'){g.fillStyle='#3a2a3f';g.beginPath();g.ellipse(-2,0,6,5,0,0,7);g.fill();g.beginPath();g.arc(5,0,3.3,0,7);g.fill();}
  g.restore();}
function drawSpider(g,e){g.save();g.translate(e.x,e.y-2);g.scale(e.dir,1);
  g.strokeStyle='#2b1f30';g.lineWidth=1.6;g.lineCap='round';
  for(let i=0;i<4;i++){const sw=Math.sin(e.ph+i*1.4)*2.5;g.beginPath();g.moveTo(1,0);g.lineTo(-4+i*4+sw,-7);g.lineTo(-8+i*6+sw,6);g.stroke();}
  g.fillStyle='#3a2a3f';g.beginPath();g.ellipse(-5,-2,8,6.5,0,0,7);g.fill();g.beginPath();g.arc(5,-1,4.5,0,7);g.fill();
  g.fillStyle='#d64545';g.beginPath();g.arc(7.2,-2.5,1.2,0,7);g.arc(7.6,0,1.1,0,7);g.fill();
  g.fillStyle='#c0392b';g.fillRect(-11,-16,22,3);g.fillStyle='#2ecc71';g.fillRect(-11,-16,22*Math.max(0,e.hp/40),3);g.restore();}
function roomIcon(g,t,x,y){
  g.save();g.translate(x,y);g.fillStyle='rgba(0,0,0,.18)';rr(g,-9,-8,18,18,4);g.fill();
  g.fillStyle=t===1?'#f5b301':t===2?'#ff8c42':t===3?'#e86fa7':'#5aa9e6';rr(g,-9,-9,18,18,4);g.fill();
  g.fillStyle='#fff';g.strokeStyle='#fff';g.lineWidth=1.6;g.lineJoin='round';
  if(t===1){g.beginPath();g.moveTo(-6,4);g.lineTo(-6,-3);g.lineTo(-3,0);g.lineTo(0,-5);g.lineTo(3,0);g.lineTo(6,-3);g.lineTo(6,4);g.closePath();g.fill();}
  else if(t===2){g.beginPath();g.ellipse(-2.5,2,3,2,0.3,0,7);g.ellipse(2.5,2,3,2,-0.3,0,7);g.ellipse(0,-2.5,3,2,0,0,7);g.fill();}
  else if(t===3){g.beginPath();g.ellipse(0,0.5,4,5.5,0,0,7);g.fill();}
  else {g.font='bold 11px -apple-system,sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText('Zz',0,0.5);}
  g.restore();}
function rr(g,x,y,w,h,r){g.beginPath();g.moveTo(x+r,y);g.arcTo(x+w,y,x+w,y+h,r);g.arcTo(x+w,y+h,x,y+h,r);g.arcTo(x,y+h,x,y,r);g.arcTo(x,y,x+w,y,r);g.closePath();}

let clouds=[...Array(6)].map((_,i)=>({x:i*240+rnd(0,120),y:rnd(30,150),s:rnd(0.7,1.3)}));
function render(time){
  const g=ctx;g.setTransform(DPR,0,0,DPR,0,0);g.fillStyle='#3b2a20';g.fillRect(0,0,VW,VH);
  g.setTransform(DPR*cam.z,0,0,DPR*cam.z,-cam.x*cam.z*DPR,-cam.y*cam.z*DPR);
  const vx0=cam.x,vy0=cam.y,vx1=cam.x+VW/cam.z,vy1=cam.y+VH/cam.z;
  const ph=S.weather.phase,dim=ph==='rain'?0.35:ph==='clouds'?0.15:0;
  // sky
  if(vy0<GY){const sg=g.createLinearGradient(0,-40,0,GY);sg.addColorStop(0,'#6cc0ee');sg.addColorStop(1,'#cdeefc');g.fillStyle=sg;g.fillRect(vx0,Math.max(-60,vy0),vx1-vx0,GY-Math.max(-60,vy0)+1);
    g.fillStyle='#ffe27a';g.beginPath();g.arc(WW*0.8,70,26,0,7);g.fill();
    // hills
    g.fillStyle='#a8d98a';g.beginPath();g.moveTo(0,GY);for(let x=0;x<=WW;x+=40)g.lineTo(x,GY-40-Math.sin(x*0.006)*25-Math.sin(x*0.017)*10);g.lineTo(WW,GY);g.fill();
    for(const c of clouds){c.x+=0.08;if(c.x>WW+100)c.x=-150;g.fillStyle=dim?'rgba(150,160,175,.95)':'rgba(255,255,255,.95)';g.beginPath();
      g.arc(c.x,c.y,22*c.s,0,7);g.arc(c.x+25*c.s,c.y-10*c.s,26*c.s,0,7);g.arc(c.x+52*c.s,c.y,20*c.s,0,7);g.rect(c.x,c.y,52*c.s,20*c.s);g.fill();}
    if(dim){g.fillStyle='rgba(60,70,90,'+dim+')';g.fillRect(vx0,Math.max(-60,vy0),vx1-vx0,GY-Math.max(-60,vy0));}
  }
  // soil
  const sy0=Math.max(GY,vy0),sy1=Math.min(WH,vy1);
  if(sy1>sy0){const sx0=Math.max(0,vx0),sx1=Math.min(WW,vx1);
    g.drawImage(soil,sx0*OS,(sy0-GY)*OS,(sx1-sx0)*OS,(sy1-sy0)*OS,sx0,sy0,sx1-sx0,sy1-sy0);}
  // grass with entrance gaps
  const gx0=Math.max(0,Math.floor(vx0/C)),gx1=Math.min(W-1,Math.ceil(vx1/C));
  for(let x=gx0;x<=gx1;x++){const open=dug[idx(x,1)];
    if(open){g.fillStyle='#9b6b42';g.beginPath();g.ellipse(x*C+C/2,GY,C*0.95,5,0,Math.PI,0);g.fill();continue;}
    g.fillStyle='#6abf4b';g.fillRect(x*C,GY-5,C,8);g.fillStyle='#4fa63a';
    for(let k=0;k<4;k++){const bx=x*C+k*4+hash(x,k,1)*2,bh=4+hash(x,k,2)*5;g.beginPath();g.moveTo(bx,GY-4);g.lineTo(bx+1.5,GY-4-bh);g.lineTo(bx+3,GY-4);g.fill();}}
  // queued cells
  for(let x=gx0;x<=gx1;x++)for(let r=Math.max(1,Math.floor((vy0-GY)/C)+1);r<=Math.min(ROWS-1,Math.floor((vy1-GY)/C)+1);r++){const i=idx(x,r);if(!queued[i])continue;
    const X=cxi(i),Y=cyi(i);g.fillStyle=layerOk(i)?'rgba(255,245,220,.45)':'rgba(220,60,60,.45)';g.beginPath();g.arc(X,Y,3.2,0,7);g.fill();
    if(digProg[i]>0){g.strokeStyle='#fff';g.lineWidth=2;g.beginPath();g.arc(X,Y,6,-1.57,-1.57+6.283*digProg[i]);g.stroke();}}
  // rooms: piles, tags
  for(const r of rooms){if(r.cx<vx0-60||r.cx>vx1+60||r.cy<vy0-60||r.cy>vy1+60)continue;
    if(r.type===2){const n=Math.ceil(r.cells.length*Math.min(1,S.food/caps.food)*1.2);
      for(let k=0;k<n&&k<r.cells.length*2;k++){const c=r.cells[k%r.cells.length];const X=cxi(c)+(hash(c,k,4)-.5)*10,Y=cyi(c)+(hash(c,k,6)-.5)*8;
        g.save();g.translate(X,Y);g.rotate(hash(c,k,8)*6);drawFoodIcon(g,['seed','crumb','berry'][k%3],0.6);g.restore();}}
    if(r.type===4){for(let k=0;k<r.cells.length;k+=5){const c=r.cells[k];g.fillStyle='rgba(120,90,60,.15)';g.beginPath();g.ellipse(cxi(c),cyi(c)+3,7,3,0,0,7);g.fill();}}
  }
  // brood
  for(const b of brood){if(b.st===0){g.fillStyle='#fffaf0';g.strokeStyle='#d8c9b0';g.lineWidth=0.6;g.beginPath();g.ellipse(b.x,b.y,2.4,3.2,0.3,0,7);g.fill();g.stroke();}
    else{g.fillStyle='#fdf0dc';g.strokeStyle='#cbb08a';g.lineWidth=0.6;g.beginPath();g.ellipse(b.x,b.y,4.5,2.8,0,0,7);g.fill();g.stroke();
      g.strokeStyle='#e0cba8';for(let k=-2;k<=2;k+=2){g.beginPath();g.moveTo(b.x+k,b.y-2.5);g.lineTo(b.x+k,b.y+2.5);g.stroke();}}}
  // queen
  drawQueen(g);
  for(const r of rooms){if(r.cx<vx0-30||r.cx>vx1+30||r.cy<vy0-30||r.cy>vy1+30)continue;roomIcon(g,r.type,r.cx,r.top-2>GY?r.top+2:r.cy);}
  // items
  for(const it of items){if(!revealed[it.x])continue;const X=it.x*C+C/2,Y=GY-6;
    if(it.mk){g.strokeStyle='#ffcf33';g.lineWidth=2;g.beginPath();g.arc(X,Y,12+Math.sin(time/200)*1.5,0,7);g.stroke();
      if(it.need>1){g.fillStyle='#4a2f1c';g.font='bold 8px -apple-system,sans-serif';g.textAlign='center';g.fillText(it.arr.length+'/'+it.need+' 🐜',X,Y-15);}}
    g.save();g.translate(X,Y);drawFoodIcon(g,it.t,it.t==='beetle'||it.t==='spider'?1:0.9);g.restore();}
  // ants
  for(const a of ants){if(a.x<vx0-12||a.x>vx1+12||a.y<vy0-12||a.y>vy1+12)continue;
    if(onSurface(a)&&ph==='rain'){} drawAnt(g,a.x,a.y,a.ang,a.t,a.phase,a.carry,a.ct);
    if(a.hp<ANT[a.t].hp*0.99&&onSurface(a)){g.fillStyle='#c0392b';g.fillRect(a.x-5,a.y-9,10,1.6);g.fillStyle='#2ecc71';g.fillRect(a.x-5,a.y-9,10*a.hp/ANT[a.t].hp,1.6);}}
  for(const e of enemies)drawSpider(g,e);
  if(bird){const sh=1-bird.t/4;g.fillStyle='rgba(0,0,0,'+(0.15+sh*0.3)+')';g.beginPath();g.ellipse(bird.x,GY-3,10+sh*8,3,0,0,7);g.fill();
    const by=GY-120+sh*100;g.save();g.translate(bird.x,by);g.fillStyle='#455a64';g.beginPath();g.ellipse(0,0,10,6,0,0,7);g.fill();
    const fl=Math.sin(time/80)*8;g.beginPath();g.moveTo(-3,0);g.lineTo(-14,-8+fl);g.lineTo(2,-2);g.fill();g.beginPath();g.moveTo(3,0);g.lineTo(14,-8+fl);g.lineTo(-2,-2);g.fill();
    g.fillStyle='#f39c12';g.beginPath();g.moveTo(9,-1);g.lineTo(15,1);g.lineTo(9,2);g.fill();g.restore();}
  for(const p of parts){g.fillStyle=p.c;g.fillRect(p.x-1,p.y-1,2,2);}
  // fog
  if(vy0<GY){g.fillStyle='rgba(225,232,238,.93)';for(let x=gx0;x<=gx1;x++){if(revealed[x])continue;g.fillRect(x*C,-60,C+0.5,GY+4);}
    g.fillStyle='rgba(255,255,255,.9)';for(let x=gx0;x<=gx1;x++){if(revealed[x])continue;if(x>0&&revealed[x-1]||x<W-1&&revealed[x+1]){for(let k=0;k<6;k++){g.beginPath();g.arc(x*C+C/2,GY-20-k*45,18,0,7);g.fill();}}}
    if(gx0<=gx1){g.fillStyle='rgba(120,130,140,.8)';g.font='bold 10px -apple-system,sans-serif';g.textAlign='center';
      for(let x=gx0;x<=gx1;x+=10)if(!revealed[x]&&!revealed[Math.min(W-1,x+3)])g.fillText('Neištyrinėta',x*C+C*2,GY-30);}}
  if(ph==='rain'){g.strokeStyle='rgba(200,220,255,.7)';g.lineWidth=1;g.beginPath();
    for(let k=0;k<160;k++){const X=vx0+((k*97+time*0.25*(1+k%3))%((vx1-vx0)+50)),Y=Math.max(-60,vy0)+((k*53+time*0.6)%(GY+60));if(Y<GY-4){g.moveTo(X,Y);g.lineTo(X-2,Y+8);}}g.stroke();}
  for(const f of fx){g.fillStyle='rgba(46,139,87,'+Math.min(1,f.l)+')';g.font='bold 12px -apple-system,sans-serif';g.textAlign='center';g.fillText(f.txt,f.x,f.y);}
  // world bottom
  if(vy1>WH){g.fillStyle='#2a1f1a';g.fillRect(vx0,WH,vx1-vx0,vy1-WH);}
}
function drawQueen(g){g.save();g.translate(queen.x,queen.y);const s=Math.sin(queen.phase*2)*0.4;
  g.fillStyle='#7a3b12';g.strokeStyle='#5a2a0c';g.lineWidth=1.2;g.lineCap='round';
  for(let i=-1;i<=1;i++)for(const sd of [-1,1]){g.beginPath();g.moveTo(i*3,0);g.lineTo(i*4+sd*0,sd*5+s);g.lineTo(i*5.5,sd*8);g.stroke();}
  g.beginPath();g.ellipse(-8,0,7.5,5.2,0,0,7);g.fill();g.beginPath();g.ellipse(0,0,3.6,2.6,0,0,7);g.fill();g.beginPath();g.ellipse(5.5,0,3,2.7,0,0,7);g.fill();
  g.beginPath();g.moveTo(8,-1);g.quadraticCurveTo(10,-4,12,-5);g.moveTo(8,1);g.quadraticCurveTo(10,4,12,5);g.stroke();
  g.fillStyle='rgba(255,255,255,.3)';g.beginPath();g.ellipse(-9,-2,3,1.4,0,0,7);g.fill();
  g.fillStyle='#ffd23f';g.beginPath();g.moveTo(3,-3);g.lineTo(3,-7);g.lineTo(5,-5);g.lineTo(6.5,-8);g.lineTo(8,-5);g.lineTo(10,-7);g.lineTo(10,-3);g.closePath();g.fill();
  g.restore();}

// ===== Input =====
let mode='play',brush=1;const ptrs=new Map();let gest=null;
cv.addEventListener('pointerdown',e=>{cv.setPointerCapture(e.pointerId);ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(ptrs.size===1){gest={k:'one',sx:e.clientX,sy:e.clientY,t:performance.now(),moved:false,lx:e.clientX,ly:e.clientY,lastCell:-1,added:0,dirty:false};
    if(mode==='dig'){gest.k='draw';drawAt(e.clientX,e.clientY);}}
  else if(ptrs.size===2){const [a,b]=[...ptrs.values()];gest={k:'pinch',d:Math.hypot(a.x-b.x,a.y-b.y),mx:(a.x+b.x)/2,my:(a.y+b.y)/2};}
});
cv.addEventListener('pointermove',e=>{if(!ptrs.has(e.pointerId))return;ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});if(!gest)return;
  if(gest.k==='pinch'&&ptrs.size>=2){const [a,b]=[...ptrs.values()];const d=Math.hypot(a.x-b.x,a.y-b.y),mx=(a.x+b.x)/2,my=(a.y+b.y)/2;
    const wx=cam.x+gest.mx/cam.z,wy=cam.y+gest.my/cam.z;cam.z*=d/gest.d;cam.z=Math.max(minZ(),Math.min(3,cam.z));cam.x=wx-mx/cam.z;cam.y=wy-my/cam.z;clampCam();gest.d=d;gest.mx=mx;gest.my=my;return;}
  if(gest.k==='one'){if(Math.hypot(e.clientX-gest.sx,e.clientY-gest.sy)>8)gest.moved=true;
    if(gest.moved){cam.x-=(e.clientX-gest.lx)/cam.z;cam.y-=(e.clientY-gest.ly)/cam.z;clampCam();}gest.lx=e.clientX;gest.ly=e.clientY;}
  else if(gest.k==='draw'){const lx=gest.lx,ly=gest.ly,dd=Math.hypot(e.clientX-lx,e.clientY-ly),n=Math.max(1,Math.ceil(dd/(C*cam.z*0.3)));
    for(let k=1;k<=n;k++)drawAt(lx+(e.clientX-lx)*k/n,ly+(e.clientY-ly)*k/n);gest.lx=e.clientX;gest.ly=e.clientY;}
});
function endPtr(e){if(!ptrs.has(e.pointerId))return;ptrs.delete(e.pointerId);if(!gest)return;
  if(gest.k==='one'&&!gest.moved&&performance.now()-gest.t<500)tap(e.clientX,e.clientY);
  if(gest.k==='draw'){if(gest.added===0&&!gest.warned)toast('Brėžk nuo jau iškasto tunelio arba nuo paviršiaus.');if(gest.added)save();}
  if(ptrs.size===0)gest=null;else if(gest.k==='pinch'){const [a]=[...ptrs.values()];gest={k:'one',sx:a.x,sy:a.y,t:0,moved:true,lx:a.x,ly:a.y};}}
cv.addEventListener('pointerup',endPtr);cv.addEventListener('pointercancel',endPtr);
cv.addEventListener('wheel',e=>{e.preventDefault();const wx=cam.x+e.clientX/cam.z,wy=cam.y+e.clientY/cam.z;cam.z*=Math.exp(-e.deltaY*0.0015);cam.z=Math.max(minZ(),Math.min(3,cam.z));cam.x=wx-e.clientX/cam.z;cam.y=wy-e.clientY/cam.z;clampCam();},{passive:false});
document.addEventListener('gesturestart',e=>e.preventDefault());
document.addEventListener('touchmove',e=>{if(e.target===cv)e.preventDefault();},{passive:false});

function drawAt(sx,sy){const wx=cam.x+sx/cam.z,wy=cam.y+sy/cam.z;if(wy<GY-C)return;
  const gx=Math.floor(wx/C),gy=Math.max(0,Math.floor((wy-GY)/C));const key=gy*W+gx;if(key===gest.lastCell)return;gest.lastCell=key;
  const cells=[[gx,gy]];if(brush===3)for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(dx||dy)cells.push([gx+dx,gy+dy]);
  for(let pass=0;pass<2;pass++)for(const [x,y] of cells)if(tryQueue(x,y))gest.added++;}
function tryQueue(gx,gy){if(gx<1||gx>W-2||gy<0||gy>H-2)return false;const i=idx(gx,gy+1);if(dug[i]||queued[i])return false;
  if(gy===0&&!revealed[gx])return false;
  const L=layerOf(gy);if(LAYERS[L].lvl>S.level){if(!gest.warned){gest.warned=1;toast(LAYERS[L].name+' atsirakins pasiekus '+LAYERS[L].lvl+' lygį.','warn');}return false;}
  let ok=false;for(const n of nb4(i))if(dug[n]||queued[n]){ok=true;break;}if(!ok)return false;
  let cnt=0;for(let k=0;k<queued.length;k++)if(queued[k])cnt++;if(cnt>=700){toastT('qmax','Per daug suplanuoto kasimo – palaukite.','warn');return false;}
  queued[i]=1;return true;}

function tap(sx,sy){const wx=cam.x+sx/cam.z,wy=cam.y+sy/cam.z;
  if(wy<GY+4){let best=null,bd=22;for(const it of items){if(!revealed[it.x])continue;const d=Math.hypot(it.x*C+C/2-wx,GY-6-wy);if(d<bd){bd=d;best=it;}}
    if(best){if(surfDanger()&&!best.mk)toastT('dng','Dabar pavojinga – skruzdės eis vėliau.','',4);best.mk=!best.mk;
      if(best.mk&&best.need>1)toastT('need'+best.t,FOODT[best.t].n+': reikia '+best.need+' darbininkių kartu.','',6);
      if(!best.mk){best.ass.slice().concat(best.arr).forEach(id=>{const a=ants.find(x=>x.id===id);if(a&&a.job&&a.job.id===best.id){goHome(a);}});best.ass=[];best.arr=[];}
      return;}
    const gx=Math.floor(wx/C);if(gx>=0&&gx<W&&!revealed[gx]){toastT('fog','Čia dar neištyrinėta – reikia žvalgių (3 lygis).','',4);}return;}
  const c=cellAt(wx,wy);if(!dug[c])return;roomMenu(c);}

function isCore(i){const x=gxOf(i),r=rowOf(i);if(x<1||x>W-2||r<2||r>ROWS-2)return false;
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(!dug[i+dy*W+dx])return false;return true;}
function roomMenu(c){
  if(room[c]===1){sheet('<h3>👑 Karalienės urvas</h3><p>Čia gyvena karalienė. Ji deda kiaušinius, kai yra maisto ir vietos peryklėje.</p><div class="opts"><button class="pri" data-a="x">Gerai</button></div>');return;}
  const tt=room[c];let start=-1,bd=1e9;
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const n=c+dy*W+dx;if(n>W&&n<W*ROWS&&isCore(n)&&(room[n]===tt||room[n]===0)&&room[n]!==1){const d=dx*dx+dy*dy;if(d<bd){bd=d;start=n;}}}
  if(start<0){toast('Per siaura vieta. Urvui reikia bent 4×4 iškastos erdvės (naudok „Urvas“ teptuką).','warn');return;}
  const cores=[],seen=new Set([start]),st=[start];
  while(st.length){const k=st.pop();cores.push(k);for(const n of nb4(k))if(!seen.has(n)&&isCore(n)&&(room[n]===tt||room[n]===0)){seen.add(n);st.push(n);}}
  if(cores.length<4){toast('Per maža vieta urvui ('+cores.length+'/4). Iškask platesnę erdvę – bent 4×4.','warn');return;}
  const cells=new Set();for(const k of cores)for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const n=k+dy*W+dx;if(dug[n]&&(room[n]===tt||room[n]===0))cells.add(n);}
  const n=cells.size;const cur=tt?ROOMN[tt]:'Nepaskirtas';
  sheet('<h3>Urvas: '+cur+'</h3><p>Dydis: '+n+' langelių. Pasirink paskirtį:</p><div class="opts">'+
    '<button data-a="2">📦 Sandėlis<small>+'+n*5+' maisto talpos</small></button>'+
    '<button data-a="3">🥚 Peryklė<small>+'+Math.floor(n/4)+' vietos kiaušiniams ir lervoms</small></button>'+
    '<button data-a="4">💤 Poilsis<small>+'+Math.floor(n/2)+' skruzdžių ribos</small></button>'+
    (tt?'<button data-a="0">✖ Nuimti paskirtį</button>':'')+'<button class="plain" data-a="x">Atšaukti</button></div>',
    a=>{if(a==='x')return;const v=+a;cells.forEach(k=>room[k]=v);rebuildRooms();const q=rooms.find(r=>r.type===1);if(q){queen.x=q.cx;queen.y=q.cy+2;}
      if(v)toast(ROOMN[v]+' paskirtas!','good');save();});
}
function sheet(html,cb){const sh=document.getElementById('sheet'),card=document.getElementById('sheetCard');card.innerHTML=html;sh.classList.remove('hidden');
  card.onclick=e=>{const b=e.target.closest('button');if(!b)return;sh.classList.add('hidden');cb&&cb(b.dataset.a);};
  sh.onclick=e=>{if(e.target===sh){sh.classList.add('hidden');}};}

// ===== Tutorial =====
const TUT=[
 ['🐜 Sveiki!','Tavo karalienė ir 4 darbininkės gyvena mažame urve po žeme. Užaugink didžiausią koloniją!'],
 ['🍖 Maistas','Bakstelėk maistą paviršiuje (trupinius, sėklas, uogas) – laisvos darbininkės jį parneš. Uogą ir vabalą neša kelios kartu.'],
 ['⛏ Kasimas','Spausk „Kasti“ ir brėžk pirštu nuo esamo tunelio. „Tunelis“ – siauras takas, „Urvas“ – plati erdvė. Gilesni sluoksniai kietesni, bet juose yra retų radinių.'],
 ['🏠 Urvai','Iškask bent 4×4 erdvę, bakstelėk ją ir paskirk: Sandėlis (daugiau maisto), Peryklė (daugiau kiaušinių), Poilsis (daugiau skruzdžių).'],
 ['👑 Karalienė','Apačioje pasirink, ką ji augins. Kiaušinis → lerva → skruzdė. Visos skruzdės valgo – nepritrūk maisto! Vienu pirštu stumdyk vaizdą, dviem – artink.']];
function showTut(i){if(i>=TUT.length){S.tut=99;save();return;}
  sheet('<div class="dots">'+TUT.map((_,k)=>k===i?'●':'○').join('')+'</div><h3>'+TUT[i][0]+'</h3><p>'+TUT[i][1]+'</p><div class="opts"><button class="pri" data-a="n">'+(i<TUT.length-1?'Toliau':'Pradėti!')+'</button></div>',()=>showTut(i+1));}

// ===== UI =====
const $=id=>document.getElementById(id);
function updateProdButtons(){document.querySelectorAll('.prod').forEach(b=>{const t=b.dataset.t;b.classList.toggle('sel',S.prod===t);
  const lk=t!=='p'&&ANT[t].lvl>S.level;b.classList.toggle('locked',lk);b.querySelector('small').textContent=lk?'🔒 '+ANT[t].lvl+' lyg.':t==='p'?'Pauzė':ANT[t].cost+' 🍖';});}
document.querySelectorAll('.prod').forEach(b=>b.onclick=()=>{const t=b.dataset.t;if(t!=='p'&&ANT[t].lvl>S.level){toast(ANT[t].name+' atsirakins '+ANT[t].lvl+' lygyje.');return;}S.prod=t;updateProdButtons();save();});
function setMode(m){mode=m;$('prodBar').classList.toggle('hidden',m==='dig');$('digBar').classList.toggle('hidden',m!=='dig');
  if(m==='dig')hintOnce('digh','Brėžk pirštu nuo tunelio. Dviem pirštais judink vaizdą.');}
$('btnDig').onclick=()=>setMode('dig');$('btnDone').onclick=()=>{setMode('play');save();};
document.querySelectorAll('.brush').forEach(b=>b.onclick=()=>{brush=+b.dataset.b;document.querySelectorAll('.brush').forEach(x=>x.classList.toggle('sel',x===b));});
$('btnClear').onclick=()=>{for(let i=0;i<queued.length;i++)if(queued[i]&&!digProg[i])queued[i]=0;ants.forEach(a=>{if(a.job&&a.job.k==='dig'&&!queued[a.job.c]){abortJob(a);a.st='idle';a.path=[];}});toast('Suplanuotas kasimas išvalytas.');save();};
$('btnMenu').onclick=()=>sheet('<h3>Meniu</h3><p>Žaidimas išsaugomas automatiškai.</p><div class="opts"><button data-a="h">❓ Pagalba</button><button data-a="c">🎯 Rodyti karalienę</button><button class="danger" data-a="r">Nauja kolonija</button><button class="plain" data-a="x">Uždaryti</button></div>',a=>{
  if(a==='h')showTut(0);if(a==='c')centerQueen();
  if(a==='r')sheet('<h3>Pradėti iš naujo?</h3><p>Visa dabartinė kolonija bus ištrinta.</p><div class="opts"><button class="danger" data-a="y">Taip, ištrinti</button><button class="plain" data-a="x">Ne</button></div>',b=>{if(b==='y'){localStorage.removeItem(SAVE_KEY);newGame();centerQueen();updateProdButtons();showTut(0);save();}});});
function centerQueen(){cam.z=Math.max(minZ(),Math.min(3,VW/(24*C)));cam.x=queen.x-VW/cam.z/2;cam.y=queen.y-VH/cam.z*0.55;clampCam();}
let hudT=0;
function hud(){const f=Math.floor(S.food);$('vFood').textContent=f+'/'+caps.food;$('pFood').style.color=f<5?'#c0392b':'';
  $('vAnts').textContent=ants.length+'/'+caps.pop;$('vLvl').textContent=S.level;
  const a=LVL_THR[S.level-1],b=LVL_THR[S.level];$('lvlBar').style.width=b?Math.min(100,(ants.length-a)/(b-a)*100)+'%':'100%';
  const eg=brood.filter(x=>x.st===0).length,lv=brood.length-eg;let q=0;for(let i=0;i<queued.length;i++)if(queued[i])q++;
  const wk=ants.filter(x=>x.t==='w'),busy=wk.filter(x=>x.job).length;
  $('status').textContent='🥚 '+eg+' · 🐛 '+lv+' (peryklė '+brood.length+'/'+caps.nurs+') · 🐜 dirba '+busy+'/'+wk.length+(q?' · ⛏ '+q:'');}

// ===== Save / Load =====
function pack(a){let s='';for(let i=0;i<a.length;i++)s+=String.fromCharCode(48+a[i]);return s;}
function unpack(s,a){for(let i=0;i<a.length&&i<s.length;i++)a[i]=s.charCodeAt(i)-48;}
function save(){try{const q=[];for(let i=0;i<queued.length;i++)if(queued[i])q.push(i);S.queue=q;
  const data={v:1,S,dug:pack(dug),room:pack(room),rev:pack(revealed),
    ants:ants.map(a=>({id:a.id,t:a.t,x:Math.round(a.x),y:Math.round(a.y),hp:a.hp,carry:a.carry,ct:a.ct||null})),brood,
    items:items.map(i=>({id:i.id,x:i.x,t:i.t,amt:i.amt,need:i.need,mk:i.mk,age:i.age})),saved:Date.now()};
  localStorage.setItem(SAVE_KEY,JSON.stringify(data));}catch(e){console.warn(e);}}
function load(){try{const raw=localStorage.getItem(SAVE_KEY);if(!raw)return false;const d=JSON.parse(raw);if(d.v!==1)return false;
  S=d.S;S.hints=S.hints||{};dug=new Uint8Array(W*ROWS);room=new Uint8Array(W*ROWS);queued=new Uint8Array(W*ROWS);digProg=new Float32Array(W*ROWS);revealed=new Uint8Array(W);
  unpack(d.dug,dug);unpack(d.room,room);unpack(d.rev,revealed);
  ants=d.ants.map(a=>Object.assign({path:[],st:'idle',wait:0,job:null,ct:'seed',phase:0,ang:0,ox:rnd(-4,4),oy:rnd(-4,4)},a));
  brood=d.brood||[];items=d.items||[];enemies=[];bird=null;afterLoad();return true;}catch(e){console.warn('load fail',e);return false;}}

// ===== Main loop =====
let last=performance.now(),saveT=0;
function frame(now){const dt=Math.min(0.1,(now-last)/1000);last=now;
  if(document.getElementById('sheet').classList.contains('hidden')||S.tut===99){step(dt);}
  saveT+=dt;if(saveT>5){saveT=0;save();}
  hudT+=dt;if(hudT>0.25){hudT=0;hud();}
  render(now);requestAnimationFrame(frame);}
document.addEventListener('visibilitychange',()=>{if(document.hidden)save();else last=performance.now();});
window.addEventListener('pagehide',save);window.addEventListener('resize',resize);
// test hook
window.__game={get S(){return S},get ants(){return ants},get items(){return items},get brood(){return brood},get caps(){return caps},get rooms(){return rooms},
  step,save,load,dug:()=>dug,room:()=>room,queued:()=>queued,idx,tryQueue:(x,y)=>{gest=gest||{};return tryQueue(x,y);},roomMenu,cam,cellAt,completeDig,enemies:()=>enemies,setMode};

resize();
if(!load()){newGame();}
centerQueen();updateProdButtons();hud();
if(S.tut!==99)showTut(0);
requestAnimationFrame(frame);
if('serviceWorker' in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('sw.js').catch(()=>{});
