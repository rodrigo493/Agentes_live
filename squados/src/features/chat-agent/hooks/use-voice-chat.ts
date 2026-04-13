'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export function useVoiceChat() {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioElRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const a = new Audio();
    a.onended = () => setSpeaking(false);
    a.onpause = () => setSpeaking(false);
    audioElRef.current = a;
    return () => { a.pause(); a.src = ''; };
  }, []);

  const startRecording = useCallback(async () => {
    if (recording) return;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      alert('Seu navegador não suporta captura de áudio. Use HTTPS e um navegador atualizado.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const candidates = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4;codecs=mp4a.40.2',
        'audio/mp4',
        'audio/aac',
        'audio/ogg;codecs=opus',
      ];
      const supported = candidates.find((m) =>
        typeof MediaRecorder !== 'undefined' &&
        typeof MediaRecorder.isTypeSupported === 'function' &&
        MediaRecorder.isTypeSupported(m)
      );
      const mr = supported
        ? new MediaRecorder(stream, { mimeType: supported })
        : new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      mr.start();
      mediaRef.current = mr;
      setRecording(true);
    } catch (e) {
      alert(`Não foi possível acessar o microfone: ${(e as Error).message}`);
    }
  }, [recording]);

  const stopRecording = useCallback(async (): Promise<string | null> => {
    if (!mediaRef.current) return null;
    return new Promise<string | null>((resolve) => {
      const mr = mediaRef.current!;
      mr.onstop = async () => {
        mr.stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        if (chunksRef.current.length === 0) { resolve(null); return; }
        const mime = mr.mimeType || chunksRef.current[0]?.type || 'audio/webm';
        const ext = mime.includes('mp4') ? 'mp4'
                  : mime.includes('ogg') ? 'ogg'
                  : mime.includes('aac') ? 'aac'
                  : 'webm';
        const blob = new Blob(chunksRef.current, { type: mime });
        setTranscribing(true);
        try {
          const fd = new FormData();
          fd.append('file', blob, `audio.${ext}`);
          const r = await fetch('/api/stt', { method: 'POST', body: fd });
          const j = await r.json();
          resolve(j.text ?? null);
        } catch {
          resolve(null);
        } finally {
          setTranscribing(false);
        }
      };
      mr.stop();
    });
  }, []);

  const speak = useCallback(async (text: string) => {
    if (!text.trim() || !audioElRef.current) return;
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.slice(0, 5000) }),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      audioElRef.current.src = URL.createObjectURL(blob);
      await audioElRef.current.play();
      setSpeaking(true);
    } catch {
      setSpeaking(false);
    }
  }, []);

  const stopSpeaking = useCallback(() => {
    audioElRef.current?.pause();
    setSpeaking(false);
  }, []);

  return { recording, transcribing, speaking, startRecording, stopRecording, speak, stopSpeaking };
}
