import { useState } from 'react';
import { easterCode } from '../game/secrets/codes';
import type { EasterCode } from '../game/secrets/codes';

export function SecretInput({ redeem }: { redeem: (code: EasterCode) => Promise<boolean> }) {
  const [value, setValue] = useState('');
  const submit = async (text: string) => {
    const code = easterCode(text);
    if (code && await redeem(code)) setValue('');
  };
  return <form className="hidden-code-entry" onSubmit={(event) => { event.preventDefault(); void submit(value); }}><input aria-label="彩蛋代码" value={value} onChange={(event) => { setValue(event.target.value); void submit(event.target.value); }} autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} inputMode="text"/></form>;
}
