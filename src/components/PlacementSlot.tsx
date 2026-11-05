import React, { useMemo } from 'react';
import { useDataStore } from '../store/useDataStore';
import type { Domain, DomainPlacement, DomainDataShape } from '../types';
import {
  resolveDomainPlacement,
  resolveDomainDataShape,
  PLACEMENT_INFO,
  DATA_SHAPE_INFO
} from '../utils/placement';
import { ShapeRenderer } from './ShapeRenderer';
import {
  Layout, Menu, Layers, Sidebar,
  Square, Image as GalleryIcon, List as ListIcon, FolderTree
} from 'lucide-react';
import './PlacementSlot.css';

export interface PlacementSlotProps {
  /** 배치 슬롯 위치 ('left-menu' | 'top-tab' | 'main-content' | 'sidebar') */
  position: DomainPlacement;
  /** 현재 활성 도메인 ID (선택 사항) */
  activeDomainId?: string | null;
  /** 도메인 선택 변경 콜백 (선택 사항) */
  onSelectDomain?: (domain: Domain) => void;
  /** 레코드 단위 뷰(ShapeRenderer) 자동 렌더링 여부 (기본값: main-content일 때 true) */
  renderRecordView?: boolean;
  /** 인라인 필드 추가 콜백 */
  onAddField?: (anchorId: string, entityName: string, row: Record<string, string>) => void;
  /** 레코드 선택 콜백 */
  onSelectRecord?: (anchorId: string, record: Record<string, string>) => void;
  /** 선택된 레코드 앵커 ID */
  selectedAnchorId?: string | null;
  /** 커스텀 렌더러 (선택 사항: 개별 도메인 렌더링 오버라이드) */
  children?: (domains: Domain[], helpers: {
    getShape: (d: Domain) => DomainDataShape;
    getShapeInfo: (shape: DomainDataShape) => typeof DATA_SHAPE_INFO[DomainDataShape];
  }) => React.ReactNode;
  /** 비어있을 때 표시할 메시지 또는 컴포넌트 */
  emptyFallback?: React.ReactNode;
}

/**
 * PlacementSlot — Placement 속성 기반 도메인/필드 자동 배치 컨테이너
 * 
 * 코드에 화면 위치를 하드코딩하지 않고, 도메인에 부여된 placement 속성('left-menu' | 'top-tab' | 'main-content' | 'sidebar')에
 * 따라 자동으로 해당 영역의 도메인들을 집계하고 최적의 형태(dataShape)로 렌더링합니다.
 */
export const PlacementSlot: React.FC<PlacementSlotProps> = ({
  position,
  activeDomainId,
  onSelectDomain,
  renderRecordView = (position === 'main-content'),
  onAddField,
  onSelectRecord,
  selectedAnchorId,
  children,
  emptyFallback,
}) => {
  const { domains, blueprints, getAtomsForDomain } = useDataStore();

  // 해당 위치에 배치된 도메인 목록 필터링
  const assignedDomains = useMemo(() => {
    return domains.filter(d => resolveDomainPlacement(d) === position);
  }, [domains, position]);

  const helpers = useMemo(() => ({
    getShape: (d: Domain) => resolveDomainDataShape(d, blueprints),
    getShapeInfo: (shape: DomainDataShape) => DATA_SHAPE_INFO[shape],
  }), [blueprints]);

  // 커스텀 render prop이 전달된 경우
  if (children) {
    return (
      <div className={`placement-slot placement-slot--${position}`}>
        {children(assignedDomains, helpers)}
      </div>
    );
  }

  // 배치된 도메인이 없는 경우
  if (assignedDomains.length === 0) {
    if (emptyFallback) return <>{emptyFallback}</>;
    return null;
  }

  const slotInfo = PLACEMENT_INFO[position];

  return (
    <div className={`placement-slot placement-slot--${position}`}>
      {/* 1. 상단 탭 (top-tab) 형태 */}
      {position === 'top-tab' && (
        <div className="ps-top-tabs">
          {assignedDomains.map(dom => {
            const shape = helpers.getShape(dom);
            const isActive = activeDomainId === dom.id;
            return (
              <button
                key={dom.id}
                type="button"
                className={`ps-tab-btn ${isActive ? 'active' : ''}`}
                onClick={() => onSelectDomain?.(dom)}
              >
                <span className="ps-tab-icon">{dom.icon || '📁'}</span>
                <span className="ps-tab-label">{dom.name}</span>
                <span className="ps-shape-badge">{DATA_SHAPE_INFO[shape].label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* 2. 좌측 메뉴 (left-menu) 형태 */}
      {position === 'left-menu' && (
        <nav className="ps-left-menu">
          <div className="ps-menu-header">
            <Menu size={14} />
            <span>{slotInfo.label}</span>
          </div>
          <ul className="ps-menu-list">
            {assignedDomains.map(dom => {
              const shape = helpers.getShape(dom);
              const isActive = activeDomainId === dom.id;
              return (
                <li key={dom.id}>
                  <button
                    type="button"
                    className={`ps-menu-item ${isActive ? 'active' : ''}`}
                    onClick={() => onSelectDomain?.(dom)}
                  >
                    <span className="ps-item-icon">{dom.icon || '📄'}</span>
                    <span className="ps-item-text">{dom.name}</span>
                    <span className="ps-shape-tag">{DATA_SHAPE_INFO[shape].label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      )}

      {/* 3. 사이드바 (sidebar) 형태 */}
      {position === 'sidebar' && (
        <aside className="ps-sidebar">
          <div className="ps-sidebar-header">
            <Sidebar size={14} />
            <span>{slotInfo.label}</span>
          </div>
          <div className="ps-sidebar-content">
            {assignedDomains.map(dom => {
              const shape = helpers.getShape(dom);
              const records = getAtomsForDomain(dom.id);
              return (
                <div key={dom.id} className="ps-sidebar-card">
                  <div className="ps-card-title">
                    <span>{dom.icon || '📌'} {dom.name}</span>
                    <span className="ps-shape-tag">{DATA_SHAPE_INFO[shape].label}</span>
                  </div>
                  {dom.description && <div className="ps-card-desc">{dom.description}</div>}
                  <div className="ps-card-fields-count">
                    기록 {records.length}건 · 필드 {dom.fields.length}개
                  </div>
                </div>
              );
            })}
          </div>
        </aside>
      )}

      {/* 4. 메인 컨텐츠 (main-content) 슬롯 */}
      {position === 'main-content' && (
        <div className="ps-main-domains">
          {assignedDomains.map(dom => {
            const shape = helpers.getShape(dom);
            const records = getAtomsForDomain(dom.id);
            return (
              <div key={dom.id} className="ps-main-domain-entry" data-shape={shape}>
                <div className="ps-main-domain-header">
                  <div className="ps-main-domain-title-wrap">
                    <span className="ps-main-domain-icon">{dom.icon || '📂'}</span>
                    <span className="ps-main-domain-title">{dom.name}</span>
                    <span className="ps-main-domain-count">({records.length}건)</span>
                  </div>
                  <span className="ps-shape-badge">
                    {DATA_SHAPE_INFO[shape].label}
                  </span>
                </div>

                {/* 다형성 dataShape 렌더러 자동 렌더링 */}
                {renderRecordView && (
                  <div className="ps-main-domain-body">
                    <ShapeRenderer
                      domain={dom}
                      blueprints={blueprints}
                      records={records}
                      onSelectRecord={onSelectRecord}
                      onAddField={onAddField}
                      selectedAnchorId={selectedAnchorId}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
