import React, { useState, useEffect, useRef } from "react";
import { initializeApp } from "firebase/app";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged, browserLocalPersistence, setPersistence } from "firebase/auth";
import { getFirestore, doc, setDoc, collection, query, orderBy, limit, onSnapshot } from "firebase/firestore";

const GEMINI_KEY = process.env.REACT_APP_GEMINI_KEY;
const firebaseConfig = {
  apiKey: "AIzaSyCcGDsgb3ACgbjRAGPY66TWnsq1Y3rlIpw",
  authDomain: "yakov-avugal.firebaseapp.com",
  projectId: "yakov-avugal",
  storageBucket: "yakov-avugal.firebasestorage.app",
  messagingSenderId: "733398338213",
  appId: "1:733398338213:web:e5dc62d76c32d26b759b4c"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
setPersistence(auth, browserLocalPersistence).catch(()=>{});
const provider = new GoogleAuthProvider();

async function syncLeaderboard(user, state) {
  if (!user?.uid) return;
  try {
    await setDoc(doc(db, "leaderboard", user.uid), {
      name: user.displayName || "משתמש",
      photoURL: user.photoURL || "",
      avatar: state.selectedAvatar || "duck",
      xp: state.xp || 0,
      correct: state.correct || 0,
      bestStreak: state.bestStreak || 0,
      level: getLevel(state.xp || 0).name,
      completedCats: Object.values(state.catProgress || {}).filter(v => v >= 10).length,
      updatedAt: Date.now(),
    });
  } catch {}
}

async function callGemini(prompt, apiKey) {
  const key = apiKey || GEMINI_KEY;
  if (!key) throw new Error("מפתח Gemini AI חסר — הגדר אותו בפרופיל ⚙️");
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 1024 }
      })
    }
  );
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

async function callGeminiPremium(prompt, token) {
  const res = await fetch("/.netlify/functions/gemini", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, token })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "שגיאת שרת");
  return data.text;
}

async function callAI(prompt, geminiKey, plan, aiCredits) {
  if (geminiKey) return callGemini(prompt, geminiKey);
  if (plan === "premium" && aiCredits > 0) return callGeminiPremium(prompt, process.env.REACT_APP_PREMIUM_TOKEN||"");
  throw new Error("NO_KEY");
}

function playSound(type){
  try{
    const ctx=new(window.AudioContext||window.webkitAudioContext)();
    const master=ctx.createGain();
    master.connect(ctx.destination);
    if(type==="correct"){
      [[523,0],[659,0.12],[784,0.24],[1047,0.38]].forEach(([freq,delay])=>{
        const osc=ctx.createOscillator();
        const g=ctx.createGain();
        osc.connect(g);g.connect(master);
        osc.type="sine";osc.frequency.setValueAtTime(freq,ctx.currentTime+delay);
        g.gain.setValueAtTime(0,ctx.currentTime+delay);
        g.gain.linearRampToValueAtTime(0.22,ctx.currentTime+delay+0.04);
        g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+delay+0.22);
        osc.start(ctx.currentTime+delay);osc.stop(ctx.currentTime+delay+0.25);
      });
    }else{
      const osc=ctx.createOscillator();
      const g=ctx.createGain();
      osc.connect(g);g.connect(master);
      osc.type="sawtooth";
      osc.frequency.setValueAtTime(320,ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(80,ctx.currentTime+0.35);
      g.gain.setValueAtTime(0.2,ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.4);
      osc.start(ctx.currentTime);osc.stop(ctx.currentTime+0.4);
    }
  }catch{}
}

function playIntroSound(){
  try{
    const ctx=new(window.AudioContext||window.webkitAudioContext)();
    const master=ctx.createGain();
    master.gain.setValueAtTime(0.38,ctx.currentTime);
    master.connect(ctx.destination);
    // Ascending arpeggio: C5-E5-G5-C6
    [[523.25,0],[659.25,0.17],[783.99,0.34],[1046.5,0.52]].forEach(([freq,t])=>{
      const o=ctx.createOscillator(),g=ctx.createGain();
      o.connect(g);g.connect(master);
      o.type="sine";o.frequency.setValueAtTime(freq,ctx.currentTime+t);
      g.gain.setValueAtTime(0,ctx.currentTime+t);
      g.gain.linearRampToValueAtTime(0.28,ctx.currentTime+t+0.04);
      g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+t+0.3);
      o.start(ctx.currentTime+t);o.stop(ctx.currentTime+t+0.35);
    });
    // Ta-da chord at 0.72s: C major chord (C5+E5+G5+C6) held
    [[523.25,0.72,1.1],[659.25,0.72,1.0],[783.99,0.72,0.9],[1046.5,0.72,1.2]].forEach(([freq,t,dur])=>{
      const o=ctx.createOscillator(),g=ctx.createGain();
      o.connect(g);g.connect(master);
      o.type="triangle";o.frequency.setValueAtTime(freq,ctx.currentTime+t);
      g.gain.setValueAtTime(0,ctx.currentTime+t);
      g.gain.linearRampToValueAtTime(0.16,ctx.currentTime+t+0.06);
      g.gain.setValueAtTime(0.12,ctx.currentTime+t+0.5);
      g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+t+dur);
      o.start(ctx.currentTime+t);o.stop(ctx.currentTime+t+dur+0.1);
    });
    // Sparkle shimmer at the end
    [880,1108,1318,1568,1760,2093].forEach((freq,i)=>{
      const o=ctx.createOscillator(),g=ctx.createGain();
      o.connect(g);g.connect(master);
      o.type="sine";o.frequency.setValueAtTime(freq,ctx.currentTime+1.0+i*0.055);
      g.gain.setValueAtTime(0,ctx.currentTime+1.0+i*0.055);
      g.gain.linearRampToValueAtTime(0.045,ctx.currentTime+1.0+i*0.055+0.03);
      g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+1.0+i*0.055+0.45);
      o.start(ctx.currentTime+1.0+i*0.055);o.stop(ctx.currentTime+1.9);
    });
  }catch{}
}

const AVATARS=[
  {id:"duck",  name:"ברווז צהוב",   unlockCats:0,   rare:false},
  {id:"duck2", name:"ברווז ימאי",   unlockCats:1,   rare:false},
  {id:"duck3", name:"ברווז מגניב",  unlockCats:2,   rare:false},
  {id:"duck4", name:"ברווז שף",     unlockCats:3,   rare:false},
  {id:"duck5", name:"ברווז נינג'ה", unlockCats:4,   rare:false},
  {id:"duck6", name:"ברווז מלכותי", unlockCats:5,   rare:false},
  {id:"duck7", name:"ברווז קוסם",   unlockCats:6,   rare:false},
  {id:"duck8", name:"ברווז זהוב ✨", unlockCats:999, rare:true, advancedRequired:true},
];

function DuckBase({c="#fde68a",bk="#f59e0b",size=80,children}){
  return(
    <svg width={size} height={size} viewBox="0 0 100 115" style={{overflow:"visible",filter:"drop-shadow(0 3px 8px rgba(0,0,0,0.22))"}}>
      <ellipse cx="82" cy="69" rx="11" ry="6" fill={c} opacity="0.85" style={{transformBox:"fill-box",transformOrigin:"15% 50%",animation:"tailWag 3s ease infinite"}}/>
      <ellipse cx="50" cy="72" rx="30" ry="24" fill={c} style={{animation:"breathe 3.5s ease infinite"}}/>
      <ellipse cx="22" cy="75" rx="13" ry="9" fill={c} opacity="0.75" style={{transformBox:"fill-box",transformOrigin:"80% 50%",animation:"wingFlap 5s ease infinite"}}/>
      <ellipse cx="78" cy="75" rx="13" ry="9" fill={c} opacity="0.75"/>
      <circle cx="50" cy="40" r="22" fill={c}/>
      <ellipse cx="68" cy="43" rx="11" ry="6" fill={bk}/>
      <circle cx="41" cy="37" r="6" fill="#1a1a2e" className="duck-eye" style={{transformBox:"fill-box",transformOrigin:"center"}}/>
      <circle cx="59" cy="37" r="6" fill="#1a1a2e" className="duck-eye-r" style={{transformBox:"fill-box",transformOrigin:"center"}}/>
      <circle cx="43" cy="35" r="2" fill="white"/>
      <circle cx="61" cy="35" r="2" fill="white"/>
      <ellipse cx="41" cy="97" rx="7" ry="4" fill={bk} style={{animation:"feetDance 1.8s ease infinite alternate"}}/>
      <ellipse cx="59" cy="97" rx="7" ry="4" fill={bk} style={{animation:"feetDance 1.8s 0.9s ease infinite alternate"}}/>
      {children}
    </svg>
  );
}

// Duck 1: Basic yellow
function Duck1SVG({size=80}){return <DuckBase c="#fde68a" bk="#f59e0b" size={size}/>;}

// Duck 2: Sailor — blue with cap and stripes
function Duck2SVG({size=80}){return(
  <DuckBase c="#93c5fd" bk="#1d4ed8" size={size}>
    <ellipse cx="50" cy="24" rx="22" ry="5.5" fill="#1e40af"/>
    <rect x="34" y="11" width="32" height="14" rx="3" fill="#1e40af"/>
    <ellipse cx="50" cy="11" rx="17" ry="5" fill="#f8fafc"/>
    <circle cx="50" cy="11" r="3.5" fill="#1d4ed8"/>
    <line x1="36" y1="67" x2="64" y2="67" stroke="#1e40af" strokeWidth="2.5" opacity="0.5"/>
    <line x1="36" y1="74" x2="64" y2="74" stroke="#1e40af" strokeWidth="2.5" opacity="0.5"/>
  </DuckBase>
);}

// Duck 3: Cool — orange with sunglasses
function Duck3SVG({size=80}){return(
  <DuckBase c="#fb923c" bk="#c2410c" size={size}>
    <rect x="31" y="31" width="14" height="10" rx="3.5" fill="#0f172a"/>
    <rect x="53" y="31" width="14" height="10" rx="3.5" fill="#0f172a"/>
    <line x1="45" y1="36" x2="53" y2="36" stroke="#0f172a" strokeWidth="2.5"/>
    <line x1="28" y1="36" x2="31" y2="36" stroke="#0f172a" strokeWidth="2.5"/>
    <line x1="67" y1="36" x2="70" y2="36" stroke="#0f172a" strokeWidth="2.5"/>
    <rect x="31" y="31" width="14" height="5" rx="2.5" fill="#334155" opacity="0.45"/>
    <rect x="53" y="31" width="14" height="5" rx="2.5" fill="#334155" opacity="0.45"/>
  </DuckBase>
);}

// Duck 4: Chef — cream white with tall toque
function Duck4SVG({size=80}){return(
  <DuckBase c="#fef9c3" bk="#f59e0b" size={size}>
    <rect x="38" y="-2" width="24" height="24" rx="5" fill="#f8fafc"/>
    <ellipse cx="50" cy="23" rx="15" ry="5" fill="#e2e8f0"/>
    <line x1="44" y1="3" x2="44" y2="21" stroke="#e2e8f0" strokeWidth="3" strokeLinecap="round" opacity="0.6"/>
    <line x1="50" y1="1" x2="50" y2="21" stroke="#e2e8f0" strokeWidth="3" strokeLinecap="round" opacity="0.6"/>
    <line x1="56" y1="3" x2="56" y2="21" stroke="#e2e8f0" strokeWidth="3" strokeLinecap="round" opacity="0.6"/>
    <ellipse cx="50" cy="65" rx="7" ry="5" fill="#dc2626" opacity="0.85"/>
    <circle cx="50" cy="65" r="2.5" fill="#991b1b"/>
  </DuckBase>
);}

// Duck 5: Ninja — dark with headband and mask
function Duck5SVG({size=80}){return(
  <DuckBase c="#4b5563" bk="#1f2937" size={size}>
    <rect x="27" y="20" width="46" height="10" rx="5" fill="#dc2626"/>
    <circle cx="50" cy="25" r="4.5" fill="#7f1d1d"/>
    <rect x="28" y="44" width="44" height="14" rx="7" fill="#111827" opacity="0.92"/>
    <ellipse cx="40" cy="51" rx="8" ry="4.5" fill="#374151"/>
    <ellipse cx="60" cy="51" rx="8" ry="4.5" fill="#374151"/>
    <line x1="65" y1="44" x2="80" y2="36" stroke="#dc2626" strokeWidth="2" opacity="0.7"/>
    <line x1="65" y1="58" x2="80" y2="62" stroke="#dc2626" strokeWidth="2" opacity="0.5"/>
  </DuckBase>
);}

// Duck 6: Royal — purple with crown and cape
function Duck6SVG({size=80}){return(
  <DuckBase c="#c084fc" bk="#7e22ce" size={size}>
    <polygon points="35,23 41,9 50,19 59,9 65,23 63,28 37,28" fill="#fbbf24"/>
    <rect x="35" y="25" width="30" height="6" rx="2.5" fill="#f59e0b"/>
    <circle cx="41" cy="14" r="2.5" fill="#ef4444"/>
    <circle cx="50" cy="21" r="2.5" fill="#60a5fa"/>
    <circle cx="59" cy="14" r="2.5" fill="#4ade80"/>
    <path d="M23 70 Q20 84 27 88 Q50 96 73 88 Q80 84 77 70" fill="#dc2626" opacity="0.75"/>
    <line x1="27" y1="70" x2="73" y2="70" stroke="#fbbf24" strokeWidth="2" opacity="0.6"/>
  </DuckBase>
);}

// Duck 7: Wizard — indigo with pointed hat and wand
function Duck7SVG({size=80}){return(
  <DuckBase c="#818cf8" bk="#3730a3" size={size}>
    <polygon points="50,-2 33,26 67,26" fill="#1e1b4b"/>
    <ellipse cx="50" cy="26" rx="18" ry="5.5" fill="#312e81"/>
    <ellipse cx="42" cy="16" rx="2.5" ry="2.5" fill="#fbbf24"/>
    <ellipse cx="55" cy="8" rx="2" ry="2" fill="#f472b6"/>
    <ellipse cx="60" cy="18" rx="1.8" ry="1.8" fill="#34d399"/>
    <line x1="73" y1="60" x2="88" y2="42" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round"/>
    <circle cx="88" cy="41" r="4" fill="#fbbf24"/>
    <circle cx="88" cy="41" r="7" fill="#fbbf24" opacity="0.25" style={{animation:"breathe 1.5s ease infinite"}}/>
  </DuckBase>
);}

// Duck 8: Golden — shiny gold with sparkles (rarest)
function Duck8SVG({size=80}){
  const sparkles=[{x:12,y:28},{x:82,y:22},{x:16,y:78},{x:80,y:80},{x:50,y:4},{x:88,y:52}];
  return(
    <DuckBase c="#fbbf24" bk="#b45309" size={size}>
      <polygon points="35,23 42,7 50,19 58,7 65,23 63,28 37,28" fill="#fde68a"/>
      <rect x="35" y="25" width="30" height="6" rx="2.5" fill="#f59e0b"/>
      <circle cx="42" cy="12" r="2.5" fill="#ef4444"/>
      <circle cx="50" cy="21" r="2" fill="#60a5fa"/>
      <circle cx="58" cy="12" r="2.5" fill="#4ade80"/>
      {sparkles.map((s,i)=>(
        <g key={i} style={{animation:`starDrift 1.6s ${i*0.26}s ease-in-out infinite`,"--dx":`${(i%2?1:-1)*5}px`,"--dy":`${i%3===0?-6:4}px`}}>
          <polygon points={`${s.x},${s.y-4} ${s.x+1.2},${s.y-1} ${s.x+4},${s.y} ${s.x+1.2},${s.y+1} ${s.x},${s.y+4} ${s.x-1.2},${s.y+1} ${s.x-4},${s.y} ${s.x-1.2},${s.y-1}`} fill="#fde68a" opacity="0.9"/>
        </g>
      ))}
    </DuckBase>
  );
}

const ANIM_MAP={
  duck: "duckBob 2.6s ease infinite",
  duck2:"duckSway 2.2s ease infinite",
  duck3:"duckStrut 2s ease infinite",
  duck4:"duckBounce 1.4s ease infinite",
  duck5:"duckNinja 3.5s ease infinite",
  duck6:"duckFloat 3.2s ease infinite",
  duck7:"duckMagic 4s ease infinite",
  duck8:"duckGolden 2s ease infinite",
};

function AvatarSVG({id, size=80}){
  const anim=ANIM_MAP[id]||ANIM_MAP.duck;
  const inner=
    id==="duck"  ? <Duck1SVG size={size}/> :
    id==="duck2" ? <Duck2SVG size={size}/> :
    id==="duck3" ? <Duck3SVG size={size}/> :
    id==="duck4" ? <Duck4SVG size={size}/> :
    id==="duck5" ? <Duck5SVG size={size}/> :
    id==="duck6" ? <Duck6SVG size={size}/> :
    id==="duck7" ? <Duck7SVG size={size}/> :
    id==="duck8" ? <Duck8SVG size={size}/> :
    <Duck1SVG size={size}/>;
  return <div style={{animation:anim,display:"inline-block",transformOrigin:"50% 90%"}}>{inner}</div>;
}



function AvatarCrocSVG({size=80}){return(
  <svg width={size} height={size} viewBox="0 0 100 100">
    <ellipse cx="50" cy="54" rx="35" ry="30" fill="#22c55e"/>
    <ellipse cx="50" cy="75" rx="24" ry="13" fill="#16a34a"/>
    {[33,43,57,67].map((x,i)=><ellipse key={i} cx={x} cy={i%2===0?21:19} rx="5" ry="4" fill="#15803d"/>)}
    <ellipse cx="34" cy="43" rx="11" ry="10" fill="#fef08a"/>
    <ellipse cx="66" cy="43" rx="11" ry="10" fill="#fef08a"/>
    <ellipse cx="34" cy="44" rx="6" ry="7" fill="#14532d"/>
    <ellipse cx="66" cy="44" rx="6" ry="7" fill="#14532d"/>
    <circle cx="32" cy="42" r="2" fill="white"/>
    <circle cx="64" cy="42" r="2" fill="white"/>
    <ellipse cx="43" cy="71" rx="4" ry="3" fill="#15803d"/>
    <ellipse cx="57" cy="71" rx="4" ry="3" fill="#15803d"/>
    <path d="M30 82 Q50 94 70 82" stroke="#15803d" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
    {[37,45,50,55,63].map((x,i)=><polygon key={i} points={`${x-2.5},83 ${x},78 ${x+2.5},83`} fill="white"/>)}
  </svg>
);}

function AvatarGoatSVG({size=80}){return(
  <svg width={size} height={size} viewBox="0 0 100 100">
    <ellipse cx="50" cy="55" rx="33" ry="28" fill="#e8d5a3"/>
    <circle cx="50" cy="38" r="22" fill="#e8d5a3"/>
    <path d="M34 18 Q30 5 26 14" stroke="#c4a35a" strokeWidth="5" fill="none" strokeLinecap="round"/>
    <path d="M66 18 Q70 5 74 14" stroke="#c4a35a" strokeWidth="5" fill="none" strokeLinecap="round"/>
    <ellipse cx="50" cy="62" rx="10" ry="8" fill="#d4c090"/>
    <ellipse cx="50" cy="64" rx="7" ry="5" fill="#f5e6c8"/>
    <ellipse cx="36" cy="38" rx="8" ry="7" fill="#fffde7"/>
    <ellipse cx="64" cy="38" rx="8" ry="7" fill="#fffde7"/>
    <ellipse cx="36" cy="39" rx="3" ry="5" fill="#5c3d11"/>
    <ellipse cx="64" cy="39" rx="3" ry="5" fill="#5c3d11"/>
    <circle cx="35" cy="37" r="1.5" fill="white"/>
    <circle cx="63" cy="37" r="1.5" fill="white"/>
    <ellipse cx="44" cy="58" rx="3" ry="2" fill="#c49a6c"/>
    <ellipse cx="56" cy="58" rx="3" ry="2" fill="#c49a6c"/>
    <path d="M44 62 Q50 68 56 62" stroke="#c49a6c" strokeWidth="1.5" fill="none"/>
    <path d="M44 72 Q50 82 56 72" stroke="#c4a35a" strokeWidth="6" fill="none" strokeLinecap="round"/>
    <ellipse cx="50" cy="84" rx="6" ry="9" fill="#d4c090"/>
  </svg>
);}

function AvatarCatSVG({size=80}){return(
  <svg width={size} height={size} viewBox="0 0 100 100">
    <polygon points="28,32 20,12 38,26" fill="#f97316"/>
    <polygon points="72,32 80,12 62,26" fill="#f97316"/>
    <polygon points="30,30 22,14 38,26" fill="#fde68a"/>
    <polygon points="70,30 78,14 62,26" fill="#fde68a"/>
    <circle cx="50" cy="52" r="30" fill="#f97316"/>
    <circle cx="50" cy="54" r="20" fill="#fed7aa"/>
    <ellipse cx="35" cy="45" rx="10" ry="9" fill="#1c1917"/>
    <ellipse cx="65" cy="45" rx="10" ry="9" fill="#1c1917"/>
    <ellipse cx="35" cy="46" rx="5" ry="7" fill="#15803d"/>
    <ellipse cx="65" cy="46" rx="5" ry="7" fill="#15803d"/>
    <circle cx="33" cy="43" r="2" fill="white"/>
    <circle cx="63" cy="43" r="2" fill="white"/>
    <ellipse cx="50" cy="61" rx="5" ry="4" fill="#f472b6"/>
    <path d="M40 63 Q50 69 60 63" stroke="#9a3412" strokeWidth="1.5" fill="none"/>
    {[-20,-8,8,20].map((dx,i)=><line key={i} x1={50+(dx>0?8:-8)} y1="60" x2={50+(dx>0?32:-32)} y2={56+i%2*4} stroke="#92400e" strokeWidth="1.2"/>)}
    <path d="M30 76 Q50 85 70 76" stroke="#f97316" strokeWidth="7" fill="none" strokeLinecap="round"/>
  </svg>
);}

