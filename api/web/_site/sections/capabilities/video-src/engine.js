/* Tiny timeline engine: every frame is a pure function of t (ms) within a 9s loop. */
(function(){
const L=9000,clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,x)),ease=x=>1-Math.pow(1-clamp(x),3);
const tracks=[],els=new Map();
const $=id=>document.getElementById(id);
const st=el=>{let s=els.get(el);if(!s){s={o:1,x:0,y:0,s:1};els.set(el,s);}return s;};
window.vis=(id,t0,t1,o={})=>{t1=t1==null?1e9:t1;const el=$(id),s=st(el),d=o.d||350,dy=o.dy===undefined?14:o.dy,dx=o.dx||0;
  tracks.push(t=>{const a=ease((t-t0)/d),b=1-ease((t-t1)/d);s.o*=a*b;s.y+=(1-a)*dy;s.x+=(1-a)*dx;});};
window.move=(id,t0,t1,from,to)=>{const el=$(id),s=st(el);
  tracks.push(t=>{const k=ease((t-t0)/(t1-t0));s.x+=from[0]+(to[0]-from[0])*k;s.y+=from[1]+(to[1]-from[1])*k;});};
window.pulse=(id,t0)=>{const el=$(id),s=st(el);tracks.push(t=>{const k=(t-t0)/400;if(k>0&&k<1)s.s*=1-.06*Math.sin(Math.PI*k);});};
window.cls=(id,c,t0,t1=1e9)=>{const el=$(id);tracks.push(t=>el.classList.toggle(c,t>=t0&&t<t1));};
window.typeText=(id,full,t0,t1)=>{const el=$(id);tracks.push(t=>{const n=Math.round(full.length*clamp((t-t0)/(t1-t0)));const v=full.slice(0,n);if(el.textContent!==v)el.textContent=v;});};
window.seq=(id,list)=>{const el=$(id);tracks.push(t=>{let v='';for(const [a,x] of list)if(t>=a)v=x;if(el.innerHTML!==v)el.innerHTML=v;});};
window.fn=f=>tracks.push(f);
window.countTo=(id,t0,t1,a,b)=>{const el=$(id);tracks.push(t=>{el.textContent=Math.round(a+(b-a)*ease((t-t0)/(t1-t0)));});};
function run(t){
  els.forEach(s=>{s.o=1;s.x=0;s.y=0;s.s=1;});
  tracks.forEach(f=>f(t));
  els.forEach((s,el)=>{el.style.opacity=s.o;el.style.transform='translate('+s.x+'px,'+s.y+'px) scale('+s.s+')';});
  $('stage').style.opacity=Math.min(ease(t/350),1-ease((t-(L-450))/400));
}
window.seek=run;
window.startLoop=()=>{
  const sync=$('sync');if(sync)sync.remove();
  if(matchMedia('(prefers-reduced-motion: reduce)').matches){run(L*.8);return;}
  const t0=performance.now();
  (function tick(){run((performance.now()-t0)%L);requestAnimationFrame(tick);})();
};
window.addEventListener('load',()=>{
  if(location.hash==='#rec'){const s=document.createElement('div');s.id='sync';$('stage').appendChild(s);window.__ready=true;}
  else startLoop();
});
})();
