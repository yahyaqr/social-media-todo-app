import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

export type RemoteAction =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'confirm'
  | 'camera1'
  | 'camera2'
  | 'unknown';

export type RemoteSource = 'pointer' | 'keyboard' | 'hid';

export type RemoteEventPayload = {
  action: RemoteAction;
  source: RemoteSource;
  rawType: string;
  timestamp: number;
  confidence: number;
  detail: Record<string, unknown>;
};

export type PointerGestureType = 'drag-like' | 'tap-like';
export type PointerAxis = 'x' | 'y' | 'none';
export type PointerDirection = 'left' | 'right' | 'up' | 'down' | 'still';

export type PointerMappingRule = {
  id: string;
  enabled?: boolean;
  source: 'pointer';
  action: RemoteAction;
  pointer: {
    gestureType?: PointerGestureType;
    axis?: PointerAxis;
    direction?: PointerDirection;
    minDistance?: number;
    maxDistance?: number;
    minDurationMs?: number;
    maxDurationMs?: number;
  };
};

export type KeyboardMappingRule = {
  id: string;
  enabled?: boolean;
  source: 'keyboard';
  action: RemoteAction;
  keyboard: {
    eventType?: 'keydown' | 'keyup';
    key?: string;
    code?: string;
    keyCode?: number;
    which?: number;
  };
};

export type HidMappingRule = {
  id: string;
  enabled?: boolean;
  source: 'hid';
  action: RemoteAction;
  hid: {
    reportId?: number;
    bytesPrefix?: number[];
  };
};

export type RemoteMappingRule = PointerMappingRule | KeyboardMappingRule | HidMappingRule;

export type UseBluetoothRemoteTeleprompterOptions = {
  debug?: boolean;
  autoStart?: boolean;
  pointerDragThreshold?: number;
  tapMaxDistance?: number;
  tapMaxDurationMs?: number;
  eventDebounceMs?: number;
  recentEventsLimit?: number;
  mappings?: RemoteMappingRule[];
  enableExperimentalCamera2Split?: boolean;
  camera2MinDurationMs?: number;
  camera2MaxDurationMs?: number;
  keyboardCamera1FallbackDebounceMs?: number;
  onRemoteEvent?: (payload: RemoteEventPayload) => void;
};

type PointerPoint = {
  t: number;
  x: number;
  y: number;
  buttons: number;
};

type PointerSession = {
  startedAt: number;
  pointerType: string;
  button: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  points: PointerPoint[];
};

type InferredPointerGesture = {
  gestureType: PointerGestureType;
  axis: PointerAxis;
  direction: PointerDirection;
  durationMs: number;
  dx: number;
  dy: number;
  distance: number;
  moveCount: number;
};

type HidCollectionSummary = {
  usagePage: number;
  usage: number;
  type: number;
};

type HidInputReportLike = Event & {
  reportId: number;
  data: DataView;
};

type HidDeviceLike = EventTarget & {
  productName: string;
  vendorId: number;
  productId: number;
  opened: boolean;
  collections: HidCollectionSummary[];
  open: () => Promise<void>;
  close: () => Promise<void>;
  addEventListener: (type: 'inputreport', listener: (event: HidInputReportLike) => void) => void;
  removeEventListener: (type: 'inputreport', listener: (event: HidInputReportLike) => void) => void;
};

type NavigatorWithHid = Navigator & {
  hid?: {
    requestDevice: (options: { filters: Array<Record<string, never>> }) => Promise<HidDeviceLike[]>;
  };
};

