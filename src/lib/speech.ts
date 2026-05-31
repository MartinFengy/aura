"use client";

type SpeakOptions = {
  onEnd?: () => void;
};

let speakingToken = 0;

function getSpeechSynthesis() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return null;
  }

  return window.speechSynthesis;
}

function createUtterance(text: string, options?: SpeakOptions) {
  const utterance = new SpeechSynthesisUtterance(text);
  const synth = getSpeechSynthesis();
  const voices = synth?.getVoices() ?? [];
  const preferredVoice =
    voices.find((voice) => voice.lang.toLowerCase().startsWith("en-us")) ??
    voices.find((voice) => voice.lang.toLowerCase().startsWith("en")) ??
    null;

  utterance.lang = preferredVoice?.lang ?? "en-US";
  if (preferredVoice) {
    utterance.voice = preferredVoice;
  }
  utterance.rate = 0.94;
  utterance.pitch = 1;
  if (options?.onEnd) {
    utterance.onend = options.onEnd;
  }

  return utterance;
}

function speakWithDelay(text: string, options?: SpeakOptions) {
  const synth = getSpeechSynthesis();
  if (!synth) {
    return;
  }

  const currentToken = speakingToken + 1;
  speakingToken = currentToken;
  synth.cancel();

  window.setTimeout(() => {
    if (speakingToken !== currentToken) {
      return;
    }

    const utterance = createUtterance(text, options);
    synth.resume();
    synth.speak(utterance);
  }, 80);
}

export function speakText(text: string) {
  const normalized = text.trim();
  if (!normalized) {
    return;
  }

  speakWithDelay(normalized);
}

export function stopSpeaking() {
  const synth = getSpeechSynthesis();
  if (synth) {
    speakingToken += 1;
    synth.cancel();
  }
}

export function speakSequence(texts: string[], gapMs = 280) {
  const synth = getSpeechSynthesis();
  if (!synth) {
    return;
  }

  const queue = texts.map((text) => text.trim()).filter(Boolean);
  if (queue.length === 0) {
    return;
  }

  const currentToken = speakingToken + 1;
  speakingToken = currentToken;
  synth.cancel();

  const playNext = (index: number) => {
    if (speakingToken !== currentToken) {
      return;
    }

    if (index >= queue.length) {
      return;
    }

    const utterance = createUtterance(queue[index], {
      onEnd: () => {
        if (speakingToken !== currentToken) {
          return;
        }

        window.setTimeout(() => playNext(index + 1), gapMs);
      },
    });
    synth.resume();
    synth.speak(utterance);
  };

  window.setTimeout(() => {
    if (speakingToken !== currentToken) {
      return;
    }

    playNext(0);
  }, 80);
}

export function speakExample(text: string) {
  const normalized = text.trim();
  if (!normalized) {
    return;
  }

  speakWithDelay(normalized);
}
