// ═══════════════════════════════════════════════════════════════
// generate-ppt.js — Joint Report PPT 자동 생성 (addTable 기반)
// pptxgenjs v3.12 CDN 사용 / window.generateJointReportPPT() 노출
// ═══════════════════════════════════════════════════════════════

// ── 디자인 상수 ─────────────────────────────────────────────────
const T = {
  bgSlide:    'FFFFFF',
  bgCover:    '0D4689',
  hdrCell:    '0D4689',  // 번호 셀 / 제품 헤더 (다크 네이비)
  secHdr:     '1F5C8B',  // Visual 섹션 헤더 (미드 네이비)
  hdrText:    'FFFFFF',
  cellBorder: 'BFBFBF',
  titleText:  '000000',
  accentLine: '00B0F0',
  coverTitle: 'FFFFFF',
  coverSub:   'BDD7EE',
  coverDate:  'D9E2F0',
};

const BORDER = { pt: 0.5, color: 'BFBFBF' };

// ── 유틸리티 ────────────────────────────────────────────────────
async function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function formatDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// 이미지 contain-fit 헬퍼
function calcImageFit(maxW, maxH, rw, rh) {
  const scale = Math.min(maxW / rw, maxH / rh);
  const w = rw * scale;
  const h = rh * scale;
  return { w, h, offX: (maxW - w) / 2, offY: (maxH - h) / 2 };
}

// ── 제품 정의 ────────────────────────────────────────────────────
const PRODUCTS_DEF = [
  { id: 'outer_race', name: 'OUTER RACE' },
  { id: 'inner_race', name: 'INNER RACE' },
  { id: 'cage',       name: 'CAGE'       },
  { id: 'ball',       name: 'BALL'       },
];

const CROP_RATIO_PPT = {
  outer_race: [3, 4],
  inner_race: [3, 4],
  cage:       [8, 3],
  ball:       [4, 3],
};

// ── 공통 슬라이드 헤더 ───────────────────────────────────────────
function addSlideHeader(slide, title) {
  slide.addText(title, {
    x: 3.8, y: 0.10, w: 9.33, h: 0.52,
    fontSize: 20, bold: true, color: T.titleText,
    align: 'right', fontFace: 'Arial', valign: 'middle',
  });
  slide.addShape('rect', {
    x: 0, y: 0, w: 0.18, h: 0.72,
    fill: { color: T.hdrCell }, line: { type: 'none' },
  });
  slide.addShape('rect', {
    x: 0.18, y: 0.68, w: 13.15, h: 0.035,
    fill: { color: T.accentLine }, line: { type: 'none' },
  });
}

// ── 헤더 셀 생성 헬퍼 ───────────────────────────────────────────
function makeHdrCell(text, colspan, bgColor) {
  const opts = {
    fill:    { color: bgColor || T.hdrCell },
    color:   T.hdrText,
    bold:    true,
    fontSize: 11,
    fontFace: 'Arial',
    align:   'center',
    valign:  'middle',
    border:  BORDER,
  };
  if (colspan && colspan > 1) opts.colspan = colspan;
  return { text, options: opts };
}

// 빈 사진 셀
function makePhotoCell(colspan) {
  const opts = { fill: { color: 'FFFFFF' }, border: BORDER };
  if (colspan && colspan > 1) opts.colspan = colspan;
  return { text: '', options: opts };
}

