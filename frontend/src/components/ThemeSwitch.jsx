import { useState } from 'react';
import { getTheme, setTheme } from '../theme.js';
import Icon from './Icon.jsx';

// Two-segment theme switch: both options stay visible, the active one is
// highlighted. Used in the top bar and on the auth screen.
export default function ThemeSwitch() {
  const [theme, setState] = useState(getTheme());
  const pick = (t) => setState(setTheme(t));
  const segment = (t, icon, label) => (
    <button
      type="button"
      className={theme === t ? 'active' : ''}
      aria-pressed={theme === t}
      aria-label={label}
      onClick={() => pick(t)}
    >
      <Icon name={icon} size={15} />
    </button>
  );
  return (
    <div className="theme-switch" role="group" aria-label="Color theme">
      {segment('light', 'sun', 'Light theme')}
      {segment('dark', 'moon', 'Dark theme')}
    </div>
  );
}
