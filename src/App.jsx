import { useState, useEffect, useCallback } from "react";

const API = "https://dac-healthprice-api.onrender.com/"; // UPDATE to your new Render URL
const LOGO_URL = "/DAC.jpg"; // Your logo in /public

async function apiCall(path, body) {
  const opts = body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {};
  const r = await fetch(`${API}${path}`, { ...opts, signal: AbortSignal.timeout(45000) });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || `Error ${r.status}`); }
  return r.json();
}

// ─── Constants ──────────────────────────────────────────────────────────────
const COUNTRIES = {
  cambodia: { name: "Cambodia", flag: "\u{1F1F0}\u{1F1ED}", regions: ["Phnom Penh","Siem Reap","Battambang","Sihanoukville","Kampong Cham","Rural Areas"] },
  vietnam:  { name: "Vietnam",  flag: "\u{1F1FB}\u{1F1F3}", regions: ["Ho Chi Minh City","Hanoi","Da Nang","Can Tho","Hai Phong","Rural Areas"] },
};
const GENDERS = ["Male","Female","Other"];
const SMOKING = ["Never","Former","Current"];
const EXERCISE = ["Sedentary","Light","Moderate","Active"];
const OCCUPATIONS = ["Office/Desk","Retail/Service","Healthcare","Manual Labor","Industrial/High-Risk"];
const PREEXIST = ["None","Hypertension","Diabetes","Heart Disease","Asthma/COPD","Cancer (remission)","Kidney Disease","Liver Disease","Obesity","Mental Health"];
const TIERS = {
  Bronze:  {limit:"$15,000",room:"General Ward",surg:"$5,000",icu:"3 days",ded:"$500"},
  Silver:  {limit:"$40,000",room:"Semi-Private",surg:"$15,000",icu:"7 days",ded:"$250"},
  Gold:    {limit:"$80,000",room:"Private Room",surg:"$40,000",icu:"14 days",ded:"$100"},
  Platinum:{limit:"$150,000",room:"Private Suite",surg:"$80,000",icu:"30 days",ded:"$0"},
};

// ─── Fallback pricing ───────────────────────────────────────────────────────
const FB_FREQ = {ipd:0.12,opd:2.5,dental:0.8,maternity:0.15};
const FB_SEV = {ipd:2500,opd:60,dental:120,maternity:3500};
const TIER_F = {Bronze:0.70,Silver:1.00,Gold:1.45,Platinum:2.10};
const LOAD = {ipd:0.30,opd:0.25,dental:0.20,maternity:0.25};

function localPrice(inp) {
  const af = 1 + Math.max(0,(inp.age-35))*0.008;
  const sf = {Never:1,Former:1.15,Current:1.40}[inp.smoking_status]||1;
  const ef = {Sedentary:1.20,Light:1.05,Moderate:0.90,Active:0.80}[inp.exercise_frequency]||1;
  const of_ = {"Office/Desk":0.85,"Retail/Service":1,"Healthcare":1.05,"Manual Labor":1.15,"Industrial/High-Risk":1.30}[inp.occupation_type]||1;
  const pf = 1 + (inp.preexist_conditions.filter(p=>p!=="None").length)*0.20;
  const calc = (cov) => {
    const freq = FB_FREQ[cov]*af*sf*ef*of_*pf;
    const sev = FB_SEV[cov]*(1+Math.max(0,(inp.age-30))*0.006);
    return {frequency:Math.round(freq*1000)/1000, severity:Math.round(sev), expected_annual_cost:Math.round(freq*sev*100)/100, source:"local"};
  };
  const ipd = calc("ipd");
  const tf = TIER_F[inp.ipd_tier]||1;
  const ipd_loaded = Math.round(ipd.expected_annual_cost*(1+LOAD.ipd)*tf*100)/100;
  const ded_credit = Math.round((({Bronze:500,Silver:250,Gold:100,Platinum:0}[inp.ipd_tier]||0)*0.10)*100)/100;
  const ipd_prem = Math.max(Math.round((ipd_loaded-ded_credit)*100)/100, 50);
  let total = ipd_prem;
  const riders = {};
  for (const [cov, inc] of [["opd",inp.include_opd],["dental",inp.include_dental],["maternity",inp.include_maternity]]) {
    if (!inc) continue;
    const r = calc(cov);
    const rp = Math.round(r.expected_annual_cost*(1+LOAD[cov])*100)/100;
    riders[cov] = {...r, name:cov.toUpperCase()+" Rider", annual_premium:rp, monthly_premium:Math.round(rp/12*100)/100};
    total += rp;
  }
  const ff = 1+(inp.family_size-1)*0.65;
  total = Math.round(total*ff*100)/100;
  return {
    quote_id:`LOCAL-${Date.now()}`, model_version:"local", ipd_tier:inp.ipd_tier, tier_benefits:TIERS[inp.ipd_tier],
    ipd_core:{...ipd, annual_premium:ipd_prem, monthly_premium:Math.round(ipd_prem/12*100)/100, tier_factor:tf, deductible_credit:ded_credit, loading_pct:LOAD.ipd, source:"local"},
    riders, family_size:inp.family_size, family_factor:Math.round(ff*100)/100,
    total_annual_premium:total, total_monthly_premium:Math.round(total/12*100)/100,
    risk_profile:{age:inp.age,gender:inp.gender,smoking:inp.smoking_status,exercise:inp.exercise_frequency,occupation:inp.occupation_type,preexist_conditions:inp.preexist_conditions},
  };
}