const DEFAULT_MAPPINGS: RemoteMappingRule[] = [
  {
    id: 'pointer-confirm-shared-center-camera2',
    source: 'pointer',
    action: 'confirm',
    pointer: {
      gestureType: 'tap-like',
      axis: 'none',
      direction: 'still',
      maxDistance: 6,
      maxDurationMs: 80
    }
  },
  {
    id: 'pointer-left-arrow-button',
    source: 'pointer',
    action: 'left',
    pointer: {
      gestureType: 'drag-like',
      axis: 'x',
      direction: 'right',
      minDistance: 40,
      maxDurationMs: 220
    }
  },
  {
    id: 'pointer-right-arrow-button',
    source: 'pointer',
    action: 'right',
    pointer: {
      gestureType: 'drag-like',
      axis: 'x',
      direction: 'left',
      minDistance: 40,
      maxDurationMs: 220
    }
  },
  {
    id: 'pointer-up-arrow-button',
    source: 'pointer',
    action: 'up',
    pointer: {
      gestureType: 'drag-like',
      axis: 'y',
      direction: 'down',
      minDistance: 40,
      maxDurationMs: 220
    }
  },
  {
    id: 'pointer-down-arrow-button',
    source: 'pointer',
    action: 'down',
    pointer: {
      gestureType: 'drag-like',
      axis: 'y',
      direction: 'up',
      minDistance: 40,
      maxDurationMs: 220
    }
  },
  {
    id: 'keyboard-up-arrow',
    source: 'keyboard',
    action: 'up',
    keyboard: {
      eventType: 'keydown',
      key: 'ArrowUp'
    }
  },
  {
    id: 'keyboard-down-arrow',
    source: 'keyboard',
    action: 'down',
    keyboard: {
      eventType: 'keydown',
      key: 'ArrowDown'
    }
  },
  {
    id: 'keyboard-left-arrow',
    source: 'keyboard',
    action: 'left',
    keyboard: {
      eventType: 'keydown',
      key: 'ArrowLeft'
    }
  },
  {
    id: 'keyboard-right-arrow',
    source: 'keyboard',
    action: 'right',
    keyboard: {
      eventType: 'keydown',
      key: 'ArrowRight'
    }
  },
  {
    id: 'keyboard-confirm-enter',
    source: 'keyboard',
    action: 'confirm',
    keyboard: {
      eventType: 'keydown',
      key: 'Enter'
    }
  },
  {
    id: 'keyboard-camera1-audio-volume-up',
    source: 'keyboard',
    action: 'camera1',
    keyboard: {
      eventType: 'keydown',
      key: 'AudioVolumeUp',
      keyCode: 175,
      which: 175
    }
  },
  {
    id: 'keyboard-camera1-audio-volume-down',
    source: 'keyboard',
    action: 'camera1',
    keyboard: {
      eventType: 'keydown',
      key: 'AudioVolumeDown',
      keyCode: 174,
      which: 174
    }
  }
];

const round = (value: number, digits = 2): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const isBrowser = (): boolean => typeof window !== 'undefined' && typeof document !== 'undefined';

