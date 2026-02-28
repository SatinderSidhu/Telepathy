import { useEffect, useRef, useCallback } from 'react';

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

  const sendBrowserNotification = useCallback((title, body, onClick) => {
    if (!('Notification' in window) || permissionRef.current !== 'granted') return;
    if (document.hasFocus()) return; // Don't show if app is focused

    const notification = new Notification(title, {
      body,
      icon: '/vite.svg',
      tag: title, // Prevent duplicate notifications
    });

    if (onClick) {
      notification.onclick = () => {
        window.focus();
        onClick();
        notification.close();
      };
    }

    setTimeout(() => notification.close(), 5000);
  }, []);

  const notifyMessage = useCallback((senderName, messageContent) => {
    playSound('message');
    sendBrowserNotification(
      `New message from ${senderName}`,
      messageContent
    );
  }, [sendBrowserNotification]);

  const notifyCall = useCallback((callerName, callType) => {
    playSound('call');
    sendBrowserNotification(
      `Incoming ${callType} call`,
      `${callerName} is calling you`
    );
  }, [sendBrowserNotification]);

  return { notifyMessage, notifyCall, playSound };
}
