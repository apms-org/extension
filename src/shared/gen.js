const rand=(n)=>{const a=new Uint32Array(1);const lim=Math.floor(4294967296/n)*n;let x;do{crypto.getRandomValues(a);x=a[0];}while(x>=lim);return x%n;};

const SETS={upper:"ABCDEFGHIJKLMNOPQRSTUVWXYZ",lower:"abcdefghijklmnopqrstuvwxyz",digits:"0123456789",symbols:"!@#$%^&*()-_=+[]{};:,.?/~"};
const AMBIG=/[Il1O0o|`'"]/g;

export const WORDS=("acid acorn actor adobe agent alarm album alder alley alpha amber anchor angle ankle apple april apron arbor arena argon armor arrow aspen atlas attic audio aunt autumn avenue award axis bacon badge bagel baker balmy bamboo banjo barley barn basil basin beach beacon beard beaver bench berry bison blade blank blaze bloom blues boat bolt bonus boost border bottle bounce brass bread brick bridge brisk broom brush bubble buddy bugle bunny butter cabin cable cactus camel candle canoe canyon carbon cargo carpet castle cedar cello chalk charm cherry chess chili chorus cider cinema circle citrus clay clever cliff clock cloud clover coast cobalt cocoa comet copper coral cotton cougar crane crater crisp crown cumin curtain cycle dahlia daisy dance delta denim desert dial diary disco dolphin donut dragon drift drum dune eagle easel echo eclipse elbow elder ember engine epoch equal fabric falcon fancy fern fiber fiddle field fig flame flask fleet flint flora flute foam focus forest fossil fox frost fudge galaxy garden garnet gecko ginger glacier glass globe glove goose grain granite grape gravel grove guitar gulf habit hammer harbor harvest hazel helium heron hickory honey hood horizon hotel humble igloo indigo iris island ivory jacket jade jaguar jasmine jelly jewel jungle kayak kelp kettle kiwi koala ladder lagoon lamp lantern laser lava lemon lilac lily linen lobster lotus lunar lyric magnet mango maple marble market meadow melon mercury meteor mint mirror mocha monsoon mosaic moss motor mural mustard nectar needle neon nickel noble nomad north nutmeg oasis ocean olive onyx opal orbit orchid otter oxide paddle palm panda paper parade pastel peach pearl pebble pepper piano pilot pine pixel plaza plum polar pony poppy portal prairie prism pulse quartz quill quiver radar radish rain raven reef ribbon ridge river robin rocket rose ruby saddle saffron sage salmon sand satin scarf shadow shell sierra silk silver slate sonic spark spice spruce squid stamp star stone storm sugar summit sunset swan tango teal tempo thunder tiger timber toast topaz torch tulip tundra turtle twig umber unity valley velvet vessel violet vivid walnut water wave willow winter wren yarrow yodel zebra zenith zephyr zinc").split(" ");

export const generate=(o)=>{
  const opt=Object.assign({mode:"random",length:24,upper:true,lower:true,digits:true,symbols:true,avoidAmbiguous:false,words:5,separator:"-",capitalize:true,number:true,pinLength:6},o||{});
  if(opt.mode==="pin"){let s="";for(let i=0;i<opt.pinLength;i++)s+=SETS.digits[rand(10)];return s;}
  if(opt.mode==="passphrase"){
    const w=[];for(let i=0;i<opt.words;i++){let x=WORDS[rand(WORDS.length)];if(opt.capitalize)x=x[0].toUpperCase()+x.slice(1);w.push(x);}
    if(opt.number){const i=rand(w.length);w[i]=w[i]+String(rand(10));}
    return w.join(opt.separator);
  }
  const pools=[];
  ["upper","lower","digits","symbols"].forEach(k=>{if(opt[k]){let p=SETS[k];if(opt.avoidAmbiguous)p=p.replace(AMBIG,"");pools.push(p);}});
  if(!pools.length)pools.push(SETS.lower);
  const all=pools.join("");
  const out=pools.map(p=>p[rand(p.length)]);
  while(out.length<opt.length)out.push(all[rand(all.length)]);
  for(let i=out.length-1;i>0;i--){const j=rand(i+1);[out[i],out[j]]=[out[j],out[i]];}
  return out.slice(0,opt.length).join("");
};

const COMMON=["password","123456","qwerty","letmein","welcome","admin","iloveyou","monkey","dragon","sunset","football","baseball","master","shadow","login","abc123","passw0rd","trustno1"];
export const entropy=(pw)=>{
  if(!pw)return 0;
  const s=String(pw);
  if(/^[A-Za-z]+(-[A-Za-z]+[0-9]?)+$/.test(s)&&s.split("-").length>=3){const n=s.split("-").length;return Math.round(n*Math.log2(WORDS.length)+(/[0-9]/.test(s)?3.3:0));}
  let pool=0;
  if(/[a-z]/.test(s))pool+=26;
  if(/[A-Z]/.test(s))pool+=26;
  if(/[0-9]/.test(s))pool+=10;
  if(/[^A-Za-z0-9]/.test(s))pool+=24;
  let bits=s.length*Math.log2(Math.max(pool,1));
  const low=s.toLowerCase();
  if(COMMON.some(c=>low.includes(c)))bits*=0.35;
  if(/(.)\1{2,}/.test(s))bits*=0.8;
  if(/(19|20)\d\d/.test(s))bits-=6;
  if(/^[A-Z][a-z]+\d+[!@#$%]?$/.test(s))bits*=0.55;
  if(/^\d+$/.test(s))bits=Math.min(bits,s.length*3.32);
  return Math.max(0,Math.round(bits));
};
export const score=(bits)=>bits<28?0:bits<40?1:bits<60?2:bits<80?3:4;
export const strength=(pw)=>{const b=entropy(pw);return{bits:b,score:score(b)};};
export const crackTime=(bits)=>{
  const s=Math.pow(2,bits)/2/1e10;
  if(s<1)return "instantly";
  if(s>4.35e17)return "longer than the universe has existed";
  const units=[["second",60],["minute",60],["hour",24],["day",365],["year",1000],["thousand years",1000],["million years",1000],["billion years",Infinity]];
  let v=s,i=0;while(i<units.length-1&&v>=units[i][1]){v/=units[i][1];i++;}
  const n=Math.floor(v);
  if(i>=5)return n+" "+units[i][0];
  return n+" "+units[i][0]+(n===1?"":"s");
};

export const crackPhrase=(bits)=>{const t=crackTime(bits);return t==="instantly"?"cracked instantly offline":t.startsWith("longer")?"outlasts the universe offline":"cracked in "+t+" offline";};

export const GEN_DEFAULTS={mode:"random",length:20,upper:true,lower:true,digits:true,symbols:true,avoidAmbiguous:false,words:5,separator:"-",capitalize:true,number:true,pinLength:6};

export function optionsStrength(pw){const bits=entropy(pw);return{bits,score:score(bits),detail:crackPhrase(bits)};}