function AvatarCowSVG({size=80}){return(
  <svg width={size} height={size} viewBox="0 0 100 100">
    <path d="M36 22 Q33 12 30 18" stroke="#78350f" strokeWidth="5" fill="none" strokeLinecap="round"/>
    <path d="M64 22 Q67 12 70 18" stroke="#78350f" strokeWidth="5" fill="none" strokeLinecap="round"/>
    <ellipse cx="50" cy="52" rx="34" ry="30" fill="#f8fafc"/>
    <circle cx="50" cy="38" r="22" fill="#f8fafc"/>
    <ellipse cx="32" cy="30" rx="9" ry="8" fill="#1e293b" opacity="0.85"/>
    <ellipse cx="68" cy="45" rx="8" ry="7" fill="#1e293b" opacity="0.8"/>
    <ellipse cx="55" cy="22" rx="7" ry="6" fill="#1e293b" opacity="0.75"/>
    <ellipse cx="35" cy="40" rx="10" ry="9" fill="#fff"/>
    <ellipse cx="65" cy="40" rx="10" ry="9" fill="#fff"/>
    <circle cx="35" cy="41" r="5" fill="#1e293b"/>
    <circle cx="65" cy="41" r="5" fill="#1e293b"/>
    <circle cx="33" cy="39" r="2" fill="white"/>
    <circle cx="63" cy="39" r="2" fill="white"/>
    <ellipse cx="50" cy="60" rx="14" ry="10" fill="#fca5a5"/>
    <ellipse cx="44" cy="58" rx="4" ry="3" fill="#f87171"/>
    <ellipse cx="56" cy="58" rx="4" ry="3" fill="#f87171"/>
    <path d="M42 65 Q50 71 58 65" stroke="#f87171" strokeWidth="1.5" fill="none"/>
    <ellipse cx="37" cy="80" rx="8" ry="6" fill="#fda4af"/>
    <ellipse cx="50" cy="82" rx="8" ry="6" fill="#fda4af"/>
    <ellipse cx="63" cy="80" rx="8" ry="6" fill="#fda4af"/>
  </svg>
);}

function AvatarGiraffeSVG({size=80}){return(
  <svg width={size} height={size} viewBox="0 0 100 100">
    <rect x="44" y="55" width="12" height="30" rx="6" fill="#fbbf24"/>
    <ellipse cx="42" cy="55" rx="7" ry="22" fill="#fbbf24"/>
    <ellipse cx="58" cy="55" rx="7" ry="22" fill="#fbbf24"/>
    {[[40,45,8],[58,38,9],[42,62,7],[60,58,10],[50,50,8]].map(([x,y,r],i)=><ellipse key={i} cx={x} cy={y} rx={r} ry={Math.round(r*0.8)} fill="#92400e" opacity="0.55"/>)}
    <circle cx="50" cy="28" r="20" fill="#fbbf24"/>
    <ellipse cx="42" cy="12" rx="4" ry="7" fill="#fbbf24"/>
    <ellipse cx="58" cy="12" rx="4" ry="7" fill="#fbbf24"/>
    <circle cx="42" cy="8" r="3" fill="#78350f"/>
    <circle cx="58" cy="8" r="3" fill="#78350f"/>
    <ellipse cx="36" cy="28" rx="9" ry="8" fill="white"/>
    <ellipse cx="64" cy="28" rx="9" ry="8" fill="white"/>
    <circle cx="36" cy="29" r="5" fill="#1c1917"/>
    <circle cx="64" cy="29" r="5" fill="#1c1917"/>
    <circle cx="34" cy="27" r="2" fill="white"/>
    <circle cx="62" cy="27" r="2" fill="white"/>
    <ellipse cx="50" cy="40" rx="8" ry="5" fill="#f59e0b"/>
    <ellipse cx="44" cy="38" rx="3" ry="2" fill="#92400e"/>
    <ellipse cx="56" cy="38" rx="3" ry="2" fill="#92400e"/>
    <path d="M42 43 Q50 50 58 43" stroke="#92400e" strokeWidth="1.5" fill="none"/>
    {[[-14,3],[14,3],[-14,-3],[14,-3]].map(([dy,dx],i)=><line key={i} x1={i<2?42:58} y1={38} x2={i<2?42+dy:58+dy} y2={38+dx} stroke="#92400e" strokeWidth="1"/>)}
  </svg>
);}

function AvatarDinoSVG({size=80}){return(
  <svg width={size} height={size} viewBox="0 0 100 100">
    {[25,35,45,55,65,75].map((x,i)=><ellipse key={i} cx={x} cy={i%2===0?16:12} rx="5" ry={i%2===0?7:6} fill="#16a34a"/>)}
    <circle cx="50" cy="48" r="30" fill="#4ade80"/>
    <ellipse cx="50" cy="72" rx="26" ry="18" fill="#22c55e"/>
    <ellipse cx="34" cy="40" rx="11" ry="10" fill="white"/>
    <ellipse cx="66" cy="40" rx="11" ry="10" fill="white"/>
    <circle cx="34" cy="40" r="6" fill="#1c1917"/>
    <circle cx="66" cy="40" r="6" fill="#1c1917"/>
    <circle cx="32" cy="38" r="2.5" fill="white"/>
    <circle cx="64" cy="38" r="2.5" fill="white"/>
    <ellipse cx="50" cy="61" rx="20" ry="8" fill="#16a34a"/>
    {[33,40,47,53,60,67].map((x,i)=><polygon key={i} points={`${x-3},65 ${x},57 ${x+3},65`} fill="white"/>)}
    <path d="M30 69 Q50 80 70 69" stroke="#15803d" strokeWidth="2" fill="none"/>
    <ellipse cx="22" cy="72" rx="6" ry="3" fill="#4ade80"/>
    <ellipse cx="78" cy="72" rx="6" ry="3" fill="#4ade80"/>
  </svg>
);}

function AvatarSlothSVG({size=80}){return(
  <svg width={size} height={size} viewBox="0 0 100 100">
    <circle cx="50" cy="46" r="32" fill="#a16207"/>
    <ellipse cx="50" cy="54" rx="22" ry="18" fill="#d4a15a"/>
    <ellipse cx="50" cy="50" rx="20" ry="15" fill="#fde68a" opacity="0.5"/>
    <ellipse cx="34" cy="38" rx="10" ry="7" fill="#78350f" opacity="0.6"/>
    <ellipse cx="66" cy="38" rx="10" ry="7" fill="#78350f" opacity="0.6"/>
    <ellipse cx="34" cy="41" rx="10" ry="8" fill="white"/>
    <ellipse cx="66" cy="41" rx="10" ry="8" fill="white"/>
    <ellipse cx="34" cy="44" rx="7" ry="4" fill="#1c1917"/>
    <ellipse cx="66" cy="44" rx="7" ry="4" fill="#1c1917"/>
    <circle cx="32" cy="40" r="1.5" fill="white"/>
    <circle cx="64" cy="40" r="1.5" fill="white"/>
    <path d="M34 42 Q34 46 34 42" stroke="#1c1917" strokeWidth="2"/>
    <path d="M66 42 Q66 46 66 42" stroke="#1c1917" strokeWidth="2"/>
    <line x1="29" y1="40" x2="34" y2="42" stroke="#78350f" strokeWidth="1.5"/>
    <line x1="29" y1="44" x2="34" y2="42" stroke="#78350f" strokeWidth="1.5"/>
    <line x1="71" y1="40" x2="66" y2="42" stroke="#78350f" strokeWidth="1.5"/>
    <line x1="71" y1="44" x2="66" y2="42" stroke="#78350f" strokeWidth="1.5"/>
    <ellipse cx="50" cy="61" rx="7" ry="5" fill="#c49a3c"/>
    <ellipse cx="44" cy="59" rx="3" ry="2" fill="#a16207"/>
    <ellipse cx="56" cy="59" rx="3" ry="2" fill="#a16207"/>
    <path d="M43 65 Q50 72 57 65" stroke="#92400e" strokeWidth="2" fill="none"/>
    <line x1="20" y1="65" x2="30" y2="50" stroke="#78350f" strokeWidth="7" strokeLinecap="round"/>
    <line x1="80" y1="65" x2="70" y2="50" stroke="#78350f" strokeWidth="7" strokeLinecap="round"/>
    {[-3,0,3].map((d,i)=><line key={i} x1={24+d} y1="65" x2={22+d} y2="76" stroke="#4a2006" strokeWidth="2.5" strokeLinecap="round"/>)}
    {[-3,0,3].map((d,i)=><line key={i} x1={76+d} y1="65" x2={78+d} y2="76" stroke="#4a2006" strokeWidth="2.5" strokeLinecap="round"/>)}
    <text x="38" y="32" fontSize="12" textAnchor="middle">💤</text>
    <text x="68" y="28" fontSize="9" textAnchor="middle">z</text>
  </svg>
);}

const BASE_WORDS = {
  "⚡ Electronics & Circuits": {
    easy: [
      {en:"Resistor",he:"נגד",tip:"מגביל זרם חשמלי"},
      {en:"Capacitor",he:"קבל",tip:"מאחסן מטען חשמלי"},
      {en:"Diode",he:"דיודה",tip:"מאפשר זרם בכיוון אחד"},
      {en:"Transistor",he:"טרנזיסטור",tip:"מגבר או מתג אלקטרוני"},
      {en:"Voltage",he:"מתח",tip:"הפרש פוטנציאל חשמלי"},
      {en:"Current",he:"זרם",tip:"זרימת אלקטרונים"},
      {en:"Circuit",he:"מעגל",tip:"נתיב סגור לזרם חשמלי"},
      {en:"Ground",he:"אדמה",tip:"נקודת ייחוס אפס וולט"},
      {en:"Frequency",he:"תדירות",tip:"מספר מחזורים לשנייה"},
      {en:"Amplitude",he:"משרעת",tip:"עוצמת האות המקסימלית"},
    ],
    medium: [
      {en:"Oscillator",he:"מתנד",tip:"מייצר אות מחזורי"},
      {en:"Amplifier",he:"מגבר",tip:"מגדיל עוצמת אות"},
      {en:"Impedance",he:"עכבה",tip:"התנגדות לזרם חילופי"},
      {en:"Rectifier",he:"מיישר",tip:"ממיר AC ל-DC"},
      {en:"PCB",he:"לוח מעגל מודפס",tip:"משטח לרכיבים אלקטרוניים"},
      {en:"Microcontroller",he:"בקר מיקרו",tip:"מחשב קטן על שבב"},
      {en:"PWM",he:"אפנון רוחב פולס",tip:"שליטה בעוצמה דיגיטלית"},
      {en:"ADC",he:"ממיר אנלוגי-דיגיטלי",tip:"ממיר אות רציף לדיגיטלי"},
      {en:"DAC",he:"ממיר דיגיטלי-אנלוגי",tip:"ממיר דיגיטלי לאנלוגי"},
      {en:"Filter",he:"מסנן",tip:"מעביר תדרים נבחרים"},
    ],
    hard: [
      {en:"Phase Noise",he:"רעש פאזה",tip:"אי-יציבות בתדר אוסצילטור"},
      {en:"VSWR",he:"יחס גל עומד",tip:"מדד התאמת עכבה"},
      {en:"Nyquist Theorem",he:"משפט נייקוויסט",tip:"דגימה מינימלית לשחזור אות"},
      {en:"Crosstalk",he:"הפרעה הדדית",tip:"דליפת אות בין מוליכים"},
      {en:"EMI",he:"הפרעה אלקטרומגנטית",tip:"אות רעש ממקור חיצוני"},
      {en:"S-Parameters",he:"פרמטרי פיזור",tip:"מאפייני מעגל ב-RF"},
      {en:"Jitter",he:"ריעד",tip:"שינוי זמן בלתי רצוי באות"},
      {en:"Slew Rate",he:"קצב עלייה",tip:"מהירות שינוי מתח מקסימלית"},
      {en:"Harmonics",he:"הרמוניות",tip:"כפולות של התדר הבסיסי"},
      {en:"Common Mode Rejection",he:"דחיית מצב משותף",tip:"יכולת סינון רעש משותף"},
    ]
  },
  "🔬 Optical Calibration": {
    easy: [
      {en:"Wavelength",he:"אורך גל",tip:"מרחק בין שני פסגות גל"},
      {en:"Lens",he:"עדשה",tip:"מרכז או מפזר אור"},
      {en:"Aperture",he:"צמצם",tip:"פתח שמשקלל כמות אור"},
      {en:"Focus",he:"מיקוד",tip:"נקודת התכנסות קרניים"},
      {en:"Resolution",he:"רזולוציה",tip:"יכולת הפרדת פרטים קטנים"},
      {en:"Beam",he:"קרן",tip:"עמוד אור מכוון"},
      {en:"Sensor",he:"חיישן",tip:"ממיר אור לאות חשמלי"},
      {en:"Pixel",he:"פיקסל",tip:"יחידת תמונה בסיסית"},
      {en:"Mirror",he:"מראה",tip:"מחזיר קרינה"},
      {en:"Prism",he:"פריזמה",tip:"מפרק אור לצבעים"},
    ],
    medium: [
      {en:"MTF",he:"פונקציית העברת מודולציה",tip:"מדד חדות אופטית"},
      {en:"Collimation",he:"קולימציה",tip:"יישור קרני אור למקביליות"},
      {en:"Distortion",he:"עיוות",tip:"סטייה מצורת תמונה אידיאלית"},
      {en:"Chromatic Aberration",he:"סטייה כרומטית",tip:"מיקוד שונה לצבעים שונים"},
      {en:"Vignetting",he:"חשכה שולית",tip:"הכהיית שולי תמונה"},
      {en:"CCD",he:"חיישן CCD",tip:"חיישן תמונה אנלוגי"},
      {en:"CMOS",he:"חיישן CMOS",tip:"חיישן תמונה דיגיטלי"},
      {en:"Boresight",he:"כיוון ציר",tip:"יישור ציר אופטי מכני"},
      {en:"Stray Light",he:"אור תועה",tip:"קרינה לא רצויה במערכת"},
      {en:"Depth of Field",he:"עומק שדה",tip:"טווח מרחקים במיקוד"},
    ],
    hard: [
      {en:"Zernike Polynomials",he:"פולינומי זרניקה",tip:"תיאור מתמטי של שגיאות גל"},
      {en:"Wavefront Error",he:"שגיאת חזית גל",tip:"סטייה מחזית גל אידיאלית"},
      {en:"Strehl Ratio",he:"יחס סטרל",tip:"מדד איכות אופטית"},
      {en:"PSF",he:"פונקציית פיזור נקודה",tip:"תגובת מערכת לנקודת אור"},
      {en:"Interferometry",he:"אינטרפרומטריה",tip:"מדידה בהפרעות גלים"},
      {en:"Diffraction Limit",he:"גבול עקיפה",tip:"רזולוציה מקסימלית תיאורטית"},
      {en:"Astigmatism",he:"אסטיגמטיזם",tip:"שגיאה אופטית אקסית"},
      {en:"Birefringence",he:"דו-שבירה",tip:"מדד שבירה תלוי-פולריזציה"},
      {en:"OTF",he:"פונקציית העברה אופטית",tip:"מאפיין תדר של מערכת אופטית"},
      {en:"BRDF",he:"פונקציית בזור",tip:"תיאור השתקפות פני שטח"},
    ]
  },
  "📡 Radiometric Testing": {
    easy: [
      {en:"Radiance",he:"בהירות קרינתית",tip:"עוצמת קרינה לכיוון"},
      {en:"Irradiance",he:"עוצמת הקרנה",tip:"הספק קרינה על שטח"},
      {en:"Spectrum",he:"ספקטרום",tip:"פיזור תדרי הקרינה"},
      {en:"Infrared",he:"אינפרה-אדום",tip:"קרינה מתחת לאדום הנראה"},
      {en:"Blackbody",he:"גוף שחור",tip:"קורן מושלם בכל התדרים"},
      {en:"Emissivity",he:"פליטיות",tip:"יחס פליטה לגוף שחור"},
      {en:"Detector",he:"גלאי",tip:"ממיר קרינה לאות"},
      {en:"Photon",he:"פוטון",tip:"יחידת אנרגיה של אור"},
      {en:"SNR",he:"יחס אות לרעש",tip:"עוצמת אות חלקי רעש"},
      {en:"Ultraviolet",he:"אולטרה-סגול",tip:"קרינה מעל הסגול הנראה"},
    ],
    medium: [
      {en:"NEP",he:"הספק שווה-רעש",tip:"אות מינימלי ניתן לגילוי"},
      {en:"Responsivity",he:"רגישות גלאי",tip:"אות חשמלי לכל וואט קרינה"},
      {en:"Dark Current",he:"זרם אפלה",tip:"זרם גלאי ללא קרינה"},
      {en:"Quantum Efficiency",he:"יעילות קוונטית",tip:"יחס פוטונים לאלקטרונים"},
      {en:"Flat Field Correction",he:"תיקון שדה שטוח",tip:"נורמליזציה של אחידות חיישן"},
      {en:"Integration Time",he:"זמן אינטגרציה",tip:"משך חשיפת חיישן"},
      {en:"Saturation",he:"רוויה",tip:"חיישן בעומס מקסימלי"},
      {en:"Linearity",he:"לינאריות",tip:"יחס ישר בין קלט לפלט"},
      {en:"Dark Frame",he:"מסגרת אפלה",tip:"תמונה ללא אור לניכוי רעש"},
      {en:"Radiometric Calibration",he:"כיול רדיומטרי",tip:"כימות מדויק של קרינה"},
    ],
    hard: [
      {en:"NEDT",he:"הפרש טמפרטורה שווה-רעש",tip:"רגישות טמפרטורה מינימלית"},
      {en:"Absolute Radiometry",he:"רדיומטריה מוחלטת",tip:"כיול מול סטנדרט ראשוני"},
      {en:"Stray Light Coefficient",he:"מקדם אור תועה",tip:"יחס אור לא-ישיר לכולל"},
      {en:"Polarimetry",he:"פולרימטריה",tip:"מדידת מצב פולריזציה קרינה"},
      {en:"IFOV",he:"שדה ראייה מיידי",tip:"זווית שדה פיקסל בודד"},
      {en:"NEdL",he:"בהירות שווה-רעש",tip:"בהירות מינימלית ניתנת לגילוי"},
      {en:"Photon Transfer Curve",he:"עקומת העברת פוטונים",tip:"מאפיין רעש-אות של חיישן"},
      {en:"Spectral Irradiance",he:"עוצמת הקרנה ספקטרלית",tip:"הספק קרינה לרוחב פס"},
      {en:"Vignetting Correction",he:"תיקון חשכה שולית",tip:"פיצוי על נפילת תאורה"},
      {en:"MTF at Nyquist",he:"MTF בנייקוויסט",tip:"חדות בתדר הדגימה המקסימלי"},
    ]
  },
  "🔧 Calibration & Testing": {
    easy: [
      {en:"Calibration",he:"כיול",tip:"כוונון מכשיר לסטנדרט"},
      {en:"Accuracy",he:"דיוק",tip:"קרבה לערך האמיתי"},
      {en:"Precision",he:"רגישות",tip:"חזרתיות מדידות"},
      {en:"Tolerance",he:"סבילות",tip:"טווח שגיאה מותר"},
      {en:"Reference",he:"ייחוס",tip:"ערך סטנדרטי ידוע"},
      {en:"Error",he:"שגיאה",tip:"סטייה מהערך האמיתי"},
      {en:"Repeatability",he:"חזרתיות",tip:"עקביות מדידות חוזרות"},
      {en:"Uncertainty",he:"אי-ודאות",tip:"טווח ספק במדידה"},
      {en:"Baseline",he:"ערך בסיס",tip:"קו ייחוס ראשוני"},
      {en:"Traceability",he:"ניתנות לייחוס",tip:"שרשרת כיול לסטנדרט לאומי"},
    ],
    medium: [
      {en:"Hysteresis",he:"היסטרזיס",tip:"תלות מדידה בהיסטוריה"},
      {en:"Drift",he:"סחף",tip:"שינוי איטי בערך לאורך זמן"},
      {en:"Offset",he:"הסטה",tip:"שגיאה קבועה בכל הטווח"},
      {en:"Gain Error",he:"שגיאת רווח",tip:"שגיאה פרופורציונלית לערך"},
      {en:"Noise Floor",he:"רצפת רעש",tip:"רמת רעש מינימלית"},
      {en:"Dynamic Range",he:"טווח דינמי",tip:"יחס בין מקסימום למינימום"},
      {en:"Transfer Function",he:"פונקציית העברה",tip:"יחס קלט-פלט של מערכת"},
      {en:"Cross-calibration",he:"כיול צולב",tip:"השוואה בין שני מכשירים"},
      {en:"Linearity Error",he:"שגיאת לינאריות",tip:"סטייה מקו ישר"},
      {en:"Resolution",he:"כושר פירוד",tip:"שינוי מינימלי הניתן לזיהוי"},
    ],
    hard: [
      {en:"Metrology",he:"מטרולוגיה",tip:"מדע המדידות המדויקות"},
      {en:"GUM",he:"מדריך אי-ודאות",tip:"תקן ISO לחישוב אי-ודאות"},
      {en:"Type A Uncertainty",he:"אי-ודאות סוג A",tip:"אי-ודאות מניתוח סטטיסטי"},
      {en:"Type B Uncertainty",he:"אי-ודאות סוג B",tip:"אי-ודאות מהערכה מומחה"},
      {en:"Coverage Factor",he:"גורם כיסוי",tip:"מכפיל לרמת ביטחון"},
      {en:"Systematic Error",he:"שגיאה שיטתית",tip:"שגיאה חוזרת ועקבית"},
      {en:"Gauge R&R",he:"חזרתיות ורבייה",tip:"ניתוח שונות מערכת מדידה"},
      {en:"Six Sigma",he:"שש סיגמא",tip:"מתודולוגיה לאיכות גבוהה"},
      {en:"ANOVA",he:"ניתוח שונות",tip:"ניתוח סטטיסטי של מקורות שגיאה"},
      {en:"Random Error",he:"שגיאה אקראית",tip:"שגיאה בלתי צפויה"},
    ]
  },
  "🌡️ Physics & Optics": {
    easy: [
      {en:"Refraction",he:"שבירה",tip:"שינוי כיוון אור בחומר"},
      {en:"Reflection",he:"החזרה",tip:"אור החוזר ממשטח"},
      {en:"Absorption",he:"בליעה",tip:"קרינה הנבלעת בחומר"},
      {en:"Polarization",he:"קיטוב",tip:"כיוון תנודת גל האור"},
      {en:"Diffraction",he:"עקיפה",tip:"כיפוף אור סביב מכשול"},
      {en:"Interference",he:"הפרעה",tip:"שילוב גלים"},
      {en:"Scattering",he:"פיזור",tip:"סטיית אור מכיוונו"},
      {en:"Coherence",he:"קוהרנטיות",tip:"קביעות יחסי פאזה"},
      {en:"Dispersion",he:"פיזור ספקטרלי",tip:"פרידת אור לצבעים"},
      {en:"Transmission",he:"שקיפות",tip:"מעבר קרינה דרך חומר"},
    ],
    medium: [
      {en:"Snell's Law",he:"חוק סנל",tip:"חוק שבירה באופטיקה"},
      {en:"Numerical Aperture",he:"צמצם מספרי",tip:"זווית קבלת אור מקסימלית"},
      {en:"Rayleigh Criterion",he:"קריטריון ריילי",tip:"גבול ההפרדה האופטית"},
      {en:"Stefan-Boltzmann Law",he:"חוק סטפן-בולצמן",tip:"פליטת קרינה לפי טמפרטורה"},
      {en:"Planck's Law",he:"חוק פלאנק",tip:"ספקטרום גוף שחור"},
      {en:"Beer-Lambert Law",he:"חוק בר-למבר",tip:"בליעת אור בתמיסה"},
      {en:"Index of Refraction",he:"מדד שבירה",tip:"יחס מהירות אור בחומר"},
      {en:"Airy Disk",he:"דיסק אירי",tip:"דפוס עקיפה של צמצם עגול"},
      {en:"Fourier Transform",he:"טרנספורם פורייה",tip:"פירוק אות לתדרים"},
      {en:"Fresnel Equations",he:"משוואות פרנל",tip:"חישוב החזרה ושבירה"},
    ],
    hard: [
      {en:"Maxwell Equations",he:"משוואות מקסוול",tip:"תיאור שדות אלקטרומגנטיים"},
      {en:"Jones Calculus",he:"חשבון ג'ונס",tip:"תיאור מתמטי של קיטוב"},
      {en:"Mueller Matrix",he:"מטריצת מולר",tip:"תיאור שינוי קיטוב"},
      {en:"Etendue",he:"זרם-קרינה",tip:"מדד שמרני לאופטיקה"},
      {en:"Seidel Aberrations",he:"סטיות זידל",tip:"חמש סטיות מונוכרומטיות"},
      {en:"Coherence Length",he:"אורך קוהרנטיות",tip:"מרחק שמירת קוהרנטיות"},
      {en:"Speckle Pattern",he:"דפוס נקודות",tip:"הפרעה של אור קוהרנטי"},
      {en:"Holography",he:"הולוגרפיה",tip:"הקלטת תמונה תלת-ממדית"},
      {en:"Quantum Optics",he:"אופטיקה קוונטית",tip:"אינטראקציה אור-חומר קוונטית"},
      {en:"Aberration Theory",he:"תורת הסטיות",tip:"ניתוח שגיאות אופטיות"},
    ]
  },
  "💬 תכנות באנגלית": {
    easy: [
      {en:"Open the terminal",he:"פתח את הטרמינל",tip:"Command line interface"},
      {en:"Save the file",he:"שמור את הקובץ",tip:"Ctrl+S shortcut"},
      {en:"Run the code",he:"הרץ את הקוד",tip:"Execute the program"},
      {en:"Fix the bug",he:"תקן את הבאג",tip:"Debug the error"},
      {en:"Push to GitHub",he:"דחוף לגיטהאב",tip:"git push command"},
      {en:"Clone the repo",he:"שכפל את המאגר",tip:"git clone command"},
      {en:"Install the package",he:"התקן את החבילה",tip:"npm install"},
      {en:"Check the logs",he:"בדוק את הלוגים",tip:"View error messages"},
      {en:"Write a function",he:"כתוב פונקציה",tip:"Define reusable code"},
      {en:"Print the output",he:"הדפס את הפלט",tip:"console.log()"},
    ],
    medium: [
      {en:"Deploy to production",he:"פרס לסביבת ייצור",tip:"Release to live server"},
      {en:"Merge the pull request",he:"מזג את בקשת המשיכה",tip:"Combine code branches"},
      {en:"Set environment variables",he:"הגדר משתני סביבה",tip:".env file settings"},
      {en:"Refactor the legacy code",he:"שפץ את הקוד הישן",tip:"Improve without changing behavior"},
      {en:"Write unit tests",he:"כתוב בדיקות יחידה",tip:"Test individual components"},
      {en:"Review the code changes",he:"סקור את שינויי הקוד",tip:"Code review process"},
      {en:"Handle the edge cases",he:"טפל במקרי קצה",tip:"Unexpected input handling"},
      {en:"Optimize the database query",he:"שפר את שאילתת ה-DB",tip:"Improve query performance"},
      {en:"Set up the CI pipeline",he:"הגדר את צינור ה-CI",tip:"Continuous integration"},
      {en:"Debug the memory leak",he:"אבחן את דליפת הזיכרון",tip:"Find memory issues"},
    ],
    hard: [
      {en:"Implement the singleton pattern",he:"ממש את תבנית הסינגלטון",tip:"One instance design pattern"},
      {en:"Handle race conditions",he:"טפל בתנאי מרוץ",tip:"Concurrent access issues"},
      {en:"Inject the dependencies",he:"הזרק את התלויות",tip:"Dependency injection pattern"},
      {en:"Profile the CPU bottleneck",he:"פרופיל את צוואר הבקבוק",tip:"Performance profiling"},
      {en:"Migrate the database schema",he:"העבר את סכמת הנתונים",tip:"Database migration"},
      {en:"Implement the observer pattern",he:"ממש את תבנית המשקיף",tip:"Event-driven design"},
      {en:"Resolve the merge conflict",he:"פתור את קונפליקט המיזוג",tip:"Git merge conflict"},
      {en:"Containerize the application",he:"הכנס לקונטיינר את האפליקציה",tip:"Docker containerization"},
      {en:"Scale the microservices",he:"קנה מידה למיקרו-שירותים",tip:"Horizontal scaling"},
      {en:"Implement rate limiting",he:"ממש הגבלת קצב",tip:"API rate limiting"},
    ]
  },
  "🔭 מערכות EO/IR/RF": {
    easy: [
      {en:"FLIR",he:"מצלמת אינפרה-אדום לפני",tip:"Forward Looking Infrared"},
      {en:"FOV",he:"שדה ראייה",tip:"Field of View — זווית הכיסוי של המצלמה"},
      {en:"EO System",he:"מערכת אלקטרו-אופטית",tip:"מערכת המשלבת אלקטרוניקה ואופטיקה"},
      {en:"IR Detector",he:"גלאי אינפרה-אדום",tip:"ממיר קרינת IR לאות חשמלי"},
      {en:"Thermal Camera",he:"מצלמה תרמית",tip:"דמות אובייקטים לפי חום"},
      {en:"Boresight",he:"ציר כיוון",tip:"יישור בין מרכז האופטיקה לציר המכני"},
      {en:"Target Detection",he:"גילוי מטרה",tip:"זיהוי עצם מטרה על רקע"},
      {en:"Night Vision",he:"ראייה לילית",tip:"גילוי בתנאי אפלה"},
      {en:"Tracking",he:"מעקב",tip:"מעקב אוטומטי אחרי מטרה נעה"},
      {en:"Gimbal",he:"ג'ימבל",tip:"פלטפורמה מייצבת לאופטיקה"},
    ],
    medium: [
      {en:"MWIR",he:"אינפרה-אדום גלים בינוניים",tip:"Mid-Wave IR — 3–5 מיקרון"},
      {en:"LWIR",he:"אינפרה-אדום גלים ארוכים",tip:"Long-Wave IR — 8–12 מיקרון"},
      {en:"SWIR",he:"אינפרה-אדום גלים קצרים",tip:"Short-Wave IR — 1–2.5 מיקרון"},
      {en:"NUC",he:"תיקון אי-אחידות",tip:"Non-Uniformity Correction"},
      {en:"LRF",he:"מד טווח לייזר",tip:"Laser Range Finder"},
      {en:"Detector Array",he:"מערך גלאים",tip:"מטריצת פיקסלים לחישת IR"},
      {en:"Image Stabilization",he:"ייצוב תמונה",tip:"הפחתת רעידות בצילום"},
      {en:"Seeker",he:"ראש מחפש",tip:"ראש כיוון של טיל"},
      {en:"Designator",he:"מסמן לייזר",tip:"לייזר לסימון מטרה"},
      {en:"EW",he:"לוחמה אלקטרונית",tip:"Electronic Warfare — הפרעה וסיוע"},
    ],
    hard: [
      {en:"NEDT",he:"הפרש טמפרטורה שווה-רעש",tip:"Noise Equivalent Temperature Difference"},
      {en:"MRTD",he:"הפרש טמפרטורה מינימלי הניתן לפתרון",tip:"Minimum Resolvable Temperature Difference"},
      {en:"Adaptive Optics",he:"אופטיקה אדפטיבית",tip:"תיקון שגיאות אטמוספריות בזמן אמת"},
      {en:"Hyperspectral Imaging",he:"הדמיה היפר-ספקטרלית",tip:"דימות בעשרות עד מאות ערוצי ספקטרום"},
      {en:"Conformal Window",he:"חלון קונפורמי",tip:"חלון אופטי שאינו שטוח"},
      {en:"Athermal Design",he:"עיצוב א-תרמי",tip:"ביצועים קבועים בטמפרטורות שונות"},
      {en:"IMU",he:"יחידת מדידה אינרציאלית",tip:"Inertial Measurement Unit — גירוסקופ+מד-תאוצה"},
      {en:"RCS",he:"חתך קידה רדארי",tip:"Radar Cross Section — עוצמת החזרה"},
      {en:"ECCM",he:"אמצעי נגד אלקטרוני",tip:"Electronic Counter-Countermeasures"},
      {en:"SAR",he:"מכ\"ם צמצם סינתטי",tip:"Synthetic Aperture Radar — הדמיה בטווח ארוך"},
    ]
  },
};

