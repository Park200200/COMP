import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';
import './IconSelect.css';

export interface IconSelectOption {
  value: string;
  label: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
}

interface IconSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: IconSelectOption[];
  placeholder?: string;
  className?: string;
}

export const IconSelect: React.FC<IconSelectProps> = ({
  value,
  onChange,
  options,
  placeholder = '선택...',
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(opt => opt.value === value);

  // 드롭다운 위치 계산 (모달/스크롤 컨테이너에 의해 잘리지 않도록 포털 렌더링)
  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const desiredHeight = 490;

    // 아래 공간이 240px 미만이고 위 공간이 더 넉넉하면 위로 띄움
    const showAbove = spaceBelow < 260 && spaceAbove > spaceBelow;
    const maxHeight = showAbove ? Math.min(spaceAbove - 16, desiredHeight) : Math.min(spaceBelow - 16, desiredHeight);

    setDropdownPos({
      position: 'fixed',
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      top: showAbove ? 'auto' : `${rect.bottom + 4}px`,
      bottom: showAbove ? `${window.innerHeight - rect.top + 4}px` : 'auto',
      maxHeight: `${Math.max(160, maxHeight)}px`,
      zIndex: 12500, // 모달(10000)보다 훨씬 높아서 절대 잘리지 않음
    });
  }, []);

  useEffect(() => {
    if (isOpen) {
      updatePosition();
      const handleScrollOrResize = () => {
        updatePosition();
      };
      window.addEventListener('resize', handleScrollOrResize);
      window.addEventListener('scroll', handleScrollOrResize, true);
      return () => {
        window.removeEventListener('resize', handleScrollOrResize);
        window.removeEventListener('scroll', handleScrollOrResize, true);
      };
    }
  }, [isOpen, updatePosition]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current && triggerRef.current.contains(target)) return;
      if (dropdownRef.current && dropdownRef.current.contains(target)) return;
      setIsOpen(false);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleSelect = (val: string) => {
    onChange(val);
    setIsOpen(false);
  };

  const SelectedIcon = selectedOption?.icon;

  return (
    <div className={`icon-select-container ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        className={`icon-select-trigger ${isOpen ? 'active' : ''}`}
        onClick={() => {
          if (!isOpen) {
            updatePosition();
          }
          setIsOpen(prev => !prev);
        }}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <div className="icon-select-current">
          {SelectedIcon && <SelectedIcon size={15} className="icon-select-icon" />}
          <span className="icon-select-label">
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        </div>
        <ChevronDown size={14} className={`icon-select-arrow ${isOpen ? 'open' : ''}`} />
      </button>

      {isOpen && typeof document !== 'undefined' && createPortal(
        <div
          ref={dropdownRef}
          className="icon-select-dropdown icon-select-dropdown--portal"
          style={dropdownPos}
          role="listbox"
          onClick={e => e.stopPropagation()}
        >
          {options.map(opt => {
            const IconComp = opt.icon;
            const isSelected = opt.value === value;
            return (
              <div
                key={opt.value}
                role="option"
                aria-selected={isSelected}
                className={`icon-select-option ${isSelected ? 'selected' : ''}`}
                onClick={() => handleSelect(opt.value)}
              >
                <div className="icon-select-option-content">
                  {IconComp && <IconComp size={15} className="icon-select-option-icon" />}
                  <span className="icon-select-option-text">{opt.label}</span>
                </div>
                {isSelected && <Check size={14} className="icon-select-check" />}
              </div>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
};
