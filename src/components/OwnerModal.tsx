import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, Database, Plus, Save, Trash2, RotateCcw } from 'lucide-react';
import { useDataStore } from '../store/useDataStore';
import './OwnerModal.css';

interface OwnerModalProps {
  onClose: () => void;
}

export const OwnerModal: React.FC<OwnerModalProps> = ({ onClose }) => {
  const {
    domains,
    getFieldsForDomain,
    getAtomsForDomain,
    addEntityToDomain,
    removeEntityFromDomain,
    updateEntityField,
  } = useDataStore();

  const [search, setSearch] = useState('');
  const [formData, setFormData] = useState<Record<string, string>>({});
  // null = 추가 모드 / anchorId 문자열 = 편집 모드
  const [selectedAnchorId, setSelectedAnchorId] = useState<string | null>(null);

  // 헤더 높이 측정 → CSS 변수 주입
  useEffect(() => {
    const setVar = () => {
      const header =
        (document.querySelector('.dashboard-header') as HTMLElement | null) ||
        (document.querySelector('.autoscan-topbar') as HTMLElement | null);
      const h = header?.getBoundingClientRect().height ?? 58;
      document.documentElement.style.setProperty('--header-h', `${Math.round(h)}px`);
    };
    setVar();
    const ro = new ResizeObserver(setVar);
    const header =
      document.querySelector('.dashboard-header') ||
      document.querySelector('.autoscan-topbar');
    if (header) ro.observe(header);
    return () => ro.disconnect();
  }, []);

  // 「소장자」 도메인 찾기 — id 우선, 그 다음 이름으로 매칭 (소장품 도메인 오인 방지)
  const ownerDomain = useMemo(() => {
    // 1) id에 'owner'가 포함된 도메인 우선
    const byId = domains.find(d => d.id.toLowerCase().includes('owner'));
    if (byId) return byId;
    // 2) 이름에 '소장자'가 포함된 도메인 (정확히 '소장품'은 제외)
    const byName = domains.find(d => d.name.includes('소장자'));
    if (byName) return byName;
    // 3) 그래도 없으면 '소장' 포함 중 '소장품'이 아닌 첫 번째
    return domains.find(d => d.name.includes('소장') && !d.name.includes('소장품'));
  }, [domains]);

  const fields = useMemo(
    () => (ownerDomain ? getFieldsForDomain(ownerDomain.id) : []),
    [ownerDomain, getFieldsForDomain]
  );

  // 유효한 텍스트 값이 하나라도 있는지 판단 (이미지 데이터 제외)
  const hasValidText = useCallback((data: Record<string, string>) =>
    Object.values(data).some(v =>
      v && typeof v === 'string' &&
      !v.startsWith('data:') && !v.startsWith('blob:') && !v.startsWith('__') && !v.startsWith('/local-images/') &&
      v.trim().length > 0 && v.trim().length <= 200
    ), []);

  const entities = useMemo(
    () => (ownerDomain ? getAtomsForDomain(ownerDomain.id).filter(e => hasValidText(e.data)) : []),
    [ownerDomain, getAtomsForDomain, hasValidText]
  );

  // 검색 필터 — 공백 제거 후 비교 (띄어쓰기 무시, base64 이미지 제외)
  const filtered = useMemo(() => {
    if (!search.trim()) return entities;
    const q = search.replace(/\s/g, '').toLowerCase();
    return entities.filter(e =>
      Object.values(e.data).some(v =>
        v &&
        !v.startsWith('data:') &&
        v.length < 200 &&
        v.replace(/\s/g, '').toLowerCase().includes(q)
      )
    );
  }, [entities, search]);

  // 앵커 필드 — domain.anchor를 fields 이름 목록과 대조하여 결정
  // domain.anchor가 필드 이름과 일치하지 않을 경우 첫 비이미지 필드로 폴백
  const anchorField = useMemo(() => {
    const raw = ownerDomain?.anchor || '';
    // fields 배열에 raw가 있으면 그대로 사용
    if (raw && fields.some(f => f.name === raw)) return raw;
    // 없으면 첫 번째 비이미지 필드 이름
    const firstText = fields.find(f => f.inputType !== 'image' && f.inputType !== 'camera');
    return firstText?.name || raw || '이름';
  }, [ownerDomain, fields]);

  // 이미지 필드 여부
  const isImageField = (f: { inputType?: string }) =>
    f.inputType === 'image' || f.inputType === 'camera';

  // 전화번호 포맷
  const formatPhone = (value: string) => {
    const d = value.replace(/\D/g, '');
    if (d.length <= 3) return d;
    if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
    return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7, 11)}`;
  };

  // ── 행 선택 → 편집 모드 전환 ──
  const handleRowSelect = (entity: { anchorId: string; data: Record<string, string> }) => {
    setSelectedAnchorId(entity.anchorId);
    setFormData({ ...entity.data });
  };

  // 선택 해제 → 추가 모드
  const handleDeselect = () => {
    setSelectedAnchorId(null);
    setFormData({});
  };

  // 폼 초기화 (추가 모드에서만)
  const handleReset = () => setFormData({});

  // 저장 (추가 / 수정 분기)
  const handleSave = () => {
    if (!ownerDomain) return;
    const trimmed = Object.fromEntries(
      Object.entries(formData).map(([k, v]) => [k, (v || '').trim()])
    );

    if (selectedAnchorId) {
      // ── 편집 모드: 각 필드 개별 업데이트 ──
      fields.forEach(f => {
        if (trimmed[f.name] !== undefined) {
          updateEntityField(selectedAnchorId, f.name, trimmed[f.name] || '');
        }
      });
      setSelectedAnchorId(null);
      setFormData({});
    } else {
      // ── 추가 모드: anchorField 값 필수 ──
      if (!trimmed[anchorField]) return;
      addEntityToDomain(ownerDomain.id, trimmed);
      setFormData({});
    }
  };

  // 삭제 (편집 모드)
  const handleDelete = () => {
    if (!ownerDomain || !selectedAnchorId) return;
    removeEntityFromDomain(ownerDomain.id, selectedAnchorId);
    setSelectedAnchorId(null);
    setFormData({});
  };

  const isEditMode = selectedAnchorId !== null;

  // 수정 중 표시 이름 — base64 이미지 데이터 절대 표시 안 함
  const selectedName = useMemo(() => {
    if (!isEditMode) return '';
    // anchorField 값이 일반 텍스트이면 사용
    const anchor = formData[anchorField];
    if (anchor && !anchor.startsWith('data:') && !anchor.startsWith('/local-images/') && anchor.length < 200) return anchor;
    // 그 외: 이미지/긴 값 제외하고 첫 번째 유효한 텍스트 값 사용
    const fallback = Object.entries(formData).find(
      ([, v]) => v && !v.startsWith('data:') && !v.startsWith('__') && !v.startsWith('/local-images/') && v.length < 200
    );
    return fallback?.[1] || '?';
  }, [isEditMode, formData, anchorField]);

  // 저장 버튼 활성 조건:
  // - 편집 모드: 폼에 아무 값이나 있으면 허용
  // - 추가 모드: anchorField 값이 있어야 함
  const canSave = isEditMode
    ? Object.entries(formData).some(([k, v]) => !k.startsWith('_') && (v || '').trim())
    : !!(formData[anchorField]?.trim());

  // 도메인 없음 안내
  if (!ownerDomain) {
    return createPortal(
      <div className="om2-overlay" onClick={onClose}>
        <div className="om2-header-spacer" />
        <div className="om2-modal" onClick={e => e.stopPropagation()}>
          <div className="om2-header">
            <div className="om2-header-left">
              <Database size={16} />
              <span className="om2-title">소장자 데이터 관리</span>
            </div>
            <button className="om2-close" onClick={onClose}><X size={18} /></button>
          </div>
          <div className="om2-no-domain">
            <Database size={40} style={{ color: '#94a3b8', marginBottom: 12 }} />
            <p>「소장자」 도메인이 없습니다.</p>
            <p className="om2-no-domain-sub">기본설정 → 도메인 관리에서 소장자 도메인을 먼저 만들어 주세요.</p>
          </div>
        </div>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div className="om2-overlay" onClick={onClose}>
      <div className="om2-header-spacer" />
      <div className="om2-modal" onClick={e => e.stopPropagation()}>

        {/* ── 헤더 ── */}
        <div className="om2-header">
          <div className="om2-header-left">
            <Database size={16} />
            <span className="om2-title">소장자 데이터 관리</span>
            <span className="om2-count">총 {entities.length}건</span>
          </div>
          <button className="om2-close" onClick={onClose}><X size={18} /></button>
        </div>

        {/* ── 입력 / 편집 폼 ── */}
        <div className={`om2-form-box ${isEditMode ? 'edit-mode' : 'add-mode'}`}>
          {/* 모드 레이블 */}
          <div className="om2-form-mode-bar">
            {isEditMode ? (
              <>
                <span className="om2-mode-badge edit">편집 모드</span>
                <span className="om2-mode-name">「{selectedName}」 수정 중</span>
              </>
            ) : (
              <>
                <span className="om2-mode-badge add">추가 모드</span>
                <span className="om2-mode-name">새 소장자 등록</span>
              </>
            )}
          </div>

          {/* 필드 그리드 */}
          <div className="om2-form-grid">
            {fields.map(f => (
              <div key={f.id} className="om2-field-cell">
                <label className="om2-field-label">
                  <span className="om2-field-dot" />
                  {f.name}
                  {f.name === anchorField && <span className="om2-field-tag">(대표)</span>}
                  {f.format && <span className="om2-field-tag">({f.format === 'phone' ? '-' : f.format})</span>}
                </label>
                {isImageField(f) ? (
                  <div className="om2-img-placeholder">📷 사진 파일 첨부...</div>
                ) : (
                  <input
                    className="om2-input"
                    placeholder={`${f.name} 입력...`}
                    value={formData[f.name] || ''}
                    onChange={e => {
                      const raw = e.target.value;
                      const val = f.format === 'phone' ? formatPhone(raw) : raw;
                      setFormData(prev => ({ ...prev, [f.name]: val }));
                    }}
                    onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
                  />
                )}
              </div>
            ))}
          </div>

          {/* 버튼 영역 */}
          <div className="om2-form-actions">
            {isEditMode ? (
              <>
                <button
                  className="om2-btn-save"
                  onClick={handleSave}
                  disabled={!canSave}
                >
                  <Save size={14} style={{ marginRight: 5 }} />
                  수정 저장
                </button>
                <button className="om2-btn-delete" onClick={handleDelete}>
                  <Trash2 size={14} style={{ marginRight: 5 }} />
                  삭제
                </button>
                <button className="om2-btn-cancel" onClick={handleDeselect}>
                  <X size={14} style={{ marginRight: 4 }} />
                  취소
                </button>
              </>
            ) : (
              <>
                <button
                  className="om2-btn-save"
                  onClick={handleSave}
                  disabled={!canSave}
                >
                  <Plus size={14} style={{ marginRight: 5 }} />
                  저장 (추가)
                </button>
                <button className="om2-btn-reset" onClick={handleReset}>
                  <RotateCcw size={13} style={{ marginRight: 5 }} />
                  초기화
                </button>
              </>
            )}
          </div>
        </div>

        {/* ── 검색 ── */}
        <div className="om2-search-wrap">
          <Search size={14} className="om2-search-icon" />
          <input
            className="om2-search"
            placeholder="등록된 소장자 데이터 내 검색..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className="om2-search-clear" onClick={() => setSearch('')}>
              <X size={12} />
            </button>
          )}
        </div>

        {/* ── 테이블 ── */}
        <div className="om2-table-wrap">
          <table className="om2-table">
            <thead>
              <tr>
                <th className="om2-th-num">#</th>
                {fields.map(f => (
                  <th key={f.id} className="om2-th">
                    {f.name}
                    {f.name === anchorField && <span className="om2-th-tag">대표</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={fields.length + 1} className="om2-td-empty">
                    {search ? `"${search}" 검색 결과 없음` : '등록된 데이터가 없습니다'}
                  </td>
                </tr>
              ) : (
                filtered.map((entity, idx) => {
                  const isSelected = selectedAnchorId === entity.anchorId;
                  return (
                    <tr
                      key={entity.anchorId}
                      className={`om2-tr${isSelected ? ' selected' : ''}`}
                      onClick={() => handleRowSelect(entity)}
                      title="클릭하여 편집"
                    >
                      <td className="om2-td-num">{idx + 1}</td>
                      {fields.map(f => {
                        const val = entity.data[f.name] || '';
                        if (isImageField(f)) {
                          return (
                            <td key={f.id} className="om2-td om2-td-img">
                              {val ? (
                                <img src={val} alt="사진" className="om2-thumb" />
                              ) : (
                                <span className="om2-dash">–</span>
                              )}
                            </td>
                          );
                        }
                        return (
                          <td key={f.id} className="om2-td">
                            <span className={val ? '' : 'om2-dash'} title={val || undefined}>
                              {val
                                ? val.length > 14
                                  ? val.slice(0, 14) + '...'
                                  : val
                                : '–'}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>,
    document.body
  );
};
