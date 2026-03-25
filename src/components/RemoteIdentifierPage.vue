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

type SampleLabel = 'left' | 'right' | 'up' | 'down' | 'center' | 'camera1' | 'camera2' | 'unknown';

type NearbyBufferedEvent = {
  observedAt: number;
  type: RemoteLogType;
  payload: Record<string, unknown>;
};

type CapturedSample = {
  id: number;
  observedAt: number;
  sourceType: 'keyboard' | 'hid' | 'gamepad' | 'gesture';
  signature: string;
  payload: Record<string, unknown>;
  nearbyEvents: NearbyBufferedEvent[];
  sourceChannel: 'pointer' | 'keyboard' | 'hid' | 'gamepad' | 'mixed' | 'unknown';
  classificationHint: 'tap' | 'drag' | 'media-key-like' | 'unknown';
  hasKeyboardEventNearby: boolean;
  hasHidEventNearby: boolean;
  hasGamepadEventNearby: boolean;
  hasFocusChangeNearby: boolean;
  label: SampleLabel | null;
  mappingName: string | null;
};

type AutoLabeledSample = CapturedSample & {
  autoLabel: SampleLabel;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
};

type TapClusterStats = {
  label: 'center' | 'camera2';
  count: number;
  durations: number[];
  clickDelays: number[];
  keyboardKeys: string[];
  hidFingerprints: string[];
  mouseSequences: string[];
  focusChangeCount: number;
};

const REMOTE_LOG_LIMIT = 60;
const POINTER_MOVE_LOG_SAMPLE_LIMIT = 40;
const MAX_STILLNESS_DISTANCE = 6;
const POINTER_SESSION_TIMEOUT_MS = 1600;
const NEARBY_EVENT_BUFFER_WINDOW_MS = 500;
const SAMPLE_NEARBY_LOOKBACK_MS = 150;
const SAMPLE_NEARBY_LOOKAHEAD_MS = 150;
const sampleLabelOptions: SampleLabel[] = ['left', 'right', 'up', 'down', 'center', 'camera1', 'camera2', 'unknown'];

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
const capturedSamples = ref<CapturedSample[]>([]);
const sampleIdSeed = ref(0);
const nearbyEventBuffer = ref<NearbyBufferedEvent[]>([]);
const isCopyingSamples = ref(false);
const isCopyingLabeledDataset = ref(false);
const isCopyingSummary = ref(false);

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
      autoDetectedLabels: Array.from(new Set(
        analyzedSamples.value
          .filter((sample) => sample.signature === mapping.signature)
          .map((sample) => sample.autoLabel)
      )),
      sample: mapping.sample,
      updatedAt: mapping.updatedAt
    })),
    null,
    2
  )
);

const latestCapturedSample = computed(() => capturedSamples.value[0] ?? null);
const latestAnalyzedSample = computed(() => analyzedSamples.value[0] ?? null);

const rawSamplesExportText = computed(() => JSON.stringify(capturedSamples.value, null, 2));

const labeledDatasetExportText = computed(() =>
  JSON.stringify(
    analyzedSamples.value.map((sample) => ({
      id: sample.id,
      autoLabel: sample.autoLabel,
      confidence: sample.confidence,
      reason: sample.reason,
      signature: sample.signature,
      sourceType: sample.sourceType,
      sourceChannel: sample.sourceChannel,
      payload: sample.payload,
      nearbyEvents: sample.nearbyEvents
    })),
    null,
    2
  )
);

const buildTimingSummary = (label: SampleLabel) => {
  const samples = capturedSamples.value.filter((sample) => sample.label === label && sample.sourceType === 'gesture');
  const durations = samples
    .map((sample) => sample.payload.durationMs)
    .filter((value): value is number => typeof value === 'number');
  const clickDelays = samples
    .map((sample) => sample.payload.clickDelayMs)
    .filter((value): value is number => typeof value === 'number');

  return {
    label,
    count: samples.length,
    minDuration: durations.length ? Math.min(...durations) : null,
    maxDuration: durations.length ? Math.max(...durations) : null,
    avgDuration: durations.length ? average(durations) : null,
    minClickDelay: clickDelays.length ? Math.min(...clickDelays) : null,
    maxClickDelay: clickDelays.length ? Math.max(...clickDelays) : null,
    avgClickDelay: clickDelays.length ? average(clickDelays) : null
  };
};

const centerTimingSummary = computed(() => buildTimingSummary('center'));
const camera2TimingSummary = computed(() => buildTimingSummary('camera2'));

const getTapClusterLabel = (sample: CapturedSample): 'center' | 'camera2' | null => {
  if (sample.sourceType !== 'gesture' || sample.payload.gestureType !== 'tap-like') {
    return null;
  }

  if (sample.label === 'center' || sample.label === 'camera2') {
    return sample.label;
  }

  const duration = typeof sample.payload.durationMs === 'number' ? sample.payload.durationMs : null;
  if (duration === null) {
    return null;
  }

  return duration <= tapDurationThreshold.value ? 'center' : 'camera2';
};

const getSampleKeyboardKeys = (sample: CapturedSample): string[] => {
  return uniqueStrings(
    [
      sample.sourceType === 'keyboard' && typeof sample.payload.key === 'string' ? sample.payload.key : '',
      ...sample.nearbyEvents
        .filter((entry) => entry.type === 'keyboard' && typeof entry.payload.key === 'string')
        .map((entry) => String(entry.payload.key))
    ].filter(Boolean) as string[]
  );
};

const getSampleHidFingerprints = (sample: CapturedSample): string[] => {
  return uniqueStrings(
    [
      sample.sourceType === 'hid'
        ? JSON.stringify({
            reportId: sample.payload.reportId ?? null,
            bytes: sample.payload.bytes ?? null
          })
        : '',
      ...sample.nearbyEvents
        .filter((entry) => entry.type === 'hid')
        .map((entry) =>
          JSON.stringify({
            reportId: entry.payload.reportId ?? null,
            bytes: entry.payload.bytes ?? null
          })
        )
    ].filter(Boolean) as string[]
  );
};

