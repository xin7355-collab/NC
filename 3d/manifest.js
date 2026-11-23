// 3D 人體素材清單（來源與授權細節見 3d/licenses/assets.json）
// 人物＝Rocketbox 運動服身體＋亞洲臉孔的頭（tools/headswap.js 換頭）；rig＝用哪一套動畫（同一副骨架的人物共用男或女的動畫）
export const MODELS = {
  male: { file: 'models/male.glb', preview: 'models/male.jpg', label: '男・短髮', rig: 'male', src: 'Microsoft Rocketbox Sports_Male_04（身體）＋Business_Male_02（頭）', license: 'MIT', bytes: 1191396 },
  male2: { file: 'models/male2.glb', preview: 'models/male2.jpg', label: '男・中長髮', rig: 'male', src: 'Microsoft Rocketbox Sports_Male_04（身體）＋Male_Adult_10（頭）', license: 'MIT', bytes: 1196272 },
  female: { file: 'models/female.glb', preview: 'models/female.jpg', label: '女・馬尾', rig: 'female', src: 'Microsoft Rocketbox Sports_Female_02', license: 'MIT', bytes: 1322016 },
  female2: { file: 'models/female2.glb', preview: 'models/female2.jpg', label: '女・短髮', rig: 'female', src: 'Microsoft Rocketbox Sports_Female_02（身體）＋Female_Adult_03（頭）', license: 'MIT', bytes: 1419652 }
};
export const CREDIT = '人物素材：Microsoft Rocketbox Avatar Library（MIT 授權）';
