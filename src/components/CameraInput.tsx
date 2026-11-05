import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Camera, RefreshCw, X } from 'lucide-react';
import { uploadImageToLocal } from '../store/imageStorage';

interface CameraInputProps {
  value: string;
  onChange: (dataUrl: string) => void;
  fieldName?: string;
  compact?: boolean;
  onPreviewClick?: (url: string) => void;
}

export const CameraInput: React.FC<CameraInputProps> = ({
  value,
  onChange,
  fieldName = '카메라',
  compact = false,
  onPreviewClick,
}) => {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 카메라 디바이스 목록 로드
  const loadDevices = useCallback(async () => {
    try {
      // 권한 요청을 위해 임시 스트림 열기
      const tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
      tempStream.getTracks().forEach(t => t.stop());

      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = allDevices.filter(d => d.kind === 'videoinput');
      setDevices(videoDevices);
      if (videoDevices.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(videoDevices[0].deviceId);
      }
      setError('');
    } catch (e) {
      setError('카메라 접근 권한이 필요합니다');
    }
  }, [selectedDeviceId]);

  useEffect(() => {
    loadDevices();
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  // 스트림 시작
  const startStream = useCallback(async () => {
    if (!selectedDeviceId) return;
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: selectedDeviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setIsStreaming(true);
      setError('');
    } catch (e) {
      setError('카메라를 열 수 없습니다');
    }
  }, [selectedDeviceId]);

  // 스트림 중지
  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsStreaming(false);
  }, []);

  // 촬영
  const capture = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      // 로컬 파일로 업로드 시도, 실패 시 base64 폴백
      uploadImageToLocal(dataUrl)
        .then(localPath => { onChange(localPath); })
        .catch(() => { onChange(dataUrl); });
      stopStream();
    }
  }, [onChange, stopStream]);

  // 값이 있는 경우(미리보기)
  if (value && !isStreaming) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <img
          src={value}
          alt={fieldName}
          style={{
            width: compact ? '32px' : '48px',
            height: compact ? '32px' : '48px',
            objectFit: 'cover',
            borderRadius: '6px',
            border: '1px solid #cbd5e1',
            cursor: 'pointer',
          }}
          onClick={() => onPreviewClick?.(value)}
          title="클릭하여 원본 보기"
        />
        <button
          type="button"
          onClick={() => onChange('')}
          style={{
            background: 'none', border: '1px solid #e2e8f0', borderRadius: '4px',
            padding: '4px 8px', cursor: 'pointer', fontSize: '12px', color: '#64748b'
          }}
        >
          다시 촬영
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {/* 카메라 선택 */}
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        <Camera size={16} style={{ color: '#6366f1', flexShrink: 0 }} />
        <select
          value={selectedDeviceId}
          onChange={e => { setSelectedDeviceId(e.target.value); if (isStreaming) stopStream(); }}
          style={{
            flex: 1, padding: '5px 8px', border: '1px solid #cbd5e1', borderRadius: '6px',
            fontSize: '13px', background: '#fff', color: '#334155',
          }}
        >
          {devices.length === 0 && <option value="">카메라를 찾는 중...</option>}
          {devices.map(d => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `카메라 ${devices.indexOf(d) + 1}`}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={loadDevices}
          title="카메라 새로고침"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#64748b' }}
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {error && (
        <span style={{ color: '#ef4444', fontSize: '12px' }}>{error}</span>
      )}

      {/* 프리뷰 / 촬영 */}
      {isStreaming ? (
        <div style={{ position: 'relative', borderRadius: '8px', overflow: 'hidden', border: '2px solid #6366f1' }}>
          <video
            ref={videoRef}
            style={{ width: '100%', maxHeight: compact ? '120px' : '200px', objectFit: 'cover', display: 'block' }}
            muted
            playsInline
          />
          <div style={{
            position: 'absolute', bottom: '8px', left: '50%', transform: 'translateX(-50%)',
            display: 'flex', gap: '8px',
          }}>
            <button
              type="button"
              onClick={capture}
              style={{
                background: '#6366f1', color: '#fff', border: 'none', borderRadius: '20px',
                padding: '6px 16px', cursor: 'pointer', fontSize: '13px', fontWeight: 600,
              }}
            >
              📸 촬영
            </button>
            <button
              type="button"
              onClick={stopStream}
              style={{
                background: 'rgba(0,0,0,0.5)', color: '#fff', border: 'none', borderRadius: '20px',
                padding: '6px 12px', cursor: 'pointer', fontSize: '13px',
              }}
            >
              <X size={14} />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={startStream}
          disabled={!selectedDeviceId}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            padding: '8px 16px', border: '1px dashed #cbd5e1', borderRadius: '8px',
            background: '#f8fafc', cursor: selectedDeviceId ? 'pointer' : 'not-allowed',
            color: '#6366f1', fontSize: '13px', fontWeight: 500,
          }}
        >
          <Camera size={16} />
          카메라 열기
        </button>
      )}

      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
};
