import { useState, useEffect, useCallback } from "react";

const API      = "https://app-7164feb8.base44.app/functions/boatrace";
const GACHA_API = "https://app-7164feb8.base44.app/functions/gacha";

const VENUE_NAMES = {
  '01':'桐生','02':'戸田','03':'江戸川','04':'平和島','05':'多摩川','06':'浜名湖',
  '07':'蒲郡','08':'常滑','09':'津','10':'三国','11':'びわこ','12':'住之江',
  '13':'尼崎','14':'鳴門','15':'丸亀','16':'児島','17':'宮島','18':'徳山',
  '19':'下関','20':'若松','21':'芦屋','22':'福岡','23':'唐津','24':'大村'
};

const WAKU_COLORS = ['#ffffff','#000000','#e8373a','#0055cc','#ffdd00','#00aa44'];
const WAKU_TEXT   = ['#000','#fff','#fff','#fff','#000','#fff'];

const OMIKUJI = [
  { rank:'大吉', emoji:'🎊', color:'#ffd700', glow:'rgba(255,215,0,0.6)',
    bg:'linear-gradient(135deg,rgba(255,215,0,0.15),rgba(255,140,0,0.1))',
    border:'rgba(255,215,0,0.5)', desc:'今日は絶対に来る！迷わず勝負やで！',
    condition: s => s >= 75 },
  { rank:'中吉', emoji:'✨', color:'#00e5ff', glow:'rgba(0,229,255,0.5)',
    bg:'linear-gradient(135deg,rgba(0,229,255,0.12),rgba(0,100,200,0.1))',
    border:'rgba(0,229,255,0.4)', desc:'狙い目あり！本線を丁寧に押さえてね💋',
    condition: s => s >= 55 },
  { rank:'小吉', emoji:'🌊', color:'#a855f7', glow:'rgba(168,85,247,0.4)',
    bg:'linear-gradient(135deg,rgba(168,85,247,0.1),rgba(100,0,150,0.08))',
    border:'rgba(168,85,247,0.35)', desc:'悪くない。少額で楽しむ感じで行こ〜',
    condition: s => s >= 38 },
  { rank:'凶', emoji:'💀', color:'#ff4444', glow:'rgba(255,68,68,0.4)',
    bg:'linear-gradient(135deg,rgba(255,68,68,0.1),rgba(150,0,0,0.08))',
    border:'rgba(255,68,68,0.35)', desc:'本命は信頼できない…今日は見送りが賢明かも',
    condition: s => s >= 20 },
  { rank:'大凶', emoji:'🌪️', color:'#ff6600', glow:'rgba(255,102,0,0.6)',
    bg:'linear-gradient(135deg,rgba(255,102,0,0.15),rgba(180,0,0,0.12))',
    border:'rgba(255,102,0,0.5)', desc:'激荒れ予報！本命は信じるな。大穴一点狙いで一発逆転やで🔥',
    condition: () => true, isDaikyou: true },
];
const getOmikuji = s => OMIKUJI.find(o => o.condition(s)) || OMIKUJI[4];

// 営業時間チェック（日本時間 10:00〜20:00）
function isOpenHour() {
  const now = new Date();
  // JST = UTC+9
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const h = jst.getUTCHours();
  const m = jst.getUTCMinutes();
  const total = h * 60 + m;
  return total >= 10 * 60 && total < 20 * 60; // 10:00〜20:00
}
function getOpenMessage() {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const h = jst.getUTCHours();
  if (h < 10) return `あと${10 - h}時間で開くよ！`;
  return `今日の営業は終了したよ。明日10時にまた来てね！`;
}

// LINE URLスキームでユーザーIDを取得（LIFF使わない簡易版）
function getLineUserId() {
  const params = new URLSearchParams(window.location.search);
  return params.get('uid') || localStorage.getItem('gacha_uid') || null;
}
function getReferralCode() {
  return new URLSearchParams(window.location.search).get('ref') || null;
}
function getPaymentStatus() {
  return new URLSearchParams(window.location.search).get('payment') || null;
}

function WakuBadge({ num, size=28 }) {
  if (!num || num < 1 || num > 6) return null;
  const i = num - 1;
  return (
    <div style={{
      width:size, height:size, borderRadius:'50%',
      display:'inline-flex', alignItems:'center', justifyContent:'center',
      fontWeight:900, fontSize:size*0.38,
      background:WAKU_COLORS[i], color:WAKU_TEXT[i], flexShrink:0,
      border:'2px solid rgba(255,255,255,0.15)',
      boxShadow:`0 0 10px ${WAKU_COLORS[i]}88`
    }}>{num}</div>
  );
}

