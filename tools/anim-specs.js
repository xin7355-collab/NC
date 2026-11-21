// 運動動畫的來源與轉檔設定（tools/build-3d-anims.js 用）。lock：要固定在地上的腳踝／手腕；planted：品質檢查要量滑動的點
module.exports = [
  { id: 'squat', kind: 'cmu', url: '/cmu/086/86_02.bvh', from: 11.1, to: 13.6, loop: true, torso: { maxLean: 40, headUp: 15 }, lock: ['Lankle', 'Rankle'], always: ['Lankle', 'Rankle'], planted: ['Lankle', 'Rankle'],
    phaseNames: ['預備', '下蹲', '最低點', '站起', '完成'], views: ['side', 'front'], shotsAt: [0, 0.22, 0.47, 0.72, 1] },
  { id: 'pushup', kind: 'm2m', url: '/m2m/pushup.glb', from: 0, loop: true, handsDown: true, contact: 'toesHands', pushArms: { width: 1.2, maxFlex: 100 }, phaseBy: 'sho', lock: ['Lwri', 'Rwri'], always: ['Lwri', 'Rwri'], planted: ['Lwri', 'Rwri', 'Lankle', 'Rankle'],
    phaseNames: ['預備', '下降', '最低點', '推起', '完成'], views: ['side'], shotsAt: [0, 0.25, 0.5, 0.75, 1] },
  { id: 'plank', pose: 'plank', curve: 'hold', dur: 6.6, up: true, planted: ['Lelb', 'Relb', 'Ltoe', 'Rtoe'], phaseNames: ['預備', '撐起', '撐住（每次停 30 秒）', '放下', '完成'], views: ['side', 'q'], shotsAt: [0, 0.2, 0.45, 0.8, 1] },
  { id: 'lunge', pose: 'lunge', curve: 'hold', dur: 2.9, planted: ['Ltoe'], phaseNames: ['預備', '跨步下蹲', '最低點', '推回站直', '完成'], views: ['side', 'front'], shotsAt: [0, 0.2, 0.5, 0.75, 1] },
  { id: 'bridge', pose: 'bridge', curve: 'bridge', dur: 5.4, up: true, planted: ['Lankle', 'Rankle', 'Lsho', 'Rsho'], phaseNames: ['躺好', '抬臀', '停住', '放下', '完成'], views: ['side'], shotsAt: [0, 0.2, 0.45, 0.8, 1] }
];
