import React, { useState, useRef } from 'react';
import { Camera, Upload, Trash2, Eye, Plus, X } from 'lucide-react';
import { compressImageFile } from '../utils/formatters';
import { uploadImageToLocal } from '../store/imageStorage';
import type { Blueprint } from '../types';
import './ImageUploadInput.css';

// 이미지 필드 여부 헬퍼
export const isImageField = (bp?: Blueprint | null, fieldName?: string, value?: string): boolean => {
  if (bp?.inputType === 'image' || bp?.inputType === 'camera') return true;
  const name = (fieldName || bp?.name || '').toLowerCase();
  if (name.includes('이미지') || name.includes('사진') || name.includes('image') || name.includes('photo')) return true;
  if (typeof value === 'string' && (value.startsWith('data:image/') || value.startsWith('blob:') || value.startsWith('/local-images/'))) return true;
  return false;
};

// 유효한 이미지 URL인지 검증 (__img__ 플레이스홀더 제외)
export const isValidImageUrl = (url?: string | null): boolean => {
  if (!url || typeof url !== 'string') return false;
  if (url === '__img__' || url.startsWith('__img')) return false;
  return url.startsWith('data:image/') || url.startsWith('blob:') || url.startsWith('/local-images/') || url.startsWith('http://') || url.startsWith('https://');
};

// ─── 단일 모드 Props ───
interface ImageUploadInputSingleProps {
  value: string;
  onChange: (dataUrl: string) => void;
  fieldName?: string;
  compact?: boolean;
  onPreviewClick?: (url: string) => void;
  multiple?: false;
}

// ─── 복수 모드 쌍 타입 ───
export interface ImagePair {
  img: string;
  desc: string;
  extras?: Record<string, string>; // 추가 필드 (이미지사이즈 등)
}

// ─── 추가 필드 정의 ───
export interface ExtraFieldDef {
  id: string;
  label: string;
}

// ─── 복수 모드 Props ───
interface ImageUploadInputMultipleProps {
  multiple: true;
  pairs: ImagePair[];
  onAddPair: (img: string, desc: string, extras?: Record<string, string>) => void;
  onUpdatePair: (idx: number, img: string, desc: string, extras?: Record<string, string>) => void;
  onRemovePair: (idx: number) => void;
  descLabel?: string;    // 설명 필드 레이블 (default: '요약설명')
  extraFieldDefs?: ExtraFieldDef[]; // 이미지당 추가 필드 정의 목록
  fieldName?: string;
  onPreviewClick?: (url: string) => void;
}

type ImageUploadInputProps = ImageUploadInputSingleProps | ImageUploadInputMultipleProps;

