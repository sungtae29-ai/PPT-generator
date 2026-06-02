// ═══════════════════════════════════════════════════════════════
// Joint Report — 360° Inspection Capture App
// ═══════════════════════════════════════════════════════════════

const { useState, useEffect, useRef, useMemo, useCallback } = React;

// ─── Google API 설정 ──────────────────────────────────────────
const GOOGLE_CLIENT_ID   = window.GOOGLE_CLIENT_ID   || 'YOUR_CLIENT_ID.apps.googleusercontent.com';
const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const DRIVE_UPLOAD_URL   = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
const DRIVE_FOLDER_URL   = 'https://www.googleapis.com/drive/v3/files';

// ─── 디자인 토큰 (Skylearn) ───────────────────────────────────
const C = {
  // Surfaces
  bg:'#FFFFFF', surface:'#F8FAFC', surfaceHi:'#F1F5F9', surfaceEl:'#FFFFFF',
  // Borders
  border:'#E2E8F0', borderHi:'#94A3B8',
  // Text
  text:'#0F172A', dim:'#475569', dimmer:'#94A3B8', faint:'#CBD5E1',
  // Brand — Sky
  accent:'#3B82F6', accentDim:'#1D4ED8', accentBright:'#60A5FA', accentSoft:'#DBEAFE',
  // Progress — Leaf
  leaf:'#22C55E', leafSoft:'#DCFCE7', leafDeep:'#16A34A',
  // Achievement — Sun
  amber:'#FBBF24', amberSoft:'#FEF3C7', amberDeep:'#D97706',
  // Error — Coral
  danger:'#F87171', dangerSoft:'#FEE2E2',
  // Secondary — Berry
  berry:'#A855F7',
  // Visual mode accent
  blue:'#3B82F6',
};
const FONT_DISPLAY = '"Nunito","Quicksand",-apple-system,system-ui,sans-serif';
const FONT_SANS    = '"Atkinson Hyperlegible","Nunito Sans","Inter",-apple-system,system-ui,sans-serif';
const FONT_MONO    = '"JetBrains Mono","SF Mono",ui-monospace,monospace';

// ─── 부품 정의 ────────────────────────────────────────────────
const PRODUCTS = [
  { id:'outer_race', name:'OUTER RACE', kor:'외륜',   formula:'x1' },
  { id:'inner_race', name:'INNER RACE', kor:'내륜',   formula:'x1' },
  { id:'cage',       name:'CAGE',       kor:'케이지', formula:'x2' },
  { id:'ball',       name:'BALL',       kor:'볼',     formula:'x1' },
];
const SIDES      = ['outboard', 'inboard'];
const SIDE_LABEL = { outboard:'Outboard', inboard:'Inboard' };

// ─── Visual Inspection 항목 정의 ──────────────────────────────
const VISUAL_ITEMS = [
  { id:'joint',        name:'JOINT',             filename:'JOINT.jpg',           ratioKey:'portrait_916' },  // 9:16 세로
  { id:'interface',    name:'1. INTERFACE',      filename:'1_INTERFACE.jpg',     ratioKey:'ball'         },  // 4:3 가로
  { id:'bearing_face', name:'2. BEARING FACE',   filename:'2_BEARING_FACE.jpg',  ratioKey:'ball'         },  // 4:3 가로
  { id:'clamp_joint',  name:'3. CLAMP — JOINT',  filename:'3_CLAMP_JOINT.jpg',   ratioKey:'portrait_916' },  // 9:16 세로
  { id:'boot',         name:'4. BOOT',           filename:'4_BOOT.jpg',          ratioKey:'ball'         },  // 4:3 가로
  { id:'clamp_shaft',  name:'5. CLAMP — SHAFT',  filename:'5_CLAMP_SHAFT.jpg',   ratioKey:'portrait_916' },  // 9:16 세로
];
const emptyVisual = () => Object.fromEntries(VISUAL_ITEMS.map(it => [it.id, null]));

// ─── 제품별 촬영 비율 (w:h) ───────────────────────────────────
const CROP_RATIO = {
  outer_race:   [3, 4],   // 세로
  inner_race:   [3, 4],   // 세로
  cage:         [8, 3],   // 가로 와이드
  ball:         [4, 3],   // 가로 4:3
  portrait_916: [9, 16],  // 세로 9:16 (CLAMP-JOINT, CLAMP-SHAFT)
};

const shotCount    = (p, seg) => p.id==='ball' ? 1 : p.id==='cage' ? seg*2 : seg;
const emptyCapture = ()       => ({ outer_race:[], inner_race:[], cage:[], ball:[] });

// ─── 갤러리 유틸 ──────────────────────────────────────────────
function pickFromGallery(multiple=false) {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type='file'; input.accept='image/*';
    if (multiple) input.multiple=true;
    input.onchange = e => resolve(Array.from(e.target.files||[]));
    input.addEventListener('cancel', ()=>resolve([]));
    input.click();
  });
}

async function cropToRatio(file, rw, rh) {
  return new Promise(resolve => {
    const img = new Image();
    const src = URL.createObjectURL(file);
    img.onload = () => {
      const w=img.naturalWidth, h=img.naturalHeight;
      let sx,sy,sw,sh;
      if (w/h > rw/rh) { sh=h; sw=h*rw/rh; sx=(w-sw)/2; sy=0; }
      else              { sw=w; sh=w*rh/rw; sx=0; sy=(h-sh)/2; }
      const cv=document.createElement('canvas');
      cv.width=Math.round(sw); cv.height=Math.round(sh);
      cv.getContext('2d').drawImage(img,sx,sy,sw,sh,0,0,cv.width,cv.height);
      URL.revokeObjectURL(src);
      cv.toBlob(blob=>resolve({blob,url:URL.createObjectURL(blob)}),'image/jpeg',0.92);
    };
    img.src=src;
  });
}

// CSS aspect-ratio 기반 가이드 박스 스타일
// preserveAspectRatio="none" SVG는 폰 세로화면에서 찌그러지므로 CSS 방식 사용
function getGuideBoxStyle(productId) {
  const [rw, rh] = CROP_RATIO[productId] || [4, 3];
  if (rw >= rh) {
    // 가로 비율(cage, ball): width 기준으로 맞춤
    return { width:'90%', aspectRatio:`${rw}/${rh}` };
  } else {
    // 세로 비율(outer/inner race): height 기준으로 맞춤
    return { height:'80%', aspectRatio:`${rw}/${rh}` };
  }
}

// ─── ProductIcon ──────────────────────────────────────────────
function ProductIcon({ id, color=C.text, size=28 }) {
  const s=1.6;
  if (id==='outer_race') return <svg width={size} height={size} viewBox="0 0 28 28" fill="none"><circle cx="14" cy="14" r="12" stroke={color} strokeWidth={s}/><circle cx="14" cy="14" r="7" stroke={color} strokeWidth={s} opacity="0.3"/></svg>;
  if (id==='inner_race') return <svg width={size} height={size} viewBox="0 0 28 28" fill="none"><circle cx="14" cy="14" r="12" stroke={color} strokeWidth={s} opacity="0.3"/><circle cx="14" cy="14" r="7" stroke={color} strokeWidth={s}/><circle cx="14" cy="14" r="3" stroke={color} strokeWidth={s} opacity="0.3"/></svg>;
  if (id==='cage') return <svg width={size} height={size} viewBox="0 0 28 28" fill="none"><circle cx="14" cy="14" r="11" stroke={color} strokeWidth={s}/>{[0,1,2,3,4,5].map(i=>{const a=(i*60)*Math.PI/180;return <line key={i} x1={14+Math.cos(a)*8} y1={14+Math.sin(a)*8} x2={14+Math.cos(a)*14} y2={14+Math.sin(a)*14} stroke={color} strokeWidth={s}/>;})}</svg>;
  return <svg width={size} height={size} viewBox="0 0 28 28" fill="none"><circle cx="14" cy="14" r="9" stroke={color} strokeWidth={s}/><circle cx="11" cy="11" r="2" fill={color} opacity="0.45"/></svg>;
}

// ─── Thumb ────────────────────────────────────────────────────
function Thumb({ product, idx, imageUrl, onTap }) {
  return (
    <button onClick={onTap} style={{position:'relative',width:'100%',aspectRatio:'1/1',
      border:`1.5px solid ${C.border}`,borderRadius:12,overflow:'hidden',
      background:imageUrl?'transparent':C.surfaceHi,cursor:'pointer',padding:0,
      boxShadow:'0 2px 8px rgba(15,23,42,0.06)'}}>
      {imageUrl
        ? <img src={imageUrl} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>
        : <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',opacity:0.35}}><ProductIcon id={product} color={C.dimmer} size={28}/></div>}
      <div style={{position:'absolute',left:5,bottom:4,fontFamily:FONT_MONO,fontSize:7,color:C.dimmer,background:'rgba(255,255,255,0.8)',borderRadius:4,padding:'1px 4px'}}>#{idx}</div>
    </button>
  );
}

// ─── ProductCard ──────────────────────────────────────────────
function ProductCard({ product, segments, status, count, onTap, disabled }) {
  const total=shotCount(product,segments), isDone=status==='done', isShooting=status==='shooting';
  const bgColor = isShooting ? C.accentSoft : isDone ? C.leafSoft : C.surface;
  const borderColor = isShooting ? C.accent : isDone ? C.leaf : C.border;
  return (
    <button onClick={onTap} disabled={disabled} style={{
      textAlign:'left',display:'flex',flexDirection:'column',gap:10,
      padding:'14px 12px',borderRadius:20,minWidth:0,
      background:bgColor,
      border:`1.5px solid ${borderColor}`,
      cursor:disabled?'not-allowed':'pointer',
      opacity:disabled&&!isShooting?0.5:1,
      fontFamily:FONT_SANS,color:C.text,
      boxShadow: isShooting ? `0 8px 24px rgba(59,130,246,0.15)` : isDone ? `0 4px 12px rgba(34,197,94,0.12)` : '0 2px 8px rgba(15,23,42,0.05)',
      transition:'all 0.24s cubic-bezier(0.34,1.56,0.64,1)',
    }}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:6}}>
        <div style={{display:'flex',alignItems:'center',gap:8,flex:1,minWidth:0}}>
          <div style={{width:36,height:36,borderRadius:12,flexShrink:0,
            background:isShooting?C.accent:isDone?C.leaf:C.surfaceHi,
            display:'flex',alignItems:'center',justifyContent:'center'}}>
            <ProductIcon id={product.id} color={isShooting||isDone?'#fff':C.dim} size={20}/>
          </div>
          <div style={{minWidth:0,flex:1}}>
            <div style={{fontSize:12,fontWeight:700,letterSpacing:0.3,color:C.text}}>{product.name}</div>
            <div style={{fontSize:11,color:C.dim,marginTop:1}}>{product.kor}</div>
          </div>
        </div>
        <div style={{fontFamily:FONT_MONO,fontSize:10,color:isShooting?C.accent:isDone?C.leaf:C.dimmer,
          background:isShooting?C.accentSoft:isDone?C.leafSoft:C.surfaceHi,
          border:`1px solid ${isShooting?C.accentBright:isDone?C.leaf+'60':C.border}`,
          padding:'2px 7px',borderRadius:999,flexShrink:0,fontWeight:600}}>
          {product.formula}
        </div>
      </div>
      {/* 진행 바 */}
      <div style={{height:6,background:isShooting?`${C.accent}25`:isDone?`${C.leaf}25`:C.surfaceHi,borderRadius:999,overflow:'hidden'}}>
        <div style={{height:'100%',width:`${(count/total)*100}%`,borderRadius:999,
          background:isDone?C.leaf:isShooting?C.accent:C.accentBright,
          transition:'width 0.48s ease-out'}}/>
      </div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:6}}>
        <div style={{display:'flex',alignItems:'center',gap:5}}>
          <div style={{width:7,height:7,borderRadius:'50%',flexShrink:0,
            background:isDone?C.leaf:isShooting?C.accent:C.faint,
            boxShadow:isShooting?`0 0 8px ${C.accent}`:'none',
            animation:isShooting?'pulse 1.2s ease-in-out infinite':'none'}}/>
          <div style={{fontSize:11,color:isDone?C.leaf:isShooting?C.accent:C.dim,fontWeight:600}}>
            {isDone?'완료':isShooting?'촬영중':'대기'}
          </div>
        </div>
        <div style={{display:'flex',alignItems:'baseline',gap:2}}>
          <span style={{fontFamily:FONT_MONO,fontSize:18,fontWeight:700,
            color:isDone?C.leaf:isShooting?C.accent:C.text}}>{count}</span>
          <span style={{fontFamily:FONT_MONO,fontSize:11,color:C.dimmer}}>/{total}</span>
        </div>
      </div>
    </button>
  );
}