const SENTENCE_DATA=[
  {en:"The sensor measures infrared radiation",he:"החיישן מודד קרינת אינפרה-אדום",level:"easy"},
  {en:"The lens focuses the beam on the detector",he:"העדשה מקדת את הקרן על הגלאי",level:"easy"},
  {en:"Calibration ensures accurate measurements",he:"כיול מבטיח מדידות מדויקות",level:"easy"},
  {en:"The field of view defines the visible area",he:"שדה הראייה מגדיר את האזור הנראה",level:"easy"},
  {en:"Dark current occurs without any light",he:"זרם האפלה מתרחש ללא אור",level:"easy"},
  {en:"Full calibration includes radiometric and optical calibration",he:"כיול מלא כולל כיול רדיומטרי וכיול אופטי",level:"medium"},
  {en:"The MTF characterizes the optical resolution of the system",he:"ה-MTF מאפיין את הרזולוציה האופטית של המערכת",level:"medium"},
  {en:"Quantum efficiency determines detector sensitivity",he:"היעילות הקוונטית קובעת את רגישות הגלאי",level:"medium"},
  {en:"The wavefront error affects image quality",he:"שגיאת חזית הגל משפיעה על איכות התמונה",level:"medium"},
  {en:"The SNR ratio determines the minimum detectable signal",he:"יחס האות לרעש קובע את האות המינימלי הניתן לגילוי",level:"medium"},
  {en:"The PSF describes the response of the optical system to a point source",he:"ה-PSF מתאר את תגובת המערכת האופטית למקור נקודתי",level:"hard"},
  {en:"Stray light degrades image contrast and reduces the signal to noise ratio",he:"אור תועה פוגם בניגודיות התמונה ומפחית את יחס האות לרעש",level:"hard"},
  {en:"NEDT is the minimum temperature difference detectable by the system",he:"NEDT הוא הפרש הטמפרטורה המינימלי הניתן לגילוי על ידי המערכת",level:"hard"},
  {en:"Interferometric calibration measures wavefront aberrations with high accuracy",he:"כיול אינטרפרומטרי מודד סטיות חזית גל בדיוק גבוה",level:"hard"},
  {en:"The integration time determines the amount of light collected by the detector",he:"זמן האינטגרציה קובע את כמות האור הנאסף על ידי הגלאי",level:"hard"},
];
const CATEGORIES=Object.keys(BASE_WORDS);
const ALL_BASE=CATEGORIES.flatMap(cat=>["easy","medium","hard"].flatMap(lvl=>(BASE_WORDS[cat][lvl]||[]).map(w=>({...w,category:cat,level:lvl}))));
const MAX_LIVES=10;
function nextMidnight(){const d=new Date();d.setDate(d.getDate()+1);d.setHours(0,0,0,0);return d.getTime();}
const DUCK_STAGES=[
  {min:0,size:44,smart:0,color:"#fde68a",name:"ברווזון תינוק 🐣"},
  {min:8,size:52,smart:20,color:"#fcd34d",name:"ברווז סקרן 🐥"},
  {min:20,size:60,smart:40,color:"#34d399",name:"ברווז לומד 🦆"},
  {min:40,size:68,smart:60,color:"#60a5fa",name:"ברווז מתקדם 🎓"},
  {min:70,size:76,smart:75,color:"#a78bfa",name:"ברווז חכם 🧑‍💻"},
  {min:110,size:84,smart:88,color:"#f472b6",name:"ברווז מדען 🧠"},
  {min:160,size:92,smart:95,color:"#f59e0b",name:"ברווז גאון 🏆"},
  {min:230,size:100,smart:100,color:"#ef4444",name:"ברווז מאסטר! 👑"},
];
const LEVELS_XP=[
  {name:"מתחיל",xp:0,color:"#4ade80",emoji:"🌱"},
  {name:"חוקר",xp:200,color:"#22d3ee",emoji:"🔭"},
  {name:"מפתח",xp:500,color:"#a78bfa",emoji:"💻"},
  {name:"מומחה",xp:1000,color:"#f59e0b",emoji:"🔬"},
  {name:"מאסטר",xp:2000,color:"#ef4444",emoji:"🏆"},
];
const CAT_COLORS=["#f472b6","#fb923c","#facc15","#4ade80","#22d3ee","#a78bfa","#f87171","#34d399"];
const WRONG_MSGS=["אוי! הברווז בוכה! 😭","לא נכון! הברווז כועס! 🤬","שגיאה! הברווז נעלב! 😤","ממה?! הברווז המום! 😵‍💫","אוף... הברווז נמס! 🫠"];
const RIGHT_MSGS=["מעולה! הברווז קופץ! 🎉","נכון! הברווז רוקד! 💃","פרפקט! הברווז ממריא! 🚀","גאון! הברווז חוגג! 🥳","ברבו! הברווז מחא כפיים! 👏"];
const KEY="wmp_v_final";
function loadS(){try{const s=localStorage.getItem(KEY);return s?JSON.parse(s):null;}catch{return null;}}
function saveS(s){try{localStorage.setItem(KEY,JSON.stringify(s));}catch{}}
function initS(){return{xp:0,correct:0,total:0,streak:0,bestStreak:0,lives:MAX_LIVES,resetAt:null,seen:{},aiWords:[],customWords:[],selectedLevel:"easy",lang:"he",knownWords:[],noteWords:[],dayStreak:0,weekStreak:0,monthStreak:0,lastPlayDate:null,lastPlayWeek:null,lastPlayMonth:null,geminiKey:"",voiceGender:"female",plan:"free",aiCredits:0,customSentences:[],customEO:[],selectedAvatar:"duck",unlockedAvatars:["duck"],catProgress:{}};}
function shuffle(a){const b=[...a];for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]];}return b;}
function rnd(a){return a[Math.floor(Math.random()*a.length)];}
function getLevel(xp){return[...LEVELS_XP].reverse().find(l=>xp>=l.xp)||LEVELS_XP[0];}
function getNext(xp){return LEVELS_XP.find(l=>l.xp>xp)||null;}
function getDuck(c){return[...DUCK_STAGES].reverse().find(d=>c>=d.min)||DUCK_STAGES[0];}
function lvlLabel(l,lang){if(lang==="en")return l==="easy"?"🟢 Easy":l==="medium"?"🟡 Medium":"🔴 Hard";return l==="easy"?"🟢 קל":l==="medium"?"🟡 בינוני":"🔴 קשה";}
function fmt(ms){if(ms<=0)return"00:00:00";const h=Math.floor(ms/3600000),m=Math.floor((ms%3600000)/60000),s=Math.floor((ms%60000)/1000);return`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;}
function getTodayStr(){return new Date().toISOString().slice(0,10);}
function getWeekStr(){const d=new Date();d.setDate(d.getDate()-d.getDay());return d.toISOString().slice(0,10);}
function getMonthStr(){return new Date().toISOString().slice(0,7);}
function calcStreaks(prev){
  const today=getTodayStr();
  if(prev.lastPlayDate===today)return{};
  const prevDate=prev.lastPlayDate?new Date(prev.lastPlayDate):null;
  const dayDiff=prevDate?Math.round((new Date(today)-prevDate)/86400000):null;
  const newDayStreak=dayDiff===1?(prev.dayStreak||0)+1:1;
  const todayWeek=getWeekStr();
  const prevWeekDate=prev.lastPlayWeek?new Date(prev.lastPlayWeek):null;
  const weekDiff=prevWeekDate?Math.round((new Date(todayWeek)-prevWeekDate)/604800000):null;
  const newWeekStreak=prev.lastPlayWeek===todayWeek?(prev.weekStreak||1):weekDiff===1?(prev.weekStreak||0)+1:1;
  const todayMonth=getMonthStr();
  let newMonthStreak=1;
  if(prev.lastPlayMonth&&prev.lastPlayMonth!==todayMonth){
    const[py,pm]=prev.lastPlayMonth.split('-').map(Number);
    const[ty,tm]=todayMonth.split('-').map(Number);
    newMonthStreak=(ty-py)*12+(tm-pm)===1?(prev.monthStreak||0)+1:1;
  }else if(prev.lastPlayMonth===todayMonth){newMonthStreak=prev.monthStreak||1;}
  return{dayStreak:newDayStreak,weekStreak:newWeekStreak,monthStreak:newMonthStreak,lastPlayDate:today,lastPlayWeek:todayWeek,lastPlayMonth:todayMonth};
}

function ApiKeyGuideModal({onClose,onHasKey}){
  const steps=[
    {n:1,title:"כנס לאתר",desc:"פתח בדפדפן: aistudio.google.com",icon:"🌐"},
    {n:2,title:"התחבר",desc:'לחץ "Sign In" והתחבר עם חשבון Google שלך',icon:"👤"},
    {n:3,title:'לחץ "Get API Key"',desc:"בתפריט שמאל תראה את האפשרות הזו",icon:"🔑"},
    {n:4,title:"צור מפתח",desc:'לחץ "Create API key" ← "Create API key in new project"',icon:"✨"},
    {n:5,title:"העתק",desc:"המפתח נוצר! לחץ על סמל ההעתקה לידו",icon:"📋"},
    {n:6,title:"הדבק באפליקציה",desc:"חזור לפרופיל → הגדרות AI → הדבק את המפתח",icon:"✅"},
  ];
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.92)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",padding:20,backdropFilter:"blur(16px)"}}>
      <div style={{background:"linear-gradient(135deg,#1e1b4b,#0f172a)",border:"1px solid rgba(34,211,238,0.35)",borderRadius:24,padding:24,maxWidth:420,width:"100%",maxHeight:"88vh",overflowY:"auto",boxShadow:"0 0 60px rgba(34,211,238,0.2)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <div>
            <div style={{fontSize:11,color:"#22d3ee",fontWeight:800,letterSpacing:2,marginBottom:2}}>🤖 GEMINI AI</div>
            <div style={{fontSize:20,fontWeight:900,color:"#fff"}}>קבל מפתח AI חינמי</div>
          </div>
          <button onClick={onClose} className="btn" style={{background:"rgba(255,255,255,0.08)",border:"none",color:"#fff",borderRadius:"50%",width:36,height:36,fontSize:18}}>✕</button>
        </div>
        <div style={{background:"rgba(34,211,238,0.08)",border:"1px solid rgba(34,211,238,0.2)",borderRadius:14,padding:"10px 14px",marginBottom:18,fontSize:12,color:"#22d3ee",lineHeight:1.6}}>
          💡 Gemini AI מציע <strong>1,500 בקשות ביום חינמיות</strong> — יותר מספיק לשימוש יומי!
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:18}}>
          {steps.map(s=>(
            <div key={s.n} style={{display:"flex",gap:12,alignItems:"flex-start",background:"rgba(255,255,255,0.04)",borderRadius:12,padding:"10px 12px",border:"1px solid rgba(255,255,255,0.06)"}}>
              <div style={{background:"rgba(34,211,238,0.15)",border:"1px solid rgba(34,211,238,0.3)",borderRadius:20,width:32,height:32,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:16}}>{s.icon}</div>
              <div>
                <div style={{fontSize:13,fontWeight:800,color:"#fff",marginBottom:2}}>שלב {s.n}: {s.title}</div>
                <div style={{fontSize:12,color:"rgba(255,255,255,0.55)",lineHeight:1.5}}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>window.open("https://aistudio.google.com/apikey","_blank")} className="btn" style={{flex:1,background:"linear-gradient(135deg,#22d3ee,#a78bfa)",border:"none",borderRadius:12,padding:"13px",color:"#fff",fontSize:14,fontWeight:800}}>
            🌐 פתח AI Studio
          </button>
          <button onClick={onHasKey} className="btn" style={{flex:1,background:"rgba(74,222,128,0.15)",border:"1px solid rgba(74,222,128,0.35)",borderRadius:12,padding:"13px",color:"#4ade80",fontSize:13,fontWeight:700}}>
            ✅ יש לי מפתח
          </button>
        </div>
      </div>
    </div>
  );
}

function PremiumModal({state,setState,onClose}){
  const plans=[
    {id:"starter",name:"מתחיל",price:"₪9.90",credits:100,desc:"100 שאלות AI",color:"#22d3ee"},
    {id:"pro",name:"פרו",price:"₪19.90",credits:300,desc:"300 שאלות AI",color:"#a78bfa",best:true},
    {id:"unlimited",name:"ללא הגבלה",price:"₪49.90",credits:1000,desc:"1,000 שאלות AI",color:"#f59e0b"},
  ];
  function unlock(credits){
    setState(p=>{const n={...p,plan:"premium",aiCredits:(p.aiCredits||0)+credits};saveS(n);return n;});
    onClose();
  }
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.92)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",padding:20,backdropFilter:"blur(16px)"}}>
      <div style={{background:"linear-gradient(135deg,#1e1b4b,#0f172a)",border:"1px solid rgba(167,139,250,0.35)",borderRadius:24,padding:24,maxWidth:420,width:"100%",maxHeight:"88vh",overflowY:"auto",boxShadow:"0 0 60px rgba(167,139,250,0.2)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
          <div style={{fontSize:22,fontWeight:900,color:"#fff"}}>⭐ פרמיום AI</div>
          <button onClick={onClose} className="btn" style={{background:"rgba(255,255,255,0.08)",border:"none",color:"#fff",borderRadius:"50%",width:36,height:36,fontSize:18}}>✕</button>
        </div>
        <div style={{fontSize:13,color:"rgba(255,255,255,0.5)",marginBottom:20}}>השתמש ב-AI שלנו — בלי מפתח, בלי הגדרות</div>
        <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:18}}>
          {plans.map(p=>(
            <div key={p.id} style={{background:p.best?"rgba(167,139,250,0.12)":"rgba(255,255,255,0.04)",border:`2px solid ${p.best?p.color:"rgba(255,255,255,0.08)"}`,borderRadius:16,padding:"14px 16px",position:"relative"}}>
              {p.best&&<div style={{position:"absolute",top:-10,left:"50%",transform:"translateX(-50%)",background:p.color,borderRadius:20,padding:"2px 12px",fontSize:10,color:"#1a1a2e",fontWeight:800}}>הכי פופולרי ⭐</div>}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                <div>
                  <div style={{fontSize:16,fontWeight:900,color:"#fff"}}>{p.name}</div>
                  <div style={{fontSize:12,color:"rgba(255,255,255,0.5)"}}>{p.desc}</div>
                </div>
                <div style={{textAlign:"left"}}>
                  <div style={{fontSize:20,fontWeight:900,color:p.color}}>{p.price}</div>
                  <div style={{fontSize:10,color:"rgba(255,255,255,0.3)"}}>חד פעמי</div>
                </div>
              </div>
              <button onClick={()=>unlock(p.credits)} className="btn" style={{width:"100%",background:`${p.color}22`,border:`1px solid ${p.color}55`,borderRadius:10,padding:"9px",color:p.color,fontSize:13,fontWeight:800}}>
                רכוש {p.name} →
              </button>
            </div>
          ))}
        </div>
        <div style={{fontSize:10,color:"rgba(255,255,255,0.2)",textAlign:"center",lineHeight:1.6}}>
          * מערכת תשלום בפיתוח — לחיצה על "רכוש" תפעיל גרסת demo עם קרדיטים מלאים
        </div>
        {state.aiCredits>0&&<div style={{marginTop:12,fontSize:13,color:"#4ade80",textAlign:"center",fontWeight:700}}>נותרו לך {state.aiCredits} קרדיטים AI ✅</div>}
      </div>
    </div>
  );
}

function DuckSVG({stage,mood,size}){
  const s=size||stage.size,col=stage.color,smart=stage.smart;
  const angry=mood==="angry",happy=mood==="happy";
  const glasses=smart>=40,cap=smart>=60,coat=smart>=75;
  const bodyAnim=angry||happy?"none":"breathe 3.5s ease infinite";
  const tailAnim=happy?"tailWag 0.22s ease infinite":angry?"tailWag 0.28s ease infinite":"tailWag 4s ease infinite";
  const wingAnim=happy?"wingFlap 0.35s ease infinite":angry?"wingFlap 0.4s ease infinite":"none";
  return(
    <svg width={s} height={s} viewBox="0 0 100 115" style={{filter:happy?"drop-shadow(0 0 10px gold)":angry?"drop-shadow(0 0 10px red)":"drop-shadow(0 0 5px rgba(255,255,255,0.15))",transition:"all 0.3s",overflow:"visible"}}>
      <ellipse cx="82" cy="69" rx="11" ry="6" fill={col} opacity="0.85"
        style={{transformBox:"fill-box",transformOrigin:"15% 50%",animation:tailAnim}}/>
      {coat&&<><rect x="28" y="82" width="44" height="20" rx="4" fill="white" opacity="0.9"/><line x1="50" y1="82" x2="50" y2="102" stroke="#e2e8f0" strokeWidth="1"/><circle cx="43" cy="88" r="2" fill="#3b82f6"/><circle cx="43" cy="95" r="2" fill="#3b82f6"/></>}
      <ellipse cx="50" cy="72" rx="30" ry="24" fill={angry?"#ef4444":col} opacity="0.95"
        style={{transformBox:"fill-box",transformOrigin:"center",animation:bodyAnim}}/>
      <ellipse cx="22" cy="75" rx="13" ry="9" fill={col} opacity="0.75"
        transform={happy?"rotate(-22 22 75)":angry?"rotate(22 22 75)":""}
        style={{transition:"transform 0.3s",transformBox:"fill-box",transformOrigin:"80% 50%",animation:wingAnim}}/>
      <ellipse cx="78" cy="75" rx="13" ry="9" fill={col} opacity="0.75"
        transform={happy?"rotate(22 78 75)":angry?"rotate(-22 78 75)":""}
        style={{transition:"transform 0.3s"}}/>
      <circle cx="50" cy="40" r="22" fill={angry?"#ef4444":col}/>
      <ellipse cx={angry?"69":"68"} cy="43" rx="11" ry="6" fill="#f59e0b"
        transform={angry?"rotate(12 68 43)":happy?"rotate(-6 68 43)":""}
        style={{transition:"all 0.3s"}}/>
      {glasses?(
        <>
          <circle cx="41" cy="37" r="8" fill="none" stroke="#94a3b8" strokeWidth="1.5"/>
          <circle cx="59" cy="37" r="8" fill="none" stroke="#94a3b8" strokeWidth="1.5"/>
          <line x1="49" y1="37" x2="51" y2="37" stroke="#94a3b8" strokeWidth="1.5"/>
          <circle cx="41" cy="37" r="5" fill="#1e1b4b" className="duck-eye" style={{transformBox:"fill-box",transformOrigin:"center"}}/>
          <circle cx="59" cy="37" r="5" fill="#1e1b4b" className="duck-eye-r" style={{transformBox:"fill-box",transformOrigin:"center"}}/>
          <circle cx="43" cy="35" r="1.5" fill="white" className="duck-eye" style={{transformBox:"fill-box",transformOrigin:"50% 70%"}}/>
          <circle cx="61" cy="35" r="1.5" fill="white" className="duck-eye-r" style={{transformBox:"fill-box",transformOrigin:"50% 70%"}}/>
        </>
      ):(
        <>
          <circle cx="41" cy="37" r="6" fill="#1a1a2e" className="duck-eye" style={{transformBox:"fill-box",transformOrigin:"center"}}/>
          <circle cx="59" cy="37" r="6" fill="#1a1a2e" className="duck-eye-r" style={{transformBox:"fill-box",transformOrigin:"center"}}/>
          <circle cx="43" cy="35" r="2" fill="white" className="duck-eye" style={{transformBox:"fill-box",transformOrigin:"50% 70%"}}/>
          <circle cx="61" cy="35" r="2" fill="white" className="duck-eye-r" style={{transformBox:"fill-box",transformOrigin:"50% 70%"}}/>
        </>
      )}
      {angry&&<><line x1="35" y1="28" x2="47" y2="32" stroke="#7f1d1d" strokeWidth="2.5" strokeLinecap="round"/><line x1="53" y1="32" x2="65" y2="28" stroke="#7f1d1d" strokeWidth="2.5" strokeLinecap="round"/></>}
      {happy&&<><line x1="35" y1="32" x2="47" y2="28" stroke="#065f46" strokeWidth="2" strokeLinecap="round"/><line x1="53" y1="28" x2="65" y2="32" stroke="#065f46" strokeWidth="2" strokeLinecap="round"/></>}
      {cap&&<><rect x="32" y="17" width="36" height="6" rx="2" fill="#1e1b4b"/><polygon points="50,6 32,17 68,17" fill="#1e1b4b"/><line x1="68" y1="17" x2="73" y2="25" stroke="#f59e0b" strokeWidth="2"/><circle cx="73" cy="27" r="2.5" fill="#f59e0b"/></>}
      <ellipse cx="41" cy="97" rx="7" ry="4" fill="#f59e0b"
        style={{transformBox:"fill-box",transformOrigin:"center top",animation:happy?"feetDance 0.28s ease infinite alternate":"none"}}/>
      <ellipse cx="59" cy="97" rx="7" ry="4" fill="#f59e0b"
        style={{transformBox:"fill-box",transformOrigin:"center top",animation:happy?"feetDance 0.28s 0.14s ease infinite alternate":"none"}}/>
      {happy&&<><text x="10" y="26" fontSize="13">✨</text><text x="74" y="26" fontSize="13">⭐</text></>}
      {angry&&<><text x="6" y="22" fontSize="11">💢</text><text x="80" y="22" fontSize="11">💢</text></>}
    </svg>
  );
}

const CSS=`
@import url('https://fonts.googleapis.com/css2?family=Heebo:wght@400;600;700;800;900&display=swap');
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'Heebo',sans-serif;-webkit-tap-highlight-color:transparent;}
::-webkit-scrollbar{width:4px;}
::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.2);border-radius:2px;}
@keyframes duckHappy{0%,100%{transform:translateY(0)rotate(0)scale(1)}20%{transform:translateY(-24px)rotate(-12deg)scale(1.2)}60%{transform:translateY(-14px)rotate(10deg)scale(1.12)}}
@keyframes duckAngry{0%,100%{transform:translateX(0)}15%{transform:translateX(-14px)rotate(-10deg)}30%{transform:translateX(14px)rotate(10deg)}60%{transform:translateX(10px)rotate(6deg)}}
@keyframes duckIdle{0%,100%{transform:translateY(0)rotate(0)}30%{transform:translateY(-6px)rotate(-2deg)}70%{transform:translateY(-4px)rotate(2deg)}}
@keyframes slideUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
@keyframes fadeIn{from{opacity:0;transform:scale(0.9)}to{opacity:1;transform:scale(1)}}
@keyframes xpFloat{0%{opacity:1;transform:translateY(0)scale(1)}100%{opacity:0;transform:translateY(-70px)scale(1.7)}}
@keyframes rainbow{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
@keyframes glow{0%,100%{box-shadow:0 0 15px rgba(255,255,255,0.07)}50%{box-shadow:0 0 30px rgba(255,255,255,0.2)}}
@keyframes levelUp{0%{transform:scale(1)rotate(0)}25%{transform:scale(1.4)rotate(-15deg)}50%{transform:scale(1.5)rotate(15deg)}75%{transform:scale(1.2)rotate(-5deg)}100%{transform:scale(1)rotate(0)}}
@keyframes breathe{0%,100%{transform:scale(1)}50%{transform:scaleX(1.04)scaleY(1.03)}}
@keyframes tailWag{0%,100%{transform:rotate(-20deg)}50%{transform:rotate(20deg)}}
@keyframes wingFlap{0%,100%{transform:rotate(0deg)}50%{transform:rotate(-35deg)}}
@keyframes feetDance{0%{transform:translateY(0)}100%{transform:translateY(-4px)}}
@keyframes blink{0%,78%,100%{transform:scaleY(1)}83%{transform:scaleY(0.08)}88%{transform:scaleY(1)}91%{transform:scaleY(0.08)}95%{transform:scaleY(1)}}
.duck-eye{animation:blink 5s ease infinite;transform-box:fill-box;transform-origin:center;}
.duck-eye-r{animation:blink 5s 0.18s ease infinite;transform-box:fill-box;transform-origin:center;}
.btn{cursor:pointer;border:none;font-family:'Heebo',sans-serif;transition:all 0.2s;}
.btn:hover:not(:disabled){filter:brightness(1.15);transform:translateY(-2px);}
.btn:active:not(:disabled){transform:translateY(0)scale(0.97);}
input,select,textarea{font-family:'Heebo',sans-serif;}
@keyframes duckBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
@keyframes duckSway{0%,100%{transform:rotate(0deg)}25%{transform:rotate(-9deg)}75%{transform:rotate(9deg)}}
@keyframes duckStrut{0%,100%{transform:translate(0,0)rotate(0)}33%{transform:translate(-4px,-1px)rotate(-5deg)}66%{transform:translate(4px,-1px)rotate(5deg)}}
@keyframes duckBounce{0%,100%{transform:translateY(0)scaleY(1)}38%{transform:translateY(-15px)scaleY(1.05)}52%{transform:translateY(-15px)scaleY(1.05)}88%{transform:translateY(3px)scaleY(0.96)}}
@keyframes duckNinja{0%,65%,100%{transform:rotate(0)translateX(0)}70%{transform:rotate(-22deg)translateX(-6px)scale(1.05)}75%{transform:rotate(22deg)translateX(6px)scale(1.05)}80%{transform:rotate(0)translateX(0)}}
@keyframes duckFloat{0%,100%{transform:translateY(0)rotate(0)}50%{transform:translateY(-6px)rotate(-2deg)}}
@keyframes duckMagic{0%,100%{transform:translateY(0)rotate(0deg)scale(1)}30%{transform:translateY(-9px)rotate(-4deg)scale(1.03)}70%{transform:translateY(-5px)rotate(4deg)scale(1.02)}}
@keyframes duckGolden{0%,100%{transform:translateY(0)scale(1);filter:drop-shadow(0 0 7px #fbbf24)}50%{transform:translateY(-7px)scale(1.04);filter:drop-shadow(0 0 20px #fbbf24)brightness(1.14)}}
@keyframes duckSomersault{0%{transform:translateY(0)rotate(0deg)scale(1)}20%{transform:translateY(-55px)rotate(72deg)scale(1.18)}40%{transform:translateY(-90px)rotate(144deg)scale(1.28)}60%{transform:translateY(-65px)rotate(216deg)scale(1.22)}80%{transform:translateY(-22px)rotate(288deg)scale(1.1)}100%{transform:translateY(0)rotate(360deg)scale(1)}}
@keyframes letterPop{0%{opacity:0;transform:translateY(-28px)scale(2)rotate(-18deg);filter:blur(5px)}60%{opacity:1;transform:translateY(5px)scale(0.92)rotate(2deg);filter:blur(0)}80%{transform:translateY(-2px)scale(1.06)rotate(-1deg)}100%{opacity:1;transform:translateY(0)scale(1)rotate(0deg)}}
@keyframes splashFadeOut{from{opacity:1;transform:scale(1)}to{opacity:0;transform:scale(1.04)}}
@keyframes duckThink{0%,100%{transform:rotate(-6deg)translateY(0)}50%{transform:rotate(6deg)translateY(-10px)}}
@keyframes bubbleIn{0%{opacity:0;transform:scale(0.65)translateY(14px)}70%{opacity:1;transform:scale(1.04)translateY(-3px)}100%{opacity:1;transform:scale(1)translateY(0)}}
@keyframes starDrift{0%{transform:translate(0,0)scale(1);opacity:0.6}50%{opacity:1}100%{transform:translate(var(--dx),var(--dy))scale(1.3);opacity:0}}
`;

function BigTimer({resetAt,lang}){
  const[rem,setRem]=useState(Math.max(0,resetAt-Date.now()));
  useEffect(()=>{const t=setInterval(()=>setRem(Math.max(0,resetAt-Date.now())),1000);return()=>clearInterval(t);},[resetAt]);
  return(
    <div style={{textAlign:"center",padding:"10px 0"}}>
      <div style={{fontSize:11,color:"rgba(255,255,255,0.5)",marginBottom:4,letterSpacing:2}}>{lang==="en"?"🌙 LIVES RESET AT MIDNIGHT":"🌙 חיים מתאפסים בחצות"}</div>
      <div style={{fontSize:46,fontWeight:900,color:"#f59e0b",fontVariantNumeric:"tabular-nums",letterSpacing:4,textShadow:"0 0 20px rgba(245,158,11,0.5)"}}>{fmt(rem)}</div>
      <div style={{fontSize:11,color:"rgba(255,255,255,0.3)",marginTop:4,letterSpacing:4}}>{lang==="en"?"HH : MM : SS":"שע : דק : שנ"}</div>
    </div>
  );
}

function AddWordsScreen({state,setState,onBack}){
  const lang=state.lang||"he";
  const[enWord,setEnWord]=useState("");
  const[heWord,setHeWord]=useState("");
  const[category,setCategory]=useState(CATEGORIES[0]);
  const[level,setLevel]=useState("easy");
  const[loading,setLoading]=useState(false);
  const[status,setStatus]=useState("");
  const[preview,setPreview]=useState(null);

  async function handleGenerate(){
    if(!enWord.trim()&&!heWord.trim()){setStatus("⚠️ הכנס לפחות מילה אחת");return;}
    setLoading(true);setStatus("🤖 AI בונה שאלות...");setPreview(null);
    try{
      const text=await callAI(`You are a technical vocabulary expert. For the word: English="${enWord||"?"}", Hebrew="${heWord||"?"}". Category: "${category}", Level: "${level}". Generate: {"en":"correct english","he":"תרגום עברי","tip":"טיפ קצר בעברית","wrongHe":["שגוי1","שגוי2","שגוי3"],"wrongEn":["wrong1","wrong2","wrong3"]}. Return JSON only.`, state.geminiKey, state.plan, state.aiCredits);
      if(state.plan==="premium")setState(prev=>{const n={...prev,aiCredits:Math.max(0,prev.aiCredits-1)};saveS(n);return n;});
      const result=JSON.parse(text.replace(/```json|```/g,"").trim());
      setPreview(result);setStatus("✅ AI הכין שאלה! בדוק ואשר:");
    }catch(e){
      if(e.message==="NO_KEY")setStatus("⚠️ הגדר מפתח AI בפרופיל, או שדרג לפרמיום");
      else setStatus("❌ שגיאה: "+e.message);
    }
    finally{setLoading(false);}
  }

  function handleSave(){
    if(!preview)return;
    const newWord={...preview,category,level,fromCustom:true};
    setState(prev=>{const n={...prev,customWords:[...(prev.customWords||[]),newWord]};saveS(n);return n;});
    setStatus("🎉 נשמר!");setEnWord("");setHeWord("");setPreview(null);
    setTimeout(()=>setStatus(""),3000);
  }

  return(
    <div style={{padding:"16px",maxWidth:460,margin:"0 auto"}}>
      <div style={{display:"flex",gap:8,marginBottom:16,alignItems:"center"}}>
        <button onClick={onBack} className="btn" style={{background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.12)",color:"#94a3b8",borderRadius:10,padding:"7px 13px",fontSize:13,fontWeight:700}}>🏠 בית</button>
        <div style={{fontSize:18,fontWeight:900,color:"#fff"}}>➕ הוסף מילים עם AI</div>
      </div>
      <div style={{background:"rgba(255,255,255,0.05)",borderRadius:18,padding:16,border:"1px solid rgba(255,255,255,0.1)",marginBottom:14}}>
        <div style={{fontSize:13,color:"rgba(255,255,255,0.7)",marginBottom:12,fontWeight:700}}>🤖 AI יבנה שאלות ותשובות אוטומטית!</div>
        <div style={{marginBottom:10}}>
          <div style={{fontSize:11,color:"rgba(255,255,255,0.5)",marginBottom:4}}>מילה באנגלית</div>
          <input value={enWord} onChange={e=>setEnWord(e.target.value)} placeholder="לדוגמה: Spectrometer" style={{width:"100%",background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.15)",borderRadius:10,padding:"10px 12px",color:"#fff",fontSize:14,outline:"none",direction:"ltr"}}/>
        </div>
        <div style={{marginBottom:10}}>
          <div style={{fontSize:11,color:"rgba(255,255,255,0.5)",marginBottom:4}}>מילה בעברית (אופציונלי)</div>
          <input value={heWord} onChange={e=>setHeWord(e.target.value)} placeholder="לדוגמה: ספקטרומטר" style={{width:"100%",background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.15)",borderRadius:10,padding:"10px 12px",color:"#fff",fontSize:14,outline:"none",direction:"rtl"}}/>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
          <div>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.5)",marginBottom:4}}>קטגוריה</div>
            <select value={category} onChange={e=>setCategory(e.target.value)} style={{width:"100%",background:"#1e1b4b",border:"1px solid rgba(255,255,255,0.15)",borderRadius:10,padding:"8px 10px",color:"#fff",fontSize:12,outline:"none"}}>
              {CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
              <option value="➕ מותאם אישית">➕ מותאם אישית</option>
            </select>
          </div>
          <div>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.5)",marginBottom:4}}>רמה</div>
            <select value={level} onChange={e=>setLevel(e.target.value)} style={{width:"100%",background:"#1e1b4b",border:"1px solid rgba(255,255,255,0.15)",borderRadius:10,padding:"8px 10px",color:"#fff",fontSize:12,outline:"none"}}>
              <option value="easy">🟢 קל</option>
              <option value="medium">🟡 בינוני</option>
              <option value="hard">🔴 קשה</option>
            </select>
          </div>
        </div>
        <button onClick={handleGenerate} disabled={loading} className="btn" style={{width:"100%",background:"linear-gradient(135deg,#a78bfa,#22d3ee)",border:"none",borderRadius:12,padding:"13px",color:"#fff",fontSize:14,fontWeight:800}}>
          {loading?<span style={{animation:"spin 1s linear infinite",display:"inline-block"}}>⚙️</span>:"🤖 AI - בנה שאלה ותשובות"}
        </button>
        {status&&<div style={{marginTop:10,fontSize:13,color:"#a78bfa",textAlign:"center",fontWeight:600}}>{status}</div>}
      </div>
      {preview&&(
        <div style={{background:"rgba(74,222,128,0.08)",border:"1px solid rgba(74,222,128,0.3)",borderRadius:16,padding:16,marginBottom:14,animation:"fadeIn 0.3s ease"}}>
          <div style={{fontSize:12,color:"#4ade80",fontWeight:800,marginBottom:10}}>תצוגה מקדימה:</div>
          <div style={{marginBottom:6}}><span style={{fontSize:11,color:"rgba(255,255,255,0.5)"}}>אנגלית: </span><span style={{fontSize:16,fontWeight:900,color:"#fff",direction:"ltr"}}>{preview.en}</span></div>
          <div style={{marginBottom:6}}><span style={{fontSize:11,color:"rgba(255,255,255,0.5)"}}>עברית: </span><span style={{fontSize:16,fontWeight:900,color:"#fff"}}>{preview.he}</span></div>
          <div style={{marginBottom:8}}><span style={{fontSize:11,color:"rgba(255,255,255,0.5)"}}>טיפ: </span><span style={{fontSize:13,color:"#818cf8"}}>{preview.tip}</span></div>
          <button onClick={handleSave} className="btn" style={{width:"100%",background:"linear-gradient(135deg,#4ade80,#22d3ee)",border:"none",borderRadius:12,padding:"12px",color:"#1a1a2e",fontSize:14,fontWeight:900}}>✅ שמור מילה זו</button>
        </div>
      )}
      {(state.customWords||[]).length>0&&(
        <div>
          <div style={{fontSize:12,color:"rgba(255,255,255,0.5)",fontWeight:800,marginBottom:8}}>📋 המילים שהוספת ({(state.customWords||[]).length})</div>
          {(state.customWords||[]).slice(-5).reverse().map((w,i)=>(
            <div key={i} style={{background:"rgba(255,255,255,0.04)",borderRadius:12,padding:"10px 14px",border:"1px solid rgba(255,255,255,0.08)",display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
              <div><span style={{fontSize:14,fontWeight:700,color:"#fff",direction:"ltr"}}>{w.en}</span><span style={{fontSize:12,color:"rgba(255,255,255,0.5)",marginRight:8}}> = {w.he}</span></div>
              <button onClick={()=>{setState(prev=>{const cw=[...(prev.customWords||[])];cw.splice(prev.customWords.length-1-i,1);const n={...prev,customWords:cw};saveS(n);return n;});}} className="btn" style={{background:"rgba(239,68,68,0.15)",border:"none",borderRadius:8,padding:"4px 8px",color:"#f87171",fontSize:12}}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NotepadScreen({state,setState,onBack}){
  const[enWord,setEnWord]=useState("");
  const[heWord,setHeWord]=useState("");
  const[note,setNote]=useState("");
  const noteWords=state.noteWords||[];

  function addWord(){
    if(!enWord.trim()&&!heWord.trim())return;
    const w={en:enWord.trim(),he:heWord.trim(),note:note.trim(),date:new Date().toLocaleDateString("he-IL")};
    setState(prev=>{const n={...prev,noteWords:[...(prev.noteWords||[]),w]};saveS(n);return n;});
    setEnWord("");setHeWord("");setNote("");
  }

  function removeWord(idx){
    setState(prev=>{const nw=[...(prev.noteWords||[])];nw.splice(idx,1);const n={...prev,noteWords:nw};saveS(n);return n;});
  }

  function markLearned(idx){
    setState(prev=>{
      const nw=[...(prev.noteWords||[])];
      const w=nw.splice(idx,1)[0];
      const kw=prev.knownWords||[];
      const already=kw.find(x=>x.en===w.en);
      const n={...prev,noteWords:nw,knownWords:already?kw:[...kw,{en:w.en,he:w.he,category:"📒 פינקס",level:"custom"}]};
      saveS(n);return n;
    });
  }

  return(
    <div style={{padding:"16px",maxWidth:460,margin:"0 auto"}}>
      <div style={{display:"flex",gap:8,marginBottom:16,alignItems:"center"}}>
        <button onClick={onBack} className="btn" style={{background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.12)",color:"#94a3b8",borderRadius:10,padding:"7px 13px",fontSize:13,fontWeight:700}}>🏠 בית</button>
        <div style={{fontSize:18,fontWeight:900,color:"#fff"}}>📒 הפינקס שלי</div>
        {noteWords.length>0&&<span style={{background:"rgba(245,158,11,0.2)",color:"#f59e0b",borderRadius:20,padding:"2px 10px",fontSize:12,fontWeight:700}}>{noteWords.length}</span>}
      </div>
      <div style={{background:"rgba(255,255,255,0.05)",borderRadius:18,padding:16,border:"1px solid rgba(245,158,11,0.2)",marginBottom:14}}>
        <div style={{fontSize:12,color:"rgba(255,255,255,0.6)",marginBottom:10,fontWeight:700}}>➕ הוסף מילה לזכור</div>
        <input value={enWord} onChange={e=>setEnWord(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addWord()} placeholder="מילה באנגלית" style={{width:"100%",background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.15)",borderRadius:10,padding:"9px 12px",color:"#fff",fontSize:14,outline:"none",direction:"ltr",marginBottom:8}}/>
        <input value={heWord} onChange={e=>setHeWord(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addWord()} placeholder="תרגום בעברית (אופציונלי)" style={{width:"100%",background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.15)",borderRadius:10,padding:"9px 12px",color:"#fff",fontSize:14,outline:"none",marginBottom:8}}/>
        <input value={note} onChange={e=>setNote(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addWord()} placeholder="הערה (אופציונלי)" style={{width:"100%",background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.15)",borderRadius:10,padding:"9px 12px",color:"#fff",fontSize:13,outline:"none",marginBottom:10}}/>
        <button onClick={addWord} className="btn" style={{width:"100%",background:"linear-gradient(135deg,#f59e0b,#f472b6)",border:"none",borderRadius:12,padding:"12px",color:"#fff",fontSize:14,fontWeight:800}}>📌 הוסף לפינקס</button>
      </div>
      {noteWords.length===0?(
        <div style={{textAlign:"center",padding:40,color:"rgba(255,255,255,0.3)",fontSize:14}}>
          <div style={{fontSize:40,marginBottom:12}}>📒</div>
          הפינקס ריק – הוסף מילים שאתה רוצה ללמוד!
        </div>
      ):(
        <div>
          <div style={{fontSize:12,color:"rgba(255,255,255,0.5)",fontWeight:800,marginBottom:8}}>📋 מילים לזכור ({noteWords.length})</div>
          {[...noteWords].reverse().map((w,ri)=>{
            const idx=noteWords.length-1-ri;
            return(
              <div key={idx} style={{background:"rgba(255,255,255,0.04)",borderRadius:14,padding:"12px 14px",border:"1px solid rgba(245,158,11,0.15)",marginBottom:8,animation:"fadeIn 0.3s ease"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3,flexWrap:"wrap"}}>
                      <span style={{fontSize:15,fontWeight:900,color:"#fff",direction:"ltr"}}>{w.en||"—"}</span>
                      {w.he&&<span style={{fontSize:13,color:"rgba(255,255,255,0.5)"}}>= {w.he}</span>}
                    </div>
                    {w.note&&<div style={{fontSize:12,color:"#f59e0b",marginBottom:3}}>📝 {w.note}</div>}
                    <div style={{fontSize:10,color:"rgba(255,255,255,0.25)"}}>{w.date}</div>
                  </div>
                  <div style={{display:"flex",gap:5,marginRight:8,flexShrink:0}}>
                    <button onClick={()=>markLearned(idx)} className="btn" style={{background:"rgba(74,222,128,0.15)",border:"none",borderRadius:8,padding:"5px 9px",color:"#4ade80",fontSize:11,fontWeight:700}}>✅</button>
                    <button onClick={()=>removeWord(idx)} className="btn" style={{background:"rgba(239,68,68,0.15)",border:"none",borderRadius:8,padding:"5px 9px",color:"#f87171",fontSize:12}}>✕</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SentenceScreen({state,setState,onHome,onBack}){
  const lang=state.lang||"he";
  const selectedLevel=state.selectedLevel||"easy";
  const customSentences=(state.customSentences||[]).filter(s=>s.level===selectedLevel);
  const basePool=SENTENCE_DATA.filter(s=>s.level===selectedLevel);
  const pool=[...basePool,...customSentences];
  const src=pool.length?pool:[...SENTENCE_DATA,...(state.customSentences||[])];
  const[word,setWord]=useState(()=>rnd(src));
  const[selected,setSelected]=useState([]);
  const[available,setAvailable]=useState([]);
  const[result,setResult]=useState(null);
  const[qNum,setQNum]=useState(1);
  const[xpPop,setXpPop]=useState(null);
  const[msg,setMsg]=useState("");
  const[cardKey,setCardKey]=useState(0);
  const[showAddForm,setShowAddForm]=useState(false);
  const[newEn,setNewEn]=useState("");
  const[newHe,setNewHe]=useState("");
  const duck=getDuck(state.correct);
  const level=getLevel(state.xp);
  const acc=state.total>0?Math.round((state.correct/state.total)*100):0;

  useEffect(()=>{
    const correctWords=word.he.split(' ').map((w,i)=>({w,id:`c${i}`}));
    const allOtherWords=SENTENCE_DATA.filter(s=>s.en!==word.en).flatMap(s=>s.he.split(' '));
    const unique=[...new Set(allOtherWords)].filter(w=>!word.he.split(' ').includes(w));
    const distractors=shuffle(unique).slice(0,4).map((w,i)=>({w,id:`d${i}`}));
    setAvailable(shuffle([...correctWords,...distractors]));
    setSelected([]);setResult(null);setMsg("");setXpPop(null);
  },[cardKey]);

  function selectWord(item){if(result!==null)return;setAvailable(p=>p.filter(x=>x.id!==item.id));setSelected(p=>[...p,item]);}
  function unselectWord(item){if(result!==null)return;setSelected(p=>p.filter(x=>x.id!==item.id));setAvailable(p=>[...p,item]);}

  function checkAnswer(){
    const built=selected.map(x=>x.w).join(' ');
    const ok=built===word.he;
    const base=selectedLevel==="hard"?25:selectedLevel==="medium"?15:10;
    const xpGain=ok?base:0;
    playSound(ok?"correct":"wrong");
    setResult(ok?"correct":"wrong");
    setMsg(ok?rnd(RIGHT_MSGS):rnd(WRONG_MSGS));
    if(ok&&xpGain>0){setXpPop(`+${xpGain} XP`);setTimeout(()=>setXpPop(null),1600);}
    setState(prev=>{
      const newLives=ok?prev.lives:Math.max(0,prev.lives-1);
      const streakUpdate=calcStreaks(prev);
      const n={...prev,total:prev.total+1,correct:prev.correct+(ok?1:0),streak:ok?prev.streak+1:0,bestStreak:ok?Math.max(prev.bestStreak,prev.streak+1):prev.bestStreak,xp:prev.xp+xpGain,lives:newLives,resetAt:newLives===0&&!prev.resetAt?nextMidnight():prev.resetAt,seen:ok?{...prev.seen,[word.en]:true}:prev.seen,...streakUpdate};
      saveS(n);return n;
    });
  }

  function next(){
    const freshSrc=[...SENTENCE_DATA,...(state.customSentences||[])].filter(s=>s.level===selectedLevel);
    const s2=freshSrc.length?freshSrc:SENTENCE_DATA;
    let w;do{w=rnd(s2);}while(w.en===word.en&&s2.length>1);
    setWord(w);setQNum(q=>q+1);setCardKey(k=>k+1);
  }

  function saveCustomSentence(){
    if(!newEn.trim()||!newHe.trim())return;
    const s={en:newEn.trim(),he:newHe.trim(),level:selectedLevel,custom:true};
    setState(prev=>{const n={...prev,customSentences:[...(prev.customSentences||[]),s]};saveS(n);return n;});
    setNewEn("");setNewHe("");setShowAddForm(false);
  }

  if(state.lives<=0&&state.resetAt&&Date.now()<state.resetAt)return<NoLivesScreen state={state} onHome={onHome} lang={lang}/>;

  return(
    <div style={{padding:"12px",maxWidth:460,margin:"0 auto"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
        <div style={{display:"flex",gap:6}}>
          <button onClick={onHome} className="btn" style={{background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.12)",color:"#94a3b8",borderRadius:9,padding:"6px 11px",fontSize:16}}>🏠</button>
          <button onClick={onBack} className="btn" style={{background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.12)",color:"#94a3b8",borderRadius:9,padding:"6px 11px",fontSize:13,fontWeight:700}}>←</button>
        </div>
        <div style={{textAlign:"center"}}>
          <div style={{fontSize:11,color:level.color,fontWeight:900}}>{level.emoji} 📝 בניית משפטים</div>
          <div style={{fontSize:10,color:"rgba(255,255,255,0.35)"}}>שאלה #{qNum} • {lvlLabel(selectedLevel,lang)}</div>
        </div>
        <div style={{textAlign:"left"}}>
          <div style={{fontSize:13,color:"#f59e0b",fontWeight:900}}>🔥 {state.streak}</div>
          <div style={{fontSize:10,color:"rgba(255,255,255,0.35)"}}>{acc}%</div>
        </div>
      </div>
      <div style={{display:"flex",gap:3,justifyContent:"center",marginBottom:10,background:"rgba(0,0,0,0.22)",borderRadius:12,padding:"7px 12px",border:"1px solid rgba(255,255,255,0.08)"}}>
        {Array.from({length:MAX_LIVES}).map((_,i)=>(
          <div key={i} style={{width:20,height:20,opacity:i<state.lives?1:0.12,filter:i<state.lives?"none":"grayscale(1)",transition:"all 0.5s"}}>
            <DuckSVG stage={DUCK_STAGES[0]} mood="idle" size={20}/>
          </div>
        ))}
      </div>
      <div style={{textAlign:"center",marginBottom:8,position:"relative",minHeight:duck.size+30}}>
        <div style={{display:"inline-block",animation:result==="correct"?"duckHappy 0.5s ease 3":result==="wrong"?"duckAngry 0.3s ease 4":"duckIdle 3s ease infinite"}}>
          <DuckSVG stage={duck} mood={result==="correct"?"happy":result==="wrong"?"angry":"idle"} size={duck.size}/>
        </div>
        {xpPop&&<div style={{position:"absolute",top:0,left:"50%",transform:"translateX(-50%)",fontSize:20,fontWeight:900,color:"#4ade80",animation:"xpFloat 1.6s ease forwards",pointerEvents:"none"}}>{xpPop}</div>}
        {msg&&<div style={{fontSize:13,fontWeight:700,color:result==="correct"?"#4ade80":"#f87171",marginTop:2,animation:"fadeIn 0.3s ease"}}>{msg}</div>}
      </div>
      <div style={{background:"rgba(255,255,255,0.05)",borderRadius:18,padding:"14px 16px",marginBottom:12,textAlign:"center",border:"1px solid rgba(255,255,255,0.1)",animation:"slideUp 0.35s ease"}}>
        <div style={{fontSize:10,color:"rgba(255,255,255,0.4)",letterSpacing:2,marginBottom:8,fontWeight:700}}>📝 בנה את התרגום העברי</div>
        <div style={{fontSize:17,fontWeight:800,color:"#fff",direction:"ltr",lineHeight:1.5}}>"{word.en}"</div>
      </div>
      <div style={{background:result==="correct"?"rgba(74,222,128,0.08)":result==="wrong"?"rgba(248,113,113,0.08)":"rgba(255,255,255,0.04)",border:`2px dashed ${result==="correct"?"#4ade80":result==="wrong"?"#f87171":"rgba(255,255,255,0.2)"}`,borderRadius:14,padding:"12px",minHeight:56,marginBottom:12,display:"flex",flexWrap:"wrap",gap:6,alignItems:"center",justifyContent:selected.length?"flex-end":"center",direction:"rtl",transition:"all 0.3s"}}>
        {selected.length===0&&<div style={{color:"rgba(255,255,255,0.2)",fontSize:12}}>← לחץ מילים למטה לבנות את המשפט</div>}
        {selected.map(item=>(
          <button key={item.id} onClick={()=>unselectWord(item)} disabled={result!==null} className="btn" style={{background:result==="correct"?"rgba(74,222,128,0.2)":result==="wrong"?"rgba(248,113,113,0.15)":"rgba(34,211,238,0.15)",border:`1px solid ${result==="correct"?"#4ade80":result==="wrong"?"#f87171":"#22d3ee"}`,borderRadius:20,padding:"5px 12px",color:result==="correct"?"#4ade80":result==="wrong"?"#f87171":"#22d3ee",fontSize:14,fontWeight:700}}>
            {item.w}
          </button>
        ))}
      </div>
      {result==="wrong"&&(
        <div style={{background:"rgba(74,222,128,0.06)",border:"1px solid rgba(74,222,128,0.25)",borderRadius:12,padding:"10px 14px",marginBottom:10,animation:"fadeIn 0.3s ease"}}>
          <div style={{fontSize:11,color:"#4ade80",fontWeight:800,marginBottom:6}}>✅ המשפט הנכון:</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:4,direction:"rtl"}}>
            {word.he.split(' ').map((w,i)=>(
              <span key={i} style={{background:"rgba(74,222,128,0.15)",borderRadius:20,padding:"4px 12px",color:"#4ade80",fontSize:14,fontWeight:700}}>{w}</span>
            ))}
          </div>
        </div>
      )}
      {result===null&&(
        <div style={{background:"rgba(0,0,0,0.2)",borderRadius:14,padding:"12px",marginBottom:12,border:"1px solid rgba(255,255,255,0.08)"}}>
          <div style={{fontSize:10,color:"rgba(255,255,255,0.3)",marginBottom:8,textAlign:"center"}}>בחר מילים לבניית המשפט</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6,justifyContent:"center",direction:"rtl"}}>
            {available.map(item=>(
              <button key={item.id} onClick={()=>selectWord(item)} className="btn" style={{background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.14)",borderRadius:20,padding:"7px 14px",color:"#e2e8f0",fontSize:14,fontWeight:700}}>
                {item.w}
              </button>
            ))}
          </div>
        </div>
      )}
      <div style={{display:"flex",gap:8,marginBottom:10}}>
        {result===null?(
          <button onClick={checkAnswer} disabled={selected.length===0} className="btn" style={{flex:1,background:selected.length>0?"linear-gradient(135deg,#4ade80,#22d3ee)":"rgba(255,255,255,0.04)",border:selected.length>0?"none":"1px solid rgba(255,255,255,0.1)",borderRadius:12,padding:"13px",color:selected.length>0?"#1a1a2e":"rgba(255,255,255,0.25)",fontSize:15,fontWeight:900}}>
            ✓ בדוק תשובה
          </button>
        ):(
          <button onClick={next} className="btn" style={{flex:1,background:"linear-gradient(135deg,#f472b6,#a78bfa,#22d3ee)",backgroundSize:"200%",animation:"rainbow 3s ease infinite",border:"none",borderRadius:12,padding:"13px",color:"#fff",fontSize:15,fontWeight:900,boxShadow:"0 4px 20px rgba(244,114,182,0.4)"}}>
            {lang==="en"?"Next →":"המשך ←"}
          </button>
        )}
        <button onClick={()=>setShowAddForm(p=>!p)} className="btn" style={{background:"rgba(245,158,11,0.1)",border:"1px solid rgba(245,158,11,0.3)",borderRadius:12,padding:"13px",color:"#f59e0b",fontSize:18,fontWeight:900,minWidth:48}}>➕</button>
      </div>
      {showAddForm&&(
        <div style={{background:"rgba(245,158,11,0.07)",border:"1px solid rgba(245,158,11,0.25)",borderRadius:14,padding:14,animation:"fadeIn 0.2s ease"}}>
          <div style={{fontSize:12,color:"#f59e0b",fontWeight:800,marginBottom:8}}>➕ הוסף משפט חדש ({lvlLabel(selectedLevel,lang)})</div>
          <input value={newEn} onChange={e=>setNewEn(e.target.value)} placeholder="המשפט באנגלית..." style={{width:"100%",background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:8,padding:"8px 10px",color:"#fff",fontSize:13,outline:"none",direction:"ltr",marginBottom:6}}/>
          <input value={newHe} onChange={e=>setNewHe(e.target.value)} placeholder="התרגום העברי..." style={{width:"100%",background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:8,padding:"8px 10px",color:"#fff",fontSize:13,outline:"none",marginBottom:8}}/>
          <div style={{display:"flex",gap:6}}>
            <button onClick={saveCustomSentence} disabled={!newEn.trim()||!newHe.trim()} className="btn" style={{flex:1,background:"rgba(74,222,128,0.2)",border:"1px solid rgba(74,222,128,0.4)",borderRadius:8,padding:"8px",color:"#4ade80",fontSize:13,fontWeight:700}}>✅ שמור</button>
            <button onClick={()=>setShowAddForm(false)} className="btn" style={{background:"rgba(255,255,255,0.07)",border:"none",borderRadius:8,padding:"8px 14px",color:"rgba(255,255,255,0.4)",fontSize:13}}>ביטול</button>
          </div>
          {(state.customSentences||[]).length>0&&<div style={{fontSize:11,color:"rgba(255,255,255,0.3)",marginTop:6}}>{(state.customSentences||[]).length} משפטים אישיים שמורים</div>}
        </div>
      )}
    </div>
  );
}

function SplashScreen({onDone}){
  const[phase,setPhase]=useState(0);
  const[out,setOut]=useState(false);
  const doneCb=useRef(onDone);
  doneCb.current=onDone;
  useEffect(()=>{
    playIntroSound();
    const t1=setTimeout(()=>setPhase(1),920);
    const t2=setTimeout(()=>setOut(true),2750);
    const t3=setTimeout(()=>doneCb.current(),3100);
    return()=>[t1,t2,t3].forEach(clearTimeout);
  },[]);
  const w1="WordMaster",w2=" Pro";
  const chars=[...w1.split(""),...w2.split("")];
  const sparkles=[
    {x:"12%",y:"18%",dx:"20px",dy:"-30px",c:"#22d3ee",d:"0s"},
    {x:"82%",y:"22%",dx:"-25px",dy:"-20px",c:"#a78bfa",d:"0.4s"},
    {x:"20%",y:"78%",dx:"15px",dy:"25px",c:"#f472b6",d:"0.8s"},
    {x:"75%",y:"70%",dx:"-18px",dy:"20px",c:"#fbbf24",d:"0.2s"},
    {x:"50%",y:"10%",dx:"5px",dy:"-28px",c:"#34d399",d:"0.6s"},
    {x:"90%",y:"50%",dx:"20px",dy:"10px",c:"#f472b6",d:"1s"},
    {x:"8%",y:"50%",dx:"-20px",dy:"-10px",c:"#a78bfa",d:"1.2s"},
    {x:"60%",y:"88%",dx:"10px",dy:"22px",c:"#22d3ee",d:"0.9s"},
  ];
  return(
    <div style={{position:"fixed",inset:0,background:"linear-gradient(160deg,#08031a,#130830,#0a1535)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",zIndex:9999,animation:out?"splashFadeOut 0.45s ease forwards":"none",overflow:"hidden"}}>
      <style>{CSS}</style>
      {sparkles.map((s,i)=>(
        <div key={i} style={{position:"absolute",left:s.x,top:s.y,width:6,height:6,borderRadius:"50%",background:s.c,animation:`starDrift 2.2s ${s.d} ease-out infinite`,opacity:0.7,"--dx":s.dx,"--dy":s.dy}}/>
      ))}
      <div style={{animation:phase===0?"duckSomersault 0.92s cubic-bezier(0.4,0,0.2,1)":"duckIdle 2.2s ease infinite",marginBottom:32,filter:"drop-shadow(0 0 24px rgba(167,139,250,0.7))"}}>
        <DuckSVG stage={DUCK_STAGES[4]} mood="happy" size={112}/>
      </div>
      {phase>=1&&(
        <div style={{textAlign:"center"}}>
          <div style={{display:"flex",alignItems:"baseline",justifyContent:"center",gap:0,marginBottom:10}}>
            {chars.map((ch,i)=>(
              <span key={i} style={{
                display:"inline-block",
                fontSize:i>=w1.length?38:30,
                fontWeight:900,
                fontFamily:"'Heebo',sans-serif",
                animation:`letterPop 0.42s ${i*0.065}s cubic-bezier(0.34,1.56,0.64,1) both`,
                color:i<4?"#22d3ee":i<10?"#c4b5fd":"#fbbf24",
                textShadow:i<4?"0 0 18px #22d3ee,0 0 38px rgba(34,211,238,0.35)":i<10?"0 0 18px #a78bfa,0 0 38px rgba(167,139,250,0.35)":"0 0 18px #fbbf24,0 0 38px rgba(251,191,36,0.35)",
              }}>{ch===" "?" ":ch}</span>
            ))}
          </div>
          <div style={{fontSize:12,color:"rgba(255,255,255,0.38)",letterSpacing:3,textTransform:"uppercase",animation:"fadeIn 0.7s 1s both"}}>
            📚 מילים טכניות &nbsp;•&nbsp; אנגלית ועברית
          </div>
        </div>
      )}
    </div>
  );
}

function AvatarSelectModal({state,setState,onClose}){
  const unlocked=state.unlockedAvatars||["duck"];
  const completedCount=Object.values(state.catProgress||{}).filter(v=>v>=10).length;
  const advancedDone=(state.catProgress?.["💬 תכנות באנגלית"]||0)>=10&&(state.catProgress?.["🔭 מערכות EO/IR/RF"]||0)>=10;
  function isUnlocked(av){
    if(av.id==="duck")return true;
    if(av.advancedRequired)return advancedDone;
    return completedCount>=av.unlockCats;
  }
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(14px)"}} onClick={onClose}>
      <div style={{background:"linear-gradient(135deg,#1e1b4b,#0f172a)",border:"1px solid rgba(167,139,250,0.35)",borderRadius:24,padding:22,maxWidth:400,width:"100%",maxHeight:"88vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div style={{fontSize:18,fontWeight:900,color:"#fff"}}>🎭 בחר בובה</div>
          <button onClick={onClose} className="btn" style={{background:"rgba(255,255,255,0.08)",border:"none",color:"#fff",borderRadius:"50%",width:32,height:32,fontSize:16}}>✕</button>
        </div>
        <div style={{fontSize:11,color:"rgba(255,255,255,0.4)",marginBottom:14,lineHeight:1.6}}>
          קטגוריות שהשלמת: <span style={{color:"#4ade80",fontWeight:800}}>{completedCount}</span> | לכל 10 תשובות נכונות בקטגוריה = קטגוריה הושלמה
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          {AVATARS.map(av=>{
            const unlk=isUnlocked(av);
            const sel=state.selectedAvatar===av.id;
            return(
              <button key={av.id} onClick={()=>{
                if(!unlk)return;
                setState(p=>{const n={...p,selectedAvatar:av.id};saveS(n);return n;});
                onClose();
              }} className="btn" style={{background:sel?"rgba(167,139,250,0.22)":unlk?"rgba(255,255,255,0.05)":"rgba(0,0,0,0.3)",border:`2px solid ${sel?"#a78bfa":unlk?"rgba(255,255,255,0.12)":"rgba(255,255,255,0.05)"}`,borderRadius:16,padding:"14px 10px",display:"flex",flexDirection:"column",alignItems:"center",gap:6,opacity:unlk?1:0.45,cursor:unlk?"pointer":"default",position:"relative"}}>
                {av.rare&&<div style={{position:"absolute",top:-6,right:-6,background:"linear-gradient(135deg,#f59e0b,#ef4444)",borderRadius:10,padding:"1px 7px",fontSize:9,color:"white",fontWeight:900}}>נדיר ✨</div>}
                {sel&&<div style={{position:"absolute",top:-6,left:-6,background:"#a78bfa",borderRadius:10,padding:"1px 7px",fontSize:9,color:"white",fontWeight:900}}>✓ נבחר</div>}
                <div style={{width:64,height:64,display:"flex",alignItems:"center",justifyContent:"center",position:"relative"}}>
                  <AvatarSVG id={av.id} size={64} duck={getDuck(state.correct)}/>
                  {!unlk&&<div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>🔒</div>}
                </div>
                <div style={{fontSize:12,fontWeight:800,color:unlk?"#fff":"rgba(255,255,255,0.4)"}}>{av.name}</div>
                {!unlk&&<div style={{fontSize:9,color:"rgba(255,255,255,0.3)",textAlign:"center"}}>
                  {av.advancedRequired?"השלם תכנות + EO/IR/RF":`עוד ${av.unlockCats-completedCount} קטגוריות`}
                </div>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function LeaderboardScreen({user,state,onBack}){
  const[leaders,setLeaders]=useState([]);
  const[loading,setLoading]=useState(true);
  useEffect(()=>{
    const q=query(collection(db,"leaderboard"),orderBy("xp","desc"),limit(20));
    const unsub=onSnapshot(q,snap=>{
      setLeaders(snap.docs.map(d=>({id:d.id,...d.data()})));
      setLoading(false);
    },()=>setLoading(false));
    return unsub;
  },[]);
  const myRank=leaders.findIndex(l=>l.id===user?.uid)+1;
  return(
    <div style={{padding:"16px",maxWidth:460,margin:"0 auto"}}>
      <div style={{display:"flex",gap:8,marginBottom:16,alignItems:"center"}}>
        <button onClick={onBack} className="btn" style={{background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.12)",color:"#94a3b8",borderRadius:10,padding:"7px 13px",fontSize:13,fontWeight:700}}>🏠 בית</button>
        <div style={{fontSize:18,fontWeight:900,color:"#fff"}}>🏆 לוח תוצאות</div>
      </div>
      {myRank>0&&(
        <div style={{background:"linear-gradient(135deg,rgba(245,158,11,0.18),rgba(167,139,250,0.12))",border:"1px solid rgba(245,158,11,0.4)",borderRadius:14,padding:"12px 16px",marginBottom:14,display:"flex",alignItems:"center",gap:12}}>
          <div style={{fontSize:28,fontWeight:900,color:"#f59e0b",width:40,textAlign:"center"}}>#{myRank}</div>
          <div>
            <div style={{fontSize:13,fontWeight:800,color:"#fff"}}>הדירוג שלך</div>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.5)"}}>מתוך {leaders.length} שחקנים</div>
          </div>
        </div>
      )}
      {loading?(
        <div style={{textAlign:"center",padding:40}}>
          <div style={{animation:"duckIdle 2s ease infinite",display:"inline-block"}}><DuckSVG stage={DUCK_STAGES[2]} mood="idle" size={60}/></div>
          <div style={{color:"rgba(255,255,255,0.4)",marginTop:12,fontSize:13}}>טוען...</div>
        </div>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {leaders.map((l,i)=>{
            const isMe=l.id===user?.uid;
            const medal=i===0?"🥇":i===1?"🥈":i===2?"🥉":null;
            return(
              <div key={l.id} style={{background:isMe?"rgba(167,139,250,0.16)":"rgba(255,255,255,0.04)",border:`1.5px solid ${isMe?"rgba(167,139,250,0.5)":i<3?"rgba(245,158,11,0.3)":"rgba(255,255,255,0.08)"}`,borderRadius:14,padding:"12px 14px",display:"flex",alignItems:"center",gap:12,animation:"slideUp 0.3s ease both",animationDelay:`${i*0.04}s`}}>
                <div style={{fontSize:i<3?22:16,fontWeight:900,color:i===0?"#f59e0b":i===1?"#94a3b8":i===2?"#b45309":"rgba(255,255,255,0.4)",width:36,textAlign:"center",flexShrink:0}}>
                  {medal||`#${i+1}`}
                </div>
                <div style={{width:42,height:42,borderRadius:"50%",overflow:"hidden",background:"rgba(255,255,255,0.08)",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",border:`2px solid ${isMe?"#a78bfa":"rgba(255,255,255,0.1)"}`}}>
                  <AvatarSVG id={l.avatar||"duck"} size={42}/>
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:800,color:isMe?"#c4b5fd":"#fff",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{l.name}{isMe&&" (אני)"}</div>
                  <div style={{fontSize:11,color:"rgba(255,255,255,0.4)"}}>{l.level||"מתחיל"} • {l.completedCats||0} קטגוריות</div>
                </div>
                <div style={{textAlign:"left",flexShrink:0}}>
                  <div style={{fontSize:16,fontWeight:900,color:"#f59e0b"}}>{(l.xp||0).toLocaleString()}</div>
                  <div style={{fontSize:10,color:"rgba(255,255,255,0.35)"}}>XP</div>
                </div>
              </div>
            );
          })}
          {leaders.length===0&&<div style={{textAlign:"center",padding:32,color:"rgba(255,255,255,0.3)",fontSize:14}}>אין שחקנים עדיין 🦆</div>}
        </div>
      )}
    </div>
  );
}

