// 필름 프리셋. 숫자 범위는 -100~+100, 색상 이동만 각도(도).
// hsl: [색상 이동, 채도, 밝기] / curve: x = 0, 0.25, 0.5, 0.75, 1 에서의 y 값
// splitTone: [색(도), 강도 0~100]
window.FILMS = [
  {
    id: 'original', name: '원본', when: '필름 없이 그대로 찍어요',
    strength: 0, exposure: 0, contrast: 0, highlights: 0, shadows: 0, temp: 0, tint: 0, saturation: 0,
    hsl: { red: [0,0,0], orange: [0,0,0], yellow: [0,0,0], green: [0,0,0], cyan: [0,0,0], blue: [0,0,0], magenta: [0,0,0] },
    splitTone: { shadow: [0,0], highlight: [0,0] },
    curve: [0, 0.25, 0.5, 0.75, 1], grain: 0, vignette: 0
  },
  {
    id: 'sunset-seoul', name: '노을빛 서울', when: '해 질 무렵 거리, 도시에 잘 어울려요',
    strength: 100, exposure: -5, contrast: 25, highlights: -10, shadows: -20, temp: 12, tint: 2, saturation: -8,
    hsl: { red: [5,0,-5], orange: [3,15,5], yellow: [-10,5,0], green: [20,-30,-15], cyan: [0,-5,-5], blue: [-12,-20,-10], magenta: [0,-15,0] },
    splitTone: { shadow: [190,18], highlight: [38,16] },
    curve: [0.03, 0.18, 0.50, 0.82, 0.96], grain: 12, vignette: -12
  },
  {
    id: 'deep-forest', name: '깊은 숲', when: '숲, 물가, 흐린 날에 잘 어울려요',
    strength: 100, exposure: -10, contrast: 15, highlights: -15, shadows: -15, temp: -6, tint: -4, saturation: -20,
    hsl: { red: [3,-5,-5], orange: [0,-5,0], yellow: [10,-25,-10], green: [25,-20,-20], cyan: [-5,-10,-10], blue: [-10,-25,-10], magenta: [0,-20,0] },
    splitTone: { shadow: [175,20], highlight: [50,6] },
    curve: [0.03, 0.17, 0.47, 0.77, 0.94], grain: 15, vignette: -18
  }
];