const getSampleMouseSequence = (sample: CapturedSample): string => {
  const sequence = sample.nearbyEvents
    .filter((entry) => entry.type === 'pointer' || entry.type === 'input')
    .map((entry) => {
      const eventType = typeof entry.payload.eventType === 'string' ? entry.payload.eventType : entry.type;
      return `${entry.type}:${eventType}`;
    });

  return sequenceFingerprint(sequence);
};

const buildTapClusterStats = (label: 'center' | 'camera2'): TapClusterStats => {
  const samples = capturedSamples.value.filter((sample) => getTapClusterLabel(sample) === label);

  return {
    label,
    count: samples.length,
    durations: samples
      .map((sample) => sample.payload.durationMs)
      .filter((value): value is number => typeof value === 'number'),
    clickDelays: samples
      .map((sample) => sample.payload.clickDelayMs)
      .filter((value): value is number => typeof value === 'number'),
    keyboardKeys: uniqueStrings(samples.flatMap((sample) => getSampleKeyboardKeys(sample))),
    hidFingerprints: uniqueStrings(samples.flatMap((sample) => getSampleHidFingerprints(sample))),
    mouseSequences: uniqueStrings(samples.map((sample) => getSampleMouseSequence(sample)).filter(Boolean)),
    focusChangeCount: samples.filter((sample) => sample.hasFocusChangeNearby).length
  };
};

const getTimingOverlapLevel = (left: number[], right: number[]): 'none' | 'partial' | 'heavy' => {
  if (!left.length || !right.length) {
    return 'heavy';
  }

  const leftMin = Math.min(...left);
  const leftMax = Math.max(...left);
  const rightMin = Math.min(...right);
  const rightMax = Math.max(...right);

  if (leftMax < rightMin || rightMax < leftMin) {
    return 'none';
  }

  const overlap = Math.min(leftMax, rightMax) - Math.max(leftMin, rightMin);
  const leftSpan = Math.max(leftMax - leftMin, 1);
  const rightSpan = Math.max(rightMax - rightMin, 1);
  const overlapRatio = overlap / Math.max(leftSpan, rightSpan);

  return overlapRatio < 0.35 ? 'partial' : 'heavy';
};

const centerVsCamera2Summary = computed(() => {
  const center = centerTimingSummary.value;
  const camera2 = camera2TimingSummary.value;
  const stableTimingDifference =
    center.count > 0 &&
    camera2.count > 0 &&
    center.maxDuration !== null &&
    camera2.minDuration !== null &&
    (center.maxDuration < camera2.minDuration || camera2.maxDuration !== null && camera2.maxDuration < (center.minDuration ?? 0));

  return {
    center,
    camera2,
    stableTimingDifference
  };
});

const centerCamera2DetailedComparison = computed(() => {
  const centerCluster = buildTapClusterStats('center');
  const camera2Cluster = buildTapClusterStats('camera2');
  const durationOverlap = getTimingOverlapLevel(centerCluster.durations, camera2Cluster.durations);
  const clickDelayOverlap = getTimingOverlapLevel(centerCluster.clickDelays, camera2Cluster.clickDelays);
  const keyboardOverlap = countUniqueOverlap(centerCluster.keyboardKeys, camera2Cluster.keyboardKeys);
  const hidOverlap = countUniqueOverlap(centerCluster.hidFingerprints, camera2Cluster.hidFingerprints);
  const mouseSequenceOverlap = countUniqueOverlap(centerCluster.mouseSequences, camera2Cluster.mouseSequences);

  const uniqueCenterHid = centerCluster.hidFingerprints.filter((value) => !camera2Cluster.hidFingerprints.includes(value));
  const uniqueCamera2Hid = camera2Cluster.hidFingerprints.filter((value) => !centerCluster.hidFingerprints.includes(value));
  const uniqueCenterKeys = centerCluster.keyboardKeys.filter((value) => !camera2Cluster.keyboardKeys.includes(value));
  const uniqueCamera2Keys = camera2Cluster.keyboardKeys.filter((value) => !centerCluster.keyboardKeys.includes(value));
  const uniqueCenterMouseSequences = centerCluster.mouseSequences.filter((value) => !camera2Cluster.mouseSequences.includes(value));
  const uniqueCamera2MouseSequences = camera2Cluster.mouseSequences.filter((value) => !centerCluster.mouseSequences.includes(value));

  let verdict = 'not enough samples yet';
  let confidence: 'high' | 'medium' | 'low' = 'low';
  let strongestFeatures: string[] = [];

  if (uniqueCenterHid.length || uniqueCamera2Hid.length) {
    verdict = 'distinguishable via HID correlation';
    confidence = 'high';
    strongestFeatures = [
      ...(uniqueCenterHid.length ? [`center unique HID: ${uniqueCenterHid[0]}`] : []),
      ...(uniqueCamera2Hid.length ? [`camera2 unique HID: ${uniqueCamera2Hid[0]}`] : [])
    ];
  } else if (uniqueCenterKeys.length || uniqueCamera2Keys.length) {
    verdict = 'distinguishable via keyboard/media correlation';
    confidence = 'high';
    strongestFeatures = [
      ...(uniqueCenterKeys.length ? [`center unique key: ${uniqueCenterKeys[0]}`] : []),
      ...(uniqueCamera2Keys.length ? [`camera2 unique key: ${uniqueCamera2Keys[0]}`] : [])
    ];
  } else if (uniqueCenterMouseSequences.length || uniqueCamera2MouseSequences.length) {
    verdict = 'distinguishable via mouse event sequence';
    confidence = 'high';
    strongestFeatures = [
      ...(uniqueCenterMouseSequences.length ? [`center sequence: ${uniqueCenterMouseSequences[0]}`] : []),
      ...(uniqueCamera2MouseSequences.length ? [`camera2 sequence: ${uniqueCamera2MouseSequences[0]}`] : [])
    ];
  } else if (
    centerCluster.count >= 10 &&
    camera2Cluster.count >= 10 &&
    durationOverlap !== 'heavy' &&
    clickDelayOverlap !== 'heavy'
  ) {
    verdict = 'distinguishable via stable timing only';
    confidence = 'medium';
    strongestFeatures = ['duration and click-delay distributions are separated enough across repeated samples'];
  } else if (
    centerCluster.count >= 12 &&
    camera2Cluster.count >= 12 &&
    durationOverlap === 'heavy' &&
    clickDelayOverlap === 'heavy' &&
    keyboardOverlap > 0 &&
    hidOverlap === 0 &&
    mouseSequenceOverlap > 0
  ) {
    verdict = 'center and camera2 appear browser-identical';
    confidence = 'low';
    strongestFeatures = ['timing and nearby-event patterns overlap heavily'];
  }

  return {
    centerCluster,
    camera2Cluster,
    durationOverlap,
    clickDelayOverlap,
    keyboardOverlap,
    hidOverlap,
    mouseSequenceOverlap,
    uniqueCenterHid,
    uniqueCamera2Hid,
    uniqueCenterKeys,
    uniqueCamera2Keys,
    uniqueCenterMouseSequences,
    uniqueCamera2MouseSequences,
    verdict,
    confidence,
    strongestFeatures
  };
});

