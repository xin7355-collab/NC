// 3D 運動動作（第三階段：五個動作）。動畫與動作階段由 tools/build-3d-anims.js 產生在 anims/<id>.glb、anims/<id>.json；肌群（第四階段）：muscles 的主要／次要部位＋musNote 具體肌肉；專業審核紀錄（第五階段）之後加入
// review：draft 草稿（尚未送審）／pending_review 待專業審核／approved 審核通過／revision_required 需要修正／rejected 不予採用。這裡是讀不到審核資料庫（3d/review/reviews.json）時的預設值
// 沒有審核人與日期、或審核的是舊版內容，一律不顯示「審核通過」；cautions＝注意事項（給審核的人一起確認）
// 肌群部位（第四階段）：模型沒有獨立肌肉網格，只分 8 個部位上色（3d/muscles.js）
export const MUSCLE_GROUPS = [['chest', '胸部'], ['back', '背部'], ['shoulders', '肩部'], ['arms', '手臂'], ['abs', '腹部'], ['glutes', '臀部'], ['thighs', '大腿'], ['calves', '小腿']];
const CMU = { kind: '動作捕捉', name: 'CMU Graphics Lab Motion Capture Database', license: 'CMU：free for all uses（BVH 轉檔者不加限制）' };
export const EXERCISES = [
  { id: 'squat', name: '徒手深蹲', speed: 1, review: 'pending_review', cautions: ['膝蓋或髖關節會痛時，先減少下蹲深度，或扶著椅背做', '全程正常呼吸，不要憋氣（高血壓的人特別注意）'], src: { ...CMU, clip: '86_02 第 2 下' },
    muscles: { primary: ['thighs', 'glutes'], secondary: ['abs', 'back', 'calves'] }, musNote: '大腿以前側的股四頭肌為主；腹部、下背負責穩住軀幹，小腿幫忙平衡',
    cues: ['腳與肩同寬、腳尖微微朝外', '屁股往後坐，像要坐到椅子', '膝蓋對準第二根腳趾，大腿下到約與地面平行', '站起來時腳跟出力、吐氣'], bad: ['膝蓋往內夾', '腳跟離地', '彎腰駝背'] },
  { id: 'pushup', name: '伏地挺身', speed: 0.75, review: 'pending_review', cautions: ['手腕會痛時改握拳撐地，或雙手扶桌緣做（比較輕鬆）', '肩膀疼痛時先停止，問醫師或物理治療師'], src: { kind: 'CC0 動畫', name: 'Mesh2Motion〈Pushup〉', license: 'CC0' },
    muscles: { primary: ['chest', 'arms'], secondary: ['shoulders', 'abs'] }, musNote: '手臂是上臂後側的肱三頭肌；肩部是三角肌前側；腹部讓身體保持一直線',
    cues: ['手掌在肩膀正下方、比肩略寬', '頭到腳跟一直線，肚子、屁股收緊', '胸口下到接近地面，推起時吐氣'], bad: ['屁股翹起或腰塌', '手肘往外開太大', '只動頭不動身體'] },
  { id: 'plank', name: '棒式（前臂）', speed: 1, review: 'pending_review', cautions: ['高血壓、懷孕先問醫師；撐住時不要憋氣', '下背會痛時先縮短時間，或膝蓋著地做'], src: { kind: '自製關鍵影格', name: 'Kinwell 自製', license: '本專案' },
    muscles: { primary: ['abs'], secondary: ['shoulders', 'back', 'glutes', 'thighs'] }, musNote: '腹部（腹直肌、腹橫肌、腹斜肌）為主；肩膀、下背、臀部、大腿前側一起出力撐住',
    cues: ['趴著，手肘在肩膀正下方、前臂貼地，腳尖踩地', '肚子、屁股收緊把身體撐起來：頭到腳跟一直線', '正常呼吸，不憋氣；每次停 30 秒，再慢慢放下'], bad: ['屁股翹太高或腰塌', '憋氣', '手肘沒有在肩膀正下方'] },
  { id: 'lunge', name: '弓箭步', speed: 1, review: 'pending_review', cautions: ['平衡不好時扶牆或椅背做', '膝蓋會痛時先縮小步伐、不要蹲太低'], src: { ...CMU, clip: '144_17 第 1 下（手臂改為自然下垂）' },
    muscles: { primary: ['thighs', 'glutes'], secondary: ['calves', 'abs'] }, musNote: '前腳的股四頭肌、臀大肌為主；小腿和腹部幫忙保持平衡',
    cues: ['一腳往前跨，身體直立', '往下蹲到前腳大腿接近水平、後膝接近地面', '前膝對準腳尖，用前腳推回站直'], bad: ['前膝往內倒', '身體往前傾'] },
  { id: 'bridge', name: '臀橋', speed: 1, review: 'pending_review', cautions: ['下背會痛時抬到不痛的高度就好', '脖子不舒服時頭下墊薄毛巾，不要用脖子出力'], src: { kind: '自製關鍵影格', name: 'Kinwell 自製', license: '本專案' },
    muscles: { primary: ['glutes'], secondary: ['thighs', 'back', 'abs'] }, musNote: '臀大肌為主；大腿是後側的膕旁肌；下背、腹部幫忙穩定',
    cues: ['躺平、膝蓋彎、腳掌踩地', '夾臀把屁股抬起，肩到膝一直線', '停 2 秒再慢慢放下'], bad: ['抬太高、腰拱起', '用脖子出力'] }
];
export const STATUS = { draft: '草稿・尚未送審', pending_review: '待專業審核', approved: '審核通過', revision_required: '需要修正', rejected: '不予採用' };
// rec：審核紀錄（審核資料庫＋本機匯入的意見）；content：目前的內容版本（3d/review/package.json）。沒給 rec 時用動作本身的 review 欄位
// 「審核通過」一定要有審核人與日期；審核的內容版本跟現在不一樣（動畫或說明改過）就顯示「內容已更新・待重新審核」
export const reviewLabel = (ex, rec, content) => { const r = rec || { status: ex.review, reviewer: ex.reviewer, reviewedAt: ex.reviewedAt };
  let s = STATUS[r.status] ? r.status : 'pending_review'; if (s === 'approved' && !(r.reviewer && r.reviewedAt)) s = 'pending_review';
  if (s !== 'draft' && s !== 'pending_review' && content && r.content && r.content !== content) return '內容已更新・待重新審核';
  return /自製/.test(ex.src?.kind || '') && (s === 'draft' || s === 'pending_review') ? '自製動畫・' + STATUS[s] : STATUS[s] };
