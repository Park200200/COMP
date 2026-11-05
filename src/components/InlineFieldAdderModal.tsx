import React, { useState, useMemo } from 'react';
import { X, Plus, Sparkles, Tag, Layers, Check } from 'lucide-react';
import { useDataStore } from '../store/useDataStore';
import type { Blueprint } from '../types';

export interface InlineFieldAdderModalProps {
  isOpen: boolean;
  onClose: () => void;
  anchorId: string;
  entityName?: string;
  domainId: string;
  domainName: string;
  existingRecordFieldNames?: string[];
  domainFieldNames?: string[];
  onFieldAdded?: (fieldName: string, scope: 'record' | 'domain' | 'linked', value: string) => void;
}

export const InlineFieldAdderModal: React.FC<InlineFieldAdderModalProps> = ({
  isOpen,
  onClose,
  anchorId,
  entityName,
  domainId,
  domainName,
  existingRecordFieldNames = [],
  domainFieldNames = [],
  onFieldAdded
}) => {
  const { blueprints, addFieldToDomain, updateEntityField, createLinkedDomainFromRecord, addEntityToDomain } = useDataStore();

  const [scope, setScope] = useState<'record' | 'domain' | 'linked'>('record');
  const [fieldName, setFieldName] = useState('');
  const [fieldValue, setFieldValue] = useState('');
  const [inputType, setInputType] = useState<Blueprint['inputType']>('text');
  const [errorMsg, setErrorMsg] = useState('');

  // 추천할 블루프린트 필드 목록 (현재 엔티티 또는 도메인에 없는 블루프린트들)
  const recommendedBlueprints = useMemo(() => {
    const excludedNames = new Set(
      scope === 'record' ? existingRecordFieldNames : domainFieldNames
    );
    return blueprints
      .filter(b => !excludedNames.has(b.name) && !b.name.startsWith('_'))
      .slice(0, 10);
  }, [blueprints, scope, existingRecordFieldNames, domainFieldNames]);

  if (!isOpen) return null;

  const handleSelectChip = (name: string, bpInputType?: Blueprint['inputType']) => {
    setFieldName(name);
    if (bpInputType) setInputType(bpInputType);
    setErrorMsg('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = fieldName.trim();
    if (!cleanName) {
      setErrorMsg('필드 이름을 입력해주세요.');
      return;
    }

    if (scope === 'record') {
      if (existingRecordFieldNames.includes(cleanName)) {
        setErrorMsg('이미 이 레코드에 존재하는 필드입니다.');
        return;
      }
      // 1. 이 레코드에만 추가 (Ad-hoc)
      updateEntityField(anchorId, cleanName, fieldValue);
    } else if (scope === 'domain') {
      if (domainFieldNames.includes(cleanName)) {
        setErrorMsg('이미 해당 도메인에 존재하는 필드입니다.');
        return;
      }
      // 2. 도메인 전체에 추가
      addFieldToDomain(domainId, cleanName, inputType);
      if (fieldValue.trim()) {
        updateEntityField(anchorId, cleanName, fieldValue);
      }
    } else if (scope === 'linked') {
      // 3. 별도 도메인으로 연결 (신규 도메인 및 관계 생성)
      const { newDomain } = createLinkedDomainFromRecord(
        domainId,
        anchorId,
        cleanName,
        ['이름', '설명']
      );
      if (fieldValue.trim()) {
        addEntityToDomain(newDomain.id, {
          [newDomain.anchor || '이름']: fieldValue.trim(),
          _parentInstanceId: anchorId
        });
      }
    }

    if (onFieldAdded) {
      onFieldAdded(cleanName, scope, fieldValue);
    }

    // 초기화 및 닫기
    setFieldName('');
    setFieldValue('');
    setErrorMsg('');
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '520px',
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.08)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          border: '1px solid #e2e8f0',
          animation: 'fadeInScale 0.15s ease-out'
        }}
      >
        {/* 모달 헤더 */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid #f1f5f9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '10px',
                backgroundColor: '#ede9fe',
                color: '#6366f1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Plus size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.08rem', fontWeight: 700, color: '#1e293b' }}>
                새 필드 추가 (인라인 확장)
              </h3>
              <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '2px' }}>
                {entityName ? `[${entityName}]` : `[${anchorId}]`} · {domainName}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: '#94a3b8',
              padding: '6px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background-color 0.15s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#e2e8f0';
              e.currentTarget.style.color = '#334155';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = '#94a3b8';
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* 폼 본체 */}
        <form onSubmit={handleSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* 추가 범위 선택 라디오 박스 */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '8px' }}>
              추가 범위 선택
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
              {/* 옵션 1: 이 레코드만 */}
              <div
                className="ifa-scope-record ifa-scope-card"
                onClick={() => setScope('record')}
                style={{
                  padding: '12px 10px',
                  borderRadius: '12px',
                  border: scope === 'record' ? '2px solid #6366f1' : '1px solid #e2e8f0',
                  backgroundColor: scope === 'record' ? '#f5f3ff' : '#ffffff',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <div
                    style={{
                      width: '14px',
                      height: '14px',
                      borderRadius: '50%',
                      border: scope === 'record' ? '5px solid #6366f1' : '2px solid #cbd5e1',
                      boxSizing: 'border-box'
                    }}
                  />
                  <span style={{ fontSize: '0.84rem', fontWeight: 700, color: scope === 'record' ? '#4f46e5' : '#475569' }}>
                    이 레코드만
                  </span>
                </div>
                <div style={{ fontSize: '0.72rem', color: '#64748b', lineHeight: 1.3, paddingLeft: '20px' }}>
                  현재 자료에만 Ad-hoc 필드로 추가
                </div>
              </div>

              {/* 옵션 2: 도메인 전체 */}
              <div
                className="ifa-scope-domain ifa-scope-card"
                onClick={() => setScope('domain')}
                style={{
                  padding: '12px 10px',
                  borderRadius: '12px',
                  border: scope === 'domain' ? '2px solid #6366f1' : '1px solid #e2e8f0',
                  backgroundColor: scope === 'domain' ? '#f5f3ff' : '#ffffff',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <div
                    style={{
                      width: '14px',
                      height: '14px',
                      borderRadius: '50%',
                      border: scope === 'domain' ? '5px solid #6366f1' : '2px solid #cbd5e1',
                      boxSizing: 'border-box'
                    }}
                  />
                  <span style={{ fontSize: '0.84rem', fontWeight: 700, color: scope === 'domain' ? '#4f46e5' : '#475569' }}>
                    도메인 전체
                  </span>
                </div>
                <div style={{ fontSize: '0.72rem', color: '#64748b', lineHeight: 1.3, paddingLeft: '20px' }}>
                  현재 도메인의 모든 자료에 컬럼 신설
                </div>
              </div>

              {/* 옵션 3: 별도 도메인 연결 (신규) */}
              <div
                className="ifa-scope-linked ifa-scope-card"
                onClick={() => setScope('linked')}
                style={{
                  padding: '12px 10px',
                  borderRadius: '12px',
                  border: scope === 'linked' ? '2px solid #6366f1' : '1px solid #e2e8f0',
                  backgroundColor: scope === 'linked' ? '#f5f3ff' : '#ffffff',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <div
                    style={{
                      width: '14px',
                      height: '14px',
                      borderRadius: '50%',
                      border: scope === 'linked' ? '5px solid #6366f1' : '2px solid #cbd5e1',
                      boxSizing: 'border-box'
                    }}
                  />
                  <span style={{ fontSize: '0.84rem', fontWeight: 700, color: scope === 'linked' ? '#4f46e5' : '#475569' }}>
                    새 도메인 연결
                  </span>
                </div>
                <div style={{ fontSize: '0.72rem', color: '#64748b', lineHeight: 1.3, paddingLeft: '20px' }}>
                  하위/연계 도메인을 즉시 생성하고 관계 설정
                </div>
              </div>
            </div>
          </div>

          {/* 필드 이름 입력 및 추천 칩 */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#334155' }}>
                {scope === 'linked' ? '연결할 새 도메인 이름' : '필드 이름'} <span style={{ color: '#ef4444' }}>*</span>
              </label>
            </div>
            <input
              type="text"
              className="ifa-field-name-input"
              value={fieldName}
              onChange={(e) => {
                setFieldName(e.target.value);
                setErrorMsg('');
              }}
              placeholder={scope === 'linked' ? '예: 출신학교, 직장경력, 소장기록물 등' : '예: 출신학교, 별명, 추천인, 취미 등'}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '0.9rem',
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'border-color 0.15s'
              }}
              onFocus={(e) => (e.target.style.borderColor = '#6366f1')}
              onBlur={(e) => (e.target.style.borderColor = '#cbd5e1')}
              autoFocus
            />

            {/* 빠른 추천 칩 */}
            {recommendedBlueprints.length > 0 && (
              <div style={{ marginTop: '10px' }}>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Sparkles size={12} color="#818cf8" />
                  <span>추천 필드 (클릭하여 선택):</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {recommendedBlueprints.map(bp => (
                    <button
                      key={bp.id}
                      type="button"
                      onClick={() => handleSelectChip(bp.name, bp.inputType)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '20px',
                        border: fieldName === bp.name ? '1px solid #6366f1' : '1px solid #e2e8f0',
                        backgroundColor: fieldName === bp.name ? '#ede9fe' : '#f8fafc',
                        color: fieldName === bp.name ? '#4f46e5' : '#475569',
                        fontSize: '0.76rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      +{bp.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* (도메인 전체일 때) 입력 유형 선택 */}
          {scope === 'domain' && (
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                입력 방식 (유형)
              </label>
              <select
                value={inputType}
                onChange={(e) => setInputType(e.target.value as any)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.88rem',
                  outline: 'none',
                  backgroundColor: '#ffffff'
                }}
              >
                <option value="text">텍스트 (한 줄 일반 텍스트)</option>
                <option value="textarea">메모 / 긴 텍스트 (여러 줄 입력)</option>
                <option value="tel">전화번호 / 연락처</option>
                <option value="date">날짜 (연월일)</option>
                <option value="number">숫자 / 금액</option>
                <option value="image">이미지 / 사진</option>
              </select>
            </div>
          )}

          {/* 초기 값 입력 */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
              {scope === 'linked' ? '첫 번째 연결 데이터 값 (선택 사항)' : '초기 값 입력 (선택 사항)'}
            </label>
            <input
              type="text"
              className="ifa-field-value-input"
              value={fieldValue}
              onChange={(e) => setFieldValue(e.target.value)}
              placeholder={scope === 'linked' ? '연결할 도메인의 첫 번째 항목 명칭 (예: 서울대학교)...' : '이 레코드에 바로 저장할 값 입력...'}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '0.9rem',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* 에러 메시지 */}
          {errorMsg && (
            <div style={{ color: '#ef4444', fontSize: '0.82rem', fontWeight: 600 }}>
              ⚠️ {errorMsg}
            </div>
          )}

          {/* 액션 버튼 */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
            <button
              type="button"
              className="ifa-btn-cancel"
              onClick={onClose}
              style={{
                padding: '9px 18px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                backgroundColor: '#ffffff',
                color: '#64748b',
                fontSize: '0.88rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              취소
            </button>
            <button
              type="submit"
              className="ifa-btn-save"
              style={{
                padding: '9px 20px',
                borderRadius: '8px',
                border: 'none',
                background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                color: '#ffffff',
                fontSize: '0.88rem',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 2px 4px rgba(99, 102, 241, 0.3)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Check size={16} />
              필드 추가
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
