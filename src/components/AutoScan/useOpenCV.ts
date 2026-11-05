import { useState, useEffect } from 'react';

declare global {
  interface Window {
    cv: any;
  }
}

export const useOpenCV = () => {
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // 이미 OpenCV가 완전히 초기화되어 있는 경우
    if (window.cv?.Mat) {
      setReady(true);
      setLoading(false);
      return;
    }

    setLoading(true);

    // Emscripten 런타임 초기화 콜백 사전 등록
    window.cv = window.cv || {};
    const prevInit = window.cv.onRuntimeInitialized;
    window.cv.onRuntimeInitialized = () => {
      if (prevInit) prevInit();
      setReady(true);
      setLoading(false);
    };

    // 로컬 public/opencv.js 스크립트 로드
    let script = document.querySelector('script[src*="opencv"]') as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.src = '/opencv.js';
      script.async = true;
      script.onerror = () => {
        // 로컬 실패 시 CDN fallback
        console.warn('로컬 opencv.js 로드 실패, CDN fallback 시도');
        const fallbackScript = document.createElement('script');
        fallbackScript.src = 'https://unpkg.com/@techstark/opencv-js@4.9.0-release.2/dist/opencv.js';
        fallbackScript.async = true;
        document.head.appendChild(fallbackScript);
      };
      document.head.appendChild(script);
    } else if (script.src.includes('docs.opencv.org')) {
      // 기존 차단된 docs.opencv.org 스크립트가 있다면 제거 후 로컬로 교체
      script.remove();
      const newScript = document.createElement('script');
      newScript.src = '/opencv.js';
      newScript.async = true;
      document.head.appendChild(newScript);
    }

    // 폴링으로도 준비 상태 감지 (안전장치)
    const interval = setInterval(() => {
      if (window.cv?.Mat) {
        setReady(true);
        setLoading(false);
        clearInterval(interval);
      }
    }, 150);

    return () => clearInterval(interval);
  }, []);

  return { ready, loading };
};