export function useBluetoothRemoteTeleprompter(
  options: UseBluetoothRemoteTeleprompterOptions = {}
) {
  const {
    debug = false,
    autoStart = true,
    pointerDragThreshold = 18,
    tapMaxDistance = 6,
    tapMaxDurationMs = 120,
    eventDebounceMs = 120,
    recentEventsLimit = 30,
    mappings = DEFAULT_MAPPINGS,
    enableExperimentalCamera2Split = false,
    camera2MinDurationMs = 24,
    camera2MaxDurationMs = 40,
    keyboardCamera1FallbackDebounceMs = 260,
    onRemoteEvent
  } = options;

  const isListening = ref(false);
  const lastRemoteEvent = ref<RemoteEventPayload | null>(null);
  const recentEvents = ref<RemoteEventPayload[]>([]);
  const connectedHidName = ref<string | null>(null);
  const runtimeMappings = ref<RemoteMappingRule[]>([...mappings]);

  let activePointerSession: PointerSession | null = null;
  let connectedHidDevice: HidDeviceLike | null = null;
  const lastFiredAtByAction = new Map<RemoteAction, number>();
  let lastPointerTapAt = 0;
  let lastKeyboardCamera1At = 0;

  const enabledMappings = computed(() =>
    runtimeMappings.value.filter((rule) => rule.enabled !== false)
  );

  const logDebug = (label: string, payload: unknown): void => {
    if (!debug) return;
    console.log(`[useBluetoothRemoteTeleprompter] ${label}`, payload);
  };

  const pushEvent = (payload: RemoteEventPayload): void => {
    const previousTimestamp = lastFiredAtByAction.get(payload.action) ?? 0;

    if (payload.timestamp - previousTimestamp < eventDebounceMs) {
      return;
    }

    lastFiredAtByAction.set(payload.action, payload.timestamp);
    lastRemoteEvent.value = payload;
    recentEvents.value = [payload, ...recentEvents.value].slice(0, recentEventsLimit);

    logDebug('remote-event', payload);
    onRemoteEvent?.(payload);
  };

  const inferPointerGesture = (session: PointerSession): InferredPointerGesture => {
    const durationMs = performance.now() - session.startedAt;
    const dx = session.endX - session.startX;
    const dy = session.endY - session.startY;
    const distance = Math.hypot(dx, dy);

    let axis: PointerAxis = 'none';
    let direction: PointerDirection = 'still';

    if (distance <= tapMaxDistance) {
      axis = 'none';
      direction = 'still';
    } else if (Math.abs(dx) >= Math.abs(dy)) {
      axis = 'x';
      direction = dx >= 0 ? 'right' : 'left';
    } else {
      axis = 'y';
      direction = dy >= 0 ? 'down' : 'up';
    }

    const gestureType: PointerGestureType =
      distance <= tapMaxDistance && durationMs <= tapMaxDurationMs ? 'tap-like' : 'drag-like';

    return {
      gestureType,
      axis,
      direction,
      durationMs: round(durationMs),
      dx: round(dx),
      dy: round(dy),
      distance: round(distance),
      moveCount: Math.max(session.points.length - 1, 0)
    };
  };

  const matchPointerRule = (
    gesture: InferredPointerGesture
  ): PointerMappingRule | undefined => {
    return enabledMappings.value.find((rule): rule is PointerMappingRule => {
      if (rule.source !== 'pointer') return false;

      const cfg = rule.pointer;
      if (cfg.gestureType && cfg.gestureType !== gesture.gestureType) return false;
      if (cfg.axis && cfg.axis !== gesture.axis) return false;
      if (cfg.direction && cfg.direction !== gesture.direction) return false;
      if (cfg.minDistance !== undefined && gesture.distance < cfg.minDistance) return false;
      if (cfg.maxDistance !== undefined && gesture.distance > cfg.maxDistance) return false;
      if (cfg.minDurationMs !== undefined && gesture.durationMs < cfg.minDurationMs) return false;
      if (cfg.maxDurationMs !== undefined && gesture.durationMs > cfg.maxDurationMs) return false;

      return true;
    });
  };

  const matchKeyboardRule = (event: KeyboardEvent): KeyboardMappingRule | undefined => {
    return enabledMappings.value.find((rule): rule is KeyboardMappingRule => {
      if (rule.source !== 'keyboard') return false;

      const cfg = rule.keyboard;
      if (cfg.eventType && cfg.eventType !== event.type) return false;
      if (cfg.key && cfg.key !== event.key) return false;
      if (cfg.code && cfg.code !== event.code) return false;
      if (cfg.keyCode !== undefined && cfg.keyCode !== event.keyCode) return false;
      if (cfg.which !== undefined && cfg.which !== event.which) return false;

      return true;
    });
  };

  const matchHidRule = (reportId: number, bytes: number[]): HidMappingRule | undefined => {
    return enabledMappings.value.find((rule): rule is HidMappingRule => {
      if (rule.source !== 'hid') return false;

      const cfg = rule.hid;
      if (cfg.reportId !== undefined && cfg.reportId !== reportId) return false;

      if (cfg.bytesPrefix?.length) {
        if (bytes.length < cfg.bytesPrefix.length) return false;

        for (let index = 0; index < cfg.bytesPrefix.length; index += 1) {
          if (bytes[index] !== cfg.bytesPrefix[index]) return false;
        }
      }

      return true;
    });
  };

  const classifyTapAction = (gesture: InferredPointerGesture): RemoteAction => {
    if (
      enableExperimentalCamera2Split &&
      gesture.durationMs >= camera2MinDurationMs &&
      gesture.durationMs <= camera2MaxDurationMs
    ) {
      return 'camera2';
    }

    return 'confirm';
  };

  const handlePointerDown = (event: PointerEvent): void => {
    if (!isListening.value) return;
    if (event.pointerType !== 'mouse') return;
    if (event.button !== 0) return;

    activePointerSession = {
      startedAt: performance.now(),
      pointerType: event.pointerType,
      button: event.button,
      startX: event.clientX,
      startY: event.clientY,
      endX: event.clientX,
      endY: event.clientY,
      points: [
        {
          t: performance.now(),
          x: event.clientX,
          y: event.clientY,
          buttons: event.buttons
        }
      ]
    };
  };

  const handlePointerMove = (event: PointerEvent): void => {
    if (!isListening.value) return;
    if (!activePointerSession) return;

    activePointerSession.endX = event.clientX;
    activePointerSession.endY = event.clientY;
    activePointerSession.points.push({
      t: performance.now(),
      x: event.clientX,
      y: event.clientY,
      buttons: event.buttons
    });
  };

  const handlePointerUp = (event: PointerEvent): void => {
    if (!isListening.value) return;
    if (!activePointerSession) return;

    activePointerSession.endX = event.clientX;
    activePointerSession.endY = event.clientY;
    activePointerSession.points.push({
      t: performance.now(),
      x: event.clientX,
      y: event.clientY,
      buttons: event.buttons
    });

    const gesture = inferPointerGesture(activePointerSession);
    const matchedRule = matchPointerRule(gesture);

    if (gesture.gestureType === 'tap-like') {
      const inferredAction = classifyTapAction(gesture);
      lastPointerTapAt = performance.now();

      pushEvent({
        action: inferredAction,
        source: 'pointer',
        rawType: 'pointer-gesture',
        timestamp: performance.now(),
        confidence: inferredAction === 'camera2' ? 0.55 : 0.95,
        detail: {
          ...gesture,
          startX: activePointerSession.startX,
          startY: activePointerSession.startY,
          endX: activePointerSession.endX,
          endY: activePointerSession.endY,
          mappingId:
            matchedRule?.id ??
            (inferredAction === 'camera2'
              ? 'experimental-camera2-timing-split'
              : 'shared-confirm-center-camera2'),
          note:
            inferredAction === 'camera2'
              ? 'Experimental timing-based camera2 classification'
              : 'Shared center/camera2 confirm classification'
        }
      });

      activePointerSession = null;
      return;
    }

    if (matchedRule) {
      pushEvent({
        action: matchedRule.action,
        source: 'pointer',
        rawType: 'pointer-gesture',
        timestamp: performance.now(),
        confidence: 0.98,
        detail: {
          ...gesture,
          startX: activePointerSession.startX,
          startY: activePointerSession.startY,
          endX: activePointerSession.endX,
          endY: activePointerSession.endY,
          mappingId: matchedRule.id
        }
      });

      activePointerSession = null;
      return;
    }

    if (gesture.gestureType === 'drag-like' && gesture.distance >= pointerDragThreshold) {
      pushEvent({
        action: 'unknown',
        source: 'pointer',
        rawType: 'pointer-gesture',
        timestamp: performance.now(),
        confidence: 0.4,
        detail: {
          ...gesture,
          startX: activePointerSession.startX,
          startY: activePointerSession.startY,
          endX: activePointerSession.endX,
          endY: activePointerSession.endY,
          unmapped: true
        }
      });
    }

    activePointerSession = null;
  };

  const handleKeyboardEvent = (event: KeyboardEvent): void => {
    if (!isListening.value) return;

    const matchedRule = matchKeyboardRule(event);
    if (!matchedRule) return;

    const now = performance.now();

    if (matchedRule.action === 'camera1') {
      const hasRecentPointerTap = now - lastPointerTapAt < keyboardCamera1FallbackDebounceMs;
      const hasRecentCamera1KeyboardToggle = now - lastKeyboardCamera1At < keyboardCamera1FallbackDebounceMs;

      if (hasRecentPointerTap || hasRecentCamera1KeyboardToggle) {
        logDebug('keyboard-camera1-fallback-skipped', {
          key: event.key,
          reason: hasRecentPointerTap ? 'recent-pointer-tap' : 'recent-camera1-keyboard-fallback'
        });
        return;
      }

      lastKeyboardCamera1At = now;
    }

    event.preventDefault();
    event.stopPropagation();

    pushEvent({
      action: matchedRule.action,
      source: 'keyboard',
      rawType: event.type,
      timestamp: now,
      confidence: 0.92,
      detail: {
        key: event.key,
        code: event.code,
        keyCode: event.keyCode,
        which: event.which,
        repeat: event.repeat,
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        mappingId: matchedRule.id
      }
    });
  };

  const handleHidInputReport = (event: HidInputReportLike): void => {
    const bytes = Array.from(new Uint8Array(event.data.buffer));
    const matchedRule = matchHidRule(event.reportId, bytes);

    if (!matchedRule) {
      logDebug('hid-unmapped', {
        reportId: event.reportId,
        bytes
      });
      return;
    }

    pushEvent({
      action: matchedRule.action,
      source: 'hid',
      rawType: 'hid-inputreport',
      timestamp: performance.now(),
      confidence: 0.99,
      detail: {
        reportId: event.reportId,
        bytes,
        mappingId: matchedRule.id
      }
    });
  };

  const startListening = (): void => {
    if (!isBrowser()) return;
    if (isListening.value) return;

    window.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('pointermove', handlePointerMove, true);
    window.addEventListener('pointerup', handlePointerUp, true);
    window.addEventListener('keydown', handleKeyboardEvent, true);
    window.addEventListener('keyup', handleKeyboardEvent, true);

    isListening.value = true;
    logDebug('listening-started', { autoStart });
  };

  const stopListening = (): void => {
    if (!isBrowser()) return;
    if (!isListening.value) return;

    window.removeEventListener('pointerdown', handlePointerDown, true);
    window.removeEventListener('pointermove', handlePointerMove, true);
    window.removeEventListener('pointerup', handlePointerUp, true);
    window.removeEventListener('keydown', handleKeyboardEvent, true);
    window.removeEventListener('keyup', handleKeyboardEvent, true);

    activePointerSession = null;
    isListening.value = false;
    logDebug('listening-stopped', null);
  };

  const connectHid = async (): Promise<void> => {
    if (!isBrowser()) {
      throw new Error('Browser APIs are not available in this environment.');
    }

    const hidNavigator = navigator as NavigatorWithHid;

    if (!hidNavigator.hid) {
      throw new Error('WebHID is not supported in this browser.');
    }

    const devices = await hidNavigator.hid.requestDevice({ filters: [] });
    if (!devices.length) return;

    if (connectedHidDevice) {
      connectedHidDevice.removeEventListener('inputreport', handleHidInputReport);
      if (connectedHidDevice.opened) {
        await connectedHidDevice.close();
      }
    }

    connectedHidDevice = devices[0];
    await connectedHidDevice.open();
    connectedHidDevice.addEventListener('inputreport', handleHidInputReport);
    connectedHidName.value = connectedHidDevice.productName;

    logDebug('hid-connected', {
      productName: connectedHidDevice.productName,
      vendorId: connectedHidDevice.vendorId,
      productId: connectedHidDevice.productId
    });
  };

  const disconnectHid = async (): Promise<void> => {
    if (!connectedHidDevice) return;

    connectedHidDevice.removeEventListener('inputreport', handleHidInputReport);

    if (connectedHidDevice.opened) {
      await connectedHidDevice.close();
    }

    connectedHidDevice = null;
    connectedHidName.value = null;
    logDebug('hid-disconnected', null);
  };

  const updateMappings = (nextMappings: RemoteMappingRule[]): void => {
    runtimeMappings.value = [...nextMappings];
  };

  const resetMappings = (): void => {
    runtimeMappings.value = [...DEFAULT_MAPPINGS];
  };

  const clearRecentEvents = (): void => {
    recentEvents.value = [];
    lastRemoteEvent.value = null;
    lastFiredAtByAction.clear();
    lastPointerTapAt = 0;
    lastKeyboardCamera1At = 0;
  };

  onMounted(() => {
    if (autoStart) {
      startListening();
    }
  });

  onBeforeUnmount(() => {
    stopListening();
    void disconnectHid();
  });

  return {
    isListening,
    lastRemoteEvent,
    recentEvents,
    connectedHidName,
    mappings: runtimeMappings,
    enabledMappings,
    startListening,
    stopListening,
    connectHid,
    disconnectHid,
    updateMappings,
    resetMappings,
    clearRecentEvents
  };
}
