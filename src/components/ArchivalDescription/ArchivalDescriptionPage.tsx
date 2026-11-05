import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  ArrowLeft, Search, X, BookOpen, Layers,
  UserCircle, FileText,
  ZoomIn, ZoomOut, Check, ChevronDown, ChevronUp, ImageOff, Pencil,
  Settings, Upload, FolderTree, RotateCcw, Move, Trash2, Save, Tags,
  Folder, ChevronRight
} from 'lucide-react';
import { useDataStore } from '../../store/useDataStore';
import { AutocompleteInput } from '../AutocompleteInput';
import { getAllAtomImages } from '../../store/imageStorage';
import { getEntityBasePrefix } from '../../utils/formatters';
import type { TreeNode } from '../../types';

/** 이미지 URL 판별 헬퍼: data:image / http / https / blob: / /local-images/ 모두 포함 */
const isImgSrc = (v: unknown): v is string =>
  typeof v === 'string' &&
  (v.startsWith('data:image') ||
    v.startsWith('http://') ||
    v.startsWith('https://') ||
    v.startsWith('blob:') ||
    v.startsWith('/local-images/'));
import './ArchivalDescriptionPage.css';

// 기본 사료분류 계층 트리
const DEFAULT_RECORD_TREE: TreeNode[] = [
  {
    id: 'rc-root',
    label: '사료분류',
    children: [
      {
        id: 'rc-std',
        label: '표준분류',
        children: [
          {
            id: 'rc-subj',
            label: '주제분류',
            children: [
              { id: 'rc-subj-pol', label: '정치·선거' },
              { id: 'rc-subj-dip', label: '외교·통일' },
              { id: 'rc-subj-soc', label: '사회·복지' },
            ]
          },
          {
            id: 'rc-time',
            label: '시기분류',
            children: [
              { id: 'rc-time-sarim', label: '사림기' },
              { id: 'rc-time-gaeshin', label: '개신전기' },
              { id: 'rc-time-sasung', label: '사성공' },
            ]
          }
        ]
      }
    ]
  }
];

interface ArchivalDescriptionPageProps {
  onBack: () => void;
}

// 아카이브 항목(상위 기록물 + 하위 구성요소) 모델
export interface ArchivalItem {
  id: string;
  orderNum: number;
  rootType: '책' | '편지' | '병풍' | string;
  rootTypeWithNum?: string; // 예: "책 1", "책 2", "병풍 1"
  pathText: string; // 예: "책 1 > 표지 (4) > 속지 (126)"
  title: string;
  heroImage?: string;
  ownerId?: string;
  ownerName?: string;
  createdAt: string;
  fields: Record<string, string>;
  rawTopEntity?: any;
  subGroups: {
    domainName: string;
    count: number;
    items: {
      id: string;
      order: number;
      image?: string;
      title: string;
      desc?: string;
      fields: Record<string, string>;
    }[];
  }[];
}


interface ArchivalTabsBarProps {
  childNodes: { id: string; label: string }[];
  activeNode: { id: string; label: string } | null;
  onSelectNode: (node: { id: string; label: string }) => void;
  countsByNode: Record<string, number>;
  domainName?: string;
}