// ═══════════════════════════════════════════════════════════════
// 제품 슬라이드 — OUTER RACE / INNER RACE / CAGE  (addTable)
// 구조: 헤더 행 1줄 + (레이블 행 + 사진 행) × nPhotoRows
// ═══════════════════════════════════════════════════════════════
async function addProductSlide(pptx, title, shots, cols, ratioWH, labels = null) {
  const [rw, rh]   = ratioWH;
  const nPhotoRows = Math.ceil(shots.length / cols);

  const slide = pptx.addSlide();
  slide.background = { color: T.bgSlide };
  addSlideHeader(slide, title);

  const mx      = 0.22;
  const startY  = 0.82;
  const availW  = 13.33 - mx * 2;          // 12.89"
  const availH  = 7.5  - startY - 0.10;   // 6.58"
  const hdrH    = 0.30;
  const lblH    = 0.26;
  const pad     = 0.05;

  const photoH = +((availH - hdrH - nPhotoRows * lblH) / nPhotoRows).toFixed(4);
  const cellW  = +(availW / cols).toFixed(4);

  const colWArr = Array(cols).fill(cellW);
  const rowHArr = [hdrH];
  for (let r = 0; r < nPhotoRows; r++) {
    rowHArr.push(lblH);
    rowHArr.push(photoH);
  }

  // ── 표 행 빌드 ──────────────────────────────────────────────
  const tableRows = [];

  // 헤더 행 (colspan=전체 cols)
  tableRows.push([ makeHdrCell(title, cols) ]);

  for (let r = 0; r < nPhotoRows; r++) {
    const si = r * cols;

    // 레이블 행
    const lblRow = [];
    for (let c = 0; c < cols; c++) {
      const i   = si + c;
      const lbl = labels ? (labels[i] || '') : (i < shots.length ? `#${i + 1}` : '');
      lblRow.push(makeHdrCell(lbl, 1));
    }
    tableRows.push(lblRow);

    // 사진 행 (빈 셀 — 이미지는 오버레이)
    tableRows.push(Array(cols).fill(null).map(() => makePhotoCell(1)));
  }

  slide.addTable(tableRows, {
    x:    mx,
    y:    startY,
    colW: colWArr,
    rowH: rowHArr,
  });

  // ── 이미지 오버레이 ─────────────────────────────────────────
  for (let i = 0; i < shots.length; i++) {
    if (!shots[i] || !shots[i].blob) continue;
    const col  = i % cols;
    const row  = Math.floor(i / cols);
    const cellX = mx + col * cellW;
    const cellY = startY + hdrH + row * (lblH + photoH) + lblH;
    const dataUrl = await blobToDataUrl(shots[i].blob);
    const fit = calcImageFit(cellW - pad * 2, photoH - pad * 2, rw, rh);
    slide.addImage({
      data: dataUrl,
      x: cellX + pad + fit.offX,
      y: cellY + pad + fit.offY,
      w: fit.w,
      h: fit.h,
    });
  }
}

// ═══════════════════════════════════════════════════════════════
// BALL 슬라이드 — 중앙 4:3 단일 이미지  (addTable)
// ═══════════════════════════════════════════════════════════════
async function addBallSlide(pptx, title, shot) {
  const slide = pptx.addSlide();
  slide.background = { color: T.bgSlide };
  addSlideHeader(slide, title);

  const startY = 0.82;
  const availH = 7.5 - startY - 0.10;
  const lblH   = 0.30;
  const photoH = 5.3;
  const imgW   = +(photoH * 4 / 3).toFixed(4);           // ≈ 7.07"
  const cx     = +((13.33 - imgW) / 2).toFixed(4);
  const cy     = +(startY + (availH - lblH - photoH) / 2).toFixed(4);

  slide.addTable(
    [
      [ makeHdrCell('#1', 1) ],
      [ makePhotoCell(1)     ],
    ],
    { x: cx, y: cy, colW: [imgW], rowH: [lblH, photoH] }
  );

  if (shot && shot.blob) {
    const dataUrl = await blobToDataUrl(shot.blob);
    slide.addImage({ data: dataUrl, x: cx, y: cy + lblH, w: imgW, h: photoH });
  }
}

