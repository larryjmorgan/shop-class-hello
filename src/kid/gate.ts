// "Grown-ups only" check: a small sum a 3-year-old can't answer. Pure so it can be tested.

export interface Gate {
  question: string;
  answer: number;
  choices: number[];
}

export function makeGate(rand: () => number = Math.random): Gate {
  const a = 4 + Math.floor(rand() * 6); // 4..9
  const b = 4 + Math.floor(rand() * 6);
  const answer = a + b;
  const wrong = new Set<number>();
  while (wrong.size < 3) {
    const d = (Math.floor(rand() * 9) - 4) || 5; // -4..4, never 0
    const v = answer + d;
    if (v > 0 && v !== answer) wrong.add(v);
  }
  const choices = [answer, ...wrong];
  for (let i = choices.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [choices[i], choices[j]] = [choices[j], choices[i]];
  }
  return { question: `${a} + ${b}`, answer, choices };
}
