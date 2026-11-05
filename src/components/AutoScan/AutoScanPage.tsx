import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { PanelLeft, PanelRight, ArrowLeft, Camera, Save, RotateCcw, Check, Loader, Settings, Ruler, Eye, EyeOff, Move, Maximize2, Tag, Scissors, ZoomIn, ZoomOut, ChevronRight, ChevronDown, FolderTree, Layers, Link2, ChevronUp, Upload, Trash2, Search, UserCircle, X, Image, Palette } from 'lucide-react';
import { useOpenCV } from './useOpenCV';
import { useDataStore } from '../../store/useDataStore';
import { getAllAtomImages } from '../../store/imageStorage';
import type { TreeNode, Domain, Blueprint } from '../../types';
import './AutoScan.css';
import { ImageUploadInput, isImageField, isValidImageUrl, type ImagePair } from '../ImageUploadInput';
import { formatPhoneNumber, applyAutoFormat, formatKoreanName, getEntityBasePrefix } from '../../utils/formatters';
import { useOwnerSelection } from './useOwnerSelection';

interface AutoScanPageProps {
  onBack: () => void;
  onOpenOwners?: () => void;
}

type ScanPhase = 'viewfinder' | 'captured' | 'saved' | 'editing';
type ScanMode = 'auto' | 'manual';

interface Point { x: number; y: number; }

interface DetectedRect {
  corners: { x: number; y: number }[];
  widthPx: number;
  heightPx: number;
  widthMm: number | null;
  heightMm: number | null;
  area: number;
  centerX: number;
  centerY: number;
}



interface DomainTabsBarProps {
  domId: string;
  domName: string;
  childNodes: TreeNode[];
  activeNode: TreeNode | null;
  fieldConfigPopup: string | null;
  setFieldConfigPopup: React.Dispatch<React.SetStateAction<string | null>>;
  handleSwitchSubNode: (domId: string, targetNode: TreeNode) => void;
  getEntitiesForDomainAndSpecificNode: (domId: string, node: TreeNode) => any[];
}

const DomainTabsBar: React.FC<DomainTabsBarProps> = ({
  domId,
  domName,
  childNodes,
  activeNode,
  fieldConfigPopup,
  setFieldConfigPopup,
  handleSwitchSubNode,
  getEntitiesForDomainAndSpecificNode,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const scrollLeftRef = useRef(0);
  const hasMovedRef = useRef(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    isDraggingRef.current = true;
    hasMovedRef.current = false;
    startXRef.current = e.pageX - containerRef.current.offsetLeft;
    scrollLeftRef.current = containerRef.current.scrollLeft;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current || !containerRef.current) return;
    const x = e.pageX - containerRef.current.offsetLeft;
    const walk = (x - startXRef.current);
    if (Math.abs(walk) > 4) {
      hasMovedRef.current = true;
    }
    containerRef.current.scrollLeft = scrollLeftRef.current - walk;
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  const handleMouseLeave = () => {
    isDraggingRef.current = false;
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (containerRef.current && e.deltaY !== 0) {
      containerRef.current.scrollLeft += e.deltaY;
    }
  };

  return (
    <div
      ref={containerRef}
      className="scan-tabs-scrollbar-hidden"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onWheel={handleWheel}
      style={{
        display: 'flex',
        alignItems: 'center',
        flex: 1,
        minWidth: 0,
        overflowX: 'auto',
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
        cursor: 'default',
        userSelect: 'none',
        padding: '0 10px',
        gap: '6px',
      }}
    >
      {/* 필드 설정 아이콘 */}
      <button
        type="button"
        className="scan-domain-icon-config-btn"
        title="필드 설정"
        onClick={e => {
          e.stopPropagation();
          setFieldConfigPopup(prev => prev === domId ? null : domId);
        }}
        style={{
          background: 'none',
          border: 'none',
          padding: '2px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          borderRadius: '4px',
          color: fieldConfigPopup === domId ? '#4f46e5' : '#6366f1',
          flexShrink: 0,
        }}
      >
        <Layers size={13} />
      </button>
      {/* 활성 노드 이름 : 도메인명 */}
      <span style={{ fontWeight: 700, fontSize: '0.8rem', color: '#3730a3', whiteSpace: 'nowrap' }}>
        {activeNode?.label} : {domName}
      </span>
      {/* 비활성 탭들을 숫자 뱃지로 표시 */}
      {childNodes.filter(n => n.id !== activeNode?.id).map((childNode, idx) => (
        <div
          key={childNode.id}
          onClick={(e) => {
            if (hasMovedRef.current) return;
            e.stopPropagation();
            handleSwitchSubNode(domId, childNode);
          }}
          title={childNode.label}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: '22px',
            height: '22px',
            padding: '0 6px',
            borderRadius: '999px',
            background: '#dde4ff',
            color: '#3730a3',
            fontWeight: 700,
            fontSize: '0.75rem',
            cursor: 'pointer',
            flexShrink: 0,
            transition: 'background 0.12s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#c7d2fe'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = '#dde4ff'; }}
        >
          {childNodes.indexOf(childNode) + 1}
        </div>
      ))}
    </div>
  );
};

