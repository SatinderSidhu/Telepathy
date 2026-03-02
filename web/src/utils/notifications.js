// Browser Notification Utility

export async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    console.warn('This browser does not support desktop notifications');
    return 'denied';
  }

  if (Notification.permission === 'granted') {
    return 'granted';
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission;
  }

  return Notification.permission;
}

export function showNotification(title, options = {}) {
  if (!('Notification' in window)) {
    console.warn('Desktop notifications not supported');
    return null;
  }

  if (Notification.permission !== 'granted') {
    console.warn('Notification permission not granted');
    return null;
  }

  const defaultOptions = {
    icon: '/vite.svg', // You can replace with your app icon
    badge: '/vite.svg',
    requireInteraction: false,
    ...options,
  };

  try {
    const notification = new Notification(title, defaultOptions);

    // Auto-close after 5 seconds if not requiring interaction
    if (!options.requireInteraction) {
      setTimeout(() => notification.close(), 5000);
    }

    return notification;
  } catch (error) {
    console.error('Error showing notification:', error);
    return null;
  }
}

export function showMessageNotification(senderName, message, conversationId) {
  const notification = showNotification(`New message from ${senderName}`, {
    body: message.length > 100 ? message.substring(0, 100) + '...' : message,
    tag: `message-${conversationId}`, // Prevents duplicate notifications for same conversation
    icon: '/vite.svg',
  });

  // Click to focus window
  if (notification) {
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  }

  return notification;
}

export function showCallNotification(callerName, callType, conversationId) {
  const notification = showNotification(`Incoming ${callType} call`, {
    body: `${callerName} is calling you...`,
    tag: `call-${conversationId}`,
    requireInteraction: true, // Keep notification open until user interacts
    icon: '/vite.svg',
  });

  // Click to focus window
  if (notification) {
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  }

  return notification;
}

// Check if user is currently on the tab
export function isPageVisible() {
  return document.visibilityState === 'visible';
}