// ═══════════════════════════════════════════════════════════════
// 표지 슬라이드 (360°)
// ═══════════════════════════════════════════════════════════════
function addCoverSlide(pptx, selectedSides, date) {
  const slide = pptx.addSlide();
  slide.background = { color: T.bgCover };
  slide.addShape('rect', { x:0, y:0, w:'100%', h:0.06, fill:{color:T.accentLine}, line:{type:'none'} });
  slide.addShape('rect', { x:0, y:0.06, w:0.35, h:7.44, fill:{color:'0A3A73'}, line:{type:'none'} });
  slide.addText('JOINT REPORT',                     { x:0.65, y:1.5,  w:11, h:0.42, fontSize:11, color:T.coverSub,   fontFace:'Calibri', charSpacing:5 });
  slide.addText('Joint 360° Inspection Report',     { x:0.65, y:1.95, w:11, h:1.1,  fontSize:34, bold:true, color:T.coverTitle, fontFace:'Calibri' });
  slide.addShape('rect', { x:0.65, y:3.2, w:5.5, h:0.04, fill:{color:T.accentLine}, line:{type:'none'} });
  const sideList = [];
  if (selectedSides.outboard) sideList.push('Outboard');
  if (selectedSides.inboard)  sideList.push('Inboard');
  slide.addText(sideList.join('  ·  '),             { x:0.65, y:3.35, w:11, h:0.42, fontSize:15, color:T.coverSub,   fontFace:'Calibri' });
  slide.addText(formatDateStr(date),                { x:0.65, y:3.88, w:8,  h:0.38, fontSize:13, italic:true, color:T.coverDate, fontFace:'Calibri' });
  slide.addShape('rect', { x:0, y:7.42, w:'100%', h:0.08, fill:{color:'0A3A73'}, line:{type:'none'} });
}

// ═══════════════════════════════════════════════════════════════
// Visual 표지 슬라이드
// ═══════════════════════════════════════════════════════════════
function addVisualCoverSlide(pptx, date) {
  const slide = pptx.addSlide();
  slide.background = { color: T.bgCover };
  slide.addShape('rect', { x:0, y:0, w:'100%', h:0.06, fill:{color:T.accentLine}, line:{type:'none'} });
  slide.addShape('rect', { x:0, y:0.06, w:0.35, h:7.44, fill:{color:'0A3A73'}, line:{type:'none'} });
  slide.addText('JOINT REPORT',                     { x:0.65, y:1.5,  w:11, h:0.42, fontSize:11, color:T.coverSub,   fontFace:'Calibri', charSpacing:5 });
  slide.addText('Joint Visual Inspection Report',   { x:0.65, y:1.95, w:11, h:1.0,  fontSize:32, bold:true, color:T.coverTitle, fontFace:'Calibri' });
  slide.addShape('rect', { x:0.65, y:3.1,  w:5.5, h:0.04, fill:{color:T.accentLine}, line:{type:'none'} });
  slide.addText('Outboard  ·  Inboard',             { x:0.65, y:3.25, w:11, h:0.42, fontSize:14, color:T.coverSub,   fontFace:'Calibri' });
  slide.addText(formatDateStr(date),                { x:0.65, y:3.78, w:8,  h:0.38, fontSize:13, italic:true, color:T.coverDate, fontFace:'Calibri' });
  slide.addShape('rect', { x:0, y:7.42, w:'100%', h:0.08, fill:{color:'0A3A73'}, line:{type:'none'} });
}