export const AutoScanPage: React.FC<AutoScanPageProps> = ({ onBack, onOpenOwners }) => {
  // ===== 데이터 스토어 연동 =====
  const { domains, blueprints, getFieldsForDomain, addEntityToDomain, updateEntityField, removeEntityFromDomain, updateBlueprint, getAtomsForDomain, getAllPersonData } = useDataStore();

  // 트리 필드: '소장품' 트리 최우선 가져오기 (없으면 첫 번째 트리)
  const treeBlueprint = useMemo(() => {
    return blueprints.find(b => b.inputType === 'tree' && (b.name === '소장품' || b.name.includes('소장품')))
      || blueprints.find(b => b.inputType === 'tree' && b.treeData && b.treeData.length > 0)
      || null;
  }, [blueprints]);

  const masterTreeData = useMemo(() => treeBlueprint?.treeData || [], [treeBlueprint]);

  // 소장품 트리의 첫 번째 노드 리스트 (1단계 자식 노드들: 편지, 병풍, 책 등)
  const sojangFirstLevelNodes = useMemo<TreeNode[]>(() => {
    if (!masterTreeData || masterTreeData.length === 0) return [];
    if (masterTreeData.length === 1 && masterTreeData[0].children && masterTreeData[0].children.length > 0) {
      return masterTreeData[0].children;
    }
    return masterTreeData;
  }, [masterTreeData]);

  const [sojangSearchQuery, setSojangSearchQuery] = useState('');
  const filteredSojangNodes = useMemo(() => {
    if (!sojangSearchQuery.trim()) return sojangFirstLevelNodes;
    const q = sojangSearchQuery.trim().toLowerCase();
    return sojangFirstLevelNodes.filter(node => node.label.toLowerCase().includes(q));
  }, [sojangFirstLevelNodes, sojangSearchQuery]);
  void setSojangSearchQuery;
  void filteredSojangNodes;

  const [editSojangSearchQuery, setEditSojangSearchQuery] = useState('');
  const filteredEditSojangNodes = useMemo(() => {
    if (!editSojangSearchQuery.trim()) return sojangFirstLevelNodes;
    const q = editSojangSearchQuery.trim().toLowerCase();
    return sojangFirstLevelNodes.filter(node => node.label.toLowerCase().includes(q));
  }, [sojangFirstLevelNodes, editSojangSearchQuery]);

  // 트리에서 선택한 노드 경로 및 노드 객체
  const [selectedTreePath, setSelectedTreePath] = useState<string>('');
  const [selectedTreeNode, setSelectedTreeNode] = useState<TreeNode | null>(null);
  const [treeExpandedPaths, setTreeExpandedPaths] = useState<Set<string>>(new Set());
  // 소장품선택 드롭다운 접힘/펼침 상태
  const [isTreeOpen, setIsTreeOpen] = useState<boolean>(false);
  void isTreeOpen;
  // 소장품추가 팝업 (소장품 종류 선택 모달)
  const [showSojangPickerPopup, setShowSojangPickerPopup] = useState<boolean>(false);
  const [sojangPickerQuery, setSojangPickerQuery] = useState<string>('');
  // 저장된 자료 패널 열림/닫힘 및 종류별 펼침
  const [savedDataPanelOpen, setSavedDataPanelOpen] = useState<boolean>(false);
  const [savedDataExpandedTypes, setSavedDataExpandedTypes] = useState<Set<string>>(new Set());

  // 노드 자체에 직접 연결된 도메인 ID만 반환 (하위 노드 제외)
  const getNodeOwnLinkedDomainIds = useCallback((node: TreeNode): string[] => {
    if (Array.isArray(node.linkedDomainIds) && node.linkedDomainIds.length > 0) {
      return node.linkedDomainIds;
    }
    if (node.linkedDomainId) {
      return [node.linkedDomainId];
    }
    return [];
  }, []);

  // 선택한 노드 및 모든 자손 노드에 연결된 도메인 목록 수집 (계층 순서)
  const getAllLinkedDomainsForNodeAndDescendants = useCallback((rootNode: TreeNode): Domain[] => {
    const result: Domain[] = [];
    const addedIds = new Set<string>();

    const traverse = (node: TreeNode, parentPath: string = '') => {
      // 1. 노드 자체에 직접 연결된 도메인 ID들 (linkedDomainIds) - 최우선 연결
      const ownIds = getNodeOwnLinkedDomainIds(node);
      if (ownIds.length > 0) {
        ownIds.forEach(id => {
          if (!addedIds.has(id)) {
            const dom = domains.find(d => d.id === id);
            if (dom) {
              result.push(dom);
              addedIds.add(id);
            }
          }
        });
      } else {
        // 직접 연결된 도메인이 없을 때만 노드 이름과 일치하는 도메인 폴백 (실제 필드가 있는 도메인만)
        const byName = domains.find(d => d.name === node.label);
        if (byName && !addedIds.has(byName.id)) {
          const domFields = getFieldsForDomain(byName.id).filter(f => !f.name.startsWith('_'));
          if (domFields.length > 0) {
            result.push(byName);
            addedIds.add(byName.id);
          }
        }
      }

      // 2. 모든 자손 노드 재귀 탐색
      if (node.children && node.children.length > 0) {
        node.children.forEach(child => traverse(child, parentPath ? `${parentPath} > ${node.label}` : node.label));
      }
    };

    traverse(rootNode, '');
    return result;
  }, [domains, getNodeOwnLinkedDomainIds, getFieldsForDomain]);

  // 도메인 ID -> 연결된 노드 정보 { node: TreeNode, path: string, isDescendant: boolean }
  const domainOriginMap = useMemo(() => {
    const map = new Map<string, { node: TreeNode; path: string; isDescendant: boolean }>();
    if (!selectedTreeNode) return map;

    const traverse = (node: TreeNode, parentPath: string = '', isDescendant: boolean = false) => {
      const currentPath = parentPath ? `${parentPath} > ${node.label}` : node.label;

      const ownIds = getNodeOwnLinkedDomainIds(node);
      if (ownIds.length > 0) {
        ownIds.forEach(id => {
          if (!map.has(id)) {
            map.set(id, { node, path: currentPath, isDescendant });
          }
        });
      } else {
        const byName = domains.find(d => d.name === node.label);
        if (byName && !map.has(byName.id)) {
          map.set(byName.id, { node, path: currentPath, isDescendant });
        }
      }

      if (node.children && node.children.length > 0) {
        node.children.forEach(child => traverse(child, currentPath, true));
      }
    };

    traverse(selectedTreeNode, selectedTreeNode.label, false);
    return map;
  }, [selectedTreeNode, domains, getNodeOwnLinkedDomainIds]);

  // 선택한 노드 및 자손 노드에 연결된 모든 도메인 (유효한 필드가 있는 도메인만)
  const selectedLinkedDomains = useMemo(() => {
    if (!selectedTreeNode) return [];
    const all = getAllLinkedDomainsForNodeAndDescendants(selectedTreeNode);
    return all.filter(dom => {
      const fields = getFieldsForDomain(dom.id).filter(f => !f.name.startsWith('_'));
      return fields.length > 0;
    });
  }, [selectedTreeNode, getAllLinkedDomainsForNodeAndDescendants, getFieldsForDomain]);

  // 연결 도메인의 활성 필드 (내부 필드 제외, tree 타입은 포함)
  const linkedDomainFields = useMemo(() => {
    const map = new Map<string, Blueprint[]>();
    selectedLinkedDomains.forEach(dom => {
      const fields = getFieldsForDomain(dom.id).filter(f => 
        !f.name.startsWith('_')
      );
      map.set(dom.id, fields);
    });
    return map;
  }, [selectedLinkedDomains, getFieldsForDomain]);

  // 연결 도메인 추가 데이터 폼
  const [linkedFormData, setLinkedFormData] = useState<Record<string, Record<string, string>>>({});

  // 구성요소(필드) 사용여부 상태 (DomainView와 localStorage 공유)
  const [constituentFieldStatusMap, setConstituentFieldStatusMap] = useState<Record<string, { useStatus?: '용' | '부'; visibility?: '보기' | '감추기' }>>(() => {
    try {
      return JSON.parse(localStorage.getItem('COMP_v3_constituent_field_config') || '{}');
    } catch {
      return {};
    }
  });

  const getConstituentFieldConfig = useCallback((domainId: string, fieldName: string, nodeId?: string): { useStatus: '용' | '부'; visibility: '보기' | '감추기' } => {
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

  // 필드 설정 팝업 상태 (domainId | null)
  const [fieldConfigPopup, setFieldConfigPopup] = useState<string | null>(null);
  // 도메인 연결 설정 팝업 (노드 정보)
  const [domainLinkPopup, setDomainLinkPopup] = useState<{ node: TreeNode; path: string } | null>(null);

  // 필드 설정 업데이트 + localStorage 동기화
  const updateFieldConfig = useCallback((domainId: string, fieldName: string, updates: { useStatus?: '용' | '부'; visibility?: '보기' | '감추기' }) => {
    const key = `${domainId}_${fieldName}`;
    setConstituentFieldStatusMap(prev => {
      const next = { ...prev, [key]: { ...prev[key], ...updates } };
      try { localStorage.setItem('COMP_v3_constituent_field_config', JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  // treeData에서 특정 노드의 linkedDomainIds 업데이트
  const updateNodeLinkedDomains = useCallback((nodeId: string, newDomainIds: string[]) => {
    if (!treeBlueprint) return;
    const updateNode = (nodes: TreeNode[]): TreeNode[] =>
      nodes.map(n => {
        if (n.id === nodeId) return { ...n, linkedDomainIds: newDomainIds, linkedDomainId: newDomainIds[0] };
        if (n.children) return { ...n, children: updateNode(n.children) };
        return n;
      });
    const newTree = updateNode(JSON.parse(JSON.stringify(masterTreeData)));
    setTimeout(() => updateBlueprint(treeBlueprint.id, { treeData: newTree }), 0);
  }, [treeBlueprint, masterTreeData, updateBlueprint]);

  // AutoScan 도메인 카드에서 숨김 필드 펼침/접힘 상태 (domainId 기준)
  const [expandedScanHidden, setExpandedScanHidden] = useState<Set<string>>(new Set());
  const handleToggleScanHidden = useCallback((domainId: string) => {
    setExpandedScanHidden(prev => {
      const next = new Set(prev);
      if (next.has(domainId)) next.delete(domainId);
      else next.add(domainId);
      return next;
    });
  }, []);


  // AutoScan 도메인 카드 전체 접힘/펼침 상태 (domainId 기준, Set에 있으면 접힘)
  const [collapsedDomainCards, setCollapsedDomainCards] = useState<Set<string>>(new Set());
  const handleToggleCollapseDomainCard = useCallback((domainId: string) => {
    setCollapsedDomainCards(prev => {
      const next = new Set(prev);
      if (next.has(domainId)) next.delete(domainId);
      else next.add(domainId);
      return next;
    });
  }, []);

  // ─── 소장자 선택 ───
  // 반드시 'dom-owner' 또는 정확한 이름 '소장자'를 최우선으로 매칭 (소장품 등 타 도메인 오인 방지)
  const ownerDomain = useMemo(
    () => domains.find(d => d.id === 'dom-owner')
       || domains.find(d => d.name === '소장자')
       || domains.find(d => d.name.includes('소장자'))
       || null,
    [domains]
  );
  // Blueprint 실제 필드명 기준으로 anchor 필드명 결정 (불일치 방지)
  const ownerAnchorField = useMemo(() => {
    if (!ownerDomain) return '이름';
    // Blueprint ID → name 변환 헬퍼
    const resolveField = (f: string) => {
      if (!f.startsWith('atom-')) return f;
      return blueprints.find(b => b.id === f)?.name || f;
    };
    // domain.anchor 정규화
    const normalizedAnchor = ownerDomain.anchor ? resolveField(ownerDomain.anchor) : undefined;
    // domain.fields 정규화
    const normalizedFields = ownerDomain.fields.map(resolveField);
    // normalizedAnchor가 normalizedFields 안에 있으면 그것이 실제 데이터 키
    if (normalizedAnchor && normalizedFields.includes(normalizedAnchor)) {
      return normalizedAnchor;
    }
    const fields = getFieldsForDomain(ownerDomain.id);
    // domain.anchor와 일치하는 필드를 실제 name으로 찾기
    const anchorField = fields.find(f => f.id === ownerDomain.anchor || f.name === ownerDomain.anchor || f.name === normalizedAnchor);
    if (anchorField) return anchorField.name;
    // 폴백: 이름/성명 등 일반적인 이름 필드
    const nameField = fields.find(f => f.name.includes('이름') || f.name.includes('성명') || f.name.includes('name'));
    if (nameField) return nameField.name;
    // 최종 폴백: normalizedFields 첫 번째 (Blueprint name으로 변환된 값)
    return normalizedFields[0] || fields[0]?.name || '이름';
  }, [ownerDomain, getFieldsForDomain, blueprints]);

  // ownerDomain.fields를 Blueprint name으로 정규화 (Blueprint ID 형식 대응)
  const ownerNormalizedFields = useMemo(() => {
    if (!ownerDomain) return [];
    return ownerDomain.fields.map(f => {
      if (!f.startsWith('atom-')) return f;
      return blueprints.find(b => b.id === f)?.name || f;
    });
  }, [ownerDomain, blueprints]);

  // 🔒 소장자 선택 및 상태 관리 (독립 훅 분리 - 무한 핑퐁/진동 영구 방지)
  const {
    ownerEntities,
    filteredOwnerEntities,
    selectedOwner,
    setSelectedOwner,
    ownerDetailExpanded,
    setOwnerDetailExpanded,
    ownerSearchQuery,
    setOwnerSearchQuery,
    ownerSearchFocused,
    setOwnerSearchFocused,
    handleSelectOwner,
    handleClearOwner,
  } = useOwnerSelection({
    ownerDomain,
    getAtomsForDomain,
    getAllPersonData,
    ownerAnchorField,
    ownerNormalizedFields,
  });

  // 소장자별 소장품 건수 맵 { ownerAnchorId → 총 건수 }
  // 소장품 트리 1단계 노드(책, 편지, 병풍 등)에 해당하는 엔티티만 카운팅 (표지/속지 등 하위 제외)
  const ownerItemCountMap = useMemo<Record<string, number>>(() => {
    const map: Record<string, number> = {};

    // 소장품 트리 1단계 노드 ID 집합 (직계 자식: 책, 편지, 병풍 등)
    const firstLevelNodeIds = new Set<string>(sojangFirstLevelNodes.map(n => n.id));

    // 소장자/명함/동창/모임/회사 및 하위 기록물 도메인 제외
    const nonArchiveDomainIds = new Set([
      'dom-bizcard', 'dom-alumni', 'dom-group', 'dom-company',
      'dom-book-cover', 'dom-book-pages', 'dom-letter-envelope', 'dom-letter-paper', 'dom-screen-img'
    ]);
    if (ownerDomain) nonArchiveDomainIds.add(ownerDomain.id);

    const archiveDomains = domains.filter(d => !nonArchiveDomainIds.has(d.id));
    const seenEntityIds = new Set<string>();
    archiveDomains.forEach(dom => {
      const entities = getAtomsForDomain(dom.id);
      entities.forEach(ent => {
        // 하위 기록물(표지, 속지 등) 및 중복 엔티티 카운트 제외 (최상위 소장품만 카운트)
        if (ent.data._parentInstanceId) return;
        if (seenEntityIds.has(ent.anchorId)) return;

        const ownerId = ent.data._ownerId;
        if (!ownerId) return;

        // _treeNodeId가 있으면 1단계 노드인 경우만 카운팅 (표지/속지 등 하위 노드 제외)
        // _treeNodeId가 없으면 (트리 미설정 데이터) 포함
        const treeNodeId = ent.data._treeNodeId;
        if (treeNodeId && firstLevelNodeIds.size > 0 && !firstLevelNodeIds.has(treeNodeId)) return;

        seenEntityIds.add(ent.anchorId);

        // ownerId 정규화: "-이름" 접미어 제거 후 매핑
        const normalizedOwnerId = ownerId.replace(/-이름$/, '');
        const matchedOwner = ownerEntities.find(oe => {
          const cleanOwnerAnchorId = oe.anchorId.replace(/-이름$/, '');
          return oe.anchorId === ownerId ||
            oe.anchorId === normalizedOwnerId ||
            cleanOwnerAnchorId === ownerId ||
            cleanOwnerAnchorId === normalizedOwnerId ||
            ownerId.startsWith(cleanOwnerAnchorId);
        });
        const key = matchedOwner?.anchorId || ownerId;
        map[key] = (map[key] || 0) + 1;
      });
    });
    return map;
  }, [domains, ownerEntities, ownerDomain, getAtomsForDomain, sojangFirstLevelNodes]);

  // 소장품 전체 총 건수 (ownerItemCountMap 합산)
  const totalArchiveItemCount = useMemo(() => {
    return Object.values(ownerItemCountMap).reduce((sum, c) => sum + c, 0);
  }, [ownerItemCountMap]);

  // 소장자 변경 시 모든 도메인 선택 상태 및 폼 데이터 완전 초기화
  useEffect(() => {
    setSelectedEntityByDomain({});
    setLinkedFormData({});
    setActivePreviewImage(null);
    setIsNewSetMode(false);
    setSavedDataPanelOpen(false);
    setSavedDataExpandedTypes(new Set());
  }, [selectedOwner?.anchorId]);

  const [isNewSetMode, setIsNewSetMode] = useState(false);

  // 도메인별 선택된 엔티티 anchorId (수정/조회 모드)
  const [selectedEntityByDomain, setSelectedEntityByDomain] = useState<Record<string, string | null>>({});

  // 도메인별 현재 활성화된 서브 노드 ID (예: '기록물' 도메인 내의 [표지] vs [속지])
  const [activeSubNodeByDomain, setActiveSubNodeByDomain] = useState<Record<string, string>>({});

  // IndexedDB에 저장된 이미지 맵 ({ atomId: base64 })
  const [idbImageMap, setIdbImageMap] = useState<Record<string, string>>({});
  const reloadIdbImages = useCallback(() => {
    getAllAtomImages().then(map => {
      if (map && Object.keys(map).length > 0) setIdbImageMap(map);
    }).catch(console.error);
  }, []);
  useEffect(() => {
    reloadIdbImages();
  }, [reloadIdbImages]);

  // 특정 도메인에 연결된 자식(하위) 노드 목록 조회 (예: '책' 노드 하위의 '기록물' 도메인 -> ['표지', '속지'])
  const getChildNodesForDomain = useCallback((domId: string): TreeNode[] => {
    if (!selectedTreeNode || !selectedTreeNode.children) return [];
    const matched: TreeNode[] = [];
    const checkNode = (node: TreeNode) => {
      const ownIds = getNodeOwnLinkedDomainIds(node);
      const isLinked = ownIds.includes(domId) || (ownIds.length === 0 && domains.find(d => d.id === domId)?.name === node.label);
      if (isLinked) {
        matched.push(node);
      }
      if (node.children && node.children.length > 0) {
        node.children.forEach(checkNode);
      }
    };
    selectedTreeNode.children.forEach(checkNode);
    return matched;
  }, [selectedTreeNode, getNodeOwnLinkedDomainIds, domains]);

  // 도메인의 현재 활성 오리진 노드 가져오기
  const getActiveOriginNodeForDomain = useCallback((domId: string): TreeNode | null => {
    const childNodes = getChildNodesForDomain(domId);
    if (childNodes.length > 0) {
      const activeId = activeSubNodeByDomain[domId];
      const found = childNodes.find(n => n.id === activeId);
      return found || childNodes[0];
    }
    return domainOriginMap.get(domId)?.node || selectedTreeNode;
  }, [getChildNodesForDomain, activeSubNodeByDomain, domainOriginMap, selectedTreeNode]);

  // 특정 도메인 및 특정 노드에 속한 엔티티 목록 가져오기 (권/인스턴스별 데이터 격리 포함)
  const getEntitiesForDomainAndSpecificNode = useCallback((domId: string, node: TreeNode, parentInstanceIdOverride?: string | null) => {
    const allDomainEntities = getAtomsForDomain(domId);
    const topDom = selectedLinkedDomains[0];
    const isChildDomain = topDom && topDom.id !== domId;
    const currentTopAnchorId = parentInstanceIdOverride !== undefined
      ? parentInstanceIdOverride
      : (topDom ? selectedEntityByDomain[topDom.id] : null);

    const filtered = allDomainEntities.filter(ent => {
      const byNodeId = ent.data._treeNodeId === node.id;
      const byLabelMatch = !ent.data._treeNodeId &&
        Object.entries(ent.data).some(([k, v]) => !k.startsWith('_') && typeof v === 'string' && v.trim() === node.label);
      if (!byNodeId && !byLabelMatch) return false;

      if (selectedOwner) {
        const cleanOwnerId = selectedOwner.anchorId ? selectedOwner.anchorId.replace(/-이름$/, '') : '';
        const norm = (s?: string) => (s || '').replace(/\s+/g, '');
        const normOwnerName = norm(selectedOwner.label);
        const rawOwner = ent.data._ownerId;
        const ownerMatch = rawOwner && (
          rawOwner === selectedOwner.anchorId ||
          rawOwner === `${cleanOwnerId}-이름` ||
          rawOwner === cleanOwnerId ||
          (cleanOwnerId && rawOwner.startsWith(cleanOwnerId)) ||
          (normOwnerName && norm(rawOwner) === normOwnerName) ||
          (normOwnerName && norm(rawOwner).includes(normOwnerName))
        );
        if (!ownerMatch) return false;
      }

      // 하위 도메인(표지, 속지 등)인 경우 현재 선택된 최상위 인스턴스(책 1권, 2권 등)에 귀속된 데이터만 격리하여 관리
      if (isChildDomain) {
        // 새 권 세트 작성 중이거나 선택된 상위 권이 없는 경우 하위 목록은 빈 상태
        if (isNewSetMode && parentInstanceIdOverride === undefined) return false;
        if (!currentTopAnchorId) return false;

        if (ent.data._parentInstanceId) {
          return ent.data._parentInstanceId === currentTopAnchorId;
        }

        // 레거시 데이터: _parentInstanceId가 없는 경우, 최상위 첫 번째 엔티티에만 귀속 (2권 등에 공유 방지)
        const topEntitiesForLegacy = getAtomsForDomain(topDom.id).filter(te => {
          if (selectedOwner) {
            const cleanOwnerId = selectedOwner.anchorId ? selectedOwner.anchorId.replace(/-이름$/, '') : '';
            return te.data._ownerId === selectedOwner.anchorId ||
              te.data._ownerId === `${cleanOwnerId}-이름` ||
              te.data._ownerId === cleanOwnerId ||
              (cleanOwnerId && te.data._ownerId?.startsWith(cleanOwnerId));
          }
          return true;
        });
        // 레거시: _savedAt 내림차순 기준 첫 번째 (ArchivalDescription과 동일 기준)
        topEntitiesForLegacy.sort((a, b) => {
          const tA = parseInt(a.data._savedAt || '0', 10);
          const tB = parseInt(b.data._savedAt || '0', 10);
          if (tA && tB) return tB - tA;
          return b.anchorId.localeCompare(a.anchorId);
        });
        const firstTopAnchor = topEntitiesForLegacy[0]?.anchorId;
        return firstTopAnchor ? firstTopAnchor === currentTopAnchorId : false;
      }

      return true;
    });

    // ArchivalDescription과 동일하게 _savedAt 내림차순(최신→오래된) 정렬
    // → AutoScan #1 = ArchivalDescription #1 = 가장 최근 저장된 항목
    filtered.sort((a, b) => {
      const tA = parseInt(a.data._savedAt || '0', 10);
      const tB = parseInt(b.data._savedAt || '0', 10);
      if (tA && tB) return tB - tA;
      return b.anchorId.localeCompare(a.anchorId);
    });

    return filtered;
  }, [getAtomsForDomain, selectedOwner, selectedLinkedDomains, selectedEntityByDomain, isNewSetMode]);

  // 소분류(하위 노드) 추가 핸들러: 현재 selectedTreeNode의 children에 새 노드를 추가하고 domId를 연결
  const handleAddSubNode = useCallback((domId: string, domName: string) => {
    if (!treeBlueprint || !selectedTreeNode) return;
    const label = window.prompt(`"${domName}" 도메인에 추가할 소분류 이름을 입력하세요:`, '');
    if (!label || !label.trim()) return;
    const newNode: TreeNode = {
      id: `node-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      label: label.trim(),
      linkedDomainIds: [domId],
      linkedDomainId: domId,
      children: [],
    };
    const addChildToNode = (nodes: TreeNode[]): TreeNode[] =>
      nodes.map(n => {
        if (n.id === selectedTreeNode.id) {
          return { ...n, children: [...(n.children || []), newNode] };
        }
        if (n.children && n.children.length > 0) {
          return { ...n, children: addChildToNode(n.children) };
        }
        return n;
      });
    const newTree = addChildToNode(JSON.parse(JSON.stringify(masterTreeData)));
    setTimeout(() => updateBlueprint(treeBlueprint.id, { treeData: newTree }), 0);
  }, [treeBlueprint, selectedTreeNode, masterTreeData, updateBlueprint]);

  // 하위 노드 탭 전환 핸들러 (예: [표지] <-> [속지])
  const handleSwitchSubNode = useCallback((domId: string, targetNode: TreeNode) => {
    setActiveSubNodeByDomain(prev => ({ ...prev, [domId]: targetNode.id }));
    const subEnts = getEntitiesForDomainAndSpecificNode(domId, targetNode);
    if (subEnts.length > 0) {
      setSelectedEntityByDomain(prev => ({ ...prev, [domId]: subEnts[0].anchorId }));
      setLinkedFormData(prev => ({ ...prev, [domId]: { ...subEnts[0].data } }));
    } else {
      setSelectedEntityByDomain(prev => ({ ...prev, [domId]: null }));
      setLinkedFormData(prev => ({ ...prev, [domId]: {} }));
    }
    setActivePreviewImage(null);
  }, [getEntitiesForDomainAndSpecificNode]);

  // 트리 노드 클릭 핸들러 (노드 클릭 시 자동으로 접힘)
  const handleTreeNodeClick = useCallback((node: TreeNode, path: string) => {
    setSelectedTreePath(path);
    setSelectedTreeNode(node);
    setActiveSubNodeByDomain({});
    setIsTreeOpen(false);
    setNodeEntityMode('new');
    setEditTargetAnchorId(null);
    setShowEntitySelectPopup(false);

    // 선택 노드 및 모든 자손 노드 연결 도메인의 폼 데이터 초기화
    const allDoms = getAllLinkedDomainsForNodeAndDescendants(node);
    const initData: Record<string, Record<string, string>> = {};
    allDoms.forEach(dom => {
      initData[dom.id] = {};
    });
    setLinkedFormData(initData);

    // 엔티티 감지는 useEffect(selectedLinkedDomains)에서 처리
    // (selectedLinkedDomains가 업데이트된 후에 실행되어야 정확함)
  }, [getAllLinkedDomainsForNodeAndDescendants]);

  // ===== selectedLinkedDomains 변경 시 엔티티 자동 감지 =====
  // handleTreeNodeClick 이후 selectedLinkedDomains가 업데이트되면 실행됨
  React.useEffect(() => {
    if (!selectedTreeNode) {
      setNodeExistingEntities([]);
      setNodeEntityMode('add');
      return;
    }
    const existingList: Array<{ anchorId: string; domainId: string; domainName: string; data: Record<string, string>; label: string }> = [];
    selectedLinkedDomains.forEach(dom => {
      const ents = getAtomsForDomain(dom.id);
      ents.forEach((e: { anchorId: string; data: Record<string, string> }) => {
        const originNode = domainOriginMap.get(dom.id)?.node || selectedTreeNode;
        const byNodeId = e.data._treeNodeId === originNode.id;
        const byLabelMatch = !e.data._treeNodeId &&
          Object.entries(e.data).some(([k, v]) => !k.startsWith('_') && v.trim() === originNode.label);
        if (byNodeId || byLabelMatch) {
          const labelField = dom.fields.find(f => e.data[f]?.trim() && !f.startsWith('_'));
          const label = labelField ? (e.data[labelField] || e.anchorId) : e.anchorId;
          existingList.push({ anchorId: e.anchorId, domainId: dom.id, domainName: dom.name, data: e.data, label });
        }
      });
    });
    setNodeExistingEntities(existingList);
    if (existingList.length > 0) {
      setNodeEntityMode('edit');
      if (existingList.length === 1) {
        const ent = existingList[0];
        setEditTargetAnchorId(ent.anchorId);
        setLinkedFormData(prev => ({
          ...prev,
          [ent.domainId]: { ...ent.data, _treeNodeId: selectedTreeNode.id }
        }));
        setShowEntitySelectPopup(false);
      } else {
        setShowEntitySelectPopup(true);
      }
    } else {
      setNodeEntityMode('add');
      setEditTargetAnchorId(null);
      setShowEntitySelectPopup(false);
    }
    // 소장품 선택 변경 시 새 세트 모드 리셋
    setIsNewSetMode(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLinkedDomains, selectedTreeNode?.id, domainOriginMap]);

  // 트리 노드 토글(펼치기/접기)
  const handleTreeToggle = useCallback((path: string) => {
    setTreeExpandedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  // 트리 노드 렌더링 함수
  const renderTreeNodes = useCallback((nodes: TreeNode[], parentPath: string = '', depth: number = 0): React.ReactNode => {
    return nodes.map(node => {
      const path = parentPath ? `${parentPath} > ${node.label}` : node.label;
      const hasChildren = node.children && node.children.length > 0;
      const isExpanded = treeExpandedPaths.has(path);
      const isSelected = selectedTreePath === path;
      const linkedIds = getNodeOwnLinkedDomainIds(node);
      const nameMatchDomain = linkedIds.length === 0 ? domains.find(d => d.name === node.label) : undefined;
      const totalLinked = linkedIds.length + (nameMatchDomain ? 1 : 0);
      const hasLinkedDomain = totalLinked > 0;

      return (
        <div key={path} className="scan-tree-node-group">
          <div
            className={`scan-tree-node ${isSelected ? 'selected' : ''} ${hasLinkedDomain ? 'has-domain' : ''}`}
            style={{ paddingLeft: `${12 + depth * 18}px` }}
            onClick={() => {
              handleTreeNodeClick(node, path);
            }}
          >
            {hasChildren ? (
              <span
                className="scan-tree-toggle"
                onClick={e => { e.stopPropagation(); handleTreeToggle(path); }}
              >
                {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              </span>
            ) : (
              <span className="scan-tree-toggle leaf" />
            )}
            <span className="scan-tree-icon">{node.icon || '📁'}</span>
            <span className="scan-tree-label">{node.label}</span>
            <button
              type="button"
              className={`scan-tree-link-btn ${hasLinkedDomain ? 'has-link' : 'no-link'}`}
              title={hasLinkedDomain ? `연결 도메인: ${totalLinked}개 (클릭하여 설정)` : '도메인 연결 설정'}
              onClick={e => {
                e.stopPropagation();
                setDomainLinkPopup({ node, path });
              }}
            >
              <Link2 size={11} />
              {hasLinkedDomain && <span>{totalLinked}</span>}
            </button>
          </div>
          {hasChildren && isExpanded && (
            <div className="scan-tree-children">
              {renderTreeNodes(node.children!, path, depth + 1)}
            </div>
          )}
        </div>
      );
    });
  }, [treeExpandedPaths, selectedTreePath, handleTreeNodeClick, handleTreeToggle, getNodeOwnLinkedDomainIds, domains]);

  const [phase, setPhase] = useState<ScanPhase>('viewfinder');
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [capturedImage, setCapturedImage] = useState<string>('');

  // 현재 선택된 노드에 카메라 속성 필드가 있는 도메인이 포함되어 있는지 여부
  const hasCameraFieldInSelectedNode = useMemo(() => {
    if (!selectedTreeNode) return true; // 노드 미선택 시는 기본값
    return selectedLinkedDomains.some(dom => {
      const fields = linkedDomainFields.get(dom.id) || [];
      return fields.some(f => f.inputType === 'camera');
    });
  }, [selectedTreeNode, selectedLinkedDomains, linkedDomainFields]);

  // 우측 도메인 폼에서 선택/업로드된 이미지 미리보기
  const [activePreviewImage, setActivePreviewImage] = useState<string | null>(null);

  // 우측 도메인 폼에서 업로드된 이미지 추출 (활성화된 미리보기 우선)
  const uploadedImageFromForm = useMemo(() => {
    // 1. 활성화된 미리보기 이미지가 있고 여전히 유효한 경우 우선
    if (activePreviewImage) {
      let exists = false;
      for (const dom of selectedLinkedDomains) {
        const formData = linkedFormData[dom.id] || {};
        if (Object.values(formData).some(v => v === activePreviewImage)) {
          exists = true;
          break;
        }
      }
      if (exists) return activePreviewImage;
    }

    // 2. 전체 연결 도메인의 폼 데이터 순회하며 유효 이미지 데이터 탐색
    for (const dom of selectedLinkedDomains) {
      const formData = linkedFormData[dom.id] || {};
      const fields = linkedDomainFields.get(dom.id) || [];
      for (const f of fields) {
        const val = formData[f.name];
        if (typeof val === 'string' && isValidImageUrl(val)) {
          return val;
        }
        // 복수 이미지 suffix (f.name_0 등)에서도 탐색
        for (let idx = 0; idx < 10; idx++) {
          const indexedVal = formData[`${f.name}_${idx}`];
          if (typeof indexedVal === 'string' && isValidImageUrl(indexedVal)) {
            return indexedVal;
          }
        }
      }
    }
    return null;
  }, [selectedLinkedDomains, linkedFormData, linkedDomainFields, activePreviewImage]);

  // 좌측 메인 뷰포트에 크게 표시할 이미지:
  // 1) 폼에서 업로드된 이미지가 있으면 최우선으로 좌측에 크게 표시
  // 2) 촬영된 카메라 이미지가 있으면 표시
  const centralDisplayImage = useMemo(() => {
    if (uploadedImageFromForm) {
      return uploadedImageFromForm;
    }
    if (capturedImage) {
      return capturedImage;
    }
    return null;
  }, [uploadedImageFromForm, capturedImage]);

  const [showFlash, setShowFlash] = useState(false);

  // 카메라 선택
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>(() => localStorage.getItem('as_cameraId') ?? '');

  // 사이즈
  const [sizeWidth, setSizeWidth] = useState('');
  const [sizeHeight, setSizeHeight] = useState('');
  const [hasDetectedObject, setHasDetectedObject] = useState(false);
  const [, setDetectedPixelSize] = useState<{w: number; h: number} | null>(null);

  // 캘리브레이션 패널
  const [showCalibPanel, setShowCalibPanel] = useState(false);
  const [calibInputW, setCalibInputW] = useState('');
  const [calibInputH, setCalibInputH] = useState('');
  // 패널 열릴 때 스냅샷된 감지 픽셀 크기
  const [calibDetectedPx, setCalibDetectedPx] = useState<{w: number; h: number} | null>(null);

  // 저장 목록
  const [savedItems, setSavedItems] = useState<Array<{
    id: string; image: string; width: string; height: string;
    timestamp: number;
    treePath?: string;
    treeNodeId?: string;
    domainIds?: string[];
    domainData?: Record<string, Record<string, string>>;
  }>>([]); 
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<{
    id: string; image: string; width: string; height: string;
    timestamp: number; treePath?: string; treeNodeId?: string;
    domainIds?: string[];
    domainData?: Record<string, Record<string, string>>;
  } | null>(null);
  const [editFormData, setEditFormData] = useState<Record<string, Record<string, string>>>({});
  const [isEditTreeOpen, setIsEditTreeOpen] = useState<boolean>(false);

  // 저장 세트 필드 편집 팝업
  const [scanEditPopup, setScanEditPopup] = useState<{
    anchorId: string;
    domainId: string;
    editedFields: Record<string, string>;
  } | null>(null);

  // 노드 선택 시 신규/추가/수정 구분
  type NodeEntityMode = 'new' | 'add' | 'edit';
  const [nodeEntityMode, setNodeEntityMode] = useState<NodeEntityMode>('new');
  const [editTargetAnchorId, setEditTargetAnchorId] = useState<string | null>(null);
  const [showEntitySelectPopup, setShowEntitySelectPopup] = useState(false);
  const [nodeExistingEntities, setNodeExistingEntities] = useState<Array<{
    anchorId: string;
    domainId: string;
    domainName: string;
    data: Record<string, string>;
    label: string;
  }>>([]);

  // 도메인별 저장 완료 알림 텍스트
  const [domainSavedNotice, setDomainSavedNotice] = useState<Record<string, string>>({});

  // 상세 팝업
  const [detailPopup, setDetailPopup] = useState<string | null>(null);
  const [imageZoom, setImageZoom] = useState(1);
  const [imagePan, setImagePan] = useState({x: 0, y: 0});

  // 촬영 완료 화면 이미지 확대/축소 및 상하좌우 이동 (Zoom & Pan)
  const [captureZoom, setCaptureZoom] = useState(1);
  const [capturePan, setCapturePan] = useState({ x: 0, y: 0 });
  const [isCapturePanning, setIsCapturePanning] = useState(false);
  const capturePanStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  // 휠 확대/축소 — 이미지 현재 위치 중심 기준 (pan 변경 없이 zoom만)
  // transformOrigin=center center이므로 viewport div 중앙이 scale 기준점.
  // 이미지는 flex center로 div 중앙에 배치되므로,
  // zoom만 변경하면 이미지 현재 위치를 중심으로 사방 확대/축소됨.
  const handleCaptureWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    setCaptureZoom(prev => Math.max(0.1, Math.min(8, prev * factor)));
  }, []);

  // 마우스/터치 드래그 시작 (포인터 캡처)
  const handleCapturePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return; // 좌클릭만
    e.preventDefault();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch (_) {}
    setIsCapturePanning(true);
    capturePanStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: capturePan.x,
      panY: capturePan.y,
    };
  }, [capturePan]);

  // 마우스/터치 드래그 이동
  const handleCapturePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isCapturePanning) return;
    e.preventDefault();
    const dx = e.clientX - capturePanStartRef.current.x;
    const dy = e.clientY - capturePanStartRef.current.y;
    setCapturePan({
      x: capturePanStartRef.current.panX + dx,
      y: capturePanStartRef.current.panY + dy,
    });
  }, [isCapturePanning]);

  // 마우스/터치 드래그 종료
  const handleCapturePointerUp = useCallback((e: React.PointerEvent) => {
    if (isCapturePanning) {
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch (_) {}
      setIsCapturePanning(false);
    }
  }, [isCapturePanning]);

  // 줌 & 팬 초기화
  const handleCaptureReset = useCallback(() => {
    setCaptureZoom(1);
    setCapturePan({ x: 0, y: 0 });
  }, []);

  // 날짜 포맷
  const formatDate = (ts: number) => {
    const d = new Date(ts);
    return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
  };

  // 날짜별 그룹핑
  const dateGroups = savedItems.reduce<Record<string, typeof savedItems>>((acc, item) => {
    const date = formatDate(item.timestamp);
    if (!acc[date]) acc[date] = [];
    acc[date].push(item);
    return acc;
  }, {});
  const sortedDates = Object.keys(dateGroups).sort((a, b) => b.localeCompare(a));

  // OpenCV & 감지
  const { ready: cvReady, loading: cvLoading } = useOpenCV();
  const [pixelPerMm, setPixelPerMm] = useState<{ x: number; y: number } | number | null>(null);
  const [, setDetectedRects] = useState<DetectedRect[]>([]);
  const [calibrated, setCalibrated] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [openSettingSection, setOpenSettingSection] = useState<string>('toolbar');
  const toggleSettingSection = (key: string) =>
    setOpenSettingSection(prev => prev === key ? '' : key);

  // 배경 설정 (이미지 or 컬러)
  const [bgImage, setBgImage] = useState<string>(() => localStorage.getItem('as_bgImage') || '');
  const [bgColor, setBgColor] = useState<string>(() => localStorage.getItem('as_bgColor') || '#0a0a0f');
  const DEFAULT_BG_COLORS = ['#0a0a0f', '#1a1a2e', '#0d1b2a', '#1b1b1b', '#2d1b69', '#0f2027', '#ffffff', '#f0f4ff'];
  const MAX_BG_COLORS = 8;
  const [bgColorList, setBgColorList] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('as_bgColorList') || 'null');
      return Array.isArray(saved) && saved.length > 0 ? saved : [...DEFAULT_BG_COLORS];
    } catch { return [...DEFAULT_BG_COLORS]; }
  });
  const addBgColor = (color: string) => {
    setBgColorList(prev => {
      if (prev.includes(color)) return prev;
      const next = [...prev, color];
      const trimmed = next.length > MAX_BG_COLORS ? next.slice(next.length - MAX_BG_COLORS) : next;
      localStorage.setItem('as_bgColorList', JSON.stringify(trimmed));
      return trimmed;
    });
  };
  const [bgMode, setBgMode] = useState<'image' | 'color'>(() =>
    (localStorage.getItem('as_bgMode') as 'image' | 'color') || 'image'
  );
  const bgFileInputRef = React.useRef<HTMLInputElement>(null);
  // 우측 패널 투명도 (0.1 ~ 1.0, localStorage 저장)
  const [rightPanelOpacity, setRightPanelOpacity] = useState<number>(() => {
    const v = localStorage.getItem('as_rightPanelOpacity');
    return v !== null ? parseFloat(v) : 1;
  });
  const [panelPosition, setPanelPosition] = useState<'left' | 'right'>(() => {
    return (localStorage.getItem('as_panelPosition') as 'left' | 'right') || 'right';
  });
  const togglePanelPosition = useCallback(() => {
    setPanelPosition(prev => {
      const next = prev === 'right' ? 'left' : 'right';
      try { localStorage.setItem('as_panelPosition', next); } catch {}
      return next;
    });
  }, []);
  const [showRuler] = useState(() => {
    const v = localStorage.getItem('as_showRuler');
    return v !== null ? v === 'true' : true;
  });
  const [screenWidthMm] = useState(() => localStorage.getItem('as_screenWidthMm') || '');
  const [detectionEnabled, setDetectionEnabled] = useState(() => {
    const v = localStorage.getItem('as_detection');
    return v !== null ? v === 'true' : true;
  });
  const [gridOpacity] = useState(() => {
    const v = localStorage.getItem('as_gridOpacity');
    return v !== null ? Number(v) : 100;
  });
  const [gridInterval] = useState(() => {
    const v = localStorage.getItem('as_gridInterval');
    return v !== null ? Number(v) : 5;
  });

  // ── 툴바 항목별 노출 여부 ──
  const [showBtnDetect, setShowBtnDetect] = useState(() => localStorage.getItem('as_showBtnDetect') !== 'false');
  const [showBtnAuto, setShowBtnAuto] = useState(() => localStorage.getItem('as_showBtnAuto') !== 'false');
  const [showBtnSize, setShowBtnSize] = useState(() => localStorage.getItem('as_showBtnSize') !== 'false');
  const [showBtnCalib, setShowBtnCalib] = useState(() => localStorage.getItem('as_showBtnCalib') !== 'false');
  const [showBtnMargin, setShowBtnMargin] = useState(() => localStorage.getItem('as_showBtnMargin') !== 'false');
  const [showBtnChroma, setShowBtnChroma] = useState(() => localStorage.getItem('as_showBtnChroma') !== 'false');

  // ── 감지 비율 조정 (카메라 프레임 면적 대비 %) ──
  const [detectMinRatio, setDetectMinRatio] = useState(() => {
    const v = localStorage.getItem('as_detectMinRatio');
    return v !== null ? Number(v) : 3;   // 기본 3% (최소 물체 크기)
  });
  const [detectMaxRatio, setDetectMaxRatio] = useState(() => {
    const v = localStorage.getItem('as_detectMaxRatio');
    return v !== null ? Number(v) : 95;  // 기본 95% (최대 물체 크기)
  });
  const detectMinRatioRef = useRef(3);
  const detectMaxRatioRef = useRef(95);

  // 촬영 영역 마진 (px)
  const [captureMarginPx, setCaptureMarginPx] = useState(() => {
    const v = localStorage.getItem('as_captureMarginPx');
    return v !== null ? Number(v) : 10;
  });
  const captureMarginPxRef = useRef(10);

  // 사이즈 태그 표시 토글
  const [showSizeTag, setShowSizeTag] = useState(() => {
    const v = localStorage.getItem('as_showSizeTag');
    return v !== null ? v === 'true' : true;
  });
  const showSizeTagRef = useRef(true);

  // 크로마키 (배경 제거) 토글 + 색상 선택
  const [chromaKey, setChromaKey] = useState(() => {
    const v = localStorage.getItem('as_chromaKey');
    return v === 'true';
  });
  type ChromaColor = 'blue' | 'green' | 'black' | 'white' | 'red' | 'custom';
  const [chromaKeyColor, setChromaKeyColor] = useState<ChromaColor>(() => {
    const v = localStorage.getItem('as_chromaKeyColor');
    return (v as ChromaColor) || 'blue';
  });
  // 스포이드로 선택한 커스텀 색상 (hex)
  const [chromaCustomCss, setChromaCustomCss] = useState<string>(() => {
    return localStorage.getItem('as_chromaCustomCss') || '#888888';
  });
  // 커스텀 HSV 범위 (스포이드 선택 시 계산)
  const [chromaCustomRange, setChromaCustomRange] = useState<{ low: number[]; high: number[] }>(() => {
    try {
      const v = localStorage.getItem('as_chromaCustomRange');
      return v ? JSON.parse(v) : { low: [0, 40, 40, 0], high: [20, 255, 255, 255] };
    } catch { return { low: [0, 40, 40, 0], high: [20, 255, 255, 255] }; }
  });
  // 스포이드 모드 상태
  const [eyedropMode, setEyedropMode] = useState(false);

  // RGB → HSV 변환 (0~360, 0~100, 0~100) → OpenCV HSV (0~180, 0~255, 0~255)
  const rgbToOpenCvHsv = (r: number, g: number, b: number): [number, number, number] => {
    const rf = r / 255, gf = g / 255, bf = b / 255;
    const max = Math.max(rf, gf, bf), min = Math.min(rf, gf, bf);
    const d = max - min;
    let h = 0;
    if (d > 0) {
      if (max === rf) h = ((gf - bf) / d + 6) % 6;
      else if (max === gf) h = (bf - rf) / d + 2;
      else h = (rf - gf) / d + 4;
      h = h * 60;
    }
    const s = max === 0 ? 0 : d / max;
    const v = max;
    return [Math.round(h / 2), Math.round(s * 255), Math.round(v * 255)];
  };

  // RGB → hex 문자열
  const rgbToHex = (r: number, g: number, b: number) =>
    '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');

  // 스포이드 색상 선택 처리
  const handleEyedropPick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!eyedropMode) return;
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const scaleX = video.videoWidth / rect.width;
    const scaleY = video.videoHeight / rect.height;
    const px = Math.round((e.clientX - rect.left) * scaleX);
    const py = Math.round((e.clientY - rect.top) * scaleY);
    // 임시 캔버스에서 픽셀 추출
    const tmpCanvas = document.createElement('canvas');
    tmpCanvas.width = video.videoWidth;
    tmpCanvas.height = video.videoHeight;
    const ctx = tmpCanvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const pixel = ctx.getImageData(px, py, 1, 1).data;
    const [r, g, b] = [pixel[0], pixel[1], pixel[2]];
    const [h, s, v] = rgbToOpenCvHsv(r, g, b);
    // HSV 허용 범위: H±15, S-50~max, V-50~max
    const hTol = 15, sTol = 60, vTol = 60;
    const low = [Math.max(0, h - hTol), Math.max(0, s - sTol), Math.max(0, v - vTol), 0];
    const high = [Math.min(180, h + hTol), 255, 255, 255];
    const css = rgbToHex(r, g, b);
    setChromaCustomCss(css);
    setChromaCustomRange({ low, high });
    setChromaKeyColor('custom');
    setEyedropMode(false);
    localStorage.setItem('as_chromaCustomCss', css);
    localStorage.setItem('as_chromaCustomRange', JSON.stringify({ low, high }));
  };

  // 크로마키 색상별 HSV 범위 정의
  const chromaHsvRanges: Record<ChromaColor, { low: number[]; high: number[]; label: string; css: string }> = {
    blue:   { low: [90, 40, 40, 0],   high: [130, 255, 255, 255], label: '파랑', css: '#3b82f6' },
    green:  { low: [35, 40, 40, 0],   high: [85, 255, 255, 255],  label: '초록', css: '#22c55e' },
    black:  { low: [0, 0, 0, 0],      high: [180, 255, 50, 255],  label: '검정', css: '#1e1e1e' },
    white:  { low: [0, 0, 200, 0],    high: [180, 30, 255, 255],  label: '흰색', css: '#e8e8e8' },
    red:    { low: [0, 40, 40, 0],    high: [10, 255, 255, 255],  label: '빨강', css: '#ef4444' },
    custom: { low: chromaCustomRange.low, high: chromaCustomRange.high, label: '스포이드', css: chromaCustomCss },
  };

  // ===== 수동 스캔 영역 =====
  // scanMode: 항상 'auto'로 시작 (viewfinder 진입 시 자동 감지)
  const [scanMode, setScanMode] = useState<ScanMode>('auto');
  // 수동 꼭짓점 (비디오 좌표 비율 0~1)
  const [manualCorners, setManualCorners] = useState<Point[]>([
    { x: 0.15, y: 0.1 },
    { x: 0.85, y: 0.1 },
    { x: 0.85, y: 0.9 },
    { x: 0.15, y: 0.9 },
  ]);
  const [draggingCorner, setDraggingCorner] = useState<number | null>(null);
  const manualCornersRef = useRef<Point[]>([
    { x: 0.15, y: 0.1 },
    { x: 0.85, y: 0.1 },
    { x: 0.85, y: 0.9 },
    { x: 0.15, y: 0.9 },
  ]);
  const scanModeRef = useRef<ScanMode>('auto');
  const viewfinderRef = useRef<HTMLDivElement>(null);

  // 설정 변경시 localStorage 저장
  useEffect(() => { localStorage.setItem('as_screenWidthMm', screenWidthMm); }, [screenWidthMm]);
  useEffect(() => { localStorage.setItem('as_detection', String(detectionEnabled)); }, [detectionEnabled]);
  useEffect(() => { localStorage.setItem('as_captureMarginPx', String(captureMarginPx)); }, [captureMarginPx]);
  useEffect(() => { captureMarginPxRef.current = captureMarginPx; }, [captureMarginPx]);
  useEffect(() => { localStorage.setItem('as_cameraId', selectedCameraId); }, [selectedCameraId]);
  // scanMode는 세션별로 auto 시작 (localStorage 저장 안 함)
  useEffect(() => { manualCornersRef.current = manualCorners; }, [manualCorners]);
  useEffect(() => { scanModeRef.current = scanMode; }, [scanMode]);
  useEffect(() => { localStorage.setItem('as_showSizeTag', String(showSizeTag)); }, [showSizeTag]);
  useEffect(() => { showSizeTagRef.current = showSizeTag; }, [showSizeTag]);
  useEffect(() => { localStorage.setItem('as_chromaKey', String(chromaKey)); }, [chromaKey]);
  useEffect(() => { localStorage.setItem('as_chromaKeyColor', chromaKeyColor); }, [chromaKeyColor]);
  // 툴바 노출 여부 저장
  useEffect(() => { localStorage.setItem('as_showBtnDetect', String(showBtnDetect)); }, [showBtnDetect]);
  useEffect(() => { localStorage.setItem('as_showBtnAuto', String(showBtnAuto)); }, [showBtnAuto]);
  useEffect(() => { localStorage.setItem('as_showBtnSize', String(showBtnSize)); }, [showBtnSize]);
  useEffect(() => { localStorage.setItem('as_showBtnCalib', String(showBtnCalib)); }, [showBtnCalib]);
  useEffect(() => { localStorage.setItem('as_showBtnMargin', String(showBtnMargin)); }, [showBtnMargin]);
  useEffect(() => { localStorage.setItem('as_showBtnChroma', String(showBtnChroma)); }, [showBtnChroma]);
  // 감지 비율 저장 + ref 동기화
  useEffect(() => { localStorage.setItem('as_detectMinRatio', String(detectMinRatio)); detectMinRatioRef.current = detectMinRatio; }, [detectMinRatio]);
  useEffect(() => { localStorage.setItem('as_detectMaxRatio', String(detectMaxRatio)); detectMaxRatioRef.current = detectMaxRatio; }, [detectMaxRatio]);

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pixelPerMmRef = useRef<{ x: number; y: number } | number | null>(null);
  const showRulerRef = useRef(false);
  const detectionEnabledRef = useRef(true);
  const gridOpacityRef = useRef(100);
  const gridIntervalRef = useRef(5);
  const rafRef = useRef<number>(0);
  const bambooShowTimeRef = useRef<number>(Date.now());
  const detectedCornersRef = useRef<{x: number; y: number}[] | null>(null);
  // 감지 안정화: 이전 감지 결과 스냅샷 (떨림 방지용)
  const stableDetectedRef = useRef<DetectedRect | null>(null);
  const stableCountRef = useRef(0); // 연속 안정 프레임 수
  const missCountRef = useRef(0);   // 연속 미감지 프레임 수 (히스테리시스용)

  // ref 동기화
  useEffect(() => { pixelPerMmRef.current = pixelPerMm; }, [pixelPerMm]);
  useEffect(() => { showRulerRef.current = showRuler; }, [showRuler]);
  useEffect(() => { detectionEnabledRef.current = detectionEnabled; }, [detectionEnabled]);
  useEffect(() => { gridOpacityRef.current = gridOpacity; }, [gridOpacity]);
  useEffect(() => { gridIntervalRef.current = gridInterval; }, [gridInterval]);
  useEffect(() => {
    if (!cameraReady) bambooShowTimeRef.current = Date.now();
  }, [cameraReady]);

  // ===== 눈금자 그리기 (한지 스타일, 먹선, cm 단위) =====
  const drawRulers = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const ppm = pixelPerMmRef.current;
    const ppmVal = typeof ppm === 'object' && ppm !== null ? (ppm.x + ppm.y) / 2 : ppm;
    const ppcm = ppmVal ? ppmVal * 10 : null;
    const RS = 24;

    // 먹선 그리기 헬퍼 (불규칙하게 흔들리며 그림)
    const inkLine = (x1: number, y1: number, x2: number, y2: number, baseWidth: number, alpha: number) => {
      const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1), 3);
      ctx.beginPath();
      ctx.moveTo(x1 + (Math.random() - 0.5) * 0.8, y1 + (Math.random() - 0.5) * 0.8);
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const jx = (Math.random() - 0.5) * 1.2;
        const jy = (Math.random() - 0.5) * 1.2;
        ctx.lineTo(x1 + (x2 - x1) * t + jx, y1 + (y2 - y1) * t + jy);
      }
      ctx.strokeStyle = `rgba(40, 20, 5, ${alpha})`;
      ctx.lineWidth = baseWidth + (Math.random() - 0.5) * 0.6;
      ctx.stroke();
    };

    // 한지 배경 - 상하좌우
    const hanjiTop = ctx.createLinearGradient(0, 0, 0, RS);
    hanjiTop.addColorStop(0, 'rgba(215, 195, 165, 0.92)');
    hanjiTop.addColorStop(0.5, 'rgba(225, 208, 178, 0.88)');
    hanjiTop.addColorStop(1, 'rgba(200, 180, 150, 0.85)');
    ctx.fillStyle = hanjiTop;
    ctx.fillRect(0, 0, w, RS);

    const hanjiBottom = ctx.createLinearGradient(0, h, 0, h - RS);
    hanjiBottom.addColorStop(0, 'rgba(215, 195, 165, 0.92)');
    hanjiBottom.addColorStop(0.5, 'rgba(225, 208, 178, 0.88)');
    hanjiBottom.addColorStop(1, 'rgba(200, 180, 150, 0.85)');
    ctx.fillStyle = hanjiBottom;
    ctx.fillRect(0, h - RS, w, RS);

    const hanjiLeft = ctx.createLinearGradient(0, 0, RS, 0);
    hanjiLeft.addColorStop(0, 'rgba(215, 195, 165, 0.92)');
    hanjiLeft.addColorStop(0.5, 'rgba(225, 208, 178, 0.88)');
    hanjiLeft.addColorStop(1, 'rgba(200, 180, 150, 0.85)');
    ctx.fillStyle = hanjiLeft;
    ctx.fillRect(0, RS, RS, h - RS * 2);

    const hanjiRight = ctx.createLinearGradient(w, 0, w - RS, 0);
    hanjiRight.addColorStop(0, 'rgba(215, 195, 165, 0.92)');
    hanjiRight.addColorStop(0.5, 'rgba(225, 208, 178, 0.88)');
    hanjiRight.addColorStop(1, 'rgba(200, 180, 150, 0.85)');
    ctx.fillStyle = hanjiRight;
    ctx.fillRect(w - RS, RS, RS, h - RS * 2);

    // 한지 질감 노이즈 (상하좌우)
    for (let i = 0; i < 150; i++) {
      const rx = Math.random() * w, ry = Math.random() * RS;
      ctx.fillStyle = `rgba(170, 150, 120, ${Math.random() * 0.18})`;
      ctx.fillRect(rx, ry, 1 + Math.random() * 3, 1);
    }
    for (let i = 0; i < 150; i++) {
      const rx = Math.random() * w, ry = h - RS + Math.random() * RS;
      ctx.fillStyle = `rgba(170, 150, 120, ${Math.random() * 0.18})`;
      ctx.fillRect(rx, ry, 1 + Math.random() * 3, 1);
    }
    for (let i = 0; i < 100; i++) {
      const rx = Math.random() * RS, ry = RS + Math.random() * (h - RS * 2);
      ctx.fillStyle = `rgba(170, 150, 120, ${Math.random() * 0.18})`;
      ctx.fillRect(rx, ry, 1, 1 + Math.random() * 3);
    }
    for (let i = 0; i < 100; i++) {
      const rx = w - RS + Math.random() * RS, ry = RS + Math.random() * (h - RS * 2);
      ctx.fillStyle = `rgba(170, 150, 120, ${Math.random() * 0.18})`;
      ctx.fillRect(rx, ry, 1, 1 + Math.random() * 3);
    }

    // 경계 먹선 (4면)
    inkLine(0, RS, w, RS, 1.2, 0.6);
    inkLine(0, h - RS, w, h - RS, 1.2, 0.6);
    inkLine(RS, 0, RS, h, 1.2, 0.6);
    inkLine(w - RS, 0, w - RS, h, 1.2, 0.6);

    // 코너 단위 (좌상)
    ctx.fillStyle = 'rgba(190, 170, 140, 0.95)';
    ctx.fillRect(0, 0, RS, RS);
    ctx.fillStyle = '#4a2510';
    ctx.font = `bold 9px 'Noto Serif KR', serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ppcm ? 'cm' : 'px', RS / 2, RS / 2);

    // 코너 (우상, 좌하, 우하)
    ctx.fillStyle = 'rgba(190, 170, 140, 0.95)';
    ctx.fillRect(w - RS, 0, RS, RS);
    ctx.fillRect(0, h - RS, RS, RS);
    ctx.fillRect(w - RS, h - RS, RS, RS);

    let majorStep: number, minorStep: number, subStep: number;
    let totalW: number, totalH: number;

    if (ppcm) {
      totalW = (w - RS * 2) / ppcm;
      totalH = (h - RS * 2) / ppcm;
      if (totalW > 80) { majorStep = 10; minorStep = 5; subStep = 1; }
      else if (totalW > 30) { majorStep = 5; minorStep = 1; subStep = 0.5; }
      else { majorStep = 1; minorStep = 0.5; subStep = 0.1; }
    } else {
      totalW = w - RS * 2; totalH = h - RS * 2;
      majorStep = totalW > 2000 ? 500 : 200;
      minorStep = totalW > 2000 ? 100 : 50;
      subStep = minorStep;
    }

    const scale = ppcm || 1;
    const fs = 8;
    ctx.font = `${fs}px 'Noto Serif KR', serif`;

    // 가로 눈금 (상단)
    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';
    for (let v = 0; v <= totalW + subStep; v += subStep) {
      const vr = Math.round(v * 100) / 100;
      const x = RS + vr * scale;
      if (x > w - RS) break;
      const isMajor = Math.abs(vr % majorStep) < 0.01 || Math.abs(vr % majorStep - majorStep) < 0.01;
      const isMinor = Math.abs(vr % minorStep) < 0.01 || Math.abs(vr % minorStep - minorStep) < 0.01;
      let tickH: number;
      if (isMajor) { tickH = RS * 0.7; inkLine(x, RS, x, RS - tickH, 1.3, 0.85); }
      else if (isMinor) { tickH = RS * 0.38; inkLine(x, RS, x, RS - tickH, 0.8, 0.5); }
      else { tickH = RS * 0.18; inkLine(x, RS, x, RS - tickH, 0.5, 0.25); }
      if (isMajor && vr > 0) {
        ctx.fillStyle = '#3c1a08';
        ctx.fillText(Number.isInteger(vr) ? `${vr}` : vr.toFixed(1), x, 2);
      }
    }

    // 가로 눈금 (하단)
    ctx.textBaseline = 'bottom';
    for (let v = 0; v <= totalW + subStep; v += subStep) {
      const vr = Math.round(v * 100) / 100;
      const x = RS + vr * scale;
      if (x > w - RS) break;
      const isMajor = Math.abs(vr % majorStep) < 0.01 || Math.abs(vr % majorStep - majorStep) < 0.01;
      const isMinor = Math.abs(vr % minorStep) < 0.01 || Math.abs(vr % minorStep - minorStep) < 0.01;
      let tickH: number;
      if (isMajor) { tickH = RS * 0.7; inkLine(x, h - RS, x, h - RS + tickH, 1.3, 0.85); }
      else if (isMinor) { tickH = RS * 0.38; inkLine(x, h - RS, x, h - RS + tickH, 0.8, 0.5); }
      else { tickH = RS * 0.18; inkLine(x, h - RS, x, h - RS + tickH, 0.5, 0.25); }
      if (isMajor && vr > 0) {
        ctx.fillStyle = '#3c1a08';
        ctx.fillText(Number.isInteger(vr) ? `${vr}` : vr.toFixed(1), x, h - 2);
      }
    }

    // 세로 눈금 (좌측)
    for (let v = 0; v <= totalH + subStep; v += subStep) {
      const vr = Math.round(v * 100) / 100;
      const y = RS + vr * scale;
      if (y > h - RS) break;
      const isMajor = Math.abs(vr % majorStep) < 0.01 || Math.abs(vr % majorStep - majorStep) < 0.01;
      const isMinor = Math.abs(vr % minorStep) < 0.01 || Math.abs(vr % minorStep - minorStep) < 0.01;
      let tickW: number;
      if (isMajor) { tickW = RS * 0.7; inkLine(RS, y, RS - tickW, y, 1.3, 0.85); }
      else if (isMinor) { tickW = RS * 0.38; inkLine(RS, y, RS - tickW, y, 0.8, 0.5); }
      else { tickW = RS * 0.18; inkLine(RS, y, RS - tickW, y, 0.5, 0.25); }
      if (isMajor && vr > 0) {
        ctx.fillStyle = '#3c1a08';
        ctx.save();
        ctx.translate(RS - tickW - 2, y);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText(Number.isInteger(vr) ? `${vr}` : vr.toFixed(1), 0, 0);
        ctx.restore();
      }
    }

    // 세로 눈금 (우측)
    for (let v = 0; v <= totalH + subStep; v += subStep) {
      const vr = Math.round(v * 100) / 100;
      const y = RS + vr * scale;
      if (y > h - RS) break;
      const isMajor = Math.abs(vr % majorStep) < 0.01 || Math.abs(vr % majorStep - majorStep) < 0.01;
      const isMinor = Math.abs(vr % minorStep) < 0.01 || Math.abs(vr % minorStep - minorStep) < 0.01;
      let tickW: number;
      if (isMajor) { tickW = RS * 0.7; inkLine(w - RS, y, w - RS + tickW, y, 1.3, 0.85); }
      else if (isMinor) { tickW = RS * 0.38; inkLine(w - RS, y, w - RS + tickW, y, 0.8, 0.5); }
      else { tickW = RS * 0.18; inkLine(w - RS, y, w - RS + tickW, y, 0.5, 0.25); }
      if (isMajor && vr > 0) {
        ctx.fillStyle = '#3c1a08';
        ctx.save();
        ctx.translate(w - RS + tickW + 2, y);
        ctx.rotate(Math.PI / 2);
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText(Number.isInteger(vr) ? `${vr}` : vr.toFixed(1), 0, 0);
        ctx.restore();
      }
    }

    // 격자 라인 (먹색, 투명도+간격 조절, 나무판에서 1초 후 페이드아웃)
    if (ppcm) {
      let gAlpha = gridOpacityRef.current / 100;
      const gridCm = gridIntervalRef.current;

      // 카메라 없을 때 1초 후 2초 동안 서서히 사라짐
      const hasCamNow = !!(videoRef.current && videoRef.current.srcObject);
      if (!hasCamNow) {
        const elapsed = (Date.now() - bambooShowTimeRef.current) / 1000;
        if (elapsed > 1) {
          const fade = Math.max(0, 1 - (elapsed - 1) / 2);
          gAlpha *= fade;
        }
      }

      if (gAlpha > 0.001) {
        const gridPx = gridCm * ppcm;
        ctx.setLineDash([4, 6]);
        ctx.strokeStyle = `rgba(30, 15, 5, ${gAlpha * 0.7})`;
        ctx.lineWidth = 0.6;
        for (let x = RS + gridPx; x < w - RS; x += gridPx) {
          ctx.beginPath(); ctx.moveTo(x, RS); ctx.lineTo(x, h - RS); ctx.stroke();
        }
        for (let y = RS + gridPx; y < h - RS; y += gridPx) {
          ctx.beginPath(); ctx.moveTo(RS, y); ctx.lineTo(w - RS, y); ctx.stroke();
        }
        ctx.setLineDash([]);
      }
    }
  }, []);

  // ===== 우측 하단 구겨진 포스트잇 스타일 사이즈 태그 그리기 헬퍼 =====
  const drawPostitSizeTag = useCallback((
    oCtx: CanvasRenderingContext2D,
    label: string,
    box: { minX: number; minY: number; maxX: number; maxY: number },
    calibrated: boolean,
    scale: number = 1
  ) => {
    // 폰트 설정 (손글씨 느낌)
    const baseFontSize = 23 * scale;
    oCtx.font = `bold ${Math.round(baseFontSize)}px 'Nanum Pen Script', 'Caveat', 'Gaegu', 'Segoe Print', cursive, sans-serif`;
    const tm = oCtx.measureText(label);

    // 포스트잇 크기 (가로로 길쭉한 비율)
    const postW = Math.max(tm.width + 36 * scale, 175 * scale);
    const postH = Math.max(baseFontSize * 1.8, 50 * scale);

    // 위치: 감지 영역 내부 우측 하단 모서리
    const pad = 12 * scale;
    let posX = box.maxX - postW - pad;
    let posY = box.maxY - postH - pad;
    if (posX < box.minX + 5) posX = Math.max(5, box.minX + 5);
    if (posY < box.minY + 5) posY = Math.max(5, box.minY + 5);

    oCtx.save();

    // 포스트잇 중심 기준으로 살짝 비스듬히 회전 (자연스러운 손맛 -1.3도)
    const originX = posX + postW / 2;
    const originY = posY + postH / 2;
    oCtx.translate(originX, originY);
    oCtx.rotate((-1.3 * Math.PI) / 180);

    const x = -postW / 2;
    const y = -postH / 2;

    // 1. 하단 들뜸 그림자 (우측 하단이 살짝 들려 있는 입체 그림자)
    oCtx.save();
    oCtx.shadowColor = 'rgba(0, 0, 0, 0.28)';
    oCtx.shadowBlur = 8 * scale;
    oCtx.shadowOffsetX = 3 * scale;
    oCtx.shadowOffsetY = 4 * scale;

    // 포스트잇 기본 외형 (모서리가 살짝 둥글고 자연스러운 사각형)
    const bgGrad = oCtx.createLinearGradient(x, y, x + postW, y + postH);
    if (calibrated) {
      bgGrad.addColorStop(0, '#fef9c3');    // 부드러운 밝은 노랑
      bgGrad.addColorStop(0.4, '#fef08a');  // 기본 포스트잇 옐로우
      bgGrad.addColorStop(1, '#fde047');    // 약간 진한 옐로우
    } else {
      bgGrad.addColorStop(0, '#f8fafc');
      bgGrad.addColorStop(1, '#e2e8f0');
    }

    oCtx.fillStyle = bgGrad;
    oCtx.beginPath();
    oCtx.roundRect(x, y, postW, postH, 2 * scale);
    oCtx.fill();
    oCtx.restore();

    // 2. 상단 점착 테이프 띠 (반투명 접착 부위)
    oCtx.fillStyle = calibrated ? 'rgba(234, 179, 8, 0.15)' : 'rgba(148, 163, 184, 0.15)';
    oCtx.fillRect(x, y, postW, 7 * scale);

    // 3. 구겨짐 / 접힘선 디테일 (Paper Creases / Wrinkles)
    oCtx.save();
    // (a) 우측 하단에서 대각선으로 올라가는 접힘 음영
    const crease1 = oCtx.createLinearGradient(x + postW - 55 * scale, y + postH, x + postW - 15 * scale, y + 10 * scale);
    crease1.addColorStop(0, 'rgba(0, 0, 0, 0.08)');
    crease1.addColorStop(0.5, 'rgba(0, 0, 0, 0.02)');
    crease1.addColorStop(1, 'rgba(255, 255, 255, 0.2)');
    oCtx.strokeStyle = crease1;
    oCtx.lineWidth = 1.2 * scale;
    oCtx.beginPath();
    oCtx.moveTo(x + postW - 60 * scale, y + postH - 2 * scale);
    oCtx.quadraticCurveTo(x + postW - 35 * scale, y + postH / 2, x + postW - 20 * scale, y + 6 * scale);
    oCtx.stroke();

    // 바로 옆 하이라이트 빛반사 선 (주름의 튀어나온 능선)
    oCtx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    oCtx.lineWidth = 1 * scale;
    oCtx.beginPath();
    oCtx.moveTo(x + postW - 59 * scale, y + postH - 3 * scale);
    oCtx.quadraticCurveTo(x + postW - 34 * scale, y + postH / 2, x + postW - 19 * scale, y + 5 * scale);
    oCtx.stroke();

    // (b) 좌측 하단 살짝 구겨진 꺾임선
    oCtx.strokeStyle = 'rgba(0, 0, 0, 0.05)';
    oCtx.lineWidth = 1 * scale;
    oCtx.beginPath();
    oCtx.moveTo(x + 20 * scale, y + postH - 1 * scale);
    oCtx.lineTo(x + 45 * scale, y + postH - 14 * scale);
    oCtx.stroke();
    oCtx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    oCtx.beginPath();
    oCtx.moveTo(x + 21 * scale, y + postH - 2 * scale);
    oCtx.lineTo(x + 46 * scale, y + postH - 15 * scale);
    oCtx.stroke();

    // 4. 우측 하단 모서리 살짝 말림/접힘 효과 (Dog-ear / Curl effect)
    const curlSize = 13 * scale;
    const cx = x + postW;
    const cy = y + postH;

    // 말린 모서리 아래 어두운 그림자
    oCtx.fillStyle = 'rgba(0, 0, 0, 0.16)';
    oCtx.beginPath();
    oCtx.moveTo(cx - curlSize - 2 * scale, cy);
    oCtx.lineTo(cx, cy - curlSize - 2 * scale);
    oCtx.lineTo(cx - 3 * scale, cy - 3 * scale);
    oCtx.closePath();
    oCtx.fill();

    // 접혀 올라간 뒷면/밝은 모서리 삼각형
    const curlGrad = oCtx.createLinearGradient(cx - curlSize, cy - curlSize, cx, cy);
    curlGrad.addColorStop(0, '#fef08a');
    curlGrad.addColorStop(1, '#ffffff');
    oCtx.fillStyle = curlGrad;
    oCtx.beginPath();
    oCtx.moveTo(cx - curlSize, cy);
    oCtx.lineTo(cx, cy - curlSize);
    oCtx.lineTo(cx - curlSize + 3 * scale, cy - curlSize + 3 * scale);
    oCtx.closePath();
    oCtx.fill();

    // 접힌 경계선
    oCtx.strokeStyle = 'rgba(161, 98, 7, 0.25)';
    oCtx.lineWidth = 0.8 * scale;
    oCtx.beginPath();
    oCtx.moveTo(cx - curlSize, cy);
    oCtx.lineTo(cx, cy - curlSize);
    oCtx.stroke();

    oCtx.restore();

    // 5. 손글씨 스타일 텍스트 렌더링
    oCtx.font = `bold ${Math.round(baseFontSize)}px 'Nanum Pen Script', 'Caveat', 'Gaegu', 'Segoe Print', cursive, sans-serif`;
    oCtx.fillStyle = calibrated ? '#1e293b' : '#64748b'; // 실제 사인펜/볼펜 잉크 느낌
    oCtx.textAlign = 'center';
    oCtx.textBaseline = 'middle';
    oCtx.fillText(label, 0, 2 * scale);

    oCtx.restore();
  }, []);





  // 캘리브레이션 패널 열기: 감지된 픽셀 크기 스냅샷
  const handleOpenCalibPanel = () => {
    const corners = detectedCornersRef.current;
    if (corners && corners.length === 4) {
      const dist = (a: {x:number;y:number}, b: {x:number;y:number}) =>
        Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));
      // TL→TR→BR→BL 정렬된 corners 기준: 상변/하변 평균 = 가로, 좌변/우변 평균 = 세로
      const wPx = (dist(corners[0], corners[1]) + dist(corners[3], corners[2])) / 2;
      const hPx = (dist(corners[0], corners[3]) + dist(corners[1], corners[2])) / 2;
      setCalibDetectedPx({ w: Math.round(wPx), h: Math.round(hPx) });
    } else {
      setCalibDetectedPx(null);
    }
    setCalibInputW('');
    setCalibInputH('');
    setShowCalibPanel(true);
  };

  // 캘리브레이션 패널 적용
  const handleApplyCalib = () => {
    const wMm = parseFloat(calibInputW);
    const hMm = parseFloat(calibInputH);
    if (!calibDetectedPx) return;

    if (wMm > 0 && hMm > 0) {
      setPixelPerMm({
        x: calibDetectedPx.w / wMm,
        y: calibDetectedPx.h / hMm
      });
      setCalibrated(true);
    } else if (wMm > 0) {
      const ppm = calibDetectedPx.w / wMm;
      setPixelPerMm({ x: ppm, y: ppm });
      setCalibrated(true);
    } else if (hMm > 0) {
      const ppm = calibDetectedPx.h / hMm;
      setPixelPerMm({ x: ppm, y: ppm });
      setCalibrated(true);
    }
    setShowCalibPanel(false);
    setCalibInputW('');
    setCalibInputH('');
  };

  // 카메라 목록
  const loadCameras = useCallback(async () => {
    if (!navigator.mediaDevices) return;
    try {
      // 퍼미션 확보를 위해 임시 스트림 요청
      const tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
      tempStream.getTracks().forEach(t => t.stop());
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      setCameras(videoDevices);
      return videoDevices;
    } catch (e) {
      console.error('장치 목록 조회 실패:', e);
      return [];
    }
  }, []);

  // 카메라 자동 감지 및 선택
  useEffect(() => {
    let mounted = true;
    const autoDetect = async () => {
      const videoDevices = await loadCameras();
      if (!mounted || !videoDevices || videoDevices.length === 0) return;

      const savedId = localStorage.getItem('as_cameraId');
      // 사용자가 '선택안됨(none)'을 선택한 경우 카메라 자동 선택 안 함
      if (savedId === 'none' || selectedCameraId === 'none') {
        stopCamera();
        return;
      }
      // 저장된 카메라가 목록에 있으면 그것 사용
      if (savedId && videoDevices.some(d => d.deviceId === savedId)) {
        if (selectedCameraId !== savedId) setSelectedCameraId(savedId);
        return;
      }
      // 저장된 설정이 전혀 없는 초기 접속 상태일 때만 첫 번째 카메라 자동 선택
      if (savedId === null && videoDevices.length > 0) {
        setSelectedCameraId(videoDevices[0].deviceId);
      }
    };
    autoDetect();

    // USB 카메라 연결/해제 시 자동 감지
    const handleDeviceChange = () => { autoDetect(); };
    navigator.mediaDevices?.addEventListener('devicechange', handleDeviceChange);
    return () => {
      mounted = false;
      navigator.mediaDevices?.removeEventListener('devicechange', handleDeviceChange);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraReady(false);
  }, []);

  // 카메라 초기화
  const startCamera = useCallback(async () => {
    try {
      setCameraError('');
      // 사용자가 카메라를 선택하지 않은 상태('none')인 경우 카메라 작동 안 함
      if (selectedCameraId === 'none') {
        stopCamera();
        setCameraReady(false);
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('카메라 API를 사용할 수 없습니다. HTTPS 연결이 필요합니다.');
        setCameraReady(false);
        return;
      }

      // 카메라 장치 검색
      let targetId = selectedCameraId;
      if (!targetId) {
        const savedId = localStorage.getItem('as_cameraId');
        if (savedId === 'none') {
          stopCamera();
          setCameraReady(false);
          return;
        }
        const videoDevices = await loadCameras();
        if (videoDevices && videoDevices.length > 0) {
          targetId = videoDevices[0].deviceId;
          setSelectedCameraId(targetId);
        }
      }

      if (!targetId || targetId === 'none') {
        stopCamera();
        setCameraReady(false);
        return;
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }

      // exact 대신 ideal 사용 (디바이스 매칭 유연성 확보)
      const constraints: MediaStreamConstraints = {
        video: (targetId && targetId !== 'none')
          ? { deviceId: { ideal: targetId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
          : { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
      };

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (firstErr) {
        console.warn('기본 제약조건 실패, fallback 시도:', firstErr);
        // fallback: 가장 기본 비디오 요청
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => setCameraReady(true);
      }
      loadCameras();
    } catch (err: any) {
      console.error('카메라 접근 실패:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraError('카메라 권한이 필요합니다. 브라우저 주소창 메뉴를 닫고 새로고침(F5)을 해주세요.');
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        setCameraError('카메라가 다른 프로그램(Zoom, Teams 등)에서 사용 중입니다.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setCameraError('연결된 카메라 장치를 찾을 수 없습니다.');
      } else {
        setCameraError('카메라에 접근할 수 없습니다. (' + (err.name || '오류') + ')');
      }
      setCameraReady(false);
    }
  }, [selectedCameraId, loadCameras, stopCamera]);

  useEffect(() => {
    if (phase === 'viewfinder') startCamera();
    return () => stopCamera();
  }, [phase, startCamera, stopCamera]);

  const handleCameraChange = async (deviceId: string) => {
    setSelectedCameraId(deviceId);
    localStorage.setItem('as_cameraId', deviceId);
    setCameraReady(false);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (deviceId === 'none') {
      stopCamera();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => setCameraReady(true);
      }
    } catch (err) {
      console.error('카메라 전환 실패:', err);
      setCameraError('카메라 전환에 실패했습니다.');
    }
  };

  // ===== 수동 스캔 영역 그리기 =====
  const drawManualRegion = useCallback((oCtx: CanvasRenderingContext2D, w: number, h: number) => {
    const corners = manualCornersRef.current;
    const ppm = pixelPerMmRef.current;

    // 반투명 어두운 마스크 (스캔 영역 밖)
    oCtx.save();
    oCtx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    oCtx.fillRect(0, 0, w, h);
    // 스캔 영역 내부를 투명하게 (클리핑)
    oCtx.globalCompositeOperation = 'destination-out';
    oCtx.beginPath();
    oCtx.moveTo(corners[0].x * w, corners[0].y * h);
    corners.slice(1).forEach(c => oCtx.lineTo(c.x * w, c.y * h));
    oCtx.closePath();
    oCtx.fill();
    oCtx.restore();

    // 윤곽선
    oCtx.strokeStyle = '#60a5fa';
    oCtx.lineWidth = 3;
    oCtx.setLineDash([]);
    oCtx.beginPath();
    oCtx.moveTo(corners[0].x * w, corners[0].y * h);
    corners.slice(1).forEach(c => oCtx.lineTo(c.x * w, c.y * h));
    oCtx.closePath();
    oCtx.stroke();

    // 변의 중점에 점선 표시 (드래그 가이드)
    oCtx.setLineDash([4, 4]);
    oCtx.strokeStyle = 'rgba(96, 165, 250, 0.4)';
    oCtx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      const c1 = corners[i];
      const c2 = corners[(i + 1) % 4];
      const mx = (c1.x + c2.x) / 2 * w;
      const my = (c1.y + c2.y) / 2 * h;
      oCtx.beginPath();
      oCtx.arc(mx, my, 4, 0, Math.PI * 2);
      oCtx.stroke();
    }
    oCtx.setLineDash([]);

    // 꼭짓점 핸들 (오버레이 캔버스에 그리지만 실제 드래그는 DOM 핸들로 처리)
    corners.forEach((c, i) => {
      const cx = c.x * w;
      const cy = c.y * h;
      // 외곽 글로우
      oCtx.beginPath();
      oCtx.arc(cx, cy, 14, 0, Math.PI * 2);
      oCtx.fillStyle = 'rgba(96, 165, 250, 0.2)';
      oCtx.fill();
      // 내부 원
      oCtx.beginPath();
      oCtx.arc(cx, cy, 8, 0, Math.PI * 2);
      oCtx.fillStyle = '#60a5fa';
      oCtx.fill();
      oCtx.strokeStyle = '#fff';
      oCtx.lineWidth = 2;
      oCtx.stroke();
      // 꼭짓점 번호
      oCtx.fillStyle = '#fff';
      oCtx.font = 'bold 9px sans-serif';
      oCtx.textAlign = 'center';
      oCtx.textBaseline = 'middle';
      oCtx.fillText(`${i + 1}`, cx, cy);
    });

    // 사이즈 표시 (캘리브레이션 시)
    if (ppm) {
      // 상단 변 길이 (가로)
      const topLen = Math.sqrt(
        Math.pow((corners[1].x - corners[0].x) * w, 2) +
        Math.pow((corners[1].y - corners[0].y) * h, 2)
      );
      // 좌측 변 길이 (세로)
      const leftLen = Math.sqrt(
        Math.pow((corners[3].x - corners[0].x) * w, 2) +
        Math.pow((corners[3].y - corners[0].y) * h, 2)
      );
      const ppmX = typeof ppm === 'object' && ppm !== null ? ppm.x : ppm;
      const ppmY = typeof ppm === 'object' && ppm !== null ? ppm.y : ppm;
      const wMm = ppmX ? Math.round(topLen / ppmX) : Math.round(topLen);
      const hMm = ppmY ? Math.round(leftLen / ppmY) : Math.round(leftLen);

      const minX = Math.min(...corners.map(c => c.x)) * w;
      const maxX = Math.max(...corners.map(c => c.x)) * w;
      const minY = Math.min(...corners.map(c => c.y)) * h;
      const maxY = Math.max(...corners.map(c => c.y)) * h;
      const label = `${wMm} mm × ${hMm} mm`;
      drawPostitSizeTag(oCtx, label, { minX, minY, maxX, maxY }, true);
    }
  }, [drawPostitSizeTag]);

  // ===== 수동 영역 사이즈 계산 =====
  const computeManualSize = useCallback(() => {
    if (!overlayRef.current) return;
    const ppm = pixelPerMmRef.current;
    if (!ppm) return;
    const ppmX = typeof ppm === 'object' && ppm !== null ? ppm.x : ppm;
    const ppmY = typeof ppm === 'object' && ppm !== null ? ppm.y : ppm;
    const corners = manualCornersRef.current;
    const w = overlayRef.current.width;
    const h = overlayRef.current.height;
    const topLen = Math.sqrt(
      Math.pow((corners[1].x - corners[0].x) * w, 2) +
      Math.pow((corners[1].y - corners[0].y) * h, 2)
    );
    const leftLen = Math.sqrt(
      Math.pow((corners[3].x - corners[0].x) * w, 2) +
      Math.pow((corners[3].y - corners[0].y) * h, 2)
    );
    if (ppmX) setSizeWidth(Math.round(topLen / ppmX).toString());
    if (ppmY) setSizeHeight(Math.round(leftLen / ppmY).toString());
  }, []);

  // ===== 드래그 핸들러 =====
  const getRelativePos = useCallback((e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent): Point | null => {
    const vf = viewfinderRef.current;
    const overlay = overlayRef.current;
    if (!vf || !overlay) return null;
    const rect = vf.getBoundingClientRect();

    let clientX: number, clientY: number;
    if ('touches' in e) {
      if (e.touches.length === 0) return null;
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as MouseEvent).clientX;
      clientY = (e as MouseEvent).clientY;
    }

    // video의 object-fit: contain에 맞춘 좌표 변환
    const video = videoRef.current;
    const vw = video ? video.videoWidth : overlay.width;
    const vh = video ? video.videoHeight : overlay.height;
    const containerW = rect.width;
    const containerH = rect.height;
    const scale = Math.min(containerW / vw, containerH / vh);
    const renderedW = vw * scale;
    const renderedH = vh * scale;
    const offsetX = (containerW - renderedW) / 2;
    const offsetY = (containerH - renderedH) / 2;

    const localX = clientX - rect.left - offsetX;
    const localY = clientY - rect.top - offsetY;

    return {
      x: Math.max(0, Math.min(1, localX / renderedW)),
      y: Math.max(0, Math.min(1, localY / renderedH)),
    };
  }, []);

  const handleCornerPointerDown = useCallback((index: number, e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggingCorner(index);
  }, []);

  useEffect(() => {
    if (draggingCorner === null) return;

    const handleMove = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      const pos = getRelativePos(e);
      if (!pos) return;
      setManualCorners(prev => {
        const next = [...prev];
        next[draggingCorner] = pos;
        return next;
      });
    };

    const handleUp = () => {
      setDraggingCorner(null);
      if (scanModeRef.current === 'manual') {
        computeManualSize();
      }
    };

    window.addEventListener('mousemove', handleMove, { passive: false });
    window.addEventListener('mouseup', handleUp);
    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('touchend', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleUp);
    };
  }, [draggingCorner, getRelativePos, computeManualSize]);

  // ===== 수동 영역 꼭짓점 DOM 위치 계산 =====
  const getCornerScreenPos = useCallback((corner: Point): { left: string; top: string } => {
    const vf = viewfinderRef.current;
    const overlay = overlayRef.current;
    if (!vf || !overlay) return { left: '0px', top: '0px' };
    const rect = vf.getBoundingClientRect();
    const video = videoRef.current;
    const vw = video ? video.videoWidth : overlay.width;
    const vh = video ? video.videoHeight : overlay.height;
    const containerW = rect.width;
    const containerH = rect.height;
    const scale = Math.min(containerW / vw, containerH / vh);
    const renderedW = vw * scale;
    const renderedH = vh * scale;
    const offsetX = (containerW - renderedW) / 2;
    const offsetY = (containerH - renderedH) / 2;

    return {
      left: `${offsetX + corner.x * renderedW}px`,
      top: `${offsetY + corner.y * renderedH}px`,
    };
  }, []);

  // ===== 프레임 처리 (눈금자 + OpenCV 감지) =====
  const processFrame = useCallback(() => {
    if (!overlayRef.current || !canvasRef.current) return;
    const hasCam = cameraReady && videoRef.current;
    const cv = window.cv;

    const video = videoRef.current;
    const pCanvas = canvasRef.current;
    const overlay = overlayRef.current;

    const vw = hasCam ? video!.videoWidth : 1920;
    const vh = hasCam ? video!.videoHeight : 1080;

    if (pCanvas.width !== vw) pCanvas.width = vw;
    if (pCanvas.height !== vh) pCanvas.height = vh;
    if (overlay.width !== vw) overlay.width = vw;
    if (overlay.height !== vh) overlay.height = vh;

    const pCtx = pCanvas.getContext('2d')!;
    if (hasCam) {
      pCtx.drawImage(video!, 0, 0);
    }

    let src: any, gray: any, blurred: any, edges: any, contours: any, hierarchy: any;
    try {
      const oCtx = overlay.getContext('2d')!;
      oCtx.clearRect(0, 0, overlay.width, overlay.height);

      // 눈금자
      if (showRulerRef.current) {
        drawRulers(oCtx, overlay.width, overlay.height);
      }

      // 수동 모드일 때 수동 영역 그리기
      if (scanModeRef.current === 'manual') {
        drawManualRegion(oCtx, overlay.width, overlay.height);
        return; // 수동 모드에서는 자동 감지 스킵
      }

      if (hasCam && cv) {
      src = cv.imread(pCanvas);
      gray = new cv.Mat();
      blurred = new cv.Mat();
      edges = new cv.Mat();
      contours = new cv.MatVector();
      hierarchy = new cv.Mat();

      // 감지 비활성 또는 OpenCV 미로드 시 스킵
      if (!detectionEnabledRef.current || !cv?.Mat) return;

      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
      cv.Canny(blurred, edges, 30, 100);

      // 모폴로지 - 끊긴 윤곽 연결 (최소한으로)
      const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
      cv.dilate(edges, edges, kernel);
      cv.erode(edges, edges, kernel);
      kernel.delete();

      cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

      // 모든 사각형 후보 수집
      const rects: DetectedRect[] = [];
      const frameArea = vw * vh;
      const minArea = frameArea * (detectMinRatioRef.current / 100); // 사용자 설정 최소 면적 비율
      const maxArea = frameArea * (detectMaxRatioRef.current / 100); // 사용자 설정 최대 면적 비율

      for (let i = 0; i < contours.size(); i++) {
        const cnt = contours.get(i);
        const area = cv.contourArea(cnt);
        if (area < minArea || area > maxArea) { cnt.delete(); continue; }

        // 볼록성 확인 (오목한 형태 제외)
        if (!cv.isContourConvex(cnt)) {
          // 볼록 껍질 시도
          const hull = new cv.Mat();
          cv.convexHull(cnt, hull);
          const hullArea = cv.contourArea(hull);
          // 원래 면적과 볼록 껍질 면적 비율
          const solidity = area / hullArea;
          hull.delete();
          if (solidity < 0.8) { cnt.delete(); continue; }
        }

        const peri = cv.arcLength(cnt, true);
        const approx = new cv.Mat();
        cv.approxPolyDP(cnt, approx, 0.04 * peri, true);

        // 정확히 4꼭짓점인 경우만 (사각형)
        if (approx.rows === 4) {
          // approxPolyDP의 실제 꼭짓점 사용 (minAreaRect 대신)
          const corners: {x: number; y: number}[] = [];
          for (let j = 0; j < 4; j++) {
            corners.push({
              x: approx.data32S[j * 2],
              y: approx.data32S[j * 2 + 1]
            });
          }

          // 꼭짓점 간 거리로 가로/세로 계산
          // orderCorners()로 TL→TR→BR→BL 정렬 후 실제 방향 기반 계산
          const dist = (a: {x:number;y:number}, b: {x:number;y:number}) =>
            Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));
          const cx = corners.reduce((s, c) => s + c.x, 0) / 4;
          const cy = corners.reduce((s, c) => s + c.y, 0) / 4;

          // 꼭짓점을 TL→TR→BR→BL 순으로 정렬
          const sortedCorners = (() => {
            const withAngle = corners.map(p => ({ ...p, angle: Math.atan2(p.y - cy, p.x - cx) }));
            withAngle.sort((a, b) => a.angle - b.angle);
            const tl = withAngle.find(p => p.x < cx && p.y < cy) || withAngle[0];
            const tr = withAngle.find(p => p.x >= cx && p.y < cy) || withAngle[1];
            const br = withAngle.find(p => p.x >= cx && p.y >= cy) || withAngle[2];
            const bl = withAngle.find(p => p.x < cx && p.y >= cy) || withAngle[3];
            return [tl, tr, br, bl];
          })();
          const [stl, str, sbr, sbl] = sortedCorners;
          // 상변(TL-TR), 하변(BL-BR) 평균 = 실제 가로
          const topEdge = dist(stl, str);
          const bottomEdge = dist(sbl, sbr);
          const realWidthPx = (topEdge + bottomEdge) / 2;
          // 좌변(TL-BL), 우변(TR-BR) 평균 = 실제 세로
          const leftEdge = dist(stl, sbl);
          const rightEdge = dist(str, sbr);
          const realHeightPx = (leftEdge + rightEdge) / 2;

          const ppm = pixelPerMmRef.current;
          const ppmX = typeof ppm === 'object' && ppm !== null ? ppm.x : ppm;
          const ppmY = typeof ppm === 'object' && ppm !== null ? ppm.y : ppm;

          rects.push({
            corners: sortedCorners,
            widthPx: realWidthPx,
            heightPx: realHeightPx,
            area,
            widthMm: ppmX ? Math.round(realWidthPx / ppmX) : null,
            heightMm: ppmY ? Math.round(realHeightPx / ppmY) : null,
            centerX: cx, centerY: cy
          });
        }
        approx.delete();
        cnt.delete();
      }

      // 가장 큰 1개만 선택
      rects.sort((a, b) => b.area - a.area);
      let topRects = rects.slice(0, 1);
      setDetectedRects(topRects);

      // ===== 감지 안정화 (히스테리시스 방식) =====
      // 감지 확정: 연속 2프레임 안정 → 즉시 표시
      // 감지 소멸: 연속 15프레임(약 3초) 미감지 → 클리어 (순간 깜빡임 방지)
      const STABLE_THRESHOLD_PX = vw * 0.05; // 5% 이내면 같은 물체
      const STABLE_FRAMES_NEEDED = 2;         // 빠른 확정
      const MISS_FRAMES_TO_LOSE = 15;         // 오래 실패해야 사라짐

      if (topRects.length > 0) {
        const main = topRects[0];
        const prev = stableDetectedRef.current;
        missCountRef.current = 0; // 감지됐으므로 미감지 카운터 리셋

        let isStable = false;
        if (prev) {
          const dx = main.centerX - prev.centerX;
          const dy = main.centerY - prev.centerY;
          const moveDist = Math.sqrt(dx * dx + dy * dy);
          const sizeRatio = Math.abs(main.widthPx - prev.widthPx) / Math.max(main.widthPx, prev.widthPx);
          isStable = moveDist < STABLE_THRESHOLD_PX && sizeRatio < 0.1;
        }

        if (isStable) {
          stableCountRef.current = Math.min(stableCountRef.current + 1, 30);
        } else {
          stableCountRef.current = 1;
          stableDetectedRef.current = { ...main };
        }

        if (stableCountRef.current >= STABLE_FRAMES_NEEDED) {
          // 안정 확정 → 현재 감지 결과로 업데이트
          stableDetectedRef.current = { ...main };
          detectedCornersRef.current = main.corners;
          setHasDetectedObject(true);
          setDetectedPixelSize({ w: Math.round(main.widthPx), h: Math.round(main.heightPx) });
        } else if (prev) {
          // 안정화 중: 이전 안정값 유지
          detectedCornersRef.current = prev.corners;
          setHasDetectedObject(true);
          setDetectedPixelSize({ w: Math.round(prev.widthPx), h: Math.round(prev.heightPx) });
          topRects = [prev];
        }
      } else {
        // 미감지 → missCountRef 증가, 충분히 오래 실패해야 클리어
        missCountRef.current += 1;
        if (missCountRef.current >= MISS_FRAMES_TO_LOSE) {
          stableCountRef.current = 0;
          stableDetectedRef.current = null;
          detectedCornersRef.current = null;
          setHasDetectedObject(false);
          setDetectedPixelSize(null);
        } else if (stableDetectedRef.current) {
          // 아직 유예 중: 이전 안정값 유지 (표시 지속)
          topRects = [stableDetectedRef.current];
        }
      }

      // 가장 큰 피사체 1개만 그리기
      if (topRects.length > 0) {
        const rawMain = topRects[0];
        const ppm = pixelPerMmRef.current;
        const ppmX = typeof ppm === 'object' && ppm !== null ? ppm.x : ppm;
        const ppmY = typeof ppm === 'object' && ppm !== null ? ppm.y : ppm;

        // ★ stableMain의 widthMm/heightMm은 감지 시점의 ppm으로 계산된 값이라 캘리브레이션 후에 stale할 수 있음.
        //    매 프레임 현재 ppm으로 mm를 재계산하여 반영
        const main = {
          ...rawMain,
          widthMm: ppmX ? Math.round(rawMain.widthPx / ppmX) : null,
          heightMm: ppmY ? Math.round(rawMain.heightPx / ppmY) : null,
        };

        // 윤곽선
        oCtx.strokeStyle = ppm ? '#4ade80' : 'rgba(255, 255, 255, 0.85)';
        oCtx.lineWidth = 3;
        oCtx.setLineDash(ppm ? [] : [10, 5]);
        oCtx.beginPath();
        oCtx.moveTo(main.corners[0].x, main.corners[0].y);
        main.corners.slice(1).forEach(c => oCtx.lineTo(c.x, c.y));
        oCtx.closePath();
        oCtx.stroke();
        oCtx.setLineDash([]);

        // 꼭짓점 표시
        oCtx.fillStyle = ppm ? '#4ade80' : 'rgba(255, 255, 255, 0.9)';
        main.corners.forEach(c => {
          oCtx.beginPath();
          oCtx.arc(c.x, c.y, 5, 0, Math.PI * 2);
          oCtx.fill();
        });

        // 마진 가이드라인 (마진 설정 시 바깥쪽 점선)
        const marginGuide = captureMarginPxRef.current || 0;
        if (marginGuide > 0 && main.corners.length === 4) {
          const ord = orderCorners(main.corners);
          const mCorners = expandCornersWithMargin(ord, marginGuide, overlay.width, overlay.height);
          oCtx.strokeStyle = 'rgba(56, 189, 248, 0.75)';
          oCtx.lineWidth = 1.5;
          oCtx.setLineDash([6, 4]);
          oCtx.beginPath();
          oCtx.moveTo(mCorners[0].x, mCorners[0].y);
          mCorners.slice(1).forEach(c => oCtx.lineTo(c.x, c.y));
          oCtx.closePath();
          oCtx.stroke();
          oCtx.setLineDash([]);
        }

        // ===== 우측 하단 구겨진 포스트잇 스타일 사이즈 태그 =====
        if (showSizeTagRef.current) {
          let label: string;
          if (ppmX && ppmY && main.widthMm && main.heightMm) {
            label = `${main.widthMm} mm × ${main.heightMm} mm`;
          } else {
            label = `${Math.round(main.widthPx)} px × ${Math.round(main.heightPx)} px`;
          }
          const minX = Math.min(...main.corners.map(c => c.x));
          const maxX = Math.max(...main.corners.map(c => c.x));
          const minY = Math.min(...main.corners.map(c => c.y));
          const maxY = Math.max(...main.corners.map(c => c.y));
          drawPostitSizeTag(oCtx, label, { minX, minY, maxX, maxY }, !!(ppmX && ppmY));
        }

        // 사이즈 자동 입력
        if (ppmX && ppmY && main.widthMm && main.heightMm) {
          setSizeWidth(main.widthMm.toString());
          setSizeHeight(main.heightMm.toString());
        } else {
          setSizeWidth(Math.round(main.widthPx).toString());
          setSizeHeight(Math.round(main.heightPx).toString());
        }
      }
      }
    } catch (e) {
      // OpenCV 에러 무시 (프레임 스킵)
    } finally {
      try {
        src?.delete(); gray?.delete(); blurred?.delete();
        edges?.delete(); contours?.delete(); hierarchy?.delete();
      } catch (_) {}
    }
  }, [cameraReady, drawRulers, drawManualRegion, drawPostitSizeTag]);

  // 프레임 처리 루프 (눈금자는 항상, 감지는 OpenCV 로드 후)
  useEffect(() => {
    if (phase !== 'viewfinder') return;

    let lastTime = 0;
    const loop = (time: number) => {
      if (time - lastTime >= 200) {
        processFrame();
        lastTime = time;
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => cancelAnimationFrame(rafRef.current);
  }, [phase, cameraReady, processFrame]);



  // 키보드
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 입력창(input, textarea) 포커스 중이거나 설정 창이 열려 있을 때는 촬영 단축키 무시
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (showSettings) return;

      if (phase === 'viewfinder' && (e.code === 'Space' || e.code === 'Enter')) {
        e.preventDefault();
        handleCapture();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [phase, cameraReady, showSettings]);

  // 꼭짓점 정렬 (좌상, 우상, 우하, 좌하 순서)
  const orderCorners = (pts: {x: number; y: number}[]): {x: number; y: number}[] => {
    const sorted = [...pts];
    // 중심 기준 정렬
    const cx = sorted.reduce((s, p) => s + p.x, 0) / sorted.length;
    const cy = sorted.reduce((s, p) => s + p.y, 0) / sorted.length;
    // 각도 기준 정렬 (좌상부터 시계방향)
    const withAngle = sorted.map(p => ({
      ...p,
      angle: Math.atan2(p.y - cy, p.x - cx)
    }));
    withAngle.sort((a, b) => a.angle - b.angle);
    // 좌상(TL), 우상(TR), 우하(BR), 좌하(BL) 순서 재배열
    // atan2 기준: 좌상(-π~-π/2), 우상(-π/2~0), 우하(0~π/2), 좌하(π/2~π)
    const tl = withAngle.find(p => p.x < cx && p.y < cy) || withAngle[0];
    const tr = withAngle.find(p => p.x >= cx && p.y < cy) || withAngle[1];
    const br = withAngle.find(p => p.x >= cx && p.y >= cy) || withAngle[2];
    const bl = withAngle.find(p => p.x < cx && p.y >= cy) || withAngle[3];
    return [tl, tr, br, bl];
  };

  // 사각형 꼭짓점을 marginPx만큼 외곽으로 확장 (마진 촬영용)
  const expandCornersWithMargin = (
    corners: { x: number; y: number }[],
    marginPx: number,
    maxW: number,
    maxH: number
  ): { x: number; y: number }[] => {
    if (marginPx <= 0 || corners.length !== 4) return corners;

    const [tl, tr, br, bl] = corners;
    const cx = (tl.x + tr.x + br.x + bl.x) / 4;
    const cy = (tl.y + tr.y + br.y + bl.y) / 4;

    const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2)) || 1;

    // 변 단위벡터
    const dTop = dist(tl, tr);
    const uTop = { x: (tr.x - tl.x) / dTop, y: (tr.y - tl.y) / dTop };
    const dRight = dist(tr, br);
    const uRight = { x: (br.x - tr.x) / dRight, y: (br.y - tr.y) / dRight };
    const dBottom = dist(bl, br);
    const uBottom = { x: (br.x - bl.x) / dBottom, y: (br.y - bl.y) / dBottom };
    const dLeft = dist(tl, bl);
    const uLeft = { x: (bl.x - tl.x) / dLeft, y: (bl.y - tl.y) / dLeft };

    // 바깥쪽 법선 벡터
    const getOutwardNormal = (p1: { x: number; y: number }, u: { x: number; y: number }) => {
      const n1 = { x: -u.y, y: u.x };
      const toCenter = { x: cx - p1.x, y: cy - p1.y };
      const dot = n1.x * toCenter.x + n1.y * toCenter.y;
      return dot < 0 ? n1 : { x: u.y, y: -u.x };
    };

    const nTop = getOutwardNormal(tl, uTop);
    const nRight = getOutwardNormal(tr, uRight);
    const nBottom = getOutwardNormal(br, uBottom);
    const nLeft = getOutwardNormal(tl, uLeft);

    const clamp = (val: number, max: number) => Math.max(0, Math.min(max, val));

    return [
      { x: clamp(tl.x + marginPx * (nTop.x + nLeft.x), maxW), y: clamp(tl.y + marginPx * (nTop.y + nLeft.y), maxH) },
      { x: clamp(tr.x + marginPx * (nTop.x + nRight.x), maxW), y: clamp(tr.y + marginPx * (nTop.y + nRight.y), maxH) },
      { x: clamp(br.x + marginPx * (nBottom.x + nRight.x), maxW), y: clamp(br.y + marginPx * (nBottom.y + nRight.y), maxH) },
      { x: clamp(bl.x + marginPx * (nBottom.x + nLeft.x), maxW), y: clamp(bl.y + marginPx * (nBottom.y + nLeft.y), maxH) }
    ];
  };

  const handleCapture = () => {
    if (!videoRef.current || !cameraReady) return;
    setShowFlash(true);
    setTimeout(() => setShowFlash(false), 300);

    const video = videoRef.current;
    const canvas = canvasRef.current!;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    canvas.width = vw;
    canvas.height = vh;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(video, 0, 0);

    // 수동 모드에서 사이즈 계산
    if (scanMode === 'manual') {
      computeManualSize();
    }

    // 원근 보정 시도
    const cv = window.cv;
    let srcCorners: {x: number; y: number}[] | null = null;
    let didWarp = false;

    if (scanMode === 'manual') {
      // 수동 모드: manualCorners를 실제 픽셀 좌표로 변환
      srcCorners = manualCornersRef.current.map(c => ({
        x: c.x * vw,
        y: c.y * vh
      }));
    } else if (scanMode === 'auto' && detectedCornersRef.current) {
      // 자동 모드: 감지된 꼭짓점 사용
      srcCorners = detectedCornersRef.current;
    }

    if (cv && srcCorners && srcCorners.length === 4) {
      try {
        const ordered = orderCorners(srcCorners);

        // 원본 순수 물체 크기 (마진 제외)
        const dist = (a: {x:number;y:number}, b: {x:number;y:number}) =>
          Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));

        // 설정된 마진 픽셀만큼 외곽으로 확장
        const marginPx = captureMarginPxRef.current || 0;
        const warpCorners = expandCornersWithMargin(ordered, marginPx, vw, vh);
        const [wtl, wtr, wbr, wbl] = warpCorners;

        // 마진 포함 출력 픽셀 크기
        const outW = Math.round(Math.max(dist(wtl, wtr), dist(wbl, wbr)));
        const outH = Math.round(Math.max(dist(wtl, wbl), dist(wtr, wbr)));

        if (outW > 10 && outH > 10) {
          // 마진이 적용된 확장 좌표를 소스로 사용
          const srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
            wtl.x, wtl.y, wtr.x, wtr.y, wbr.x, wbr.y, wbl.x, wbl.y
          ]);
          const dstPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
            0, 0, outW, 0, outW, outH, 0, outH
          ]);

          const M = cv.getPerspectiveTransform(srcPts, dstPts);
          const src = cv.imread(canvas);
          const dst = new cv.Mat();
          cv.warpPerspective(src, dst, M, new cv.Size(outW, outH));

          // 보정된 이미지를 canvas에 그리기
          canvas.width = outW;
          canvas.height = outH;
          cv.imshow(canvas, dst);

          // 정리
          srcPts.delete();
          dstPts.delete();
          M.delete();
          src.delete();
          dst.delete();
          didWarp = true; // 촬영 영역 안쪽만 정확히 잘라냄
        }
      } catch (e) {
        console.warn('원근 보정 실패, 원본 이미지 사용:', e);
        // 실패 시 원본 이미지 유지
      }
    }

    // 크로마키: 촬영 영역 '안쪽'은 절대로 투명화되지 않도록 보호!
    // 원근 보정이 수행된 경우(didWarp=true) canvas 전체가 촬영 영역 안쪽(문서 자체)이므로 크로마키를 적용하지 않음.
    // 원근 보정이 안 된 전체 프레임인 경우에도, 촬영 영역 안쪽은 마스크를 0으로 채워 바깥 배경만 투명화함.
    if (chromaKey && cv && !didWarp) {
      try {
        const range = chromaHsvRanges[chromaKeyColor];
        const chromaSrc = cv.imread(canvas);
        const rgb = new cv.Mat();
        cv.cvtColor(chromaSrc, rgb, cv.COLOR_RGBA2RGB);
        const hsvImg = new cv.Mat();
        cv.cvtColor(rgb, hsvImg, cv.COLOR_RGB2HSV);

        // 선택된 색상 범위로 마스킹
        const low = new cv.Mat(hsvImg.rows, hsvImg.cols, hsvImg.type(), range.low);
        const high = new cv.Mat(hsvImg.rows, hsvImg.cols, hsvImg.type(), range.high);
        const mask = new cv.Mat();
        cv.inRange(hsvImg, low, high, mask);

        // 빨강색은 HSV에서 H가 0 근처와 170 근처 두 영역에 걸쳐 있음
        if (chromaKeyColor === 'red') {
          const low2 = new cv.Mat(hsvImg.rows, hsvImg.cols, hsvImg.type(), [160, 40, 40, 0]);
          const high2 = new cv.Mat(hsvImg.rows, hsvImg.cols, hsvImg.type(), [180, 255, 255, 255]);
          const mask2 = new cv.Mat();
          cv.inRange(hsvImg, low2, high2, mask2);
          cv.bitwise_or(mask, mask2, mask);
          low2.delete(); high2.delete(); mask2.delete();
        }

        // 촬영 영역(피사체) 안쪽은 무조건 마스크를 0으로 지워 투명화 방지 (안쪽 내용 100% 보호)
        if (srcCorners && srcCorners.length === 4) {
          const ordered = orderCorners(srcCorners);
          const pts = cv.matFromArray(4, 1, cv.CV_32SC2, [
            Math.round(ordered[0].x), Math.round(ordered[0].y),
            Math.round(ordered[1].x), Math.round(ordered[1].y),
            Math.round(ordered[2].x), Math.round(ordered[2].y),
            Math.round(ordered[3].x), Math.round(ordered[3].y)
          ]);
          const ptsVec = new cv.MatVector();
          ptsVec.push_back(pts);
          cv.fillPoly(mask, ptsVec, new cv.Scalar(0, 0, 0, 0));
          pts.delete();
          ptsVec.delete();
        }

        // 마스크 정리 (노이즈 제거)
        const kMorph = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(5, 5));
        cv.morphologyEx(mask, mask, cv.MORPH_CLOSE, kMorph);
        cv.morphologyEx(mask, mask, cv.MORPH_OPEN, kMorph);
        cv.GaussianBlur(mask, mask, new cv.Size(3, 3), 0);
        kMorph.delete();

        // RGBA 이미지 생성 (선택 색상 영역 = 투명)
        const rgba = chromaSrc.clone();
        const cw = canvas.width;
        const ch = canvas.height;

        for (let y = 0; y < ch; y++) {
          for (let x = 0; x < cw; x++) {
            const maskVal = mask.ucharAt(y, x);
            if (maskVal > 128) {
              rgba.ucharPtr(y, x)[3] = 0;
            } else if (maskVal > 30) {
              rgba.ucharPtr(y, x)[3] = 255 - maskVal;
            }
          }
        }

        cv.imshow(canvas, rgba);

        chromaSrc.delete(); rgb.delete(); hsvImg.delete();
        low.delete(); high.delete(); mask.delete(); rgba.delete();
      } catch (e) {
        console.warn('크로마키 처리 실패:', e);
      }
    }

    // 사이즈 보기 ON일 때 이미지 우측 하단에 리얼 구겨진 포스트잇 & 손글씨 그대로 합성
    if (showSizeTag && sizeWidth && sizeHeight) {
      const sw = parseFloat(sizeWidth);
      const sh = parseFloat(sizeHeight);
      if (sw && sh) {
        const tagCtx = canvas.getContext('2d')!;
        const cw = canvas.width;
        const ch = canvas.height;
        const label = `${Math.round(sw)} mm × ${Math.round(sh)} mm`;

        // 캔버스 크기에 비례하는 스케일 (기본 900px 기준)
        const postitScale = Math.max(1, Math.min(cw, ch) / 900);
        drawPostitSizeTag(
          tagCtx,
          label,
          { minX: 0, minY: 0, maxX: cw, maxY: ch },
          calibrated,
          postitScale
        );
      }
    }

    // 이미지 저장 (크로마키 시 PNG, 아니면 JPEG)
    const format = chromaKey ? 'image/png' : 'image/jpeg';
    setCapturedImage(canvas.toDataURL(format, chromaKey ? undefined : 0.92));
    setCaptureZoom(1);
    setCapturePan({ x: 0, y: 0 });
    stopCamera();
    setPhase('captured');
  };

  // 기존 엔티티 데이터를 폼에 로드 (수정 모드 진입)
  const handleLoadEntityForEdit = (anchorId: string, domainId: string, data: Record<string, string>) => {
    setEditTargetAnchorId(anchorId);
    setNodeEntityMode('edit');
    setShowEntitySelectPopup(false);
    // 기존 데이터를 폼에 채우기 (선택된 트리 노드 ID도 보완)
    setLinkedFormData(prev => ({
      ...prev,
      [domainId]: {
        ...data,
        _treeNodeId: selectedTreeNode?.id ?? data._treeNodeId ?? '',
      }
    }));
  };

  // 특정 도메인 및 현재 선택된 노드에 속한 엔티티 목록 가져오기 (소장자 필터링 포함)
  const getEntitiesForDomainAndNode = useCallback((domId: string) => {
    const originNode = getActiveOriginNodeForDomain(domId) || selectedTreeNode;
    if (!originNode) return getAtomsForDomain(domId);
    return getEntitiesForDomainAndSpecificNode(domId, originNode);
  }, [getActiveOriginNodeForDomain, selectedTreeNode, getAtomsForDomain, getEntitiesForDomainAndSpecificNode]);

  // 개별 도메인 전용 저장 핸들러 (parentAnchorIdOverride: 하위 도메인 저장 시 상위 엔티티 ID 직접 전달)
  const handleSaveDomain = (domId: string, parentAnchorIdOverride?: string): string | null => {
    const dom = domains.find(d => d.id === domId);
    if (!dom) return null;

    // 소장자 미선택 시 저장 차단
    if (!selectedOwner) {
      alert('소장자를 먼저 선택해주세요.\n소장자 없이는 자료를 등록할 수 없습니다.');
      return null;
    }

    const domFields = linkedDomainFields.get(domId) || [];
    const formData = linkedFormData[domId] || {};
    const currentSelectedAnchorId = selectedEntityByDomain[domId];

    // 저장할 데이터 유효성 검사 (입력된 내용이 하나라도 있는지, 이미지 데이터도 유효)
    const hasValues = Object.entries(formData).some(([k, v]) => {
      if (k.startsWith('_') || typeof v !== 'string') return false;
      if (v.startsWith('data:image') || v.startsWith('blob:') || v.startsWith('/local-images/')) return true;
      return v.trim().length > 0;
    });
    if (!hasValues && !uploadedImageFromForm && !capturedImage) {
      alert(`${dom.name} 도메인에 입력된 내용이 없습니다.`);
      return null;
    }

    const originNode = getActiveOriginNodeForDomain(domId) || selectedTreeNode;

    // 1) 수정 모드
    if (currentSelectedAnchorId) {
      domFields.forEach(f => {
        if (formData[f.name] !== undefined) {
          // 이미지 필드인데 빈 값이면 기존 이미지를 유지 (삭제 방지)
          const isImg = f.inputType === 'image' || f.inputType === 'camera' ||
            f.name.includes('이미지') || f.name.includes('사진');
          if (isImg && !formData[f.name]) {
            // 빈 값이면 업데이트하지 않음 (기존 이미지 유지)
          } else {
            updateEntityField(currentSelectedAnchorId, f.name, formData[f.name]);
          }
        }
        if (f.extraFields && f.extraFields.length > 0) {
          f.extraFields.forEach(ext => {
            const extKey = ext.label?.trim() || ext.id;
            if (formData[extKey] !== undefined) {
              const isExtImg = ext.inputType === 'image' || ext.inputType === 'camera';
              if (isExtImg && !formData[extKey]) {
                // 빈 값이면 업데이트하지 않음
              } else {
                updateEntityField(currentSelectedAnchorId, extKey, formData[extKey]);
              }
            }
          });
        }
      });
      // suffix 키 수정 저장 (복수 이미지: 이미지업로드_0, 이미지설명_0, ...)
      Object.entries(formData).forEach(([k, v]) => {
        if (/^.+_\d+$/.test(k) && typeof v === 'string') {
          updateEntityField(currentSelectedAnchorId, k, v);
        }
      });

      // 하위 도메인인 경우 현재 선택된 최상위 인스턴스로 _parentInstanceId 확실히 동기화
      const topDom = selectedLinkedDomains[0];
      const effectiveParentId = parentAnchorIdOverride || (topDom ? selectedEntityByDomain[topDom.id] : null);
      if (topDom && topDom.id !== domId && effectiveParentId) {
        updateEntityField(currentSelectedAnchorId, '_parentInstanceId', effectiveParentId);
      }

      setDomainSavedNotice(prev => ({ ...prev, [domId]: '수정 저장되었습니다.' }));
      reloadIdbImages();
      setTimeout(() => {
        setDomainSavedNotice(prev => ({ ...prev, [domId]: '' }));
      }, 2000);
      return currentSelectedAnchorId;
    }

    // 2) 신규 저장 모드
    const payload: Record<string, string> = {};
    domFields.forEach(f => {
      const fVal = formData[f.name];
      // 이미지 데이터(base64)는 trim하지 않고 그대로 저장
      if (fVal !== undefined && typeof fVal === 'string') {
        if (fVal.startsWith('data:image') || fVal.startsWith('blob:') || fVal.startsWith('http') || fVal.startsWith('/local-images/')) {
          payload[f.name] = fVal;
        } else if (fVal.trim()) {
          payload[f.name] = fVal.trim();
        }
      }
      if (f.extraFields && f.extraFields.length > 0) {
        f.extraFields.forEach(ext => {
          const extKey = ext.label?.trim() || ext.id;
          const extVal = formData[extKey];
          if (extVal !== undefined && typeof extVal === 'string') {
            if (extVal.startsWith('data:image') || extVal.startsWith('blob:') || extVal.startsWith('http') || extVal.startsWith('/local-images/')) {
              payload[extKey] = extVal;
            } else if (extVal.trim()) {
              payload[extKey] = extVal.trim();
            }
          }
        });
      }
    });

    // suffix 키 추가 (복수 이미지: 이미지업로드_0, 이미지설명_0, ...)
    Object.entries(formData).forEach(([k, v]) => {
      if (/^.+_\d+$/.test(k) && v !== undefined && typeof v === 'string') {
        if (v.startsWith('data:image') || v.startsWith('blob:') || v.startsWith('http') || v.startsWith('/local-images/')) {
          payload[k] = v;
        } else if (v.trim()) {
          payload[k] = v.trim();
        } else {
          payload[k] = '';
        }
      }
    });

    // 이미지 필드 자동 채움 (복수 이미지의 0번 이미지가 있으면 대표 이미지로도 설정)
    const imgField = domFields.find(f => f.inputType === 'camera')
      || domFields.find(f => f.inputType === 'image' || f.name.includes('이미지') || f.name.includes('사진'));
    if (imgField && !payload[imgField.name]) {
      if (payload[`${imgField.name}_0`]) {
        payload[imgField.name] = payload[`${imgField.name}_0`];
      } else if (uploadedImageFromForm) {
        payload[imgField.name] = uploadedImageFromForm;
      } else if (hasCameraFieldInSelectedNode && capturedImage) {
        payload[imgField.name] = capturedImage;
      }
    }

    // 사이즈 필드 자동 채움 (최상위 필드 + extraFields 안에도 탐색)
    if (sizeWidth && sizeHeight) {
      const isSizeKey = (name: string) => name.includes('사이즈') || name.includes('크기');
      const topSizeField = domFields.find(f => isSizeKey(f.name));
      if (topSizeField) {
        payload[topSizeField.name] = `${sizeWidth} × ${sizeHeight} mm`;
      } else {
        // extraFields 안에서도 탐색
        for (const f of domFields) {
          if (f.extraFields && f.extraFields.length > 0) {
            const extSize = f.extraFields.find(ext => isSizeKey(ext.label || ''));
            if (extSize) {
              const extKey = extSize.label?.trim() || extSize.id;
              payload[extKey] = `${sizeWidth} × ${sizeHeight} mm`;
              break;
            }
          }
        }
      }
    }

    if (originNode) {
      payload._treeNodeId = originNode.id;
    }
    if (selectedOwner) {
      payload._ownerId = selectedOwner.anchorId;
    }
    // 하위 도메인인 경우 현재 최상위 도메인의 선택된 엔티티 ID를 부모 인스턴스로 연결
    const topDom = selectedLinkedDomains[0];
    const effectiveParentId = parentAnchorIdOverride || (topDom ? selectedEntityByDomain[topDom.id] : null);
    if (topDom && topDom.id !== domId && effectiveParentId) {
      payload._parentInstanceId = effectiveParentId;
    }
    payload._savedAt = Date.now().toString();

    const newAnchorId = addEntityToDomain(domId, payload);
    if (newAnchorId) {
      setSelectedEntityByDomain(prev => ({ ...prev, [domId]: newAnchorId }));
      setDomainSavedNotice(prev => ({ ...prev, [domId]: '저장되었습니다.' }));
      // 저장 완료 시 새 세트 모드 해제 (저장목록 바 다시 표시)
      setIsNewSetMode(false);
      reloadIdbImages();
      setTimeout(() => {
        setDomainSavedNotice(prev => ({ ...prev, [domId]: '' }));
      }, 2000);
      return newAnchorId;
    }
    return null;
  };

  // 번호(1, 2, 3...) 클릭 시 해당 엔티티 데이터 로드
  const handleSelectDomainEntity = (domId: string, anchorId: string, entityData: Record<string, string>) => {
    setSelectedEntityByDomain(prev => ({ ...prev, [domId]: anchorId }));

    // entityData 복사 후 '__img__' 플래그를 IndexedDB 이미지로 복원
    const restoredData: Record<string, string> = { ...entityData };
    const basePrefix = anchorId ? getEntityBasePrefix(anchorId) : '';

    Object.entries(restoredData).forEach(([k, v]) => {
      if (v === '__img__' || (typeof v === 'string' && v.startsWith('__img'))) {
        const idbVal = (anchorId && idbImageMap[`${anchorId}-${k}`]) ||
          (basePrefix && idbImageMap[`${basePrefix}-${k}`]) ||
          idbImageMap[k] ||
          (anchorId && idbImageMap[anchorId]);
        if (idbVal) restoredData[k] = idbVal;
      }
    });

    // idbImageMap에서 해당 엔티티 접두어로 시작하는 이미지 키(이미지업로드_0 등) 보강
    if (basePrefix) {
      Object.entries(idbImageMap).forEach(([idbKey, idbVal]) => {
        if (idbKey.startsWith(basePrefix)) {
          const fieldSuffix = idbKey.slice(basePrefix.length + 1);
          if (fieldSuffix && (!restoredData[fieldSuffix] || restoredData[fieldSuffix] === '__img__')) {
            restoredData[fieldSuffix] = idbVal;
          }
        }
      });
    }

    setLinkedFormData(prev => ({
      ...prev,
      [domId]: restoredData
    }));

    // 이미지 필드가 있는 경우 좌측 큰 뷰포트에도 해당 이미지 표시
    const imgEntry = Object.entries(restoredData).find(([k, v]) =>
      (k.includes('이미지') || k.includes('사진') || k.includes('업로드')) &&
      typeof v === 'string' && isValidImageUrl(v)
    );
    if (imgEntry) {
      setActivePreviewImage(imgEntry[1]);
    }
  };

  // 새 입력 버튼 클릭 시
  const handleNewDomainEntity = (domId: string) => {
    setSelectedEntityByDomain(prev => ({ ...prev, [domId]: null }));
    setLinkedFormData(prev => ({
      ...prev,
      [domId]: {}
    }));
    setActivePreviewImage(null);
  };

  // 특정 엔티티 삭제
  const handleDeleteDomainEntity = (domId: string, anchorId: string) => {
    if (!window.confirm('선택한 자료를 삭제하시겠습니까?')) return;
    removeEntityFromDomain(domId, anchorId);

    // 최상위 도메인의 엔티티를 삭제한 경우, 해당 엔티티에 귀속된 하위 자식들도 함께 삭제
    const topDom = selectedLinkedDomains[0];
    if (topDom && topDom.id === domId) {
      selectedLinkedDomains.slice(1).forEach(childDom => {
        const childEnts = getAtomsForDomain(childDom.id);
        childEnts.forEach(ce => {
          if (ce.data._parentInstanceId === anchorId) {
            removeEntityFromDomain(childDom.id, ce.anchorId);
          }
        });
      });
    }

    setSelectedEntityByDomain(prev => ({ ...prev, [domId]: null }));
    setLinkedFormData(prev => ({
      ...prev,
      [domId]: {}
    }));
  };

  // 최상위 세트(책 1권, 2권...) 선택 핸들러 (하위 표지/속지 데이터 완전 격리)
  const handleSelectSet = useCallback((idx: number) => {
    setIsNewSetMode(false);
    const topDom = selectedLinkedDomains[0];
    if (!topDom) return;
    const topEntities = getEntitiesForDomainAndNode(topDom.id);
    const targetTop = topEntities[idx];
    if (!targetTop) return;

    // 1. 최상위(묶음정리 / 책 1권 또는 2권) 엔티티 로드
    handleSelectDomainEntity(topDom.id, targetTop.anchorId, targetTop.data);

    // 2. 하위 도메인들(기록물: 표지, 속지 등)은 선택된 targetTop(해당 권)에 귀속된 자식 엔티티들을 로드
    selectedLinkedDomains.slice(1).forEach(childDom => {
      const originNode = getActiveOriginNodeForDomain(childDom.id) || selectedTreeNode;
      const childEnts = originNode
        ? getEntitiesForDomainAndSpecificNode(childDom.id, originNode, targetTop.anchorId)
        : [];
      if (childEnts.length > 0) {
        handleSelectDomainEntity(childDom.id, childEnts[0].anchorId, childEnts[0].data);
      } else {
        handleNewDomainEntity(childDom.id);
      }
    });
  }, [selectedLinkedDomains, getEntitiesForDomainAndNode, handleSelectDomainEntity, getActiveOriginNodeForDomain, selectedTreeNode, getEntitiesForDomainAndSpecificNode, handleNewDomainEntity]);

  // 새 세트 추가 버튼 핸들러
  const handleNewSet = useCallback(() => {
    setIsNewSetMode(true);
    selectedLinkedDomains.forEach(dom => handleNewDomainEntity(dom.id));
    setActivePreviewImage(null);
  }, [selectedLinkedDomains, handleNewDomainEntity]);

  // 소장품(트리 노드) 변경 시 상위 엔티티가 있으면 1번 세트 자동 선택
  useEffect(() => {
    if (selectedLinkedDomains.length > 0 && !isNewSetMode) {
      const topDom = selectedLinkedDomains[0];
      if (!topDom) return;
      const topEntities = getEntitiesForDomainAndNode(topDom.id);
      const currentTop = selectedEntityByDomain[topDom.id];
      if (topEntities.length > 0 && (!currentTop || !topEntities.some(e => e.anchorId === currentTop))) {
        handleSelectSet(0);
      }
    }
  }, [selectedLinkedDomains, isNewSetMode, selectedEntityByDomain, getEntitiesForDomainAndNode, handleSelectSet]);

  // 상단 통합 저장 핸들러 (연결된 도메인의 입력 내용 일괄 저장)
  const handleSaveAllCurrentDomains = () => {
    if (!selectedTreeNode || selectedLinkedDomains.length === 0) return;
    // 소장자 미선택 시 저장 차단
    if (!selectedOwner) {
      alert('소장자를 먼저 선택해주세요.\n소장자 없이는 자료를 등록할 수 없습니다.');
      return;
    }

    const topDom = selectedLinkedDomains[0];
    let topAnchorId: string | null = topDom ? (selectedEntityByDomain[topDom.id] || null) : null;

    // 1. 최상위 도메인(책, 편지, 병풍 등) 먼저 저장하여 topAnchorId 확보
    if (topDom) {
      const topFormData = linkedFormData[topDom.id] || {};
      const hasTopValues = Object.entries(topFormData).some(([k, v]) => {
        if (k.startsWith('_') || typeof v !== 'string') return false;
        if (v.startsWith('data:image') || v.startsWith('blob:')) return true;
        return v.trim().length > 0;
      });
      if (hasTopValues || uploadedImageFromForm || capturedImage || !topAnchorId) {
        const savedTopId = handleSaveDomain(topDom.id);
        if (savedTopId) {
          topAnchorId = savedTopId;
        }
      }
    }

    // 2. 하위 도메인들(기록물: 표지, 속지 등) 저장 - 확보된 topAnchorId를 부모 인스턴스로 전달
    selectedLinkedDomains.slice(1).forEach(childDom => {
      const childFormData = linkedFormData[childDom.id] || {};
      const hasChildValues = Object.entries(childFormData).some(([k, v]) => {
        if (k.startsWith('_') || typeof v !== 'string') return false;
        if (v.startsWith('data:image') || v.startsWith('blob:')) return true;
        return v.trim().length > 0;
      });
      if (hasChildValues) {
        handleSaveDomain(childDom.id, topAnchorId || undefined);
      }
    });
  };

  const handleSave = () => {
    // 소장자 미선택 시 저장 차단
    if (!selectedOwner) {
      alert('소장자를 먼저 선택해주세요.\n소장자 없이는 자료를 등록할 수 없습니다.');
      return;
    }

    // edit 모드: updateEntityField로 기존 엔티티 수정
    if (nodeEntityMode === 'edit' && editTargetAnchorId && selectedLinkedDomains.length > 0) {
      selectedLinkedDomains.forEach(dom => {
        const formData = linkedFormData[dom.id] || {};
        const domFields = linkedDomainFields.get(dom.id) || [];
        domFields.forEach(f => {
          if (formData[f.name] !== undefined) {
            updateEntityField(editTargetAnchorId, f.name, formData[f.name]);
          }
          if (f.extraFields && f.extraFields.length > 0) {
            f.extraFields.forEach(ext => {
              const extKey = ext.label?.trim() || ext.id;
              if (formData[extKey] !== undefined) {
                updateEntityField(editTargetAnchorId, extKey, formData[extKey]);
              }
            });
          }
        });
        const imgField = domFields.find(f => f.inputType === 'camera')
          || domFields.find(f => f.inputType === 'image' || f.name.includes('이미지') || f.name.includes('사진'));
        if (imgField && !formData[imgField.name] && capturedImage) {
          updateEntityField(editTargetAnchorId, imgField.name, capturedImage);
        }
      });
      const domainDataSnapshot: Record<string, Record<string, string>> = {};
      selectedLinkedDomains.forEach(dom => {
        domainDataSnapshot[dom.id] = { ...(linkedFormData[dom.id] || {}) };
      });
      setSavedItems(prev => [{
        id: Date.now().toString(), image: capturedImage,
        width: sizeWidth || '미측정', height: sizeHeight || '미측정',
        timestamp: Date.now(), treePath: selectedTreePath || '',
        treeNodeId: selectedTreeNode?.id,
        domainIds: selectedLinkedDomains.map(d => d.id),
        domainData: domainDataSnapshot,
      }, ...prev]);
      setNodeEntityMode('new');
      setEditTargetAnchorId(null);
      setPhase('saved');
      return;
    }

    // 기존 로컬 목록에 저장
    // 도메인 데이터 스냅샷
    const domainDataSnapshot: Record<string, Record<string, string>> = {};
    if (selectedTreeNode && selectedLinkedDomains.length > 0) {
      selectedLinkedDomains.forEach(dom => {
        domainDataSnapshot[dom.id] = { ...(linkedFormData[dom.id] || {}) };
      });
    }
    setSavedItems(prev => [{
      id: Date.now().toString(), image: capturedImage,
      width: sizeWidth || '미측정', height: sizeHeight || '미측정',
      timestamp: Date.now(),
      treePath: selectedTreePath || '',
      treeNodeId: selectedTreeNode?.id,
      domainIds: selectedLinkedDomains.map(d => d.id),
      domainData: domainDataSnapshot,
    }, ...prev]);

    // 연결된 도메인에 데이터 저장 (트리 노드 선택됨 + 연결 도메인 있을 때)
    if (selectedTreeNode && selectedLinkedDomains.length > 0) {
      selectedLinkedDomains.forEach(dom => {
        const domFields = linkedDomainFields.get(dom.id) || [];
        const payload: Record<string, string> = {};

        // 연결 폼 데이터 적용 (메인 필드 및 추가 필드 모두 포함)
        const formData = linkedFormData[dom.id] || {};
        domFields.forEach(f => {
          if (formData[f.name] !== undefined) {
            payload[f.name] = formData[f.name];
          }
          if (f.extraFields && f.extraFields.length > 0) {
            f.extraFields.forEach(ext => {
              const extKey = ext.label?.trim() || ext.id;
              if (formData[extKey] !== undefined) {
                payload[extKey] = formData[extKey];
              }
            });
          }
        });

        // suffix 키 추가 (복수 이미지 업로드: 이미지업로드_0, 요약설명_0 등)
        Object.entries(formData).forEach(([k, v]) => {
          if (/^.+_\d+$/.test(k) && v !== undefined) {
            payload[k] = v;
          }
        });
        // 카메라 또는 이미지 필드 자동 채우기:
        // 폼에서 사용자가 직접 업로드한 이미지가 없을 때, 카메라 속성 노드인 경우에만 카메라 촬영본 자동 채움
        const cameraOrImageField = domFields.find(f => f.inputType === 'camera') 
          || domFields.find(f => f.inputType === 'image' || f.name.includes('이미지') || f.name.includes('사진'));
        if (cameraOrImageField && !payload[cameraOrImageField.name] && cameraOrImageField.fileMode !== 'multiple' && !cameraOrImageField.multiple) {
          if (uploadedImageFromForm) {
            payload[cameraOrImageField.name] = uploadedImageFromForm;
          } else if (hasCameraFieldInSelectedNode && capturedImage) {
            payload[cameraOrImageField.name] = capturedImage;
          }
        }

        // 사이즈 필드 자동 채우기 (최상위 필드 + extraFields 안에도 탐색)
        if (sizeWidth && sizeHeight) {
          const isSizeKey2 = (name: string) => name.includes('사이즈') || name.includes('크기');
          const topSizeField2 = domFields.find(f => isSizeKey2(f.name));
          if (topSizeField2) {
            payload[topSizeField2.name] = `${sizeWidth} × ${sizeHeight} mm`;
          } else {
            for (const f of domFields) {
              if (f.extraFields && f.extraFields.length > 0) {
                const extSize2 = f.extraFields.find(ext => isSizeKey2(ext.label || ''));
                if (extSize2) {
                  const extKey2 = extSize2.label?.trim() || extSize2.id;
                  payload[extKey2] = `${sizeWidth} × ${sizeHeight} mm`;
                  break;
                }
              }
            }
          }
        }

        // 트리 노드 ID 연결
        payload._treeNodeId = selectedTreeNode.id;

        const anchorId = addEntityToDomain(dom.id, payload);

        // ★ 트리 노드 자동 추가 (렌더 사이클과 분리하여 안전하게 처리)
        if (treeBlueprint && selectedTreeNode) {
          try {
            // 대표 레이블: 이름/제목/타이틀/명 포함 필드 우선, 없으면 첫번째 텍스트 값
            const labelField = domFields.find(f =>
              f.name.includes('이름') || f.name.includes('제목') ||
              f.name.includes('타이틀') || f.name.includes('명')
            );
            const labelVal = labelField
              ? payload[labelField.name]
              : Object.values(payload).find(v =>
                  v && !v.startsWith('data:') && !v.startsWith('http') && v !== selectedTreeNode.id
                );

            if (labelVal && labelVal.trim()) {
              const siblLabel = `${selectedTreeNode.label} : ${labelVal.trim()}`;
              const prefix = `auto-${anchorId || Date.now()}-${Math.random().toString(36).slice(2,6)}`;

              // JSON 딥복사로 읽기전용 객체 문제 방지
              const treeSnapshot: TreeNode[] = JSON.parse(JSON.stringify(masterTreeData));
              const nodeSnapshot: TreeNode = JSON.parse(JSON.stringify(selectedTreeNode));

              // 자식 딥복사 (새 ID 부여)
              const deepCopyWithNewId = (nodes: TreeNode[]): TreeNode[] =>
                nodes.map(n => ({
                  ...n,
                  id: `${prefix}-${n.id}`,
                  children: n.children && n.children.length > 0 ? deepCopyWithNewId(n.children) : undefined,
                }));

              const copiedChildren = nodeSnapshot.children && nodeSnapshot.children.length > 0
                ? deepCopyWithNewId(nodeSnapshot.children)
                : undefined;

              const newSiblingNode: TreeNode = {
                id: `${prefix}-sibling`,
                label: siblLabel,
                linkedDomainIds: nodeSnapshot.linkedDomainIds
                  ? nodeSnapshot.linkedDomainIds
                  : nodeSnapshot.linkedDomainId
                    ? [nodeSnapshot.linkedDomainId]
                    : [dom.id],
                children: copiedChildren,
              };

              // 선택 노드 찾아서 바로 뒤에 형제 삽입
              const insertSibling = (nodes: TreeNode[]): { ok: boolean; nodes: TreeNode[] } => {
                const idx = nodes.findIndex(n => n.id === nodeSnapshot.id);
                if (idx !== -1) {
                  if (nodes.some(n => n.label === siblLabel)) return { ok: false, nodes };
                  const next = [...nodes];
                  next.splice(idx + 1, 0, newSiblingNode);
                  return { ok: true, nodes: next };
                }
                let ok = false;
                const mapped = nodes.map(n => {
                  if (!n.children || n.children.length === 0) return n;
                  const res = insertSibling(n.children);
                  if (res.ok) { ok = true; return { ...n, children: res.nodes }; }
                  return n;
                });
                return { ok, nodes: mapped };
              };

              const result = insertSibling(treeSnapshot);
              if (result.ok) {
                // setTimeout으로 현재 렌더 사이클 이후에 상태 업데이트
                const bpId = treeBlueprint.id;
                const newTreeData = result.nodes;
                setTimeout(() => updateBlueprint(bpId, { treeData: newTreeData }), 0);
              }
            }
          } catch (err) {
            console.warn('[AutoScan] 트리 노드 추가 중 오류 (저장은 정상 완료됨):', err);
          }
        }
      });
    }

    setPhase('saved');
  };

  const handleReady = () => {
    setCapturedImage(''); setSizeWidth(''); setSizeHeight('');
    setCaptureZoom(1); setCapturePan({ x: 0, y: 0 });
    // 트리 선택은 유지 (배치 촬영 지원 - 같은 분류 노드 아래 연속 촬영)
    setLinkedFormData(prev => {
      const reset: Record<string, Record<string, string>> = {};
      Object.keys(prev).forEach(k => { reset[k] = {}; });
      return reset;
    });
    setPhase('viewfinder');
  };

  const handleRetake = () => {
    setCapturedImage('');
    setCaptureZoom(1); setCapturePan({ x: 0, y: 0 });
    setPhase('viewfinder');
  };

  // 아이템 상세 보기 (편집 모드로 전환)
  const handleViewItem = (id: string) => {
    const item = savedItems.find(i => i.id === id);
    if (!item) return;
    setSelectedItemId(id);
    setEditingItem(item);
    setEditFormData(item.domainData ? JSON.parse(JSON.stringify(item.domainData)) : {});
    setIsEditTreeOpen(false);
    setCapturedImage(item.image);
    setCaptureZoom(1);
    setCapturePan({ x: 0, y: 0 });
    setPhase('editing');
  };

  // 아이템 수정 저장
  const handleUpdateItem = () => {
    if (!editingItem) return;
    const snapshot = { ...editingItem };
    const formSnapshot = JSON.parse(JSON.stringify(editFormData));

    // UI 상태 먼저 초기화 (크래시 방지)
    setEditingItem(null);
    setSelectedItemId(null);
    setDetailPopup(null);
    setPhase('saved');

    // 데이터 저장은 setTimeout으로 분리
    setTimeout(() => {
      try {
        // savedItems 업데이트
        setSavedItems(prev => prev.map(item =>
          item.id === snapshot.id
            ? { ...item, domainData: formSnapshot, treePath: snapshot.treePath, treeNodeId: snapshot.treeNodeId, domainIds: snapshot.domainIds }
            : item
        ));
        // 도메인 엔티티 업데이트
        if (snapshot.treeNodeId && snapshot.domainIds && snapshot.domainIds.length > 0) {
          snapshot.domainIds.forEach(domId => {
            const domFields = getFieldsForDomain(domId).filter(f => !f.name.startsWith('_'));
            const payload: Record<string, string> = {};
            const formData = formSnapshot[domId] || {};
            domFields.forEach(f => {
              if (formData[f.name]) payload[f.name] = formData[f.name];
              if (f.extraFields && f.extraFields.length > 0) {
                f.extraFields.forEach(ext => {
                  const extKey = ext.label?.trim() || ext.id;
                  if (formData[extKey] !== undefined) payload[extKey] = formData[extKey];
                });
              }
            });
            // suffix 키 추가 (복수 이미지 업로드: 이미지업로드_0, 요약설명_0 등)
            Object.entries(formData).forEach(([k, v]) => {
              if (/^.+_\d+$/.test(k) && v !== undefined) {
                payload[k] = v == null ? '' : typeof v === 'string' ? v : String(v);
              }
            });
            const cameraOrImageField = domFields.find(f => f.inputType === 'camera')
              || domFields.find(f => f.inputType === 'image' || f.name.includes('이미지') || f.name.includes('사진'));
            if (cameraOrImageField && !payload[cameraOrImageField.name] && snapshot.image) {
              payload[cameraOrImageField.name] = snapshot.image;
            }
            payload._treeNodeId = snapshot.treeNodeId || '';
            addEntityToDomain(domId, payload);
          });
        }
      } catch (err) {
        console.error('[AutoScan] 수정 저장 중 오류:', err);
      }
    }, 0);
  };

  // 아이템 삭제
  const handleDeleteItem = () => {
    const targetItem = editingItem || savedItems.find(i => i.id === selectedItemId);
    if (!targetItem) return;
    if (!confirm('이 항목을 삭제하시겠습니까?')) return;
    const targetId = targetItem.id;
    // UI 상태 먼저 초기화
    setEditingItem(null);
    setDetailPopup(null);
    setSelectedItemId(null);
    setPhase('saved');
    // 데이터 삭제는 setTimeout으로 분리
    setTimeout(() => {
      setSavedItems(prev => prev.filter(item => item.id !== targetId));
    }, 0);
  };

  // 상세보기에서 닫기
  const handleCloseDetail = () => {
    setDetailPopup(null);
    setSelectedItemId(null);
    setEditingItem(null);
    if (phase === 'editing') {
      setPhase('saved');
    }
  };

  const renderBottombar = () => {
    const activeDate = selectedDate || (sortedDates.length > 0 ? sortedDates[0] : null);
    const activeItems = activeDate ? (dateGroups[activeDate] || []) : [];
    const shortDate = (d: string) => d.slice(2);

    // 캘린더 생성
    const buildCalendar = () => {
      const year = calendarMonth.getFullYear();
      const month = calendarMonth.getMonth();
      const firstDay = new Date(year, month, 1).getDay();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const weeks: (number | null)[][] = [];
      let week: (number | null)[] = Array(firstDay).fill(null);
      for (let d = 1; d <= daysInMonth; d++) {
        week.push(d);
        if (week.length === 7) { weeks.push(week); week = []; }
      }
      if (week.length > 0) { while (week.length < 7) week.push(null); weeks.push(week); }
      return weeks;
    };

    const hasData = (day: number) => {
      const y = calendarMonth.getFullYear();
      const m = calendarMonth.getMonth();
      const dateStr = `${y}.${String(m+1).padStart(2,'0')}.${String(day).padStart(2,'0')}`;
      return !!dateGroups[dateStr];
    };

    const selectDay = (day: number) => {
      const y = calendarMonth.getFullYear();
      const m = calendarMonth.getMonth();
      const dateStr = `${y}.${String(m+1).padStart(2,'0')}.${String(day).padStart(2,'0')}`;
      setSelectedDate(dateStr);
      setShowDatePicker(false);
    };

    const monthLabel = `${calendarMonth.getFullYear()}.${String(calendarMonth.getMonth()+1).padStart(2,'0')}`;

    return (
      <div className="autoscan-bottombar" style={{ position: 'relative' }}>
        {savedItems.length > 0 && (
          <>
            <div className="bottombar-date-nav" onClick={() => setShowDatePicker(!showDatePicker)}>
              <span className="bottombar-date-label">{activeDate ? shortDate(activeDate) : '--'}</span>
              <span className="bottombar-date-arrow" style={{ fontSize: '0.6rem' }}>▼</span>
            </div>
            <div className="bottombar-items">
              {activeItems.map((item, i) => (
                <span key={item.id}
                  className={`bottombar-item-tag clickable ${selectedItemId === item.id ? 'active' : ''}`}
                  title={`${item.width}×${item.height}mm`}
                  onClick={() => handleViewItem(item.id)}>
                  [{String(i + 1).padStart(3, '0')}]
                </span>
              ))}
            </div>
          </>
        )}
        {showDatePicker && (
          <div className="cal-popup">
            <div className="cal-header">
              <button className="cal-nav" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth()-1, 1))}>‹</button>
              <span className="cal-month-label">{monthLabel}</span>
              <button className="cal-nav" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth()+1, 1))}>›</button>
            </div>
            <div className="cal-weekdays">
              {['일','월','화','수','목','금','토'].map(d => <span key={d}>{d}</span>)}
            </div>
            <div className="cal-grid">
              {buildCalendar().map((week, wi) => (
                <div key={wi} className="cal-week">
                  {week.map((day, di) => (
                    <span key={di}
                      className={`cal-day ${!day ? 'empty' : ''} ${day && hasData(day) ? 'has-data' : ''} ${day && activeDate === `${calendarMonth.getFullYear()}.${String(calendarMonth.getMonth()+1).padStart(2,'0')}.${String(day).padStart(2,'0')}` ? 'active' : ''}`}
                      onClick={() => day && selectDay(day)}>
                      {day || ''}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const getSizeLabel = () => {
    const w = parseFloat(sizeWidth), h = parseFloat(sizeHeight);
    if (!w || !h) return '';
    const standards: Record<string, [number, number]> = {
      'A0': [841, 1189], 'A1': [594, 841], 'A2': [420, 594],
      'A3': [297, 420], 'A4': [210, 297], 'A5': [148, 210],
      'A6': [105, 148], 'B4': [250, 353], 'B5': [176, 250],
      '명함': [90, 50], '신용카드': [85.6, 53.98]
    };
    for (const [name, [sw, sh]] of Object.entries(standards)) {
      if ((Math.abs(w - sw) < 10 && Math.abs(h - sh) < 10) ||
          (Math.abs(w - sh) < 10 && Math.abs(h - sw) < 10)) return name + ' 규격';
    }
    return `${w} × ${h} mm`;
  };

  return (
    <div
      className="autoscan-page"
      style={bgMode === 'color'
        ? { backgroundImage: 'none', backgroundColor: bgColor }
        : bgImage
          ? { backgroundImage: `url(${bgImage})`, backgroundSize: 'cover', backgroundPosition: 'center' }
          : undefined
      }
    >
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* ====== 상단 바 (모든 버튼 통합) ====== */}
      <div className="autoscan-topbar">
        <div className="autoscan-topbar-left">
          <button className="autoscan-back-btn" onClick={onBack}>
            <ArrowLeft size={18} />
          </button>
          <span className="autoscan-title">Archive</span>
          {/* ── 소장자관리 뱃지 ── */}
          {onOpenOwners && (
            <button
              className="as-owner-badge"
              onClick={onOpenOwners}
              title="소장자 관리"
            >
              소장자관리
            </button>
          )}
          {cvLoading && (
            <span className="autoscan-cv-status loading">
              <Loader size={12} className="spin" /> 비전 로딩...
            </span>
          )}
          {/* ── 감지설정 스위치 ── */}
          {cvReady && showBtnDetect && (
            <label className="as-sw-pill" title={detectionEnabled ? '감지 끄기' : '감지 켜기'}>
              <input type="checkbox" checked={detectionEnabled} onChange={() => setDetectionEnabled(!detectionEnabled)} />
              <span className="as-sw-track">
                <span className="as-sw-knob" />
              </span>
              <span className="as-sw-label">
                {detectionEnabled ? <Eye size={12} /> : <EyeOff size={12} />}
                감지설정
              </span>
            </label>
          )}
          {/* ── 자동/수동 스위치 ── */}
          {phase === 'viewfinder' && showBtnAuto && (
            <label className="as-sw-pill" title={scanMode === 'auto' ? '수동으로 전환' : '자동으로 전환'}>
              <input type="checkbox" checked={scanMode === 'auto'} onChange={() => {
                const next = scanMode === 'auto' ? 'manual' : 'auto';
                setScanMode(next);
                if (next === 'manual') computeManualSize();
              }} />
              <span className="as-sw-track">
                <span className="as-sw-knob" />
              </span>
              <span className="as-sw-label">
                {scanMode === 'auto' ? <Maximize2 size={12} /> : <Move size={12} />}
                자동
              </span>
            </label>
          )}
          {/* ── 사이즈 스위치 ── */}
          {showBtnSize && (
          <label className="as-sw-pill" title={showSizeTag ? '사이즈 숨기기' : '사이즈 보기'}>
            <input type="checkbox" checked={showSizeTag} onChange={() => setShowSizeTag(!showSizeTag)} />
            <span className="as-sw-track">
              <span className="as-sw-knob" />
            </span>
            <span className="as-sw-label">
              <Tag size={12} />
              사이즈
            </span>
          </label>
          )}
          {/* ── 기준설정 버튼 (토글 X, 클릭 액션) ── */}
          {phase === 'viewfinder' && cvReady && showBtnCalib && (
            <button
              className={`as-sw-action-btn ${calibrated ? 'calibrated' : hasDetectedObject ? 'calib-needed' : ''}`}
              onClick={handleOpenCalibPanel}
              title={calibrated ? '기준 크기 재설정' : '기준 크기 설정'}
            >
              <Ruler size={12} />
              {calibrated ? '기준✓' : '기준설정'}
            </button>
          )}
          {/* ── 여백 스위치 ── */}
          {phase === 'viewfinder' && showBtnMargin && (
            <label className="as-sw-pill" title={`여백 클릭 시 순환 (현재 ${captureMarginPx}px)`}>
              <input type="checkbox" checked={captureMarginPx > 0} onChange={() => {
                const steps = [0, 10, 20, 30, 50];
                const nextIdx = (steps.indexOf(captureMarginPx) + 1) % steps.length;
                setCaptureMarginPx(steps[nextIdx !== -1 ? nextIdx : 1]);
              }} />
              <span className="as-sw-track">
                <span className="as-sw-knob" />
              </span>
              <span className="as-sw-label">
                여백{captureMarginPx > 0 ? ` ${captureMarginPx}px` : ''}
              </span>
            </label>
          )}
          {/* ── 크로마키 스위치 + 색상 선택 ── */}
          {showBtnChroma && (
          <label className="as-sw-pill" title={chromaKey ? '크로마키 끄기' : '크로마키 켜기'}>
            <input type="checkbox" checked={chromaKey} onChange={() => setChromaKey(!chromaKey)} />
            <span className="as-sw-track">
              <span className="as-sw-knob" />
            </span>
            <span className="as-sw-label">
              <Scissors size={12} />
              크로마키
            </span>
          </label>
          )}
          {showBtnChroma && chromaKey && (
            <div className="chromakey-color-dots">
              {(['blue', 'green', 'black', 'white', 'red'] as ChromaColor[]).map(color => (
                <button
                  key={color}
                  className={`chromakey-dot ${chromaKeyColor === color ? 'active' : ''}`}
                  style={{ background: chromaHsvRanges[color].css }}
                  onClick={() => { setChromaKeyColor(color); setEyedropMode(false); }}
                  title={chromaHsvRanges[color].label}
                />
              ))}
              <button
                className={`chromakey-eyedrop-btn ${eyedropMode ? 'active' : ''} ${chromaKeyColor === 'custom' ? 'has-custom' : ''}`}
                onClick={() => setEyedropMode(prev => !prev)}
                title={eyedropMode ? '스포이드 취소' : '스포이드: 뷰파인더에서 색상 선택'}
              >
                {chromaKeyColor === 'custom' && !eyedropMode
                  ? <span className="chromakey-custom-dot" style={{ background: chromaCustomCss }} />
                  : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m2 22 1-1h3l9-9"/><path d="M3 21v-3l9-9"/><path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4z"/></svg>
                }
              </button>
            </div>
          )}
        </div>
        <div className="autoscan-topbar-right">
          {/* 추가/수정 상태 토글 버튼 (뷰파인더/캡처 phase에서 표시) */}
          {(phase === 'viewfinder' || phase === 'captured') && (
            <div className="topbar-mode-group">
              <button
                className={'topbar-mode-btn' + (nodeEntityMode !== 'edit' ? ' active add' : '')}
                onClick={() => {
                  setNodeEntityMode('add');
                  setEditTargetAnchorId(null);
                  setShowEntitySelectPopup(false);
                  setLinkedFormData(prev => { const r: Record<string, Record<string, string>> = {}; Object.keys(prev).forEach(k => r[k] = {}); return r; });
                }}
                title="새 자료 추가 모드"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
                추가
              </button>
              <button
                className={'topbar-mode-btn' + (nodeEntityMode === 'edit' ? ' active edit' : '')}
                onClick={() => {
                  setNodeEntityMode('edit');
                  if (nodeExistingEntities.length > 1) setShowEntitySelectPopup(prev => !prev);
                }}
                title={nodeExistingEntities.length > 0 ? `기존 자료 ${nodeExistingEntities.length}건 수정` : '수정 모드로 전환'}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                수정{nodeExistingEntities.length > 0 ? ` ${nodeExistingEntities.length}` : ''}
              </button>
            </div>
          )}

          {/* 뷰파인더: 기준설정 + 촬영 + 설정 */}
          {phase === 'viewfinder' && (
            <>
              <button
                className="autoscan-topbar-btn capture"
                onClick={handleCapture}
                disabled={!cameraReady}
                title="촬영 (Space 또는 Enter)"
              >
                <Camera size={16} />
                <span>촬영</span>
              </button>
            </>
          )}

          {/* 캡처 완료: 재촬영 + 저장 */}
          {phase === 'captured' && (
            <>
              <button className="autoscan-topbar-btn" onClick={handleRetake}>
                <RotateCcw size={16} /><span>재촬영</span>
              </button>
              <button
                className={`autoscan-topbar-btn save${!selectedOwner ? ' disabled' : ''}`}
                onClick={handleSave}
                disabled={!selectedOwner}
                title={!selectedOwner ? '소장자를 먼저 선택해주세요' : '저장'}
              >
                <Save size={16} /><span>저장</span>
              </button>
            </>
          )}

          {/* 저장 완료: 준비 */}
          {phase === 'saved' && (
            <button className="autoscan-topbar-btn ready" onClick={handleReady}>
              <Camera size={16} /><span>준비</span>
            </button>
          )}

          {/* 편집 phase: 닫기 + 수정저장 + 삭제 */}
          {(phase as string) === 'editing' && (
            <>
              <button className="autoscan-topbar-btn" onClick={handleCloseDetail}>
                <ArrowLeft size={16} /><span>닫기</span>
              </button>
              <button className="autoscan-topbar-btn save" onClick={handleUpdateItem}>
                <Save size={16} /><span>수정저장</span>
              </button>
              <button className="autoscan-topbar-btn delete" onClick={handleDeleteItem}>
                <Trash2 size={16} /><span>삭제</span>
              </button>
            </>
          )}



          {/* 패널 좌우 위치 전환 버튼 */}
          <button
            type="button"
            className="autoscan-topbar-btn"
            onClick={togglePanelPosition}
            title={panelPosition === 'right' ? '패널 좌측으로 이동' : '패널 우측으로 이동'}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
          >
            {panelPosition === 'right' ? <PanelLeft size={16} /> : <PanelRight size={16} />}
            <span style={{ fontSize: '0.74rem' }}>{panelPosition === 'right' ? '패널 좌측' : '패널 우측'}</span>
          </button>

          {/* 설정 버튼 (⚙) */}
          <div className="autoscan-settings-wrapper">
            <button
              className={`autoscan-topbar-btn settings ${showSettings ? 'active' : ''}`}
              onClick={() => setShowSettings(!showSettings)}
              title="설정"
            >
              <Settings size={16} />
            </button>
            {showSettings && (
              <div className="autoscan-settings-dropdown">
                {/* ── 1. 툴바 항목 표시 ── */}
                <button
                  type="button"
                  className="settings-accordion-header"
                  onClick={() => toggleSettingSection('toolbar')}
                >
                  <span>툴바 항목 표시</span>
                  {openSettingSection === 'toolbar' ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>
                {openSettingSection === 'toolbar' && (
                  <div className="settings-accordion-body">
                    <div className="settings-visibility-row">
                      <span>감지설정</span>
                      <label className="as-sw-pill-mini">
                        <input type="checkbox" checked={showBtnDetect} onChange={() => setShowBtnDetect(v => !v)} />
                        <span className="as-sw-track"><span className="as-sw-knob" /></span>
                      </label>
                    </div>
                    <div className="settings-visibility-row">
                      <span>자동/수동</span>
                      <label className="as-sw-pill-mini">
                        <input type="checkbox" checked={showBtnAuto} onChange={() => setShowBtnAuto(v => !v)} />
                        <span className="as-sw-track"><span className="as-sw-knob" /></span>
                      </label>
                    </div>
                    <div className="settings-visibility-row">
                      <span>사이즈</span>
                      <label className="as-sw-pill-mini">
                        <input type="checkbox" checked={showBtnSize} onChange={() => setShowBtnSize(v => !v)} />
                        <span className="as-sw-track"><span className="as-sw-knob" /></span>
                      </label>
                    </div>
                    <div className="settings-visibility-row">
                      <span>기준설정</span>
                      <label className="as-sw-pill-mini">
                        <input type="checkbox" checked={showBtnCalib} onChange={() => setShowBtnCalib(v => !v)} />
                        <span className="as-sw-track"><span className="as-sw-knob" /></span>
                      </label>
                    </div>
                    <div className="settings-visibility-row">
                      <span>여백</span>
                      <label className="as-sw-pill-mini">
                        <input type="checkbox" checked={showBtnMargin} onChange={() => setShowBtnMargin(v => !v)} />
                        <span className="as-sw-track"><span className="as-sw-knob" /></span>
                      </label>
                    </div>
                    <div className="settings-visibility-row">
                      <span>크로마키</span>
                      <label className="as-sw-pill-mini">
                        <input type="checkbox" checked={showBtnChroma} onChange={() => setShowBtnChroma(v => !v)} />
                        <span className="as-sw-track"><span className="as-sw-knob" /></span>
                      </label>
                    </div>
                  </div>
                )}

                <div className="settings-divider" />

                {/* ── 2. 감지 비율 조정 ── */}
                <button
                  type="button"
                  className="settings-accordion-header"
                  onClick={() => toggleSettingSection('detect')}
                >
                  <span>감지 비율 조정</span>
                  {openSettingSection === 'detect' ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>
                {openSettingSection === 'detect' && (
                  <div className="settings-accordion-body">
                    <div className="settings-grid-opacity">
                      <div className="settings-grid-label">
                        <span>최소 크기</span>
                        <span className="settings-grid-value">{detectMinRatio}%</span>
                      </div>
                      <input
                        type="range" min="1" max="50" step="1"
                        value={detectMinRatio}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setDetectMinRatio(v);
                          if (v >= detectMaxRatio) setDetectMaxRatio(Math.min(99, v + 5));
                        }}
                        className="settings-grid-slider"
                      />
                    </div>
                    <div className="settings-grid-opacity">
                      <div className="settings-grid-label">
                        <span>최대 크기</span>
                        <span className="settings-grid-value">{detectMaxRatio}%</span>
                      </div>
                      <input
                        type="range" min="10" max="99" step="1"
                        value={detectMaxRatio}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setDetectMaxRatio(v);
                          if (v <= detectMinRatio) setDetectMinRatio(Math.max(1, v - 5));
                        }}
                        className="settings-grid-slider"
                      />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '2px 2px 4px' }}>
                      <button
                        style={{ background: 'transparent', border: 'none', color: '#60a5fa', fontSize: '0.68rem', cursor: 'pointer', padding: '2px 4px' }}
                        onClick={() => { setDetectMinRatio(3); setDetectMaxRatio(95); }}
                      >기본값 복원</button>
                    </div>
                  </div>
                )}

                <div className="settings-divider" />

                {/* ── 3. 패널 위치 ── */}
                <button
                  type="button"
                  className="settings-accordion-header"
                  onClick={() => toggleSettingSection('panel')}
                >
                  <span>패널 위치</span>
                  {openSettingSection === 'panel' ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>
                {openSettingSection === 'panel' && (
                  <div className="settings-accordion-body">
                    <div style={{ display: 'flex', gap: '6px', padding: '4px 0 4px' }}>
                      <button
                        type="button"
                        onClick={() => { setPanelPosition('left'); localStorage.setItem('as_panelPosition', 'left'); }}
                        style={{
                          flex: 1, padding: '5px 8px', borderRadius: '6px',
                          border: panelPosition === 'left' ? '1.5px solid #4f46e5' : '1px solid #e2e8f0',
                          background: panelPosition === 'left' ? '#e0e7ff' : '#f8fafc',
                          color: panelPosition === 'left' ? '#3730a3' : '#64748b',
                          fontWeight: panelPosition === 'left' ? 700 : 500,
                          fontSize: '0.74rem', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                        }}
                      >
                        <PanelLeft size={13} /><span>좌측 패널</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => { setPanelPosition('right'); localStorage.setItem('as_panelPosition', 'right'); }}
                        style={{
                          flex: 1, padding: '5px 8px', borderRadius: '6px',
                          border: panelPosition === 'right' ? '1.5px solid #4f46e5' : '1px solid #e2e8f0',
                          background: panelPosition === 'right' ? '#e0e7ff' : '#f8fafc',
                          color: panelPosition === 'right' ? '#3730a3' : '#64748b',
                          fontWeight: panelPosition === 'right' ? 700 : 500,
                          fontSize: '0.74rem', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                        }}
                      >
                        <PanelRight size={13} /><span>우측 패널</span>
                      </button>
                    </div>
                  </div>
                )}

                <div className="settings-divider" />

                {/* ── 4. 패널 투명도 ── */}
                <button
                  type="button"
                  className="settings-accordion-header"
                  onClick={() => toggleSettingSection('opacity')}
                >
                  <span>패널 투명도</span>
                  {openSettingSection === 'opacity' ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>
                {openSettingSection === 'opacity' && (
                  <div className="settings-accordion-body">
                    <div className="settings-grid-opacity">
                      <div className="settings-grid-label">
                        <span>투명도</span>
                        <span className="settings-grid-value">{Math.round(rightPanelOpacity * 100)}%</span>
                      </div>
                      <input
                        type="range" min="10" max="100" step="5"
                        value={Math.round(rightPanelOpacity * 100)}
                        onChange={e => {
                          const v = Number(e.target.value) / 100;
                          setRightPanelOpacity(v);
                          localStorage.setItem('as_rightPanelOpacity', String(v));
                        }}
                        className="settings-grid-slider"
                      />
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 2px 0', fontSize: '0.68rem', color: '#94a3b8' }}>
                        <span>투명</span><span>불투명</span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="settings-divider" />

                {/* ── 5. 연결된 카메라 ── */}
                <button
                  type="button"
                  className="settings-accordion-header"
                  onClick={() => toggleSettingSection('camera')}
                >
                  <span>연결된 카메라</span>
                  {openSettingSection === 'camera' ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>
                {openSettingSection === 'camera' && (
                  <div className="settings-accordion-body">
                    {cameras.length === 0 && <div className="settings-empty">카메라를 찾을 수 없습니다</div>}
                    <button className={`settings-camera-item ${selectedCameraId === 'none' ? 'active' : ''}`} onClick={() => { handleCameraChange('none'); setShowSettings(false); }}>
                      <span className="settings-camera-dot" style={{ opacity: 0.3 }} /><span>선택안됨</span>
                      {selectedCameraId === 'none' && <Check size={14} />}
                    </button>
                    {cameras.map((cam, i) => (
                      <button key={cam.deviceId} className={`settings-camera-item ${selectedCameraId === cam.deviceId ? 'active' : ''}`}
                        onClick={() => { handleCameraChange(cam.deviceId); setShowSettings(false); }}>
                        <span className="settings-camera-dot" /><span>{cam.label || `카메라 ${i + 1}`}</span>
                        {selectedCameraId === cam.deviceId && <Check size={14} />}
                      </button>
                    ))}
                  </div>
                )}

                <div className="settings-divider" />

                {/* ── 6. 배경 설정 ── */}
                <button
                  type="button"
                  className="settings-accordion-header"
                  onClick={() => toggleSettingSection('bg')}
                >
                  <span>배경 설정</span>
                  {openSettingSection === 'bg' ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>
                {openSettingSection === 'bg' && (
                  <div className="settings-accordion-body">
                    {/* 배경 모드 전환 탭 */}
                    <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
                      <button
                        type="button"
                        onClick={() => { setBgMode('image'); localStorage.setItem('as_bgMode', 'image'); }}
                        style={{
                          flex: 1, padding: '5px 0', borderRadius: '6px', fontSize: '0.74rem', fontWeight: 600, cursor: 'pointer',
                          border: bgMode === 'image' ? '1.5px solid #4f46e5' : '1px solid #e2e8f0',
                          background: bgMode === 'image' ? '#e0e7ff' : '#f8fafc',
                          color: bgMode === 'image' ? '#3730a3' : '#64748b',
                        }}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                          <Image size={12} /><span>이미지</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => { setBgMode('color'); localStorage.setItem('as_bgMode', 'color'); }}
                        style={{
                          flex: 1, padding: '5px 0', borderRadius: '6px', fontSize: '0.74rem', fontWeight: 600, cursor: 'pointer',
                          border: bgMode === 'color' ? '1.5px solid #4f46e5' : '1px solid #e2e8f0',
                          background: bgMode === 'color' ? '#e0e7ff' : '#f8fafc',
                          color: bgMode === 'color' ? '#3730a3' : '#64748b',
                        }}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                          <Palette size={12} /><span>단색</span>
                        </span>
                      </button>
                    </div>

                    {/* 배경 이미지 모드 */}
                    {bgMode === 'image' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <input
                          ref={bgFileInputRef}
                          type="file"
                          accept="image/*"
                          style={{ display: 'none' }}
                          onChange={e => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const reader = new FileReader();
                            reader.onload = ev => {
                              const dataUrl = ev.target?.result as string;
                              setBgImage(dataUrl);
                              localStorage.setItem('as_bgImage', dataUrl);
                              localStorage.setItem('as_bgMode', 'image');
                              setBgMode('image');
                            };
                            reader.readAsDataURL(file);
                            e.target.value = '';
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => bgFileInputRef.current?.click()}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
                            padding: '6px 10px', borderRadius: '7px', border: '1px dashed #a5b4fc',
                            background: '#eff0ff', color: '#4f46e5', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer'
                          }}
                        >
                          <Upload size={13} /> 배경 이미지 업로드
                        </button>
                        {bgImage && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <img
                              src={bgImage}
                              alt="bg preview"
                              style={{ width: '48px', height: '32px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #e2e8f0', flexShrink: 0 }}
                            />
                            <span style={{ fontSize: '0.7rem', color: '#64748b', flex: 1 }}>현재 배경 이미지</span>
                            <button
                              type="button"
                              onClick={() => { setBgImage(''); localStorage.removeItem('as_bgImage'); }}
                              style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '2px', fontSize: '0.8rem' }}
                              title="기본 배경으로 초기화"
                            >✕</button>
                          </div>
                        )}
                        {!bgImage && (
                          <div style={{ fontSize: '0.7rem', color: '#94a3b8', textAlign: 'center', padding: '4px 0' }}>
                            기본 배경 이미지 사용 중
                          </div>
                        )}
                      </div>
                    )}

                    {/* 배경 단색 모드 */}
                    {bgMode === 'color' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <input
                            type="color"
                            value={bgColor}
                            onChange={e => { setBgColor(e.target.value); localStorage.setItem('as_bgColor', e.target.value); }}
                            style={{ width: '36px', height: '30px', border: 'none', borderRadius: '5px', cursor: 'pointer', padding: 0, background: 'none', flexShrink: 0 }}
                          />
                          <span style={{ fontSize: '0.78rem', color: '#334155', fontFamily: 'monospace', fontWeight: 600, flex: 1 }}>{bgColor}</span>
                          {/* + 버튼: 팔레트에 추가, 초과 시 첫 번째 자동 제거 */}
                          <button
                            type="button"
                            title="현재 색상을 팔레트에 추가"
                            onClick={() => addBgColor(bgColor)}
                            style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              width: '26px', height: '26px', borderRadius: '5px',
                              border: '1.5px dashed #a5b4fc', background: '#eff0ff',
                              color: '#4f46e5', cursor: 'pointer', fontSize: '15px', fontWeight: 700,
                              flexShrink: 0, lineHeight: 1,
                            }}
                          >+</button>
                        </div>
                        {/* 통합 팔레트: 항상 한 줄(MAX 8개) */}
                        <div style={{ display: 'flex', gap: '5px', flexWrap: 'nowrap', overflow: 'hidden', alignItems: 'center' }}>
                          {bgColorList.map((c, i) => (
                            <button
                              key={`${c}-${i}`}
                              type="button"
                              title={c}
                              onClick={() => { setBgColor(c); localStorage.setItem('as_bgColor', c); }}
                              style={{
                                width: '24px', height: '24px', minWidth: '24px', borderRadius: '5px',
                                cursor: 'pointer', padding: 0, border: 'none',
                                background: c,
                                outline: bgColor === c ? '2px solid #4f46e5' : '1.5px solid rgba(0,0,0,0.15)',
                                outlineOffset: '1px', flexShrink: 0,
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 설정 드롭다운 바깥 클릭 닫기 */}
      {showSettings && <div className="autoscan-settings-backdrop" onClick={() => setShowSettings(false)} />}

      {/* ====== 뷰파인더 + 캡처 완료 공통 레이아웃 ====== */}
      {(phase === 'viewfinder' || phase === 'captured') && (
        <>
        <div className={`autoscan-capture-layout has-panel ${panelPosition === "left" ? "panel-left" : ""}`}>
          {!uploadedImageFromForm && phase === 'viewfinder' ? (
          <div
            className={`autoscan-viewfinder${eyedropMode ? ' eyedrop-mode' : ''}`}
            ref={viewfinderRef}
            onClick={eyedropMode ? handleEyedropPick : undefined}
          >
          {cameraError ? (
            <div className="autoscan-no-camera">
              <Camera size={48} />
              <p>{cameraError}</p>
              <button className="autoscan-btn autoscan-btn-retake" onClick={() => {
                setSelectedCameraId('');
                localStorage.removeItem('as_cameraId');
                startCamera();
              }}>
                <RotateCcw size={16} /><span>재시도</span>
              </button>
            </div>
          ) : (
            <>
              {!cameraReady && (
                <div className="bamboo-placeholder">
                  <span className="bamboo-stamp">향토사 아카이브 연구회 054-774-0202</span>
                </div>
              )}
              <video ref={videoRef} autoPlay playsInline muted className="autoscan-video" style={{ display: cameraReady ? 'block' : 'none' }} />
              <canvas ref={overlayRef} className={`autoscan-overlay-canvas${!cameraReady ? ' bamboo-fade' : ''}${scanMode === 'manual' ? '' : ''}`} style={{ pointerEvents: scanMode === 'manual' ? 'none' : 'none' }} />

              {/* 수동 모드 드래그 핸들 */}
              {cameraReady && scanMode === 'manual' && manualCorners.map((corner, i) => {
                const pos = getCornerScreenPos(corner);
                return (
                  <div
                    key={i}
                    className={`manual-corner-handle ${draggingCorner === i ? 'dragging' : ''}`}
                    style={{ left: pos.left, top: pos.top }}
                    onMouseDown={(e) => handleCornerPointerDown(i, e)}
                    onTouchStart={(e) => handleCornerPointerDown(i, e)}
                  >
                    <span className="manual-corner-number">{i + 1}</span>
                  </div>
                );
              })}

              {/* 기준 크기 미설정 시 간이 가이드 */}
              {cameraReady && !calibrated && scanMode === 'auto' && (
                <div className="autoscan-guides">
                  <div className="guide-corner tl" /><div className="guide-corner tr" />
                  <div className="guide-corner bl" /><div className="guide-corner br" />
                </div>
              )}

              {/* 캘리브레이션 패널 오버레이 */}
              {showCalibPanel && (
                <div className="autoscan-calib-overlay" onClick={() => setShowCalibPanel(false)}>
                  <div className="autoscan-calib-panel" onClick={(e) => e.stopPropagation()}>
                    <div className="calib-panel-title">📐 기준 크기 설정</div>
                    {calibDetectedPx ? (
                      <>
                        <div className="calib-panel-hint">
                          감지된 물체의 실제 크기를 입력하세요.<br />
                          <span className="calib-detected-px">감지 픽셀: {calibDetectedPx.w} × {calibDetectedPx.h} px (가로 × 세로)</span>
                        </div>
                        <div className="calib-input-row">
                          <label>가로</label>
                          <input
                            type="number"
                            className="calib-input"
                            placeholder="예: 90"
                            value={calibInputW}
                            onChange={(e) => setCalibInputW(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); handleApplyCalib(); } }}
                            autoFocus
                          />
                          <span>mm</span>
                        </div>
                        <div className="calib-input-row">
                          <label>세로</label>
                          <input
                            type="number"
                            className="calib-input"
                            placeholder="예: 54"
                            value={calibInputH}
                            onChange={(e) => setCalibInputH(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); handleApplyCalib(); } }}
                          />
                          <span>mm</span>
                        </div>
                        <div className="calib-panel-presets">
                          {[
                            { label: '신용카드', w: 86, h: 54 },
                            { label: '명함', w: 90, h: 54 },
                            { label: 'A4', w: 210, h: 297 },
                            { label: 'A5', w: 148, h: 210 },
                            { label: 'B5', w: 176, h: 250 },
                          ].map(p => (
                            <button key={p.label} className="calib-preset-btn"
                              onClick={() => { setCalibInputW(String(p.w)); setCalibInputH(String(p.h)); }}>
                              {p.label}<small>{p.w}×{p.h}</small>
                            </button>
                          ))}
                        </div>
                        <div className="calib-panel-actions">
                          <button className="calib-btn-cancel" onClick={() => setShowCalibPanel(false)}>취소</button>
                          <button className="calib-btn-apply"
                            onClick={handleApplyCalib}
                            disabled={(!calibInputW || parseFloat(calibInputW) <= 0) && (!calibInputH || parseFloat(calibInputH) <= 0)}>
                            적용
                          </button>
                        </div>
                        {calibrated && (
                          <button className="settings-reset-btn" style={{ marginTop: 6, width: '100%' }}
                            onClick={() => { setPixelPerMm(null); setCalibrated(false); setShowCalibPanel(false); setSizeWidth(''); setSizeHeight(''); }}>
                            기준 초기화
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="calib-panel-hint">
                          카메라 앞에 기준이 될 물체를 놓으면<br />
                          자동 감지 후 크기 입력이 활성화됩니다.
                        </div>
                        <div className="calib-panel-actions">
                          <button className="calib-btn-cancel" onClick={() => setShowCalibPanel(false)}>닫기</button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* 사이즈 태그 표시 */}
              {cameraReady && showSizeTag && sizeWidth && sizeHeight && !showCalibPanel && (
                <div className="autoscan-size-overlay">
                  <div className={`autoscan-size-tag ${calibrated ? 'calibrated' : 'uncalibrated'}`}>
                    <div className="autoscan-size-values">
                      <span>{sizeWidth}</span><span className="size-x">×</span><span>{sizeHeight}</span>
                      <span className="size-input-label" style={{ color: calibrated ? '#666' : '#aaa' }}>{calibrated ? 'mm' : 'px'}</span>
                    </div>
                    {calibrated && getSizeLabel() && <div className="size-label">{getSizeLabel()}</div>}
                    {!calibrated && (
                      <div className="size-label calib-hint-tag" onClick={handleOpenCalibPanel}>
                        📐 기준 설정하기
                      </div>
                    )}
                  </div>
                </div>
              )}



              {showFlash && <div className="autoscan-flash" />}
            </>
          )}
          </div>
          ) : (
          /* 우측이 올 공간 — captured 좌측 */
          <div
            className="autoscan-capture-left"
            onWheel={handleCaptureWheel}
            onPointerDown={handleCapturePointerDown}
            onPointerMove={handleCapturePointerMove}
            onPointerUp={handleCapturePointerUp}
            onPointerCancel={handleCapturePointerUp}
            onDoubleClick={handleCaptureReset}
            style={{
              cursor: isCapturePanning ? 'grabbing' : 'grab',
              userSelect: 'none',
              touchAction: 'none',
            }}
          >
            <div
              className="autoscan-capture-viewport"
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transform: `translate(${capturePan.x}px, ${capturePan.y}px) scale(${captureZoom})`,
                transformOrigin: 'center center',
                transition: isCapturePanning ? 'none' : 'transform 0.1s ease-out',
              }}
            >
              {isValidImageUrl(centralDisplayImage) ? (
                <img
                  src={centralDisplayImage}
                  alt="중앙 표시 이미지"
                  className="autoscan-capture-image"
                  draggable={false}
                  onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
                />
              ) : (
                <div className="autoscan-empty-viewport-notice" style={{ textAlign: 'center', color: '#94a3b8', padding: '40px 20px', userSelect: 'none' }}>
                  <Upload size={44} style={{ color: '#818cf8', marginBottom: '14px', opacity: 0.85 }} />
                  <div style={{ fontSize: '16px', fontWeight: 600, color: '#f1f5f9', marginBottom: '8px' }}>
                    카메라 속성이 없는 노드입니다
                  </div>
                  <div style={{ fontSize: '13px', color: '#94a3b8', lineHeight: 1.5 }}>
                    우측의 사진 필드에서 이미지를 업로드하면<br />이곳 화면 중앙에 나타납니다
                  </div>
                </div>
              )}
            </div>

            {/* 플로팅 줌 & 이동 컨트롤 바 */}
            <div className="capture-zoom-controls">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setCaptureZoom(z => Math.min(8, Math.round((z + 0.3) * 10) / 10)); }}
                title="확대 (마우스 휠 위로)"
              >
                <ZoomIn size={15} />
              </button>
              <span
                onClick={(e) => { e.stopPropagation(); handleCaptureReset(); }}
                title="클릭 시 100% 원본 비율로 복원"
              >
                {Math.round(captureZoom * 100)}%
              </span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setCaptureZoom(z => Math.max(0.4, Math.round((z - 0.3) * 10) / 10)); }}
                title="축소 (마우스 휠 아래로)"
              >
                <ZoomOut size={15} />
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleCaptureReset(); }}
                title="위치 및 크기 초기화 (더블클릭)"
              >
                <RotateCcw size={13} />
              </button>
              <div className="capture-zoom-hint">
                <Move size={12} />
                <span>드래그 이동 · 휠 확대축소</span>
              </div>
              {/* 업로드/카메라 전환 탭 - 줌 바 우측에 구분선 후 배치 */}
              {uploadedImageFromForm && (
                <>
                  <span className="capture-zoom-sep" />
                  <span className="capture-source-label">
                    <Upload size={11} />
                    업로드 이미지
                  </span>
                  <button
                    type="button"
                    className="capture-source-switch-btn"
                    onClick={(e) => { e.stopPropagation(); setActivePreviewImage(null); }}
                    title="카메라 화면으로 전환"
                  >
                    <Camera size={11} />
                    카메라 전환
                  </button>
                </>
              )}
            </div>
          </div>
          )}
          {/* 소장자 선택 + 이미지 정보 패널 (좌/우 위치 전환 지원) */}
          <div
            className={`autoscan-capture-right ${panelPosition === "left" ? "panel-left" : ""}`}
            style={{
              opacity: rightPanelOpacity,
              transition: 'opacity 0.3s ease'
            }}
          >
            {/* ── 소장자 선택 ── */}
            <div className="capture-owner-section">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <div className="capture-owner-label" style={{ margin: 0 }}>
                  <UserCircle size={13} />
                  소장자 선택
                  {totalArchiveItemCount > 0 && (
                    <span style={{ marginLeft: '5px', padding: '1px 6px', borderRadius: '10px', background: '#ede9fe', color: '#6d28d9', fontSize: '0.68rem', fontWeight: 700 }}>
                      총 {totalArchiveItemCount}건
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={togglePanelPosition}
                  title={panelPosition === 'right' ? '패널을 좌측으로 이동' : '패널을 우측으로 이동'}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '2px 7px',
                    borderRadius: '5px',
                    border: '1px solid #cbd5e1',
                    background: '#f8fafc',
                    color: '#475569',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = '#e0e7ff';
                    e.currentTarget.style.color = '#3730a3';
                    e.currentTarget.style.borderColor = '#c7d2fe';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = '#f8fafc';
                    e.currentTarget.style.color = '#475569';
                    e.currentTarget.style.borderColor = '#cbd5e1';
                  }}
                >
                  {panelPosition === 'right' ? <PanelLeft size={12} /> : <PanelRight size={12} />}
                  <span>{panelPosition === 'right' ? '좌측 이동' : '우측 이동'}</span>
                </button>
              </div>
              {/* 선택된 상태: 박스 안에 이름+전화번호 / 미선택: 검색 인풋 */}
              {selectedOwner && !ownerSearchFocused ? (
                <div
                  className="cow-selected-display"
                  onClick={() => { setOwnerSearchFocused(true); setOwnerSearchQuery(''); }}
                >
                  <Search size={13} className="cow-search-icon" style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)' }} />
                  <div className="cow-selected-info">
                    <span className="cow-selected-name">{selectedOwner.label}</span>
                    {selectedOwner.phone && <span className="cow-selected-phone">{selectedOwner.phone}</span>}
                  </div>
                  <button
                    type="button"
                    className="cow-search-clear"
                    onMouseDown={e => { e.preventDefault(); handleClearOwner(); }}
                  >
                    <X size={11} />
                  </button>
                </div>
              ) : (
                <div className="cow-search-wrap">
                  <Search size={13} className="cow-search-icon" />
                  <input
                    className="cow-search-input"
                    placeholder="이름, 전화번호 등으로 검색..."
                    value={ownerSearchQuery}
                    onChange={e => setOwnerSearchQuery(e.target.value)}
                    onFocus={() => setOwnerSearchFocused(true)}
                    onBlur={() => setTimeout(() => setOwnerSearchFocused(false), 150)}
                    autoFocus={ownerSearchFocused}
                  />
                  {ownerSearchQuery && (
                    <button type="button" className="cow-search-clear" onMouseDown={e => { e.preventDefault(); setOwnerSearchQuery(''); }}>
                      <X size={11} />
                    </button>
                  )}
                </div>
              )}
              {/* 소장수량 등 상세 정보 (선택 후 박스 아래) */}
              {selectedOwner && !ownerSearchFocused && selectedOwner.detail && selectedOwner.detail.length > 0 && (
                <div className="cow-detail-block">
                  <div
                    className={`cow-detail-content${ownerDetailExpanded ? ' expanded' : ''}`}
                    onClick={() => setOwnerDetailExpanded(v => !v)}
                  >
                    {selectedOwner.detail.map((d, i) => (
                      <span key={i} className="cow-detail-item">
                        <span className="cow-detail-key">{d.key}</span>
                        <span className="cow-detail-val">{d.value}</span>
                      </span>
                    ))}
                  </div>
                  {!ownerDetailExpanded && (
                    <button className="cow-detail-expand-btn" onClick={() => setOwnerDetailExpanded(true)}>
                      <ChevronDown size={12} /> 더보기
                    </button>
                  )}
                  {ownerDetailExpanded && (
                    <button className="cow-detail-expand-btn" onClick={() => setOwnerDetailExpanded(false)}>
                      <ChevronUp size={12} /> 접기
                    </button>
                  )}
                </div>
              )}
              {/* 선택된 소장자의 저장자료 건수 + 클릭 시 소장품 종류별 목록 펼침 */}
              {selectedOwner && !ownerSearchFocused && (() => {
                const cnt = ownerItemCountMap[selectedOwner.anchorId];
                if (cnt === undefined || cnt === 0) return null;

                // 소장품 종류별 저장 항목 목록 계산
                const savedByType: Array<{
                  node: (typeof sojangFirstLevelNodes)[0];
                  items: Array<{ anchorId: string; domainId: string; domainName: string; data: Record<string, string>; label: string }>;
                }> = [];

                sojangFirstLevelNodes.forEach(node => {
                  const nodeDomainIds = getNodeOwnLinkedDomainIds(node);
                  const linkedDoms = domains.filter(d => nodeDomainIds.includes(d.id) || (nodeDomainIds.length === 0 && d.name === node.label));
                  const items: Array<{ anchorId: string; domainId: string; domainName: string; data: Record<string, string>; label: string }> = [];
                  const cleanOwnerAnchorId = selectedOwner.anchorId.replace(/-이름$/, '');

                  linkedDoms.forEach(dom => {
                    const ents = getAtomsForDomain(dom.id);
                    ents.forEach((ent: { anchorId: string; data: Record<string, string> }) => {
                      const ownerId = ent.data._ownerId;
                      if (!ownerId) return;
                      const normalizedOwnerId = ownerId.replace(/-이름$/, '');
                      const treeNodeId = ent.data._treeNodeId;
                      if (treeNodeId && treeNodeId !== node.id) return;
                      const ownerMatch = ownerId === selectedOwner.anchorId ||
                        ownerId === cleanOwnerAnchorId ||
                        normalizedOwnerId === selectedOwner.anchorId ||
                        normalizedOwnerId === cleanOwnerAnchorId ||
                        selectedOwner.anchorId.startsWith(normalizedOwnerId) ||
                        normalizedOwnerId.startsWith(cleanOwnerAnchorId);
                      if (!ownerMatch) return;
                      const labelField = dom.fields.find((f: string) => ent.data[f]?.trim() && !f.startsWith('_'));
                      const label = labelField ? (ent.data[labelField] || ent.anchorId) : ent.anchorId;
                      items.push({ anchorId: ent.anchorId, domainId: dom.id, domainName: dom.name, data: ent.data, label });
                    });
                  });

                  if (items.length > 0) {
                    savedByType.push({ node, items });
                  }
                });

                return (
                  <div style={{ marginTop: '6px' }}>
                    {/* 저장된 자료 헤더 (클릭으로 펼침) */}
                    <div
                      onClick={() => setSavedDataPanelOpen(v => !v)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        padding: '6px 10px', background: '#f0fdf4',
                        border: '1px solid #bbf7d0', borderRadius: savedDataPanelOpen ? '7px 7px 0 0' : '7px',
                        cursor: 'pointer', transition: 'border-radius 0.15s'
                      }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                      <span style={{ fontSize: '0.75rem', color: '#15803d', fontWeight: 600 }}>저장된 자료</span>
                      <span style={{ marginLeft: 'auto', padding: '1px 8px', borderRadius: '10px', background: '#dcfce7', color: '#166534', fontSize: '0.72rem', fontWeight: 700 }}>{cnt}건</span>
                      {savedDataPanelOpen ? <ChevronUp size={13} style={{ color: '#16a34a', flexShrink: 0 }} /> : <ChevronDown size={13} style={{ color: '#16a34a', flexShrink: 0 }} />}
                    </div>

                    {/* 소장품 종류별 목록 */}
                    {savedDataPanelOpen && (
                      <div style={{ border: '1px solid #bbf7d0', borderTop: 'none', borderRadius: '0 0 7px 7px', background: '#fff', overflow: 'hidden' }}>
                        {savedByType.length === 0 ? (
                          <div style={{ padding: '10px 12px', fontSize: '0.75rem', color: '#94a3b8', textAlign: 'center' }}>항목이 없습니다</div>
                        ) : (
                          savedByType.map(({ node, items }) => {
                            const typeKey = node.id;
                            const isExpanded = savedDataExpandedTypes.has(typeKey);
                            return (
                              <div key={typeKey}>
                                {/* 소장품 종류 헤더 */}
                                <div
                                  onClick={() => setSavedDataExpandedTypes(prev => {
                                    const next = new Set(prev);
                                    if (next.has(typeKey)) next.delete(typeKey);
                                    else next.add(typeKey);
                                    return next;
                                  })}
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                    padding: '7px 12px', cursor: 'pointer',
                                    background: isExpanded ? '#f0fdf4' : '#f8fafc',
                                    borderTop: '1px solid #e2e8f0',
                                    transition: 'background 0.12s'
                                  }}
                                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f0fdf4'; }}
                                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = isExpanded ? '#f0fdf4' : '#f8fafc'; }}
                                >
                                  <Layers size={12} style={{ color: '#6366f1', flexShrink: 0 }} />
                                  <span style={{ fontSize: '0.77rem', fontWeight: 600, color: '#334155', flex: 1 }}>{node.label}</span>
                                  <span style={{ padding: '1px 6px', borderRadius: '8px', background: '#ede9fe', color: '#6d28d9', fontSize: '0.69rem', fontWeight: 700 }}>{items.length}건</span>
                                  {isExpanded ? <ChevronUp size={12} style={{ color: '#6366f1' }} /> : <ChevronDown size={12} style={{ color: '#6366f1' }} />}
                                </div>

                                {/* 해당 종류의 개별 항목 목록 */}
                                {isExpanded && (
                                  <div>
                                    {items.map((item, idx) => {
                                      const isActiveItem = selectedTreeNode?.id === node.id &&
                                        Object.values(selectedEntityByDomain).includes(item.anchorId);
                                      // 요약 레이블: 제목, 이름 등 첫 번째 텍스트 필드 우선
                                      const summaryVal = Object.entries(item.data)
                                        .filter(([k, v]) => !k.startsWith('_') && v && typeof v === 'string' && !v.startsWith('data:') && !v.startsWith('blob:') && v.trim().length > 0)
                                        .map(([, v]) => v.trim())
                                        .find(v => v.length > 0);
                                      const summary = summaryVal || `#${idx + 1}`;
                                      return (
                                        <div
                                          key={item.anchorId}
                                          onClick={() => {
                                            // 해당 소장품 노드 선택 후 항목 데이터 로드
                                            handleTreeNodeClick(node, node.label);
                                            // 약간의 딜레이 후 데이터 로드 (selectedLinkedDomains 업데이트 대기)
                                            setTimeout(() => {
                                              handleSelectDomainEntity(item.domainId, item.anchorId, item.data);
                                              setEditTargetAnchorId(item.anchorId);
                                              setNodeEntityMode('edit');
                                            }, 80);
                                            setSavedDataPanelOpen(false);
                                          }}
                                          style={{
                                            display: 'flex', alignItems: 'center', gap: '8px',
                                            padding: '6px 14px 6px 24px',
                                            cursor: 'pointer',
                                            background: isActiveItem ? '#eff6ff' : '#fff',
                                            borderTop: '1px solid #f1f5f9',
                                            transition: 'background 0.12s'
                                          }}
                                          onMouseEnter={e => { if (!isActiveItem) (e.currentTarget as HTMLElement).style.background = '#f8fafc'; }}
                                          onMouseLeave={e => { if (!isActiveItem) (e.currentTarget as HTMLElement).style.background = '#fff'; }}
                                        >
                                          <span style={{
                                            minWidth: '18px', height: '18px', borderRadius: '50%',
                                            background: isActiveItem ? '#2563eb' : '#e2e8f0',
                                            color: isActiveItem ? '#fff' : '#64748b',
                                            fontSize: '0.65rem', fontWeight: 700,
                                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                                          }}>
                                            {idx + 1}
                                          </span>
                                          <span style={{ fontSize: '0.77rem', color: isActiveItem ? '#1d4ed8' : '#334155', fontWeight: isActiveItem ? 600 : 400, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {summary}
                                          </span>
                                          {isActiveItem && <Check size={11} style={{ color: '#2563eb', flexShrink: 0 }} />}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
              {/* 자동완성 드롭다운 */}
              {ownerSearchFocused && (
                <div className="cow-dropdown">
                  {filteredOwnerEntities.length === 0 ? (
                    <div className="cow-dropdown-empty">
                      {ownerSearchQuery ? '검색 결과 없음' : (ownerDomain ? '등록된 소장자가 없습니다' : '소장자 도메인이 없습니다')}
                    </div>
                  ) : (
                    filteredOwnerEntities.map(e => {
                      // ownerAnchorField 키 우선, 그 다음 normalizedFields 순서, 마지막 폴백으로 첫 번째 텍스트 값
                      const rawAnchorVal = e.data[ownerAnchorField];
                      const labelFromAnchor = (rawAnchorVal && typeof rawAnchorVal === 'string' && !rawAnchorVal.startsWith('data:') && !rawAnchorVal.startsWith('blob:') && rawAnchorVal.trim()) ? rawAnchorVal.trim() : undefined;
                      const labelFromFields = ownerNormalizedFields
                        .map(f => e.data[f])
                        .find(v => v && typeof v === 'string' && !v.startsWith('data:') && !v.startsWith('blob:') && v.trim().length > 0 && v.length < 50);
                      const labelFromAny = Object.values(e.data).find(v => v && typeof v === 'string' && !v.startsWith('data:') && !v.startsWith('blob:') && v.trim().length > 0 && !/^atom-/.test(v) && v.length < 50);
                      const label = labelFromAnchor || labelFromFields || labelFromAny || '이름 없음';
                      if (label.startsWith('data:') || label.startsWith('blob:')) return null;
                      // 전화번호 필드 탐지 (전화/phone/tel 포함 키)
                      const phoneEntry = Object.entries(e.data).find(([k, v]) =>
                        k !== ownerAnchorField && v && (k.includes('전화') || k.includes('phone') || k.includes('tel') || k.includes('Phone'))
                      );
                      const phone = phoneEntry ? phoneEntry[1] : undefined;
                      // 나머지 필드 → detail (이름·전화번호 제외, 실제 label 값과 동일한 값도 제외)
                      const detail = Object.entries(e.data)
                        .filter(([k, v]) =>
                          k !== ownerAnchorField &&
                          !k.startsWith('_') &&
                          v &&
                          k !== (phoneEntry?.[0] || '') &&
                          v !== label  // 검색창에 표시되는 이름과 동일한 값 제외
                        )
                        .map(([k, v]) => ({ key: k, value: v }));
                      // 드롭다운 미리보기: 전화번호 + detail 첫 1개
                      const previewSub = [phone, detail[0]?.value].filter(Boolean).slice(0, 2).join(' · ');
                      const isSelected = selectedOwner?.anchorId === e.anchorId;
                      return (
                        <div
                          key={e.anchorId}
                          className={`cow-dropdown-item${isSelected ? ' selected' : ''}`}
                          onMouseDown={e2 => {
                            e2.preventDefault();
                            handleSelectOwner(e);
                          }}
                        >
                          <UserCircle size={14} className="cow-item-icon" />
                          <div className="cow-item-info">
                            <span className="cow-item-name">
                              {label}
                              {ownerItemCountMap[e.anchorId] !== undefined && (
                                <span className="cow-item-count">{ownerItemCountMap[e.anchorId]}건</span>
                              )}
                            </span>
                            {previewSub && <span className="cow-item-sub">{previewSub}</span>}
                          </div>
                          {isSelected && <Check size={12} className="cow-item-check" />}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
            {/* 수정 모드 엔티티 선택 팝업 */}
            {showEntitySelectPopup && nodeExistingEntities.length > 0 && (
              <div className="img-entity-select-popup">
                <div className="img-esp-title">수정할 자료 선택</div>
                {nodeExistingEntities.map(ent => (
                  <div
                    key={ent.anchorId}
                    className={'img-esp-item' + (editTargetAnchorId === ent.anchorId ? ' selected' : '')}
                    onClick={() => handleLoadEntityForEdit(ent.anchorId, ent.domainId, ent.data)}
                  >
                    <span className="img-esp-domain">{ent.domainName}</span>
                    <span className="img-esp-label">{ent.label}</span>
                    {editTargetAnchorId === ent.anchorId && (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                    )}
                  </div>
                ))}
              </div>
            )}
            {nodeEntityMode === 'edit' && editTargetAnchorId && (
              <div className="img-edit-indicator">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                수정 모드 — 저장 시 기존 자료 업데이트
              </div>
            )}


            {/* 소장품 선택 → 소장품 태그 + 소장품추가 버튼 같은 행 */}
            {sojangFirstLevelNodes.length > 0 && (
                <div className="capture-form-group scan-tree-section">
                  {selectedTreeNode ? (
                    <div
                      className="scan-tree-selected-path"
                      style={{ cursor: 'default', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                        <Layers size={12} style={{ flexShrink: 0, color: '#6366f1' }} />
                        <span style={{ fontWeight: 600, color: '#1e293b' }}>
                          {selectedTreeNode.label}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedTreePath('');
                            setSelectedTreeNode(null);
                            setLinkedFormData({});
                            setNodeExistingEntities([]);
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: '#94a3b8',
                            padding: '2px',
                            display: 'flex',
                            alignItems: 'center',
                            borderRadius: '4px'
                          }}
                          title="소장품 선택 해제"
                        >
                          <X size={13} />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => { setShowSojangPickerPopup(true); setSojangPickerQuery(''); }}
                        disabled={!selectedOwner}
                        title={!selectedOwner ? '소장자를 먼저 선택하세요' : '소장품 종류를 선택하여 추가'}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '3px 10px',
                          borderRadius: '6px',
                          border: '1px solid',
                          borderColor: selectedOwner ? '#6366f1' : '#e2e8f0',
                          background: selectedOwner ? '#6366f1' : '#f1f5f9',
                          color: selectedOwner ? '#fff' : '#94a3b8',
                          fontSize: '0.74rem',
                          fontWeight: 600,
                          cursor: selectedOwner ? 'pointer' : 'not-allowed',
                          flexShrink: 0,
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        소장품
                      </button>
                    </div>
                  ) : (
                    <div
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}
                    >
                      <div
                        className="scan-tree-selected-path empty"
                        onClick={() => { if (selectedOwner) { setShowSojangPickerPopup(true); setSojangPickerQuery(''); } }}
                        style={{
                          cursor: selectedOwner ? 'pointer' : 'default',
                          display: 'flex',
                          alignItems: 'center',
                          flex: 1,
                          color: '#94a3b8',
                          background: '#ffffff',
                          border: '1px solid #e2e8f0'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Layers size={12} style={{ color: '#6366f1' }} />
                          <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
                            {selectedOwner ? '소장품추가 버튼을 클릭' : '소장자를 먼저 선택하세요'}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => { setShowSojangPickerPopup(true); setSojangPickerQuery(''); }}
                        disabled={!selectedOwner}
                        title={!selectedOwner ? '소장자를 먼저 선택하세요' : '소장품 종류를 선택하여 추가'}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '3px 10px',
                          borderRadius: '6px',
                          border: '1px solid',
                          borderColor: selectedOwner ? '#6366f1' : '#e2e8f0',
                          background: selectedOwner ? '#6366f1' : '#f1f5f9',
                          color: selectedOwner ? '#fff' : '#94a3b8',
                          fontSize: '0.74rem',
                          fontWeight: 600,
                          cursor: selectedOwner ? 'pointer' : 'not-allowed',
                          flexShrink: 0,
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        소장품
                      </button>
                    </div>
                  )}
              </div>
            )}

            {/* 소장품추가 팝업 모달 */}
            {showSojangPickerPopup && (
              <div
                style={{
                  position: 'fixed',
                  inset: 0,
                  background: 'rgba(0,0,0,0.45)',
                  zIndex: 2000,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onClick={() => { setShowSojangPickerPopup(false); setSojangPickerQuery(''); }}
              >
                <div
                  style={{
                    background: '#fff',
                    borderRadius: '14px',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
                    width: '360px',
                    maxWidth: '95vw',
                    maxHeight: '80vh',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                  }}
                  onClick={e => e.stopPropagation()}
                >
                  {/* 팝업 헤더 */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px 12px', borderBottom: '1px solid #f1f5f9' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                      <FolderTree size={16} style={{ color: '#6366f1' }} />
                      <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1e293b' }}>소장품 종류 선택</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setShowSojangPickerPopup(false); setSojangPickerQuery(''); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '2px', display: 'flex', alignItems: 'center', borderRadius: '6px' }}
                    >
                      <X size={16} />
                    </button>
                  </div>

                  {/* 검색창 */}
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Search size={14} style={{ color: '#64748b', flexShrink: 0 }} />
                    <input
                      type="text"
                      placeholder="소장품 종류 검색..."
                      value={sojangPickerQuery}
                      onChange={e => setSojangPickerQuery(e.target.value)}
                      autoFocus
                      style={{
                        flex: 1,
                        border: 'none',
                        outline: 'none',
                        background: 'transparent',
                        fontSize: '0.85rem',
                        color: '#1e293b',
                      }}
                    />
                    {sojangPickerQuery && (
                      <button
                        type="button"
                        onClick={() => setSojangPickerQuery('')}
                        style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0, display: 'flex' }}
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>

                  {/* 소장품 목록 */}
                  <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
                    {(() => {
                      const q = sojangPickerQuery.trim().toLowerCase();
                      const filtered = q ? sojangFirstLevelNodes.filter(n => n.label.toLowerCase().includes(q)) : sojangFirstLevelNodes;
                      if (filtered.length === 0) {
                        return (
                          <div style={{ padding: '24px', textAlign: 'center', fontSize: '0.8rem', color: '#94a3b8' }}>
                            검색 결과가 없습니다
                          </div>
                        );
                      }
                      return filtered.map(node => {
                        const isSelected = selectedTreeNode?.id === node.id;
                        const nodeDomainIds = getNodeOwnLinkedDomainIds(node);
                        const linkedDoms = domains.filter(d => nodeDomainIds.includes(d.id) || (nodeDomainIds.length === 0 && d.name === node.label));
                        const ownerEntityCount = selectedOwner
                          ? linkedDoms.reduce((sum, dom) => {
                              const ents = getAtomsForDomain(dom.id);
                              const cleanOwnerAnchorId = selectedOwner.anchorId.replace(/-이름$/, '');
                              return sum + ents.filter(ent => {
                                const ownerId = ent.data._ownerId;
                                if (!ownerId) return false;
                                const normalizedOwnerId = ownerId.replace(/-이름$/, '');
                                const treeNodeId = ent.data._treeNodeId;
                                if (treeNodeId && treeNodeId !== node.id) return false;
                                return ownerId === selectedOwner.anchorId ||
                                  ownerId === cleanOwnerAnchorId ||
                                  normalizedOwnerId === selectedOwner.anchorId ||
                                  normalizedOwnerId === cleanOwnerAnchorId ||
                                  selectedOwner.anchorId.startsWith(normalizedOwnerId) ||
                                  normalizedOwnerId.startsWith(cleanOwnerAnchorId);
                              }).length;
                            }, 0)
                          : 0;

                        return (
                          <div
                            key={node.id}
                            onClick={() => {
                              handleTreeNodeClick(node, node.label);
                              setShowSojangPickerPopup(false);
                              setSojangPickerQuery('');
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '10px 12px',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              background: isSelected ? '#eff6ff' : 'transparent',
                              border: isSelected ? '1px solid #bfdbfe' : '1px solid transparent',
                              marginBottom: '4px',
                              transition: 'background 0.15s ease',
                            }}
                            onMouseEnter={e => {
                              if (!isSelected) (e.currentTarget as HTMLElement).style.background = '#f8fafc';
                            }}
                            onMouseLeave={e => {
                              if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent';
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: isSelected ? '#dbeafe' : '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Layers size={15} style={{ color: isSelected ? '#2563eb' : '#64748b' }} />
                              </div>
                              <div>
                                <div style={{ fontWeight: isSelected ? 700 : 500, fontSize: '0.85rem', color: isSelected ? '#1d4ed8' : '#334155' }}>
                                  {node.label}
                                </div>
                                {linkedDoms.length > 0 && (
                                  <div style={{ display: 'flex', gap: '3px', marginTop: '2px' }}>
                                    {linkedDoms.map(d => (
                                      <span key={d.id} style={{ fontSize: '0.68rem', padding: '1px 5px', borderRadius: '3px', background: '#f1f5f9', color: '#64748b' }}>
                                        {d.name}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                              {ownerEntityCount > 0 && (
                                <span style={{ padding: '2px 8px', borderRadius: '10px', background: '#ede9fe', color: '#6d28d9', fontSize: '0.7rem', fontWeight: 700 }}>
                                  {ownerEntityCount}건
                                </span>
                              )}
                              {isSelected && (
                                <span style={{ color: '#2563eb', fontSize: '0.85rem', fontWeight: 'bold' }}>✓</span>
                              )}
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              </div>
            )}



            {/* 전체 도메인 묶음 저장 세트 리스트 및 상단 저장 바 */}
            {selectedLinkedDomains.length > 0 && (() => {
              const topDom = selectedLinkedDomains[0];
              const topEntities = topDom ? getEntitiesForDomainAndNode(topDom.id) : [];
              // 현재 선택된 세트 인덱스: 최상위 도메인의 선택된 anchorId 기준
              const currentTopSelected = topDom ? selectedEntityByDomain[topDom.id] : null;
              const currentSetIdx = currentTopSelected
                ? topEntities.findIndex(e => e.anchorId === currentTopSelected)
                : -1;

              return (
                <>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '6px',
                  padding: '4px 2px 8px 2px',
                  background: 'transparent',
                  marginBottom: '2px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {/* 1. 저장된 항목 리스트 (진하게 표시) */}
                    {topEntities.map((_, idx) => {
                      const isSelected = !isNewSetMode && currentSetIdx === idx;
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleSelectSet(idx)}
                          title={`${idx + 1}번 자료 (저장됨)`}
                          style={{
                            width: '24px',
                            height: '24px',
                            borderRadius: '50%',
                            border: 'none',
                            background: isSelected ? '#4f46e5' : '#818cf8',
                            color: '#ffffff',
                            fontWeight: 700,
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.15s ease',
                            boxShadow: isSelected ? '0 1px 3px rgba(79, 70, 229, 0.4)' : 'none',
                            opacity: 1
                          }}
                        >
                          {idx + 1}
                        </button>
                      );
                    })}

                    {/* 2. 저장되지 않은 상태의 항목 (흐리게 표시: 신규 입력 중인 상태) */}
                    {(topEntities.length === 0 || isNewSetMode) && (
                      <button
                        type="button"
                        title={`${topEntities.length + 1}번 (미저장)`}
                        style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          border: '1px dashed #a5b4fc',
                          background: '#ede9fe',
                          color: '#818cf8',
                          fontWeight: 600,
                          fontSize: '0.8rem',
                          cursor: 'default',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          opacity: 0.7,
                          transition: 'all 0.15s ease'
                        }}
                      >
                        {topEntities.length + 1}
                      </button>
                    )}

                    {/* 3. 새 항목 추가 (+) 버튼 */}
                    {topEntities.length > 0 && !isNewSetMode && (
                      <button
                        type="button"
                        onClick={handleNewSet}
                        title="새 항목 추가"
                        style={{
                          width: '22px',
                          height: '22px',
                          borderRadius: '50%',
                          border: '1px dashed #a5b4fc',
                          background: 'transparent',
                          color: '#6366f1',
                          fontWeight: 700,
                          fontSize: '0.8rem',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.12s ease'
                        }}
                      >
                        +
                      </button>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {Object.values(domainSavedNotice).some(v => !!v) && (
                      <span style={{ fontSize: '0.72rem', color: '#16a34a', fontWeight: 700, marginRight: '4px' }}>
                        ✓ 저장완료
                      </span>
                    )}
                    {currentTopSelected && (
                      <button
                        type="button"
                        onClick={() => {
                          if (topDom && currentTopSelected) {
                            handleDeleteDomainEntity(topDom.id, currentTopSelected);
                          }
                        }}
                        title="선택된 자료 삭제"
                        style={{
                          height: '26px',
                          padding: '0 8px',
                          borderRadius: '6px',
                          border: '1px solid #fca5a5',
                          background: '#fff',
                          color: '#ef4444',
                          fontSize: '0.74rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3px'
                        }}
                      >
                        <Trash2 size={12} />
                        삭제
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleSaveAllCurrentDomains}
                      disabled={!selectedOwner}
                      title={!selectedOwner ? '소장자를 먼저 선택해주세요' : '입력 내용 저장'}
                      style={{
                        height: '26px',
                        padding: '0 14px',
                        borderRadius: '6px',
                        border: 'none',
                        background: selectedOwner ? '#4f46e5' : '#c4c4d4',
                        color: '#ffffff',
                        fontWeight: 600,
                        fontSize: '0.78rem',
                        cursor: selectedOwner ? 'pointer' : 'not-allowed',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: selectedOwner ? '0 1px 3px rgba(79, 70, 229, 0.25)' : 'none',
                        transition: 'background 0.15s ease',
                        opacity: selectedOwner ? 1 : 0.7,
                      }}
                    >
                      저장
                    </button>
                  </div>
                </div>

                </>
              );
            })()}

            {/* 연결된 도메인 필드 입력 */}
            {selectedLinkedDomains.length > 0 && (
              <div className="capture-form-group scan-domain-fields-section">
                {selectedLinkedDomains.map((dom, domIdx) => {
                  const fields = linkedDomainFields.get(dom.id) || [];
                  // 도메인에 카메라 속성 필드가 존재하는지 확인
                  const hasCameraField = fields.some(f => f.inputType === 'camera');

                  // 수동 입력 필드:
                  // 카메라 속성 필드가 있을 때 촬영 이미지 및 사이즈는 자동 등록되므로 수동 입력에서 제외
                  const manualFields = fields.filter(f => {
                    if (f.inputType === 'camera') return false;
                    if (hasCameraField && (f.inputType === 'image' || f.name.includes('사이즈') || f.name.includes('크기'))) return false;
                    return true;
                  });

                  // useStatus/visibility로 필드 분리
                  // activeFields: 사용 중(용) + 보임(보기) 인 필드
                  // hiddenFields: 비사용(부) 이거나 숨김(감추기) 인 필드 → 접힘탭에서 확인 가능
                  const activeFields = manualFields.filter(f => {
                    const cfg = getConstituentFieldConfig(dom.id, f.name, selectedTreeNode?.id);
                    if (cfg.visibility === '감추기') return false;
                    return cfg.useStatus === '용';
                  });
                  const hiddenFields = manualFields.filter(f => {
                    const cfg = getConstituentFieldConfig(dom.id, f.name, selectedTreeNode?.id);
                    return cfg.useStatus !== '용' || cfg.visibility === '감추기';
                  });
                  const isHiddenExpanded = expandedScanHidden.has(dom.id);

                  if (activeFields.length === 0 && hiddenFields.length === 0 && !hasCameraField) return null;

                  // 필드 렌더 헬퍼 (속성 반영: 사진은 ImageUploadInput, 전화번호는 자동 하이픈 서식)
                  const renderField = (f: Blueprint) => {
                    const currentVal = (linkedFormData[dom.id] || {})[f.name] || '';
                    const isImg = isImageField(f, f.name);

                    return (
                      <div key={f.id} className="scan-domain-field">
                        <label>{f.name}</label>
                        {isImg ? (() => {
                          if (f.fileMode === 'multiple' || f.multiple) {
                            // 복수 이미지 모드: suffix 키로 관리
                            const descExt = f.extraFields && f.extraFields.length > 0 ? f.extraFields[0] : null;
                            const descKey = descExt ? (descExt.label?.trim() || descExt.id) : `${f.name}_desc`;
                            const mPairs: ImagePair[] = [];
                            const fd2 = linkedFormData[dom.id] || {};
                            const curAnchor = selectedEntityByDomain[dom.id];
                            const curPrefix = curAnchor ? curAnchor.replace(/-[^-]+$/, '') : '';
                            let mIdx = 0;
                            while (fd2[`${f.name}_${mIdx}`] !== undefined) {
                              let imgVal = fd2[`${f.name}_${mIdx}`] || '';
                              if (imgVal === '__img__' || (typeof imgVal === 'string' && imgVal.startsWith('__img'))) {
                                const idbVal = (curAnchor && idbImageMap[`${curAnchor}-${f.name}_${mIdx}`]) ||
                                  (curPrefix && idbImageMap[`${curPrefix}-${f.name}_${mIdx}`]) ||
                                  idbImageMap[`${f.name}_${mIdx}`];
                                if (idbVal) imgVal = idbVal;
                              }
                              mPairs.push({ img: imgVal, desc: fd2[`${descKey}_${mIdx}`] || '' });
                              mIdx++;
                            }
                            // extras 포함 pairs 저장 (img, desc, extras 모두 처리)
                            const extraFieldsAfterDesc = f.extraFields && f.extraFields.length > 1 ? f.extraFields.slice(1) : [];
                            const extraFieldDefsForImg = extraFieldsAfterDesc.map(ext => ({ id: ext.id, label: ext.label?.trim() || ext.id }));
                            const setMPairs = (pairs: ImagePair[]) => {
                              setLinkedFormData(prev => {
                                const next = { ...(prev[dom.id] || {}) };
                                // 기존 키 삭제
                                Object.keys(next).forEach(k => {
                                  if (k.startsWith(`${f.name}_`) || k.startsWith(`${descKey}_`)) delete next[k];
                                  extraFieldDefsForImg.forEach(d => { if (k.startsWith(`${d.label}_`)) delete next[k]; });
                                });
                                // 새 값 저장
                                pairs.forEach((p, i) => {
                                  next[`${f.name}_${i}`] = p.img;
                                  next[`${descKey}_${i}`] = p.desc;
                                  extraFieldDefsForImg.forEach(d => {
                                    next[`${d.label}_${i}`] = (p.extras || {})[d.label] || '';
                                  });
                                });
                                return { ...prev, [dom.id]: next };
                              });
                            };
                            // pairs에 extras 포함하여 로드
                            const mPairsWithExtras: ImagePair[] = mPairs.map((p, i) => ({
                              ...p,
                              extras: extraFieldDefsForImg.reduce((acc, d) => {
                                acc[d.label] = (linkedFormData[dom.id] || {})[`${d.label}_${i}`] || '';
                                return acc;
                              }, {} as Record<string, string>)
                            }));
                            return (
                              <ImageUploadInput
                                multiple={true}
                                pairs={mPairsWithExtras}
                                onAddPair={(img, desc, extras) => setMPairs([...mPairsWithExtras, { img, desc, extras }])}
                                onUpdatePair={(mIdx2, img, desc, extras) => { const p = [...mPairsWithExtras]; p[mIdx2] = { img, desc, extras }; setMPairs(p); }}
                                onRemovePair={(mIdx2) => setMPairs(mPairsWithExtras.filter((_, i) => i !== mIdx2))}
                                descLabel={descExt?.label || '요약설명'}
                                extraFieldDefs={extraFieldDefsForImg}
                                fieldName={f.name}
                                onPreviewClick={url => setActivePreviewImage(url)}
                              />
                            );
                          }
                          const curAnchor = selectedEntityByDomain[dom.id];
                          const curPrefix = curAnchor ? curAnchor.replace(/-[^-]+$/, '') : '';
                          let resolvedCurrentVal = currentVal;
                          if (resolvedCurrentVal === '__img__' || (typeof resolvedCurrentVal === 'string' && resolvedCurrentVal.startsWith('__img'))) {
                            const idbVal = (curAnchor && idbImageMap[`${curAnchor}-${f.name}`]) ||
                              (curPrefix && idbImageMap[`${curPrefix}-${f.name}`]) ||
                              idbImageMap[f.name];
                            if (idbVal) resolvedCurrentVal = idbVal;
                          }
                          return (
                            <ImageUploadInput
                              value={resolvedCurrentVal}
                              onChange={val => {
                                setLinkedFormData(prev => ({
                                  ...prev,
                                  [dom.id]: { ...(prev[dom.id] || {}), [f.name]: val }
                                }));
                                if (val) {
                                  setActivePreviewImage(val);
                                } else if (activePreviewImage === currentVal) {
                                  setActivePreviewImage(null);
                                }
                              }}
                              onPreviewClick={url => setActivePreviewImage(url)}
                              fieldName={f.name}
                            />
                          );
                        })() : f.inputType === 'tree' && f.treeData && f.treeData.length > 0 ? (
                          <select
                            className="capture-form-input"
                            value={currentVal}
                            onChange={e => setLinkedFormData(prev => ({
                              ...prev,
                              [dom.id]: { ...(prev[dom.id] || {}), [f.name]: e.target.value }
                            }))}
                          >
                            <option value="">{f.name} 선택...</option>
                            {(() => {
                              const options: { path: string; label: string; depth: number }[] = [];
                              const collectOptions = (nodes: TreeNode[], prefix: string = '', depth: number = 0) => {
                                nodes.forEach(n => {
                                  const p = prefix ? `${prefix} > ${n.label}` : n.label;
                                  options.push({ path: p, label: n.label, depth });
                                  if (n.children) collectOptions(n.children, p, depth + 1);
                                });
                              };
                              collectOptions(f.treeData!);
                              return options.map(opt => (
                                <option key={opt.path} value={opt.path}>
                                  {'  '.repeat(opt.depth)}{opt.label}
                                </option>
                              ));
                            })()}
                          </select>
                        ) : f.inputType === 'fullname' ? (
                          <input
                            type="text"
                            className="capture-form-input"
                            placeholder={`${f.name} 입력 (예: 김세인, 남궁정훈)`}
                            value={currentVal}
                            onChange={e => setLinkedFormData(prev => ({
                              ...prev,
                              [dom.id]: { ...(prev[dom.id] || {}), [f.name]: e.target.value }
                            }))}
                            onBlur={e => {
                              const formatted = formatKoreanName(e.target.value);
                              if (formatted !== e.target.value) {
                                setLinkedFormData(prev => ({
                                  ...prev,
                                  [dom.id]: { ...(prev[dom.id] || {}), [f.name]: formatted }
                                }));
                              }
                            }}
                          />) : f.inputType === 'textarea' ? (
                          <textarea
                            className="capture-form-textarea"
                            placeholder={`${f.name} 입력...`}
                            value={currentVal}
                            onChange={e => setLinkedFormData(prev => ({
                              ...prev,
                              [dom.id]: { ...(prev[dom.id] || {}), [f.name]: e.target.value }
                            }))}
                            rows={2}
                          />
                        ) : (
                          <input
                            type={f.inputType === 'number' ? 'number' : f.inputType === 'date' ? 'date' : 'text'}
                            className="capture-form-input"
                            placeholder={`${f.name} 입력...`}
                            value={currentVal}
                            onChange={e => {
                              let val = e.target.value;
                              // 전화번호 및 기타 자동 포맷 적용
                              if (f.inputType === 'tel' || f.format === 'phone' || f.name.includes('전화') || f.name.includes('핸드폰') || f.name.includes('연락처')) {
                                val = formatPhoneNumber(val);
                              } else {
                                val = applyAutoFormat(val, f.name, f.inputType, f.format);
                              }
                              setLinkedFormData(prev => ({
                                ...prev,
                                [dom.id]: { ...(prev[dom.id] || {}), [f.name]: val }
                              }));
                            }}
                          />
                        )}

                        {/* extraFields가 설정된 경우 추가 서브 입력 필드 렌더링 */}
                        {/* fileMode=multiple인 이미지 필드의 extraFields는 MultipleImageUpload 내부에서 처리 */}
                        {f.extraFields && f.extraFields.length > 0 && !(isImg && (f.fileMode === 'multiple' || f.multiple)) && (
                          <div className="scan-extra-fields-wrap" style={{ marginTop: '8px', padding: '8px 10px', background: 'rgba(248, 250, 252, 0.8)', border: '1px dashed #cbd5e1', borderRadius: '6px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {f.extraFields.map(ext => {
                              const extKey = ext.label?.trim() || ext.id;
                              const extVal = (linkedFormData[dom.id] || {})[extKey] || '';
                              const isExtImg = ext.inputType === 'image' || ext.inputType === 'camera';

                              return (
                                <div key={ext.id} className="scan-domain-field scan-domain-extra-field">
                                  <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.74rem', color: '#475569', fontWeight: 600, marginBottom: '4px' }}>
                                    <span style={{ fontSize: '0.62rem', padding: '1px 5px', borderRadius: '3px', background: '#e0e7ff', color: '#4338ca', fontWeight: 700 }}>추가</span>
                                    {ext.label || '추가 필드'}
                                  </label>
                                  {isExtImg ? (
                                    <ImageUploadInput
                                      value={extVal}
                                      onChange={val => {
                                        setLinkedFormData(prev => ({
                                          ...prev,
                                          [dom.id]: { ...(prev[dom.id] || {}), [extKey]: val }
                                        }));
                                        if (val) setActivePreviewImage(val);
                                      }}
                                      onPreviewClick={url => setActivePreviewImage(url)}
                                      fieldName={ext.label || '이미지'}
                                    />
                                  ) : ext.inputType === 'textarea' ? (
                                    <textarea
                                      className="capture-form-textarea"
                                      placeholder={`${ext.label || '내용'} 입력...`}
                                      value={extVal}
                                      onChange={e => setLinkedFormData(prev => ({
                                        ...prev,
                                        [dom.id]: { ...(prev[dom.id] || {}), [extKey]: e.target.value }
                                      }))}
                                      rows={2}
                                    />
                                  ) : (
                                    <input
                                      type={ext.inputType === 'number' ? 'number' : ext.inputType === 'date' ? 'date' : 'text'}
                                      className="capture-form-input"
                                      placeholder={`${ext.label || '내용'} 입력...`}
                                      value={extVal}
                                      onChange={e => {
                                        let val = e.target.value;
                                        if (ext.inputType === 'tel') val = formatPhoneNumber(val);
                                        setLinkedFormData(prev => ({
                                          ...prev,
                                          [dom.id]: { ...(prev[dom.id] || {}), [extKey]: val }
                                        }));
                                      }}
                                    />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  };

                  const isDomainCollapsed = collapsedDomainCards.has(dom.id);
                  const domainEntities = getEntitiesForDomainAndNode(dom.id);

                  return (
                    <div key={dom.id} className="scan-domain-card">

                    {(() => {
                      const childNodes = getChildNodesForDomain(dom.id);
                      const hasMultiChildNodes = childNodes.length > 1;
                      const activeNode = getActiveOriginNodeForDomain(dom.id);

                      if (hasMultiChildNodes) {
                        return (
                          <div 
                            className="scan-domain-card-header"
                            style={{
                              display: 'flex',
                              alignItems: 'stretch',
                              justifyContent: 'space-between',
                              padding: 0,
                              background: '#e0e7ff',
                              height: '35px',
                              boxSizing: 'border-box',
                              overflow: 'hidden',
                              userSelect: 'none',
                            }}
                          >
                            <DomainTabsBar
                              domId={dom.id}
                              domName={dom.name}
                              childNodes={childNodes}
                              activeNode={activeNode}
                              fieldConfigPopup={fieldConfigPopup}
                              setFieldConfigPopup={setFieldConfigPopup}
                              handleSwitchSubNode={handleSwitchSubNode}
                              getEntitiesForDomainAndSpecificNode={getEntitiesForDomainAndSpecificNode}
                            />

                            <button
                              type="button"
                              className="scan-domain-collapse-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleCollapseDomainCard(dom.id);
                              }}
                              title={isDomainCollapsed ? "도메인 펼치기" : "도메인 접기"}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: '#a5b4fc',
                                cursor: 'pointer',
                                padding: '2px 8px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderRadius: '4px',
                                transition: 'color 0.15s'
                              }}
                            >
                              {isDomainCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                            </button>
                          </div>
                        );
                      }

                      // 단일 노드인 경우 (예: 책 : 묶음정리)
                      return (
                        <div 
                          className="scan-domain-card-header"
                          onClick={() => handleToggleCollapseDomainCard(dom.id)}
                          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <button
                              type="button"
                              className="scan-domain-icon-config-btn"
                              title="필드 설정"
                              onClick={e => { e.stopPropagation(); setFieldConfigPopup(prev => prev === dom.id ? null : dom.id); }}
                              style={{ background: 'none', border: 'none', padding: '2px 3px', cursor: 'pointer', display: 'flex', alignItems: 'center', borderRadius: '4px', color: fieldConfigPopup === dom.id ? '#818cf8' : '#64748b' }}
                            >
                              <Layers size={13} />
                            </button>
                            <span>
                              {(() => {
                                const nodeLabel = activeNode?.label || selectedTreeNode?.label;
                                return nodeLabel ? `${nodeLabel} : ${dom.name}` : dom.name;
                              })()}
                            </span>
                          </div>
                          <button
                            type="button"
                            className="scan-domain-collapse-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleCollapseDomainCard(dom.id);
                            }}
                            title={isDomainCollapsed ? "도메인 펼치기" : "도메인 접기"}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#a5b4fc',
                              cursor: 'pointer',
                              padding: '2px 4px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              borderRadius: '4px',
                              transition: 'color 0.15s'
                            }}
                          >
                            {isDomainCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                          </button>
                        </div>
                      );
                    })()}

                      {/* 입력저장 후 번호 리스트 (1, 2, 3...) 탭 - 최상위 노드(domIdx === 0)에는 추가 기능 및 번호 바를 표시하지 않음 */}
                      {!isDomainCollapsed && domIdx > 0 && domainEntities.length > 0 && !isNewSetMode && (
                        <div
                          className="scan-domain-entities-bar"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '6px 10px',
                            background: '#f8fafc',
                            borderBottom: '1px solid #e2e8f0',
                            flexWrap: 'wrap'
                          }}
                        >
                          <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600, marginRight: '4px' }}>
                            저장목록:
                          </span>
                          {domainEntities.map((ent, idx) => {
                            const isSelected = selectedEntityByDomain[dom.id] === ent.anchorId;
                            return (
                              <button
                                key={ent.anchorId}
                                type="button"
                                className={`scan-entity-num-btn ${isSelected ? 'active' : ''}`}
                                onClick={() => handleSelectDomainEntity(dom.id, ent.anchorId, ent.data)}
                                title={ent.data.제목 || ent.data.설명 || ent.data.간략설명 || `${idx + 1}번 자료`}
                                style={{
                                  height: '24px',
                                  minWidth: '24px',
                                  padding: '0 6px',
                                  borderRadius: '4px',
                                  border: isSelected ? 'none' : '1px solid #cbd5e1',
                                  background: isSelected ? '#4f46e5' : '#ffffff',
                                  color: isSelected ? '#ffffff' : '#334155',
                                  fontWeight: isSelected ? 700 : 500,
                                  fontSize: '0.78rem',
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  transition: 'all 0.12s ease',
                                }}
                              >
                                {idx + 1}
                              </button>
                            );
                          })}
                          <button
                            type="button"
                            className="scan-entity-new-btn"
                            onClick={() => handleNewDomainEntity(dom.id)}
                            title="새 입력 작성"
                            style={{
                              height: '24px',
                              padding: '0 8px',
                              borderRadius: '4px',
                              border: '1px dashed #818cf8',
                              background: '#ffffff',
                              color: '#4f46e5',
                              fontWeight: 600,
                              fontSize: '0.74rem',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '2px',
                            }}
                          >
                            + 추가
                          </button>
                        </div>
                      )}

                      {!isDomainCollapsed && (
                        <div className="scan-domain-card-fields">
                        {activeFields.map(f => renderField(f))}
                        {hasCameraField && (
                          <div className="scan-domain-auto-strip">
                            <div className="scan-auto-strip-item scan-auto-size" title="측정 사이즈">
                              <Ruler size={16} className="scan-auto-icon" />
                              <span className="scan-auto-val">
                                {sizeWidth && sizeHeight ? `${sizeWidth} × ${sizeHeight} mm` : '미측정'}
                              </span>
                            </div>
                            <div className="scan-auto-strip-item scan-auto-camera" title="카메라 연결됨">
                              <div className="scan-camera-on-pill">
                                <span className="scan-camera-dot" />
                                <Camera size={14} />
                              </div>
                            </div>
                          </div>
                        )}
                        {hiddenFields.length > 0 && (
                          <>
                            <button
                              type="button"
                              className="scan-hidden-toggle"
                              onClick={() => handleToggleScanHidden(dom.id)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: '4px',
                                background: 'none', border: '1px dashed #64748b', borderRadius: '4px',
                                color: isHiddenExpanded ? '#6366f1' : '#94a3b8',
                                cursor: 'pointer', padding: '4px 8px', marginTop: '4px',
                                fontSize: '11px', width: '100%', justifyContent: 'center'
                              }}
                            >
                              {isHiddenExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                              숨김 필드 {hiddenFields.length}개 {isHiddenExpanded ? '접기' : '펼치기'}
                            </button>
                            {isHiddenExpanded && hiddenFields.map(f => renderField(f))}
                          </>
                        )}

                        {/* 도메인별 저장 버튼 영역 (상단 통합 저장 바 사용으로 숨김) */}
                      </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

          </div>
        </div>
        {renderBottombar()}
        </>
      )}

      {/* ====== 편집 모드 (저장된 항목 수정/삭제) ====== */}
      {(phase as string) === 'editing' && editingItem && (() => {
        // 편집 대상 도메인 목록
        const editDomains = (editingItem.domainIds || [])
          .map(id => domains.find(d => d.id === id))
          .filter(Boolean) as typeof domains;

        return (
          <>
          <div className={`autoscan-capture-layout has-panel ${panelPosition === "left" ? "panel-left" : ""}`}>
            {/* 좌측: 이미지 뷰포트 (captured와 동일) */}
            <div
              className="autoscan-capture-left"
              onWheel={handleCaptureWheel}
              onPointerDown={handleCapturePointerDown}
              onPointerMove={handleCapturePointerMove}
              onPointerUp={handleCapturePointerUp}
              onPointerCancel={handleCapturePointerUp}
              onDoubleClick={handleCaptureReset}
              style={{ cursor: isCapturePanning ? 'grabbing' : 'grab', userSelect: 'none', touchAction: 'none' }}
            >
              <div
                className="autoscan-capture-viewport"
                style={{
                  width: '100%', height: '100%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transform: `translate(${capturePan.x}px, ${capturePan.y}px) scale(${captureZoom})`,
                  transformOrigin: 'center center',
                  transition: isCapturePanning ? 'none' : 'transform 0.12s ease-out',
                }}
              >
                {editingItem.image ? (
                  <img
                    src={editingItem.image}
                    alt="편집 이미지"
                    className="autoscan-capture-image"
                    draggable={false}
                  />
                ) : (
                  <div className="autoscan-empty-viewport-notice" style={{ textAlign: 'center', color: '#94a3b8', padding: '40px 20px', userSelect: 'none' }}>
                    <Upload size={44} style={{ color: '#818cf8', marginBottom: '14px', opacity: 0.85 }} />
                    <div style={{ fontSize: '16px', fontWeight: 600, color: '#f1f5f9', marginBottom: '8px' }}>이미지 없음</div>
                  </div>
                )}
              </div>
              {/* 줌 컨트롤 */}
              <div className="capture-zoom-controls">
                <button type="button" onClick={(e) => { e.stopPropagation(); setCaptureZoom(z => Math.min(8, Math.round((z + 0.3) * 10) / 10)); }} title="확대"><ZoomIn size={15} /></button>
                <span onClick={(e) => { e.stopPropagation(); handleCaptureReset(); }} title="100%">{Math.round(captureZoom * 100)}%</span>
                <button type="button" onClick={(e) => { e.stopPropagation(); setCaptureZoom(z => Math.max(0.4, Math.round((z - 0.3) * 10) / 10)); }} title="축소"><ZoomOut size={15} /></button>
                <button type="button" onClick={(e) => { e.stopPropagation(); handleCaptureReset(); }} title="초기화"><RotateCcw size={13} /></button>
                <div className="capture-zoom-hint"><Move size={12} /><span>드래그 이동 · 휠 확대축소</span></div>
              </div>
            </div>

            {/* 우측: 소장자 선택 + 도메인 필드 편집 패널 */}
            <div className={`autoscan-capture-right ${panelPosition === "left" ? "panel-left" : ""}`} style={{ opacity: rightPanelOpacity, transition: 'opacity 0.3s ease' }}>
              {/* ── 소장자 선택 ── */}
              <div className="capture-owner-section">
                <div className="capture-owner-label">
                  <UserCircle size={13} />
                  소장자 선택
                  {totalArchiveItemCount > 0 && (
                    <span style={{ marginLeft: '5px', padding: '1px 6px', borderRadius: '10px', background: '#ede9fe', color: '#6d28d9', fontSize: '0.68rem', fontWeight: 700 }}>
                      총 {totalArchiveItemCount}건
                    </span>
                  )}
                </div>
                {/* 선택된 상태: 박스 안에 이름+전화번호 / 미선택: 검색 인풋 */}
                {selectedOwner && !ownerSearchFocused ? (
                  <div
                    className="cow-selected-display"
                    onClick={() => { setOwnerSearchFocused(true); setOwnerSearchQuery(''); }}
                  >
                    <Search size={13} className="cow-search-icon" style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)' }} />
                    <div className="cow-selected-info">
                      <span className="cow-selected-name">{selectedOwner.label}</span>
                      {selectedOwner.phone && <span className="cow-selected-phone">{selectedOwner.phone}</span>}
                    </div>
                    <button
                      type="button"
                      className="cow-search-clear"
                      onMouseDown={e => { e.preventDefault(); handleClearOwner(); }}
                    >
                      <X size={11} />
                    </button>
                  </div>
                ) : (
                  <div className="cow-search-wrap">
                    <Search size={13} className="cow-search-icon" />
                    <input
                      className="cow-search-input"
                      placeholder="이름, 전화번호 등으로 검색..."
                      value={ownerSearchQuery}
                      onChange={e => setOwnerSearchQuery(e.target.value)}
                      onFocus={() => setOwnerSearchFocused(true)}
                      onBlur={() => setTimeout(() => setOwnerSearchFocused(false), 150)}
                      autoFocus={ownerSearchFocused}
                    />
                    {ownerSearchQuery && (
                      <button type="button" className="cow-search-clear" onMouseDown={e => { e.preventDefault(); setOwnerSearchQuery(''); }}>
                        <X size={11} />
                      </button>
                    )}
                  </div>
                )}
                {/* 소장수량 등 상세 정보 (선택 후 박스 아래) */}
                {selectedOwner && !ownerSearchFocused && selectedOwner.detail && selectedOwner.detail.length > 0 && (
                  <div className="cow-detail-block">
                    <div
                      className={`cow-detail-content${ownerDetailExpanded ? ' expanded' : ''}`}
                      onClick={() => setOwnerDetailExpanded(v => !v)}
                    >
                      {selectedOwner.detail.map((d, i) => (
                        <span key={i} className="cow-detail-item">
                          <span className="cow-detail-key">{d.key}</span>
                          <span className="cow-detail-val">{d.value}</span>
                        </span>
                      ))}
                    </div>
                    {!ownerDetailExpanded && (
                      <button className="cow-detail-expand-btn" onClick={() => setOwnerDetailExpanded(true)}>
                        <ChevronDown size={12} /> 더보기
                      </button>
                    )}
                    {ownerDetailExpanded && (
                      <button className="cow-detail-expand-btn" onClick={() => setOwnerDetailExpanded(false)}>
                        <ChevronUp size={12} /> 접기
                      </button>
                    )}
                  </div>
                )}
                {/* 자동완성 드롭다운 */}
                {ownerSearchFocused && (
                  <div className="cow-dropdown">
                    {filteredOwnerEntities.length === 0 ? (
                      <div className="cow-dropdown-empty">
                        {ownerSearchQuery ? '검색 결과 없음' : (ownerDomain ? '등록된 소장자가 없습니다' : '소장자 도메인이 없습니다')}
                      </div>
                    ) : (
                      filteredOwnerEntities.map(e => {
                        // ownerAnchorField 키 우선, 그 다음 normalizedFields 순서, 마지막 폴백으로 첫 번째 텍스트 값
                        const rawAnchorVal = e.data[ownerAnchorField];
                        const labelFromAnchor = (rawAnchorVal && typeof rawAnchorVal === 'string' && !rawAnchorVal.startsWith('data:') && !rawAnchorVal.startsWith('blob:') && rawAnchorVal.trim()) ? rawAnchorVal.trim() : undefined;
                        const labelFromFields = ownerNormalizedFields
                          .map(f => e.data[f])
                          .find(v => v && typeof v === 'string' && !v.startsWith('data:') && !v.startsWith('blob:') && v.trim().length > 0 && v.length < 50);
                        const labelFromAny = Object.values(e.data).find(v => v && typeof v === 'string' && !v.startsWith('data:') && !v.startsWith('blob:') && v.trim().length > 0 && !/^atom-/.test(v) && v.length < 50);
                        const label = labelFromAnchor || labelFromFields || labelFromAny || '이름 없음';
                        if (label.startsWith('data:') || label.startsWith('blob:')) return null;
                        const phoneEntry = Object.entries(e.data).find(([k, v]) =>
                          k !== ownerAnchorField && v && (k.includes('전화') || k.includes('phone') || k.includes('tel') || k.includes('Phone'))
                        );
                        const phone = phoneEntry ? phoneEntry[1] : undefined;
                        const detail = Object.entries(e.data)
                          .filter(([k, v]) =>
                            k !== ownerAnchorField &&
                            !k.startsWith('_') &&
                            v &&
                            k !== (phoneEntry?.[0] || '') &&
                            v !== label  // 검색창에 표시되는 이름과 동일한 값 제외
                          )
                          .map(([k, v]) => ({ key: k, value: v }));
                        const previewSub = [phone, detail[0]?.value].filter(Boolean).slice(0, 2).join(' · ');
                        const isSelected = selectedOwner?.anchorId === e.anchorId;
                        return (
                          <div
                            key={e.anchorId}
                            className={`cow-dropdown-item${isSelected ? ' selected' : ''}`}
                            onMouseDown={e2 => {
                              e2.preventDefault();
                              handleSelectOwner(e);
                            }}
                          >
                            <UserCircle size={14} className="cow-item-icon" />
                            <div className="cow-item-info">
                              <span className="cow-item-name">
                                {label}
                                {ownerItemCountMap[e.anchorId] !== undefined && (
                                  <span className="cow-item-count">{ownerItemCountMap[e.anchorId]}건</span>
                                )}
                              </span>
                              {previewSub && <span className="cow-item-sub">{previewSub}</span>}
                            </div>
                            {isSelected && <Check size={12} className="cow-item-check" />}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>

              {/* 소장품 선택 — 편집 전용 (소장품 트리의 첫 번째 노드 리스트 검색 및 선택) */}
              {sojangFirstLevelNodes.length > 0 && (
                <div className="capture-form-group scan-tree-section">
                  <div
                    className="scan-tree-header"
                    onClick={() => setIsEditTreeOpen(prev => !prev)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', marginBottom: '4px' }}
                  >
                    <label style={{ cursor: 'pointer', margin: 0, display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <FolderTree size={13} />
                      소장품선택
                    </label>
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); setIsEditTreeOpen(prev => !prev); }}
                      style={{ background: 'none', border: 'none', color: '#a5b4fc', cursor: 'pointer', padding: '2px 4px', display: 'flex', alignItems: 'center' }}
                      title={isEditTreeOpen ? '접기' : '소장품 목록 펼치기'}
                    >
                      {isEditTreeOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                  </div>

                  {editingItem.treePath ? (
                    <div
                      className="scan-tree-selected-path"
                      onClick={() => setIsEditTreeOpen(prev => !prev)}
                      style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                      title={isEditTreeOpen ? '클릭하여 접기' : '클릭하여 다른 소장품 선택'}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                        <Layers size={12} style={{ flexShrink: 0, color: '#6366f1' }} />
                        <span style={{ fontWeight: 600, color: '#1e293b' }}>
                          {editingItem.treePath.split(' > ').pop() || editingItem.treePath}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingItem(prev => prev ? { ...prev, treePath: undefined, treeNodeId: undefined } : null);
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: '#94a3b8',
                            padding: '2px',
                            display: 'flex',
                            alignItems: 'center',
                            borderRadius: '4px'
                          }}
                          title="소장품 선택 해제"
                        >
                          <X size={13} />
                        </button>
                        <span style={{ color: '#a5b4fc', display: 'flex', alignItems: 'center' }}>
                          {isEditTreeOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="scan-tree-selected-path empty"
                      onClick={() => setIsEditTreeOpen(prev => !prev)}
                      style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#94a3b8' }}
                      title={isEditTreeOpen ? "클릭하여 접기" : "클릭하여 소장품 선택"}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Layers size={12} />
                        <span style={{ fontSize: '0.74rem' }}>소장품을 선택하세요...</span>
                      </div>
                      <span style={{ color: '#a5b4fc', display: 'flex', alignItems: 'center' }}>
                        {isEditTreeOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      </span>
                    </div>
                  )}

                  {isEditTreeOpen && (
                    <div className="scan-sojang-dropdown" style={{
                      marginTop: '6px',
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      boxShadow: '0 4px 14px rgba(0,0,0,0.08)',
                      overflow: 'hidden',
                      zIndex: 10
                    }}>
                      {/* 검색창 */}
                      <div style={{
                        padding: '8px',
                        borderBottom: '1px solid #f1f5f9',
                        background: '#f8fafc',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}>
                        <Search size={13} style={{ color: '#64748b', flexShrink: 0 }} />
                        <input
                          type="text"
                          placeholder="소장품 검색..."
                          value={editSojangSearchQuery}
                          onChange={e => setEditSojangSearchQuery(e.target.value)}
                          onClick={e => e.stopPropagation()}
                          autoFocus
                          style={{
                            flex: 1,
                            border: 'none',
                            outline: 'none',
                            background: 'transparent',
                            fontSize: '0.78rem',
                            color: '#1e293b'
                          }}
                        />
                        {editSojangSearchQuery && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setEditSojangSearchQuery(''); }}
                            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0 }}
                          >
                            <X size={12} />
                          </button>
                        )}
                      </div>

                      {/* 소장품 1단계 노드 목록 */}
                      <div style={{ maxHeight: '220px', overflowY: 'auto', padding: '4px' }}>
                        {filteredEditSojangNodes.length === 0 ? (
                          <div style={{ padding: '12px', textAlign: 'center', fontSize: '0.75rem', color: '#94a3b8' }}>
                            검색 결과가 없습니다
                          </div>
                        ) : (
                          filteredEditSojangNodes.map(node => {
                            const isSelected = editingItem.treeNodeId === node.id || editingItem.treePath === node.label;
                            const nodeDomainIds = getNodeOwnLinkedDomainIds(node);
                            const linkedDoms = domains.filter(d => nodeDomainIds.includes(d.id) || (nodeDomainIds.length === 0 && d.name === node.label));

                            // 현재 편집 중인 아이템의 소장자 기준 실제 등록 엔티티 수 계산
                            const editOwnerAnchorId = (editingItem as any).data?._ownerId || selectedOwner?.anchorId;
                            const ownerEntityCount = editOwnerAnchorId
                              ? linkedDoms.reduce((sum, dom) => {
                                  const ents = getAtomsForDomain(dom.id);
                                  const cleanOwnerAnchorId = editOwnerAnchorId.replace(/-이름$/, '');
                                  return sum + ents.filter(ent => {
                                    const ownerId = ent.data._ownerId;
                                    if (!ownerId) return false;
                                    const normalizedOwnerId = ownerId.replace(/-이름$/, '');
                                    const treeNodeId = ent.data._treeNodeId;
                                    if (treeNodeId && treeNodeId !== node.id) return false;
                                    return ownerId === editOwnerAnchorId ||
                                      ownerId === cleanOwnerAnchorId ||
                                      normalizedOwnerId === editOwnerAnchorId ||
                                      normalizedOwnerId === cleanOwnerAnchorId;
                                  }).length;
                                }, 0)
                              : 0;

                            return (
                              <div
                                key={node.id}
                                onClick={() => {
                                  const newDomainIds: string[] = [];
                                  linkedDoms.forEach(d => { if (!newDomainIds.includes(d.id)) newDomainIds.push(d.id); });
                                  nodeDomainIds.forEach(id => { if (!newDomainIds.includes(id)) newDomainIds.push(id); });

                                  setEditingItem(prev => prev ? {
                                    ...prev,
                                    treePath: node.label,
                                    treeNodeId: node.id,
                                    domainIds: newDomainIds.length > 0 ? newDomainIds : prev.domainIds,
                                  } : prev);
                                  setEditFormData({});
                                  setIsEditTreeOpen(false);
                                  setEditSojangSearchQuery('');
                                }}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  padding: '7px 10px',
                                  borderRadius: '6px',
                                  cursor: 'pointer',
                                  background: isSelected ? '#eff6ff' : 'transparent',
                                  border: isSelected ? '1px solid #bfdbfe' : '1px solid transparent',
                                  marginBottom: '2px',
                                  transition: 'background 0.15s ease'
                                }}
                                onMouseEnter={e => {
                                  if (!isSelected) (e.currentTarget as HTMLElement).style.background = '#f8fafc';
                                }}
                                onMouseLeave={e => {
                                  if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent';
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span style={{
                                    fontWeight: isSelected ? 700 : 500,
                                    fontSize: '0.8rem',
                                    color: isSelected ? '#1d4ed8' : '#334155'
                                  }}>
                                    {node.label}
                                  </span>
                                  {ownerEntityCount > 0 && (
                                    <span style={{ fontSize: '0.68rem', color: '#6366f1', fontWeight: 600 }}>
                                      {ownerEntityCount}건
                                    </span>
                                  )}
                                  {linkedDoms.length > 0 && (
                                    <div style={{ display: 'flex', gap: '3px' }}>
                                      {linkedDoms.map(d => (
                                        <span key={d.id} style={{
                                          fontSize: '0.65rem',
                                          padding: '1px 5px',
                                          borderRadius: '3px',
                                          background: '#f1f5f9',
                                          color: '#64748b'
                                        }}>
                                          {d.name}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                                {isSelected && (
                                  <span style={{ color: '#2563eb', fontSize: '0.75rem', fontWeight: 'bold' }}>✓</span>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 도메인 필드 */}
              {editDomains.length > 0 && (
                <div className="capture-form-group scan-domain-fields-section">
                  {editDomains.map(dom => {
                    const fields = getFieldsForDomain(dom.id).filter(f => !f.name.startsWith('_'));
                    const hasCameraField = fields.some(f => f.inputType === 'camera');
                    const manualFields = fields.filter(f => {
                      if (f.inputType === 'camera') return false;
                      if (hasCameraField && (f.inputType === 'image' || f.name.includes('사이즈') || f.name.includes('크기'))) return false;
                      return true;
                    });
                    const activeFields = manualFields.filter(f => {
                      const cfg = getConstituentFieldConfig(dom.id, f.name, editingItem.treeNodeId);
                      if (cfg.visibility === '감추기') return false;
                      return cfg.useStatus === '용';
                    });
                    const hiddenFields = manualFields.filter(f => {
                      const cfg = getConstituentFieldConfig(dom.id, f.name, editingItem.treeNodeId);
                      return cfg.useStatus !== '용' || cfg.visibility === '감추기';
                    });
                    const isHiddenExpanded = expandedScanHidden.has(dom.id);
                    const isDomainCollapsed = collapsedDomainCards.has(dom.id);

                    if (activeFields.length === 0 && hiddenFields.length === 0 && !hasCameraField) return null;

                    // 편집용 renderField: editFormData 사용
                    const renderEditField = (f: Blueprint) => {
                      const currentVal = (editFormData[dom.id] || {})[f.name] || '';
                      const isImg = isImageField(f, f.name);
                      return (
                        <div key={f.id} className="scan-domain-field">
                          <label>{f.name}</label>
                          {isImg ? (() => {
                            if (f.fileMode === 'multiple' || f.multiple) {
                              // 수정 폼 복수 이미지 모드
                              const descExt2 = f.extraFields && f.extraFields.length > 0 ? f.extraFields[0] : null;
                              const descKey2 = descExt2 ? (descExt2.label?.trim() || descExt2.id) : `${f.name}_desc`;
                              const mPairs2: ImagePair[] = [];
                              const fd2 = editFormData[dom.id] || {};
                              let mIdx2 = 0;
                              while (fd2[`${f.name}_${mIdx2}`] !== undefined) {
                                mPairs2.push({ img: fd2[`${f.name}_${mIdx2}`] || '', desc: fd2[`${descKey2}_${mIdx2}`] || '' });
                                mIdx2++;
                              }
                              const extraFieldsAfterDesc2 = f.extraFields && f.extraFields.length > 1 ? f.extraFields.slice(1) : [];
                              const extraFieldDefsForImg2 = extraFieldsAfterDesc2.map(ext => ({ id: ext.id, label: ext.label?.trim() || ext.id }));
                              const setMPairs2 = (pairs: ImagePair[]) => {
                                setEditFormData(prev => {
                                  const next = { ...(prev[dom.id] || {}) };
                                  Object.keys(next).forEach(k => {
                                    if (k.startsWith(`${f.name}_`) || k.startsWith(`${descKey2}_`)) delete next[k];
                                    extraFieldDefsForImg2.forEach(d => { if (k.startsWith(`${d.label}_`)) delete next[k]; });
                                  });
                                  pairs.forEach((p, i) => {
                                    next[`${f.name}_${i}`] = p.img;
                                    next[`${descKey2}_${i}`] = p.desc;
                                    extraFieldDefsForImg2.forEach(d => {
                                      next[`${d.label}_${i}`] = (p.extras || {})[d.label] || '';
                                    });
                                  });
                                  return { ...prev, [dom.id]: next };
                                });
                              };
                              const mPairs2WithExtras: ImagePair[] = mPairs2.map((p, i) => ({
                                ...p,
                                extras: extraFieldDefsForImg2.reduce((acc, d) => {
                                  acc[d.label] = (editFormData[dom.id] || {})[`${d.label}_${i}`] || '';
                                  return acc;
                                }, {} as Record<string, string>)
                              }));
                              return (
                                <ImageUploadInput
                                  multiple={true}
                                  pairs={mPairs2WithExtras}
                                  onAddPair={(img, desc, extras) => setMPairs2([...mPairs2WithExtras, { img, desc, extras }])}
                                  onUpdatePair={(mI, img, desc, extras) => { const p = [...mPairs2WithExtras]; p[mI] = { img, desc, extras }; setMPairs2(p); }}
                                  onRemovePair={(mI) => setMPairs2(mPairs2WithExtras.filter((_, i) => i !== mI))}
                                  descLabel={descExt2?.label || '요약설명'}
                                  extraFieldDefs={extraFieldDefsForImg2}
                                  fieldName={f.name}
                                />
                              );
                            }
                            return (
                              <ImageUploadInput
                                value={currentVal}
                                onChange={val => setEditFormData(prev => ({
                                  ...prev,
                                  [dom.id]: { ...(prev[dom.id] || {}), [f.name]: val }
                                }))}
                                fieldName={f.name}
                              />
                            );
                          })() : f.inputType === 'tree' && f.treeData && f.treeData.length > 0 ? (
                            <select
                              className="capture-form-input"
                              value={currentVal}
                              onChange={e => setEditFormData(prev => ({
                                ...prev,
                                [dom.id]: { ...(prev[dom.id] || {}), [f.name]: e.target.value }
                              }))}
                            >
                              <option value="">{f.name} 선택...</option>
                              {(() => {
                                const options: { path: string; label: string; depth: number }[] = [];
                                const collectOptions = (nodes: TreeNode[], prefix: string = '', depth: number = 0) => {
                                  nodes.forEach(n => {
                                    const p = prefix ? `${prefix} > ${n.label}` : n.label;
                                    options.push({ path: p, label: n.label, depth });
                                    if (n.children) collectOptions(n.children, p, depth + 1);
                                  });
                                };
                                collectOptions(f.treeData!);
                                return options.map(opt => (
                                  <option key={opt.path} value={opt.path}>
                                    {'  '.repeat(opt.depth)}{opt.label}
                                  </option>
                                ));
                              })()}
                            </select>
                          ) : f.inputType === 'textarea' ? (
                            <textarea
                              className="capture-form-textarea"
                              placeholder={`${f.name} 입력...`}
                              value={currentVal}
                              onChange={e => setEditFormData(prev => ({
                                ...prev,
                                [dom.id]: { ...(prev[dom.id] || {}), [f.name]: e.target.value }
                              }))}
                              rows={2}
                            />
                          ) : (
                            <input
                              type={f.inputType === 'number' ? 'number' : f.inputType === 'date' ? 'date' : 'text'}
                              className="capture-form-input"
                              placeholder={`${f.name} 입력...`}
                              value={currentVal}
                              onChange={e => {
                                let val = e.target.value;
                                if (f.inputType === 'tel' || f.format === 'phone' || f.name.includes('전화') || f.name.includes('핸드폰') || f.name.includes('연락처')) {
                                  val = formatPhoneNumber(val);
                                } else {
                                  val = applyAutoFormat(val, f.name, f.inputType, f.format);
                                }
                                setEditFormData(prev => ({
                                  ...prev,
                                  [dom.id]: { ...(prev[dom.id] || {}), [f.name]: val }
                                }));
                              }}
                            />
                          )}

                          {/* 편집 모드 extraFields 렌더링 */}
                          {/* fileMode=multiple인 이미지 필드의 extraFields는 MultipleImageUpload 내부에서 처리 */}
                          {f.extraFields && f.extraFields.length > 0 && !(isImg && (f.fileMode === 'multiple' || f.multiple)) && (
                            <div className="scan-extra-fields-wrap" style={{ marginTop: '8px', padding: '8px 10px', background: 'rgba(248, 250, 252, 0.8)', border: '1px dashed #cbd5e1', borderRadius: '6px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              {f.extraFields.map(ext => {
                                const extKey = ext.label?.trim() || ext.id;
                                const extVal = (editFormData[dom.id] || {})[extKey] || '';
                                const isExtImg = ext.inputType === 'image' || ext.inputType === 'camera';

                                return (
                                  <div key={ext.id} className="scan-domain-field scan-domain-extra-field">
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.74rem', color: '#475569', fontWeight: 600, marginBottom: '4px' }}>
                                      <span style={{ fontSize: '0.62rem', padding: '1px 5px', borderRadius: '3px', background: '#e0e7ff', color: '#4338ca', fontWeight: 700 }}>추가</span>
                                      {ext.label || '추가 필드'}
                                    </label>
                                    {isExtImg ? (
                                      <ImageUploadInput
                                        value={extVal}
                                        onChange={val => {
                                          setEditFormData(prev => ({
                                            ...prev,
                                            [dom.id]: { ...(prev[dom.id] || {}), [extKey]: val }
                                          }));
                                        }}
                                        fieldName={ext.label || '이미지'}
                                      />
                                    ) : ext.inputType === 'textarea' ? (
                                      <textarea
                                        className="capture-form-textarea"
                                        placeholder={`${ext.label || '내용'} 입력...`}
                                        value={extVal}
                                        onChange={e => setEditFormData(prev => ({
                                          ...prev,
                                          [dom.id]: { ...(prev[dom.id] || {}), [extKey]: e.target.value }
                                        }))}
                                        rows={2}
                                      />
                                    ) : (
                                      <input
                                        type={ext.inputType === 'number' ? 'number' : ext.inputType === 'date' ? 'date' : 'text'}
                                        className="capture-form-input"
                                        placeholder={`${ext.label || '내용'} 입력...`}
                                        value={extVal}
                                        onChange={e => {
                                          let val = e.target.value;
                                          if (ext.inputType === 'tel') val = formatPhoneNumber(val);
                                          setEditFormData(prev => ({
                                            ...prev,
                                            [dom.id]: { ...(prev[dom.id] || {}), [extKey]: val }
                                          }));
                                        }}
                                      />
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    };

                    return (
                      <div key={dom.id} className="scan-domain-card">
                        <div
                          className="scan-domain-card-header"
                          onClick={() => handleToggleCollapseDomainCard(dom.id)}
                          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <button
                              type="button"
                              className="scan-domain-icon-config-btn"
                              title="필드 설정"
                              onClick={e => { e.stopPropagation(); setFieldConfigPopup(prev => prev === dom.id ? null : dom.id); }}
                              style={{ background: 'none', border: 'none', padding: '2px 3px', cursor: 'pointer', display: 'flex', alignItems: 'center', borderRadius: '4px', color: fieldConfigPopup === dom.id ? '#818cf8' : '#64748b' }}
                            >
                              <Layers size={13} />
                            </button>
                            <span>
                              {(() => {
                                const origin = domainOriginMap.get(dom.id);
                                const nodeLabel = origin?.node?.label || (editingItem.treePath ? (editingItem.treePath.split(' > ').pop() || editingItem.treePath) : undefined);
                                return nodeLabel ? `${nodeLabel} : ${dom.name}` : dom.name;
                              })()}
                            </span>
                          </div>
                          <button
                            type="button"
                            className="scan-domain-collapse-btn"
                            onClick={e => { e.stopPropagation(); handleToggleCollapseDomainCard(dom.id); }}
                            title={isDomainCollapsed ? '도메인 펼치기' : '도메인 접기'}
                            style={{ background: 'none', border: 'none', color: '#a5b4fc', cursor: 'pointer', padding: '2px 4px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px' }}
                          >
                            {isDomainCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                          </button>
                        </div>
                        {!isDomainCollapsed && (
                          <div className="scan-domain-card-fields">
                            {activeFields.map(f => renderEditField(f))}
                            {hasCameraField && (
                              <div className="scan-domain-auto-strip">
                                <div className="scan-auto-strip-item scan-auto-size" title="측정 사이즈">
                                  <Ruler size={16} className="scan-auto-icon" />
                                  <span className="scan-auto-val">
                                    {editingItem.width && editingItem.width !== '미측정'
                                      ? `${editingItem.width} × ${editingItem.height} mm`
                                      : '미측정'}
                                  </span>
                                </div>
                                <div className="scan-auto-strip-item scan-auto-camera" title="카메라 연결됨">
                                  <div className="scan-camera-on-pill">
                                    <span className="scan-camera-dot" />
                                    <Camera size={14} />
                                  </div>
                                </div>
                              </div>
                            )}
                            {hiddenFields.length > 0 && (
                              <>
                                <button
                                  type="button"
                                  className="scan-hidden-toggle"
                                  onClick={() => handleToggleScanHidden(dom.id)}
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: '4px',
                                    background: 'none', border: '1px dashed #64748b', borderRadius: '4px',
                                    color: isHiddenExpanded ? '#6366f1' : '#94a3b8',
                                    cursor: 'pointer', padding: '4px 8px', marginTop: '4px',
                                    fontSize: '11px', width: '100%', justifyContent: 'center'
                                  }}
                                >
                                  {isHiddenExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                  숨김 필드 {hiddenFields.length}개 {isHiddenExpanded ? '접기' : '펼치기'}
                                </button>
                                {isHiddenExpanded && hiddenFields.map(f => renderEditField(f))}
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {editDomains.length === 0 && (
                <div style={{ color: '#64748b', textAlign: 'center', padding: '30px 20px', fontSize: '13px' }}>
                  연결된 도메인이 없습니다
                </div>
              )}
            </div>
          </div>
          {renderBottombar()}
          </>
        );
      })()}

      {/* ====== 저장 완료 ====== */}
      {phase === 'saved' && (
        <>
        <div className="autoscan-capture-layout">
          <div
            className="autoscan-capture-left"
            onWheel={handleCaptureWheel}
            onPointerDown={handleCapturePointerDown}
            onPointerMove={handleCapturePointerMove}
            onPointerUp={handleCapturePointerUp}
            onPointerCancel={handleCapturePointerUp}
            onDoubleClick={handleCaptureReset}
            style={{
              cursor: isCapturePanning ? 'grabbing' : 'grab',
              userSelect: 'none',
              touchAction: 'none',
            }}
          >
            <div
              className="autoscan-capture-viewport"
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transform: `translate(${capturePan.x}px, ${capturePan.y}px) scale(${captureZoom})`,
                transformOrigin: 'center center',
                transition: isCapturePanning ? 'none' : 'transform 0.1s ease-out',
              }}
            >
              {centralDisplayImage ? (
                <img
                  src={centralDisplayImage}
                  alt="저장된 이미지"
                  className="autoscan-capture-image"
                  draggable={false}
                />
              ) : (
                <div className="autoscan-empty-viewport-notice" style={{ textAlign: 'center', color: '#94a3b8', padding: '40px 20px' }}>
                  <Upload size={44} style={{ color: '#818cf8', marginBottom: '14px' }} />
                  <div style={{ fontSize: '16px', fontWeight: 600, color: '#f1f5f9', marginBottom: '8px' }}>
                    저장된 이미지 없음
                  </div>
                </div>
              )}
            </div>

            {/* 플로팅 줌 & 이동 컨트롤 바 */}
            <div className="capture-zoom-controls">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setCaptureZoom(z => Math.min(8, Math.round((z + 0.3) * 10) / 10)); }}
                title="확대 (마우스 휠 위로)"
              >
                <ZoomIn size={15} />
              </button>
              <span
                onClick={(e) => { e.stopPropagation(); handleCaptureReset(); }}
                title="클릭 시 100% 원본 비율로 복원"
              >
                {Math.round(captureZoom * 100)}%
              </span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setCaptureZoom(z => Math.max(0.4, Math.round((z - 0.3) * 10) / 10)); }}
                title="축소 (마우스 휠 아래로)"
              >
                <ZoomOut size={15} />
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleCaptureReset(); }}
                title="위치 및 크기 초기화 (더블클릭)"
              >
                <RotateCcw size={13} />
              </button>
              <div className="capture-zoom-hint">
                <Move size={12} />
                <span>드래그 이동 · 휠 확대축소</span>
              </div>
              {/* 업로드/카메라 전환 탭 - 줌 바 우측에 구분선 후 배치 */}
              {uploadedImageFromForm && (
                <>
                  <span className="capture-zoom-sep" />
                  <span className="capture-source-label">
                    <Upload size={11} />
                    업로드 이미지
                  </span>
                  <button
                    type="button"
                    className="capture-source-switch-btn"
                    onClick={(e) => { e.stopPropagation(); setActivePreviewImage(null); }}
                    title="카메라 화면으로 전환"
                  >
                    <Camera size={11} />
                    카메라 전환
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="autoscan-capture-right" style={{ alignItems: 'center', justifyContent: 'center' }}>
            <div className="autoscan-saved-badge">
              <Check size={16} />
              <span>저장 완료</span>
            </div>
          </div>
        </div>
        {renderBottombar()}
        </>
      )}

      {/* ====== 도메인 연결 설정 팝업 ====== */}
      {domainLinkPopup && (() => {
        const { node: popupNode, path: popupPath } = domainLinkPopup;
        // 현재 연결된 도메인 ID 목록
        const currentLinkedIds = (() => {
          const ids = new Set<string>();
          if (popupNode.linkedDomainIds) popupNode.linkedDomainIds.forEach(id => ids.add(id));
          if (popupNode.linkedDomainId) ids.add(popupNode.linkedDomainId);
          const byName = domains.find(d => d.name === popupNode.label);
          if (byName) ids.add(byName.id);
          return ids;
        })();
        // 로컬 체크 상태 (팝업 내 임시 state 대신 직접 currentLinkedIds 기준으로 토글)
        return (
          <div className="field-config-popup-backdrop" onClick={() => setDomainLinkPopup(null)}>
            <div className="field-config-popup domain-link-popup" onClick={e => e.stopPropagation()}>
              <div className="field-config-popup-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Link2 size={14} style={{ color: '#818cf8' }} />
                  <span style={{ fontWeight: 600, fontSize: '13px', color: '#e2e8f0' }}>
                    도메인 연결 설정
                  </span>
                </div>
                <button type="button" onClick={() => setDomainLinkPopup(null)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '16px', lineHeight: 1, padding: '2px 6px' }}>✕</button>
              </div>

              {/* 노드 경로 표시 */}
              <div style={{ padding: '8px 16px', background: '#0f172a', borderBottom: '1px solid #1e293b', fontSize: '11px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <FolderTree size={11} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {popupPath.split(' > ').join(' › ')}
                </span>
              </div>

              {/* 연결된 도메인 — 순서 변경 가능 */}
              {(() => {
                // linkedDomainIds 순서 기준의 연결 목록
                const linkedOrder = (() => {
                  const ids = popupNode.linkedDomainIds || (popupNode.linkedDomainId ? [popupNode.linkedDomainId] : []);
                  const nameMatchDom = domains.find(d => d.name === popupNode.label);
                  const result: { dom: Domain; isNameMatch: boolean }[] = [];
                  // linkedDomainIds 순서 우선
                  ids.forEach(id => {
                    const dom = domains.find(d => d.id === id);
                    if (dom) result.push({ dom, isNameMatch: dom.name === popupNode.label });
                  });
                  // 이름 매칭 도메인이 linkedDomainIds에 없으면 맨 앞에 추가
                  if (nameMatchDom && !ids.includes(nameMatchDom.id)) {
                    result.unshift({ dom: nameMatchDom, isNameMatch: true });
                  }
                  return result;
                })();

                const moveOrder = (idx: number, dir: -1 | 1) => {
                  const currentIds = (popupNode.linkedDomainIds || []);
                  // 이름 매칭(자동) 제외하고 linkedDomainIds만 재정렬
                  const manualIds = [...currentIds];
                  const newIdx = idx + dir;
                  if (newIdx < 0 || newIdx >= manualIds.length) return;
                  [manualIds[idx], manualIds[newIdx]] = [manualIds[newIdx], manualIds[idx]];
                  updateNodeLinkedDomains(popupNode.id, manualIds);
                  setDomainLinkPopup(prev => prev ? {
                    ...prev,
                    node: { ...prev.node, linkedDomainIds: manualIds }
                  } : null);
                };

                const unlink = (domId: string) => {
                  const newIds = (popupNode.linkedDomainIds || []).filter(id => id !== domId);
                  updateNodeLinkedDomains(popupNode.id, newIds);
                  setDomainLinkPopup(prev => prev ? {
                    ...prev,
                    node: { ...prev.node, linkedDomainIds: newIds }
                  } : null);
                };

                const manualIds = popupNode.linkedDomainIds || [];

                return (
                  <div className="field-config-popup-table" style={{ maxHeight: '380px' }}>
                    {linkedOrder.length > 0 && (
                      <>
                        <div className="dlr-section-label">연결된 도메인 <span style={{ color: '#475569' }}>(드래그로 순서 변경)</span></div>
                        {linkedOrder.map(({ dom, isNameMatch }) => {
                          // linkedDomainIds 내 인덱스 (이름매칭은 -1)
                          const manualIdx = manualIds.indexOf(dom.id);
                          return (
                            <div key={dom.id} className="domain-link-row linked">
                              {/* 순서 변경 버튼 */}
                              <div className="dlr-order-btns">
                                {!isNameMatch && (
                                  <>
                                    <button
                                      type="button"
                                      className="dlr-order-btn"
                                      disabled={manualIdx <= 0}
                                      onClick={() => moveOrder(manualIdx, -1)}
                                      title="위로"
                                    >▲</button>
                                    <button
                                      type="button"
                                      className="dlr-order-btn"
                                      disabled={manualIdx < 0 || manualIdx >= manualIds.length - 1}
                                      onClick={() => moveOrder(manualIdx, 1)}
                                      title="아래로"
                                    >▼</button>
                                  </>
                                )}
                                {isNameMatch && <span style={{ width: '28px' }} />}
                              </div>
                              <div className="dlr-check">
                                <span className="dlr-check-icon linked"><Check size={11} /></span>
                              </div>
                              <div className="dlr-info">
                                <span className="dlr-name">{dom.name}</span>
                                {isNameMatch && <span className="dlr-auto-badge">이름 자동연결</span>}
                              </div>
                              <div className="dlr-field-count">
                                {getFieldsForDomain(dom.id).filter(f => !f.name.startsWith('_')).length}개 필드
                              </div>
                              {!isNameMatch && (
                                <button
                                  type="button"
                                  className="dlr-unlink-btn"
                                  onClick={() => unlink(dom.id)}
                                  title="연결 해제"
                                >✕</button>
                              )}
                            </div>
                          );
                        })}
                      </>
                    )}

                    {/* 미연결 도메인 */}
                    {domains.filter(d => !currentLinkedIds.has(d.id)).length > 0 && (
                      <>
                        <div className="dlr-section-label" style={{ marginTop: linkedOrder.length > 0 ? '4px' : 0 }}>연결 추가</div>
                        {domains.filter(d => !currentLinkedIds.has(d.id)).map(dom => (
                          <div
                            key={dom.id}
                            className="domain-link-row"
                            onClick={() => {
                              const newIds = [...(popupNode.linkedDomainIds || []), dom.id];
                              updateNodeLinkedDomains(popupNode.id, newIds);
                              setDomainLinkPopup(prev => prev ? {
                                ...prev,
                                node: { ...prev.node, linkedDomainIds: newIds }
                              } : null);
                            }}
                            style={{ cursor: 'pointer' }}
                          >
                            <div className="dlr-order-btns" />
                            <div className="dlr-check">
                              <span className="dlr-check-icon unlinked" />
                            </div>
                            <div className="dlr-info">
                              <span className="dlr-name">{dom.name}</span>
                            </div>
                            <div className="dlr-field-count">
                              {getFieldsForDomain(dom.id).filter(f => !f.name.startsWith('_')).length}개 필드
                            </div>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                );
              })()}

              <div className="field-config-popup-footer">
                <span style={{ fontSize: '11px', color: '#475569', marginRight: 'auto' }}>
                  {currentLinkedIds.size}개 연결됨
                </span>
                <button
                  type="button"
                  className="fcp-reset-btn"
                  onClick={() => {
                    updateNodeLinkedDomains(popupNode.id, []);
                    setDomainLinkPopup(prev => prev ? { ...prev, node: { ...prev.node, linkedDomainIds: [] } } : null);
                  }}
                >연결 초기화</button>
                <button type="button" className="fcp-close-btn" onClick={() => setDomainLinkPopup(null)}>닫기</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ====== 필드 설정 팝업 ====== */}
      {fieldConfigPopup && (() => {
        const dom = domains.find(d => d.id === fieldConfigPopup);
        if (!dom) return null;
        const allFields = getFieldsForDomain(dom.id).filter(f => !f.name.startsWith('_') && f.inputType !== 'camera');
        return (
          <div
            className="field-config-popup-backdrop"
            onClick={() => setFieldConfigPopup(null)}
          >
            <div className="field-config-popup" onClick={e => e.stopPropagation()}>
              <div className="field-config-popup-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Layers size={14} style={{ color: '#818cf8' }} />
                  <span style={{ fontWeight: 600, fontSize: '13px', color: '#e2e8f0' }}>{dom.name} — 필드 설정</span>
                </div>
                <button
                  type="button"
                  onClick={() => setFieldConfigPopup(null)}
                  style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '16px', lineHeight: 1, padding: '2px 6px' }}
                >✕</button>
              </div>
              <div className="field-config-popup-table">
                <div className="field-config-table-head">
                  <span className="fcp-col-name">필드명</span>
                  <span className="fcp-col-use">사용여부</span>
                  <span className="fcp-col-vis">보임여부</span>
                </div>
                {allFields.map(f => {
                  const key = `${dom.id}_${f.name}`;
                  const cfg = constituentFieldStatusMap[key] || {};
                  const useStatus = cfg.useStatus || '용';
                  const visibility = cfg.visibility || '보기';
                  return (
                    <div key={f.name} className="field-config-table-row">
                      <span className="fcp-col-name">{f.name}</span>
                      <span className="fcp-col-use">
                        <button
                          type="button"
                          className={`fcp-toggle ${useStatus === '용' ? 'on' : 'off'}`}
                          onClick={() => updateFieldConfig(dom.id, f.name, { useStatus: useStatus === '용' ? '부' : '용' })}
                          title={useStatus === '용' ? '사용 중 (클릭하여 비사용)' : '비사용 (클릭하여 사용)'}
                        >
                          {useStatus === '용' ? '사용' : '비사용'}
                        </button>
                      </span>
                      <span className="fcp-col-vis">
                        <button
                          type="button"
                          className={`fcp-toggle ${visibility === '보기' ? 'on' : 'off'}`}
                          onClick={() => updateFieldConfig(dom.id, f.name, { visibility: visibility === '보기' ? '감추기' : '보기' })}
                          title={visibility === '보기' ? '보임 (클릭하여 숨기기)' : '숨김 (클릭하여 보기)'}
                        >
                          {visibility === '보기' ? '보기' : '숨김'}
                        </button>
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="field-config-popup-footer">
                <button
                  type="button"
                  className="fcp-reset-btn"
                  onClick={() => {
                    allFields.forEach(f => {
                      updateFieldConfig(dom.id, f.name, { useStatus: '용', visibility: '보기' });
                    });
                  }}
                >전체 초기화</button>
                <button
                  type="button"
                  className="fcp-close-btn"
                  onClick={() => setFieldConfigPopup(null)}
                >닫기</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ====== 상세 보기 팝업 ====== */}
      {detailPopup && (() => {
        const item = savedItems.find(i => i.id === detailPopup);
        if (!item) return null;
        return (
          <div className="detail-popup-backdrop" onClick={handleCloseDetail}>
            <div className="detail-popup" onClick={(e) => e.stopPropagation()}>
              {/* 팝업 헤더 */}
              <div className="detail-popup-header">
                <span className="detail-popup-title">이미지 상세</span>
                <div className="detail-popup-actions">
                  <button className="detail-popup-btn save" onClick={handleUpdateItem}>
                    <Save size={14} /><span>저장</span>
                  </button>
                  <button className="detail-popup-btn delete" onClick={handleDeleteItem}>
                    <RotateCcw size={14} /><span>삭제</span>
                  </button>
                  <button className="detail-popup-btn close" onClick={handleCloseDetail}>✕</button>
                </div>
              </div>

              {/* 이미지 영역 (줌 가능) */}
              <div className="detail-popup-image-area"
                onWheel={(e) => {
                  e.preventDefault();
                  setImageZoom(prev => Math.max(0.5, Math.min(5, prev + (e.deltaY > 0 ? -0.2 : 0.2))));
                }}
                onDoubleClick={() => { setImageZoom(1); setImagePan({x:0,y:0}); }}
              >
                <img
                  src={item.image}
                  alt="상세 이미지"
                  className="detail-popup-image"
                  style={{
                    transform: `scale(${imageZoom}) translate(${imagePan.x}px, ${imagePan.y}px)`,
                  }}
                  draggable={false}
                  onMouseDown={(e) => {
                    if (imageZoom <= 1) return;
                    e.preventDefault();
                    const startX = e.clientX;
                    const startY = e.clientY;
                    const startPan = { ...imagePan };
                    const handleMouseMove = (ev: MouseEvent) => {
                      setImagePan({
                        x: startPan.x + (ev.clientX - startX) / imageZoom,
                        y: startPan.y + (ev.clientY - startY) / imageZoom
                      });
                    };
                    const handleMouseUp = () => {
                      window.removeEventListener('mousemove', handleMouseMove);
                      window.removeEventListener('mouseup', handleMouseUp);
                    };
                    window.addEventListener('mousemove', handleMouseMove);
                    window.addEventListener('mouseup', handleMouseUp);
                  }}
                />
                <div className="detail-zoom-controls">
                  <button onClick={() => setImageZoom(prev => Math.min(5, prev + 0.3))}>+</button>
                  <span>{Math.round(imageZoom * 100)}%</span>
                  <button onClick={() => setImageZoom(prev => Math.max(0.5, prev - 0.3))}>−</button>
                  <button onClick={() => { setImageZoom(1); setImagePan({x:0,y:0}); }}>⟳</button>
                </div>
              </div>

              {/* 정보 패널 */}
              <div className="detail-popup-info">
                <div className="detail-info-row">
                  <span className="detail-info-label">사이즈</span>
                  <span className="detail-info-value size">
                    {item.width !== '미측정' ? `${item.width} × ${item.height} mm` : '미측정'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 저장 세트 필드 편집 팝업 */}
      {scanEditPopup && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.48)',
            zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
          }}
          onClick={() => setScanEditPopup(null)}
        >
          <div
            style={{
              background: '#fff', borderRadius: '12px', width: '100%', maxWidth: '440px',
              maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
              boxShadow: '0 20px 60px rgba(15,23,42,0.25)'
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 18px', borderBottom: '1px solid #e2e8f0', flexShrink: 0
            }}>
              <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#1e293b' }}>
                ✏️ 저장된 정보 수정
              </span>
              <button
                type="button"
                onClick={() => setScanEditPopup(null)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '2px', display: 'flex' }}
              >
                ✕
              </button>
            </div>
            <div style={{ padding: '14px 18px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {Object.entries(scanEditPopup.editedFields).map(([fk, fv]) => (
                <div key={fk} style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <label style={{ fontSize: '0.73rem', fontWeight: 600, color: '#475569' }}>{fk}</label>
                  <input
                    type="text"
                    value={fv}
                    onChange={e => setScanEditPopup(prev => prev ? {
                      ...prev,
                      editedFields: { ...prev.editedFields, [fk]: e.target.value }
                    } : null)}
                    style={{
                      border: '1px solid #cbd5e1', borderRadius: '6px', padding: '7px 10px',
                      fontSize: '0.82rem', color: '#1e293b', background: '#f8fafc', outline: 'none',
                      width: '100%', boxSizing: 'border-box' as const
                    }}
                    onFocus={e => { e.currentTarget.style.borderColor = '#6366f1'; e.currentTarget.style.background = '#fff'; }}
                    onBlur={e => { e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.background = '#f8fafc'; }}
                  />
                </div>
              ))}
            </div>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px',
              padding: '12px 18px', borderTop: '1px solid #e2e8f0', flexShrink: 0
            }}>
              <button
                type="button"
                onClick={() => setScanEditPopup(null)}
                style={{
                  padding: '6px 16px', borderRadius: '6px', border: '1px solid #cbd5e1',
                  background: '#fff', color: '#64748b', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer'
                }}
              >취소</button>
              <button
                type="button"
                onClick={() => {
                  if (!scanEditPopup) return;
                  Object.entries(scanEditPopup.editedFields).forEach(([fk, fv]) => {
                    updateEntityField(scanEditPopup.anchorId, fk, fv);
                  });
                  setScanEditPopup(null);
                }}
                style={{
                  padding: '6px 20px', borderRadius: '6px', border: 'none',
                  background: '#4f46e5', color: '#fff', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer'
                }}
              >✓ 저장</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
