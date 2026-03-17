import { useEffect, useMemo, useRef, useState } from "react";

import type { ReaderPage, ReaderParagraph } from "@/lib/pdf";
import { clamp } from "@/lib/utils";

type VoiceConsoleOptions = {
  pages: ReaderPage[];
  selectedPage: number;
  onSelectPage: (pageNumber: number) => void;
};

type SpeechSession = {
  pageNumber: number;
  text: string;
  label: string;
  paragraphId: string | null;
  charOffsetBase: number;
  kind: "page" | "paragraph" | "selection";
};

function isBrowser() {
  return typeof window !== "undefined";
}

function getRecognitionConstructor() {
  if (!isBrowser()) {
    return null;
  }

  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

export function useVoiceConsole({
  pages,
  selectedPage,
  onSelectPage,
}: VoiceConsoleOptions) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState("");
  const [rate, setRate] = useState(1);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [lastCommand, setLastCommand] = useState("");
  const [spokenCharacterIndex, setSpokenCharacterIndex] = useState(0);
  const [speechSession, setSpeechSession] = useState<SpeechSession | null>(null);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const recognitionSupported = Boolean(getRecognitionConstructor());
  const selectedPageData = useMemo(
    () => pages.find((page) => page.pageNumber === selectedPage) ?? null,
    [pages, selectedPage],
  );
  const activeParagraph = useMemo(() => {
    const pageForSession =
      pages.find((page) => page.pageNumber === (speechSession?.pageNumber ?? selectedPage)) ??
      selectedPageData;

    if (!pageForSession?.paragraphs.length) {
      return null;
    }

    if (speechSession?.kind === "selection" && speechSession.paragraphId) {
      return (
        pageForSession.paragraphs.find((paragraph) => paragraph.id === speechSession.paragraphId) ??
        null
      );
    }

    return (
      pageForSession.paragraphs.find(
        (paragraph) =>
          spokenCharacterIndex + (speechSession?.charOffsetBase ?? 0) >= paragraph.start &&
          spokenCharacterIndex + (speechSession?.charOffsetBase ?? 0) < paragraph.end + 2,
      ) ?? selectedPageData.paragraphs[0]
    );
  }, [pages, selectedPage, selectedPageData, speechSession, spokenCharacterIndex]);

  useEffect(() => {
    if (!isBrowser()) {
      return undefined;
    }

    const updateVoices = () => {
      const availableVoices = window.speechSynthesis.getVoices();
      setVoices(availableVoices);

      if (!selectedVoice && availableVoices[0]) {
        setSelectedVoice(availableVoices[0].name);
      }
    };

    updateVoices();
    window.speechSynthesis.addEventListener("voiceschanged", updateVoices);

    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", updateVoices);
    };
  }, [selectedVoice]);

  useEffect(() => {
    return () => {
      if (!isBrowser()) {
        return;
      }

      recognitionRef.current?.stop();
      window.speechSynthesis.cancel();
    };
  }, []);

  const stopSpeaking = () => {
    if (!isBrowser()) {
      return;
    }

    window.speechSynthesis.cancel();
    utteranceRef.current = null;
    setIsSpeaking(false);
    setIsPaused(false);
    setSpokenCharacterIndex(0);
    setSpeechSession(null);
  };

  const speakSession = (session: SpeechSession) => {
    if (!isBrowser() || !session.text.trim()) {
      return;
    }

    stopSpeaking();

    const utterance = new SpeechSynthesisUtterance(session.text.slice(0, 12000));
    utterance.voice = voices.find((voice) => voice.name === selectedVoice) ?? null;
    utterance.rate = rate;
    utterance.onstart = () => {
      setIsSpeaking(true);
      setIsPaused(false);
      setSpokenCharacterIndex(0);
      setSpeechSession(session);
      onSelectPage(session.pageNumber);
    };
    utterance.onend = () => {
      setIsSpeaking(false);
      setIsPaused(false);
      setSpokenCharacterIndex(0);
      setSpeechSession(null);
    };
    utterance.onerror = () => {
      setIsSpeaking(false);
      setIsPaused(false);
      setSpokenCharacterIndex(0);
      setSpeechSession(null);
    };
    utterance.onboundary = (event) => {
      setSpokenCharacterIndex(event.charIndex);
    };

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
    setLastCommand(session.label);
  };

  const speakPage = (page = selectedPageData) => {
    if (!page?.text) {
      return;
    }

    speakSession({
      pageNumber: page.pageNumber,
      text: page.text,
      label: `Reading page ${page.pageNumber}`,
      paragraphId: page.paragraphs[0]?.id ?? null,
      charOffsetBase: 0,
      kind: "page",
    });
  };

  const speakFromParagraph = (page: ReaderPage | null, paragraph: ReaderParagraph | null) => {
    if (!page || !paragraph) {
      return;
    }

    speakSession({
      pageNumber: page.pageNumber,
      text: page.text.slice(paragraph.start),
      label: `Reading from paragraph ${paragraph.id.replace("page-", "p")}`,
      paragraphId: paragraph.id,
      charOffsetBase: paragraph.start,
      kind: "paragraph",
    });
  };

  const speakSelection = (selectionText: string, page: ReaderPage | null, paragraphId: string | null) => {
    const text = selectionText.trim();

    if (!text || !page) {
      return;
    }

    const paragraph = page.paragraphs.find((entry) => entry.id === paragraphId) ?? null;
    const baseOffset = paragraph ? Math.max(0, paragraph.text.indexOf(text)) + paragraph.start : 0;

    speakSession({
      pageNumber: page.pageNumber,
      text,
      label: "Reading selection",
      paragraphId,
      charOffsetBase: Number.isFinite(baseOffset) ? baseOffset : 0,
      kind: "selection",
    });
  };

  const pauseOrResume = () => {
    if (!isBrowser()) {
      return;
    }

    if (!isSpeaking && !isPaused) {
      if (speechSession?.kind === "selection" && selectedPageData) {
        speakSession(speechSession);
      } else {
        speakPage();
      }
      return;
    }

    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
      setIsPaused(false);
      setIsSpeaking(true);
      return;
    }

    window.speechSynthesis.pause();
    setIsPaused(true);
    setIsSpeaking(false);
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsListening(false);
  };

  const startListening = () => {
    const Recognition = getRecognitionConstructor();

    if (!Recognition) {
      return;
    }

    stopListening();

    const recognition = new Recognition();
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      setLastCommand("Listening for commands");
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognition.onresult = (event) => {
      const transcript = event.results[event.results.length - 1]?.[0]?.transcript
        ?.trim()
        .toLowerCase();

      if (!transcript) {
        return;
      }

      setLastCommand(`Heard: "${transcript}"`);

      if (transcript.includes("next")) {
        onSelectPage(clamp(selectedPage + 1, 1, pages.length));
        return;
      }

      if (transcript.includes("previous") || transcript.includes("back")) {
        onSelectPage(clamp(selectedPage - 1, 1, pages.length));
        return;
      }

      const pageMatch = transcript.match(/page\s+(\d{1,4})/);
      if (pageMatch) {
        const pageNumber = clamp(Number(pageMatch[1]), 1, pages.length);
        onSelectPage(pageNumber);
        if (transcript.includes("read") || transcript.includes("listen")) {
          speakPage(pages.find((page) => page.pageNumber === pageNumber) ?? null);
        }
        return;
      }

      if (transcript.includes("read") || transcript.includes("listen")) {
        speakPage();
        return;
      }

      if (transcript.includes("stop")) {
        stopSpeaking();
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  return {
    voices,
    selectedVoice,
    setSelectedVoice,
    rate,
    setRate,
    isSpeaking,
    isPaused,
    isListening,
    lastCommand,
    spokenCharacterIndex,
    activeParagraphId: activeParagraph?.id ?? null,
    activePageNumber: speechSession?.pageNumber ?? selectedPage,
    currentSessionLabel: speechSession?.label ?? "",
    currentSessionKind: speechSession?.kind ?? null,
    recognitionSupported,
    speakPage,
    speakFromParagraph,
    speakSelection,
    pauseOrResume,
    stopSpeaking,
    startListening,
    stopListening,
  };
}