const camera1Summary = computed(() => {
  const camera1Samples = capturedSamples.value.filter((sample) => sample.label === 'camera1');
  const keyboardOnlySamples = camera1Samples.filter((sample) =>
    sample.sourceChannel === 'keyboard' || (sample.hasKeyboardEventNearby && sample.sourceChannel !== 'pointer')
  );
  const detectedKeys = Array.from(new Set(
    camera1Samples
      .flatMap((sample) => [
        sample.sourceType === 'keyboard' ? sample.payload.key : null,
        ...sample.nearbyEvents.filter((entry) => entry.type === 'keyboard').map((entry) => entry.payload.key)
      ])
      .filter((key): key is string => typeof key === 'string' && key.length > 0)
  ));
  const volumeKeys = detectedKeys.filter((key) => isVolumeLikeKey(key));
  const pointerMissingCount = camera1Samples.filter((sample) => sample.sourceChannel !== 'pointer' && sample.payload.gestureType !== 'tap-like' && sample.payload.gestureType !== 'drag-like').length;

  return {
    count: camera1Samples.length,
    keyboardOnlyCount: keyboardOnlySamples.length,
    detectedKeys,
    volumeKeys,
    pointerMissingCount
  };
});

const camera1Diagnostic = computed(() => {
  const sample = latestCapturedSample.value;

  if (!sample) {
    return {
      keyboardDetected: false,
      detectedKey: null,
      isVolumeRelated: false,
      noPointerGesture: false,
      hidDetected: false,
      verdict: 'insufficient evidence'
    };
  }

  const nearbyKeyboard = sample.sourceType === 'keyboard'
    ? sample.payload
    : sample.nearbyEvents.find((entry) => entry.type === 'keyboard')?.payload ?? null;
  const detectedKey = typeof nearbyKeyboard?.key === 'string' ? nearbyKeyboard.key : null;
  const keyboardDetected = Boolean(detectedKey);
  const hidDetected = sample.sourceType === 'hid' || sample.hasHidEventNearby;
  const noPointerGesture = sample.sourceType !== 'gesture' && sample.sourceChannel !== 'pointer';
  const isVolumeRelated = isVolumeLikeKey(detectedKey);

  let verdict = 'insufficient evidence';
  if (keyboardDetected && noPointerGesture) {
    verdict = isVolumeRelated ? 'likely media key' : 'likely keyboard-like button';
  } else if (hidDetected && !keyboardDetected && noPointerGesture) {
    verdict = 'likely HID consumer control';
  } else if (!keyboardDetected && !hidDetected && noPointerGesture && sample.hasFocusChangeNearby) {
    verdict = 'likely OS-consumed volume button';
  } else if (sample.sourceChannel === 'pointer' || sample.sourceType === 'gesture') {
    verdict = 'likely pointer button';
  }

  return {
    keyboardDetected,
    detectedKey,
    isVolumeRelated,
    noPointerGesture,
    hidDetected,
    verdict
  };
});

const tapLikeGestureSamples = computed(() =>
  capturedSamples.value.filter((sample) =>
    sample.sourceType === 'gesture' &&
    sample.payload.gestureType === 'tap-like' &&
    typeof sample.payload.durationMs === 'number'
  )
);

const tapDurationThreshold = computed(() => {
  const durations = tapLikeGestureSamples.value
    .map((sample) => sample.payload.durationMs)
    .filter((value): value is number => typeof value === 'number')
    .sort((left, right) => left - right);

  if (!durations.length) {
    return 22;
  }

  if (durations.length === 1) {
    return durations[0] <= 22 ? 22 : 26;
  }

  let largestGap = 0;
  let threshold = 22;

  for (let index = 1; index < durations.length; index += 1) {
    const gap = durations[index] - durations[index - 1];
    if (gap > largestGap) {
      largestGap = gap;
      threshold = roundNumber((durations[index] + durations[index - 1]) / 2);
    }
  }

  return largestGap >= 4 ? threshold : 22;
});