function GachaAnimation({ phase }) {
  return (
    <div style={{textAlign:'center', padding:'30px 20px'}}>
      <style>{`
        @keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}
        @keyframes bounce{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-20px) scale(1.2)}}
        @keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-8px) rotate(-5deg)}75%{transform:translateX(8px) rotate(5deg)}}
        @keyframes glow2{0%,100%{opacity:0.6}50%{opacity:1}}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}
      `}</style>
      <div style={{
        width:140, height:140, margin:'0 auto 20px', borderRadius:'50%',
        background:'radial-gradient(circle at 35% 35%,rgba(255,255,255,0.15),rgba(0,50,100,0.8))',
        border:'4px solid rgba(0,200,255,0.5)',
        display:'flex', alignItems:'center', justifyContent:'center',
        animation: phase==='spinning'?'spin 0.4s linear infinite':phase==='shaking'?'shake 0.15s infinite':'float 2s ease-in-out infinite',
        boxShadow:'0 0 40px rgba(0,200,255,0.3),inset 0 0 30px rgba(0,100,200,0.2)',
      }}>
        <div style={{fontSize:'3.5em'}}>🚤</div>
      </div>
      <div style={{display:'flex', justifyContent:'center', gap:8, marginBottom:16}}>
        {[0,1,2,3,4,5].map(i=>(
          <div key={i} style={{
            width:32, height:32, borderRadius:'50%',
            background:WAKU_COLORS[i], color:WAKU_TEXT[i],
            display:'flex', alignItems:'center', justifyContent:'center',
            fontWeight:900, fontSize:'0.85em',
            animation:phase==='spinning'?`bounce 0.3s ease-in-out ${i*0.05}s infinite`:phase==='shaking'?`shake 0.15s ${i*0.02}s infinite`:`float 1.5s ease-in-out ${i*0.2}s infinite`,
            boxShadow:`0 4px 12px ${WAKU_COLORS[i]}66`,
          }}>{i+1}</div>
        ))}
      </div>
      <div style={{color:'#00e5ff', fontWeight:700, fontSize:'0.95em', animation:'glow2 0.8s infinite'}}>
        {phase==='spinning'?'🎲 ガラガラ回転中...':phase==='shaking'?'✨ もう少し...':'🔮 ベタ子が分析中...'}
      </div>
    </div>
  );
}