// ─── Icons ──────────────────────────────────────────────────────────────────
const I = {
  Shield:()=><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  Heart:()=><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>,
  Chev:()=><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>,
  Arrow:()=><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>,
  Spin:()=><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{animation:"spin 1s linear infinite"}}><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>,
  Check:()=><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>,
};

function Logo({size=34}){
  if(LOGO_URL) return <img src={LOGO_URL} alt="Logo" style={{width:size,height:size,borderRadius:size*.26,objectFit:"contain"}}/>;
  return <div style={{width:size,height:size,borderRadius:size*.26,background:"linear-gradient(135deg,#0d9488,#6366f1)",display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontFamily:"var(--fd)",fontSize:size*.38,fontStyle:"italic"}}>HP</div>;
}

// ─── Styles ─────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&family=Instrument+Serif:ital@0;1&display=swap');
:root{--pri:#1e40af;--pri-l:#3b82f6;--pri-bg:#eff6ff;--acc:#0d9488;--acc-bg:#f0fdfa;--rider:#7c3aed;--rider-bg:#f5f3ff;--bg:#f8fafb;--surf:#fff;--surf2:#f1f5f9;--surf3:#e2e8f0;--txt:#0f172a;--txt2:#475569;--txt3:#94a3b8;--fd:'Instrument Serif',serif;--fb:'DM Sans',sans-serif;--r:14px;--rs:10px}
*{margin:0;padding:0;box-sizing:border-box}body{background:var(--bg);color:var(--txt);font-family:var(--fb);-webkit-font-smoothing:antialiased}
@keyframes spin{to{transform:rotate(360deg)}}@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
.app{min-height:100vh}
.nav{position:sticky;top:0;z-index:50;background:rgba(255,255,255,.92);backdrop-filter:blur(16px);border-bottom:1px solid var(--surf3);padding:0 24px;height:58px;display:flex;align-items:center;justify-content:space-between}
.nav-brand{display:flex;align-items:center;gap:10px;cursor:pointer}
.nav-title{font-family:var(--fd);font-size:17px;color:var(--txt);font-style:italic}
.nav-right{display:flex;align-items:center;gap:8px}
.ctry-sel{display:flex;gap:2px;padding:2px;background:var(--surf2);border-radius:8px}
.ctry-btn{padding:4px 10px;border-radius:6px;border:none;cursor:pointer;font-size:12px;font-family:var(--fb);transition:all .2s}
.ctry-btn.sel{background:white;font-weight:600;color:var(--txt);box-shadow:0 1px 3px rgba(0,0,0,.08)}
.ctry-btn:not(.sel){background:transparent;color:var(--txt3)}
.status{display:flex;align-items:center;gap:5px;padding:4px 10px;border-radius:100px;font-size:11px;font-weight:600}
.status.ok{background:rgba(16,185,129,.08);color:#059669}.status.off{background:rgba(239,68,68,.08);color:#ef4444}
.dot{width:6px;height:6px;border-radius:50%}.dot.ok{background:#059669}.dot.off{background:#ef4444}

.page{max-width:920px;margin:0 auto;padding:32px 24px 48px;animation:fadeUp .4s ease both}
.page-title{font-family:var(--fd);font-size:28px;font-weight:400;font-style:italic;margin-bottom:4px}
.page-sub{font-size:14px;color:var(--txt2);margin-bottom:28px}

.section{background:var(--surf);border-radius:var(--r);border:1px solid var(--surf3);padding:24px;margin-bottom:20px}
.section-head{font-family:var(--fd);font-size:17px;font-weight:400;font-style:italic;margin-bottom:16px;display:flex;align-items:center;gap:8px}
.section-badge{padding:3px 8px;border-radius:6px;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.5px}
.badge-core{background:var(--pri-bg);color:var(--pri)}.badge-rider{background:var(--rider-bg);color:var(--rider)}

.fg{margin-bottom:16px}.fl{display:block;font-size:11px;font-weight:600;color:var(--txt2);margin-bottom:5px;letter-spacing:.3px;text-transform:uppercase}
.fi,.fs{width:100%;padding:10px 12px;border-radius:var(--rs);border:1.5px solid var(--surf3);font-size:14px;font-family:var(--fb);color:var(--txt);background:white;transition:all .2s;outline:none;appearance:none}
.fi:focus,.fs:focus{border-color:var(--pri);box-shadow:0 0 0 3px rgba(30,64,175,.08)}
.sw{position:relative}.sw svg{position:absolute;right:10px;top:50%;transform:translateY(-50%);pointer-events:none;color:var(--txt3)}
.fr{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.fr3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}

.chips{display:flex;flex-wrap:wrap;gap:5px}
.chip{padding:6px 12px;border-radius:8px;font-size:12px;font-weight:500;border:1.5px solid var(--surf3);cursor:pointer;transition:all .15s;background:white;font-family:var(--fb);color:var(--txt2)}
.chip:hover{border-color:var(--pri-l)}.chip.sel{border-color:var(--pri);background:var(--pri-bg);color:var(--pri)}

.tier-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.tier-card{padding:12px;border-radius:10px;border:1.5px solid var(--surf3);cursor:pointer;transition:all .2s;background:white;text-align:center}
.tier-card:hover{border-color:var(--pri-l)}.tier-card.sel{border-color:var(--pri);background:var(--pri-bg)}
.tier-name{font-size:14px;font-weight:600;color:var(--txt)}.tier-limit{font-size:11px;color:var(--txt3);margin-top:2px}

.rider-toggle{display:flex;align-items:center;gap:12px;padding:14px;border-radius:10px;border:1.5px solid var(--surf3);cursor:pointer;transition:all .2s;background:white}
.rider-toggle.on{border-color:var(--rider);background:var(--rider-bg)}
.rider-check{width:20px;height:20px;border-radius:6px;border:2px solid var(--surf3);display:flex;align-items:center;justify-content:center;transition:all .2s;flex-shrink:0}
.rider-toggle.on .rider-check{border-color:var(--rider);background:var(--rider);color:white}
.rider-info{flex:1}.rider-name{font-size:13px;font-weight:600}.rider-desc{font-size:11px;color:var(--txt3)}

.preexist-chips{display:flex;flex-wrap:wrap;gap:4px}
.pe-chip{padding:4px 10px;border-radius:6px;font-size:11px;border:1px solid var(--surf3);cursor:pointer;transition:all .15s;background:white;color:var(--txt2);font-family:var(--fb)}
.pe-chip.sel{border-color:#ef4444;background:#fef2f2;color:#dc2626;font-weight:600}

.btn{width:100%;padding:14px;border-radius:var(--rs);font-size:15px;font-weight:600;color:white;background:var(--pri);border:none;cursor:pointer;transition:all .2s;font-family:var(--fb);display:flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 2px 10px rgba(30,64,175,.25)}
.btn:hover{background:#1e3a8a;transform:translateY(-1px)}.btn:disabled{opacity:.6;cursor:not-allowed;transform:none}

/* Result */
.result{animation:fadeUp .3s ease both}
.res-header{background:linear-gradient(135deg,var(--pri) 0%,#3b82f6 60%,#6366f1 100%);border-radius:16px;padding:28px;color:white;margin-bottom:20px;position:relative;overflow:hidden}
.res-header::before{content:'';position:absolute;top:-40px;right:-20px;width:130px;height:130px;border-radius:50%;background:rgba(255,255,255,.06)}
.res-label{font-size:11px;opacity:.8;text-transform:uppercase;letter-spacing:.8px}.res-amount{font-family:var(--fd);font-size:42px;font-weight:400;font-style:italic;margin:4px 0;position:relative;z-index:1}.res-monthly{font-size:13px;opacity:.75}.res-tag{display:inline-flex;align-items:center;gap:4px;margin-top:8px;padding:3px 9px;border-radius:6px;background:rgba(255,255,255,.15);font-size:11px}

.bk-section{margin-bottom:16px}.bk-title{font-size:12px;font-weight:600;color:var(--txt3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;display:flex;align-items:center;gap:6px}
.bk-row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--surf2);font-size:13px}
.bk-row:last-child{border-bottom:none}.bk-l{color:var(--txt2)}.bk-v{font-weight:600;color:var(--txt)}.bk-v.hi{color:var(--pri)}.bk-v.rider{color:var(--rider)}
.qid{margin-top:14px;padding-top:14px;border-top:1px solid var(--surf3);display:flex;justify-content:space-between;font-size:11px}
.qid span:first-child{color:var(--txt3);text-transform:uppercase;letter-spacing:.5px;font-weight:600}
.qid code{color:var(--txt2);background:var(--surf2);padding:2px 6px;border-radius:4px}
.warn-box{padding:8px 12px;border-radius:var(--rs);background:#fffbeb;border:1px solid #fef3c7;color:#92400e;font-size:11px;margin-top:10px}
.empty-result{text-align:center;padding:40px 16px;color:var(--txt3);font-size:13px}

.footer{padding:24px;max-width:920px;margin:0 auto;display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--surf3);flex-wrap:wrap;gap:8px}
.footer p{font-size:11px;color:var(--txt3)}
.footer-tags{display:flex;gap:4px}.footer-tag{padding:2px 7px;border-radius:5px;font-size:10px;font-weight:600;background:var(--surf2);color:var(--txt3)}

/* AI Agent */
.ai-fab{position:fixed;bottom:24px;right:24px;width:52px;height:52px;border-radius:50%;background:linear-gradient(135deg,var(--pri),#6366f1);color:white;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 20px rgba(30,64,175,.3);z-index:100;transition:all .2s}
.ai-fab:hover{transform:scale(1.08);box-shadow:0 6px 24px rgba(30,64,175,.4)}
.ai-panel{position:fixed;bottom:88px;right:24px;width:380px;max-height:520px;background:var(--surf);border-radius:16px;border:1px solid var(--surf3);box-shadow:0 12px 40px rgba(0,0,0,.12);z-index:100;display:flex;flex-direction:column;animation:fadeUp .25s ease both;overflow:hidden}
.ai-header{padding:14px 16px;border-bottom:1px solid var(--surf3);display:flex;align-items:center;justify-content:space-between}
.ai-header-left{display:flex;align-items:center;gap:8px}
.ai-avatar{width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,var(--pri),#6366f1);display:flex;align-items:center;justify-content:center;color:white;font-size:12px;font-weight:600}
.ai-header-info h4{font-size:13px;font-weight:600;margin:0}.ai-header-info p{font-size:10px;color:var(--txt3);margin:0}
.ai-close{background:none;border:none;cursor:pointer;color:var(--txt3);font-size:18px;padding:4px}
.ai-msgs{flex:1;overflow-y:auto;padding:12px 16px;display:flex;flex-direction:column;gap:10px;min-height:200px;max-height:340px}
.ai-msg{max-width:88%;padding:10px 14px;border-radius:12px;font-size:13px;line-height:1.55;word-wrap:break-word}
.ai-msg.bot{align-self:flex-start;background:var(--surf2);color:var(--txt);border-bottom-left-radius:4px}
.ai-msg.user{align-self:flex-end;background:var(--pri);color:white;border-bottom-right-radius:4px}
.ai-msg.typing{align-self:flex-start;background:var(--surf2);color:var(--txt3);font-style:italic}
.ai-chips{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}
.ai-chip{padding:4px 10px;border-radius:6px;font-size:11px;border:1px solid var(--surf3);cursor:pointer;background:white;color:var(--txt2);font-family:var(--fb);transition:all .15s}
.ai-chip:hover{border-color:var(--pri);color:var(--pri);background:var(--pri-bg)}
.ai-input-row{padding:10px 12px;border-top:1px solid var(--surf3);display:flex;gap:8px}
.ai-input{flex:1;padding:8px 12px;border-radius:8px;border:1.5px solid var(--surf3);font-size:13px;font-family:var(--fb);outline:none;color:var(--txt)}
.ai-input:focus{border-color:var(--pri)}
.ai-send{padding:8px 14px;border-radius:8px;background:var(--pri);color:white;border:none;cursor:pointer;font-size:12px;font-weight:600;font-family:var(--fb);transition:all .15s}
.ai-send:hover{background:#1e3a8a}.ai-send:disabled{opacity:.5;cursor:not-allowed}
@media(max-width:768px){.ai-panel{right:8px;left:8px;width:auto;bottom:80px}}

@media(max-width:768px){.fr,.fr3{grid-template-columns:1fr}.tier-grid{grid-template-columns:1fr 1fr}.nav-title{display:none}}
`;

// ═══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [country, setCountry] = useState("cambodia");
  const [apiOk, setApiOk] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [isLocal, setIsLocal] = useState(false);

  const regions = COUNTRIES[country].regions;
  const [inp, setInp] = useState({
    age:35, gender:"Male", country:"cambodia", region:regions[0],
    smoking_status:"Never", exercise_frequency:"Light", occupation_type:"Office/Desk",
    preexist_conditions:["None"], ipd_tier:"Silver", family_size:1,
    include_opd:false, include_dental:false, include_maternity:false,
  });

  useEffect(() => { apiCall("/health").then(()=>setApiOk(true)).catch(()=>setApiOk(false)); }, []);
  useEffect(() => {
    const r = COUNTRIES[country].regions[0];
    setInp(p=>({...p, country, region: r}));
    setResult(null);
  }, [country]);

  const u = (k,v) => setInp(p=>({...p,[k]:v}));
  const togglePreexist = (cond) => setInp(p => {
    const cur = p.preexist_conditions;
    if (cond === "None") return {...p, preexist_conditions: ["None"]};
    const without = cur.filter(c => c !== "None" && c !== cond);
    if (cur.includes(cond)) return {...p, preexist_conditions: without.length ? without : ["None"]};
    return {...p, preexist_conditions: [...without, cond]};
  });

  const calculate = useCallback(async () => {
    setLoading(true); setResult(null); setIsLocal(false);
    try {
      const data = await apiCall("/api/v2/price", inp);
      setResult(data);
    } catch {
      setResult(localPrice(inp)); setIsLocal(true);
    } finally { setLoading(false); }
  }, [inp]);

  return (
    <><style>{CSS}</style>
    <div className="app">
      <nav className="nav">
        <div className="nav-brand" onClick={()=>setResult(null)}>
          <Logo size={34}/><span className="nav-title">DAC HealthPrice</span>
        </div>
        <div className="nav-right">
          <div className="ctry-sel">
            {Object.entries(COUNTRIES).map(([k,v])=>(
              <button key={k} className={`ctry-btn ${country===k?"sel":""}`} onClick={()=>setCountry(k)}>{v.flag} {v.name}</button>
            ))}
          </div>
          <div className={`status ${apiOk?"ok":"off"}`}><div className={`dot ${apiOk?"ok":"off"}`}/>{apiOk?"Connected":"Offline"}</div>
        </div>
      </nav>

      <div className="page">
        <h1 className="page-title">Hospital Reimbursement Insurance</h1>
        <p className="page-sub">IPD-focused coverage for {COUNTRIES[country].name} with optional OPD, Dental, and Maternity riders. Priced using frequency-severity actuarial modeling.</p>

        {/* ─── Demographics ─── */}
        <div className="section">
          <div className="section-head"><I.Shield/> Demographics</div>
          <div className="fr3">
            <div className="fg"><label className="fl">Age</label><input className="fi" type="number" min="0" max="100" value={inp.age} onChange={e=>u("age",Math.max(0,Math.min(100,parseInt(e.target.value)||0)))}/></div>
            <div className="fg"><label className="fl">Gender</label><div className="sw"><select className="fs" value={inp.gender} onChange={e=>u("gender",e.target.value)}>{GENDERS.map(g=><option key={g}>{g}</option>)}</select><I.Chev/></div></div>
            <div className="fg"><label className="fl">Region</label><div className="sw"><select className="fs" value={inp.region} onChange={e=>u("region",e.target.value)}>{regions.map(r=><option key={r}>{r}</option>)}</select><I.Chev/></div></div>
          </div>
          <div className="fg"><label className="fl">Family size</label><input className="fi" type="number" min="1" max="10" value={inp.family_size} onChange={e=>u("family_size",Math.max(1,Math.min(10,parseInt(e.target.value)||1)))} style={{maxWidth:120}}/></div>
        </div>

        {/* ─── Physical Condition ─── */}
        <div className="section">
          <div className="section-head"><I.Heart/> Physical condition</div>
          <div className="fr3">
            <div className="fg"><label className="fl">Smoking status</label><div className="sw"><select className="fs" value={inp.smoking_status} onChange={e=>u("smoking_status",e.target.value)}>{SMOKING.map(s=><option key={s}>{s}</option>)}</select><I.Chev/></div></div>
            <div className="fg"><label className="fl">Exercise frequency</label><div className="sw"><select className="fs" value={inp.exercise_frequency} onChange={e=>u("exercise_frequency",e.target.value)}>{EXERCISE.map(s=><option key={s}>{s}</option>)}</select><I.Chev/></div></div>
            <div className="fg"><label className="fl">Occupation type</label><div className="sw"><select className="fs" value={inp.occupation_type} onChange={e=>u("occupation_type",e.target.value)}>{OCCUPATIONS.map(s=><option key={s}>{s}</option>)}</select><I.Chev/></div></div>
          </div>
          <div className="fg">
            <label className="fl">Pre-existing conditions</label>
            <div className="preexist-chips">
              {PREEXIST.map(p=><div key={p} className={`pe-chip ${inp.preexist_conditions.includes(p)?"sel":""}`} onClick={()=>togglePreexist(p)}>{p}</div>)}
            </div>
          </div>
        </div>

        {/* ─── IPD Plan Tier (Core) ─── */}
        <div className="section">
          <div className="section-head">IPD plan tier <span className="section-badge badge-core">Core</span></div>
          <div className="tier-grid">
            {Object.entries(TIERS).map(([k,v])=>(
              <div key={k} className={`tier-card ${inp.ipd_tier===k?"sel":""}`} onClick={()=>u("ipd_tier",k)}>
                <div className="tier-name">{k}</div>
                <div className="tier-limit">{v.limit} limit</div>
                <div style={{fontSize:10,color:"var(--txt3)",marginTop:4}}>{v.room} | ICU {v.icu}</div>
                <div style={{fontSize:10,color:"var(--txt3)"}}>Deductible: {v.ded}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ─── Optional Riders ─── */}
        <div className="section">
          <div className="section-head">Optional riders <span className="section-badge badge-rider">Add-ons</span></div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {[
              {key:"include_opd",name:"OPD Rider",desc:"Outpatient consultations, lab tests, minor procedures"},
              {key:"include_dental",name:"Dental Rider",desc:"Cleanings, fillings, extractions, X-rays"},
              {key:"include_maternity",name:"Maternity Rider",desc:"Prenatal visits, delivery, newborn care (10-month waiting period)"},
            ].map(r=>(
              <div key={r.key} className={`rider-toggle ${inp[r.key]?"on":""}`} onClick={()=>u(r.key,!inp[r.key])}>
                <div className="rider-check">{inp[r.key]&&<I.Check/>}</div>
                <div className="rider-info"><div className="rider-name">{r.name}</div><div className="rider-desc">{r.desc}</div></div>
              </div>
            ))}
          </div>
        </div>

        {/* ─── Calculate ─── */}
        <button className="btn" onClick={calculate} disabled={loading}>
          {loading?<><I.Spin/> Calculating...</>:<>Calculate Premium <I.Arrow/></>}
        </button>

        {/* ─── Result ─── */}
        {result ? (
          <div className="result" style={{marginTop:24}}>
            <div className="res-header">
              <div className="res-label">Total annual premium — {COUNTRIES[country].name}</div>
              <div className="res-amount">${result.total_annual_premium?.toLocaleString()}</div>
              <div className="res-monthly">${result.total_monthly_premium}/month | Family of {result.family_size} ({result.family_factor}x)</div>
              <div className="res-tag">{isLocal?"Local calculation":`Model ${result.model_version}`} | {result.ipd_tier} tier</div>
            </div>

            <div className="section">
              {/* IPD Core */}
              <div className="bk-section">
                <div className="bk-title"><span className="section-badge badge-core">IPD Core</span> Hospital reimbursement</div>
                <div className="bk-row"><span className="bk-l">Claim frequency</span><span className="bk-v">{result.ipd_core?.frequency} claims/yr</span></div>
                <div className="bk-row"><span className="bk-l">Avg claim severity</span><span className="bk-v">${result.ipd_core?.severity?.toLocaleString()}</span></div>
                <div className="bk-row"><span className="bk-l">Expected annual cost</span><span className="bk-v">${result.ipd_core?.expected_annual_cost?.toLocaleString()}</span></div>
                <div className="bk-row"><span className="bk-l">Loading ({Math.round((result.ipd_core?.loading_pct||0)*100)}%)</span><span className="bk-v">Included</span></div>
                <div className="bk-row"><span className="bk-l">Tier factor ({result.ipd_tier})</span><span className="bk-v hi">{result.ipd_core?.tier_factor}x</span></div>
                {result.ipd_core?.deductible_credit>0&&<div className="bk-row"><span className="bk-l">Deductible credit</span><span className="bk-v" style={{color:"#059669"}}>-${result.ipd_core.deductible_credit}</span></div>}
                <div className="bk-row" style={{fontWeight:600}}><span className="bk-l" style={{fontWeight:600,color:"var(--txt)"}}>IPD premium</span><span className="bk-v hi">${result.ipd_core?.annual_premium?.toLocaleString()}/yr</span></div>
              </div>

              {/* Riders */}
              {Object.keys(result.riders||{}).length > 0 && Object.entries(result.riders).map(([k,v])=>(
                <div className="bk-section" key={k} style={{marginTop:16,paddingTop:16,borderTop:"1px solid var(--surf3)"}}>
                  <div className="bk-title"><span className="section-badge badge-rider">{k.toUpperCase()}</span> {v.name||k}</div>
                  <div className="bk-row"><span className="bk-l">Claim frequency</span><span className="bk-v">{v.frequency} claims/yr</span></div>
                  <div className="bk-row"><span className="bk-l">Avg claim severity</span><span className="bk-v">${v.severity?.toLocaleString()}</span></div>
                  <div className="bk-row"><span className="bk-l">Expected cost</span><span className="bk-v">${v.expected_annual_cost?.toLocaleString()}</span></div>
                  <div className="bk-row" style={{fontWeight:600}}><span className="bk-l" style={{fontWeight:600,color:"var(--txt)"}}>Rider premium</span><span className="bk-v rider">${v.annual_premium?.toLocaleString()}/yr</span></div>
                </div>
              ))}

              {/* Tier Benefits */}
              {result.tier_benefits && (
                <div className="bk-section" style={{marginTop:16,paddingTop:16,borderTop:"1px solid var(--surf3)"}}>
                  <div className="bk-title">{result.ipd_tier} tier benefits</div>
                  <div className="bk-row"><span className="bk-l">Annual limit</span><span className="bk-v">{TIERS[result.ipd_tier]?.limit}</span></div>
                  <div className="bk-row"><span className="bk-l">Room type</span><span className="bk-v">{TIERS[result.ipd_tier]?.room}</span></div>
                  <div className="bk-row"><span className="bk-l">Surgery limit</span><span className="bk-v">{TIERS[result.ipd_tier]?.surg}</span></div>
                  <div className="bk-row"><span className="bk-l">ICU coverage</span><span className="bk-v">{TIERS[result.ipd_tier]?.icu}</span></div>
                  <div className="bk-row"><span className="bk-l">Deductible</span><span className="bk-v">{TIERS[result.ipd_tier]?.ded}</span></div>
                </div>
              )}
            </div>

            <div className="qid"><span>Quote ID</span><code>{result.quote_id}</code></div>
            {isLocal&&<div className="warn-box">Calculated locally — backend API unavailable. Results are approximate.</div>}
          </div>
        ) : !loading && (
          <div className="empty-result" style={{marginTop:24}}>
            <I.Shield/><p>Configure your plan and click <strong>Calculate Premium</strong></p>
          </div>
        )}
      </div>

      {/* AI Agent */}
      <AIChat inp={inp} result={result} country={country} onApply={(changes) => {
        Object.entries(changes).forEach(([k,v]) => u(k,v));
      }} />

      <footer className="footer">
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <Logo size={24}/><span style={{fontFamily:"var(--fd)",fontSize:13,fontStyle:"italic"}}>DAC HealthPrice</span>
        </div>
        <div className="footer-tags">
          <span className="footer-tag">{COUNTRIES[country].flag} {COUNTRIES[country].name}</span>
          <span className="footer-tag">Freq-Sev Model</span>
          <span className="footer-tag">FastAPI</span>
          <span className="footer-tag">Supabase</span>
        </div>
        <p>Demo — Synthetic Data</p>
      </footer>
    </div></>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// AI AGENT — Plan Advisor + Risk Explainer + Smart Suggestions
// ═══════════════════════════════════════════════════════════════════════════════
function AIChat({ inp, result, country, onApply }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([
    { role: "bot", text: "Hi! I'm your AI insurance advisor. I can help you choose the right plan, explain your pricing, or suggest optimizations. What would you like to know?" }
  ]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const msgsRef = { current: null };

  const scrollBottom = () => {
    setTimeout(() => {
      const el = document.getElementById("ai-msgs-container");
      if (el) el.scrollTop = el.scrollHeight;
    }, 50);
  };

  const buildContext = () => {
    const profile = `Customer profile: age=${inp.age}, gender=${inp.gender}, country=${country}, region=${inp.region}, smoking=${inp.smoking_status}, exercise=${inp.exercise_frequency}, occupation=${inp.occupation_type}, pre-existing conditions=${inp.preexist_conditions.join(", ")}, family size=${inp.family_size}.`;
    const plan = `Selected plan: IPD tier=${inp.ipd_tier}, OPD rider=${inp.include_opd?"yes":"no"}, dental rider=${inp.include_dental?"yes":"no"}, maternity rider=${inp.include_maternity?"yes":"no"}.`;
    const pricing = result
      ? `Current quote: total=$${result.total_annual_premium}/yr ($${result.total_monthly_premium}/mo). IPD core: frequency=${result.ipd_core?.frequency} claims/yr, severity=$${result.ipd_core?.severity}, premium=$${result.ipd_core?.annual_premium}/yr. Tier=${result.ipd_tier} (factor ${result.ipd_core?.tier_factor}x). Riders: ${Object.entries(result.riders||{}).map(([k,v])=>`${k}=$${v.annual_premium}/yr`).join(", ")||"none"}. Family factor=${result.family_factor}x.`
      : "No quote calculated yet.";
    return `${profile}\n${plan}\n${pricing}`;
  };

  const sendMessage = async (text) => {
    if (!text.trim()) return;
    const userMsg = { role: "user", text: text.trim() };
    setMsgs(prev => [...prev, userMsg]);
    setInput("");
    setThinking(true);
    scrollBottom();

    try {
      const context = buildContext();
      const systemPrompt = `You are an AI insurance advisor for DAC HealthPrice, a hospital reimbursement insurance platform operating in Cambodia and Vietnam. You have THREE roles:

1. PLAN ADVISOR: Help users choose the right IPD tier (Bronze/Silver/Gold/Platinum) and optional riders (OPD, Dental, Maternity). Consider their age, health conditions, family size, and budget.

2. RISK EXPLAINER: When a user has a quote, explain WHY their premium is what it is. Break down which factors (smoking, age, pre-existing conditions, region) contribute most. Be specific with percentages.

3. SMART SUGGESTIONS: Proactively suggest ways to optimize their coverage. For example:
- "Your smoking status adds ~40% to your premium. Quitting could save you $X/year."
- "With 3 pre-existing conditions, Gold tier's higher surgery limit ($40K vs $15K) may be worth the extra $X/month."
- "At age 28 with no conditions, Bronze tier saves you $X/year and still gives $15K coverage."
- "Adding dental rider for your family of 4 costs only $X/month extra — good value since children need frequent dental care."

RULES:
- Keep responses concise (2-4 sentences max per point).
- Use specific dollar amounts when possible.
- Reference the actual pricing data provided.
- If the user hasn't calculated a quote yet, suggest they do so first or offer to explain the tier options.
- Be warm and helpful, not salesy.
- Format key numbers in bold using **$amount** syntax.

Current context:
${context}`;

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: systemPrompt,
          messages: msgs.filter(m => m.role !== "bot" || msgs.indexOf(m) > 0).slice(-8).map(m => ({
            role: m.role === "bot" ? "assistant" : "user",
            content: m.text,
          })).concat([{ role: "user", content: text.trim() }]),
        }),
      });

      const data = await response.json();
      const reply = data.content?.[0]?.text || "I'm sorry, I couldn't process that. Please try again.";

      // Simple markdown bold to HTML
      const formatted = reply.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

      setMsgs(prev => [...prev, { role: "bot", text: formatted }]);
    } catch (err) {
      setMsgs(prev => [...prev, { role: "bot", text: "I'm having trouble connecting. Please check that the platform is set up correctly and try again." }]);
    } finally {
      setThinking(false);
      scrollBottom();
    }
  };

  const quickQuestions = result
    ? [
        "Why is my premium this amount?",
        "How can I lower my premium?",
        "Should I add dental coverage?",
        "Is my tier right for me?",
      ]
    : [
        "Which tier is best for me?",
        "Do I need OPD coverage?",
        "Explain the tier options",
        "I have pre-existing conditions",
      ];

  return <>
    {/* FAB */}
    <button className="ai-fab" onClick={() => setOpen(!open)} title="AI Insurance Advisor">
      {open
        ? <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        : <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 10h.01"/><path d="M12 10h.01"/><path d="M16 10h.01"/></svg>
      }
    </button>

    {/* Panel */}
    {open && (
      <div className="ai-panel">
        <div className="ai-header">
          <div className="ai-header-left">
            <div className="ai-avatar">AI</div>
            <div className="ai-header-info">
              <h4>Insurance Advisor</h4>
              <p>Plan advice \u2022 Risk analysis \u2022 Suggestions</p>
            </div>
          </div>
          <button className="ai-close" onClick={() => setOpen(false)}>\u00d7</button>
        </div>

        <div className="ai-msgs" id="ai-msgs-container">
          {msgs.map((m, i) => (
            <div key={i} className={`ai-msg ${m.role === "user" ? "user" : "bot"}`}
              dangerouslySetInnerHTML={{ __html: m.text }} />
          ))}
          {thinking && <div className="ai-msg typing">Thinking...</div>}

          {/* Quick action chips after last bot message */}
          {!thinking && msgs.length <= 2 && (
            <div className="ai-chips">
              {quickQuestions.map((q, i) => (
                <div key={i} className="ai-chip" onClick={() => sendMessage(q)}>{q}</div>
              ))}
            </div>
          )}
        </div>

        <div className="ai-input-row">
          <input
            className="ai-input"
            placeholder="Ask about your plan..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !thinking) sendMessage(input); }}
            disabled={thinking}
          />
          <button className="ai-send" onClick={() => sendMessage(input)} disabled={thinking || !input.trim()}>
            Send
          </button>
        </div>
      </div>
    )}
  </>;
}
