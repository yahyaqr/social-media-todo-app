<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';

type RemoteLogEntry = {
  timestamp: string;
  type: 'status' | 'keydown' | 'hid' | 'error';
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

const REMOTE_LOG_LIMIT = 18;
const supportedRemoteKeys = new Set([
  'Camera',
  'CameraFocus',
  'HeadsetHook',
  'MediaPlayPause',
  'AudioVolumeUp',
  'AudioVolumeDown',
  'AudioVolumeMute',
  'Unidentified'
]);

const isRemoteListening = ref(false);
const remoteListenerAttached = ref(false);
const remoteInterceptEnabled = ref(true);
const remoteLog = ref<RemoteLogEntry[]>([]);
const lastRemoteKey = ref<string | null>(null);
const remoteDetectedCount = ref(0);
const isConnectingHid = ref(false);
const connectedHidName = ref<string | null>(null);
const hidSupportAvailable = computed(() => typeof navigator !== 'undefined' && 'hid' in navigator);
let connectedHidDevice: HidDeviceLike | null = null;

const writeRemoteLog = (type: RemoteLogEntry['type'], payload: Record<string, unknown>): void => {
  const timestamp = new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  remoteLog.value = [
    {
      timestamp,
      type,
      payload
    },
    ...remoteLog.value
  ].slice(0, REMOTE_LOG_LIMIT);
};

const handleRemoteKeydown = (event: KeyboardEvent): void => {
  if (!isRemoteListening.value) {
    return;
  }

  const payload = {
    key: event.key,
    code: event.code,
    keyCode: event.keyCode,
    which: event.which,
    altKey: event.altKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    shiftKey: event.shiftKey,
    repeat: event.repeat
  };

  writeRemoteLog('keydown', payload);

  if (supportedRemoteKeys.has(event.key)) {
    lastRemoteKey.value = event.key;
    remoteDetectedCount.value += 1;

    if (remoteInterceptEnabled.value) {
      event.preventDefault();
    }
  }
};

const startRemoteListening = (): void => {
  if (remoteListenerAttached.value) {
    isRemoteListening.value = true;
    writeRemoteLog('status', { status: 'listening-resumed' });
    return;
  }

  window.addEventListener('keydown', handleRemoteKeydown, { passive: false });
  remoteListenerAttached.value = true;
  isRemoteListening.value = true;
  writeRemoteLog('status', { status: 'listening' });
};

const stopRemoteListening = (): void => {
  isRemoteListening.value = false;
  writeRemoteLog('status', { status: 'paused' });
};

const clearRemoteLog = (): void => {
  remoteLog.value = [];
  lastRemoteKey.value = null;
  remoteDetectedCount.value = 0;
};

const handleHidInputReport = (event: HidInputReportLike): void => {
  const bytes = Array.from(new Uint8Array(event.data.buffer));
  writeRemoteLog('hid', {
    reportId: event.reportId,
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
    window.removeEventListener('keydown', handleRemoteKeydown);
    remoteListenerAttached.value = false;
  }

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
          Bluetooth remote button detector
        </h1>
        <p class="mt-2 text-sm leading-6 text-slate-600">
          Test whether a selfie remote appears as a keyboard or media key first. If nothing appears, try WebHID on Chrome or Edge desktop.
        </p>
      </div>

      <div class="space-y-4 px-3 py-3 sm:px-4">
        <div class="grid grid-cols-2 gap-2">
          <button
            type="button"
            class="inline-flex min-h-11 items-center justify-center rounded-2xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.99]"
            @click="startRemoteListening"
          >
            {{ isRemoteListening ? 'Listening' : 'Start listening' }}
          </button>
          <button
            type="button"
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
            class="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
          >
          <span class="min-w-0">
            <span class="block text-sm font-semibold text-slate-900">Intercept detected remote keys</span>
            <span class="mt-1 block text-xs leading-5 text-slate-500">
              Calls <code>preventDefault()</code> for known camera and media-style values.
            </span>
          </span>
        </label>

        <div class="grid grid-cols-2 gap-2">
          <div class="rounded-2xl bg-slate-50 px-3 py-3">
            <p class="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Last match
            </p>
            <p class="mt-1 truncate text-sm font-semibold text-slate-900">
              {{ lastRemoteKey ?? 'None yet' }}
            </p>
          </div>

          <div class="rounded-2xl bg-slate-50 px-3 py-3">
            <p class="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Matches
            </p>
            <p class="mt-1 text-sm font-semibold text-slate-900">
              {{ remoteDetectedCount }}
            </p>
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
              class="inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="!hidSupportAvailable || isConnectingHid"
              @click="connectHidDevice"
            >
              {{ isConnectingHid ? 'Connecting...' : 'Connect HID' }}
            </button>
          </div>

          <p v-if="connectedHidName" class="mt-2 text-xs font-medium text-slate-600">
            Connected: {{ connectedHidName }}
          </p>
        </div>

        <div class="rounded-2xl bg-slate-50 px-3 py-3 text-xs leading-5 text-slate-600">
          Supported keys:
          <span class="font-medium text-slate-900">
            Camera, CameraFocus, HeadsetHook, MediaPlayPause, AudioVolumeUp, AudioVolumeDown, AudioVolumeMute, Unidentified
          </span>
        </div>

        <div>
          <div class="flex items-center justify-between gap-3">
            <p class="text-sm font-semibold text-slate-900">
              Event log
            </p>
            <button
              type="button"
              class="text-xs font-semibold text-slate-500 transition hover:text-slate-700"
              @click="clearRemoteLog"
            >
              Clear
            </button>
          </div>

          <pre class="mt-2 max-h-[28rem] overflow-auto rounded-2xl bg-slate-950 px-3 py-3 text-[11px] leading-5 text-slate-100 [scrollbar-width:thin]">{{ remoteLog.length ? remoteLog.map((entry) => JSON.stringify(entry, null, 2)).join('\n\n') : 'No events captured yet.' }}</pre>
        </div>
      </div>
    </section>
  </article>
</template>
