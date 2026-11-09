import { useState } from 'react';
import { Modal } from '../ui/Dialogs';
import { makeGate } from './gate';

/** "Grown-ups only": a small sum a 3-year-old can't answer. Calls onPass when answered correctly. */
export function ParentGate({ onPass, onClose, why }: { onPass: () => void; onClose: () => void; why: string }) {
  const [gate, setGate] = useState(() => makeGate());
  const [wrong, setWrong] = useState(false);
  return (
    <Modal title="Grown-ups only 🔒" onClose={onClose}>
      <p className="muted">{why}</p>
      <p className="gate-q" aria-live="polite">What is {gate.question}?</p>
      <div className="gate-choices">
        {gate.choices.map((c) => (
          <button
            key={c} className="btn big"
            onClick={() => {
              if (c === gate.answer) onPass();
              else { setWrong(true); setGate(makeGate()); }
            }}
          >{c}</button>
        ))}
      </div>
      {wrong && <p className="error" role="alert">Not quite. Here is a new one.</p>}
    </Modal>
  );
}