// ═══════════════════════════════════════════════════════════════
// Visual Inspection 슬라이드  — addShape + addText + addImage
//
// cm 단위 절대좌표 기준 레이아웃 (슬라이드 33.87cm × 19.05cm):
//
//  margin=0.30cm, secGap=0.50cm
//  sW   = (33.87 - 0.60 - 0.50) / 2  = 16.385cm  (섹션 폭)
//  startY = 2.08cm  (= 0.82" 슬라이드헤더 높이)
//
//  열 폭:
//    jW         = (9/16)×8 + 0.4  = 4.900cm  (JOINT: 사진폭 4.5cm + 여백)
//    rW         = 16.385 - 4.900  = 11.485cm
//    cell12W    = rW / 2          = 5.743cm  (#1, #2)
//    cell345W_35= (9/16)×5.5+0.2  = 3.294cm  (#3, #5 — 9:16 사진폭 기준)
//    cell345W_4 = rW - 3.294×2    = 4.897cm  (#4)
//
//  사진 높이 + 셀 높이 (lblH=0.70cm, pad=0.20/pad2=0.10cm):
//    JOINT (9:16) pH=8.00cm → cell_J_h  = 13.50cm (Row1+Row2 합)
//    #1,#2 (4:3)  pH=6.00cm → cell_12_h = 7.10cm  (pad=0.20)
//    #3~#5        pH=5.50cm → cell_345_h= 6.40cm  (pad2=0.10)
//
//  #3/#5 contain-fit: calcImageFit(3.094, 5.50, 9,16) → 3.09×5.50cm ✓ 완벽
//  섹션 총 높이: 0.70 + 13.50 = 14.20cm
//  사용 높이   : 2.08 + 14.20 = 16.28cm < 19.05cm ✓
// ═══════════════════════════════════════════════════════════════
async function addVisualSlide(pptx, visualData) {
  const slide = pptx.addSlide();
  slide.background = { color: T.bgSlide };
  addSlideHeader(slide, 'Joint Visual Inspection');

  // cm → inch 변환 (pptxgenjs 단위)
  const c = v => +(v / 2.54).toFixed(5);

  // ── 레이아웃 상수 (cm) ──────────────────────────────────────
  const SLIDE_W  = 33.87;
  const margin   = 0.30;
  const secGap   = 0.50;
  const sW       = (SLIDE_W - margin * 2 - secGap) / 2;  // 16.385cm
  const startY   = 2.08;   // 슬라이드 헤더 하단 (0.82" × 2.54)
  const secHdrH  = 0.70;   // 섹션 헤더 높이
  const lblH     = 0.70;   // 셀 레이블 높이
  const pad      = 0.20;   // JOINT / Row1 여백
  const pad2     = 0.10;   // Row2 (#3~#5) 여백 — 50% 축소

  // ── 사진 높이 고정값 (cm) ────────────────────────────────────
  const pH_J   = 8.00;   // JOINT  (9:16)
  const pH_12  = 6.00;   // #1, #2 (4:3)
  const pH_345 = 5.50;   // #3~#5 통일 (5.5cm)

  // ── 열 폭 계산 ────────────────────────────────────────────────
  const jW          = (9 / 16) * pH_J + pad * 2;        // 4.900cm
  const rW          = sW - jW;                            // 11.485cm
  const cell12W     = rW / 2;                             // 5.7425cm
  // #3/#5: 9:16 사진 너비(=3.094cm) + 좌우 여백(pad2×2) → 세로 강조
  const cell345W_35 = (9 / 16) * pH_345 + pad2 * 2;     // 3.09375 + 0.20 = 3.294cm
  const cell345W_4  = rW - cell345W_35 * 2;              // 11.485 - 6.588 = 4.897cm

  // ── 셀 높이 계산 ────────────────────────────────────────────────
  const cell_12_h  = lblH + pad  + pH_12  + pad;   // 0.70+0.20+6.00+0.20 = 7.10cm
  const cell_345_h = lblH + pad2 + pH_345 + pad2;  // 0.70+0.10+5.50+0.10 = 6.40cm
  const cell_J_h   = cell_12_h + cell_345_h;        // 7.10 + 6.40 = 13.50cm (JOINT 전체)

  // ── 테두리 스타일 ────────────────────────────────────────────
  const BC = T.cellBorder;  // 'BFBFBF'
  const BW = 0.5;           // pt

  // ── 셀 드로우 헬퍼 ───────────────────────────────────────────
  function drawCell(x_cm, y_cm, w_cm, h_cm, labelText) {
    slide.addShape('rect', {
      x: c(x_cm), y: c(y_cm), w: c(w_cm), h: c(h_cm),
      fill: { type: 'none' }, line: { color: BC, width: BW },
    });
    slide.addShape('rect', {
      x: c(x_cm), y: c(y_cm), w: c(w_cm), h: c(lblH),
      fill: { color: T.hdrCell }, line: { type: 'none' },
    });
    slide.addText(labelText, {
      x: c(x_cm), y: c(y_cm), w: c(w_cm), h: c(lblH),
      fontSize: 11, bold: true, color: T.hdrText,
      fontFace: 'Arial', align: 'center', valign: 'middle',
    });
  }

  // ── 이미지 배치 헬퍼 (contain-fit 중앙 배치) ────────────────
  async function drawPhoto(photoX_cm, photoY_cm, areaW_cm, areaH_cm, rw, rh, data) {
    if (!data || !data.blob) return;
    const url = await blobToDataUrl(data.blob);
    const fit = calcImageFit(areaW_cm, areaH_cm, rw, rh);
    slide.addImage({
      data: url,
      x: c(photoX_cm + fit.offX),
      y: c(photoY_cm + fit.offY),
      w: c(fit.w),
      h: c(fit.h),
    });
  }

  // ── 섹션 렌더링 ─────────────────────────────────────────────
  for (let idx = 0; idx < 2; idx++) {
    const side   = idx === 0 ? 'outboard' : 'inboard';
    const sX     = margin + idx * (sW + secGap);  // 섹션 시작 X (cm)
    const sY     = startY;
    const sLabel = idx === 0 ? 'OBJ  —  OUTBOARD' : 'IBJ  —  INBOARD';
    const jLabel = idx === 0 ? 'OBJ' : 'IBJ';
    const sd     = visualData[side] || {};
    const cY     = sY + secHdrH;  // 콘텐츠 시작 Y

    // ── 섹션 헤더 ──────────────────────────────────────────────
    // x=sX, y=sY, w=sW, h=0.70cm
    slide.addShape('rect', {
      x: c(sX), y: c(sY), w: c(sW), h: c(secHdrH),
      fill: { color: T.secHdr }, line: { type: 'none' },
    });
    slide.addText(sLabel, {
      x: c(sX), y: c(sY), w: c(sW), h: c(secHdrH),
      fontSize: 12, bold: true, color: T.hdrText,
      fontFace: 'Arial', align: 'center', valign: 'middle',
    });

    // ┌──────────────┬─────────────────┬────────────────┐
    // │   JOINT      │      #1         │      #2        │  h=7.10cm
    // │  (9:16 세로) ├────────┬──────────────┬──────────┤
    // │  4.90cm 폭   │ #3     │    #4        │    #5    │  h=6.40cm
    // │              │ 3.29cm │   4.90cm     │  3.29cm  │
    // └──────────────┴────────┴──────────────┴──────────┘

    // ══ JOINT 셀 ══════════════════════════════════════════════
    // x=sX, y=cY, w=4.90cm, h=13.50cm (Row1+Row2 전체 커버)
    drawCell(sX, cY, jW, cell_J_h, jLabel);
    await drawPhoto(
      sX + pad, cY + lblH + pad,
      jW - pad * 2,                   // 4.50cm
      cell_J_h - lblH - pad * 2,      // 12.40cm → 9:16 fit → 4.50×8.00cm
      9, 16, sd['joint']
    );

    // ══ Row 1: #1 INTERFACE (4:3) ══════════════════════════════
    // x=sX+jW, y=cY, w=5.743cm, h=7.10cm
    const x1 = sX + jW;
    drawCell(x1, cY, cell12W, cell_12_h, '#1');
    await drawPhoto(
      x1 + pad, cY + lblH + pad,
      cell12W - pad * 2,   // 5.343cm
      pH_12,               // 6.00cm
      4, 3, sd['interface']
    );

    // ══ Row 1: #2 BEARING FACE (4:3) ═══════════════════════════
    // x=sX+jW+cell12W, y=cY, w=5.743cm, h=7.10cm
    const x2 = sX + jW + cell12W;
    drawCell(x2, cY, cell12W, cell_12_h, '#2');
    await drawPhoto(
      x2 + pad, cY + lblH + pad,
      cell12W - pad * 2,
      pH_12,
      4, 3, sd['bearing_face']
    );

    // ══ Row 2 기준 Y = cY + 7.10cm ══════════════════════════════
    const row2Y = cY + cell_12_h;

    // ══ Row 2: #3 CLAMP-JOINT (9:16) ═══════════════════════════
    // x=sX+jW, y=row2Y, w=3.294cm, h=6.40cm
    // areaW=3.094cm, areaH=5.50cm → fit: 3.094×5.50cm ✓ 완벽
    const x3 = sX + jW;
    drawCell(x3, row2Y, cell345W_35, cell_345_h, '#3');
    await drawPhoto(
      x3 + pad2, row2Y + lblH + pad2,
      cell345W_35 - pad2 * 2,   // 3.094cm
      pH_345,                    // 5.50cm
      9, 16, sd['clamp_joint']
    );

    // ══ Row 2: #4 BOOT (4:3) ════════════════════════════════════
    // x=sX+jW+cell345W_35, y=row2Y, w=4.897cm, h=6.40cm
    const x4 = sX + jW + cell345W_35;
    drawCell(x4, row2Y, cell345W_4, cell_345_h, '#4');
    await drawPhoto(
      x4 + pad2, row2Y + lblH + pad2,
      cell345W_4 - pad2 * 2,    // 4.697cm
      pH_345,                    // 5.50cm (4:3 → 너비 기준 contain-fit)
      4, 3, sd['boot']
    );

    // ══ Row 2: #5 CLAMP-SHAFT (9:16) ════════════════════════════
    // x=sX+jW+cell345W_35+cell345W_4, y=row2Y, w=3.294cm, h=6.40cm
    const x5 = sX + jW + cell345W_35 + cell345W_4;
    drawCell(x5, row2Y, cell345W_35, cell_345_h, '#5');
    await drawPhoto(
      x5 + pad2, row2Y + lblH + pad2,
      cell345W_35 - pad2 * 2,
      pH_345,
      9, 16, sd['clamp_shaft']
    );
  }
}

