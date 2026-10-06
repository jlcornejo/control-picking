import { Alert, Platform, type AlertButton } from 'react-native';

/**
 * Cross-platform alert helper.
 *
 * On native (iOS/Android) delegates to `Alert.alert`, which renders a real
 * modal. On web (`react-native-web`) `Alert.alert` is a no-op, so nothing is
 * shown and `onPress` callbacks never fire — this breaks flows like picking
 * registration where confirmation/feedback is communicated through alerts.
 *
 * On web we fall back to the browser's native dialogs:
 *   - 0 or 1 buttons               -> `window.alert`, then fire the button's
 *                                     `onPress` (if any) so continuation logic
 *                                     keeps working.
 *   - 2+ buttons                   -> `window.confirm`. "OK" fires the primary
 *                                     (non-cancel) button's `onPress`; "Cancel"
 *                                     fires the cancel button's `onPress`.
 *
 * This mirrors the existing `handleLogout` pattern in profile.tsx, generalised
 * so every screen can share it.
 */
export function showAlert(title: string, message?: string, buttons?: AlertButton[]): void {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, buttons);
    return;
  }

  const text = message ? `${title}\n\n${message}` : title;
  const win = globalThis as unknown as {
    alert: (msg: string) => void;
    confirm: (msg: string) => boolean;
  };

  // Simple notice: no choice to make.
  if (!buttons || buttons.length <= 1) {
    win.alert(text);
    buttons?.[0]?.onPress?.();
    return;
  }

  // Choice dialog: map to confirm (OK = primary action, Cancel = cancel action).
  const cancelButton = buttons.find((b) => b.style === 'cancel');
  const primaryButton = buttons.find((b) => b.style !== 'cancel') ?? buttons[buttons.length - 1];

  const confirmed = win.confirm(text);
  if (confirmed) {
    primaryButton?.onPress?.();
  } else {
    cancelButton?.onPress?.();
  }
}
