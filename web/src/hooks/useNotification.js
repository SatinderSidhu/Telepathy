import { useEffect, useRef, useCallback } from 'react';
import { showMessageNotification, showCallNotification, isPageVisible } from '../utils/notifications';

// Simple notification sound using Web Audio API (no external files needed)
function playSound(type) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'message') {
      oscillator.frequency.value = 800;
      gain.gain.value = 0.1;
      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.15);
    } else if (type === 'call') {
      oscillator.frequency.value = 440;
      gain.gain.value = 0.2;
      oscillator.start();
      // Ring pattern
      const ringDuration = 0.3;
      const pauseDuration = 0.2;
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.setValueAtTime(0, ctx.currentTime + ringDuration);
      gain.gain.setValueAtTime(0.2, ctx.currentTime + ringDuration + pauseDuration);
      gain.gain.setValueAtTime(0, ctx.currentTime + 2 * ringDuration + pauseDuration);
      oscillator.stop(ctx.currentTime + 2 * (ringDuration + pauseDuration));
    }
  } catch (e) {
    // Audio not available — silently ignore
  }
}

export function useNotification() {
  const permissionRef = useRef(Notification.permission);

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then((perm) => {
        permissionRef.current = perm;
      });
    }
  }, []);

  const notifyMessage = useCallback((senderName, messageContent, conversationId) => {
    playSound('message');

    // Show notification only if page is not visible or not focused
    if (!isPageVisible() || !document.hasFocus()) {
      showMessageNotification(senderName, messageContent, conversationId);
    }
  }, []);

  const notifyCall = useCallback((callerName, callType, conversationId) => {
    playSound('call');

    // Always show call notifications (even if page is visible)
    showCallNotification(callerName, callType, conversationId);
  }, []);

  return { notifyMessage, notifyCall, playSound };
}