const deriveAutoLabelForSample = (sample: CapturedSample): Omit<AutoLabeledSample, keyof CapturedSample> => {
  if (sample.label) {
    return {
      autoLabel: sample.label,
      confidence: 'high',
      reason: 'Manual label applied'
    };
  }

  if (sample.sourceType === 'gesture') {
    if (sample.payload.gestureType === 'drag-like') {
      const direction = sample.payload.direction;
      if (direction === 'right') return { autoLabel: 'left', confidence: 'high', reason: 'Drag right maps to LEFT arrow on this remote' };
      if (direction === 'left') return { autoLabel: 'right', confidence: 'high', reason: 'Drag left maps to RIGHT arrow on this remote' };
      if (direction === 'down') return { autoLabel: 'up', confidence: 'high', reason: 'Drag down maps to UP arrow on this remote' };
      if (direction === 'up') return { autoLabel: 'down', confidence: 'high', reason: 'Drag up maps to DOWN arrow on this remote' };
    }

    if (sample.payload.gestureType === 'tap-like') {
      const clusterLabel = getTapClusterLabel(sample);
      const comparison = centerCamera2DetailedComparison.value;
      const confidence = comparison.confidence === 'high'
        ? 'high'
        : comparison.confidence === 'medium'
          ? 'medium'
          : 'low';

      if (comparison.verdict === 'center and camera2 appear browser-identical') {
        return {
          autoLabel: 'unknown',
          confidence: 'low',
          reason: 'Tap-like buttons still look browser-identical; cannot reliably separate CENTER and CAMERA2'
        };
      }

      if (clusterLabel === 'center') {
        return {
          autoLabel: 'center',
          confidence,
          reason: comparison.strongestFeatures[0] ?? 'This tap falls into the CENTER timing/event cluster'
        };
      }

      return {
        autoLabel: 'camera2',
        confidence,
        reason: comparison.strongestFeatures[0] ?? 'This tap falls into the CAMERA2 timing/event cluster'
      };
    }
  }

  const nearbyKeyboard = sample.sourceType === 'keyboard'
    ? sample.payload
    : sample.nearbyEvents.find((entry) => entry.type === 'keyboard')?.payload ?? null;

  if (nearbyKeyboard && sample.sourceChannel !== 'pointer') {
    const key = nearbyKeyboard.key;
    if (isVolumeLikeKey(key)) {
      return { autoLabel: 'camera1', confidence: 'high', reason: `Volume-like key ${String(key)} detected without pointer gesture` };
    }
    if (isMediaLikeKey(key)) {
      return { autoLabel: 'camera1', confidence: 'medium', reason: `Media-like key ${String(key)} detected without pointer gesture` };
    }
  }

  if (sample.sourceType === 'hid' && !sample.hasKeyboardEventNearby && sample.sourceChannel !== 'pointer') {
    return { autoLabel: 'camera1', confidence: 'medium', reason: 'HID-only signal detected without pointer gesture' };
  }

  if (
    sample.sourceType !== 'gesture' &&
    sample.sourceChannel === 'unknown' &&
    sample.hasFocusChangeNearby &&
    !sample.hasKeyboardEventNearby &&
    !sample.hasHidEventNearby
  ) {
    return { autoLabel: 'camera1', confidence: 'low', reason: 'No pointer event, but focus/visibility changed nearby; likely OS-consumed volume button' };
  }

  return { autoLabel: 'unknown', confidence: 'low', reason: 'Pattern does not clearly match a known remote button yet' };
};

const analyzedSamples = computed<AutoLabeledSample[]>(() =>
  capturedSamples.value.map((sample) => ({
    ...sample,
    ...deriveAutoLabelForSample(sample)
  }))
);

const discoveredButtons = computed(() => {
  return sampleLabelOptions.map((label) => {
    const samples = analyzedSamples.value.filter((sample) => sample.autoLabel === label);
    const confidenceRank = { high: 3, medium: 2, low: 1 };
    const strongest = samples.reduce<AutoLabeledSample | null>((best, sample) => {
      if (!best) return sample;
      return confidenceRank[sample.confidence] > confidenceRank[best.confidence] ? sample : best;
    }, null);

    return {
      label,
      detected: samples.length > 0,
      sampleCount: samples.length,
      confidence: strongest?.confidence ?? 'low',
      reason: strongest?.reason ?? 'No matching pattern detected yet',
      latestKey: samples.find((sample) => typeof sample.payload.key === 'string')?.payload.key ?? null
    };
  });
});

const laymanSummary = computed(() => {
  const lines: string[] = [];
  const arrows = discoveredButtons.value.filter((entry) => ['left', 'right', 'up', 'down'].includes(entry.label) && entry.detected);
  if (arrows.length) {
    lines.push(`Detected arrow-style drag buttons: ${arrows.map((entry) => entry.label.toUpperCase()).join(', ')}.`);
  } else {
    lines.push('No arrow-style drag buttons have been confidently detected yet.');
  }

  const center = discoveredButtons.value.find((entry) => entry.label === 'center');
  const camera2 = discoveredButtons.value.find((entry) => entry.label === 'camera2');
  if (center?.detected || camera2?.detected) {
    lines.push(`Tap-like buttons are being separated into CENTER (${center?.sampleCount ?? 0} samples) and CAMERA2 (${camera2?.sampleCount ?? 0} samples).`);
  } else {
    lines.push('Tap-like buttons have not been separated into CENTER and CAMERA2 yet.');
  }
  lines.push(`Center vs Camera2 verdict: ${centerCamera2DetailedComparison.value.verdict}.`);

  if (camera1Diagnostic.value.verdict === 'likely media key') {
    lines.push(`CAMERA1 likely behaves like a media or volume key${camera1Diagnostic.value.detectedKey ? ` (${camera1Diagnostic.value.detectedKey})` : ''}.`);
  } else if (camera1Diagnostic.value.verdict === 'likely HID consumer control') {
    lines.push('CAMERA1 likely behaves like an HID consumer-control button.');
  } else if (camera1Diagnostic.value.verdict === 'likely OS-consumed volume button') {
    lines.push('CAMERA1 may be consumed by the OS before the browser can see it.');
  } else {
    lines.push('CAMERA1 is not clearly visible yet; keep testing it several times while listening.');
  }

  const unknownCount = analyzedSamples.value.filter((sample) => sample.autoLabel === 'unknown').length;
  lines.push(unknownCount ? `${unknownCount} captured samples are still unknown.` : 'All captured samples currently map to known button patterns.');

  return lines;
});

