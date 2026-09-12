/**
 * Keyboard steering for the helm console.
 *
 * Manual control is an in-flight mode rather than always-on: tgui forwards
 * letters to the game, so unarmed W/A/S/D would fly the ship and march the pilot
 * at once. While armed, the steering letters are claimed from the game with
 * tgui's own acquire/release, and the course is commanded from the union of the
 * held keys (opposite keys cancel on their axis).
 */
import { useEffect, useRef, useState } from 'react';
import { globalEvents } from 'tgui-core/events';
import { acquireHotKey, releaseHotKey } from 'tgui-core/hotkeys';

import { useBackend } from '../../backend';
import { DIR, type Data, KEY_AXIS, STEER_KEYCODES } from './data';
import { useLocked } from './hooks';

export const useManualControl = () => {
  const { act, data } = useBackend<Data>();
  const locked = useLocked();
  const shipCrashed = !!data.shipCrashed;
  const [manualControl, setManualControl] = useState(false);

  const keyGuards = useRef({
    manual: false,
    locked: true,
    flying: false,
    crashed: false,
    abandoned: false,
  });
  keyGuards.current = {
    manual: manualControl,
    locked,
    flying: data.state === 'flying',
    crashed: shipCrashed,
    abandoned: !!data.isAbandoned,
  };

  const canManualControl = !locked && data.state === 'flying' && !shipCrashed;
  useEffect(() => {
    if (manualControl && !canManualControl) setManualControl(false);
  }, [manualControl, canManualControl]);

  const [windowFocused, setWindowFocused] = useState(() => document.hasFocus());
  useEffect(() => {
    const onFocusChange = (focused: boolean) => setWindowFocused(focused);
    globalEvents.on('window-focus-change', onFocusChange);
    return () => globalEvents.off('window-focus-change', onFocusChange);
  }, []);

  useEffect(() => {
    if (!manualControl) return;
    for (const code of STEER_KEYCODES) acquireHotKey(code);
    return () => {
      for (const code of STEER_KEYCODES) releaseHotKey(code);
    };
  }, [manualControl]);

  useEffect(() => {
    const held = new Set<string>();
    const courseOfHeld = () => {
      let dir = 0;
      for (const code of held) dir |= KEY_AXIS[code] ?? 0;
      if ((dir & DIR.N) !== 0 && (dir & DIR.S) !== 0) dir &= ~(DIR.N | DIR.S);
      if ((dir & DIR.E) !== 0 && (dir & DIR.W) !== 0) dir &= ~(DIR.E | DIR.W);
      return dir;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const guards = keyGuards.current;
      if (!guards.manual) return;
      if (guards.locked || !guards.flying || guards.crashed || guards.abandoned)
        return;
      if (event.ctrlKey || event.altKey || event.metaKey) return;
      if (event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.code === 'Space') {
        event.preventDefault();
        if (!event.repeat) act('stop');
        return;
      }
      if (event.code === 'KeyX') {
        event.preventDefault();
        if (!event.repeat) act('set_course', { dir: 0 });
        return;
      }
      if (!(event.code in KEY_AXIS)) return;
      event.preventDefault();
      if (event.repeat || held.has(event.code)) return;
      held.add(event.code);
      const dir = courseOfHeld();
      if (dir) act('set_course', { dir });
    };
    const onKeyUp = (event: KeyboardEvent) => {
      held.delete(event.code);
    };
    const onBlur = () => held.clear();
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [act]);

  return {
    manualControl,
    setManualControl,
    canManualControl,
    windowFocused,
  };
};
