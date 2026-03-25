<script setup lang="ts">
import { Copy } from 'lucide-vue-next';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { contentIdeationFrameworks } from '../data/contentIdeationFrameworks';
import BasicDropdown from './BasicDropdown.vue';

type SpeechRecognitionAlternative = {
  transcript: string;
};

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0: SpeechRecognitionAlternative;
  length: number;
};

type SpeechRecognitionEventLike = Event & {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
};

type SpeechRecognitionErrorEventLike = Event & {
  error?: string;
};

type SpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives?: number;
  start: () => void;
  stop: () => void;
  abort?: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  onstart?: (() => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

const router = useRouter();
const route = useRoute();
const languageOptions = [
  { value: 'id-ID', label: 'Bahasa Indonesia' },
  { value: 'en-US', label: 'English' }
];
const storytellingDurationOptions = [
  { value: '240-300 words', label: '120 seconds', duration: 120, wordRange: '240-300 words' },
  { value: '300-360 words', label: '150 seconds', duration: 150, wordRange: '300-360 words' },
  { value: '360-420 words', label: '180 seconds', duration: 180, wordRange: '360-420 words' }
];

const transcript = ref('');
const selectedFramework = ref(contentIdeationFrameworks[0].value);
const selectedLanguage = ref(languageOptions[0].value);
const selectedStorytellingDuration = ref(storytellingDurationOptions[0].value);
const isRecording = ref(false);
const speechError = ref('');
const copyStatus = ref('');
const finalTranscript = ref('');
const recordingStatus = ref('Ready to record');
let recognition: SpeechRecognitionInstance | null = null;
let shouldKeepRecording = false;
let restartTimeoutId: number | null = null;
let copyStatusTimeoutId: number | null = null;
let restartAttempts = 0;
let latestInterimTranscript = '';
let microphoneStream: MediaStream | null = null;

const MAX_RESTART_ATTEMPTS = 3;
const DEBUG_PREFIX = '[ContentIdeation]';

const debugLog = (message: string, payload?: unknown): void => {
  if (payload === undefined) {
    console.log(DEBUG_PREFIX, message);
    return;
  }

  console.log(DEBUG_PREFIX, message, payload);
};

const normalizeTranscript = (value: string): string => {
  const cleanedLines = value
    .split('\n')
    .map((line) => line
      .replace(/\s+/g, ' ')
      .replace(/\s+([,.;!?])/g, '$1')
      .replace(/([,.;!?])([^\s])/g, '$1 $2')
      .trim())
    .filter((line, index, lines) => line.length > 0 || (
      index > 0 &&
      index < lines.length - 1 &&
      lines[index - 1] !== '' &&
      lines[index + 1] !== ''
    ));

  if (cleanedLines.length === 0) {
    return '';
  }

  const dedupedTail = cleanedLines
    .map((line) => line.replace(/\b(\w+)(?:\s+\1\b)+/gi, '$1'))
    .join('\n');

  return dedupedTail.charAt(0).toUpperCase() + dedupedTail.slice(1);
};

const syncTranscript = (interimTranscript = ''): void => {
  transcript.value = normalizeTranscript([finalTranscript.value, interimTranscript].filter(Boolean).join(' '));
  debugLog('syncTranscript', {
    finalTranscript: finalTranscript.value,
    interimTranscript,
    transcript: transcript.value
  });
};

const clearRestartTimeout = (): void => {
  if (restartTimeoutId !== null) {
    window.clearTimeout(restartTimeoutId);
    restartTimeoutId = null;
  }
};

const clearCopyStatusTimeout = (): void => {
  if (copyStatusTimeoutId !== null) {
    window.clearTimeout(copyStatusTimeoutId);
    copyStatusTimeoutId = null;
  }
};

const setCopyStatus = (value: string): void => {
  copyStatus.value = value;
  clearCopyStatusTimeout();

  if (value === 'Copied') {
    copyStatusTimeoutId = window.setTimeout(() => {
      copyStatus.value = '';
      copyStatusTimeoutId = null;
    }, 2500);
  }
};

const releaseMicrophoneStream = (): void => {
  microphoneStream?.getTracks().forEach((track) => track.stop());
  microphoneStream = null;
};

const selectedFrameworkContent = computed(() => {
  return contentIdeationFrameworks.find((framework) => framework.value === selectedFramework.value)?.content ?? '';
});

const selectedStorytellingDurationMeta = computed(() => {
  return storytellingDurationOptions.find((option) => option.value === selectedStorytellingDuration.value) ?? storytellingDurationOptions[0];
});

const browserSupportsSpeechRecognition = (): boolean => {
  return typeof window !== 'undefined' && (
    'SpeechRecognition' in window || 'webkitSpeechRecognition' in window
  );
};

const createSpeechRecognition = (): SpeechRecognitionInstance | null => {
  const SpeechRecognitionApi = (window as typeof window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }).SpeechRecognition ?? (window as typeof window & {
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }).webkitSpeechRecognition;

  return SpeechRecognitionApi ? new SpeechRecognitionApi() : null;
};

