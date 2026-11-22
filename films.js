// 필름 프리셋. 숫자 범위는 -100~+100, 색상 이동만 각도(도).
// hsl: [색상 이동, 채도, 밝기] / curve: x = 0, 0.25, 0.5, 0.75, 1 에서의 y 값
// splitTone: [색(도), 강도 0~100]
// 필드 목록: id, name, when, strength, exposure, contrast, highlights, shadows, temp, tint, saturation,
//           hsl{red,orange,yellow,green,cyan,blue,magenta}, splitTone{shadow,highlight}, curve, grain, vignette
// 재미 효과(없으면 꺼짐): pixel 0~100 도트 크기, levels 색 단계 수(2 이상)
// 비어 있으면 앱은 필름 없이 원본 그대로 보여 주고, 필름 버튼을 숨긴다.
window.FILMS = [
  {
    id: 'pixel', name: '픽셀', when: '옛날 게임 화면처럼 도트로 찍혀요',
    strength: 100, exposure: 5, contrast: 20, highlights: -5, shadows: 10, temp: 0, tint: 0, saturation: 35,
    hsl: { red: [0,10,0], orange: [0,5,5], yellow: [0,10,5], green: [0,10,0], cyan: [0,10,0], blue: [0,15,0], magenta: [0,10,0] },
    splitTone: { shadow: [0,0], highlight: [0,0] },
    curve: [0, 0.22, 0.5, 0.78, 1], grain: 0, vignette: 0,
    pixel: 80, levels: 6
  }
];