// ═══════════════════════════════════════════════════════════════
// Visual PPT 메인 생성 함수
// ═══════════════════════════════════════════════════════════════
window.generateVisualPPT = async function({ visualData }) {
  if (typeof PptxGenJS === 'undefined') {
    throw new Error('pptxgenjs 라이브러리가 로드되지 않았습니다.');
  }
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  const now = new Date();

  addVisualCoverSlide(pptx, now);
  await addVisualSlide(pptx, visualData);

  const dateStr = now.toISOString().slice(0,10).replace(/-/g,'');
  const timeStr = now.toTimeString().slice(0,8).replace(/:/g,'');
  const fileName = `VisualReport_${dateStr}_${timeStr}.pptx`;
  const blob = await pptx.write({ outputType: 'blob' });
  return { blob, fileName };
};

// ═══════════════════════════════════════════════════════════════
// 360° PPT 메인 생성 함수
// ═══════════════════════════════════════════════════════════════
window.generateJointReportPPT = async function({ capturedData, selectedSides, segments }) {
  if (typeof PptxGenJS === 'undefined') {
    throw new Error('pptxgenjs 라이브러리가 로드되지 않았습니다. 인터넷 연결을 확인해 주세요.');
  }
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  const now = new Date();

  // 1. 표지
  addCoverSlide(pptx, selectedSides, now);

  // 2. 사이드별 슬라이드
  for (const side of ['outboard', 'inboard']) {
    if (!selectedSides[side]) continue;
    const sideLabel = side === 'outboard' ? 'Outboard' : 'Inboard';
    const segs      = segments[side] || 6;
    const raceCols  = segs <= 6 ? 3 : 4;
    const sideData  = capturedData[side];

    for (const prod of PRODUCTS_DEF) {
      const shots = sideData[prod.id] || [];
      if (shots.length === 0) continue;
      const ratio = CROP_RATIO_PPT[prod.id];

      if (prod.id === 'ball') {
        await addBallSlide(pptx, `BALL  —  ${sideLabel}`, shots[0]);

      } else if (prod.id === 'cage') {
        const cageCols   = segs <= 6 ? 3 : 4;
        const cageLabels = [
          ...Array.from({ length: segs }, (_, i) => `F${i + 1}`),
          ...Array.from({ length: segs }, (_, i) => `B${i + 1}`),
        ];
        await addProductSlide(pptx, `CAGE  —  ${sideLabel}`, shots, cageCols, ratio, cageLabels);

      } else {
        await addProductSlide(pptx, `${prod.name}  —  ${sideLabel}`, shots, raceCols, ratio);
      }
    }
  }

  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '');
  const fileName = `JointReport_${dateStr}_${timeStr}.pptx`;
  const blob = await pptx.write({ outputType: 'blob' });
  return { blob, fileName };
};