const stopRecording = (): void => {
  debugLog('stopRecording', {
    isRecording: isRecording.value,
    shouldKeepRecording
  });
  shouldKeepRecording = false;
  recordingStatus.value = 'Recording stopped';
  clearRestartTimeout();
  if (latestInterimTranscript && !finalTranscript.value) {
    finalTranscript.value = normalizeTranscript(latestInterimTranscript);
    syncTranscript();
  }
  recognition?.stop();
  releaseMicrophoneStream();
  isRecording.value = false;
};

const startRecording = async (): Promise<void> => {
  speechError.value = '';
  copyStatus.value = '';
  latestInterimTranscript = '';
  debugLog('startRecording requested', {
    language: selectedLanguage.value,
    browserSupportsSpeechRecognition: browserSupportsSpeechRecognition()
  });

  if (!browserSupportsSpeechRecognition()) {
    speechError.value = 'Speech recognition is not available in this browser.';
    debugLog('speech recognition unsupported');
    return;
  }

  recognition = createSpeechRecognition();
  if (!recognition) {
    speechError.value = 'Speech recognition could not be initialized.';
    debugLog('speech recognition init failed');
    return;
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    speechError.value = 'Microphone access is not available in this browser.';
    debugLog('getUserMedia unsupported');
    return;
  }

  try {
    microphoneStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });
  } catch (error) {
    speechError.value = 'Microphone access was denied.';
    debugLog('getUserMedia failed', { error });
    return;
  }

  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = selectedLanguage.value;
  recognition.maxAlternatives = 3;
  shouldKeepRecording = true;
  restartAttempts = 0;
  recordingStatus.value = selectedLanguage.value === 'id-ID' ? 'Listening in Bahasa Indonesia...' : 'Listening in English...';
  debugLog('recognition configured', {
    continuous: recognition.continuous,
    interimResults: recognition.interimResults,
    lang: recognition.lang,
    maxAlternatives: recognition.maxAlternatives
  });

  recognition.onresult = (event): void => {
    let interimTranscript = '';
    const chunks: Array<{ index: number; isFinal: boolean; transcript: string }> = [];

    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      const chunk = result[0]?.transcript?.trim();

      if (!chunk) {
        continue;
      }

      chunks.push({
        index,
        isFinal: result.isFinal,
        transcript: chunk
      });

      if (result.isFinal) {
        finalTranscript.value = normalizeTranscript(`${finalTranscript.value} ${chunk}`.trim());
        latestInterimTranscript = '';
      } else {
        interimTranscript = `${interimTranscript} ${chunk}`.trim();
      }
    }

    latestInterimTranscript = interimTranscript;

    debugLog('recognition result', {
      resultIndex: event.resultIndex,
      chunks,
      finalTranscript: finalTranscript.value,
      interimTranscript
    });
    syncTranscript(interimTranscript);
  };

  recognition.onerror = (event): void => {
    debugLog('recognition error', {
      error: event.error
    });
    if (event.error === 'not-allowed') {
      speechError.value = 'Microphone access was denied.';
      shouldKeepRecording = false;
      releaseMicrophoneStream();
    } else if (event.error === 'no-speech') {
      speechError.value = 'No speech detected. Keep the mic close and try again.';
    } else {
      speechError.value = 'Recording failed. Try again.';
    }

    recordingStatus.value = 'Transcription interrupted';
    isRecording.value = false;
  };

  recognition.onend = (): void => {
    if (latestInterimTranscript) {
      finalTranscript.value = normalizeTranscript(`${finalTranscript.value} ${latestInterimTranscript}`.trim());
      latestInterimTranscript = '';
      syncTranscript();
    }

    debugLog('recognition end', {
      shouldKeepRecording,
      restartAttempts,
      speechError: speechError.value
    });
    if (shouldKeepRecording && restartAttempts < MAX_RESTART_ATTEMPTS) {
      restartAttempts += 1;
      recordingStatus.value = 'Still listening...';
      clearRestartTimeout();
      restartTimeoutId = window.setTimeout(() => {
        debugLog('recognition restart', {
          restartAttempts
        });
        try {
          recognition?.start();
          isRecording.value = true;
        } catch (error) {
          speechError.value = 'Recording could not restart. Try again.';
          shouldKeepRecording = false;
          releaseMicrophoneStream();
          debugLog('recognition restart failed', { error });
        }
      }, 250);
      return;
    }

    shouldKeepRecording = false;
    clearRestartTimeout();
    releaseMicrophoneStream();
    isRecording.value = false;
    if (!speechError.value) {
      recordingStatus.value = 'Recording finished';
    }
  };

  recognition.onstart = (): void => {
    recordingStatus.value = selectedLanguage.value === 'id-ID' ? 'Listening in Bahasa Indonesia...' : 'Listening in English...';
    debugLog('recognition onstart');
  };

  try {
    recognition.start();
    isRecording.value = true;
    debugLog('recognition started');
  } catch (error) {
    speechError.value = 'Recording could not start. Try again.';
    shouldKeepRecording = false;
    releaseMicrophoneStream();
    debugLog('recognition start failed', { error });
  }
};

