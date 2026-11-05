import React, { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Search, Check, Sparkles } from 'lucide-react';
import './AutocompleteInput.css';

interface AutocompleteInputProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  existingValues: string[];
  autoFocus?: boolean;
  className?: string;
  fieldName?: string;
  onEnter?: () => void;
  onClick?: (e: React.MouseEvent) => void;
}

export const AutocompleteInput: React.FC<AutocompleteInputProps> = ({
  value,
  onChange,
  placeholder,
  existingValues,
  autoFocus,
  className = '',
  fieldName = '',
  onEnter,
  onClick,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [coords, setCoords] = useState<{ top?: number; bottom?: number; left: number; width: number }>({
    left: 0,
    width: 240,
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 뷰포트 기준 절대 위치 계산 (테이블/셀의 overflow 및 z-index 클리핑 완전 방지)
  const updateCoords = useCallback(() => {
    const target = containerRef.current || inputRef.current;
    if (target) {
      const rect = target.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;

      // 팝업 필요 높이 약 200px. 아래 여유가 180px 미만이고 위쪽 공간이 더 넓을 때만 위로 열림
      const shouldOpenUp = spaceBelow < 180 && spaceAbove > spaceBelow;
      const width = Math.max(rect.width, 240);
      let left = rect.left;
      if (left + width > window.innerWidth - 12) {
        left = Math.max(12, window.innerWidth - width - 12);
      }

      if (shouldOpenUp) {
        setCoords({
          bottom: window.innerHeight - rect.top + 4,
          left,
          width,
        });
      } else {
        setCoords({
          top: rect.bottom + 4,
          left,
          width,
        });
      }
    }
  }, []);

  // 고유 기존 값 목록 정렬 (최신/빈도순 또는 가나다순)
  const uniqueValues = useMemo(() => {
    return Array.from(new Set(existingValues.map(v => v.trim()).filter(Boolean)));
  }, [existingValues]);

  // 실시간 추천 항목 필터링 (최대 8개)
  const suggestions = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) {
      return uniqueValues.slice(0, 8);
    }
    return uniqueValues
      .filter(v => v.toLowerCase().includes(q) && v.toLowerCase() !== q)
      .slice(0, 8);
  }, [uniqueValues, value]);

  // 기존 등록된 값 여부 및 새값 여부 확인
  const trimmedValue = value.trim();
  const hasValue = trimmedValue.length > 0;
  const isExistingValue = useMemo(() => {
    if (!hasValue) return false;
    const q = trimmedValue.toLowerCase();
    return uniqueValues.some(v => v.toLowerCase() === q);
  }, [uniqueValues, trimmedValue, hasValue]);
  const isNewValue = Boolean(hasValue && !isExistingValue);

  // 화면 렌더링 전 동기적으로 정확한 위치 반영
  useLayoutEffect(() => {
    if (isOpen) {
      updateCoords();
    }
  }, [isOpen, updateCoords, isExistingValue]);

  // 외부 클릭 시 드롭다운 닫기 (포털 팝업 클릭 감지 포함)
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current && !containerRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 드롭다운 열릴 때 및 스크롤/리사이즈 시 포지션 실시간 추적
  useEffect(() => {
    if (isOpen) {
      updateCoords();
      const handleUpdate = () => updateCoords();
      window.addEventListener('scroll', handleUpdate, true);
      window.addEventListener('resize', handleUpdate);
      return () => {
        window.removeEventListener('scroll', handleUpdate, true);
        window.removeEventListener('resize', handleUpdate);
      };
    }
  }, [isOpen, updateCoords]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      if (!isOpen) {
        updateCoords();
        setIsOpen(true);
        setHighlightIndex(0);
      } else if (suggestions.length > 0) {
        setHighlightIndex(prev => (prev + 1) % suggestions.length);
      }
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      if (isOpen && suggestions.length > 0) {
        setHighlightIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
      }
      e.preventDefault();
    } else if (e.key === 'Enter') {
      if (isOpen && highlightIndex >= 0 && suggestions[highlightIndex]) {
        e.preventDefault();
        onChange(suggestions[highlightIndex]);
        setIsOpen(false);
      } else if (onEnter) {
        onEnter();
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  // 검색어 일치 부분 강조
  const renderHighlightedText = (text: string, query: string) => {
    if (!query.trim()) return text;
    const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    return parts.map((part, i) => 
      part.toLowerCase() === query.toLowerCase() ? (
        <strong key={i} className="autocomplete-match-highlight">{part}</strong>
      ) : (
        part
      )
    );
  };

  return (
    <div className="autocomplete-input-wrapper" ref={containerRef}>
      <div className="autocomplete-input-box">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={e => {
            onChange(e.target.value);
            updateCoords();
            setIsOpen(true);
            setHighlightIndex(-1);
          }}
          onFocus={() => {
            if (uniqueValues.length > 0) {
              updateCoords();
              setIsOpen(true);
            }
          }}
          onClick={e => {
            updateCoords();
            if (onClick) onClick(e);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || (fieldName ? `${fieldName} 입력...` : '입력...')}
          autoFocus={autoFocus}
          className={`autocomplete-input-field ${isExistingValue ? 'is-existing' : isNewValue ? 'is-new' : ''} ${className}`}
        />
        {isExistingValue && (
          <span 
            className="autocomplete-status-icon existing animate-fade-in" 
            title="기존에 존재하는 값입니다 (기존 데이터 연결/중복 방지)"
          >
            <Check size={13} />
          </span>
        )}
        {isNewValue && (
          <span 
            className="autocomplete-status-icon new animate-fade-in" 
            title="새로운 값입니다 (신규 데이터로 추가)"
          >
            <Sparkles size={13} />
          </span>
        )}
      </div>

      {/* 포털 기반 자동완성 드롭다운 (어떠한 테이블 셀이나 상위 컨테이너에도 가려지지 않음) */}
      {isOpen && suggestions.length > 0 && typeof document !== 'undefined' && createPortal(
        <div
          ref={dropdownRef}
          className="autocomplete-dropdown animate-scale-in"
          style={{
            position: 'fixed',
            top: coords.top !== undefined ? `${coords.top}px` : 'auto',
            bottom: coords.bottom !== undefined ? `${coords.bottom}px` : 'auto',
            left: `${coords.left}px`,
            width: `${coords.width}px`,
            minWidth: '220px',
            maxWidth: '380px',
            zIndex: 1000030,
          }}
          onMouseDown={e => e.preventDefault()}
        >
          <div className="autocomplete-dropdown-header">
            <span>💡 기존 등록 데이터 자동완성 ({uniqueValues.length}건)</span>
            <span>↑↓ 이동 · Enter/클릭 선택</span>
          </div>
          <ul className="autocomplete-dropdown-list">
            {suggestions.map((item, idx) => (
              <li
                key={item}
                className={`autocomplete-dropdown-item ${idx === highlightIndex ? 'highlighted' : ''}`}
                onClick={() => {
                  onChange(item);
                  setIsOpen(false);
                }}
                onMouseEnter={() => setHighlightIndex(idx)}
              >
                <div className="autocomplete-item-left">
                  <Search size={11} className="autocomplete-item-icon" />
                  <span className="autocomplete-item-text">
                    {renderHighlightedText(item, value)}
                  </span>
                </div>
                <span className="autocomplete-item-tag">기존 데이터</span>
              </li>
            ))}
          </ul>
        </div>,
        document.body
      )}
    </div>
  );
};
