import React, { useState, useEffect, useCallback } from "react";

const API = "https://dac-healthprice-api.onrender.com"; // UPDATE to your Render URL
const LOGO_URL = "/DAC.jpg"; // Your logo in /public

async function apiCall(path, body) {
  const opts = body
    ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    : {};
  const r = await fetch(`${API}${path}`, { ...opts, signal: AbortSignal.timeout(45000) });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.detail || `Error ${r.status}`);
  }
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
  Bronze:   { limit: "$15,000",  room: "General Ward",   surg: "$5,000",  icu: "3 days",  ded: "$500",  dedN: 500 },
  Silver:   { limit: "$40,000",  room: "Semi-Private",   surg: "$15,000", icu: "7 days",  ded: "$250",  dedN: 250 },
  Gold:     { limit: "$80,000",  room: "Private Room",   surg: "$40,000", icu: "14 days", ded: "$100",  dedN: 100 },
  Platinum: { limit: "$150,000", room: "Private Suite",  surg: "$80,000", icu: "30 days", ded: "$0",    dedN: 0 },
};
const STEPS = ["Profile", "Health", "Plan", "Quote"];
const FB_FREQ = { ipd: 0.12, opd: 2.5, dental: 0.8, maternity: 0.15 };
const FB_SEV = { ipd: 2500, opd: 60, dental: 120, maternity: 3500 };
const TIER_F = { Bronze: 0.70, Silver: 1.00, Gold: 1.45, Platinum: 2.10 };
const LOAD = { ipd: 0.30, opd: 0.25, dental: 0.20, maternity: 0.25 };

// ─── Local fallback pricing ─────────────────────────────────────────────────
function localPrice(inp) {
  const af = 1 + Math.max(0, (inp.age - 35)) * 0.008;
  const sf = { Never: 1, Former: 1.15, Current: 1.40 }[inp.smoking_status] || 1;
  const ef = { Sedentary: 1.20, Light: 1.05, Moderate: 0.90, Active: 0.80 }[inp.exercise_frequency] || 1;
  const of_ = { "Office/Desk": 0.85, "Retail/Service": 1, "Healthcare": 1.05, "Manual Labor": 1.15, "Industrial/High-Risk": 1.30 }[inp.occupation_type] || 1;
  const pf = 1 + (inp.preexist_conditions.filter(p => p !== "None").length) * 0.20;

  const calc = (cov) => {
    const freq = FB_FREQ[cov] * af * sf * ef * of_ * pf;
    const sev = FB_SEV[cov] * (1 + Math.max(0, (inp.age - 30)) * 0.006);
    return { frequency: Math.round(freq * 1000) / 1000, severity: Math.round(sev), expected_annual_cost: Math.round(freq * sev * 100) / 100, source: "local" };
  };

  const ipd = calc("ipd");
  const tf = TIER_F[inp.ipd_tier] || 1;
  const ipd_loaded = Math.round(ipd.expected_annual_cost * (1 + LOAD.ipd) * tf * 100) / 100;
  const ded_credit = Math.round(((TIERS[inp.ipd_tier]?.dedN || 0) * 0.10) * 100) / 100;
  const ipd_prem = Math.max(Math.round((ipd_loaded - ded_credit) * 100) / 100, 50);

  let total = ipd_prem;
  const riders = {};
  for (const [cov, inc] of [["opd", inp.include_opd], ["dental", inp.include_dental], ["maternity", inp.include_maternity]]) {
    if (!inc) continue;
    const r = calc(cov);
    const rp = Math.round(r.expected_annual_cost * (1 + LOAD[cov]) * 100) / 100;
    riders[cov] = { ...r, name: cov.toUpperCase() + " Rider", annual_premium: rp, monthly_premium: Math.round(rp / 12 * 100) / 100 };
    total += rp;
  }

  const ff = 1 + (inp.family_size - 1) * 0.65;
  total = Math.round(total * ff * 100) / 100;

  return {
    quote_id: `LOCAL-${Date.now()}`, model_version: "local", ipd_tier: inp.ipd_tier,
    tier_benefits: TIERS[inp.ipd_tier],
    ipd_core: { ...ipd, annual_premium: ipd_prem, monthly_premium: Math.round(ipd_prem / 12 * 100) / 100, tier_factor: tf, deductible_credit: ded_credit, loading_pct: LOAD.ipd, source: "local" },
    riders, family_size: inp.family_size, family_factor: Math.round(ff * 100) / 100,
    total_annual_premium: total, total_monthly_premium: Math.round(total / 12 * 100) / 100,
    risk_profile: { age: inp.age, gender: inp.gender, smoking: inp.smoking_status, exercise: inp.exercise_frequency, occupation: inp.occupation_type, preexist_conditions: inp.preexist_conditions },
  };
}