const toggleRecording = (): void => {
  if (isRecording.value) {
    stopRecording();
    return;
  }

  void startRecording();
};

const handleTranscriptInput = (value: string): void => {
  const normalized = normalizeTranscript(value);
  transcript.value = normalized;
  finalTranscript.value = normalized;
  debugLog('manual transcript input', {
    transcript: normalized
  });
};

const copyOutline = async (): Promise<void> => {
  if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
    setCopyStatus('Clipboard is not available in this browser.');
    return;
  }

  const promptInformation = transcript.value.trim() || '(empty)';
  const languageInstruction = `Language: ${languageOptions.find((option) => option.value === selectedLanguage.value)?.label ?? selectedLanguage.value}`;
  const durationInstruction = `Duration: ${selectedStorytellingDurationMeta.value.duration} seconds`;
  const wordCountInstruction = `Recommended length: ${selectedStorytellingDurationMeta.value.wordRange}`;
  const informationBlock = `${languageInstruction}\n${durationInstruction}\n${wordCountInstruction}\n\nInformation:`;
  const payload = selectedFrameworkContent.value.replace('Information:', informationBlock).replace('[insert information]', promptInformation);

  try {
    await navigator.clipboard.writeText(payload);
    setCopyStatus('Copied');
  } catch {
    setCopyStatus('Copy failed.');
  }
};

const openChatGPT = (): void => {
  window.open('https://chatgpt.com', '_blank', 'noopener,noreferrer');
};

const goBack = async (): Promise<void> => {
  const returnTo = Array.isArray(route.query.returnTo) ? route.query.returnTo[0] : route.query.returnTo;

  if (typeof returnTo === 'string' && returnTo.trim()) {
    await router.push(returnTo);
    return;
  }

  await router.push({ name: 'home' });
};