const detailedLogExportText = computed(() =>
  JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      app: 'RemoteIdentifierPage',
      listening: isRemoteListening.value,
      highLevelSummary: laymanSummary.value,
      buttonDiscovery: discoveredButtons.value,
      camera1Diagnostic: camera1Diagnostic.value,
      centerCamera2Comparison: {
        verdict: centerCamera2DetailedComparison.value.verdict,
        confidence: centerCamera2DetailedComparison.value.confidence,
        strongestFeatures: centerCamera2DetailedComparison.value.strongestFeatures,
        durationOverlap: centerCamera2DetailedComparison.value.durationOverlap,
        clickDelayOverlap: centerCamera2DetailedComparison.value.clickDelayOverlap,
        keyboardOverlap: centerCamera2DetailedComparison.value.keyboardOverlap,
        hidOverlap: centerCamera2DetailedComparison.value.hidOverlap,
        mouseSequenceOverlap: centerCamera2DetailedComparison.value.mouseSequenceOverlap,
        center: {
          sampleCount: centerCamera2DetailedComparison.value.centerCluster.count,
          durationMin: centerCamera2DetailedComparison.value.centerCluster.durations.length ? Math.min(...centerCamera2DetailedComparison.value.centerCluster.durations) : null,
          durationMax: centerCamera2DetailedComparison.value.centerCluster.durations.length ? Math.max(...centerCamera2DetailedComparison.value.centerCluster.durations) : null,
          durationAvg: centerCamera2DetailedComparison.value.centerCluster.durations.length ? average(centerCamera2DetailedComparison.value.centerCluster.durations) : null,
          clickDelayMin: centerCamera2DetailedComparison.value.centerCluster.clickDelays.length ? Math.min(...centerCamera2DetailedComparison.value.centerCluster.clickDelays) : null,
          clickDelayMax: centerCamera2DetailedComparison.value.centerCluster.clickDelays.length ? Math.max(...centerCamera2DetailedComparison.value.centerCluster.clickDelays) : null,
          clickDelayAvg: centerCamera2DetailedComparison.value.centerCluster.clickDelays.length ? average(centerCamera2DetailedComparison.value.centerCluster.clickDelays) : null,
          keyboardKeys: centerCamera2DetailedComparison.value.centerCluster.keyboardKeys,
          hidFingerprints: centerCamera2DetailedComparison.value.centerCluster.hidFingerprints,
          mouseSequences: centerCamera2DetailedComparison.value.centerCluster.mouseSequences,
          focusChangeCount: centerCamera2DetailedComparison.value.centerCluster.focusChangeCount
        },
        camera2: {
          sampleCount: centerCamera2DetailedComparison.value.camera2Cluster.count,
          durationMin: centerCamera2DetailedComparison.value.camera2Cluster.durations.length ? Math.min(...centerCamera2DetailedComparison.value.camera2Cluster.durations) : null,
          durationMax: centerCamera2DetailedComparison.value.camera2Cluster.durations.length ? Math.max(...centerCamera2DetailedComparison.value.camera2Cluster.durations) : null,
          durationAvg: centerCamera2DetailedComparison.value.camera2Cluster.durations.length ? average(centerCamera2DetailedComparison.value.camera2Cluster.durations) : null,
          clickDelayMin: centerCamera2DetailedComparison.value.camera2Cluster.clickDelays.length ? Math.min(...centerCamera2DetailedComparison.value.camera2Cluster.clickDelays) : null,
          clickDelayMax: centerCamera2DetailedComparison.value.camera2Cluster.clickDelays.length ? Math.max(...centerCamera2DetailedComparison.value.camera2Cluster.clickDelays) : null,
          clickDelayAvg: centerCamera2DetailedComparison.value.camera2Cluster.clickDelays.length ? average(centerCamera2DetailedComparison.value.camera2Cluster.clickDelays) : null,
          keyboardKeys: centerCamera2DetailedComparison.value.camera2Cluster.keyboardKeys,
          hidFingerprints: centerCamera2DetailedComparison.value.camera2Cluster.hidFingerprints,
          mouseSequences: centerCamera2DetailedComparison.value.camera2Cluster.mouseSequences,
          focusChangeCount: centerCamera2DetailedComparison.value.camera2Cluster.focusChangeCount
        }
      },
      centerVsCamera2: centerVsCamera2Summary.value,
      mappings: mappedButtons.value,
      analyzedSamples: analyzedSamples.value,
      rawEventLog: remoteLog.value,
      nearbyEventBuffer: nearbyEventBuffer.value
    },
    null,
    2
  )
);

