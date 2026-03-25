<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';

type RemoteLogType =
  | 'status'
  | 'keyboard'
  | 'pointer'
  | 'input'
  | 'gamepad'
  | 'hid'
  | 'gesture'
  | 'error';

type RemoteLogEntry = {
  timestamp: string;
  type: RemoteLogType;
  payload: Record<string, unknown>;
};

type HidCollectionSummary = {
  usagePage: number;
  usage: number;
  type: number;
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

type HidInputReportLike = Event & {
  reportId: number;
  data: DataView;
};

type NavigatorWithHid = Navigator & {
  hid?: {
    requestDevice: (options: { filters: Array<Record<string, never>> }) => Promise<HidDeviceLike[]>;
  };
};

type RemoteButtonMapping = {
  signature: string;
  assignedName: string;
  sourceType: string;
  sample: Record<string, unknown>;
  updatedAt: string;
};

type PointerCapturePoint = {
  t: number;
  x: number;
  y: number;
  movementX: number;
  movementY: number;
  buttons: number;
};

type ActivePointerSession = {
  id: number;
  startedAt: number;
  pointerType: string;
  button: number | null;
  buttons: number | null;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  targetTagName: string | null;
  targetId: string | null;
  targetClassName: string | null;
  points: PointerCapturePoint[];
};

const REMOTE_LOG_LIMIT = 60;
const POINTER_MOVE_LOG_SAMPLE_LIMIT = 40;
const MIN_DIRECTION_DISTANCE = 12;
const MAX_STILLNESS_DISTANCE = 6;
const POINTER_SESSION_TIMEOUT_MS = 1600;

const supportedRemoteKeys = new Set([
  'Camera',
  'CameraFocus',
  'HeadsetHook',
  'MediaPlayPause',
  'AudioVolumeUp',
  'AudioVolumeDown',
  'AudioVolumeMute',
  'MediaTrackNext',
  'MediaTrackPrevious',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Enter',
  ' ',
  'Unidentified'
]);

const isRemoteListening = ref(false);
const remoteListenerAttached = ref(false);
const remoteInterceptEnabled = ref(true);
const isSingleCaptureMode = ref(false);
const isPointerMoveCaptureEnabled = ref(true);
const isKeyboardCaptureEnabled = ref(true);
const isRawClickCaptureEnabled = ref(true);
const remoteLog = ref<RemoteLogEntry[]>([]);
const lastRemoteKey = ref<string | null>(null);
const remoteDetectedCount = ref(0);
const isConnectingHid = ref(false);
const connectedHidName = ref<string | null>(null);
const isCopyingLog = ref(false);
const isCopyingMappings = ref(false);
const currentDetectedSignature = ref<string | null>(null);
const currentDetectedSourceType = ref<string | null>(null);
const currentDetectedPayload = ref<Record<string, unknown> | null>(null);
const pendingAssignedName = ref('');
const mappedButtons = ref<RemoteButtonMapping[]>([]);
const activePointerSessionSummary = ref<string | null>(null);

const hidSupportAvailable = computed(() => typeof navigator !== 'undefined' && 'hid' in navigator);
const gamepadSupportAvailable = computed(() => typeof navigator !== 'undefined' && 'getGamepads' in navigator);

let connectedHidDevice: HidDeviceLike | null = null;
let gamepadPollFrameId: number | null = null;
let lastGamepadSnapshot = '';
let pointerSessionIdSeed = 0;
let activePointerSession: ActivePointerSession | null = null;
let pointerSessionTimeoutId: number | null = null;

const remoteLogText = computed(() =>
  remoteLog.value.length
    ? remoteLog.value.map((entry) => JSON.stringify(entry, null, 2)).join('\n\n')
    : 'No events captured yet.'
);

const currentMapping = computed(() =>
  mappedButtons.value.find((mapping) => mapping.signature === currentDetectedSignature.value) ?? null
);

const mappingsExportText = computed(() =>
  JSON.stringify(
    mappedButtons.value.map((mapping) => ({
      signature: mapping.signature,
      assignedName: mapping.assignedName,
      sourceType: mapping.sourceType,
      sample: mapping.sample,
      updatedAt: mapping.updatedAt
    })),
    null,
    2
  )
);

const formatTimestamp = (): string =>
  new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

const roundNumber = (value: number, decimals = 2): number => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

const getTargetSummary = (target: EventTarget | null) => {
  const element = target instanceof HTMLElement ? target : null;

  return {
    tagName: element?.tagName ?? null,
    id: element?.id ?? null,
    className: typeof element?.className === 'string' ? element.className : null
  };
};

const isIgnoredUiEventTarget = (target: EventTarget | null): boolean => {
  return target instanceof HTMLElement && Boolean(target.closest('[data-remote-ui-control="true"]'));
};

const writeRemoteLog = (type: RemoteLogType, payload: Record<string, unknown>): void => {
  const nextEntry: RemoteLogEntry = {
    timestamp: formatTimestamp(),
    type,
    payload
  };

  remoteLog.value = isSingleCaptureMode.value
    ? [nextEntry]
    : [nextEntry, ...remoteLog.value].slice(0, REMOTE_LOG_LIMIT);
};

const makeEventSignature = (type: string, payload: Record<string, unknown>): string => {
  if (type === 'keyboard') {
    return JSON.stringify({
      type,
      eventType: payload.eventType ?? null,
      key: payload.key ?? null,
      code: payload.code ?? null,
      keyCode: payload.keyCode ?? null,
      which: payload.which ?? null
    });
  }

  if (type === 'gamepad') {
    return JSON.stringify({
      type,
      gamepads: payload.gamepads ?? null
    });
  }

  if (type === 'hid') {
    return JSON.stringify({
      type,
      reportId: payload.reportId ?? null,
      bytes: payload.bytes ?? null
    });
  }

  if (type === 'pointer') {
    return JSON.stringify({
      type,
      eventType: payload.eventType ?? null,
      pointerType: payload.pointerType ?? null,
      button: payload.button ?? null,
      buttons: payload.buttons ?? null,
      direction: payload.direction ?? null,
      axis: payload.axis ?? null,
      dominantSign: payload.dominantSign ?? null,
      distanceBucket: payload.distanceBucket ?? null,
      moveCountBucket: payload.moveCountBucket ?? null
    });
  }

  if (type === 'gesture') {
    return JSON.stringify({
      type,
      gestureType: payload.gestureType ?? null,
      pointerType: payload.pointerType ?? null,
      axis: payload.axis ?? null,
      direction: payload.direction ?? null,
      dominantSign: payload.dominantSign ?? null,
      distanceBucket: payload.distanceBucket ?? null,
      moveCountBucket: payload.moveCountBucket ?? null,
      durationBucket: payload.durationBucket ?? null
    });
  }

  return JSON.stringify({
    type,
    eventType: payload.eventType ?? null,
    tagName: payload.tagName ?? null,
    id: payload.id ?? null,
    className: payload.className ?? null
  });
};

const rememberDetectedInput = (type: string, payload: Record<string, unknown>): void => {
  const signature = makeEventSignature(type, payload);
  currentDetectedSignature.value = signature;
  currentDetectedSourceType.value = type;
  currentDetectedPayload.value = payload;
  pendingAssignedName.value = currentMapping.value?.assignedName ?? '';
};

const registerDetectedInput = (
  type: 'keyboard' | 'pointer' | 'input' | 'gamepad' | 'hid' | 'gesture',
  payload: Record<string, unknown>
): void => {
  rememberDetectedInput(type, payload);
  writeRemoteLog(type, payload);
};

const toDistanceBucket = (distance: number): string => {
  if (distance < 8) return 'tiny';
  if (distance < 20) return 'short';
  if (distance < 45) return 'medium';
  return 'long';
};

const toMoveCountBucket = (count: number): string => {
  if (count <= 1) return 'single';
  if (count <= 4) return 'few';
  if (count <= 12) return 'many';
  return 'dense';
};

const toDurationBucket = (durationMs: number): string => {
  if (durationMs < 120) return 'tap';
  if (durationMs < 350) return 'short';
  if (durationMs < 900) return 'medium';
  return 'long';
};

const inferDirectionFromDelta = (dx: number, dy: number) => {
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  const distance = Math.hypot(dx, dy);

  if (distance <= MAX_STILLNESS_DISTANCE) {
    return {
      axis: 'none',
      direction: 'still',
      dominantSign: '0'
    };
  }

  if (absX >= absY) {
    return {
      axis: 'x',
      direction: dx >= 0 ? 'right' : 'left',
      dominantSign: dx >= 0 ? '+' : '-'
    };
  }

  return {
    axis: 'y',
    direction: dy >= 0 ? 'down' : 'up',
    dominantSign: dy >= 0 ? '+' : '-'
  };
};

const clearPointerSessionTimeout = (): void => {
  if (pointerSessionTimeoutId !== null) {
    window.clearTimeout(pointerSessionTimeoutId);
    pointerSessionTimeoutId = null;
  }
};

const schedulePointerSessionTimeout = (): void => {
  clearPointerSessionTimeout();

  pointerSessionTimeoutId = window.setTimeout(() => {
    finalizePointerSession('timeout');
  }, POINTER_SESSION_TIMEOUT_MS);
};

const beginPointerSession = (event: PointerEvent): void => {
  const target = getTargetSummary(event.target);

  activePointerSession = {
    id: ++pointerSessionIdSeed,
    startedAt: performance.now(),
    pointerType: event.pointerType || 'unknown',
    button: typeof event.button === 'number' ? event.button : null,
    buttons: typeof event.buttons === 'number' ? event.buttons : null,
    startX: event.clientX,
    startY: event.clientY,
    lastX: event.clientX,
    lastY: event.clientY,
    targetTagName: target.tagName,
    targetId: target.id,
    targetClassName: target.className,
    points: [
      {
        t: performance.now(),
        x: event.clientX,
        y: event.clientY,
        movementX: event.movementX ?? 0,
        movementY: event.movementY ?? 0,
        buttons: event.buttons ?? 0
      }
    ]
  };

  activePointerSessionSummary.value = `Session #${activePointerSession.id} started`;
  schedulePointerSessionTimeout();
};

const addPointerPointToSession = (event: PointerEvent): void => {
  if (!activePointerSession) {
    beginPointerSession(event);
    return;
  }

  const point: PointerCapturePoint = {
    t: performance.now(),
    x: event.clientX,
    y: event.clientY,
    movementX: event.movementX ?? 0,
    movementY: event.movementY ?? 0,
    buttons: event.buttons ?? 0
  };

  activePointerSession.points.push(point);

  if (activePointerSession.points.length > POINTER_MOVE_LOG_SAMPLE_LIMIT) {
    activePointerSession.points.splice(1, activePointerSession.points.length - POINTER_MOVE_LOG_SAMPLE_LIMIT);
  }

  activePointerSession.lastX = event.clientX;
  activePointerSession.lastY = event.clientY;
  activePointerSession.buttons = typeof event.buttons === 'number' ? event.buttons : activePointerSession.buttons;

  schedulePointerSessionTimeout();
};

const finalizePointerSession = (endReason: 'pointerup' | 'click' | 'timeout'): void => {
  if (!activePointerSession) {
    return;
  }

  clearPointerSessionTimeout();

  const session = activePointerSession;
  activePointerSession = null;

  const endedAt = performance.now();
  const durationMs = roundNumber(endedAt - session.startedAt);
  const dx = roundNumber(session.lastX - session.startX);
  const dy = roundNumber(session.lastY - session.startY);
  const distance = roundNumber(Math.hypot(dx, dy));
  const moveCount = Math.max(session.points.length - 1, 0);
  const directionMeta = inferDirectionFromDelta(dx, dy);

  const gestureType =
    distance <= MAX_STILLNESS_DISTANCE
      ? 'tap-like'
      : moveCount <= 1
        ? 'jump-like'
        : 'drag-like';

  const payload = {
    gestureType,
    endReason,
    pointerType: session.pointerType,
    button: session.button,
    buttons: session.buttons,
    targetTagName: session.targetTagName,
    targetId: session.targetId,
    targetClassName: session.targetClassName,
    startX: roundNumber(session.startX),
    startY: roundNumber(session.startY),
    endX: roundNumber(session.lastX),
    endY: roundNumber(session.lastY),
    dx,
    dy,
    distance,
    durationMs,
    moveCount,
    axis: directionMeta.axis,
    direction: directionMeta.direction,
    dominantSign: directionMeta.dominantSign,
    distanceBucket: toDistanceBucket(distance),
    moveCountBucket: toMoveCountBucket(moveCount),
    durationBucket: toDurationBucket(durationMs),
    samplePoints: session.points.slice(0, 12).map((point) => ({
      t: roundNumber(point.t - session.startedAt),
      x: roundNumber(point.x),
      y: roundNumber(point.y),
      movementX: roundNumber(point.movementX),
      movementY: roundNumber(point.movementY),
      buttons: point.buttons
    }))
  };

  activePointerSessionSummary.value =
    `${payload.gestureType} | ${payload.direction} | ${distance}px | ${durationMs}ms`;

  remoteDetectedCount.value += 1;
  registerDetectedInput('gesture', payload);
};

const handleKeyboardEvent = (event: KeyboardEvent): void => {
  if (!isRemoteListening.value || !isKeyboardCaptureEnabled.value) {
    return;
  }

  if (isIgnoredUiEventTarget(event.target)) {
    return;
  }

  const payload = {
    eventType: event.type,
    key: event.key,
    code: event.code,
    keyCode: event.keyCode,
    which: event.which,
    altKey: event.altKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    shiftKey: event.shiftKey,
    repeat: event.repeat,
    visibilityState: document.visibilityState,
    hasFocus: document.hasFocus()
  };

  registerDetectedInput('keyboard', payload);

  if (supportedRemoteKeys.has(event.key)) {
    lastRemoteKey.value = event.key;
    remoteDetectedCount.value += 1;

    if (remoteInterceptEnabled.value) {
      event.preventDefault();
      event.stopPropagation();
    }
  }
};

const handlePointerDown = (event: PointerEvent): void => {
  if (!isRemoteListening.value) {
    return;
  }

  if (isIgnoredUiEventTarget(event.target)) {
    return;
  }

  beginPointerSession(event);

  registerDetectedInput('pointer', {
    eventType: 'pointerdown',
    pointerType: event.pointerType ?? 'unknown',
    button: typeof event.button === 'number' ? event.button : null,
    buttons: typeof event.buttons === 'number' ? event.buttons : null,
    clientX: roundNumber(event.clientX),
    clientY: roundNumber(event.clientY),
    movementX: roundNumber(event.movementX ?? 0),
    movementY: roundNumber(event.movementY ?? 0),
    isTrusted: event.isTrusted
  });
};

const handlePointerMove = (event: PointerEvent): void => {
  if (!isRemoteListening.value || !isPointerMoveCaptureEnabled.value) {
    return;
  }

  if (isIgnoredUiEventTarget(event.target)) {
    return;
  }

  if (!activePointerSession && (event.buttons === 0 || event.buttons === undefined)) {
    return;
  }

  addPointerPointToSession(event);
};

const handlePointerUp = (event: PointerEvent): void => {
  if (!isRemoteListening.value) {
    return;
  }

  if (isIgnoredUiEventTarget(event.target)) {
    return;
  }

  addPointerPointToSession(event);

  registerDetectedInput('pointer', {
    eventType: 'pointerup',
    pointerType: event.pointerType ?? 'unknown',
    button: typeof event.button === 'number' ? event.button : null,
    buttons: typeof event.buttons === 'number' ? event.buttons : null,
    clientX: roundNumber(event.clientX),
    clientY: roundNumber(event.clientY),
    movementX: roundNumber(event.movementX ?? 0),
    movementY: roundNumber(event.movementY ?? 0),
    isTrusted: event.isTrusted
  });

  finalizePointerSession('pointerup');
};

const handleClickEvent = (event: MouseEvent): void => {
  if (!isRemoteListening.value || !isRawClickCaptureEnabled.value) {
    return;
  }

  if (isIgnoredUiEventTarget(event.target)) {
    return;
  }

  const target = getTargetSummary(event.target);

  registerDetectedInput('input', {
    eventType: event.type,
    tagName: target.tagName,
    id: target.id,
    className: target.className,
    button: typeof event.button === 'number' ? event.button : null,
    buttons: typeof event.buttons === 'number' ? event.buttons : null,
    clientX: roundNumber(event.clientX),
    clientY: roundNumber(event.clientY),
    detail: event.detail,
    visibilityState: document.visibilityState,
    hasFocus: document.hasFocus()
  });
};

const handleVisibilityOrFocusEvent = (event: Event): void => {
  if (!isRemoteListening.value) {
    return;
  }

  writeRemoteLog('status', {
    eventType: event.type,
    visibilityState: document.visibilityState,
    hasFocus: document.hasFocus()
  });
};

const pollGamepads = (): void => {
  if (!isRemoteListening.value || !gamepadSupportAvailable.value) {
    gamepadPollFrameId = null;
    return;
  }

  const gamepads = navigator.getGamepads?.() ?? [];
  const snapshot = gamepads
    .filter((gamepad): gamepad is Gamepad => Boolean(gamepad))
    .map((gamepad) => ({
      index: gamepad.index,
      id: gamepad.id,
      mapping: gamepad.mapping,
      connected: gamepad.connected,
      pressedButtons: gamepad.buttons
        .map((button, index) => ({ index, pressed: button.pressed, value: roundNumber(button.value) }))
        .filter((button) => button.pressed || button.value !== 0),
      axes: gamepad.axes.map((value, index) => ({ index, value: roundNumber(value) })).filter((axis) => Math.abs(axis.value) > 0.15)
    }))
    .filter((gamepad) => gamepad.pressedButtons.length || gamepad.axes.length);

  const nextSnapshot = JSON.stringify(snapshot);

  if (snapshot.length && nextSnapshot !== lastGamepadSnapshot) {
    lastGamepadSnapshot = nextSnapshot;
    remoteDetectedCount.value += 1;
    registerDetectedInput('gamepad', { gamepads: snapshot });
  }

  gamepadPollFrameId = window.requestAnimationFrame(pollGamepads);
};

const startGamepadPolling = (): void => {
  if (!gamepadSupportAvailable.value || gamepadPollFrameId !== null) {
    return;
  }

  lastGamepadSnapshot = '';
  gamepadPollFrameId = window.requestAnimationFrame(pollGamepads);
};

const stopGamepadPolling = (): void => {
  if (gamepadPollFrameId !== null) {
    window.cancelAnimationFrame(gamepadPollFrameId);
    gamepadPollFrameId = null;
  }
};

const startRemoteListening = (): void => {
  if (remoteListenerAttached.value) {
    isRemoteListening.value = true;
    startGamepadPolling();
    writeRemoteLog('status', { status: 'listening-resumed' });
    return;
  }

  window.addEventListener('keydown', handleKeyboardEvent, { capture: true, passive: false });
  window.addEventListener('keyup', handleKeyboardEvent, { capture: true, passive: false });

  window.addEventListener('pointerdown', handlePointerDown, { capture: true, passive: true });
  window.addEventListener('pointermove', handlePointerMove, { capture: true, passive: true });
  window.addEventListener('pointerup', handlePointerUp, { capture: true, passive: true });

  window.addEventListener('click', handleClickEvent, { capture: true, passive: true });
  window.addEventListener('auxclick', handleClickEvent, { capture: true, passive: true });

  window.addEventListener('focus', handleVisibilityOrFocusEvent, { capture: true, passive: true });
  window.addEventListener('blur', handleVisibilityOrFocusEvent, { capture: true, passive: true });
  document.addEventListener('visibilitychange', handleVisibilityOrFocusEvent, { passive: true });

  window.addEventListener('gamepadconnected', handleVisibilityOrFocusEvent, { passive: true });
  window.addEventListener('gamepaddisconnected', handleVisibilityOrFocusEvent, { passive: true });

  remoteListenerAttached.value = true;
  isRemoteListening.value = true;
  startGamepadPolling();
  writeRemoteLog('status', { status: 'listening' });
};

const stopRemoteListening = (): void => {
  isRemoteListening.value = false;
  stopGamepadPolling();
  clearPointerSessionTimeout();

  if (activePointerSession) {
    finalizePointerSession('timeout');
  }

  writeRemoteLog('status', { status: 'paused' });
};

const clearRemoteLog = (): void => {
  remoteLog.value = [];
  lastRemoteKey.value = null;
  lastGamepadSnapshot = '';
  remoteDetectedCount.value = 0;
  currentDetectedSignature.value = null;
  currentDetectedSourceType.value = null;
  currentDetectedPayload.value = null;
  pendingAssignedName.value = '';
  activePointerSessionSummary.value = null;
};

const copyRemoteLog = async (): Promise<void> => {
  isCopyingLog.value = true;

  try {
    await navigator.clipboard.writeText(remoteLogText.value);
    writeRemoteLog('status', { status: 'copied-log' });
  } catch (error) {
    writeRemoteLog('error', { error: `Copy failed: ${String(error)}` });
  } finally {
    isCopyingLog.value = false;
  }
};

const saveCurrentMapping = (): void => {
  if (!currentDetectedSignature.value || !currentDetectedPayload.value || !currentDetectedSourceType.value) {
    writeRemoteLog('error', { error: 'No detected input available to map' });
    return;
  }

  const assignedName = pendingAssignedName.value.trim();

  if (!assignedName) {
    writeRemoteLog('error', { error: 'Button name is required before saving a map' });
    return;
  }

  const updatedAt = new Date().toISOString();

  const nextMapping: RemoteButtonMapping = {
    signature: currentDetectedSignature.value,
    assignedName,
    sourceType: currentDetectedSourceType.value,
    sample: currentDetectedPayload.value,
    updatedAt
  };

  const existingIndex = mappedButtons.value.findIndex((mapping) => mapping.signature === nextMapping.signature);

  if (existingIndex >= 0) {
    mappedButtons.value = mappedButtons.value.map((mapping, index) => (index === existingIndex ? nextMapping : mapping));
    writeRemoteLog('status', {
      status: 'mapping-updated',
      assignedName,
      signature: nextMapping.signature
    });
    return;
  }

  mappedButtons.value = [nextMapping, ...mappedButtons.value];
  writeRemoteLog('status', {
    status: 'mapping-saved',
    assignedName,
    signature: nextMapping.signature
  });
};

const removeMapping = (signature: string): void => {
  mappedButtons.value = mappedButtons.value.filter((mapping) => mapping.signature !== signature);

  if (currentDetectedSignature.value === signature) {
    pendingAssignedName.value = '';
  }

  writeRemoteLog('status', { status: 'mapping-removed', signature });
};

const copyMappings = async (): Promise<void> => {
  isCopyingMappings.value = true;

  try {
    await navigator.clipboard.writeText(mappingsExportText.value);
    writeRemoteLog('status', { status: 'copied-mappings' });
  } catch (error) {
    writeRemoteLog('error', { error: `Copy mappings failed: ${String(error)}` });
  } finally {
    isCopyingMappings.value = false;
  }
};

const handleHidInputReport = (event: HidInputReportLike): void => {
  const bytes = Array.from(new Uint8Array(event.data.buffer));

  remoteDetectedCount.value += 1;
  registerDetectedInput('hid', {
    reportId: event.reportId,
    byteLength: bytes.length,
    bytes
  });
};

const connectHidDevice = async (): Promise<void> => {
  if (!hidSupportAvailable.value || isConnectingHid.value) {
    return;
  }

  isConnectingHid.value = true;

  try {
    const hidNavigator = navigator as NavigatorWithHid;

    if (!hidNavigator.hid) {
      writeRemoteLog('error', { error: 'WebHID not supported in this browser' });
      return;
    }

    const devices = await hidNavigator.hid.requestDevice({ filters: [] });

    if (!devices.length) {
      writeRemoteLog('status', { status: 'no-device-selected' });
      return;
    }

    if (connectedHidDevice) {
      connectedHidDevice.removeEventListener('inputreport', handleHidInputReport);
      if (connectedHidDevice.opened) {
        await connectedHidDevice.close();
      }
    }

    const device = devices[0];
    await device.open();
    device.addEventListener('inputreport', handleHidInputReport);
    connectedHidDevice = device;
    connectedHidName.value = device.productName;

    writeRemoteLog('status', {
      status: 'hid-connected',
      productName: device.productName,
      vendorId: device.vendorId,
      productId: device.productId,
      collections: device.collections.map((collection: HidCollectionSummary) => ({
        usagePage: collection.usagePage,
        usage: collection.usage,
        type: collection.type
      }))
    });
  } catch (error) {
    writeRemoteLog('error', { error: String(error) });
  } finally {
    isConnectingHid.value = false;
  }
};

onBeforeUnmount(() => {
  if (remoteListenerAttached.value) {
    window.removeEventListener('keydown', handleKeyboardEvent, { capture: true });
    window.removeEventListener('keyup', handleKeyboardEvent, { capture: true });

    window.removeEventListener('pointerdown', handlePointerDown, { capture: true });
    window.removeEventListener('pointermove', handlePointerMove, { capture: true });
    window.removeEventListener('pointerup', handlePointerUp, { capture: true });

    window.removeEventListener('click', handleClickEvent, { capture: true });
    window.removeEventListener('auxclick', handleClickEvent, { capture: true });

    window.removeEventListener('focus', handleVisibilityOrFocusEvent, { capture: true });
    window.removeEventListener('blur', handleVisibilityOrFocusEvent, { capture: true });
    document.removeEventListener('visibilitychange', handleVisibilityOrFocusEvent);

    window.removeEventListener('gamepadconnected', handleVisibilityOrFocusEvent);
    window.removeEventListener('gamepaddisconnected', handleVisibilityOrFocusEvent);

    remoteListenerAttached.value = false;
  }

  stopGamepadPolling();
  clearPointerSessionTimeout();

  if (connectedHidDevice) {
    connectedHidDevice.removeEventListener('inputreport', handleHidInputReport);

    if (connectedHidDevice.opened) {
      void connectedHidDevice.close();
    }

    connectedHidDevice = null;
  }
});
</script>

<template>
  <article class="h-full overflow-y-auto bg-slate-100 px-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-4 sm:px-4 sm:pt-5">
    <section class="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
      <div class="border-b border-slate-200 px-3 py-3 sm:px-4">
        <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
          Remote Identifier
        </p>

        <h1 class="mt-1 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
          Bluetooth remote movement detector
        </h1>

        <p class="mt-2 text-sm leading-6 text-slate-600">
          This version is optimized for remotes that behave like mouse drag, cursor movement, click, or hybrid keyboard + pointer devices.
        </p>
      </div>

      <div class="space-y-4 px-3 py-3 sm:px-4">
        <div class="grid grid-cols-2 gap-2">
          <button
            type="button"
            data-remote-ui-control="true"
            class="inline-flex min-h-11 items-center justify-center rounded-2xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.99]"
            @click="startRemoteListening"
          >
            {{ isRemoteListening ? 'Listening' : 'Start listening' }}
          </button>

          <button
            type="button"
            data-remote-ui-control="true"
            class="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 active:scale-[0.99]"
            @click="stopRemoteListening"
          >
            Pause
          </button>
        </div>

        <label class="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
          <input
            v-model="remoteInterceptEnabled"
            type="checkbox"
            data-remote-ui-control="true"
            class="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
          >
          <span class="min-w-0">
            <span class="block text-sm font-semibold text-slate-900">Intercept known keyboard-style remote keys</span>
            <span class="mt-1 block text-xs leading-5 text-slate-500">
              Calls <code>preventDefault()</code> and <code>stopPropagation()</code> for recognized media / camera / arrow values.
            </span>
          </span>
        </label>

        <label class="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
          <input
            v-model="isPointerMoveCaptureEnabled"
            type="checkbox"
            data-remote-ui-control="true"
            class="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
          >
          <span class="min-w-0">
            <span class="block text-sm font-semibold text-slate-900">Capture pointer movement sessions</span>
            <span class="mt-1 block text-xs leading-5 text-slate-500">
              Recommended for selfie remotes or remotes that move the cursor by simulating drag or mouse movement.
            </span>
          </span>
        </label>

        <label class="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
          <input
            v-model="isKeyboardCaptureEnabled"
            type="checkbox"
            data-remote-ui-control="true"
            class="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
          >
          <span class="min-w-0">
            <span class="block text-sm font-semibold text-slate-900">Capture keyboard channel</span>
            <span class="mt-1 block text-xs leading-5 text-slate-500">
              Useful if some remote buttons still expose keyboard or media keys.
            </span>
          </span>
        </label>

        <label class="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
          <input
            v-model="isRawClickCaptureEnabled"
            type="checkbox"
            data-remote-ui-control="true"
            class="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
          >
          <span class="min-w-0">
            <span class="block text-sm font-semibold text-slate-900">Capture raw click events</span>
            <span class="mt-1 block text-xs leading-5 text-slate-500">
              Keep this on if the remote sometimes ends with a normal click after a drag-like motion.
            </span>
          </span>
        </label>

        <label class="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
          <input
            v-model="isSingleCaptureMode"
            type="checkbox"
            data-remote-ui-control="true"
            class="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
          >
          <span class="min-w-0">
            <span class="block text-sm font-semibold text-slate-900">Single capture mode</span>
            <span class="mt-1 block text-xs leading-5 text-slate-500">
              Keep only the latest detected signature. Best when you want one clean mapping per button test.
            </span>
          </span>
        </label>

        <div class="grid grid-cols-2 gap-2">
          <div class="rounded-2xl bg-slate-50 px-3 py-3">
            <p class="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Last keyboard match
            </p>
            <p class="mt-1 truncate text-sm font-semibold text-slate-900">
              {{ lastRemoteKey ?? 'None yet' }}
            </p>
          </div>

          <div class="rounded-2xl bg-slate-50 px-3 py-3">
            <p class="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Detections
            </p>
            <p class="mt-1 text-sm font-semibold text-slate-900">
              {{ remoteDetectedCount }}
            </p>
          </div>
        </div>

        <div class="rounded-2xl bg-slate-50 px-3 py-3">
          <p class="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Active pointer session
          </p>
          <p class="mt-1 text-sm font-semibold text-slate-900">
            {{ activePointerSessionSummary ?? 'No active or recent pointer session' }}
          </p>
        </div>

        <div class="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="text-sm font-semibold text-slate-900">
                Current detected signature
              </p>
              <p class="mt-1 text-xs leading-5 text-slate-500">
                {{ currentDetectedSourceType ? `Type: ${currentDetectedSourceType}` : 'Press a remote button to capture a signature.' }}
              </p>
            </div>

            <span
              v-if="currentMapping"
              class="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-700"
            >
              Mapped
            </span>
          </div>

          <p class="mt-3 break-all rounded-xl bg-white px-3 py-2 text-[11px] leading-5 text-slate-700 ring-1 ring-slate-200">
            {{ currentDetectedSignature ?? 'No signature captured yet.' }}
          </p>

          <div class="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              v-model="pendingAssignedName"
              type="text"
              data-remote-ui-control="true"
              class="min-h-11 flex-1 rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              placeholder="Assign a button name, e.g. left-button-drag"
            >
            <button
              type="button"
              data-remote-ui-control="true"
              class="inline-flex min-h-11 items-center justify-center rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.99]"
              @click="saveCurrentMapping"
            >
              {{ currentMapping ? 'Update mapping' : 'Save mapping' }}
            </button>
          </div>

          <p
            v-if="currentMapping"
            class="mt-2 text-xs leading-5 text-slate-600"
          >
            Existing mapping:
            <span class="font-semibold text-slate-900">{{ currentMapping.assignedName }}</span>
          </p>
        </div>

        <div class="rounded-2xl border border-dashed border-slate-300 px-3 py-3">
          <div class="flex items-center justify-between gap-3">
            <div class="min-w-0">
              <p class="text-sm font-semibold text-slate-900">
                WebHID fallback
              </p>
              <p class="mt-1 text-xs leading-5 text-slate-500">
                {{ hidSupportAvailable ? 'Available in this browser.' : 'Not supported in this browser.' }}
              </p>
            </div>

            <button
              type="button"
              data-remote-ui-control="true"
              class="inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="!hidSupportAvailable || isConnectingHid"
              @click="connectHidDevice"
            >
              {{ isConnectingHid ? 'Connecting...' : 'Connect HID' }}
            </button>
          </div>

          <p
            v-if="connectedHidName"
            class="mt-2 text-xs font-medium text-slate-600"
          >
            Connected: {{ connectedHidName }}
          </p>
        </div>

        <div class="rounded-2xl border border-dashed border-slate-300 px-3 py-3">
          <p class="text-sm font-semibold text-slate-900">
            Gamepad probe
          </p>
          <p class="mt-1 text-xs leading-5 text-slate-500">
            {{ gamepadSupportAvailable ? 'Polling navigator.getGamepads() while listening.' : 'Gamepad API not supported in this browser.' }}
          </p>
        </div>

        <div class="rounded-2xl bg-slate-50 px-3 py-3 text-xs leading-5 text-slate-600">
          High-value listeners enabled:
          <span class="font-medium text-slate-900">
            keydown, keyup, pointerdown, pointermove, pointerup, click, auxclick, focus, blur, visibilitychange, gamepad polling, WebHID
          </span>
        </div>

        <div>
          <div class="flex items-center justify-between gap-3">
            <p class="text-sm font-semibold text-slate-900">
              Event log
            </p>

            <div class="flex items-center gap-3">
              <button
                type="button"
                data-remote-ui-control="true"
                class="text-xs font-semibold text-slate-500 transition hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                :disabled="isCopyingLog"
                @click="copyRemoteLog"
              >
                {{ isCopyingLog ? 'Copying...' : 'Copy' }}
              </button>

              <button
                type="button"
                data-remote-ui-control="true"
                class="text-xs font-semibold text-slate-500 transition hover:text-slate-700"
                @click="clearRemoteLog"
              >
                Clear
              </button>
            </div>
          </div>

          <pre class="mt-2 max-h-[30rem] overflow-auto rounded-2xl bg-slate-950 px-3 py-3 text-[11px] leading-5 text-slate-100 [scrollbar-width:thin]">{{ remoteLogText }}</pre>
        </div>

        <div>
          <div class="flex items-center justify-between gap-3">
            <p class="text-sm font-semibold text-slate-900">
              Button map
            </p>

            <button
              type="button"
              data-remote-ui-control="true"
              class="text-xs font-semibold text-slate-500 transition hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="isCopyingMappings || !mappedButtons.length"
              @click="copyMappings"
            >
              {{ isCopyingMappings ? 'Copying...' : 'Copy map' }}
            </button>
          </div>

          <div
            v-if="mappedButtons.length"
            class="mt-2 space-y-2"
          >
            <div
              v-for="mapping in mappedButtons"
              :key="mapping.signature"
              class="rounded-2xl border border-slate-200 bg-white px-3 py-3"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="text-sm font-semibold text-slate-900">
                    {{ mapping.assignedName }}
                  </p>
                  <p class="mt-1 text-[11px] uppercase tracking-wide text-slate-500">
                    {{ mapping.sourceType }}
                  </p>
                </div>

                <button
                  type="button"
                  data-remote-ui-control="true"
                  class="shrink-0 text-xs font-semibold text-rose-600 transition hover:text-rose-700"
                  @click="removeMapping(mapping.signature)"
                >
                  Remove
                </button>
              </div>

              <p class="mt-2 break-all rounded-xl bg-slate-50 px-3 py-2 text-[11px] leading-5 text-slate-700">
                {{ mapping.signature }}
              </p>
            </div>
          </div>

          <p
            v-else
            class="mt-2 rounded-2xl bg-slate-50 px-3 py-4 text-sm text-slate-500"
          >
            No button mappings saved yet.
          </p>
        </div>
      </div>
    </section>
  </article>
</template>