import React, { useState, useMemo, useEffect, useRef, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useDataStore } from '../store/useDataStore';
import type { Blueprint, TreeNode, Domain } from '../types';
import { 
  Plus, X, ChevronDown, ChevronUp, Filter, Search, Trash2, Save, 
  Camera, User, ChevronRight, FolderTree, Table, Folder, FolderOpen, FileText, CornerDownRight,
  Link2, AlertTriangle, Check, Settings, Sparkles, Sliders, ArrowUp, ArrowDown,
  Eye, EyeOff, LayoutGrid
} from 'lucide-react';
import { compressImageFile, assembleComposite, parseCompositeValue } from '../utils/formatters';
import { uploadImageToLocal } from '../store/imageStorage';
import { AutocompleteInput } from './AutocompleteInput';
import { ImageUploadInput, isImageField } from './ImageUploadInput';
import { InlineFieldAdderModal } from './InlineFieldAdderModal';
import { ShapeRenderer } from './ShapeRenderer';
import { resolveDomainDataShape, resolveDomainPlacement, DATA_SHAPE_INFO } from '../utils/placement';
import './DomainView.css';

// 寃??議곌굔
interface SearchCondition {
  id: string;
  field: string;
  value: string;
  matchType: 'contains' | 'exact';
  logic: 'AND' | 'OR';
}

const condId = () => Math.random().toString(36).substr(2, 6);

// ?먮룞 ?щ㎎?? ?レ옄留?異붿텧 ???섏씠???쎌엯
const formatPhone = (raw: string): string => {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('02')) {
    if (digits.length <= 2) return digits;
    if (digits.length <= 5) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
    if (digits.length <= 9) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
    return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6, 10)}`;
  }
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  if (digits.length <= 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
};

const formatBizNo = (raw: string): string => {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length <= 3) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5, 10)}`;
};

const formatResidentNo = (raw: string): string => {
  const d = raw.replace(/\D/g, '');
  if (d.length <= 6) return d;
  return `${d.slice(0, 6)}-${d.slice(6, 13)}`;
};

const FORMAT_FN: Record<string, (v: string) => string> = {
  phone: formatPhone,
  bizno: formatBizNo,
  residentno: formatResidentNo,
};

// Blueprint format 설정으로 포맷
const autoFormatByBp = (bp: Blueprint | undefined, value: string): string => {
  if (!bp?.format || bp.format === 'none' || !value) return value;
  const fn = FORMAT_FN[bp.format];
  return fn ? fn(value) : value;
};

// ?몃━ ?좏깮 & ?낅젰 寃몄슜 而댄룷?뚰듃
const TreeSelectInput: React.FC<{
  value: string;
  treeData?: TreeNode[];
  onChange: (val: string) => void;
  placeholder?: string;
}> = ({ value, treeData = [], onChange, placeholder }) => {
  const [open, setOpen] = React.useState(false);
  const [coords, setCoords] = React.useState<{ top?: number; bottom?: number; left: number; width: number }>({ left: 0, width: 220 });
  const ref = React.useRef<HTMLDivElement>(null);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  const updateCoords = React.useCallback(() => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const shouldOpenUp = spaceBelow < 220 && spaceAbove > spaceBelow;
      const width = Math.max(rect.width, 220);
      let left = rect.left;
      if (left + width > window.innerWidth - 12) {
        left = Math.max(12, window.innerWidth - width - 12);
      }
      if (shouldOpenUp) {
        setCoords({ bottom: window.innerHeight - rect.top + 4, left, width });
      } else {
        setCoords({ top: rect.bottom + 4, left, width });
      }
    }
  }, []);

  React.useLayoutEffect(() => {
    if (open) updateCoords();
  }, [open, updateCoords]);

  React.useEffect(() => {
    if (open) {
      updateCoords();
      const handleUpdate = () => updateCoords();
      window.addEventListener('scroll', handleUpdate, true);
      window.addEventListener('resize', handleUpdate);
      return () => {
        window.removeEventListener('scroll', handleUpdate, true);
        window.removeEventListener('resize', handleUpdate);
      };
    }
  }, [open, updateCoords]);

  const handleToggle = () => {
    if (!open) updateCoords();
    setOpen(!open);
  };

  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        ref.current && !ref.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const renderNodes = (nodes: TreeNode[], depth: number = 0): React.ReactNode => {
    return nodes.map(node => {
      const path = getNodePath(treeData, node.id);
      const isSelected = value === path;
      const hasChildren = node.children && node.children.length > 0;
      return (
        <React.Fragment key={node.id}>
          <div
            className={`tree-select-option ${isSelected ? 'selected' : ''}`}
            style={{ paddingLeft: `${depth * 16 + 10}px` }}
            onClick={() => { onChange(path); setOpen(false); }}
          >
            <span className="tree-select-icon">{hasChildren ? '📁' : '📄'}</span>
            <span>{node.label}</span>
          </div>
          {hasChildren && renderNodes(node.children!, depth + 1)}
        </React.Fragment>
      );
    });
  };

  return (
    <div className="tree-select-wrapper" ref={ref}>
      <div className="tree-select-input-box">
        <input
          type="text"
          className="tree-select-text-input"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder || "분류 경로 입력 (예: 분류명 > 하위명을 입력하거나 선택...)"}
        />
        <button
          type="button"
          className="tree-select-toggle-btn"
          onClick={handleToggle}
          title=""
        >
          <ChevronDown size={14} className={`tree-select-arrow ${open ? 'open' : ''}`} />
        </button>
      </div>

      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={dropdownRef}
          className="tree-select-dropdown"
          style={{
            position: 'fixed',
            top: coords.top !== undefined ? `${coords.top}px` : 'auto',
            bottom: coords.bottom !== undefined ? `${coords.bottom}px` : 'auto',
            left: `${coords.left}px`,
            width: `${coords.width}px`,
            minWidth: '220px',
            zIndex: 99999,
          }}
          onMouseDown={e => e.preventDefault()}
        >
          {treeData.length === 0 ? (
            <div className="tree-select-empty">
              <span>아직 등록된 분류 항목이 없습니다.</span>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>
                吏곸젒 <code>?곸쐞 &gt; ?섏쐞</code> ?뺥깭濡??낅젰?섏떆嫄곕굹 ?꾨뱶 愿由ъ뿉???몃━瑜??뺤쓽?섏꽭??
              </div>
            </div>
          ) : (
            <>
              <div
                className={`tree-select-option clear ${!value ? 'selected' : ''}`}
                onClick={() => { onChange(''); setOpen(false); }}
              >
                <span className="tree-select-icon">🚫</span>
                <span>선택 해제</span>
              </div>
              {renderNodes(treeData)}
            </>
          )}
        </div>,
        document.body
      )}
    </div>
  );
};

// 蹂듯빀(議곕┰) ?꾨뱶 ?낅젰 而댄룷?뚰듃: 援ъ꽦 ?뚰듃 ?섎?濡?媛쒕퀎 ?낅젰 ?꾨뱶 + ?먮룞?꾩꽦 諛?以묐났 諛⑹? ?덈궡
interface CompositeInputProps {
  blueprint: Blueprint;
  value: string;
  onChange: (val: string) => void;
  existingCompositeValues?: string[];
  existingPartValuesMap?: Map<string, string[]>;
  autoFocus?: boolean;
  compact?: boolean;
}