// ─── CameraScreen ─────────────────────────────────────────────
function CameraScreen({ product, segments, shotIndex, totalShots, paused,
    onCapture, onStop, onResume, capturedImages, defaultZoom=1.0, onZoomChange }) {

  const videoRef       = useRef(null);
  const streamRef      = useRef(null);
  const lastPinchDist  = useRef(null);
  const [camReady, setCamReady] = useState(false);
  const [flash,    setFlash]    = useState(false);
  const [camError, setCamError] = useState(null);
  const [zoomLevel, setZoomLevel] = useState(defaultZoom);

  const isCage = product.id === 'cage';
  const faceSide = isCage && shotIndex >= segments ? 'BACK' : 'FRONT';

  // 카메라 시작
  useEffect(() => {
    let cancelled = false;
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video:{ facingMode:{ ideal:'environment' }, width:{ ideal:1920 }, height:{ ideal:1080 } },
          audio:false,
        });
        if (cancelled) { stream.getTracks().forEach(t=>t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
          setCamReady(true);
        }
      } catch(err) { if (!cancelled) setCamError(err.message); }
    }
    startCamera();
    return () => { cancelled=true; streamRef.current?.getTracks().forEach(t=>t.stop()); };
  }, []);

  // CSS 프리뷰 줌
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.style.transform      = `scale(${zoomLevel})`;
      videoRef.current.style.transformOrigin = 'center';
    }
    onZoomChange?.(zoomLevel);
  }, [zoomLevel]);

  const clampZoom = (v) => Math.min(4, Math.max(0.5, +v.toFixed(2)));

  // 핀치 줌
  const handleTouchStart = useCallback((e) => {
    if (e.touches.length===2) {
      lastPinchDist.current = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
    }
  }, []);
  const handleTouchMove = useCallback((e) => {
    if (e.touches.length===2 && lastPinchDist.current) {
      const dist  = Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY);
      const delta = dist / lastPinchDist.current;
      setZoomLevel(prev => clampZoom(prev * delta));
      lastPinchDist.current = dist;
    }
  }, []);
  const handleTouchEnd = useCallback(() => { lastPinchDist.current=null; }, []);

  // 셔터 (비율 크롭 + 소프트웨어 줌)
  const handleShutter = useCallback(async () => {
    if (!videoRef.current || !camReady) return;
    setFlash(true); setTimeout(()=>setFlash(false), 120);
    const video = videoRef.current;
    const vw = video.videoWidth  || 1280;
    const vh = video.videoHeight || 720;
    const [rw, rh] = CROP_RATIO[product.id] || [4, 3];

    // 1. 비율 크롭
    let srcX, srcY, srcW, srcH;
    if (vw/vh > rw/rh) {
      srcH=vh; srcW=vh*rw/rh; srcX=(vw-srcW)/2; srcY=0;
    } else {
      srcW=vw; srcH=vw*rh/rw; srcX=0; srcY=(vh-srcH)/2;
    }

    // 2. 소프트웨어 줌 (중심 기준 축소)
    if (zoomLevel !== 1) {
      const zw=srcW/zoomLevel, zh=srcH/zoomLevel;
      srcX += (srcW-zw)/2; srcY += (srcH-zh)/2;
      srcW=zw; srcH=zh;
    }

    const canvas = document.createElement('canvas');
    canvas.width  = Math.round(srcW);
    canvas.height = Math.round(srcH);
    canvas.getContext('2d').drawImage(video, srcX, srcY, srcW, srcH, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(blob=>{
      const url = URL.createObjectURL(blob);
      onCapture(blob, url);
    }, 'image/jpeg', 0.92);
  }, [camReady, onCapture, product.id, zoomLevel]);

  if (camError) return (
    <div style={{position:'absolute',inset:0,zIndex:100,background:C.bg,
      display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:24,gap:16}}>
      <div style={{fontSize:40}}>📷</div>
      <div style={{fontSize:16,fontWeight:700,color:C.text}}>카메라 접근 필요</div>
      <div style={{fontSize:13,color:C.dim,textAlign:'center',lineHeight:1.6}}>브라우저에서 카메라 권한을 허용해 주세요.</div>
      <div style={{fontFamily:FONT_MONO,fontSize:11,color:C.danger,padding:'8px 12px',background:`${C.danger}15`,borderRadius:8}}>{camError}</div>
      <button onClick={onStop} style={{height:48,padding:'0 24px',borderRadius:12,
        background:C.surface,border:`1px solid ${C.border}`,color:C.text,fontSize:14,fontWeight:600,cursor:'pointer'}}>돌아가기</button>
    </div>
  );

  return (
    <div style={{position:'absolute',inset:0,zIndex:100,background:'#000',display:'flex',flexDirection:'column'}}
      onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>

      {/* 뷰파인더 */}
      <div style={{position:'relative',flex:1,overflow:'hidden'}}>
        <video ref={videoRef} id="camera-stream" playsInline muted autoPlay
          style={{width:'100%',height:'100%',objectFit:'cover',display:'block'}}/>
        {flash && <div style={{position:'absolute',inset:0,background:'white',opacity:0.7,pointerEvents:'none'}}/>}

        {/* 가이드 프레임 — CSS aspect-ratio 방식 (SVG stretch 문제 해결) */}
        <div style={{position:'absolute',inset:0,pointerEvents:'none'}}>
          {/* 어두운 오버레이 + 가이드 박스 */}
          <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center'}}>
            {(()=>{
              const boxStyle = getGuideBoxStyle(product.id);
              const hl = 12; // 코너 마크 길이 (viewBox 100 기준 %)
              return (
                <div style={{
                  ...boxStyle,
                  position:'relative',
                  flexShrink:0,
                  // 가이드 박스 외부를 어둡게 (overflow:hidden 부모에서 클리핑됨)
                  boxShadow:'0 0 0 9999px rgba(0,0,0,0.38)',
                }}>
                  {/* 테두리 + 코너 마크 SVG (박스 내부라 비율 정확) */}
                  <svg style={{position:'absolute',inset:0,width:'100%',height:'100%'}} viewBox="0 0 100 100" preserveAspectRatio="none">
                    <rect x="0.5" y="0.5" width="99" height="99" rx="1"
                      fill="none" stroke={`${C.accent}55`} strokeWidth="0.7" strokeDasharray="3 2.5"/>
                    {[{px:0,py:0,dx:1,dy:1},{px:100,py:0,dx:-1,dy:1},{px:0,py:100,dx:1,dy:-1},{px:100,py:100,dx:-1,dy:-1}].map(({px,py,dx,dy},i)=>(
                      <g key={i} stroke={C.accent} strokeWidth="2" strokeLinecap="round">
                        <line x1={px} y1={py} x2={px+dx*hl} y2={py}/>
                        <line x1={px} y1={py} x2={px} y2={py+dy*hl}/>
                      </g>
                    ))}
                    <line x1="50" y1="47" x2="50" y2="53" stroke={`${C.accent}80`} strokeWidth="0.6"/>
                    <line x1="47" y1="50" x2="53" y2="50" stroke={`${C.accent}80`} strokeWidth="0.6"/>
                  </svg>
                </div>
              );
            })()}
          </div>

          {/* 상단 HUD */}
          <div style={{position:'absolute',top:14,left:0,right:0,display:'flex',justifyContent:'center'}}>
            <div style={{background:'rgba(0,0,0,0.6)',backdropFilter:'blur(8px)',
              border:`1px solid ${C.border}`,borderRadius:20,padding:'6px 16px',
              display:'flex',alignItems:'center',gap:10}}>
              <div style={{fontFamily:FONT_MONO,fontSize:10,color:C.dim}}>{Math.round(shotIndex*360/totalShots)}°</div>
              <div style={{width:1,height:12,background:C.border}}/>
              <div style={{fontFamily:FONT_MONO,fontSize:10,color:C.accent}}>
                {product.name}{isCage && ` · ${faceSide}`}
              </div>
              <div style={{width:1,height:12,background:C.border}}/>
              <div style={{fontFamily:FONT_MONO,fontSize:10,color:C.dim}}>{shotIndex+1}/{totalShots}</div>
              <div style={{width:1,height:12,background:C.border}}/>
              <div style={{fontFamily:FONT_MONO,fontSize:10,color:C.amber}}>{zoomLevel.toFixed(1)}×</div>
            </div>
          </div>

          {/* 로딩 */}
          {!camReady && (
            <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center'}}>
              <div style={{background:'rgba(0,0,0,0.7)',borderRadius:12,padding:'16px 24px',display:'flex',alignItems:'center',gap:10}}>
                <div style={{width:16,height:16,border:`2px solid ${C.accent}`,borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
                <span style={{fontSize:13,color:C.text}}>카메라 준비 중...</span>
              </div>
            </div>
          )}
        </div>

        {/* 최근 촬영 미리보기 (좌측) */}
        <div style={{position:'absolute',left:10,bottom:10,display:'flex',flexDirection:'column',gap:4}}>
          {capturedImages.slice(-4).map((url,i)=>(
            <div key={i} style={{width:44,height:44,borderRadius:6,overflow:'hidden',border:`1px solid ${C.border}`,opacity:0.85}}>
              <img src={url} style={{width:'100%',height:'100%',objectFit:'cover'}}/>
            </div>
          ))}
        </div>

        {/* 중단 버튼 */}
        <button onClick={onStop} style={{position:'absolute',top:14,right:14,
          background:'rgba(0,0,0,0.6)',backdropFilter:'blur(8px)',
          border:`1px solid ${C.danger}`,color:C.danger,
          padding:'6px 14px',borderRadius:18,fontSize:12,fontWeight:600,
          fontFamily:FONT_SANS,cursor:'pointer'}}>중단</button>
      </div>

      {/* 줌 컨트롤 바 */}
      <div style={{background:'rgba(0,0,0,0.88)',backdropFilter:'blur(12px)',
        padding:'8px 16px',display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
        {/* 프리셋 버튼 */}
        {[0.5,1,1.5,2,3,4].map(z=>{
          const active = Math.abs(zoomLevel-z)<0.05;
          return (
            <button key={z} onClick={()=>setZoomLevel(z)} style={{
              background:active?C.accent:'rgba(255,255,255,0.12)',
              color:active?C.bg:'rgba(255,255,255,0.8)',
              border:'none',borderRadius:10,padding:'5px 9px',
              fontSize:10,fontFamily:FONT_MONO,cursor:'pointer',fontWeight:active?700:400,
            }}>{z}×</button>
          );
        })}
        <div style={{width:1,height:18,background:'rgba(255,255,255,0.15)',margin:'0 2px'}}/>
        <button onClick={()=>setZoomLevel(prev=>clampZoom(prev-0.1))} style={{
          width:28,height:28,borderRadius:14,background:'rgba(255,255,255,0.12)',
          border:'none',color:'#fff',fontSize:16,cursor:'pointer',
          display:'flex',alignItems:'center',justifyContent:'center',lineHeight:1}}>−</button>
        <span style={{fontFamily:FONT_MONO,fontSize:12,color:'#fff',minWidth:36,textAlign:'center'}}>
          {zoomLevel.toFixed(1)}×
        </span>
        <button onClick={()=>setZoomLevel(prev=>clampZoom(prev+0.1))} style={{
          width:28,height:28,borderRadius:14,background:'rgba(255,255,255,0.12)',
          border:'none',color:'#fff',fontSize:16,cursor:'pointer',
          display:'flex',alignItems:'center',justifyContent:'center',lineHeight:1}}>+</button>
      </div>

      {/* 셔터 바 */}
      <div style={{background:'rgba(0,0,0,0.85)',backdropFilter:'blur(20px)',
        padding:'16px 24px',paddingBottom:'max(16px, env(safe-area-inset-bottom))',
        display:'flex',alignItems:'center',justifyContent:'space-between',gap:16}}>
        <div style={{flex:1}}>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
            <span style={{fontFamily:FONT_MONO,fontSize:10,color:C.dim}}>진행</span>
            <span style={{fontFamily:FONT_MONO,fontSize:10,color:C.accent}}>{shotIndex}/{totalShots}</span>
          </div>
          <div style={{height:3,background:C.surface,borderRadius:2}}>
            <div style={{height:'100%',width:`${(shotIndex/totalShots)*100}%`,
              background:C.accent,borderRadius:2,transition:'width 0.3s ease'}}/>
          </div>
        </div>
        <button onClick={handleShutter} disabled={!camReady} style={{
          width:72,height:72,borderRadius:36,flexShrink:0,
          background:camReady?C.accent:C.dimmer,
          border:'4px solid rgba(255,255,255,0.3)',
          cursor:camReady?'pointer':'not-allowed',
          display:'flex',alignItems:'center',justifyContent:'center',
          boxShadow:camReady?`0 0 24px ${C.accent}60`:'none',
        }}>
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <circle cx="14" cy="14" r="10" fill={C.bg}/>
            <circle cx="14" cy="14" r="6" fill={C.bg} stroke={C.accent} strokeWidth="1.5"/>
          </svg>
        </button>
        <div style={{flex:1,textAlign:'right'}}>
          <div style={{fontFamily:FONT_MONO,fontSize:10,color:C.dim,marginBottom:4}}>다음 각도</div>
          <div style={{fontFamily:FONT_MONO,fontSize:14,color:C.text,fontWeight:600}}>
            {Math.round((shotIndex+1)*360/totalShots)}°
          </div>
        </div>
      </div>

      {/* CAGE 뒤집기 모달 */}
      {paused && (
        <div style={{position:'absolute',inset:0,zIndex:110,
          background:'rgba(11,12,14,0.94)',backdropFilter:'blur(10px)',
          display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'0 28px'}}>
          <div style={{width:110,height:110,borderRadius:55,background:C.surfaceHi,
            border:`1px solid ${C.accent}`,display:'flex',alignItems:'center',justifyContent:'center',
            marginBottom:22,boxShadow:`0 0 60px ${C.accent}30`}}>
            <svg width="52" height="52" viewBox="0 0 56 56" fill="none">
              <ellipse cx="28" cy="36" rx="18" ry="6" stroke={C.accent} strokeWidth="2"/>
              <path d="M11 18 Q28 6 45 18" stroke={C.accent} strokeWidth="2" fill="none" strokeLinecap="round"/>
              <path d="M45 18 L45 11 M45 18 L38 18" stroke={C.accent} strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <div style={{fontSize:10,color:C.accent,fontFamily:FONT_MONO,letterSpacing:1.5,marginBottom:8,textAlign:'center'}}>
            FLIP REQUIRED · 앞면 {segments}장 완료
          </div>
          <div style={{fontSize:22,fontWeight:700,color:C.text,letterSpacing:-0.3,marginBottom:10,textAlign:'center'}}>
            제품을 뒤집어주세요
          </div>
          <div style={{fontSize:12,color:C.dim,lineHeight:1.55,textAlign:'center',marginBottom:28}}>
            CAGE를 분리해 뒤집은 후 다시 올려주세요
          </div>
          <div style={{display:'flex',gap:8,width:'100%'}}>
            <button onClick={onStop} style={{flex:1,height:48,borderRadius:12,
              background:'none',border:`1px solid ${C.border}`,color:C.text,
              fontSize:13,fontWeight:500,fontFamily:FONT_SANS,cursor:'pointer'}}>중단</button>
            <button onClick={onResume} style={{flex:2,height:48,borderRadius:12,
              background:C.accent,color:C.bg,fontSize:13,fontWeight:700,
              fontFamily:FONT_SANS,cursor:'pointer',border:'none',
              display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
              뒤집었어요
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M5 3l5 5-5 5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── LoginScreen ──────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [error, setError] = useState(null);
  const handleGoogleLogin = () => {
    if (!GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID.includes('YOUR_CLIENT_ID')) { setError('Google Client ID가 설정되지 않았습니다.'); return; }
    const redirectUri = window.location.origin + window.location.pathname;
    const params = new URLSearchParams({ client_id:GOOGLE_CLIENT_ID, redirect_uri:redirectUri, response_type:'token', scope:GOOGLE_DRIVE_SCOPE, prompt:'select_account' });
    window.location.href = 'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString();
  };
  return (
    <div style={{height:'100%',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:`linear-gradient(160deg, ${C.accentSoft} 0%, #FFFFFF 60%)`,padding:32}}>
      {/* 로고 아이콘 */}
      <div style={{width:96,height:96,borderRadius:28,marginBottom:24,background:C.accent,display:'flex',alignItems:'center',justifyContent:'center',boxShadow:`0 12px 32px rgba(59,130,246,0.35)`}}>
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
          <circle cx="24" cy="24" r="18" stroke="#fff" strokeWidth="2.5"/>
          <circle cx="24" cy="24" r="9" stroke="#fff" strokeWidth="2" opacity="0.6"/>
          <circle cx="24" cy="24" r="3" fill="#fff"/>
          {[0,1,2,3,4,5].map(i=>{const a=(i*60-90)*Math.PI/180;return <circle key={i} cx={24+Math.cos(a)*18} cy={24+Math.sin(a)*18} r="3" fill="#fff"/>;  })}
        </svg>
      </div>
      {/* 타이틀 */}
      <div style={{fontSize:11,color:C.accent,fontFamily:FONT_MONO,letterSpacing:2.5,marginBottom:10,fontWeight:600}}>JOINT REPORT</div>
      <div style={{fontSize:30,fontWeight:800,color:C.text,fontFamily:FONT_DISPLAY,letterSpacing:-0.5,marginBottom:10,textAlign:'center',lineHeight:1.2}}>360° Inspection</div>
      <div style={{fontSize:16,color:C.dim,textAlign:'center',lineHeight:1.65,marginBottom:48,maxWidth:280}}>Google 계정으로 로그인하면<br/>촬영 후 Drive에 자동 업로드됩니다</div>
      {error && (
        <div style={{width:'100%',maxWidth:320,padding:'12px 16px',borderRadius:12,marginBottom:16,background:C.dangerSoft,border:`1px solid ${C.danger}`,fontSize:14,color:C.danger,textAlign:'center'}}>{error}</div>
      )}
      <button onClick={handleGoogleLogin} style={{width:'100%',maxWidth:320,height:56,borderRadius:16,background:'#fff',border:`1.5px solid ${C.border}`,color:C.text,fontSize:16,fontWeight:700,fontFamily:FONT_SANS,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:12,boxShadow:'0 4px 12px rgba(15,23,42,0.08)'}}>
        <svg width="22" height="22" viewBox="0 0 48 48">
          <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
          <path fill="#FF3D00" d="m6.306 14.691 6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
          <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
          <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
        </svg>
        Google로 로그인
      </button>
    </div>
  );
}

// ─── UploadModal ──────────────────────────────────────────────
function UploadModal({ capturedData, selectedSides, segments, accessToken, onClose, onDone }) {
  const [phase,    setPhase]    = useState('confirm'); // confirm | uploading | ppt | done | error
  const [progress, setProgress] = useState({ current:0, total:0, product:'' });
  const [errorMsg, setErrorMsg] = useState('');
  const [driveLink, setDriveLink] = useState('');

  // 모달 오픈 시점 폴더명 고정
  const sessionInfo = useRef((() => {
    const now = new Date();
    const d = now.toISOString().slice(0,10).replace(/-/g,'');
    const t = now.toTimeString().slice(0,8).replace(/:/g,'');
    return { folderName: `JointReport_${d}_${t}` };
  })()).current;

  const createFolder = async (name, parentId=null) => {
    const meta = { name, mimeType:'application/vnd.google-apps.folder', ...(parentId?{parents:[parentId]}:{}) };
    const res  = await fetch(DRIVE_FOLDER_URL, { method:'POST', headers:{ Authorization:`Bearer ${accessToken}`, 'Content-Type':'application/json' }, body:JSON.stringify(meta) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message||'Drive 폴더 생성 실패');
    return data.id;
  };

  const uploadFile = async (blob, filename, parentId, mimeType='image/jpeg') => {
    const meta      = JSON.stringify({ name:filename, parents:[parentId] });
    const boundary  = '----FormBoundary' + Math.random().toString(36).slice(2);
    const metaBytes = new TextEncoder().encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`);
    const endBytes  = new TextEncoder().encode(`\r\n--${boundary}--`);
    const blobData  = await blob.arrayBuffer();
    const body      = new Uint8Array(metaBytes.byteLength + blobData.byteLength + endBytes.byteLength);
    body.set(metaBytes,0); body.set(new Uint8Array(blobData), metaBytes.byteLength); body.set(endBytes, metaBytes.byteLength+blobData.byteLength);
    const res = await fetch(DRIVE_UPLOAD_URL, { method:'POST', headers:{ Authorization:`Bearer ${accessToken}`, 'Content-Type':`multipart/related; boundary=${boundary}` }, body });
    if (!res.ok) { const e=await res.json(); throw new Error(e.error?.message||'파일 업로드 실패'); }
  };

  const findOrCreateHansae = async () => {
    const q   = encodeURIComponent(`name='HANSAE' and mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false`);
    const res = await fetch(`${DRIVE_FOLDER_URL}?q=${q}&fields=files(id,name)`, { headers:{ Authorization:`Bearer ${accessToken}` } });
    const data = await res.json();
    if (data.files && data.files.length>0) return data.files[0].id;
    return await createFolder('HANSAE');
  };

  const startUpload = async () => {
    setPhase('uploading');
    try {
      const hansaeId = await findOrCreateHansae();
      const rootId   = await createFolder(sessionInfo.folderName, hansaeId);

      // 사진 업로드
      let total=0;
      for (const side of SIDES) { if (!selectedSides[side]) continue; for (const arr of Object.values(capturedData[side])) total+=arr.length; }
      let current=0;
      for (const side of SIDES) {
        if (!selectedSides[side]) continue;
        const sideId = await createFolder(SIDE_LABEL[side], rootId);
        for (const prod of PRODUCTS) {
          const blobList = capturedData[side][prod.id]||[];
          if (blobList.length===0) continue;
          const subId = await createFolder(prod.name, sideId);
          for (let i=0; i<blobList.length; i++) {
            setProgress({ current:++current, total, product:`${SIDE_LABEL[side]} · ${prod.name}` });
            await uploadFile(blobList[i].blob, `${prod.id}_${String(i+1).padStart(2,'0')}.jpg`, subId);
          }
        }
      }

      // PPT 생성 및 Drive 업로드
      setPhase('ppt');
      if (window.generateJointReportPPT) {
        const { blob:pptBlob, fileName:pptName } = await window.generateJointReportPPT({ capturedData, selectedSides, segments });
        await uploadFile(pptBlob, pptName, rootId, 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
      }

      setDriveLink(`https://drive.google.com/drive/folders/${rootId}`);
      setPhase('done');
    } catch(err) { setErrorMsg(err.message); setPhase('error'); }
  };

  // 사이드별 사진 수
  const countBySide = {};
  for (const side of SIDES) {
    if (!selectedSides[side]) continue;
    countBySide[side] = Object.values(capturedData[side]).reduce((s,arr)=>s+arr.length, 0);
  }
  const totalCount = Object.values(countBySide).reduce((s,n)=>s+n, 0);
  const canClose = phase==='confirm' || phase==='done' || phase==='error';

  return (
    <div style={{position:'absolute',inset:0,zIndex:200,background:'rgba(0,0,0,0.75)',backdropFilter:'blur(8px)',display:'flex',alignItems:'flex-end',justifyContent:'center'}} onClick={canClose?onClose:undefined}>
      <div onClick={e=>e.stopPropagation()} style={{background:C.surface,border:`1px solid ${C.borderHi}`,borderRadius:'20px 20px 0 0',width:'100%',maxWidth:480,padding:24,paddingBottom:'max(24px, env(safe-area-inset-bottom))'}}>

        {/* ── 확인 팝업 ── */}
        {phase==='confirm' && (<>
          <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:20}}>
            <div style={{width:44,height:44,borderRadius:22,background:`${C.accent}15`,border:`1px solid ${C.accent}40`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M7 18a4.5 4.5 0 01-.5-8.97A6 6 0 0118 9.5a4.5 4.5 0 01-.5 8.5H7z" stroke={C.accent} strokeWidth="1.7" fill="none"/><path d="M12 11v6M9.5 13.5L12 11l2.5 2.5" stroke={C.accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            <div>
              <div style={{fontSize:17,fontWeight:700,color:C.text}}>Google Drive 업로드</div>
              <div style={{fontSize:12,color:C.dim,marginTop:2}}>사진 + PPT 파일을 Drive에 저장합니다</div>
            </div>
          </div>

          {/* 업로드 요약 */}
          <div style={{background:C.bg,borderRadius:12,padding:'14px 16px',marginBottom:10}}>
            {SIDES.filter(s=>selectedSides[s]).map(side=>(
              <div key={side} style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                <span style={{fontSize:13,color:C.text,fontWeight:600}}>{SIDE_LABEL[side]}</span>
                <span style={{fontFamily:FONT_MONO,fontSize:13,color:C.accent}}>{countBySide[side]}장</span>
              </div>
            ))}
            <div style={{height:1,background:C.border,margin:'4px 0 8px'}}/>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <span style={{fontSize:13,color:C.dim}}>총</span>
              <span style={{fontFamily:FONT_MONO,fontSize:16,fontWeight:700,color:C.accent}}>{totalCount}장</span>
            </div>
          </div>

          {/* 저장 위치 */}
          <div style={{background:C.bg,borderRadius:10,padding:'10px 14px',marginBottom:20,display:'flex',alignItems:'flex-start',gap:8}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{marginTop:2,flexShrink:0}}><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" stroke={C.dim} strokeWidth="1.5"/></svg>
            <div style={{fontSize:11,color:C.dim,fontFamily:FONT_MONO,lineHeight:1.6}}>
              내 드라이브 &gt; HANSAE &gt;<br/>
              <span style={{color:C.text}}>{sessionInfo.folderName}</span>
            </div>
          </div>

          <div style={{display:'flex',gap:8}}>
            <button onClick={onClose} style={{flex:1,height:48,borderRadius:12,background:'none',border:`1px solid ${C.border}`,color:C.text,fontSize:14,fontWeight:500,fontFamily:FONT_SANS,cursor:'pointer'}}>취소</button>
            <button onClick={startUpload} style={{flex:2,height:48,borderRadius:12,background:C.accent,color:C.bg,fontSize:14,fontWeight:700,fontFamily:FONT_SANS,border:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M7 18a4.5 4.5 0 01-.5-8.97A6 6 0 0118 9.5a4.5 4.5 0 01-.5 8.5H7z" stroke="currentColor" strokeWidth="1.7" fill="none"/><path d="M12 11v6M9.5 13.5L12 11l2.5 2.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
              업로드 시작
            </button>
          </div>
        </>)}

        {/* ── 사진 업로드 중 ── */}
        {phase==='uploading' && (
          <div style={{textAlign:'center',padding:'8px 0'}}>
            <div style={{width:64,height:64,borderRadius:32,margin:'0 auto 20px',background:`${C.accent}15`,border:`1px solid ${C.accent}40`,display:'flex',alignItems:'center',justifyContent:'center'}}>
              <div style={{width:28,height:28,border:`3px solid ${C.accent}`,borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
            </div>
            <div style={{fontSize:16,fontWeight:700,color:C.text,marginBottom:6}}>사진 업로드 중...</div>
            <div style={{fontSize:13,color:C.dim,marginBottom:20}}>{progress.product} · {progress.current}/{progress.total}장</div>
            <div style={{height:4,background:C.bg,borderRadius:2,overflow:'hidden'}}>
              <div style={{height:'100%',background:C.accent,borderRadius:2,width:`${progress.total>0?(progress.current/progress.total)*100:0}%`,transition:'width 0.3s ease'}}/>
            </div>
          </div>
        )}

        {/* ── PPT 생성 중 ── */}
        {phase==='ppt' && (
          <div style={{textAlign:'center',padding:'8px 0'}}>
            <div style={{width:64,height:64,borderRadius:32,margin:'0 auto 20px',background:`${C.blue}25`,border:`1px solid ${C.blue}60`,display:'flex',alignItems:'center',justifyContent:'center'}}>
              <div style={{width:28,height:28,border:`3px solid #5B9BD5`,borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
            </div>
            <div style={{fontSize:16,fontWeight:700,color:C.text,marginBottom:6}}>PPT 생성 중...</div>
            <div style={{fontSize:13,color:C.dim}}>Drive에 PPT 파일을 저장하고 있습니다</div>
          </div>
        )}

        {/* ── 완료 ── */}
        {phase==='done' && (
          <div style={{textAlign:'center',padding:'8px 0'}}>
            <div style={{width:64,height:64,borderRadius:32,margin:'0 auto 20px',background:`${C.accent}15`,border:`1px solid ${C.accent}`,display:'flex',alignItems:'center',justifyContent:'center'}}>
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><path d="M6 14l6 6L22 8" stroke={C.accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            <div style={{fontSize:18,fontWeight:700,color:C.text,marginBottom:6}}>업로드 완료!</div>
            <div style={{fontSize:13,color:C.dim,marginBottom:6}}>사진 {totalCount}장 + PPT가 Drive에 저장되었습니다</div>
            <div style={{fontSize:10,color:C.dimmer,fontFamily:FONT_MONO,marginBottom:24,lineHeight:1.5}}>
              내 드라이브 &gt; HANSAE &gt; {sessionInfo.folderName}
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              <a href={driveLink} target="_blank" rel="noopener noreferrer"
                style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8,height:48,borderRadius:12,background:C.accent,color:C.bg,textDecoration:'none',fontSize:14,fontWeight:700}}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                Drive에서 열기
              </a>
              <button onClick={onDone} style={{height:44,borderRadius:12,background:'none',border:`1px solid ${C.border}`,color:C.text,fontSize:14,fontWeight:500,fontFamily:FONT_SANS,cursor:'pointer'}}>확인</button>
            </div>
          </div>
        )}

        {/* ── 오류 ── */}
        {phase==='error' && (
          <div style={{textAlign:'center',padding:'8px 0'}}>
            <div style={{fontSize:40,marginBottom:16}}>⚠️</div>
            <div style={{fontSize:16,fontWeight:700,color:C.danger,marginBottom:8}}>업로드 실패</div>
            <div style={{fontSize:12,color:C.dim,marginBottom:20,lineHeight:1.6}}>{errorMsg}</div>
            <div style={{display:'flex',gap:8}}>
              <button onClick={onClose} style={{flex:1,height:44,borderRadius:10,background:'none',border:`1px solid ${C.border}`,color:C.text,cursor:'pointer'}}>닫기</button>
              <button onClick={startUpload} style={{flex:1,height:44,borderRadius:10,background:C.accent,color:C.bg,border:'none',cursor:'pointer',fontWeight:700}}>재시도</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── VisualUploadModal ────────────────────────────────────────
function VisualUploadModal({ visualData, accessToken, onClose, onDone }) {
  const [phase,    setPhase]    = useState('confirm');
  const [progress, setProgress] = useState({ current:0, total:0, name:'' });
  const [errorMsg, setErrorMsg] = useState('');
  const [driveLink,setDriveLink]= useState('');

  const sessionInfo = useRef((() => {
    const now = new Date();
    const d = now.toISOString().slice(0,10).replace(/-/g,'');
    const t = now.toTimeString().slice(0,8).replace(/:/g,'');
    return { folderName:`JointReport_${d}_${t}` };
  })()).current;

  const createFolder = async (name, parentId=null) => {
    const meta = { name, mimeType:'application/vnd.google-apps.folder', ...(parentId?{parents:[parentId]}:{}) };
    const res  = await fetch(DRIVE_FOLDER_URL, { method:'POST', headers:{ Authorization:`Bearer ${accessToken}`, 'Content-Type':'application/json' }, body:JSON.stringify(meta) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message||'폴더 생성 실패');
    return data.id;
  };

  const uploadFile = async (blob, filename, parentId, mimeType='image/jpeg') => {
    const meta     = JSON.stringify({ name:filename, parents:[parentId] });
    const boundary = '----FB' + Math.random().toString(36).slice(2);
    const mb = new TextEncoder().encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`);
    const eb = new TextEncoder().encode(`\r\n--${boundary}--`);
    const ab = await blob.arrayBuffer();
    const body = new Uint8Array(mb.byteLength + ab.byteLength + eb.byteLength);
    body.set(mb,0); body.set(new Uint8Array(ab), mb.byteLength); body.set(eb, mb.byteLength+ab.byteLength);
    const res = await fetch(DRIVE_UPLOAD_URL, { method:'POST', headers:{ Authorization:`Bearer ${accessToken}`, 'Content-Type':`multipart/related; boundary=${boundary}` }, body });
    if (!res.ok) { const e=await res.json(); throw new Error(e.error?.message||'업로드 실패'); }
  };

  const findOrCreateHansae = async () => {
    const q   = encodeURIComponent(`name='HANSAE' and mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false`);
    const res = await fetch(`${DRIVE_FOLDER_URL}?q=${q}&fields=files(id,name)`, { headers:{ Authorization:`Bearer ${accessToken}` } });
    const data = await res.json();
    if (data.files && data.files.length>0) return data.files[0].id;
    return await createFolder('HANSAE');
  };

  const totalShots = SIDES.reduce((s, side) =>
    s + VISUAL_ITEMS.filter(it => visualData[side][it.id]).length, 0);

  const startUpload = async () => {
    setPhase('uploading');
    try {
      const hansaeId  = await findOrCreateHansae();
      const rootId    = await createFolder(sessionInfo.folderName, hansaeId);
      const visualId  = await createFolder('Visual_Inspection', rootId);

      let current = 0;
      for (const side of SIDES) {
        const captured = VISUAL_ITEMS.filter(it => visualData[side][it.id]);
        if (captured.length === 0) continue;
        const sideId = await createFolder(SIDE_LABEL[side], visualId);
        for (const item of captured) {
          const shot = visualData[side][item.id];
          setProgress({ current:++current, total:totalShots, name:`${SIDE_LABEL[side]} · ${item.name}` });
          await uploadFile(shot.blob, item.filename, sideId);
        }
      }

      // Visual PPT 생성 및 업로드
      setPhase('ppt');
      if (window.generateVisualPPT) {
        const { blob:pptBlob, fileName:pptName } = await window.generateVisualPPT({ visualData });
        await uploadFile(pptBlob, pptName, rootId,
          'application/vnd.openxmlformats-officedocument.presentationml.presentation');
      }

      setDriveLink(`https://drive.google.com/drive/folders/${rootId}`);
      setPhase('done');
    } catch(err) { setErrorMsg(err.message); setPhase('error'); }
  };

  const canClose = phase==='confirm'||phase==='done'||phase==='error';

  return (
    <div style={{position:'absolute',inset:0,zIndex:200,background:'rgba(0,0,0,0.75)',backdropFilter:'blur(8px)',display:'flex',alignItems:'flex-end',justifyContent:'center'}} onClick={canClose?onClose:undefined}>
      <div onClick={e=>e.stopPropagation()} style={{background:C.surface,border:`1px solid ${C.borderHi}`,borderRadius:'20px 20px 0 0',width:'100%',maxWidth:480,padding:24,paddingBottom:'max(24px,env(safe-area-inset-bottom))'}}>

        {phase==='confirm' && (<>
          <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:20}}>
            <div style={{width:44,height:44,borderRadius:22,background:`${C.blue}25`,border:`1px solid ${C.blue}60`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="14" rx="2" stroke={C.blue} strokeWidth="1.7"/><circle cx="9" cy="11" r="1.5" fill={C.blue}/><path d="M3 17l5-4 4 3 4-3 5 4" stroke={C.blue} strokeWidth="1.6" fill="none"/></svg>
            </div>
            <div>
              <div style={{fontSize:17,fontWeight:700,color:C.text}}>Visual Inspection 업로드</div>
              <div style={{fontSize:12,color:C.dim,marginTop:2}}>사진 + PPT 파일을 Drive에 저장합니다</div>
            </div>
          </div>
          <div style={{background:C.bg,borderRadius:12,padding:'14px 16px',marginBottom:10}}>
            {SIDES.map(side => {
              const cnt = VISUAL_ITEMS.filter(it=>visualData[side][it.id]).length;
              if (cnt===0) return null;
              return (
                <div key={side} style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                  <span style={{fontSize:13,color:C.text,fontWeight:600}}>{SIDE_LABEL[side]}</span>
                  <span style={{fontFamily:FONT_MONO,fontSize:13,color:C.blue}}>{cnt} / {VISUAL_ITEMS.length}장</span>
                </div>
              );
            })}
            <div style={{height:1,background:C.border,margin:'4px 0 8px'}}/>
            <div style={{display:'flex',justifyContent:'space-between'}}>
              <span style={{fontSize:13,color:C.dim}}>총</span>
              <span style={{fontFamily:FONT_MONO,fontSize:16,fontWeight:700,color:C.blue}}>{totalShots}장</span>
            </div>
          </div>
          <div style={{background:C.bg,borderRadius:10,padding:'10px 14px',marginBottom:20,display:'flex',alignItems:'flex-start',gap:8}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{marginTop:2,flexShrink:0}}><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" stroke={C.dim} strokeWidth="1.5"/></svg>
            <div style={{fontSize:11,color:C.dim,fontFamily:FONT_MONO,lineHeight:1.6}}>
              내 드라이브 &gt; HANSAE &gt;<br/>
              <span style={{color:C.text}}>{sessionInfo.folderName}</span><br/>
              <span style={{color:C.dimmer}}>&gt; Visual_Inspection/</span>
            </div>
          </div>
          <div style={{display:'flex',gap:8}}>
            <button onClick={onClose} style={{flex:1,height:48,borderRadius:12,background:'none',border:`1px solid ${C.border}`,color:C.text,fontSize:14,fontWeight:500,fontFamily:FONT_SANS,cursor:'pointer'}}>취소</button>
            <button onClick={startUpload} style={{flex:2,height:48,borderRadius:12,background:C.blue,color:'#fff',fontSize:14,fontWeight:700,fontFamily:FONT_SANS,border:'none',cursor:'pointer'}}>
              업로드 시작
            </button>
          </div>
        </>)}

        {phase==='uploading' && (
          <div style={{textAlign:'center',padding:'8px 0'}}>
            <div style={{width:64,height:64,borderRadius:32,margin:'0 auto 20px',background:`${C.blue}25`,border:`1px solid ${C.blue}60`,display:'flex',alignItems:'center',justifyContent:'center'}}>
              <div style={{width:28,height:28,border:`3px solid ${C.blue}`,borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
            </div>
            <div style={{fontSize:16,fontWeight:700,color:C.text,marginBottom:6}}>사진 업로드 중...</div>
            <div style={{fontSize:13,color:C.dim,marginBottom:20}}>{progress.name} · {progress.current}/{progress.total}장</div>
            <div style={{height:4,background:C.bg,borderRadius:2,overflow:'hidden'}}>
              <div style={{height:'100%',background:C.blue,borderRadius:2,width:`${progress.total>0?(progress.current/progress.total)*100:0}%`,transition:'width 0.3s ease'}}/>
            </div>
          </div>
        )}

        {phase==='ppt' && (
          <div style={{textAlign:'center',padding:'8px 0'}}>
            <div style={{width:64,height:64,borderRadius:32,margin:'0 auto 20px',background:`${C.blue}25`,border:`1px solid ${C.blue}60`,display:'flex',alignItems:'center',justifyContent:'center'}}>
              <div style={{width:28,height:28,border:`3px solid #5B9BD5`,borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
            </div>
            <div style={{fontSize:16,fontWeight:700,color:C.text,marginBottom:6}}>Visual PPT 생성 중...</div>
            <div style={{fontSize:13,color:C.dim}}>Drive에 PPT 파일을 저장하고 있습니다</div>
          </div>
        )}

        {phase==='done' && (
          <div style={{textAlign:'center',padding:'8px 0'}}>
            <div style={{width:64,height:64,borderRadius:32,margin:'0 auto 20px',background:`${C.blue}25`,border:`1px solid ${C.blue}`,display:'flex',alignItems:'center',justifyContent:'center'}}>
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><path d="M6 14l6 6L22 8" stroke={C.blue} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            <div style={{fontSize:18,fontWeight:700,color:C.text,marginBottom:6}}>업로드 완료!</div>
            <div style={{fontSize:13,color:C.dim,marginBottom:6}}>사진 {totalShots}장 + Visual PPT가 Drive에 저장됐습니다</div>
            <div style={{fontSize:10,color:C.dimmer,fontFamily:FONT_MONO,marginBottom:24,lineHeight:1.5}}>
              HANSAE &gt; {sessionInfo.folderName}
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              <a href={driveLink} target="_blank" rel="noopener noreferrer"
                style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8,height:48,borderRadius:12,background:C.blue,color:'#fff',textDecoration:'none',fontSize:14,fontWeight:700}}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                Drive에서 열기
              </a>
              <button onClick={onDone} style={{height:44,borderRadius:12,background:'none',border:`1px solid ${C.border}`,color:C.text,fontSize:14,fontWeight:500,fontFamily:FONT_SANS,cursor:'pointer'}}>확인</button>
            </div>
          </div>
        )}

        {phase==='error' && (
          <div style={{textAlign:'center',padding:'8px 0'}}>
            <div style={{fontSize:40,marginBottom:16}}>⚠️</div>
            <div style={{fontSize:16,fontWeight:700,color:C.danger,marginBottom:8}}>업로드 실패</div>
            <div style={{fontSize:12,color:C.dim,marginBottom:20,lineHeight:1.6}}>{errorMsg}</div>
            <div style={{display:'flex',gap:8}}>
              <button onClick={onClose} style={{flex:1,height:44,borderRadius:10,background:'none',border:`1px solid ${C.border}`,color:C.text,cursor:'pointer'}}>닫기</button>
              <button onClick={startUpload} style={{flex:1,height:44,borderRadius:10,background:C.blue,color:'#fff',border:'none',fontWeight:700,cursor:'pointer'}}>재시도</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Toast ────────────────────────────────────────────────────
function Toast({ message, visible }) {
  return (
    <div style={{position:'absolute',bottom:visible?90:40,left:'50%',transform:'translateX(-50%)',
      background:C.surfaceHi,border:`1px solid ${C.border}`,padding:'10px 16px',borderRadius:24,
      color:C.text,fontSize:13,fontFamily:FONT_SANS,opacity:visible?1:0,transition:'all 0.3s',
      pointerEvents:'none',zIndex:300,boxShadow:'0 10px 30px rgba(0,0,0,0.4)',whiteSpace:'nowrap'}}>
      {message}
    </div>
  );
}

// ─── CaptureMethodSheet ───────────────────────────────────────
function CaptureMethodSheet({ title, onCamera, onGallery, onClose }) {
  return (
    <div style={{position:'absolute',inset:0,zIndex:150,background:'rgba(15,23,42,0.45)',backdropFilter:'blur(8px)',display:'flex',alignItems:'flex-end',justifyContent:'center'}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:C.surfaceEl,border:`1px solid ${C.border}`,borderRadius:'28px 28px 0 0',width:'100%',maxWidth:480,padding:'24px 20px',paddingBottom:'max(24px, env(safe-area-inset-bottom))',boxShadow:'0 -8px 32px rgba(15,23,42,0.12)'}}>
        {/* 핸들 */}
        <div style={{width:36,height:4,borderRadius:999,background:C.border,margin:'0 auto 20px'}}/>
        {title && <div style={{fontSize:13,color:C.dim,marginBottom:20,textAlign:'center',fontFamily:FONT_SANS,fontWeight:600}}>{title}</div>}
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          <button onClick={onCamera} style={{height:56,borderRadius:16,background:C.accent,color:'#fff',fontSize:16,fontWeight:700,fontFamily:FONT_SANS,border:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:10,boxShadow:`0 8px 24px rgba(59,130,246,0.3)`}}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M9 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2h-4l-1.5-2h-3L9 3z" stroke="currentColor" strokeWidth="1.8" fill="none"/><circle cx="12" cy="13" r="4" stroke="currentColor" strokeWidth="1.8"/></svg>
            카메라로 촬영
          </button>
          <button onClick={onGallery} style={{height:56,borderRadius:16,background:C.surface,color:C.text,fontSize:16,fontWeight:600,fontFamily:FONT_SANS,border:`1.5px solid ${C.border}`,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:10}}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="14" rx="2" stroke={C.accent} strokeWidth="1.8"/><circle cx="9" cy="11" r="1.5" fill={C.accent}/><path d="M3 17l5-4 4 3 4-3 5 4" stroke={C.accent} strokeWidth="1.6" fill="none"/></svg>
            갤러리에서 선택
          </button>
          <button onClick={onClose} style={{height:48,borderRadius:14,background:'none',border:`1.5px solid ${C.border}`,color:C.dimmer,fontSize:15,fontFamily:FONT_SANS,cursor:'pointer',marginTop:2}}>취소</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ─── 메인 앱 ─────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════
function CaptureApp() {
  const [accessToken,      setAccessToken]      = useState(null);
  const [appMode,          setAppMode]          = useState('360');   // '360' | 'visual'
  // ── 360° 상태 ────────────────────────────────────────────────
  const [selectedSides,    setSelectedSides]    = useState({ outboard:true, inboard:false });
  const [segments,         setSegments]         = useState({ outboard:6, inboard:6 });
  const [capturedData,     setCapturedData]     = useState({ outboard:emptyCapture(), inboard:emptyCapture() });
  const [activeId,         setActiveId]         = useState(null);
  const [activeSide,       setActiveSide]       = useState(null);
  const [shotIndex,        setShotIndex]        = useState(0);
  const [paused,           setPaused]           = useState(false);
  const [flipped,          setFlipped]          = useState(false);
  const [view,             setView]             = useState('capture');
  const [showUpload,       setShowUpload]       = useState(false);
  const [confirmRetake,    setConfirmRetake]    = useState(null);
  const [confirmSwitch,    setConfirmSwitch]    = useState(null);
  // ── Visual Inspection 상태 ───────────────────────────────────
  const [visualData,       setVisualData]       = useState({ outboard:emptyVisual(), inboard:emptyVisual() });
  const [visualItem,       setVisualItem]       = useState(null);   // { side, itemId }
  const [showVisualUpload, setShowVisualUpload] = useState(false);
  // ── 공통 상태 ────────────────────────────────────────────────
  const [defaultZoom,      setDefaultZoom]      = useState(1.0);
  const [toast,            setToast]            = useState(null);
  const [driveResult,      setDriveResult]      = useState(null);
  const [methodTarget,     setMethodTarget]     = useState(null); // {type:'360'|'visual', side, productId?, itemId?}

  // OAuth redirect 처리
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) return;
    const params = new URLSearchParams(hash.slice(1));
    const token  = params.get('access_token');
    if (token) { setAccessToken(token); window.history.replaceState(null,'',window.location.pathname); }
  }, []);

  const showToast = useCallback((msg) => {
    setToast(msg); setTimeout(()=>setToast(null), 2500);
  }, []);

  // ── 진행 계산 ──────────────────────────────────────────────
  const progressBySide = useMemo(()=>{
    const res={};
    for (const side of SIDES) {
      const p={}; for (const [k,arr] of Object.entries(capturedData[side])) p[k]=arr.length;
      res[side]=p;
    }
    return res;
  }, [capturedData]);

  const totalShotsFor   = s => Object.values(progressBySide[s]).reduce((a,b)=>a+b,0);
  const totalExpectedFor= s => PRODUCTS.reduce((sum,p)=>sum+shotCount(p,segments[s]),0);
  const allDoneFor      = s => selectedSides[s] && totalShotsFor(s)===totalExpectedFor(s);

  const isShooting    = !!activeId;
  const anyShotsTotal = SIDES.some(s=>totalShotsFor(s)>0);
  const allSidesDone  = SIDES.filter(s=>selectedSides[s]).every(s=>allDoneFor(s));
  const activeProd    = PRODUCTS.find(p=>p.id===activeId);

  // ── 셔터 콜백 ──────────────────────────────────────────────
  const handleCapture = useCallback((blob,url)=>{
    const prod  = PRODUCTS.find(p=>p.id===activeId);
    const total = shotCount(prod, segments[activeSide]);
    const next  = shotIndex+1;
    setCapturedData(prev=>({ ...prev, [activeSide]:{ ...prev[activeSide], [activeId]:[...prev[activeSide][activeId],{blob,url}] } }));
    if (activeId==='cage' && next===segments[activeSide] && !flipped) { setShotIndex(next); setPaused(true); return; }
    if (next>=total) { setShotIndex(0); setActiveId(null); setActiveSide(null); setFlipped(false); showToast(`${prod.name} 촬영 완료 · ${total}장`); return; }
    setShotIndex(next);
  }, [activeId, activeSide, shotIndex, segments, flipped, showToast]);

  // 촬영 시작 (side 전환 확인 포함)
  const startCapture = (productId, side) => {
    if (isShooting) return;
    const otherSide     = side==='outboard'?'inboard':'outboard';
    const hasOtherShots = totalShotsFor(otherSide) > 0;
    const hasThisShots  = totalShotsFor(side) > 0;
    if (hasOtherShots && !hasThisShots) {
      setConfirmSwitch({ side, productId }); return;
    }
    doStartCapture(productId, side);
  };

  const doStartCapture = (productId, side) => {
    setCapturedData(prev=>({ ...prev, [side]:{ ...prev[side], [productId]:[] } }));
    setShotIndex(0); setPaused(false); setFlipped(false);
    setActiveSide(side); setActiveId(productId);
  };

  const stopCapture = () => {
    setActiveId(null); setActiveSide(null); setShotIndex(0); setPaused(false); setFlipped(false);
    showToast('촬영 중단됨');
  };

  const retakeProduct = ({side,productId}) => {
    setCapturedData(prev=>({ ...prev, [side]:{ ...prev[side], [productId]:[] } }));
    setConfirmRetake(null); setView('capture');
    setTimeout(()=>doStartCapture(productId,side), 50);
  };

  const resetAll = () => {
    if (isShooting) return;
    setCapturedData({ outboard:emptyCapture(), inboard:emptyCapture() });
    showToast('모든 촬영 데이터 초기화됨');
  };


  // ── 갤러리 선택 콜백 (360°) ──────────────────────────────
  const handleGallery360 = useCallback(async (side, productId) => {
    setMethodTarget(null);
    const prod  = PRODUCTS.find(p=>p.id===productId);
    const total = shotCount(prod, segments[side]);
    const [rw,rh] = CROP_RATIO[productId]||[4,3];
    const files = await pickFromGallery(true);
    if (!files.length) return;
    const results = await Promise.all(files.slice(0,total).map(f=>cropToRatio(f,rw,rh)));
    setCapturedData(prev=>({...prev,[side]:{...prev[side],[productId]:results}}));
    showToast(`${prod.name} · ${results.length}장 갤러리에서 선택됨`);
  }, [segments, showToast]);

  // ── 갤러리 선택 콜백 (Visual) ────────────────────────────
  const handleGalleryVisual = useCallback(async (side, itemId) => {
    setMethodTarget(null);
    const vit = VISUAL_ITEMS.find(x=>x.id===itemId);
    const [rw,rh] = CROP_RATIO[vit?.ratioKey||'ball']||[4,3];
    const files = await pickFromGallery(false);
    if (!files.length) return;
    const result = await cropToRatio(files[0],rw,rh);
    setVisualData(prev=>({...prev,[side]:{...prev[side],[itemId]:result}}));
    showToast(`${vit?.name} 갤러리에서 선택 완료`);
  }, [showToast]);

  // ── Visual 셔터 콜백 ───────────────────────────────────────
  const handleVisualCapture = useCallback((blob, url) => {
    const { side, itemId } = visualItem;
    setVisualData(prev => ({ ...prev, [side]:{ ...prev[side], [itemId]:{ blob, url } } }));
    setVisualItem(null);
    showToast(`${VISUAL_ITEMS.find(x=>x.id===itemId)?.name} 촬영 완료`);
  }, [visualItem, showToast]);

  // ── 로그인 전 ──────────────────────────────────────────────
  if (!accessToken) return <LoginScreen onLogin={setAccessToken}/>;

  // ── 카메라 (Visual 모드) ───────────────────────────────────
  if (visualItem) {
    const vit = VISUAL_ITEMS.find(x=>x.id===visualItem.itemId);
    return (
      <div style={{height:'100%',position:'relative',background:'#000'}}>
        <CameraScreen
          product={{ id: vit?.ratioKey || 'ball', name:vit?.name||'' }}
          segments={1} shotIndex={0} totalShots={1} paused={false}
          capturedImages={[]}
          onCapture={handleVisualCapture}
          onStop={()=>setVisualItem(null)}
          onResume={()=>{}}
          defaultZoom={defaultZoom} onZoomChange={setDefaultZoom}
        />
      </div>
    );
  }

  // ── 카메라 화면 (360 모드) ─────────────────────────────────
  if (activeId) return (
    <div style={{height:'100%',position:'relative',background:'#000'}}>
      <CameraScreen
        product={activeProd} segments={segments[activeSide]}
        shotIndex={shotIndex} totalShots={shotCount(activeProd,segments[activeSide])}
        paused={paused}
        capturedImages={capturedData[activeSide][activeId].map(x=>x.url)}
        onCapture={handleCapture} onStop={stopCapture}
        onResume={()=>{ setFlipped(true); setPaused(false); }}
        defaultZoom={defaultZoom} onZoomChange={setDefaultZoom}
      />
    </div>
  );

  // ── 갤러리 화면 ────────────────────────────────────────────
  if (view==='gallery') {
    const allShots=[];
    for (const side of SIDES) { if (!selectedSides[side]) continue; for (const prod of PRODUCTS) { capturedData[side][prod.id].forEach((s,i)=>allShots.push({side,prod,s,i})); } }
    return (
      <div style={{height:'100%',display:'flex',flexDirection:'column',background:C.bg,fontFamily:FONT_SANS,color:C.text,position:'relative'}}>
        <div style={{padding:'16px 20px 8px',paddingTop:'max(16px, env(safe-area-inset-top))',display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}}>
          <button onClick={()=>setView('capture')} style={{background:'none',border:'none',color:C.text,fontSize:14,cursor:'pointer',display:'flex',alignItems:'center',gap:4,padding:0}}>
            <svg width="16" height="16" viewBox="0 0 16 16"><path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>촬영
          </button>
          <div style={{fontSize:12,fontWeight:700,letterSpacing:1,fontFamily:FONT_MONO}}>GALLERY</div>
          <div style={{fontFamily:FONT_MONO,fontSize:11,color:C.dim}}>{allShots.length}장</div>
        </div>
        <div style={{flex:1,overflowY:'auto',padding:'8px 16px 16px'}}>
          {SIDES.map(side=>{ if (!selectedSides[side]) return null; return (
            <div key={side}>
              <div style={{fontSize:10,color:C.blue,fontFamily:FONT_MONO,letterSpacing:1.5,padding:'8px 4px 6px',fontWeight:700}}>— {SIDE_LABEL[side].toUpperCase()}</div>
              {PRODUCTS.map(p=>{ const shots=capturedData[side][p.id]; if (shots.length===0) return null; return (
                <div key={p.id} style={{marginBottom:20}}>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                    <div style={{display:'flex',alignItems:'center',gap:8}}><ProductIcon id={p.id} size={16}/><span style={{fontSize:12,fontWeight:700,letterSpacing:0.4}}>{p.name}</span></div>
                    <div style={{display:'flex',alignItems:'center',gap:8}}>
                      <span style={{fontFamily:FONT_MONO,fontSize:11,color:C.accent}}>{shots.length}장</span>
                      <button onClick={()=>setConfirmRetake({side,productId:p.id})} style={{background:'none',border:`1px solid ${C.border}`,color:C.text,padding:'4px 10px',borderRadius:14,fontSize:11,cursor:'pointer'}}>재촬영</button>
                    </div>
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:6}}>
                    {shots.map((s,i)=><Thumb key={i} product={p.id} idx={i+1} imageUrl={s.url} onTap={()=>showToast(`${SIDE_LABEL[side]}·${p.id}_${String(i+1).padStart(2,'0')}.jpg`)}/>)}
                  </div>
                </div>
              ); })}
            </div>
          ); })}
          {allShots.length===0 && <div style={{textAlign:'center',padding:'80px 20px',color:C.dim,fontSize:13}}>아직 촬영된 사진이 없습니다</div>}
        </div>
        {confirmRetake && (()=>{
          const p=PRODUCTS.find(x=>x.id===confirmRetake.productId);
          return (
            <div style={{position:'absolute',inset:0,zIndex:120,background:'rgba(0,0,0,0.7)',backdropFilter:'blur(6px)',display:'flex',alignItems:'center',justifyContent:'center',padding:'0 28px'}} onClick={()=>setConfirmRetake(null)}>
              <div onClick={e=>e.stopPropagation()} style={{background:C.surface,border:`1px solid ${C.borderHi}`,borderRadius:16,padding:'22px 22px 18px',width:'100%',maxWidth:320}}>
                <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
                  <ProductIcon id={p.id} size={32}/><div><div style={{fontSize:15,fontWeight:700}}>{p.name} 재촬영</div><div style={{fontSize:11,color:C.dim,marginTop:2}}>{SIDE_LABEL[confirmRetake.side]} · {capturedData[confirmRetake.side][p.id].length}장 삭제</div></div>
                </div>
                <div style={{display:'flex',gap:8}}>
                  <button onClick={()=>setConfirmRetake(null)} style={{flex:1,height:44,borderRadius:10,background:'none',border:`1px solid ${C.border}`,color:C.text,cursor:'pointer'}}>취소</button>
                  <button onClick={()=>retakeProduct(confirmRetake)} style={{flex:1.4,height:44,borderRadius:10,background:C.accent,color:C.bg,border:'none',fontWeight:700,cursor:'pointer'}}>삭제 후 재촬영</button>
                </div>
              </div>
            </div>
          );
        })()}
        <Toast message={toast||''} visible={!!toast}/>
      </div>
    );
  }

  // ── 메인 캡처 화면 ─────────────────────────────────────────
  return (
    <div style={{height:'100%',display:'flex',flexDirection:'column',background:C.bg,fontFamily:FONT_SANS,color:C.text,position:'relative'}}>

      {/* 헤더 */}
      <div style={{padding:'14px 16px 0',paddingTop:'max(14px, env(safe-area-inset-top))',background:C.surface,borderBottom:`1px solid ${C.border}`}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,marginBottom:12}}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <div style={{width:36,height:36,borderRadius:12,background:C.accent,display:'flex',alignItems:'center',justifyContent:'center',boxShadow:`0 4px 12px rgba(59,130,246,0.3)`}}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#fff" strokeWidth="2"/><circle cx="12" cy="12" r="4" stroke="#fff" strokeWidth="1.5" opacity="0.6"/><circle cx="12" cy="12" r="1.5" fill="#fff"/></svg>
            </div>
            <div>
              <div style={{fontSize:11,color:C.dim,fontFamily:FONT_MONO,letterSpacing:1.5,fontWeight:600}}>JOINT REPORT</div>
              <div style={{fontSize:17,fontWeight:800,color:C.text,fontFamily:FONT_DISPLAY,letterSpacing:-0.3,lineHeight:1.1}}>
                {appMode==='360'?'360° Inspection':'Visual Inspection'}
              </div>
            </div>
          </div>
          <div style={{display:'flex',gap:6}}>
            <button onClick={()=>{ setAccessToken(null); resetAll(); setVisualData({outboard:emptyVisual(),inboard:emptyVisual()}); }} style={{width:36,height:36,borderRadius:12,background:C.surfaceHi,border:`1px solid ${C.border}`,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer'}}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 2h3a1 1 0 011 1v10a1 1 0 01-1 1h-3" stroke={C.dim} strokeWidth="1.4" strokeLinecap="round"/><path d="M7 11l3-3-3-3M10 8H3" stroke={C.text} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
            <button onClick={()=>{ if(appMode==='360') resetAll(); else setVisualData({outboard:emptyVisual(),inboard:emptyVisual()}); }} disabled={isShooting} style={{width:36,height:36,borderRadius:12,background:C.surfaceHi,border:`1px solid ${C.border}`,display:'flex',alignItems:'center',justifyContent:'center',cursor:isShooting?'not-allowed':'pointer',opacity:isShooting?0.4:1}}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8a5 5 0 109-3" stroke={C.text} strokeWidth="1.5" strokeLinecap="round"/><path d="M12 2v3h-3" stroke={C.text} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          </div>
        </div>
        {/* 모드 탭 */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,marginBottom:14,background:C.surfaceHi,borderRadius:14,padding:4}}>
          {[{id:'360',label:'360° Inspection'},{id:'visual',label:'Visual Inspection'}].map(m=>{
            const active=appMode===m.id;
            return (
              <button key={m.id} onClick={()=>setAppMode(m.id)} style={{
                padding:'9px 4px',borderRadius:10,fontFamily:FONT_SANS,fontSize:12,fontWeight:active?700:500,
                background:active?C.surfaceEl:'transparent',
                border:'none',
                color:active?C.accent:C.dimmer,
                cursor:'pointer',transition:'all 0.2s',
                boxShadow:active?'0 2px 8px rgba(15,23,42,0.08)':'none',
              }}>{m.label}</button>
            );
          })}
        </div>
      </div>

      <div style={{flex:1,overflowY:'auto',padding:'0 14px 14px'}}>

      {/* ── Visual Inspection 화면 ── */}
      {appMode==='visual' && (
        <div>
          {SIDES.map(side => {
            const sideShots = VISUAL_ITEMS.filter(it=>visualData[side][it.id]).length;
            const sideDone  = sideShots===VISUAL_ITEMS.length;
            return (
              <div key={side} style={{borderRadius:16,marginBottom:12,border:`2px solid ${sideDone?C.blue+'80':C.border}`,background:C.surface}}>
                {/* 섹션 헤더 */}
                <div style={{padding:'10px 14px',borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',justifyContent:'space-between',borderRadius:'14px 14px 0 0'}}>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <div style={{width:8,height:8,borderRadius:4,background:sideDone?C.blue:C.dimmer}}/>
                    <span style={{fontSize:13,fontWeight:700,letterSpacing:0.8,color:sideDone?C.blue:C.text}}>{SIDE_LABEL[side].toUpperCase()}</span>
                    {sideDone && <span style={{fontSize:9,color:C.blue,fontFamily:FONT_MONO,background:`${C.blue}18`,padding:'2px 6px',borderRadius:4}}>✓ DONE</span>}
                  </div>
                  <span style={{fontFamily:FONT_MONO,fontSize:11,color:sideDone?C.blue:C.dim}}>{sideShots}<span style={{color:C.dimmer}}>/{VISUAL_ITEMS.length}</span></span>
                </div>
                {/* 3×2 그리드 */}
                <div style={{padding:10,display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:6}}>
                  {VISUAL_ITEMS.map(item => {
                    const shot = visualData[side][item.id];
                    const done = !!shot;
                    return (
                      <button key={item.id} onClick={()=>setMethodTarget({type:'visual',side,itemId:item.id})} style={{
                        border:`1.5px solid ${done?C.blue+'60':C.border}`,borderRadius:10,
                        background:done?`${C.blue}08`:C.surfaceHi,
                        padding:0,overflow:'hidden',cursor:'pointer',
                        display:'flex',flexDirection:'column',
                      }}>
                        {/* 썸네일 (4:3 비율) */}
                        <div style={{width:'100%',aspectRatio:'4/3',background:done?'transparent':C.bg,position:'relative',overflow:'hidden'}}>
                          {done
                            ? <img src={shot.url} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>
                            : <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center'}}>
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="4" stroke={C.dimmer} strokeWidth="1.4"/><path d="M9 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2h-4l-1.5-2h-3L9 3z" stroke={C.dimmer} strokeWidth="1.4" fill="none"/></svg>
                              </div>
                          }
                          {done && <div style={{position:'absolute',top:3,right:3,width:16,height:16,borderRadius:8,background:C.blue,display:'flex',alignItems:'center',justifyContent:'center'}}>
                            <svg width="9" height="9" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5L8 2.5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/></svg>
                          </div>}
                        </div>
                        {/* 항목명 */}
                        <div style={{padding:'4px 6px 5px',textAlign:'left'}}>
                          <div style={{fontSize:8.5,fontWeight:done?700:500,color:done?C.blue:C.dim,fontFamily:FONT_SANS,lineHeight:1.3,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{item.name}</div>
                          <div style={{fontSize:7.5,color:done?C.blue:C.dimmer,fontFamily:FONT_MONO,marginTop:1}}>{done?'재촬영':'촬영하기'}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── 360° Inspection 화면 ── */}
      {appMode==='360' && <>

        {/* STEP 1: Side 선택 */}
        <div style={{marginBottom:12}}>
          <div style={{fontSize:9,color:C.dim,fontFamily:FONT_MONO,letterSpacing:1.2,padding:'0 4px 7px'}}>STEP 1 · SIDE SELECTION</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            {SIDES.map(side=>{
              const selected=selectedSides[side], done=allDoneFor(side);
              return (
                <button key={side} onClick={()=>{
                  if (isShooting) { showToast('촬영 중에는 변경 불가'); return; }
                  const next={...selectedSides,[side]:!selected};
                  if (!next.outboard&&!next.inboard) { showToast('최소 한 면을 선택해야 합니다'); return; }
                  setSelectedSides(next);
                }} style={{padding:'12px',borderRadius:12,fontFamily:FONT_SANS,background:selected?`${C.blue}22`:C.surface,border:`1px solid ${selected?C.blue:C.border}`,color:selected?C.text:C.dim,cursor:isShooting?'not-allowed':'pointer',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                  <div>
                    <div style={{fontSize:14,fontWeight:700,letterSpacing:0.3,textAlign:'left'}}>{SIDE_LABEL[side]}</div>
                    {selected&&<div style={{fontSize:9,fontFamily:FONT_MONO,color:done?C.accent:C.dim,marginTop:3}}>{done?'✓ 완료':`${totalShotsFor(side)}/${totalExpectedFor(side)}`}</div>}
                  </div>
                  <div style={{width:20,height:20,borderRadius:10,flexShrink:0,background:selected?C.blue:'transparent',border:`1.5px solid ${selected?C.blue:C.border}`,display:'flex',alignItems:'center',justifyContent:'center'}}>
                    {selected&&<svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5L8 2.5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Outboard / Inboard 섹션 — 독립 카드 */}
        {SIDES.map(side=>{
          if (!selectedSides[side]) return null;
          const segs         = segments[side];
          const sideProgress = progressBySide[side];
          const sideTotalShots  = totalShotsFor(side);
          const sideExpected    = totalExpectedFor(side);
          const sideDone        = allDoneFor(side);
          const isActive        = activeSide===side;
          const segLocked       = isActive || sideTotalShots>0;

          return (
            <div key={side} style={{
              borderRadius:16,marginBottom:12,
              border:`2px solid ${isActive?C.accent+'70':sideDone?C.accentDim+'50':C.border}`,
              background:isActive?`${C.accent}06`:C.surface,
              boxShadow:isActive?`0 0 24px ${C.accent}18`:'none',
              transition:'all 0.3s',
            }}>
              {/* 섹션 헤더 */}
              <div style={{padding:'11px 14px',borderBottom:`1px solid ${isActive?C.accent+'30':C.border}`,display:'flex',alignItems:'center',justifyContent:'space-between',background:isActive?`${C.accent}08`:'transparent',borderRadius:'14px 14px 0 0'}}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <div style={{width:8,height:8,borderRadius:4,background:isActive?C.accent:sideDone?C.accentDim:C.blue,boxShadow:isActive?`0 0 8px ${C.accent}`:'none',animation:isActive?'pulse 1.2s ease-in-out infinite':'none'}}/>
                  <span style={{fontSize:13,fontWeight:700,letterSpacing:0.8,color:isActive?C.accent:C.text}}>
                    {SIDE_LABEL[side].toUpperCase()}
                  </span>
                  {isActive&&<span style={{fontSize:9,color:C.accent,fontFamily:FONT_MONO,background:`${C.accent}18`,padding:'2px 6px',borderRadius:4}}>● CAPTURING</span>}
                  {sideDone&&!isActive&&<span style={{fontSize:9,color:C.accentDim,fontFamily:FONT_MONO,background:`${C.accentDim}18`,padding:'2px 6px',borderRadius:4}}>✓ DONE</span>}
                </div>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <div style={{fontFamily:FONT_MONO,fontSize:11,color:sideDone?C.accent:C.dim}}>
                    {sideTotalShots}<span style={{color:C.dimmer}}>/{sideExpected}</span>
                  </div>
                  {/* 진행 미니 바 */}
                  <div style={{width:48,height:4,background:C.border,borderRadius:2,overflow:'hidden'}}>
                    <div style={{height:'100%',width:`${sideExpected>0?(sideTotalShots/sideExpected)*100:0}%`,background:sideDone?C.accent:isActive?C.accent:C.blue,borderRadius:2,transition:'width 0.4s ease'}}/>
                  </div>
                </div>
              </div>

              {/* 구간 선택 */}
              <div style={{padding:'10px 14px',borderBottom:`1px solid ${C.border}`}}>
                <div style={{fontSize:9,color:C.dimmer,fontFamily:FONT_MONO,letterSpacing:1,marginBottom:6,display:'flex',alignItems:'center',gap:6}}>
                  구간 선택
                  {segLocked&&<span style={{color:C.amber,background:`${C.amber}15`,border:`1px solid ${C.amber}30`,padding:'1px 5px',borderRadius:3,fontSize:8}}>LOCKED</span>}
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
                  {[6,8].map(n=>{
                    const active=segs===n;
                    return (
                      <button key={n} onClick={()=>{ if (segLocked){showToast('촬영 시작 후에는 구간 변경 불가');return;} setSegments(prev=>({...prev,[side]:n})); }} style={{padding:'8px 10px',borderRadius:9,fontFamily:FONT_SANS,background:active?C.accent:C.bg,border:`1px solid ${active?C.accent:C.border}`,color:active?C.bg:C.text,cursor:segLocked?'not-allowed':'pointer',opacity:segLocked&&!active?0.35:1,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                        <div><div style={{fontSize:15,fontWeight:700}}>{n}구간</div><div style={{fontSize:8,opacity:0.7,fontFamily:FONT_MONO}}>{360/n}°</div></div>
                        <svg width="20" height="20" viewBox="0 0 20 20">
                          <circle cx="10" cy="10" r="7" fill="none" stroke={active?C.bg:C.dim} strokeWidth="1" opacity="0.4"/>
                          {Array.from({length:n}).map((_,i)=>{const a=(i*360/n-90)*Math.PI/180;return <circle key={i} cx={10+Math.cos(a)*7} cy={10+Math.sin(a)*7} r="1.3" fill={active?C.bg:C.text}/>;  })}
                        </svg>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 제품 카드 */}
              <div style={{padding:'10px 14px'}}>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                  {PRODUCTS.map(p=>{
                    const total = shotCount(p, segs);
                    const cnt   = sideProgress[p.id];
                    const status = (activeSide===side&&activeId===p.id)?'shooting':cnt===total?'done':'idle';
                    const dis    = isShooting || status==='done';
                    return <ProductCard key={p.id} product={p} segments={segs} status={status} count={cnt} onTap={()=>setMethodTarget({type:'360',side,productId:p.id})} disabled={dis}/>;
                  })}
                </div>
              </div>
            </div>
          );
        })}

        {/* 최근 촬영 미리보기 */}
        <div style={{marginBottom:6}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 4px 7px',fontSize:9,color:C.dim,fontFamily:FONT_MONO,letterSpacing:1.2}}>
            <span>RECENT SHOTS</span>
            <button onClick={()=>setView('gallery')} style={{background:'none',border:'none',color:C.accent,fontSize:10,fontFamily:FONT_MONO,letterSpacing:1.2,cursor:'pointer',padding:0}}>전체보기 →</button>
          </div>
          <div style={{background:C.surfaceHi,border:`1px solid ${C.border}`,borderRadius:12,padding:9,minHeight:64}}>
            {!anyShotsTotal ? (
              <div style={{padding:'14px',textAlign:'center',color:C.dimmer,fontSize:11,fontFamily:FONT_MONO}}>{'// 촬영을 시작하면 여기에 표시됩니다'}</div>
            ) : (
              <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:5}}>
                {SIDES.flatMap(side=>PRODUCTS.flatMap(p=>capturedData[side][p.id].slice(-1).map((s,i)=>({pid:p.id,url:s.url,i})))).slice(-10).map((x,k)=>(
                  <Thumb key={k} product={x.pid} idx={x.i+1} imageUrl={x.url} onTap={()=>showToast(`${x.pid}_${String(x.i+1).padStart(2,'0')}.jpg`)}/>
                ))}
              </div>
            )}
          </div>
        </div>
      </>}
      </div>

      {/* 하단 버튼 */}
      <div style={{padding:'12px 16px',paddingBottom:'max(16px, env(safe-area-inset-bottom))',borderTop:`1px solid ${C.border}`,background:C.surface,boxShadow:'0 -2px 12px rgba(15,23,42,0.06)'}}>
        {appMode==='360' ? (
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            <button onClick={()=>setView('gallery')} style={{width:56,height:56,borderRadius:16,background:C.surfaceHi,border:`1.5px solid ${C.border}`,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',flexShrink:0}}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="14" rx="2" stroke={C.accent} strokeWidth="1.7"/><circle cx="9" cy="11" r="1.5" fill={C.accent}/><path d="M3 17l5-4 4 3 4-3 5 4" stroke={C.accent} strokeWidth="1.6" fill="none" strokeLinejoin="round"/></svg>
            </button>
            <button disabled={!anyShotsTotal} onClick={()=>setShowUpload(true)} style={{flex:1,height:56,borderRadius:16,
              background:anyShotsTotal?(allSidesDone?C.accent:'#fff'):C.surfaceHi,
              border:`1.5px solid ${anyShotsTotal?(allSidesDone?C.accent:C.border):C.border}`,
              color:allSidesDone?'#fff':anyShotsTotal?C.accent:C.dimmer,
              fontSize:15,fontWeight:700,fontFamily:FONT_SANS,cursor:anyShotsTotal?'pointer':'not-allowed',
              display:'flex',alignItems:'center',justifyContent:'center',gap:8,
              boxShadow:allSidesDone?`0 8px 24px rgba(59,130,246,0.3)`:'none'}}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M7 18a4.5 4.5 0 01-.5-8.97A6 6 0 0118 9.5a4.5 4.5 0 01-.5 8.5H7z" stroke="currentColor" strokeWidth="1.7" fill="none"/><path d="M12 11v6M9.5 13.5L12 11l2.5 2.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Drive 업로드 + PPT
            </button>
          </div>
        ) : (()=>{
          const anyVisual = SIDES.some(s=>VISUAL_ITEMS.some(it=>visualData[s][it.id]));
          const allVisual = SIDES.every(s=>VISUAL_ITEMS.every(it=>visualData[s][it.id]));
          return (
            <button disabled={!anyVisual} onClick={()=>setShowVisualUpload(true)} style={{width:'100%',height:50,borderRadius:13,background:anyVisual?(allVisual?C.blue:C.surfaceHi):C.surface,border:`1.5px solid ${anyVisual?(allVisual?C.blue:C.borderHi):C.border}`,color:allVisual?'#fff':anyVisual?C.text:C.dimmer,fontSize:13,fontWeight:700,fontFamily:FONT_SANS,cursor:anyVisual?'pointer':'not-allowed',display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.7"/><circle cx="9" cy="11" r="1.5" fill="currentColor"/><path d="M3 17l5-4 4 3 4-3 5 4" stroke="currentColor" strokeWidth="1.6" fill="none"/></svg>
              Drive 업로드 + Visual PPT
            </button>
          );
        })()}
      </div>

      {/* Drive 업로드 모달 (360) */}
      {showUpload && <UploadModal capturedData={capturedData} selectedSides={selectedSides} segments={segments} accessToken={accessToken} onClose={()=>setShowUpload(false)} onDone={()=>{ setShowUpload(false); showToast('Google Drive 업로드 완료!'); }}/>}
      {/* Visual 업로드 모달 */}
      {showVisualUpload && <VisualUploadModal visualData={visualData} accessToken={accessToken} onClose={()=>setShowVisualUpload(false)} onDone={()=>{ setShowVisualUpload(false); showToast('Visual 업로드 완료!'); }}/>}

      {/* 섹션 전환 확인 모달 */}
      {confirmSwitch && (()=>{
        const { side, productId } = confirmSwitch;
        const otherSide = side==='outboard'?'inboard':'outboard';
        return (
          <div style={{position:'absolute',inset:0,zIndex:150,background:'rgba(0,0,0,0.72)',backdropFilter:'blur(8px)',display:'flex',alignItems:'center',justifyContent:'center',padding:'0 28px'}} onClick={()=>setConfirmSwitch(null)}>
            <div onClick={e=>e.stopPropagation()} style={{background:C.surface,border:`1px solid ${C.blue}`,borderRadius:18,padding:'24px 22px 20px',width:'100%',maxWidth:320}}>
              <div style={{width:44,height:44,borderRadius:22,background:`${C.blue}25`,border:`1px solid ${C.blue}`,display:'flex',alignItems:'center',justifyContent:'center',marginBottom:14}}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M8 7l-5 5 5 5M16 7l5 5-5 5" stroke={C.blue} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              <div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:6}}>섹션 전환</div>
              <div style={{fontSize:12,color:C.dim,lineHeight:1.6,marginBottom:20}}>
                {SIDE_LABEL[otherSide]}에 촬영된 사진이 있습니다.<br/>
                <strong style={{color:C.text}}>{SIDE_LABEL[side]}</strong> 촬영을 시작하시겠습니까?
              </div>
              <div style={{display:'flex',gap:8}}>
                <button onClick={()=>setConfirmSwitch(null)} style={{flex:1,height:44,borderRadius:10,background:'none',border:`1px solid ${C.border}`,color:C.text,cursor:'pointer',fontSize:13}}>취소</button>
                <button onClick={()=>{ setConfirmSwitch(null); doStartCapture(productId,side); }} style={{flex:1.4,height:44,borderRadius:10,background:C.blue,color:'#fff',border:'none',fontWeight:700,cursor:'pointer',fontSize:13}}>
                  {SIDE_LABEL[side]} 촬영 시작
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 촬영 방법 선택 모달 */}
      {methodTarget && (
        <CaptureMethodSheet
          title={methodTarget.type==='360'
            ? `${PRODUCTS.find(p=>p.id===methodTarget.productId)?.name} · ${SIDE_LABEL[methodTarget.side]}`
            : `${VISUAL_ITEMS.find(x=>x.id===methodTarget.itemId)?.name} · ${SIDE_LABEL[methodTarget.side]}`}
          onCamera={()=>{
            if (methodTarget.type==='360') {
              const {side, productId} = methodTarget;
              setMethodTarget(null);
              startCapture(productId, side);
            } else {
              const {side, itemId} = methodTarget;
              setMethodTarget(null);
              setVisualItem({side, itemId});
            }
          }}
          onGallery={()=>{
            if (methodTarget.type==='360') handleGallery360(methodTarget.side, methodTarget.productId);
            else handleGalleryVisual(methodTarget.side, methodTarget.itemId);
          }}
          onClose={()=>setMethodTarget(null)}
        />
      )}

      <Toast message={toast||''} visible={!!toast}/>
    </div>
  );
}

Object.assign(window, { CaptureApp });