const ArchivalTabsBar: React.FC<ArchivalTabsBarProps> = ({
  childNodes,
  activeNode,
  onSelectNode,
  countsByNode,
  domainName = '기록물',
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
    const walk = x - startXRef.current;
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
        alignItems: 'stretch',
        flex: 1,
        minWidth: 0,
        overflowX: 'auto',
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
        cursor: 'default',
        userSelect: 'none',
        background: '#e0e7ff',
        height: '35px',
      }}
    >
      {childNodes.map((childNode, index) => {
        const isTabActive = childNode.id === activeNode?.id || childNode.label === activeNode?.label;
        const count = countsByNode[childNode.label] || countsByNode[childNode.id] || 0;

        if (isTabActive) {
          return (
            <div
              key={childNode.id || index}
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '0 14px',
                background: '#ffffff',
                color: '#3730a3',
                fontWeight: 700,
                fontSize: '0.8rem',
                borderTop: '2.5px solid #4f46e5',
                borderRight: '1px solid #cbd5e1',
                borderLeft: index > 0 ? '1px solid #cbd5e1' : 'none',
                boxShadow: '0 -1px 3px rgba(0,0,0,0.05)',
                whiteSpace: 'nowrap',
                cursor: 'default',
                zIndex: 2,
                flexShrink: 0,
              }}
            >
              <Layers size={13} style={{ color: '#6366f1' }} />
              <span>{childNode.label} : {domainName}</span>
              {count > 0 && (
                <span
                  style={{
                    fontSize: '0.66rem',
                    padding: '1px 5px',
                    borderRadius: '999px',
                    background: '#e0e7ff',
                    color: '#3730a3',
                    fontWeight: 700,
                    marginLeft: '2px',
                  }}
                >
                  {count}
                </span>
              )}
            </div>
          );
        }

        return (
          <div
            key={childNode.id || index}
            onClick={(e) => {
              if (hasMovedRef.current) return;
              e.stopPropagation();
              onSelectNode(childNode);
            }}
            title={`${index + 1}번: ${childNode.label} (${count}건)`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '0 12px',
              color: '#475569',
              fontWeight: 600,
              fontSize: '0.78rem',
              cursor: 'pointer',
              borderRight: '1px solid rgba(199, 210, 254, 0.6)',
              borderTop: '2.5px solid transparent',
              background: 'transparent',
              transition: 'all 0.15s ease',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.5)';
              e.currentTarget.style.color = '#3730a3';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = '#475569';
            }}
          >
            <span>{childNode.label}</span>
            {count > 0 && (
              <span
                style={{
                  fontSize: '0.66rem',
                  padding: '1px 5px',
                  borderRadius: '999px',
                  background: '#e0e7ff',
                  color: '#4f46e5',
                  fontWeight: 700,
                }}
              >
                {count}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ArchivalDescription 전용 필드 — atom에 저장되지 않으므로 localStorage에서만 보충해야 하는 필드들
const AD_ONLY_FIELD_PATTERNS = ['사료설명', '사료개요', '_linkedClassifications'];

/**
 * localStorage의 demo_arch_fields 데이터를 atom 데이터(dataObj)에 병합할 때,
 * atom에 이미 값이 있는 필드는 덮어쓰지 않고, AD 전용 필드이거나 atom에 없는 필드만 보충합니다.
 * 이렇게 하면 Archive에서 저장한 원본 atom 데이터가 항상 우선됩니다.
 */
const mergeAdOnlyFields = (dataObj: Record<string, string>, savedFields: Record<string, any>) => {
  Object.entries(savedFields).forEach(([k, v]) => {
    // AD 전용 필드이거나 분류 라벨 패턴인 경우 항상 보충
    const isAdOnly = AD_ONLY_FIELD_PATTERNS.some(p => k.includes(p));
    // 분류 라벨 필드 ('*분류' 패턴이고 '_' 접두사가 아닌 것)
    const isClassLabel = k.endsWith('분류') && !k.startsWith('_');
    if (isAdOnly || isClassLabel) {
      dataObj[k] = v as string;
    } else if (!dataObj[k] || dataObj[k] === '' || dataObj[k] === undefined) {
      // atom에 값이 없는 필드만 보충 (atom 데이터 오버라이드 금지)
      dataObj[k] = v as string;
    }
  });
};

export const ArchivalDescriptionPage: React.FC<ArchivalDescriptionPageProps> = ({ onBack }) => {
  const { domains, blueprints, allAtoms, getAtomsForDomain, getAllPersonData, updateEntityField, getFieldValues, addFieldValue } = useDataStore();

  // 필드별 기존 등록된 고유 값 목록 (자동완성 추천용 풀)
  const getExistingValuesForField = useCallback((fieldName: string): string[] => {
    if (!fieldName) return [];
    const vals = new Set<string>();

    // 1) getFieldValues 스토어 함수에서 수집
    if (getFieldValues) {
      try {
        const list = getFieldValues(fieldName);
        list.forEach(item => {
          if (item.value && item.value.trim()) vals.add(item.value.trim());
        });
      } catch (e) {
        // ignore
      }
    }

    // 2) allAtoms에서 type === fieldName인 모든 아톰 값 수집
    allAtoms.forEach(a => {
      if (!a.deletedAt && a.type === fieldName && a.value && a.value.trim()) {
        vals.add(a.value.trim());
      }
    });

    // 3) 모든 도메인의 엔티티 data[fieldName]에서 수집
    domains.forEach(d => {
      try {
        const ents = getAtomsForDomain(d.id);
        ents.forEach(ent => {
          const v = ent.data[fieldName];
          if (v && typeof v === 'string' && !v.startsWith('data:') && !v.startsWith('blob:') && v.trim()) {
            vals.add(v.trim());
          }
        });
      } catch (e) {
        // ignore
      }
    });

    return Array.from(vals);
  }, [allAtoms, domains, getAtomsForDomain, getFieldValues]);

  // 소장자 도메인 및 엔티티 목록
  const ownerDomain = useMemo(() => domains.find(d => d.name === '소장자' || d.id === 'dom-owner'), [domains]);
  const ownerAnchorField = ownerDomain?.anchor || '이름';

  const ownerEntities = useMemo(() => {
    let list: { anchorId: string; data: Record<string, string> }[] = [];
    if (ownerDomain) {
      list = getAtomsForDomain(ownerDomain.id);
    }
    if (list.length === 0 && getAllPersonData) {
      list = getAllPersonData();
    }
    // 유효한 텍스트 필터링
    return list.filter(e => {
      const v = e.data[ownerAnchorField] || e.data['이름'] || Object.values(e.data)[0];
      return v && typeof v === 'string' && !v.startsWith('data:') && !v.startsWith('blob:') && v.trim().length > 0;
    });
  }, [ownerDomain, getAtomsForDomain, getAllPersonData, ownerAnchorField]);

  // ownerDomain.fields를 Blueprint name으로 정규화 (Blueprint ID 형식 대응)
  const ownerNormalizedFields = useMemo(() => {
    if (!ownerDomain) return [];
    return ownerDomain.fields.map(f => {
      if (!f.startsWith('atom-')) return f;
      return blueprints?.find(b => b.id === f)?.name || f;
    });
  }, [ownerDomain, blueprints]);

  // 소장자 검색 및 선택 상태
  const [selectedOwner, setSelectedOwner] = useState<{
    anchorId: string;
    label: string;
    phone?: string;
    detail?: { key: string; value: string }[];
  } | null>(null);
  const [ownerDetailExpanded, setOwnerDetailExpanded] = useState(false);
  const [ownerSearchQuery, setOwnerSearchQuery] = useState('');
  const [ownerSearchFocused, setOwnerSearchFocused] = useState(false);
  const hasInitializedOwnerRef = useRef(false);

  // IndexedDB에 분리 저장된 이미지 맵 ({ atomId 또는 fieldKey : base64 })
  const [idbImageMap, setIdbImageMap] = useState<Record<string, string>>({});
  useEffect(() => {
    getAllAtomImages().then(map => {
      if (map && Object.keys(map).length > 0) setIdbImageMap(map);
    }).catch(console.error);
  }, []);

  // 기본 소장자 자동 선택 (마운트 시 1회: localStorage 복원 우선, 없으면 첫 번째)
  useEffect(() => {
    if (ownerEntities.length === 0 || hasInitializedOwnerRef.current) return;
    hasInitializedOwnerRef.current = true;

    // 1) localStorage에 저장된 이전 선택 소장자 확인
    const savedOwnerId = localStorage.getItem('colib_selected_owner_id');
    const targetOwner = (savedOwnerId && ownerEntities.find(e =>
      e.anchorId === savedOwnerId ||
      e.anchorId.replace(/-이름$/, '') === savedOwnerId.replace(/-이름$/, '')
    )) || ownerEntities[0];

    if (targetOwner) {
      const rawAnchorVal = targetOwner.data[ownerAnchorField];
      const labelFromAnchor = (rawAnchorVal && typeof rawAnchorVal === 'string' && !rawAnchorVal.startsWith('data:') && !rawAnchorVal.startsWith('blob:') && rawAnchorVal.trim()) ? rawAnchorVal.trim() : undefined;
      const labelFromFields = ownerNormalizedFields
        .map(f => targetOwner.data[f])
        .find(v => v && typeof v === 'string' && !v.startsWith('data:') && !v.startsWith('blob:') && v.trim().length > 0 && v.length < 50);
      const label = labelFromAnchor || labelFromFields || '소장자';
      const phoneEntry = Object.entries(targetOwner.data).find(([k, v]) =>
        k !== ownerAnchorField && v && (k.includes('전화') || k.includes('phone') || k.includes('tel') || k.includes('Phone'))
      );
      const detail = Object.entries(targetOwner.data)
        .filter(([k, v]) => k !== ownerAnchorField && !k.startsWith('_') && v && k !== (phoneEntry?.[0] || '') && v !== label)
        .map(([k, v]) => ({ key: k, value: v }));

      setSelectedOwner({
        anchorId: targetOwner.anchorId,
        label,
        phone: phoneEntry ? phoneEntry[1] : undefined,
        detail: detail.length > 0 ? detail : undefined
      });
    }
  }, [ownerEntities.length]); // ownerEntities가 로드될 때 1회만 실행

  // 소장자 선택 핸들러 (선택 시 localStorage 영구 저장)
  const handleSelectOwner = useCallback((owner: { anchorId: string; label: string; phone?: string; detail?: { key: string; value: string }[] }) => {
    setSelectedOwner(owner);
    try {
      localStorage.setItem('colib_selected_owner_id', owner.anchorId);
    } catch (_) {}
  }, []);

  // 검색된 소장자 목록 (이름, 전화번호 검색 시 띄어쓰기/하이픈 무관하게 검색)
  const filteredOwnerEntities = useMemo(() => {
    if (!ownerSearchQuery.trim()) return ownerEntities;

    const normalize = (str: string) => str.replace(/[\s\-_().]/g, '').toLowerCase();
    const cleanQuery = normalize(ownerSearchQuery);
    if (!cleanQuery) return ownerEntities;

    return ownerEntities.filter(e => {
      // 1) 개별 필드 값 검사 (공백/하이픈 제거 정규화 매칭)
      const matchInField = Object.values(e.data).some(v => {
        if (!v || typeof v !== 'string' || v.startsWith('data:') || v.startsWith('blob:')) return false;
        if (v.toLowerCase().includes(ownerSearchQuery.trim().toLowerCase())) return true;
        return normalize(v).includes(cleanQuery);
      });
      if (matchInField) return true;

      // 2) 이름 + 전화번호 결합 검색 (예: "박근혜 010", "김대중4857")
      const name = e.data[ownerAnchorField] || e.data['이름'] || '';
      const phone = Object.entries(e.data).find(([k, v]) => (k.includes('전화') || k.includes('phone') || k.includes('tel')) && v)?.[1] || '';
      return normalize(`${name} ${phone}`).includes(cleanQuery);
    });
  }, [ownerEntities, ownerSearchQuery, ownerAnchorField]);

  // 소장품 트리 구조 가져오기 (AutoScan과 동일)
  const treeBlueprint = useMemo(() => {
    return blueprints?.find(b => b.inputType === 'tree' && (b.name === '소장품' || b.name.includes('소장품')))
      || blueprints?.find(b => b.inputType === 'tree' && b.treeData && b.treeData.length > 0)
      || null;
  }, [blueprints]);

  const masterTreeData = useMemo(() => treeBlueprint?.treeData || [], [treeBlueprint]);

  // 소장품 트리의 1단계 노드 목록 (예: 책, 편지, 병풍...)
  const firstLevelNodes = useMemo<any[]>(() => {
    if (!masterTreeData || masterTreeData.length === 0) return [];
    if (masterTreeData.length === 1 && masterTreeData[0].children && masterTreeData[0].children.length > 0) {
      return masterTreeData[0].children;
    }
    return masterTreeData;
  }, [masterTreeData]);

  // 소장자별 소장리스트 수량 맵 (firstLevelNodes 이후에 정의)
  const ownerItemCountMap = useMemo<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    const firstLevelNodeIds = new Set<string>(firstLevelNodes.map((n: any) => n.id));
    const nonArchiveDomainIds = new Set(['dom-bizcard', 'dom-alumni', 'dom-group', 'dom-company']);
    if (ownerDomain) nonArchiveDomainIds.add(ownerDomain.id);
    const archiveDomains = domains.filter(d => !nonArchiveDomainIds.has(d.id));
    archiveDomains.forEach(dom => {
      const entities = getAtomsForDomain(dom.id);
      entities.forEach(ent => {
        const ownerId = ent.data._ownerId;
        if (!ownerId) return;
        const treeNodeId = ent.data._treeNodeId;
        if (treeNodeId && firstLevelNodeIds.size > 0 && !firstLevelNodeIds.has(treeNodeId)) return;
        const normalizedOwnerId = ownerId.replace(/-이름$/, '');
        const matchedOwner = ownerEntities.find(oe => {
          const cleanOwnerAnchorId = oe.anchorId.replace(/-이름$/, '');
          return oe.anchorId === ownerId || oe.anchorId === normalizedOwnerId ||
            cleanOwnerAnchorId === ownerId || cleanOwnerAnchorId === normalizedOwnerId ||
            ownerId.startsWith(cleanOwnerAnchorId);
        });
        const key = matchedOwner?.anchorId || ownerId;
        map[key] = (map[key] || 0) + 1;
      });
    });
    return map;
  }, [domains, ownerEntities, ownerDomain, getAtomsForDomain, firstLevelNodes]);

  // 트리에서 노드 ID 또는 라벨로 1단계 루트 노드 찾기 (예: 'tn-book-cover' -> '책', '책' -> '책')
  const getRootNodeForNodeId = useCallback((nodes: any[], targetId: string, currentRoot?: any): any | null => {
    if (!targetId) return null;
    for (const n of nodes) {
      const thisRoot = currentRoot || n;
      if (n.id === targetId || n.label === targetId) return thisRoot;
      if (n.children && n.children.length > 0) {
        const found = getRootNodeForNodeId(n.children, targetId, thisRoot);
        if (found) return found;
      }
    }
    return null;
  }, []);

  // 기본 고품질 샘플 이미지 (사용자 요청 시연 및 폴백용)
  const SAMPLE_IMAGES = {
    bookCover1: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=800&q=80',
    bookCover2: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=800&q=80',
    bookCover3: 'https://images.unsplash.com/photo-1532012164546-f432f2e3777f?auto=format&fit=crop&w=800&q=80',
    bookPage1: 'https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?auto=format&fit=crop&w=800&q=80',
    bookPage2: 'https://images.unsplash.com/photo-1457369804613-52c61a468e7d?auto=format&fit=crop&w=800&q=80',
    letterEnv: 'https://images.unsplash.com/photo-1586075010923-2dd4570fb338?auto=format&fit=crop&w=800&q=80',
    letterPaper: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?auto=format&fit=crop&w=800&q=80',
    screenCover: 'https://images.unsplash.com/photo-1578328819058-b69f3a3b0f6b?auto=format&fit=crop&w=800&q=80'
  };

  // 소장자별 아카이브 리스트 생성 (아카이브 메뉴에서 저장된 실제 데이터 연동)
  const archivalList = useMemo<ArchivalItem[]>(() => {
    if (!selectedOwner) return [];
    const ownerName = selectedOwner.label;
    const ownerId = selectedOwner.anchorId;
    const cleanOwnerId = ownerId ? ownerId.replace(/-이름$/, '') : '';
    const norm = (s?: string) => (s || '').replace(/\s+/g, '');
    const normOwnerName = norm(ownerName);

    // 동일 소장자의 모든 ID 별칭 집합 (owner-p-park, owner-p-park2, gh-name 등)
    const activeAtoms = allAtoms ? allAtoms.filter(a => !a.deletedAt) : [];
    const matchingOwnerIdSet = new Set<string>();
    matchingOwnerIdSet.add(ownerId);
    matchingOwnerIdSet.add(cleanOwnerId);
    matchingOwnerIdSet.add(`${cleanOwnerId}-이름`);

    // 이름 아톰들 중 소장자 이름이 일치하는 모든 ID 추가
    activeAtoms.forEach(a => {
      if (a.type === '이름' && a.value && norm(a.value) === normOwnerName) {
        matchingOwnerIdSet.add(a.id);
        const cl = a.id.replace(/-이름$/, '');
        matchingOwnerIdSet.add(cl);
        matchingOwnerIdSet.add(`${cl}-이름`);
      }
    });

    const isOwnerMatch = (raw?: string) => {
      if (!raw) return false;
      if (matchingOwnerIdSet.has(raw)) return true;
      const cl = raw.replace(/-이름$/, '');
      if (matchingOwnerIdSet.has(cl)) return true;
      if (norm(raw) === normOwnerName) return true;
      return false;
    };

    // 1. 모든 도메인에서 해당 소장자(ownerId)에게 저장된 모든 엔티티 수집 (anchorId 중복 수집 방지)
    const allOwnerEntities: { domainId: string; domainName: string; anchorId: string; data: Record<string, string> }[] = [];
    const seenOwnerAnchorIds = new Set<string>();

    domains.forEach(d => {
      const domainAtoms = getAtomsForDomain(d.id);
      domainAtoms.forEach(e => {
        if (isOwnerMatch(e.data._ownerId) && !seenOwnerAnchorIds.has(e.anchorId)) {
          seenOwnerAnchorIds.add(e.anchorId);
          allOwnerEntities.push({
            domainId: d.id,
            domainName: d.name,
            anchorId: e.anchorId,
            data: e.data
          });
        }
      });
    });

    // 1-2. 직접 _ownerId로 연결된 모든 엔티티 추가 수집 (도메인 설정과 무관하게 완전 수집)
    // 데모 아이템 anchorId 패턴 (arch-item-N, cover-N-N, page-N-N, env-N-N, paper-N-N, screen-N-N 등)은 실제 엔티티에서 제외
    const isDemoId = (id: string) => /^(arch-item|cover|page|env|paper|screen|folding|scroll)-/.test(id);
    const ownerLeafAtoms = activeAtoms.filter(a =>
      a.type === '_ownerId' && a.value && isOwnerMatch(a.value)
    );
    ownerLeafAtoms.forEach(oa => {
      const conn = activeAtoms.find(a => a.type === '연결' && a.to === oa.id);
      if (conn && conn.from) {
        const anchorId = conn.from;
        // 데모 anchorId는 실제 엔티티 목록에 포함하지 않음
        if (isDemoId(anchorId)) return;
        if (!seenOwnerAnchorIds.has(anchorId) && !allOwnerEntities.some(e => e.anchorId === anchorId)) {
          seenOwnerAnchorIds.add(anchorId);
          const anchorAtom = activeAtoms.find(a => a.id === anchorId);
          const relatedConns = activeAtoms.filter(a => a.type === '연결' && a.from === anchorId);
          const data: Record<string, string> = {};
          if (anchorAtom && anchorAtom.type && anchorAtom.value) {
            data[anchorAtom.type] = anchorAtom.value;
          }
          relatedConns.forEach(rc => {
            const target = activeAtoms.find(a => a.id === rc.to);
            if (target && target.type && target.value) {
              data[target.type] = target.value;
            }
          });
          const matchedDomain = domains.find(d => d.fields.includes(anchorAtom?.type || ''));
          const isTreeFirstLevel = firstLevelNodes.some(fn => fn.id === data._treeNodeId || fn.label === data._treeNodeId);
          const computedDomainName = matchedDomain?.name || (isTreeFirstLevel ? '묶음정리' : '기록물');
          allOwnerEntities.push({
            domainId: matchedDomain?.id || 'dom-archive',
            domainName: computedDomainName,
            anchorId,
            data
          });
        }
      }
    });

    // 2. 엔티티를 최상위(묶음정리/1단계 노드)와 하위(기록물/2단계 이하 노드)로 정확하게 분류
    const isChildEntity = (ent: typeof allOwnerEntities[0]) => {
      // 1. _parentInstanceId가 명시되어 있으면 무조건 하위 엔티티
      if (ent.data._parentInstanceId) return true;

      // 2. _treeNodeId가 1단계 루트 노드(책, 병풍, 편지)이면 무조건 최상위 엔티티
      if (ent.data._treeNodeId) {
        const isRootNode = firstLevelNodes.some(fn => fn.id === ent.data._treeNodeId || fn.label === ent.data._treeNodeId);
        if (isRootNode) return false;
      }

      // 3. 상태설명이나 아카이브수량 등 최상위 묶음정리 필드를 가진 경우 최상위 엔티티
      if (ent.data['상태설명'] || ent.data['아카이브수량']) {
        return false;
      }

      // 4. _treeNodeId가 2단계 이하 하위 노드(표지, 속지, 봉투, 편지지, 폭 이미지 등)인 경우 하위 엔티티
      if (ent.data._treeNodeId) {
        const isChildNode = firstLevelNodes.some(fn => fn.children?.some((cn: any) => cn.id === ent.data._treeNodeId || cn.label === ent.data._treeNodeId));
        if (isChildNode) return true;
      }

      // 5. 도메인명이 '기록물'인 경우 하위 엔티티
      if (ent.domainName === '기록물' || ent.domainName.includes('기록물')) return true;

      // 6. 하위 도메인 전용 필드(사료사이즈 등)를 포함하고 최상위 필드가 없는 경우 하위 엔티티
      if (ent.data['사료사이즈'] && !ent.data['상태설명'] && !ent.data['아카이브수량']) return true;

      return false;
    };

    let rawTopEntities = allOwnerEntities.filter(e => !isChildEntity(e));
    const childEntities = allOwnerEntities.filter(e => isChildEntity(e));

    // 만약 상위 엔티티가 하나도 없고 하위 엔티티만 있는 경우에만 임시 승격
    if (rawTopEntities.length === 0 && childEntities.length > 0) {
      rawTopEntities = [childEntities[0]];
    }

    // 아카이브(AutoScan)의 인스턴스 번호(1번, 2번...)와 순서를 1:1 일치시키기 위해
    // AutoScan은 최신 저장이 앞(내림차순)이므로 동일하게 내림차순 정렬
    rawTopEntities.sort((a, b) => {
      const timeA = parseInt(a.data._savedAt || '0', 10);
      const timeB = parseInt(b.data._savedAt || '0', 10);
      if (timeA && timeB) return timeB - timeA; // 최신이 앞 (내림차순)
      return b.anchorId.localeCompare(a.anchorId);
    });

    const topEntities = rawTopEntities;

    const realItems: ArchivalItem[] = [];
    const typeCounters: Record<string, number> = {};

    // 최상위 엔티티들을 하나씩 분석하여 정확한 rootType과 하위 데이터 구성
    topEntities.forEach((topEnt) => {
      // 2-1. 진짜 소장품 노드(rootType) 판별
      let detectedRootNode: any = null;

      // 1순위: 엔티티에 저장된 _treeNodeId로 트리 1단계 노드 탐색
      if (topEnt.data._treeNodeId) {
        detectedRootNode = getRootNodeForNodeId(firstLevelNodes, topEnt.data._treeNodeId);
      }

      // 2순위: 도메인 이름 또는 ID로 1단계 노드 매칭 (예: '책', 'dom-book')
      if (!detectedRootNode) {
        detectedRootNode = firstLevelNodes.find(fn => fn.label === topEnt.domainName || fn.id === topEnt.domainId);
      }

      // 3순위: 데이터 텍스트에서 1단계 노드(또는 그 자식 노드)의 라벨 동적 매칭
      if (!detectedRootNode) {
        const fullText = Object.values(topEnt.data).join(' ');
        detectedRootNode = firstLevelNodes.find(fn => {
          if (fn.label && fullText.includes(fn.label)) return true;
          if (fn.children?.some((cn: any) => cn.label && fullText.includes(cn.label))) return true;
          return false;
        });
      }

      const rootType = detectedRootNode ? detectedRootNode.label : (topEnt.data['자료구분'] || topEnt.domainName || '기록물');

      // 2-2. 자료명(title) 결정: 사용자가 입력한 제목 또는 상태설명
      const title = topEnt.data['제목'] || topEnt.data['상태설명'] || topEnt.data['자료명'] || topEnt.data['간략설명'] || `${rootType} 자료`;

      // 2-3. 대표 이미지 (오직 최상위 묶음정리 자체에 저장된 이미지, 하위 속지/표지 등 자식 이미지 혼입 금지)
      let heroImg = Object.values(topEnt.data).find(isImgSrc) || undefined;
      // IndexedDB에서 대표 이미지 복원 (basePrefix 또는 anchorId 매칭, 첫 번째 매칭만 사용)
      if (!heroImg) {
        const topBasePrefix = topEnt.anchorId ? getEntityBasePrefix(topEnt.anchorId) : '';
        for (const [k, v] of Object.entries(idbImageMap)) {
          if (((topBasePrefix && k.startsWith(topBasePrefix)) || (topEnt.anchorId && k.startsWith(topEnt.anchorId))) && isImgSrc(v)) {
            heroImg = v;
            break; // 첫 번째 매칭 이미지만 사용 (마지막 것으로 덮어쓰기 방지)
          }
        }
      }
      if (!heroImg) {
        try {
          const stored = localStorage.getItem(`demo_arch_fields_${topEnt.anchorId}`);
          if (stored) {
            const parsed = JSON.parse(stored);
            const found = Object.values(parsed).find(isImgSrc);
            if (found) heroImg = found as string;
          }
        } catch (_) {}
      }

      // 2-4. 등록 일자
      let dateStr = '2026-10-28';
      if (topEnt.data._savedAt) {
        const num = parseInt(topEnt.data._savedAt, 10);
        if (!isNaN(num)) {
          dateStr = new Date(num).toISOString().slice(0, 10);
        }
      }

      // 2-5. 필드 메타데이터
      const fields: Record<string, string> = {};
      Object.entries(topEnt.data).forEach(([k, v]) => {
        if (!k.startsWith('_') && typeof v === 'string' && !isImgSrc(v)) {
          fields[k] = v;
        }
      });
      // 분류항 연결정보 메타데이터 보존
      if (topEnt.data._linkedClassifications) {
        fields['_linkedClassifications'] = topEnt.data._linkedClassifications;
      }
      // 요약설명_0 또는 요약설명이 있으면 요약설명으로 정규화
      if (!fields['요약설명'] && topEnt.data['요약설명_0']) {
        fields['요약설명'] = topEnt.data['요약설명_0'];
      }
      // '제목', '자료구분' 등의 임의 가짜 필드는 주입하지 않음 (실제 도메인 필드만 유지)

      // 2-6. 하위 구성요소(subGroups) 수집
      const subGroups: ArchivalItem['subGroups'] = [];
      const childNodes: any[] = detectedRootNode?.children || [];

      // A) 해당 topEnt를 부모로 가진 childEntities 탐색
      const directChildren = childEntities.filter(ce => ce.data._parentInstanceId === topEnt.anchorId);

      // 트리 자식 노드별로 그룹화
      childNodes.forEach((cNode) => {
        const matchedForNode = directChildren.filter(ce => {
          if (ce.data._treeNodeId) {
            return ce.data._treeNodeId === cNode.id || ce.data._treeNodeId === cNode.label;
          }
          return ce.domainName === cNode.label ||
            Object.entries(ce.data).some(([k, v]) => !k.startsWith('_') && typeof v === 'string' && v.trim() === cNode.label);
        });

        // 생성 시간 순(등록 순서 내림차순 - AutoScan과 일치)으로 정렬
        matchedForNode.sort((a, b) => {
          const timeA = parseInt(a.data._savedAt || '0', 10);
          const timeB = parseInt(b.data._savedAt || '0', 10);
          if (timeA && timeB) return timeB - timeA;
          return b.anchorId.localeCompare(a.anchorId);
        });

        const childItems: ArchivalItem['subGroups'][0]['items'] = [];
        const seenItemImages = new Set<string>();

        matchedForNode.forEach((ca) => {
          // 복수 이미지 suffix 처리
          const suffixImages = Object.entries(ca.data)
            .filter(([k, v]) => /^.+_\d+$/.test(k) && isImgSrc(v));

          if (suffixImages.length > 0) {
            suffixImages.forEach(([k, v]) => {
              // 동일한 이미지가 이미 등록되어 있다면 중복 건너뜀
              if (seenItemImages.has(v)) return;
              seenItemImages.add(v);

              const idxNum = k.split('_').pop();
              const desc = ca.data[`이미지설명_${idxNum}`] || ca.data['상세설명'] || `${cNode.label} #${childItems.length + 1}`;
              childItems.push({
                id: `${ca.anchorId}_${idxNum}`,
                order: childItems.length + 1,
                image: v,
                title: `${cNode.label} ${childItems.length + 1}`,
                desc,
                fields: {
                  ...Object.fromEntries(
                    Object.entries(ca.data).filter(([k2, v2]) =>
                      !k2.startsWith('_') && typeof v2 === 'string' && !isImgSrc(v2)
                    )
                  ),
                  ...(ca.data._linkedClassifications ? { _linkedClassifications: ca.data._linkedClassifications } : {})
                }
              });
            });
          } else {
            let cImg = Object.values(ca.data).find(isImgSrc);
            if (!cImg) {
              const caBasePrefix = ca.anchorId ? getEntityBasePrefix(ca.anchorId) : '';
              for (const [k, v] of Object.entries(idbImageMap)) {
                if (((caBasePrefix && k.startsWith(caBasePrefix)) || (ca.anchorId && k.startsWith(ca.anchorId))) && isImgSrc(v)) {
                  cImg = v;
                  break; // 첫 번째 매칭만 사용
                }
              }
            }
            // 동일한 이미지가 이미 등록되어 있다면 중복 건너뜀
            if (cImg && seenItemImages.has(cImg)) return;
            if (cImg) seenItemImages.add(cImg);

            const desc = ca.data['상세설명'] || ca.data['설명'] || `${cNode.label} 자료`;
            childItems.push({
              id: ca.anchorId,
              order: childItems.length + 1,
              image: cImg || undefined,
              title: `${cNode.label} ${childItems.length + 1}`,
              desc,
              fields: {
                ...Object.fromEntries(
                  Object.entries(ca.data).filter(([k, v]) =>
                    !k.startsWith('_') && typeof v === 'string' && !isImgSrc(v)
                  )
                ),
                ...(ca.data._linkedClassifications ? { _linkedClassifications: ca.data._linkedClassifications } : {})
              }
            });
          }
        });

        if (childItems.length > 0) {
          subGroups.push({
            domainName: cNode.label,
            count: childItems.length,
            items: childItems
          });
        }
      });

      // B) 만약 directChildren에 아직 포함되지 않은 다른 하위 엔티티가 있다면 도메인명으로 그룹화
      const alreadyAddedIds = new Set(subGroups.flatMap(sg => sg.items.map(it => it.id.split('_')[0])));
      const remainingChildren = directChildren.filter(ce => !alreadyAddedIds.has(ce.anchorId));
      if (remainingChildren.length > 0) {
        const byDom: Record<string, typeof remainingChildren> = {};
        remainingChildren.forEach(rc => {
          if (!byDom[rc.domainName]) byDom[rc.domainName] = [];
          byDom[rc.domainName].push(rc);
        });
        Object.entries(byDom).forEach(([dName, list]) => {
          const listItems: ArchivalItem['subGroups'][0]['items'] = [];
          const seenRemImages = new Set<string>();
          list.forEach((item) => {
            const img = Object.values(item.data).find(isImgSrc) || undefined;
            if (img && seenRemImages.has(img)) return;
            if (img) seenRemImages.add(img);

            listItems.push({
              id: item.anchorId,
              order: listItems.length + 1,
              image: img,
              title: `${dName} ${listItems.length + 1}`,
              desc: item.data['상세설명'] || item.data['설명'] || '',
              fields: item.data
            });
          });
          if (listItems.length > 0) {
            subGroups.push({
              domainName: dName,
              count: listItems.length,
              items: listItems
            });
          }
        });
      }

      // rootType별 순번 계산 (예: 책 1, 책 2, 병풍 1, 병풍 2)
      typeCounters[rootType] = (typeCounters[rootType] || 0) + 1;
      const typeIndex = typeCounters[rootType];
      const rootTypeWithNum = `${rootType} ${typeIndex}`;

      // 2-7. pathText 생성 (예: "책 1", "책 2", "병풍 1", "병풍 2" / 하위 구성시 "책 1 > 표지 (4)...")
      let pathText = rootTypeWithNum;
      if (subGroups.length > 0) {
        pathText += ' > ' + subGroups.map(sg => `${sg.domainName} (${sg.count})`).join(' > ');
      }

      realItems.push({
        id: topEnt.anchorId,
        orderNum: realItems.length + 1,
        rootType,
        rootTypeWithNum,
        pathText,
        title,
        heroImage: heroImg || undefined,
        ownerId,
        ownerName,
        createdAt: dateStr,
        fields,
        rawTopEntity: topEnt,
        subGroups
      });
    });

    // 3. 등록된 자료만 필터링: 이미지가 등록되었거나, 하위 기록물이 있거나, 텍스트 필드가 있는 실제 자료 표시
    // (데이터가 전혀 없는 완전 빈 껍데기만 제외)
    const validRealItems = realItems.filter(item => {
      const hasHeroImage = !!item.heroImage;
      const hasSubImages = item.subGroups.some(sg => sg.items.some(it => !!it.image));
      const hasSubItems = item.subGroups.some(sg => sg.items.length > 0);
      const hasFieldContent = Object.entries(item.fields).some(([k, v]) => !k.startsWith('_') && v && v.trim().length > 0);
      return hasHeroImage || hasSubImages || hasSubItems || hasFieldContent;
    });

    if (validRealItems.length > 0) {
      return validRealItems;
    }

    // 4. 저장된 엔티티가 전혀 없고 기본 박근혜 소장자인 경우에만 안내용 데모 세트 반환
    if (ownerName.replace(/\s+/g, '').includes('박근혜')) {
      const applyDemoOverrides = (id: string, defaultFields: Record<string, string>) => {
        try {
          const stored = localStorage.getItem(`demo_arch_fields_${id}`);
          if (stored) {
            const parsed = JSON.parse(stored);
            return { ...defaultFields, ...parsed };
          }
        } catch (_) {}
        return defaultFields;
      };

      const item1: ArchivalItem = {
        id: 'arch-item-1',
        orderNum: 1,
        rootType: '책',
        rootTypeWithNum: '책 1',
        pathText: '책 1 > 표지 (4) > 속지 (126)',
        title: `${ownerName}의 첫번째 고문헌 (책)`,
        heroImage: SAMPLE_IMAGES.bookCover1,
        ownerId,
        ownerName,
        createdAt: '2026-10-28',
        fields: applyDemoOverrides('arch-item-1', {
          '자료구분': '고서/전적',
          '제목': `${ownerName}의 첫번째 고문헌 (책)`,
          '간략설명': `${ownerName} 소장 희귀 고문서 자서전`,
          '페이지수': '130',
          '보존상태': '양호 (표지 보수 완료)',
          '측정사이즈': '188 × 258 mm',
          '기록물형태': '필사본 / 목판본'
        }),
        subGroups: [
          {
            domainName: '표지',
            count: 4,
            items: Array.from({ length: 4 }).map((_, i) => ({
              id: `cover-1-${i + 1}`,
              order: i + 1,
              image: i % 2 === 0 ? SAMPLE_IMAGES.bookCover1 : SAMPLE_IMAGES.bookCover2,
              title: `앞표지 ${i + 1}면`,
              desc: i === 0 ? '전면 표지 능화판 문양 및 제첨' : `표지 세부 안감 및 배접면 #${i + 1}`,
              fields: applyDemoOverrides(`cover-1-${i + 1}`, {
                '면구분': i === 0 ? '앞표지(외면)' : (i === 1 ? '앞표지(내면)' : `배접지 ${i}번`),
                '간략설명': `보존 보강된 표지 ${i + 1}`,
                '상태': '원형 보존 양호'
              })
            }))
          },
          {
            domainName: '속지',
            count: 126,
            items: Array.from({ length: 126 }).map((_, i) => ({
              id: `page-1-${i + 1}`,
              order: i + 1,
              image: i % 2 === 0 ? SAMPLE_IMAGES.bookPage1 : SAMPLE_IMAGES.bookPage2,
              title: `속지 ${i + 1}면 (p.${i + 1})`,
              desc: `${i + 1}번째 본문 페이지 스캔본`,
              fields: applyDemoOverrides(`page-1-${i + 1}`, {
                '페이지번호': `${i + 1}`,
                '행자수': '10행 20자',
                '인쇄상태': '선명',
                '특이사항': i === 0 ? '서문(序文) 시작면' : (i === 125 ? '발문(跋文) 및 간기면' : '본문 내용')
              })
            }))
          }
        ]
      };

      const item2: ArchivalItem = {
        id: 'arch-item-2',
        orderNum: 2,
        rootType: '책',
        rootTypeWithNum: '책 2',
        pathText: '책 2 > 표지 (1) > 속지 (20)',
        title: `${ownerName}의 자서전 2권`,
        heroImage: SAMPLE_IMAGES.bookCover3,
        ownerId,
        ownerName,
        createdAt: '2026-10-29',
        fields: {
          '자료구분': '간행물/단행본',
          '제목': `${ownerName}의 자서전 2권`,
          '간략설명': '중요 기록물 요약집',
          '페이지수': '21',
          '보존상태': '상태 우수',
          '측정사이즈': '152 × 225 mm',
          '기록물형태': '활판 인쇄'
        },
        subGroups: [
          {
            domainName: '표지',
            count: 1,
            items: [
              {
                id: 'cover-2-1',
                order: 1,
                image: SAMPLE_IMAGES.bookCover3,
                title: '표지 전면',
                desc: '단행본 표지 및 서명 인쇄',
                fields: {
                  '면구분': '외표지',
                  '간략설명': '정면 타이틀 표지'
                }
              }
            ]
          },
          {
            domainName: '속지',
            count: 20,
            items: Array.from({ length: 20 }).map((_, i) => ({
              id: `page-2-${i + 1}`,
              order: i + 1,
              image: i % 2 === 0 ? SAMPLE_IMAGES.bookPage2 : SAMPLE_IMAGES.bookPage1,
              title: `속지 ${i + 1}면 (p.${i + 1})`,
              desc: `자서전 내용 본문 #${i + 1}`,
              fields: {
                '페이지번호': `${i + 1}`,
                '상태': '보존 양호'
              }
            }))
          }
        ]
      };

      const item3: ArchivalItem = {
        id: 'arch-item-3',
        orderNum: 3,
        rootType: '편지',
        rootTypeWithNum: '편지 1',
        pathText: '편지 1 > 봉투 (1) > 편지지 (1)',
        title: `${ownerName} 친필 서한 (봉투 일괄)`,
        heroImage: SAMPLE_IMAGES.letterEnv,
        ownerId,
        ownerName,
        createdAt: '2026-10-30',
        fields: {
          '자료구분': '고문서/서간류',
          '제목': `${ownerName} 친필 서한 (봉투 일괄)`,
          '간략설명': '친필 작성 서한 및 우편 봉투',
          '발신인': `${ownerName}`,
          '수신인': '미상',
          '보존상태': '약간의 변색 (보존처리 요망)',
          '측정사이즈': '105 × 220 mm',
          '기록물형태': '육필 한지 서간'
        },
        subGroups: [
          {
            domainName: '봉투',
            count: 1,
            items: [
              {
                id: 'env-3-1',
                order: 1,
                image: SAMPLE_IMAGES.letterEnv,
                title: '수신 봉투 겉면',
                desc: '발신 주소 및 우표 날인',
                fields: {
                  '우표날인': '확인됨',
                  '보존등급': 'B+'
                }
              }
            ]
          },
          {
            domainName: '편지지',
            count: 1,
            items: [
              {
                id: 'paper-3-1',
                order: 1,
                image: SAMPLE_IMAGES.letterPaper,
                title: '친필 편지지 1면',
                desc: '안부 및 격려문 육필 기재',
                fields: {
                  '장수': '1 / 1',
                  '필기구': '먹 / 붓글씨'
                }
              }
            ]
          }
        ]
      };

      const item4: ArchivalItem = {
        id: 'arch-item-4',
        orderNum: 4,
        rootType: '편지',
        rootTypeWithNum: '편지 2',
        pathText: '편지 2 > 편지지 (2)',
        title: `${ownerName} 격려 서신 (편지지 2매)`,
        heroImage: SAMPLE_IMAGES.letterPaper,
        ownerId,
        ownerName,
        createdAt: '2026-10-30',
        fields: {
          '자료구분': '고문서/서간류',
          '제목': `${ownerName} 격려 서신 (편지지 2매)`,
          '간략설명': '봉투 분실, 2매 구성 편지지',
          '발신인': `${ownerName}`,
          '보존상태': '양호',
          '측정사이즈': '190 × 265 mm',
          '기록물형태': '만년필 친필'
        },
        subGroups: [
          {
            domainName: '편지지',
            count: 2,
            items: [
              {
                id: 'paper-4-1',
                order: 1,
                image: SAMPLE_IMAGES.letterPaper,
                title: '편지지 제1면',
                desc: '서두 및 안부 인사',
                fields: {
                  '장수': '1 / 2',
                  '필기구': '만년필'
                }
              },
              {
                id: 'paper-4-2',
                order: 2,
                image: SAMPLE_IMAGES.letterPaper,
                title: '편지지 제2면',
                desc: '결문 및 서명',
                fields: {
                  '장수': '2 / 2',
                  '필기구': '만년필',
                  '서명': '자필 서명 확인됨'
                }
              }
            ]
          }
        ]
      };

      return [item1, item2, item3, item4];
    }

    return [];
  }, [selectedOwner, firstLevelNodes, domains, getAtomsForDomain, getRootNodeForNodeId, idbImageMap]);

  // 상위 카테고리(소장품 종류: 책, 편지, 병풍 등)별 그룹화 (사용자 요청: 책 : 2, 편지 : 2 스타일)
  const categories = useMemo(() => {
    const map = new Map<string, ArchivalItem[]>();
    archivalList.forEach(item => {
      const type = item.rootType || '기록물';
      if (!map.has(type)) {
        map.set(type, []);
      }
      map.get(type)!.push(item);
    });

    return Array.from(map.entries()).map(([rootType, items]) => {
      const heroImage = items.find(it => it.heroImage)?.heroImage;
      const latestDate = items[0]?.createdAt || '';
      return {
        rootType,
        count: items.length,
        items,
        heroImage,
        latestDate,
      };
    });
  }, [archivalList]);

  // ArchivalDescriptionPage의 archivalList를 ArchiveSearchPage와 100% 동일하게 공유하기 위해 localStorage 영구 동기화
  useEffect(() => {
    if (archivalList && archivalList.length > 0) {
      try {
        localStorage.setItem('colib_master_archival_items', JSON.stringify(archivalList));
      } catch (_) {}
    }
  }, [archivalList]);

  // 선택된 카테고리 상태 (예: '책', '편지', '병풍')
  const [selectedCategory, setSelectedCategory] = useState<string>('');

  // categories 변경 시 selectedCategory 자동 동기화
  useEffect(() => {
    if (categories.length > 0) {
      if (!categories.some(c => c.rootType === selectedCategory)) {
        setSelectedCategory(categories[0].rootType);
      }
    } else {
      setSelectedCategory('');
    }
  }, [categories, selectedCategory]);

  // 현재 선택된 카테고리의 인스턴스 아이템 목록 (1번, 2번...)
  const currentCategoryItems = useMemo(() => {
    if (!selectedCategory) return [];
    return categories.find(c => c.rootType === selectedCategory)?.items || [];
  }, [categories, selectedCategory]);

  // 현재 선택된 아카이브 항목 ID (인스턴스)
  const [selectedItemId, setSelectedItemId] = useState<string>('');

  // currentCategoryItems 변경 시 유효한 인스턴스 자동 선택
  useEffect(() => {
    if (currentCategoryItems.length > 0) {
      if (!currentCategoryItems.some(item => item.id === selectedItemId)) {
        setSelectedItemId(currentCategoryItems[0].id);
      }
    } else {
      setSelectedItemId('');
    }
  }, [currentCategoryItems, selectedItemId]);

  const selectedItem = useMemo(() => {
    return currentCategoryItems.find(item => item.id === selectedItemId) || currentCategoryItems[0] || null;
  }, [currentCategoryItems, selectedItemId]);

  // 최상위 카드 및 하위 탭 카드 접기/펼치기 상태 (AutoScan 도메인 카드와 동일)
  const [topCardCollapsed, setTopCardCollapsed] = useState<boolean>(false);
  // 묶음정리/사료설명 저장 후 실시간 반영을 위한 리렌더링 트리거
  const [refreshKey, setRefreshKey] = useState(0);
  const [subCardCollapsed, setSubCardCollapsed] = useState<boolean>(false);

  // 현재 선택된 아이템의 소장품 트리 노드 및 하위 자식 노드들 (예: 책 -> 표지, 속지)
  const selectedRootNode = useMemo(() => {
    if (!selectedItem) return null;
    return firstLevelNodes.find((fn: any) => fn.label === selectedItem.rootType || fn.id === selectedItem.rootType)
      || firstLevelNodes.find((fn: any) => fn.label?.includes(selectedItem.rootType) || selectedItem.rootType?.includes(fn.label))
      || null;
  }, [selectedItem, firstLevelNodes]);

  const childNodesOfRoot = useMemo<{ id: string; label: string; linkedDomainIds?: string[] }[]>(() => {
    if (!selectedItem) return [];
    // 1. 트리에서 선택된 1단계 노드의 실제 children을 동적으로 사용
    const fromTree: any[] = selectedRootNode?.children || [];
    if (fromTree.length > 0) {
      return fromTree.map(cn => ({
        id: cn.id || cn.label,
        label: cn.label,
        linkedDomainIds: Array.isArray(cn.linkedDomainIds) ? cn.linkedDomainIds : (cn.linkedDomainId ? [cn.linkedDomainId] : [])
      }));
    }
    // 2. 아이템에 등록된 하위 그룹이 있다면 동적으로 사용
    if (selectedItem.subGroups && selectedItem.subGroups.length > 0) {
      return selectedItem.subGroups.map(sg => ({
        id: sg.domainName,
        label: sg.domainName
      }));
    }
    return [];
  }, [selectedRootNode, selectedItem]);

  const [activeChildNode, setActiveChildNode] = useState<{ id: string; label: string } | null>(null);

  // 각 하위 노드별 등록 건수
  const countsByNode = useMemo<Record<string, number>>(() => {
    const counts: Record<string, number> = {};
    if (!selectedItem) return counts;
    if (selectedItem.subGroups) {
      selectedItem.subGroups.forEach(sg => {
        counts[sg.domainName] = sg.count;
      });
    }
    return counts;
  }, [selectedItem]);

  useEffect(() => {
    if (childNodesOfRoot.length > 0) {
      // 사용자가 현재 선택해둔 탭이 유효하면 무조건 그대로 유지 (저장 시 첫 번째 탭으로 튕김 방지)
      setActiveChildNode(prev => {
        if (prev && childNodesOfRoot.some(cn => cn.id === prev.id || cn.label === prev.label)) {
          return prev;
        }
        const firstWithData = childNodesOfRoot.find(cn => (countsByNode[cn.label] || countsByNode[cn.id] || 0) > 0);
        return firstWithData || childNodesOfRoot[0];
      });
    } else {
      setActiveChildNode(null);
    }
  }, [childNodesOfRoot, selectedItem?.id]);

  // 하위 노드(기록물) 전용 필드 키 분리 (상위 묶음정리의 요약설명은 제외하지 않음)
  const isChildFieldKey = (key: string) => {
    return key.includes('사료사이즈') || key.includes('사료설명') || key.includes('장수') || key.includes('우표') || key.includes('필기구');
  };
  void isChildFieldKey;

  // 묶음정리(상단 히어로) 대표 이미지는 소장품 전체 누적 번호와 무관하게 무조건 #1부터 시작
  const heroOrderNum = 1;

  // 미디어 필드 여부 동적 판정 (이미지, 사진, 업로드, 첨부 등)
  const isMediaField = useCallback((f: string) => {
    const lower = f.toLowerCase();
    return lower.includes('이미지') || lower.includes('사진') || lower.includes('카메라') ||
           lower.includes('업로드') || lower.includes('첨부') || lower.includes('파일');
  }, []);

  // 트리 노드에 동적으로 연결된 도메인 조회
  const findDomainForNode = useCallback((node: any | null | undefined): any | null => {
    if (!node) return null;

    // 1. 노드에 명시적으로 연결된 linkedDomainIds (배열) 또는 linkedDomainId
    const linkedIds: string[] = Array.isArray(node.linkedDomainIds)
      ? node.linkedDomainIds
      : (node.linkedDomainId ? [node.linkedDomainId] : []);

    if (linkedIds.length > 0) {
      const found = domains.find(d => linkedIds.includes(d.id) || linkedIds.includes(d.name));
      if (found) return found;
    }

    // 2. 노드의 id 자체가 도메인 id와 일치하는 경우
    if (node.id) {
      const foundById = domains.find(d => d.id === node.id);
      if (foundById) return foundById;
    }

    // 3. 노드의 label 자체가 도메인의 name과 일치하는 경우
    if (node.label) {
      const foundByName = domains.find(d => d.name === node.label);
      if (foundByName) return foundByName;
    }

    // 4. 노드의 label과 일치/포함하는 도메인
    if (node.label) {
      const foundPartial = domains.find(d => d.name.includes(node.label) || node.label.includes(d.name));
      if (foundPartial) return foundPartial;
    }

    return null;
  }, [domains]);

  // 묶음정리 아이템에 동적으로 연결된 도메인 조회 함수
  const findDomainForItem = useCallback((item: ArchivalItem | null): any | null => {
    if (!item) return null;

    // 1. 엔티티에 직접 저장된 domainId
    const explicitDomId = item.rawTopEntity?.domainId || item.rawTopEntity?.data?.['_domainId'] || item.fields?.['_domainId'];
    if (explicitDomId) {
      const found = domains.find(d => d.id === explicitDomId);
      if (found) return found;
    }

    // 2. _treeNodeId를 통해 트리 노드를 찾아 그 노드에 연결된 도메인 조회
    const treeNodeId = item.rawTopEntity?.data?.['_treeNodeId'] || item.fields?.['_treeNodeId'] || '';
    if (treeNodeId) {
      const findNodeInTree = (nodes: any[], targetId: string): any | null => {
        for (const n of nodes) {
          if (n.id === targetId || n.label === targetId) return n;
          if (n.children?.length) {
            const found = findNodeInTree(n.children, targetId);
            if (found) return found;
          }
        }
        return null;
      };
      const treeNode = findNodeInTree(masterTreeData, treeNodeId);
      if (treeNode) {
        const dom = findDomainForNode(treeNode);
        if (dom) return dom;
      }
    }

    // 3. firstLevelNodes에서 rootType과 일치하는 1단계 노드에 연결된 도메인 조회
    if (item.rootType) {
      const rootNode = firstLevelNodes.find((fn: any) => fn.label === item.rootType || fn.id === item.rootType);
      if (rootNode) {
        const dom = findDomainForNode(rootNode);
        if (dom) return dom;
      }

      // 4. domains 중 이름이나 id가 rootType과 동적으로 일치하는 도메인 조회
      const foundByName = domains.find(d => d.name === item.rootType || d.id === item.rootType);
      if (foundByName) return foundByName;
    }

    return null;
  }, [domains, masterTreeData, firstLevelNodes, findDomainForNode]);

  // 도메인에 연결된 모든 필드 목록
  // 이미지 필드가 있으면 해당 블루프린트의 extraFields(하위 필드)도 동적으로 포함
  const getDomainEditableFields = useCallback((domain: any | null | undefined): string[] => {
    if (!domain || !Array.isArray(domain.fields)) return [];

    const result: string[] = [];

    domain.fields.forEach((f: string) => {
      if (f.startsWith('_') || ['등록순번', '자료구분'].includes(f)) return;

      if (isMediaField(f)) {
        // 이미지 필드 자체 추가
        if (!result.includes(f)) result.push(f);
        // 해당 이미지 필드의 블루프린트에서 extraFields 동적으로 읽기
        const imgBp = blueprints?.find((b: any) =>
          b.name === f || b.name === '이미지업로드' || b.synonyms?.includes(f)
        );
        const extraLabels: string[] = (imgBp?.extraFields || []).map((ef: any) => ef.label || ef.name || '').filter(Boolean);
        extraLabels.forEach(label => {
          if (!result.includes(label)) result.push(label);
        });
      } else {
        if (!result.includes(f)) result.push(f);
      }
    });

    return result;
  }, [isMediaField, blueprints]);

  // 엔티티 및 로컬스토리지 데이터에서 필드값을 동적으로 정밀 매핑 (이미지, 접미사 _0 및 대체 키 호환)
  const resolveFieldValue = useCallback((data: Record<string, any>, fieldKey: string, anchorOrFirst?: string, titleFallback?: string, heroImgFallback?: string): string => {
    // 미디어 필드인 경우 이미지 데이터 매핑
    if (isMediaField(fieldKey)) {
      const imgVal = data[fieldKey] || data[`${fieldKey}_0`] || data['이미지업로드'] || data['이미지업로드_0'] || data['사진'] || data['heroImage'] || heroImgFallback;
      if (imgVal && typeof imgVal === 'string' && (imgVal.startsWith('data:') || imgVal.startsWith('blob:') || imgVal.startsWith('http') || imgVal.startsWith('/'))) {
        return imgVal;
      }
      return heroImgFallback || '';
    }

    // 1. 직접 일치
    const directVal = data[fieldKey];
    if (directVal !== undefined && directVal !== null && String(directVal).trim() !== '') {
      return String(directVal);
    }

    // 2. '요약설명'의 경우: 요약설명_0, 이미지설명_0 등 확인
    if (fieldKey === '요약설명') {
      const alt = data['요약설명_0'] || data['이미지설명_0'] || data['이미지설명'];
      if (alt !== undefined && alt !== null && String(alt).trim() !== '') {
        return String(alt);
      }
    }

    // 3. '사이즈'의 경우: 사이즈_0, 이미지사이즈_0, 이미지사이즈, 사료사이즈, 규격 등 확인
    if (fieldKey === '사이즈') {
      const alt = data['사이즈_0'] || data['이미지사이즈_0'] || data['이미지사이즈'] || data['사료사이즈'] || data['규격'];
      if (alt !== undefined && alt !== null && String(alt).trim() !== '') {
        return String(alt);
      }
    }

    // 4. 대표 키(anchor) 또는 도메인의 첫 필드인 경우 아이템 제목(title) 폴백
    if (anchorOrFirst && (fieldKey === anchorOrFirst || fieldKey === '제목' || fieldKey === '등록설명')) {
      if (titleFallback && titleFallback.trim() !== '') {
        return titleFallback;
      }
    }

    return directVal != null ? String(directVal) : '';
  }, [isMediaField]);

  const topFieldsEntries = useMemo(() => {
    if (!selectedItem) return [];

    // 상위 묶음정리의 데이터 (rawTopEntity?.data 및 selectedItem.fields 병합)
    const dataObj = {
      ...(selectedItem.rawTopEntity?.data || {}),
      ...selectedItem.fields,
    };

    // localStorage에서 AD 전용 필드만 보충 (atom 데이터 오버라이드 금지)
    try {
      const stored = localStorage.getItem(`demo_arch_fields_${selectedItem.id}`);
      if (stored) {
        mergeAdOnlyFields(dataObj, JSON.parse(stored));
      }
    } catch (_) {}

    const heroDomain = findDomainForItem(selectedItem);
    const domainFieldsList = getDomainEditableFields(heroDomain);

    const entries: [string, string][] = [];

    if (domainFieldsList.length > 0) {
      // 상단 한 줄 바에는 텍스트 필드들(이미지 바이너리 제외)을 표시
      domainFieldsList
        .filter(f => !isMediaField(f))
        .forEach(f => {
          const val = resolveFieldValue(dataObj, f, heroDomain?.anchor || heroDomain?.fields?.[0], selectedItem.title, selectedItem.heroImage);
          entries.push([f, val]);
        });
    } else {
      // 도메인이 없거나 필드가 비어있는 경우 데이터 객체의 일반 필드만 동적 표시
      Object.entries(dataObj).forEach(([k, v]) => {
        if (!k.startsWith('_') && !isMediaField(k) && !['등록순번', '자료구분'].includes(k) && typeof v === 'string') {
          entries.push([k, v]);
        }
      });
    }

    return entries;
  }, [selectedItem, refreshKey, findDomainForItem, getDomainEditableFields, resolveFieldValue, isMediaField]);

  const activeSubGroup = useMemo(() => {
    if (!selectedItem || !activeChildNode) return null;
    return selectedItem.subGroups.find(g => g.domainName === activeChildNode.label) || null;
  }, [selectedItem, activeChildNode]);

  // 활성화된 하위 노드(탭)에 동적으로 연결된 도메인 조회
  const linkedDomain = useMemo(() => {
    if (!activeChildNode) return null;
    return findDomainForNode(activeChildNode);
  }, [activeChildNode, findDomainForNode]);

  // 활성화된 하위 도메인에 정의된 텍스트 필드 목록 (동적)
  const domainFields = useMemo(() => {
    return getDomainEditableFields(linkedDomain);
  }, [linkedDomain, getDomainEditableFields]);

  void topFieldsEntries;

  // 화면 및 수정 팝업 공통 필드 정렬 순위 함수 (도메인 필드 순서와 1:1 완벽 일치)
  const getSubItemFieldRank = useCallback((key: string) => {
    if (key === '요약설명' || key.includes('요약설명')) return 0;
    const dIdx = domainFields.indexOf(key);
    if (dIdx !== -1) return 10 + dIdx;
    return 200;
  }, [domainFields]);
  void getSubItemFieldRank;

  // 공통: 묶음정리 또는 하위 기록물 메타데이터(#순번 요약설명 (사이즈)) 추출 함수
  const getImageItemMeta = (
    itemOrSubItem: any,
    fallbackOrderNum: number,
    targetDomain?: any
  ) => {
    const ancId = itemOrSubItem?.id ? String(itemOrSubItem.id).split('_')[0] : '';
    const subIdx = itemOrSubItem?.id && String(itemOrSubItem.id).includes('_') ? String(itemOrSubItem.id).split('_')[1] : '0';

    const dataObj: Record<string, string> = {
      ...(itemOrSubItem?.rawTopEntity?.data || {}),
      ...(itemOrSubItem?.fields || {})
    };

    try {
      if (ancId) {
        const stored = localStorage.getItem(`demo_arch_fields_${ancId}`);
        if (stored) mergeAdOnlyFields(dataObj, JSON.parse(stored));
      }
    } catch (_) {}

    // 블루프린트 extraFields 매핑
    const domainObj = targetDomain || (itemOrSubItem ? findDomainForItem(itemOrSubItem) : null);
    const imgFieldKey = (domainObj?.fields || []).find((f: string) => isMediaField(f)) || '';
    const imgBp = blueprints?.find((b: any) =>
      b.inputType === 'imageUpload' ||
      b.name === imgFieldKey ||
      b.name === '이미지업로드' ||
      b.synonyms?.includes(imgFieldKey)
    );
    const extraFields: { id: string; label: string; name?: string }[] = imgBp?.extraFields || [];
    const summaryLabel = extraFields[0]?.label || extraFields[0]?.name || '';
    const sizeLabel = extraFields[1]?.label || extraFields[1]?.name || '';

    // 자신의 subIdx에 해당하는 데이터만 엄격하게 읽기 (다른 인덱스, 특히 0번 데이터 오염 차단)
    const isMultiSubItem = itemOrSubItem?.id && String(itemOrSubItem.id).includes('_');
    const readVal = (label: string) => {
      if (!label) return '';
      if (isMultiSubItem && subIdx !== '0') {
        // 2번째 이상 복수 아이템: 오직 자기 자신의 인덱스(label_subIdx)만 읽음 (0번이나 기본키 참조 금지)
        return dataObj[`${label}_${subIdx}`] || '';
      }
      // 단일 아이템 또는 첫 번째 아이템(subIdx === '0')
      return dataObj[label] || dataObj[`${label}_0`] || '';
    };

    const summary = (summaryLabel ? readVal(summaryLabel) : '') ||
      readVal('요약설명') || readVal('이미지설명');

    const size = (sizeLabel ? readVal(sizeLabel) : '') ||
      readVal('이미지사이즈') || readVal('사이즈') || readVal('사료사이즈');

    const orderNum = itemOrSubItem?.order ?? fallbackOrderNum;

    const parts = [`#${orderNum}`];
    if (summary) parts.push(summary);
    if (size) parts.push(`(${size})`);
    const fullLabel = parts.join(' ');

    return { orderNum, summary, size, fullLabel };
  };

  // 공통 배지 컴포넌트 렌더러
  const renderImageBadge = (
    itemOrSubItem: any,
    fallbackOrderNum: number,
    onClickEdit: () => void,
    titleText: string,
    targetDomain?: any
  ) => {
    const meta = getImageItemMeta(itemOrSubItem, fallbackOrderNum, targetDomain);
    return (
      <button
        type="button"
        className="archival-sub-num-pill archival-hero-img-num-pill archival-hero-img-badge-rich"
        onClick={(e) => {
          e.stopPropagation();
          onClickEdit();
        }}
        title={titleText}
      >
        <span className="archival-hero-badge-num">#{meta.orderNum}</span>
        {(meta.summary || meta.size) && (
          <span className="archival-hero-badge-meta">
            {meta.summary && <span className="archival-hero-badge-summary">{meta.summary}</span>}
            {meta.size && <span className="archival-hero-badge-size">({meta.size})</span>}
          </span>
        )}
      </button>
    );
  };

  // 하위 기록물 수정 팝업 오픈 핸들러
  const openEditSubItem = (subItem: ArchivalItem['subGroups'][0]['items'][0]) => {
    const anchorId = subItem.id.split('_')[0];
    const subIdx = subItem.id.includes('_') ? subItem.id.split('_')[1] : null;
    const initialFields: Record<string, string> = {};

    // localStorage에서 최신 저장값 읽기
    let savedData: Record<string, string> = {};
    try {
      const stored = localStorage.getItem("demo_arch_fields_" + anchorId);
      if (stored) savedData = JSON.parse(stored);
    } catch (_) {}

    // 필드값 해석 헬퍼 (atom 데이터 우선, AD 전용 필드만 localStorage에서 보충)
    const resolveSubVal = (fieldKey: string): string => {
      const isAdOnlyField = AD_ONLY_FIELD_PATTERNS.some(p => fieldKey.includes(p)) || (fieldKey.endsWith('분류') && !fieldKey.startsWith('_'));
      if (subIdx !== null && subIdx !== '0') {
        // 2번째 이상 복수 아이템: 오직 자기 자신의 인덱스(fieldKey_subIdx)만 읽음
        const withSuffix = subItem.fields[`${fieldKey}_${subIdx}`];
        if (!isAdOnlyField && withSuffix !== undefined && withSuffix !== '') return String(withSuffix);
        if (savedData[`${fieldKey}_${subIdx}`] !== undefined && savedData[`${fieldKey}_${subIdx}`] !== '') {
          return savedData[`${fieldKey}_${subIdx}`];
        }
        if (!isAdOnlyField && withSuffix !== undefined && withSuffix !== '') return String(withSuffix);
        return '';
      }
      // 단일 아이템 또는 첫 번째 아이템(subIdx === '0' 또는 null)
      // atom 데이터 우선 (AD 전용 필드가 아닌 경우)
      if (!isAdOnlyField) {
        const norm = subItem.fields[fieldKey];
        if (norm !== undefined && norm !== '') return String(norm);
        const withSuffix0 = subItem.fields[`${fieldKey}_0`];
        if (withSuffix0 !== undefined && withSuffix0 !== '') return String(withSuffix0);
      }
      // AD 전용 필드이거나 atom에 없으면 localStorage에서 보충
      if (savedData[fieldKey] !== undefined && savedData[fieldKey] !== '') return savedData[fieldKey];
      if (savedData[`${fieldKey}_0`] !== undefined && savedData[`${fieldKey}_0`] !== '') return savedData[`${fieldKey}_0`];
      // 마지막으로 atom 필드 체크 (AD 전용 필드인 경우 여기까지 올 수 있음)
      const norm = subItem.fields[fieldKey];
      if (norm !== undefined && norm !== '') return String(norm);
      const withSuffix = subItem.fields[`${fieldKey}_0`];
      if (withSuffix !== undefined && withSuffix !== '') return String(withSuffix);
      return '';
    };

    // 현재 이미지 URL
    const currentImageUrl = subItem.image || resolveSubVal('이미지업로드') || resolveSubVal('이미지') || resolveSubVal('사진') || '';

    // 연결된 도메인의 실제 fields 배열을 직접 사용 (getDomainEditableFields 미사용)
    // 이미지 필드 → 이미지 편집 UI, 텍스트 필드 → 입력창
    const rawDomainFields: string[] = Array.isArray(linkedDomain?.fields) ? linkedDomain!.fields : [];
    let imageFieldKey: string | null = null;

    if (rawDomainFields.length > 0) {
      rawDomainFields.forEach(df => {
        if (df.startsWith('_') || ['등록순번', '자료구분'].includes(df)) return;
        if (isMediaField(df)) {
          if (!imageFieldKey) {
            imageFieldKey = df; // 첫 번째 이미지 필드만
            // 해당 이미지 블루프린트의 extraFields(하위 필드)를 동적으로 텍스트 필드로 추가
            const imgBp = blueprints?.find((b: any) =>
              b.name === df || b.name === '이미지업로드' || b.synonyms?.includes(df)
            );
            const extraLabels: string[] = (imgBp?.extraFields || []).map((ef: any) => ef.label || ef.name || '').filter(Boolean);
            extraLabels.forEach(label => {
              if (!(label in initialFields)) initialFields[label] = resolveSubVal(label);
            });
          }
        } else {
          initialFields[df] = resolveSubVal(df);
        }
      });
    } else {
      // 도메인 미연결: 실제 값 있는 텍스트 필드만
      Object.entries(subItem.fields).forEach(([fk, fv]) => {
        if (!fk.startsWith('_') && typeof fv === 'string' && fv && !fv.startsWith('data:') && !fv.startsWith('blob:') && !isMediaField(fk)) {
          const normKey = fk.replace(/_\d+$/, '');
          if (!(normKey in initialFields)) initialFields[normKey] = fv;
        }
      });
      if (currentImageUrl) imageFieldKey = '이미지업로드';
    }

    setEditSubItemPopup({
      item: subItem,
      anchorId,
      editFields: initialFields,
      imageFieldKey,
      currentImageUrl,
    });
  };

  // 이미지 라이트박스 팝업 (확장)
  const [lightboxImg, setLightboxImg] = useState<{
    url: string;
    caption: string;
    subItem?: ArchivalItem['subGroups'][0]['items'][0];
    anchorId?: string;
  } | null>(null);

  // 뷰어 줌 & 팬
  const [viewerZoom, setViewerZoom] = useState(1);
  const [viewerPan, setViewerPan] = useState({ x: 0, y: 0 });
  const [isViewerPanning, setIsViewerPanning] = useState(false);
  const viewerPanStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  // 사료설명 움직이는 팝업 상태
  const [isDescPopupOpen, setIsDescPopupOpen] = useState(false);
  const [descPopupPos, setDescPopupPos] = useState({ x: 28, y: 76 });
  const [isDraggingDescPopup, setIsDraggingDescPopup] = useState(false);
  const descDragStartRef = useRef({ mouseX: 0, mouseY: 0, posX: 0, posY: 0 });
  const [descInputText, setDescInputText] = useState('');
  const [classificationFields, setClassificationFields] = useState<Record<string, string>>({});

  // 사료분류 트리 선택 팝업 상태
  const [isClassificationModalOpen, setIsClassificationModalOpen] = useState(false);
  const [selectedClassNodeLabels, setSelectedClassNodeLabels] = useState<string[]>([]);
  const [openTreeFolders, setOpenTreeFolders] = useState<Record<string, boolean>>({ 'rc-root': true, 'rc-std': true });

  // 사료분류 트리 데이터 (블루프린트 또는 DEFAULT_RECORD_TREE)
  const recordClassificationTreeData = useMemo<TreeNode[]>(() => {
    const bp = blueprints?.find(b => b.inputType === 'tree' && (b.name === '사료분류' || b.name.includes('사료분류')));
    return (bp?.treeData && bp.treeData.length > 0) ? bp.treeData : DEFAULT_RECORD_TREE;
  }, [blueprints]);

  // 활성 노드에 설정된 maxSelect (선택 허용 수량)
  const activeNodeMaxSelect = useMemo<number | undefined>(() => {
    if (!activeChildNode) return undefined;
    const findNode = (nodes: TreeNode[]): TreeNode | null => {
      for (const n of nodes) {
        if (n.label === activeChildNode.label || n.id === activeChildNode.id) return n;
        if (n.children && n.children.length > 0) {
          const found = findNode(n.children);
          if (found) return found;
        }
      }
      return null;
    };
    const target = findNode(masterTreeData);
    return target?.selectionConfig?.maxSelect;
  }, [activeChildNode, masterTreeData]);

  // 라이트박스 상단 경로 및 사료내용분류 캡션 동적 생성
  // 형식 예시:
  // 묶음정리: 책 : 최부자자서전 | 사료내용분류 ( 학업자격 : 소시합격증, 년대분류 : 1620년대 )
  // 하위기록물: 책 : 최부자자서전 > 표지 : 최부자집전경 | 사료내용분류 ( 학업자격 : 소시합격증, 년대분류 : 1620년대 )
  const getLightboxCaption = () => {
    if (!lightboxImg || !selectedItem) return lightboxImg?.caption || '';

    // 1. 최상위(묶음정리) 경로 (순번 숫자 없이 순수 도메인명만 사용: 예: '책')
    const rootType = selectedCategory || selectedItem.rootType?.replace(/\s*\d+$/, '') || '기록물';
    const topData: Record<string, string> = {
      ...(selectedItem.rawTopEntity?.data || {}),
      ...selectedItem.fields
    };
    try {
      const stored = localStorage.getItem(`demo_arch_fields_${selectedItem.id}`);
      if (stored) mergeAdOnlyFields(topData, JSON.parse(stored));
    } catch (_) {}

    const heroTitle = topData['등록설명'] || topData['제목'] || topData['자료명'] || selectedItem.title || '';
    let path = `${rootType} : ${heroTitle}`;

    // 2. 하위 기록물일 경우 자식 경로 추가
    const isSub = !!lightboxImg.subItem;
    let targetData: Record<string, string> = topData;

    if (isSub && lightboxImg.subItem) {
      const sub = lightboxImg.subItem;
      const subData: Record<string, string> = { ...sub.fields };
      const ancId = sub.id.split('_')[0];
      try {
        const stored = localStorage.getItem(`demo_arch_fields_${ancId}`);
        if (stored) mergeAdOnlyFields(subData, JSON.parse(stored));
      } catch (_) {}
      targetData = subData;

      const childTabLabel = activeChildNode?.label || (linkedDomain?.name) || '기록물';
      const childDesc = subData['요약설명'] || subData['요약설명_0'] || subData['등록설명'] || subData['이미지설명'] || sub.title || '';
      path = `${path} > ${childTabLabel} : ${childDesc}`;
    }

    // 3. 사료내용분류 파싱 (해당 아이템에 실제로 등록된 분류만 표시, 상위 데이터 임의 상속 금지)
    let classParts: string[] = [];
    const rawLinked = targetData['_linkedClassifications'];
    if (rawLinked) {
      try {
        const parsed = JSON.parse(rawLinked);
        if (Array.isArray(parsed)) {
          parsed.forEach((label: string) => {
            const val = targetData[label];
            if (val && String(val).trim()) {
              classParts.push(`${label} : ${val}`);
            }
          });
        }
      } catch (_) {}
    }

    if (classParts.length > 0) {
      return `${path} | 사료내용분류 ( ${classParts.join(', ')} )`;
    }
    return path;
  };

  // 라이트박스 오픈 함수
  const openLightboxDetail = (url: string, caption: string, subItem?: ArchivalItem['subGroups'][0]['items'][0], customAnchorId?: string) => {
    const anchorId = subItem ? subItem.id.split('_')[0] : (customAnchorId || selectedItem?.id || '');
    setLightboxImg({ url, caption, subItem, anchorId });
    setViewerZoom(1);
    setViewerPan({ x: 0, y: 0 });

    // localStorage에서 저장된 사료설명/분류 데이터 읽기 (영구 저장 데이터 - 비데모 포함)
    let savedFields: Record<string, string> = {};
    try {
      const stored = localStorage.getItem(`demo_arch_fields_${anchorId}`);
      if (stored) {
        savedFields = JSON.parse(stored);
      }
    } catch (_) {}

    // 대상 아이템(하위 기록물 또는 상위 묶음정리)의 필드만 엄격히 분리 (상위 데이터 임의 오염 방지)
    const itemFields = subItem ? subItem.fields : (selectedItem?.fields || {});
    const subIdx = subItem?.id && subItem.id.includes('_') ? subItem.id.split('_')[1] : null;

    // savedFields(localStorage)가 최우선, 그 다음 해당 아이템의 메모리 fields (사료설명/사료개요/상세설명 완벽 호환)
    const currentDesc = (subIdx !== null && subIdx !== '0'
      ? (savedFields[`사료설명_${subIdx}`] || savedFields[`사료개요_${subIdx}`] || itemFields[`사료설명_${subIdx}`] || itemFields[`사료개요_${subIdx}`])
      : (savedFields['사료설명'] || savedFields['사료개요'] || itemFields['사료설명'] || itemFields['사료개요'] || itemFields['상세설명'])) || '';
    setDescInputText(currentDesc);

    // 사료분류 트리에 존재하는 기존 필드 감지
    const collectLabels = (nodes: TreeNode[]): string[] => {
      let lbls: string[] = [];
      nodes.forEach(n => {
        lbls.push(n.label);
        if (n.children) lbls.push(...collectLabels(n.children));
      });
      return lbls;
    };
    const allLabels = new Set(collectLabels(recordClassificationTreeData));
    // localStorage 저장 데이터와 메모리 데이터를 병합 (localStorage 우선)
    const currentFields = { ...itemFields, ...savedFields };
    const existingFields: Record<string, string> = {};
    const initSelectedLabels: string[] = [];

    // 1) 해당 사료에 저장된 분류항 연결정보(_linkedClassifications)가 있다면 데이터가 없더라도 최우선 복원
    const rawLinked = currentFields['_linkedClassifications'];
    if (rawLinked) {
      try {
        const parsed = JSON.parse(rawLinked);
        if (Array.isArray(parsed)) {
          parsed.forEach((label: string) => {
            if (typeof label === 'string' && label.trim() && !initSelectedLabels.includes(label)) {
              initSelectedLabels.push(label);
              existingFields[label] = currentFields[label] || '';
            }
          });
        }
      } catch (_) {}
    }

    // 2) currentFields 중 트리에 존재하는 기타 키들도 추가
    Object.entries(currentFields).forEach(([k, v]) => {
      if (allLabels.has(k) && !['사료설명', '요약설명', '상태설명', '사료사이즈', '제목', '자료구분'].includes(k)) {
        if (!initSelectedLabels.includes(k)) {
          initSelectedLabels.push(k);
        }
        if (existingFields[k] === undefined) {
          existingFields[k] = v || '';
        }
      }
    });

    setClassificationFields(existingFields);
    setSelectedClassNodeLabels(initSelectedLabels);
    setDescPopupPos({ x: 28, y: 76 });
    setIsDescPopupOpen(false);
    setIsClassificationModalOpen(false);
  };

  // 뷰어 확대/축소 (마우스 휠)
  const handleViewerWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    setViewerZoom(prev => Math.max(0.2, Math.min(8, prev * factor)));
  }, []);

  // 뷰어 드래그 이동 (Pan)
  const handleViewerPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    setIsViewerPanning(true);
    viewerPanStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: viewerPan.x,
      panY: viewerPan.y,
    };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }, [viewerPan]);

  const handleViewerPointerMove = useCallback((e: React.PointerEvent) => {
    if (!isViewerPanning) return;
    const dx = e.clientX - viewerPanStartRef.current.x;
    const dy = e.clientY - viewerPanStartRef.current.y;
    setViewerPan({
      x: viewerPanStartRef.current.panX + dx,
      y: viewerPanStartRef.current.panY + dy,
    });
  }, [isViewerPanning]);

  const handleViewerPointerUp = useCallback(() => {
    setIsViewerPanning(false);
  }, []);

  // 사료설명 팝업 타이틀 바 드래그
  const handleDescDragDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    setIsDraggingDescPopup(true);
    descDragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      posX: descPopupPos.x,
      posY: descPopupPos.y,
    };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const handleDescDragMove = (e: React.PointerEvent) => {
    if (!isDraggingDescPopup) return;
    const dx = e.clientX - descDragStartRef.current.mouseX;
    const dy = e.clientY - descDragStartRef.current.mouseY;
    const newX = Math.max(10, Math.min(window.innerWidth - 380, descDragStartRef.current.posX + dx));
    const newY = Math.max(10, Math.min(window.innerHeight - 200, descDragStartRef.current.posY + dy));
    setDescPopupPos({ x: newX, y: newY });
  };

  const handleDescDragUp = () => {
    setIsDraggingDescPopup(false);
  };

  // 데모 아이템 ID 여부 판별 (arch-item-N, cover-N-N, page-N-N, env-N-N, paper-N-N 등)
  const isDemoAnchorId = (id: string) => {
    return /^(arch-item|cover|page|env|paper)-/.test(id);
  };

  // 사료설명 및 분류 필드 저장
  const handleSaveDescription = () => {
    if (!lightboxImg || !lightboxImg.anchorId) return;
    const anchorId = lightboxImg.anchorId;
    const subIdx = lightboxImg.subItem?.id && lightboxImg.subItem.id.includes('_') ? lightboxImg.subItem.id.split('_')[1] : null;
    const isDemo = isDemoAnchorId(anchorId);

    const linkedClassJson = JSON.stringify(selectedClassNodeLabels);

    if (!isDemo) {
      // 실제 엔티티인 경우: allAtoms(COMP_v3_atoms)에 저장 (subIdx가 있을 때 인덱스 키도 함께 저장)
      updateEntityField(anchorId, '사료설명', descInputText);
      if (subIdx !== null) updateEntityField(anchorId, `사료설명_${subIdx}`, descInputText);
      if (descInputText.trim() && addFieldValue) {
        addFieldValue('사료설명', descInputText.trim());
      }

      // 데이터가 없어도 분류항 연결정보를 영구 보존 (_linkedClassifications)
      updateEntityField(anchorId, '_linkedClassifications', linkedClassJson);
      if (subIdx !== null) updateEntityField(anchorId, `_linkedClassifications_${subIdx}`, linkedClassJson);

      selectedClassNodeLabels.forEach(label => {
        const val = classificationFields[label] || '';
        updateEntityField(anchorId, label, val);
        if (subIdx !== null) updateEntityField(anchorId, `${label}_${subIdx}`, val);
        if (val.trim() && addFieldValue) {
          addFieldValue(label, val.trim());
        }
      });
    }

    // 메모리 상태 즉시 반영 (재로딩 없이 팝업에 표시)
    if (lightboxImg.subItem) {
      lightboxImg.subItem.fields['사료설명'] = descInputText;
      if (subIdx !== null) lightboxImg.subItem.fields[`사료설명_${subIdx}`] = descInputText;
      lightboxImg.subItem.fields['_linkedClassifications'] = linkedClassJson;
      if (subIdx !== null) lightboxImg.subItem.fields[`_linkedClassifications_${subIdx}`] = linkedClassJson;
      selectedClassNodeLabels.forEach(label => {
        const val = classificationFields[label] || '';
        lightboxImg.subItem!.fields[label] = val;
        if (subIdx !== null) lightboxImg.subItem!.fields[`${label}_${subIdx}`] = val;
      });
    }
    if (selectedItem && anchorId === selectedItem.id) {
      selectedItem.fields['사료설명'] = descInputText;
      selectedItem.fields['_linkedClassifications'] = linkedClassJson;
      selectedClassNodeLabels.forEach(label => {
        selectedItem.fields[label] = classificationFields[label] || '';
      });
    }

    // 데모 아이템 또는 실제 엔티티 모두 demo_arch_fields_ localStorage에 영구 보존
    try {
      const stored = localStorage.getItem(`demo_arch_fields_${anchorId}`) || '{}';
      const obj = JSON.parse(stored);
      obj['사료설명'] = descInputText;
      if (subIdx !== null) obj[`사료설명_${subIdx}`] = descInputText;
      obj['_linkedClassifications'] = linkedClassJson;
      if (subIdx !== null) obj[`_linkedClassifications_${subIdx}`] = linkedClassJson;
      selectedClassNodeLabels.forEach(label => {
        const val = classificationFields[label] || '';
        obj[label] = val;
        if (subIdx !== null) obj[`${label}_${subIdx}`] = val;
      });
      localStorage.setItem(`demo_arch_fields_${anchorId}`, JSON.stringify(obj));
    } catch (_) {}

    // 저장 후 팝업 닫기 + 실시간 반영
    setIsDescPopupOpen(false);
    setRefreshKey(prev => prev + 1);
  };

  // 사료설명 및 분류 필드 삭제
  const handleDeleteDescription = () => {
    if (!lightboxImg || !lightboxImg.anchorId) return;
    if (!window.confirm('사료설명 및 입력된 분류 필드 정보를 삭제하시겠습니까?')) return;
    const anchorId = lightboxImg.anchorId;
    const isDemo = isDemoAnchorId(anchorId);

    if (!isDemo) {
      // 실제 엔티티인 경우에만 allAtoms에서 삭제
      updateEntityField(anchorId, '사료설명', '');
      updateEntityField(anchorId, '_linkedClassifications', '');
      selectedClassNodeLabels.forEach(label => {
        updateEntityField(anchorId, label, '');
      });
    }

    try {
      localStorage.removeItem(`demo_arch_fields_${anchorId}`);
    } catch (_) {}

    setDescInputText('');
    setClassificationFields({});
    setSelectedClassNodeLabels([]);
    if (lightboxImg.subItem) {
      delete lightboxImg.subItem.fields['사료설명'];
      delete lightboxImg.subItem.fields['_linkedClassifications'];
      selectedClassNodeLabels.forEach(label => {
        delete lightboxImg.subItem!.fields[label];
      });
    }
    if (selectedItem && anchorId === selectedItem.id) {
      delete selectedItem.fields['사료설명'];
      delete selectedItem.fields['_linkedClassifications'];
      selectedClassNodeLabels.forEach(label => {
        delete selectedItem.fields[label];
      });
    }
    alert('삭제되었습니다.');
  };

  // 사료분류 노드 선택 토글
  const handleToggleClassNode = (label: string) => {
    const isSelected = selectedClassNodeLabels.includes(label);
    if (isSelected) {
      // 연동된 데이터(값)가 있으면 해제 불가
      const existingVal = (classificationFields[label] || '').trim();
      if (existingVal) {
        alert(`'${label}' 분류항에 입력된 데이터("${existingVal}")가 있어 해제할 수 없습니다.\n데이터를 먼저 삭제한 후 해제해주세요.`);
        return;
      }
      setSelectedClassNodeLabels(prev => prev.filter(l => l !== label));
    } else {
      if (activeNodeMaxSelect && selectedClassNodeLabels.length >= activeNodeMaxSelect) {
        alert(`최대 ${activeNodeMaxSelect}개 노드까지만 선택할 수 있도록 설정되어 있습니다.`);
        return;
      }
      setSelectedClassNodeLabels(prev => [...prev, label]);
    }
  };

  // 사료분류 트리에서 선택 완료 후 적용
  const handleApplyClassification = () => {
    setIsClassificationModalOpen(false);
    setClassificationFields(prev => {
      const next = { ...prev };
      selectedClassNodeLabels.forEach(label => {
        if (next[label] === undefined) {
          next[label] = '';
        }
      });
      return next;
    });
    setIsDescPopupOpen(true);
  };

  // 하위 기록물 편집 팝업
  const [editSubItemPopup, setEditSubItemPopup] = useState<{
    item: ArchivalItem['subGroups'][0]['items'][0];
    anchorId: string;
    editFields: Record<string, string>;
    imageFieldKey: string | null; // 이미지 필드 키 (있으면 이미지 편집 UI 표시)
    currentImageUrl: string;      // 현재 이미지 URL
  } | null>(null);

  // 묶음정리/사료설명 저장 후 실시간 반영을 위한 리렌더링 트리거

  // 상단 묶음정리 편집 팝업
  const [editHeroPopup, setEditHeroPopup] = useState<{
    item: ArchivalItem;
    editFields: Record<string, string>;
  } | null>(null);

  // 상단 묶음정리 수정 팝업 오픈 핸들러
  const openEditHeroItem = (item: ArchivalItem) => {
    const initialFields: Record<string, string> = {};
    const dataObj = {
      ...(item.rawTopEntity?.data || {}),
      ...item.fields,
    };

    // localStorage에서 AD 전용 필드만 보충 (atom 데이터 오버라이드 금지)
    let savedFields: Record<string, string> = {};
    try {
      const stored = localStorage.getItem(`demo_arch_fields_${item.id}`);
      if (stored) savedFields = JSON.parse(stored);
    } catch (_) {}

    // atom 데이터 우선, AD 전용 필드만 localStorage에서 보충
    const mergedData = { ...dataObj };
    mergeAdOnlyFields(mergedData, savedFields);

    const heroDomain = findDomainForItem(item);
    const domainFieldsList = getDomainEditableFields(heroDomain);

    if (domainFieldsList.length > 0) {
      // 묶음정리 도메인에 동적으로 연결된 필드 (일반 텍스트 + 이미지업로드 + 내포 필드 요약설명/사이즈)를 추출하여 모달에 노출
      domainFieldsList.forEach((f: string) => {
        const val = resolveFieldValue(mergedData, f, heroDomain?.anchor || heroDomain?.fields?.[0], item.title, item.heroImage);
        initialFields[f] = val;
      });
    } else {
      // 도메인이 정의되지 않은 경우: 저장된 데이터 중 메타/시스템 키가 아닌 사용자 필드만 동적 노출
      Object.entries(mergedData).forEach(([k, v]) => {
        if (!k.startsWith('_') && !isMediaField(k) && !['등록순번', '자료구분'].includes(k) && typeof v === 'string') {
          initialFields[k] = v;
        }
      });
    }

    setEditHeroPopup({
      item,
      editFields: initialFields
    });
  };

  // 배경 설정 (이미지 또는 단색)
  const [bgMode, setBgMode] = useState<'image' | 'color'>(() =>
    (localStorage.getItem('ad_bgMode') as 'image' | 'color') || 'color'
  );
  const [bgImage, setBgImage] = useState<string>(() => localStorage.getItem('ad_bgImage') || '');
  const [bgColor, setBgColor] = useState<string>(() => localStorage.getItem('ad_bgColor') || '#f8fafc');
  const [showBgPanel, setShowBgPanel] = useState(false);
  const bgFileInputRef = useRef<HTMLInputElement>(null);
  const bgPanelRef = useRef<HTMLDivElement>(null);

  // ESC 키로 라이트박스/편집팝업 닫기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLightboxImg(null);
        setEditSubItemPopup(null);
        setEditHeroPopup(null);
        setShowBgPanel(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // 배경 패널 외부 클릭 시 닫기
  useEffect(() => {
    if (!showBgPanel) return;
    const handleClick = (e: MouseEvent) => {
      if (bgPanelRef.current && !bgPanelRef.current.contains(e.target as Node)) {
        setShowBgPanel(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showBgPanel]);



  return (
    <div
      className="archival-page-container"
      style={
        bgMode === 'color'
          ? { backgroundColor: bgColor, backgroundImage: 'none' }
          : bgImage
            ? { backgroundImage: `url(${bgImage})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed' }
            : undefined
      }
    >
      {/* 숨김 파일 인풋 (배경 이미지 업로드) */}
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
            localStorage.setItem('ad_bgImage', dataUrl);
            localStorage.setItem('ad_bgMode', 'image');
            setBgMode('image');
          };
          reader.readAsDataURL(file);
          e.target.value = '';
        }}
      />
      {/* 상단 네비게이션 헤더 */}
      <header className="archival-header">
        <div className="archival-header-left">
          <button className="archival-back-btn" onClick={onBack} title="홈으로 돌아가기">
            <ArrowLeft size={18} />
          </button>
          <div className="archival-header-title-group">
            <div className="archival-header-icon">
              <Layers size={18} />
            </div>
            <div>
              <h1 className="archival-header-title">Archival Description</h1>
              <p className="archival-header-sub">소장자별 기록물 계층 기술 및 열람</p>
            </div>
          </div>
        </div>

        <div className="archival-header-right">
          <div className="archival-stat-pill">
            <span>선택된 소장자:</span>
            <strong>{selectedOwner?.label || '미선택'}</strong>
          </div>
          <div className="archival-stat-pill">
            <span>등록 현황:</span>
            <strong>{categories.length}개 분류 ({archivalList.length}건)</strong>
          </div>
          {/* 배경 설정 버튼 */}
          <div ref={bgPanelRef} style={{ position: 'relative' }}>
            <button
              type="button"
              className="archival-bg-settings-btn"
              onClick={() => setShowBgPanel(v => !v)}
              title="배경 설정"
            >
              <Settings size={15} />
              배경
            </button>
            {showBgPanel && (
              <div className="archival-bg-panel">
                <div className="archival-bg-panel-title">배경 설정</div>
                {/* 모드 탭 */}
                <div className="archival-bg-mode-tabs">
                  <button
                    type="button"
                    className={`archival-bg-mode-tab${bgMode === 'image' ? ' active' : ''}`}
                    onClick={() => { setBgMode('image'); localStorage.setItem('ad_bgMode', 'image'); }}
                  >🖼 이미지</button>
                  <button
                    type="button"
                    className={`archival-bg-mode-tab${bgMode === 'color' ? ' active' : ''}`}
                    onClick={() => { setBgMode('color'); localStorage.setItem('ad_bgMode', 'color'); }}
                  >🎨 단색</button>
                </div>
                {/* 이미지 모드 */}
                {bgMode === 'image' && (
                  <div className="archival-bg-image-section">
                    <button
                      type="button"
                      className="archival-bg-upload-btn"
                      onClick={() => bgFileInputRef.current?.click()}
                    >
                      <Upload size={13} /> 배경 이미지 업로드
                    </button>
                    {bgImage ? (
                      <div className="archival-bg-preview-row">
                        <img src={bgImage} alt="bg preview" className="archival-bg-preview-img" />
                        <span className="archival-bg-preview-label">현재 배경 이미지</span>
                        <button
                          type="button"
                          className="archival-bg-clear-btn"
                          onClick={() => { setBgImage(''); localStorage.removeItem('ad_bgImage'); }}
                          title="배경 초기화"
                        >✕</button>
                      </div>
                    ) : (
                      <div className="archival-bg-no-image">기본 배경 사용 중</div>
                    )}
                  </div>
                )}
                {/* 단색 모드 */}
                {bgMode === 'color' && (
                  <div className="archival-bg-color-section">
                    <div className="archival-bg-color-row">
                      <input
                        type="color"
                        value={bgColor}
                        onChange={e => { setBgColor(e.target.value); localStorage.setItem('ad_bgColor', e.target.value); }}
                        className="archival-bg-color-picker"
                      />
                      <span className="archival-bg-color-label">{bgColor}</span>
                    </div>
                    {/* 프리셋 */}
                    <div className="archival-bg-presets">
                      {['#f8fafc', '#1e293b', '#0f172a', '#eff6ff', '#f0fdf4', '#fefce8', '#fff1f2'].map(c => (
                        <button
                          key={c}
                          type="button"
                          className={`archival-bg-preset-dot${bgColor === c ? ' selected' : ''}`}
                          style={{ background: c }}
                          onClick={() => { setBgColor(c); localStorage.setItem('ad_bgColor', c); }}
                          title={c}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* 본문 레이아웃 (좌: 소장자검색 + 아카이브리스트 / 우: 상세 정보 및 이미지) */}
      <div className="archival-body">
        {/* 좌측 사이드바 */}
        <aside className="archival-sidebar">
          {/* 1. 소장자 선택 (AutoScan 동일 UI) */}
          <div className="archival-owner-section">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', display: 'flex', alignItems: 'center', gap: 4 }}>
                <UserCircle size={14} style={{ display: 'inline', verticalAlign: -2 }} />
                소장자 선택
              </span>
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
                  onMouseDown={e => { e.preventDefault(); setOwnerSearchQuery(''); setSelectedOwner(null); setOwnerDetailExpanded(false); }}
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
                    {ownerSearchQuery ? '검색 결과 없음' : (ownerDomain ? '소장자 데이터가 없습니다' : '소장자 도메인이 없습니다')}
                  </div>
                ) : (
                  filteredOwnerEntities.map(e => {
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
                        v !== label
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
                          handleSelectOwner({ anchorId: e.anchorId, label, phone, detail: detail.length > 0 ? detail : undefined });
                          setOwnerDetailExpanded(false);
                          setOwnerSearchQuery('');
                          setOwnerSearchFocused(false);
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

          {/* 2. 상위 카테고리 리스트 (사용자 요청: 책 : 2, 편지 : 2 스타일) */}
          <div className="archival-list-section">
            <div className="archival-list-header">
              <span className="archival-list-title">
                <FileText size={14} />
                <span>소장품 목록 ({categories.length}종 · 총 {archivalList.length}건)</span>
              </span>
            </div>

            <div className="archival-items-scroll">
              {categories.length === 0 ? (
                <div style={{ padding: '36px 16px', textAlign: 'center', color: '#94a3b8' }}>
                  <BookOpen size={28} style={{ margin: '0 auto 10px auto', opacity: 0.35, display: 'block' }} />
                  <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>
                    등록된 아카이브가 없습니다
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                    아카이브 메뉴에서 해당 소장자의 소장품을 저장하면 이곳에 표시됩니다.
                  </div>
                </div>
              ) : (
                categories.map(cat => {
                  const isActive = cat.rootType === selectedCategory;
                  return (
                    <div
                      key={cat.rootType}
                      className={`archival-card-item archival-category-item ${isActive ? 'active' : ''}`}
                      onClick={() => {
                        setSelectedCategory(cat.rootType);
                        if (cat.items.length > 0) {
                          setSelectedItemId(cat.items[0].id);
                        }
                      }}
                    >
                      <div className="archival-category-content">
                        {/* 소장품 명칭 및 등록 건수 배지 */}
                        <div className="archival-category-title-row" style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                          <span className="archival-category-name">{cat.rootType}</span>
                          <span style={{
                            marginLeft: 'auto',
                            padding: '1px 7px',
                            borderRadius: '10px',
                            background: isActive ? '#e0e7ff' : '#f1f5f9',
                            color: isActive ? '#4338ca' : '#475569',
                            fontSize: '0.72rem',
                            fontWeight: 700
                          }}>
                            {cat.count}건
                          </span>
                        </div>

                        <div className="archival-category-meta">
                          <span className="archival-category-sub-text">
                            {cat.items[0]?.title || `${cat.rootType} 자료`}
                          </span>
                          {cat.latestDate && (
                            <>
                              <span>·</span>
                              <span>{cat.latestDate}</span>
                            </>
                          )}
                        </div>

                        {/* 개별 인스턴스 서브 리스트 (책 1, 책 2...) */}
                        {cat.items.length > 1 && (
                          <div style={{ marginTop: '8px', paddingTop: '6px', borderTop: '1px dashed #e2e8f0', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            {cat.items.map((it, idx) => {
                              const isSubActive = it.id === selectedItemId;
                              return (
                                <div
                                  key={it.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedCategory(cat.rootType);
                                    setSelectedItemId(it.id);
                                  }}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '3px 8px',
                                    borderRadius: '5px',
                                    background: isSubActive ? '#4f46e5' : '#f8fafc',
                                    color: isSubActive ? '#ffffff' : '#475569',
                                    fontSize: '0.72rem',
                                    fontWeight: isSubActive ? 700 : 500,
                                    cursor: 'pointer',
                                    transition: 'all 0.12s'
                                  }}
                                >
                                  <span style={{ opacity: isSubActive ? 0.9 : 0.6 }}>#{idx + 1}</span>
                                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                                    {it.title || `${cat.rootType} ${idx + 1}`}
                                  </span>
                                  {it.heroImage && (
                                    <img src={it.heroImage} alt="" style={{ width: '16px', height: '16px', objectFit: 'cover', borderRadius: '3px', flexShrink: 0 }} />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {cat.heroImage ? (
                        <div className="archival-card-thumb">
                          <img src={cat.heroImage} alt={cat.rootType} />
                        </div>
                      ) : (
                        <div className="archival-card-thumb archival-no-image-thumb" title="이미지 없음">
                          <ImageOff size={13} color="#94a3b8" />
                          <span>NO IMAGE</span>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </aside>

        {/* 우측 상세 본문: 저장된 이미지와 입력한 정보 */}
        <main className="archival-content-main">
          {selectedItem ? (
            <>
              {/* 상세 헤더 (좌측: 자료 정보 / 우측: 인스턴스 숫자 리스트 1, 2, 3...) */}
              <div className="archival-detail-header">
                <div className="archival-detail-title-group">
                  <div className="archival-detail-meta-row">
                    <span><strong>소장자:</strong> {selectedItem.ownerName}</span>
                    <span>·</span>
                    <span><strong>등록일자:</strong> {selectedItem.createdAt}</span>
                    <span>·</span>
                    <span><strong>자료명:</strong> {selectedItem.title}</span>
                  </div>
                </div>

                {/* 우측 상단 인스턴스 숫자 리스트 (사용자 요청: 해당 숫자를 클릭하면 해당 정보가 아래에 나타나게) */}
                {currentCategoryItems.length > 0 && (
                  <div className="archival-instance-nav">
                    <span className="archival-instance-nav-label">
                      {selectedCategory}
                    </span>
                    <div className="archival-instance-num-list">
                      {currentCategoryItems.map((item, idx) => {
                        const isCurrent = item.id === selectedItemId;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            className={`archival-instance-num-btn ${isCurrent ? 'active' : ''}`}
                            onClick={() => setSelectedItemId(item.id)}
                            title={`${selectedCategory} ${idx + 1}: ${item.title}`}
                          >
                            {idx + 1}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* 상세 본문 컨테이너: 저장할 때와 동일하게 도메인 카드 및 노드별 탭으로 구성 */}
              <div className="archival-detail-body">
                {/* 1. 최상위 도메인 카드 (예: 책 : 묶음정리) */}
                <section className="archival-domain-card">
                  <div
                    className="archival-domain-card-header"
                    onClick={() => setTopCardCollapsed(v => !v)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                      <Layers size={14} color="#4f46e5" />
                      <span>{selectedItem.rootTypeWithNum || selectedItem.rootType} : 묶음정리</span>
                    </div>
                    <button
                      type="button"
                      className="archival-card-collapse-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setTopCardCollapsed(v => !v);
                      }}
                      title={topCardCollapsed ? "펼치기" : "접기"}
                    >
                      {topCardCollapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
                    </button>
                  </div>

                  {!topCardCollapsed && (
                    <div className="archival-card-body">
                      {selectedItem.heroImage ? (
                        <div
                          className="archival-hero-image-wrap"
                          onClick={() => openLightboxDetail(selectedItem.heroImage!, selectedItem.title, undefined, selectedItem.id)}
                          onDoubleClick={() => openLightboxDetail(selectedItem.heroImage!, selectedItem.title, undefined, selectedItem.id)}
                          title="더블클릭하여 화면확대 및 사료설명/분류 편집"
                        >
                          <img src={selectedItem.heroImage} alt={selectedItem.title} />
                          {/* #N : 요약설명 (사이즈) 배지 (공통 함수) */}
                          {renderImageBadge(
                            selectedItem,
                            heroOrderNum,
                            () => openEditHeroItem(selectedItem),
                            `#${heroOrderNum} 클릭하여 묶음정리 정보 수정`
                          )}
                          <div className="archival-hero-overlay">
                            <ZoomIn size={16} />
                            <span>더블클릭 확대</span>
                          </div>
                        </div>
                      ) : (
                        <div className="archival-hero-image-wrap archival-no-image-hero">
                          <ImageOff size={32} color="#94a3b8" />
                          <span className="archival-no-image-text">NO IMAGE</span>
                          {renderImageBadge(
                            selectedItem,
                            heroOrderNum,
                            () => openEditHeroItem(selectedItem),
                            `#${heroOrderNum} 클릭하여 묶음정리 정보 수정`
                          )}
                        </div>
                      )}

                      {/* 이미지 아래 한 줄 바: 등록설명 | 아카이브수량 = N | 사료분류 ( ... ) */}
                      {(() => {
                        const dataObj = { ...(selectedItem.rawTopEntity?.data || {}), ...selectedItem.fields };
                        try {
                          const stored = localStorage.getItem(`demo_arch_fields_${selectedItem.id}`);
                          if (stored) mergeAdOnlyFields(dataObj, JSON.parse(stored));
                        } catch (_) {}

                        const heroDomain = findDomainForItem(selectedItem);
                        const domainFieldsList = getDomainEditableFields(heroDomain);

                        // 1) anchor 필드(등록설명/제목류): 미디어·요약설명·사이즈 제외 첫 번째
                        const anchorField = domainFieldsList.find(f =>
                          !isMediaField(f) && f !== '요약설명' && f !== '사이즈'
                        );
                        const anchorVal = (anchorField ? dataObj[anchorField] : '') || dataObj['등록설명'] || dataObj['제목'] || selectedItem.title || '';

                        // 2) 수량 필드: anchor 이후 미디어·요약설명·사이즈 제외 두 번째
                        const quantityField = domainFieldsList.find(f =>
                          !isMediaField(f) && f !== '요약설명' && f !== '사이즈' && f !== anchorField
                        );
                        const quantityVal = quantityField ? (dataObj[quantityField] || '') : '';

                        // 3) 사료분류: _linkedClassifications 기반 동적 생성
                        let classificationStr = '';
                        const rawLinked = dataObj['_linkedClassifications'];
                        if (rawLinked) {
                          try {
                            const parsed = JSON.parse(rawLinked);
                            if (Array.isArray(parsed) && parsed.length > 0) {
                              const parts = parsed
                                .filter((label: string) => dataObj[label] && String(dataObj[label]).trim())
                                .map((label: string) => `${label} : ${dataObj[label]}`);
                              if (parts.length > 0) {
                                classificationStr = `사료분류 ( ${parts.join(' , ')} )`;
                              }
                            }
                          } catch (_) {}
                        }

                        const segments: string[] = [];
                        if (anchorVal) segments.push(anchorVal);
                        if (quantityField && quantityVal) segments.push(`${quantityField} = ${quantityVal}`);
                        if (classificationStr) segments.push(classificationStr);

                        // 4) 사료설명: 사료설명 팝업에서 저장된 '사료설명' 필드 (기존 '사료개요' 완벽 호환)
                        const overviewVal = dataObj['사료설명'] || dataObj['사료개요'] || dataObj['상세설명'] || '';
                        if (overviewVal) segments.push('사료설명 : ' + overviewVal);

                        return (
                          <div
                            className="archival-hero-single-line-bar archival-hero-info-bar"
                            onClick={() => openEditHeroItem(selectedItem)}
                            title="클릭하여 묶음정리 정보 수정"
                          >
                            {segments.map((seg, idx) => (
                              <span key={idx} className="archival-hero-info-seg">
                                {idx > 0 && <span className="archival-hero-info-sep"> | </span>}
                                {seg}
                              </span>
                            ))}
                            {segments.length === 0 && (
                              <span className="archival-hero-info-empty">클릭하여 묶음정리 정보 입력</span>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </section>

                {/* 2. 하위 도메인 카드 (노드별 탭 바: DomainTabsBar와 동일 스타일) */}
                {childNodesOfRoot.length > 0 && (
                  <section className="archival-domain-card">
                    <div
                      className="archival-domain-card-header"
                      style={{
                        padding: 0,
                        background: '#e0e7ff',
                        height: '35px',
                        overflow: 'hidden',
                        alignItems: 'stretch',
                      }}
                    >
                      <ArchivalTabsBar
                        childNodes={childNodesOfRoot}
                        activeNode={activeChildNode}
                        onSelectNode={(node) => setActiveChildNode(node)}
                        countsByNode={countsByNode}
                        domainName={linkedDomain?.name || "기록물"}
                      />
                      <button
                        type="button"
                        className="archival-card-collapse-btn"
                        onClick={() => setSubCardCollapsed(v => !v)}
                        title={subCardCollapsed ? "펼치기" : "접기"}
                        style={{ padding: '0 12px' }}
                      >
                        {subCardCollapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
                      </button>
                    </div>

                    {!subCardCollapsed && activeChildNode && (
                      <div className="archival-tab-content-area">
                        {activeSubGroup && activeSubGroup.items.length > 0 ? (
                          <div className="archival-sub-grid">
                            {activeSubGroup.items.map(subItem => (
                              <div key={subItem.id} className="archival-sub-card">
                                {subItem.image ? (
                                  <div
                                    className="archival-sub-img-wrap"
                                    onClick={() => openLightboxDetail(subItem.image!, `${activeChildNode.label} #${subItem.order} - ${subItem.title}`, subItem)}
                                    onDoubleClick={() => openLightboxDetail(subItem.image!, `${activeChildNode.label} #${subItem.order} - ${subItem.title}`, subItem)}
                                    title="더블클릭하여 화면확대 및 사료설명/분류 편집"
                                  >
                                    <img src={subItem.image} alt={subItem.title} />
                                    {/* #순번 배지: 공통 함수 사용 */}
                                    {renderImageBadge(
                                      subItem,
                                      subItem.order,
                                      () => openEditSubItem(subItem),
                                      `#${subItem.order} 클릭하여 정보 수정`,
                                      linkedDomain
                                    )}
                                  </div>
                                ) : (
                                  <div className="archival-sub-img-wrap archival-no-image-sub">
                                    <ImageOff size={24} color="#94a3b8" />
                                    <span className="archival-no-image-text">NO IMAGE</span>
                                    {/* NO IMAGE 배지: 동일 스타일 공통 함수 사용 */}
                                    {renderImageBadge(
                                      subItem,
                                      subItem.order,
                                      () => openEditSubItem(subItem),
                                      `#${subItem.order} 클릭하여 정보 수정`,
                                      linkedDomain
                                    )}
                                  </div>
                                )}

                                {(() => {
                                  // fields + localStorage 합산 (배지와 동일하게 최신 저장 데이터 완벽 반영)
                                  const ancId = subItem.id.split('_')[0];
                                  const subIdx = subItem.id.includes('_') ? subItem.id.split('_')[1] : '0';
                                  const dataObj: Record<string, string> = { ...subItem.fields };
                                  try {
                                    const stored = localStorage.getItem(`demo_arch_fields_${ancId}`);
                                    if (stored) mergeAdOnlyFields(dataObj, JSON.parse(stored));
                                  } catch (_) {}

                                  const isMultiSubItem = subItem.id.includes('_');
                                  const readField = (key: string) => {
                                    if (!key) return '';
                                    if (isMultiSubItem && subIdx !== '0') {
                                      // 2번째 이상 복수 아이템: 오직 자기 자신의 인덱스(key_subIdx)만 읽음 (0번 기본값 참조 금지)
                                      return dataObj[`${key}_${subIdx}`] || '';
                                    }
                                    return dataObj[key] || dataObj[`${key}_0`] || '';
                                  };

                                  // 1) 등록설명: 도메인의 첫 번째 텍스트 필드 값 (폴백: '등록설명', '제목')
                                  const imgBp = blueprints?.find(bp => bp.inputType === 'image' || bp.inputType === 'camera' || (bp.inputType as string) === 'imageUpload');
                                  const extraFieldLabels: string[] = (imgBp?.extraFields || []).map((ef: { label?: string; name?: string }) => ef.label || ef.name || '');
                                  const domainTextFields = (linkedDomain?.fields || []).filter((f: string) =>
                                    !isMediaField(f) && !extraFieldLabels.includes(f)
                                  );
                                  const regField = domainTextFields[0] || '등록설명';
                                  const regVal = readField(regField) || readField('등록설명') || readField('제목') || '';

                                  // 2) 사료분류: _linkedClassifications 기반 동적 생성 (묶음정보와 동일 포맷)
                                  let classificationStr = '';
                                  const rawCardLinked = dataObj['_linkedClassifications'];
                                  if (rawCardLinked) {
                                    try {
                                      const parsed = JSON.parse(rawCardLinked);
                                      if (Array.isArray(parsed) && parsed.length > 0) {
                                        const parts = parsed
                                          .filter((label: string) => readField(label).trim())
                                          .map((label: string) => `${label} : ${readField(label)}`);
                                        if (parts.length > 0) {
                                          classificationStr = `사료분류 ( ${parts.join(' , ')} )`;
                                        }
                                      }
                                    } catch (_) {}
                                  }

                                  // 3) 사료설명: 라이트박스 팝업에서 저장된 '사료설명' 필드 (기존 '사료개요', '상세설명' 데이터 완벽 호환)
                                  const descVal = readField('사료설명') || readField('사료개요') || readField('상세설명') || readField('설명');

                                  // 묶음정보 사진아래와 동일하게 텍스트 연결 (아카이브수량만 제외)
                                  const segments: string[] = [];
                                  if (regVal) segments.push(regVal);
                                  if (classificationStr) segments.push(classificationStr);
                                  if (descVal) segments.push(`사료설명 : ${descVal}`);

                                  return (
                                    <div
                                      className="archival-sub-card-body"
                                      onClick={() => openEditSubItem(subItem)}
                                      title="클릭하여 기록물 정보 수정"
                                    >
                                      {segments.map((seg, idx) => (
                                        <span key={idx} className="archival-sub-info-seg">
                                          {idx > 0 && <span className="archival-sub-info-sep"> | </span>}
                                          {seg}
                                        </span>
                                      ))}
                                      {segments.length === 0 && (
                                        <span className="archival-hero-info-empty">클릭하여 기록물 정보 입력</span>
                                      )}
                                    </div>
                                  );
                                })()}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ padding: '36px 16px', textAlign: 'center', color: '#94a3b8' }}>
                            <Layers size={28} style={{ margin: '0 auto 8px auto', opacity: 0.35, display: 'block' }} />
                            <div style={{ fontSize: '0.84rem', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>
                              등록된 {activeChildNode.label} 자료가 없습니다
                            </div>
                            <div style={{ fontSize: '0.74rem', color: '#94a3b8' }}>
                              아카이브 메뉴에서 {activeChildNode.label} 탭을 선택하고 촬영 또는 이미지를 등록할 수 있습니다.
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </section>
                )}
              </div>
            </>
          ) : (
            <div className="archival-empty-state">
              <div className="archival-empty-icon">
                <Layers size={32} />
              </div>
              <h3 className="archival-empty-title">아카이브 기록물을 선택해주세요</h3>
              <p className="archival-empty-desc">
                좌측 목록에서 열람하고자 하는 계층 기록물 항목을 클릭하시면 상세 메타데이터와 고화질 이미지를 확인할 수 있습니다.
              </p>
            </div>
          )}
        </main>
      </div>

      {/* 하위 기록물 필드 편집 팝업 */}
      {editSubItemPopup && (
        <div className="archival-edit-popup-overlay" onClick={() => setEditSubItemPopup(null)}>
          <div className="archival-edit-popup-container" onClick={e => e.stopPropagation()}>
            <div className="archival-edit-popup-header">
              <span className="archival-edit-popup-title">
                <Pencil size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                {editSubItemPopup.item.title} 정보 수정
              </span>
              <button
                type="button"
                className="archival-edit-popup-close"
                onClick={() => setEditSubItemPopup(null)}
                title="닫기 (ESC)"
              >
                <X size={18} />
              </button>
            </div>
            <div className="archival-edit-popup-body">
              {/* 이미지 편집 섹션 - 묶음정리 팝업과 동일한 UI */}
              {editSubItemPopup.imageFieldKey && (
                <div className="archival-edit-popup-field">
                  <label className="archival-edit-popup-label">{editSubItemPopup.imageFieldKey} (등록 이미지)</label>
                  {editSubItemPopup.currentImageUrl ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginTop: '6px', padding: '10px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                      <img
                        src={editSubItemPopup.currentImageUrl}
                        alt={editSubItemPopup.imageFieldKey}
                        style={{ width: '84px', height: '64px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #cbd5e1', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}
                      />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 14px', fontSize: '12px', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, color: '#334155', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                          <Upload size={14} />
                          이미지 변경
                          <input type="file" accept="image/*" style={{ display: 'none' }}
                            onChange={e => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const reader = new FileReader();
                                reader.onload = ev => {
                                  const dataUrl = ev.target?.result as string;
                                  setEditSubItemPopup(prev => prev ? { ...prev, currentImageUrl: dataUrl } : null);
                                };
                                reader.readAsDataURL(file);
                              }
                            }}
                          />
                        </label>
                        <button
                          type="button"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px', fontSize: '11px', color: '#ef4444', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 500 }}
                          onClick={() => setEditSubItemPopup(prev => prev ? { ...prev, currentImageUrl: '' } : null)}
                        >
                          <Trash2 size={12} />
                          이미지 제거
                        </button>
                      </div>
                    </div>
                  ) : (
                    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '6px', padding: '16px', background: '#f8fafc', border: '2px dashed #cbd5e1', borderRadius: '8px', cursor: 'pointer', color: '#64748b', fontSize: '13px', fontWeight: 500 }}>
                      <Upload size={16} />
                      <span>클릭하여 이미지 파일 등록/업로드</span>
                      <input type="file" accept="image/*" style={{ display: 'none' }}
                        onChange={e => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onload = ev => {
                              const dataUrl = ev.target?.result as string;
                              setEditSubItemPopup(prev => prev ? { ...prev, currentImageUrl: dataUrl } : null);
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                    </label>
                  )}
                </div>
              )}
              {/* 도메인 연결 텍스트 필드만 표시 */}
              {Object.entries(editSubItemPopup.editFields)
                .filter(([fk]) => !fk.startsWith('_') && fk !== '등록순번')
                .map(([fk, fv]) => {
                  const isDescReadOnly = fk === '사료설명' || fk.includes('사료설명');
                  return (
                    <div key={fk} className="archival-edit-popup-field">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <label className="archival-edit-popup-label" style={{ marginBottom: 0 }}>{fk}</label>
                        {isDescReadOnly && <span style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 500 }}>(화면확대 팝업에서 편집)</span>}
                      </div>
                      {isDescReadOnly ? (
                        <input type="text" className="archival-edit-popup-input archival-edit-popup-input-readonly" value={fv} readOnly disabled
                          style={{ backgroundColor: '#f1f5f9', color: '#64748b', cursor: 'not-allowed', borderColor: '#e2e8f0' }} />
                      ) : (
                        <AutocompleteInput
                          value={fv}
                          onChange={val => setEditSubItemPopup(prev => prev ? { ...prev, editFields: { ...prev.editFields, [fk]: val } } : null)}
                          placeholder={`${fk} 입력...`}
                          fieldName={fk}
                          existingValues={getExistingValuesForField(fk)}
                        />
                      )}
                    </div>
                  );
                })
              }
            </div>
            <div className="archival-edit-popup-footer">
              <button
                type="button"
                className="archival-edit-popup-cancel"
                onClick={() => setEditSubItemPopup(null)}
              >
                취소
              </button>
              <button
                type="button"
                className="archival-edit-popup-save"
                onClick={() => {
                  // 수정된 필드값을 스토어에 저장 (사료설명은 이 팝업을 통해 변경되지 않도록 보호)
                  if (editSubItemPopup) {
                    const anchorId = editSubItemPopup.item.id.split('_')[0];
                    const subIdx = editSubItemPopup.item.id.includes('_') ? editSubItemPopup.item.id.split('_')[1] : null;
                    // 이미지 저장
                    if (editSubItemPopup.imageFieldKey) {
                      const imgVal = editSubItemPopup.currentImageUrl;
                      const imgKey = editSubItemPopup.imageFieldKey;
                      updateEntityField(anchorId, imgKey, imgVal);
                      if (subIdx !== null) updateEntityField(anchorId, `${imgKey}_${subIdx}`, imgVal);
                      editSubItemPopup.item.image = imgVal;
                      editSubItemPopup.item.fields[imgKey] = imgVal;
                    }
                    // 텍스트 필드 저장 (subIdx가 있을 때 인덱스 키와 기본 키 모두 저장하여 즉시 반영 보장)
                    Object.entries(editSubItemPopup.editFields).forEach(([fk, fv]) => {
                      if (fk === '사료설명' || fk.includes('사료설명')) return;
                      updateEntityField(anchorId, fk, fv);
                      if (subIdx !== null) updateEntityField(anchorId, `${fk}_${subIdx}`, fv);
                      if (fv.trim() && addFieldValue) addFieldValue(fk, fv.trim());
                      editSubItemPopup.item.fields[fk] = fv;
                      if (subIdx !== null) editSubItemPopup.item.fields[`${fk}_${subIdx}`] = fv;
                    });
                    // localStorage 영구 저장
                    try {
                      const stored = localStorage.getItem(`demo_arch_fields_${anchorId}`) || '{}';
                      const obj = JSON.parse(stored);
                      if (editSubItemPopup.imageFieldKey) {
                        obj[editSubItemPopup.imageFieldKey] = editSubItemPopup.currentImageUrl;
                        if (subIdx !== null) obj[`${editSubItemPopup.imageFieldKey}_${subIdx}`] = editSubItemPopup.currentImageUrl;
                      }
                      Object.entries(editSubItemPopup.editFields).forEach(([fk, fv]) => {
                        if (fk !== '사료설명' && !fk.includes('사료설명')) {
                          obj[fk] = fv;
                          if (subIdx !== null) obj[`${fk}_${subIdx}`] = fv;
                        }
                      });
                      localStorage.setItem(`demo_arch_fields_${anchorId}`, JSON.stringify(obj));
                    } catch (_) {}
                    setRefreshKey(k => k + 1);
                  }
                  setEditSubItemPopup(null);
                }}
              >
                <Check size={13} style={{ marginRight: '4px' }} />
                저장
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 상단 묶음정리 필드 편집 팝업 */}
      {editHeroPopup && (
        <div className="archival-edit-popup-overlay" onClick={() => setEditHeroPopup(null)}>
          <div className="archival-edit-popup-container" onClick={e => e.stopPropagation()}>
            <div className="archival-edit-popup-header">
              <span className="archival-edit-popup-title">
                <Pencil size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                #{heroOrderNum} {editHeroPopup.item.rootTypeWithNum || editHeroPopup.item.rootType} : 묶음정리 정보 수정
              </span>
              <button
                type="button"
                className="archival-edit-popup-close"
                onClick={() => setEditHeroPopup(null)}
                title="닫기 (ESC)"
              >
                <X size={18} />
              </button>
            </div>
            <div className="archival-edit-popup-body">
              {Object.entries(editHeroPopup.editFields)
                .filter(([fk]) => !fk.startsWith('_') && fk !== '등록순번')
                .map(([fk, fv]) => {
                  const isImgField = isMediaField(fk);
                  if (isImgField) {
                    const currentImg = fv || editHeroPopup.item.heroImage || '';
                    return (
                      <div key={fk} className="archival-edit-popup-field">
                        <label className="archival-edit-popup-label">{fk} (등록 이미지)</label>
                        {currentImg ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginTop: '6px', padding: '10px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                            <img
                              src={currentImg}
                              alt={fk}
                              style={{ width: '84px', height: '64px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #cbd5e1', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}
                            />
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              <label style={{
                                display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 14px',
                                fontSize: '12px', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px',
                                cursor: 'pointer', fontWeight: 600, color: '#334155', boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                              }}>
                                <Upload size={14} />
                                이미지 변경
                                <input
                                  type="file"
                                  accept="image/*"
                                  style={{ display: 'none' }}
                                  onChange={e => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                      const reader = new FileReader();
                                      reader.onload = ev => {
                                        const dataUrl = ev.target?.result as string;
                                        setEditHeroPopup(prev => prev ? {
                                          ...prev,
                                          editFields: { ...prev.editFields, [fk]: dataUrl }
                                        } : null);
                                      };
                                      reader.readAsDataURL(file);
                                    }
                                  }}
                                />
                              </label>
                              <button
                                type="button"
                                style={{
                                  display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px',
                                  fontSize: '11px', color: '#ef4444', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 500
                                }}
                                onClick={() => {
                                  setEditHeroPopup(prev => prev ? {
                                    ...prev,
                                    editFields: { ...prev.editFields, [fk]: '' }
                                  } : null);
                                }}
                              >
                                <Trash2 size={12} />
                                이미지 제거
                              </button>
                            </div>
                          </div>
                        ) : (
                          <label style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                            marginTop: '6px', padding: '16px', background: '#f8fafc', border: '2px dashed #cbd5e1', borderRadius: '8px',
                            cursor: 'pointer', color: '#64748b', fontSize: '13px', fontWeight: 500
                          }}>
                            <Upload size={16} />
                            <span>클릭하여 이미지 파일 등록/업로드</span>
                            <input
                              type="file"
                              accept="image/*"
                              style={{ display: 'none' }}
                              onChange={e => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  const reader = new FileReader();
                                  reader.onload = ev => {
                                    const dataUrl = ev.target?.result as string;
                                    setEditHeroPopup(prev => prev ? {
                                      ...prev,
                                      editFields: { ...prev.editFields, [fk]: dataUrl }
                                    } : null);
                                  };
                                  reader.readAsDataURL(file);
                                }
                              }}
                            />
                          </label>
                        )}
                      </div>
                    );
                  }

                  return (
                    <div key={fk} className="archival-edit-popup-field">
                      <label className="archival-edit-popup-label">{fk}</label>
                      <AutocompleteInput
                        value={fv}
                        onChange={val => setEditHeroPopup(prev => prev ? {
                          ...prev,
                          editFields: { ...prev.editFields, [fk]: val }
                        } : null)}
                        placeholder={`${fk} 입력...`}
                        fieldName={fk}
                        existingValues={getExistingValuesForField(fk)}
                      />
                    </div>
                  );
                })}
            </div>
            <div className="archival-edit-popup-footer">
              <button
                type="button"
                className="archival-edit-popup-cancel"
                onClick={() => setEditHeroPopup(null)}
              >
                취소
              </button>
              <button
                type="button"
                className="archival-edit-popup-save"
                onClick={() => {
                  if (editHeroPopup) {
                    const anchorId = editHeroPopup.item.id;
                    Object.entries(editHeroPopup.editFields).forEach(([fk, fv]) => {
                      updateEntityField(anchorId, fk, fv);
                      if (fk === '요약설명') {
                        // AutoScan 연동 호환을 위해 요약설명_0 동시 업데이트
                        updateEntityField(anchorId, '요약설명_0', fv);
                        editHeroPopup.item.fields['요약설명_0'] = fv;
                      }
                      if (fk === '사이즈') {
                        // AutoScan 연동 호환을 위해 사이즈_0 및 이미지사이즈_0 동시 업데이트
                        updateEntityField(anchorId, '사이즈_0', fv);
                        updateEntityField(anchorId, '이미지사이즈_0', fv);
                        editHeroPopup.item.fields['사이즈_0'] = fv;
                        editHeroPopup.item.fields['이미지사이즈_0'] = fv;
                      }
                      if (isMediaField(fk)) {
                        // 등록 이미지 수정/교체 시 히어로 이미지 동시 반영
                        updateEntityField(anchorId, `${fk}_0`, fv);
                        updateEntityField(anchorId, '이미지업로드', fv);
                        updateEntityField(anchorId, '이미지업로드_0', fv);
                        editHeroPopup.item.heroImage = fv || undefined;
                        if (selectedItem) selectedItem.heroImage = fv || undefined;
                      }
                      if (fk === '제목' || fk === '등록설명') {
                        editHeroPopup.item.title = fv;
                      }
                      if (fv.trim() && addFieldValue) {
                        addFieldValue(fk, fv.trim());
                      }
                      editHeroPopup.item.fields[fk] = fv;
                    });
                    // localStorage에도 영구 저장 (새로고침 후에도 유지)
                    try {
                      const stored = localStorage.getItem(`demo_arch_fields_${anchorId}`) || '{}';
                      const obj = JSON.parse(stored);
                      Object.entries(editHeroPopup.editFields).forEach(([fk, fv]) => {
                        obj[fk] = fv;
                        if (fk === '요약설명') obj['요약설명_0'] = fv;
                        if (fk === '사이즈') {
                          obj['사이즈_0'] = fv;
                          obj['이미지사이즈_0'] = fv;
                        }
                        if (isMediaField(fk)) {
                          obj[`${fk}_0`] = fv;
                          obj['이미지업로드'] = fv;
                          obj['이미지업로드_0'] = fv;
                          obj['heroImage'] = fv;
                        }
                      });
                      localStorage.setItem(`demo_arch_fields_${anchorId}`, JSON.stringify(obj));
                    } catch (_) {}
                    // 리렌더링 트리거 (topFieldsEntries 실시간 반영)
                    setRefreshKey(prev => prev + 1);
                  }
                  setEditHeroPopup(null);
                }}
              >
                <Check size={13} style={{ marginRight: '4px' }} />
                저장
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 이미지 화면확대 팝업 (확대축소, 드래그 이동, 사료설명 및 사료분류 아이콘 지원) */}
      {lightboxImg && (
        <div className="archival-lightbox-overlay" onClick={() => setLightboxImg(null)}>
          {/* 전체 화면 뷰어 레이아웃 */}
          <div className="archival-lightbox-fullscreen-viewer" onClick={e => e.stopPropagation()}>
            {/* 좌측 상단 툴바: 사료설명아이콘, 사료분류아이콘, 캡션 */}
            <div className="archival-lightbox-topbar">
              <div className="archival-lightbox-topbar-left">
                {/* 1. 사료설명 아이콘 */}
                <button
                  type="button"
                  className={`archival-viewer-tool-btn ${isDescPopupOpen ? 'active' : ''}`}
                  onClick={() => setIsDescPopupOpen(v => !v)}
                  title="사료설명 팝업 열기/닫기"
                >
                  <FileText size={17} />
                  <span>사료설명</span>
                  {descInputText && <span className="archival-tool-badge">●</span>}
                </button>

                {/* 2. 사료분류 아이콘 */}
                <button
                  type="button"
                  className={`archival-viewer-tool-btn ${isClassificationModalOpen ? 'active' : ''}`}
                  onClick={() => setIsClassificationModalOpen(v => !v)}
                  title="사료분류 트리 선택"
                >
                  <FolderTree size={17} />
                  <span>사료분류</span>
                  {selectedClassNodeLabels.length > 0 && (
                    <span className="archival-tool-count-pill">{selectedClassNodeLabels.length}</span>
                  )}
                </button>

                <div className="archival-lightbox-caption-text">
                  {getLightboxCaption()}
                </div>
              </div>

              {/* 우측 닫기 버튼 */}
              <button
                type="button"
                className="archival-lightbox-close-btn"
                onClick={() => setLightboxImg(null)}
                title="닫기 (ESC)"
              >
                <X size={20} />
              </button>
            </div>

            {/* 이미지 뷰포트 (드래그 이동 & 휠 확대축소) */}
            <div
              className="archival-lightbox-canvas"
              onWheel={handleViewerWheel}
              onPointerDown={handleViewerPointerDown}
              onPointerMove={handleViewerPointerMove}
              onPointerUp={handleViewerPointerUp}
              onPointerCancel={handleViewerPointerUp}
              onDoubleClick={() => { setViewerZoom(1); setViewerPan({ x: 0, y: 0 }); }}
              style={{
                cursor: isViewerPanning ? 'grabbing' : 'grab',
                touchAction: 'none'
              }}
            >
              <div
                className="archival-lightbox-transform-layer"
                style={{
                  transform: `translate(${viewerPan.x}px, ${viewerPan.y}px) scale(${viewerZoom})`,
                  transformOrigin: 'center center',
                  transition: isViewerPanning ? 'none' : 'transform 0.08s ease-out',
                }}
              >
                <img
                  src={lightboxImg.url}
                  alt={lightboxImg.caption}
                  className="archival-lightbox-image-element"
                  draggable={false}
                />
              </div>

              {/* 하단 줌 & 팬 컨트롤러 바 */}
              <div className="archival-viewer-zoom-bar" onClick={e => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={() => setViewerZoom(z => Math.max(0.2, Math.round((z - 0.25) * 100) / 100))}
                  title="축소"
                >
                  <ZoomOut size={15} />
                </button>
                <span
                  onClick={() => { setViewerZoom(1); setViewerPan({ x: 0, y: 0 }); }}
                  title="클릭하여 100% 리셋"
                >
                  {Math.round(viewerZoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => setViewerZoom(z => Math.min(8, Math.round((z + 0.25) * 100) / 100))}
                  title="확대"
                >
                  <ZoomIn size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => { setViewerZoom(1); setViewerPan({ x: 0, y: 0 }); }}
                  title="위치 및 배율 리셋"
                >
                  <RotateCcw size={13} />
                </button>
                <div className="archival-viewer-zoom-guide">
                  <Move size={12} />
                  <span>드래그 이동 · 휠 확대축소</span>
                </div>
              </div>
            </div>

            {/* ===== 3. 사료설명 움직이는 팝업 (타이틀 바 드래그 이동 가능) ===== */}
            {isDescPopupOpen && (
              <div
                className="archival-desc-movable-popup"
                style={{
                  left: `${descPopupPos.x}px`,
                  top: `${descPopupPos.y}px`,
                }}
                onClick={e => e.stopPropagation()}
              >
                {/* 타이틀 바 (드래그 핸들러) */}
                <div
                  className="archival-desc-popup-header"
                  onPointerDown={handleDescDragDown}
                  onPointerMove={handleDescDragMove}
                  onPointerUp={handleDescDragUp}
                  onPointerCancel={handleDescDragUp}
                  style={{ cursor: isDraggingDescPopup ? 'grabbing' : 'grab' }}
                  title="마우스로 드래그하여 위치 이동"
                >
                  <div className="archival-desc-popup-title">
                    <FileText size={15} color="#3b82f6" />
                    <span>사료설명 및 항목분류 작업</span>
                  </div>
                  <button
                    type="button"
                    className="archival-desc-popup-close-btn"
                    onPointerDown={e => e.stopPropagation()}
                    onClick={() => setIsDescPopupOpen(false)}
                    title="닫기"
                  >
                    <X size={15} />
                  </button>
                </div>

                {/* 팝업 본문 (사료설명 및 선택된 분류 노드별 필드) */}
                <div className="archival-desc-popup-body">
                  {/* 기본: 사료설명 필드 */}
                  <div className="archival-desc-field-group">
                    <label className="archival-desc-field-label">
                      <span>사료설명</span>
                      <span className="archival-desc-field-badge">기본</span>
                    </label>
                    <textarea
                      className="archival-desc-textarea"
                      rows={3}
                      value={descInputText}
                      onChange={e => setDescInputText(e.target.value)}
                      placeholder="사료설명 내용을 입력하세요..."
                    />
                  </div>

                  {/* 사료분류 트리에서 선택된 노드 필드들 */}
                  {selectedClassNodeLabels.length > 0 ? (
                    <div className="archival-desc-dynamic-fields-section">
                      <div className="archival-desc-section-subtitle">
                        <FolderTree size={13} color="#8b5cf6" />
                        <span>선택된 사료분류 필드 ({selectedClassNodeLabels.length}개)</span>
                      </div>
                      <div className="archival-desc-dynamic-fields-list">
                        {selectedClassNodeLabels.map(nodeLabel => (
                          <div key={nodeLabel} className="archival-desc-dynamic-field-row">
                            <div className="archival-desc-dynamic-field-header">
                              <span className="archival-desc-dynamic-field-name">{nodeLabel}</span>
                              <button
                                type="button"
                                className="archival-desc-dynamic-field-del"
                                onClick={() => {
                                  // 연동된 데이터가 있으면 해제 불가
                                  const existingVal = (classificationFields[nodeLabel] || '').trim();
                                  if (existingVal) {
                                    alert(`'${nodeLabel}' 분류항에 입력된 데이터("${existingVal}")가 있어 해제할 수 없습니다.\n데이터를 먼저 삭제한 후 해제해주세요.`);
                                    return;
                                  }
                                  setSelectedClassNodeLabels(prev => prev.filter(l => l !== nodeLabel));
                                  setClassificationFields(prev => {
                                    const next = { ...prev };
                                    delete next[nodeLabel];
                                    return next;
                                  });
                                }}
                                title="필드 제거"
                              >
                                <X size={11} />
                              </button>
                            </div>
                            <AutocompleteInput
                              className="archival-desc-dynamic-input"
                              value={classificationFields[nodeLabel] || ''}
                              onChange={val => setClassificationFields(prev => ({
                                ...prev,
                                [nodeLabel]: val
                              }))}
                              placeholder={`${nodeLabel} 내용 입력...`}
                              fieldName={nodeLabel}
                              existingValues={getExistingValuesForField(nodeLabel)}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="archival-desc-empty-class-notice">
                      <FolderTree size={16} color="#94a3b8" />
                      <span>좌측 상단의 <strong>[사료분류]</strong> 아이콘을 클릭하여 분류 노드를 선택하면 이곳에 개별 필드로 나타납니다.</span>
                    </div>
                  )}
                </div>

                {/* 팝업 푸터 (저장 / 수정 / 삭제 버튼) */}
                <div className="archival-desc-popup-footer">
                  <button
                    type="button"
                    className="archival-desc-btn-delete"
                    onClick={handleDeleteDescription}
                    title="사료설명 및 분류 필드 삭제"
                  >
                    <Trash2 size={13} />
                    <span>삭제</span>
                  </button>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      type="button"
                      className="archival-desc-btn-cancel"
                      onClick={() => setIsDescPopupOpen(false)}
                    >
                      닫기
                    </button>
                    <button
                      type="button"
                      className="archival-desc-btn-save"
                      onClick={handleSaveDescription}
                    >
                      <Save size={13} />
                      <span>저장 · 수정</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ===== 4. 사료분류 트리 선택 팝업 ===== */}
            {isClassificationModalOpen && (
              <div
                className="archival-class-modal-container"
                onClick={e => e.stopPropagation()}
                style={{
                  left: `${Math.min(window.innerWidth - 380, descPopupPos.x + 370)}px`,
                  top: `${descPopupPos.y}px`,
                }}
              >
                {/* 헤더 */}
                <div className="archival-class-modal-header">
                  <div className="archival-class-modal-title">
                    <FolderTree size={16} color="#7c3aed" />
                    <span>사료분류 트리 선택</span>
                    {activeNodeMaxSelect && (
                      <span className="archival-class-max-pill">
                        선택수량: {selectedClassNodeLabels.length}/{activeNodeMaxSelect}개
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    className="archival-class-modal-close"
                    onClick={() => setIsClassificationModalOpen(false)}
                    title="닫기"
                  >
                    <X size={15} />
                  </button>
                </div>

                {/* 상단 선택 상태 바 */}
                <div className="archival-class-selection-summary">
                  <span className="archival-class-summary-txt">
                    {activeNodeMaxSelect
                      ? `* 설정된 선택 수량: 최대 ${activeNodeMaxSelect}개까지 선택 가능`
                      : '* 분류 노드를 클릭하여 선택하세요'}
                  </span>
                  {selectedClassNodeLabels.length > 0 && (
                    <button
                      type="button"
                      className="archival-class-clear-btn"
                      onClick={() => setSelectedClassNodeLabels([])}
                    >
                      선택 해제
                    </button>
                  )}
                </div>

                {/* 트리 노드 렌더링 영역 */}
                <div className="archival-class-tree-body">
                  {(() => {
                    const renderTree = (nodes: TreeNode[], depth: number = 0): React.ReactNode => {
                      return nodes.map(node => {
                        const hasChildren = node.children && node.children.length > 0;
                        const isExpanded = openTreeFolders[node.id] !== false;
                        const isChecked = selectedClassNodeLabels.includes(node.label);

                        return (
                          <div key={node.id} style={{ marginLeft: depth > 0 ? '14px' : '0' }} className="archival-class-tree-node-wrap">
                            <div
                              className={`archival-class-tree-node-row ${isChecked ? 'selected' : ''}`}
                              onClick={() => handleToggleClassNode(node.label)}
                            >
                              {hasChildren ? (
                                <button
                                  type="button"
                                  className="archival-class-tree-expand-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setOpenTreeFolders(prev => ({ ...prev, [node.id]: !isExpanded }));
                                  }}
                                >
                                  {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                                </button>
                              ) : (
                                <span style={{ width: '16px', display: 'inline-block' }} />
                              )}

                              <input
                                type="checkbox"
                                className="archival-class-node-checkbox"
                                checked={isChecked}
                                onChange={() => handleToggleClassNode(node.label)}
                                onClick={e => e.stopPropagation()}
                              />
                              {hasChildren ? (
                                <Folder size={14} className="archival-class-icon-folder" />
                              ) : (
                                <Tags size={14} className="archival-class-icon-leaf" />
                              )}
                              <span className="archival-class-node-label">{node.label}</span>
                            </div>

                            {hasChildren && isExpanded && (
                              <div className="archival-class-tree-children">
                                {renderTree(node.children!, depth + 1)}
                              </div>
                            )}
                          </div>
                        );
                      });
                    };

                    return renderTree(recordClassificationTreeData);
                  })()}
                </div>

                {/* 하단 선택 적용 버튼 */}
                <div className="archival-class-modal-footer">
                  <div className="archival-class-selected-pills">
                    {selectedClassNodeLabels.map(l => (
                      <span key={l} className="archival-class-pill-tag">
                        {l}
                        <button type="button" onClick={() => handleToggleClassNode(l)}>×</button>
                      </span>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="archival-class-apply-btn"
                    onClick={handleApplyClassification}
                  >
                    <Check size={14} />
                    <span>사료설명 필드로 적용</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
