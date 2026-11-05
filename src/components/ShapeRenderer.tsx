import React, { useState, useMemo } from 'react';
import type { Domain, Blueprint, DomainDataShape } from '../types';
import { resolveDomainDataShape, DATA_SHAPE_INFO } from '../utils/placement';
import {
  Image as ImageIcon, List as ListIcon, Square, FolderTree,
  ExternalLink, Plus, Eye, User, Calendar, Tag, ChevronRight
} from 'lucide-react';
import './ShapeRenderer.css';

export interface ShapeRendererProps {
  domain: Domain;
  blueprints: Blueprint[];
  records: { anchorId: string; data: Record<string, string> }[];
  onSelectRecord?: (anchorId: string, record: Record<string, string>) => void;
  onAddField?: (anchorId: string, entityName: string, row: Record<string, string>) => void;
  selectedAnchorId?: string | null;
}

/**
 * ShapeRenderer — dataShape(gallery | card | list | tree)에 따른 다형성 데이터 뷰 렌더러
 */
export const ShapeRenderer: React.FC<ShapeRendererProps> = ({
  domain,
  blueprints,
  records,
  onSelectRecord,
  onAddField,
  selectedAnchorId,
}) => {
  const shape = useMemo(() => {
    return resolveDomainDataShape(domain, blueprints);
  }, [domain, blueprints]);

  const bpMap = useMemo(() => {
    return new Map<string, Blueprint>(blueprints.map(b => [b.name, b]));
  }, [blueprints]);

  // 이미지/미디어 필드 키 탐색
  const imageFieldKeys = useMemo(() => {
    return domain.fields.filter(f => {
      const bp = bpMap.get(f);
      return bp?.inputType === 'image' || bp?.inputType === 'camera';
    });
  }, [domain.fields, bpMap]);

  // 대표 이미지 추출 헬퍼
  const getRecordImage = (data: Record<string, string>): string | null => {
    for (const key of imageFieldKeys) {
      const val = data[key] || data[`${key}_0`];
      if (val && typeof val === 'string' && (val.startsWith('data:image') || val.startsWith('/local-images/') || val.startsWith('http') || val.startsWith('blob:'))) {
        return val;
      }
    }
    // 일반 이미지 키 검색
    for (const [k, v] of Object.entries(data)) {
      if (!k.startsWith('_') && typeof v === 'string' && (v.startsWith('data:image') || v.startsWith('/local-images/') || v.startsWith('http') || v.startsWith('blob:'))) {
        return v;
      }
    }
    return null;
  };

  // 1. 갤러리형 뷰 (gallery)
  if (shape === 'gallery') {
    return (
      <div className="shape-gallery-container animate-fade-in">
        <div className="shape-gallery-grid">
          {records.map((r, idx) => {
            const imgUrl = getRecordImage(r.data);
            const title = r.data[domain.anchor] || r.data['이름'] || r.data['제목'] || `자료 #${idx + 1}`;
            const isSelected = selectedAnchorId === r.anchorId;

            return (
              <div
                key={r.anchorId}
                className={`shape-gallery-card ${isSelected ? 'selected' : ''}`}
                onClick={() => onSelectRecord?.(r.anchorId, r.data)}
              >
                <div className="shape-gallery-thumb">
                  {imgUrl ? (
                    <img src={imgUrl} alt={title} loading="lazy" />
                  ) : (
                    <div className="shape-gallery-no-img">
                      <ImageIcon size={32} />
                      <span>이미지 없음</span>
                    </div>
                  )}
                  <span className="shape-gallery-badge">#{idx + 1}</span>
                </div>
                <div className="shape-gallery-meta">
                  <div className="shape-gallery-title">{title}</div>
                  <div className="shape-gallery-sub">
                    {Object.entries(r.data)
                      .filter(([k, v]) => !k.startsWith('_') && k !== domain.anchor && !imageFieldKeys.includes(k) && v)
                      .slice(0, 2)
                      .map(([k, v]) => (
                        <span key={k} className="shape-gallery-tag">{k}: {v}</span>
                      ))}
                  </div>
                  {onAddField && (
                    <button
                      type="button"
                      className="shape-gallery-add-field-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAddField(r.anchorId, title, r.data);
                      }}
                      title="이 레코드에 인라인 필드 추가"
                    >
                      <Plus size={12} /> 필드 추가
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // 2. 간결한 목록형 뷰 (list)
  if (shape === 'list') {
    const displayFields = domain.gridFields && domain.gridFields.length > 0
      ? domain.gridFields
      : domain.fields.slice(0, 5);

    return (
      <div className="shape-list-container animate-fade-in">
        <table className="shape-list-table">
          <thead>
            <tr>
              <th style={{ width: '48px' }}>#</th>
              <th>{domain.anchor || '식별자'}</th>
              {displayFields.filter(f => f !== domain.anchor).map(f => (
                <th key={f}>{f}</th>
              ))}
              <th style={{ width: '100px' }}>관리</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r, idx) => {
              const isSelected = selectedAnchorId === r.anchorId;
              const title = r.data[domain.anchor] || r.data['이름'] || r.data['제목'] || `항목 #${idx + 1}`;

              return (
                <tr
                  key={r.anchorId}
                  className={`shape-list-row ${isSelected ? 'selected' : ''}`}
                  onClick={() => onSelectRecord?.(r.anchorId, r.data)}
                >
                  <td className="shape-list-num">{idx + 1}</td>
                  <td className="shape-list-anchor">
                    <strong>{title}</strong>
                  </td>
                  {displayFields.filter(f => f !== domain.anchor).map(f => (
                    <td key={f} className="shape-list-cell">
                      {r.data[f] || '-'}
                    </td>
                  ))}
                  <td className="shape-list-actions" onClick={e => e.stopPropagation()}>
                    {onAddField && (
                      <button
                        type="button"
                        className="shape-action-btn"
                        onClick={() => onAddField(r.anchorId, title, r.data)}
                        title="필드 추가"
                      >
                        <Plus size={12} /> 필드
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  // 3. 트리형 뷰 (tree)
  if (shape === 'tree') {
    return (
      <div className="shape-tree-container animate-fade-in">
        <div className="shape-tree-header">
          <FolderTree size={16} />
          <span>{domain.name} 계층 구조 뷰</span>
        </div>
        <div className="shape-tree-grid">
          {records.map((r, idx) => {
            const title = r.data[domain.anchor] || r.data['이름'] || `노드 #${idx + 1}`;
            const isSelected = selectedAnchorId === r.anchorId;

            return (
              <div
                key={r.anchorId}
                className={`shape-tree-node-card ${isSelected ? 'selected' : ''}`}
                onClick={() => onSelectRecord?.(r.anchorId, r.data)}
              >
                <div className="shape-tree-node-icon">🌳</div>
                <div className="shape-tree-node-body">
                  <div className="shape-tree-node-title">{title}</div>
                  <div className="shape-tree-node-fields">
                    {Object.entries(r.data)
                      .filter(([k]) => !k.startsWith('_') && k !== domain.anchor)
                      .slice(0, 3)
                      .map(([k, v]) => (
                        <div key={k} className="shape-tree-node-prop">
                          <span className="prop-k">{k}:</span>
                          <span className="prop-v">{v}</span>
                        </div>
                      ))}
                  </div>
                </div>
                {onAddField && (
                  <button
                    type="button"
                    className="shape-tree-add-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddField(r.anchorId, title, r.data);
                    }}
                    title="필드 추가"
                  >
                    <Plus size={12} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // 4. 기본 형태: 카드형 뷰 (card)
  return (
    <div className="shape-card-container animate-fade-in">
      <div className="shape-card-grid">
        {records.map((r, idx) => {
          const imgUrl = getRecordImage(r.data);
          const title = r.data[domain.anchor] || r.data['이름'] || r.data['제목'] || `레코드 #${idx + 1}`;
          const isSelected = selectedAnchorId === r.anchorId;

          return (
            <div
              key={r.anchorId}
              className={`shape-record-card ${isSelected ? 'selected' : ''}`}
              onClick={() => onSelectRecord?.(r.anchorId, r.data)}
            >
              <div className="shape-card-top">
                {imgUrl && (
                  <img src={imgUrl} alt={title} className="shape-card-mini-thumb" />
                )}
                <div className="shape-card-head-info">
                  <span className="shape-card-idx">#{idx + 1}</span>
                  <span className="shape-card-title">{title}</span>
                </div>
              </div>

              <div className="shape-card-fields">
                {domain.fields
                  .filter(f => f !== domain.anchor && !imageFieldKeys.includes(f))
                  .map(f => {
                    const val = r.data[f];
                    if (!val) return null;
                    return (
                      <div key={f} className="shape-card-field-row">
                        <span className="sc-field-name">{f}</span>
                        <span className="sc-field-value">{val}</span>
                      </div>
                    );
                  })}
              </div>

              {onAddField && (
                <div className="shape-card-footer" onClick={e => e.stopPropagation()}>
                  <button
                    type="button"
                    className="shape-card-add-field-btn"
                    onClick={() => onAddField(r.anchorId, title, r.data)}
                  >
                    <Plus size={12} /> 필드 추가
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
