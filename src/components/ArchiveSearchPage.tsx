import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  ArrowLeft, Search, X, BookOpen,
  Image, RotateCcw, FileText, ChevronLeft, ChevronRight,
  ZoomIn, ZoomOut, Move
} from 'lucide-react';
import { useDataStore } from '../store/useDataStore';
import { getAllAtomImages } from '../store/imageStorage';
import { getEntityBasePrefix } from '../utils/formatters';
import type { TreeNode } from '../types';
import './ArchiveSearchPage.css';

interface ArchiveSearchPageProps {
  onBack: () => void;
}

const PAGE_SIZE = 15;

// 사료분류 기본/시드 계층 트리 (사용자 사료분류 트리구조 기본형)
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

// 소장품 기본/시드 계층 트리 (종단노드 추출용)
const DEFAULT_SOJANG_TREE: TreeNode[] = [
  {
    id: 'tn-sojang-root',
    label: '소장품',
    children: [
      {
        id: 'tn-letter',
        label: '편지',
        children: [
          {
            id: 'tn-envelope',
            label: '봉투',
            children: [
              { id: 'tn-letter-paper', label: '편지지' }
            ]
          }
        ]
      },
      {
        id: 'tn-screen',
        label: '병풍',
        children: [
          { id: 'tn-screen-img', label: '폭 이미지' }
        ]
      },
      {
        id: 'tn-book',
        label: '책',
        children: [
          { id: 'tn-book-cover', label: '표지' },
          { id: 'tn-book-inner', label: '속지' }
        ]
      }
    ]
  }
];

// 종단노드(하위 노드가 없는 Leaf node) 모델 및 추출기
export interface TerminalNode {
  id: string;
  label: string;
  fullPath: string;
  pathList: string[];
  /** 이 노드와 모든 하위 노드 ID 집합 (소장품 분류 매칭용) */
  allDescendantIds?: Set<string>;
}

function extractTerminalNodes(nodes: TreeNode[], parentPath: string[] = []): TerminalNode[] {
  const result: TerminalNode[] = [];
  for (const node of nodes) {
    const currentPath = [...parentPath, node.label];
    if (!node.children || node.children.length === 0) {
      result.push({
        id: node.id,
        label: node.label,
        fullPath: currentPath.join(' > '),
        pathList: currentPath
      });
    } else {
      result.push(...extractTerminalNodes(node.children, currentPath));
    }
  }
  return result;
}

/** 트리 노드와 모든 하위 노드 ID 집합을 재귀적으로 수집 */
function collectAllNodeIds(node: TreeNode, result: Set<string> = new Set()): Set<string> {
  result.add(node.id);
  if (node.children) {
    for (const child of node.children) {
      collectAllNodeIds(child, result);
    }
  }
  return result;
}

// 소장품 트리에서 직계 자식노드(1단계)만 추출
// 트리가 단일 루트(소장품)를 가진 경우: 루트의 자식들(편지/병풍/책 등)만 반환
// 트리가 다중 루트인 경우: 각 루트의 직계 자식들 반환
function extractDirectChildNodes(treeData: TreeNode[]): TerminalNode[] {
  const result: TerminalNode[] = [];
  // 단일 루트 + 자식이 있는 경우 (소장품 > 편지/병풍/책 구조)
  if (treeData.length === 1 && treeData[0].children && treeData[0].children.length > 0) {
    const root = treeData[0];
    for (const child of root.children!) {
      result.push({
        id: child.id,
        label: child.label,
        fullPath: `${root.label} > ${child.label}`,
        pathList: [root.label, child.label],
        allDescendantIds: collectAllNodeIds(child)
      });
    }
    return result;
  }
  // 다중 루트인 경우: 루트 자체가 1단계 자식이므로 루트들만 반환
  for (const node of treeData) {
    result.push({
      id: node.id,
      label: node.label,
      fullPath: node.label,
      pathList: [node.label],
      allDescendantIds: collectAllNodeIds(node)
    });
  }
  return result;
}

export interface ParsedClassification {
  label: string;
  value: string;
}

/** _linkedClassifications JSON 또는 배열을 파싱하여 { label, value } 쌍으로 반환
 *  오직 sourceFields(해당 자료 자체)에 실제로 입력된 분류만 반환하며, 타 자료와의 임의 공유/병합을 엄격히 차단 */
function parseLinkedClassifications(
  raw: any,
  sourceFields: Record<string, string>
): ParsedClassification[] {
  const result: ParsedClassification[] = [];
  const seenLabels = new Set<string>();

  const addClass = (label: string, val?: string) => {
    const cleanLabel = (label || '').trim();
    // '-', '--', 빈 공백 등 의미 없는 특수문자 라벨 제외
    if (!cleanLabel || cleanLabel === '-' || cleanLabel === '--' || cleanLabel === 'undefined' || cleanLabel === 'null' || seenLabels.has(cleanLabel)) return;

    let finalVal = (val !== undefined && val !== null ? String(val) : '').trim();
    if (!finalVal && sourceFields[cleanLabel]) {
      finalVal = String(sourceFields[cleanLabel]).trim();
    }

    // 빈 값이거나 대시만 있는 경우 제외 (입력된 자료만 출력)
    if (!finalVal || finalVal === '-' || finalVal === '--') return;

    seenLabels.add(cleanLabel);
    result.push({ label: cleanLabel, value: finalVal });
  };

  // 1) _linkedClassifications 파싱 (해당 자료에 등록된 분류만 파싱)
  if (raw) {
    let parsed = raw;
    if (typeof raw === 'string') {
      try {
        parsed = JSON.parse(raw);
      } catch {
        raw.split(',').forEach((s: string) => addClass(s));
      }
    }

    if (Array.isArray(parsed)) {
      parsed.forEach((item: any) => {
        if (typeof item === 'string') {
          addClass(item);
        } else if (item && typeof item === 'object') {
          const l = item.classLabel || item.label || item.name || item.key;
          const v = item.value || item.val;
          if (l) addClass(String(l), v ? String(v) : undefined);
        }
      });
    }
  }

  return result;
}

// ArchivalDescription 전용 필드 — atom에 저장되지 않으므로 localStorage에서만 보충해야 하는 필드들
const AD_ONLY_FIELD_PATTERNS_SEARCH = ['사료설명', '사료개요', '_linkedClassifications'];

/**
 * localStorage의 demo_arch_fields 데이터를 atom 데이터(dataObj)에 병합할 때,
 * atom에 이미 값이 있는 필드는 덮어쓰지 않고, AD 전용 필드이거나 atom에 없는 필드만 보충합니다.
 */
const mergeAdOnlyFieldsSearch = (dataObj: Record<string, any>, savedFields: Record<string, any>) => {
  Object.entries(savedFields).forEach(([k, v]) => {
    const isAdOnly = AD_ONLY_FIELD_PATTERNS_SEARCH.some(p => k.includes(p));
    const isClassLabel = k.endsWith('분류') && !k.startsWith('_');
    if (isAdOnly || isClassLabel) {
      dataObj[k] = v;
    } else if (!dataObj[k] || dataObj[k] === '' || dataObj[k] === undefined) {
      dataObj[k] = v;
    }
  });
};

