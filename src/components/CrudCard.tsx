import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useDataStore } from '../store/useDataStore';
import { Save, CheckSquare, ChevronDown, X, Upload, Link2, Plus, ChevronRight } from 'lucide-react';
import { applyAutoFormat, applyNameFormatOnBlur, compressImageFile } from '../utils/formatters';
import type { Domain } from '../types';
import './CrudCard.css';

interface CrudCardProps {
  anchorAtomId: string | null;
  onClose: () => void;
}

// ── 자동완성 입력 필드 컴포넌트 ──────────────────────────────────
interface AutocompleteInputProps {
  typeId: string;
  typeDef: { id: string; name: string; description: string; inputType: string; displayWidth: string };
  value: string;
  isAnchor: boolean;
  suggestions: string[];
  onChange: (val: string) => void;
  onRemove: () => void;
}

const AutocompleteInput: React.FC<AutocompleteInputProps> = ({
  typeId, typeDef, value, isAnchor, suggestions, onChange, onRemove
}) => {
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);

  // 현재 입력값으로 필터링된 후보 목록 (공백 정규화 포함, 자기 자신 제외)
  const normalizedVal = value.replace(/\s+/g, '').toLowerCase();
  const filtered = suggestions.filter(s => {
    if (s === value) return false; // 현재 값과 동일하면 제외
    return s.replace(/\s+/g, '').toLowerCase().includes(normalizedVal);
  }).slice(0, 8);

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    const handleOut = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setHighlightIdx(-1);
      }
    };
    document.addEventListener('mousedown', handleOut);
    return () => document.removeEventListener('mousedown', handleOut);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const formatted = applyAutoFormat(e.target.value, typeDef.name, typeDef.inputType);
    onChange(formatted);
    setOpen(true);
    setHighlightIdx(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Shift+Enter는 상위 handleKeyDown이 처리 — 여기서는 방향키/선택만
    if (!open || filtered.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx(prev => Math.min(prev + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx(prev => Math.max(prev - 1, -1));
    } else if (e.key === 'Enter' && highlightIdx >= 0) {
      e.stopPropagation(); // 상위 Shift+Enter 저장과 충돌 방지
      onChange(filtered[highlightIdx]);
      setOpen(false);
      setHighlightIdx(-1);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setHighlightIdx(-1);
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const formatted = applyNameFormatOnBlur(e.target.value, typeDef.name);
    if (formatted !== e.target.value) onChange(formatted);
  };

  const isTextarea = typeDef.inputType === 'textarea';
  const inputCls = `crud-input${isTextarea ? ' crud-textarea' : ''}`;

  return (
    <div ref={wrapRef} style={{ position: 'relative', flex: 1 }}>
      {isTextarea ? (
        <textarea
          className={inputCls}
          value={value}
          onChange={handleInputChange}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          placeholder={`${typeDef.name} 값을 입력해 주세요`}
        />
      ) : (
        <input
          type={typeDef.inputType === 'image' ? 'text' : typeDef.inputType}
          className={inputCls}
          value={value}
          onChange={handleInputChange}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          placeholder={`${typeDef.name} 값을 입력해 주세요`}
          autoComplete="off"
        />
      )}

      {/* 자동완성 드롭다운 */}
      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          zIndex: 9999,
          background: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: '8px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
          maxHeight: '200px',
          overflowY: 'auto',
          marginTop: '2px',
        }}>
          {filtered.map((s, idx) => (
            <div
              key={s + idx}
              onMouseDown={(e) => {
                e.preventDefault(); // blur 방지
                onChange(s);
                setOpen(false);
                setHighlightIdx(-1);
              }}
              style={{
                padding: '8px 12px',
                fontSize: '0.87rem',
                color: '#1e293b',
                cursor: 'pointer',
                background: idx === highlightIdx ? '#f1f5f9' : 'transparent',
                borderBottom: idx < filtered.length - 1 ? '1px solid #f8fafc' : 'none',
                fontWeight: idx === highlightIdx ? 600 : 400,
              }}
              onMouseEnter={() => setHighlightIdx(idx)}
              onMouseLeave={() => setHighlightIdx(-1)}
            >
              {/* 매칭 부분 강조 */}
              {(() => {
                if (!normalizedVal) return s;
                const lower = s.toLowerCase();
                const matchIdx = lower.replace(/\s+/g, '').indexOf(normalizedVal);
                if (matchIdx < 0) return s;
                // 원본 문자열에서 매칭 위치 찾기
                let origIdx = 0;
                let noSpaceCount = 0;
                while (origIdx < s.length && noSpaceCount < matchIdx) {
                  if (s[origIdx] !== ' ') noSpaceCount++;
                  origIdx++;
                }
                const before = s.slice(0, origIdx);
                const match = s.slice(origIdx, origIdx + normalizedVal.length + (s.slice(origIdx, origIdx + normalizedVal.length + 5).split('').filter(c => c === ' ').length));
                const after = s.slice(origIdx + match.length);
                return <>{before}<strong style={{ color: '#6366f1' }}>{match}</strong>{after}</>;
              })()}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ── 메인 CrudCard ──────────────────────────────────────────────
export const CrudCard: React.FC<CrudCardProps> = ({ anchorAtomId, onClose }) => {
  const {
    types,
    atoms,
    links,
    domains,
    blueprints,
    getConnectedGroup,
    updateConnectedGroup,
    searchAtoms,
    getFieldsForDomain,
    addEntityToDomain,
    linkAtoms,
  } = useDataStore();

  const [connectedAtoms, setConnectedAtoms] = useState<any[]>([]);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [activeTypeIds, setActiveTypeIds] = useState<string[]>([]);
  const [showRelationsDropdown, setShowRelationsDropdown] = useState(false);

  // ── 도메인 연결 추가 상태 ──
  const [linkedDomainId, setLinkedDomainId] = useState<string | null>(null);
  const [linkedFormData, setLinkedFormData] = useState<Record<string, string>>({});
  const [showLinkedSection, setShowLinkedSection] = useState(false);
  const [linkedSaveSuccess, setLinkedSaveSuccess] = useState<string | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);

  // 외부 클릭 시 종류 드롭다운 닫기
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowRelationsDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 앵커 노드가 변경되거나 스토어 데이터가 바뀌면 폼 상태 로딩
  useEffect(() => {
    if (!anchorAtomId) {
      setConnectedAtoms([]);
      setFormData({});
      setActiveTypeIds([]);
      return;
    }

    const anchorAtom = atoms.find(a => a.id === anchorAtomId);
    if (!anchorAtom) {
      setConnectedAtoms([]);
      setFormData({});
      setActiveTypeIds([]);
      return;
    }

    // 1-hop 직접 연결 아톰만 사용 (BFS 전체 그래프 불러오기 방지)
    const directNeighborIds = new Set<string>();
    links.forEach(link => {
      if (link.sourceId === anchorAtomId) directNeighborIds.add(link.targetId);
      if (link.targetId === anchorAtomId) directNeighborIds.add(link.sourceId);
    });

    const directGroup = [anchorAtom, ...atoms.filter(a => directNeighborIds.has(a.id))];
    setConnectedAtoms(directGroup);

    const initialFormData: Record<string, string> = {};
    const initialTypeIds: string[] = [];
    const seenTypeIds = new Set<string>();

    directGroup.forEach(atom => {
      if (!seenTypeIds.has(atom.typeId)) {
        initialFormData[atom.typeId] = atom.value;
        initialTypeIds.push(atom.typeId);
        seenTypeIds.add(atom.typeId);
      }
    });

    setFormData(initialFormData);
    setActiveTypeIds(initialTypeIds);
  }, [anchorAtomId, atoms, links]);

  if (!anchorAtomId || connectedAtoms.length === 0) return null;

  const anchorAtom = connectedAtoms.find(a => a.id === anchorAtomId) || connectedAtoms[0];
  const anchorType = types.find(t => t.id === anchorAtom.typeId);

  const handleInputChange = (typeId: string, val: string) => {
    setFormData(prev => ({ ...prev, [typeId]: val }));
  };

  const handleTypeToggle = (typeId: string) => {
    if (activeTypeIds.includes(typeId)) {
      if (typeId === anchorAtom.typeId) return;
      setActiveTypeIds(prev => prev.filter(id => id !== typeId));
      setFormData(prev => {
        const copy = { ...prev };
        delete copy[typeId];
        return copy;
      });
    } else {
      setActiveTypeIds(prev => [...prev, typeId]);
      setFormData(prev => ({ ...prev, [typeId]: '' }));
    }
  };

  const handleSave = () => {
    const groupUpdates = activeTypeIds.map(typeId => ({
      typeId,
      value: formData[typeId] || ''
    }));
    updateConnectedGroup(anchorAtomId, groupUpdates);
    onClose();
  };

  // 도메인 연결 레코드 저장
  const handleSaveLinkedRecord = () => {
    if (!linkedDomainId || !anchorAtomId) return;
    const newAnchorId = addEntityToDomain(linkedDomainId, linkedFormData);
    if (newAnchorId) {
      linkAtoms(anchorAtomId, newAnchorId);
      const dom = domains.find(d => d.id === linkedDomainId);
      setLinkedSaveSuccess(dom?.name || '도메인');
      setTimeout(() => setLinkedSaveSuccess(null), 2500);
    }
    setLinkedDomainId(null);
    setLinkedFormData({});
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.shiftKey && e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    }
  };

  const isAnchorImage = typeof anchorAtom.value === 'string' && (
    anchorAtom.value.startsWith('data:image/') ||
    anchorAtom.value.startsWith('/local-images/') ||
    anchorType?.inputType === 'image' ||
    Boolean(anchorType?.name.includes('사진') || anchorType?.name.includes('이미지'))
  );

  return (
    <div className="crud-card-wrapper" onKeyDown={handleKeyDown}>
      <div className="crud-card">

        {/* 카드 헤더 */}
        <div className="crud-card-header">
          <div className="crud-card-title">
            {isAnchorImage ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <img
                  src={anchorAtom.value}
                  alt={anchorType?.name || '사진'}
                  style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                />
                <h3 style={{ margin: 0 }}>[{anchorType?.name || '사진'}] 정보 관리</h3>
              </div>
            ) : (
              <h3>{anchorAtom.value} 정보 관리</h3>
            )}
            <span>{anchorType?.name} 기준 연결</span>
          </div>

          <div style={{ display: 'flex', gap: '8px', position: 'relative' }} ref={dropdownRef}>
            <button
              className="relation-checker-trigger"
              onClick={() => setShowRelationsDropdown(prev => !prev)}
            >
              <CheckSquare size={14} />
              연계 정보 선택
              <ChevronDown size={14} />
            </button>

            {showRelationsDropdown && (
              <div className="relation-checker-dropdown">
                {types.map(t => {
                  const isAnchor = t.id === anchorAtom.typeId;
                  return (
                    <label key={t.id} className="relation-checkbox-label">
                      <input
                        type="checkbox"
                        disabled={isAnchor}
                        checked={activeTypeIds.includes(t.id)}
                        onChange={() => handleTypeToggle(t.id)}
                      />
                      <span>{t.name}</span>
                      {isAnchor && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>(기준)</span>}
                    </label>
                  );
                })}
              </div>
            )}

            <button className="btn-secondary" style={{ padding: '6px' }} onClick={onClose} title="닫기">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* 입력 및 조회 필드 그리드 */}
        <div className="crud-grid">
          {activeTypeIds.map(typeId => {
            const typeDef = types.find(t => t.id === typeId);
            if (!typeDef) return null;

            const isAnchor = typeId === anchorAtom.typeId;
            const val = formData[typeId] || '';
            const widthClass = typeDef.displayWidth === 'full' ? 'full' : typeDef.displayWidth === 'third' ? 'third' : typeDef.displayWidth === 'thumbnail' ? 'thumbnail' : 'half';

            // 해당 typeId의 기존 값 목록 (자동완성 후보)
            const suggestions = searchAtoms('', typeId)
              .map(a => a.value)
              .filter(v => v && !v.startsWith('data:image/') && !v.startsWith('/local-images/'))
              .filter((v, i, arr) => arr.indexOf(v) === i) // 중복 제거
              .sort();

            return (
              <div key={typeId} className={`crud-field ${widthClass}`}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                  <label className="crud-label" title={typeDef.description}>
                    {typeDef.name}
                  </label>
                  {typeDef.description && (
                    <span className="crud-field-description">
                      {typeDef.description}
                    </span>
                  )}
                </div>

                <div className="crud-input-wrapper">
                  {typeDef.inputType === 'image' ? (
                    /* 이미지 필드: 자동완성 없이 파일 업로드만 */
                    <div className="crud-image-input-container" style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
                      {val ? (
                        <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
                          <img
                            src={val}
                            alt={typeDef.name}
                            style={{ width: '42px', height: '42px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #e2e8f0', cursor: 'pointer' }}
                            onClick={() => window.open(val, '_blank')}
                            title="클릭하여 원본 보기"
                          />
                          <button
                            type="button"
                            onClick={() => handleInputChange(typeId, '')}
                            style={{
                              position: 'absolute', top: '-6px', right: '-6px',
                              background: '#ef4444', color: '#fff', border: 'none',
                              borderRadius: '50%', width: '18px', height: '18px',
                              fontSize: '10px', display: 'flex', alignItems: 'center',
                              justifyContent: 'center', cursor: 'pointer'
                            }}
                            title="이미지 삭제"
                          >
                            ✕
                          </button>
                        </div>
                      ) : null}
                      <label style={{
                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                        padding: '6px 12px', background: '#f8fafc',
                        border: '1px solid #cbd5e1', borderRadius: '6px',
                        cursor: 'pointer', fontSize: '0.82rem', color: '#475569', flexShrink: 0
                      }}>
                        <Upload size={14} />
                        <span>{val ? '사진 변경' : '사진 선택/촬영'}</span>
                        <input
                          type="file"
                          accept="image/*"
                          style={{ display: 'none' }}
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const compressed = await compressImageFile(file);
                              handleInputChange(typeId, compressed);
                            }
                          }}
                        />
                      </label>
                      <input
                        type="text"
                        className="crud-input"
                        style={{ flex: 1, minWidth: '100px', fontSize: '0.8rem' }}
                        value={val.startsWith('data:') ? '(이미지 첨부됨)' : val}
                        onChange={(e) => handleInputChange(typeId, e.target.value)}
                        placeholder="또는 URL 직접 입력"
                      />
                    </div>
                  ) : (
                    /* 텍스트/숫자/날짜 등: 자동완성 적용 */
                    <AutocompleteInput
                      typeId={typeId}
                      typeDef={typeDef as any}
                      value={val}
                      isAnchor={isAnchor}
                      suggestions={suggestions}
                      onChange={(v) => handleInputChange(typeId, v)}
                      onRemove={() => handleTypeToggle(typeId)}
                    />
                  )}

                  {/* 앵커가 아닌 필드: 연결 제거 버튼 */}
                  {!isAnchor && (
                    <button
                      className="field-remove-btn"
                      onClick={() => handleTypeToggle(typeId)}
                      title="연결 제거"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── 도메인 레코드 연결 추가 섹션 ── */}
        <div style={{ borderTop: '1px solid #f1f5f9', marginTop: '8px', paddingTop: '12px' }}>
          <button
            type="button"
            onClick={() => { setShowLinkedSection(v => !v); setLinkedDomainId(null); setLinkedFormData({}); }}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: '0.82rem', color: '#6366f1', fontWeight: 600, padding: '2px 0'
            }}
          >
            <Link2 size={14} />
            연결 도메인에 레코드 추가
            <ChevronDown size={13} style={{ transform: showLinkedSection ? 'rotate(180deg)' : 'none', transition: '0.2s' }} />
          </button>

          {showLinkedSection && (
            <div style={{ marginTop: '10px' }}>
              {/* 도메인 선택 칩 */}
              {!linkedDomainId && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {domains.map(dom => (
                    <button
                      key={dom.id}
                      type="button"
                      onClick={() => {
                        setLinkedDomainId(dom.id);
                        // 현재 사람 이름을 anchor 필드에 자동 입력
                        const anchorAtomNow = connectedAtoms.find(a => a.id === anchorAtomId);
                        const anchorTypeDef = types.find(t => t.id === anchorAtomNow?.typeId);
                        const domFields = getFieldsForDomain(dom.id);
                        const preData: Record<string, string> = {};
                        domFields.forEach(f => {
                          // 현재 anchor 타입 이름과 같은 필드에 현재 anchor 값 자동 입력
                          if (anchorTypeDef && f.name === anchorTypeDef.name && anchorAtomNow) {
                            preData[f.name] = anchorAtomNow.value;
                          }
                        });
                        setLinkedFormData(preData);
                      }}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '5px',
                        padding: '5px 12px', borderRadius: '16px',
                        border: '1px solid #e2e8f0', background: '#f8fafc',
                        fontSize: '0.82rem', color: '#374151', cursor: 'pointer',
                        fontWeight: 500, transition: 'all 0.15s'
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#f1f5f9'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#6366f1'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#f8fafc'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#e2e8f0'; }}
                    >
                      <span>{dom.icon}</span>
                      <span>{dom.name}</span>
                      <Plus size={12} />
                    </button>
                  ))}
                </div>
              )}

              {/* 선택된 도메인의 인라인 폼 */}
              {linkedDomainId && (() => {
                const dom = domains.find(d => d.id === linkedDomainId);
                if (!dom) return null;
                const domFields = getFieldsForDomain(linkedDomainId);
                const anchorAtomNow = connectedAtoms.find(a => a.id === anchorAtomId);
                const anchorTypeDef = types.find(t => t.id === anchorAtomNow?.typeId);

                return (
                  <div style={{
                    background: '#f8fafc', borderRadius: '10px',
                    border: '1px solid #e2e8f0', padding: '14px',
                    marginTop: '6px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.88rem', color: '#1e293b' }}>
                        {dom.icon} {dom.name} &nbsp;
                        <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 400 }}>
                          → {anchorAtomNow?.value || ''}와 연결
                        </span>
                      </span>
                      <button type="button" onClick={() => { setLinkedDomainId(null); setLinkedFormData({}); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '2px' }}>
                        <X size={14} />
                      </button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      {domFields.map(f => {
                        const isPreFilled = anchorTypeDef && f.name === anchorTypeDef.name;
                        const fieldSuggestions = searchAtoms('', f.id)
                          .map(a => a.value)
                          .filter(v => v && !v.startsWith('data:'))
                          .filter((v, i, arr) => arr.indexOf(v) === i)
                          .sort();
                        return (
                          <div key={f.id} style={{ gridColumn: f.displayWidth === 'full' || f.inputType === 'textarea' ? 'span 2' : 'span 1' }}>
                            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '3px' }}>
                              {f.name}
                              {isPreFilled && <span style={{ color: '#6366f1', marginLeft: 4, fontWeight: 400 }}>(자동 입력)</span>}
                            </label>
                            {f.inputType === 'textarea' ? (
                              <textarea
                                value={linkedFormData[f.name] || ''}
                                onChange={e => setLinkedFormData(prev => ({ ...prev, [f.name]: e.target.value }))}
                                placeholder={f.name}
                                rows={2}
                                style={{
                                  width: '100%', fontSize: '0.84rem', padding: '6px 8px',
                                  border: '1px solid #cbd5e1', borderRadius: '6px',
                                  background: isPreFilled ? '#ede9fe' : '#fff',
                                  resize: 'vertical', boxSizing: 'border-box'
                                }}
                                readOnly={!!isPreFilled}
                              />
                            ) : (
                              <AutocompleteInput
                                typeId={f.id}
                                typeDef={{ id: f.id, name: f.name, description: f.description, inputType: f.inputType, displayWidth: f.displayWidth }}
                                value={linkedFormData[f.name] || ''}
                                isAnchor={false}
                                suggestions={fieldSuggestions}
                                onChange={v => setLinkedFormData(prev => ({ ...prev, [f.name]: v }))}
                                onRemove={() => {}}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                      <button type="button" onClick={() => { setLinkedDomainId(null); setLinkedFormData({}); }}
                        style={{ padding: '6px 14px', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#fff', fontSize: '0.82rem', cursor: 'pointer', color: '#475569' }}>
                        취소
                      </button>
                      <button type="button" onClick={handleSaveLinkedRecord}
                        style={{ padding: '6px 14px', borderRadius: '6px', border: 'none', background: '#6366f1', color: '#fff', fontSize: '0.82rem', cursor: 'pointer', fontWeight: 600 }}>
                        <Save size={13} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                        {dom.name} 레코드 저장 & 연결
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* 저장 성공 토스트 */}
              {linkedSaveSuccess && (
                <div style={{
                  marginTop: '8px', padding: '8px 14px', borderRadius: '8px',
                  background: '#f0fdf4', border: '1px solid #bbf7d0',
                  color: '#166534', fontSize: '0.82rem', fontWeight: 600
                }}>
                  ✅ {linkedSaveSuccess} 레코드가 저장되고 연결되었습니다.
                </div>
              )}
            </div>
          )}
        </div>

        {/* 저장 액션 바 */}
        <div className="crud-actions">
          <button className="btn-primary" onClick={handleSave}>
            <Save size={16} />
            정보 저장 (Shift+Enter)
          </button>
        </div>

      </div>
    </div>
  );
};