// ─────────────────────────────────────────────────────────────────────────────
// 단일 이미지 업로드 (기존과 동일)
// ─────────────────────────────────────────────────────────────────────────────
const SingleImageUpload: React.FC<ImageUploadInputSingleProps> = ({
  value,
  onChange,
  fieldName = '이미지',
  compact = false,
  onPreviewClick,
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessing(true);
    try {
      const compressed = await compressImageFile(file, 1000, 0.85);
      try {
        const localPath = await uploadImageToLocal(compressed);
        onChange(localPath);
      } catch {
        // 서버 업로드 실패 시 base64 폴백
        onChange(compressed);
      }
    } catch (err) {
      console.error('Image compression failed:', err);
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      setIsProcessing(true);
      try {
        const compressed = await compressImageFile(file, 1000, 0.85);
        try {
          const localPath = await uploadImageToLocal(compressed);
          onChange(localPath);
        } catch {
          onChange(compressed);
        }
      } catch (err) {
        console.error('Image drop compression failed:', err);
      } finally {
        setIsProcessing(false);
      }
    }
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) {
          setIsProcessing(true);
          try {
            const compressed = await compressImageFile(file, 1000, 0.85);
            try {
              const localPath = await uploadImageToLocal(compressed);
              onChange(localPath);
            } catch {
              onChange(compressed);
            }
          } finally {
            setIsProcessing(false);
          }
        }
        break;
      }
    }
  };

  const hasImage = isValidImageUrl(value);

  return (
    <div
      className={`image-upload-wrapper ${compact ? 'compact' : ''} ${hasImage ? 'has-image' : 'empty'}`}
      onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
      onDrop={handleDrop}
      onPaste={handlePaste}
      onClick={e => e.stopPropagation()}
    >
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {hasImage ? (
        <div className="image-preview-badge-row">
          <div
            className="image-thumb-box"
            onClick={() => onPreviewClick ? onPreviewClick(value) : fileInputRef.current?.click()}
            title="클릭하여 원본 보기 또는 이미지 변경"
          >
            <img src={value} alt={fieldName} className="image-thumb-img" onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }} />
            <div className="image-thumb-overlay">
              <Eye size={11} />
            </div>
          </div>
          <div className="image-action-btns">
            <button
              type="button"
              className="btn-image-change"
              onClick={() => fileInputRef.current?.click()}
              title="다른 이미지 파일로 변경"
              disabled={isProcessing}
            >
              <Upload size={12} />
              <span>변경</span>
            </button>
            <button
              type="button"
              className="btn-image-remove"
              onClick={() => onChange('')}
              title="이미지 제거"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="btn-image-upload-trigger"
          onClick={() => fileInputRef.current?.click()}
          title="클릭하여 첨부파일(이미지) 선택 / 드래그앤드롭"
          disabled={isProcessing}
        >
          {isProcessing ? (
            <span className="image-upload-spinner">압축 중...</span>
          ) : (
            <>
              <Camera size={14} className="image-upload-icon" />
              <span className="image-upload-label">
                {compact ? '이미지 첨부' : `${fieldName} 파일 첨부...`}
              </span>
            </>
          )}
        </button>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 복수 이미지 업로드 (이미지 + 설명 쌍 배열)
// ─────────────────────────────────────────────────────────────────────────────
const MultipleImageUpload: React.FC<ImageUploadInputMultipleProps> = ({
  pairs,
  onAddPair,
  onUpdatePair,
  onRemovePair,
  descLabel = '요약설명',
  extraFieldDefs = [],
  fieldName = '이미지',
  onPreviewClick,
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  // 각 쌍별 파일 input ref
  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const newFileInputRef = useRef<HTMLInputElement>(null);

  const compressAndSet = async (file: File, callback: (url: string) => void) => {
    setIsProcessing(true);
    try {
      const compressed = await compressImageFile(file, 1000, 0.85);
      try {
        const localPath = await uploadImageToLocal(compressed);
        callback(localPath);
      } catch {
        callback(compressed);
      }
    } catch (err) {
      console.error('Image compression failed:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  // 이미지에서 픽셀 크기 감지 → 사이즈 관련 extraField 자동 채움
  const detectSizeExtras = (url: string, currentExtras?: Record<string, string>): Promise<Record<string, string>> => {
    return new Promise(resolve => {
      const sizeDef = extraFieldDefs.find(d => d.label.includes('사이즈') || d.label.includes('크기'));
      if (!sizeDef || !url) { resolve(currentExtras || {}); return; }
      const img = new window.Image();
      img.onload = () => {
        resolve({ ...(currentExtras || {}), [sizeDef.label]: `${img.naturalWidth} × ${img.naturalHeight} px` });
      };
      img.onerror = () => resolve(currentExtras || {});
      img.src = url;
    });
  };

  // 새 쌍 추가 (파일 선택 후)
  const handleNewFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await compressAndSet(file, async (url) => {
      const extras = await detectSizeExtras(url, {});
      onAddPair(url, '', extras);
    });
    if (newFileInputRef.current) newFileInputRef.current.value = '';
  };

  // 기존 쌍의 이미지 변경
  const handlePairImageChange = async (idx: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await compressAndSet(file, async (url) => {
      const extras = await detectSizeExtras(url, pairs[idx].extras);
      onUpdatePair(idx, url, pairs[idx].desc, extras);
    });
    const ref = fileInputRefs.current[idx];
    if (ref) ref.value = '';
  };

  return (
    <div className="image-multi-wrapper">
      {/* 기존 쌍 목록 */}
      {pairs.map((pair, idx) => (
        <div key={idx} className="image-pair-row">
          {/* 이미지 썸네일 영역 */}
          <div className="image-pair-thumb-area">
            <input
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              ref={el => { fileInputRefs.current[idx] = el; }}
              onChange={(e) => handlePairImageChange(idx, e)}
            />
            {isValidImageUrl(pair.img) ? (
              <div
                className="image-pair-thumb"
                onClick={() => onPreviewClick ? onPreviewClick(pair.img) : fileInputRefs.current[idx]?.click()}
                title="클릭하여 원본 보기 / 이미지 변경"
              >
                <img src={pair.img} alt={`${fieldName} ${idx + 1}`} onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }} />
                <div className="image-pair-thumb-overlay">
                  <Eye size={10} />
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="image-pair-empty-btn"
                onClick={() => fileInputRefs.current[idx]?.click()}
                disabled={isProcessing}
              >
                <Camera size={13} />
              </button>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
              {pair.img && (
                <button
                  type="button"
                  className="image-pair-change-btn"
                  onClick={() => fileInputRefs.current[idx]?.click()}
                  title="이미지 변경"
                  disabled={isProcessing}
                >
                  <Upload size={10} />
                </button>
              )}
              <label className="image-pair-index-label">#{idx + 1}</label>
            </div>
          </div>

          {/* 설명 + 추가 필드 입력 영역 */}
          <div className="image-pair-desc-area">
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <input
                type="text"
                className="image-pair-desc-input"
                placeholder={`${descLabel} 입력...`}
                value={pair.desc}
                onChange={e => onUpdatePair(idx, pair.img, e.target.value, pair.extras)}
              />
            </div>
            {/* 추가 필드 (이미지사이즈 등) - 두 번째 줄 */}
            {extraFieldDefs.map(extDef => (
              <input
                key={extDef.id}
                type="text"
                className="image-pair-desc-input"
                placeholder={`${extDef.label} 입력...`}
                value={(pair.extras || {})[extDef.label] || ''}
                onChange={e => {
                  const newExtras = { ...(pair.extras || {}), [extDef.label]: e.target.value };
                  onUpdatePair(idx, pair.img, pair.desc, newExtras);
                }}
              />
            ))}
          </div>

          {/* 삭제 버튼 */}
          <button
            type="button"
            className="image-pair-remove-btn"
            onClick={() => onRemovePair(idx)}
            title="이 항목 삭제"
          >
            <X size={13} />
          </button>
        </div>
      ))}

      {/* 새 이미지 추가 버튼 */}
      <div className="image-multi-add-row">
        <input
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          ref={newFileInputRef}
          onChange={handleNewFileChange}
        />
        <button
          type="button"
          className="image-multi-add-btn"
          onClick={() => newFileInputRef.current?.click()}
          disabled={isProcessing}
          title="새 이미지 추가"
        >
          {isProcessing ? (
            <span>압축 중...</span>
          ) : (
            <>
              <Plus size={13} />
              <span>이미지 추가</span>
            </>
          )}
        </button>
        {pairs.length > 0 && (
          <span className="image-multi-count">{pairs.length}개 등록됨</span>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 통합 컴포넌트
// ─────────────────────────────────────────────────────────────────────────────
export const ImageUploadInput: React.FC<ImageUploadInputProps> = (props) => {
  if (props.multiple === true) {
    return <MultipleImageUpload {...props} />;
  }
  return <SingleImageUpload {...props} />;
};