class ErrorBoundary extends React.Component{
  constructor(p){super(p);this.state={err:false};}
  static getDerivedStateFromError(){return{err:true};}
  componentDidCatch(e,i){console.error("WordMaster crash:",e,i);}
  render(){
    if(!this.state.err)return this.props.children;
    return(
      <div style={{minHeight:"100vh",background:"linear-gradient(160deg,#08031a,#130830,#0a1535)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:"'Heebo',sans-serif",color:"#fff",textAlign:"center",padding:24,direction:"rtl"}}>
        <style>{CSS}</style>
        <div style={{animation:"duckThink 2.8s ease infinite",marginBottom:20,filter:"drop-shadow(0 0 22px rgba(167,139,250,0.55))"}}>
          <DuckSVG stage={DUCK_STAGES[4]} mood="idle" size={148}/>
        </div>
        <div style={{background:"rgba(255,255,255,0.05)",border:"1.5px solid rgba(167,139,250,0.28)",borderRadius:22,padding:"20px 32px",marginBottom:20,animation:"bubbleIn 0.55s 0.15s cubic-bezier(0.34,1.56,0.64,1) both",maxWidth:340,position:"relative"}}>
          <div style={{position:"absolute",top:-12,right:24,background:"rgba(167,139,250,0.15)",border:"1px solid rgba(167,139,250,0.3)",borderRadius:8,padding:"2px 10px",fontSize:11,color:"#a78bfa",fontWeight:800}}>הברווז מדבר</div>
          <div style={{fontSize:30,fontWeight:900,marginBottom:6}}>אופס... 🤔</div>
          <div style={{fontSize:16,color:"rgba(255,255,255,0.6)",lineHeight:1.65}}>נראה שאיבדנו את זה</div>
          <div style={{fontSize:13,color:"rgba(255,255,255,0.3)",marginTop:8}}>הברווז בטוח ימצא אותה בקרוב</div>
        </div>
        <button onClick={()=>window.location.reload()} style={{background:"linear-gradient(135deg,#a78bfa,#22d3ee)",border:"none",borderRadius:16,padding:"14px 40px",color:"#fff",fontSize:16,fontWeight:800,cursor:"pointer",boxShadow:"0 4px 22px rgba(167,139,250,0.45)",animation:"fadeIn 0.5s 0.5s both"}}>
          🔄 טען מחדש
        </button>
      </div>
    );
  }
}

function LoginScreen({onLogin}){
  const[loading,setLoading]=useState(false);
  const[error,setError]=useState("");
  async function handleGoogle(){
    setLoading(true);setError("");
    try{const r=await signInWithPopup(auth,provider);onLogin(r.user);}
    catch(e){setError(e.message);}
    finally{setLoading(false);}
  }
  return(
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:28,background:"linear-gradient(135deg,#0f0c29,#302b63,#24243e)"}}>
      <style>{CSS}</style>
      <div style={{textAlign:"center",marginBottom:32}}>
        <div style={{display:"inline-block",animation:"duckIdle 3s ease infinite"}}>
          <DuckSVG stage={DUCK_STAGES[0]} mood="idle" size={100}/>
        </div>
        <div style={{fontSize:32,fontWeight:900,marginTop:12,background:"linear-gradient(135deg,#f472b6,#a78bfa,#22d3ee)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>WordMaster Pro</div>
        <div style={{color:"rgba(255,255,255,0.5)",fontSize:13,marginTop:4}}>🔬 כיול • אופטיקה • אלקטרוניקה • פיזיקה</div>
      </div>
      <div style={{background:"rgba(255,255,255,0.06)",borderRadius:24,padding:28,maxWidth:320,width:"100%",border:"1px solid rgba(255,255,255,0.1)"}}>
        <div style={{fontSize:18,fontWeight:800,color:"#fff",textAlign:"center",marginBottom:20}}>התחבר לחשבונך</div>
        <button onClick={handleGoogle} disabled={loading} className="btn" style={{width:"100%",background:"white",borderRadius:14,padding:"14px",fontSize:15,fontWeight:700,color:"#1a1a2e",display:"flex",alignItems:"center",justifyContent:"center",gap:10,boxShadow:"0 4px 20px rgba(0,0,0,0.3)"}}>
          {loading?<span style={{animation:"spin 1s linear infinite",display:"inline-block"}}>⚙️</span>:<><svg width="20" height="20" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>התחבר עם Google</>}
        </button>
        {error&&<div style={{color:"#f87171",fontSize:12,textAlign:"center",marginTop:12,direction:"rtl"}}>{error}</div>}
        <div style={{fontSize:11,color:"rgba(255,255,255,0.3)",textAlign:"center",marginTop:16}}>ההתקדמות שלך תישמר בענן ☁️</div>
      </div>
    </div>
  );
}

function ProfileScreen({user,state,setState,onBack,onLogout}){
  const lang=state.lang||"he";
  const duck=getDuck(state.correct);
  const knownWords=state.knownWords||[];
  const[wordSearch,setWordSearch]=useState("");
  const[showGuide,setShowGuide]=useState(false);
  const[showPremium,setShowPremium]=useState(false);
  const[testStatus,setTestStatus]=useState("");
  const[showAvatarSelect,setShowAvatarSelect]=useState(false);
  const filtered=knownWords.filter(w=>w.en.toLowerCase().includes(wordSearch.toLowerCase())||w.he.includes(wordSearch));
  const selAvatar=state.selectedAvatar||"duck";
  const completedCount=Object.values(state.catProgress||{}).filter(v=>v>=10).length;
  return(
    <div style={{padding:"16px",maxWidth:460,margin:"0 auto"}}>
      <div style={{display:"flex",gap:8,marginBottom:16}}>
        <button onClick={onBack} className="btn" style={{background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.12)",color:"#94a3b8",borderRadius:10,padding:"7px 13px",fontSize:13,fontWeight:700}}>🏠 בית</button>
      </div>
      <div style={{textAlign:"center",marginBottom:20}}>
        <button onClick={()=>setShowAvatarSelect(true)} className="btn" style={{background:"none",border:"none",padding:0,display:"inline-block",position:"relative",marginBottom:8}}>
          <div style={{width:100,height:100,borderRadius:"50%",background:"linear-gradient(135deg,#a78bfa33,#22d3ee33)",border:"3px solid rgba(167,139,250,0.55)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto",boxShadow:"0 0 28px rgba(167,139,250,0.3)",overflow:"hidden"}}>
            <AvatarSVG id={selAvatar} size={88} duck={duck}/>
          </div>
          <div style={{position:"absolute",bottom:4,right:4,background:"rgba(167,139,250,0.85)",borderRadius:"50%",width:24,height:24,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12}}>✏️</div>
        </button>
        <div style={{fontSize:22,fontWeight:900,color:"#fff"}}>{user?.displayName||"משתמש"}</div>
        <div style={{fontSize:14,color:"rgba(255,255,255,0.5)"}}>{user?.email}</div>
        <div style={{fontSize:11,color:duck.color,marginTop:4}}>{duck.name} • {completedCount} קטגוריות הושלמו</div>
      </div>
      {showAvatarSelect&&<AvatarSelectModal state={state} setState={setState} onClose={()=>setShowAvatarSelect(false)}/>}
      <div style={{background:"rgba(255,255,255,0.04)",borderRadius:16,padding:16,border:"1px solid rgba(255,255,255,0.08)",marginBottom:12}}>
        <div style={{fontSize:13,fontWeight:800,color:"rgba(255,255,255,0.7)",marginBottom:12}}>🔥 הרצפים שלי</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
          {[{l:"📅 ימים",v:state.dayStreak||0,c:"#f59e0b"},{l:"📆 שבועות",v:state.weekStreak||0,c:"#4ade80"},{l:"🗓️ חודשים",v:state.monthStreak||0,c:"#a78bfa"}].map(s=>(
            <div key={s.l} style={{background:"rgba(255,255,255,0.04)",borderRadius:12,padding:"12px 8px",textAlign:"center",border:`1px solid ${s.c}33`}}>
              <div style={{fontSize:28,fontWeight:900,color:s.c}}>{s.v}</div>
              <div style={{fontSize:10,color:"rgba(255,255,255,0.4)",marginTop:2}}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
        {[{l:"✅ נכונות",v:state.correct,c:"#4ade80"},{l:"🔥 רצף",v:state.streak,c:"#f59e0b"},{l:"⭐ שיא",v:state.bestStreak,c:"#a78bfa"},{l:"🎯 סה\"כ",v:state.total,c:"#22d3ee"},{l:"📚 מילים",v:Object.keys(state.seen).length,c:"#f472b6"},{l:"⚡ XP",v:state.xp,c:"#ef4444"}].map(s=>(
          <div key={s.l} style={{background:"rgba(255,255,255,0.05)",borderRadius:14,padding:"14px",textAlign:"center",border:`1px solid ${s.c}22`}}>
            <div style={{fontSize:24,fontWeight:900,color:s.c}}>{s.v}</div>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.45)",marginTop:2}}>{s.l}</div>
          </div>
        ))}
      </div>
      <div style={{background:"rgba(255,255,255,0.04)",borderRadius:16,padding:16,border:"1px solid rgba(74,222,128,0.2)",marginBottom:12}}>
        <div style={{fontSize:13,fontWeight:800,color:"#4ade80",marginBottom:10}}>✅ מילים שאני יודע ({knownWords.length})</div>
        {knownWords.length>0?(
          <>
            <input value={wordSearch} onChange={e=>setWordSearch(e.target.value)} placeholder="חפש מילה..." style={{width:"100%",background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:8,padding:"7px 10px",color:"#fff",fontSize:13,outline:"none",marginBottom:8}}/>
            <div style={{maxHeight:220,overflowY:"auto"}}>
              {(wordSearch?filtered:[...knownWords].reverse()).map((w,i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 4px",borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
                  <span style={{fontSize:13,color:"#fff",fontWeight:700,direction:"ltr"}}>{w.en}</span>
                  <span style={{fontSize:12,color:"rgba(255,255,255,0.45)"}}>{w.he}</span>
                </div>
              ))}
              {wordSearch&&filtered.length===0&&<div style={{fontSize:12,color:"rgba(255,255,255,0.3)",textAlign:"center",padding:12}}>לא נמצאו תוצאות</div>}
            </div>
          </>
        ):(
          <div style={{fontSize:12,color:"rgba(255,255,255,0.3)",textAlign:"center",padding:12}}>ענה נכון על שאלות כדי לצבור מילים! 🎯</div>
        )}
      </div>
      <div style={{background:"rgba(255,255,255,0.04)",borderRadius:16,padding:16,border:"1px solid rgba(255,255,255,0.08)",marginBottom:12}}>
        <div style={{fontSize:13,fontWeight:700,color:"rgba(255,255,255,0.7)",marginBottom:12}}>🌐 שפת האפליקציה</div>
        <div style={{display:"flex",gap:8}}>
          {["he","en"].map(l=>(
            <button key={l} onClick={()=>setState(p=>{const n={...p,lang:l};saveS(n);return n;})} className="btn" style={{flex:1,padding:"10px",borderRadius:12,fontWeight:800,fontSize:14,background:lang===l?"rgba(167,139,250,0.25)":"rgba(255,255,255,0.04)",border:`2px solid ${lang===l?"#a78bfa":"rgba(255,255,255,0.1)"}`,color:lang===l?"#a78bfa":"rgba(255,255,255,0.5)"}}>
              {l==="he"?"🇮🇱 עברית":"🇺🇸 English"}
            </button>
          ))}
        </div>
      </div>
      <div style={{background:"rgba(255,255,255,0.04)",borderRadius:16,padding:16,border:"1px solid rgba(34,211,238,0.2)",marginBottom:12}}>
        <div style={{fontSize:13,fontWeight:700,color:"rgba(255,255,255,0.7)",marginBottom:12}}>🔊 קול הקראה (TTS)</div>
        <div style={{display:"flex",gap:8}}>
          {[{v:"female",l:"👩 קול אישה"},{v:"male",l:"👨 קול גבר"}].map(({v,l})=>(
            <button key={v} onClick={()=>setState(p=>{const n={...p,voiceGender:v};saveS(n);return n;})} className="btn" style={{flex:1,padding:"10px",borderRadius:12,fontWeight:800,fontSize:13,background:(state.voiceGender||"female")===v?"rgba(34,211,238,0.2)":"rgba(255,255,255,0.04)",border:`2px solid ${(state.voiceGender||"female")===v?"#22d3ee":"rgba(255,255,255,0.1)"}`,color:(state.voiceGender||"female")===v?"#22d3ee":"rgba(255,255,255,0.5)"}}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <div style={{background:"rgba(255,255,255,0.04)",borderRadius:16,padding:16,border:"1px solid rgba(167,139,250,0.2)",marginBottom:12}}>
        <div style={{fontSize:13,fontWeight:700,color:"rgba(255,255,255,0.7)",marginBottom:12}}>🤖 Gemini AI</div>
        <div style={{background:"rgba(0,0,0,0.2)",borderRadius:12,padding:"10px 14px",marginBottom:12}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{fontSize:12,color:"rgba(255,255,255,0.5)"}}>תוכנית נוכחית</div>
            <div style={{fontSize:13,fontWeight:800,color:state.plan==="premium"?"#f59e0b":state.geminiKey?"#4ade80":"rgba(255,255,255,0.4)"}}>
              {state.plan==="premium"?`⭐ פרמיום (${state.aiCredits} קרדיטים)`:state.geminiKey?"🔑 מפתח אישי":"🆓 חינמי"}
            </div>
          </div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          <button onClick={()=>setShowGuide(true)} className="btn" style={{background:"rgba(34,211,238,0.1)",border:"1px solid rgba(34,211,238,0.3)",borderRadius:12,padding:"11px",color:"#22d3ee",fontSize:13,fontWeight:700}}>
            🔑 כיצד לקבל מפתח AI חינמי?
          </button>
          <div style={{position:"relative"}}>
            <input
              value={state.geminiKey||""}
              onChange={e=>setState(p=>{const n={...p,geminiKey:e.target.value.trim()};saveS(n);return n;})}
              placeholder="הדבק מפתח Gemini כאן (AIza...)"
              style={{width:"100%",background:"rgba(255,255,255,0.06)",border:`1px solid ${state.geminiKey?"rgba(74,222,128,0.4)":"rgba(255,255,255,0.12)"}`,borderRadius:10,padding:"10px 12px",color:"#fff",fontSize:12,outline:"none",direction:"ltr",fontFamily:"monospace"}}
            />
            {state.geminiKey&&<div style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",fontSize:12,color:"#4ade80",pointerEvents:"none"}}>✓</div>}
          </div>
          {state.geminiKey&&(
            <button onClick={async()=>{
              setTestStatus("⏳ בודק...");
              try{
                await callGemini("Say only: OK",state.geminiKey);
                setTestStatus("✅ המפתח עובד!");
              }catch(e){
                setTestStatus("❌ שגיאה: "+e.message.slice(0,60));
              }
              setTimeout(()=>setTestStatus(""),4000);
            }} className="btn" style={{background:"rgba(74,222,128,0.1)",border:"1px solid rgba(74,222,128,0.3)",borderRadius:10,padding:"9px",color:"#4ade80",fontSize:13,fontWeight:700}}>
              🔬 בדוק שהמפתח עובד
            </button>
          )}
          {testStatus&&<div style={{fontSize:12,color:testStatus.startsWith("✅")?"#4ade80":testStatus.startsWith("❌")?"#f87171":"#f59e0b",textAlign:"center",fontWeight:700}}>{testStatus}</div>}
          <button onClick={()=>setShowPremium(true)} className="btn" style={{background:"linear-gradient(135deg,rgba(245,158,11,0.15),rgba(167,139,250,0.15))",border:"1px solid rgba(245,158,11,0.4)",borderRadius:12,padding:"11px",color:"#f59e0b",fontSize:13,fontWeight:700}}>
            ⭐ שדרג לפרמיום — AI ללא מפתח
          </button>
        </div>
      </div>
      {showGuide&&<ApiKeyGuideModal onClose={()=>setShowGuide(false)} onHasKey={()=>setShowGuide(false)}/>}
      {showPremium&&<PremiumModal state={state} setState={setState} onClose={()=>setShowPremium(false)}/>}
      <button onClick={onLogout} className="btn" style={{width:"100%",padding:"12px",background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.3)",borderRadius:12,color:"#f87171",fontSize:14,fontWeight:700}}>
        🚪 {lang==="en"?"Sign Out":"התנתק"}
      </button>
    </div>
  );
}

function ExplainModal({word,onClose,lang,geminiKey,plan,aiCredits,onUseCredit}){
  const[text,setText]=useState("");
  const[loading,setLoading]=useState(true);
  const[error,setError]=useState("");
  useEffect(()=>{
    let gone=false;
    const prompt=lang==="en"?`Explain the technical term "${word.en}" (Hebrew: "${word.he}") from "${word.category}". Include: 1.📖 Definition 2.💡 Example 3.🧠 Memory trick 4.🔗 Related terms. Be friendly, use emojis.`:`הסבר את המילה הטכנית "${word.en}" (עברית: "${word.he}") מהתחום "${word.category}". כלול: 1.📖 הגדרה פשוטה 2.💡 דוגמה מעשית 3.🧠 טריק לזכור 4.🔗 מילים קשורות. דבר בחום עם אמוגיים.`;
    callAI(prompt, geminiKey, plan, aiCredits).then(t=>{if(!gone)setText(t);}).catch(e=>{if(!gone)setError(e.message==="NO_KEY"?"⚠️ הגדר מפתח AI בפרופיל, או שדרג לפרמיום":"שגיאה: "+e.message);}).finally(()=>{if(!gone)setLoading(false);});
    return()=>{gone=true;};
  },[word.en]);
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",padding:20,backdropFilter:"blur(16px)"}}>
      <div style={{background:"linear-gradient(135deg,#1e1b4b,#0f172a)",border:"1px solid rgba(167,139,250,0.4)",borderRadius:24,padding:24,maxWidth:440,width:"100%",maxHeight:"82vh",overflowY:"auto",boxShadow:"0 0 60px rgba(167,139,250,0.25)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
          <div>
            <div style={{fontSize:11,color:"#a78bfa",fontWeight:800,letterSpacing:2,marginBottom:4}}>🤖 Gemini AI</div>
            <div style={{fontSize:22,fontWeight:900,color:"#fff",direction:"ltr"}}>{word.en}</div>
            <div style={{fontSize:13,color:"rgba(255,255,255,0.55)",direction:"rtl"}}>{word.he}</div>
          </div>
          <button onClick={onClose} className="btn" style={{background:"rgba(255,255,255,0.1)",border:"none",color:"#fff",borderRadius:"50%",width:36,height:36,fontSize:18}}>✕</button>
        </div>
        {loading?<div style={{textAlign:"center",padding:40}}><div style={{fontSize:48,animation:"spin 1.2s linear infinite",display:"inline-block"}}>⚙️</div><div style={{color:"#a78bfa",fontSize:14,marginTop:12}}>Gemini AI מכין הסבר...</div></div>
        :error?<div style={{color:"#f87171",fontSize:14,padding:20,textAlign:"center"}}>{error}</div>
        :<div style={{color:"#e2e8f0",lineHeight:1.9,fontSize:14,whiteSpace:"pre-wrap",textAlign:"right",direction:"rtl"}}>{text}</div>}
      </div>
    </div>
  );
}

function NoLivesScreen({state,onHome,lang}){
  return(
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:28,textAlign:"center",background:"linear-gradient(135deg,#0f0c29,#1a0533,#0c1a2e)"}}>
      <DuckSVG stage={DUCK_STAGES[0]} mood="angry" size={120}/>
      <div style={{fontSize:26,fontWeight:900,color:"#fff",marginTop:16,marginBottom:12}}>{lang==="en"?"No lives left!":"נגמרו לך החיים!"}</div>
      <div style={{fontSize:20,fontWeight:800,lineHeight:1.6,marginBottom:20,maxWidth:300,background:"linear-gradient(135deg,#fde68a,#f59e0b)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>
        "מאמין בך יותר<br/>ממה שאתה חושב" 💛
      </div>
      <BigTimer resetAt={state.resetAt} lang={lang}/>
      <div style={{fontSize:14,color:"rgba(255,255,255,0.4)",marginBottom:20}}>🦆 × 10 חיים חדשים מחכים לך!</div>
      <button onClick={onHome} className="btn" style={{background:"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.2)",borderRadius:14,padding:"13px 28px",color:"#fff",fontSize:15,fontWeight:700}}>
        🏠 {lang==="en"?"Home":"דף הבית"}
      </button>
    </div>
  );
}

function HomeScreen({user,state,setState,onStart,onSentences,onProfile,onAddWords,onNotepad,onReset,onLeaderboard}){
  const lang=state.lang||"he";
  const level=getLevel(state.xp),nextLevel=getNext(state.xp);
  const duck=getDuck(state.correct);
  const customWords=state.customWords||[];
  const noteWords=state.noteWords||[];
  const totalWords=ALL_BASE.length+(state.aiWords?.length||0)+customWords.length;
  const seen=Object.keys(state.seen).length;
  const xpPct=Math.min(100,((state.xp-level.xp)/((nextLevel?nextLevel.xp:level.xp+1000)-level.xp))*100);
  const[showAvatarSelect,setShowAvatarSelect]=useState(false);
  const selAvatar=state.selectedAvatar||"duck";
  return(
    <div style={{padding:"16px",maxWidth:460,margin:"0 auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <button onClick={onProfile} className="btn" style={{background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:12,padding:"8px 12px",color:"#fff",fontSize:13,fontWeight:700,display:"flex",alignItems:"center",gap:6}}>
          👤 {lang==="en"?"Profile":"פרופיל"}
        </button>
        <button onClick={onLeaderboard} className="btn" style={{background:"rgba(245,158,11,0.12)",border:"1px solid rgba(245,158,11,0.35)",borderRadius:12,padding:"8px 12px",color:"#f59e0b",fontSize:13,fontWeight:700}}>
          🏆 ניקוד
        </button>
        <button onClick={()=>setState(p=>{const n={...p,lang:p.lang==="he"?"en":"he"};saveS(n);return n;})} className="btn" style={{background:"rgba(99,102,241,0.15)",border:"1px solid rgba(99,102,241,0.3)",borderRadius:10,padding:"7px 12px",color:"#a5b4fc",fontSize:12,fontWeight:700}}>
          {lang==="he"?"🇺🇸 EN":"🇮🇱 HE"}
        </button>
      </div>
      <div style={{textAlign:"center",marginBottom:14}}>
        <button onClick={()=>setShowAvatarSelect(true)} className="btn" style={{background:"none",border:"none",padding:0,marginBottom:10,display:"inline-block",position:"relative"}}>
          <div style={{width:110,height:110,borderRadius:"50%",background:"linear-gradient(135deg,#a78bfa33,#22d3ee33)",border:"3px solid rgba(167,139,250,0.55)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto",boxShadow:"0 0 28px rgba(167,139,250,0.3)",overflow:"hidden",animation:"glow 3s ease infinite"}}>
            <AvatarSVG id={selAvatar} size={96} duck={duck}/>
          </div>
          <div style={{position:"absolute",bottom:4,right:4,background:"rgba(167,139,250,0.85)",borderRadius:"50%",width:24,height:24,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13}}>✏️</div>
          <div style={{fontSize:11,color:"rgba(255,255,255,0.4)",marginTop:4}}>{AVATARS.find(a=>a.id===selAvatar)?.name||"ברווז"}</div>
        </button>
        <div style={{fontSize:11,fontWeight:800,color:duck.color,background:`${duck.color}22`,borderRadius:20,padding:"3px 14px",display:"inline-block",marginBottom:8}}>{duck.name}</div>
        <div style={{fontSize:30,fontWeight:900,lineHeight:1,background:"linear-gradient(135deg,#f472b6,#a78bfa,#22d3ee,#4ade80,#f472b6)",backgroundSize:"300% 300%",animation:"rainbow 5s ease infinite",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>WordMaster Pro</div>
        <div style={{color:"rgba(255,255,255,0.45)",fontSize:12,marginTop:4}}>🔬 כיול • אופטיקה • אלקטרוניקה • פיזיקה</div>
      </div>
      {showAvatarSelect&&<AvatarSelectModal state={state} setState={setState} onClose={()=>setShowAvatarSelect(false)}/>}
      {(state.dayStreak>0||state.weekStreak>0||state.monthStreak>0)&&(
        <div style={{display:"flex",gap:6,marginBottom:10,justifyContent:"center",flexWrap:"wrap"}}>
          {state.dayStreak>0&&<div style={{background:"rgba(245,158,11,0.15)",border:"1px solid rgba(245,158,11,0.3)",borderRadius:20,padding:"4px 12px",fontSize:12,color:"#f59e0b",fontWeight:800}}>📅 {state.dayStreak} ימים</div>}
          {state.weekStreak>0&&<div style={{background:"rgba(74,222,128,0.15)",border:"1px solid rgba(74,222,128,0.3)",borderRadius:20,padding:"4px 12px",fontSize:12,color:"#4ade80",fontWeight:800}}>📆 {state.weekStreak} שבועות</div>}
          {state.monthStreak>0&&<div style={{background:"rgba(167,139,250,0.15)",border:"1px solid rgba(167,139,250,0.3)",borderRadius:20,padding:"4px 12px",fontSize:12,color:"#a78bfa",fontWeight:800}}>🗓️ {state.monthStreak} חודשים</div>}
        </div>
      )}
      <div style={{background:"rgba(255,255,255,0.06)",borderRadius:16,padding:"12px 14px",border:"1px solid rgba(255,255,255,0.1)",marginBottom:10,animation:"glow 3s ease infinite"}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:6,alignItems:"center"}}>
          <span style={{color:"#fff",fontWeight:900,fontSize:14}}>{level.emoji} {level.name}</span>
          <span style={{color:level.color,fontSize:13,fontWeight:800}}>{state.xp} XP</span>
        </div>
        <div style={{height:8,background:"rgba(255,255,255,0.08)",borderRadius:99,overflow:"hidden"}}>
          <div style={{height:"100%",width:`${xpPct}%`,background:`linear-gradient(90deg,${level.color}77,${level.color})`,borderRadius:99,transition:"width 0.7s ease"}}/>
        </div>
        {nextLevel&&<div style={{fontSize:10,color:"rgba(255,255,255,0.3)",marginTop:4}}>עוד {nextLevel.xp-state.xp} XP → {nextLevel.name}</div>}
      </div>
      <div style={{background:"rgba(0,0,0,0.28)",borderRadius:16,padding:"10px 14px",border:"1px solid rgba(255,255,255,0.1)",marginBottom:10}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
          <span style={{fontSize:12,fontWeight:800,color:"rgba(255,255,255,0.75)"}}>❤️ {lang==="en"?"Duck Lives":"חיי ברווז"}</span>
          <span style={{fontSize:12,color:"#4ade80",fontWeight:700}}>{state.lives}/10</span>
        </div>
        <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
          {Array.from({length:MAX_LIVES}).map((_,i)=>(
            <div key={i} style={{width:22,height:22,opacity:i<state.lives?1:0.12,filter:i<state.lives?"none":"grayscale(1)",transition:"all 0.5s"}}>
              <DuckSVG stage={DUCK_STAGES[0]} mood="idle" size={22}/>
            </div>
          ))}
        </div>
        {state.resetAt&&state.lives<MAX_LIVES&&<BigTimer resetAt={state.resetAt} lang={lang}/>}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:7,marginBottom:10}}>
        {[{l:"✅ נכונות",v:state.correct,c:"#4ade80"},{l:"🔥 רצף",v:state.streak,c:"#f59e0b"},{l:"⭐ שיא",v:state.bestStreak,c:"#a78bfa"}].map(s=>(
          <div key={s.l} style={{background:"rgba(255,255,255,0.05)",borderRadius:12,padding:"10px 6px",textAlign:"center",border:`1px solid ${s.c}22`}}>
            <div style={{fontSize:20,fontWeight:900,color:s.c}}>{s.v}</div>
            <div style={{fontSize:10,color:"rgba(255,255,255,0.45)",marginTop:2}}>{s.l}</div>
          </div>
        ))}
      </div>
      <div style={{background:"rgba(255,255,255,0.04)",borderRadius:12,padding:"10px 14px",border:"1px solid rgba(255,255,255,0.08)",marginBottom:10}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
          <span style={{fontSize:12,color:"rgba(255,255,255,0.55)"}}>מילים שנלמדו</span>
          <span style={{fontSize:12,color:"#22d3ee",fontWeight:800}}>{seen}/{totalWords}</span>
        </div>
        <div style={{height:6,background:"rgba(255,255,255,0.07)",borderRadius:99}}>
          <div style={{height:"100%",width:`${Math.min(100,(seen/Math.max(totalWords,1))*100)}%`,background:"linear-gradient(90deg,#22d3ee,#a78bfa,#f472b6)",borderRadius:99}}/>
        </div>
      </div>
      <div style={{marginBottom:10}}>
        <div style={{fontSize:11,color:"rgba(255,255,255,0.45)",fontWeight:800,marginBottom:7}}>🎯 {lang==="en"?"Difficulty":"רמת קושי"}</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
          {["easy","medium","hard"].map(lvl=>(
            <button key={lvl} onClick={()=>setState(p=>{const n={...p,selectedLevel:lvl};saveS(n);return n;})} className="btn" style={{padding:"9px 6px",borderRadius:11,fontWeight:800,fontSize:12,background:(state.selectedLevel||"easy")===lvl?(lvl==="easy"?"rgba(74,222,128,0.25)":lvl==="medium"?"rgba(250,204,21,0.25)":"rgba(248,113,113,0.25)"):"rgba(255,255,255,0.04)",border:`2px solid ${(state.selectedLevel||"easy")===lvl?(lvl==="easy"?"#4ade80":lvl==="medium"?"#facc15":"#f87171"):"rgba(255,255,255,0.1)"}`,color:(state.selectedLevel||"easy")===lvl?(lvl==="easy"?"#4ade80":lvl==="medium"?"#facc15":"#f87171"):"rgba(255,255,255,0.5)"}}>
              {lvlLabel(lvl,lang)}
            </button>
          ))}
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
        <button onClick={onAddWords} className="btn" style={{background:"rgba(34,211,238,0.1)",border:"1px solid rgba(34,211,238,0.35)",borderRadius:14,padding:"12px 10px",color:"#22d3ee",fontSize:13,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
          ➕ הוסף מילים
          {customWords.length>0&&<span style={{background:"rgba(34,211,238,0.2)",borderRadius:20,padding:"1px 7px",fontSize:11}}>{customWords.length}</span>}
        </button>
        <button onClick={onNotepad} className="btn" style={{background:"rgba(245,158,11,0.1)",border:"1px solid rgba(245,158,11,0.35)",borderRadius:14,padding:"12px 10px",color:"#f59e0b",fontSize:13,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
          📒 הפינקס
          {noteWords.length>0&&<span style={{background:"rgba(245,158,11,0.2)",borderRadius:20,padding:"1px 7px",fontSize:11}}>{noteWords.length}</span>}
        </button>
      </div>
      <div style={{fontSize:11,color:"rgba(255,255,255,0.45)",fontWeight:800,marginBottom:8}}>📚 {lang==="en"?"Choose Module":"בחר מודול"}</div>
      <div style={{display:"flex",flexDirection:"column",gap:7,marginBottom:12}}>
        <button onClick={()=>onStart("ALL")} className="btn" style={{background:"linear-gradient(135deg,#f472b6,#a78bfa,#22d3ee,#4ade80)",backgroundSize:"300% 300%",animation:"rainbow 4s ease infinite",borderRadius:14,padding:"14px 16px",color:"#fff",fontSize:14,fontWeight:900,display:"flex",justifyContent:"space-between",boxShadow:"0 4px 24px rgba(167,139,250,0.4)"}}>
          <span>⚡ {lang==="en"?"All Modules":"כל המודולים"}</span>
          <span style={{fontSize:11,opacity:0.9}}>{totalWords} {lang==="en"?"words":"מילים"}</span>
        </button>
        <div style={{background:"rgba(245,158,11,0.06)",border:"1px solid rgba(245,158,11,0.2)",borderRadius:14,padding:"10px 12px",marginBottom:4}}>
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
            <span style={{fontSize:10,background:"rgba(245,158,11,0.2)",color:"#f59e0b",borderRadius:20,padding:"2px 10px",fontWeight:800,letterSpacing:1}}>🎓 למתקדמים</span>
            <span style={{fontSize:10,color:"rgba(255,255,255,0.3)"}}>מומלץ לאחר שליטה בבסיס</span>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7}}>
            <button onClick={()=>onSentences()} className="btn" style={{background:"rgba(74,222,128,0.08)",border:"1px solid rgba(74,222,128,0.35)",borderRadius:12,padding:"11px 10px",color:"#4ade80",display:"flex",flexDirection:"column",alignItems:"center",gap:3,fontWeight:700,fontSize:12}}>
              <span>📝 בניית משפטים</span>
              <span style={{fontSize:10,opacity:0.55}}>{SENTENCE_DATA.length+(state.customSentences||[]).length} משפטים</span>
            </button>
            <button onClick={()=>onStart("🔭 מערכות EO/IR/RF")} className="btn" style={{background:"rgba(167,139,250,0.08)",border:"1px solid rgba(167,139,250,0.35)",borderRadius:12,padding:"11px 10px",color:"#a78bfa",display:"flex",flexDirection:"column",alignItems:"center",gap:3,fontWeight:700,fontSize:12}}>
              <span>🔭 מונחי EO/IR/RF</span>
              <span style={{fontSize:10,opacity:0.55}}>30 מונחים</span>
            </button>
          </div>
        </div>
        {customWords.length>0&&(
          <button onClick={()=>onStart("CUSTOM")} className="btn" style={{background:"rgba(34,211,238,0.08)",border:"1px solid rgba(34,211,238,0.4)",borderRadius:12,padding:"11px 14px",color:"#22d3ee",display:"flex",justifyContent:"space-between",alignItems:"center",fontWeight:700,fontSize:13}}>
            <span>➕ המילים שהוספתי</span>
            <span style={{fontSize:11}}>{customWords.length} מילים</span>
          </button>
        )}
        {CATEGORIES.map((cat,idx)=>{
          const words=ALL_BASE.filter(w=>w.category===cat&&w.level===(state.selectedLevel||"easy"));
          const catSeen=words.filter(w=>state.seen[w.en]).length;
          const pct=Math.round((catSeen/Math.max(words.length,1))*100);
          const col=CAT_COLORS[idx%CAT_COLORS.length];
          return(
            <button key={cat} onClick={()=>onStart(cat)} className="btn" style={{background:"rgba(255,255,255,0.04)",border:`1px solid ${col}44`,borderRadius:12,padding:"11px 14px",color:"#e2e8f0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,fontSize:13,marginBottom:4}}>{cat}</div>
                <div style={{height:3,background:"rgba(255,255,255,0.06)",borderRadius:99}}>
                  <div style={{height:"100%",width:`${pct}%`,background:col,borderRadius:99}}/>
                </div>
              </div>
              <div style={{textAlign:"left",marginLeft:10}}>
                <div style={{fontSize:12,color:col,fontWeight:800}}>{pct}%</div>
                <div style={{fontSize:10,color:"rgba(255,255,255,0.3)"}}>{catSeen}/{words.length}</div>
              </div>
            </button>
          );
        })}
      </div>
      <button onClick={onReset} className="btn" style={{width:"100%",padding:"10px",background:"rgba(239,68,68,0.08)",border:"1px solid rgba(239,68,68,0.25)",borderRadius:11,color:"rgba(239,68,68,0.7)",fontSize:12,fontWeight:700}}>
        ⚠️ {lang==="en"?"Reset Progress":"איפוס התקדמות"}
      </button>
    </div>
  );
}

function QuizScreen({category,state,setState,onHome,onBack}){
  const lang=state.lang||"he";
  const selectedLevel=state.selectedLevel||"easy";
  const customWords=(state.customWords||[]).map(w=>({...w,level:w.level||"easy"}));
  const basePool=category==="CUSTOM"?customWords:category==="ALL"?[...ALL_BASE,...customWords]:ALL_BASE.filter(w=>w.category===category&&w.level===selectedLevel);
  const aiPool=category==="CUSTOM"?[]:(state.aiWords||[]).filter(w=>(category==="ALL"||w.category===category)&&w.level===selectedLevel);
  const fullPool=[...basePool,...aiPool];
  const[cKey,setCKey]=useState(0);
  const[word,setWord]=useState(()=>rnd(fullPool.length?fullPool:ALL_BASE));
  const[dir,setDir]=useState(()=>Math.random()>0.5?"en2he":"he2en");
  const[opts,setOpts]=useState([]);
  const[chosen,setChosen]=useState(null);
  const[mood,setMood]=useState("idle");
  const[msg,setMsg]=useState("");
  const[showExplain,setShowExplain]=useState(false);
  const[xpPop,setXpPop]=useState(null);
  const[qNum,setQNum]=useState(1);
  const[showLevelUp,setShowLevelUp]=useState(false);
  const[loadingAI,setLoadingAI]=useState(false);
  const[aiStatus,setAIStatus]=useState("");
  const[timeLeft,setTimeLeft]=useState(null);
  const[listening,setListening]=useState(false);
  const[spellResult,setSpellResult]=useState("");
  const timerRef=useRef(null);
  const recRef=useRef(null);
  const prevLevelRef=useRef(getLevel(state.xp).name);

  const timerSecs=Math.min(15,5+Math.floor((qNum-1)/3));

  useEffect(()=>{
    if(state.resetAt&&Date.now()>=state.resetAt){setState(prev=>{const n={...prev,lives:MAX_LIVES,resetAt:null};saveS(n);return n;});}
  },[]);

  useEffect(()=>{
    if(category==="CUSTOM")return;
    const pool2=[...basePool,...(state.aiWords||[]).filter(w=>(category==="ALL"||w.category===category)&&w.level===selectedLevel)];
    if(pool2.filter(w=>!state.seen[w.en]).length<8&&!loadingAI){
      setLoadingAI(true);setAIStatus("🤖 טוען מילים חדשות...");
      const cat=category==="ALL"?rnd(CATEGORIES):category;
      const levelDesc=selectedLevel==="easy"?"basic and simple":selectedLevel==="medium"?"intermediate":"advanced and complex";
      callAI(`Create 15 new ${levelDesc} technical words for category "${cat}". Don't repeat: ${pool2.map(w=>w.en).slice(0,20).join(", ")}. Return JSON only: [{"en":"Word","he":"מילה","tip":"short tip in Hebrew"}]`, state.geminiKey, state.plan, state.aiCredits)
        .then(text=>{
          const arr=JSON.parse(text.replace(/```json|```/g,"").trim());
          const newWords=arr.map(w=>({...w,category:cat,level:selectedLevel,fromAI:true}));
          setState(prev=>{const n={...prev,aiWords:[...(prev.aiWords||[]),...newWords]};saveS(n);return n;});
          setAIStatus(`✅ נוספו ${newWords.length} מילים!`);setTimeout(()=>setAIStatus(""),3000);
        })
        .catch(()=>setAIStatus("")).finally(()=>setLoadingAI(false));
    }
  },[state.seen]);

  useEffect(()=>{
    const k=dir==="en2he"?"he":"en";
    if(word.wrongHe&&word.wrongEn){
      const wrongOpts=dir==="en2he"?(word.wrongHe||[]):(word.wrongEn||[]);
      setOpts(shuffle([word[k],...wrongOpts.slice(0,3)]));
    }else{
      const pool2=[...basePool,...(state.aiWords||[]).filter(w=>(category==="ALL"||w.category===category))];
      const others=pool2.filter(w=>w[k]!==word[k]);
      setOpts(shuffle([word[k],...shuffle(others.length>=3?others:ALL_BASE.filter(w=>w[k]!==word[k])).slice(0,3).map(w=>w[k])]));
    }
    setChosen(null);setMood("idle");setMsg("");
  },[cKey]);

  useEffect(()=>{
    clearInterval(timerRef.current);
    if(chosen===null){setTimeLeft(null);return;}
    let t=timerSecs;
    setTimeLeft(t);
    timerRef.current=setInterval(()=>{
      t-=1;
      setTimeLeft(t);
      if(t<=0)clearInterval(timerRef.current);
    },1000);
    return()=>clearInterval(timerRef.current);
  },[chosen]);

  useEffect(()=>{
    if(timeLeft===0)next();
  },[timeLeft]);

  if(state.lives<=0&&state.resetAt&&Date.now()<state.resetAt)return<NoLivesScreen state={state} onHome={onHome} lang={lang}/>;

  const correct=dir==="en2he"?word.he:word.en;
  const question=dir==="en2he"?word.en:word.he;
  const ansDir=dir==="en2he"?"rtl":"ltr";
  const duck=getDuck(state.correct);
  const level=getLevel(state.xp);
  const acc=state.total>0?Math.round((state.correct/state.total)*100):0;
  const isOk=chosen===correct;
  const duckAnim=showLevelUp?"levelUp 1s ease":mood==="happy"?"duckHappy 0.5s ease 4":mood==="angry"?"duckAngry 0.3s ease 5":"duckIdle 3s ease infinite";

  function handleAnswer(opt){
    if(chosen!==null)return;
    setChosen(opt);
    const ok=opt===correct;
    const base=selectedLevel==="hard"?25:selectedLevel==="medium"?15:10;
    const xpGain=ok?Math.round(base*(state.streak>=4?2:state.streak>=2?1.5:1)):0;
    setState(prev=>{
      const newXP=prev.xp+xpGain;
      const newLives=ok?prev.lives:Math.max(0,prev.lives-1);
      if(getLevel(newXP).name!==prevLevelRef.current){prevLevelRef.current=getLevel(newXP).name;setTimeout(()=>{setShowLevelUp(true);setTimeout(()=>setShowLevelUp(false),1500);},400);}
      const newResetAt=newLives===0&&!prev.resetAt?nextMidnight():prev.resetAt;
      const kw=prev.knownWords||[];
      const newKnownWords=ok&&!kw.find(w=>w.en===word.en)?[...kw,{en:word.en,he:word.he,category:word.category,level:word.level||selectedLevel}]:kw;
      const streakUpdate=calcStreaks(prev);
      const newCatProgress={...prev.catProgress};
      if(ok&&word.category){newCatProgress[word.category]=(newCatProgress[word.category]||0)+1;}
      const newCompletedCount=Object.values(newCatProgress).filter(v=>v>=10).length;
      const advancedDone=(newCatProgress["💬 תכנות באנגלית"]||0)>=10&&(newCatProgress["🔭 מערכות EO/IR/RF"]||0)>=10;
      const newUnlocked=[...(prev.unlockedAvatars||["duck"])];
      AVATARS.forEach(av=>{
        if(av.id==="duck")return;
        if(newUnlocked.includes(av.id))return;
        if(av.advancedRequired&&advancedDone)newUnlocked.push(av.id);
        else if(!av.advancedRequired&&newCompletedCount>=av.unlockCats)newUnlocked.push(av.id);
      });
      const n={...prev,total:prev.total+1,correct:prev.correct+(ok?1:0),streak:ok?prev.streak+1:0,bestStreak:ok?Math.max(prev.bestStreak,prev.streak+1):prev.bestStreak,xp:newXP,lives:newLives,resetAt:newResetAt,seen:ok?{...prev.seen,[word.en]:true}:prev.seen,knownWords:newKnownWords,catProgress:newCatProgress,unlockedAvatars:newUnlocked,...streakUpdate};
      saveS(n);return n;
    });
    playSound(ok?"correct":"wrong");
    if(ok){setMood("happy");setMsg(rnd(RIGHT_MSGS));setXpPop(`+${xpGain} XP`);setTimeout(()=>setXpPop(null),1600);}
    else{setMood("angry");setMsg(rnd(WRONG_MSGS));}
  }

  function speak(text){
    if(!('speechSynthesis' in window))return;
    const u=new SpeechSynthesisUtterance(text);
    u.lang='en-US';u.rate=0.85;
    const voices=window.speechSynthesis.getVoices();
    const enVoices=voices.filter(v=>v.lang.startsWith('en'));
    if(enVoices.length>0){
      const pref=state.voiceGender||"female";
      const femaleHints=['samantha','karen','victoria','moira','fiona','tessa','zira','hazel','susan','sarah','female','woman'];
      const maleHints=['alex','daniel','fred','gordon','lee','rishi','thomas','george','male','man'];
      const hints=pref==="male"?maleHints:femaleHints;
      const picked=enVoices.find(v=>hints.some(h=>v.name.toLowerCase().includes(h)))||enVoices[0];
      if(picked)u.voice=picked;
    }
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }

  function startListening(){
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SR){setSpellResult("❌ הדפדפן לא תומך בזיהוי קול");return;}
    if(listening){recRef.current?.stop();setListening(false);return;}
    const rec=new SR();
    recRef.current=rec;
    rec.lang='en-US';rec.interimResults=false;
    rec.onresult=(e)=>{
      const heard=e.results[0][0].transcript.toLowerCase().trim();
      const target=word.en.toLowerCase().trim();
      const ok=heard===target||heard.replace(/\s+/g,'')===target.replace(/\s+/g,'');
      setSpellResult(ok?"✅ "+heard:"❌ שמעתי: "+heard);
      setListening(false);
    };
    rec.onend=()=>setListening(false);
    rec.onerror=()=>{setListening(false);setSpellResult("❌ שגיאה בהקלטה");};
    rec.start();setListening(true);setSpellResult("");
  }

  function next(speedBonus=0){
    if(speedBonus>0){
      setState(prev=>{const n={...prev,xp:prev.xp+speedBonus};saveS(n);return n;});
      setXpPop(`⚡+${speedBonus}`);setTimeout(()=>setXpPop(null),1600);
    }
    setSpellResult("");setListening(false);
    if(recRef.current)try{recRef.current.stop();}catch{}
    const src=fullPool.length?fullPool:ALL_BASE;
    const unseen=src.filter(w=>!state.seen[w.en]);
    let w;do{w=rnd(unseen.length>2?unseen:src);}while(w.en===word.en&&src.length>1);
    setWord(w);setDir(Math.random()>0.5?"en2he":"he2en");setCKey(k=>k+1);setQNum(q=>q+1);
  }

  return(
    <div style={{padding:"12px",maxWidth:460,margin:"0 auto"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
        <div style={{display:"flex",gap:6}}>
          <button onClick={onHome} className="btn" style={{background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.12)",color:"#94a3b8",borderRadius:9,padding:"6px 11px",fontSize:16}}>🏠</button>
          <button onClick={onBack} className="btn" style={{background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.12)",color:"#94a3b8",borderRadius:9,padding:"6px 11px",fontSize:13,fontWeight:700}}>←</button>
        </div>
        <div style={{textAlign:"center"}}>
          <div style={{fontSize:11,color:level.color,fontWeight:900}}>{level.emoji} {level.name} • {lvlLabel(selectedLevel,lang)}</div>
          <div style={{fontSize:10,color:"rgba(255,255,255,0.35)"}}>שאלה #{qNum} • ⏱{timerSecs}שנ • בונוס מהירות ⚡</div>
        </div>
        <div style={{textAlign:"left"}}>
          <div style={{fontSize:13,color:"#f59e0b",fontWeight:900}}>🔥 {state.streak}</div>
          <div style={{fontSize:10,color:"rgba(255,255,255,0.35)"}}>{acc}%</div>
        </div>
      </div>
      {aiStatus&&<div style={{background:"rgba(167,139,250,0.15)",border:"1px solid rgba(167,139,250,0.3)",borderRadius:10,padding:"7px 12px",marginBottom:8,fontSize:11,color:"#a78bfa",textAlign:"center",fontWeight:600}}>{aiStatus}</div>}
      <div style={{display:"flex",gap:3,justifyContent:"center",marginBottom:10,background:"rgba(0,0,0,0.22)",borderRadius:12,padding:"7px 12px",border:"1px solid rgba(255,255,255,0.08)"}}>
        {Array.from({length:MAX_LIVES}).map((_,i)=>(
          <div key={i} style={{width:20,height:20,opacity:i<state.lives?1:0.12,filter:i<state.lives?"none":"grayscale(1)",transition:"all 0.5s"}}>
            <DuckSVG stage={DUCK_STAGES[0]} mood="idle" size={20}/>
          </div>
        ))}
      </div>
      <div style={{textAlign:"center",marginBottom:8,position:"relative",minHeight:duck.size+30}}>
        <div style={{display:"inline-block",animation:duckAnim}}>
          <DuckSVG stage={duck} mood={mood} size={duck.size}/>
        </div>
        {xpPop&&<div style={{position:"absolute",top:0,left:"50%",transform:"translateX(-50%)",fontSize:20,fontWeight:900,color:"#4ade80",animation:"xpFloat 1.6s ease forwards",pointerEvents:"none"}}>{xpPop}</div>}
        {msg&&<div style={{fontSize:13,fontWeight:700,color:isOk||!chosen?"#4ade80":"#f87171",marginTop:2,animation:"fadeIn 0.3s ease"}}>{msg}</div>}
        {chosen&&<div style={{fontSize:10,color:duck.color,background:`${duck.color}20`,borderRadius:20,padding:"2px 10px",display:"inline-block",marginTop:3}}>{duck.name}</div>}
      </div>
      <div key={cKey} style={{background:"rgba(255,255,255,0.05)",borderRadius:18,padding:"16px",marginBottom:12,textAlign:"center",border:"1px solid rgba(255,255,255,0.1)",animation:"slideUp 0.35s ease"}}>
        {word.fromCustom&&<div style={{fontSize:9,color:"#22d3ee",fontWeight:700,marginBottom:4}}>➕ מילה שהוספת</div>}
        {word.fromAI&&<div style={{fontSize:9,color:"#a78bfa",fontWeight:700,marginBottom:4}}>🤖 AI</div>}
        <div style={{fontSize:10,color:"rgba(255,255,255,0.38)",letterSpacing:2,marginBottom:8,fontWeight:700}}>{dir==="en2he"?"🇺🇸 תרגם לעברית":"🇮🇱 תרגם לאנגלית"}</div>
        <div style={{fontSize:28,fontWeight:900,color:"#fff",direction:dir==="he2en"?"rtl":"ltr",marginBottom:6}}>{question}</div>
        <div style={{fontSize:11,color:"#818cf8",lineHeight:1.5}}>💡 {word.tip}</div>
        <div style={{display:"flex",gap:8,justifyContent:"center",marginTop:10}}>
          <button onClick={()=>speak(word.en)} className="btn" style={{background:"rgba(34,211,238,0.12)",border:"1px solid rgba(34,211,238,0.35)",borderRadius:20,padding:"5px 16px",color:"#22d3ee",fontSize:12,fontWeight:700}}>🔊 שמע</button>
          <button onClick={startListening} className="btn" style={{background:listening?"rgba(239,68,68,0.15)":"rgba(167,139,250,0.12)",border:`1px solid ${listening?"rgba(239,68,68,0.4)":"rgba(167,139,250,0.35)"}`,borderRadius:20,padding:"5px 16px",color:listening?"#f87171":"#a78bfa",fontSize:12,fontWeight:700}}>
            {listening?"⏹ עצור":"🎤 איית"}
          </button>
        </div>
        {spellResult&&<div style={{fontSize:12,color:spellResult.startsWith("✅")?"#4ade80":"#f87171",textAlign:"center",marginTop:6,fontWeight:700}}>{spellResult}</div>}
        <div style={{fontSize:10,color:"rgba(255,255,255,0.2)",marginTop:6}}>{word.category} • {lvlLabel(word.level||selectedLevel,lang)}</div>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:12}}>
        {opts.map((opt,i)=>{
          let bg="rgba(255,255,255,0.05)",border="rgba(255,255,255,0.12)",color="#e2e8f0",shadow="none";
          if(chosen!==null){
            if(opt===correct){bg="rgba(74,222,128,0.15)";border="#4ade80";color="#4ade80";shadow="0 0 20px rgba(74,222,128,0.3)";}
            else if(opt===chosen){bg="rgba(248,113,113,0.15)";border="#f87171";color="#f87171";shadow="0 0 16px rgba(248,113,113,0.2)";}
            else{bg="rgba(255,255,255,0.02)";border="rgba(255,255,255,0.04)";color="rgba(255,255,255,0.2)";}
          }
          return(
            <button key={i} onClick={()=>handleAnswer(opt)} disabled={chosen!==null} className="btn" style={{background:bg,border:`2px solid ${border}`,borderRadius:13,padding:"13px 14px",color,fontSize:14,fontWeight:700,direction:ansDir,textAlign:"center",boxShadow:shadow,transition:"all 0.3s"}}>
              {chosen!==null&&opt===correct&&"✅ "}{chosen!==null&&opt===chosen&&opt!==correct&&"❌ "}{opt}
            </button>
          );
        })}
      </div>
      {chosen!==null&&!isOk&&(
        <div style={{background:"rgba(248,113,113,0.08)",border:"1px solid rgba(248,113,113,0.25)",borderRadius:13,padding:"12px 14px",marginBottom:10,animation:"fadeIn 0.3s ease"}}>
          <div style={{fontSize:11,color:"#f87171",fontWeight:800,marginBottom:4}}>התשובה הנכונה:</div>
          <div style={{fontSize:17,fontWeight:900,color:"#fff",direction:ansDir}}>{correct}</div>
          <div style={{fontSize:11,color:"#94a3b8",marginTop:3}}>{word.tip}</div>
        </div>
      )}
      {chosen!==null&&(
        <div style={{animation:"fadeIn 0.3s ease"}}>
          {timeLeft!==null&&timeLeft>0&&(
            <div style={{marginBottom:8}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                <span style={{fontSize:11,color:"rgba(255,255,255,0.4)"}}>ממשיך אוטומטית...</span>
                <span style={{fontSize:14,fontWeight:900,color:timeLeft<=2?"#f87171":"#f59e0b"}}>{timeLeft}</span>
              </div>
              <div style={{height:5,background:"rgba(255,255,255,0.1)",borderRadius:99,overflow:"hidden"}}>
                <div style={{height:"100%",width:`${(timeLeft/timerSecs)*100}%`,background:timeLeft<=2?"linear-gradient(90deg,#f87171,#f59e0b)":"linear-gradient(90deg,#a78bfa,#22d3ee)",borderRadius:99,transition:"width 1s linear"}}/>
              </div>
            </div>
          )}
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>setShowExplain(true)} className="btn" style={{flex:1,background:"rgba(99,102,241,0.15)",border:"1px solid rgba(99,102,241,0.4)",borderRadius:12,padding:"12px 8px",color:"#a5b4fc",fontSize:13,fontWeight:700}}>🤖 {lang==="en"?"Explain":"הסבר"}</button>
            <button onClick={()=>next(timeLeft&&timeLeft>0?Math.round((timeLeft/timerSecs)*10):0)} className="btn" style={{flex:2,background:"linear-gradient(135deg,#f472b6,#a78bfa,#22d3ee)",backgroundSize:"200%",animation:"rainbow 3s ease infinite",border:"none",borderRadius:12,padding:"12px",color:"#fff",fontSize:15,fontWeight:900,boxShadow:"0 4px 20px rgba(244,114,182,0.4)",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
              <span>{lang==="en"?"Next →":"המשך ←"}</span>
              {timeLeft&&timeLeft>0?<span style={{fontSize:11,background:"rgba(255,255,255,0.2)",borderRadius:10,padding:"1px 7px"}}>⚡+{Math.round((timeLeft/timerSecs)*10)}</span>:null}
            </button>
          </div>
        </div>
      )}
      {showExplain&&<ExplainModal word={word} onClose={()=>setShowExplain(false)} lang={lang} geminiKey={state.geminiKey} plan={state.plan} aiCredits={state.aiCredits} onUseCredit={()=>setState(prev=>{const n={...prev,aiCredits:Math.max(0,prev.aiCredits-1)};saveS(n);return n;})}/>}
    </div>
  );
}

function App(){
  const[showSplash,setShowSplash]=useState(()=>!sessionStorage.getItem("wmp_splash"));
  const[user,setUser]=useState(null);
  const[authLoading,setAuthLoading]=useState(true);
  const[state,setState]=useState(()=>{const saved=loadS();return saved?{...initS(),...saved}:initS();});
  const[screen,setScreen]=useState("home");
  const[category,setCategory]=useState(null);
  const lang=state.lang||"he";

  useEffect(()=>{
    const unsub=onAuthStateChanged(auth,u=>{setUser(u);setAuthLoading(false);});
    return unsub;
  },[]);

  const syncRef=useRef(null);
  useEffect(()=>{
    if(!user)return;
    clearTimeout(syncRef.current);
    syncRef.current=setTimeout(()=>syncLeaderboard(user,state),4000);
  },[state.xp,user]);

  const bgMap={
    "מתחיל":"linear-gradient(160deg,#0f2027,#203a43,#2c5364)",
    "חוקר":"linear-gradient(160deg,#0f0c29,#302b63,#24243e)",
    "מפתח":"linear-gradient(160deg,#1a0533,#2d1b69,#0e7f70)",
    "מומחה":"linear-gradient(160deg,#0d0d0d,#3a1c71,#b45309)",
    "מאסטר":"linear-gradient(160deg,#200122,#6f0000,#200122)",
  };
  const lv=getLevel(state.xp);

  if(showSplash)return<SplashScreen onDone={()=>{sessionStorage.setItem("wmp_splash","1");setShowSplash(false);}}/>;

  if(authLoading){
    return(
      <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#0f0c29"}}>
        <style>{CSS}</style>
        <div style={{textAlign:"center"}}>
          <div style={{display:"inline-block",animation:"duckIdle 2s ease infinite"}}>
            <DuckSVG stage={DUCK_STAGES[2]} mood="idle" size={80}/>
          </div>
          <div style={{color:"#a78bfa",marginTop:12,fontSize:14}}>WordMaster Pro טוען...</div>
        </div>
      </div>
    );
  }

  if(!user)return<LoginScreen onLogin={u=>setUser(u)}/>;

  return(
    <div style={{minHeight:"100vh",background:bgMap[lv.name]||bgMap["מתחיל"],transition:"background 1.2s ease",fontFamily:"'Heebo',sans-serif",direction:lang==="he"?"rtl":"ltr",color:"#fff",overflowX:"hidden"}}>
      <style>{CSS}</style>
      <div style={{position:"fixed",inset:0,pointerEvents:"none",opacity:0.04,backgroundImage:"radial-gradient(circle,rgba(255,255,255,0.9) 1px,transparent 1px)",backgroundSize:"28px 28px"}}/>
      {screen==="home"&&<HomeScreen user={user} state={state} setState={setState} onStart={cat=>{setCategory(cat);setScreen("quiz");}} onSentences={()=>setScreen("sentences")} onProfile={()=>setScreen("profile")} onAddWords={()=>setScreen("addwords")} onNotepad={()=>setScreen("notepad")} onLeaderboard={()=>setScreen("leaderboard")} onReset={()=>{if(window.confirm(lang==="en"?"Delete all progress?":"למחוק הכל?")){const f=initS();setState(f);saveS(f);}}}/>}
      {screen==="quiz"&&<QuizScreen category={category} state={state} setState={setState} onHome={()=>setScreen("home")} onBack={()=>setScreen("home")}/>}
      {screen==="sentences"&&<SentenceScreen state={state} setState={setState} onHome={()=>setScreen("home")} onBack={()=>setScreen("home")}/>}
      {screen==="profile"&&<ProfileScreen user={user} state={state} setState={setState} onBack={()=>setScreen("home")} onLogout={async()=>{await signOut(auth);setUser(null);setScreen("home");}}/>}
      {screen==="leaderboard"&&<LeaderboardScreen user={user} state={state} onBack={()=>setScreen("home")}/>}
      {screen==="addwords"&&<AddWordsScreen state={state} setState={setState} onBack={()=>setScreen("home")}/>}
      {screen==="notepad"&&<NotepadScreen state={state} setState={setState} onBack={()=>setScreen("home")}/>}
    </div>
  );
}

export default function Root(){return<ErrorBoundary><App/></ErrorBoundary>;}
