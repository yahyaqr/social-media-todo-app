/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface Window {
  SpeechRecognition?: new () => {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    start: () => void;
    stop: () => void;
    onresult: ((event: Event) => void) | null;
    onerror: ((event: Event) => void) | null;
    onend: (() => void) | null;
  };
  webkitSpeechRecognition?: new () => {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    start: () => void;
    stop: () => void;
    onresult: ((event: Event) => void) | null;
    onerror: ((event: Event) => void) | null;
    onend: (() => void) | null;
  };
}