// ─── Small components ───────────────────────────────────────────────────────
function Logo({ size = 34 }) {
  if (LOGO_URL) return <img src={LOGO_URL} alt="DAC" style={{ width: size, height: size, borderRadius: size * 0.22, objectFit: "contain" }} />;
  return <div style={{ width: size, height: size, borderRadius: size * 0.22, background: "#1a1a2e", display: "flex", alignItems: "center", justifyContent: "center", color: "#f5c563", fontWeight: 600, fontSize: size * 0.35 }}>DAC</div>;
}

function Chev() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>;
}

function Ck({ s = 10 }) {
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>;
}

function Spinner() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: "spin 1s linear infinite" }}><path d="M21 12a9 9 0 11-6.219-8.56" /></svg>;
}

// ─── Styles ─────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600&family=Instrument+Serif:ital@0;1&display=swap');
:root{--navy:#1a1a2e;--navy-l:#2d2d44;--gold:#f5c563;--gold-d:#b07a0a;--gold-bg:#fef9ec;--gold-bd:#fde68a;--bg:#f7f8fa;--surf:#fff;--surf2:#f1f3f5;--surf3:#e2e5ea;--txt:#111827;--txt2:#4b5563;--txt3:#9ca3af;--ok:#059669;--danger:#ef4444;--fd:'Instrument Serif',serif;--fb:'DM Sans',sans-serif;--r:12px}
*{margin:0;padding:0;box-sizing:border-box}
body{background:var(--bg);color:var(--txt);font-family:var(--fb);-webkit-font-smoothing:antialiased}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.app{min-height:100vh;display:flex;flex-direction:column}
.nav{background:var(--navy);padding:0 24px;height:52px;display:flex;align-items:center;justify-content:space-between}
.nav-brand{display:flex;align-items:center;gap:10px;cursor:pointer}
.nav-title{font-family:var(--fd);font-size:16px;color:white;font-style:italic}
.nav-right{display:flex;align-items:center;gap:10px}
.ctry-sel{display:flex;gap:2px;padding:2px;background:rgba(255,255,255,.08);border-radius:6px}
.ctry-btn{padding:4px 10px;border-radius:4px;border:none;cursor:pointer;font-size:11px;font-family:var(--fb);transition:all .15s;color:rgba(255,255,255,.5);background:transparent}
.ctry-btn.sel{background:rgba(255,255,255,.12);color:var(--gold);font-weight:600}
.status{display:flex;align-items:center;gap:4px;font-size:10px;color:rgba(255,255,255,.4)}
.dot{width:6px;height:6px;border-radius:50%}.dot.ok{background:var(--ok)}.dot.off{background:var(--danger)}
.wizard{max-width:640px;width:100%;margin:0 auto;padding:28px 20px 40px;flex:1}
.steps{display:flex;align-items:center;margin-bottom:28px}
.step-item{display:flex;align-items:center;gap:6px;cursor:pointer}
.step-dot{width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;transition:all .25s}
.step-dot.done{background:var(--navy);color:white}.step-dot.active{background:var(--gold);color:var(--navy)}.step-dot.pending{background:var(--surf2);color:var(--txt3);border:1.5px solid var(--surf3)}
.step-label{font-size:12px;font-weight:500}.step-label.done{color:var(--navy)}.step-label.active{color:var(--gold-d)}.step-label.pending{color:var(--txt3)}
.step-line{flex:1;height:2px;margin:0 8px;border-radius:1px}.step-line.done{background:var(--navy)}.step-line.pending{background:var(--surf3)}
.step-content{animation:fadeIn .3s ease both}
.step-title{font-size:22px;font-weight:500;margin-bottom:4px}
.step-sub{font-size:13px;color:var(--txt2);margin-bottom:22px}
.card{background:var(--surf);border-radius:var(--r);border:1px solid var(--surf3);padding:20px;margin-bottom:14px}
.card-label{font-size:11px;font-weight:600;color:var(--txt3);letter-spacing:.5px;text-transform:uppercase;margin-bottom:10px}
.fg{margin-bottom:14px}.fl{display:block;font-size:11px;font-weight:600;color:var(--txt2);margin-bottom:4px;letter-spacing:.3px}
.fi,.fs{width:100%;padding:9px 11px;border-radius:8px;border:1.5px solid var(--surf3);font-size:13px;font-family:var(--fb);color:var(--txt);background:white;outline:none;appearance:none;transition:border .15s}
.fi:focus,.fs:focus{border-color:var(--navy)}
.sw{position:relative}.sw svg{position:absolute;right:10px;top:50%;transform:translateY(-50%);pointer-events:none;color:var(--txt3)}
.row2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.row3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}
.chips{display:flex;flex-wrap:wrap;gap:4px}
.chip{padding:5px 11px;border-radius:7px;font-size:11px;font-weight:500;border:1.5px solid var(--surf3);cursor:pointer;transition:all .12s;background:white;color:var(--txt2);font-family:var(--fb)}
.chip:hover{border-color:var(--navy-l)}.chip.sel{border-color:var(--navy);background:var(--navy);color:white}.chip.warn{border-color:#fca5a5;background:#fef2f2;color:#dc2626}
.tier-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.tier-card{padding:14px 8px;border-radius:10px;border:1.5px solid var(--surf3);cursor:pointer;transition:all .2s;background:white;text-align:center;position:relative}
.tier-card:hover{border-color:var(--navy-l)}.tier-card.sel{border-color:var(--gold);background:var(--gold-bg)}
.tier-card .rec{position:absolute;top:-8px;left:50%;transform:translateX(-50%);padding:2px 8px;border-radius:4px;font-size:9px;font-weight:600;background:var(--gold);color:var(--navy);white-space:nowrap}
.tier-name{font-size:14px;font-weight:600}.tier-detail{font-size:10px;color:var(--txt3);margin-top:2px}
.tier-card.sel .tier-name{color:var(--gold-d)}.tier-card.sel .tier-detail{color:var(--gold-d)}
.rider-row{display:flex;align-items:center;padding:14px;border-radius:10px;border:1.5px solid var(--surf3);cursor:pointer;transition:all .15s;background:white;margin-bottom:6px;gap:12px}
.rider-row:hover{border-color:var(--navy-l)}.rider-row.on{border-color:var(--gold);background:var(--gold-bg)}
.rider-icon{width:38px;height:38px;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.rider-check{width:18px;height:18px;border-radius:5px;border:2px solid var(--surf3);display:flex;align-items:center;justify-content:center;transition:all .15s;flex-shrink:0}
.rider-row.on .rider-check{border-color:var(--gold-d);background:var(--gold);color:var(--navy)}
.rider-info{flex:1}.rider-name{font-size:13px;font-weight:600}.rider-desc{font-size:11px;color:var(--txt3)}
.rider-price{text-align:right;font-size:12px;font-weight:600}.rider-price span{display:block;font-size:10px;font-weight:400;color:var(--txt3)}
.btn-row{display:flex;gap:8px;margin-top:20px}
.btn{flex:1;padding:13px;border-radius:8px;font-size:14px;font-weight:600;border:none;cursor:pointer;font-family:var(--fb);transition:all .15s;display:flex;align-items:center;justify-content:center;gap:6px}
.btn-back{background:var(--surf2);color:var(--txt2);border:1px solid var(--surf3)}.btn-back:hover{background:var(--surf3)}
.btn-next{background:var(--navy);color:white}.btn-next:hover{background:var(--navy-l)}
.btn-gold{background:var(--gold);color:var(--navy)}.btn-gold:hover{background:#eab735}
.btn:disabled{opacity:.5;cursor:not-allowed}
.res-hero{background:var(--navy);border-radius:14px;padding:28px;color:white;text-align:center;margin-bottom:20px;position:relative;overflow:hidden}
.res-hero::before{content:'';position:absolute;top:-30px;right:-20px;width:120px;height:120px;border-radius:50%;background:rgba(245,197,99,.08)}
.res-label{font-size:11px;opacity:.6;letter-spacing:.8px;text-transform:uppercase}
.res-amount{font-family:var(--fd);font-size:44px;font-weight:400;font-style:italic;color:var(--gold);margin:6px 0}
.res-monthly{font-size:13px;opacity:.5}
.res-tier{display:inline-flex;margin-top:8px;padding:3px 10px;border-radius:5px;background:rgba(245,197,99,.12);color:var(--gold);font-size:11px;font-weight:600}
.bk-section{margin-bottom:14px}
.bk-head{font-size:11px;font-weight:600;color:var(--txt3);letter-spacing:.5px;text-transform:uppercase;margin-bottom:6px;display:flex;align-items:center;gap:6px}
.bk-badge{padding:2px 7px;border-radius:4px;font-size:10px;font-weight:600}
.bk-badge.core{background:var(--navy);color:white}.bk-badge.rider{background:var(--gold-bg);color:var(--gold-d)}
.bk-row{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--surf2);font-size:12px}
.bk-row:last-child{border-bottom:none}
.bk-l{color:var(--txt2)}.bk-v{font-weight:600}.bk-v.hi{color:var(--navy)}.bk-v.gold{color:var(--gold-d)}
.qid{margin-top:12px;padding-top:12px;border-top:1px solid var(--surf3);display:flex;justify-content:space-between;font-size:10px}
.qid span:first-child{color:var(--txt3);text-transform:uppercase;letter-spacing:.5px;font-weight:600}
.qid code{color:var(--txt2);background:var(--surf2);padding:2px 6px;border-radius:4px;font-size:10px}
.ai-bar{background:var(--surf);border-radius:var(--r);border:1px solid var(--gold-bd);padding:12px 14px;margin-top:14px;display:flex;align-items:flex-start;gap:10px}
.ai-dot{width:22px;height:22px;border-radius:50%;background:var(--navy);color:var(--gold);display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;flex-shrink:0;margin-top:1px}
.ai-text{font-size:12px;color:var(--txt2);line-height:1.55;flex:1}
.ai-fab{position:fixed;bottom:20px;right:20px;width:48px;height:48px;border-radius:50%;background:var(--navy);color:var(--gold);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:100;transition:all .2s}
.ai-fab:hover{transform:scale(1.08)}
.ai-panel{position:fixed;bottom:78px;right:20px;width:360px;max-height:480px;background:var(--surf);border-radius:14px;border:1px solid var(--surf3);box-shadow:0 12px 40px rgba(0,0,0,.12);z-index:100;display:flex;flex-direction:column;animation:fadeIn .2s ease both;overflow:hidden}
.ai-head{padding:12px 14px;border-bottom:1px solid var(--surf3);display:flex;align-items:center;justify-content:space-between}
.ai-msgs{flex:1;overflow-y:auto;padding:10px 14px;display:flex;flex-direction:column;gap:8px;min-height:180px;max-height:320px}
.ai-msg{max-width:86%;padding:9px 12px;border-radius:10px;font-size:12px;line-height:1.5;word-wrap:break-word}
.ai-msg.bot{align-self:flex-start;background:var(--surf2);border-bottom-left-radius:3px}
.ai-msg.user{align-self:flex-end;background:var(--navy);color:white;border-bottom-right-radius:3px}
.ai-msg.typing{align-self:flex-start;background:var(--surf2);color:var(--txt3);font-style:italic}
.ai-qchips{display:flex;flex-wrap:wrap;gap:3px;margin-top:4px}
.ai-qchip{padding:3px 8px;border-radius:5px;font-size:10px;border:1px solid var(--surf3);cursor:pointer;background:white;color:var(--txt2);font-family:var(--fb)}
.ai-qchip:hover{border-color:var(--gold);color:var(--gold-d)}
.ai-input-row{padding:8px 10px;border-top:1px solid var(--surf3);display:flex;gap:6px}
.ai-input{flex:1;padding:7px 10px;border-radius:7px;border:1.5px solid var(--surf3);font-size:12px;font-family:var(--fb);outline:none}
.ai-input:focus{border-color:var(--navy)}
.ai-send{padding:7px 12px;border-radius:7px;background:var(--navy);color:var(--gold);border:none;cursor:pointer;font-size:11px;font-weight:600}
.ai-send:disabled{opacity:.4}
.footer{padding:20px;text-align:center;font-size:11px;color:var(--txt3);border-top:1px solid var(--surf3)}
.footer-tags{display:flex;gap:4px;justify-content:center;margin-top:4px}
.footer-tag{padding:2px 7px;border-radius:4px;font-size:10px;background:var(--surf2);color:var(--txt3)}
@media(max-width:640px){.row2,.row3{grid-template-columns:1fr}.tier-grid{grid-template-columns:1fr 1fr}.wizard{padding:20px 14px}}
`;

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [step, setStep] = useState(0);
  const [country, setCountry] = useState("cambodia");
  const [apiOk, setApiOk] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [isLocal, setIsLocal] = useState(false);
  const [aiTip, setAiTip] = useState("");

  const regions = COUNTRIES[country].regions;
  const [inp, setInp] = useState({
    age: 35, gender: "Male", country: "cambodia", region: "Phnom Penh",
    smoking_status: "Never", exercise_frequency: "Light", occupation_type: "Office/Desk",
    preexist_conditions: ["None"], ipd_tier: "Silver", family_size: 1,
    include_opd: false, include_dental: false, include_maternity: false,
  });

  useEffect(() => {
    apiCall("/health").then(() => setApiOk(true)).catch(() => setApiOk(false));
  }, []);

  useEffect(() => {
    setInp(p => ({ ...p, country, region: COUNTRIES[country].regions[0] }));
    setResult(null);
  }, [country]);

  const u = (k, v) => setInp(p => ({ ...p, [k]: v }));

  const togglePE = (cond) => setInp(p => {
    const cur = p.preexist_conditions;
    if (cond === "None") return { ...p, preexist_conditions: ["None"] };
    const without = cur.filter(x => x !== "None" && x !== cond);
    if (cur.includes(cond)) return { ...p, preexist_conditions: without.length ? without : ["None"] };
    return { ...p, preexist_conditions: [...without, cond] };
  });

  const calculate = useCallback(async () => {
    setLoading(true); setResult(null); setIsLocal(false);
    try {
      setResult(await apiCall("/api/v2/price", inp));
    } catch {
      setResult(localPrice(inp)); setIsLocal(true);
    } finally {
      setLoading(false); setStep(3);
    }
  }, [inp]);

  const peCount = inp.preexist_conditions.filter(p => p !== "None").length;

  const estRider = (cov) => {
    const af = 1 + Math.max(0, (inp.age - 35)) * 0.008;
    const sf = { Never: 1, Former: 1.15, Current: 1.40 }[inp.smoking_status] || 1;
    const freq = FB_FREQ[cov] * af * sf * (1 + peCount * 0.20);
    const sev = FB_SEV[cov] * (1 + Math.max(0, (inp.age - 30)) * 0.006);
    return Math.round(freq * sev * (1 + LOAD[cov]));
  };

  // AI tip on plan step
  useEffect(() => {
    if (step !== 2) { setAiTip(""); return; }
    if (peCount >= 2 && inp.ipd_tier === "Bronze") {
      setAiTip(`With ${peCount} pre-existing conditions, <strong>Gold tier</strong> is recommended — $40K surgery limit vs Bronze's $5K.`);
    } else if (inp.smoking_status === "Current") {
      setAiTip("Smokers have ~40% higher claim frequency. <strong>Gold or Platinum</strong> provides better coverage headroom.");
    } else if (inp.age > 55) {
      setAiTip(`At age ${inp.age}, claims are above average. <strong>Gold tier</strong> balances coverage and cost.`);
    } else if (peCount === 0 && inp.age < 40) {
      setAiTip("<strong>Silver tier</strong> is solid for your low-risk profile. Bronze saves more but has a $500 deductible.");
    } else {
      setAiTip("");
    }
  }, [step, inp.ipd_tier, inp.smoking_status, inp.age, peCount]);

  // Rider config for rendering
  const RIDER_CFG = [
    { key: "include_opd", name: "OPD visits", desc: "Consultations, lab tests, procedures", icon: "#3b82f6", bg: "#eff6ff", cov: "opd" },
    { key: "include_dental", name: "Dental", desc: "Cleanings, fillings, extractions", icon: "#0d9488", bg: "#e1f5ee", cov: "dental" },
    { key: "include_maternity", name: "Maternity", desc: "Prenatal, delivery, newborn (10-mo wait)", icon: "#be185d", bg: "#fce7f3", cov: "maternity" },
  ];

  return (
    <>
      <style>{CSS}</style>
      <div className="app">
        {/* NAV */}
        <nav className="nav">
          <div className="nav-brand" onClick={() => { setStep(0); setResult(null); }}>
            <Logo size={70} />
            <span className="nav-title">DAC HealthPrice</span>
          </div>
          <div className="nav-right">
            <div className="ctry-sel">
              {Object.entries(COUNTRIES).map(([k, v]) => (
                <button key={k} className={`ctry-btn ${country === k ? "sel" : ""}`} onClick={() => setCountry(k)}>
                  {v.flag} {v.name}
                </button>
              ))}
            </div>
            <div className="status">
              <div className={`dot ${apiOk ? "ok" : "off"}`} />
              {apiOk ? "Connected" : "Offline"}
            </div>
          </div>
        </nav>

        <div className="wizard">
          {/* PROGRESS BAR */}
          <div className="steps">
            {STEPS.map((s, i) => (
              <React.Fragment key={i}>
                <div className="step-item" onClick={() => { if (i <= step || (i === 3 && result)) setStep(i); }}>
                  <div className={`step-dot ${i < step || (i === 3 && result) ? "done" : i === step ? "active" : "pending"}`}>
                    {i < step ? <Ck s={12} /> : i + 1}
                  </div>
                  <span className={`step-label ${i < step ? "done" : i === step ? "active" : "pending"}`}>{s}</span>
                </div>
                {i < 3 && <div className={`step-line ${i < step ? "done" : "pending"}`} />}
              </React.Fragment>
            ))}
          </div>

          {/* STEP 1: PROFILE */}
          {step === 0 && (
            <div className="step-content">
              <div className="step-title">Tell us about yourself</div>
              <div className="step-sub">Basic demographics for your insurance quote</div>
              <div className="card">
                <div className="row3">
                  <div className="fg">
                    <label className="fl">Age</label>
                    <input className="fi" type="number" min="0" max="100" value={inp.age} onChange={e => u("age", Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))} />
                  </div>
                  <div className="fg">
                    <label className="fl">Gender</label>
                    <div className="sw">
                      <select className="fs" value={inp.gender} onChange={e => u("gender", e.target.value)}>{GENDERS.map(g => <option key={g}>{g}</option>)}</select>
                      <Chev />
                    </div>
                  </div>
                  <div className="fg">
                    <label className="fl">Region</label>
                    <div className="sw">
                      <select className="fs" value={inp.region} onChange={e => u("region", e.target.value)}>{regions.map(r => <option key={r}>{r}</option>)}</select>
                      <Chev />
                    </div>
                  </div>
                </div>
                <div className="fg">
                  <label className="fl">Family size</label>
                  <input className="fi" type="number" min="1" max="10" value={inp.family_size} onChange={e => u("family_size", Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))} style={{ maxWidth: 120 }} />
                </div>
              </div>
              <div className="btn-row">
                <button className="btn btn-next" onClick={() => setStep(1)}>Continue</button>
              </div>
            </div>
          )}

          {/* STEP 2: HEALTH */}
          {step === 1 && (
            <div className="step-content">
              <div className="step-title">Your health profile</div>
              <div className="step-sub">Lifestyle factors that affect your premium</div>
              <div className="card">
                <div className="row3">
                  <div className="fg">
                    <label className="fl">Smoking</label>
                    <div className="sw">
                      <select className="fs" value={inp.smoking_status} onChange={e => u("smoking_status", e.target.value)}>{SMOKING.map(s => <option key={s}>{s}</option>)}</select>
                      <Chev />
                    </div>
                  </div>
                  <div className="fg">
                    <label className="fl">Exercise</label>
                    <div className="sw">
                      <select className="fs" value={inp.exercise_frequency} onChange={e => u("exercise_frequency", e.target.value)}>{EXERCISE.map(s => <option key={s}>{s}</option>)}</select>
                      <Chev />
                    </div>
                  </div>
                  <div className="fg">
                    <label className="fl">Occupation</label>
                    <div className="sw">
                      <select className="fs" value={inp.occupation_type} onChange={e => u("occupation_type", e.target.value)}>{OCCUPATIONS.map(s => <option key={s}>{s}</option>)}</select>
                      <Chev />
                    </div>
                  </div>
                </div>
                <div className="fg">
                  <label className="fl">Pre-existing conditions {peCount > 0 && <span style={{ color: "var(--danger)", fontWeight: 400 }}>({peCount})</span>}</label>
                  <div className="chips">
                    {PREEXIST.map(p => (
                      <div key={p} className={`chip ${inp.preexist_conditions.includes(p) ? (p === "None" ? "sel" : "warn") : ""}`} onClick={() => togglePE(p)}>{p}</div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="btn-row">
                <button className="btn btn-back" onClick={() => setStep(0)}>Back</button>
                <button className="btn btn-next" onClick={() => setStep(2)}>Continue</button>
              </div>
            </div>
          )}

          {/* STEP 3: PLAN */}
          {step === 2 && (
            <div className="step-content">
              <div className="step-title">Choose your plan</div>
              <div className="step-sub">Select an IPD tier and optional riders</div>

              <div className="card">
                <div className="card-label">IPD hospital reimbursement</div>
                <div className="tier-grid">
                  {Object.entries(TIERS).map(([k, v]) => (
                    <div key={k} className={`tier-card ${inp.ipd_tier === k ? "sel" : ""}`} onClick={() => u("ipd_tier", k)}>
                      {k === "Gold" && peCount >= 2 && <div className="rec">Recommended</div>}
                      <div className="tier-name">{k}</div>
                      <div className="tier-detail">{v.limit} limit</div>
                      <div className="tier-detail">{v.room}</div>
                      <div className="tier-detail">Ded: {v.ded}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card">
                <div className="card-label">Optional riders</div>
                {RIDER_CFG.map(r => {
                  const est = estRider(r.cov);
                  return (
                    <div key={r.key} className={`rider-row ${inp[r.key] ? "on" : ""}`} onClick={() => u(r.key, !inp[r.key])}>
                      <div className="rider-icon" style={{ background: r.bg }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={r.icon} strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                      </div>
                      <div className="rider-info">
                        <div className="rider-name">{r.name}</div>
                        <div className="rider-desc">{r.desc}</div>
                      </div>
                      <div className="rider-price">+${Math.round(est / 12)}/mo<span>${est}/yr</span></div>
                      <div className="rider-check">{inp[r.key] && <Ck />}</div>
                    </div>
                  );
                })}
              </div>

              {aiTip && (
                <div className="ai-bar">
                  <div className="ai-dot">AI</div>
                  <div className="ai-text" dangerouslySetInnerHTML={{ __html: aiTip }} />
                </div>
              )}

              <div className="btn-row">
                <button className="btn btn-back" onClick={() => setStep(1)}>Back</button>
                <button className="btn btn-gold" onClick={calculate} disabled={loading}>
                  {loading ? <><Spinner /> Calculating...</> : "Get my quote"}
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: QUOTE */}
          {step === 3 && result && (
            <div className="step-content">
              <div className="res-hero">
                <div className="res-label">Your annual premium — {COUNTRIES[country].name}</div>
                <div className="res-amount">${result.total_annual_premium?.toLocaleString()}</div>
                <div className="res-monthly">${result.total_monthly_premium}/month · Family of {result.family_size}</div>
                <div className="res-tier">
                  {result.ipd_tier} tier{Object.keys(result.riders || {}).length > 0 && ` + ${Object.keys(result.riders).join(", ")}`}
                </div>
              </div>

              <div className="card">
                {/* IPD Core */}
                <div className="bk-section">
                  <div className="bk-head"><span className="bk-badge core">IPD</span> Hospital reimbursement</div>
                  <div className="bk-row"><span className="bk-l">Frequency</span><span className="bk-v">{result.ipd_core?.frequency}/yr</span></div>
                  <div className="bk-row"><span className="bk-l">Severity</span><span className="bk-v">${result.ipd_core?.severity?.toLocaleString()}</span></div>
                  <div className="bk-row"><span className="bk-l">Expected cost</span><span className="bk-v">${result.ipd_core?.expected_annual_cost?.toLocaleString()}</span></div>
                  <div className="bk-row"><span className="bk-l">Tier factor ({result.ipd_tier})</span><span className="bk-v hi">{result.ipd_core?.tier_factor}x</span></div>
                  {result.ipd_core?.deductible_credit > 0 && <div className="bk-row"><span className="bk-l">Deductible credit</span><span className="bk-v" style={{ color: "var(--ok)" }}>-${result.ipd_core.deductible_credit}</span></div>}
                  <div className="bk-row" style={{ fontWeight: 600 }}><span className="bk-l" style={{ fontWeight: 600 }}>IPD premium</span><span className="bk-v hi">${result.ipd_core?.annual_premium?.toLocaleString()}/yr</span></div>
                </div>

                {/* Riders */}
                {Object.entries(result.riders || {}).map(([k, v]) => (
                  <div className="bk-section" key={k} style={{ paddingTop: 12, borderTop: "1px solid var(--surf3)" }}>
                    <div className="bk-head"><span className="bk-badge rider">{k.toUpperCase()}</span> {v.name}</div>
                    <div className="bk-row"><span className="bk-l">Freq / Sev</span><span className="bk-v">{v.frequency}/yr · ${v.severity?.toLocaleString()}</span></div>
                    <div className="bk-row" style={{ fontWeight: 600 }}><span className="bk-l" style={{ fontWeight: 600 }}>Rider premium</span><span className="bk-v gold">${v.annual_premium?.toLocaleString()}/yr</span></div>
                  </div>
                ))}

                {/* Family */}
                {result.family_size > 1 && (
                  <div className="bk-row" style={{ paddingTop: 12, borderTop: "1px solid var(--surf3)" }}>
                    <span className="bk-l">Family ({result.family_size})</span><span className="bk-v">{result.family_factor}x</span>
                  </div>
                )}

                {/* Benefits */}
                <div className="bk-section" style={{ paddingTop: 12, borderTop: "1px solid var(--surf3)" }}>
                  <div className="bk-head">{result.ipd_tier} benefits</div>
                  <div className="bk-row"><span className="bk-l">Limit</span><span className="bk-v">{TIERS[result.ipd_tier]?.limit}</span></div>
                  <div className="bk-row"><span className="bk-l">Room</span><span className="bk-v">{TIERS[result.ipd_tier]?.room}</span></div>
                  <div className="bk-row"><span className="bk-l">Surgery</span><span className="bk-v">{TIERS[result.ipd_tier]?.surg}</span></div>
                  <div className="bk-row"><span className="bk-l">ICU</span><span className="bk-v">{TIERS[result.ipd_tier]?.icu}</span></div>
                </div>

                <div className="qid"><span>Quote ID</span><code>{result.quote_id}</code></div>
                {isLocal && <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 8, background: "#fffbeb", border: "1px solid #fef3c7", color: "#92400e", fontSize: 11 }}>Local calculation — backend unavailable</div>}
              </div>

              <div className="btn-row">
                <button className="btn btn-back" onClick={() => setStep(2)}>Modify plan</button>
                <button className="btn btn-next" onClick={() => { setStep(0); setResult(null); }}>New quote</button>
              </div>
            </div>
          )}
        </div>

        {/* AI CHAT */}
        <AIChat inp={inp} result={result} country={country} />

        <footer className="footer">
          DAC HealthPrice · {COUNTRIES[country].name}
          <div className="footer-tags">
            <span className="footer-tag">Freq-Sev</span>
            <span className="footer-tag">FastAPI</span>
            <span className="footer-tag">Supabase</span>
            <span className="footer-tag">v2.1</span>
          </div>
        </footer>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// AI CHAT COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
function AIChat({ inp, result, country }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([
    { role: "bot", text: "Hi! I'm your AI advisor. I can recommend plans, explain pricing, or suggest optimizations." }
  ]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);

  const scroll = () => setTimeout(() => {
    const el = document.getElementById("ai-m");
    if (el) el.scrollTop = el.scrollHeight;
  }, 50);

  const ctx = () => {
    const profile = `Profile: age=${inp.age}, gender=${inp.gender}, country=${country}, region=${inp.region}, smoking=${inp.smoking_status}, exercise=${inp.exercise_frequency}, occupation=${inp.occupation_type}, conditions=${inp.preexist_conditions.join(",")}, family=${inp.family_size}.`;
    const plan = `Plan: tier=${inp.ipd_tier}, opd=${inp.include_opd}, dental=${inp.include_dental}, maternity=${inp.include_maternity}.`;
    const quote = result
      ? `Quote: $${result.total_annual_premium}/yr, IPD freq=${result.ipd_core?.frequency}, sev=$${result.ipd_core?.severity}, prem=$${result.ipd_core?.annual_premium}. Riders: ${Object.entries(result.riders || {}).map(([k, v]) => `${k}=$${v.annual_premium}`).join(",") || "none"}.`
      : "No quote yet.";
    return `${profile} ${plan} ${quote}`;
  };

  const send = async (text) => {
    if (!text.trim()) return;
    setMsgs(p => [...p, { role: "user", text: text.trim() }]);
    setInput("");
    setThinking(true);
    scroll();

    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": import.meta.env.VITE_ANTHROPIC_KEY,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 800,
          system: `You are an insurance advisor for DAC HealthPrice. 3 roles: (1) recommend tier/riders (2) explain premium factors (3) suggest optimizations. 2-3 sentences max. Use **bold** for amounts. Context:\n${ctx()}`,
          messages: msgs
            .filter((_, i) => i > 0)
            .slice(-6)
            .map(m => ({ role: m.role === "bot" ? "assistant" : "user", content: m.text }))
            .concat([{ role: "user", content: text.trim() }]),
        }),
      });

      const d = await r.json();
      const reply = (d.content?.[0]?.text || "Sorry, try again.").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
      setMsgs(p => [...p, { role: "bot", text: reply }]);
    } catch {
      setMsgs(p => [...p, { role: "bot", text: "Connection issue. Try again." }]);
    } finally {
      setThinking(false);
      scroll();
    }
  };

  const qs = result
    ? ["Why this amount?", "Lower premium?", "Add dental?", "Right tier?"]
    : ["Best tier?", "Need OPD?", "Explain tiers", "Pre-existing help"];

  return (
    <>
      <button className="ai-fab" onClick={() => setOpen(!open)}>
        {open
          ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
        }
      </button>

      {open && (
        <div className="ai-panel">
          <div className="ai-head">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--navy)", color: "var(--gold)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700 }}>AI</div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600 }}>Insurance advisor</div>
                <div style={{ fontSize: 10, color: "var(--txt3)" }}>Plan · Risk · Savings</div>
              </div>
            </div>
            <button style={{ background: "none", border: "none", cursor: "pointer", color: "var(--txt3)", fontSize: 16 }} onClick={() => setOpen(false)}>×</button>
          </div>

          <div className="ai-msgs" id="ai-m">
            {msgs.map((m, i) => (
              <div key={i} className={`ai-msg ${m.role === "user" ? "user" : "bot"}`} dangerouslySetInnerHTML={{ __html: m.text }} />
            ))}
            {thinking && <div className="ai-msg typing">Thinking...</div>}
            {!thinking && msgs.length <= 2 && (
              <div className="ai-qchips">
                {qs.map((q, i) => (
                  <div key={i} className="ai-qchip" onClick={() => send(q)}>{q}</div>
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
              onKeyDown={e => { if (e.key === "Enter" && !thinking) send(input); }}
              disabled={thinking}
            />
            <button className="ai-send" onClick={() => send(input)} disabled={thinking || !input.trim()}>Send</button>
          </div>
        </div>
      )}
    </>
  );
}