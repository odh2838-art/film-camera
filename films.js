// 필름 프리셋. 숫자 범위는 -100~+100, 색상 이동만 각도(도).
// hsl: [색상 이동, 채도, 밝기] / curve: x = 0, 0.25, 0.5, 0.75, 1 에서의 y 값
// splitTone: [색(도), 강도 0~100]
// 필드 목록: id, name, when, strength, exposure, contrast, highlights, shadows, temp, tint, saturation,
//           hsl{red,orange,yellow,green,cyan,blue,magenta}, splitTone{shadow,highlight}, curve, grain, vignette
// 재미 효과(없으면 꺼짐): pixel 0~100 도트 크기, levels 색 단계 수(2 이상)
//   blur 0~100 가로 번짐, chroma 0~100 빨강·파랑 어긋남, scan 0~100 가로 줄무늬,
//   stamp: 'date' 오른쪽 아래 날짜 도장, flash 0~100 가운데만 밝게(플래시 터진 느낌)
// amount: 처음 강도 0~100 (없으면 100). 사용자가 강도를 밀면 그 값을 필름마다 기억한다.
//         100 이면 아래 숫자 그대로, 50 이면 그 절반만큼만 입혀진다.
// 비어 있으면 앱은 필름 없이 원본 그대로 보여 주고, 필름 버튼을 숨긴다.
window.FILMS = [
  {
    id: 'pixel', name: '픽셀', when: '옛날 게임 화면처럼 도트로 찍혀요',
    strength: 100, exposure: 0, contrast: 15, highlights: -5, shadows: 5, temp: 0, tint: 0, saturation: 30,
    hsl: { red: [0,10,0], orange: [0,5,0], yellow: [0,10,0], green: [0,10,0], cyan: [0,10,0], blue: [0,15,0], magenta: [0,10,0] },
    splitTone: { shadow: [0,0], highlight: [0,0] },
    curve: [0, 0.23, 0.5, 0.77, 1], grain: 0, vignette: 0,
    // 강도 100 = 40칸, 6단계(완전 게임 화면). 처음 강도 45 = 약 110칸, 13단계(원본이 잘 보이는 도트)
    pixel: 80, levels: 6, amount: 45
  },
  {
    id: 'camcorder', name: '캠코더', when: '90년대 홈비디오처럼 날짜가 찍혀요',
    // 물 빠진 듯 밝은 그림자, 따뜻하고 살짝 초록빛, 빨강이 번지는 비디오테이프 색
    strength: 100, exposure: 5, contrast: -10, highlights: -20, shadows: 15, temp: 8, tint: -4, saturation: 12,
    hsl: { red: [0,15,0], orange: [0,5,5], yellow: [-5,-10,0], green: [10,-20,0], cyan: [0,-15,0], blue: [-5,-10,0], magenta: [0,-10,0] },
    splitTone: { shadow: [195,15], highlight: [40,10] },
    curve: [0.06, 0.27, 0.52, 0.76, 0.94], grain: 30, vignette: -15,
    blur: 55, chroma: 50, scan: 35, stamp: 'date', amount: 70
  },
  {
    id: 'disposable', name: '일회용 카메라', when: '친구들과 놀 때, 플래시 터진 듯 쨍하게',
    // 쨍한 색, 노란 밝은 곳과 초록빛 그림자, 거친 입자, 가운데만 밝고 가장자리는 어둡게 (싸구려 플라스틱 렌즈와 플래시)
    strength: 100, exposure: 0, contrast: 25, highlights: -12, shadows: -15, temp: 4, tint: -6, saturation: 25,
    hsl: { red: [0,20,0], orange: [-3,10,0], yellow: [-5,15,5], green: [10,-5,-5], cyan: [0,-10,0], blue: [0,-5,-10], magenta: [0,0,0] },
    splitTone: { shadow: [150,20], highlight: [45,10] },
    curve: [0.02, 0.22, 0.52, 0.8, 0.97], grain: 45, vignette: -45,
    flash: 38, blur: 12, chroma: 15, amount: 75
  }
];
