// 3D 運動動作（第三階段：五個動作）。動畫與動作階段由 tools/build-3d-anims.js 產生在 anims/<id>.glb、anims/<id>.json；肌群（第四階段）、專業審核紀錄（第五階段）之後加入
// review：draft 草稿／pending_review 待專業審核／approved 審核通過／revision_required 需要修正／rejected 不予採用。沒有審核人與日期，一律不顯示「審核通過」
const CMU = { kind: '動作捕捉', name: 'CMU Graphics Lab Motion Capture Database', license: 'CMU：free for all uses（BVH 轉檔者不加限制）' };
export const EXERCISES = [
  { id: 'squat', name: '徒手深蹲', speed: 1, review: 'pending_review', src: { ...CMU, clip: '86_02 第 2 下' },
    cues: ['腳與肩同寬、腳尖微微朝外', '屁股往後坐，像要坐到椅子', '膝蓋對準第二根腳趾，大腿下到約與地面平行', '站起來時腳跟出力、吐氣'], bad: ['膝蓋往內夾', '腳跟離地', '彎腰駝背'] },
  { id: 'pushup', name: '伏地挺身', speed: 0.75, review: 'pending_review', src: { kind: 'CC0 動畫', name: 'Mesh2Motion〈Pushup〉', license: 'CC0' },
    cues: ['手掌在肩膀正下方、比肩略寬', '頭到腳跟一直線，肚子、屁股收緊', '胸口下到接近地面，推起時吐氣'], bad: ['屁股翹起或腰塌', '手肘往外開太大', '只動頭不動身體'] },
  { id: 'plank', name: '棒式（前臂）', speed: 1, review: 'draft', src: { kind: '自製關鍵影格', name: 'Kinwell 自製', license: '本專案' },
    cues: ['趴著，手肘在肩膀正下方、前臂貼地，腳尖踩地', '肚子、屁股收緊把身體撐起來：頭到腳跟一直線', '正常呼吸，不憋氣；每次停 30 秒，再慢慢放下'], bad: ['屁股翹太高或腰塌', '憋氣', '手肘沒有在肩膀正下方'] },
  { id: 'lunge', name: '弓箭步', speed: 1, review: 'pending_review', src: { ...CMU, clip: '144_17 第 1 下（手臂改為自然下垂）' },
    cues: ['一腳往前跨，身體直立', '往下蹲到前腳大腿接近水平、後膝接近地面', '前膝對準腳尖，用前腳推回站直'], bad: ['前膝往內倒', '身體往前傾'] },
  { id: 'bridge', name: '臀橋', speed: 1, review: 'draft', src: { kind: '自製關鍵影格', name: 'Kinwell 自製', license: '本專案' },
    cues: ['躺平、膝蓋彎、腳掌踩地', '夾臀把屁股抬起，肩到膝一直線', '停 2 秒再慢慢放下'], bad: ['抬太高、腰拱起', '用脖子出力'] }
];
const LABEL = { draft: '自製草稿・待專業審核', pending_review: '待專業審核', approved: '審核通過', revision_required: '需要修正', rejected: '不予採用' };
// 「審核通過」一定要有審核人與日期；其他情況照狀態顯示（缺資料時退回「待專業審核」）
export const reviewLabel = ex => ex.review === 'approved' && !(ex.reviewer && ex.reviewedAt) ? LABEL.pending_review : LABEL[ex.review] || LABEL.pending_review;