const exportSummaryText = computed(() =>
  JSON.stringify(
    {
      laymanSummary: laymanSummary.value,
      discoveredButtons: discoveredButtons.value,
      centerCamera2Comparison: centerCamera2DetailedComparison.value,
      centerVsCamera2: centerVsCamera2Summary.value,
      camera1: camera1Summary.value,
      latestSampleDiagnostic: camera1Diagnostic.value
    },
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

const isVolumeLikeKey = (key: unknown): boolean => {
  return typeof key === 'string' && [
    'AudioVolumeUp',
    'AudioVolumeDown',
    'AudioVolumeMute',
    'VolumeUp',
    'VolumeDown',
    'VolumeMute'
  ].includes(key);
};

const isMediaLikeKey = (key: unknown): boolean => {
  return typeof key === 'string' && [
    'AudioVolumeUp',
    'AudioVolumeDown',
    'AudioVolumeMute',
    'VolumeUp',
    'VolumeDown',
    'VolumeMute',
    'MediaPlayPause',
    'MediaTrackNext',
    'MediaTrackPrevious',
    'HeadsetHook',
    'Camera',
    'CameraFocus',
    'Unidentified'
  ].includes(key);
};

const roundNumber = (value: number, decimals = 2): number => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

const average = (values: number[]): number => {
  if (!values.length) {
    return 0;
  }

  return roundNumber(values.reduce((sum, value) => sum + value, 0) / values.length);
};

const uniqueStrings = (values: string[]): string[] => Array.from(new Set(values.filter((value) => value.length > 0)));

const sequenceFingerprint = (values: string[]): string => values.join(' > ');

const countUniqueOverlap = (left: string[], right: string[]): number => {
  const rightSet = new Set(right);
  return uniqueStrings(left).filter((value) => rightSet.has(value)).length;
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

  remoteLog.value = [nextEntry, ...remoteLog.value].slice(0, REMOTE_LOG_LIMIT);
};

const pushNearbyBufferedEvent = (type: RemoteLogType, payload: Record<string, unknown>, observedAt = performance.now()): void => {
  const minAllowedTime = observedAt - NEARBY_EVENT_BUFFER_WINDOW_MS;

  nearbyEventBuffer.value = [
    ...nearbyEventBuffer.value.filter((entry) => entry.observedAt >= minAllowedTime),
    {
      observedAt,
      type,
      payload
    }
  ];
};

const getNearbyEventsForTime = (observedAt: number): NearbyBufferedEvent[] => {
  const start = observedAt - SAMPLE_NEARBY_LOOKBACK_MS;
  const end = observedAt + SAMPLE_NEARBY_LOOKAHEAD_MS;

  return nearbyEventBuffer.value
    .filter((entry) => entry.observedAt >= start && entry.observedAt <= end)
    .map((entry) => ({
      observedAt: roundNumber(entry.observedAt),
      type: entry.type,
      payload: entry.payload
    }));
};

const inferSourceChannel = (sample: Pick<CapturedSample, 'sourceType' | 'nearbyEvents'>): CapturedSample['sourceChannel'] => {
  const hasPointer = sample.sourceType === 'gesture' || sample.nearbyEvents.some((entry) => entry.type === 'pointer' || entry.type === 'gesture');
  const hasKeyboard = sample.sourceType === 'keyboard' || sample.nearbyEvents.some((entry) => entry.type === 'keyboard');
  const hasHid = sample.sourceType === 'hid' || sample.nearbyEvents.some((entry) => entry.type === 'hid');
  const hasGamepad = sample.sourceType === 'gamepad' || sample.nearbyEvents.some((entry) => entry.type === 'gamepad');
  const activeCount = [hasPointer, hasKeyboard, hasHid, hasGamepad].filter(Boolean).length;

  if (activeCount > 1) return 'mixed';
  if (hasPointer) return 'pointer';
  if (hasKeyboard) return 'keyboard';
  if (hasHid) return 'hid';
  if (hasGamepad) return 'gamepad';
  return 'unknown';
};

const inferClassificationHint = (sourceType: CapturedSample['sourceType'], payload: Record<string, unknown>, nearbyEvents: NearbyBufferedEvent[]): CapturedSample['classificationHint'] => {
  if (sourceType === 'gesture') {
    return payload.gestureType === 'drag-like' ? 'drag' : payload.gestureType === 'tap-like' ? 'tap' : 'unknown';
  }

  if (sourceType === 'keyboard') {
    return isMediaLikeKey(payload.key) ? 'media-key-like' : 'unknown';
  }

  const nearbyKeyboard = nearbyEvents.find((entry) => entry.type === 'keyboard');
  if (nearbyKeyboard && isMediaLikeKey(nearbyKeyboard.payload.key)) {
    return 'media-key-like';
  }

  return 'unknown';
};

const findMappingNameForSignature = (signature: string): string | null => {
  return mappedButtons.value.find((mapping) => mapping.signature === signature)?.assignedName ?? null;
};

const finalizeCapturedSample = (sampleId: number): void => {
  capturedSamples.value = capturedSamples.value.map((sample) => {
    if (sample.id !== sampleId) {
      return sample;
    }

    const nearbyEvents = getNearbyEventsForTime(sample.observedAt);
    const hasKeyboardEventNearby = nearbyEvents.some((entry) => entry.type === 'keyboard');
    const hasHidEventNearby = nearbyEvents.some((entry) => entry.type === 'hid');
    const hasGamepadEventNearby = nearbyEvents.some((entry) => entry.type === 'gamepad');
    const hasFocusChangeNearby = nearbyEvents.some((entry) => entry.type === 'status' && typeof entry.payload.eventType === 'string');

    return {
      ...sample,
      nearbyEvents,
      sourceChannel: inferSourceChannel({ sourceType: sample.sourceType, nearbyEvents }),
      classificationHint: inferClassificationHint(sample.sourceType, sample.payload, nearbyEvents),
      hasKeyboardEventNearby,
      hasHidEventNearby,
      hasGamepadEventNearby,
      hasFocusChangeNearby,
      mappingName: findMappingNameForSignature(sample.signature)
    };
  });
};

const captureSample = (sourceType: CapturedSample['sourceType'], payload: Record<string, unknown>, observedAt = performance.now()): void => {
  const signature = makeEventSignature(sourceType, payload);
  const nextId = ++sampleIdSeed.value;

  capturedSamples.value = [
    {
      id: nextId,
      observedAt: roundNumber(observedAt),
      sourceType,
      signature,
      payload,
      nearbyEvents: [],
      sourceChannel: 'unknown' as CapturedSample['sourceChannel'],
      classificationHint: 'unknown' as CapturedSample['classificationHint'],
      hasKeyboardEventNearby: false,
      hasHidEventNearby: false,
      hasGamepadEventNearby: false,
      hasFocusChangeNearby: false,
      label: null,
      mappingName: findMappingNameForSignature(signature)
    },
    ...capturedSamples.value
  ].slice(0, REMOTE_LOG_LIMIT);

  window.setTimeout(() => {
    finalizeCapturedSample(nextId);
  }, SAMPLE_NEARBY_LOOKAHEAD_MS + 10);
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
  payload: Record<string, unknown>,
  observedAt = performance.now()
): void => {
  pushNearbyBufferedEvent(type, payload, observedAt);
  rememberDetectedInput(type, payload);
  writeRemoteLog(type, payload);

  if (type === 'keyboard' || type === 'hid' || type === 'gamepad' || type === 'gesture') {
    captureSample(type, payload, observedAt);
  }
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
    sessionId: session.id,
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
    pointerDownAt: roundNumber(session.startedAt),
    pointerUpAt: roundNumber(endedAt),
    clickAt: null,
    clickDelayMs: null,
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
  registerDetectedInput('gesture', payload, endedAt);
};

const handleKeyboardEvent = (event: KeyboardEvent): void => {
  if (!isRemoteListening.value || !isKeyboardCaptureEnabled.value) {
    return;
  }

  if (isIgnoredUiEventTarget(event.target)) {
    return;
  }

  const target = getTargetSummary(event.target);
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
    targetTagName: target.tagName,
    targetId: target.id,
    targetClassName: target.className,
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

const attachClickTimingToRecentTapSample = (clickTime: number): void => {
  const recentTapSample = capturedSamples.value.find((sample) => {
    if (sample.sourceType !== 'gesture' || sample.payload.gestureType !== 'tap-like') {
      return false;
    }

    if (typeof sample.payload.pointerUpAt !== 'number' || sample.payload.clickAt !== null) {
      return false;
    }

    return clickTime >= sample.payload.pointerUpAt && clickTime - sample.payload.pointerUpAt <= 250;
  });

  if (!recentTapSample) {
    return;
  }

  const clickDelayMs = roundNumber(clickTime - (recentTapSample.payload.pointerUpAt as number));

  recentTapSample.payload = {
    ...recentTapSample.payload,
    clickAt: roundNumber(clickTime),
    clickDelayMs
  };

  recentTapSample.signature = makeEventSignature('gesture', recentTapSample.payload);
  recentTapSample.mappingName = findMappingNameForSignature(recentTapSample.signature);
  finalizeCapturedSample(recentTapSample.id);
};

const handleClickEvent = (event: MouseEvent): void => {
  if (!isRemoteListening.value || !isRawClickCaptureEnabled.value) {
    return;
  }

  if (isIgnoredUiEventTarget(event.target)) {
    return;
  }

  const target = getTargetSummary(event.target);
  const clickTime = performance.now();

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
  }, clickTime);

  attachClickTimingToRecentTapSample(clickTime);
};

const handleMouseEvent = (event: MouseEvent): void => {
  if (!isRemoteListening.value) {
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
  }, performance.now());
};

