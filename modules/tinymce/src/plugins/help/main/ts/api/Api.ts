import { Arr } from '@ephox/katamari';

import { Dialog } from 'tinymce/core/api/ui/Ui';

import * as ConvertShortcut from '../alien/ConvertShortcut';
import * as KeyboardShortcuts from '../data/KeyboardShortcuts';
import { CustomTabSpecs } from '../Plugin';
import { description } from '../ui/KeyboardNavTab';
import { ShortcutActionPairType } from '../ui/KeyboardShortcutsTab';

export interface KeyboardShortcut {
  action: string;
  text: string;
}
export interface Api {
  readonly addTab: (spec: Dialog.TabSpec) => void;
  readonly getKeyboardShortcuts: () => KeyboardShortcut[];
  readonly getKeyboardNavText: () => string;
}

const get = (customTabs: CustomTabSpecs): Api => {
  const addTab = (spec: Dialog.TabSpec): void => {
    const currentCustomTabs = customTabs.get();
    currentCustomTabs[spec.name] = spec;
    customTabs.set(currentCustomTabs);
  };

  const getKeyboardShortcuts = (): KeyboardShortcut[] => {
    const shortcutList = Arr.map(KeyboardShortcuts.shortcuts, (shortcut: ShortcutActionPairType) => {
      const shortcutText = Arr.map(shortcut.shortcuts, ConvertShortcut.convertText).join(' or ');
      return { action: shortcut.action, text: shortcutText };
    });
    return shortcutList;
  };

  const getKeyboardNavText = (): string => {
    return description;
  };

  return {
    addTab,
    getKeyboardShortcuts,
    getKeyboardNavText
  };
};

export { get };