export const ArchiveSearchPage: React.FC<ArchiveSearchPageProps> = ({ onBack }) => {
  const { domains, blueprints, getFieldsForDomain, getAtomsForDomain } = useDataStore();

  const [query, setQuery] = useState('');
  const [inputValue, setInputValue] = useState('');
  const [selectedLeafId, setSelectedLeafId] = useState<string | 'all'>('all'); // 사료분류 종단노드 필터
  const [selectedSojangLeafId, setSelectedSojangLeafId] = useState<string | 'all'>('all'); // 소장품 종단노드 필터
  const [page, setPage] = useState(1);
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'name'>('newest');
  const [isSubmitted, setIsSubmitted] = useState(false); // 검색 실행 여부 (홈화면 ↔ 결과화면 전환)

  // 팝업(상세 뷰어) 상태
  const [detailPopup, setDetailPopup] = useState<{
    anchorId: string;
    activeTab: 'overview' | 'desc'; // 사료개요 | 사료설명
    imgIdx: number; // 현재 표시 중인 이미지 인덱스
    showDocPanel: boolean; // 사료설명/사료개요 전체 내용 패널 열림 여부
  } | null>(null);

  // 이미지 드래그·줌 상태
  const [imgTransform, setImgTransform] = useState({ scale: 1, x: 0, y: 0 });
  const imgDragRef = useRef<{ startX: number; startY: number; startTX: number; startTY: number } | null>(null);
  const imgContainerRef = useRef<HTMLDivElement>(null);

  // IndexedDB에 저장된 이미지 맵 ({ atomId 또는 fieldKey : base64 })
  const [idbImageMap, setIdbImageMap] = useState<Record<string, string>>({});
  useEffect(() => {
    getAllAtomImages().then(map => {
      if (map && Object.keys(map).length > 0) setIdbImageMap(map);
    }).catch(console.error);
  }, []);

  const inputRef = useRef<HTMLInputElement>(null);
  const hasSearched = isSubmitted;

  // 사료분류 트리 블루프린트 찾기
  const recordClassificationTree = useMemo(() => {
    return blueprints?.find(b => b.inputType === 'tree' && (b.name === '사료분류' || b.name.includes('사료분류')))
      || blueprints?.find(b => b.inputType === 'tree' && (b.name.includes('사료') || b.name.includes('분류')))
      || null;
  }, [blueprints]);

  // 소장품 트리 블루프린트 찾기
  const sojangClassificationTree = useMemo(() => {
    return blueprints?.find(b => b.inputType === 'tree' && (b.name === '소장품' || b.name.includes('소장품')))
      || blueprints?.find(b => b.inputType === 'tree' && (b.name.includes('소장') || b.name.includes('유물')))
      || null;
  }, [blueprints]);

  // 사료분류 트리의 종단노드(Leaf Nodes) 목록 추출
  const terminalNodes = useMemo<TerminalNode[]>(() => {
    const treeData = recordClassificationTree?.treeData && recordClassificationTree.treeData.length > 0
      ? recordClassificationTree.treeData
      : DEFAULT_RECORD_TREE;
    return extractTerminalNodes(treeData);
  }, [recordClassificationTree]);

  // 소장품 트리의 종단노드(Leaf Nodes) 목록 추출 (예: 편지지, 폭 이미지, 표지, 속지 등)
  const sojangTerminalNodes = useMemo<TerminalNode[]>(() => {
    const treeData = sojangClassificationTree?.treeData && sojangClassificationTree.treeData.length > 0
      ? sojangClassificationTree.treeData
      : DEFAULT_SOJANG_TREE;
    // 소장품 트리의 직계 자식노드(1단계)만 추출 (루트노드 제외)
    return extractDirectChildNodes(treeData);
  }, [sojangClassificationTree]);

  // 소장품 트리의 임의의 노드 ID/라벨로 해당 노드의 정식 한글 라벨(표지, 속지, 폭 등) 검색
  const findSojangNodeLabel = useCallback((nodeIdOrLabel?: string): string | null => {
    if (!nodeIdOrLabel) return null;
    const treeData = sojangClassificationTree?.treeData && sojangClassificationTree.treeData.length > 0
      ? sojangClassificationTree.treeData
      : DEFAULT_SOJANG_TREE;
    let foundLabel: string | null = null;
    const search = (nodes: TreeNode[]) => {
      for (const n of nodes) {
        if (n.id === nodeIdOrLabel || n.label === nodeIdOrLabel) {
          foundLabel = n.label;
          return;
        }
        if (n.children && n.children.length > 0) search(n.children);
      }
    };
    search(treeData);
    return foundLabel;
  }, [sojangClassificationTree]);
  void findSojangNodeLabel;

  // 소장품 트리 1단계 노드 ID 및 라벨 집합 (책, 편지, 병풍 등 — 표지/속지 같은 하위 노드 제외)
  const sojangFirstLevelNodeIds = useMemo<Set<string>>(() => {
    const ids = new Set<string>();
    sojangTerminalNodes.forEach(n => {
      ids.add(n.id);
      ids.add(n.label);
    });
    return ids;
  }, [sojangTerminalNodes]);

  // 소장품 트리와 linkedDomainIds로 연결된 도메인 ID 집합
  const sojangLinkedDomainIds = useMemo<Set<string>>(() => {
    const treeData = sojangClassificationTree?.treeData && sojangClassificationTree.treeData.length > 0
      ? sojangClassificationTree.treeData
      : DEFAULT_SOJANG_TREE;
    const result = new Set<string>();
    const collect = (nodes: TreeNode[]) => {
      nodes.forEach(n => {
        if (n.linkedDomainIds) n.linkedDomainIds.forEach((id: string) => result.add(id));
        if ((n as any).linkedDomainId) result.add((n as any).linkedDomainId);
        if (n.children) collect(n.children);
      });
    };
    collect(treeData);
    return result;
  }, [sojangClassificationTree]);

  const isImageField = (inputType?: string) =>
    inputType === 'image' || inputType === 'camera';

  // 전체 엔티티 — 묶음정리(최상위 1단계 소장품 인스턴스: 책, 편지, 병풍 등) 단위로 사료 카드 생성
  // 각 사료의 하위 자식(표지, 속지 등 기록물)을 해당 사료 카드에 통합
  const allEntities = useMemo(() => {
    // 0) ArchivalDescriptionPage에서 관리되는 검증된 아카이브 데이터(archivalList)가 있으면 최우선 연동
    // (아카이브 기술 페이지와 검색 페이지 데이터 100% 완벽 일치 보장)
    try {
      const storedMaster = localStorage.getItem('colib_master_archival_items');
      if (storedMaster) {
        const parsedMaster: any[] = JSON.parse(storedMaster);
        if (Array.isArray(parsedMaster) && parsedMaster.length > 0) {
          return parsedMaster.map(item => {
            const rootType = item.rootType || '기록물';
            const domain = domains.find(d => d.name === rootType || d.id.includes(rootType === '책' ? 'book' : (rootType === '병풍' ? 'screen' : 'letter')));
            const domainId = domain?.id || (rootType === '책' ? 'dom-book' : (rootType === '병풍' ? 'dom-screen' : 'dom-letter'));
            const fields = domain ? getFieldsForDomain(domain.id) : [];
            const textFields = fields.filter(f => !isImageField(f.inputType));

            // item.heroImage가 없거나 유실된 경우 IndexedDB에서 대표 이미지 복원
            let masterHeroImg = item.heroImage;
            if (!masterHeroImg) {
              const itemBase = item.id ? String(item.id).replace(/-[^-]+$/, '') : '';
              Object.entries(idbImageMap).forEach(([k, v]) => {
                if (((itemBase && k.startsWith(itemBase)) || (item.id && k.startsWith(String(item.id)))) && v && (v.startsWith('data:image') || v.startsWith('http') || v.startsWith('blob:') || v.startsWith('/local-images/'))) {
                  masterHeroImg = v;
                }
              });
            }

            // 하위 모든 기록물(표지, 속지 등) 추출
            const subItems: Array<{ anchorId: string; domainId: string; domainName: string; data: Record<string, string> }> = (item.subGroups || []).flatMap((sg: any) =>
              (sg.items || []).map((it: any) => {
                let itImg = it.image;
                if (!itImg) {
                  const itBase = it.id ? String(it.id).replace(/-[^-]+$/, '') : '';
                  Object.entries(idbImageMap).forEach(([k, v]) => {
                    if (((itBase && k.startsWith(itBase)) || (it.id && k.startsWith(String(it.id)))) && v && (v.startsWith('data:image') || v.startsWith('http') || v.startsWith('blob:') || v.startsWith('/local-images/'))) {
                      itImg = v;
                    }
                  });
                }
                return {
                  anchorId: String(it.id),
                  domainId: String(it.title || domainId),
                  domainName: String(sg.domainName || '기록물'),
                  data: {
                    ...(it.fields || {}),
                    ...(itImg ? { '이미지업로드': itImg } : {})
                  } as Record<string, string>
                };
              })
            );

            const allAtomData: Record<string, string>[] = [
              (item.fields || {}) as Record<string, string>,
              ...subItems.map(si => si.data)
            ];

            const totalChildCount = (item.subGroups || []).reduce(
              (acc: number, sg: any) => acc + (sg.items?.length || 0), 0
            );

            const parsedQty = item.fields?.['아카이브수량'] ? parseInt(item.fields['아카이브수량'], 10) : totalChildCount;

            const entityData: Record<string, string> = {
              ...(item.fields || {}),
              '제목': item.fields?.['제목'] || item.title || '',
              '상태설명': item.fields?.['상태설명'] || item.title || '',
              '아카이브수량': item.fields?.['아카이브수량'] || String(totalChildCount),
            };

            return {
              anchorId: item.id,
              domainId,
              domainName: rootType,
              domainIcon: domain?.icon || '',
              fields,
              textFields,
              imgSrc: masterHeroImg || null,
              data: entityData,
              atoms: subItems,
              allAtomData,
              displayName: item.title || item.fields?.['제목'] || '(이름 없음)',
              createdAt: parseInt((item.createdAt || '').replace(/\D/g, '') || '0') || Date.now(),
              childCount: isNaN(parsedQty) ? totalChildCount : parsedQty,
              rawArchivalItem: { ...item, heroImage: masterHeroImg || item.heroImage }
            };
          });
        }
      }
    } catch (_) {}

    // 1) 전체 도메인의 모든 엔티티 수집
    const allDomainAtoms: Array<{
      anchorId: string;
      domainId: string;
      domainName: string;
      data: Record<string, string>;
      fields: ReturnType<typeof getFieldsForDomain>;
    }> = [];

    domains.forEach(d => {
      const f = getFieldsForDomain(d.id);
      const ents = getAtomsForDomain(d.id);
      ents.forEach(e => {
        allDomainAtoms.push({
          anchorId: e.anchorId,
          domainId: d.id,
          domainName: d.name,
          data: e.data,
          fields: f,
        });
      });
    });

    // 하위 자식(표지, 속지, 봉투, 편지지 등 기록물) 여부 엄격 판별
    const isChildEntity = (e: typeof allDomainAtoms[0]): boolean => {
      // 0) localStorage에서 해당 anchorId의 저장 필드 병합 확인
      let savedObj: Record<string, string> = {};
      try {
        const stored = localStorage.getItem(`demo_arch_fields_${e.anchorId}`);
        if (stored) savedObj = JSON.parse(stored);
      } catch (_) {}

      // 1) _parentInstanceId가 있는 경우 무조건 하위
      if (e.data._parentInstanceId || savedObj._parentInstanceId) return true;

      // 2) anchorId 자체가 하위 기록물 패턴인 경우
      const aid = (e.anchorId || '').toLowerCase();
      if (aid.includes('cover') || aid.includes('page') || aid.includes('inner') || aid.includes('envelope') || aid.includes('paper') || aid.includes('screen-img') || aid.startsWith('cover-') || aid.startsWith('page-')) return true;

      // 3) 도메인 ID가 하위 기록물 도메인인 경우
      const did = (e.domainId || '').toLowerCase();
      if (did.includes('cover') || did.includes('page') || did.includes('envelope') || did.includes('paper') || did.includes('screen-img')) return true;

      // 4) 도메인명이 하위 기록물인 경우
      const dn = e.domainName || '';
      if (dn === '기록물' || dn.includes('기록물') || dn.includes('표지') || dn.includes('속지') || dn.includes('봉투') || dn.includes('편지지')) return true;

      // 5) 트리 노드 ID(_treeNodeId) 검사
      const tid = e.data._treeNodeId || savedObj._treeNodeId;
      if (tid) {
        const tidLower = tid.toLowerCase();
        if (tidLower.includes('cover') || tidLower.includes('page') || tidLower.includes('inner') || tidLower.includes('표지') || tidLower.includes('속지')) return true;
        const isSubNode = sojangTerminalNodes.some(n =>
          n.allDescendantIds && n.allDescendantIds.has(tid) && tid !== n.id && tid !== n.label
        );
        if (isSubNode) return true;
      }

      // 6) 데이터 내 명시적 제목/등록설명/상태설명/요약설명에 '표지사진', '표지', '속지' 표식이 있는 경우
      const checkTexts = [
        e.data['제목'], e.data['상태설명'], e.data['등록설명'], e.data['요약설명'],
        savedObj['제목'], savedObj['상태설명'], savedObj['등록설명'], savedObj['요약설명']
      ].filter(Boolean).map(s => String(s).trim());

      for (const t of checkTexts) {
        if (t === '표지사진' || t.startsWith('표지사진') || t.startsWith('표지 ') || t.startsWith('속지 ') || t === '표지' || t === '속지') {
          return true;
        }
      }

      // 7) 하위 전용 필드(사료사이즈, 이미지사이즈 등)를 가지고 있고 상태설명이나 아카이브수량이 없는 경우
      const hasChildField = !!(e.data['사료사이즈'] || savedObj['사료사이즈'] || e.data['이미지사이즈'] || savedObj['이미지사이즈']);
      const hasTopField = !!(e.data['상태설명'] || savedObj['상태설명'] || e.data['아카이브수량'] || savedObj['아카이브수량']);
      if (hasChildField && !hasTopField) return true;

      return false;
    };

    // 현재 선택된 소장자 ID 확인 (ArchivalDescriptionPage와 100% 동일하게 연동)
    const storedOwnerId = localStorage.getItem('colib_selected_owner_id') || 'owner-p-park';
    const cleanSelectedOwner = storedOwnerId.replace(/-이름$/, '');

    // 2) 묶음정리(1단계 소장품) 엔티티 필터링
    // _parentInstanceId가 없고 하위 기록물이 아닌, 순수 1단계 소장품(책, 편지, 병풍 등) 엔티티만 선별
    const seenAnchorIds = new Set<string>();
    const rootEntities = allDomainAtoms.filter(e => {
      // 일반 명함, 동창, 모임, 회사, 소장자 도메인은 제외
      const nonSojangDomainIds = new Set([
        'dom-bizcard', 'dom-alumni', 'dom-group', 'dom-company', 'dom-owner'
      ]);
      if (nonSojangDomainIds.has(e.domainId)) return false;

      // 하위 기록물(표지, 속지 등)은 최상위 사료 카드에서 반드시 제외
      if (isChildEntity(e)) return false;

      // localStorage에 저장된 최신 필드값에서 하위 기록물 성격이 있는지 2차 검증
      try {
        const stored = localStorage.getItem(`demo_arch_fields_${e.anchorId}`);
        if (stored) {
          const sObj = JSON.parse(stored);
          const reg = (sObj['등록설명'] || sObj['제목'] || '').trim();
          if (reg === '표지사진' || reg.startsWith('표지사진') || reg.startsWith('표지 ') || reg.startsWith('속지 ')) {
            return false;
          }
        }
      } catch (_) {}

      // 이미 추가된 동일 anchorId 중복 제외
      if (seenAnchorIds.has(e.anchorId)) return false;

      // 등록되지 않은 더미 샘플 자료 제외 (동의보감 등 e-dombook-smpl0~9 및 개발 테스트용 더미, 타인 소유 더미 u1feji 제외)
      if (
        e.anchorId.includes('-smpl') ||
        e.anchorId.startsWith('e-dombook-smpl') ||
        e.anchorId === 'e-dombook-testimg' ||
        e.anchorId === 'e-dombook-realtest' ||
        e.anchorId.includes('u1feji')
      ) return false;

      // 실제 사용자가 소장자와 함께 정식 등록한 사료 데이터만 포함 (_ownerId)
      if (!e.data._ownerId) {
        // 하위 자식 인스턴스 중 _ownerId가 있으면 부모 인스턴스로 복원
        const childWithOwner = allDomainAtoms.find(a => a.data._parentInstanceId === e.anchorId && a.data._ownerId);
        if (childWithOwner) {
          e.data._ownerId = childWithOwner.data._ownerId;
        } else {
          return false;
        }
      }

      // 현재 선택된 소장자의 사료만 정확하게 필터링 (타 소장자 사료 혼입 차단)
      if (cleanSelectedOwner) {
        const rawOwner = (e.data._ownerId || '').replace(/-이름$/, '');
        const isMatch = rawOwner === cleanSelectedOwner ||
          (cleanSelectedOwner.includes('park') && rawOwner.includes('park')) ||
          (cleanSelectedOwner.includes('gh') && rawOwner.includes('gh'));
        if (!isMatch) return false;
      }

      // 소장품 트리 노드 또는 소장품 관련 도메인 여부 검사
      const treeNodeId = e.data._treeNodeId;
      if (treeNodeId) {
        // 2단계 이하 하위 자식 노드는 제외
        const isChildNode = sojangTerminalNodes.some(n =>
          n.allDescendantIds && n.allDescendantIds.has(treeNodeId) && treeNodeId !== n.id && treeNodeId !== n.label
        );
        if (isChildNode) return false;
      } else {
        // treeNodeId가 없을 때 소장품 도메인 또는 묶음정리가 아니면 제외
        const isSojangDomain = sojangLinkedDomainIds.has(e.domainId) ||
          e.domainName === '묶음정리' ||
          sojangFirstLevelNodeIds.has(e.domainName) ||
          e.domainId.includes('book') || e.domainId.includes('letter') || e.domainId.includes('screen');
        if (!isSojangDomain) return false;
      }

      // 비어 있는 완전 더미 데이터가 아닌 실제 내용(텍스트 또는 이미지)이 하나라도 있는 엔티티 포함
      const hasContent = Object.entries(e.data).some(([k, v]) => {
        if (k.startsWith('_')) return false;
        if (!v) return false;
        if (typeof v === 'string') {
          if (v.startsWith('data:image') || v.startsWith('blob:') || v.startsWith('http') || v === '__img__' || v.startsWith('__img')) return true;
          return v.trim().length > 0;
        }
        return true;
      });

      if (hasContent) {
        seenAnchorIds.add(e.anchorId);
        return true;
      }
      return false;
    });

    // 3) 각 묶음정리 엔티티별로 사료 카드 구성 (하위 직계 자식 atom들 포함)
    return rootEntities.map(rootEnt => {
      // 이 사료에 속한 하위 직계 자식 atom들 (오직 _parentInstanceId === rootEnt.anchorId 만 포함)
      const childAtoms = allDomainAtoms.filter(
        a => a.data._parentInstanceId === rootEnt.anchorId
      );

      const relatedAtoms = [rootEnt, ...childAtoms];
      const allAtomData = relatedAtoms.map(a => a.data);

      const domain = domains.find(d => d.id === rootEnt.domainId);
      const fields = rootEnt.fields;
      const textFields = fields.filter(f => !isImageField(f.inputType));

      // 묶음정리 대표 이미지 탐색: 오직 최상위 묶음정리(rootEnt) 자체에서만 탐색! (하위 자식 atom 탐색 절대 금지)
      let imgSrc: string | null = null;
      const rootImgField = rootEnt.fields.find(f => isImageField(f.inputType));
      if (rootImgField) {
        const directVal = rootEnt.data[rootImgField.name] || rootEnt.data[`${rootImgField.name}_0`];
        if (directVal && (directVal.startsWith('data:image') || directVal.startsWith('http') || directVal.startsWith('blob:') || v.startsWith('/local-images/'))) {
          imgSrc = directVal;
        }
      }
      if (!imgSrc) {
        const imgEntry = Object.entries(rootEnt.data).find(([k, v]) =>
          !k.startsWith('_') && typeof v === 'string' && (v.startsWith('data:image') || v.startsWith('http') || v.startsWith('blob:') || v.startsWith('/local-images/'))
        );
        if (imgEntry) imgSrc = imgEntry[1];
      }
      if (!imgSrc) {
        try {
          const stored = localStorage.getItem(`demo_arch_fields_${rootEnt.anchorId}`);
          if (stored) {
            const parsed = JSON.parse(stored);
            const found = Object.values(parsed).find(v => typeof v === 'string' && (v.startsWith('data:image') || v.startsWith('http') || v.startsWith('blob:') || v.startsWith('/local-images/')));
            if (found) imgSrc = found as string;
          }
        } catch (_) {}
      }
      if (!imgSrc) {
        const basePrefix = rootEnt.anchorId ? getEntityBasePrefix(rootEnt.anchorId) : '';
        Object.keys(idbImageMap).forEach(key => {
          if (((basePrefix && key.startsWith(basePrefix)) || key.startsWith(rootEnt.anchorId)) && idbImageMap[key]) {
            imgSrc = idbImageMap[key];
          }
        });
      }

      const anchor = domain?.anchor || '이름';
      const anchorVal =
        rootEnt.data[anchor] ||
        rootEnt.data['이름'] ||
        Object.entries(rootEnt.data).find(([k, v]) => !k.startsWith('_') && v && !v.startsWith('data:') && v.trim().length > 0)?.[1] ||
        domain?.name ||
        '(이름 없음)';

      // 하위 직계 자식 기록물들을 도메인별 subGroups로 구조화 (팝업 상세 뷰어에서 묶음정보 아래의 세부내용을 넘겨볼 수 있도록 구성)
      const subGroupsMap: Record<string, any[]> = {};
      childAtoms.forEach((ca, idx) => {
        const dName = ca.domainName || '기록물';
        if (!subGroupsMap[dName]) subGroupsMap[dName] = [];
        let caImg = Object.values(ca.data).find(v => typeof v === 'string' && (v.startsWith('data:image') || v.startsWith('http') || v.startsWith('blob:') || v.startsWith('/local-images/'))) as string || undefined;
        if (!caImg) {
          try {
            const stored = localStorage.getItem(`demo_arch_fields_${ca.anchorId}`);
            if (stored) {
              const parsed = JSON.parse(stored);
              caImg = Object.values(parsed).find(v => typeof v === 'string' && (v.startsWith('data:image') || v.startsWith('http') || v.startsWith('blob:') || v.startsWith('/local-images/'))) as string || undefined;
            }
          } catch (_) {}
        }
        subGroupsMap[dName].push({
          id: ca.anchorId,
          order: idx + 1,
          image: caImg,
          title: ca.domainName,
          desc: ca.data['요약설명'] || ca.data['요약설명_0'] || ca.data['등록설명'] || ca.data['상태설명'] || ca.data['상세설명'] || '',
          fields: ca.data
        });
      });

      const subGroups = Object.entries(subGroupsMap).map(([dName, items]) => ({
        domainName: dName,
        count: items.length,
        items
      }));

      const rawArchivalItem = {
        id: rootEnt.anchorId,
        rootType: rootEnt.domainName,
        title: anchorVal,
        heroImage: imgSrc || undefined,
        fields: rootEnt.data,
        subGroups
      };

      return {
        anchorId: rootEnt.anchorId,     // 각 사료의 고유 anchorId 사용 (책 2권이면 2개!)
        domainId: rootEnt.domainId,
        domainName: rootEnt.domainName,
        domainIcon: domain?.icon || '',
        fields,
        textFields,
        imgSrc,
        data: rootEnt.data,
        atoms: relatedAtoms.map(a => ({ anchorId: a.anchorId, domainId: a.domainId, domainName: a.domainName, data: a.data })),
        allAtomData,
        displayName: (anchorVal.startsWith('data:') || anchorVal.startsWith('/local-images/') ? null : anchorVal) || '(이름 없음)',
        createdAt: parseInt(rootEnt.anchorId.replace(/\D/g, '').slice(0, 13)) || 0,
        // 하위 기록물(표지, 속지 등) 수량 — 분류항목 숫자에 사용
        childCount: childAtoms.length,
        rawArchivalItem
      };
    });
  }, [domains, getFieldsForDomain, getAtomsForDomain, sojangFirstLevelNodeIds, sojangLinkedDomainIds, idbImageMap]);

  // 각 엔티티(도메인) anchorId → 저장 필드 맵
  // ArchivalDescriptionPage와 동일하게 부모(묶음정리) 고유 필드만 보존하며, 자식 기록물이나 도메인 공통키로의 오염 차단
  const savedFieldsMap = useMemo(() => {
    const map: Record<string, Record<string, string>> = {};
    allEntities.forEach(e => {
      const rawItem: any = (e as any).rawArchivalItem;
      const merged: Record<string, string> = {};

      if (rawItem && rawItem.fields) {
        // ArchivalDescriptionPage에서 동기화된 마스터 필드를 최우선 복원
        Object.entries(rawItem.fields).forEach(([k, v]) => {
          if (v && typeof v === 'string') merged[k] = v;
        });
      } else {
        // 엔티티 자체의 데이터 기본값
        Object.entries(e.data || {}).forEach(([k, v]) => {
          if (v && typeof v === 'string' && !v.startsWith('data:') && !v.startsWith('blob:') && !v.startsWith('/local-images/')) {
            merged[k] = v;
          }
        });
      }

      // 엔티티 자체 anchorId 키의 demo_arch_fields_ 병합 (AD 전용 필드만 보충, atom 오버라이드 금지)
      try {
        const stored = localStorage.getItem(`demo_arch_fields_${e.anchorId}`);
        if (stored) {
          mergeAdOnlyFieldsSearch(merged, JSON.parse(stored));
        }
      } catch { /* ignore */ }

      map[e.anchorId] = merged;
    });
    return map;
  }, [allEntities]);

  // 엔티티가 특정 종단노드(사료분류)에 매칭되는지 판별
  const isEntityMatchLeaf = (e: any, leaf: TerminalNode) => {
    // 도메인 내 모든 atom data에서 검사
    const dataList: Record<string, string>[] = e.allAtomData || [e.data];
    return dataList.some(data => {
      if (data._treeNodeId === leaf.id || data._treeNodeId === leaf.label) return true;
      const values = Object.values(data) as string[];
      return values.some(v => v && typeof v === 'string' && (v === leaf.label || v.includes(leaf.label)));
    });
  };

  // 엔티티가 특정 소장품 종단노드에 매칭되는지 판별 (도메인 및 트리노드 기준 정밀 매칭)
  const isEntityMatchSojangLeaf = (e: any, leaf: TerminalNode) => {
    // 1) 엔티티 도메인명 직접 일치
    if (e.domainName === leaf.label || e.domainName === leaf.id) return true;
    
    // 2) 도메인 ID 키워드 매칭 (예: dom-book -> 책, dom-letter -> 편지, dom-screen -> 병풍)
    if (e.domainId) {
      if (leaf.label === '책' && e.domainId.includes('book')) return true;
      if (leaf.label === '편지' && e.domainId.includes('letter')) return true;
      if (leaf.label === '병풍' && e.domainId.includes('screen')) return true;
    }

    // 3) 트리 노드 ID 또는 소장품 노드 ID 일치
    const dataList: Record<string, string>[] = e.allAtomData || [e.data];
    return dataList.some(atomData => {
      const treeNodeId = atomData._treeNodeId;
      if (treeNodeId) {
        if (treeNodeId === leaf.id || treeNodeId === leaf.label) return true;
        if (leaf.allDescendantIds && leaf.allDescendantIds.has(treeNodeId)) return true;
      }
      if (atomData._sojangNodeId === leaf.id || atomData._sojangNodeId === leaf.label) return true;
      return false;
    });
  };

  // 각 사료분류 종단노드별 등록 건수
  const leafCounts = useMemo(() => {
    const map: Record<string, number> = {};
    terminalNodes.forEach(node => {
      let count = 0;
      allEntities.forEach(e => {
        if (isEntityMatchLeaf(e, node)) count++;
      });
      map[node.id] = count;
    });
    return map;
  }, [terminalNodes, allEntities]);

  // 검색 + 필터 적용 (사료분류 종단노드 + 소장품 종단노드)
  const filtered = useMemo(() => {
    let result = allEntities;
    // 사료분류 종단노드 필터
    if (selectedLeafId !== 'all') {
      const targetLeaf = terminalNodes.find(n => n.id === selectedLeafId || n.label === selectedLeafId);
      if (targetLeaf) {
        result = result.filter(e => isEntityMatchLeaf(e, targetLeaf));
      }
    }
    // 소장품 종단노드 필터
    if (selectedSojangLeafId !== 'all') {
      const targetSojang = sojangTerminalNodes.find(n => n.id === selectedSojangLeafId || n.label === selectedSojangLeafId);
      if (targetSojang) {
        result = result.filter(e => isEntityMatchSojangLeaf(e, targetSojang));
      }
    }
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      // 도메인 내 모든 atom data에서 검색
      result = result.filter(e => {
        const dataList: Record<string, string>[] = e.allAtomData || [e.data];
        return dataList.some(atomData =>
          Object.entries(atomData).some(([k, v]) =>
            !k.startsWith('_') && v && !v.startsWith('data:') && !v.startsWith('blob:') && !v.startsWith('/local-images/') && v.toLowerCase().includes(q)
          )
        );
      });
    }
    if (sortOrder === 'newest') result = [...result].reverse();
    else if (sortOrder === 'name') result = [...result].sort((a, b) => a.displayName.localeCompare(b.displayName));
    return result;
  }, [allEntities, query, selectedLeafId, selectedSojangLeafId, sortOrder, terminalNodes, sojangTerminalNodes]);

  // 소장품 종단노드별 검색 결과 수 (현재 쿼리 및 사료분류 기준)
  const filteredSojangLeafCounts = useMemo(() => {
    const map: Record<string, number> = {};
    const q = query.trim().toLowerCase();
    allEntities.forEach(e => {
      const matchQuery = !q ||
        Object.entries(e.data).some(([k, v]) => !k.startsWith('_') && v && typeof v === 'string' && !v.startsWith('data:') && !v.startsWith('blob:') && !v.startsWith('/local-images/') && v.toLowerCase().includes(q));
      const matchRecordLeaf = selectedLeafId === 'all' || (() => {
        const targetLeaf = terminalNodes.find(n => n.id === selectedLeafId || n.label === selectedLeafId);
        return targetLeaf ? isEntityMatchLeaf(e, targetLeaf) : true;
      })();
      if (matchQuery && matchRecordLeaf) {
        sojangTerminalNodes.forEach(node => {
          if (isEntityMatchSojangLeaf(e, node)) {
            map[node.id] = (map[node.id] || 0) + 1;
          }
        });
      }
    });
    return map;
  }, [allEntities, query, selectedLeafId, terminalNodes, sojangTerminalNodes]);

  // 사료분류 종단노드별 검색 결과 수 (현재 쿼리 및 소장품 기준)
  const filteredLeafCounts = useMemo(() => {
    const map: Record<string, number> = {};
    const q = query.trim().toLowerCase();
    allEntities.forEach(e => {
      const matchQuery = !q ||
        Object.entries(e.data).some(([k, v]) => !k.startsWith('_') && v && typeof v === 'string' && !v.startsWith('data:') && !v.startsWith('blob:') && !v.startsWith('/local-images/') && v.toLowerCase().includes(q));
      const matchSojangLeaf = selectedSojangLeafId === 'all' || (() => {
        const targetSojang = sojangTerminalNodes.find(n => n.id === selectedSojangLeafId || n.label === selectedSojangLeafId);
        return targetSojang ? isEntityMatchSojangLeaf(e, targetSojang) : true;
      })();
      if (matchQuery && matchSojangLeaf) {
        terminalNodes.forEach(node => {
          if (isEntityMatchLeaf(e, node)) {
            map[node.id] = (map[node.id] || 0) + 1;
          }
        });
      }
    });
    return map;
  }, [allEntities, query, selectedSojangLeafId, terminalNodes, sojangTerminalNodes]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [query, selectedLeafId, selectedSojangLeafId]);

  const handleSearch = () => {
    const trimmed = inputValue.trim();
    setQuery(trimmed);
    setIsSubmitted(true);
    setPage(1);
  };

  const handleReset = () => {
    setInputValue('');
    setQuery('');
    setSelectedLeafId('all');
    setSelectedSojangLeafId('all');
    setIsSubmitted(false);
    setSortOrder('newest');
    setPage(1);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  // 엔티티의 모든 이미지(data:, http, blob: 시작값) 목록 반환 - 대표 및 표지/속지 등 전체 이미지 수집
  const getEntityImages = useCallback((entity: typeof allEntities[0], sf: Record<string, string>): string[] => {
    const imgs: string[] = [];
    const seen = new Set<string>();
    const isImgUrl = (v: any): boolean =>
      typeof v === 'string' && (v.startsWith('data:image') || v.startsWith('http://') || v.startsWith('https://') || v.startsWith('blob:') || v.startsWith('/local-images/'));
    const addImg = (v: string) => {
      if (isImgUrl(v) && !seen.has(v)) {
        seen.add(v);
        imgs.push(v);
      }
    };

    // 1) 대표 이미지
    if (entity.imgSrc) addImg(entity.imgSrc);

    // 2) entity.allAtomData (root 및 모든 childAtoms의 data)에서 이미지 필드 및 suffix 키(_0, _1, _2...) 수집
    entity.allAtomData.forEach(atomData => {
      Object.entries(atomData).forEach(([k, v]) => {
        if (!k.startsWith('_') && v && typeof v === 'string') {
          if (isImgUrl(v)) {
            addImg(v);
          } else if (v === '__img__' || v.startsWith('__img')) {
            const idbVal = idbImageMap[k] || idbImageMap[`${entity.anchorId}-${k}`];
            if (idbVal) addImg(idbVal);
          }
        }
      });
    });

    // 3) entity.atoms 순회하며 idbImageMap 직접 매칭 (접두어 매칭: e-dombook-mksg61-제목 → e-dombook-mksg61)
    entity.atoms.forEach((a: any) => {
      const basePrefix = a.anchorId ? getEntityBasePrefix(a.anchorId) : '';
      Object.keys(idbImageMap).forEach(key => {
        if (
          (a.anchorId && key.startsWith(a.anchorId)) ||
          (basePrefix && key.startsWith(basePrefix))
        ) {
          if (idbImageMap[key]) addImg(idbImageMap[key]);
        }
      });
    });

    // 4) localStorage (demo_arch_fields_)에서 root 및 childAtoms의 저장된 이미지(하위 기록물 포함) 수집
    const checkedAncIds = new Set<string>([entity.anchorId, ...entity.atoms.map((a: any) => a.anchorId)]);
    checkedAncIds.forEach(ancId => {
      if (!ancId) return;
      try {
        const stored = localStorage.getItem(`demo_arch_fields_${ancId}`);
        if (stored) {
          const parsed = JSON.parse(stored);
          Object.entries(parsed).forEach(([, v]) => {
            if (isImgUrl(v)) addImg(v as string);
          });
        }
      } catch (_) {}
    });

    // 5) savedFieldsMap에서 추가 이미지 수집
    Object.entries(sf).forEach(([k, v]) => {
      if (!k.startsWith('_') && typeof v === 'string') {
        if (isImgUrl(v)) addImg(v);
        else if (v === '__img__' && idbImageMap[k]) addImg(idbImageMap[k]);
      }
    });

    return imgs;
  }, [idbImageMap]);

  // 팝업 열기 (기본은 전체화면 뷰어 모드로 열림)
  const openDetailPopup = useCallback((anchorId: string, sf: Record<string, string>) => {
    const hasOverview = !!(sf['사료개요'] && sf['사료개요'].trim());
    const hasDesc = !!(sf['사료설명'] && sf['사료설명'].trim());
    setDetailPopup({
      anchorId,
      activeTab: hasOverview ? 'overview' : hasDesc ? 'desc' : 'overview',
      imgIdx: 0,
      showDocPanel: false, // 기본은 사료경로+등록설명 헤더와 전체화면 뷰어
    });
  }, []);

  // 이미지 변환 초기화 (팝업 항목 바뀔 때)
  useEffect(() => {
    setImgTransform({ scale: 1, x: 0, y: 0 });
  }, [detailPopup?.anchorId, detailPopup?.imgIdx]);

  // 마우스 휠 → 확대/축소
  const handleImgWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setImgTransform(prev => {
      const delta = e.deltaY > 0 ? 0.85 : 1.18;
      const newScale = Math.min(8, Math.max(0.3, prev.scale * delta));
      return { ...prev, scale: newScale };
    });
  }, []);

  // 마우스 드래그 시작
  const handleImgMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    imgDragRef.current = { startX: e.clientX, startY: e.clientY, startTX: imgTransform.x, startTY: imgTransform.y };
    const onMove = (ev: MouseEvent) => {
      if (!imgDragRef.current) return;
      setImgTransform(prev => ({
        ...prev,
        x: imgDragRef.current!.startTX + ev.clientX - imgDragRef.current!.startX,
        y: imgDragRef.current!.startTY + ev.clientY - imgDragRef.current!.startY,
      }));
    };
    const onUp = () => {
      imgDragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [imgTransform.x, imgTransform.y]);

  const getPageNums = () => {
    const pages: (number | '...')[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push('...');
      for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
      if (page < totalPages - 2) pages.push('...');
      pages.push(totalPages);
    }
    return pages;
  };

  // ── 초기 홈 화면 ──────────────────────────────────────────────────────
  if (!hasSearched) {
    return (
      <div className="asp4-home">
        <div className="asp4-home-bg" />

        <button className="asp4-home-back" onClick={onBack} title="뒤로">
          <ArrowLeft size={18} />
        </button>

        <div className="asp4-home-center">
          <p className="asp4-home-subtitle">CoLib Archive</p>
          <h1 className="asp4-home-title">과거의 기록에서<br />미래의 지혜를 찾습니다</h1>

          <div className="asp4-home-search-wrap">
            {/* 사료분류트리 종단노드 선택 드롭다운 */}
            <select
              className="asp4-home-domain-sel"
              value={selectedLeafId}
              onChange={e => setSelectedLeafId(e.target.value)}
              title="사료분류 종단노드 선택"
            >
              <option value="all">전체</option>
              {terminalNodes.map(node => (
                <option key={node.id} value={node.id} title={node.fullPath}>
                  {node.label}
                </option>
              ))}
            </select>

            <div className="asp4-home-input-wrap">
              <input
                ref={inputRef}
                className="asp4-home-input"
                placeholder="검색어 (자료명, 인물, 지명, 내용 등)을 입력하세요"
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
                autoFocus
              />
              {inputValue && (
                <button className="asp4-home-clear" onClick={() => { setInputValue(''); inputRef.current?.focus(); }}>
                  <X size={13} />
                </button>
              )}
            </div>

            <button className="asp4-home-search-btn" onClick={handleSearch}>
              <Search size={16} />
              검색
            </button>
          </div>

          <p className="asp4-home-stats">
            총 <strong>{allEntities.length}</strong>건의 자료가 등록되어 있습니다
          </p>

          {/* 사료분류 종단노드 빠른 선택 태그 */}
          {terminalNodes.length > 0 && (
            <div className="asp4-home-tags">
              {terminalNodes.map(node => {
                const count = leafCounts[node.id] || 0;
                return (
                  <button
                    key={node.id}
                    className={`asp4-home-tag ${selectedLeafId === node.id ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedLeafId(prev => prev === node.id ? 'all' : node.id);
                    }}
                    title={node.fullPath}
                  >
                    <span>🏷️</span>
                    {node.label}
                    {count > 0 && <span className="asp4-home-tag-count">{count}</span>}
                  </button>
                );
              })}
            </div>
          )}

          {/* 소장품 종단노드 리스트 */}
          {sojangTerminalNodes.length > 0 && (
            <div className="asp4-home-sojang-section">
              <div className="asp4-home-sojang-title">📦 소장품 분류</div>
              <div className="asp4-home-sojang-list">
                <button
                  className={`asp4-home-sojang-item ${selectedSojangLeafId === 'all' ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedSojangLeafId('all');
                  }}
                >
                  전체
                  <span className="asp4-home-sojang-cnt">{allEntities.length}</span>
                </button>
                {sojangTerminalNodes.map(node => {
                  const cnt = allEntities.filter(e => isEntityMatchSojangLeaf(e, node)).length;
                  return (
                    <button
                      key={node.id}
                      className={`asp4-home-sojang-item ${selectedSojangLeafId === node.id ? 'active' : ''}`}
                      onClick={() => {
                        setSelectedSojangLeafId(prev => prev === node.id ? 'all' : node.id);
                      }}
                      title={node.fullPath}
                    >
                      {node.label}
                      <span className="asp4-home-sojang-cnt">{cnt}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── 검색 결과 화면 ────────────────────────────────────────────────────
  return (
    <div className="asp4-result-page">

      {/* 상단 헤더 */}
      <div className="asp4-header">
        <div className="asp4-header-left">
          <button className="asp4-header-back" onClick={() => setIsSubmitted(false)} title="홈으로">
            <ArrowLeft size={17} />
          </button>
          <span className="asp4-header-logo">CoLib Archive</span>
        </div>

        <div className="asp4-header-search">
          <select
            className="asp4-header-domain-sel"
            value={selectedLeafId}
            onChange={e => { setSelectedLeafId(e.target.value); setPage(1); }}
            title="사료분류 종단노드 선택"
          >
            <option value="all">사료분류 전체</option>
            {terminalNodes.map(node => (
              <option key={node.id} value={node.id} title={node.fullPath}>
                {node.label}
              </option>
            ))}
          </select>

          <div className="asp4-header-input-wrap">
            <input
              className="asp4-header-input"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
              placeholder="검색어를 입력하세요..."
            />
            {inputValue && (
              <button className="asp4-header-clear" onClick={() => { setInputValue(''); setQuery(''); }}>
                <X size={12} />
              </button>
            )}
          </div>

          <button className="asp4-header-search-btn" onClick={handleSearch}>
            <Search size={15} />
          </button>
        </div>

        <div className="asp4-header-right">
          <span className="asp4-header-stat">
            검색결과 <strong>{filtered.length}</strong>건
          </span>
        </div>
      </div>

      {/* 서브 네비 탭 (소장품 종단노드 리스트) */}
      <div className="asp4-subnav">
        <span className="asp4-subnav-label">소장품 분류</span>
        <button
          className={`asp4-subnav-item ${selectedSojangLeafId === 'all' ? 'active' : ''}`}
          onClick={() => { setSelectedSojangLeafId('all'); setPage(1); }}
        >
          전체
          <span className="asp4-subnav-cnt">{filtered.length}</span>
        </button>
        {sojangTerminalNodes.map(node => {
          const cnt = filteredSojangLeafCounts[node.id] || 0;
          return (
            <button
              key={node.id}
              className={`asp4-subnav-item ${selectedSojangLeafId === node.id ? 'active' : ''}`}
              onClick={() => { setSelectedSojangLeafId(selectedSojangLeafId === node.id ? 'all' : node.id); setPage(1); }}
              title={node.fullPath}
            >
              <span>📦</span>
              {node.label}
              <span className="asp4-subnav-cnt">{cnt}</span>
            </button>
          );
        })}
      </div>

      {/* 본문 */}
      <div className="asp4-body">

        {/* 왼쪽 사이드바 */}
        <aside className="asp4-sidebar">
          <div className="asp4-sidebar-section">
            <div className="asp4-sidebar-head">사료분류 종단노드</div>

            <button
              className={`asp4-sidebar-item ${selectedLeafId === 'all' ? 'active' : ''}`}
              onClick={() => { setSelectedLeafId('all'); setPage(1); }}
            >
              <span className="asp4-sidebar-label">전체</span>
              {filtered.length > 0 && (
                <span className="asp4-sidebar-count">{filtered.length}</span>
              )}
            </button>

            {terminalNodes.map(node => {
              const cnt = filteredLeafCounts[node.id] || 0;
              return (
                <button
                  key={node.id}
                  className={`asp4-sidebar-item ${selectedLeafId === node.id ? 'active' : ''}`}
                  onClick={() => { setSelectedLeafId(selectedLeafId === node.id ? 'all' : node.id); setPage(1); }}
                  title={node.fullPath}
                >
                  <span className="asp4-sidebar-label">🏷️ {node.label}</span>
                  {cnt > 0 && <span className="asp4-sidebar-count">{cnt}</span>}
                </button>
              );
            })}
          </div>
        </aside>

        {/* 결과 메인 */}
        <main className="asp4-main">

          {/* 결과 요약 바 */}
          <div className="asp4-result-bar">
            <span>
              {selectedSojangLeafId !== 'all' && (
                <span style={{ color: '#4f46e5', fontWeight: 600, marginRight: '4px' }}>
                  [소장품: {sojangTerminalNodes.find(n => n.id === selectedSojangLeafId)?.label || selectedSojangLeafId}]
                </span>
              )}
              {selectedLeafId !== 'all' && (
                <span style={{ color: '#0284c7', fontWeight: 600, marginRight: '4px' }}>
                  [사료분류: {terminalNodes.find(n => n.id === selectedLeafId)?.label || selectedLeafId}]
                </span>
              )}
              {query ? (
                <>
                  "<strong className="asp4-result-kw">{query}</strong>"에 대해{' '}
                  총 <strong className="asp4-result-count">{filtered.length}</strong>건의 자료가 검색되었습니다.
                </>
              ) : (
                <>
                  총 <strong className="asp4-result-count">{filtered.length}</strong>건의 자료가 검색되었습니다.
                </>
              )}
            </span>
            <div className="asp4-result-controls">
              <button
                style={{
                  display: 'flex', alignItems: 'center', gap: '4px',
                  padding: '4px 10px', borderRadius: '4px', border: '1px solid #ddd',
                  background: '#fff', color: '#666', fontSize: '0.76rem',
                  cursor: 'pointer',
                }}
                onClick={handleReset}
              >
                <RotateCcw size={11} /> 초기화
              </button>
              <select
                className="asp4-sort-sel"
                value={sortOrder}
                onChange={e => { setSortOrder(e.target.value as 'newest' | 'oldest' | 'name'); setPage(1); }}
              >
                <option value="newest">최신순</option>
                <option value="oldest">오래된순</option>
                <option value="name">이름순</option>
              </select>
            </div>
          </div>

          {/* 빈 결과 */}
          {filtered.length === 0 ? (
            <div className="asp4-empty">
              <BookOpen size={48} className="asp4-empty-icon" />
              <p className="asp4-empty-title">"{query}"에 해당하는 자료가 없습니다</p>
              <p className="asp4-empty-sub">검색어를 바꾸거나 다른 분류를 선택해보세요</p>
              <button className="asp4-empty-reset" onClick={handleReset}>
                <RotateCcw size={13} /> 검색 초기화
              </button>
            </div>
          ) : (
            <>
              {/* 카드 목록 */}
              <div className="asp4-card-list">
                {paged.map((entity) => {
                  // localStorage에서 최신 필드 데이터 읽기
                  const rawItem: any = (entity as any).rawArchivalItem;
                  const sf = savedFieldsMap[entity.anchorId] || {};

                  // 묶음정리 사진 배지 번호: 저장된 그대로의 번호(묶음정리 대표 사진은 #1) 사용 (검색 리스트 인덱스로 왜곡 금지)
                  const badgeOrderNum = 1;

                  // 요약설명 및 사이즈 (배지 표시용: 오직 묶음정리 자체 필드만 참조, 자식의 사이즈_0 오염 원천 차단)
                  const summary = rawItem?.fields?.['요약설명'] || sf['요약설명'] || entity.data['요약설명'] || '';
                  const size = rawItem?.fields?.['이미지사이즈'] || rawItem?.fields?.['사이즈'] || sf['이미지사이즈'] || sf['사이즈'] || entity.data['이미지사이즈'] || entity.data['사이즈'] || '';

                  // 등록설명 / 상태설명 / 타이틀 (오직 묶음정보의 내용만 반영)
                  const regVal = rawItem?.fields?.['등록설명'] || rawItem?.fields?.['상태설명'] || rawItem?.fields?.['제목'] || rawItem?.title || sf['등록설명'] || sf['상태설명'] || entity.data['등록설명'] || entity.data['상태설명'] || entity.displayName || '';

                  // 사료분류 linked 파싱: 오직 묶음정보 자체의 분류만 파싱 (하위 기록물 분류 혼입 원천 차단)
                  const linkedClassArr = parseLinkedClassifications(
                    rawItem?.fields?.['_linkedClassifications'] || sf['_linkedClassifications'],
                    rawItem?.fields || sf
                  );
                  let classificationStr = '';
                  const validClassParts = linkedClassArr
                    .filter(lc => lc.label && lc.label.trim() && lc.label !== '-' && lc.label !== '--')
                    .map(lc => `${lc.label} : ${lc.value || ''}`);
                  if (validClassParts.length > 0) {
                    classificationStr = `사료분류 ( ${validClassParts.join(' , ')} )`;
                  }

                  // 사료설명: 오직 묶음정보 자체의 사료설명만 반영
                  const descVal = rawItem?.fields?.['사료설명'] || rawItem?.fields?.['사료개요'] || rawItem?.fields?.['상세설명'] || sf['사료설명'] || sf['사료개요'] || sf['상세설명'] || entity.data['사료설명'] || entity.data['사료개요'] || entity.data['상세설명'] || '';

                  // 아카이브 자료량: 하위 기록물(표지, 속지 등) 수량
                  const childCount = rawItem?.fields?.['아카이브수량'] || sf['아카이브수량'] || entity.data['아카이브수량'] || entity.childCount || 0;

                  // 세그먼트 조립 (등록설명 | 아카이브수량 = N | 사료분류 (...) | 사료설명 : ...)
                  const segments: string[] = [];
                  if (regVal) segments.push(regVal);
                  segments.push(`아카이브수량 = ${childCount}`);
                  if (classificationStr) segments.push(classificationStr);
                  if (descVal) segments.push(`사료설명 : ${descVal}`);

                  // 묶음정보 대표 이미지 (오직 묶음정리 자체의 이미지, 하위 속지/표지 등 자식 이미지 혼입 금지)
                  const cardImgSrc: string | null = rawItem?.heroImage || entity.imgSrc || (sf['이미지업로드'] && typeof sf['이미지업로드'] === 'string' && (sf['이미지업로드'].startsWith('data:image') || sf['이미지업로드'].startsWith('http') || sf['이미지업로드'].startsWith('blob:') || v.startsWith('/local-images/')) ? sf['이미지업로드'] : null);

                  return (
                    <article key={entity.anchorId} className="asp4-card">
                      {/* 썸네일 영역 */}
                      <div
                        className="asp4-card-thumb-area"
                        onClick={() => openDetailPopup(entity.anchorId, sf)}
                        style={{ cursor: 'pointer' }}
                      >
                        {cardImgSrc ? (
                          <img src={cardImgSrc} alt="" className="asp4-card-thumb-top" />
                        ) : (
                          <div className="asp4-card-thumb-top asp4-card-thumb-top-ph">
                            <Image size={28} />
                          </div>
                        )}
                        {/* 알약 배지 (#순번 요약설명 (사이즈)) - 저장된 묶음정리 사진 그대로의 배지 */}
                        <div className="asp4-card-pill-badge">
                          <span className="asp4-card-badge-num">#{badgeOrderNum}</span>
                          {(summary || size) && (
                            <span className="asp4-card-badge-meta">
                              {summary && <span className="asp4-card-badge-summary">{summary}</span>}
                              {size && <span className="asp4-card-badge-size">({size})</span>}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* 카드 본문 (3줄 제한 말줄임 ...) */}
                      <div
                        className="asp4-card-body-v"
                        onClick={() => openDetailPopup(entity.anchorId, sf)}
                        title="클릭하여 상세보기"
                      >
                        {segments.length > 0 ? (
                          segments.join(' | ')
                        ) : (
                          <span className="asp4-card-info-empty">등록된 상세 정보 없음</span>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>

              {/* 페이지네이션 */}
              {totalPages > 1 && (
                <div className="asp4-pagination">
                  <button className="asp4-page-btn" onClick={() => setPage(1)} disabled={page === 1}>«</button>
                  <button className="asp4-page-btn" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>‹</button>
                  {getPageNums().map((n, i) =>
                    n === '...'
                      ? <span key={`dot${i}`} className="asp4-page-dot">…</span>
                      : (
                        <button
                          key={n}
                          className={`asp4-page-btn ${page === n ? 'active' : ''}`}
                          onClick={() => setPage(n as number)}
                        >{n}</button>
                      )
                  )}
                  <button className="asp4-page-btn" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>›</button>
                  <button className="asp4-page-btn" onClick={() => setPage(totalPages)} disabled={page === totalPages}>»</button>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* ── 상세 팝업 모달 ────────────────────────────── */}
      {detailPopup && (() => {
        const entity = filtered.find(e => e.anchorId === detailPopup.anchorId);
        if (!entity) return null;
        const sf = savedFieldsMap[entity.anchorId] || {};
        // 슬라이드 구조체 정의 (ArchivalDescriptionPage의 라이트박스와 100% 동일)
        interface PopupSlide {
          url: string;
          rootKind: string;
          rootDesc: string;
          subKind?: string;
          subDesc?: string;
          linkedClassifications?: any;
          descText?: string;
          data: Record<string, string>;
        }

        const slides: PopupSlide[] = [];
        const rawItem: any = (entity as any).rawArchivalItem;

        // 최상위 도메인 및 설명 (디스크립션의 heroTitle과 100% 동일)
        const rootKind = (rawItem?.rootType || entity.domainName || '책').replace(/\s*\d+$/, '');
        const rootDesc = rawItem?.fields?.['등록설명'] || rawItem?.fields?.['상태설명'] || rawItem?.fields?.['제목'] ||
                         rawItem?.title || sf['등록설명'] || sf['상태설명'] || sf['제목'] ||
                         entity.data['등록설명'] || entity.data['상태설명'] || entity.data['제목'] || entity.displayName || '자료';

        // 1. 대표 이미지 복원 (rawItem.heroImage -> entity.imgSrc -> idbImageMap)
        let heroImg = rawItem?.heroImage || entity.imgSrc;
        if (!heroImg) {
          const ancId = rawItem?.id || entity.anchorId;
          const basePrefix = ancId ? String(ancId).replace(/-[^-]+$/, '') : '';
          Object.entries(idbImageMap).forEach(([k, v]) => {
            if (((basePrefix && k.startsWith(basePrefix)) || (ancId && k.startsWith(String(ancId)))) && v && (v.startsWith('data:image') || v.startsWith('http') || v.startsWith('blob:') || v.startsWith('/local-images/'))) {
              heroImg = v;
            }
          });
        }

        // 1번 슬라이드: 묶음정리 대표 사진 및 정보
        if (heroImg) {
          slides.push({
            url: heroImg,
            rootKind,
            rootDesc,
            linkedClassifications: rawItem?.fields?.['_linkedClassifications'] || sf['_linkedClassifications'],
            descText: rawItem?.fields?.['사료설명'] || rawItem?.fields?.['사료개요'] || rawItem?.fields?.['상세설명'] || sf['사료설명'] || sf['사료개요'] || sf['상세설명'] || '',
            data: rawItem?.fields || sf || {}
          });
        }

        // 2. 하위 기록물(표지, 속지, 폭 등) 슬라이드들: subGroups 구조로부터 정확하게 추출
        if (rawItem && rawItem.subGroups) {
          rawItem.subGroups.forEach((sg: any) => {
            const sgDomainName = sg.domainName || '기록물';
            (sg.items || []).forEach((it: any, itemIdx: number) => {
              let itImg = it.image;
              if (!itImg) {
                const itAncId = (it.id || '').split('_')[0];
                const itBasePrefix = itAncId ? itAncId.replace(/-[^-]+$/, '') : '';
                Object.entries(idbImageMap).forEach(([k, v]) => {
                  if (((itBasePrefix && k.startsWith(itBasePrefix)) || (itAncId && k.startsWith(itAncId))) && v && (v.startsWith('data:image') || v.startsWith('http') || v.startsWith('blob:') || v.startsWith('/local-images/'))) {
                    itImg = v;
                  }
                });
              }
              if (itImg) {
                // localStorage에서 AD 전용 필드만 보충 (atom 오버라이드 금지)
                const itData = { ...(it.fields || {}) };
                const itAncId = (it.id || '').split('_')[0];
                try {
                  const stored = localStorage.getItem(`demo_arch_fields_${itAncId}`);
                  if (stored) mergeAdOnlyFieldsSearch(itData, JSON.parse(stored));
                } catch (_) {}

                const itDesc = itData['요약설명'] || itData['요약설명_0'] || itData['등록설명'] || itData['이미지설명'] || it.desc || it.title || `${sgDomainName} ${itemIdx + 1}`;

                slides.push({
                  url: itImg,
                  rootKind,
                  rootDesc,
                  subKind: sgDomainName,
                  subDesc: itDesc,
                  linkedClassifications: itData['_linkedClassifications'],
                  descText: itData['사료설명'] || itData['사료개요'] || itData['상세설명'] || '',
                  data: itData
                });
              }
            });
          });
        }

        // 폴백: slides가 없으면 getEntityImages로 구성
        if (slides.length === 0) {
          const fallbackImgs = getEntityImages(entity, sf);
          fallbackImgs.forEach((imgUrl, fIdx) => {
            slides.push({
              url: imgUrl,
              rootKind,
              rootDesc,
              subKind: fIdx > 0 ? (fIdx === 1 ? '표지' : '속지') : undefined,
              subDesc: fIdx > 0 ? `기록물 ${fIdx}` : undefined,
              linkedClassifications: sf['_linkedClassifications'],
              descText: sf['사료설명'] || sf['사료개요'] || '',
              data: sf
            });
          });
        }

        const imgIdx = Math.min(detailPopup.imgIdx, Math.max(0, slides.length - 1));
        const curSlide = slides[imgIdx] || slides[0] || {
          url: '',
          rootKind,
          rootDesc,
          data: {}
        };

        const pathText = (curSlide.subKind && curSlide.subDesc)
          ? `${curSlide.rootKind} : ${curSlide.rootDesc} > ${curSlide.subKind} : ${curSlide.subDesc}`
          : `${curSlide.rootKind} : ${curSlide.rootDesc}`;

        // 분류항목 텍스트: 현재 슬라이드의 _linkedClassifications로부터 정확하게 파싱 (타 자료 공유/침범 원천 차단)
        const slideClassArr = parseLinkedClassifications(
          curSlide.linkedClassifications,
          curSlide.data
        );
        const classItems = slideClassArr
          .filter(lc => lc.label && lc.label.trim() && lc.label !== '-' && lc.label !== '--' && lc.value && lc.value.trim())
          .map(lc => `${lc.label} : ${lc.value}`)
          .join(', ');
        const classText = classItems ? `사료내용분류 ( ${classItems} )` : '';

        // 문서 패널(사료설명) 내용
        const currentDesc = curSlide.descText || curSlide.data['사료설명'] || curSlide.data['사료개요'] || curSlide.data['상세설명'] || '';
        const hasDesc = !!currentDesc.trim();
        const hasOverview = !!(curSlide.data['사료개요'] && curSlide.data['사료개요'].trim());
        const docBtnLabel = hasDesc ? '사료설명' : hasOverview ? '사료개요' : '사료설명';
        const imgs = slides.map(s => s.url);
        const linkedClassArr = slideClassArr;

        return (
          <div className="asp4-popup-overlay" onClick={() => setDetailPopup(null)}>
            <div className="asp4-popup-modal" onClick={e => e.stopPropagation()}>

              {/* 팝업 상단 헤더 */}
              <div className="asp4-popup-header">
                <div className="asp4-popup-header-left">
                  {/* 사료설명 / 사료개요 토글 버튼 */}
                  <button
                    className={`asp4-popup-tab-btn ${detailPopup.showDocPanel ? 'active' : ''}`}
                    onClick={() => setDetailPopup(p => p ? { ...p, showDocPanel: !p.showDocPanel } : p)}
                    title={detailPopup.showDocPanel ? '사료내용 닫기' : '사료내용 보기'}
                  >
                    <FileText size={14} />
                    <span>{docBtnLabel}</span>
                  </button>

                  {/* 이미지 이전/다음 페이징 (1/4 등) */}
                  <div className="asp4-popup-pager-wrap">
                    <button
                      className="asp4-popup-pager-btn"
                      onClick={() => setDetailPopup(p => p ? { ...p, imgIdx: Math.max(0, p.imgIdx - 1) } : p)}
                      disabled={imgIdx === 0}
                      title="이전 이미지"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <span className="asp4-popup-pager-text">
                      {imgs.length > 0 ? `${imgIdx + 1}/${imgs.length}` : '0/0'}
                    </span>
                    <button
                      className="asp4-popup-pager-btn"
                      onClick={() => setDetailPopup(p => p ? { ...p, imgIdx: Math.min(imgs.length - 1, p.imgIdx + 1) } : p)}
                      disabled={imgIdx >= imgs.length - 1}
                      title="다음 이미지"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>

                  {/* 사료경로와 사료의 등록설명 | 사료의 분류항목 */}
                  <div className="asp4-popup-meta-line" title={`${pathText} ${classText ? ` | ${classText}` : ''}`}>
                    <span className="asp4-popup-path-text">{pathText}</span>
                    {classText && (
                      <>
                        <span className="asp4-popup-meta-sep">|</span>
                        <span className="asp4-popup-class-text">{classText}</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="asp4-popup-header-right">
                  <button className="asp4-popup-close-btn" onClick={() => setDetailPopup(null)} title="닫기">
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* 팝업 본문 */}
              <div className="asp4-popup-body">

                {/* 좌측: 사료설명 클릭 시 나타나는 패널 (오직 사료설명과 항목분류만 표시) */}
                {detailPopup.showDocPanel && (
                  <div className="asp4-popup-left">
                    {/* 상단 헤더: '사료설명' 고정 타이틀 + 패널 닫기 버튼 */}
                    <div className="asp4-popup-left-header">
                      <div className="asp4-popup-left-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <FileText size={15} color="#3b82f6" />
                        <span>사료설명</span>
                      </div>
                      <button
                        className="asp4-popup-left-close-btn"
                        onClick={() => setDetailPopup(p => p ? { ...p, showDocPanel: false } : p)}
                        title="사료설명 패널 닫기"
                      >
                        <X size={15} />
                      </button>
                    </div>

                    {/* 1. 항목분류 (오직 해당 자료에 실제로 입력된 분류만 표시) */}
                    {linkedClassArr.filter(lc => lc.label && lc.label.trim() && lc.label !== '-' && lc.label !== '--' && lc.value && lc.value.trim()).length > 0 && (
                      <div className="asp4-popup-class-area">
                        <div className="asp4-popup-section-label">항목분류</div>
                        <div className="asp4-popup-class-tags">
                          {linkedClassArr
                            .filter(lc => lc.label && lc.label.trim() && lc.label !== '-' && lc.label !== '--' && lc.value && lc.value.trim())
                            .map((lc, i) => (
                              <span key={i} className="asp4-popup-class-tag">
                                {lc.label} : {lc.value}
                              </span>
                            ))}
                        </div>
                      </div>
                    )}

                    {/* 2. 사료설명 (오직 해당 자료에 실제로 입력된 사료설명만 표시, 부모나 타 자료 상속 절대 금지) */}
                    <div className="asp4-popup-doc-area">
                      <div className="asp4-popup-section-label">사료설명</div>
                      <div className="asp4-popup-doc-text">
                        {currentDesc.trim() || '등록된 사료설명이 없습니다.'}
                      </div>
                    </div>
                  </div>
                )}

                {/* 우측/중앙: 전체화면 이미지 뷰어 */}
                <div className={`asp4-popup-right ${detailPopup.showDocPanel ? 'with-doc' : 'full'}`}>
                  {imgs.length > 0 ? (
                    <div
                      ref={imgContainerRef}
                      className="asp4-popup-img-wrap"
                      onWheel={handleImgWheel}
                      onMouseDown={handleImgMouseDown}
                      style={{ cursor: imgDragRef.current ? 'grabbing' : 'grab' }}
                    >
                      <img
                        src={imgs[imgIdx]}
                        alt={`이미지 ${imgIdx + 1}`}
                        className="asp4-popup-main-img"
                        draggable={false}
                        style={{
                          transform: `translate(${imgTransform.x}px, ${imgTransform.y}px) scale(${imgTransform.scale})`,
                          transition: imgDragRef.current ? 'none' : 'transform 0.12s ease',
                        }}
                      />
                    </div>
                  ) : (
                    <div className="asp4-popup-img-empty">
                      <Image size={48} />
                      <p>등록된 이미지가 없습니다</p>
                    </div>
                  )}

                  {/* 하단 중앙 플로팅 툴바 (축소 / 배율 / 확대 / 초기화 / 안내) */}
                  {imgs.length > 0 && (
                    <div className="asp4-popup-floating-toolbar">
                      <button
                        className="asp4-pft-btn"
                        onClick={() => setImgTransform(t => ({ ...t, scale: Math.max(0.2, +(t.scale - 0.2).toFixed(2)) }))}
                        title="축소"
                      >
                        <ZoomOut size={15} />
                      </button>
                      <span className="asp4-pft-scale">{Math.round(imgTransform.scale * 100)}%</span>
                      <button
                        className="asp4-pft-btn"
                        onClick={() => setImgTransform(t => ({ ...t, scale: Math.min(5, +(t.scale + 0.2).toFixed(2)) }))}
                        title="확대"
                      >
                        <ZoomIn size={15} />
                      </button>
                      <button
                        className="asp4-pft-btn"
                        onClick={() => setImgTransform({ scale: 1, x: 0, y: 0 })}
                        title="크기 초기화"
                      >
                        <RotateCcw size={14} />
                      </button>
                      <span className="asp4-pft-sep">|</span>
                      <span className="asp4-pft-hint">
                        <Move size={13} /> 드래그 이동 · 휠 확대축소
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default ArchiveSearchPage;