function OmikujiResult({ data, omikuji, onDetail, onRetry }) {
  const [showDetail, setShowDetail] = useState(false);
  useEffect(()=>{ setTimeout(()=>setShowDetail(true), 800); },[]);

  const wp = data?.winProbabilities || [];
  const honsen = data?.honsen || [];

  return (
    <div style={{textAlign:'center'}}>
      <style>{`
        @keyframes revealBig{0%{transform:scale(0.3) rotate(-10deg);opacity:0}60%{transform:scale(1.15) rotate(2deg)}100%{transform:scale(1) rotate(0);opacity:1}}
        @keyframes fadeUp{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}
        @keyframes shine2{0%{left:-100%}100%{left:200%}}
      `}</style>
      <div style={{animation:'revealBig 0.6s cubic-bezier(0.175,0.885,0.32,1.275) forwards', marginBottom:20}}>
        <div style={{
          background:omikuji.bg, border:`3px solid ${omikuji.border}`,
          borderRadius:20, padding:'20px 16px', position:'relative',
          overflow:'hidden', boxShadow:`0 0 40px ${omikuji.glow},0 8px 32px rgba(0,0,0,0.4)`,
          marginBottom:16,
        }}>
          <div style={{position:'absolute',top:0,left:'-50%',width:'200%',height:'100%',background:'linear-gradient(105deg,transparent 40%,rgba(255,255,255,0.06) 50%,transparent 60%)',pointerEvents:'none'}}/>
          <div style={{borderBottom:`2px dashed ${omikuji.border}`,paddingBottom:14,marginBottom:14}}>
            <div style={{fontSize:'0.65em',color:omikuji.color,letterSpacing:'0.2em',fontWeight:700,marginBottom:6}}>⚓ BOATRACE OMIKUJI ⚓</div>
            <div style={{fontSize:'3.5em',fontWeight:900,color:omikuji.color,letterSpacing:'0.1em',textShadow:`0 0 20px ${omikuji.glow},0 0 40px ${omikuji.glow}`,lineHeight:1}}>
              {omikuji.emoji} {omikuji.rank}
            </div>
          </div>
          <div style={{fontSize:'1.1em',fontWeight:900,color:'#fff',marginBottom:10,letterSpacing:'0.03em'}}>
            🏟️ {data.stadiumName} {data.raceNo}R
          </div>
          <div style={{background:'rgba(0,0,0,0.3)',borderRadius:10,padding:'10px 12px',fontSize:'0.85em',color:'#f0d0e8',lineHeight:1.7,marginBottom:12,border:`1px solid ${omikuji.border}`}}>
            💋 {omikuji.desc}
          </div>
          {showDetail && wp.length > 0 && (
            <div style={{animation:'fadeUp 0.4s ease forwards'}}>
              <div style={{display:'flex',gap:8,marginBottom:12,justifyContent:'center'}}>
                {wp.slice(0,3).map((b,i)=>(
                  <div key={i} style={{flex:1,background:'rgba(0,0,0,0.4)',borderRadius:10,padding:'10px 6px',textAlign:'center',border:`1px solid ${i===0?omikuji.border:'rgba(255,255,255,0.08)'}`}}>
                    <div style={{fontSize:'0.62em',color:i===0?omikuji.color:i===1?'#aaa':'#666',marginBottom:4,fontWeight:700}}>{['👑本命','🎯対抗','🔍抑え'][i]}</div>
                    <WakuBadge num={b.boatNumber} size={30}/>
                    <div style={{fontSize:'0.8em',color:'#00ccff',fontFamily:'monospace',fontWeight:900,marginTop:4}}>{b.winProbability}%</div>
                  </div>
                ))}
              </div>
              {/* 大凶：穴目専用表示 */}
              {omikuji.isDaikyou && data.anaCombos && data.anaCombos.length > 0 && (
                <div style={{background:'rgba(255,80,0,0.08)',borderRadius:10,padding:'10px 12px',textAlign:'left',border:'2px dashed rgba(255,102,0,0.4)',marginBottom:8}}>
                  <div style={{fontSize:'0.65em',color:'#ff6600',fontWeight:700,marginBottom:8,letterSpacing:'0.1em'}}>🌪️ 大穴狙い目 {data.anaCombos.length}点</div>
                  <div style={{fontSize:'0.62em',color:'#aa6633',marginBottom:8,lineHeight:1.6}}>
                    低確率ながら高配当が期待できる組み合わせ。<br/>少額・自己責任で！
                  </div>
                  <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                    {data.anaCombos.map((combo,i)=>(
                      <div key={i} style={{display:'flex',alignItems:'center',gap:3,background:'rgba(255,102,0,0.1)',border:'1px solid rgba(255,102,0,0.3)',borderRadius:8,padding:'5px 8px'}}>
                        <span style={{fontSize:'0.65em',color:'#ff6600',fontWeight:900}}>穴{i+1}</span>
                        {combo.split('-').map(Number).map((b,j)=>(
                          <span key={j} style={{display:'flex',alignItems:'center',gap:2}}>
                            <WakuBadge num={b} size={18}/>
                            {j<2&&<span style={{color:'#553',fontSize:'0.8em'}}>›</span>}
                          </span>
                        ))}
                        <span style={{fontFamily:'monospace',fontSize:'0.62em',color:'#774',marginLeft:2}}>{combo}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 通常：本線表示（大凶以外） */}
              {!omikuji.isDaikyou && honsen.length > 0 && (
                <div style={{background:'rgba(0,0,0,0.3)',borderRadius:10,padding:'10px 12px',textAlign:'left',border:`1px solid ${omikuji.border}`}}>
                  <div style={{fontSize:'0.65em',color:omikuji.color,fontWeight:700,marginBottom:8,letterSpacing:'0.1em'}}>📌 本線 {honsen.length}点</div>
                  <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                    {honsen.slice(0,6).map((combo,i)=>(
                      <div key={i} style={{display:'flex',alignItems:'center',gap:3,background:i===0?`${omikuji.color}18`:'rgba(255,255,255,0.04)',border:`1px solid ${i===0?omikuji.border:'rgba(255,255,255,0.06)'}`,borderRadius:8,padding:'5px 8px'}}>
                        <span style={{fontSize:'0.6em',color:i===0?omikuji.color:'#555',width:14,fontWeight:700}}>{['◎','○','▲','△','✕','✕'][i]}</span>
                        {combo.split('-').map(Number).map((b,j)=>(
                          <span key={j} style={{display:'flex',alignItems:'center',gap:2}}>
                            <WakuBadge num={b} size={18}/>
                            {j<2&&<span style={{color:'#333',fontSize:'0.8em'}}>›</span>}
                          </span>
                        ))}
                        <span style={{fontFamily:'monospace',fontSize:'0.62em',color:'#445',marginLeft:2}}>{combo}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        {showDetail && (
          <div style={{animation:'fadeUp 0.4s 0.3s ease both'}}>
            {/* 紹介シェアボックス */}
            <ShareBox referralCode={data.referralCode} />
            <div style={{fontSize:'0.6em', color:'#334455', lineHeight:1.7, padding:'8px 10px', background:'rgba(255,255,255,0.02)', borderRadius:8, border:'1px solid rgba(255,255,255,0.04)', marginTop:10, textAlign:'left'}}>
              ⚠️ AIによる参考予想です。的中を保証するものではありません。投票は自己責任でお楽しみください。
            </div>
            <div style={{display:'flex',gap:10,marginTop:12}}>
              <button onClick={onRetry} style={{width:'100%',padding:'13px',border:`2px solid ${omikuji.border}`,borderRadius:12,background:'transparent',color:omikuji.color,fontSize:'0.9em',fontWeight:900,cursor:'pointer'}}>
                🚤 もう一回引く
              </button>

            </div>
          </div>
        )}
      </div>
    </div>
  );
}
function ShareBox({ referralCode }) {
  const [copied, setCopied] = useState(false);
  const shareUrl = referralCode
    ? `${window.location.origin}${window.location.pathname}?ref=${referralCode}`
    : `${window.location.origin}${window.location.pathname}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div style={{
      marginTop:12,
      padding:'12px',
      borderRadius:12,
      background:'rgba(0,229,255,0.06)',
      border:'1px solid rgba(0,229,255,0.18)',
      textAlign:'left'
    }}>
      <div style={{fontSize:'0.72em',color:'#00e5ff',fontWeight:900,marginBottom:6}}>
        🎁 友だち紹介でガチャコインGET
      </div>
      <div style={{fontSize:'0.62em',color:'#88aabb',lineHeight:1.6,marginBottom:8}}>
        このリンクから友だちが参加すると、紹介特典がもらえるかも！
      </div>
      <div style={{display:'flex',gap:8}}>
        <input
          value={shareUrl}
          readOnly
          style={{
            flex:1,
            minWidth:0,
            border:'1px solid rgba(255,255,255,0.08)',
            borderRadius:8,
            background:'rgba(0,0,0,0.25)',
            color:'#cfefff',
            padding:'8px',
            fontSize:'0.62em'
          }}
        />
        <button
          onClick={handleCopy}
          style={{
            border:'none',
            borderRadius:8,
            background:copied ? '#00cc88' : '#00aaff',
            color:'#001018',
            fontWeight:900,
            padding:'8px 10px',
            cursor:'pointer',
            fontSize:'0.68em'
          }}
        >
          {copied ? 'コピー済' : 'コピー'}
        </button>
      </div>
    </div>
  );
}

function CoinPanel({ user, onCharge }) {
  return (
    <div style={{
      display:'flex',
      alignItems:'center',
      justifyContent:'space-between',
      gap:10,
      padding:'12px 14px',
      borderRadius:14,
      background:'linear-gradient(135deg,rgba(255,215,0,0.12),rgba(0,229,255,0.06))',
      border:'1px solid rgba(255,215,0,0.22)',
      marginBottom:14
    }}>
      <div>
        <div style={{fontSize:'0.62em',color:'#aabbd0',fontWeight:700,letterSpacing:'0.08em'}}>
          GACHA COIN
        </div>
        <div style={{fontSize:'1.25em',fontWeight:900,color:'#ffd700',textShadow:'0 0 12px rgba(255,215,0,0.35)'}}>
          🪙 {user?.coins ?? 0}
        </div>
      </div>
      <button
        onClick={onCharge}
        style={{
          border:'none',
          borderRadius:999,
          padding:'10px 14px',
          background:'linear-gradient(135deg,#ffd700,#ff9900)',
          color:'#1a1000',
          fontWeight:900,
          cursor:'pointer',
          boxShadow:'0 6px 18px rgba(255,180,0,0.25)'
        }}
      >
        コイン購入
      </button>
    </div>
  );
}

function PaymentCompleteNotice({ status, onClear }) {
  if (!status) return null;
  const ok = status === 'success';
  return (
    <div style={{
      padding:'12px',
      borderRadius:12,
      background:ok ? 'rgba(0,220,140,0.1)' : 'rgba(255,80,80,0.1)',
      border:`1px solid ${ok ? 'rgba(0,220,140,0.35)' : 'rgba(255,80,80,0.35)'}`,
      color:ok ? '#4dffbf' : '#ff9999',
      marginBottom:12,
      fontSize:'0.78em',
      fontWeight:800,
      lineHeight:1.5
    }}>
      {ok ? '✅ コイン購入が完了しました。反映まで少し待ってね。' : '⚠️ コイン購入がキャンセルされました。'}
      <button
        onClick={onClear}
        style={{
          marginLeft:10,
          border:'none',
          borderRadius:8,
          padding:'5px 8px',
          background:'rgba(255,255,255,0.12)',
          color:'#fff',
          cursor:'pointer'
        }}
      >
        閉じる
      </button>
    </div>
  );
}

export default function Gacha() {
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState('idle');
  const [result, setResult] = useState(null);
  const [err, setErr] = useState('');
  const [user, setUser] = useState(null);
  const [omikuji, setOmikuji] = useState(null);
  const [showNoCoin, setShowNoCoin] = useState(false);
  const [open, setOpen] = useState(isOpenHour());
  const [paymentStatus, setPaymentStatus] = useState(getPaymentStatus());
  const [selectedVenue, setSelectedVenue] = useState('');
  const [raceNo, setRaceNo] = useState('');
  const [todaysVenues, setTodaysVenues] = useState([]);

  const uid = getLineUserId();
  const ref = getReferralCode();
  const coins = Number(user?.coins ?? 0);
  const totalDraws = Number(user?.totalDraws ?? user?.drawCount ?? 0);

  const loadUser = useCallback(async () => {
    if (!uid) return;
    try {
      const r = await fetch(`${GACHA_API}?action=user&uid=${encodeURIComponent(uid)}${ref ? `&ref=${encodeURIComponent(ref)}` : ''}`);
      const j = await r.json();
      if (j?.ok) setUser(j.user);
    } catch (e) {
      console.warn('user load failed', e);
    }
  }, [uid, ref]);

  const loadSchedule = useCallback(async () => {
    try {
      const today = new Date();
      const jst = new Date(today.getTime() + 9 * 60 * 60 * 1000);
      const y = jst.getUTCFullYear();
      const m = String(jst.getUTCMonth() + 1).padStart(2, '0');
      const d = String(jst.getUTCDate()).padStart(2, '0');
      const date = `${y}${m}${d}`;

      const r = await fetch(`${API}?action=schedule&date=${date}`);
      const j = await r.json();
      const venues = Array.isArray(j?.venues) ? j.venues : [];
      setTodaysVenues(venues);
      if (!selectedVenue && venues.length > 0) setSelectedVenue(venues[0]?.stadiumId || venues[0]?.jcd || '');
    } catch (e) {
      console.warn('schedule load failed', e);
    }
  }, [selectedVenue]);

  useEffect(() => {
    loadUser();
    loadSchedule();

    const t = setInterval(() => setOpen(isOpenHour()), 60 * 1000);
    return () => clearInterval(t);
  }, [loadUser, loadSchedule]);

  const clearPaymentStatus = () => {
    setPaymentStatus(null);
    const url = new URL(window.location.href);
    url.searchParams.delete('payment');
    window.history.replaceState({}, '', url.toString());
  };

  const chargeCoins = async () => {
    if (!uid) {
      alert('LINEから開いてね。ユーザーIDがありません。');
      return;
    }

    try {
      const r = await fetch(`${GACHA_API}?action=checkout`, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          uid,
          ref,
          returnUrl:window.location.href.split('?')[0]
        })
      });
      const j = await r.json();
      if (j?.ok && j.url) {
        window.location.href = j.url;
      } else {
        alert(j?.message || '購入ページを開けませんでした');
      }
    } catch (e) {
      alert('購入処理に失敗しました');
    }
  };

  const draw = async () => {
    setErr('');
    setResult(null);

    if (!open) {
      setErr(`営業時間外です。${getOpenMessage()}`);
      return;
    }
    if (!uid) {
      setErr('LINEの専用リンクから開いてね。ユーザーIDが見つかりません。');
      return;
    }
    if (!selectedVenue) {
      setErr('開催場を選んでください。');
      return;
    }

    setLoading(true);
    setPhase('spinning');

    try {
      // コイン消費・ガチャ記録
      const g = await fetch(`${GACHA_API}?action=draw`, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ uid, venue:selectedVenue, raceNo: raceNo ? Number(raceNo) : null })
      }).then(r=>r.json());

      if (!g?.ok) {
        throw new Error(g?.message || 'ガチャを引けませんでした');
      }

      setUser(g.user || user);

      setTimeout(()=>setPhase('shaking'), 700);

      // 予想取得
      const params = new URLSearchParams({
        action:'predict',
        stadium:selectedVenue,
      });
      if (raceNo) params.set('race', String(raceNo));

      const p = await fetch(`${API}?${params.toString()}`).then(r=>r.json());

      setTimeout(()=>{
        const data = p?.ok ? p : {
          ok:false,
          stadiumName:VENUE_NAMES[selectedVenue] || selectedVenue,
          raceNo:raceNo || '??',
          winProbabilities:[],
          honsen:[],
          anaCombos:[]
        };

        const score =
          Number(data?.confidence) ||
          Number(data?.score) ||
          Number(data?.winProbabilities?.[0]?.winProbability) ||
          0;

        const omikuji = getOmikuji(score);
        setOmikuji(omikuji);
        setResult({
          ...data,
          referralCode:g?.referralCode || user?.referralCode || ref,
          _omikuji:omikuji
        });
        setPhase('idle');
        setLoading(false);
        loadUser();
      }, 1300);
    } catch (e) {
      setPhase('idle');
      setLoading(false);
      setErr(e.message || 'エラーが発生しました');
      loadUser();
    }
  };

  const handleGacha = () => {
    if (coins <= 0) {
      setShowNoCoin(true);
      return;
    }
    draw();
  };

  const handleBuy = () => {
    window.open('https://note.com/minamobetako_415', '_blank');
    setShowNoCoin(false);
  };

  const handleRetry = () => {
    setPhase('idle');
    setResult(null);
    setOmikuji(null);
    setShowNoCoin(false);
  };

  return (
    <div style={{minHeight:'100vh',background:'linear-gradient(160deg,#030b14 0%,#07070e 60%,#0a0518 100%)',color:'#e0e0f0',fontFamily:"'Noto Sans JP',sans-serif"}}>
      <style>{`
        @keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.05)}}
        @keyframes drift{0%,100%{transform:translateY(0) rotate(-1deg)}50%{transform:translateY(-8px) rotate(1deg)}}
        @keyframes shine3{0%{transform:translateX(-100%) rotate(20deg)}100%{transform:translateX(260%) rotate(20deg)}}
      `}</style>
      <div style={{maxWidth:480,margin:'0 auto',padding:'20px 16px'}}>

        {/* アイドル */}
        {phase === 'idle' && (
          <div style={{textAlign:'center'}}>
            <div style={{marginBottom:20}}>
              <div style={{fontSize:'0.75em',color:'#4488bb',letterSpacing:'0.15em',marginBottom:6}}>⚓ BETAKO OMIKUJI ⚓</div>
              <div style={{fontSize:'1.2em',fontWeight:900,color:'#fff',marginBottom:6}}>
                今日の<span style={{color:'#ffd700'}}>狙いレース</span>を引こう
              </div>
              <div style={{fontSize:'0.78em',color:'#5588aa',lineHeight:1.7}}>
                AIが今日の全レースを分析して<br/>あなたの1本を引き当てるよ！
              </div>
            </div>

            {/* おみくじ球 */}
            <div onClick={handleGacha} style={{
              width:180,height:180,margin:'0 auto 24px',
              background:'radial-gradient(circle at 40% 35%,rgba(255,215,0,0.15),rgba(0,30,80,0.9))',
              borderRadius:'50%',border:'4px solid rgba(255,215,0,0.3)',
              display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:4,
              boxShadow:'0 0 60px rgba(255,215,0,0.15),0 0 30px rgba(0,100,200,0.2)',
              animation:'drift 3s ease-in-out infinite',cursor:'pointer',position:'relative',overflow:'hidden',
            }}>
              <div style={{position:'absolute',top:'-100%',left:'-30%',width:'60%',height:'300%',background:'linear-gradient(105deg,transparent,rgba(255,255,255,0.08),transparent)',animation:'shine3 3s ease-in-out 1s infinite'}}/>
              <div style={{fontSize:'4.5em'}}>🚤</div>
              <div style={{fontSize:'0.65em',color:'#ffd700',fontWeight:700,letterSpacing:'0.1em'}}>タップで引く</div>
            </div>

            {/* コイン案内 */}
            <div style={{background:'rgba(255,215,0,0.07)',border:'1px solid rgba(255,215,0,0.2)',borderRadius:14,padding:'14px 16px',marginBottom:16,textAlign:'left'}}>
              <div style={{fontSize:'0.72em',color:'#ffd700',fontWeight:700,marginBottom:8}}>🪙 コインについて</div>
              <div style={{fontSize:'0.72em',color:'#8888aa',lineHeight:1.9}}>
                ・<span style={{color:'#fff'}}>初回無料</span>：友達追加でコイン1枚プレゼント🎁<br/>
                ・<span style={{color:'#fff'}}>友達紹介</span>：紹介した友達が引くたびコイン1枚<br/>
                ・<span style={{color:'#fff'}}>コイン切れ</span>：noteで本格予想をチェック📝
              </div>
            </div>

            {/* 免責文言 */}
            <div style={{fontSize:'0.65em', color:'#445566', lineHeight:1.8, marginBottom:12, padding:'8px 12px', background:'rgba(255,255,255,0.02)', borderRadius:8, border:'1px solid rgba(255,255,255,0.04)', textAlign:'left'}}>
              ⚠️ 本サービスはAIによる参考予想です。必ずしも的中を保証するものではありません。投票は自己責任でお楽しみください。
            </div>

            {/* 営業時間バッジ */}
            <div style={{
              display:'inline-flex', alignItems:'center', gap:6,
              padding:'6px 16px', borderRadius:20, marginBottom:16,
              background: isOpenHour() ? 'rgba(0,255,100,0.1)' : 'rgba(255,100,0,0.1)',
              border: `1px solid ${isOpenHour() ? 'rgba(0,255,100,0.3)' : 'rgba(255,100,0,0.3)'}`,
            }}>
              <span style={{fontSize:'0.75em'}}>{isOpenHour() ? '🟢' : '🔴'}</span>
              <span style={{fontSize:'0.72em', color: isOpenHour() ? '#00ff88' : '#ff8844', fontWeight:700}}>
                {isOpenHour() ? '営業中 10:00〜20:00' : '営業時間外 (10:00〜20:00)'}
              </span>
            </div>

            {/* おみくじ等級 */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:20}}>
              {OMIKUJI.map(o=>(
                <div key={o.rank} style={{background:`${o.color}0f`,border:`1px solid ${o.color}33`,borderRadius:10,padding:'8px 10px',display:'flex',alignItems:'center',gap:8}}>
                  <span style={{fontSize:'1.2em'}}>{o.emoji}</span>
                  <div>
                    <div style={{fontSize:'0.78em',color:o.color,fontWeight:900}}>{o.rank}</div>
                    <div style={{fontSize:'0.6em',color:'#5588aa',lineHeight:1.4}}>{o.desc.slice(0,16)}…</div>
                  </div>
                </div>
              ))}
            </div>

            <button onClick={handleGacha} style={{
              width:'100%',padding:'18px',border:'none',borderRadius:16,
              background: coins===0 ? 'linear-gradient(135deg,#41c9b4,#00a88f)' : 'linear-gradient(135deg,#cc0055,#990033)',
              color: '#fff',
              fontSize:'1.1em',fontWeight:900,cursor:'pointer',letterSpacing:'0.1em',
              boxShadow: coins===0 ? 'none' : '0 6px 30px rgba(200,0,80,0.5)',
              animation: coins > 0 ? 'pulse 2s ease-in-out infinite' : 'none',
              position:'relative',overflow:'hidden',
            }}>
              <div style={{position:'absolute',top:'-100%',left:'-30%',width:'60%',height:'300%',background:'linear-gradient(105deg,transparent,rgba(255,255,255,0.12),transparent)',animation:'shine3 2s ease-in-out infinite'}}/>
              {coins === 0 ? '📝 noteでベタ子の予想をチェック' : '🚤 おみくじを引く！'}
            </button>

            {coins === 0 && (
              <a href="https://note.com/minamobetako_415" target="_blank" rel="noopener noreferrer" style={{display:'block',width:'100%',padding:'14px',border:'none',borderRadius:12,background:'linear-gradient(135deg,#41c9b4,#00a88f)',color:'#fff',fontSize:'0.9em',fontWeight:900,cursor:'pointer',marginTop:10,boxShadow:'0 4px 20px rgba(0,180,150,0.4)',textDecoration:'none',textAlign:'center',boxSizing:'border-box'}}>
                📝 noteでベタ子の予想を見る
              </a>
            )}

            {totalDraws > 0 && <div style={{fontSize:'0.65em',color:'#334455',marginTop:12}}>累計 {totalDraws}回引いたよ！</div>}
          </div>
        )}

        {/* ガラガラ演出 */}
        {(phase==='loading'||phase==='spinning'||phase==='shaking') && <GachaAnimation phase={phase}/>}

        {/* 営業時間外 */}
        {phase==='result' && result?._closed && (
          <div style={{textAlign:'center', padding:'20px 0'}}>
            <div style={{background:'rgba(0,20,50,0.85)',border:'2px solid rgba(255,165,0,0.35)',borderRadius:20,padding:'32px 20px',marginBottom:20,boxShadow:'0 0 30px rgba(255,165,0,0.1)'}}>
              <div style={{fontSize:'3.5em',marginBottom:14}}>🌙</div>
              <div style={{fontSize:'1.15em',fontWeight:900,color:'#ffaa44',marginBottom:10}}>
                ただいま営業時間外だよ
              </div>
              <div style={{fontSize:'0.82em',color:'#5588aa',lineHeight:2,marginBottom:16}}>
                <span style={{color:'#ffd700',fontWeight:700}}>営業時間：毎日 10:00〜20:00</span><br/>
                {getOpenMessage()}<br/>
                <span style={{fontSize:'0.9em',color:'#336655'}}>※ コインは消費されていません🪙</span>
              </div>
              <div style={{background:'rgba(255,165,0,0.07)',border:'1px solid rgba(255,165,0,0.2)',borderRadius:12,padding:'12px',fontSize:'0.75em',color:'#887766',lineHeight:1.8}}>
                🏁 直前情報が出そろう時間帯に<br/>より精度の高い予想を提供するよ！
              </div>
            </div>
            <button onClick={handleRetry} style={{width:'100%',padding:'14px',border:'2px solid rgba(255,165,0,0.3)',borderRadius:12,background:'transparent',color:'#ffaa44',fontSize:'0.9em',fontWeight:900,cursor:'pointer'}}>
              ← 戻る
            </button>
          </div>
        )}

        {/* データなし */}
        {phase==='result' && result?._noData && (
          <div style={{textAlign:'center',padding:'20px 0'}}>
            <div style={{background:'rgba(0,30,60,0.8)',border:'2px solid rgba(0,150,255,0.3)',borderRadius:20,padding:'28px 20px',marginBottom:20}}>
              <div style={{fontSize:'3em',marginBottom:12}}>⏰</div>
              <div style={{fontSize:'1.1em',fontWeight:900,color:'#00e5ff',marginBottom:10}}>まだ早すぎるよ！</div>
              <div style={{fontSize:'0.82em',color:'#5588aa',lineHeight:1.8,marginBottom:16}}>
                直前情報は<span style={{color:'#ffd700',fontWeight:700}}>レース2〜3時間前</span>から出てくるよ。<br/>
                10時以降にまた引いてみて💋<br/>
                <span style={{fontSize:'0.9em',color:'#336655'}}>※ コインは消費されていません</span>
              </div>
            </div>
            <button onClick={handleRetry} style={{width:'100%',padding:'14px',border:'2px solid rgba(0,150,255,0.4)',borderRadius:12,background:'transparent',color:'#00e5ff',fontSize:'0.9em',fontWeight:900,cursor:'pointer'}}>
              🚤 戻る
            </button>
          </div>
        )}

        {/* 結果表示 */}
        {phase==='result' && result && omikuji && !result._noData && (
          <OmikujiResult data={result} omikuji={omikuji} onDetail={(jcd,rno)=>window.location.href=`/Predict?jcd=${jcd}&rno=${rno}`} onRetry={handleRetry}/>
        )}
      </div>
    </div>
  );
}