const handleInputLifecycleEvent = (event: Event): void => {
  if (!isRemoteListening.value) {
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
    visibilityState: document.visibilityState,
    hasFocus: document.hasFocus()
  }, performance.now());
};

const handleVisibilityOrFocusEvent = (event: Event): void => {
  if (!isRemoteListening.value) {
    return;
  }

  const payload = {
    eventType: event.type,
    visibilityState: document.visibilityState,
    hasFocus: document.hasFocus()
  };

  pushNearbyBufferedEvent('status', payload, performance.now());
  writeRemoteLog('status', payload);
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
  window.addEventListener('mousedown', handleMouseEvent, { capture: true, passive: true });
  window.addEventListener('mouseup', handleMouseEvent, { capture: true, passive: true });
  window.addEventListener('contextmenu', handleMouseEvent, { capture: true, passive: true });
  window.addEventListener('beforeinput', handleInputLifecycleEvent, { capture: true, passive: true });
  window.addEventListener('input', handleInputLifecycleEvent, { capture: true, passive: true });

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
  capturedSamples.value = [];
  nearbyEventBuffer.value = [];
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
    await navigator.clipboard.writeText(detailedLogExportText.value);
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
    capturedSamples.value = capturedSamples.value.map((sample) =>
      sample.signature === nextMapping.signature
        ? {
            ...sample,
            mappingName: nextMapping.assignedName
          }
        : sample
    );
    writeRemoteLog('status', {
      status: 'mapping-updated',
      assignedName,
      signature: nextMapping.signature
    });
    return;
  }

  mappedButtons.value = [nextMapping, ...mappedButtons.value];
  capturedSamples.value = capturedSamples.value.map((sample) =>
    sample.signature === nextMapping.signature
      ? {
          ...sample,
          mappingName: nextMapping.assignedName
        }
      : sample
  );
  writeRemoteLog('status', {
    status: 'mapping-saved',
    assignedName,
    signature: nextMapping.signature
  });
};