watch(selectedLanguage, () => {
  debugLog('language changed', {
    language: selectedLanguage.value,
    isRecording: isRecording.value
  });
  if (isRecording.value) {
    stopRecording();
  }
});

onBeforeUnmount(() => {
  debugLog('component unmount');
  clearCopyStatusTimeout();
  if (isRecording.value) {
    stopRecording();
    return;
  }

  recognition?.abort?.();
  releaseMicrophoneStream();
});
</script>

<template>
  <main class="flex h-[100dvh] flex-col bg-slate-100 text-slate-900">
    <header class="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-slate-200 bg-white p-3 sm:p-4">
      <div class="flex w-full justify-between items-center gap-3">
        <button
          type="button"
          class="inline-flex h-9 w-24 items-center justify-center rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100"
          aria-label="Back"
          title="Back"
          @click="goBack"
        >
          <svg viewBox="0 0 32 24" class="h-4 w-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M30 12H2M9 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 class="min-w-0 truncate text-base font-semibold text-slate-900 sm:text-lg">Content Ideation</h1>
      </div>
    </header>

    <section class="flex min-h-0 flex-1 flex-col px-3 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-4 sm:px-4">
      <div class="grid grid-cols-2 gap-3">
        <BasicDropdown v-model="selectedLanguage" :options="languageOptions" label="Select language" />

        <BasicDropdown
          v-model="selectedStorytellingDuration"
          :options="storytellingDurationOptions"
          label="Select duration"
        />
      </div>

      <div class="mt-4 flex flex-1 flex-col">
        <label class="block text-sm font-semibold text-slate-800" for="transcript">Transcript</label>
        <textarea
          id="transcript"
          :value="transcript"
          placeholder="Your transcribed audio will appear here."
          class="mt-2 min-h-[20rem] flex-1 resize-none rounded-2xl border border-slate-300 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none ring-blue-300 placeholder:text-slate-400 focus:ring-2"
          @input="handleTranscriptInput(($event.target as HTMLTextAreaElement).value)"
        />
      </div>

      <button
        type="button"
        class="mt-4 inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold text-white shadow-sm transition active:scale-[0.98]"
        :class="isRecording ? 'bg-rose-600 hover:bg-rose-700' : 'bg-blue-600 hover:bg-blue-700'"
        @click="toggleRecording"
      >
        <span class="inline-flex h-2.5 w-2.5 rounded-full bg-white/90" :class="{ 'animate-pulse': isRecording }" />
        {{ isRecording ? 'Stop Recording' : 'Record Audio' }}
      </button>

      <p class="mt-2 text-sm text-slate-500">{{ recordingStatus }}</p>
      <p v-if="speechError" class="mt-3 text-sm font-medium text-rose-600">{{ speechError }}</p>

      <div class="mt-4">
        <p class="text-sm font-semibold text-slate-800">Outline Framework</p>
        <div class="mt-2">
          <BasicDropdown v-model="selectedFramework" :options="contentIdeationFrameworks" label="Select framework" />
        </div>
      </div>

      <div class="mt-4 rounded-2xl border border-slate-200 bg-white p-3">
        <pre class="max-h-56 overflow-y-auto whitespace-pre-wrap font-sans text-sm leading-6 text-slate-700">{{ selectedFrameworkContent }}</pre>
      </div>
    </section>

    <div class="fixed bottom-0 left-0 right-0 border-t border-slate-200 bg-white px-3 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] sm:px-4">
      <div class="mx-auto max-w-2xl">
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800"
            @click="copyOutline"
          >
            <Copy class="h-4 w-4" />
            <span>{{ copyStatus || 'Copy' }}</span>
          </button>
          <button
            type="button"
            class="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100"
            aria-label="Open ChatGPT"
            title="Open ChatGPT"
            @click="openChatGPT"
          >
            <svg class="h-4 w-4" fill="#000000" viewBox="0 0 24 24" role="img" xmlns="http://www.w3.org/2000/svg"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"><title>OpenAI icon</title><path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z"></path></g></svg>
            <span>Open ChatGPT</span>
          </button>
        </div>
      </div>
    </div>
  </main>
</template>