const CompositeInput: React.FC<CompositeInputProps> = ({
  blueprint,
  value,
  onChange,
  existingCompositeValues = [],
  existingPartValuesMap,
  autoFocus = false,
  compact = false,
}) => {
  const parts = blueprint.parts || [];
  const display = blueprint.display;

  const [partValues, setPartValues] = useState<Record<string, string>>(() =>
    parseCompositeValue(value, parts, display)
  );
  const [activeDropdownPart, setActiveDropdownPart] = useState<string | null>(null);
  const [highlightIdx, setHighlightIdx] = useState<number>(-1);
  const [partCoords, setPartCoords] = useState<{ top?: number; bottom?: number; left: number; width: number }>({
    left: 0,
    width: 180,
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const partDropdownRef = useRef<HTMLDivElement>(null);
  const activeInputRef = useRef<HTMLInputElement | null>(null);

  const updatePartCoords = useCallback((targetEl?: HTMLElement | null) => {
    const el = targetEl || activeInputRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const shouldOpenUp = spaceBelow < 180 && spaceAbove > spaceBelow;
      const width = Math.max(rect.width, 180);
      let left = rect.left;
      if (left + width > window.innerWidth - 12) {
        left = Math.max(12, window.innerWidth - width - 12);
      }
      if (shouldOpenUp) {
        setPartCoords({ bottom: window.innerHeight - rect.top + 4, left, width });
      } else {
        setPartCoords({ top: rect.bottom + 4, left, width });
      }
    }
  }, []);

  useLayoutEffect(() => {
    if (activeDropdownPart) {
      updatePartCoords();
    }
  }, [activeDropdownPart, updatePartCoords]);

  useEffect(() => {
    if (activeDropdownPart) {
      updatePartCoords();
      const handleUpdate = () => updatePartCoords();
      window.addEventListener('scroll', handleUpdate, true);
      window.addEventListener('resize', handleUpdate);
      return () => {
        window.removeEventListener('scroll', handleUpdate, true);
        window.removeEventListener('resize', handleUpdate);
      };
    }
  }, [activeDropdownPart, updatePartCoords]);

  useEffect(() => {
    const currentAssembled = assembleComposite(parts, display, partValues);
    if (value !== currentAssembled) {
      setPartValues(parseCompositeValue(value, parts, display));
    }
  }, [value, parts, display]);

  // 諛붽묑 ?대┃ ???쒕∼?ㅼ슫 ?リ린
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current && !containerRef.current.contains(target) &&
        partDropdownRef.current && !partDropdownRef.current.contains(target)
      ) {
        setActiveDropdownPart(null);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const handlePartChange = (p: string, pVal: string) => {
    const nextParts = { ...partValues, [p]: pVal };
    setPartValues(nextParts);
    const assembled = assembleComposite(parts, display, nextParts);
    onChange(assembled);
  };

  const handleSelectCombination = (combo: string) => {
    const parsed = parseCompositeValue(combo, parts, display);
    setPartValues(parsed);
    onChange(combo);
    setActiveDropdownPart(null);
  };

  // 怨좎쑀 ?꾩껜 議고빀 紐⑸줉 (?? ['150 x 210', ...])
  const uniqueCombos = useMemo(() => {
    return Array.from(new Set(existingCompositeValues.map(v => v.trim()).filter(Boolean)));
  }, [existingCompositeValues]);

  // ?꾩옱 ?낅젰 ?곹깭??湲곕컲??異붿쿇 議고빀 ?꾪꽣留?
  const matchingCombos = useMemo(() => {
    if (uniqueCombos.length === 0) return [];
    const hasAnyInput = parts.some(p => (partValues[p] || '').trim().length > 0);
    if (!hasAnyInput) {
      return uniqueCombos.slice(0, 6);
    }
    return uniqueCombos.filter(combo => {
      const parsed = parseCompositeValue(combo, parts, display);
      return parts.some(p => {
        const cur = (partValues[p] || '').trim().toLowerCase();
        if (!cur) return false;
        const candidate = (parsed[p] || '').trim().toLowerCase();
        return candidate.includes(cur);
      });
    }).slice(0, 6);
  }, [uniqueCombos, parts, partValues, display]);

  // ?꾩꽦??諛?湲곗〈 ?깅줉 以묐났 ?щ? ?먯젙
  const isAllFilled = parts.length > 0 && parts.every(p => (partValues[p] || '').trim().length > 0);
  const isExistingCombo = isAllFilled && uniqueCombos.some(c => c.toLowerCase() === value.trim().toLowerCase());

  if (parts.length === 0) {
    return (
      <input
        type="text"
        className={compact ? 'crud-inline-input' : 'crud-form-input'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={`${blueprint.name} 입력...`}
        autoFocus={autoFocus}
      />
    );
  }

  // 寃?됱뼱 ?쇱튂 媛뺤“
  const renderMatch = (text: string, query: string) => {
    if (!query.trim()) return text;
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const segs = text.split(regex);
    return segs.map((s, i) =>
      s.toLowerCase() === query.toLowerCase() ? (
        <strong key={i} className="composite-dropdown-highlight">{s}</strong>
      ) : s
    );
  };

  return (
    <div className={`composite-input-container ${compact ? 'compact' : ''}`} ref={containerRef}>
      {/* 媛??뚰듃蹂??낅젰 ?꾨뱶 (?? 媛濡? ?몃줈) */}
      <div className="composite-parts-row">
        {parts.map((p, idx) => {
          const pVal = partValues[p] || '';
          const existingPartVals = Array.from(new Set(existingPartValuesMap?.get(p) || []));
          const pSuggestions = pVal.trim()
            ? existingPartVals.filter(v => v.toLowerCase().includes(pVal.trim().toLowerCase()))
            : existingPartVals.slice(0, 8);
          const hasAnySuggestions = pSuggestions.length > 0 || matchingCombos.length > 0;
          const isDropdownOpen = activeDropdownPart === p && hasAnySuggestions;

          const trimmedPVal = pVal.trim();
          const hasPVal = trimmedPVal.length > 0;
          const isExistingPart = Boolean(hasPVal && existingPartVals.some(v => v.trim().toLowerCase() === trimmedPVal.toLowerCase()));
          const isNewPart = Boolean(hasPVal && !isExistingPart);

          return (
            <div key={p} className={`composite-part-col ${isExistingPart ? 'is-existing' : isNewPart ? 'is-new' : ''}`}>
              <span className="composite-part-tag">{p}</span>
              <div className="composite-part-input-wrap">
                <input
                  type="text"
                  value={pVal}
                  onChange={e => {
                    handlePartChange(p, e.target.value);
                    activeInputRef.current = e.currentTarget;
                    updatePartCoords(e.currentTarget);
                    setActiveDropdownPart(p);
                    setHighlightIdx(-1);
                  }}
                  onFocus={e => {
                    activeInputRef.current = e.currentTarget;
                    updatePartCoords(e.currentTarget);
                    setActiveDropdownPart(p);
                    setHighlightIdx(-1);
                  }}
                  onKeyDown={e => {
                    if (e.key === 'ArrowDown') {
                      if (!isDropdownOpen) setActiveDropdownPart(p);
                      else if (pSuggestions.length > 0) setHighlightIdx(prev => (prev + 1) % pSuggestions.length);
                      e.preventDefault();
                    } else if (e.key === 'ArrowUp') {
                      if (isDropdownOpen && pSuggestions.length > 0) {
                        setHighlightIdx(prev => (prev - 1 + pSuggestions.length) % pSuggestions.length);
                      }
                      e.preventDefault();
                    } else if (e.key === 'Enter') {
                      if (isDropdownOpen && highlightIdx >= 0 && pSuggestions[highlightIdx]) {
                        e.preventDefault();
                        handlePartChange(p, pSuggestions[highlightIdx]);
                        setActiveDropdownPart(null);
                      }
                    } else if (e.key === 'Escape') {
                      setActiveDropdownPart(null);
                    }
                  }}
                  placeholder={p}
                  autoFocus={autoFocus && idx === 0}
                  className={`composite-part-field-input ${isExistingPart ? 'is-existing' : isNewPart ? 'is-new' : ''}`}
                />
                {isExistingPart && (
                  <span 
                    className="composite-part-status-icon existing animate-fade-in" 
                    title="저장"
                  >
                    <Check size={11} />
                  </span>
                )}
                {isNewPart && (
                  <span 
                    className="composite-part-status-icon new animate-fade-in" 
                    title=""
                  >
                    <Sparkles size={11} />
                  </span>
                )}

                {/* ?뚰듃蹂??먮룞?꾩꽦 ?쒕∼?ㅼ슫 (?ы꽭 ?앹뾽: ?깅줉???꾩껜 ?ъ씠利?議고빀 + ?뚰듃蹂?異붿쿇) */}
                {isDropdownOpen && typeof document !== 'undefined' && createPortal(
                  <div
                    ref={partDropdownRef}
                    className="composite-part-dropdown animate-scale-in"
                    style={{
                      position: 'fixed',
                      top: partCoords.top !== undefined ? `${partCoords.top}px` : 'auto',
                      bottom: partCoords.bottom !== undefined ? `${partCoords.bottom}px` : 'auto',
                      left: `${partCoords.left}px`,
                      width: `${partCoords.width}px`,
                      minWidth: '200px',
                      maxWidth: '320px',
                      zIndex: 99999,
                    }}
                    onMouseDown={e => e.preventDefault()}
                  >
                    {/* 1. ?깅줉???꾩꽦 ?ъ씠利?議고빀 ?뱀뀡 (?낅젰 ???앹뾽?쇰줈留??쒓났) */}
                    {matchingCombos.length > 0 && (
                      <div className="composite-combo-section">
                        <div className="composite-part-dropdown-header combo">
                          <span>?뮕 ?깅줉??{blueprint.name}</span>
                          <span>({matchingCombos.length}건)</span>
                        </div>
                        <ul className="composite-part-dropdown-list combo">
                          {matchingCombos.map(combo => (
                            <li
                              key={combo}
                              className={`composite-part-dropdown-item combo ${combo === value ? 'selected' : ''}`}
                              onClick={() => {
                                handleSelectCombination(combo);
                                setActiveDropdownPart(null);
                              }}
                              title="저장"
                            >
                              <Check size={11} className="composite-part-item-icon combo" />
                              <span className="composite-part-item-text combo">{combo}</span>
                              <span className="composite-combo-badge">완성됨</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* 2. ?대떦 ?뚰듃 ?⑥씪 媛?異붿쿇 ?뱀뀡 */}
                    {pSuggestions.length > 0 && (
                      <div className="composite-part-section">
                        <div className="composite-part-dropdown-header">
                          <span>기존 {p} 데이터</span>
                          <span>({pSuggestions.length})</span>
                        </div>
                        <ul className="composite-part-dropdown-list">
                          {pSuggestions.map((item, sIdx) => (
                            <li
                              key={item}
                              className={`composite-part-dropdown-item ${sIdx === highlightIdx ? 'highlighted' : ''}`}
                              onClick={() => {
                                handlePartChange(p, item);
                                setActiveDropdownPart(null);
                              }}
                              onMouseEnter={() => setHighlightIdx(sIdx)}
                            >
                              <Search size={11} className="composite-part-item-icon" />
                              <span className="composite-part-item-text">{renderMatch(item, pVal)}</span>
                              {item === pVal && <span className="composite-part-exact-tag">?쇱튂</span>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>,
                  document.body
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ?ㅼ떆媛??곹깭 ?쒖떆: 湲곗〈 ?ъ궗??vs ?좉퇋 ?깅줉 */}
      {!compact && (
        <div className="composite-status-row">
          <div className="composite-preview-pill">
            <span className="composite-preview-label">복합값 결과:</span>
            <strong className="composite-preview-val">{value || '(입력 대기)'}</strong>
          </div>

          {isAllFilled && (
            isExistingCombo ? (
              <div className="composite-status-badge existing animate-fade-in" title="저장">
                <Check size={12} className="composite-badge-icon" />
                <span>기존 등록된 이미지와 유사함(중복 방지)</span>
              </div>
            ) : (
              <div className="composite-status-badge new animate-fade-in" title="저장">
                <span className="composite-badge-icon">+</span>
                <span>새로운 이미지 규격으로 추가</span>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
};

// 트리 노드 ID로 경로 문자열 구하기
const getNodePath = (nodes: TreeNode[], targetId: string, prefix: string = ''): string => {
  for (const node of nodes) {
    const path = prefix ? `${prefix} > ${node.label}` : node.label;
    if (node.id === targetId) return path;
    if (node.children && node.children.length > 0) {
      const found = getNodePath(node.children, targetId, path);
      if (found) return found;
    }
  }
  return '';
};

// ===== ?숈쟻 ?몃━ 議곗옉 ?ы띁 ?⑥닔 =====
const genTreeId = () => `tn-${Math.random().toString(36).substr(2, 9)}`;

// ?몃뱶 異붽? (猷⑦듃 ?먮뒗 ?뱀젙 부紐??섏쐞)
const insertTreeNode = (nodes: TreeNode[], parentId: string | null, label: string): TreeNode[] => {
  const newNode: TreeNode = { id: genTreeId(), label: label.trim(), children: [] };
  if (!parentId) return [...nodes, newNode];
  return nodes.map(n => {
    if (n.id === parentId) {
      return { ...n, children: [...(n.children || []), newNode] };
    }
    if (n.children && n.children.length > 0) {
      return { ...n, children: insertTreeNode(n.children, parentId, label) };
    }
    return n;
  });
};

// ?몃뱶 ?대쫫 蹂寃?諛??댁쟾 寃쎈줈 -> ??寃쎈줈 諛섑솚
const updateTreeNodeLabel = (
  nodes: TreeNode[], 
  targetId: string, 
  newLabel: string, 
  prefix: string = ''
): { updatedNodes: TreeNode[]; oldPath: string; newPath: string } => {
  let oldPath = '';
  let newPath = '';

  const recurse = (list: TreeNode[], currentPrefix: string): TreeNode[] => {
    return list.map(n => {
      const curOldPath = currentPrefix ? `${currentPrefix} > ${n.label}` : n.label;
      if (n.id === targetId) {
        oldPath = curOldPath;
        newPath = currentPrefix ? `${currentPrefix} > ${newLabel.trim()}` : newLabel.trim();
        return { ...n, label: newLabel.trim() };
      }
      if (n.children && n.children.length > 0) {
        return { ...n, children: recurse(n.children, curOldPath) };
      }
      return n;
    });
  };

  const updatedNodes = recurse(nodes, prefix);
  return { updatedNodes, oldPath, newPath };
};

// 노드 삭제 諛???젣??寃쎈줈 紐⑸줉 諛섑솚
const deleteTreeNode = (
  nodes: TreeNode[], 
  targetId: string,
  prefix: string = ''
): { updatedNodes: TreeNode[]; deletedPaths: string[] } => {
  const deletedPaths: string[] = [];

  const collectPaths = (n: TreeNode, currentPrefix: string) => {
    const p = currentPrefix ? `${currentPrefix} > ${n.label}` : n.label;
    deletedPaths.push(p);
    n.children?.forEach(c => collectPaths(c, p));
  };

  const recurse = (list: TreeNode[], currentPrefix: string): TreeNode[] => {
    return list
      .filter(n => {
        if (n.id === targetId) {
          collectPaths(n, currentPrefix);
          return false;
        }
        return true;
      })
      .map(n => {
        const curPath = currentPrefix ? `${currentPrefix} > ${n.label}` : n.label;
        if (n.children && n.children.length > 0) {
          return { ...n, children: recurse(n.children, curPath) };
        }
        return n;
      });
  };

  const updatedNodes = recurse(nodes, prefix);
  return { updatedNodes, deletedPaths };
};

// ?몃뱶???꾨찓??留곹겕 ?ㅼ젙 / ?댁젣
const updateTreeNodeLink = (
  nodes: TreeNode[],
  targetId: string,
  linkedDomainId: string | undefined
): TreeNode[] => {
  return nodes.map(n => {
    if (n.id === targetId) {
      return { ...n, linkedDomainId };
    }
    if (n.children && n.children.length > 0) {
      return { ...n, children: updateTreeNodeLink(n.children, targetId, linkedDomainId) };
    }
    return n;
  });
};

// ?몃뱶 ?꾩껜 ?띿꽦 ?섏젙 諛?寃쎈줈 蹂寃?異붿쟻
const updateTreeNodeProps = (
  nodes: TreeNode[],
  targetId: string,
  updates: Partial<TreeNode>,
  prefix: string = ''
): { updatedNodes: TreeNode[]; oldPath: string; newPath: string } => {
  let oldPath = '';
  let newPath = '';

  const recurse = (list: TreeNode[], currentPrefix: string): TreeNode[] => {
    return list.map(n => {
      const curOldPath = currentPrefix ? `${currentPrefix} > ${n.label}` : n.label;
      if (n.id === targetId) {
        oldPath = curOldPath;
        const finalLabel = updates.label !== undefined ? updates.label.trim() : n.label;
        newPath = currentPrefix ? `${currentPrefix} > ${finalLabel}` : finalLabel;
        return {
          ...n,
          ...updates,
          label: finalLabel,
        };
      }
      if (n.children && n.children.length > 0) {
        return { ...n, children: recurse(n.children, curOldPath) };
      }
      return n;
    });
  };

  const updatedNodes = recurse(nodes, prefix);
  return { updatedNodes, oldPath, newPath };
};

// ?몃뱶 ?쒖꽌 ???꾨옒 ?대룞
const moveTreeNode = (
  nodes: TreeNode[],
  targetId: string,
  direction: 'up' | 'down'
): TreeNode[] => {
  const idx = nodes.findIndex(n => n.id === targetId);
  if (idx !== -1) {
    if (direction === 'up' && idx > 0) {
      const copy = [...nodes];
      const temp = copy[idx - 1];
      copy[idx - 1] = copy[idx];
      copy[idx] = temp;
      return copy;
    }
    if (direction === 'down' && idx < nodes.length - 1) {
      const copy = [...nodes];
      const temp = copy[idx + 1];
      copy[idx + 1] = copy[idx];
      copy[idx] = temp;
      return copy;
    }
    return nodes;
  }

  return nodes.map(n => {
    if (n.children && n.children.length > 0) {
      return { ...n, children: moveTreeNode(n.children, targetId, direction) };
    }
    return n;
  });
};

// ID瑜??듯빐 ?몃뱶 李얘린
const findNodeById = (nodes: TreeNode[], targetId: string): TreeNode | null => {
  for (const n of nodes) {
    if (n.id === targetId) return n;
    if (n.children && n.children.length > 0) {
      const found = findNodeById(n.children, targetId);
      if (found) return found;
    }
  }
  return null;
};

// 寃쎈줈瑜??듯빐 ?몃뱶 李얘린
const findNodeByPath = (nodes: TreeNode[], targetPath: string, currentPrefix: string = ''): TreeNode | null => {
  for (const n of nodes) {
    const full = currentPrefix ? `${currentPrefix} > ${n.label}` : n.label;
    if (full === targetPath) return n;
    if (n.children && n.children.length > 0) {
      const found = findNodeByPath(n.children, targetPath, full);
      if (found) return found;
    }
  }
  return null;
};

export const DomainView: React.FC = () => {
  const { 
    domains, activeDomain, setActiveDomainById, 
    getFieldsForDomain, getAtomsForDomain, getAllPersonData,
    addEntityToDomain, updateEntityField, removeEntityFromDomain, deduplicateDomain,
    blueprints, updateDomain, updateBlueprint, allAtoms
  } = useDataStore();

  const [conditions, setConditions] = useState<SearchCondition[]>([]);
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [isAllMode, setIsAllMode] = useState(false);
  const [quickSearch, setQuickSearch] = useState('');

  // 뷰 모드: 테이블 뷰 vs 계층 트리 뷰 vs 자동 형태(Shape) 뷰
  const [viewMode, setViewMode] = useState<'table' | 'tree' | 'shape'>('table');
  const [collapsedTreeNodes, setCollapsedTreeNodes] = useState<Record<string, boolean>>({});

  // ?숈쟻 ?몃━ 議곗옉 諛??몃뱶 ?좏깮 ?곹깭
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const [selectedNodePath, setSelectedNodePath] = useState<string>('전체');
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editingNodeLabel, setEditingNodeLabel] = useState<string>('');
  const [addingChildParentId, setAddingChildParentId] = useState<string | null>(null);
  const [newChildLabel, setNewChildLabel] = useState<string>('');
  const [showAddRootInput, setShowAddRootInput] = useState<boolean>(false);
  const [newRootLabel, setNewRootLabel] = useState<string>('');
  const [linkingNodeId, setLinkingNodeId] = useState<string | null>(null);

  // ?몃━ ?몃뱶 ?ㅼ젙 硫붾돱 諛??띿꽦 紐⑤떖 ?곹깭
  const [nodeContextMenu, setNodeContextMenu] = useState<{ nodeId: string; x: number; y: number } | null>(null);
  const [propsModalNode, setPropsModalNode] = useState<TreeNode | null>(null);
  const [nodePropsForm, setNodePropsForm] = useState<{
    label: string;
    code: string;
    description: string;
    icon: string;
    color: string;
    linkedDomainId: string;
  }>({ label: '', code: '', description: '', icon: '📁', color: '#3b82f6', linkedDomainId: '' });

  // CRUD ?곹깭
  const [showAddForm, setShowAddForm] = useState(false);
  const [addFormData, setAddFormData] = useState<Record<string, string>>({});
  const [editingRow, setEditingRow] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<Record<string, string>>({});
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [inlineFieldAdderTarget, setInlineFieldAdderTarget] = useState<{
    anchorId: string;
    entityName?: string;
    row: any;
  } | null>(null);

  // ?곌껐 ?꾨찓???몃씪새 데이터 추가 ???곹깭
  const [showLinkedAddForm, setShowLinkedAddForm] = useState(false);
  const [linkedAddFormData, setLinkedAddFormData] = useState<Record<string, string>>({});
  // ?곗씠??異붽? ????媛먯땄 ??ぉ ?묓옒/?쇱묠 ?곹깭
  const [showLinkedAddHiddenFields, setShowLinkedAddHiddenFields] = useState(false);

  // 援ъ꽦?붿냼(?꾨뱶) ?ㅼ젙 紐⑤떖 ?앹뾽 ?곹깭
  const [showFieldConfigModal, setShowFieldConfigModal] = useState(false);

  // 援ъ꽦?붿냼(?꾨뱶: ?곕?, ?쒕?, ?대?吏?ъ씠利???蹂??ъ슜?щ?('??|'비사용') 諛?蹂닿린/감추기'보기'|'감추기') ?곹깭
  const [constituentFieldStatusMap, setConstituentFieldStatusMap] = useState<Record<string, { useStatus?: '용' | '비사용'; visibility?: '보기' | '감추기' }>>(() => {
    try {
      return JSON.parse(localStorage.getItem('COMP_v3_constituent_field_config') || '{}');
    } catch {
      return {};
    }
  });

  // 援ъ꽦?붿냼 ?곹깭 議고쉶 ?ы띁
  const getConstituentFieldConfig = useCallback((domainId: string, fieldName: string, nodeId?: string): { useStatus: '용' | '비사용'; visibility: '보기' | '감추기' } => {
    if (nodeId) {
      const nodeKey = `${domainId}_${nodeId}_${fieldName}`;
      if (constituentFieldStatusMap[nodeKey]) {
        return {
          useStatus: constituentFieldStatusMap[nodeKey].useStatus || '용',
          visibility: constituentFieldStatusMap[nodeKey].visibility || '보기',
        };
      }
    }
    const domKey = `${domainId}_${fieldName}`;
    if (constituentFieldStatusMap[domKey]) {
      return {
        useStatus: constituentFieldStatusMap[domKey].useStatus || '용',
        visibility: constituentFieldStatusMap[domKey].visibility || '보기',
      };
    }
    return { useStatus: '용', visibility: '보기' };
  }, [constituentFieldStatusMap]);

  // 援ъ꽦?붿냼 ?곹깭 ?낅뜲?댄듃 ?ы띁
  const handleUpdateConstituentFieldStatus = useCallback((
    domainId: string, 
    fieldName: string, 
    updates: { useStatus?: '용' | '비사용'; visibility?: '보기' | '감추기' }, 
    nodeId?: string
  ) => {
    setConstituentFieldStatusMap(prev => {
      const domKey = `${domainId}_${fieldName}`;
      const curDom = prev[domKey] || {};
      const next: Record<string, { useStatus?: '용' | '비사용'; visibility?: '보기' | '감추기' }> = {
        ...prev,
        [domKey]: { ...curDom, ...updates },
      };
      if (nodeId) {
        const nodeKey = `${domainId}_${nodeId}_${fieldName}`;
        const curNode = prev[nodeKey] || {};
        next[nodeKey] = { ...curNode, ...updates };
      }
      try {
        localStorage.setItem('COMP_v3_constituent_field_config', JSON.stringify(next));
      } catch (e) {
        console.error(e);
      }
      return next;
    });
  }, []);

  // ?곌껐 ?꾨찓?????붾툝?대┃ ?곸꽭 ?쇱묠 ?곹깭 (anchorId Set)
  const [expandedLinkedRows, setExpandedLinkedRows] = useState<Set<string>>(new Set());

  const handleToggleExpandLinkedRow = useCallback((anchorId: string) => {
    setExpandedLinkedRows(prev => {
      const next = new Set(prev);
      if (next.has(anchorId)) {
        next.delete(anchorId);
      } else {
        next.add(anchorId);
      }
      return next;
    });
  }, []);

  // 프로필 이미지 ?쇱씠?몃컯???앹뾽 ?곹깭
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);
  const [lightboxAnchorId, setLightboxAnchorId] = useState<string | null>(null);
  const [lightboxFieldKey, setLightboxFieldKey] = useState<string | null>(null);

  // 프로필 이미지 異붿텧 ?ы띁 (?ъ쭊/?꾨줈???대?吏 ?꾨뱶 ?먮뒗 image ????꾨뱶 ?먯깋)
  const getProfileImage = (rowData: Record<string, string>) => {
    const directKeys = ['사진', '프로필', '프로필사진', '얼굴', '이미지', 'photo', 'image'];
    for (const key of directKeys) {
      if (rowData[key]) return { key, url: rowData[key] };
    }
    const imageBp = blueprints.find(b => b.inputType === 'image');
    if (imageBp && rowData[imageBp.name]) {
      return { key: imageBp.name, url: rowData[imageBp.name] };
    }
    for (const [k, v] of Object.entries(rowData)) {
      if (typeof v === 'string' && (v.startsWith('data:image/') || v.startsWith('/local-images/'))) {
        return { key: k, url: v };
      }
    }
    return null;
  };

  // ?꾨찓???곗씠???먮뒗 ?꾩껜 ?곗씠??
  const domainData = useMemo(() => {
    if (isAllMode) return getAllPersonData();
    if (!activeDomain) return [];
    return getAtomsForDomain(activeDomain.id);
  }, [activeDomain, isAllMode, getAtomsForDomain, getAllPersonData]);

  // composite ?뚰듃 ?꾨뱶 ?대쫫 (?④만 ???
  const compositePartNames = useMemo(() => {
    const parts = new Set<string>();
    blueprints.filter(b => b.inputType === 'composite' && b.parts).forEach(b => {
      b.parts!.forEach(p => parts.add(p));
    });
    return parts;
  }, [blueprints]);

  // ?꾩껜 ?꾨뱶 紐⑸줉 (composite ?뚰듃 ?④?)
  const allFields = useMemo(() => {
    if (isAllMode) {
      const fieldSet = new Set<string>();
      domainData.forEach(d => Object.keys(d.data).forEach(k => fieldSet.add(k)));
      compositePartNames.forEach(p => fieldSet.delete(p));
      fieldSet.delete('이름');
      const arr = Array.from(fieldSet);
      const bp = (name: string) => blueprints.find(b => b.name === name);
      const nameBp: Blueprint = blueprints.find(b => b.name === '이름') || { id: 'auto-이름', name: '이름', synonyms: [], description: '', inputType: 'text' as const, displayWidth: 'half' as const, createdAt: 0 };
      const rest = arr
        .sort((a, b) => a.localeCompare(b))
        .map(name => bp(name) || { id: `auto-${name}`, name, synonyms: [], description: '', inputType: 'text' as const, displayWidth: 'half' as const, createdAt: 0 });
      return [nameBp, ...rest];
    }
    if (!activeDomain) return [];
    return getFieldsForDomain(activeDomain.id).filter(f => !compositePartNames.has(f.name));
  }, [activeDomain, isAllMode, domainData, getFieldsForDomain, blueprints, compositePartNames]);

  // 洹몃━???뚯씠釉?而щ읆) vs ?곸꽭(?쇱묠) 遺꾨━
  const fields = useMemo(() => {
    let list = allFields;
    if (!isAllMode && activeDomain?.gridFields && activeDomain.gridFields.length > 0) {
      list = allFields.filter(f => activeDomain.gridFields!.includes(f.name));
    }
    // '?대쫫' ?꾨뱶媛 而щ읆???덇퀬' '?ъ쭊' ?꾨뱶媛 ?덉쑝硫? '?ъ쭊'? ?대쫫 ???꾨줈???꾨컮?濡??쇱껜?붾릺誘濡?蹂꾨룄 而щ읆 ?④?
    const hasNameCol = list.some(f => f.name === '이름');
    if (hasNameCol) {
      return list.filter(f => f.name !== '프로필이미지');
    }
    return list;
  }, [allFields, activeDomain, isAllMode]);

  const detailFields = useMemo(() => {
    if (isAllMode || !activeDomain?.gridFields || activeDomain.gridFields.length === 0) return [];
    return allFields.filter(f => !activeDomain.gridFields!.includes(f.name));
  }, [allFields, activeDomain, isAllMode]);

  // ?꾩옱 ?꾨찓?몄뿉 ?꾩쭅 異붽??섏? ?딆? ?꾩껜 Blueprint ?꾨뱶??(鍮좊Ⅸ 異붽? 移⑹슜)
  const availableBlueprints = useMemo(() => {
    if (!activeDomain || isAllMode) return [];
    return blueprints.filter(b => 
      !activeDomain.fields.includes(b.name) &&
      !compositePartNames.has(b.name)
    );
  }, [activeDomain, blueprints, isAllMode, compositePartNames]);

  // ?꾨찓?몄뿉 ?꾨뱶 利됱떆 異붽? ?몃뱾??
  const handleQuickAddField = (fieldName: string) => {
    if (!activeDomain) return;
    const bp = blueprints.find(b => b.name === fieldName);
    const newFields = [...activeDomain.fields, fieldName];
    updateDomain(activeDomain.id, { 
      fields: newFields,
      gridFields: activeDomain.gridFields ? [...activeDomain.gridFields, fieldName] : newFields 
    });
    // ?몃━ ?띿꽦 ?꾨뱶瑜?異붽???寃쎌슦 ?먮룞?쇰줈 ?몃━ 酉?紐⑤뱶濡??꾪솚?섏뿬 醫뚯륫 ?몃━瑜??쒖떆
    if (bp && bp.inputType === 'tree') {
      setViewMode('tree');
    }
  };

  // 寃???꾪꽣 ?곸슜 (AND/OR + ?ы븿/?쇱튂)
  const filteredData = useMemo(() => {
    let data = [...domainData];

    // 1. ?듯빀 寃??(?묐갑???ы븿 寃?? ?곗씠?겸뒊寃?됱뼱 OR 寃?됱뼱?뉖뜲?댄꽣)
    if (quickSearch.trim()) {
      const q = quickSearch.toLowerCase().trim();
      data = data.filter(row =>
        Object.values(row.data).some(v => {
          const lv = v.toLowerCase();
          return lv.includes(q) || q.includes(lv);
        })
      );
    }
    
    // 2. ?몃? 議곌굔 ?꾪꽣
    const activeConditions = conditions.filter(c => c.field && c.value.trim());
    if (activeConditions.length === 0) return applySort(data);

    // 議곌굔 留ㅼ묶 ?⑥닔
    const matchRow = (row: { data: Record<string, string> }, cond: SearchCondition) => {
      const val = (row.data[cond.field] || '').toLowerCase();
      const query = cond.value.toLowerCase().trim();
      if (cond.matchType === 'exact') {
        return val === query;
      }
      return val.includes(query);
    };

    // AND/OR 洹몃９ 泥섎━
    // (A AND B OR C AND D) = (A AND B) OR (C AND D)
    // OR濡?援щ텇??AND 洹몃９??留뚮뱺??
    const groups: SearchCondition[][] = [[]];
    activeConditions.forEach((cond, idx) => {
      if (idx > 0 && cond.logic === 'OR') {
        groups.push([]);
      }
      groups[groups.length - 1].push(cond);
    });

    data = data.filter(row => {
      // ?섎굹 ?댁긽??AND 洹몃９??留뚯”?섎㈃ ?ы븿 (OR)
      return groups.some(group => 
        // 洹몃９ ??紐⑤뱺 議곌굔??留뚯”?댁빞 ??(AND)
        group.every(cond => matchRow(row, cond))
      );
    });

    return applySort(data);
  }, [domainData, conditions, quickSearch, sortField, sortAsc]);

  function applySort(data: { anchorId: string; data: Record<string, string> }[]) {
    if (sortField) {
      data.sort((a, b) => {
        const va = a.data[sortField] || '';
        const vb = b.data[sortField] || '';
        return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
      });
    }
    return data;
  }

  const handleSort = (fieldName: string) => {
    if (sortField === fieldName) setSortAsc(!sortAsc);
    else { setSortField(fieldName); setSortAsc(true); }
  };

  // ?꾩옱 ?꾨찓?몄뿉 ?곸슜???몃━ ?띿꽦 ?꾨뱶 ?먯깋 (useTree媛 true?닿굅??inputType === 'tree' ?꾨뱶媛 ?덉쓣 ??
  const treeField = useMemo(() => {
    if (!activeDomain) {
      if (isAllMode) {
        return allFields.find(f => f.inputType === 'tree') || null;
      }
      return null;
    }
    // 1) ?꾨찓?몄쓽 ?ㅼ젣 ?꾨뱶(allFields) 以?tree ????꾨뱶 ?먯깋
    const foundInFields = allFields.find(f => f.inputType === 'tree');
    if (foundInFields) return foundInFields;

    // 2) activeDomain.useTree媛 true??寃쎌슦, ?꾩껜 blueprints 以?tree ????꾨뱶瑜??곌껐
    if (activeDomain.useTree) {
      return blueprints.find(b => b.inputType === 'tree') || null;
    }

    return null;
  }, [allFields, activeDomain, isAllMode, blueprints]);

  // ?꾨찓?몄씠 ?몃━ ?띿꽦???ы븿?섍퀬 ?덈뒗吏 ?щ? (?꾨찓?몄뿉 useTree媛 泥댄겕?섏뿀嫄곕굹 ?몃━ ?꾨뱶媛 ?덈뒗 寃쎌슦)
  const hasTreeProperty = Boolean(activeDomain ? (activeDomain.useTree || treeField) : (isAllMode && treeField));

  // ?꾨찓?몄뿉 ?몃━ ?띿꽦???녿뒗 寃쎌슦(紐낇븿, ?숈갹, 紐⑥엫, ?뚯궗 ?? ?먮룞?쇰줈 ?뚯씠釉?酉곕줈 ?꾪솚
  useEffect(() => {
    if (!hasTreeProperty) {
      setViewMode('table');
    }
  }, [hasTreeProperty, activeDomain]);

  // (comment)
  useEffect(() => {
    setShowLinkedAddForm(false);
    setShowLinkedAddHiddenFields(false);
    setLinkedAddFormData({});
    setEditingRow(null);
    setEditFormData({});
    setDeleteConfirm(null);
  }, [selectedNodePath]);

  // 留덉뒪???몃━ ?곗씠??(Blueprint???곴뎄 ??λ맂 怨꾩링 ?몃뱶)
  const masterTreeData = useMemo(() => {
    return treeField?.treeData || [];
  }, [treeField]);

  // 寃쎈줈蹂??곌껐 ?곗씠??媛쒖닔 留?(?ㅼ떆媛?吏묎퀎)
  const pathDataCountMap = useMemo(() => {
    const map = new Map<string, number>();
    if (!treeField) return map;

    let unassignedCount = 0;
    filteredData.forEach(row => {
      const val = (row.data[treeField.name] || '').trim();
      if (!val) {
        unassignedCount++;
      } else {
        const parts = val.split('>').map(s => s.trim()).filter(Boolean);
        let acc = '';
        parts.forEach(part => {
          acc = acc ? `${acc} > ${part}` : part;
          map.set(acc, (map.get(acc) || 0) + 1);
        });
      }
    });

    map.set('(미분류)', unassignedCount);
    map.set('?꾩껜', filteredData.length);
    return map;
  }, [filteredData, treeField]);

  // ?곗륫???쒖떆???좏깮???몃━ ?몃뱶???곌껐 ?곗씠??紐⑸줉
  const rightListData = useMemo(() => {
    if (!treeField) return filteredData;

    if (selectedNodePath === '(미분류)') {
      return filteredData;
    }
    if (selectedNodePath === '(미분류)') {
      return filteredData.filter(row => !row.data[treeField.name] || row.data[treeField.name].trim() === '');
    }
    // ?좏깮??寃쎈줈? ?쇱튂?섍굅???섏쐞 寃쎈줈???랁븯???곗씠??
    return filteredData.filter(row => {
      const val = (row.data[treeField.name] || '').trim();
      return val === selectedNodePath || val.startsWith(selectedNodePath + ' > ');
    });
  }, [filteredData, treeField, selectedNodePath]);

  // 媛??꾨뱶蹂?湲곗〈 ??λ맂 怨좎쑀 媛?紐⑸줉 異붿텧 (?먮룞?꾩꽦 異붿쿇??
  const fieldExistingValuesMap = useMemo(() => {
    const map = new Map<string, string[]>();
    fields.forEach(f => {
      const vals = new Set<string>();
      // ?꾩옱 ?꾨찓???곗씠?곗뿉???섏쭛
      domainData.forEach(row => {
        const v = row.data[f.name];
        if (v && v.trim()) vals.add(v.trim());
      });
      // ?꾩껜 atoms?먯꽌???대떦 ??낆쓽 媛??섏쭛 (湲濡쒕쾶 ?먮룞?꾩꽦 蹂닿컯)
      allAtoms.filter(a => !a.deletedAt && !a.from && !a.to && a.type === f.name && a.value && a.value.trim()).forEach(a => {
        vals.add(a.value!.trim());
      });
      map.set(f.name, Array.from(vals));
    });
    return map;
  }, [fields, domainData, allAtoms]);

  // composite ?뚰듃蹂?怨좎쑀 媛?留?(?? '媛濡? -> ['150', '200'], '?몃줈' -> ['210', '300'])
  const partExistingValuesMap = useMemo(() => {
    const map = new Map<string, string[]>();
    const partNames = new Set<string>();
    blueprints.filter(b => b.inputType === 'composite' && b.parts).forEach(b => {
      b.parts!.forEach(p => partNames.add(p));
    });

    partNames.forEach(pName => {
      const vals = new Set<string>();
      // 1. domainData?먯꽌 吏곸젒 ?대떦 ?뚰듃紐??ㅻ줈 ?섏쭛
      domainData.forEach(row => {
        const v = row.data[pName];
        if (v && v.trim()) vals.add(v.trim());
      });
      // 2. ?꾩껜 atoms?먯꽌 ?대떦 ?뚰듃 ??낆쓽 ??atom ?섏쭛
      allAtoms.filter(a => !a.deletedAt && !a.from && !a.to && a.type === pName && a.value && a.value.trim()).forEach(a => {
        vals.add(a.value!.trim());
      });
      // 3. composite blueprint??議곕┰??臾몄옄?댁뿉????뙆?깊븯???뚰듃 媛?異붿텧
      blueprints.filter(b => b.inputType === 'composite' && b.parts?.includes(pName)).forEach(b => {
        domainData.forEach(row => {
          const compVal = row.data[b.name];
          if (compVal) {
            const parsed = parseCompositeValue(compVal, b.parts!, b.display);
            if (parsed[pName] && parsed[pName].trim()) vals.add(parsed[pName].trim());
          }
        });
        allAtoms.filter(a => !a.deletedAt && !a.from && !a.to && a.type === b.name && a.value && a.value.trim()).forEach(a => {
          const parsed = parseCompositeValue(a.value!, b.parts!, b.display);
          if (parsed[pName] && parsed[pName].trim()) vals.add(parsed[pName].trim());
        });
      });
      map.set(pName, Array.from(vals));
    });
    return map;
  }, [blueprints, domainData, allAtoms]);

  // 異붽? ?쇱뿉 ?낅젰???곗씠?곌? ?대? 議댁옱?섎뒗吏 ?ㅼ떆媛?以묐났 媛먯?
  const isFormDuplicate = useMemo(() => {
    if (!activeDomain) return false;
    const filledEntries = Object.entries(addFormData).filter(([_, v]) => v && v.trim());
    if (filledEntries.length === 0) return false;

    let anchorType = (activeDomain.anchor && activeDomain.fields.includes(activeDomain.anchor))
      ? activeDomain.anchor
      : (activeDomain.fields[0] || activeDomain.anchor || '?대쫫');

    const anchorVal = (addFormData[anchorType] || '').trim().toLowerCase();
    if (!anchorVal) return false;

    return domainData.some(row => {
      const rowAnchor = (row.data[anchorType] || '').trim().toLowerCase();
      if (rowAnchor !== anchorVal) return false;
      if (filledEntries.length <= 1) return true;
      return filledEntries.every(([k, v]) => (row.data[k] || '').trim().toLowerCase() === v.trim().toLowerCase());
    });
  }, [activeDomain, addFormData, domainData]);

  // ?꾩옱 ?꾨찓???곗씠???댁쓽 중복 데이터 ??媛먯?
  const duplicateCount = useMemo(() => {
    if (!activeDomain || domainData.length <= 1) return 0;
    let anchorType = (activeDomain.anchor && activeDomain.fields.includes(activeDomain.anchor))
      ? activeDomain.anchor
      : (activeDomain.fields[0] || activeDomain.anchor || '?대쫫');

    const seen = new Set<string>();
    let dupes = 0;
    domainData.forEach(row => {
      const anchorVal = (row.data[anchorType] || '').trim().toLowerCase();
      if (!anchorVal) return;

      const otherFieldsKey = Object.keys(row.data)
        .filter(k => k !== anchorType && row.data[k]?.trim())
        .sort()
        .map(k => `${k}:${row.data[k].trim().toLowerCase()}`)
        .join('|');

      const contentKey = `${anchorVal}__${otherFieldsKey}`;
      if (seen.has(contentKey)) {
        dupes++;
      } else {
        seen.add(contentKey);
      }
    });
    return dupes;
  }, [activeDomain, domainData]);

  // ===== ?숈쟻 ?몃━ ?몃뱶 CRUD ?몃뱾??=====

  // 1. 猷⑦듃 ?몃뱶 異붽?
  const handleAddRootNode = () => {
    if (!newRootLabel.trim() || !treeField) return;
    const currentNodes = treeField.treeData || [];
    const updated = insertTreeNode(currentNodes, null, newRootLabel.trim());
    updateBlueprint(treeField.id, { treeData: updated });

    // ?꾨찓?몄뿉 ???몃━ ?꾨뱶媛 ?녿떎硫??먮룞 異붽??섏뿬 ?곕룞
    if (activeDomain && !activeDomain.fields.includes(treeField.name)) {
      updateDomain(activeDomain.id, { fields: [...activeDomain.fields, treeField.name] });
    }

    setNewRootLabel('');
    setShowAddRootInput(false);
  };

  // 2. ?섏쐞(?먯떇) ?몃뱶 異붽?
  const handleAddChildNode = (parentId: string) => {
    if (!newChildLabel.trim() || !treeField) return;
    const currentNodes = treeField.treeData || [];
    const updated = insertTreeNode(currentNodes, parentId, newChildLabel.trim());
    updateBlueprint(treeField.id, { treeData: updated });

    // 異붽???부紐⑥쓽 ?묓옒 ?댁젣
    setCollapsedTreeNodes(prev => ({ ...prev, [parentId]: false }));
    setNewChildLabel('');
    setAddingChildParentId(null);
  };

  // 3. ?몃뱶 ?대쫫 蹂寃?
  const handleRenameNode = (targetId: string) => {
    if (!editingNodeLabel.trim() || !treeField) return;
    const currentNodes = treeField.treeData || [];
    const { updatedNodes, oldPath, newPath } = updateTreeNodeLabel(currentNodes, targetId, editingNodeLabel.trim());
    updateBlueprint(treeField.id, { treeData: updatedNodes });

    // 湲곗〈 ?곗씠?곗뿉 ??λ맂 寃쎈줈???쇱튂?섎룄濡??먮룞 ?숆린??
    if (oldPath && newPath && oldPath !== newPath) {
      domainData.forEach(row => {
        const val = row.data[treeField.name] || '';
        if (val === oldPath) {
          updateEntityField(row.anchorId, treeField.name, newPath);
        } else if (val.startsWith(oldPath + ' > ')) {
          const migrated = val.replace(oldPath, newPath);
          updateEntityField(row.anchorId, treeField.name, migrated);
        }
      });
      if (selectedNodePath === '(미분류)') {
        setSelectedNodePath(newPath);
      }
    }

    setEditingNodeId(null);
    setEditingNodeLabel('');
  };

  // 4. 노드 삭제
  const handleDeleteNode = (targetId: string, nodeLabel: string) => {
    if (!treeField) return;
    if (!window.confirm(`"${nodeLabel}" ?몃━ ?몃뱶瑜???젣?섏떆寃좎뒿?덇퉴?\n?곌껐???곗씠?곕뒗 (미분류)로 이동됩니다.`)) return;

    const currentNodes = treeField.treeData || [];
    const { updatedNodes, deletedPaths } = deleteTreeNode(currentNodes, targetId);
    updateBlueprint(treeField.id, { treeData: updatedNodes });

    // ??젣??寃쎈줈???랁븳 ?곗씠?곕뒗 誘몃텇瑜?'')濡?泥섎━
    domainData.forEach(row => {
      const val = row.data[treeField.name] || '';
      if (deletedPaths.some(dp => val === dp || val.startsWith(dp + ' > '))) {
        updateEntityField(row.anchorId, treeField.name, '');
      }
    });

    if (deletedPaths.includes(selectedNodePath)) {
      setSelectedNodePath('전체');
    }
  };

  // 5. ?몃뱶???꾨찓??留곹겕 ?ㅼ젙 / ?댁젣
  const handleLinkDomainToNode = (targetId: string, domainId: string | undefined) => {
    if (!treeField) return;
    const currentNodes = treeField.treeData || [];
    const updated = updateTreeNodeLink(currentNodes, targetId, domainId);
    updateBlueprint(treeField.id, { treeData: updated });
    setLinkingNodeId(null);
  };

  // 6. ?몃뱶 ?쒖꽌 ???꾨옒 ?대룞
  const handleMoveNode = (targetId: string, direction: 'up' | 'down') => {
    if (!treeField) return;
    const currentNodes = treeField.treeData || [];
    const updated = moveTreeNode(currentNodes, targetId, direction);
    updateBlueprint(treeField.id, { treeData: updated });
    setNodeContextMenu(null);
  };

  // 7. ?몃뱶 ?띿꽦 愿由?紐⑤떖 ?닿린
  const handleOpenPropsModal = (node: TreeNode) => {
    setPropsModalNode(node);
    setNodePropsForm({
      label: node.label || '',
      code: node.code || '',
      description: node.description || '',
      icon: node.icon || '?뱚',
      color: node.color || '#3b82f6',
      linkedDomainId: node.linkedDomainId || '',
    });
    setNodeContextMenu(null);
  };

  // 8. ?몃뱶 ?띿꽦 ???
  const handleSaveNodeProps = () => {
    if (!propsModalNode || !treeField || !nodePropsForm.label.trim()) return;
    const currentNodes = treeField.treeData || [];
    const { updatedNodes, oldPath, newPath } = updateTreeNodeProps(currentNodes, propsModalNode.id, {
      label: nodePropsForm.label.trim(),
      code: nodePropsForm.code.trim() || undefined,
      description: nodePropsForm.description.trim() || undefined,
      icon: nodePropsForm.icon || '?뱚',
      color: nodePropsForm.color || undefined,
      linkedDomainId: nodePropsForm.linkedDomainId || undefined,
    });
    updateBlueprint(treeField.id, { treeData: updatedNodes });

    // ?대쫫??蹂寃쎈맂 寃쎌슦 寃쎈줈 留덉씠洹몃젅?댁뀡
    if (oldPath && newPath && oldPath !== newPath) {
      domainData.forEach(row => {
        const val = row.data[treeField.name] || '';
        if (val === oldPath) {
          updateEntityField(row.anchorId, treeField.name, newPath);
        } else if (val.startsWith(oldPath + ' > ')) {
          const migrated = val.replace(oldPath, newPath);
          updateEntityField(row.anchorId, treeField.name, migrated);
        }
      });
      if (selectedNodePath === '(미분류)') {
        setSelectedNodePath(newPath);
      }
    }

    setPropsModalNode(null);
  };

  // ?몃? ?대┃ ???몃뱶 肄섑뀓?ㅽ듃 硫붾돱 ?リ린
  useEffect(() => {
    const handleOutsideClick = () => {
      setNodeContextMenu(null);
    };
    if (nodeContextMenu) {
      window.addEventListener('click', handleOutsideClick);
      return () => window.removeEventListener('click', handleOutsideClick);
    }
  }, [nodeContextMenu]);

  // ?좏깮???몃━ 寃쎈줈???대떦?섎뒗 ?몃뱶 諛??곌껐???꾨찓??議고쉶
  const selectedNode = useMemo(() => {
    if (!treeField?.treeData || selectedNodePath === '전체' || selectedNodePath === '(미분류)') return null;
    return findNodeByPath(treeField.treeData, selectedNodePath);
  }, [treeField?.treeData, selectedNodePath]);

  const selectedLinkedDomain = useMemo(() => {
    if (!selectedNode?.linkedDomainId) return null;
    return domains.find(d => d.id === selectedNode.linkedDomainId) || null;
  }, [selectedNode, domains]);

  // ?좏깮???몃뱶???곌껐???꾨찓?몄쓽 ?꾨뱶 紐⑸줉 (蹂듯빀 부遺??꾨뱶 ?쒖쇅)
  const linkedDomainFields = useMemo(() => {
    if (!selectedLinkedDomain) return [];
    return getFieldsForDomain(selectedLinkedDomain.id).filter(f => !compositePartNames.has(f.name));
  }, [selectedLinkedDomain, getFieldsForDomain, compositePartNames]);

  // ?좏깮???몃뱶???곌껐???꾨찓?몄쓽 援ъ꽦 ?곗씠??
  const linkedDomainData = useMemo(() => {
    if (!selectedLinkedDomain) return [];
    return getAtomsForDomain(selectedLinkedDomain.id);
  }, [selectedLinkedDomain, getAtomsForDomain, allAtoms]);

  // 寃???뺣젹???곸슜???곌껐 ?꾨찓???곗씠??
  const filteredLinkedData = useMemo(() => {
    if (!selectedLinkedDomain) return [];
    let data = [...linkedDomainData];
    if (quickSearch.trim()) {
      const q = quickSearch.toLowerCase().trim();
      data = data.filter(row =>
        Object.values(row.data).some(v => {
          const lv = v.toLowerCase();
          return lv.includes(q) || q.includes(lv);
        })
      );
    }
    if (sortField) {
      data.sort((a, b) => {
        const va = a.data[sortField] || '';
        const vb = b.data[sortField] || '';
        return sortAsc ? va.localeCompare(vb, 'ko') : vb.localeCompare(va, 'ko');
      });
    }
    return data;
  }, [selectedLinkedDomain, linkedDomainData, quickSearch, sortField, sortAsc]);

  // ?붾㈃???몄텧??援ъ꽦?붿냼(?꾨뱶) 紐⑸줉: ?ъ슜?щ?媛 '?????꾨뱶留??붾㈃???섑???("부"???붾㈃???섑??섏? ?딆쓬')
  const activeLinkedFields = useMemo(() => {
    if (!selectedLinkedDomain) return [];
    return linkedDomainFields.filter(f => {
      const cfg = getConstituentFieldConfig(selectedLinkedDomain.id, f.name, selectedNode?.id);
      return cfg.useStatus !== '비사용';
    });
  }, [selectedLinkedDomain, linkedDomainFields, getConstituentFieldConfig, selectedNode?.id]);

  // ?뚯씠釉???而щ읆)濡??몄텧???꾨뱶: ?ъ슜?щ? '용' && 蹂닿린/감추기'보기' (媛먯땄 ??ぉ? ?뚯씠釉??댁뿉??蹂댁씠吏 ?딆쓬')
  const visibleLinkedColumns = useMemo(() => {
    if (!selectedLinkedDomain) return [];
    return activeLinkedFields.filter(f => {
      const cfg = getConstituentFieldConfig(selectedLinkedDomain.id, f.name, selectedNode?.id);
      return cfg.visibility !== '감추기';
    });
  }, [selectedLinkedDomain, activeLinkedFields, getConstituentFieldConfig, selectedNode?.id]);

  // 媛먯땄 ?ㅼ젙???꾨뱶: ?뚯씠釉?而щ읆?먯꽌 ?④꺼吏怨? ???붾툝?대┃ ???꾨옒???쇱묠(?꾩퐫?붿뼵)?쇰줈 ?쒖떆??
  const hiddenLinkedDetailFields = useMemo(() => {
    if (!selectedLinkedDomain) return [];
    return activeLinkedFields.filter(f => {
      const cfg = getConstituentFieldConfig(selectedLinkedDomain.id, f.name, selectedNode?.id);
      return cfg.visibility === '감추기';
    });
  }, [selectedLinkedDomain, activeLinkedFields, getConstituentFieldConfig, selectedNode?.id]);

  // 誘몄궗??'비사용') 援ъ꽦?붿냼 媛쒖닔
  const unusedFieldsCount = useMemo(() => {
    return linkedDomainFields.length - activeLinkedFields.length;
  }, [linkedDomainFields.length, activeLinkedFields.length]);

  // ?곌껐???꾨찓???곗씠???됱뿉??????띿뒪??媛믪쓣 異붿텧 (?몃뱶 ?쇰꺼 ?쒖떆???ъ슜)
  const getLinkedRowDisplayValue = useCallback((domain: Domain, row: { anchorId: string; data: Record<string, string> }): string => {
    if (!domain || !row || !row.data) return '';

    // 1. ?꾨찓???듭빱 ?꾨뱶 媛??곗꽑
    if (domain.anchor && row.data[domain.anchor]?.trim()) {
      const val = row.data[domain.anchor].trim();
      if (!val.startsWith('data:image/') && !val.startsWith('blob:') && !val.startsWith('/local-images/')) {
        return val;
      }
    }

    // 2. ?꾨찓???꾨뱶 ?쒖꽌?濡??뺤씤
    if (domain.fields && domain.fields.length > 0) {
      for (const f of domain.fields) {
        const val = row.data[f];
        if (typeof val === 'string' && val.trim() && !val.startsWith('data:image/') && !val.startsWith('blob:') && !val.startsWith('/local-images/')) {
          return val.trim();
        }
      }
    }

    // 3. data 媛앹껜??泥?踰덉㎏ ?좏슚 ?띿뒪??媛?
    for (const val of Object.values(row.data)) {
      if (typeof val === 'string' && val.trim() && !val.startsWith('data:image/') && !val.startsWith('blob:') && !val.startsWith('/local-images/')) {
        return val.trim();
      }
    }

    return '';
  }, []);

  // ?좏깮???몃뱶???쒖떆紐?
  const selectedNodeDisplayLabel = useMemo(() => {
    if (!selectedNode) return '';
    return selectedNode.label;
  }, [selectedNode]);

  // 醫뚯륫 ?숈쟻 ?몃━ ?몃뱶 ?ш? ?뚮뜑??  // ?듭떖: ?곌껐 ?꾨찓?몄뿉 ?곗씠?곌? ?덉쑝硫??쒗뵆由??몃뱶媛 "?몃뱶紐?: ?곗씠?곕챸" ?몄뒪?댁뒪 ?몃뱶?ㅻ줈 ?泥대릺怨?
  // 媛??몄뒪?댁뒪 ?꾨옒???먮옒 ?먯떇 堉덈?媛 蹂듭젣?쒕떎. ?곗씠?곌? ?놁쑝硫?堉덈?(?쒗뵆由? 洹몃?濡??쒖떆.
  const renderMasterTreeNodes = (nodes: TreeNode[], depth: number = 0, currentPathPrefix: string = ''): React.ReactNode => {
    return nodes.flatMap(node => {
      const fullPath = currentPathPrefix ? `${currentPathPrefix} > ${node.label}` : node.label;
      const linkedDomain = node.linkedDomainId ? domains.find(d => d.id === node.linkedDomainId) : null;
      const linkedData = linkedDomain ? getAtomsForDomain(linkedDomain.id) : [];
      const hasRealChildren = node.children && node.children.length > 0;
      const isEditing = editingNodeId === node.id;
      const isAddingChild = addingChildParentId === node.id;
      const isLinking = linkingNodeId === node.id;

      // ??? ?곗씠?곌? ?덈뒗 ?몃뱶 ??媛??곗씠?곌? ?몄뒪?댁뒪 ?몃뱶濡??泥????
      if (linkedDomain && linkedData.length > 0) {
        return linkedData.map(row => {
          const rowVal = getLinkedRowDisplayValue(linkedDomain, row);
          const instanceLabel = rowVal || row.anchorId;
          const instanceNodeId = `${node.id}__inst__${row.anchorId}`;
          const isInstanceCollapsed = collapsedTreeNodes[instanceNodeId];
          const isInstanceSelected = selectedNodePath === fullPath;

          return (
            <div key={instanceNodeId} className="master-tree-node-wrapper">
              <div
                className={`master-tree-node-row instance-data-node ${isInstanceSelected ? 'selected' : ''}`}
                style={{ paddingLeft: `${depth * 18 + 10}px` }}
                onClick={() => setSelectedNodePath(fullPath)}
              >
                {hasRealChildren ? (
                  <button
                    type="button"
                    className="tree-expand-icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCollapsedTreeNodes(prev => ({ ...prev, [instanceNodeId]: !prev[instanceNodeId] }));
                    }}
                  >
                    {isInstanceCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                  </button>
                ) : (
                  <span className="tree-leaf-spacer" />
                )}
                <span className="tree-node-icon">
                  {node.icon ? (
                    <span className="tree-node-custom-icon">{node.icon}</span>
                  ) : (
                    <Folder size={14} />
                  )}
                </span>
                <span className="tree-node-label instance-node-type-label">
                  {node.label}
                </span>
                <span className="instance-data-separator">:</span>
                <span className="instance-data-value" title={instanceLabel}>
                  {instanceLabel}
                </span>
                <span 
                  className="tree-node-linked-badge"
                  title={`?곌껐???꾨찓?? ${linkedDomain.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedNodePath(fullPath);
                  }}
                >
                  <Link2 size={10} className="tree-linked-icon" />
                  <span className="tree-linked-name">{linkedDomain.icon} {linkedDomain.name}</span>
                </span>
              </div>

              {/* ?몄뒪?댁뒪 ?몃뱶 ?꾨옒???먮옒 ?먯떇 堉덈? 蹂듭젣 */}
              {!isInstanceCollapsed && hasRealChildren && renderMasterTreeNodes(node.children!, depth + 1, fullPath)}
            </div>
          );
        });
      }

      // ??? ?곗씠???놁쓬 ??湲곕낯 堉덈?(?쒗뵆由? ?몃뱶 ?쒖떆 ???
      const isCollapsed = collapsedTreeNodes[node.id];
      const isSelected = selectedNodePath === fullPath;
      const dataCount = pathDataCountMap.get(fullPath) || 0;

      return [(
        <div key={node.id} className="master-tree-node-wrapper">
          <div
            className={`master-tree-node-row ${isSelected ? 'selected' : ''}`}
            style={{ paddingLeft: `${depth * 18 + 10}px` }}
            onClick={() => setSelectedNodePath(fullPath)}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setNodeContextMenu({
                nodeId: node.id,
                x: Math.min(e.clientX, window.innerWidth - 200),
                y: Math.min(e.clientY, window.innerHeight - 250),
              });
            }}
          >
            {hasRealChildren ? (
              <button
                type="button"
                className="tree-expand-icon"
                onClick={(e) => {
                  e.stopPropagation();
                  setCollapsedTreeNodes(prev => ({ ...prev, [node.id]: !prev[node.id] }));
                }}
              >
                {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
              </button>
            ) : (
              <span className="tree-leaf-spacer" />
            )}

            <span className="tree-node-icon">
              {node.icon ? (
                <span className="tree-node-custom-icon">{node.icon}</span>
              ) : isCollapsed ? (
                <Folder size={14} />
              ) : (
                <FolderOpen size={14} />
              )}
            </span>

            {isEditing ? (
              <div className="tree-node-inline-edit" onClick={e => e.stopPropagation()}>
                <input
                  type="text"
                  value={editingNodeLabel}
                  onChange={e => setEditingNodeLabel(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleRenameNode(node.id);
                    if (e.key === 'Escape') setEditingNodeId(null);
                  }}
                  autoFocus
                />
                <button type="button" onClick={() => handleRenameNode(node.id)}>✓</button>
                <button type="button" onClick={() => setEditingNodeId(null)}>✕</button>
              </div>
            ) : (
              <span 
                className="tree-node-label" 
                title={node.description ? `${fullPath}\n${node.description}` : `${node.label} (${dataCount}건)`}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setEditingNodeId(node.id);
                  setEditingNodeLabel(node.label);
                }}
              >
                {node.label}
              </span>
            )}

            {node.code && (
              <span className="tree-node-code-badge" title={`분류 식별코드: ${node.code}`}>
                {node.code}
              </span>
            )}

            {linkedDomain && (
              <span 
                className="tree-node-linked-badge" 
                title={`연결된 도메인: ${linkedDomain.name} (데이터를 입력하면 도미노스 항목이 생성됩니다)`}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedNodePath(fullPath);
                }}
              >
                <Link2 size={10} className="tree-linked-icon" />
                <span className="tree-linked-name">{linkedDomain.icon} {linkedDomain.name}</span>
              </span>
            )}

            <span className={`tree-count-badge ${dataCount > 0 ? 'has-data' : ''}`}>
              {dataCount}
            </span>

            <div className="tree-node-hover-actions" onClick={e => e.stopPropagation()}>
              <button
                type="button"
                className="tree-node-act-btn settings"
                onClick={(e) => {
                  e.stopPropagation();
                  const rect = e.currentTarget.getBoundingClientRect();
                  setNodeContextMenu({
                    nodeId: node.id,
                    x: Math.min(rect.right, window.innerWidth - 200),
                    y: Math.min(rect.bottom + 4, window.innerHeight - 250),
                  });
                }}
                title=""
              >
                <Settings size={13} />
              </button>
            </div>
          </div>

          {isLinking && (
            <div 
              className="tree-node-link-popover animate-scale-in"
              style={{ marginLeft: `${depth * 18 + 10}px` }}
              onClick={e => e.stopPropagation()}
            >
              <div className="tree-link-popover-header">
                <div className="tree-link-header-title">
                  <Link2 size={12} />
                  <span>"{node.label}" ?몃뱶??도메인에 연결</span>
                </div>
                <button type="button" className="tree-link-popover-close" onClick={() => setLinkingNodeId(null)}>✕</button>
              </div>
              <div className="tree-link-domains-list">
                <button
                  type="button"
                  className={`tree-link-domain-item ${!node.linkedDomainId ? 'selected' : ''}`}
                  onClick={() => handleLinkDomainToNode(node.id, undefined)}
                >
                  <span className="tree-link-domain-icon">?슟</span>
                  <span className="tree-link-domain-name">?곌껐 ?놁쓬 (?댁젣)</span>
                  {!node.linkedDomainId && <span className="tree-link-check">✓</span>}
                </button>
                {domains.map(d => {
                  const isCurSelected = node.linkedDomainId === d.id;
                  return (
                    <button key={d.id} type="button" className={`tree-link-domain-item ${isCurSelected ? 'selected' : ''}`}
                      onClick={() => handleLinkDomainToNode(node.id, d.id)}>
                      <span className="tree-link-domain-icon">{d.icon}</span>
                      <span className="tree-link-domain-name">{d.name}</span>
                      <span className="tree-link-domain-type">{d.anchor === '이름' ? '분류 없음' : `${d.anchor}연결`}</span>
                      {isCurSelected && <span className="tree-link-check">✓</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {isAddingChild && (
            <div className="tree-node-add-child-row" style={{ paddingLeft: `${(depth + 1) * 18 + 10}px` }} onClick={e => e.stopPropagation()}>
              <CornerDownRight size={13} className="tree-add-corner-icon" />
              <input type="text" placeholder="" value={newChildLabel}
                onChange={e => setNewChildLabel(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddChildNode(node.id); if (e.key === 'Escape') setAddingChildParentId(null); }}
                autoFocus />
              <button type="button" onClick={() => handleAddChildNode(node.id)}>추가</button>
              <button type="button" onClick={() => setAddingChildParentId(null)}>취소</button>
            </div>
          )}

          {!isCollapsed && hasRealChildren && renderMasterTreeNodes(node.children!, depth + 1, fullPath)}
        </div>
      )];
    });
  };

  const addCondition = () => {
    setConditions(prev => [...prev, { id: Date.now().toString(), field: '', operator: 'contains', value: '' }]);
  };

  const clearConditions = () => setConditions([]);

  const hasActiveConditions = conditions.some(c => c.field && c.value.trim());
  const hasAnySearch = hasActiveConditions || quickSearch.trim() !== '';

  // 寃???붿빟
  const searchSummary = useMemo(() => {
    const active = conditions.filter(c => c.field && c.value.trim());
    if (active.length === 0) return '';
    return active.map((c, i) => {
      const op = c.matchType === 'exact' ? '=' : '용';
      const prefix = i > 0 ? ` ${c.logic} ` : '';
      return `${prefix}${c.field}${op}"${c.value}"`;
    }).join('');
  }, [conditions]);

  // ???꾪솚
  const handleTabClick = (domId: string | null) => {
    if (domId === null) {
      // ?꾩껜 ??      setIsAllMode(!isAllMode);
      setActiveDomainById(null);
      setSelectedParentId(null);
    } else {
      setIsAllMode(false);
      const isDeselect = activeDomain?.id === domId;
      setActiveDomainById(isDeselect ? null : domId);
      if (!isDeselect) {
        const targetDom = domains.find(d => d.id === domId);
        if (targetDom) {
          if (targetDom.useTree) {
            setViewMode('tree');
          } else {
            setViewMode('table');
          }
          const isRoot = (!targetDom.parentIds || targetDom.parentIds.length === 0) && !targetDom.parentId;
          if (isRoot) {
            setSelectedParentId(targetDom.id);
          }
        }
      }
    }
    setConditions([]);
    setQuickSearch('');
    setSortField(null);
  };

  // 理쒖긽???꾨찓??紐⑸줉
  const rootDomains = useMemo(() => domains.filter(d => (!d.parentIds || d.parentIds.length === 0) && !d.parentId), [domains]);

  // ?꾩옱 ?쒖꽦?붾맂 ?꾨찓?몄쓽 부紐??꾨찓??(?먯떇 ?꾨찓???좏깮 以묒씤 寃쎌슦) ?먮뒗 ?먭린 ?먯떊 (부紐??꾨찓?몄씤 寃쎌슦)
  const currentParentDomain = useMemo(() => {
    if (!activeDomain) return null;
    const parentIds = (activeDomain.parentIds && activeDomain.parentIds.length > 0)
      ? activeDomain.parentIds
      : (activeDomain.parentId ? [activeDomain.parentId] : []);

    if (parentIds.length > 0) {
      if (selectedParentId && parentIds.includes(selectedParentId)) {
        return domains.find(d => d.id === selectedParentId) || null;
      }
      return domains.find(d => parentIds.includes(d.id)) || null;
    }
    const hasChildren = domains.some(d => (d.parentIds?.includes(activeDomain.id) || d.parentId === activeDomain.id));
    return hasChildren ? activeDomain : null;
  }, [activeDomain, domains, selectedParentId]);

  // ?꾩옱 ?쒖꽦?붾맂 ?곸쐞 ?꾨찓?몄쓽 吏곸냽 ?섏쐞 ?꾨찓??紐⑸줉
  const activeSubDomains = useMemo(() => {
    if (!currentParentDomain) return [];
    return domains.filter(d => (d.parentIds?.includes(currentParentDomain.id) || d.parentId === currentParentDomain.id));
  }, [currentParentDomain, domains]);

  // 紐⑤뱺 ?꾨찓?몄? ?듭씪 CRUD ?뚯씠釉??ъ슜
  const showTable = !!activeDomain || isAllMode;

  return (
    <div className="domain-view">
      {/* 1李??꾨찓????(理쒖긽???꾨찓?? */}
      <div className="domain-tabs">
        {/* ?꾩껜 ??*/}
        <button
          className={`domain-tab ${isAllMode ? 'active' : ''}`}
          onClick={() => handleTabClick(null)}
        >
          <span className="domain-tab-icon">📁</span>
          <span className="domain-tab-name">전체</span>
        </button>
        {rootDomains.map(dom => {
          const children = domains.filter(d => (d.parentIds?.includes(dom.id) || d.parentId === dom.id));
          const isChildActive = activeDomain && ((activeDomain.parentIds?.includes(dom.id)) || activeDomain.parentId === dom.id);
          const isSelected = !isAllMode && (activeDomain?.id === dom.id || (isChildActive && currentParentDomain?.id === dom.id));
          return (
            <button
              key={dom.id}
              className={`domain-tab ${isSelected ? 'active' : ''}`}
              onClick={() => handleTabClick(dom.id)}
            >
              <span className="domain-tab-icon">{dom.icon}</span>
              <span className="domain-tab-name">{dom.name}</span>
              {dom.useTree && <span className="domain-tab-tree-badge" title="트리분류 적용 도메인">🌳</span>}
              {children.length > 0 && (
                <span className="domain-tab-child-count" title={`하위 도메인 ${children.length}개 포함`}>
                  {children.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 2李??섏쐞 ?꾨찓???쒕툕??諛?(?꾨찓???덉뿉 ?꾨찓?몄씠 ?덈뒗 寃쎌슦 ?몄텧) */}
      {currentParentDomain && activeSubDomains.length > 0 && (
        <div className="domain-sub-tabs animate-fade-in">
          <span className="domain-sub-tabs-label">
            {currentParentDomain.icon} {currentParentDomain.name} 하위 도메인
          </span>
          <button
            className={`domain-sub-tab ${activeDomain?.id === currentParentDomain.id ? 'active' : ''}`}
            onClick={() => handleTabClick(currentParentDomain.id)}
          >
            <span>{currentParentDomain.icon} {currentParentDomain.name} (상위 도메인)</span>
          </button>
          {activeSubDomains.map(subDom => (
            <button
              key={subDom.id}
              className={`domain-sub-tab ${activeDomain?.id === subDom.id ? 'active' : ''}`}
              onClick={() => handleTabClick(subDom.id)}
            >
              <span>{subDom.icon} {subDom.name}</span>
              {subDom.useTree && <span className="domain-tab-tree-badge">🌳</span>}
            </button>
          ))}
        </div>
      )}

      {/* ?뚯씠釉?酉?(紐낇븿/?숈갹/?꾩껜) */}
      {showTable && (
        <div className="domain-content animate-slide-up">
          {/* ?숈쟻 寃??議곌굔 鍮뚮뜑 */}
          <div className="search-builder">
            <div className="search-builder-header">
              <div className="search-builder-title">
                <Search size={14} />
                <span>검색 조건</span>
                {hasActiveConditions && (
                  <span className="search-active-count">{conditions.filter(c => c.value.trim()).length}개 적용</span>
                )}
              </div>
              <div className="search-builder-actions">
                <button className="search-add-btn" onClick={addCondition}>
                  <Plus size={12} />
                  조건 추가
                </button>
                {conditions.length > 0 && (
                  <button className="search-clear-btn" onClick={clearConditions}>
                    초기화                  </button>
                )}
              </div>
            </div>

            {/* ?듯빀 寃??*/}
            <div className="quick-search-row">
              <Search size={14} className="quick-search-icon" />
              <input
                type="text"
                value={quickSearch}
                onChange={e => setQuickSearch(e.target.value)}
                placeholder=""
                className="quick-search-input"
              />
              {quickSearch && (
                <button className="quick-search-clear" onClick={() => setQuickSearch('')}>
                  <X size={14} />
                </button>
              )}
            </div>

            {/* ?몃? 議곌굔 ?곸뿭 */}
            <div className="search-conditions-area">

            {/* 議곌굔 ??*/}
            {conditions.map((cond, idx) => (
              <div key={cond.id} className="search-condition-row">
                {/* AND/OR ?좉? (??踰덉㎏ 議곌굔부?? */}
                {idx > 0 && (
                  <button
                    className={`search-logic-toggle ${cond.logic.toLowerCase()}`}
                    onClick={() => updateCondition(cond.id, { logic: cond.logic === 'AND' ? 'OR' : 'AND' })}
                    title=""
                  >
                    {cond.logic}
                  </button>
                )}
                
                {/* ?꾨뱶 ?좏깮 */}
                <select
                  value={cond.field}
                  onChange={e => updateCondition(cond.id, { field: e.target.value })}
                  className="search-field-select"
                >
                  {fields.map(f => (
                    <option key={f.id} value={f.name}>{f.name}</option>
                  ))}
                </select>

                {/* 留ㅼ묶 ???*/}
                <select
                  value={cond.matchType}
                  onChange={e => updateCondition(cond.id, { matchType: e.target.value as 'contains' | 'exact' })}
                  className="search-match-select"
                >
                  <option value="contains">포함 ≈</option>
                  <option value="exact">일치 =</option>
                </select>

                {/* 媛??낅젰 */}
                <input
                  type="text"
                  value={cond.value}
                  onChange={e => updateCondition(cond.id, { value: e.target.value })}
                  placeholder=""
                  className="search-value-input"
                  autoFocus
                />
                <button className="search-remove-btn" onClick={() => removeCondition(cond.id)}>
                  <X size={14} />
                </button>
              </div>
            ))}

            {/* 寃???붿빟 */}
            {hasActiveConditions && (
              <div className="search-summary">
                <Filter size={12} />
                <span className="search-summary-text">{searchSummary}</span>
                <span className="search-summary-result">→{filteredData.length}건/ {domainData.length}건</span>
              </div>
            )}

            {conditions.length === 0 && (
              <div className="search-empty-hint">
                <span>위 "조건 추가"로 다중 검색 및 AND/OR 전환 가능, 포함/일치 선택 가능</span>
              </div>
            )}

            {!hasAnySearch && (
              <div className="domain-result-count">
                <Filter size={12} />
                <span>{domainData.length}건</span>
              </div>
            )}
            </div>  {/* search-conditions-area */}
          </div>

          {/* ?대컮 (異붽? 踰꾪듉, 酉?紐⑤뱶 ?좉?, 鍮좊Ⅸ ?꾨뱶 異붽?) */}
          {activeDomain && !isAllMode && (
            <div className="crud-toolbar">
              <div className="crud-toolbar-left">
                <button className="crud-add-btn" onClick={() => {
                  setShowAddForm(true);
                  setAddFormData({});
                }}>
                  <Plus size={14} /> 새 데이터 추가
                </button>

                {/* 뷰 모드 전환 토글 (표준 테이블 vs 도메인 자동 형태 뷰 vs 계층 트리 뷰) */}
                {activeDomain && (
                  <div className="view-mode-toggle">
                    <button 
                      type="button"
                      className={`view-mode-btn ${viewMode === 'table' ? 'active' : ''}`}
                      onClick={() => setViewMode('table')}
                      title="표준 테이블 형태로 보기"
                    >
                      <Table size={13} />
                      <span>테이블</span>
                    </button>
                    <button 
                      type="button"
                      className={`view-mode-btn ${viewMode === 'shape' ? 'active' : ''}`}
                      onClick={() => setViewMode('shape')}
                      title={`도메인 자동 추론 형태(${DATA_SHAPE_INFO[resolveDomainDataShape(activeDomain, blueprints)].label})로 보기`}
                    >
                      <LayoutGrid size={13} />
                      <span>형태 뷰 ({DATA_SHAPE_INFO[resolveDomainDataShape(activeDomain, blueprints)].label})</span>
                    </button>
                    {hasTreeProperty && (
                      <button 
                        type="button"
                        className={`view-mode-btn ${viewMode === 'tree' ? 'active' : ''}`}
                        onClick={() => setViewMode('tree')}
                        title="계층 트리 구조로 보기"
                      >
                        <FolderTree size={13} />
                        <span>트리 뷰</span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* 誘몃벑濡??꾨뱶 鍮좊Ⅸ 異붽? 移?*/}
              {availableBlueprints.length > 0 && (
                <div className="quick-add-fields-area">
                  <span className="quick-add-label">+ 도메인 필드 추가:</span>
                  <div className="quick-add-chips">
                    {availableBlueprints.slice(0, 6).map(bp => (
                      <button
                        key={bp.id}
                        type="button"
                        className={`quick-field-chip ${bp.inputType === 'tree' ? 'is-tree' : ''}`}
                        onClick={() => handleQuickAddField(bp.name)}
                        title={`현재 도메인에 "${bp.name}" 필드 추가`}
                      >
                        {bp.inputType === 'tree' ? '🌲' : '+'} {bp.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 異붽? ??*/}
          {showAddForm && activeDomain && (
            <div className="crud-form animate-slide-up">
              <div className="crud-form-header">
                <span>+ 새 데이터 추가</span>
                <button className="crud-form-close" onClick={() => setShowAddForm(false)}>
                  <X size={14} />
                </button>
              </div>

              {/* 중복 데이터 媛먯? ?덈궡 */}
              {isFormDuplicate && (
                <div className="crud-duplicate-warning animate-fade-in">
                  <AlertTriangle size={13} />
                  <span>동일한 데이터가 이미 존재합니다. 중복 없이 새로 추가하거나 기존 데이터를 수정/병합합니다.</span>
                </div>
              )}

              <div className="crud-form-fields">
                {fields.map((f, fIdx) => (
                  <div key={f.id} className="crud-form-field">
                    <label>{f.name}</label>
                    {f.inputType === 'tree' ? (
                      <TreeSelectInput
                        value={addFormData[f.name] || ''}
                        treeData={f.treeData}
                        onChange={val => setAddFormData(prev => ({ ...prev, [f.name]: val }))}
                        placeholder={`${f.name} (예: 분류명 > 하위명을)`}
                      />
                    ) : f.inputType === 'composite' && f.parts && f.parts.length > 0 ? (
                      <CompositeInput
                        blueprint={f}
                        value={addFormData[f.name] || ''}
                        onChange={val => setAddFormData(prev => ({ ...prev, [f.name]: val }))}
                        existingCompositeValues={fieldExistingValuesMap.get(f.name) || []}
                        existingPartValuesMap={partExistingValuesMap}
                        autoFocus={fIdx === 0}
                      />
                    ) : isImageField(f, f.name, addFormData[f.name]) ? (
                      <ImageUploadInput
                        value={addFormData[f.name] || ''}
                        onChange={val => setAddFormData(prev => ({ ...prev, [f.name]: val }))}
                        fieldName={f.name}
                        onPreviewClick={url => {
                          setLightboxImg(url);
                          setLightboxAnchorId('');
                          setLightboxFieldKey(f.name);
                        }}
                      />
                    ) : (
                      <AutocompleteInput
                        value={addFormData[f.name] || ''}
                        onChange={val => setAddFormData(prev => ({ ...prev, [f.name]: autoFormatByBp(f, val) }))}
                        placeholder={`${f.name} 입력...`}
                        fieldName={f.name}
                        existingValues={fieldExistingValuesMap.get(f.name) || []}
                        autoFocus={fIdx === 0}
                      />
                    )}
                  </div>
                ))}
              </div>
              <div className="crud-form-actions">
                <button className="crud-save-btn" onClick={() => {
                  if (activeDomain && Object.values(addFormData).some(v => v.trim())) {
                    addEntityToDomain(activeDomain.id, addFormData);
                    setAddFormData({});
                    setShowAddForm(false);
                  }
                }}>
                  <Save size={14} /> 저장 ???                </button>
                <button className="crud-cancel-btn" onClick={() => { setShowAddForm(false); setAddFormData({}); }}>
                  취소
                </button>
              </div>
            </div>
          )}

          {/* 중복 데이터 媛먯? 諛곕꼫 */}
          {duplicateCount > 0 && activeDomain && (
            <div className="duplicate-alert-banner animate-fade-in">
              <div className="duplicate-banner-text">
                <AlertTriangle size={15} className="duplicate-banner-icon" />
                <span>현재 도메인에 동일한 중복 데이터가 <strong>{duplicateCount}건</strong> 발견되었습니다.</span>
              </div>
              <button
                type="button"
                className="duplicate-clean-btn"
                onClick={() => {
                  const cleaned = deduplicateDomain(activeDomain.id);
                  alert(`동일한 중복 데이터 ${cleaned}건이 성공적으로 정리되었습니다.`);
                }}
              >
                🧹 중복 데이터 즉시 정리 ({duplicateCount}건)
              </button>
            </div>
          )}

          {/* 테이블 뷰 (기본 모드) */}
          {viewMode === 'table' && (
          <div className="domain-table-wrapper">
            <table className="domain-table">
              <thead>
                <tr>
                  {fields.map(f => (
                    <th key={f.id} onClick={() => handleSort(f.name)} className="sortable">
                      {f.name}
                      {sortField === f.name && (
                        sortAsc ? <ChevronUp size={12} /> : <ChevronDown size={12} />
                      )}
                    </th>
                  ))}
                  <th className="th-actions">관리</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.map(row => {
                  const isEditing = editingRow === row.anchorId;
                  const isDeleting = deleteConfirm === row.anchorId;

                  return (
                    <React.Fragment key={row.anchorId}>
                    <tr 
                      className={`${isEditing ? 'editing' : ''} ${isDeleting ? 'deleting' : ''} ${expandedRow === row.anchorId ? 'expanded' : ''}`}
                      onDoubleClick={() => {
                        if (!isEditing) {
                          setExpandedRow(expandedRow === row.anchorId ? null : row.anchorId);
                        }
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      {fields.map(f => {
                        const isNameField = f.name === '이름';
                        const profileImg = isNameField ? getProfileImage(row.data) : null;

                        return (
                        <td key={f.id} className={isNameField ? 'td-name' : ''}>
                          {isEditing ? (
                            f.inputType === 'tree' ? (
                              <div onClick={e => e.stopPropagation()}>
                                <TreeSelectInput
                                  value={editFormData[f.name] ?? row.data[f.name] ?? ''}
                                  treeData={f.treeData}
                                  onChange={val => setEditFormData(prev => ({ ...prev, [f.name]: val }))}
                                />
                              </div>
                            ) : f.inputType === 'composite' && f.parts && f.parts.length > 0 ? (
                              <div onClick={e => e.stopPropagation()}>
                                <CompositeInput
                                  blueprint={f}
                                  value={editFormData[f.name] ?? row.data[f.name] ?? ''}
                                  onChange={val => setEditFormData(prev => ({ ...prev, [f.name]: val }))}
                                  existingCompositeValues={fieldExistingValuesMap.get(f.name) || []}
                                  existingPartValuesMap={partExistingValuesMap}
                                  compact
                                />
                              </div>
                            ) : isImageField(f, f.name, editFormData[f.name] ?? row.data[f.name]) ? (
                              <div onClick={e => e.stopPropagation()}>
                                <ImageUploadInput
                                  value={editFormData[f.name] ?? row.data[f.name] ?? ''}
                                  onChange={val => setEditFormData(prev => ({ ...prev, [f.name]: val }))}
                                  fieldName={f.name}
                                  compact
                                  onPreviewClick={url => {
                                    setLightboxImg(url);
                                    setLightboxAnchorId(row.anchorId);
                                    setLightboxFieldKey(f.name);
                                  }}
                                />
                              </div>
                            ) : (
                              <div onClick={e => e.stopPropagation()}>
                                <AutocompleteInput
                                  className="crud-inline-input"
                                  value={editFormData[f.name] ?? row.data[f.name] ?? ''}
                                  onChange={val => setEditFormData(prev => ({ ...prev, [f.name]: autoFormatByBp(f, val) }))}
                                  fieldName={f.name}
                                  existingValues={fieldExistingValuesMap.get(f.name) || []}
                                />
                              </div>
                            )
                          ) : isNameField ? (
                            <div className="profile-cell-wrapper" style={{ display: 'inline-flex', alignItems: 'center', gap: '10px' }}>
                              <div
                                className="profile-avatar-container"
                                style={{
                                  position: 'relative',
                                  width: '32px',
                                  height: '32px',
                                  borderRadius: '50%',
                                  flexShrink: 0,
                                  cursor: 'pointer',
                                  overflow: 'hidden',
                                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                                }}
                                title={profileImg ? '클릭하여 사진 크게 보기 / 변경' : '클릭하여 프로필 사진 등록'}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (profileImg) {
                                    setLightboxImg(profileImg.url);
                                    setLightboxAnchorId(row.anchorId);
                                    setLightboxFieldKey(profileImg.key);
                                  } else {
                                    document.getElementById(`avatar-file-${row.anchorId}`)?.click();
                                  }
                                }}
                              >
                                {profileImg ? (
                                  <img
                                    src={profileImg.url}
                                    alt={row.data['이름'] || '프로필'}
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                  />
                                ) : (
                                  <div style={{
                                    width: '100%',
                                    height: '100%',
                                    background: 'linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%)',
                                    color: '#4338ca',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '0.82rem',
                                    fontWeight: 700,
                                    border: '1px dashed #818cf8'
                                  }}>
                                    {(row.data['이름'] || '').trim().slice(0, 1) || <User size={14} />}
                                  </div>
                                )}
                                <input
                                  id={`avatar-file-${row.anchorId}`}
                                  type="file"
                                  accept="image/*"
                                  style={{ display: 'none' }}
                                  onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                      const compressed = await compressImageFile(file);
                                      let finalUrl = compressed;
                                      try {
                                        finalUrl = await uploadImageToLocal(compressed);
                                      } catch (err) {
                                        console.error('Local upload failed, fallback to base64', err);
                                      }
                                      updateEntityField(row.anchorId, '사진', finalUrl);
                                    }
                                  }}
                                />
                              </div>
                              <span className="profile-name-text">
                                {autoFormatByBp(f, row.data[f.name] || '') || '-'}
                              </span>
                            </div>
                          ) : f.inputType === 'tree' && row.data[f.name] ? (
                            <span className="tree-path-display" title={row.data[f.name]}>
                              {row.data[f.name].split(' > ').map((seg: string, i: number, arr: string[]) => (
                                <React.Fragment key={i}>
                                  <span className="tree-path-segment">{seg}</span>
                                  {i < arr.length - 1 && <ChevronRight size={10} className="tree-path-sep" />}
                                </React.Fragment>
                              ))}
                            </span>
                          ) : (
                            isImageField(f, f.name, row.data[f.name]) && row.data[f.name] ? (
                              <img
                                src={row.data[f.name]}
                                alt={f.name}
                                style={{ width: '32px', height: '32px', objectFit: 'cover', borderRadius: '4px', verticalAlign: 'middle', cursor: 'pointer', border: '1px solid #cbd5e1' }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setLightboxImg(row.data[f.name]);
                                  setLightboxAnchorId(row.anchorId);
                                  setLightboxFieldKey(f.name);
                                }}
                                title="클릭하여 원본 보기"
                              />
                            ) : (
                              autoFormatByBp(f, row.data[f.name] || '') || '-'
                            )
                          )}
                        </td>
                        );
                      })}
                      <td className="td-actions" onClick={e => e.stopPropagation()}>
                        {isDeleting ? (
                          <div className="delete-confirm">
                            <span>삭제?</span>
                            <button className="action-btn confirm-yes" title="삭제 확정" onClick={() => {
                              if (activeDomain) {
                                removeEntityFromDomain(activeDomain.id, row.anchorId);
                              }
                              setDeleteConfirm(null);
                              setEditingRow(null);
                              setEditFormData({});
                            }}></button>
                            <button className="action-btn confirm-no" title="삭제 취소" onClick={() => setDeleteConfirm(null)}>취소</button>
                          </div>
                        ) : isEditing ? (
                          <>
                            <button className="action-btn cancel" title="취소" onClick={() => {
                              setEditingRow(null);
                              setEditFormData({});
                            }}>
                              <X size={14} />
                            </button>
                            <button className="action-btn save" title="저장" onClick={() => handleSaveEdit(row.anchorId)}>
                              <Save size={14} /> 저장
                            </button>
                            <button className="action-btn delete" title={`${activeDomain?.name || '도메인'}에서 삭제`} onClick={() => {
                              setDeleteConfirm(row.anchorId);
                            }}>
                              <Trash2 size={14} />
                            </button>
                            <button
                              type="button"
                              className="action-btn add-field"
                              title="이 레코드 또는 도메인에 새 필드 추가"
                              onClick={() => setInlineFieldAdderTarget({
                                anchorId: row.anchorId,
                                entityName: row.data['이름'] || row.data['제목'] || row.anchorId,
                                row
                              })}
                            >
                              <Plus size={14} />
                            </button>
                          </>
                        ) : (
                          <>
                            {activeDomain && !isAllMode && (
                              <button className="action-btn settings" title="저장" onClick={() => {
                                setEditingRow(row.anchorId);
                                setEditFormData({ ...row.data });
                              }}>
                                <Settings size={15} />
                              </button>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                    {/* 상세 펼침 행 */}
                    {expandedRow === row.anchorId && (
                      <tr key={`${row.anchorId}-detail`} className="detail-row">
                        <td colSpan={fields.length + 1}>
                          <div className="detail-grid">
                            {detailFields.map(df => (
                              <div key={df.id} className="detail-item">
                                <span className="detail-label">{df.name}</span>
                                <span className="detail-value">
                                  {(df.inputType === 'image' || String(row.data[df.name] || '').startsWith('data:image/') || String(row.data[df.name] || '').startsWith('/local-images/')) && row.data[df.name] ? (
                                    <img
                                      src={row.data[df.name]}
                                      alt={df.name}
                                      style={{ maxWidth: '120px', maxHeight: '120px', objectFit: 'contain', borderRadius: '6px', cursor: 'pointer' }}
                                      onClick={() => window.open(row.data[df.name], '_blank')}
                                      title="클릭하여 원본 보기"
                                    />
                                  ) : (
                                    autoFormatByBp(df, row.data[df.name] || '') || '-'
                                  )}
                                </span>
                              </div>
                            ))}
                            {/* Ad-hoc 필드 (해당 레코드에만 등록된 확장 필드) */}
                            {(() => {
                              const standardKeys = new Set([
                                ...fields.map(f => f.name),
                                ...detailFields.map(df => df.name)
                              ]);
                              const adHocList = Object.entries(row.data).filter(([k, v]) =>
                                !k.startsWith('_') && !standardKeys.has(k) && typeof v === 'string'
                              );
                              return (
                                <>
                                  {adHocList.map(([k, v]) => (
                                    <div key={k} className="detail-item adhoc-item">
                                      <span className="detail-label" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                        <span style={{ fontSize: '0.65rem', padding: '1px 4px', borderRadius: '3px', background: '#ede9fe', color: '#6d28d9', fontWeight: 600 }}>확장</span>
                                        {k}
                                      </span>
                                      <span className="detail-value">
                                        {(k.includes('이미지') || k.includes('사진') || String(v).startsWith('data:image/') || String(v).startsWith('/local-images/')) && v ? (
                                          <img
                                            src={v}
                                            alt={k}
                                            style={{ maxWidth: '120px', maxHeight: '120px', objectFit: 'contain', borderRadius: '6px', cursor: 'pointer' }}
                                            onClick={() => window.open(v, '_blank')}
                                            title="클릭하여 원본 보기"
                                          />
                                        ) : (
                                          v || '-'
                                        )}
                                      </span>
                                    </div>
                                  ))}
                                  <div className="detail-item detail-add-field-action" style={{ display: 'flex', alignItems: 'center' }}>
                                    <button
                                      type="button"
                                      className="tree-small-btn"
                                      style={{ background: '#f1f5f9', border: '1px dashed #cbd5e1', color: '#475569', padding: '4px 8px', borderRadius: '5px', fontSize: '0.75rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                      onClick={() => setInlineFieldAdderTarget({
                                        anchorId: row.anchorId,
                                        entityName: row.data['이름'] || row.data['제목'] || row.anchorId,
                                        row
                                      })}
                                    >
                                      <Plus size={12} />
                                      <span>필드 추가</span>
                                    </button>
                                  </div>
                                </>
                              );
                            })()}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                  );
                })}
                {filteredData.length === 0 && (
                  <tr>
                    <td colSpan={fields.length + 1} className="td-empty">
                      {hasActiveConditions ? '검색 결과가 없습니다' : '데이터가 없습니다'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          )}

          {/* 도메인 자동 형태(dataShape) 뷰 — 갤러리/카드/목록/트리 자동 매핑 */}
          {viewMode === 'shape' && activeDomain && (
            <ShapeRenderer
              domain={activeDomain}
              blueprints={blueprints}
              records={filteredData}
              selectedAnchorId={expandedRow}
              onSelectRecord={(ancId) => {
                setExpandedRow(prev => prev === ancId ? null : ancId);
              }}
              onAddField={(anchorId, entityName, row) => {
                setInlineFieldAdderTarget({ anchorId, entityName, row });
              }}
            />
          )}

          {/* 怨꾩링???숈쟻 ?몃━ 酉?(?몃━ ?띿꽦???ы븿?섎뒗 ?꾨찓?몄뿉?쒕쭔 ?몄텧) */}
          {viewMode === 'tree' && hasTreeProperty && (
            <div className="domain-tree-view animate-fade-in">
              {/* 醫뚯륫: ?숈쟻 怨꾩링 ?몃━ 愿由??⑤꼸 */}
              <div className="tree-explorer-panel">
                <div className="tree-explorer-header">
                  <div className="tree-explorer-title">
                    <FolderTree size={16} />
                    <span>{activeDomain?.name || '도메인'} 계층 트리</span>
                  </div>
                  <div className="tree-explorer-actions">
                    <button 
                      type="button"
                      className="tree-small-btn add-root"
                      onClick={() => setShowAddRootInput(!showAddRootInput)}
                      title=""
                    >
                      <Plus size={11} /> 분류 추가
                    </button>
                    <button 
                      type="button"
                      className="tree-small-btn"
                      onClick={() => setCollapsedTreeNodes({})}
                      title="">
                        <RefreshCw size={13} />
                      </button>
                      </div>
                    </div>
                    {showAddRootInput && (
                      <div className="tree-add-root-box animate-slide-up">
                    <input
                      type="text"
                      placeholder=""
                      value={newRootLabel}
                      onChange={e => setNewRootLabel(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleAddRootNode();
                        if (e.key === 'Escape') setShowAddRootInput(false);
                      }}
                      autoFocus
                    />
                    <button type="button" className="btn-confirm" onClick={handleAddRootNode}>추가</button>
                    <button type="button" className="btn-cancel" onClick={() => setShowAddRootInput(false)}>취소</button>
                  </div>
                )}

                <div className="tree-nodes-list">
                  {/* 怨좎젙 ?몃뱶: ?꾩껜 蹂닿린 */}
                  <div
                    className={`master-tree-node-row static-node ${selectedNodePath === '전체' ? 'selected' : ''}`}
                    onClick={() => setSelectedNodePath('전체')}
                  >
                    <span className="tree-leaf-spacer" />
                    <span className="tree-node-icon"><FolderTree size={14} /></span>
                    <span className="tree-node-label">전체 데이터 해제</span>
                    <span className="tree-count-badge has-data">{pathDataCountMap.get('전체') || 0}</span>
                  </div>

                  {/* 留덉뒪???몃━ ?몃뱶 ?ш? 紐⑸줉 */}
                  {masterTreeData.length > 0 ? (
                    renderMasterTreeNodes(masterTreeData)
                  ) : (
                    <div className="tree-empty-message">
                      <span>🌲 아직 등록된 분류 항목이 없습니다.</span>
                      <button 
                        type="button"
                        className="tree-add-root-btn"
                        onClick={() => setShowAddRootInput(true)}
                      >
                        + 최상위 분류 노드 추가
                      </button>
                    </div>
                  )}

                  {/* 怨좎젙 ?몃뱶: (미분류) 해제 */}
                  <div
                    className={`master-tree-node-row static-node ${selectedNodePath === '(미분류)' ? 'selected' : ''}`}
                    onClick={() => setSelectedNodePath('(미분류)')}
                  >
                    <span className="tree-leaf-spacer" />
                    <span className="tree-node-icon"><FileText size={14} /></span>
                    <span className="tree-node-label">(미분류)</span>
                    <span className={`tree-count-badge ${(pathDataCountMap.get('(미분류)') || 0) > 0 ? 'has-data' : ''}`}>
                      {pathDataCountMap.get('(미분류)') || 0}
                    </span>
                  </div>
                </div>
              </div>

              {/* ?곗륫: ?좏깮???몃━ ?몃뱶???곌껐???곗씠??由ъ뒪??*/}
              <div className="tree-right-list-panel">
                {selectedLinkedDomain ? (
                  /* ===== ?좏깮???몃뱶???곌껐???꾨찓?몄쓽 援ъ꽦?먮즺 愿由??붾㈃ ===== */
                  <>
                    <div className="tree-list-header linked-header">
                      <div className="tree-list-title-wrap">
                        <button
                          type="button"
                          className="tree-list-path-icon-btn"
                          onClick={() => setShowFieldConfigModal(true)}
                          title=""
                        >
                          <span className="tree-list-path-icon">{selectedLinkedDomain.icon || '📁'}</span>
                          <span className="icon-btn-settings-badge"><Settings size={10} /></span>
                        </button>
                        <div>
                          <h3 className="tree-list-path-title">
                            {selectedLinkedDomain.name} 구성 데이터
                          </h3>
                          <span className="tree-list-count-desc">
                            "{selectedNodeDisplayLabel}" 노드 연결 ({selectedLinkedDomain.anchor === '이름' ? '인물 중심' : `${selectedLinkedDomain.anchor} 중심`}) · 구성요소 <strong>{activeLinkedFields.length}</strong>개 사용{unusedFieldsCount > 0 ? ` (${unusedFieldsCount}개 미사용)` : ''} · 데이터 {filteredLinkedData.length}건</span>
                        </div>
                      </div>

                      <div className="tree-list-header-actions" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {hiddenLinkedDetailFields.length > 0 && filteredLinkedData.length > 0 && (
                          <button
                            type="button"
                            className={`tree-small-btn toggle-all-hidden-btn ${expandedLinkedRows.size >= filteredLinkedData.length ? 'all-expanded' : ''}`}
                            onClick={() => {
                              if (expandedLinkedRows.size >= filteredLinkedData.length) {
                                setExpandedLinkedRows(new Set());
                              } else {
                                setExpandedLinkedRows(new Set(filteredLinkedData.map(r => r.anchorId)));
                              }
                            }}
                            title={expandedLinkedRows.size >= filteredLinkedData.length ? '모두 접기' : '모두 펼치기'}
                          >
                            <EyeOff size={13} />
                            <span>{expandedLinkedRows.size >= filteredLinkedData.length ? '감춤 항목 모두 접기' : '감춤 항목 모두 펼치기'}</span>
                          </button>
                        )}
                        <button
                          type="button"
                          className="crud-add-btn tree-add-data-btn"
                          onClick={() => {
                            setShowLinkedAddForm(true);
                            setShowLinkedAddHiddenFields(false);
                            setLinkedAddFormData({});
                          }}
                        >
                          <Plus size={14} /> + {selectedLinkedDomain.name} 새 데이터 추가
                        </button>
                      </div>
                    </div>

                    {/* 援ъ꽦?붿냼(?꾨뱶) ?ㅼ젙 愿由??앹뾽 紐⑤떖 */}
                    {showFieldConfigModal && (
                      <div className="modal-backdrop animate-fade-in" onClick={() => setShowFieldConfigModal(false)}>
                        <div 
                          className="field-config-modal animate-scale-in" 
                          onClick={e => e.stopPropagation()}
                        >
                          <div className="field-config-modal-header">
                            <div className="field-config-modal-title">
                              <span className="modal-icon">{selectedLinkedDomain.icon || '📁'}</span>
                              <div>
                                <h4>"{selectedLinkedDomain.name}" 구성요소(필드) 설정</h4>
                                <p>각 구성요소의 사용여부(미사용시 화면에서 제외) 및 보이기/감추기(체크시 별도 표시)를 관리합니다.</p>
                              </div>
                            </div>
                            <button
                              type="button"
                              className="modal-close-btn"
                              onClick={() => setShowFieldConfigModal(false)}
                              title=""
                            >
                              <X size={16} />
                            </button>
                          </div>

                          <div className="field-config-modal-body">
                            <table className="field-config-table">
                              <thead>
                                <tr>
                                  <th style={{ width: '42%' }}>구성요소(필드명)</th>
                                  <th style={{ width: '29%', textAlign: 'center' }}>사용여부</th>
                                  <th style={{ width: '29%', textAlign: 'center' }}>보기 / 감추기</th>
                                </tr>
                              </thead>
                              <tbody>
                                {linkedDomainFields.map(f => {
                                  const cfg = getConstituentFieldConfig(selectedLinkedDomain.id, f.name, selectedNode?.id);
                                  const isHidden = cfg.visibility === '감추기';
                                  const isUnused = cfg.useStatus === '비사용';

                                  return (
                                    <tr key={f.id} className={isUnused ? 'row-unused' : ''}>
                                      <td className="td-field-info">
                                        <div className="field-info-wrap">
                                          <span className="field-name-main">{f.name}</span>
                                          <span className="field-type-pill">{f.inputType}</span>
                                          {isUnused && <span className="field-badge-unused">비사용(부)</span>}
                                          {isHidden && !isUnused && (
                                            <span className="field-badge-hidden">
                                              기본 데이터 / 체크시 별도 감추기 설정
                                            </span>
                                          )}
                                        </div>
                                      </td>
                                      <td style={{ textAlign: 'center' }}>
                                        <button
                                          type="button"
                                          className={`btn-field-status use-${cfg.useStatus === '용' ? 'y' : 'n'}`}
                                          style={{ padding: '6px 14px', fontSize: '12px' }}
                                          onClick={() => handleUpdateConstituentFieldStatus(
                                            selectedLinkedDomain.id,
                                            f.name,
                                            { useStatus: cfg.useStatus === '용' ? '비사용' : '용' },
                                            selectedNode?.id
                                          )}
                                          title={`사용여부: ${cfg.useStatus} (체크시 적용, '미사용'이면 화면에 표시하지 않음)`}
                                        >
                                          {cfg.useStatus === '사용' ? '✅ 사용' : '⬜ 미사용(부)'}
                                        </button>
                                      </td>
                                      <td style={{ textAlign: 'center' }}>
                                        {cfg.useStatus === '용' ? (
                                          <button
                                            type="button"
                                            className={`btn-field-status vis-${cfg.visibility === '보기' ? 'show' : 'hide'}`}
                                            style={{ padding: '6px 14px', fontSize: '12px' }}
                                            onClick={() => handleUpdateConstituentFieldStatus(
                                              selectedLinkedDomain.id,
                                              f.name,
                                              { visibility: cfg.visibility === '보기' ? '감추기' : '보기' },
                                              selectedNode?.id
                                            )}
                                            title={`보이기/감추기 ${cfg.visibility} (체크시 적용, '감추기'체크시 별도 표시)`}
                                          >
                                            {cfg.visibility === '보기' ? <Eye size={13} /> : <EyeOff size={13} />}
                                            <span>{cfg.visibility}</span>
                                          </button>
                                        ) : (
                                          <span style={{ color: '#94a3b8', fontSize: '11px' }}>-</span>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>

                          <div className="field-config-modal-footer">
                            <span className="field-config-modal-hint">
                              아직 <strong>감추기</strong>로 설정된 구성요소는 표이기 향목에서 미표시되지만, 해당 항목을 <strong>체크시 별도</strong>하면 표시되는 설정입니다.
                            </span>
                            <button
                              type="button"
                              className="crud-save-btn"
                              onClick={() => setShowFieldConfigModal(false)}
                            >
                              확인 완료
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ?곌껐 ?꾨찓새 데이터 추가 ??*/}
                    {showLinkedAddForm && (
                      <div className="crud-form animate-slide-up" style={{ margin: '14px 20px' }}>
                        <div className="crud-form-header">
                          <span>+ "{selectedLinkedDomain.name}" 도메인에 새 데이터 추가</span>
                          <button className="crud-form-close" onClick={() => { setShowLinkedAddForm(false); setShowLinkedAddHiddenFields(false); }}>
                            <X size={14} />
                          </button>
                        </div>

                        {/* 湲곕낯 ?몄텧 援ъ꽦?붿냼(?꾨뱶) ?낅젰 ?꾨뱶 */}
                        <div className="crud-form-fields">
                          {(visibleLinkedColumns.length > 0 ? visibleLinkedColumns : hiddenLinkedDetailFields).map((f, fIdx) => {
                            const bp = blueprints.find(b => b.name === f.name) || f;
                            const isFullWidth = bp.displayWidth === 'full';
                            return (
                            <div key={f.id} className={`crud-form-field ${isFullWidth ? 'width-full' : ''}`}>
                              <label>{f.name}</label>
                              {f.inputType === 'tree' ? (
                                <TreeSelectInput
                                  value={linkedAddFormData[f.name] || ''}
                                  treeData={f.treeData}
                                  onChange={val => setLinkedAddFormData(prev => ({ ...prev, [f.name]: val }))}
                                  placeholder={`${f.name} 선택...`}
                                />
                              ) : f.inputType === 'composite' && f.parts && f.parts.length > 0 ? (
                                <CompositeInput
                                  blueprint={f}
                                  value={linkedAddFormData[f.name] || ''}
                                  onChange={val => setLinkedAddFormData(prev => ({ ...prev, [f.name]: val }))}
                                  existingCompositeValues={fieldExistingValuesMap.get(f.name) || []}
                                  existingPartValuesMap={partExistingValuesMap}
                                  autoFocus={fIdx === 0}
                                />
                              ) : isImageField(f, f.name, linkedAddFormData[f.name]) ? (
                                <ImageUploadInput
                                  value={linkedAddFormData[f.name] || ''}
                                  onChange={val => setLinkedAddFormData(prev => ({ ...prev, [f.name]: val }))}
                                  fieldName={f.name}
                                  onPreviewClick={url => {
                                    setLightboxImg(url);
                                    setLightboxAnchorId('');
                                    setLightboxFieldKey(f.name);
                                  }}
                                />
                              ) : (
                                <AutocompleteInput
                                  value={linkedAddFormData[f.name] || ''}
                                  onChange={val => setLinkedAddFormData(prev => ({ ...prev, [f.name]: autoFormatByBp(f, val) }))}
                                  placeholder={`${f.name} 입력...`}
                                  fieldName={f.name}
                                  existingValues={fieldExistingValuesMap.get(f.name) || []}
                                  autoFocus={fIdx === 0}
                                />
                              )}
                            </div>
                            );
                          })}
                        </div>

                        {/* 媛먯땄 ?ㅼ젙??援ъ꽦?붿냼: 湲곕낯? ?묓??덇퀬 踰꾪듉???뚮윭 ?쇱퀜??異붽? ?낅젰 */}
                        {visibleLinkedColumns.length > 0 && hiddenLinkedDetailFields.length > 0 && (
                          <div className="crud-form-hidden-section">
                            <button
                              type="button"
                              className={`crud-form-toggle-hidden-btn ${showLinkedAddHiddenFields ? 'expanded' : ''}`}
                              onClick={() => setShowLinkedAddHiddenFields(prev => !prev)}
                            >
                              <div className="toggle-hidden-left">
                                <EyeOff size={13} />
                                <span>숨겨진 항목 ({hiddenLinkedDetailFields.length}개: {hiddenLinkedDetailFields.map(h => h.name).join(', ')})</span>
                                {hiddenLinkedDetailFields.some(h => linkedAddFormData[h.name]?.trim()) && (
                                  <span className="toggle-hidden-filled-badge">
                                    {hiddenLinkedDetailFields.filter(h => linkedAddFormData[h.name]?.trim()).length}개 입력됨                                  </span>
                                )}
                              </div>
                              <div className="toggle-hidden-right">
                                <span>{showLinkedAddHiddenFields ? '감춤 항목 접기' : '펼쳐서 추가하기'}</span>
                                {showLinkedAddHiddenFields ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                              </div>
                            </button>

                            {showLinkedAddHiddenFields && (
                              <div className="crud-form-fields crud-form-hidden-fields animate-slide-up">
                                {hiddenLinkedDetailFields.map(f => {
                                  const bp = blueprints.find(b => b.name === f.name) || f;
                                  const isFullWidth = bp.displayWidth === 'full';
                                  return (
                                  <div key={f.id} className={`crud-form-field ${isFullWidth ? 'width-full' : ''}`}>
                                    <label>
                                      {f.name}
                                      <span className="crud-field-hidden-badge">숨겨진 항목</span>
                                    </label>
                                    {f.inputType === 'tree' ? (
                                      <TreeSelectInput
                                        value={linkedAddFormData[f.name] || ''}
                                        treeData={f.treeData}
                                        onChange={val => setLinkedAddFormData(prev => ({ ...prev, [f.name]: val }))}
                                        placeholder={`${f.name} 선택...`}
                                      />
                                    ) : f.inputType === 'composite' && f.parts && f.parts.length > 0 ? (
                                      <CompositeInput
                                        blueprint={f}
                                        value={linkedAddFormData[f.name] || ''}
                                        onChange={val => setLinkedAddFormData(prev => ({ ...prev, [f.name]: val }))}
                                        existingCompositeValues={fieldExistingValuesMap.get(f.name) || []}
                                        existingPartValuesMap={partExistingValuesMap}
                                      />
                                    ) : isImageField(f, f.name, linkedAddFormData[f.name]) ? (
                                      <ImageUploadInput
                                        value={linkedAddFormData[f.name] || ''}
                                        onChange={val => setLinkedAddFormData(prev => ({ ...prev, [f.name]: val }))}
                                        fieldName={f.name}
                                        onPreviewClick={url => {
                                          setLightboxImg(url);
                                          setLightboxAnchorId('');
                                          setLightboxFieldKey(f.name);
                                        }}
                                      />
                                    ) : (
                                      <AutocompleteInput
                                        value={linkedAddFormData[f.name] || ''}
                                        onChange={val => setLinkedAddFormData(prev => ({ ...prev, [f.name]: autoFormatByBp(f, val) }))}
                                        placeholder={`${f.name} 입력...`}
                                        fieldName={f.name}
                                        existingValues={fieldExistingValuesMap.get(f.name) || []}
                                      />
                                    )}
                                  </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}

                        <div className="crud-form-actions">
                          <button
                            type="button"
                            className="crud-save-btn"
                            onClick={() => {
                              if (Object.values(linkedAddFormData).some(v => v.trim())) {
                                addEntityToDomain(selectedLinkedDomain.id, linkedAddFormData);
                                setLinkedAddFormData({});
                                setShowLinkedAddForm(false);
                                setShowLinkedAddHiddenFields(false);
                              }
                            }}
                          >
                            <Save size={14} /> 저장 ???                          </button>
                          <button
                            type="button"
                            className="crud-cancel-btn"
                            onClick={() => { setShowLinkedAddForm(false); setShowLinkedAddHiddenFields(false); setLinkedAddFormData({}); }}
                          >
                            취소
                          </button>
                        </div>
                      </div>
                    )}

                    {/* ?곌껐 ?꾨찓???뚯씠釉?由ъ뒪??*/}
                    <div className="tree-table-container">
                      <table className="domain-table">
                        <thead>
                          <tr>
                            {visibleLinkedColumns.map(f => {
                              return (
                                <th
                                  key={f.id}
                                  onClick={() => handleSort(f.name)}
                                  className="sortable"
                                  title=""
                                >
                                  <div className="th-header-inner">
                                    <span className="th-header-name">
                                      {f.name}
                                    </span>
                                    {sortField === f.name && (
                                      sortAsc ? <ChevronUp size={12} /> : <ChevronDown size={12} />
                                    )}
                                  </div>
                                </th>
                              );
                            })}
                            <th className="th-actions">관리</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeLinkedFields.length === 0 ? (
                            <tr>
                              <td colSpan={2} className="td-empty" style={{ padding: '36px', textAlign: 'center', color: '#64748b' }}>
                                모든 구성요소(필드)가 <strong>미사용(부)</strong>으로 설정되어 화면에 표시되지 않습니다.<br />
                                상단 <span style={{ color: '#4f46e5', fontWeight: 600 }}>[최초 구성 데이터 설정]</span> 아이콘을 클릭하여 <strong>사용</strong>으로 변경해 주세요.
                              </td>
                            </tr>
                          ) : (
                            filteredLinkedData.map(row => {
                              const isEditing = editingRow === row.anchorId;
                              const isDeleting = deleteConfirm === row.anchorId;
                              const isExpanded = expandedLinkedRows.has(row.anchorId) && hiddenLinkedDetailFields.length > 0;

                              return (
                                <React.Fragment key={row.anchorId}>
                                  <tr 
                                    className={`${isEditing ? 'editing' : ''} ${isDeleting ? 'deleting' : ''} ${isExpanded ? 'expanded-row' : ''}`}
                                    onDoubleClick={() => {
                                      if (hiddenLinkedDetailFields.length > 0) {
                                        handleToggleExpandLinkedRow(row.anchorId);
                                      }
                                    }}
                                    style={hiddenLinkedDetailFields.length > 0 ? { cursor: 'pointer' } : undefined}
                                    title={hiddenLinkedDetailFields.length > 0 ? (isExpanded ? '감춤 항목 접기' : `감춤 항목 펼치기 (${hiddenLinkedDetailFields.length}개)`) : undefined}
                                  >
                                    {visibleLinkedColumns.map((f, fIdx) => {
                                      const isNameField = f.name === '이름';
                                      const profileImg = isNameField ? getProfileImage(row.data) : null;

                                      return (
                                        <td 
                                          key={f.id} 
                                          className={isNameField ? 'td-name' : ''}
                                        >
                                        {isEditing ? (
                                          f.inputType === 'tree' ? (
                                            <div onClick={e => e.stopPropagation()}>
                                              <TreeSelectInput
                                                value={editFormData[f.name] ?? row.data[f.name] ?? ''}
                                                treeData={f.treeData || masterTreeData}
                                                onChange={val => setEditFormData(prev => ({ ...prev, [f.name]: val }))}
                                              />
                                            </div>
                                          ) : f.inputType === 'composite' && f.parts && f.parts.length > 0 ? (
                                            <div onClick={e => e.stopPropagation()}>
                                              <CompositeInput
                                                blueprint={f}
                                                value={editFormData[f.name] ?? row.data[f.name] ?? ''}
                                                onChange={val => setEditFormData(prev => ({ ...prev, [f.name]: val }))}
                                                existingCompositeValues={fieldExistingValuesMap.get(f.name) || []}
                                                existingPartValuesMap={partExistingValuesMap}
                                                compact
                                              />
                                            </div>
                                          ) : isImageField(f, f.name, editFormData[f.name] ?? row.data[f.name]) ? (
                                            <div onClick={e => e.stopPropagation()}>
                                              <ImageUploadInput
                                                value={editFormData[f.name] ?? row.data[f.name] ?? ''}
                                                onChange={val => setEditFormData(prev => ({ ...prev, [f.name]: val }))}
                                                fieldName={f.name}
                                                compact
                                                onPreviewClick={url => {
                                                  setLightboxImg(url);
                                                  setLightboxAnchorId(row.anchorId);
                                                  setLightboxFieldKey(f.name);
                                                }}
                                              />
                                            </div>
                                          ) : (
                                            <div onClick={e => e.stopPropagation()}>
                                              <AutocompleteInput
                                                className="crud-inline-input"
                                                value={editFormData[f.name] ?? row.data[f.name] ?? ''}
                                                onChange={val => setEditFormData(prev => ({ ...prev, [f.name]: autoFormatByBp(f, val) }))}
                                                fieldName={f.name}
                                                existingValues={fieldExistingValuesMap.get(f.name) || []}
                                              />
                                            </div>
                                          )
                                        ) : isNameField ? (
                                          <div className="profile-cell-wrapper" style={{ display: 'inline-flex', alignItems: 'center', gap: '10px' }}>
                                            <div
                                              className="profile-avatar-container"
                                              style={{
                                                position: 'relative',
                                                width: '32px',
                                                height: '32px',
                                                borderRadius: '50%',
                                                flexShrink: 0,
                                                overflow: 'hidden',
                                                cursor: 'pointer'
                                              }}
                                              title={profileImg ? '클릭하여 사진 크게 보기 / 변경' : '클릭하여 프로필 사진 등록'}
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                if (profileImg) {
                                                  setLightboxImg(profileImg.url);
                                                  setLightboxAnchorId(row.anchorId);
                                                  setLightboxFieldKey(profileImg.key);
                                                } else {
                                                  document.getElementById(`avatar-file-${row.anchorId}`)?.click();
                                                }
                                              }}
                                            >
                                              {profileImg ? (
                                                <img src={profileImg.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                              ) : (
                                                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9', borderRadius: '50%' }}>
                                                  <Camera size={14} style={{ color: '#94a3b8' }} />
                                                </div>
                                              )}
                                                <input type="file"
                                                accept="image/*"
                                                style={{ display: 'none' }}
                                                onChange={async (e) => {
                                                  const file = e.target.files?.[0];
                                                  if (file) {
                                                    const compressed = await compressImageFile(file);
                                                    let finalUrl = compressed;
                                                    try {
                                                      finalUrl = await uploadImageToLocal(compressed);
                                                    } catch (err) {
                                                      console.error('Local upload failed, fallback to base64', err);
                                                    }
                                                    updateEntityField(row.anchorId, '사진', finalUrl);
                                                  }
                                                }}
                                              />
                                            </div>
                                            <span className="profile-name-text">
                                              {autoFormatByBp(f, row.data[f.name] || '') || '-'}
                                            </span>
                                            {hiddenLinkedDetailFields.length > 0 && (
                                              <button 
                                                type="button"
                                                className={`linked-expand-btn ${isExpanded ? 'expanded' : ''}`}
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleToggleExpandLinkedRow(row.anchorId);
                                                }}
                                                title={isExpanded ? '감춤 항목 접기' : `감춤 항목 펼치기 (${hiddenLinkedDetailFields.length}개)`}
                                              >
                                                {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                              </button>
                                            )}
                                          </div>
                                        ) : isImageField(f, f.name, row.data[f.name]) && row.data[f.name] ? (
                                          <img
                                            src={row.data[f.name]}
                                            alt={f.name}
                                            style={{ width: '32px', height: '32px', objectFit: 'cover', borderRadius: '4px', verticalAlign: 'middle', cursor: 'pointer', border: '1px solid #cbd5e1' }}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setLightboxImg(row.data[f.name]);
                                              setLightboxAnchorId(row.anchorId);
                                              setLightboxFieldKey(f.name);
                                            }}
                                            title="클릭하여 원본 보기"
                                          />
                                        ) : (
                                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                            <span>{autoFormatByBp(f, row.data[f.name] || '') || '-'}</span>
                                            {hiddenLinkedDetailFields.length > 0 && fIdx === 0 && (
                                              <button 
                                                type="button"
                                                className={`linked-expand-btn ${isExpanded ? 'expanded' : ''}`}
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleToggleExpandLinkedRow(row.anchorId);
                                                }}
                                                title={isExpanded ? '감춤 항목 접기' : `감춤 항목 펼치기 (${hiddenLinkedDetailFields.length}개)`}
                                              >
                                                {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                              </button>
                                            )}
                                          </div>
                                        )}
                                      </td>
                                    );
                                  })}

                                  {/* 愿由??≪뀡 */}
                                  <td className="td-actions" onClick={e => e.stopPropagation()}>
                                    {isDeleting ? (
                                      <div className="delete-confirm">
                                        <span>삭제?</span>
                                        <button className="action-btn confirm-yes" title="삭제 확정" onClick={() => {
                                          removeEntityFromDomain(selectedLinkedDomain.id, row.anchorId);
                                          setDeleteConfirm(null);
                                          setEditingRow(null);
                                          setEditFormData({});
                                        }}></button>
                                        <button className="action-btn confirm-no" title="삭제 취소" onClick={() => setDeleteConfirm(null)}>취소</button>
                                      </div>
                                    ) : isEditing ? (
                                      <>
                                        {hiddenLinkedDetailFields.length > 0 && (
                                          <button 
                                            type="button"
                                            className={`action-btn toggle-detail ${isExpanded ? 'active' : ''}`}
                                            title={isExpanded ? '감춤 항목 접기' : `감춤 항목 펼치기 (${hiddenLinkedDetailFields.length}개)`}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleToggleExpandLinkedRow(row.anchorId);
                                            }}
                                          >
                                            <EyeOff size={13} />
                                            {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                                          </button>
                                        )}
                                        <button className="action-btn cancel" title="취소" onClick={() => { setEditingRow(null); setEditFormData({}); }}>
                                          <X size={14} />
                                        </button>
                                        <button
                                          className="action-btn save"
                                          title="저장"
                                          onClick={() => handleSaveEdit(row.anchorId)}
                                        >
                                          <Save size={14} />
                                        </button>
                                        <button
                                          className="action-btn delete"
                                          title={`${selectedLinkedDomain.name}에서 삭제`} 
                                          onClick={() => setDeleteConfirm(row.anchorId)}
                                        >
                                          <Trash2 size={14} />
                                        </button>
                                      </>
                                    ) : (
                                      <button 
                                        className="action-btn settings" 
                                        title="저장" 
                                        onClick={() => {
                                          setEditingRow(row.anchorId);
                                          setEditFormData({ ...row.data });
                                          if (hiddenLinkedDetailFields.length > 0) {
                                            setExpandedLinkedRows(prev => new Set(prev).add(row.anchorId));
                                          }
                                        }}
                                      >
                                        <Settings size={15} />
                                      </button>
                                    )}
                                  </td>
                                </tr>

                                {/* ?붾툝?대┃ ?먮뒗 ?쇱묠 踰꾪듉 ?대┃ ???꾨옒???섑??섎뒗 ?쇱묠 ?곸꽭 ??*/}
                                {isExpanded && (
                                  <tr 
                                    key={`${row.anchorId}-detail`} 
                                    className="detail-row linked-detail-row"
                                    onDoubleClick={() => handleToggleExpandLinkedRow(row.anchorId)}
                                    title="저장"
                                  >
                                    <td colSpan={visibleLinkedColumns.length + 1}>
                                      <div className="linked-detail-container">
                                        <div className="linked-detail-header">
                                          <div className="linked-detail-header-left">
                                            <EyeOff size={13} className="linked-detail-icon" />
                                            <span className="linked-detail-title">
                                              {isEditing ? '현재 구성요소 편집' : '현재 구성요소 보기'}
                                            </span>
                                            <span className="linked-detail-count">{hiddenLinkedDetailFields.length}개</span>
                                          </div>
                                        </div>
                                        <div className="detail-grid">
                                          {hiddenLinkedDetailFields.map(hf => {
                                            const bp = blueprints.find(b => b.name === hf.name) || hf;
                                            const isFullWidth = bp.displayWidth === 'full';
                                            return (
                                            <div key={hf.id} className={`detail-item ${isFullWidth ? 'width-full' : ''}`}>
                                              <span className="detail-label">{hf.name}</span>
                                              <span className="detail-value">
                                                {isEditing ? (
                                                  hf.inputType === 'tree' ? (
                                                    <div onClick={e => e.stopPropagation()}>
                                                      <TreeSelectInput
                                                        value={editFormData[hf.name] ?? row.data[hf.name] ?? ''}
                                                        treeData={hf.treeData || masterTreeData}
                                                        onChange={val => setEditFormData(prev => ({ ...prev, [hf.name]: val }))}
                                                      />
                                                    </div>
                                                  ) : hf.inputType === 'composite' && hf.parts && hf.parts.length > 0 ? (
                                                    <div onClick={e => e.stopPropagation()}>
                                                      <CompositeInput
                                                        blueprint={hf}
                                                        value={editFormData[hf.name] ?? row.data[hf.name] ?? ''}
                                                        onChange={val => setEditFormData(prev => ({ ...prev, [hf.name]: val }))}
                                                        existingCompositeValues={fieldExistingValuesMap.get(hf.name) || []}
                                                        existingPartValuesMap={partExistingValuesMap}
                                                        compact
                                                      />
                                                    </div>
                                                  ) : isImageField(hf, hf.name, editFormData[hf.name] ?? row.data[hf.name]) ? (
                                                    <div onClick={e => e.stopPropagation()}>
                                                      <ImageUploadInput
                                                        value={editFormData[hf.name] ?? row.data[hf.name] ?? ''}
                                                        onChange={val => setEditFormData(prev => ({ ...prev, [hf.name]: val }))}
                                                        fieldName={hf.name}
                                                        compact
                                                        onPreviewClick={url => {
                                                          setLightboxImg(url);
                                                          setLightboxAnchorId(row.anchorId);
                                                          setLightboxFieldKey(hf.name);
                                                        }}
                                                      />
                                                    </div>
                                                  ) : (
                                                    <div onClick={e => e.stopPropagation()}>
                                                      <AutocompleteInput
                                                        className="crud-inline-input"
                                                        value={editFormData[hf.name] ?? row.data[hf.name] ?? ''}
                                                        onChange={val => setEditFormData(prev => ({ ...prev, [hf.name]: autoFormatByBp(hf, val) }))}
                                                        fieldName={hf.name}
                                                        existingValues={fieldExistingValuesMap.get(hf.name) || []}
                                                      />
                                                    </div>
                                                  )
                                                ) : isImageField(hf, hf.name, row.data[hf.name]) && row.data[hf.name] ? (
                                                  <img
                                                    src={row.data[hf.name]}
                                                    alt={hf.name}
                                                    style={{ maxWidth: '120px', maxHeight: '120px', objectFit: 'contain', borderRadius: '6px', cursor: 'pointer', border: '1px solid #cbd5e1' }}
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      setLightboxImg(row.data[hf.name]);
                                                      setLightboxAnchorId(row.anchorId);
                                                      setLightboxFieldKey(hf.name);
                                                    }}
                                                    title="클릭하여 원본 보기"
                                                  />
                                                ) : (
                                                  autoFormatByBp(hf, row.data[hf.name] || '') || '-'
                                                )}
                                              </span>
                                            </div>
                                          );
                                        })}
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })
                        )}

                      {activeLinkedFields.length > 0 && filteredLinkedData.length === 0 && (
                        <tr>
                          <td colSpan={(visibleLinkedColumns.length || 1) + 1} className="td-empty">
                            <div className="tree-empty-list-notice">
                              <span>
                                📁 "{selectedLinkedDomain.name}" 도메인에 연결된 데이터가 없습니다.
                              </span>
                              <button
                                type="button"
                                className="tree-add-data-inline-btn"
                                onClick={() => {
                                  setShowLinkedAddForm(true);
                                  setShowLinkedAddHiddenFields(false);
                                  setLinkedAddFormData({});
                                }}
                              >
                                + 이어서 "{selectedLinkedDomain.name}" 데이터 추가
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  /* ===== ?곌껐???꾨찓?몄씠 ?녿뒗 ?쇰컲 ?몃뱶: 湲곗〈 ?몃━ 遺꾨쪟 ?곗씠??由ъ뒪??===== */
                  <>
                    <div className="tree-list-header">
                      <div className="tree-list-title-wrap">
                        <span className="tree-list-path-icon">📁</span>
                        <div>
                          <h3 className="tree-list-path-title">
                            {selectedNodePath === '전체' ? '전체 데이터 리스트' : selectedNodePath === '(미분류)' ? '미분류 데이터 리스트' : `${selectedNodePath} 분류 데이터`}
                          </h3>
                          <span className="tree-list-count-desc">
                            연결된 데이터 총<strong>{rightListData.length}</strong>건
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        className="crud-add-btn tree-add-data-btn"
                        onClick={() => {
                          setShowAddForm(true);
                          const defaultPath = selectedNodePath === '전체' || selectedNodePath === '(미분류)' ? '' : selectedNodePath;
                          setAddFormData(treeField ? { [treeField.name]: defaultPath } : {});
                        }}
                      >
                        <Plus size={14} /> 이 분류에 새 데이터 추가
                      </button>
                    </div>

                    {/* ?곌껐 ?곗씠???뚯씠釉?由ъ뒪??*/}
                    <div className="tree-table-container">
                      <table className="domain-table">
                        <thead>
                          <tr>
                            {fields.map(f => (
                              <th key={f.id} onClick={() => handleSort(f.name)} className="sortable">
                                {f.name}
                                {sortField === f.name && (
                                  sortAsc ? <ChevronUp size={12} /> : <ChevronDown size={12} />
                                )}
                              </th>
                            ))}
                            {treeField && !fields.some(f => f.name === treeField.name) && (
                              <th>분류 경로</th>
                            )}
                            <th className="th-actions">관리</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rightListData.map(row => {
                            const isEditing = editingRow === row.anchorId;
                            const isDeleting = deleteConfirm === row.anchorId;

                            return (
                              <tr 
                                key={row.anchorId}
                                className={`${isEditing ? 'editing' : ''} ${isDeleting ? 'deleting' : ''}`}
                              >
                                {fields.map(f => {
                                  const isNameField = f.name === '이름';
                                  const profileImg = isNameField ? getProfileImage(row.data) : null;

                                  return (
                                    <td key={f.id} className={isNameField ? 'td-name' : ''}>
                                      {isEditing ? (
                                        f.inputType === 'tree' ? (
                                          <div onClick={e => e.stopPropagation()}>
                                            <TreeSelectInput
                                              value={editFormData[f.name] ?? row.data[f.name] ?? ''}
                                              treeData={f.treeData || masterTreeData}
                                              onChange={val => setEditFormData(prev => ({ ...prev, [f.name]: val }))}
                                            />
                                          </div>
                                        ) : f.inputType === 'composite' && f.parts && f.parts.length > 0 ? (
                                          <div onClick={e => e.stopPropagation()}>
                                            <CompositeInput
                                              blueprint={f}
                                              value={editFormData[f.name] ?? row.data[f.name] ?? ''}
                                              onChange={val => setEditFormData(prev => ({ ...prev, [f.name]: val }))}
                                              existingCompositeValues={fieldExistingValuesMap.get(f.name) || []}
                                              existingPartValuesMap={partExistingValuesMap}
                                              compact
                                            />
                                          </div>
                                        ) : isImageField(f, f.name, editFormData[f.name] ?? row.data[f.name]) ? (
                                          <div onClick={e => e.stopPropagation()}>
                                            <ImageUploadInput
                                              value={editFormData[f.name] ?? row.data[f.name] ?? ''}
                                              onChange={val => setEditFormData(prev => ({ ...prev, [f.name]: val }))}
                                              fieldName={f.name}
                                              compact
                                              onPreviewClick={url => {
                                                setLightboxImg(url);
                                                setLightboxAnchorId(row.anchorId);
                                                setLightboxFieldKey(f.name);
                                              }}
                                            />
                                          </div>
                                        ) : (
                                          <div onClick={e => e.stopPropagation()}>
                                            <AutocompleteInput
                                              className="crud-inline-input"
                                              value={editFormData[f.name] ?? row.data[f.name] ?? ''}
                                              onChange={val => setEditFormData(prev => ({ ...prev, [f.name]: autoFormatByBp(f, val) }))}
                                              fieldName={f.name}
                                              existingValues={fieldExistingValuesMap.get(f.name) || []}
                                            />
                                          </div>
                                        )
                                      ) : isNameField ? (
                                        <div className="profile-cell-wrapper" style={{ display: 'inline-flex', alignItems: 'center', gap: '10px' }}>
                                          <div
                                            className="profile-avatar-container"
                                            style={{
                                              position: 'relative',
                                              width: '32px',
                                              height: '32px',
                                              borderRadius: '50%',
                                              flexShrink: 0,
                                              overflow: 'hidden',
                                            }}
                                          >
                                            {profileImg ? (
                                              <img src={profileImg.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            ) : (
                                              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9', borderRadius: '50%' }}>
                                                <Camera size={14} style={{ color: '#94a3b8' }} />
                                              </div>
                                            )}
                                              <input type="file" style={{ display: 'none' }} />
                                          </div>
                                          <span className="profile-name-text">
                                            {autoFormatByBp(f, row.data[f.name] || '') || '-'}
                                          </span>
                                        </div>
                                      ) : f.inputType === 'tree' && row.data[f.name] ? (
                                        <span className="tree-path-display">
                                          {row.data[f.name].split(' > ').map((seg: string, i: number, arr: string[]) => (
                                            <React.Fragment key={i}>
                                              <span className="tree-path-segment">{seg}</span>
                                              {i < arr.length - 1 && <ChevronRight size={10} className="tree-path-sep" />}
                                            </React.Fragment>
                                          ))}
                                        </span>
                                      ) : isImageField(f, f.name, row.data[f.name]) && row.data[f.name] ? (
                                        <img
                                          src={row.data[f.name]}
                                          alt={f.name}
                                          style={{ width: '32px', height: '32px', objectFit: 'cover', borderRadius: '4px', verticalAlign: 'middle', cursor: 'pointer', border: '1px solid #cbd5e1' }}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setLightboxImg(row.data[f.name]);
                                            setLightboxAnchorId(row.anchorId);
                                            setLightboxFieldKey(f.name);
                                          }}
                                          title="클릭하여 원본 보기"
                                        />
                                      ) : (
                                        autoFormatByBp(f, row.data[f.name] || '') || '-'
                                      )}
                                    </td>
                                  );
                                })}

                                {/* 遺꾨쪟 寃쎈줈 而щ읆 (?꾨찓??fields???몃━ ?꾨뱶媛 吏곸젒 ?몄텧?섏? ?딆? 寃쎌슦?먮룄 ?쒖떆) */}
                                {treeField && !fields.some(f => f.name === treeField.name) && (
                                  <td>
                                    {isEditing ? (
                                      <div onClick={e => e.stopPropagation()}>
                                        <TreeSelectInput
                                          value={editFormData[treeField.name] ?? row.data[treeField.name] ?? ''}
                                          treeData={treeField.treeData || masterTreeData}
                                          onChange={val => setEditFormData(prev => ({ ...prev, [treeField.name]: val }))}
                                        />
                                      </div>
                                    ) : row.data[treeField.name] ? (
                                      <span className="tree-path-display">
                                        {row.data[treeField.name].split(' > ').map((seg: string, i: number, arr: string[]) => (
                                          <React.Fragment key={i}>
                                            <span className="tree-path-segment">{seg}</span>
                                            {i < arr.length - 1 && <ChevronRight size={10} className="tree-path-sep" />}
                                          </React.Fragment>
                                        ))}
                                      </span>
                                    ) : (
                                      <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>(미분류)</span>
                                    )}
                                  </td>
                                )}

                                {/* 愿由??≪뀡 */}
                                <td className="td-actions" onClick={e => e.stopPropagation()}>
                                  {isDeleting ? (
                                    <div className="delete-confirm">
                                      <span>삭제?</span>
                                      <button className="action-btn confirm-yes" title="삭제 확정" onClick={() => {
                                        if (activeDomain) removeEntityFromDomain(activeDomain.id, row.anchorId);
                                        setDeleteConfirm(null);
                                        setEditingRow(null);
                                        setEditFormData({});
                                      }}></button>
                                      <button className="action-btn confirm-no" title="삭제 취소" onClick={() => setDeleteConfirm(null)}>취소</button>
                                    </div>
                                  ) : isEditing ? (
                                    <>
                                      <button className="action-btn cancel" title="취소" onClick={() => { setEditingRow(null); setEditFormData({}); }}>
                                        <X size={14} />
                                      </button>
                                      <button
                                        className="action-btn save"
                                        title="저장"
                                        onClick={() => handleSaveEdit(row.anchorId)}
                                      >
                                        <Save size={14} />
                                      </button>
                                      <button
                                        className="action-btn delete"
                                        title={`${activeDomain?.name || '도메인'}에서 삭제`} 
                                        onClick={() => setDeleteConfirm(row.anchorId)}
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                      <button
                                        type="button"
                                        className="action-btn add-field"
                                        title="이 레코드 또는 도메인에 새 필드 추가"
                                        onClick={() => setInlineFieldAdderTarget({
                                          anchorId: row.anchorId,
                                          entityName: row.data['이름'] || row.data['제목'] || row.anchorId,
                                          row
                                        })}
                                      >
                                        <Plus size={14} />
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      {activeDomain && !isAllMode && (
                                        <button 
                                          className="action-btn settings" 
                                          title="저장" 
                                          onClick={() => {
                                            setEditingRow(row.anchorId);
                                            setEditFormData({ ...row.data });
                                          }}
                                        >
                                          <Settings size={15} />
                                        </button>
                                      )}
                                    </>
                                  )}
                                </td>
                              </tr>
                            );
                          })}

                          {rightListData.length === 0 && (
                            <tr>
                              <td colSpan={fields.length + 2} className="td-empty">
                                <div className="tree-empty-list-notice">
                                  <span>현재 "{selectedNodePath}" 경로에 연결된 데이터가 없습니다.</span>
                                  <button
                                    type="button"
                                    className="tree-add-data-inline-btn"
                                    onClick={() => {
                                      setShowAddForm(true);
                                      const defaultPath = selectedNodePath === '전체' || selectedNodePath === '(미분류)' ? '' : selectedNodePath;
                                      setAddFormData(treeField ? { [treeField.name]: defaultPath } : {});
                                    }}
                                  >
                                    + 이 분류에 새 데이터 추가
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ??젣 ?덈궡 ?좎뒪??*/}
      {deleteConfirm && activeDomain && (
        <div className="delete-toast">
          현재 "{activeDomain.name}"에서 선택한 분류의 데이터는 아직 없습니다.
        </div>
      )}

      {/* 프로필 이미지 ?먮낯 ?뺣? & 愿由?紐⑤떖 (Lightbox) */}
      {lightboxImg && (
        <div 
          className="avatar-lightbox-backdrop"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999
          }}
          onClick={() => setLightboxImg(null)}
        >
          <div 
            style={{
              background: '#fff',
              borderRadius: '12px',
              padding: '20px',
              maxWidth: '90vw',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '14px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.3)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1e293b' }}>프로필 이미지</span>
              <button 
                onClick={() => setLightboxImg(null)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={18} />
              </button>
            </div>
            <img 
              src={lightboxImg} 
              alt="" 
              style={{ maxWidth: '360px', maxHeight: '360px', objectFit: 'contain', borderRadius: '8px', border: '1px solid #e2e8f0' }}
            />
            <div style={{ display: 'flex', gap: '8px', width: '100%', justifyContent: 'flex-end' }}>
              <label style={{
                background: '#4f46e5',
                color: '#fff',
                padding: '6px 14px',
                borderRadius: '6px',
                fontSize: '0.82rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                <Camera size={14} />
                <span>사진 변경</span>
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file && lightboxAnchorId) {
                      const compressed = await compressImageFile(file);
                      let finalUrl = compressed;
                      try {
                        finalUrl = await uploadImageToLocal(compressed);
                      } catch (err) {
                        console.error('Local upload failed, fallback to base64', err);
                      }
                      updateEntityField(lightboxAnchorId, lightboxFieldKey || '사진', finalUrl);
                      setLightboxImg(finalUrl);
                    }
                  }}
                />
              </label>
              <button
                style={{
                  background: '#fee2e2',
                  color: '#dc2626',
                  border: '1px solid #fecaca',
                  padding: '6px 14px',
                  borderRadius: '6px',
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
                onClick={() => {
                  if (lightboxAnchorId) {
                    updateEntityField(lightboxAnchorId, lightboxFieldKey || '사진', '');
                    setLightboxImg(null);
                  }
                }}
              >
                <Trash2 size={14} />
                <span>사진 삭제</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 1. ?몃━ ?몃뱶 肄섑뀓?ㅽ듃 硫붾돱 (?고겢由??먮뒗 선택 버튼 클릭 시 */}
      {nodeContextMenu && typeof document !== 'undefined' && createPortal(
        <div
          className="tree-node-context-menu animate-scale-in"
          style={{
            position: 'fixed',
            top: `${nodeContextMenu.y}px`,
            left: `${nodeContextMenu.x}px`,
            zIndex: 999999,
          }}
          onClick={e => e.stopPropagation()}
        >
          <div className="tree-menu-header">
            <span>선택 분류 노드 관리</span>
            <button type="button" className="tree-menu-close" onClick={() => setNodeContextMenu(null)}>✕</button>
          </div>
          <div className="tree-menu-items">
            <button
              type="button"
              className="tree-menu-item"
              onClick={() => {
                setAddingChildParentId(nodeContextMenu.nodeId);
                setNewChildLabel('');
                setNodeContextMenu(null);
              }}
            >
              <Plus size={13} />
              <span>하위 분류 추가</span>
            </button>

            <button
              type="button"
              className="tree-menu-item highlight"
              onClick={() => {
                const target = masterTreeData ? findNodeById(masterTreeData, nodeContextMenu.nodeId) : null;
                if (target) handleOpenPropsModal(target);
              }}
            >
              <Sliders size={13} />
              <span>노드 속성 관리(상세)</span>
            </button>

            <button
              type="button"
              className="tree-menu-item"
              onClick={() => {
                setLinkingNodeId(nodeContextMenu.nodeId);
                setNodeContextMenu(null);
              }}
            >
              <Link2 size={13} />
              <span>도메인에 연결</span>
            </button>

            <div className="tree-menu-divider" />

            <button
              type="button"
              className="tree-menu-item"
              onClick={() => handleMoveNode(nodeContextMenu.nodeId, 'up')}
            >
              <ArrowUp size={13} />
              <span>위로 이동</span>
            </button>

            <button
              type="button"
              className="tree-menu-item"
              onClick={() => handleMoveNode(nodeContextMenu.nodeId, 'down')}
            >
              <ArrowDown size={13} />
              <span>아래로 이동</span>
            </button>

            <div className="tree-menu-divider" />

            <button
              type="button"
              className="tree-menu-item delete"
              onClick={() => {
                const target = masterTreeData ? findNodeById(masterTreeData, nodeContextMenu.nodeId) : null;
                if (target) handleDeleteNode(target.id, target.label);
                setNodeContextMenu(null);
              }}
            >
              <Trash2 size={13} />
              <span>노드 삭제</span>
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* 2. ?몃━ ?몃뱶 ?띿꽦 愿由?紐⑤떖 */}
      {propsModalNode && typeof document !== 'undefined' && createPortal(
        <div className="tree-props-modal-overlay animate-fade-in" onClick={() => setPropsModalNode(null)}>
          <div className="tree-props-modal-content animate-scale-in" onClick={e => e.stopPropagation()}>
            <div className="tree-props-modal-header">
              <div className="tree-props-modal-title">
                <Settings size={16} />
                <span>분류 노드 속성 관리</span>
              </div>
              <button type="button" className="tree-props-modal-close" onClick={() => setPropsModalNode(null)}>✕</button>
            </div>

            <div className="tree-props-modal-body">
              {/* 遺꾨쪟紐?*/}
              <div className="tree-props-form-group">
                <label>분류 명칭 <span className="required">*</span></label>
                <input
                  type="text"
                  className="tree-props-input"
                  value={nodePropsForm.label}
                  onChange={e => setNodePropsForm(prev => ({ ...prev, label: e.target.value }))}
                  placeholder="" />
                  </div>
                  <div className="tree-props-form-group">
                <label>분류 식별 코드 (선택)</label>
                <input
                  type="text"
                  className="tree-props-input"
                  value={nodePropsForm.code}
                  onChange={e => setNodePropsForm(prev => ({ ...prev, code: e.target.value }))}
                  placeholder="예: HIST-01, ARC-1950 등"
                />
                <span className="tree-props-guide">분류 트리에서 노드 옆에 뱃지로 함께 표시됩니다.</span>
              </div>

              {/* ????꾩씠肄??좏깮 */}
              <div className="tree-props-form-group">
                <label>노드 표시 아이콘</label>
                <div className="tree-props-icon-palette">
                  {['📁', '📂', '📄', '📜', '📦', '🏷️', '🔖', '📌', '🏛️', '👤', '🏢', '📖', '🔍', '⚙️', '⭐'].map(ic => (
                    <button
                      key={ic}
                      type="button"
                      className={`tree-props-icon-btn ${nodePropsForm.icon === ic ? 'selected' : ''}`}
                      onClick={() => setNodePropsForm(prev => ({ ...prev, icon: ic }))}
                    >
                      {ic}
                    </button>
                  ))}
                </div>
              </div>

              {/* ?곌껐 ?꾨찓???좏깮 */}
              <div className="tree-props-form-group">
                <label>연결 도메인</label>
                <select
                  className="tree-props-select"
                  value={nodePropsForm.linkedDomainId}
                  onChange={e => setNodePropsForm(prev => ({ ...prev, linkedDomainId: e.target.value }))}
                >
                  <option value="">(연결된 도메인 없음)</option>
                  {domains.map(dom => (
                    <option key={dom.id} value={dom.id}>
                      {dom.icon} {dom.name} ({dom.fields.length}개 필드)
                    </option>
                  ))}
                </select>
                <span className="tree-props-guide">노드 클릭 시 해당 도메인 데이터로 직접 이동합니다.</span>
              </div>

              {/* ?ㅻ챸 諛?硫붾え */}
              <div className="tree-props-form-group">
                <label>분류 설명 / 편집 기준 메몪</label>
                <textarea
                  className="tree-props-textarea"
                  rows={3}
                  value={nodePropsForm.description}
                  onChange={e => setNodePropsForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder=""
                />
              </div>
            </div>

            <div className="tree-props-modal-footer">
              <button type="button" className="tree-props-btn cancel" onClick={() => setPropsModalNode(null)}>
                취소
              </button>
              <button type="button" className="tree-props-btn save" onClick={handleSaveNodeProps}>
                속성 저장
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 인라인 필드 추가 모달 */}
      {inlineFieldAdderTarget && (
        <InlineFieldAdderModal
          isOpen={true}
          onClose={() => setInlineFieldAdderTarget(null)}
          domainId={activeDomain?.id || ''}
          domainName={activeDomain?.name || ''}
          anchorId={inlineFieldAdderTarget.anchorId}
          entityName={inlineFieldAdderTarget.entityName}
          existingRecordFieldNames={Object.keys(inlineFieldAdderTarget.row?.data || {}).filter(k => !k.startsWith('_'))}
          domainFieldNames={activeDomain?.fields || []}
          onFieldAdded={(fieldName, scope, value) => {
            if (scope === 'record') {
              updateEntityField(inlineFieldAdderTarget.anchorId, fieldName, value);
              if (editingRow === inlineFieldAdderTarget.anchorId) {
                setEditFormData(prev => ({ ...prev, [fieldName]: value }));
              }
            } else {
              if (value) {
                updateEntityField(inlineFieldAdderTarget.anchorId, fieldName, value);
                if (editingRow === inlineFieldAdderTarget.anchorId) {
                  setEditFormData(prev => ({ ...prev, [fieldName]: value }));
                }
              }
            }
          }}
        />
      )}
    </div>
  );
};