const removeMapping = (signature: string): void => {
  mappedButtons.value = mappedButtons.value.filter((mapping) => mapping.signature !== signature);
  capturedSamples.value = capturedSamples.value.map((sample) =>
    sample.signature === signature
      ? {
          ...sample,
          mappingName: null
        }
      : sample
  );

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

const copySamples = async (): Promise<void> => {
  isCopyingSamples.value = true;

  try {
    await navigator.clipboard.writeText(rawSamplesExportText.value);
    writeRemoteLog('status', { status: 'copied-samples' });
  } catch (error) {
    writeRemoteLog('error', { error: `Copy samples failed: ${String(error)}` });
  } finally {
    isCopyingSamples.value = false;
  }
};

const copyLabeledDataset = async (): Promise<void> => {
  isCopyingLabeledDataset.value = true;

  try {
    await navigator.clipboard.writeText(labeledDatasetExportText.value);
    writeRemoteLog('status', { status: 'copied-labeled-dataset' });
  } catch (error) {
    writeRemoteLog('error', { error: `Copy labeled dataset failed: ${String(error)}` });
  } finally {
    isCopyingLabeledDataset.value = false;
  }
};

const copySummary = async (): Promise<void> => {
  isCopyingSummary.value = true;

  try {
    await navigator.clipboard.writeText(exportSummaryText.value);
    writeRemoteLog('status', { status: 'copied-summary' });
  } catch (error) {
    writeRemoteLog('error', { error: `Copy summary failed: ${String(error)}` });
  } finally {
    isCopyingSummary.value = false;
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
    window.removeEventListener('mousedown', handleMouseEvent, { capture: true });
    window.removeEventListener('mouseup', handleMouseEvent, { capture: true });
    window.removeEventListener('contextmenu', handleMouseEvent, { capture: true });
    window.removeEventListener('beforeinput', handleInputLifecycleEvent, { capture: true });
    window.removeEventListener('input', handleInputLifecycleEvent, { capture: true });

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

        <div class="rounded-2xl border border-blue-200 bg-blue-50 px-3 py-3">
          <p class="text-sm font-semibold text-slate-900">
            Simple workflow
          </p>
          <ol class="mt-2 space-y-1 text-xs leading-5 text-slate-700">
            <li>1. Click <span class="font-semibold">Start listening</span>.</li>
            <li>2. Press remote buttons several times, one button type at a time.</li>
            <li>3. Watch <span class="font-semibold">Auto-detected buttons</span>.</li>
            <li>4. Click <span class="font-semibold">Copy log</span> and paste it into ChatGPT if anything is unclear.</li>
          </ol>
        </div>

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
          <p class="text-sm font-semibold text-slate-900">
            What the page thinks is happening
          </p>
          <div class="mt-2 space-y-2 text-sm leading-6 text-slate-700">
            <p
              v-for="line in laymanSummary"
              :key="line"
            >
              {{ line }}
            </p>
          </div>
        </div>

        <div class="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
          <p class="text-sm font-semibold text-slate-900">
            Auto-detected buttons
          </p>
          <div class="mt-3 grid gap-2 sm:grid-cols-2">
            <div
              v-for="entry in discoveredButtons"
              :key="entry.label"
              class="rounded-2xl border px-3 py-3"
              :class="entry.detected ? 'border-emerald-200 bg-white' : 'border-slate-200 bg-white/70'"
            >
              <div class="flex items-center justify-between gap-3">
                <p class="text-sm font-semibold text-slate-900">
                  {{ entry.label }}
                </p>
                <span
                  class="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                  :class="entry.detected ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'"
                >
                  {{ entry.detected ? `${entry.confidence} confidence` : 'not found yet' }}
                </span>
              </div>
              <p class="mt-2 text-xs leading-5 text-slate-600">
                {{ entry.detected ? `${entry.sampleCount} sample(s). ${entry.reason}` : 'Press this button a few times while listening.' }}
              </p>
              <p
                v-if="entry.latestKey"
                class="mt-1 text-[11px] font-medium text-slate-500"
              >
                Key: {{ entry.latestKey }}
              </p>
            </div>
          </div>
        </div>

        <div class="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="text-sm font-semibold text-slate-900">
                Last detected signature
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

        <div class="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="text-sm font-semibold text-slate-900">
                Last detected button details
              </p>
              <p class="mt-1 text-xs leading-5 text-slate-500">
                {{ latestAnalyzedSample ? `Looks like ${latestAnalyzedSample.autoLabel} | ${latestAnalyzedSample.confidence} confidence` : 'No sample captured yet.' }}
              </p>
            </div>
            <span
              v-if="latestAnalyzedSample?.mappingName"
              class="shrink-0 rounded-full bg-blue-100 px-2.5 py-1 text-[11px] font-semibold text-blue-700"
            >
              {{ latestAnalyzedSample.mappingName }}
            </span>
          </div>

          <div v-if="latestAnalyzedSample" class="mt-3 space-y-2 text-xs leading-5 text-slate-600">
            <p>
              Reason:
              <span class="font-medium text-slate-900">{{ latestAnalyzedSample.reason }}</span>
            </p>
            <p>
              Flags:
              <span class="font-medium text-slate-900">
                keyboard={{ latestAnalyzedSample.hasKeyboardEventNearby }},
                hid={{ latestAnalyzedSample.hasHidEventNearby }},
                gamepad={{ latestAnalyzedSample.hasGamepadEventNearby }},
                focus={{ latestAnalyzedSample.hasFocusChangeNearby }}
              </span>
            </p>
            <p
              v-if="latestAnalyzedSample.sourceType === 'gesture'"
              class="break-all rounded-xl bg-white px-3 py-2 text-[11px] text-slate-700 ring-1 ring-slate-200"
            >
              duration={{ latestAnalyzedSample.payload.durationMs ?? 'n/a' }}ms,
              pointerDown={{ latestAnalyzedSample.payload.pointerDownAt ?? 'n/a' }},
              pointerUp={{ latestAnalyzedSample.payload.pointerUpAt ?? 'n/a' }},
              click={{ latestAnalyzedSample.payload.clickAt ?? 'n/a' }},
              clickDelay={{ latestAnalyzedSample.payload.clickDelayMs ?? 'n/a' }}ms
            </p>
            <details class="rounded-xl bg-white px-3 py-2 ring-1 ring-slate-200">
              <summary class="cursor-pointer text-xs font-semibold text-slate-700">
                Nearby events ({{ latestAnalyzedSample.nearbyEvents.length }})
              </summary>
              <pre class="mt-2 overflow-auto text-[11px] leading-5 text-slate-700">{{ JSON.stringify(latestAnalyzedSample.nearbyEvents, null, 2) }}</pre>
            </details>
          </div>
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

        <div class="rounded-2xl bg-slate-50 px-3 py-3">
          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              data-remote-ui-control="true"
              class="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="isCopyingSamples || !capturedSamples.length"
              @click="copySamples"
            >
              {{ isCopyingSamples ? 'Copying...' : 'Copy raw samples' }}
            </button>
            <button
              type="button"
              data-remote-ui-control="true"
              class="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="isCopyingLabeledDataset || !analyzedSamples.length"
              @click="copyLabeledDataset"
            >
              {{ isCopyingLabeledDataset ? 'Copying...' : 'Copy auto-labeled dataset' }}
            </button>
            <button
              type="button"
              data-remote-ui-control="true"
              class="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="isCopyingSummary || !capturedSamples.length"
              @click="copySummary"
            >
              {{ isCopyingSummary ? 'Copying...' : 'Copy summary' }}
            </button>
          </div>
        </div>

        <div>
          <div class="flex items-center justify-between gap-3">
            <p class="text-sm font-semibold text-slate-900">
              Detailed report
            </p>

            <div class="flex items-center gap-3">
              <button
                type="button"
                data-remote-ui-control="true"
                class="text-xs font-semibold text-slate-500 transition hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                :disabled="isCopyingLog"
                @click="copyRemoteLog"
              >
                {{ isCopyingLog ? 'Copying...' : 'Copy log' }}
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

          <p class="mt-2 text-xs leading-5 text-slate-500">
            This panel shows the raw event stream. Use <span class="font-semibold text-slate-700">Copy log</span> to export the full analysis report for ChatGPT.
          </p>
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

