import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useDataStore } from '../store/useDataStore';
import type { Blueprint, Domain, TreeNode, ExtraInputField, DomainPlacement, DomainDataShape } from '../types';
import { inferDataShape, resolveDomainDataShape, resolveDomainPlacement, PLACEMENT_INFO, DATA_SHAPE_INFO } from '../utils/placement';
import { assembleComposite, parseCompositeValue, applyAutoFormat, applyNameFormatOnBlur, DATE_PART_OPTIONS, getDateFormatInfo } from '../utils/formatters';
import { splitKoreanName } from '../utils/koreanName';
import { ImageUploadInput, isImageField } from './ImageUploadInput';
import {
  X, Plus, Check, AlertTriangle, Edit2, Trash2,
  Tag, BarChart3, Database, Search, GripVertical, Filter,
  Type, AlignLeft, FolderTree, Layers, Phone, Calendar, Hash, Image as ImageIcon, Camera, User,
  Building2, CreditCard, Link2, ArrowRight,
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Minus, Download, Maximize2, RotateCcw,
  Upload, Settings, ListChecks, Settings2, Sliders, FileText, Globe, Lock
} from 'lucide-react';
import { IconSelect, type IconSelectOption } from './IconSelect';
import './FieldManager.css';

interface FieldManagerProps {
  onClose: () => void;
}


// 입력 형식 옵션 정의 (Lucide SVG 아이콘 사용, 이미지 없음)
const INPUT_TYPE_OPTIONS: IconSelectOption[] = [
  { value: 'text', label: '텍스트', icon: Type },
  { value: 'textarea', label: '장문', icon: AlignLeft },
  { value: 'tree', label: '트리(계층)', icon: FolderTree },
  { value: 'composite', label: '복합(조합)', icon: Layers },
  { value: 'tel', label: '전화번호', icon: Phone },
  { value: 'date', label: '날짜', icon: Calendar },
  { value: 'number', label: '숫자', icon: Hash },
  { value: 'file', label: '파일업로드', icon: Upload },
  { value: 'image', label: '이미지', icon: ImageIcon },
  { value: 'camera', label: '카메라', icon: Camera },
  { value: 'fullname', label: '성명분리', icon: User },
  { value: 'bizno', label: '사업자번호', icon: Building2 },
  { value: 'residentno', label: '주민번호', icon: CreditCard },
];



const getInputTypeIcon = (type: Blueprint['inputType']) => {
  switch (type) {
    case 'text': return <Type size={12} />;
    case 'textarea': return <AlignLeft size={12} />;
    case 'tree': return <FolderTree size={12} />;
    case 'composite': return <Layers size={12} />;
    case 'tel': return <Phone size={12} />;
    case 'date': return <Calendar size={12} />;
    case 'number': return <Hash size={12} />;
    case 'file': return <Upload size={12} />;
    case 'image': return <ImageIcon size={12} />;
    case 'camera': return <Camera size={12} />;
    case 'bizno': return <Building2 size={12} />;
    case 'residentno': return <CreditCard size={12} />;
    case 'fullname': return <User size={12} />;
    default: return <Type size={12} />;
  }
};

export const FieldManager: React.FC<FieldManagerProps> = ({ onClose }) => {
  const {
    blueprints, domains, relations, getRelationsForDomain,
    createBlueprint, updateBlueprint, deleteBlueprint,
    getFieldValues, updateFieldValue, deleteFieldValue, deleteFieldValues, addFieldValue,
    updateDomain, addDomain, deleteDomain,
    getAllPersonData,
    getAtomsForDomain,
    addEntityToDomain,
    updateEntityField,
    removeEntityFromDomain,
  } = useDataStore();

  const [activeTab, setActiveTab] = useState<'fields' | 'domains' | 'tree'>('fields');

  // 탭 전환 시 모든 추가/수정 폼을 리셋하여 리스트가 바로 보이도록 처리
  const handleTabChange = (tab: 'fields' | 'domains' | 'tree') => {
    setActiveTab(tab);
    resetFieldForm();
    resetDomainForm();
  };
  
  // ===== 필드 폼 상태 =====
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [showAddField, setShowAddField] = useState(false);
  const [fName, setFName] = useState('');
  const [fDesc, setFDesc] = useState('');
  const [fSynonyms, setFSynonyms] = useState<string[]>([]);
  const [fSynInput, setFSynInput] = useState('');
  const [fInputType, setFInputType] = useState<Blueprint['inputType']>('text');
  const [fDisplayWidth, setFDisplayWidth] = useState<Blueprint['displayWidth']>('half');
  const [fParts, setFParts] = useState<string[]>([]);
  const [fDisplay, setFDisplay] = useState('');
  const [fPartInput, setFPartInput] = useState('');
  const [fDateParts, setFDateParts] = useState<string[]>(['year', 'month', 'day']);
  const [fCalendarType, setFCalendarType] = useState<'both' | 'solar' | 'lunar'>('both');
  const [fFileMode, setFFileMode] = useState<'single' | 'multiple'>('single');
  const [fExtraFields, setFExtraFields] = useState<ExtraInputField[]>([]);

  // 추가 입력 필드 핸들러
  const handleAddExtraField = () => {
    setFExtraFields(prev => [
      ...prev,
      {
        id: `ext-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        inputType: 'text',
        label: '',
      }
    ]);
  };

  const handleUpdateExtraField = (id: string, updates: Partial<ExtraInputField>) => {
    setFExtraFields(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
  };

  const handleDeleteExtraField = (id: string) => {
    setFExtraFields(prev => prev.filter(item => item.id !== id));
  };
  const [fTreeData, setFTreeData] = useState<TreeNode[]>([]);
  const [fTreeHistory, setFTreeHistory] = useState<TreeNode[][]>([]); // 되돌리기 히스토리
  const [editingTreeNodeId, setEditingTreeNodeId] = useState<string | null>(null);
  const [editingTreeNodeLabel, setEditingTreeNodeLabel] = useState('');
  const [addingChildToNodeId, setAddingChildToNodeId] = useState<string | null>(null);
  const [childInputValue, setChildInputValue] = useState('');
  const [showChildSuggestions, setShowChildSuggestions] = useState(false);
  const [expandedTreeNodes, setExpandedTreeNodes] = useState<Set<string>>(new Set());
  const [selectedTreeNodes, setSelectedTreeNodes] = useState<Set<string>>(new Set());
  // 트리 노드 도메인 & 필드 링크 팝업
  const [linkingNodeId, setLinkingNodeId] = useState<string | null>(null);
  const [linkingNodeLabel, setLinkingNodeLabel] = useState('');
  const [linkingTab, setLinkingTab] = useState<'field' | 'domain'>('field');
  const [linkingFieldSearch, setLinkingFieldSearch] = useState('');
  // 노드 설정 메뉴 팝업 (링크 vs 선택)
  const [nodeSettingsMenuNode, setNodeSettingsMenuNode] = useState<{ id: string; label: string } | null>(null);
  // 노드 선택(분류트리 항목 & 선택수) 설정 모달
  const [nodeSelectionModal, setNodeSelectionModal] = useState<{
    nodeId: string;
    nodeLabel: string;
    selectedIds: string[];
    selectedLabels: string[];
    maxSelect: number | '';
  } | null>(null);
  const [selectionSearch, setSelectionSearch] = useState('');
  const [selectionExpandedTreeIds, setSelectionExpandedTreeIds] = useState<Set<string>>(new Set());
  const [fLinkedFieldNames, setFLinkedFieldNames] = useState<string[]>([]);
  const [treeFieldSearch, setTreeFieldSearch] = useState('');
  const [showTreeFieldPopup, setShowTreeFieldPopup] = useState(false);
  const [fCategoryPaths, setFCategoryPaths] = useState<string[]>([]);
  const [showCategoryPathPopup, setShowCategoryPathPopup] = useState(false);
  const [categoryPathSearch, setCategoryPathSearch] = useState('');

  // ===== 분류트리명 클릭 시 트리 구성/생성 전용 팝업 상태 =====
  const [treeBuilderBp, setTreeBuilderBp] = useState<Blueprint | null>(null);

  // ===== 필드명 클릭 시 데이터 관리 전용 팝업 상태 =====
  const [dataModalBp, setDataModalBp] = useState<Blueprint | null>(null);
  const [dataModalScopeTab, setDataModalScopeTab] = useState<string>('all'); // 'all' | 'common' | '{domainName}:{fieldName}'
  const [dataModalInput, setDataModalInput] = useState('');
  const [dataModalSearch, setDataModalSearch] = useState('');
  const [dataModalEditing, setDataModalEditing] = useState<{ oldValue: string; currentText: string; domainTag?: string | null } | null>(null);
  const [dataModalCompositeParts, setDataModalCompositeParts] = useState<Record<string, string>>({});
  const [dataModalEditCompositeParts, setDataModalEditCompositeParts] = useState<Record<string, string>>({});
  const [dataModalCalendarKind, setDataModalCalendarKind] = useState<'solar' | 'lunar'>('solar');
  const [dataModalHistory, setDataModalHistory] = useState<Blueprint[]>([]);

  // ===== 데이터 항목 속성 설정 (순수데이터 vs 필드데이터) 모달 상태 =====
  const [dataAttrModal, setDataAttrModal] = useState<{
    value: string;
    isField: boolean;
    inputType: Blueprint['inputType'];
    displayWidth: Blueprint['displayWidth'];
    description: string;
    format?: Blueprint['format'];
    existingBpId?: string;
  } | null>(null);

  // ===== 도메인 폼 상태 =====
  const [editingDomainId, setEditingDomainId] = useState<string | null>(null);
  const [showAddDomain, setShowAddDomain] = useState(false);
  const [fieldSearch, setFieldSearch] = useState('');
  const [selectedPathFilter, setSelectedPathFilter] = useState('');
  const [showPathFilterDropdown, setShowPathFilterDropdown] = useState(false);
  const [domainSearch, setDomainSearch] = useState('');
  const [dName, setDName] = useState('');
  const [dIcon, setDIcon] = useState('');
  const [dDesc, setDDesc] = useState('');
  const [dAnchor, setDAnchor] = useState('이름');
  const [dUseTree, setDUseTree] = useState(false);
  const [dParentIds, setDParentIds] = useState<string[]>([]);
  const [dPlacement, setDPlacement] = useState<DomainPlacement>('main-content');
  const [dDataShape, setDDataShape] = useState<DomainDataShape | 'auto'>('auto');
  const [domainFieldSearch, setDomainFieldSearch] = useState('');

  // ===== 도메인명 클릭 시 구성 필드 관리 전용 팝업 상태 =====
  const [domainFieldsModalDom, setDomainFieldsModalDom] = useState<Domain | null>(null);
  const [domainFieldsModalSearch, setDomainFieldsModalSearch] = useState('');
  const [domainLocalFieldMode, setDomainLocalFieldMode] = useState(false); // 도메인 전용 필드 모드
  const [dragFieldIdx, setDragFieldIdx] = useState<number | null>(null);
  const [dragOverFieldIdx, setDragOverFieldIdx] = useState<number | null>(null);
  // 필드 추가 독립 팝업 열림 상태
  const [domainAddFieldPopupOpen, setDomainAddFieldPopupOpen] = useState(false);

  // ===== 도메인명 클릭 시 도메인 데이터 CRUD 팝업 상태 =====
  const [domainDataModalDom, setDomainDataModalDom] = useState<Domain | null>(null);
  const [domainDataSearch, setDomainDataSearch] = useState('');
  const [selectedDomainDataAnchorId, setSelectedDomainDataAnchorId] = useState<string | null>(null);
  const [domainFormData, setDomainFormData] = useState<Record<string, string>>({});
  const [activeDomainFieldSuggest, setActiveDomainFieldSuggest] = useState<string | null>(null);
  const [hiddenGridFields, setHiddenGridFields] = useState<Set<string>>(new Set());
  const [expandedRowAnchorIds, setExpandedRowAnchorIds] = useState<Set<string>>(new Set());

  // ===== 이미지 썸네일 클릭 시 큰 사이즈 이미지 보기 팝업 상태 =====
  const [previewImageModal, setPreviewImageModal] = useState<{ url: string; title?: string } | null>(null);

  // ESC 키로 이미지 모달 닫기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && previewImageModal) {
        setPreviewImageModal(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewImageModal]);

  // 도메인 빠른 드래그 추가 상태

  // ===== 유효성 검증 =====
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'field' | 'domain'; id: string; name: string } | null>(null);


  // ===== 유사성 검증 =====
  const [similarWarning, setSimilarWarning] = useState<{ exact: Blueprint | null; synonym: Blueprint | null; similar: Blueprint[] }>({ exact: null, synonym: null, similar: [] });

  // ===== 필드 사용 통계 =====
  const personData = useMemo(() => getAllPersonData(), [getAllPersonData]);

  const getFieldStats = (fieldName: string) => {
    const total = personData.length;
    const withValue = personData.filter(p => p.data[fieldName] && p.data[fieldName] !== '-').length;
    return { total, withValue };
  };

  // ===== 유사성 검증 =====
  const checkSimilarity = (name: string, excludeId?: string, isTreeOnly?: boolean) => {
    const n = name.trim().toLowerCase();
    if (!n) { setSimilarWarning({ exact: null, synonym: null, similar: [] }); return; }

    // 일반 필드와 분류트리 필드의 네임스페이스를 분리하여 검증:
    // isTreeOnly가 true면 트리 필드끼리만, false면 일반 필드끼리만 exact 중복을 검사
    const others = blueprints.filter(b => b.id !== excludeId && (isTreeOnly ? b.inputType === 'tree' : b.inputType !== 'tree'));
    const exact = others.find(b => b.name.toLowerCase() === n) || null;
    const synonym = others.find(b => b.name.toLowerCase() !== n && b.synonyms.some(s => s.toLowerCase() === n && s.toLowerCase() !== b.name.toLowerCase())) || null;
    const similar = others.filter(b =>
      b.name.toLowerCase() !== n && (b.name.toLowerCase().includes(n) || n.includes(b.name.toLowerCase()))
    );
    setSimilarWarning({ exact, synonym, similar });
  };

  // ===== 필드 폼 리셋 =====
  const resetFieldForm = () => {
    setEditingFieldId(null);
    setShowAddField(false);
    setFName(''); setFDesc(''); setFSynonyms([]); setFSynInput('');
    setFInputType('text'); setFDisplayWidth('half');
    setFParts([]); setFDisplay(''); setFPartInput('');
    setFDateParts(['year', 'month', 'day']);
    setFCalendarType('both');
    setFFileMode('single');
    setFExtraFields([]);
    setFTreeData([]);
    setFTreeHistory([]); // 히스토리 초기화
    setEditingTreeNodeId(null); setEditingTreeNodeLabel('');
    setAddingChildToNodeId(null); setChildInputValue('');
    setExpandedTreeNodes(new Set());
    setSelectedTreeNodes(new Set());
    setFCategoryPaths([]); setShowCategoryPathPopup(false); setCategoryPathSearch('');
    setFLinkedFieldNames([]); setTreeFieldSearch(''); setShowTreeFieldPopup(false);
    setSimilarWarning({ exact: null, synonym: null, similar: [] });
  };

  // ===== 필드 편집 시작 =====
  const startEditField = (bp: Blueprint) => {
    setEditingFieldId(bp.id);
    setShowAddField(false);
    setFName(bp.name);
    setFDesc(bp.description);
    setFSynonyms(bp.synonyms.filter(s => s !== bp.name));
    setFInputType(bp.inputType);
    setFDisplayWidth(bp.displayWidth);
    // format과 inputType에서 자동 결정
    setFParts(bp.parts || []);
    setFDisplay(bp.display || '');
    setFPartInput('');
    setFDateParts(bp.dateParts && bp.dateParts.length > 0 ? bp.dateParts : ['year', 'month', 'day']);
    setFCalendarType(bp.calendarType || 'both');
    setFFileMode(bp.fileMode || (bp.multiple ? 'multiple' : 'single'));
    setFExtraFields(bp.extraFields ? JSON.parse(JSON.stringify(bp.extraFields)) : []);
    setFLinkedFieldNames(bp.linkedFieldNames ? [...bp.linkedFieldNames] : []);
    setFTreeData(bp.treeData || []);
    setFTreeHistory([]); // 편집 시작 시 히스토리 초기화
      if (bp.treeData && bp.treeData.length > 0) {
        setExpandedTreeNodes(new Set(collectAllNodeIds(bp.treeData)));
        if (bp.inputGuide && bp.inputGuide.length > 0) {
          setSelectedTreeNodes(new Set(bp.inputGuide));
        } else {
          setSelectedTreeNodes(new Set([bp.treeData[0].id]));
        }
      } else {
        setSelectedTreeNodes(new Set());
      }
    setFSynInput('');
    setSimilarWarning({ exact: null, synonym: null, similar: [] });
    // 복수 경로 로드 (하위 호환: categoryPath → categoryPaths)
    const loadedPaths = bp.categoryPaths && bp.categoryPaths.length > 0
      ? bp.categoryPaths
      : (bp.categoryPath ? [bp.categoryPath] : []);
    setFCategoryPaths(loadedPaths);
    setShowCategoryPathPopup(false);
    setCategoryPathSearch('');
  };

  // ===== 분류트리명 클릭 시 트리 구성/생성 전용 팝업 열기/닫기 =====
  const openTreeBuilder = (bp: Blueprint) => {
    resetFieldForm();
    setEditingFieldId(bp.id);
    setFName(bp.name);
    setFDesc(bp.description);
    setFSynonyms(bp.synonyms.filter(s => s !== bp.name));
    setFInputType('tree');
    setFDisplayWidth(bp.displayWidth);

    // 트리 데이터 로드 (만약 treeData가 없으면 기본 루트노드 생성 및 저장)
    let initialTree = bp.treeData;
    if (!initialTree || initialTree.length === 0) {
      const rootId = treeUuid();
      initialTree = [{ id: rootId, label: bp.name, children: [] }];
      updateBlueprint(bp.id, { treeData: initialTree });
    }
    setFTreeData(initialTree);
    setFTreeHistory([]);
    setExpandedTreeNodes(new Set(collectAllNodeIds(initialTree)));
    if (bp.inputGuide && bp.inputGuide.length > 0) {
      setSelectedTreeNodes(new Set(bp.inputGuide));
    } else {
      setSelectedTreeNodes(new Set([initialTree[0].id]));
    }
    setFLinkedFieldNames(bp.linkedFieldNames ? [...bp.linkedFieldNames] : []);
    setTreeBuilderBp(bp);
  };

  const closeTreeBuilder = () => {
    if (treeBuilderBp) {
      const targetFields = fLinkedFieldNames.length > 0 ? fLinkedFieldNames : treeBuilderBp.linkedFieldNames;
      updateBlueprint(treeBuilderBp.id, {
        treeData: fTreeData,
        inputGuide: Array.from(selectedTreeNodes),
        linkedFieldNames: targetFields
      });
      // 오직 사용자가 명시적으로 연결한 필드가 있을 때만 연동 (이름 같다고 자동 연동 금지)
      syncExplicitLinkedFields(fTreeData, targetFields);
    }
    setTreeBuilderBp(null);
    resetFieldForm();
  };

  // 사용자가 명시적으로 트리/노드에 '연결한 필드'에 트리 노드 데이터 연동 (연결된 필드가 없으면 절대 주입 안 함)
  const syncExplicitLinkedFields = (treeData: TreeNode[], explicitFieldNames?: string[]) => {
    const targetFields = new Set<string>(explicitFieldNames || []);
    const nodeFieldPairs: { fieldName: string; nodeLabel: string }[] = [];

    const walk = (nodes: TreeNode[]) => {
      for (const n of nodes) {
        const nodeTargets = new Set<string>(targetFields);
        if (n.linkedFieldNames && n.linkedFieldNames.length > 0) {
          n.linkedFieldNames.forEach(fn => nodeTargets.add(fn));
        }
        if (n.label && n.label.trim()) {
          nodeTargets.forEach(fn => {
            nodeFieldPairs.push({ fieldName: fn, nodeLabel: n.label.trim() });
          });
        }
        if (n.children && n.children.length > 0) walk(n.children);
      }
    };
    walk(treeData);

    if (nodeFieldPairs.length === 0) return;

    nodeFieldPairs.forEach(({ fieldName, nodeLabel }) => {
      if (nodeLabel) {
        addFieldValue(fieldName, nodeLabel);
      }
    });
  };

  // ===== 성명 데이터 자동 정규화 =====
  const normalizedRef = useRef<Set<string>>(new Set());
  // fullname 타입이거나 성명/이름 관련 설정되어있는 각종한 필드에서 기존 데이터를 "성 이름" 형태로 자동 변환
  // 이름 관련 키워드 (설문지 비교)
  // 입력형식이 이름(fullname)인 때만 성과 이름을 분리하고 나머지는 입력하는 대로 유지
  const isNameRelatedBp = (bp: { name?: string; synonyms?: string[]; inputType: string; format?: string }) => {
    return bp.inputType === 'fullname' || bp.format === 'name';
  };
  useEffect(() => {
    const editingBp = editingFieldId ? blueprints.find(b => b.id === editingFieldId) : null;
    if (!editingBp) return;
    if (!isNameRelatedBp(editingBp)) return;
    const values = getFieldValues(editingBp.name);
    const cacheKey = editingBp.id + '_' + values.map(v => v.value).join(',');
    if (normalizedRef.current.has(cacheKey)) return;
    normalizedRef.current.add(cacheKey);
    values.forEach(({ value }) => {
      // 공백 제거 후 이미 지워져 있어 길이 값이 건너뜀 (이름이 아닌 가능성)
      if (value.includes(' ')) return;
      if (value.length < 2 || value.length > 7) return;
      const [sn, gn] = splitKoreanName(value);
      if (!sn || !gn) return;
      const normalized = sn + ' ' + gn;
      if (normalized !== value) {
        updateFieldValue(editingBp.name, value, normalized);
      }
    });
  }, [editingFieldId, fInputType]);

  // ===== 입력 데이터 관리 핸들러 =====
  // ===== 필드 데이터 전용 팝업 핸들러 =====
  const openDataModal = (bp: Blueprint, isSubNavigation = false) => {
    if (isSubNavigation && dataModalBp) {
      setDataModalHistory(prev => [...prev, dataModalBp]);
    } else if (!isSubNavigation) {
      setDataModalHistory([]);
    }
    setDataModalBp(bp);
    setDataModalScopeTab('all');
    setDataModalInput('');
    setDataModalSearch('');
    setDataModalEditing(null);
    setDataModalCompositeParts({});
    setDataModalEditCompositeParts({});
    setDataModalCalendarKind(bp.calendarType === 'lunar' ? 'lunar' : 'solar');
  };

  const closeDataModal = () => {
    setDataModalBp(null);
    setDataModalScopeTab('all');
    setDataModalHistory([]);
    setDataModalInput('');
    setDataModalSearch('');
    setDataModalEditing(null);
    setDataModalCompositeParts({});
    setDataModalEditCompositeParts({});
  };

  const handleDataModalBack = () => {
    if (dataModalHistory.length === 0) return;
    const prevBp = dataModalHistory[dataModalHistory.length - 1];
    setDataModalHistory(prev => prev.slice(0, -1));
    setDataModalBp(prevBp);
    setDataModalScopeTab('all');
    setDataModalInput('');
    setDataModalSearch('');
    setDataModalEditing(null);
    setDataModalCompositeParts({});
    setDataModalEditCompositeParts({});
    setDataModalCalendarKind(prevBp.calendarType === 'lunar' ? 'lunar' : 'solar');
  };

  // 속성 설정 모달 오픈
  const openDataAttrModal = (val: string) => {
    const existingBp = blueprints.find(b => b.name === val);
    setDataAttrModal({
      value: val,
      isField: Boolean(existingBp),
      inputType: existingBp?.inputType || 'text',
      displayWidth: existingBp?.displayWidth || 'half',
      description: existingBp?.description || `${val} 필드`,
      format: existingBp?.format,
      existingBpId: existingBp?.id,
    });
  };

  // 속성 설정 저장 (필드 생성 또는 갱신, 순수데이터 전환)
  const handleSaveDataAttr = () => {
    if (!dataAttrModal) return;
    const { value, isField, inputType, displayWidth, description, format, existingBpId } = dataAttrModal;
    
    if (isField) {
      const initialTreeData: TreeNode[] | undefined = inputType === 'tree'
        ? [{ id: `tree-${Date.now()}`, label: value, children: [] }]
        : undefined;

      if (existingBpId) {
        updateBlueprint(existingBpId, {
          inputType,
          displayWidth,
          description,
          ...(format ? { format } : {}),
          ...(initialTreeData ? { treeData: initialTreeData } : {})
        });
      } else {
        createBlueprint(value, [value], description || `${value} 필드`, inputType, displayWidth, format, initialTreeData);
      }
    } else {
      if (existingBpId) {
        if (window.confirm(`'${value}' 필드를 해제하고 순수데이터로 전환하시겠습니까?\n(등록된 필드 정의가 제거됩니다)`)) {
          deleteBlueprint(existingBpId);
        }
      }
    }
    setDataAttrModal(null);
  };

  // 데이터 항목 더블클릭 핸들러: 필드데이터이면 데이터관리 팝업 오픈(서브 네비게이션), 순수데이터이면 속성 모달 오픈
  const handleItemDoubleClick = (val: string) => {
    const existingBp = blueprints.find(b => b.name === val);
    if (existingBp) {
      openDataModal(existingBp, true);
    } else {
      openDataAttrModal(val);
    }
  };

  // 현재 활성 탭 기준 domainTag 반환 (null=공용, undefined=전체, string=도메인명)
  const getActiveDataModalDomainTag = (): string | null | undefined => {
    if (dataModalScopeTab === 'all') return undefined;
    if (dataModalScopeTab === 'common') return null;
    return dataModalScopeTab; // 도메인 이름
  };

  const handleDataModalAdd = () => {
    if (!dataModalBp) return;
    const bp = dataModalBp;
    const domainTag = getActiveDataModalDomainTag();
    const addTag = domainTag === undefined ? null : domainTag; // 'all' 탭에서 추가 시 공용으로

    const isComposite = bp.inputType === 'composite' && bp.parts && bp.parts.length > 0;
    
    if (isComposite) {
      const assembled = assembleComposite(bp.parts || [], bp.display || '', dataModalCompositeParts).trim();
      if (!assembled) return;
      addFieldValue(bp.name, assembled, addTag ?? undefined);
      setDataModalCompositeParts({});
      return;
    }

    let raw = dataModalInput.trim();
    if (!raw) return;

    const isCalendarDate = bp.inputType === 'date' && (bp.dateParts?.includes('calendar') || bp.calendarType !== undefined);
    if (isCalendarDate && !raw.startsWith('(양)') && !raw.startsWith('(음)')) {
      raw = `${dataModalCalendarKind === 'lunar' ? '(음)' : '(양)'} ${raw}`.trim();
    }

    // 공통 자동 포맷터 적용 (전화번호, 사업자번호, 주민번호, 숫자 콤마, 날짜, 이름)
    const formatted = applyAutoFormat(raw, bp.name, bp.inputType, bp.format, bp.dateParts, dataModalCalendarKind);
    const val = applyNameFormatOnBlur(formatted, bp.name, bp.inputType, bp.format);

    const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();
    const existing = getFieldValues(bp.name, addTag ?? undefined).map(v => norm(v.value));
    if (existing.includes(norm(val))) return;

    addFieldValue(bp.name, val, addTag ?? undefined);
    setDataModalInput('');
  };

  const handleDataModalSaveEdit = () => {
    if (!dataModalBp || !dataModalEditing) return;
    const bp = dataModalBp;
    const editDomainTag = dataModalEditing.domainTag; // string | null | undefined

    const isComposite = bp.inputType === 'composite' && bp.parts && bp.parts.length > 0;

    let nextVal = '';
    if (isComposite) {
      nextVal = assembleComposite(bp.parts || [], bp.display || '', dataModalEditCompositeParts).trim();
    } else {
      let rawEdit = dataModalEditing.currentText.trim();
      const calKind = rawEdit.startsWith('(음)') ? 'lunar' : 'solar';
      // 공통 자동 포맷터 적용
      const formatted = applyAutoFormat(rawEdit, bp.name, bp.inputType, bp.format, bp.dateParts, calKind);
      nextVal = applyNameFormatOnBlur(formatted, bp.name, bp.inputType, bp.format);
    }

    if (!nextVal || nextVal === dataModalEditing.oldValue) {
      setDataModalEditing(null);
      return;
    }

    updateFieldValue(bp.name, dataModalEditing.oldValue, nextVal, editDomainTag ?? undefined);
    setDataModalEditing(null);
  };

  const handleDataModalDelete = (val: string, count: number, domainTag?: string | null) => {
    if (!dataModalBp) return;
    if (window.confirm(`"${val}" 데이터를 정말 삭제하시겠습니까?\n(${count}개의 데이터에서 해당 값이 삭제됩니다.)`)) {
      deleteFieldValue(dataModalBp.name, val, domainTag ?? undefined);
      if (dataModalEditing?.oldValue === val) {
        setDataModalEditing(null);
      }
    }
  };

  // ===== 도메인 구성 필드 전용 팝업 핸들러 =====
  const openDomainFieldsModal = (dom: Domain) => {
    setDomainFieldsModalDom(dom);
    setDomainFieldsModalSearch('');
    setDomainLocalFieldMode(false);
    setDomainAddFieldPopupOpen(false);
  };

  const closeDomainFieldsModal = () => {
    setDomainFieldsModalDom(null);
    setDomainFieldsModalSearch('');
    setDomainLocalFieldMode(false);
    setDomainAddFieldPopupOpen(false);
  };

  const handleDomainFieldAdd = (domId: string, fieldName: string) => {
    const target = domains.find(d => d.id === domId);
    if (!target || target.fields.includes(fieldName)) return;
    updateDomain(domId, { fields: [...target.fields, fieldName] });
  };

  const handleDomainFieldRemove = (domId: string, fieldName: string) => {
    const target = domains.find(d => d.id === domId);
    if (!target) return;
    updateDomain(domId, {
      fields: target.fields.filter(f => f !== fieldName),
      localFields: (target.localFields || []).filter(f => f !== fieldName),
    });
  };

  // 공용 ↔ 종속 토글 (Blueprint 추가 생성 없이 domain.localFields 로만 관리)
  const handleDomainFieldToggleLocal = (domId: string, fieldName: string) => {
    const target = domains.find(d => d.id === domId);
    if (!target) return;
    const currentLocals = target.localFields || [];
    const isLocal = currentLocals.includes(fieldName);
    const newLocals = isLocal
      ? currentLocals.filter(f => f !== fieldName)
      : [...currentLocals, fieldName];
    updateDomain(domId, { localFields: newLocals });
  };

  const handleDomainFieldMove = (domId: string, fromIdx: number, toIdx: number) => {
    const target = domains.find(d => d.id === domId);
    if (!target) return;
    if (toIdx < 0 || toIdx >= target.fields.length) return;
    const newFields = [...target.fields];
    const [moved] = newFields.splice(fromIdx, 1);
    newFields.splice(toIdx, 0, moved);
    updateDomain(domId, { fields: newFields });
  };

  // ===== 도메인 데이터 CRUD 팝업 핸들러 =====
  const openDomainDataModal = (dom: Domain) => {
    setDomainDataModalDom(dom);
    setDomainDataSearch('');
    setSelectedDomainDataAnchorId(null);
    setActiveDomainFieldSuggest(null);
    setHiddenGridFields(new Set());
    setExpandedRowAnchorIds(new Set());

    // 날짜/시간 필드에 오늘 날짜+시간을 기본값으로 설정
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const mi = String(now.getMinutes()).padStart(2, '0');
    const todayStr = `${yyyy}-${mm}-${dd} ${hh}:${mi}`;

    const initData: Record<string, string> = {};
    (dom.fields || []).forEach(fName => {
      const bp = blueprints.find(b => b.name === fName);
      if (bp?.inputType === 'date' || fName.includes('\uB0A0\uC9DC') || fName.includes('\uC2DC\uAC04') || fName.includes('\uC77C\uC2DC') || fName.includes('\uC57D\uC18D')) {
        initData[fName] = todayStr;
      } else if (bp?.inputType === 'composite' && bp.parts && bp.parts.length > 0) {
        // composite 필드: date 관련 part에만 기본값
        bp.parts.forEach(partName => {
          const partBp = blueprints.find(b => b.name === partName);
          const partKey = `__composite__${fName}__${partName}`;
          if (partBp?.inputType === 'date' || partName.includes('\uB0A0\uC9DC') || partName.includes('\uC2DC\uAC04') || partName.includes('\uC77C\uC2DC')) {
            initData[partKey] = todayStr;
            // composite 조합값 갱신
            const curParts = bp.parts!.map(p => initData[`__composite__${fName}__${p}`] || '');
            initData[fName] = curParts.join(' ');
          }
        });
      }
    });
    setDomainFormData(initData);
  };

  const closeDomainDataModal = () => {
    setDomainDataModalDom(null);
    setDomainDataSearch('');
    setSelectedDomainDataAnchorId(null);
    setDomainFormData({});
    setActiveDomainFieldSuggest(null);
    setHiddenGridFields(new Set());
    setExpandedRowAnchorIds(new Set());
  };

  const toggleFieldGridVisibility = (fieldName: string) => {
    setHiddenGridFields(prev => {
      const next = new Set(prev);
      if (next.has(fieldName)) {
        next.delete(fieldName);
      } else {
        next.add(fieldName);
      }
      return next;
    });
  };

  const toggleRowExpand = (anchorId: string) => {
    setExpandedRowAnchorIds(prev => {
      const next = new Set(prev);
      if (next.has(anchorId)) {
        next.delete(anchorId);
      } else {
        next.add(anchorId);
      }
      return next;
    });
  };

  const handleSelectDomainRecord = (ent: { anchorId: string; data: Record<string, string> }) => {
    if (selectedDomainDataAnchorId === ent.anchorId) {
      // 이미 선택된 행 클릭 시 선택 해제 -> 신규 입력 모드로 전환
      setSelectedDomainDataAnchorId(null);
      setDomainFormData({});
    } else {
      setSelectedDomainDataAnchorId(ent.anchorId);
      // composite 필드의 조합값을 parts별로 분해하여 __composite__ 키에도 초기화
      const expanded: Record<string, string> = { ...ent.data };
      blueprints.forEach(bp => {
        if (bp.inputType === 'composite' && bp.parts && bp.parts.length > 0 && ent.data[bp.name]) {
          const compositeVal = ent.data[bp.name];
          const parsed = parseCompositeValue(compositeVal, bp.parts, bp.display || '');
          bp.parts.forEach(partName => {
            const partKey = `__composite__${bp.name}__${partName}`;
            expanded[partKey] = parsed[partName] || '';
          });
        }
        // extraFields: label 이름으로 저장된 값을 efKey로 복원
        if (bp.extraFields && bp.extraFields.length > 0) {
          bp.extraFields.forEach(ef => {
            const efKey = `${bp.name}__extra__${ef.id}`;
            if (ent.data[ef.label] !== undefined) {
              expanded[efKey] = ent.data[ef.label];
            }
          });
        }
      });
      setDomainFormData(expanded);
    }
    setActiveDomainFieldSuggest(null);
  };

  const handleClearDomainForm = () => {
    setSelectedDomainDataAnchorId(null);
    setDomainFormData({});
    setActiveDomainFieldSuggest(null);
  };

  const handleDomainFieldInputChange = (fName: string, rawValue: string) => {
    const bp = blueprints.find(b => b.name === fName);
    const calKind = rawValue.startsWith('(음)') ? 'lunar' : (rawValue.startsWith('(양)') ? 'solar' : undefined);
    const formatted = bp
      ? applyAutoFormat(rawValue, bp.name, bp.inputType, bp.format, bp.dateParts, calKind)
      : applyAutoFormat(rawValue, fName, 'text');

    setDomainFormData(prev => ({ ...prev, [fName]: formatted }));
    setActiveDomainFieldSuggest(fName);
  };

  const handleDomainFieldBlur = (fName: string) => {
    const bp = blueprints.find(b => b.name === fName);
    const currentVal = domainFormData[fName] || '';
    const formatted = applyNameFormatOnBlur(currentVal, bp?.name || fName, bp?.inputType, bp?.format);
    if (formatted !== currentVal) {
      setDomainFormData(prev => ({ ...prev, [fName]: formatted }));
    }
    setTimeout(() => {
      setActiveDomainFieldSuggest(null);
    }, 200);
  };

  const handleSelectDomainFieldSuggest = (fName: string, val: string) => {
    setDomainFormData(prev => ({ ...prev, [fName]: val }));
    setActiveDomainFieldSuggest(null);
  };

  const handleSaveDomainDataForm = (dom: Domain) => {
    // composite 프리픽스 키 제거 & extraFields 키를 label 이름으로 변환
    const cleanData: Record<string, string> = {};
    Object.entries(domainFormData).forEach(([k, v]) => {
      if (k.startsWith('__composite__')) return; // composite part 키 제거
      if (k.includes('__extra__')) {
        // extraField 키: "${fName}__extra__${ef.id}" → ef.label로 변환
        const parts = k.split('__extra__');
        if (parts.length === 2) {
          const fName = parts[0];
          const efId = parts[1];
          const bp = blueprints.find(b => b.name === fName);
          const ef = bp?.extraFields?.find(e => e.id === efId);
          if (ef && v && v.trim()) {
            cleanData[ef.label] = v;
          }
        }
        return;
      }
      cleanData[k] = v;
    });

    const hasValues = Object.values(cleanData).some(v => v && v.trim());
    if (!hasValues) {
      alert('최소 하나 이상의 필드 값을 입력해주세요.');
      return;
    }

    // ★★★ 모든 필드 값 자동 서식 적용 & 자동완성으로 입력/추가된 값은 해당 필드의 데이터 풀(addFieldValue)에도 함께 등록 ★★★
    dom.fields.forEach(f => {
      let val = (cleanData[f] || '').trim();
      if (val && !val.startsWith('data:image') && !val.startsWith('/local-images/')) {
        const bp = blueprints.find(b => b.name === f);
        val = bp
          ? applyAutoFormat(val, bp.name, bp.inputType, bp.format, bp.dateParts)
          : applyAutoFormat(val, f, 'text');
        val = applyNameFormatOnBlur(val, bp?.name || f, bp?.inputType, bp?.format);
        cleanData[f] = val;
        addFieldValue(f, val);

        // extraFields 값도 addFieldValue 등록
        if (bp?.extraFields) {
          bp.extraFields.forEach(ef => {
            const efVal = (cleanData[ef.label] || '').trim();
            if (efVal) addFieldValue(ef.label, efVal);
          });
        }
      }
    });

    if (selectedDomainDataAnchorId) {
      // 선택된 레코드 수정 (dom.fields + extraFields label 모두 업데이트)
      dom.fields.forEach(f => {
        const newVal = cleanData[f] !== undefined ? cleanData[f] : '';
        updateEntityField(selectedDomainDataAnchorId, f, newVal);
        // extraFields label도 업데이트
        const bp = blueprints.find(b => b.name === f);
        if (bp?.extraFields) {
          bp.extraFields.forEach(ef => {
            const efVal = cleanData[ef.label] !== undefined ? cleanData[ef.label] : '';
            updateEntityField(selectedDomainDataAnchorId, ef.label, efVal);
          });
        }
      });
    } else {
      // 신규 레코드 추가
      addEntityToDomain(dom.id, cleanData);
      setDomainFormData({});
    }
    setActiveDomainFieldSuggest(null);
  };

  const handleDeleteSelectedDomainData = (domId: string, dom: Domain) => {
    if (!selectedDomainDataAnchorId) return;
    const label = domainFormData[dom.anchor] || domainFormData[dom.fields[0]] || '선택한 레코드';
    if (window.confirm(`"${label}" 데이터를 정말 삭제하시겠습니까?`)) {
      removeEntityFromDomain(domId, selectedDomainDataAnchorId);
      setSelectedDomainDataAnchorId(null);
      setDomainFormData({});
    }
  };

  // ===== 필드 저장 =====
  const saveField = () => {
    const n = fName.trim();
    if (!n || similarWarning.exact) return;

    if (editingFieldId) {
      // 수정
      const oldBp = blueprints.find(b => b.id === editingFieldId);
      const oldName = oldBp?.name;
      updateBlueprint(editingFieldId, {
        name: n,
        description: fDesc,
        synonyms: [n, ...fSynonyms],
        inputType: fInputType,
        displayWidth: fDisplayWidth,
        format: fInputType === 'fullname' ? 'name'
          : fInputType === 'tel' ? 'phone'
          : fInputType === 'bizno' ? 'bizno'
          : fInputType === 'residentno' ? 'residentno'
          : undefined,
        ...(fInputType === 'composite' ? { parts: fParts, display: fDisplay } : {}),
        ...(fInputType === 'tree' ? { treeData: fTreeData, inputGuide: Array.from(selectedTreeNodes), linkedFieldNames: fLinkedFieldNames } : {}),
        ...(fInputType === 'date' ? { dateParts: fDateParts, calendarType: fCalendarType, dateFormat: getDateFormatInfo(fDateParts, fCalendarType).formatStr } : {}),
        ...(fInputType === 'file' ? { fileMode: fFileMode, multiple: fFileMode === 'multiple' } : {}),
        extraFields: fExtraFields,
        categoryPath: fCategoryPaths.length > 0 ? fCategoryPaths[0] : undefined,
        categoryPaths: fCategoryPaths.length > 0 ? fCategoryPaths : undefined,
      });
      if (fInputType === 'tree') {
        syncExplicitLinkedFields(fTreeData, fLinkedFieldNames);
      }
      // 도메인의 필드 이름도 업데이트
      if (oldName && oldName !== n) {
        domains.forEach(dom => {
          if (dom.fields.includes(oldName)) {
            updateDomain(dom.id, { fields: dom.fields.map(f => f === oldName ? n : f) });
          }
        });
      }
    } else {
      // 새로 생성
      const autoFormat = fInputType === 'fullname' ? 'name'
        : fInputType === 'tel' ? 'phone'
        : fInputType === 'bizno' ? 'bizno'
        : fInputType === 'residentno' ? 'residentno'
        : undefined;
      const bp = createBlueprint(n, [n, ...fSynonyms], fDesc, fInputType, fDisplayWidth, autoFormat, fInputType === 'tree' ? fTreeData : undefined);
      // composite/tree/date 추가 데이터가 있으면 즉시 업데이트
      if (fInputType === 'composite' && fParts.length > 0) {
        updateBlueprint(bp.id, { parts: fParts, display: fDisplay });
      }
      if (fInputType === 'date') {
        updateBlueprint(bp.id, { dateParts: fDateParts, calendarType: fCalendarType, dateFormat: getDateFormatInfo(fDateParts, fCalendarType).formatStr });
      }
      if (fInputType === 'tree' && (fTreeData.length > 0 || fLinkedFieldNames.length > 0)) {
        updateBlueprint(bp.id, { linkedFieldNames: fLinkedFieldNames });
        syncExplicitLinkedFields(fTreeData, fLinkedFieldNames);
      }
      if (fInputType === 'file') {
        updateBlueprint(bp.id, { fileMode: fFileMode, multiple: fFileMode === 'multiple' });
      }
      if (fExtraFields.length > 0) {
        updateBlueprint(bp.id, { extraFields: fExtraFields });
      }
      // categoryPaths 저장
      if (fCategoryPaths.length > 0) {
        updateBlueprint(bp.id, { categoryPath: fCategoryPaths[0], categoryPaths: fCategoryPaths });
      }
    }
    resetFieldForm();
  };

  // ===== 필드 삭제 =====
  const confirmDeleteField = (bp: Blueprint) => {
    const usage = domains.filter(d => d.fields.includes(bp.name));
    setDeleteConfirm({ type: 'field', id: bp.id, name: `"${bp.name}" 필드${usage.length > 0 ? ` (${usage.map(d => d.name).join(', ')} 도메인에서 사용 중)` : ''}를 삭제하면 해당 필드의 모든 데이터가 함께 삭제됩니다.` });
  };

  const executeDelete = () => {
    if (!deleteConfirm) return;
    if (deleteConfirm.type === 'field') {
      const bp = blueprints.find(b => b.id === deleteConfirm.id);
      if (bp) {
        // 도메인에서도 제거
        domains.forEach(dom => {
          if (dom.fields.includes(bp.name)) {
            updateDomain(dom.id, { fields: dom.fields.filter(f => f !== bp.name) });
          }
        });
        deleteBlueprint(bp.id);
      }
    } else {
      deleteDomain(deleteConfirm.id);
    }
    setDeleteConfirm(null);
  };

  // ===== 동의어 추가 =====
  const handleSynonymAdd = () => {
    const val = fSynInput.trim();
    if (val && !fSynonyms.includes(val) && val !== fName) {
      setFSynonyms(prev => [...prev, val]);
      setFSynInput('');
    }
  };

  // ===== 도메인의 필드 추가 =====

  // ===== 도메인의 필드 순서 이동 =====

  // ===== 도메인 추가 =====
  const resetDomainForm = () => {
    setEditingDomainId(null);
    setShowAddDomain(false);
    setDName(''); setDIcon(''); setDDesc(''); setDAnchor('이름'); setDUseTree(false); setDParentIds([]);
    setDPlacement('main-content');
    setDDataShape('auto');
    setDomainFieldSearch('');
    setDragFieldIdx(null);
    setDragOverFieldIdx(null);
  };

  const startEditDomain = (dom: Domain) => {
    // 도메인 수정 팝업 열 때 배경 팝업(카드/필드 모달) 닫기
    setDomainDataModalDom(null);
    setDomainFieldsModalDom(null);
    setEditingDomainId(dom.id);
    setShowAddDomain(true);
    setDName(dom.name);
    setDIcon(dom.icon);
    setDDesc(dom.description || '');
    setDAnchor(dom.anchor || '이름');
    setDUseTree(!!dom.useTree);
    setDPlacement(dom.placement || 'main-content');
    setDDataShape(dom.dataShape || 'auto');
    const initialParents = dom.parentIds && dom.parentIds.length > 0
      ? dom.parentIds
      : (dom.parentId ? [dom.parentId] : []);
    setDParentIds(initialParents);
  };

  // 빈 도메인 즉시 추가 핸들러  
  const saveDomain = () => {
    if (!dName.trim()) return;
    let finalFields = editingDomainId 
      ? (domains.find(d => d.id === editingDomainId)?.fields || [])
      : [];
    if (dUseTree) {
      const treeBp = blueprints.find(b => b.inputType === 'tree');
      const treeName = treeBp?.name || '트리';
      if (!finalFields.includes(treeName)) {
        finalFields = [...finalFields, treeName];
      }
    }
    const finalDataShape = dDataShape === 'auto' ? undefined : dDataShape;
    if (editingDomainId) {
      updateDomain(editingDomainId, { 
        name: dName.trim(), 
        icon: dIcon, 
        description: dDesc, 
        anchor: dAnchor,
        useTree: dUseTree,
        parentId: dParentIds[0] || undefined,
        parentIds: dParentIds,
        placement: dPlacement,
        dataShape: finalDataShape,
        fields: finalFields
      });
    } else {
      addDomain(dName.trim(), dIcon, finalFields, dDesc, dAnchor, dUseTree, dParentIds, dPlacement, finalDataShape);
    }
    resetDomainForm();
  };



  // 계층적 도메인 목록 (최신 생성 순, 복수 소속 고려)
  const hierarchicalDomains = useMemo(() => {
    const isRoot = (d: Domain) => (!d.parentIds || d.parentIds.length === 0) && !d.parentId;
    // 최신 생성 순(createdAt 내림차순)으로 루트 정렬
    const roots = domains.filter(isRoot).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const result: { domain: Domain; depth: number }[] = [];
    const visited = new Set<string>();
    
    const addWithChildren = (parent: Domain, depth: number) => {
      result.push({ domain: parent, depth });
      visited.add(parent.id);
      const children = domains.filter(d => 
        (d.parentIds && d.parentIds.includes(parent.id)) || d.parentId === parent.id
      );
      children.forEach(child => {
        if (!visited.has(child.id)) {
          visited.add(child.id);
          addWithChildren(child, depth + 1);
        }
      });
    };

    roots.forEach(r => addWithChildren(r, 0));

    // 임시 연락처 도메인이 있다면 뒤에 추가
    domains.forEach(d => {
      if (!result.some(r => r.domain.id === d.id)) {
        result.push({ domain: d, depth: 0 });
      }
    });

    return result;
  }, [domains]);

  // ===== 트리 필드 관리 헬퍼 =====
  const treeUuid = () => `tn-${Math.random().toString(36).substr(2, 8)}`;

  // 트리 데이터 변경 시 즉시 저장 (편집 중인 기존 blueprint에만 적용)
  const saveTreeNow = (newTreeData: TreeNode[]) => {
    if (editingFieldId) {
      updateBlueprint(editingFieldId, { treeData: newTreeData });
    }
  };

  // 트리 변경 전 현재 상태를 히스토리에 저장하는 래퍼
  const updateTreeWithHistory = (newTreeData: TreeNode[]) => {
    setFTreeHistory(prev => [...prev.slice(-19), fTreeData]); // 최대 20단계 히스토리
    setFTreeData(newTreeData);
  };

  // 되돌리기 (undo)
  const undoTree = () => {
    if (fTreeHistory.length === 0) return;
    const prev = fTreeHistory[fTreeHistory.length - 1];
    setFTreeHistory(h => h.slice(0, -1));
    setFTreeData(prev);
    saveTreeNow(prev);
  };

  const addTreeNode = (parentId: string | null, label: string) => {
    const newNode: TreeNode = { id: treeUuid(), label, children: [] };
    let newTreeData: TreeNode[];
    if (!parentId) {
      newTreeData = [...fTreeData, newNode];
    } else {
      newTreeData = insertNodeInTree(fTreeData, parentId, newNode);
    }
    updateTreeWithHistory(newTreeData);
    saveTreeNow(newTreeData);

    // 사용자가 명시적으로 연결한 필드가 있을 때만 해당 필드에 노드 라벨 자동 등록
    const trimLabel = label.trim();
    if (trimLabel && fLinkedFieldNames.length > 0) {
      fLinkedFieldNames.forEach(fn => {
        addFieldValue(fn, trimLabel);
      });
    }
  };

  const insertNodeInTree = (nodes: TreeNode[], parentId: string, newNode: TreeNode): TreeNode[] => {
    return nodes.map(n => {
      if (n.id === parentId) {
        return { ...n, children: [...(n.children || []), newNode] };
      }
      if (n.children && n.children.length > 0) {
        return { ...n, children: insertNodeInTree(n.children, parentId, newNode) };
      }
      return n;
    });
  };

  const removeTreeNode = (nodes: TreeNode[], nodeId: string): TreeNode[] => {
    return nodes
      .filter(n => n.id !== nodeId)
      .map(n => ({
        ...n,
        children: n.children ? removeTreeNode(n.children, nodeId) : undefined,
      }));
  };

  const updateTreeNodeLabel = (nodes: TreeNode[], nodeId: string, label: string): TreeNode[] => {
    return nodes.map(n => {
      if (n.id === nodeId) return { ...n, label };
      return { ...n, children: n.children ? updateTreeNodeLabel(n.children, nodeId, label) : undefined };
    });
  };

  // 트리 노드 linkedDomainIds 업데이트
  const updateTreeNodeLinkedDomains = (nodes: TreeNode[], nodeId: string, domainIds: string[]): TreeNode[] => {
    return nodes.map(n => {
      if (n.id === nodeId) {
        const updated: TreeNode = { ...n };
        if (domainIds.length === 0) {
          delete updated.linkedDomainIds;
          delete updated.linkedDomainId;
        } else {
          updated.linkedDomainIds = domainIds;
          updated.linkedDomainId = domainIds[0]; // 하위 호환
        }
        return updated;
      }
      return { ...n, children: n.children ? updateTreeNodeLinkedDomains(n.children, nodeId, domainIds) : undefined };
    });
  };

  // 트리 노드 linkedFieldNames / linkedFieldIds 업데이트
  const updateTreeNodeLinkedFields = (nodes: TreeNode[], nodeId: string, fieldNames: string[]): TreeNode[] => {
    return nodes.map(n => {
      if (n.id === nodeId) {
        const updated: TreeNode = { ...n };
        if (fieldNames.length === 0) {
          delete updated.linkedFieldNames;
          delete updated.linkedFieldName;
          delete updated.linkedFieldIds;
          delete updated.linkedFieldId;
        } else {
          updated.linkedFieldNames = fieldNames;
          updated.linkedFieldName = fieldNames[0];
          const ids = fieldNames.map(name => blueprints.find(b => b.name === name)?.id).filter(Boolean) as string[];
          updated.linkedFieldIds = ids;
          updated.linkedFieldId = ids[0];
        }
        return updated;
      }
      return { ...n, children: n.children ? updateTreeNodeLinkedFields(n.children, nodeId, fieldNames) : undefined };
    });
  };

  // 트리에서 특정 노드 찾기
  const findTreeNode = (nodes: TreeNode[], nodeId: string): TreeNode | null => {
    for (const n of nodes) {
      if (n.id === nodeId) return n;
      if (n.children) {
        const found = findTreeNode(n.children, nodeId);
        if (found) return found;
      }
    }
    return null;
  };

  const countTreeDescendants = (node: TreeNode): number => {
    if (!node.children || node.children.length === 0) return 0;
    return node.children.reduce((acc, ch) => acc + 1 + countTreeDescendants(ch), 0);
  };

  // 모든 트리 노드를 경로(fullPath)와 함께 추출
  const getAllNodesWithPath = (nodes: TreeNode[], parentPath: string[] = []): { id: string; label: string; fullPath: string }[] => {
    const res: { id: string; label: string; fullPath: string }[] = [];
    for (const n of nodes) {
      const currentPath = [...parentPath, n.label];
      res.push({
        id: n.id,
        label: n.label,
        fullPath: currentPath.join(' > '),
      });
      if (n.children && n.children.length > 0) {
        res.push(...getAllNodesWithPath(n.children, currentPath));
      }
    }
    return res;
  };

  const openNodeSelectionModal = (nodeId: string, nodeLabel: string) => {
    const targetNode = findTreeNode(fTreeData, nodeId);
    const conf = targetNode?.selectionConfig;
    setNodeSelectionModal({
      nodeId,
      nodeLabel,
      selectedIds: conf?.selectedNodeIds ? [...conf.selectedNodeIds] : [],
      selectedLabels: conf?.selectedNodeLabels ? [...conf.selectedNodeLabels] : [],
      maxSelect: conf?.maxSelect !== undefined ? conf.maxSelect : 1,
    });
    setSelectionSearch('');
  };

  const saveNodeSelectionModal = () => {
    if (!nodeSelectionModal) return;
    const { nodeId, selectedIds, selectedLabels, maxSelect } = nodeSelectionModal;
    const parsedLimit = typeof maxSelect === 'number' && maxSelect > 0 ? maxSelect : undefined;
    const config = {
      selectedNodeIds: selectedIds,
      selectedNodeLabels: selectedLabels,
      maxSelect: parsedLimit,
    };
    const updateSelectionInTree = (nodes: TreeNode[]): TreeNode[] => {
      return nodes.map(n => {
        if (n.id === nodeId) {
          const updated: TreeNode = {
            ...n,
            selectionConfig: (selectedIds.length === 0 && !parsedLimit) ? undefined : config
          };
          return updated;
        }
        if (n.children && n.children.length > 0) {
          return { ...n, children: updateSelectionInTree(n.children) };
        }
        return n;
      });
    };
    const nextTreeData = updateSelectionInTree(fTreeData);
    updateTreeWithHistory(nextTreeData);
    saveTreeNow(nextTreeData);
    setNodeSelectionModal(null);
  };


  // 모든 분류트리 필드의 노드 라벨 + 필드 데이터 값을 수집 (자동완성 검색용)
  const getAllTreeNodeLabels = (): string[] => {
    const labels: string[] = [];
    const addUnique = (lbl: string) => {
      if (!labels.includes(lbl)) labels.push(lbl);
    };
    // 1) 트리 노드 라벨 수집
    const traverse = (nodes: TreeNode[]) => {
      for (const n of nodes) {
        addUnique(n.label);
        if (n.children && n.children.length > 0) traverse(n.children);
      }
    };
    blueprints
      .filter(b => b.inputType === 'tree' && b.treeData && b.treeData.length > 0)
      .forEach(b => traverse(b.treeData!));
    // 2) 트리 필드의 데이터 값도 수집 (addFieldValue로 추가된 것들)
    blueprints
      .filter(b => b.inputType === 'tree')
      .forEach(b => {
        const vals = getFieldValues(b.name);
        vals.forEach(v => addUnique(v.value));
      });
    return labels;
  };

  const collectAllNodeIds = (nodes: TreeNode[]): string[] => {
    const ids: string[] = [];
    const traverse = (items: TreeNode[]) => {
      for (const n of items) {
        ids.push(n.id);
        if (n.children && n.children.length > 0) traverse(n.children);
      }
    };
    traverse(nodes);
    return ids;
  };

  const collectTreePaths = (nodes: TreeNode[], prefix: string = '', depth: number = 0): string[] => {
    const paths: string[] = [];
    for (const node of nodes) {
      // depth 0 = 루트 노드 → 경로 문자열에 포함하지 않음
      const fullPath = depth === 0 ? '' : (prefix ? prefix + ' > ' + node.label : node.label);
      if (depth > 0) {
        paths.push(fullPath);
      }
      if (node.children && node.children.length > 0) {
        paths.push(...collectTreePaths(node.children, fullPath, depth + 1));
      }
    }
    return paths;
  };

  // 경로 및 해당 노드 객체를 함께 수집 (도메인 링크 버튼 및 뱃지 연동용)
  const collectTreePathItems = (nodes: TreeNode[], prefix: string = '', depth: number = 0): { path: string; node: TreeNode; segments: string[] }[] => {
    const items: { path: string; node: TreeNode; segments: string[] }[] = [];
    for (const node of nodes) {
      const fullPath = depth === 0 ? '' : (prefix ? prefix + ' > ' + node.label : node.label);
      if (depth > 0) {
        items.push({
          path: fullPath,
          node,
          segments: fullPath.split(' > ')
        });
      }
      if (node.children && node.children.length > 0) {
        items.push(...collectTreePathItems(node.children, fullPath, depth + 1));
      }
    }
    return items;
  };

  // 모든 분류트리의 전체 경로 수집 (분류경로 선택용)
  const getAllCategoryPaths = (): string[] => {
    const allPaths: string[] = [];
    blueprints
      .filter(b => b.inputType === 'tree' && b.treeData && b.treeData.length > 0)
      .forEach(b => {
        allPaths.push(...collectTreePaths(b.treeData!));
      });
    return [...new Set(allPaths)]; // 중복 제거
  };

  const handleToggleNodeSelect = (nodeId: string) => {
    setSelectedTreeNodes(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  const renderTreeNodes = (nodes: TreeNode[], depth: number = 0, readOnlySelection: boolean = false): React.ReactNode => {
    return nodes.map(node => {
      const hasChildren = node.children && node.children.length > 0;
      const isExpanded = expandedTreeNodes.has(node.id);
      const isSelected = selectedTreeNodes.has(node.id);
      const isEditing = editingTreeNodeId === node.id;
      const isAddingChild = addingChildToNodeId === node.id;
      const firstChar = node.label.charAt(0) || '';
      const restText = node.label.slice(1);

      return (
        <div key={node.id} className="fm-tree-node-wrapper">
          <div className="fm-tree-node-row">
            {/* 접기/펼치기 [+] / [-] 정사각 토글 박스 */}
            {hasChildren ? (
              <button
                type="button"
                className={`fm-tree-toggle-box ${isExpanded ? 'expanded' : 'collapsed'} ${isSelected ? 'selected' : 'not-selected'}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setExpandedTreeNodes(prev => {
                    const next = new Set(prev);
                    if (next.has(node.id)) next.delete(node.id); else next.add(node.id);
                    return next;
                  });
                }}
                title={isExpanded ? '하위 분류 접기 (-)' : '하위 분류 펼치기(+)'}
              >
                {isExpanded ? <Minus size={11} strokeWidth={2.4} /> : <Plus size={11} strokeWidth={2.4} />}
              </button>
            ) : (
              <span className={`fm-tree-toggle-box leaf ${isSelected ? 'selected' : 'not-selected'}`} title="하위 항목 없음">
                <Minus size={11} strokeWidth={2} />
              </span>
            )}

            {/* 노드 이름 (인라인 편집) 및 선택 영역 */}
            {isEditing ? (
              <input
                className="fm-tree-edit-input"
                value={editingTreeNodeLabel}
                autoFocus
                onClick={e => e.stopPropagation()}
                onChange={e => setEditingTreeNodeLabel(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (editingTreeNodeLabel.trim()) {
                      const newData = updateTreeNodeLabel(fTreeData, node.id, editingTreeNodeLabel.trim());
                      updateTreeWithHistory(newData);
                      saveTreeNow(newData);
                      if (depth === 0) setFName(editingTreeNodeLabel.trim());
                    }
                    setEditingTreeNodeId(null);
                  } else if (e.key === 'Escape') {
                    setEditingTreeNodeId(null);
                  }
                }}
                onBlur={() => {
                  if (editingTreeNodeLabel.trim()) {
                    const newData = updateTreeNodeLabel(fTreeData, node.id, editingTreeNodeLabel.trim());
                    updateTreeWithHistory(newData);
                    saveTreeNow(newData);
                    if (depth === 0) setFName(editingTreeNodeLabel.trim());
                  }
                  setEditingTreeNodeId(null);
                }}
              />
            ) : (
              <div
                className={`fm-tree-node-label ${isSelected ? 'selected' : 'not-selected'}`}
                onClick={() => handleToggleNodeSelect(node.id)}
                onDoubleClick={(e) => {
                  if (readOnlySelection) return;
                  e.stopPropagation();
                  setEditingTreeNodeId(node.id);
                  setEditingTreeNodeLabel(node.label);
                }}
                title="클릭하여 선택/해제 (더블클릭: 이름 수정)"
              >
                {firstChar && (
                  <span className={`fm-tree-node-badge ${isSelected ? 'selected' : 'not-selected'}`}>
                    {firstChar}
                  </span>
                )}
                <span className={`fm-tree-node-text ${isSelected ? 'selected' : 'not-selected'}`}>
                  {restText}
                </span>
              </div>
            )}

            {/* 연결된 필드 & 도메인 뱃지 */}
            {node.linkedFieldNames && node.linkedFieldNames.length > 0 && (
              <span
                className="fm-tree-node-field-badge"
                onClick={(e) => {
                  e.stopPropagation();
                  setLinkingNodeId(node.id);
                  setLinkingNodeLabel(node.label);
                  setLinkingTab('field');
                }}
                title={`연동 필드: ${node.linkedFieldNames.join(', ')} (클릭하여 수정)`}
              >
                <Tag size={9} />
                <span>{node.linkedFieldNames.join(', ')}</span>
              </span>
            )}
            {node.linkedDomainIds && node.linkedDomainIds.length > 0 && (() => {
              const domNames = node.linkedDomainIds.map(id => domains.find(d => d.id === id)?.name).filter(Boolean);
              return domNames.length > 0 ? (
                <span
                  className="fm-tree-node-domain-badge"
                  onClick={(e) => {
                    e.stopPropagation();
                    setLinkingNodeId(node.id);
                    setLinkingNodeLabel(node.label);
                    setLinkingTab('domain');
                  }}
                  title={`연동 도메인: ${domNames.join(', ')}`}
                >
                  <Link2 size={9} />
                  <span>{domNames.join(', ')}</span>
                </span>
              ) : null;
            })()}

            {/* 액션 버튼 영역 (선택 전용 모드에서는 숨김) */}
            {!readOnlySelection && (
            <div className="fm-tree-node-actions" onClick={e => e.stopPropagation()}>
              {/* 선택 설정 뱃지 (선택 항목이 있을 때) */}
              {node.selectionConfig && node.selectionConfig.selectedNodeLabels && node.selectionConfig.selectedNodeLabels.length > 0 && (
                <span
                  className="fm-tree-node-domain-badge"
                  style={{
                    background: '#f3e8ff',
                    color: '#7e22ce',
                    border: '1px solid #d8b4fe',
                    cursor: 'pointer',
                    fontSize: '0.62rem',
                    fontWeight: 600,
                    marginRight: '3px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '2px',
                    padding: '1px 6px',
                    borderRadius: '999px',
                    verticalAlign: 'middle',
                    lineHeight: 1.2
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    openNodeSelectionModal(node.id, node.label);
                  }}
                  title={`선택: ${node.selectionConfig.selectedNodeLabels.join(', ')} (${node.selectionConfig.maxSelect !== undefined ? node.selectionConfig.maxSelect : '무제한'})`}
                >
                  <ListChecks size={9} style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: '0.62rem', fontWeight: 600 }}>
                    {node.selectionConfig.selectedNodeLabels.join(',')}=
                    {node.selectionConfig.maxSelect !== undefined ? node.selectionConfig.maxSelect : '무제한'}
                  </span>
                </span>
              )}

              {/* 노드 설정 버튼 (링크 대신 설정 아이콘으로 변경) */}
              <button
                type="button"
                className={`fm-tree-action-link${(node.linkedFieldNames?.length || node.linkedDomainIds?.length || (node.selectionConfig && node.selectionConfig.selectedNodeLabels && node.selectionConfig.selectedNodeLabels.length > 0)) ? ' linked' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setNodeSettingsMenuNode({ id: node.id, label: node.label });
                }}
                title={`노드 설정: 링크 및 선택 (${node.label})`}
                style={{
                  background: 'none',
                  border: 'none',
                  color: (node.linkedFieldNames?.length || node.linkedDomainIds?.length || (node.selectionConfig && node.selectionConfig.selectedNodeLabels && node.selectionConfig.selectedNodeLabels.length > 0)) ? '#2563eb' : '#94a3b8',
                  cursor: 'pointer',
                  padding: '2px 4px',
                  display: 'inline-flex',
                  alignItems: 'center'
                }}
              >
                <Settings size={12} />
              </button>
              <button
                type="button"
                className="fm-tree-action-add"
                onClick={(e) => {
                  e.stopPropagation();
                  setAddingChildToNodeId(addingChildToNodeId === node.id ? null : node.id);
                  setChildInputValue('');
                  if (!expandedTreeNodes.has(node.id)) {
                    setExpandedTreeNodes(prev => { const n = new Set(prev); n.add(node.id); return n; });
                  }
                }}
                title="하위 노드 추가"
              >
                <Plus size={11} />
              </button>
              {depth > 0 && (
                <button
                  type="button"
                  className="fm-tree-action-edit"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingTreeNodeId(node.id);
                    setEditingTreeNodeLabel(node.label);
                  }}
                  title="이름 수정"
                >
                  <Edit2 size={11} />
                </button>
              )}
              {depth > 0 && (
                <button
                  type="button"
                  className="fm-tree-action-del"
                  onClick={(e) => {
                    e.stopPropagation();
                    const newData = removeTreeNode(fTreeData, node.id);
                    updateTreeWithHistory(newData);
                    saveTreeNow(newData);
                  }}
                  title="삭제"
                >
                  <Trash2 size={11} />
                </button>
              )}
            </div>
            )}
          </div>

          {/* 하위 노드 추가 인라인 입력 (분류트리 데이터 검색 자동완성) */}
          {isAddingChild && (() => {
            const allLabels = getAllTreeNodeLabels();
            const q = childInputValue.trim().toLowerCase();
            const suggestions = q.length > 0
              ? allLabels.filter(lbl => lbl.toLowerCase().includes(q) && lbl !== childInputValue.trim())
              : [];
            const exactMatch = q.length > 0 && allLabels.some(lbl => lbl.toLowerCase() === q);
            return (
            <div className="fm-tree-child-add-row" onClick={e => e.stopPropagation()} style={{ position: 'relative' }}>
              <ChevronRight size={12} className="fm-tree-child-arrow" />
              <div style={{ position: 'relative', flex: 1 }}>
                <input
                  className="fm-tree-child-input"
                  value={childInputValue}
                  autoFocus
                  placeholder="노드 검색 또는 새 이름 입력..."
                  onChange={e => { setChildInputValue(e.target.value); setShowChildSuggestions(true); }}
                  onFocus={() => setShowChildSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowChildSuggestions(false), 200)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (childInputValue.trim()) {
                        addTreeNode(node.id, childInputValue.trim());
                        setChildInputValue('');
                        setShowChildSuggestions(false);
                      }
                    } else if (e.key === 'Escape') {
                      setAddingChildToNodeId(null);
                      setChildInputValue('');
                      setShowChildSuggestions(false);
                    }
                  }}
                />
                {showChildSuggestions && q.length > 0 && (suggestions.length > 0 || !exactMatch) && (
                  <div className="fm-tree-child-suggestions">
                    {suggestions.slice(0, 8).map((s, idx) => (
                      <div
                        key={idx}
                        className="fm-tree-child-suggestion-item"
                        onMouseDown={e => {
                          e.preventDefault();
                          addTreeNode(node.id, s);
                          setChildInputValue('');
                          setShowChildSuggestions(false);
                        }}
                      >
                        <Search size={11} />
                        <span>{s}</span>
                      </div>
                    ))}
                    {!exactMatch && q.length > 0 && (
                      <div
                        className="fm-tree-child-suggestion-item new-item"
                        onMouseDown={e => {
                          e.preventDefault();
                          addTreeNode(node.id, childInputValue.trim());
                          setChildInputValue('');
                          setShowChildSuggestions(false);
                        }}
                      >
                        <Plus size={11} />
                        <span>"{childInputValue.trim()}" 새로 추가</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <button
                type="button"
                className="fm-tree-child-confirm"
                onClick={() => {
                  if (childInputValue.trim()) {
                    addTreeNode(node.id, childInputValue.trim());
                    setChildInputValue('');
                    setShowChildSuggestions(false);
                  }
                }}
              ><Check size={12} /></button>
              <button
                type="button"
                className="fm-tree-child-cancel"
                onClick={() => { setAddingChildToNodeId(null); setChildInputValue(''); setShowChildSuggestions(false); }}
              ><X size={12} /></button>
            </div>
            );
          })()}

          {/* 자식 노드들 (펼쳐진 때만) - 재귀적 컨테이너 */}
          {hasChildren && isExpanded && (
            <div className="fm-tree-children">
              {renderTreeNodes(node.children!, depth + 1, readOnlySelection)}
            </div>
          )}
        </div>
      );
    });
  };

  // ===== 필드 폼 렌더링 =====
  const renderFieldForm = (isEdit: boolean, isTreeMode: boolean = false, hideTreeSection: boolean = false, treeOnly: boolean = false) => {
    const isTree = isTreeMode || fInputType === 'tree' || activeTab === 'tree';
    const editingBp = editingFieldId ? blueprints.find(b => b.id === editingFieldId) : null;

    return (
      <div className="fm-add-form" style={treeOnly ? { border: 'none', background: 'transparent', padding: 0, boxShadow: 'none' } : undefined}>
      
      {!treeOnly && (
        <>
          {!isTree ? (
      <div className="fm-form-row-inline">
        <div style={{ flex: '0 0 40%' }}>
          <label>필드 이름</label>
          <input
            type="text"
            value={fName}
            onChange={e => {
              const val = e.target.value;
              setFName(val);
              checkSimilarity(val, editingFieldId ?? undefined, isTree);
            }}
            placeholder="필드 이름"
          />
        </div>
        <div style={{ flex: '1 1 60%', position: 'relative' }}>
          <label>필드분류경로</label>
          <div className="fm-category-paths-box">
            {fCategoryPaths.length > 0 ? (
              <div className={`fm-category-paths-tags${fCategoryPaths.length > 1 ? ' fm-multi' : ''}`}>
                {fCategoryPaths.map((p, i) => (
                  <span key={i} className="fm-category-path-tag">
                    <FolderTree size={10} />
                    <span>{p}</span>
                  </span>
                ))}
              </div>
            ) : (
              <span className="fm-category-paths-empty">분류경로 없음</span>
            )}
            <button type="button" className="fm-category-paths-edit-btn" onClick={() => { setShowCategoryPathPopup(true); setCategoryPathSearch(''); }} title="분류경로 편집">
              <Edit2 size={12} /> 경로 편집
            </button>
          </div>

          {/* 분류경로 팝업 모달 */}
          {showCategoryPathPopup && (() => {
            const allPaths = getAllCategoryPaths();
            const searchNorm = categoryPathSearch.trim().toLowerCase();
            const filtered = searchNorm
              ? allPaths.filter(p => p.toLowerCase().includes(searchNorm))
              : allPaths;
            const isNewPath = searchNorm.length > 0 && !allPaths.some(p => p.toLowerCase() === searchNorm);
            return createPortal(
              <div className="fm-catpath-popup-overlay" onClick={e => e.stopPropagation()}>
                <div className="fm-catpath-popup" onClick={e => e.stopPropagation()}>
                  <div className="fm-catpath-popup-header">
                    <FolderTree size={16} />
                    <span>분류경로 선택</span>
                    <span className="fm-catpath-popup-count">{fCategoryPaths.length}개 선택됨</span>
                    <button className="fm-close" onClick={() => setShowCategoryPathPopup(false)}><X size={16} /></button>
                  </div>
                  <div className="fm-catpath-popup-search">
                    <Search size={13} />
                    <input
                      autoFocus
                      type="text"
                      value={categoryPathSearch}
                      onChange={e => setCategoryPathSearch(e.target.value)}
                      placeholder="경로 검색 또는 직접 입력..."
                      onKeyDown={e => {
                        if (e.key === 'Enter' && categoryPathSearch.trim()) {
                          e.preventDefault();
                          const val = categoryPathSearch.trim();
                          if (!fCategoryPaths.includes(val)) {
                            setFCategoryPaths(prev => [...prev, val]);
                          }
                          setCategoryPathSearch('');
                        }
                      }}
                    />
                  </div>
                  <div className="fm-catpath-popup-list">
                    {filtered.map((p, i) => {
                      const isSelected = fCategoryPaths.includes(p);
                      return (
                        <div
                          key={i}
                          className={`fm-catpath-popup-item ${isSelected ? 'selected' : ''}`}
                          onClick={() => {
                            if (isSelected) {
                              setFCategoryPaths(prev => prev.filter(x => x !== p));
                            } else {
                              setFCategoryPaths(prev => [...prev, p]);
                            }
                          }}
                        >
                          <div className={`fm-catpath-checkbox ${isSelected ? 'checked' : ''}`}>
                            {isSelected && <Check size={11} />}
                          </div>
                          <FolderTree size={12} />
                          <span className="fm-catpath-popup-item-text">{p}</span>
                        </div>
                      );
                    })}
                    {isNewPath && (
                      <div
                        className="fm-catpath-popup-item new-item"
                        onClick={() => {
                          const val = categoryPathSearch.trim();
                          if (!fCategoryPaths.includes(val)) {
                            setFCategoryPaths(prev => [...prev, val]);
                          }
                          setCategoryPathSearch('');
                        }}
                      >
                        <Plus size={12} />
                        <span>"{categoryPathSearch.trim()}" 직접 추가</span>
                      </div>
                    )}
                    {filtered.length === 0 && !isNewPath && (
                      <div className="fm-catpath-popup-empty">분류트리에서 경로를 먼저 만들어 주세요.</div>
                    )}
                  </div>
                  {fCategoryPaths.length > 0 && (
                    <div className="fm-catpath-popup-selected">
                      <div className="fm-catpath-popup-selected-label">선택된 경로:</div>
                      <div className="fm-catpath-popup-selected-tags">
                        {fCategoryPaths.map((p, i) => (
                          <span key={i} className="fm-category-path-tag">
                            <FolderTree size={10} />
                            <span>{p}</span>
                            <button type="button" onClick={() => setFCategoryPaths(prev => prev.filter((_, idx) => idx !== i))}><X size={10} /></button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="fm-catpath-popup-footer">
                    <button className="fm-btn-cancel" onClick={() => setShowCategoryPathPopup(false)}>닫기</button>
                  </div>
                </div>
              </div>,
              document.body
            );
          })()}
        </div>
      </div>
      ) : (
      <div className="fm-form-row">
        <label>분류명</label>
        <input
          type="text"
          value={fName}
          onChange={e => {
            const val = e.target.value;
            setFName(val);
            checkSimilarity(val, editingFieldId ?? undefined, isTree);
            const trimmed = val.trim();
            // 루트 노드 라벨 동기화 + 즉시 저장
            setFTreeData(prev => {
              let newData: TreeNode[];
              if (!trimmed) {
                if (prev.length === 1 && (!prev[0].children || prev[0].children.length === 0)) {
                  newData = [];
                } else {
                  newData = prev;
                }
              } else if (prev.length === 0) {
                const rootId = treeUuid();
                setExpandedTreeNodes(exp => {
                  const next = new Set(exp);
                  next.add(rootId);
                  return next;
                });
                newData = [{ id: rootId, label: trimmed, children: [] }];
              } else {
                const [first, ...rest] = prev;
                newData = [{ ...first, label: trimmed }, ...rest];
              }
              if (newData !== prev) {
                saveTreeNow(newData);
              }
              return newData;
            });
          }}
          placeholder="분류명"
        />
      </div>
      )}

      {similarWarning.exact && (
        <div className="fm-warning error"><AlertTriangle size={14} /><span>"{similarWarning.exact.name}" {isTree ? '분류명이' : '필드가'} 이미 존재합니다!</span></div>
      )}
      {similarWarning.synonym && !similarWarning.exact && (
        <div className="fm-warning warn"><AlertTriangle size={14} /><span>"{similarWarning.synonym.name}"의 {isTree ? '분류명 동의어로' : '동의어로'} 등록되어 있으나, 독립 {isTree ? '분류' : '필드'}로 생성 가능합니다.</span></div>
      )}
      {similarWarning.similar.length > 0 && !similarWarning.exact && !similarWarning.synonym && (
        <div className="fm-warning warn"><AlertTriangle size={14} /><span>유사: {similarWarning.similar.map(b => `"${b.name}"`).join(', ')}</span></div>
      )}


      <div className="fm-form-row">

        <label>설명</label>
        <input type="text" value={fDesc} onChange={e => setFDesc(e.target.value)} placeholder={isTree ? '분류 설명' : '필드 설명'} />
      </div>

      <div className="fm-form-row">
        <label>{isTree ? '분류명 동의어' : '동의어'}</label>
        <div className="fm-synonym-input">
          <input type="text" value={fSynInput} onChange={e => setFSynInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSynonymAdd()} placeholder={isTree ? '분류명 동의어 입력 후 Enter' : '동의어 입력 후 Enter'} />
        </div>
        {fSynonyms.length > 0 && (
          <div className="fm-synonym-tags">
            {fSynonyms.map((s, i) => (
              <span key={i} className="fm-synonym-tag">{s}<button onClick={() => setFSynonyms(prev => prev.filter((_, idx) => idx !== i))}><X size={10} /></button></span>
            ))}
          </div>
        )}
      </div>

      {isTree && (
        <div className="fm-form-row">
          <label style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Tag size={13} style={{ color: '#2563eb' }} />
            <span>연결된 필드</span>
          </label>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              gap: '12px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>
                연결된 필드 :
              </span>
              {fLinkedFieldNames.length > 0 ? (
                fLinkedFieldNames.map((name, i) => {
                  const valCount = getFieldValues(name).length;
                  return (
                    <span
                      key={i}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        background: '#eff6ff',
                        color: '#1d4ed8',
                        border: '1px solid #bfdbfe',
                        padding: '3px 9px',
                        borderRadius: '6px',
                        fontSize: '12.5px',
                        fontWeight: 600
                      }}
                    >
                      <Tag size={11} />
                      <span>{name}</span>
                      <span style={{ fontSize: '10.5px', color: '#3b82f6', fontWeight: 500 }}>({valCount}건)</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFLinkedFieldNames(prev => prev.filter(n => n !== name));
                        }}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, marginLeft: '2px', color: '#3b82f6' }}
                        title="연결 해제"
                      >
                        <X size={11} />
                      </button>
                    </span>
                  );
                })
              ) : (
                <span style={{ fontSize: '12.5px', color: '#94a3b8' }}>
                  없음 (우측 버튼을 눌러 연결할 필드를 선택하세요)
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => { setShowTreeFieldPopup(true); setTreeFieldSearch(''); }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 14px',
                background: '#2563eb',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                flexShrink: 0
              }}
            >
              <Tag size={12} />
              <span>{fLinkedFieldNames.length > 0 ? '필드 변경' : '필드 선택'}</span>
            </button>
          </div>

          {/* 연결 필드 선택 전용 팝업 모달 */}
          {showTreeFieldPopup && typeof document !== 'undefined' && createPortal(
            <div className="fm-node-link-overlay" onClick={e => e.stopPropagation()} style={{ zIndex: 10300 }}>
              <div className="fm-node-link-modal" onClick={e => e.stopPropagation()} style={{ width: '520px' }}>
                <div className="fm-node-link-header">
                  <div className="fm-node-link-title">
                    <Tag size={15} style={{ color: '#2563eb' }} />
                    <span>분류트리 연동 필드 선택</span>
                  </div>
                  <button className="fm-close" onClick={() => setShowTreeFieldPopup(false)}><X size={16} /></button>
                </div>

                <div className="fm-node-link-desc">
                  트리의 노드들이 참조할 데이터 필드를 선택하세요. 같은 이름의 노드라도 선택된 필드의 데이터를 기반으로 연결됩니다.
                </div>

                <div style={{ padding: '10px 14px 4px' }}>
                  <div className="fm-field-data-search">
                    <Search size={13} />
                    <input
                      type="text"
                      value={treeFieldSearch}
                      onChange={e => setTreeFieldSearch(e.target.value)}
                      placeholder="연동할 필드 검색..."
                      autoFocus
                    />
                    {treeFieldSearch && <button type="button" onClick={() => setTreeFieldSearch('')}><X size={11} /></button>}
                  </div>
                </div>

                <div className="fm-node-link-list" style={{ maxHeight: '240px', padding: '6px 14px' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {blueprints
                      .filter(b => b.inputType !== 'tree' && (!treeFieldSearch || b.name.toLowerCase().includes(treeFieldSearch.toLowerCase())))
                      .map(b => {
                        const isSelected = fLinkedFieldNames.includes(b.name);
                        const fieldValCount = getFieldValues(b.name).length;
                        return (
                          <button
                            key={b.id}
                            type="button"
                            onClick={() => {
                              setFLinkedFieldNames(prev =>
                                isSelected ? prev.filter(name => name !== b.name) : [...prev, b.name]
                              );
                            }}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '6px 11px',
                              borderRadius: '7px',
                              fontSize: '12px',
                              fontWeight: isSelected ? 600 : 500,
                              background: isSelected ? '#eff6ff' : '#f8fafc',
                              color: isSelected ? '#1d4ed8' : '#334155',
                              border: isSelected ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
                              cursor: 'pointer',
                              transition: 'all 0.12s'
                            }}
                          >
                            {isSelected ? <Check size={13} color="#2563eb" /> : <Plus size={13} />}
                            <span>{b.name}</span>
                            <span style={{ fontSize: '10.5px', color: isSelected ? '#2563eb' : '#94a3b8' }}>
                              ({fieldValCount}건)
                            </span>
                          </button>
                        );
                      })}
                  </div>
                </div>

                {/* 현재 선택된 필드 및 데이터 요약 미리보기 */}
                {fLinkedFieldNames.length > 0 && (
                  <div style={{ padding: '0 14px 10px' }}>
                    <div className="fm-node-link-data-preview">
                      <div className="fm-node-link-data-preview-title">
                        <span>선택된 필드 실데이터 미리보기 ({fLinkedFieldNames.join(', ')})</span>
                      </div>
                      {fLinkedFieldNames.map(fName => {
                        const values = getFieldValues(fName);
                        return (
                          <div key={fName} style={{ marginBottom: '6px' }}>
                            <div style={{ fontSize: '11px', fontWeight: 600, color: '#1e40af', marginBottom: '3px' }}>
                              [{fName}] 데이터 ({values.length}건)
                            </div>
                            <div className="fm-node-link-data-chips">
                              {values.length === 0 ? (
                                <span style={{ fontSize: '11px', color: '#94a3b8' }}>등록된 데이터가 없습니다.</span>
                              ) : (
                                values.slice(0, 10).map((v, idx) => (
                                  <span key={idx} className="fm-node-link-data-chip" title={`${v.value} (${v.count}건)`}>
                                    {v.value}
                                  </span>
                                ))
                              )}
                              {values.length > 10 && (
                                <span style={{ fontSize: '10.5px', color: '#64748b', alignSelf: 'center' }}>
                                  외 {values.length - 10}개...
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="fm-node-link-footer">
                  <button
                    type="button"
                    className="fm-node-link-done-btn"
                    onClick={() => setShowTreeFieldPopup(false)}
                    style={{ background: '#2563eb' }}
                  >
                    <Check size={13} /> 선택 완료
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}
        </div>
      )}

      {!isTree && (
      <div className="fm-form-row-inline">
        <div>
          <label>입력 형식</label>
          <IconSelect
            value={fInputType}
            onChange={val => setFInputType(val as Blueprint['inputType'])}
            options={INPUT_TYPE_OPTIONS}
          />
        </div>
        <div>
          <label>표시 방식</label>
          <select value={fDisplayWidth} onChange={e => setFDisplayWidth(e.target.value as Blueprint['displayWidth'])}>
            <option value="third">1/3</option>
            <option value="half">1/2</option>
            <option value="full">전체</option>
            <option value="thumbnail">썸네일</option>
          </select>
        </div>
      </div>
      )}

      {/* file 파일업로드 단수/복수 등록 옵션 설정 */}
      {fInputType === 'file' && (
        <div className="fm-file-mode-section">
          <div className="fm-file-mode-header">
            <span className="fm-file-mode-title">파일 등록 옵션</span>
            <span className="fm-file-mode-sub">단수(1개 파일) 또는 복수(여러 파일) 등록 방식을 선택하세요.</span>
          </div>
          <div className="fm-file-mode-options">
            <label className={`fm-file-mode-card ${fFileMode === 'single' ? 'active' : ''}`} onClick={() => setFFileMode('single')}>
              <input
                type="radio"
                name="fileMode"
                value="single"
                checked={fFileMode === 'single'}
                onChange={() => setFFileMode('single')}
              />
              <div className="fm-file-mode-card-content">
                <div className="fm-file-mode-card-top">
                  <span className="fm-file-mode-radio-circle" />
                  <span className="fm-file-mode-label">단수 (단일 파일)</span>
                </div>
                <p className="fm-file-mode-desc">1건당 1개의 파일만 첨부하여 등록합니다.</p>
              </div>
            </label>

            <label className={`fm-file-mode-card ${fFileMode === 'multiple' ? 'active' : ''}`} onClick={() => setFFileMode('multiple')}>
              <input
                type="radio"
                name="fileMode"
                value="multiple"
                checked={fFileMode === 'multiple'}
                onChange={() => setFFileMode('multiple')}
              />
              <div className="fm-file-mode-card-content">
                <div className="fm-file-mode-card-top">
                  <span className="fm-file-mode-radio-circle" />
                  <span className="fm-file-mode-label">복수 (다중 파일)</span>
                </div>
                <p className="fm-file-mode-desc">1건당 여러 개의 파일을 첨부하여 등록합니다.</p>
              </div>
            </label>
          </div>
        </div>
      )}

      {/* date 날짜 세부 구성 요소 (음력/양력, 년, 월, 일, 날자, 시, 분) 설정 */}
      {fInputType === 'date' && (
        <div className="fm-date-parts-section">
          <div className="fm-date-parts-header">
            <span className="fm-date-parts-title">날짜 구성 요소 설정</span>
            <span className="fm-date-parts-sub">체크한 항목만 입력 및 표시 형식으로 사용됩니다.</span>
          </div>
          <div className="fm-date-parts-grid">
            {DATE_PART_OPTIONS.map(opt => {
              const isChecked = fDateParts.includes(opt.id);
              return (
                <label key={opt.id} className={`fm-date-part-chip ${isChecked ? 'active' : ''} ${opt.id === 'calendar' ? 'fm-date-part-calendar' : ''}`}>
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={e => {
                      if (e.target.checked) {
                        setFDateParts(prev => [...prev, opt.id]);
                      } else {
                        if (fDateParts.length > 1) {
                          setFDateParts(prev => prev.filter(p => p !== opt.id));
                        }
                      }
                    }}
                  />
                  <span className="fm-date-part-label">{opt.label}</span>
                  <span className="fm-date-part-code">({opt.code})</span>
                </label>
              );
            })}
          </div>

          {/* 음력/양력 체크 시 세부 달력 기준 선택 */}
          {fDateParts.includes('calendar') && (
            <div className="fm-date-calendar-subgroup">
              <span className="fm-date-subgroup-label">달력 기준:</span>
              <div className="fm-calendar-type-pills">
                <button
                  type="button"
                  className={`fm-calendar-pill ${fCalendarType === 'both' ? 'active' : ''}`}
                  onClick={() => setFCalendarType('both')}
                  title="데이터 입력 시 양력 또는 음력을 선택할 수 있습니다"
                >
                  양력/음력 선택
                </button>
                <button
                  type="button"
                  className={`fm-calendar-pill ${fCalendarType === 'solar' ? 'active' : ''}`}
                  onClick={() => setFCalendarType('solar')}
                  title="기본 양력으로 설정됩니다"
                >
                  양력 전용
                </button>
                <button
                  type="button"
                  className={`fm-calendar-pill ${fCalendarType === 'lunar' ? 'active' : ''}`}
                  onClick={() => setFCalendarType('lunar')}
                  title="기본 음력으로 설정됩니다"
                >
                  음력 전용
                </button>
              </div>
            </div>
          )}

          <div className="fm-date-parts-preview">
            <span className="fm-date-preview-badge">미리보기</span>
            <span className="fm-date-preview-text">
              <strong>{getDateFormatInfo(fDateParts, fCalendarType).sampleStr}</strong>
              <span className="fm-date-preview-format">({getDateFormatInfo(fDateParts, fCalendarType).formatStr})</span>
            </span>
          </div>
        </div>
      )}

      {/* composite 파트 관리 */}
      {fInputType === 'composite' && (
        <div className="fm-composite-section">
          <div className="fm-form-row">
            <label>구성 파트</label>
            <div className="fm-synonym-input">
              <input type="text" value={fPartInput} onChange={e => setFPartInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { const v = fPartInput.trim(); if (v && !fParts.includes(v)) { setFParts(p => [...p, v]); setFPartInput(''); if (!fDisplay) setFDisplay(prev => prev + `{${v}}`); } }}} placeholder="파트 이름 (예: 성, 이름)" />
              <button onClick={() => { const v = fPartInput.trim(); if (v && !fParts.includes(v)) { setFParts(p => [...p, v]); setFPartInput(''); setFDisplay(prev => prev + `{${v}}`); } }}><Plus size={14} /></button>
            </div>
            {fParts.length > 0 && (
              <div className="fm-synonym-tags">
                {fParts.map((p, i) => (
                  <span key={i} className="fm-synonym-tag fm-part-tag">{p}<button onClick={() => { setFParts(prev => prev.filter((_, idx) => idx !== i)); }}><X size={10} /></button></span>
                ))}
              </div>
            )}
          </div>
          <div className="fm-form-row">
            <label>조합 형식</label>
            <input type="text" value={fDisplay} onChange={e => setFDisplay(e.target.value)} placeholder="예: {성} {이름} 또는 {성}{이름}" />
            {fParts.length > 0 && fDisplay && (
              <div className="fm-composite-preview">
                미리보기: {fDisplay.replace(/\{([^}]+)\}/g, (_, p) => `[${p}]`)}
              </div>
            )}
          </div>
        </div>
      )}
        </>
      )}

      {/* tree 계층 관리 */}
      {(fInputType === 'tree' || isTreeMode || treeOnly) && !hideTreeSection && (
        <div className="fm-tree-section" style={treeOnly ? { marginTop: 0, marginBottom: '20px' } : undefined}>
          <div className="fm-tree-builder">
            <div className="fm-tree-builder-header">
              <FolderTree size={14} />
              <span>"{fName.trim() || '분류명'}" 트리구조 구성</span>
              <span className="fm-tree-node-total">{fTreeData.length > 0 && fTreeData[0].children && fTreeData[0].children.length > 0 ? `하위 ${countTreeDescendants(fTreeData[0])}개` : '루트 노드만'}</span>
              <button
                type="button"
                className={`fm-tree-undo-btn${fTreeHistory.length === 0 ? ' disabled' : ''}`}
                onClick={undoTree}
                disabled={fTreeHistory.length === 0}
                title={`되돌리기 (${fTreeHistory.length}단계)`}
              >
                <RotateCcw size={13} />
              </button>
            </div>

            {/* 트리 노드 목록 */}
            <div className="fm-tree-nodes-area">
              {fTreeData.length === 0 ? (
                <div className="fm-tree-empty">
                  <FolderTree size={28} />
                  <p>분류명을 입력하면 루트 노드가 생성됩니다.</p>
                  <p className="fm-tree-empty-sub">루트 노드 옆의 '+' 버튼을 눌러 하위 분류를 추가하세요.</p>
                </div>
              ) : (
                renderTreeNodes(fTreeData)
              )}
            </div>
          </div>

          {/* 트리 경로 리스트 */}
          {fTreeData.length > 0 && (() => {
            const treePathItems = collectTreePathItems(fTreeData);
            return (
              <div className="fm-tree-path-list" style={treeOnly ? { marginTop: '16px', marginBottom: '28px' } : undefined}>
                <div className="fm-tree-path-header">
                  <FolderTree size={13} />
                  <span>트리 경로 리스트 ({treePathItems.length}개)</span>
                </div>
                <div className="fm-tree-path-items">
                  {treePathItems.length === 0 ? (
                    <div className="fm-tree-path-empty">등록된 경로가 없습니다.</div>
                  ) : (
                    treePathItems.map((item, i) => {
                      const isLinked = !!(item.node.linkedDomainIds && item.node.linkedDomainIds.length > 0);
                      const linkedDomainsList = isLinked
                        ? item.node.linkedDomainIds!.map(id => domains.find(d => d.id === id)).filter(Boolean)
                        : [];

                      return (
                        <div key={item.node.id || i} className="fm-tree-path-item">
                          <span className="fm-tree-path-idx">{i + 1}</span>
                          <div className="fm-tree-path-breadcrumb">
                            {item.segments.map((seg, sIdx) => (
                              <React.Fragment key={sIdx}>
                                <span className={`fm-tree-path-badge ${sIdx === item.segments.length - 1 ? 'leaf' : 'branch'}`}>
                                  {seg}
                                </span>
                                {sIdx < item.segments.length - 1 && (
                                  <ChevronRight size={11} className="fm-tree-path-arrow" />
                                )}
                              </React.Fragment>
                            ))}
                          </div>

                          {/* 연결된 필드 뱃지 */}
                          {item.node.linkedFieldNames && item.node.linkedFieldNames.length > 0 && (
                            <span
                              className="fm-tree-node-field-badge fm-tree-path-domain-badge"
                              onClick={(e) => {
                                e.stopPropagation();
                                setLinkingNodeId(item.node.id);
                                setLinkingNodeLabel(item.node.label);
                                setLinkingTab('field');
                              }}
                              title={`연동 필드: ${item.node.linkedFieldNames.join(', ')}`}
                            >
                              <Tag size={9} />
                              <span>{item.node.linkedFieldNames.join(', ')}</span>
                            </span>
                          )}

                          {/* 연결된 도메인 뱃지 */}
                          {linkedDomainsList.length > 0 && (
                            <span
                              className="fm-tree-node-domain-badge fm-tree-path-domain-badge"
                              onClick={(e) => {
                                e.stopPropagation();
                                setLinkingNodeId(item.node.id);
                                setLinkingNodeLabel(item.node.label);
                                setLinkingTab('domain');
                              }}
                              title={linkedDomainsList.map(d => d!.name).join(', ')}
                            >
                              <Link2 size={9} />
                              <span>{linkedDomainsList.map(d => d!.name).join(', ')}</span>
                            </span>
                          )}

                          {/* 선택 설정 뱃지 */}
                          {item.node.selectionConfig && item.node.selectionConfig.selectedNodeLabels && item.node.selectionConfig.selectedNodeLabels.length > 0 && (
                            <span
                              className="fm-tree-node-domain-badge fm-tree-path-domain-badge"
                              style={{
                                background: '#f3e8ff',
                                color: '#7e22ce',
                                border: '1px solid #d8b4fe',
                                cursor: 'pointer',
                                fontSize: '0.62rem',
                                fontWeight: 600,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '2px',
                                padding: '1px 6px',
                                borderRadius: '999px',
                                verticalAlign: 'middle',
                                lineHeight: 1.2
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                openNodeSelectionModal(item.node.id, item.node.label);
                              }}
                              title={`선택: ${item.node.selectionConfig.selectedNodeLabels.join(', ')} (${item.node.selectionConfig.maxSelect !== undefined ? item.node.selectionConfig.maxSelect : '무제한'})`}
                            >
                              <ListChecks size={9} style={{ flexShrink: 0 }} />
                              <span style={{ fontSize: '0.62rem', fontWeight: 600 }}>
                                {item.node.selectionConfig.selectedNodeLabels.join(',')}=
                                {item.node.selectionConfig.maxSelect !== undefined ? item.node.selectionConfig.maxSelect : '무제한'}
                              </span>
                            </span>
                          )}

                          {/* 노드 설정 버튼 (링크 아이콘 대신 설정 아이콘) */}
                          <button
                            type="button"
                            className={`fm-tree-action-link fm-tree-path-link-btn${(isLinked || (item.node.linkedFieldNames && item.node.linkedFieldNames.length > 0) || (item.node.selectionConfig && item.node.selectionConfig.selectedNodeLabels && item.node.selectionConfig.selectedNodeLabels.length > 0)) ? ' linked' : ''}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setNodeSettingsMenuNode({ id: item.node.id, label: item.node.label });
                            }}
                            title={`노드 설정: 링크 및 선택 (${item.node.label})`}
                          >
                            <Settings size={12} />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      )}


      {/* 추가 복수 입력 필드 섹션 (tree가 아닐 때) */}
      {!isTree && !treeOnly && (
        <div className="fm-extra-fields-section">
          {fExtraFields.length > 0 && (
            <div className="fm-extra-fields-list">
              <div className="fm-extra-fields-divider-dashed" />
              {fExtraFields.map((extField, idx) => (
                <div key={extField.id || idx} className="fm-extra-field-row">
                  <div className="fm-extra-field-col">
                    <label>입력 형식</label>
                    <IconSelect
                      value={extField.inputType}
                      onChange={val => handleUpdateExtraField(extField.id, { inputType: val as Blueprint['inputType'] })}
                      options={INPUT_TYPE_OPTIONS}
                    />
                  </div>
                  <div className="fm-extra-field-col">
                    <label>설명라벨</label>
                    <input
                      type="text"
                      value={extField.label}
                      onChange={e => handleUpdateExtraField(extField.id, { label: e.target.value })}
                      placeholder="설명라벨 입력"
                    />
                  </div>
                  <button
                    type="button"
                    className="fm-extra-field-del-btn"
                    onClick={() => handleDeleteExtraField(extField.id)}
                    title="추가 필드 삭제"
                  >
                    <X size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* 중앙 '+ 입력추가' 실선 구분선 버튼 */}
          <div className="fm-extra-add-container">
            <button
              type="button"
              className="fm-btn-add-extra"
              onClick={handleAddExtraField}
            >
              + 입력추가
            </button>
          </div>
        </div>
      )}

      {!treeOnly && (
        <div className="fm-form-actions">
          <button className="fm-btn-cancel" onClick={resetFieldForm}>취소</button>
          {isEdit && editingBp && (
            <button className="fm-btn-delete" onClick={() => { resetFieldForm(); confirmDeleteField(editingBp!); }}>
              <Trash2 size={14} /> 삭제
            </button>
          )}
          <button className="fm-btn-create" onClick={saveField} disabled={!fName.trim() || !!similarWarning.exact}>
            <Check size={14} />{isEdit ? '수정' : '생성'}
          </button>
        </div>
      )}
    </div>
    );
  };


  return (
    <div className="fm-overlay" onClick={e => e.stopPropagation()}>
      {/* 분류트리 전용 트리구조 생성/구성 모달 */}
      {treeBuilderBp && typeof document !== 'undefined' && createPortal(
        <div className="fm-edit-overlay" onClick={e => e.stopPropagation()}>
          <div className="fm-edit-modal fm-tree-builder-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '840px', width: '92%', display: 'flex', flexDirection: 'column', minHeight: 'auto', maxHeight: '88vh' }}>
            <div className="fm-edit-modal-header fm-edit-modal-header--inline">
              <div className="fm-edit-modal-header-title-group">
                <div className="fm-edit-modal-title-static">{treeBuilderBp.name} 트리구조 구성</div>
                <div className="fm-edit-modal-sub">분류트리 생성 및 계층 관리</div>
              </div>
              <button className="fm-close" onClick={closeTreeBuilder}><X size={18} /></button>
            </div>
            <div className="fm-edit-modal-body" style={{ flex: '1 1 auto', overflowY: 'auto', padding: '24px 28px' }}>
              {renderFieldForm(true, true, false, true)}
            </div>
            <div style={{
              padding: '14px 28px',
              borderTop: '1px solid #e2e8f0',
              background: '#f8fafc',
              display: 'flex',
              justifyContent: 'flex-end',
              borderRadius: '0 0 16px 16px',
              gap: '8px'
            }}>
              <button
                type="button"
                className="fm-btn-create"
                onClick={closeTreeBuilder}
                style={{ padding: '8px 24px', fontSize: '0.85rem' }}
              >
                <Check size={14} /> 완료
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 필드 수정 모달 */}
      {editingFieldId && !treeBuilderBp && typeof document !== 'undefined' && createPortal(
        (() => {
          return (
            <div className="fm-edit-overlay" onClick={e => e.stopPropagation()}>
              <div className="fm-edit-modal" onClick={e => e.stopPropagation()}>
                <div className="fm-edit-modal-header fm-edit-modal-header--inline">
                  <div className="fm-edit-modal-header-title-group">
                    <div className="fm-edit-modal-title-static">{fName || '필드 이름'}</div>
                    <div className="fm-edit-modal-sub">{activeTab === 'tree' ? '분류트리 관리' : '필드 관리'}</div>
                  </div>
                  <button className="fm-close" onClick={resetFieldForm}><X size={18} /></button>
                </div>
                <div className="fm-edit-modal-body">
                  {renderFieldForm(true, activeTab === 'tree', true)}
                </div>
              </div>
            </div>
          );
        })(),
        document.body
      )}

      {/* 새 필드 추가 팝업 모달 */}
      {showAddField && typeof document !== 'undefined' && createPortal(
        <div className="fm-edit-overlay" onClick={e => e.stopPropagation()}>
          <div className="fm-edit-modal" onClick={e => e.stopPropagation()}>
            <div className="fm-edit-modal-header fm-edit-modal-header--inline">
              <div className="fm-edit-modal-header-title-group">
                <div className="fm-edit-modal-title-static">{fName || (activeTab === 'tree' ? '새 분류트리' : '새 필드')}</div>
                <div className="fm-edit-modal-sub">{activeTab === 'tree' ? '분류트리 추가' : '필드 추가'}</div>
              </div>
              <button className="fm-close" onClick={resetFieldForm}><X size={18} /></button>
            </div>
            <div className="fm-edit-modal-body">
              {renderFieldForm(false, activeTab === 'tree', true)}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 도메인 수정 모달 — showAddDomain이 열려있으면 표시 안 함 (fm-domain-add-overlay가 대신 표시됨) */}
      {editingDomainId && !showAddDomain && typeof document !== 'undefined' && createPortal(
        (() => {
          const edom = domains.find(d => d.id === editingDomainId);
          return (
            <div className="fm-edit-overlay" onClick={e => e.stopPropagation()}>
              <div className="fm-edit-modal" onClick={e => e.stopPropagation()}>
                <div className="fm-edit-modal-header fm-edit-modal-header--inline">
                  <div className="fm-edit-modal-header-title-group">
                    <div className="fm-edit-modal-title-static">{edom ? edom.name : '도메인 수정'}</div>
                    <div className="fm-edit-modal-sub">도메인 관리</div>
                  </div>
                  <button className="fm-close" onClick={resetDomainForm}><X size={18} /></button>
                </div>
                <div className="fm-edit-modal-body">
                  {showAddDomain && activeTab === 'domains' && (
                    <div className="fm-add-form" style={{ border: 'none', background: 'none', boxShadow: 'none', margin: 0 }}>
                      {/* 2컬럼: 도메인 이름 + 설명 */}
                      <div className="fm-domain-meta-row">
                        <div className="fm-form-row" style={{ flex: 1 }}>
                          <label>도메인 이름</label>
                          <input value={dName} onChange={e => setDName(e.target.value)} autoFocus />
                        </div>
                        <div className="fm-form-row" style={{ flex: 1 }}>
                          <label>설명</label>
                          <input value={dDesc} onChange={e => setDDesc(e.target.value)} placeholder="도메인 설명" />
                        </div>
                      </div>
                      {/* 데이터 유형 */}
                      <div className="fm-form-row">
                        <label>데이터 유형</label>
                        <select value={dAnchor} onChange={e => setDAnchor(e.target.value)} className="fm-anchor-select">
                          <option value="이름">카드 중심 (명함, 연락처 등)</option>
                          {blueprints.filter(b => b.inputType !== 'composite' && !['이름', '성', '명'].includes(b.name)).map(bp => (
                            <option key={bp.id} value={bp.name}>{bp.name} 중심 (엔티티)</option>
                          ))}
                        </select>
                      </div>
                      {/* ===== 등록 필드 관리 ===== */}
                      {editingDomainId && edom && (
                        <div className="fm-domain-field-section">
                          <div className="fm-domain-field-section-label">
                            <span>사용 필드</span>
                            <span className="fm-domain-field-count">{edom.fields.length}개</span>
                          </div>
                          {/* 현재 등록된 필드 → 드래그로 순서 변경 */}
                          <div className="fm-domain-field-chips">
                            {edom.fields.length === 0 && (
                              <span className="fm-domain-field-empty">등록된 필드 없음</span>
                            )}
                            {edom.fields.map((f, idx) => (
                              <span
                                key={f}
                                className={`fm-domain-field-chip${dragOverFieldIdx === idx ? ' fm-dfc-drag-over' : ''}${dragFieldIdx === idx ? ' fm-dfc-dragging' : ''}`}
                                draggable
                                onDragStart={() => setDragFieldIdx(idx)}
                                onDragOver={e => { e.preventDefault(); setDragOverFieldIdx(idx); }}
                                onDragLeave={() => setDragOverFieldIdx(null)}
                                onDrop={() => {
                                  if (dragFieldIdx === null || dragFieldIdx === idx) { setDragFieldIdx(null); setDragOverFieldIdx(null); return; }
                                  const newFields = [...edom.fields];
                                  const [moved] = newFields.splice(dragFieldIdx, 1);
                                  newFields.splice(idx, 0, moved);
                                  updateDomain(edom.id, { fields: newFields });
                                  setDragFieldIdx(null);
                                  setDragOverFieldIdx(null);
                                }}
                                onDragEnd={() => { setDragFieldIdx(null); setDragOverFieldIdx(null); }}
                              >
                                <GripVertical size={10} className="fm-dfc-grip" />
                                <span className="fm-domain-field-chip-num">{idx + 1}</span>
                                {f}
                                <button
                                  onClick={() => updateDomain(edom.id, { fields: edom.fields.filter(x => x !== f) })}
                                  title={`"${f}" 필드 제거`}
                                >
                                  <X size={10} />
                                </button>
                              </span>
                            ))}
                          </div>
                          {/* 검색창 */}
                          <input
                            className="fm-domain-field-search"
                            placeholder="추가할 필드를 검색하세요"
                            value={domainFieldSearch}
                            onChange={e => setDomainFieldSearch(e.target.value)}
                          />
                          {/* 추가 가능한 필드 */}
                          <div className="fm-domain-field-avail">
                            {(() => {
                              const availList = blueprints.filter(
                                b => !edom.fields.includes(b.name) && b.name.includes(domainFieldSearch)
                              );
                              if (availList.length === 0) {
                                return (
                                  <span className="fm-domain-field-empty">
                                    {domainFieldSearch ? '일치하는 필드가 없습니다.' : '추가 가능한 필드가 없습니다.'}
                                  </span>
                                );
                              }
                              return availList.map(b => (
                                <button
                                  key={b.id}
                                  type="button"
                                  className="fm-domain-field-add-chip"
                                  onClick={() => {
                                    updateDomain(edom.id, { fields: [...edom.fields, b.name] });
                                    setDomainFieldSearch('');
                                  }}
                                >
                                  + {b.name}
                                </button>
                              ));
                            })()}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="fm-edit-modal-footer">
                  <button className="fm-dbl-btn cancel" onClick={resetDomainForm}>취소</button>
                  {editingDomainId && edom ? (
                    <button className="fm-dbl-btn delete" onClick={() => { resetDomainForm(); setDeleteConfirm({ type: 'domain', id: edom.id, name: `"${edom.name}" 도메인` }); }}><Trash2 size={14} /> 삭제</button>
                  ) : (
                    <div style={{ flex: 1 }} />
                  )}
                  <button className="fm-dbl-btn save" onClick={saveDomain} disabled={!dName.trim()}>
                    <Check size={14} /> 수정
                  </button>
                </div>
              </div>
            </div>
          );
        })(),
        document.body
      )}

            <div className="fm-panel" onClick={e => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="fm-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2>필드 &amp; 도메인 관리</h2>
          <button className="fm-close" onClick={onClose} title="닫기"><X size={20} /></button>
        </div>

        {/* 탭 */}
        <div className="fm-tabs">
          <button className={`fm-tab ${activeTab === 'fields' ? 'active' : ''}`} onClick={() => handleTabChange('fields')}>
            <Tag size={14} /> 필드 관리 ({blueprints.filter(b => b.inputType !== 'tree').length})
          </button>
          <button className={`fm-tab ${activeTab === 'domains' ? 'active' : ''}`} onClick={() => handleTabChange('domains')}>
            <Layers size={14} /> 도메인 관리 ({domains.length})
          </button>
          <button className={`fm-tab ${activeTab === 'tree' ? 'active' : ''}`} onClick={() => handleTabChange('tree')}>
            <FolderTree size={14} /> 분류트리 ({blueprints.filter(b => b.inputType === 'tree' && !['활동히스토리', '시장카테고리분류', '활동분류'].includes(b.name)).length})
          </button>
        </div>

        {/* ===== 필드 관리 탭 ===== */}
        {activeTab === 'fields' && (
          <div className="fm-content">
            <div className="fm-toolbar">
              <div className="fm-toolbar-search" style={{ position: 'relative' }}>
                <Search size={14} />
                {selectedPathFilter && (
                  <span className="fm-path-filter-badge" onClick={() => setSelectedPathFilter('')} title="필터 해제">
                    {selectedPathFilter} 횞
                  </span>
                )}
                <input
                  type="text"
                  value={fieldSearch}
                  onChange={e => setFieldSearch(e.target.value)}
                  placeholder={selectedPathFilter ? "필드 검색..." : "필드 검색... (경로 필터: 좌측)"}
                />
                <button
                  className="fm-path-filter-btn"
                  onClick={() => setShowPathFilterDropdown(prev => !prev)}
                  title="분류경로 필터"
                  type="button"
                >
                  <Filter size={14} />
                </button>
                {showPathFilterDropdown && (() => {
                  const allPaths = getAllCategoryPaths();
                  // 필드에 설정된 categoryPath/categoryPaths 중 실제 사용되는 것만 수집
                  const usedPaths = [...new Set(blueprints.flatMap(b => {
                    if (b.categoryPaths && b.categoryPaths.length > 0) return b.categoryPaths;
                    if (b.categoryPath) return [b.categoryPath];
                    return [];
                  }))];
                  const combinedPaths = [...new Set([...usedPaths, ...allPaths])].sort();
                  return (
                    <div className="fm-path-filter-dropdown">
                      <div className="fm-path-filter-header">분류경로 필터</div>
                      <div
                        className={`fm-path-filter-item ${!selectedPathFilter ? 'active' : ''}`}
                        onClick={() => { setSelectedPathFilter(''); setShowPathFilterDropdown(false); }}
                      >
                        전체 보기
                      </div>
                      <div
                        className={`fm-path-filter-item ${selectedPathFilter === '__none__' ? 'active' : ''}`}
                        onClick={() => { setSelectedPathFilter('__none__'); setShowPathFilterDropdown(false); }}
                      >
                        미분류 (경로 없음)
                      </div>
                      {combinedPaths.map(p => (
                        <div
                          key={p}
                          className={`fm-path-filter-item ${selectedPathFilter === p ? 'active' : ''}`}
                          onClick={() => { setSelectedPathFilter(p); setShowPathFilterDropdown(false); }}
                        >
                          {p}
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
              <button className="fm-toolbar-add-btn" onClick={() => { setShowAddField(true); setEditingFieldId(null); }}>
                <Plus size={14} /> 추가
              </button>
            </div>

            <div className="fm-field-list">
              {blueprints.filter(bp => {
                // composite 파트 필드는 목록에서 제외
                const isCompositePart = blueprints.some(parent => 
                  parent.inputType === 'composite' && parent.parts?.includes(bp.name)
                );
                if (isCompositePart) return false;
                // tree 타입 필드는 분류트리 탭에서만 관리
                if (bp.inputType === 'tree') return false;
                // 경로 필터
                if (selectedPathFilter) {
                  const bpPaths = bp.categoryPaths && bp.categoryPaths.length > 0
                    ? bp.categoryPaths
                    : (bp.categoryPath ? [bp.categoryPath] : []);
                  if (selectedPathFilter === '__none__') {
                    if (bpPaths.length > 0) return false;
                  } else {
                    if (!bpPaths.includes(selectedPathFilter)) return false;
                  }
                }
                // 검색 필터
                if (fieldSearch.trim()) {
                  const q = fieldSearch.trim().toLowerCase();
                  return bp.name.toLowerCase().includes(q) ||
                    (bp.description || '').toLowerCase().includes(q) ||
                    (bp.synonyms || []).some(s => s.toLowerCase().includes(q));
                }
                return true;
              }).map(bp => {
                const stats = getFieldStats(bp.name);

                return (
                  <div
                    key={bp.id}
                    className="fm-field-item"
                    onDoubleClick={e => { e.preventDefault(); e.stopPropagation(); startEditField(bp); }}
                    onMouseDown={e => { if (e.detail > 1) e.preventDefault(); }}
                    title="더블클릭 → 메뉴"
                  >
                    <div className="fm-field-main">
                      <div className="fm-field-info">
                        <div className="fm-field-name-row">
                          <span 
                            className="fm-field-name"
                            onClick={e => { e.preventDefault(); e.stopPropagation(); openDataModal(bp); }}
                            title="클릭: 데이터 값 관리 (입력/수정/삭제)"
                          >
                            {bp.name}
                          </span>
                          {bp.name.includes(':') && (
                            <span style={{ fontSize: '11px', background: '#ede9fe', color: '#7c3aed', border: '1px solid #c4b5fd', borderRadius: '4px', padding: '1px 6px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                              <Lock size={10} /> {bp.name.split(':')[0]} 종속
                            </span>
                          )}
                          <span className="fm-field-type" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            {getInputTypeIcon(bp.inputType)}
                            <span>{bp.inputType}</span>
                          </span>
                           <span className="fm-field-width">{bp.displayWidth === 'full' ? '전체' : bp.displayWidth === 'half' ? '1/2' : bp.displayWidth || '기본'}</span>
                          {bp.inputType === 'composite' && bp.parts && (
                            <span className="fm-field-composite" style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                              <Link2 size={11} /> {bp.parts.join('+')}
                            </span>
                          )}
                          {bp.inputType === 'tree' && bp.treeData && bp.treeData.length > 0 && (
                            <span className="fm-field-composite" style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                              <FolderTree size={11} /> {bp.treeData.length}개 노드
                            </span>
                          )}
                          {bp.inputType === 'date' && (
                            <span className="fm-field-composite" style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', background: '#f0fdf4', color: '#16a34a', borderColor: '#bbf7d0' }}>
                              <Calendar size={11} /> {getDateFormatInfo(bp.dateParts, bp.calendarType).formatStr}
                            </span>
                          )}
                          {bp.inputType === 'file' && (
                            <span className="fm-field-composite" style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', background: '#eff6ff', color: '#2563eb', borderColor: '#bfdbfe' }}>
                              <Upload size={11} /> {bp.fileMode === 'multiple' || bp.multiple ? '복수 (다중)' : '단수 (단일)'}
                            </span>
                          )}
                          {bp.format && bp.format !== 'none' && (
                            <span className="fm-field-format" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              {bp.format === 'phone' ? <Phone size={11} /> : bp.format === 'bizno' ? <Building2 size={11} /> : <CreditCard size={11} />}
                              <span>{bp.format === 'phone' ? '전화번호' : bp.format === 'bizno' ? '사업자번호' : '주민번호'}</span>
                            </span>
                          )}
                        </div>
                        {bp.description && <span className="fm-field-desc">{bp.description}</span>}
                        {(() => {
                          const paths = bp.categoryPaths && bp.categoryPaths.length > 0
                            ? bp.categoryPaths
                            : (bp.categoryPath ? [bp.categoryPath] : []);
                          return paths.length > 0 ? (
                            <div className="fm-field-category-paths">
                              {paths.map((p, i) => (
                                <span key={i} className="fm-field-category-path">
                                  <FolderTree size={10} />
                                  <span>{p}</span>
                                </span>
                              ))}
                            </div>
                          ) : null;
                        })()}
                      </div>

                    </div>

                    {/* 통계: 사용 도메인 수 + 데이터 수 */}
                    <div className="fm-field-stats">
                      <BarChart3 size={11} />
                      <span>데이터 {getFieldValues(bp.name).length}건</span>
                      <span className="fm-stats-sep">·</span>
                      <span>도메인 {domains.filter(d => d.fields.includes(bp.name)).length}개 사용</span>
                      <div className="fm-stats-bar">
                        <div className="fm-stats-fill" style={{ width: stats.total > 0 ? `${(stats.withValue / stats.total) * 100}%` : '0%' }}></div>
                      </div>
                    </div>

                    {/* 동의어 */}
                    {bp.synonyms.filter(s => s !== bp.name).length > 0 && (
                      <div className="fm-field-synonyms">
                        <span className="fm-syn-label">동의어</span>
                        {bp.synonyms.filter(s => s !== bp.name).map((s, i) => (
                          <span key={i} className="fm-syn-tag">{s}</span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ===== 도메인 관리 탭 ===== */}
        {activeTab === 'domains' && (
          <div className="fm-content">
            <div className="fm-toolbar">
              <div className="fm-toolbar-search">
                <Search size={14} />
                <input
                  type="text"
                  value={domainSearch}
                  onChange={e => setDomainSearch(e.target.value)}
                  placeholder="도메인 검색..."
                />
              </div>
              <button className="fm-toolbar-add-btn" onClick={() => { setShowAddDomain(true); setEditingDomainId(null); resetDomainForm(); setShowAddDomain(true); }}>
                <Plus size={14} /> 추가
              </button>
            </div>

            {/* 도메인 추가/수정 폼 — 팝업 모달 */}
            {showAddDomain && typeof document !== 'undefined' && createPortal(
              <div className="fm-domain-add-overlay" onClick={e => e.stopPropagation()}>
                <div className="fm-domain-add-modal" onClick={e => e.stopPropagation()}>
                  <div className="fm-domain-add-header">
                    <span className="fm-domain-add-title">
                      {editingDomainId ? '도메인 수정' : '새 도메인 추가'}
                    </span>
                    <button className="fm-close" onClick={resetDomainForm}><X size={16} /></button>
                  </div>
                  <div className="fm-form-row">
                    <label>도메인 이름</label>
                    <input
                      value={dName}
                      onChange={e => setDName(e.target.value)}
                      placeholder="예: 거래처, 가족 등..."
                      autoFocus
                      onKeyDown={e => { if (e.key === 'Enter' && dName.trim()) saveDomain(); if (e.key === 'Escape') resetDomainForm(); }}
                    />
                  </div>
                  <div className="fm-form-row">
                    <label>설명</label>
                    <input
                      value={dDesc}
                      onChange={e => setDDesc(e.target.value)}
                      placeholder="도메인 설명"
                    />
                  </div>
                  <div className="fm-form-row">
                    <label>데이터 유형</label>
                    <select value={dAnchor} onChange={e => setDAnchor(e.target.value)} className="fm-anchor-select">
                      <option value="이름">카드 중심 (명함, 최다 등)</option>
                      {blueprints.filter(b => b.inputType !== 'composite' && !['이름', '성', '명'].includes(b.name)).map(bp => (
                        <option key={bp.id} value={bp.name}>{bp.name} 중심 (엔티티)</option>
                      ))}
                    </select>
                    <div className="fm-anchor-hint">
                      {dAnchor === '이름'
                        ? '카드 = 한 사람. 사람에 연관된 데이터들을 보여줍니다.'
                        : `카드 = 하나의 ${dAnchor}. ${dAnchor}에 연관된 전체 데이터들을 보여줍니다.`
                      }
                    </div>
                  </div>

                  <div className="fm-form-row">
                    <label>화면 배치 위치 (Placement)</label>
                    <select 
                      value={dPlacement} 
                      onChange={e => setDPlacement(e.target.value as DomainPlacement)} 
                      className="fm-anchor-select"
                    >
                      <option value="main-content">메인 컨텐츠 (중앙 작업 영역)</option>
                      <option value="left-menu">좌측 메뉴 (네비게이션/트리)</option>
                      <option value="top-tab">상단 탭 (필터/가로 탭)</option>
                      <option value="sidebar">사이드바 (우측 속성창)</option>
                    </select>
                    <div className="fm-anchor-hint">
                      {PLACEMENT_INFO[dPlacement]?.desc}
                    </div>
                  </div>

                  <div className="fm-form-row">
                    <label>데이터 표현 형태 (DataShape)</label>
                    <select 
                      value={dDataShape} 
                      onChange={e => setDDataShape(e.target.value as DomainDataShape | 'auto')} 
                      className="fm-anchor-select"
                    >
                      <option value="auto">
                        자동 추론 (추천: {(() => {
                          const curFields = editingDomainId 
                            ? (domains.find(d => d.id === editingDomainId)?.fields || [])
                            : [];
                          const inferred = inferDataShape(curFields, blueprints, dUseTree);
                          return DATA_SHAPE_INFO[inferred]?.label;
                        })()})
                      </option>
                      <option value="card">카드형 (개별 카드 형태)</option>
                      <option value="gallery">갤러리형 (이미지/미디어 그리드)</option>
                      <option value="list">목록형 (테이블/행 리스트)</option>
                      <option value="tree">트리형 (계층 분류 구조)</option>
                    </select>
                    <div className="fm-anchor-hint">
                      {dDataShape === 'auto'
                        ? '도메인 필드 구성을 분석하여 가장 적합한 UI 형태가 자동으로 적용됩니다.'
                        : DATA_SHAPE_INFO[dDataShape]?.desc
                      }
                    </div>
                  </div>

                  <div className="fm-form-actions">
                    <button className="fm-btn-cancel" onClick={resetDomainForm}>취소</button>
                    {editingDomainId && (() => {
                      const edomForDelete = domains.find(d => d.id === editingDomainId);
                      return edomForDelete ? (
                        <button
                          className="fm-btn-cancel"
                          style={{ color: '#ef4444', borderColor: '#fecaca', background: '#fff5f5', marginLeft: 'auto' }}
                          onClick={() => {
                            resetDomainForm();
                            setDeleteConfirm({ type: 'domain', id: edomForDelete.id, name: `"${edomForDelete.name}" 도메인` });
                          }}
                        >
                          <Trash2 size={14} style={{ marginRight: 4 }} />
                          삭제
                        </button>
                      ) : null;
                    })()}
                    <button className="fm-btn-create" onClick={saveDomain} disabled={!dName.trim()}>
                      <Check size={14} /> {editingDomainId ? '수정' : '생성'}
                    </button>
                  </div>
                </div>
              </div>,
              document.body
            )}

            <div className="fm-domain-list">
              {hierarchicalDomains.map(({ domain: dom, depth }) => {
                const parentList = (dom.parentIds && dom.parentIds.length > 0)
                  ? (dom.parentIds.map(id => domains.find(d => d.id === id)).filter(Boolean) as Domain[])
                  : (dom.parentId ? ([domains.find(d => d.id === dom.parentId)].filter(Boolean) as Domain[]) : []);
                const subDomains = domains.filter(d => (d.parentIds?.includes(dom.id) || d.parentId === dom.id));


                return (
                  <div 
                    key={dom.id} 
                    className={`fm-domain-card ${depth > 0 ? 'fm-subdomain-card' : ''}`}
                    onDoubleClick={e => { e.preventDefault(); e.stopPropagation(); startEditDomain(dom); }}
                    onMouseDown={e => { if (e.detail > 1) e.preventDefault(); }}
                    title="더블클릭 → 메뉴"
                    style={{ 
                      marginLeft: depth > 0 ? `${Math.min(depth * 24, 72)}px` : undefined,
                      borderLeft: depth > 0 ? '3px solid #6366f1' : undefined
                    }}
                  >
                    <div className="fm-domain-header">
                      <span 
                        className="fm-domain-name"
                        onClick={e => { e.preventDefault(); e.stopPropagation(); openDomainDataModal(dom); }}
                        title="클릭: 도메인 데이터 관리 (입력/수정/조회/삭제)"
                      >
                        {depth > 0 && <span className="fm-subdomain-arrow">↳</span>}
                        {dom.name}
                      </span>
                      <button
                        type="button"
                        className="fm-domain-fields-config-btn"
                        onClick={e => { e.preventDefault(); e.stopPropagation(); openDomainFieldsModal(dom); }}
                        title="도메인 구성 필드 설정"
                      >
                        필드설정
                      </button>
                      <span className={`fm-anchor-badge ${dom.anchor === '이름' ? 'person' : 'entity'}`}>
                        {dom.anchor === '이름' ? '카드' : dom.anchor}
                      </span>
                      <span className="fm-placement-badge" title={`화면 배치: ${PLACEMENT_INFO[resolveDomainPlacement(dom)].desc}`}>
                        {PLACEMENT_INFO[resolveDomainPlacement(dom)].label}
                      </span>
                      <span className="fm-datashape-badge" title={`표현 형태: ${DATA_SHAPE_INFO[resolveDomainDataShape(dom, blueprints)].desc}`}>
                        {DATA_SHAPE_INFO[resolveDomainDataShape(dom, blueprints)].label}
                      </span>
                      {parentList.length > 0 && (
                        <span className="fm-parent-badge" title={`상위 도메인: ${parentList.map(p => p.name).join(', ')}`}>
                          소속: {parentList.map(p => `${p.icon} ${p.name}`).join(', ')}
                        </span>
                      )}
                      {subDomains.length > 0 && (
                        <span className="fm-children-count-badge" title="하위 도메인 개수">
                          하위 {subDomains.length}개
                        </span>
                      )}

                      {dom.description && <span className="fm-domain-desc">{dom.description}</span>}
                    </div>

                    {/* 도메인 관계(Relation) 시각화 칩 바 */}
                    {(() => {
                      const domRels = getRelationsForDomain ? getRelationsForDomain(dom.id) : [];
                      if (domRels.length === 0) return null;
                      return (
                        <div className="fm-domain-relations-bar" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', margin: '4px 0 8px 0' }}>
                          {domRels.map(r => {
                            const isSource = r.sourceDomainId === dom.id;
                            const targetDom = domains.find(d => d.id === (isSource ? r.targetDomainId : r.sourceDomainId));
                            if (!targetDom) return null;
                            return (
                              <span
                                key={r.id}
                                className="fm-relation-chip"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  fontSize: '11px',
                                  background: '#f8fafc',
                                  border: '1px solid #cbd5e1',
                                  borderRadius: '4px',
                                  padding: '2px 6px',
                                  color: '#334155'
                                }}
                                title={`관계 유형: ${r.type} (${r.cardinality}) - 라벨: ${r.label || '연결'}`}
                              >
                                <span style={{ color: '#6366f1' }}>🔗</span>
                                <span>{isSource ? `↳ ${targetDom.name}` : `↰ ${targetDom.name}`}</span>
                                <span style={{ fontSize: '10px', color: '#64748b' }}>({r.cardinality})</span>
                              </span>
                            );
                          })}
                        </div>
                      );
                    })()}

                    {/* 상위 도메인 선택 목록 (해당 도메인 밑에 있는 도메인들) */}

                    {/* 사용 필드 (순서 조정 + 그리드 노드 설정) */}
                      <div className="fm-domain-fields-badge">사용 필드 {dom.fields.length}개</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}


        {/* ===== 분류트리 탭 ===== */}
        {activeTab === 'tree' && (
          <div className="fm-content">
            <div className="fm-toolbar">
              <div className="fm-toolbar-search">
                <Search size={14} />
                <input
                  type="text"
                  value={fieldSearch}
                  onChange={e => setFieldSearch(e.target.value)}
                  placeholder="트리 필드 검색..."
                  className="fm-search-input"
                />
              </div>
              <button className="fm-toolbar-add-btn" onClick={() => {
                resetFieldForm();
                setShowAddField(true);
                setFInputType('tree');
                const rootId = treeUuid();
                setFTreeData([{ id: rootId, label: '분류명', children: [] }]);
                setExpandedTreeNodes(new Set([rootId]));
                setSelectedTreeNodes(new Set([rootId]));
              }}>
                <Plus size={14} /> 추가
              </button>
            </div>
            <div className="fm-domain-list">
              {blueprints.filter(b => b.inputType === 'tree' && !['활동히스토리', '시장카테고리분류', '활동분류'].includes(b.name) && b.name.includes(fieldSearch)).length === 0 ? (
                <div className="fm-empty-state">
                  <FolderTree size={32} />
                  <p>분류트리 필드가 없습니다.</p>
                  <p className="fm-empty-sub">필드 관리 탭에서 타입을 TREE로 지정해 추가하세요.</p>
                </div>
              ) : (
                blueprints
                  .filter(b => b.inputType === 'tree' && !['활동히스토리', '시장카테고리분류', '활동분류'].includes(b.name) && b.name.includes(fieldSearch))
                  .map(bp => {
                    const nodeCount = bp.treeData ? bp.treeData.length : 0;
                    const usedInDomains = domains.filter(d => d.fields.includes(bp.name));
                    return (
                      <div
                        key={bp.id}
                        className="fm-domain-card"
                        onDoubleClick={e => { e.preventDefault(); e.stopPropagation(); startEditField(bp); }}
                        onMouseDown={e => { if (e.detail > 1) e.preventDefault(); }}
                        title="더블클릭 → 메뉴"
                      >
                        <div className="fm-domain-header">
                          <span
                            className="fm-domain-name"
                            style={{ cursor: 'pointer', textDecoration: 'underline', color: '#4f46e5' }}
                            onClick={e => { e.stopPropagation(); openTreeBuilder(bp); }}
                            title="클릭하여 트리 생성/구성"
                          >{bp.name}</span>
                          <span className="fm-anchor-badge entity">TREE</span>
                          {bp.description && <span className="fm-domain-desc">{bp.description}</span>}
                        </div>
                        <div className="fm-domain-fields-badge" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                          <span>루트 노드 {nodeCount}개 · 도메인 {usedInDomains.length}개 사용</span>
                          <button
                            type="button"
                            className="fm-btn-tree-datamodal"
                            onClick={e => { e.stopPropagation(); openDataModal(bp); }}
                            title="데이터 값 관리 (입력/수정/삭제)"
                          >
                            <Database size={11} /> 데이터 관리
                          </button>
                        </div>
                      </div>
                    );
                  })
              )}
            </div>
          </div>
        )}
        {/* 삭제 확인 모달 (어떤 앵커든 위치에서든 화면 중앙에 표시하도록 포탈로 렌더만 */}
        {deleteConfirm && typeof document !== 'undefined' && createPortal(
          <div className="fm-delete-overlay" onClick={e => e.stopPropagation()}>
            <div className="fm-delete-modal" onClick={e => e.stopPropagation()}>
              <div className="fm-delete-icon"><AlertTriangle size={24} /></div>
              <h4>삭제 확인</h4>
              <p>{deleteConfirm.name}을 정말 삭제하시겠습니까?</p>
              <p className="fm-delete-warn">이 작업은 되돌릴 수 없습니다.</p>
              <div className="fm-form-actions">
                <button className="fm-btn-cancel" onClick={() => setDeleteConfirm(null)}>취소</button>
                <button className="fm-btn-delete" onClick={executeDelete}>삭제</button>
              </div>
            </div>
          </div>,
          document.body
        )}

        {/* 필드명 클릭 시 나타나는 데이터 관리 전용 팝업 모달 (통합/격리 탭 지원) */}
        {dataModalBp && typeof document !== 'undefined' && createPortal(
          (() => {
            const bp = dataModalBp;
            const baseFieldName = bp.name.includes(':') ? bp.name.split(':').slice(1).join(':') : bp.name;

            const isComposite = bp.inputType === 'composite' && bp.parts && bp.parts.length > 0;
            const isImage = bp.inputType === 'image' || bp.inputType === 'camera' || (bp as any).format === 'image';
            const isName = isNameRelatedBp(bp) || bp.inputType === 'fullname';
            const isCalendarDate = bp.inputType === 'date' && (bp.dateParts?.includes('calendar') || bp.calendarType !== undefined || bp.name.includes('생일') || bp.name.includes('제사') || bp.name.includes('기념일'));

            // 탭 계산: domainTag 기반 + domain.localFields 기반 병합
            const allValuesWithTag = getFieldValues(bp.name); // 전체 (domainTag 포함)
            const commonVals = allValuesWithTag.filter(v => !v.domainTag);
            const domainTagsSet = new Set(allValuesWithTag.filter(v => v.domainTag).map(v => v.domainTag!));
            // domain.localFields 에 등록된 도메인도 탭으로 표시 (Atom이 아직 없어도)
            domains.forEach(d => {
              if ((d.localFields || []).includes(bp.name)) {
                domainTagsSet.add(d.name);
              }
            });
            const domainTags = Array.from(domainTagsSet); // 예: ['약속']
            const hasChildDomains = domainTags.length > 0;

            // 탭별 카운트
            const commonCount = commonVals.length;
            const domainCountMap = new Map<string, number>();
            domainTags.forEach(tag => {
              domainCountMap.set(tag, allValuesWithTag.filter(v => v.domainTag === tag).length);
            });
            const totalCount = allValuesWithTag.length;

            // 현재 탭에 따른 데이터 수집
            interface DataItemWithDomain {
              value: string;
              count: number;
              domainTag?: string | null;
              sourceField: string;
              domainName: string;
              isLocal: boolean;
              usages?: any[];
            }

            let rawVals: DataItemWithDomain[] = [];
            if (!hasChildDomains) {
              rawVals = allValuesWithTag.map(v => ({
                ...v,
                domainTag: v.domainTag ?? null,
                sourceField: bp.name,
                domainName: v.domainTag || '공용',
                isLocal: !!v.domainTag,
              }));
            } else if (dataModalScopeTab === 'common') {
              rawVals = commonVals.map(v => ({
                ...v,
                domainTag: null,
                sourceField: bp.name,
                domainName: '공용',
                isLocal: false,
              }));
            } else if (dataModalScopeTab !== 'all') {
              // 특정 도메인 탭
              rawVals = allValuesWithTag.filter(v => v.domainTag === dataModalScopeTab).map(v => ({
                ...v,
                domainTag: v.domainTag ?? null,
                sourceField: bp.name,
                domainName: dataModalScopeTab,
                isLocal: true,
              }));
            } else {
              // 'all' 전체 선택됨
              rawVals = allValuesWithTag.map(v => ({
                ...v,
                domainTag: v.domainTag ?? null,
                sourceField: bp.name,
                domainName: v.domainTag || '공용',
                isLocal: !!v.domainTag,
              }));
            }

            const filteredVals = rawVals
              .filter(v => v.value.toLowerCase().includes(dataModalSearch.toLowerCase()))
              .sort((a, b) => a.value.localeCompare(b.value, 'ko'));

            const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();
            const isDuplicateInput = Boolean(dataModalInput.trim() && rawVals.some(v => norm(v.value) === norm(dataModalInput.trim())));

            const inputPlaceholder = (() => {
              if (dataModalScopeTab !== 'all' && dataModalScopeTab !== 'common') {
                return `[${dataModalScopeTab}] 종속 새 ${baseFieldName} 데이터 값 입력`;
              }
              if (hasChildDomains && dataModalScopeTab === 'common') {
                return `새 공용 ${baseFieldName} 데이터 값 입력`;
              }
              return isName ? "새 이름 입력 (예: 홍길동)" : isCalendarDate ? `새 ${baseFieldName} 데이터 값 입력 (예: 1980-05-15)` : `새 ${baseFieldName} 데이터 값 입력`;
            })();

            const addBtnText = (() => {
              if (dataModalScopeTab !== 'all' && dataModalScopeTab !== 'common') {
                return `+ ${dataModalScopeTab}에 추가`;
              }
              if (hasChildDomains && dataModalScopeTab === 'common') {
                return '+ 공용 추가';
              }
              return '+ 추가';
            })();

            return (
              <div className="fm-data-modal-overlay" onClick={e => e.stopPropagation()}>
                <div className="fm-data-modal" onClick={e => e.stopPropagation()} style={{ width: hasChildDomains ? '640px' : '580px' }}>
                  {/* 헤더 */}
                  <div className="fm-data-modal-header">
                    <div className="fm-data-modal-title">
                      {dataModalHistory.length > 0 && (
                        <button
                          type="button"
                          className="fm-btn-modal-back"
                          onClick={handleDataModalBack}
                          title={`이전 필드(${dataModalHistory[dataModalHistory.length - 1].name})로 돌아가기`}
                        >
                          <ChevronLeft size={14} />
                          <span>{dataModalHistory[dataModalHistory.length - 1].name}</span>
                        </button>
                      )}
                      <Database size={18} />
                      <span>{baseFieldName} 데이터 관리</span>
                      <span className="fm-field-data-badge">{rawVals.length}건</span>
                    </div>
                    <button className="fm-close" onClick={closeDataModal} title="닫기"><X size={18} /></button>
                  </div>

                  {/* 바디 */}
                  <div className="fm-data-modal-body">
                    <p className="fm-field-data-desc" style={{ margin: 0, marginBottom: hasChildDomains ? '10px' : '0' }}>
                      '{baseFieldName}' 필드에 직접 입력된 데이터 값 목록입니다. 수정/삭제 시 연관된 모든 엔티티에 즉시 반영됩니다.
                    </p>

                    {/* domainTag가 있는 경우: 전체 | 공용 | 각 도메인 탭 */}
                    {hasChildDomains && (
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        marginBottom: '12px',
                        padding: '4px',
                        background: '#f1f5f9',
                        borderRadius: '10px',
                        overflowX: 'auto'
                      }}>
                        {/* 전체 탭 */}
                        <button
                          type="button"
                          onClick={() => setDataModalScopeTab('all')}
                          style={{
                            padding: '5px 12px',
                            borderRadius: '7px',
                            border: 'none',
                            background: dataModalScopeTab === 'all' ? '#ffffff' : 'transparent',
                            color: dataModalScopeTab === 'all' ? '#1e293b' : '#64748b',
                            fontWeight: dataModalScopeTab === 'all' ? 700 : 500,
                            fontSize: '12px',
                            cursor: 'pointer',
                            boxShadow: dataModalScopeTab === 'all' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          <span>전체</span>
                          <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '999px', background: '#e2e8f0', color: '#475569' }}>
                            {totalCount}
                          </span>
                        </button>

                        {/* 공용 탭 */}
                        <button
                          type="button"
                          onClick={() => setDataModalScopeTab('common')}
                          style={{
                            padding: '5px 12px',
                            borderRadius: '7px',
                            border: 'none',
                            background: dataModalScopeTab === 'common' ? '#ffffff' : 'transparent',
                            color: dataModalScopeTab === 'common' ? '#2563eb' : '#64748b',
                            fontWeight: dataModalScopeTab === 'common' ? 700 : 500,
                            fontSize: '12px',
                            cursor: 'pointer',
                            boxShadow: dataModalScopeTab === 'common' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          <Globe size={11} />
                          <span>공용</span>
                          <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '999px', background: dataModalScopeTab === 'common' ? '#dbeafe' : '#e2e8f0', color: dataModalScopeTab === 'common' ? '#1e40af' : '#475569' }}>
                            {commonCount}
                          </span>
                        </button>

                        {/* 각 도메인 탭 (domainTag 기반) */}
                        {domainTags.map(tag => {
                          const isTabActive = dataModalScopeTab === tag;
                          const cCount = domainCountMap.get(tag) || 0;
                          return (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => setDataModalScopeTab(tag)}
                              style={{
                                padding: '5px 12px',
                                borderRadius: '7px',
                                border: 'none',
                                background: isTabActive ? '#ffffff' : 'transparent',
                                color: isTabActive ? '#7c3aed' : '#64748b',
                                fontWeight: isTabActive ? 700 : 500,
                                fontSize: '12px',
                                cursor: 'pointer',
                                boxShadow: isTabActive ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                whiteSpace: 'nowrap'
                              }}
                            >
                              <Lock size={11} />
                              <span>{tag}</span>
                              <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '999px', background: isTabActive ? '#ede9fe' : '#e2e8f0', color: isTabActive ? '#6d28d9' : '#475569' }}>
                                {cCount}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* 값 직접 추가 영역 */}
                    {isComposite ? (
                      <div className="fm-composite-add-box">
                        <div className="fm-composite-add-label-row">
                          <span className="fm-composite-add-badge">복합 파트 입력</span>
                          <span className="fm-composite-add-hint">
                            {bp.parts?.length}개 파트: {bp.parts?.join(' + ')}
                          </span>
                        </div>
                        <div className="fm-composite-parts-inputs">
                          {bp.parts?.map(partName => {
                            const partBp = blueprints.find(b => b.name === partName);
                            return (
                              <div key={partName} className="fm-composite-part-field-cell">
                                <span className="fm-composite-part-name-tag">{partName}</span>
                                <input
                                  type="text"
                                  value={dataModalCompositeParts[partName] || ''}
                                  onChange={e => {
                                    const formatted = partBp
                                      ? applyAutoFormat(e.target.value, partBp.name, partBp.inputType, partBp.format, partBp.dateParts)
                                      : applyAutoFormat(e.target.value, partName, 'text');
                                    setDataModalCompositeParts(prev => ({ ...prev, [partName]: formatted }));
                                  }}
                                  onBlur={e => {
                                    const formatted = partBp
                                      ? applyNameFormatOnBlur(e.target.value, partBp.name, partBp.inputType, partBp.format)
                                      : applyNameFormatOnBlur(e.target.value, partName);
                                    if (formatted !== e.target.value) {
                                      setDataModalCompositeParts(prev => ({ ...prev, [partName]: formatted }));
                                    }
                                  }}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      handleDataModalAdd();
                                    }
                                  }}
                                  placeholder={`${partName} 입력`}
                                />
                              </div>
                            );
                          })}
                        </div>
                        <div className="fm-composite-add-actions-row">
                          <div className="fm-composite-live-preview-box">
                            <span className="fm-preview-title">조합 결과:</span>
                            <strong className="fm-preview-result">
                              {assembleComposite(bp.parts || [], bp.display || '', dataModalCompositeParts) || '(미리보기)'}
                            </strong>
                          </div>
                          <button
                            type="button"
                            className="fm-btn-add-data"
                            onClick={handleDataModalAdd}
                            disabled={!bp.parts?.some(p => dataModalCompositeParts[p]?.trim())}
                          >
                            <Plus size={14} /> {addBtnText}
                          </button>
                        </div>
                      </div>
                    ) : isImage ? (
                      <div className="fm-image-data-add-box" style={{ marginBottom: '6px' }}>
                        <ImageUploadInput
                          value={dataModalInput}
                          onChange={val => {
                            if (val) {
                              const domTag = getActiveDataModalDomainTag();
                              addFieldValue(bp.name, val, domTag === undefined ? undefined : domTag ?? undefined);
                              setDataModalInput('');
                            }
                          }}
                          fieldName={bp.name}
                          onPreviewClick={url => setPreviewImageModal({ url, title: `${bp.name} 이미지 원본` })}
                        />
                      </div>
                    ) : (
                      <div className="fm-field-data-add-wrap">
                        {isCalendarDate && (() => {
                          const isLunar = dataModalCalendarKind === 'lunar' || dataModalInput.startsWith('(음)');
                          const toggleSwitch = (targetKind?: 'solar' | 'lunar') => {
                            const nextKind = targetKind || (isLunar ? 'solar' : 'lunar');
                            setDataModalCalendarKind(nextKind);
                            const stripped = dataModalInput.replace(/^\((양|음)\)\s*/, '');
                            if (stripped) {
                              const formatted = applyAutoFormat(stripped, bp.name, bp.inputType, bp.format, bp.dateParts, nextKind);
                              setDataModalInput(`${nextKind === 'lunar' ? '(음)' : '(양)'} ${formatted}`.trim());
                            }
                          };

                          return (
                            <div className="fm-lunar-switch-wrapper">
                              <span className="fm-lunar-switch-title">구분:</span>
                              <div
                                className="fm-switch-pill-control"
                                onClick={() => toggleSwitch()}
                                title="클릭하여 양력/음력 전환"
                              >
                                <span
                                  className={`fm-switch-label ${!isLunar ? 'active-solar' : ''}`}
                                  onClick={(e) => { e.stopPropagation(); toggleSwitch('solar'); }}
                                >
                                  양력
                                </span>
                                <div className={`fm-switch-slider-track ${isLunar ? 'is-lunar' : 'is-solar'}`}>
                                  <span className="fm-switch-slider-knob" />
                                </div>
                                <span
                                  className={`fm-switch-label ${isLunar ? 'active-lunar' : ''}`}
                                  onClick={(e) => { e.stopPropagation(); toggleSwitch('lunar'); }}
                                >
                                  음력
                                </span>
                              </div>
                            </div>
                          );
                        })()}
                        <div className="fm-field-data-add-box">
                          <input
                            type="text"
                            value={dataModalInput}
                            onChange={e => {
                              const val = e.target.value;
                              if (val.startsWith('(음)')) {
                                setDataModalCalendarKind('lunar');
                              } else if (val.startsWith('(양)')) {
                                setDataModalCalendarKind('solar');
                              }
                              const formatted = applyAutoFormat(val, bp.name, bp.inputType, bp.format, bp.dateParts, dataModalCalendarKind);
                              setDataModalInput(formatted);
                            }}
                            onBlur={e => {
                              const formatted = applyNameFormatOnBlur(e.target.value, bp.name, bp.inputType, bp.format);
                              if (formatted !== e.target.value) setDataModalInput(formatted);
                            }}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                if (!isDuplicateInput) handleDataModalAdd();
                              }
                            }}
                            placeholder={inputPlaceholder}
                            className={isDuplicateInput ? 'fm-input-duplicate' : ''}
                          />
                          <button
                            type="button"
                            className="fm-btn-add-data"
                            onClick={handleDataModalAdd}
                            disabled={!dataModalInput.trim() || isDuplicateInput}
                          >
                            <Plus size={14} /> {addBtnText}
                          </button>
                        </div>
                        {isDuplicateInput && (
                          <div className="fm-duplicate-warn">이미 등록된 값입니다</div>
                        )}
                      </div>
                    )}

                    {/* 데이터 검색 필터 (데이터가 3개 이상일 때 노출) */}
                    {rawVals.length >= 3 && (
                      <div className="fm-field-data-search">
                        <Search size={14} />
                        <input
                          type="text"
                          value={dataModalSearch}
                          onChange={e => setDataModalSearch(e.target.value)}
                          placeholder="데이터 검색..."
                        />
                        {dataModalSearch && (
                          <button type="button" onClick={() => setDataModalSearch('')}><X size={12} /></button>
                        )}
                      </div>
                    )}

                    {/* 미사용 데이터 일괄 정리 배너 */}
                    {(() => {
                      const unusedItems = rawVals.filter(v => v.count === 0);
                      if (unusedItems.length === 0) return null;
                      return (
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          background: '#fff1f2',
                          border: '1px solid #fecdd3',
                          borderRadius: '8px',
                          padding: '8px 12px',
                          marginBottom: '10px',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '12px', color: '#be123c', fontWeight: 500 }}>
                              미사용 데이터: <strong>{unusedItems.length}건</strong>
                            </span>
                            <span style={{ fontSize: '11px', color: '#9f1239' }}>(어떤 엔티티에도 입력되지 않은 단독 등록값)</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm(`'${bp.name}' 필드의 미사용 데이터 ${unusedItems.length}건을 일괄 삭제하시겠습니까?`)) {
                                deleteFieldValues(bp.name, unusedItems.map(u => u.value));
                              }
                            }}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              background: '#e11d48',
                              color: '#fff',
                              border: 'none',
                              borderRadius: '6px',
                              padding: '5px 12px',
                              fontSize: '12px',
                              fontWeight: 600,
                              cursor: 'pointer',
                              boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                            }}
                            title="미사용 데이터를 한 번에 모두 삭제합니다"
                          >
                            <Trash2 size={13} />
                            미사용 {unusedItems.length}건 일괄 삭제
                          </button>
                        </div>
                      );
                    })()}

                    {/* 데이터 목록 */}
                    {filteredVals.length === 0 ? (
                      <div className="fm-field-data-empty">
                        {rawVals.length === 0
                          ? '현재 이 필드에 등록된 데이터가 없습니다. 위에서 새 값을 추가해보세요.'
                          : '검색 조건과 일치하는 데이터가 없습니다.'}
                      </div>
                    ) : (
                      <div className="fm-field-data-list" style={{ maxHeight: '360px', overflowY: 'auto' }}>
                        {filteredVals.map(item => {
                          const isItemEditing = dataModalEditing?.oldValue === item.value && dataModalEditing?.domainTag === (item as any).domainTag;
                          const linkedBp = blueprints.find(b => b.name === item.value);
                          return (
                            <div
                              key={`${item.sourceField}_${item.value}_${(item as any).domainTag ?? 'common'}`}
                              className={`fm-field-data-item ${isItemEditing ? 'editing' : ''} ${linkedBp ? 'is-field-data' : ''}`}
                              onDoubleClick={() => !isItemEditing && handleItemDoubleClick(item.value)}
                              title={linkedBp ? `더블클릭: '${item.value}' 필드 데이터 관리 열기` : `더블클릭: '${item.value}' 속성 설정 (필드데이터 생성)`}
                            >
                              {isItemEditing ? (
                                <div className="fm-field-data-item-edit">
                                  {isComposite ? (
                                    <div className="fm-composite-item-edit-wrapper">
                                      <div className="fm-composite-edit-fields-row">
                                        {bp.parts?.map(partName => {
                                          const partBp = blueprints.find(b => b.name === partName);
                                          return (
                                            <div key={partName} className="fm-composite-edit-cell">
                                              <span className="fm-composite-part-name-tag">{partName}</span>
                                              <input
                                                type="text"
                                                value={dataModalEditCompositeParts[partName] || ''}
                                                onChange={e => {
                                                  const formatted = partBp
                                                    ? applyAutoFormat(e.target.value, partBp.name, partBp.inputType, partBp.format, partBp.dateParts)
                                                    : applyAutoFormat(e.target.value, partName, 'text');
                                                  setDataModalEditCompositeParts(prev => ({ ...prev, [partName]: formatted }));
                                                }}
                                                onBlur={e => {
                                                  const formatted = partBp
                                                    ? applyNameFormatOnBlur(e.target.value, partBp.name, partBp.inputType, partBp.format)
                                                    : applyNameFormatOnBlur(e.target.value, partName);
                                                  if (formatted !== e.target.value) {
                                                    setDataModalEditCompositeParts(prev => ({ ...prev, [partName]: formatted }));
                                                  }
                                                }}
                                                onKeyDown={e => {
                                                  if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    handleDataModalSaveEdit();
                                                  } else if (e.key === 'Escape') {
                                                    setDataModalEditing(null);
                                                  }
                                                }}
                                                placeholder={partName}
                                              />
                                            </div>
                                          );
                                        })}
                                      </div>
                                      <div className="fm-composite-edit-preview-badge">
                                        <ArrowRight size={13} style={{ display: 'inline', verticalAlign: 'middle', margin: '0 4px' }} /> <strong>{assembleComposite(bp.parts || [], bp.display || '', dataModalEditCompositeParts) || '-'}</strong>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="fm-field-data-inline-edit-box">
                                      {isCalendarDate && (() => {
                                        const isLunar = dataModalEditing.currentText.startsWith('(음)');
                                        const toggleSwitch = (targetKind?: 'solar' | 'lunar') => {
                                          const nextKind = targetKind || (isLunar ? 'solar' : 'lunar');
                                          const stripped = dataModalEditing.currentText.replace(/^\((양|음)\)\s*/, '');
                                          const formatted = applyAutoFormat(stripped, bp.name, bp.inputType, bp.format, bp.dateParts, nextKind);
                                          setDataModalEditing({ ...dataModalEditing, currentText: `${nextKind === 'lunar' ? '(음)' : '(양)'} ${formatted}`.trim() });
                                        };

                                        return (
                                          <div className="fm-lunar-switch-wrapper edit">
                                            <span className="fm-lunar-switch-title">구분:</span>
                                            <div
                                              className="fm-switch-pill-control"
                                              onClick={() => toggleSwitch()}
                                              title="클릭하여 양력/음력 전환"
                                            >
                                              <span
                                                className={`fm-switch-label ${!isLunar ? 'active-solar' : ''}`}
                                                onClick={(e) => { e.stopPropagation(); toggleSwitch('solar'); }}
                                              >
                                                양력
                                              </span>
                                              <div className={`fm-switch-slider-track ${isLunar ? 'is-lunar' : 'is-solar'}`}>
                                                <span className="fm-switch-slider-knob" />
                                              </div>
                                              <span
                                                className={`fm-switch-label ${isLunar ? 'active-lunar' : ''}`}
                                                onClick={(e) => { e.stopPropagation(); toggleSwitch('lunar'); }}
                                              >
                                                음력
                                              </span>
                                            </div>
                                          </div>
                                        );
                                      })()}
                                      <input
                                        type="text"
                                        value={dataModalEditing.currentText}
                                        onChange={e => {
                                          const cal = dataModalEditing.currentText.startsWith('(음)') ? 'lunar' : 'solar';
                                          const formatted = applyAutoFormat(e.target.value, bp.name, bp.inputType, bp.format, bp.dateParts, cal);
                                          setDataModalEditing({ ...dataModalEditing, currentText: formatted });
                                        }}
                                        onBlur={e => {
                                          const formatted = applyNameFormatOnBlur(e.target.value, bp.name, bp.inputType, bp.format);
                                          if (formatted !== e.target.value) {
                                            setDataModalEditing({ ...dataModalEditing, currentText: formatted });
                                          }
                                        }}
                                        onKeyDown={e => {
                                          if (e.key === 'Enter') {
                                            e.preventDefault();
                                            handleDataModalSaveEdit();
                                          } else if (e.key === 'Escape') {
                                            setDataModalEditing(null);
                                          }
                                        }}
                                        autoFocus
                                        placeholder={isName ? "이름 입력 (예: 홍길동)" : `${bp.name} 입력`}
                                      />
                                    </div>
                                  )}
                                  <div className="fm-field-data-item-edit-btns">
                                    <button
                                      type="button"
                                      className="fm-btn-save-val"
                                      onClick={handleDataModalSaveEdit}
                                      title="저장"
                                    >
                                      <Check size={13} /> 저장
                                    </button>
                                    <button
                                      type="button"
                                      className="fm-btn-cancel-val"
                                      onClick={() => setDataModalEditing(null)}
                                      title="취소"
                                    >
                                      <X size={13} /> 취소
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <div className="fm-field-data-item-left">
                                    {(isImage || item.value.startsWith('data:image/') || item.value.startsWith('/local-images/')) ? (
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <img
                                          src={item.value}
                                          alt="미리보기"
                                          className="fm-img-thumb"
                                          onClick={() => setPreviewImageModal({ url: item.value, title: `${bp.name} 이미지 원본` })}
                                          title="클릭하여 큰 이미지 보기"
                                        />
                                        <span className="fm-field-data-val-text" style={{ fontSize: '11px', color: '#64748b' }}>이미지 (클릭 시 확대)</span>
                                      </div>
                                    ) : (
                                      <span className="fm-field-data-val-text">
                                        {item.value.startsWith('(음)') ? (
                                          <span className="fm-data-val-with-badge">
                                            <span className="fm-lunar-badge">음력</span>
                                            <span>{item.value.replace(/^\(음\)\s*/, '')}</span>
                                          </span>
                                        ) : item.value.startsWith('(양)') ? (
                                          <span className="fm-data-val-with-badge">
                                            <span className="fm-solar-badge">양력</span>
                                            <span>{item.value.replace(/^\(양\)\s*/, '')}</span>
                                          </span>
                                        ) : (
                                          item.value
                                        )}
                                      </span>
                                    )}

                                    {/* domainTag가 있는 경우: 출처 도메인 배지 표시 */}
                                    {hasChildDomains && (
                                      item.isLocal ? (
                                        <span style={{
                                          fontSize: '10px',
                                          background: '#ede9fe',
                                          color: '#7c3aed',
                                          border: '1px solid #c4b5fd',
                                          borderRadius: '4px',
                                          padding: '1px 6px',
                                          fontWeight: 700,
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '2px',
                                          marginLeft: '4px'
                                        }}>
                                          <Lock size={9} /> {item.domainName}
                                        </span>
                                      ) : (
                                        <span style={{
                                          fontSize: '10px',
                                          background: '#f1f5f9',
                                          color: '#475569',
                                          border: '1px solid #cbd5e1',
                                          borderRadius: '4px',
                                          padding: '1px 6px',
                                          fontWeight: 600,
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '2px',
                                          marginLeft: '4px'
                                        }}>
                                          <Globe size={9} /> 공용
                                        </span>
                                      )
                                    )}

                                    <span
                                      className="fm-field-data-count-badge"
                                      title={item.usages && item.usages.length > 0
                                        ? `사용처:\n${item.usages.map(u => `• [${u.domainName}] ${u.entityName}`).join('\n')}`
                                        : '현재 연결된 엔티티가 없습니다 (단독 등록값)'}
                                    >
                                      {item.count > 0 ? `${item.count}건 사용중` : '미사용'}
                                    </span>
                                    {/* 속성 뱃지: 필드데이터 vs 순수데이터 */}
                                    {linkedBp ? (
                                      <span
                                        className="fm-data-attr-pill field"
                                        title={`'${item.value}' 필드로 등록됨 (더블클릭 시 데이터관리 열기)`}
                                      >
                                        <Settings2 size={10} /> 필드데이터
                                      </span>
                                    ) : (
                                      <span
                                        className="fm-data-attr-pill pure"
                                        title="순수데이터 (속성 클릭하여 필드로 생성 가능)"
                                      >
                                        순수데이터
                                      </span>
                                    )}
                                  </div>
                                  <div className="fm-field-data-item-actions">
                                    <button
                                      type="button"
                                      className={`fm-btn-attr-val ${linkedBp ? 'has-field' : ''}`}
                                      onClick={(e) => { e.stopPropagation(); openDataAttrModal(item.value); }}
                                      title="데이터 속성 설정 (순수데이터 / 필드데이터 선택 및 필드 생성)"
                                    >
                                      <Sliders size={11} /> 속성
                                    </button>
                                    <button
                                      type="button"
                                      className="fm-btn-edit-val"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setDataModalEditing({ oldValue: item.value, currentText: item.value, domainTag: (item as any).domainTag ?? null });
                                        if (isComposite) {
                                          setDataModalEditCompositeParts(parseCompositeValue(item.value, bp.parts || [], bp.display || ''));
                                        }
                                      }}
                                      title="데이터 값 수정"
                                    >
                                      <Edit2 size={12} /> 수정
                                    </button>
                                    <button
                                      type="button"
                                      className="fm-btn-del-val"
                                      onClick={(e) => { e.stopPropagation(); handleDataModalDelete(item.value, item.count, (item as any).domainTag ?? null); }}
                                      title="데이터 값 삭제"
                                    >
                                      <Trash2 size={12} /> 삭제
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* 푸터 */}
                  <div className="fm-data-modal-footer">
                    <button className="fm-dbl-btn cancel" onClick={closeDataModal}>닫기</button>
                  </div>
                </div>
              </div>
            );
          })(),
          document.body
        )}

        {/* 데이터 항목 속성 설정 모달 (순수데이터 vs 필드데이터 선택 및 필드 생성) */}
        {dataAttrModal && typeof document !== 'undefined' && createPortal(
          (() => {
            return (
              <div className="fm-attr-modal-overlay" onClick={e => e.stopPropagation()}>
                <div className="fm-attr-modal" onClick={e => e.stopPropagation()}>
                  {/* 헤더 */}
                  <div className="fm-attr-modal-header">
                    <div className="fm-attr-modal-title">
                      <Sliders size={17} color="#7c3aed" />
                      <span>「{dataAttrModal.value}」 속성 설정</span>
                    </div>
                    <button className="fm-close" onClick={() => setDataAttrModal(null)} title="닫기"><X size={17} /></button>
                  </div>

                  {/* 바디 */}
                  <div className="fm-attr-modal-body">
                    {/* 속성 유형 선택 라디오 탭 */}
                    <div className="fm-attr-type-tabs">
                      <button
                        type="button"
                        className={`fm-attr-type-tab ${!dataAttrModal.isField ? 'active pure' : ''}`}
                        onClick={() => setDataAttrModal({ ...dataAttrModal, isField: false })}
                      >
                        <FileText size={15} />
                        <div>
                          <div className="tab-title">순수데이터</div>
                          <div className="tab-sub">단순 값으로 저장 및 관리</div>
                        </div>
                      </button>
                      <button
                        type="button"
                        className={`fm-attr-type-tab ${dataAttrModal.isField ? 'active field' : ''}`}
                        onClick={() => setDataAttrModal({ ...dataAttrModal, isField: true })}
                      >
                        <Settings2 size={15} />
                        <div>
                          <div className="tab-title">필드데이터</div>
                          <div className="tab-sub">새로운 필드(속성)로 생성/관리</div>
                        </div>
                      </button>
                    </div>

                    {/* 필드데이터 선택 시 상세 속성 설정 폼 */}
                    {dataAttrModal.isField ? (
                      <div className="fm-attr-field-settings-box">
                        <div className="fm-attr-section-badge">
                          <Tag size={13} />
                          <span>필드 속성 설정</span>
                        </div>

                        <div className="fm-attr-form-row">
                          <label>필드명</label>
                          <input
                            type="text"
                            className="fm-attr-input"
                            value={dataAttrModal.value}
                            readOnly
                            title="선택한 데이터 값이 필드명으로 지정됩니다"
                          />
                        </div>

                        <div className="fm-attr-form-row">
                          <label>입력 형식 (타입)</label>
                          <select
                            className="fm-attr-select"
                            value={dataAttrModal.inputType}
                            onChange={e => setDataAttrModal({
                              ...dataAttrModal,
                              inputType: e.target.value as Blueprint['inputType']
                            })}
                          >
                            <option value="text">일반 텍스트 (한 줄)</option>
                            <option value="textarea">상세 설명 / 긴 글 (여러 줄)</option>
                            <option value="number">숫자</option>
                            <option value="date">날짜</option>
                            <option value="image">이미지 / 사진</option>
                            <option value="select">단일 선택 (Select)</option>
                            <option value="multiselect">다중 선택 (Tags)</option>
                            <option value="tree">계층 분류 트리 (Tree)</option>
                          </select>
                        </div>

                        <div className="fm-attr-form-row">
                          <label>표시 너비</label>
                          <div className="fm-attr-width-tabs">
                            <button
                              type="button"
                              className={`fm-attr-width-btn ${dataAttrModal.displayWidth === 'half' ? 'active' : ''}`}
                              onClick={() => setDataAttrModal({ ...dataAttrModal, displayWidth: 'half' })}
                            >
                              반열 (50%)
                            </button>
                            <button
                              type="button"
                              className={`fm-attr-width-btn ${dataAttrModal.displayWidth === 'full' ? 'active' : ''}`}
                              onClick={() => setDataAttrModal({ ...dataAttrModal, displayWidth: 'full' })}
                            >
                              전열 (100%)
                            </button>
                          </div>
                        </div>

                        <div className="fm-attr-form-row">
                          <label>필드 설명 / 메모</label>
                          <input
                            type="text"
                            className="fm-attr-input"
                            value={dataAttrModal.description}
                            onChange={e => setDataAttrModal({ ...dataAttrModal, description: e.target.value })}
                            placeholder="필드에 대한 설명을 입력하세요"
                          />
                        </div>

                        <div className="fm-attr-tip">
                          💡 필드데이터로 설정하면 <strong>{dataAttrModal.value}</strong> 필드가 생성되며, 리스트에서 <strong>더블클릭</strong>하면 즉시 해당 필드의 데이터 관리 팝업이 열립니다.
                        </div>
                      </div>
                    ) : (
                      <div className="fm-attr-pure-notice">
                        <FileText size={28} color="#94a3b8" />
                        <p>
                          <strong>순수데이터</strong>는 필드로 생성되지 않고, 현재 필드({dataModalBp?.name})의 데이터 목록 값으로만 유지됩니다.
                        </p>
                        {dataAttrModal.existingBpId && (
                          <span className="fm-attr-warning">
                            ⚠️ 저장 시 기존에 등록된 '{dataAttrModal.value}' 필드 정의가 시스템에서 해제됩니다.
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 푸터 */}
                  <div className="fm-attr-modal-footer">
                    <button className="fm-dbl-btn cancel" onClick={() => setDataAttrModal(null)}>취소</button>
                    <button className="fm-dbl-btn confirm" onClick={handleSaveDataAttr}>
                      <Check size={14} style={{ marginRight: '4px' }} />
                      {dataAttrModal.isField
                        ? (dataAttrModal.existingBpId ? '필드 속성 수정' : '필드 생성 및 설정')
                        : '순수데이터로 적용'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })(),
          document.body
        )}

        {/* 도메인명 클릭 시 나타나는 구성 필드 관리 전용 팝업 모달 */}
        {domainFieldsModalDom && typeof document !== 'undefined' && createPortal(
          (() => {
            const dom = domains.find(d => d.id === domainFieldsModalDom.id) || domainFieldsModalDom;
            const currentFields = dom.fields || [];

            // 도메인에는 필드명만 고유하게 노출 (이름 기준 중복 제거)
            const seenFieldNames = new Set<string>();
            const availableBlueprints = blueprints.filter(b => {
              if (currentFields.includes(b.name)) return false;
              if (!b.name.toLowerCase().includes(domainFieldsModalSearch.toLowerCase())) return false;
              if (seenFieldNames.has(b.name)) return false;
              // 다른 도메인 전용 필드(`타도메인:필드명`) 는 이 도메인 목록에서 제외
              if (b.name.includes(':')) {
                const [bDomName] = b.name.split(':');
                if (bDomName !== dom.name) return false;
              }
              seenFieldNames.add(b.name);
              return true;
            });

            return (
              <div className="fm-data-modal-overlay" onClick={e => e.stopPropagation()}>
                <div className="fm-data-modal" onClick={e => e.stopPropagation()} style={{ width: '620px' }}>
                  {/* 헤더 */}
                  <div className="fm-data-modal-header">
                    <div className="fm-data-modal-title">
                      <FolderTree size={18} />
                      <span>{dom.name} 도메인 구성 필드 관리</span>
                      <span className="fm-field-data-badge">{currentFields.length}개 필드</span>
                    </div>
                    <button className="fm-close" onClick={closeDomainFieldsModal} title="닫기"><X size={18} /></button>
                  </div>

                  {/* 바디 */}
                  <div className="fm-data-modal-body">
                    <p className="fm-field-data-desc" style={{ margin: 0, lineHeight: 1.5 }}>
                      '{dom.name}' 도메인에 포함된 필드를 조회, 순서 변경, 삭제할 수 있습니다.<br />
                      <Globe size={11} style={{ display: 'inline', verticalAlign: 'middle' }} /> <strong>공용 필드</strong>는 모든 도메인이 공유하는 데이터 · <Lock size={11} style={{ display: 'inline', verticalAlign: 'middle' }} /> <strong>종속 필드</strong>는 이 도메인 전용 데이터
                    </p>

                    {/* 1. 현재 구성된 필드 목록 (순서 변경 및 삭제) */}
                    <div>
                      <div className="fm-domain-field-section-label" style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          <span style={{ fontWeight: 700, fontSize: '13px', color: '#334155' }}>현재 구성 필드 목록</span>
                          <span className="fm-domain-field-count" style={{ marginLeft: '6px' }}>{currentFields.length}개</span>
                        </div>
                      </div>

                      {currentFields.length === 0 ? (
                        <div className="fm-field-data-empty" style={{ padding: '24px' }}>
                          현재 도메인에 등록된 필드가 없습니다. 아래 [+ 필드 추가]에서 필드를 추가하세요.
                        </div>
                      ) : (
                        <div className="fm-domain-fields-list-box">
                          {currentFields.map((fName, idx) => {
                            const bp = blueprints.find(b => b.name === fName);
                            const isLocal = (dom.localFields || []).includes(fName);
                            return (
                              <div key={fName} className="fm-domain-field-row">
                                <div className="fm-domain-field-row-left" style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                  <span className="fm-domain-field-row-idx">{idx + 1}</span>
                                  <span className="fm-domain-field-row-name" style={{ fontWeight: 600 }}>{fName}</span>

                                  {/* 공용/종속 토글 버튼 */}
                                  <button
                                    type="button"
                                    onClick={() => handleDomainFieldToggleLocal(dom.id, fName)}
                                    title={isLocal ? `클릭 시 공용 필드로 전환` : `클릭 시 '${dom.name}' 종속 필드로 전환`}
                                    style={{
                                      border: isLocal ? '1px solid #c4b5fd' : '1px solid #cbd5e1',
                                      background: isLocal ? '#ede9fe' : '#f8fafc',
                                      color: isLocal ? '#7c3aed' : '#64748b',
                                      borderRadius: '12px',
                                      padding: '1px 7px',
                                      fontSize: '11px',
                                      fontWeight: 700,
                                      cursor: 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                      transition: 'all 0.15s ease',
                                    }}
                                  >
                                    {isLocal ? (
                                      <><Lock size={11} /><span>종속필드</span></>
                                    ) : (
                                      <><Globe size={11} /><span>공용 필드</span></>
                                    )}
                                  </button>

                                  {bp && (
                                    <span className="fm-field-type" style={{ fontSize: '10px', padding: '1px 5px' }}>
                                      {bp.inputType}
                                    </span>
                                  )}
                                  {bp?.displayWidth && (
                                    <span className="fm-field-width" style={{ fontSize: '10px', padding: '1px 5px' }}>
                                      {bp.displayWidth === 'full' ? '전체' : bp.displayWidth === 'half' ? '1/2' : bp.displayWidth}
                                    </span>
                                  )}
                                </div>
                                <div className="fm-domain-field-row-actions">
                                  {/* 위로 이동 */}
                                  <button
                                    type="button"
                                    className="fm-domain-field-row-btn"
                                    onClick={() => handleDomainFieldMove(dom.id, idx, idx - 1)}
                                    disabled={idx === 0}
                                    title="위로 이동"
                                  >
                                    ▲
                                  </button>
                                  {/* 아래로 이동 */}
                                  <button
                                    type="button"
                                    className="fm-domain-field-row-btn"
                                    onClick={() => handleDomainFieldMove(dom.id, idx, idx + 1)}
                                    disabled={idx === currentFields.length - 1}
                                    title="아래로 이동"
                                  >
                                    ▼
                                  </button>
                                  {/* 필드 삭제(제거) */}
                                  <button
                                    type="button"
                                    className="fm-domain-field-row-btn delete"
                                    onClick={() => handleDomainFieldRemove(dom.id, fName)}
                                    title={`"${fName}" 필드 제거`}
                                  >
                                    <X size={13} />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* 2. 새 필드 추가 → 독립 팝업으로 분리 */}
                  </div>

                  {/* 푸터 */}
                  <div className="fm-data-modal-footer" style={{ display: 'flex', gap: '8px', justifyContent: 'space-between' }}>
                    <button
                      className="fm-dbl-btn"
                      style={{ background: '#6366f1', color: '#fff', borderColor: '#6366f1' }}
                      onClick={() => setDomainAddFieldPopupOpen(true)}
                    >
                      + 필드 추가
                    </button>
                    <button className="fm-dbl-btn cancel" onClick={closeDomainFieldsModal}>닫기</button>
                  </div>
                </div>
              </div>
            );
          })(),
          document.body
        )}

        {/* 필드 추가 독립 팝업 */}
        {domainFieldsModalDom && domainAddFieldPopupOpen && typeof document !== 'undefined' && createPortal(
          (() => {
            const dom = domains.find(d => d.id === domainFieldsModalDom.id) || domainFieldsModalDom;
            const currentFields = dom.fields || [];
            const seenFieldNames = new Set<string>();
            const availableBlueprints = blueprints.filter(b => {
              if (currentFields.includes(b.name)) return false;
              if (!b.name.toLowerCase().includes(domainFieldsModalSearch.toLowerCase())) return false;
              if (seenFieldNames.has(b.name)) return false;
              if (b.name.includes(':')) {
                const [bDomName] = b.name.split(':');
                if (bDomName !== dom.name) return false;
              }
              seenFieldNames.add(b.name);
              return true;
            });

            return (
              <div
                className="fm-data-modal-overlay"
                onClick={e => e.stopPropagation()}
                style={{ zIndex: 1000010 }}
              >
                <div
                  className="fm-data-modal"
                  onClick={e => e.stopPropagation()}
                  style={{ width: '560px', maxWidth: '95vw' }}
                >
                  {/* 헤더 */}
                  <div className="fm-data-modal-header">
                    <div className="fm-data-modal-title">
                      <Plus size={18} />
                      <span>{dom.name} 필드 추가</span>
                      <span className="fm-field-data-badge">{availableBlueprints.length}개 선택 가능</span>
                    </div>
                    <button className="fm-close" onClick={() => { setDomainAddFieldPopupOpen(false); setDomainFieldsModalSearch(''); setDomainLocalFieldMode(false); }} title="닫기"><X size={18} /></button>
                  </div>

                  {/* 바디 */}
                  <div className="fm-data-modal-body">
                    {/* 전용 필드 토글 */}
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', cursor: 'pointer', padding: '7px 10px', background: domainLocalFieldMode ? '#ede9fe' : '#f8fafc', borderRadius: '7px', border: `1px solid ${domainLocalFieldMode ? '#c4b5fd' : '#e2e8f0'}` }}>
                      <input
                        type="checkbox"
                        checked={domainLocalFieldMode}
                        onChange={e => setDomainLocalFieldMode(e.target.checked)}
                        style={{ cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: '12px', color: domainLocalFieldMode ? '#7c3aed' : '#64748b', fontWeight: domainLocalFieldMode ? 700 : 400 }}>
                        이 도메인 종속(전용) 필드로 생성 (다른 도메인과 완전 분리)
                      </span>
                      {domainLocalFieldMode && (
                        <span style={{ fontSize: '10px', background: '#7c3aed', color: '#fff', borderRadius: '4px', padding: '1px 6px', marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                          <Lock size={10} /> 종속필드
                        </span>
                      )}
                    </label>

                    {/* 검색 / 새 필드 이름 입력 */}
                    <div className="fm-field-data-search" style={{ marginBottom: '10px' }}>
                      <Search size={14} />
                      <input
                        type="text"
                        value={domainFieldsModalSearch}
                        onChange={e => setDomainFieldsModalSearch(e.target.value)}
                        onKeyDown={e => {
                          const trimmed = domainFieldsModalSearch.trim();
                          if (e.key === 'Enter' && trimmed) {
                            const fieldName = domainLocalFieldMode ? `${dom.name}:${trimmed}` : trimmed;
                            if (!currentFields.includes(fieldName)) {
                              let bp = blueprints.find(b => b.name.toLowerCase() === fieldName.toLowerCase());
                              if (!bp) {
                                bp = createBlueprint(fieldName, [trimmed], `${trimmed} 필드${domainLocalFieldMode ? ` (${dom.name} 전용)` : ''}`, 'text', 'half');
                              }
                              handleDomainFieldAdd(dom.id, bp.name);
                              setDomainFieldsModalSearch('');
                            }
                          }
                        }}
                        placeholder={domainLocalFieldMode ? `${dom.name} 전용 필드 이름 입력 후 Enter...` : '필드 검색 또는 새 필드 이름 입력 후 Enter...'}
                        autoFocus
                      />
                      {domainFieldsModalSearch && (
                        <button type="button" onClick={() => setDomainFieldsModalSearch('')}><X size={12} /></button>
                      )}
                    </div>

                    {/* 즉시 생성/추가 버튼 */}
                    {(() => {
                      const trimmed = domainFieldsModalSearch.trim();
                      const fieldName = domainLocalFieldMode ? `${dom.name}:${trimmed}` : trimmed;
                      if (!trimmed || currentFields.includes(fieldName)) return null;
                      const isExisting = blueprints.some(b => b.name.toLowerCase() === fieldName.toLowerCase());
                      return (
                        <div style={{ marginBottom: '10px' }}>
                          <button
                            type="button"
                            onClick={() => {
                              let bp = blueprints.find(b => b.name.toLowerCase() === fieldName.toLowerCase());
                              if (!bp) {
                                bp = createBlueprint(fieldName, [trimmed], `${trimmed} 필드${domainLocalFieldMode ? ` (${dom.name} 전용)` : ''}`, 'text', 'half');
                              }
                              handleDomainFieldAdd(dom.id, bp.name);
                              setDomainFieldsModalSearch('');
                            }}
                            style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                              width: '100%', padding: '8px 12px',
                              background: domainLocalFieldMode ? '#f5f3ff' : '#f0fdf4',
                              border: `1px dashed ${domainLocalFieldMode ? '#7c3aed' : '#16a34a'}`,
                              borderRadius: '6px',
                              color: domainLocalFieldMode ? '#7c3aed' : '#15803d',
                              fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                            }}
                          >
                            <Plus size={14} />
                            <span>'{trimmed}' {domainLocalFieldMode ? `${dom.name} 전용 필드로` : (isExisting ? '필드를 현재 도메인에' : '새 필드로 생성하여 현재 도메인에')} {isExisting && !domainLocalFieldMode ? '추가' : '즉시 추가'}</span>
                          </button>
                        </div>
                      );
                    })()}

                    {/* 추가 가능한 필드 칩 목록 */}
                    <div style={{ marginBottom: '4px', fontSize: '11px', color: '#94a3b8' }}>클릭 시 즉시 도메인에 추가됩니다</div>
                    <div className="fm-domain-field-avail" style={{ maxHeight: '240px', overflowY: 'auto' }}>
                      {availableBlueprints.length === 0 ? (
                        <div style={{ padding: '16px', fontSize: '12px', color: '#94a3b8', textAlign: 'center' }}>
                          {domainFieldsModalSearch ? '일치하는 기존 필드가 없습니다. 위 버튼으로 새 필드를 생성하세요.' : '추가 가능한 모든 필드가 이미 등록되어 있습니다.'}
                        </div>
                      ) : (
                        availableBlueprints.map(b => (
                          <button
                            key={b.id}
                            type="button"
                            className="fm-domain-field-add-chip"
                            onClick={() => handleDomainFieldAdd(dom.id, b.name)}
                            title={`"${b.name}" 필드 추가`}
                          >
                            + {b.name}
                          </button>
                        ))
                      )}
                    </div>
                  </div>

                  {/* 푸터 */}
                  <div className="fm-data-modal-footer">
                    <button className="fm-dbl-btn cancel" onClick={() => { setDomainAddFieldPopupOpen(false); setDomainFieldsModalSearch(''); setDomainLocalFieldMode(false); }}>닫기</button>
                  </div>
                </div>
              </div>
            );
          })(),
          document.body
        )}

        {/* 도메인명 클릭 시 나타나는 도메인 데이터 CRUD 전용 팝업 모달 */}
        {domainDataModalDom && typeof document !== 'undefined' && createPortal(
          (() => {
            const dom = domains.find(d => d.id === domainDataModalDom.id) || domainDataModalDom;
            const currentFields = dom.fields || [];
            const visibleFields = currentFields.filter(f => !hiddenGridFields.has(f));
            const hiddenFieldList = currentFields.filter(f => hiddenGridFields.has(f));
            const domainEntities = getAtomsForDomain(dom.id);
            const filteredEntities = domainEntities.filter(ent => {
              if (!domainDataSearch.trim()) return true;
              const q = domainDataSearch.toLowerCase();
              return Object.entries(ent.data).some(([k, v]) => 
                currentFields.includes(k) && typeof v === 'string' && v.toLowerCase().includes(q)
              );
            });

            return (
              <div className="fm-data-modal-overlay" onClick={e => e.stopPropagation()}>
                <div className="fm-data-modal fm-domain-data-modal" onClick={e => e.stopPropagation()} style={{ width: '880px', maxWidth: '95vw', maxHeight: '90vh' }}>
                  {/* 헤더 */}
                  <div className="fm-data-modal-header">
                    <div className="fm-data-modal-title">
                      <Database size={18} />
                      <span>{dom.name} 데이터 관리</span>
                      <span className="fm-field-data-badge">총 {domainEntities.length}건</span>
                    </div>
                    <button className="fm-close" onClick={closeDomainDataModal} title="닫기"><X size={18} /></button>
                  </div>

                  {/* 바디 */}
                  <div className="fm-data-modal-body" style={{ gap: '14px', paddingBottom: '24px' }}>
                    {/* 1. 상단 데이터 입력/수정/삭제 폼 */}
                    <div className={`fm-domain-data-create-panel ${selectedDomainDataAnchorId ? 'is-edit-mode' : ''}`}>
                      {currentFields.length === 0 ? (
                        <div style={{ padding: '12px', fontSize: '12.5px', color: '#ef4444' }}>
                          도메인에 설정된 필드가 없습니다. 먼저 도메인에 필드를 설정해주세요.
                        </div>
                      ) : (
                        <div className="fm-domain-data-create-grid">
                          {currentFields.map(fName => {
                            const bp = blueprints.find(b => b.name === fName);
                            const isImg = isImageField(bp, fName, domainFormData[fName]);
                            const isHiddenInGrid = hiddenGridFields.has(fName);
                            const isCompositeField = bp?.inputType === 'composite' && bp?.parts && bp.parts.length > 0;
                            // 도메인 전용 필드: `도메인명:필드명` 패턴에서 레이블만 추출
                            const isLocalField = fName.includes(':') && fName.startsWith(`${dom.name}:`);
                            const displayLabel = isLocalField ? fName.split(':').slice(1).join(':') : fName;

                            // composite 필드: parts를 각각 입력 받는 그룹으로 렌더링
                            if (isCompositeField) {
                              const parts = bp!.parts!;
                              return (
                                <div key={fName} className="fm-domain-data-create-item" style={{ position: 'relative', gridColumn: 'span 2' }}>
                                  <label className="fm-domain-data-create-label">
                                    <span
                                      className={`fm-grid-col-toggle-radio ${isHiddenInGrid ? 'is-hidden' : 'is-visible'}`}
                                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleFieldGridVisibility(fName); }}
                                      title={isHiddenInGrid ? `'${fName}' 필드가 하단 그리드에서 감춰짐` : `'${fName}' 필드가 하단 그리드에 표시됨`}
                                    >
                                      <span className="fm-grid-col-toggle-radio-dot" />
                                    </span>
                                    <span className="fm-domain-field-label-text" onClick={() => toggleFieldGridVisibility(fName)}>
                                      {fName}
                                    </span>
                                    <span style={{ color: '#6366f1', marginLeft: '4px', fontSize: '10px' }}>(묶음: {parts.join(' + ')})</span>
                                    {fName === dom.anchor && <span style={{ color: '#6366f1', marginLeft: '4px', fontSize: '10px' }}>(대표)</span>}
                                    {isHiddenInGrid && <span className="fm-grid-col-hidden-badge">감춤</span>}
                                  </label>
                                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                    {parts.map(partName => {
                                      const partKey = `__composite__${fName}__${partName}`;
                                      const partBp = blueprints.find(b => b.name === partName);
                                      return (
                                        <div key={partName} style={{ flex: 1, minWidth: '100px', position: 'relative' }}>
                                          <label style={{ fontSize: '10px', color: '#94a3b8', display: 'block', marginBottom: '2px' }}>{partName}</label>
                                          <input
                                            type="text"
                                            className="fm-domain-data-create-input"
                                            value={domainFormData[partKey] || ''}
                                            onChange={e => {
                                              const newPartVal = e.target.value;
                                              setDomainFormData(prev => {
                                                const updated = { ...prev, [partKey]: newPartVal };
                                                // 조합값을 fName 키에도 업데이트
                                                const assembled = parts.map(p => updated[`__composite__${fName}__${p}`] || '').join('');
                                                updated[fName] = assembled;
                                                return updated;
                                              });
                                            }}
                                            onFocus={() => setActiveDomainFieldSuggest(partKey)}
                                            onBlur={() => setTimeout(() => setActiveDomainFieldSuggest(null), 200)}
                                            placeholder={`${partName}...`}
                                            autoComplete="off"
                                            style={{ width: '100%', boxSizing: 'border-box' }}
                                          />
                                          {/* part 자동완성 */}
                                          {activeDomainFieldSuggest === partKey && (() => {
                                            const partFieldValList = getFieldValues(partName);
                                            const currentInput = (domainFormData[partKey] || '').trim().toLowerCase();
                                            const suggestions = partFieldValList
                                              .filter(item => !currentInput || item.value.toLowerCase().includes(currentInput))
                                              .slice(0, 6);
                                            if (suggestions.length === 0) return null;
                                            return (
                                              <div className="fm-domain-field-suggest-dropdown">
                                                <div className="fm-domain-field-suggest-header">
                                                  <span>'{partName}' 자동완성 ({partFieldValList.length}건)</span>
                                                </div>
                                                {suggestions.map((item, sIdx) => (
                                                  <div
                                                    key={sIdx}
                                                    className="fm-domain-field-suggest-item"
                                                    onMouseDown={e => {
                                                      e.preventDefault();
                                                      setDomainFormData(prev => {
                                                        const updated = { ...prev, [partKey]: item.value };
                                                        const assembled = parts.map(p => updated[`__composite__${fName}__${p}`] || '').join('');
                                                        updated[fName] = assembled;
                                                        return updated;
                                                      });
                                                      setActiveDomainFieldSuggest(null);
                                                    }}
                                                  >
                                                    <span className="fm-suggest-count">{item.count}</span>
                                                  </div>
                                                ))}
                                              </div>
                                            );
                                          })()}
                                        </div>
                                      );
                                    })}
                                  </div>
                                  {/* 조합 미리보기 */}
                                  {domainFormData[fName] && (
                                    <div style={{ marginTop: '4px', fontSize: '11px', color: '#6366f1' }}>
                                      조합: <strong>{domainFormData[fName]}</strong>
                                    </div>
                                  )}
                                </div>
                              );
                            }

                            return (
                              <React.Fragment key={fName}>
                              <div className="fm-domain-data-create-item" style={{ position: 'relative' }}>
                                <label className="fm-domain-data-create-label">
                                  {/* 감춤/표시 토글 라디오 박스 */}
                                  <span
                                    className={`fm-grid-col-toggle-radio ${isHiddenInGrid ? 'is-hidden' : 'is-visible'}`}
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      toggleFieldGridVisibility(fName);
                                    }}
                                    title={isHiddenInGrid ? `'${fName}' 필드가 하단 그리드에서 감춰짐 (클릭하여 표시)` : `'${fName}' 필드가 하단 그리드에 표시됨 (클릭하여 감춤)`}
                                  >
                                    <span className="fm-grid-col-toggle-radio-dot" />
                                  </span>

                                  <span
                                    className="fm-domain-field-label-text"
                                    onClick={() => toggleFieldGridVisibility(fName)}
                                    title="클릭: 하단 그리드 표시/감춤 토글"
                                  >
                                    {displayLabel}
                                    {isLocalField && (
                                      <span style={{ fontSize: '9px', background: '#ede9fe', color: '#7c3aed', borderRadius: '4px', padding: '1px 5px', marginLeft: '4px', fontWeight: 700 }}>전용</span>
                                    )}
                                  </span>

                                  {fName === dom.anchor && <span style={{ color: '#6366f1', marginLeft: '4px', fontSize: '10px' }}>(대표)</span>}
                                  {isHiddenInGrid && (
                                    <span className="fm-grid-col-hidden-badge" title="하단 그리드에서 숨김 상태 (행 더블클릭 시 확인 가능)">
                                      감춤
                                    </span>
                                  )}
                                  {bp?.inputType === 'tel' && <span style={{ color: '#94a3b8', marginLeft: '4px', fontSize: '10px' }}>(-)</span>}
                                  {bp?.inputType === 'bizno' && <span style={{ color: '#94a3b8', marginLeft: '4px', fontSize: '10px' }}>(-)</span>}
                                  {bp?.inputType === 'number' && <span style={{ color: '#94a3b8', marginLeft: '4px', fontSize: '10px' }}>(,)</span>}
                                </label>
                                {isImg ? (
                                  <ImageUploadInput
                                    value={domainFormData[fName] || ''}
                                    onChange={val => setDomainFormData(prev => ({ ...prev, [fName]: val }))}
                                    fieldName={fName}
                                    onPreviewClick={url => setPreviewImageModal({ url, title: `${dom.name} - ${fName} 미리보기` })}
                                  />
                                ) : (
                                  <div style={{ position: 'relative', width: '100%' }}>
                                    {bp?.inputType === 'date' && (bp?.dateParts?.includes('calendar') || bp?.calendarType !== undefined) && (() => {
                                      const isLunar = (domainFormData[fName] || '').startsWith('(음)');
                                      const toggleSwitch = (targetKind?: 'solar' | 'lunar') => {
                                        const nextKind = targetKind || (isLunar ? 'solar' : 'lunar');
                                        const current = domainFormData[fName] || '';
                                        const stripped = current.replace(/^\((양|음)\)\s*/, '');
                                        const formatted = stripped ? applyAutoFormat(stripped, bp.name, bp.inputType, bp.format, bp.dateParts, nextKind) : '';
                                        setDomainFormData(prev => ({
                                          ...prev,
                                          [fName]: formatted ? `${nextKind === 'lunar' ? '(음)' : '(양)'} ${formatted}`.trim() : (nextKind === 'lunar' ? '(음) ' : '(양) ')
                                        }));
                                      };

                                      return (
                                        <div className="fm-lunar-switch-wrapper" style={{ marginBottom: '6px' }}>
                                          <span className="fm-lunar-switch-title">구분:</span>
                                          <div
                                            className="fm-switch-pill-control"
                                            onClick={() => toggleSwitch()}
                                            title="클릭하여 양력/음력 전환"
                                          >
                                            <span
                                              className={`fm-switch-label ${!isLunar ? 'active-solar' : ''}`}
                                              onClick={(e) => { e.stopPropagation(); toggleSwitch('solar'); }}
                                            >
                                              양력
                                            </span>
                                            <div className={`fm-switch-slider-track ${isLunar ? 'is-lunar' : 'is-solar'}`}>
                                              <span className="fm-switch-slider-knob" />
                                            </div>
                                            <span
                                              className={`fm-switch-label ${isLunar ? 'active-lunar' : ''}`}
                                              onClick={(e) => { e.stopPropagation(); toggleSwitch('lunar'); }}
                                            >
                                              음력
                                            </span>
                                          </div>
                                        </div>
                                      );
                                    })()}
                                    <input
                                      type="text"
                                      className="fm-domain-data-create-input"
                                      value={domainFormData[fName] || ''}
                                      onChange={e => handleDomainFieldInputChange(fName, e.target.value)}
                                      onFocus={() => setActiveDomainFieldSuggest(fName)}
                                      onBlur={() => handleDomainFieldBlur(fName)}
                                      placeholder={`${fName} 입력...`}
                                      autoComplete="off"
                                      style={{ width: '100%', boxSizing: 'border-box' }}
                                    />
                                    {/* 자동완성 드롭다운 추천 */}
                                    {activeDomainFieldSuggest === fName && (() => {
                                      const fieldValList = getFieldValues(fName);
                                      const currentInput = (domainFormData[fName] || '').trim().toLowerCase();
                                      const suggestions = fieldValList
                                        .filter(item => !currentInput || item.value.toLowerCase().includes(currentInput))
                                        .slice(0, 6);

                                      if (suggestions.length === 0) return null;

                                      return (
                                        <div className="fm-domain-field-suggest-dropdown">
                                          <div className="fm-domain-field-suggest-header">
                                            <span>'{fName}' 등록값 자동완성 ({fieldValList.length}건)</span>
                                          </div>
                                          {suggestions.map((item, sIdx) => (
                                            <div
                                              key={sIdx}
                                              className="fm-domain-field-suggest-item"
                                              onMouseDown={e => {
                                                e.preventDefault(); // onBlur 방지
                                                handleSelectDomainFieldSuggest(fName, item.value);
                                              }}
                                            >
                                              <span className="fm-suggest-text">{item.value}</span>
                                              <span className="fm-suggest-count">{item.count}</span>
                                            </div>
                                          ))}
                                        </div>
                                      );
                                    })()}
                                  </div>
                                )}
                              </div>
                              {/* extraFields: Blueprint에 정의된 추가 입력 (장소, 목적 등) */}
                              {bp?.extraFields && bp.extraFields.length > 0 && bp.extraFields.map(ef => {
                                const efKey = `${fName}__extra__${ef.id}`;
                                const efIsImg = ef.inputType === 'image';
                                const efSuggestions = getFieldValues(ef.label)
                                  .filter(item => !item.value.startsWith('data:') && !item.value.startsWith('/local-images/'));
                                return (
                                  <div key={efKey} className="fm-domain-data-create-item" style={{ position: 'relative', marginTop: '6px', borderTop: '1px solid #f1f5f9', paddingTop: '6px' }}>
                                    <label className="fm-domain-data-create-label">
                                      <span style={{ fontSize: '10px', color: '#94a3b8', marginRight: '4px' }}>↳</span>
                                      <span className="fm-domain-field-label-text">{ef.label}</span>
                                    </label>
                                    {ef.inputType === 'textarea' ? (
                                      <textarea
                                        className="fm-domain-data-create-input"
                                        value={domainFormData[efKey] || ''}
                                        onChange={e => setDomainFormData(prev => ({ ...prev, [efKey]: e.target.value }))}
                                        placeholder={`${ef.label} 입력...`}
                                        rows={2}
                                        style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical' }}
                                      />
                                    ) : (
                                      <div style={{ position: 'relative', width: '100%' }}>
                                        <input
                                          type="text"
                                          className="fm-domain-data-create-input"
                                          value={domainFormData[efKey] || ''}
                                          onChange={e => {
                                            setDomainFormData(prev => ({ ...prev, [efKey]: e.target.value }));
                                            setActiveDomainFieldSuggest(efKey);
                                          }}
                                          onFocus={() => setActiveDomainFieldSuggest(efKey)}
                                          onBlur={() => setTimeout(() => setActiveDomainFieldSuggest(null), 200)}
                                          placeholder={`${ef.label} 입력...`}
                                          autoComplete="off"
                                          style={{ width: '100%', boxSizing: 'border-box' }}
                                        />
                                        {activeDomainFieldSuggest === efKey && (() => {
                                          const currentInput = (domainFormData[efKey] || '').trim().toLowerCase();
                                          const filtered = efSuggestions
                                            .filter(item => !currentInput || item.value.toLowerCase().includes(currentInput))
                                            .slice(0, 6);
                                          if (filtered.length === 0) return null;
                                          return (
                                            <div className="fm-domain-field-suggest-dropdown">
                                              <div className="fm-domain-field-suggest-header">
                                                <span>'{ef.label}' 자동완성 ({efSuggestions.length}건)</span>
                                              </div>
                                              {filtered.map((item, sIdx) => (
                                                <div
                                                  key={sIdx}
                                                  className="fm-domain-field-suggest-item"
                                                  onMouseDown={e => {
                                                    e.preventDefault();
                                                    setDomainFormData(prev => ({ ...prev, [efKey]: item.value }));
                                                    setActiveDomainFieldSuggest(null);
                                                  }}
                                                >
                                                  <span className="fm-suggest-text">{item.value}</span>
                                                  <span className="fm-suggest-count">{item.count}</span>
                                                </div>
                                              ))}
                                            </div>
                                          );
                                        })()}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </React.Fragment>
                            );
                          })}
                        {/* 도메인에 필드가 적을 때 추가 안내 */}
                        {currentFields.length > 0 && currentFields.length < 4 && (
                          <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                              현재 {currentFields.length}개 필드 등록됨 —
                            </span>
                            <button
                              type="button"
                              onClick={() => { closeDomainDataModal(); setTimeout(() => openDomainFieldsModal(dom), 50); }}
                              style={{
                                padding: '3px 10px', fontSize: '11px', borderRadius: '12px',
                                background: '#f1f5f9', border: '1px solid #e2e8f0',
                                color: '#6366f1', cursor: 'pointer', fontWeight: 600
                              }}
                            >
                              + 필드 추가 (도메인 설정)
                            </button>
                          </div>
                        )}
                        </div>
                      )}

                      <div className="fm-domain-data-create-actions">
                        {selectedDomainDataAnchorId ? (
                          <>
                            <button
                              type="button"
                              className="fm-dbl-btn confirm"
                              onClick={() => handleSaveDomainDataForm(dom)}
                              style={{ background: '#2563eb' }}
                            >
                              <Check size={14} /> 수정 (저장)
                            </button>
                            <button
                              type="button"
                              className="fm-dbl-btn delete"
                              onClick={() => handleDeleteSelectedDomainData(dom.id, dom)}
                              style={{ background: '#ef4444', color: '#ffffff', borderColor: '#dc2626' }}
                            >
                              <Trash2 size={14} /> 삭제
                            </button>
                            <button
                              type="button"
                              className="fm-dbl-btn cancel"
                              onClick={handleClearDomainForm}
                              title="선택을 해제하고 새 데이터 입력 모드로 전환"
                            >
                              새 데이터 입력
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="fm-dbl-btn confirm"
                              onClick={() => handleSaveDomainDataForm(dom)}
                              disabled={currentFields.length === 0}
                            >
                              <Check size={14} /> 저장 (추가)
                            </button>
                            <button
                              type="button"
                              className="fm-dbl-btn cancel"
                              onClick={handleClearDomainForm}
                            >
                              초기화
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* 2. 검색 바 */}
                    <div className="fm-field-data-search">
                      <Search size={14} />
                      <input
                        type="text"
                        value={domainDataSearch}
                        onChange={e => setDomainDataSearch(e.target.value)}
                        placeholder={`등록된 ${dom.name} 데이터 내 검색...`}
                      />
                      {domainDataSearch && (
                        <button type="button" onClick={() => setDomainDataSearch('')}><X size={12} /></button>
                      )}
                    </div>

                    {/* 3. 데이터 목록 테이블 (행 클릭: 위쪽 폼에 바인딩, 더블클릭: 감춤 필드 펼쳐보기) */}
                    <div className="fm-domain-data-table-wrapper">
                      {currentFields.length === 0 ? (
                        <div className="fm-field-data-empty" style={{ padding: '36px' }}>
                          도메인에 등록된 필드가 없습니다.
                        </div>
                      ) : filteredEntities.length === 0 ? (
                        <div className="fm-field-data-empty" style={{ padding: '36px' }}>
                          {domainDataSearch ? '검색 결과와 일치하는 데이터가 없습니다.' : '등록된 데이터가 없습니다. 위쪽 폼에서 새 데이터를 등록하세요.'}
                        </div>
                      ) : (
                        <table className="fm-domain-data-table">
                          <thead>
                            <tr>
                              <th style={{ width: '45px', textAlign: 'center' }}>#</th>
                              {visibleFields.map(f => (
                                <th key={f}>
                                  {f}
                                  {f === dom.anchor && <span className="fm-domain-data-anchor-tag">대표</span>}
                                </th>
                              ))}
                              {visibleFields.length === 0 && (
                                <th style={{ color: '#94a3b8', fontStyle: 'italic', fontWeight: 500 }}>
                                  모든 필드가 감춰져 있습니다 (우측 펼침 버튼 또는 행 더블클릭 시 상세 조회)
                                </th>
                              )}
                              {hiddenFieldList.length > 0 && (
                                <th style={{ width: '38px', textAlign: 'center', padding: '0 4px' }} title="감춘 필드 펼침/접힘" />
                              )}
                            </tr>
                          </thead>
                          <tbody>
                            {filteredEntities.map((ent, idx) => {
                              const isSelected = selectedDomainDataAnchorId === ent.anchorId;
                              const isExpanded = expandedRowAnchorIds.has(ent.anchorId);

                              return (
                                <React.Fragment key={ent.anchorId}>
                                  <tr
                                    className={`fm-domain-data-clickable-row ${isSelected ? 'is-selected-record-row' : ''} ${isExpanded ? 'is-expanded-parent-row' : ''}`}
                                    onClick={() => handleSelectDomainRecord(ent)}
                                    onDoubleClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      toggleRowExpand(ent.anchorId);
                                    }}
                                    onMouseDown={(e) => {
                                      if (e.detail > 1) e.preventDefault();
                                    }}
                                    title="클릭: 상단 폼에서 수정/삭제 | 더블클릭: 감춰진 필드 펼쳐보기"
                                  >
                                    <td style={{ textAlign: 'center', color: isSelected ? '#4f46e5' : '#94a3b8', fontSize: '11.5px', fontWeight: isSelected ? 700 : 500 }}>
                                      {isSelected ? '✓ ' : ''}{idx + 1}
                                    </td>

                                    {visibleFields.map(f => {
                                      const val = ent.data[f] || '';
                                      const bp = blueprints.find(b => b.name === f);
                                      const isImg = isImageField(bp, f, val);

                                      return (
                                        <td key={f}>
                                          {isImg && val ? (
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                              <img
                                                src={val}
                                                alt={f}
                                                className="fm-img-thumb"
                                                onClick={(e) => {
                                                  e.preventDefault();
                                                  e.stopPropagation();
                                                  setPreviewImageModal({ url: val, title: `${dom.name} - ${f} 원본 이미지` });
                                                }}
                                                title="클릭하여 큰 이미지 보기"
                                              />
                                            </div>
                                          ) : (
                                            <span className={val ? 'fm-cell-value' : 'fm-cell-empty'}>
                                              {val || '-'}
                                            </span>
                                          )}
                                        </td>
                                      );
                                    })}
                                    {visibleFields.length === 0 && (
                                      <td style={{ color: '#64748b', fontSize: '12px' }}>
                                        감춘 필드 내용을 펼치세요.
                                      </td>
                                    )}

                                    {/* 감춘 필드가 있을 때 펼침/접힘 토글 아이콘 */}
                                    {hiddenFieldList.length > 0 && (
                                      <td style={{ textAlign: 'center', padding: '0 4px', width: '38px', verticalAlign: 'middle' }}>
                                        <button
                                          type="button"
                                          className={`fm-row-expand-btn ${isExpanded ? 'is-expanded' : ''}`}
                                          onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            toggleRowExpand(ent.anchorId);
                                          }}
                                          title={isExpanded ? '감춘 필드 접기' : '감춘 필드 펼치기'}
                                        >
                                          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                        </button>
                                      </td>
                                    )}
                                  </tr>

                                  {/* 펼쳐지는 감춤 필드 상세 정보 (헤더 텍스트 없이 깔끔하게 그리드만 렌더링) */}
                                  {isExpanded && (
                                    <tr className="fm-domain-expanded-row">
                                      <td colSpan={visibleFields.length + 1 + (hiddenFieldList.length > 0 ? 1 : 0)} style={{ padding: 0 }}>
                                        <div className="fm-domain-expanded-panel">
                                          {hiddenFieldList.length > 0 ? (
                                            <div className="fm-domain-expanded-grid">
                                              {hiddenFieldList.map(hfName => {
                                                const hVal = ent.data[hfName] || '';
                                                const hBp = blueprints.find(b => b.name === hfName);
                                                const isHImg = isImageField(hBp, hfName, hVal);

                                                return (
                                                  <div key={hfName} className="fm-domain-expanded-item">
                                                    <div className="fm-domain-expanded-item-name">{hfName}</div>
                                                    <div className="fm-domain-expanded-item-val">
                                                      {isHImg && hVal ? (
                                                        <img
                                                          src={hVal}
                                                          alt={hfName}
                                                          className="fm-img-thumb-lg"
                                                          onClick={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            setPreviewImageModal({ url: hVal, title: `${dom.name} - ${hfName} 원본 이미지` });
                                                          }}
                                                          title="클릭하여 큰 이미지 보기"
                                                        />
                                                      ) : (
                                                        <span>{hVal || '-'}</span>
                                                      )}
                                                    </div>
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          ) : (
                                            <div style={{ padding: '8px 12px', fontSize: '12px', color: '#64748b' }}>
                                              현재 감춰진 필드가 없습니다.
                                            </div>
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </React.Fragment>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })(),
          document.body
        )}

        {/* 이미지 썸네일 클릭 시 나타나는 큰 사이즈 이미지 팝업 모달 */}
        {previewImageModal && typeof document !== 'undefined' && createPortal(
          <div 
            className="fm-img-preview-overlay"
            onClick={() => setPreviewImageModal(null)}
          >
            <div 
              className="fm-img-preview-modal"
              onClick={e => e.stopPropagation()}
            >
              <div className="fm-img-preview-header">
                <div className="fm-img-preview-title-row">
                  <Maximize2 size={16} className="fm-img-preview-icon" />
                  <span className="fm-img-preview-title">{previewImageModal.title || '이미지 원본 보기'}</span>
                </div>
                <button
                  type="button"
                  className="fm-img-preview-close-btn"
                  onClick={() => setPreviewImageModal(null)}
                  title="닫기 (ESC)"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="fm-img-preview-body">
                <img
                  src={previewImageModal.url}
                  alt={previewImageModal.title || '원본 이미지'}
                  className="fm-img-preview-main"
                />
              </div>

              <div className="fm-img-preview-footer">
                <span className="fm-img-preview-esc-hint">배경 클릭 또는 ESC 키를 누르면 닫힙니다</span>
                <a
                  href={previewImageModal.url}
                  download="image.png"
                  className="fm-img-preview-download-link"
                  target="_blank"
                  rel="noreferrer"
                  title="이미지 파일 다운로드"
                >
                  <Download size={13} /> 원본 다운로드
                </a>
              </div>
            </div>
          </div>,
          document.body
        )}
      </div>

      {/* ── 트리 노드 필드 & 도메인 종합 연동 팝업 ── */}
      {linkingNodeId && typeof document !== 'undefined' && createPortal(
        (() => {
          const node = findTreeNode(fTreeData, linkingNodeId);
          const currentLinkedIds: string[] = node?.linkedDomainIds || (node?.linkedDomainId ? [node.linkedDomainId] : []);
          const currentLinkedFieldNames: string[] = node?.linkedFieldNames || (node?.linkedFieldName ? [node.linkedFieldName] : []);

          return (
            <div
              className="fm-node-link-overlay"
              onClick={e => e.stopPropagation()}
            >
              <div
                className="fm-node-link-modal"
                onClick={e => e.stopPropagation()}
                style={{ width: '480px' }}
              >
                {/* 헤더 */}
                <div className="fm-node-link-header">
                  <div className="fm-node-link-title">
                    <Link2 size={15} style={{ color: '#2563eb' }} />
                    <span>노드 연동 설정</span>
                    <span className="fm-node-link-node-name">「{linkingNodeLabel}」</span>
                  </div>
                  <button className="fm-close" onClick={() => setLinkingNodeId(null)}><X size={16} /></button>
                </div>

                {/* 탭 바 */}
                <div className="fm-node-link-tabs">
                  <button
                    type="button"
                    className={`fm-node-link-tab-btn ${linkingTab === 'field' ? 'active' : ''}`}
                    onClick={() => setLinkingTab('field')}
                  >
                    <Tag size={12} />
                    <span>필드 연동 & 데이터 참조 ({currentLinkedFieldNames.length})</span>
                  </button>
                  <button
                    type="button"
                    className={`fm-node-link-tab-btn ${linkingTab === 'domain' ? 'active' : ''}`}
                    onClick={() => setLinkingTab('domain')}
                  >
                    <Layers size={12} />
                    <span>도메인 연동 ({currentLinkedIds.length})</span>
                  </button>
                </div>

                {/* 1. 필드 연동 탭 */}
                {linkingTab === 'field' && (
                  <>
                    <div className="fm-node-link-desc">
                      이 노드와 연동할 필드를 선택하세요. 같은 이름의 노드라도 선택된 필드의 실데이터를 독립적으로 참조하여 연결됩니다.
                    </div>

                    {/* 필드 검색 */}
                    <div style={{ padding: '8px 12px 4px' }}>
                      <div className="fm-field-data-search">
                        <Search size={13} />
                        <input
                          type="text"
                          value={linkingFieldSearch}
                          onChange={e => setLinkingFieldSearch(e.target.value)}
                          placeholder="연동할 필드 검색..."
                        />
                        {linkingFieldSearch && (
                          <button type="button" onClick={() => setLinkingFieldSearch('')}><X size={11} /></button>
                        )}
                      </div>
                    </div>

                    {/* 필드 목록 */}
                    <div className="fm-node-link-list" style={{ maxHeight: '200px' }}>
                      {blueprints
                        .filter(b => b.inputType !== 'tree' && (!linkingFieldSearch || b.name.toLowerCase().includes(linkingFieldSearch.toLowerCase())))
                        .map(b => {
                          const isLinked = currentLinkedFieldNames.includes(b.name);
                          const values = getFieldValues(b.name);
                          return (
                            <label key={b.id} className={`fm-node-link-item${isLinked ? ' linked' : ''}`}>
                              <input
                                type="checkbox"
                                checked={isLinked}
                                onChange={() => {
                                  const newNames = isLinked
                                    ? currentLinkedFieldNames.filter(name => name !== b.name)
                                    : [...currentLinkedFieldNames, b.name];
                                  const newData = updateTreeNodeLinkedFields(fTreeData, linkingNodeId, newNames);
                                  setFTreeData(newData);
                                  saveTreeNow(newData);
                                }}
                              />
                              <Tag size={13} style={{ color: isLinked ? '#2563eb' : '#64748b', flexShrink: 0 }} />
                              <div className="fm-node-link-item-info">
                                <span className="fm-node-link-item-name">{b.name}</span>
                                <span className="fm-node-link-item-desc">
                                  {b.inputType} · 데이터 {values.length}건{b.description ? ` · ${b.description}` : ''}
                                </span>
                              </div>
                              {isLinked && <Check size={13} className="fm-node-link-check" style={{ color: '#2563eb' }} />}
                            </label>
                          );
                        })}
                    </div>

                    {/* 참조 데이터 실시간 미리보기 (핵심!) */}
                    {currentLinkedFieldNames.length > 0 && (
                      <div style={{ padding: '0 12px 8px' }}>
                        <div className="fm-node-link-data-preview">
                          <div className="fm-node-link-data-preview-title">
                            <span>연동 필드 데이터 참조 미리보기</span>
                            <span style={{ fontSize: '10px', color: '#64748b' }}>이 노드가 참조할 데이터 풀</span>
                          </div>
                          {currentLinkedFieldNames.map(fName => {
                            const values = getFieldValues(fName);
                            return (
                              <div key={fName} style={{ marginBottom: '6px' }}>
                                <div style={{ fontSize: '11px', fontWeight: 600, color: '#1e40af', marginBottom: '3px' }}>
                                  [{fName}] ({values.length}건)
                                </div>
                                {values.length === 0 ? (
                                  <span style={{ fontSize: '10.5px', color: '#94a3b8' }}>등록된 데이터가 없습니다.</span>
                                ) : (
                                  <div className="fm-node-link-data-chips">
                                    {values.slice(0, 12).map((v, idx) => (
                                      <span key={idx} className="fm-node-link-data-chip" title={`${v.value} (${v.count}건)`}>
                                        {v.value}
                                      </span>
                                    ))}
                                    {values.length > 12 && (
                                      <span style={{ fontSize: '10px', color: '#64748b', alignSelf: 'center' }}>
                                        외 {values.length - 12}개...
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* 2. 도메인 연동 탭 */}
                {linkingTab === 'domain' && (
                  <>
                    <div className="fm-node-link-desc">이 트리 노드에 연결할 도메인을 선택하세요. 복수 선택 가능합니다.</div>
                    <div className="fm-node-link-list">
                      {domains.length === 0 ? (
                        <div className="fm-node-link-empty">등록된 도메인이 없습니다.</div>
                      ) : (
                        domains.map(dom => {
                          const isLinked = currentLinkedIds.includes(dom.id);
                          return (
                            <label key={dom.id} className={`fm-node-link-item${isLinked ? ' linked' : ''}`}>
                              <input
                                type="checkbox"
                                checked={isLinked}
                                onChange={() => {
                                  const newIds = isLinked
                                    ? currentLinkedIds.filter(id => id !== dom.id)
                                    : [...currentLinkedIds, dom.id];
                                  const newData = updateTreeNodeLinkedDomains(fTreeData, linkingNodeId, newIds);
                                  setFTreeData(newData);
                                  saveTreeNow(newData);
                                }}
                              />
                              <span className="fm-node-link-item-icon">{dom.icon || '🗂'}</span>
                              <div className="fm-node-link-item-info">
                                <span className="fm-node-link-item-name">{dom.name}</span>
                                {dom.description && (
                                  <span className="fm-node-link-item-desc">{dom.description}</span>
                                )}
                              </div>
                              {isLinked && <Check size={13} className="fm-node-link-check" />}
                            </label>
                          );
                        })
                      )}
                    </div>

                    {/* 현재 연결된 도메인 요약 */}
                    {currentLinkedIds.length > 0 && (
                      <div className="fm-node-link-summary">
                        <span className="fm-node-link-summary-label">연결됨:</span>
                        {currentLinkedIds.map(id => {
                          const dom = domains.find(d => d.id === id);
                          return dom ? (
                            <span key={id} className="fm-node-link-summary-chip">
                              {dom.icon || '🗂'} {dom.name}
                              <button
                                type="button"
                                onClick={() => {
                                  const newIds = currentLinkedIds.filter(i => i !== id);
                                  const newData = updateTreeNodeLinkedDomains(fTreeData, linkingNodeId, newIds);
                                  setFTreeData(newData);
                                  saveTreeNow(newData);
                                }}
                              ><X size={9} /></button>
                            </span>
                          ) : null;
                        })}
                      </div>
                    )}
                  </>
                )}

                {/* 푸터 */}
                <div className="fm-node-link-footer">
                  <button className="fm-node-link-done-btn" onClick={() => setLinkingNodeId(null)}>
                    <Check size={13} /> 확인 / 닫기
                  </button>
                </div>
              </div>
            </div>
          );
        })(),
        document.body
      )}

      {/* 1. 노드 설정 메뉴 팝업 (링크 vs 선택 선택 모달) */}
      {nodeSettingsMenuNode && typeof document !== 'undefined' && createPortal(
        <div className="fm-node-link-overlay" onClick={e => e.stopPropagation()} style={{ zIndex: 10400 }}>
          <div
            className="fm-node-link-modal"
            onClick={e => e.stopPropagation()}
            style={{ width: '400px', padding: '0', borderRadius: '14px', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.18)' }}
          >
            {/* 헤더 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Settings size={18} style={{ color: '#2563eb' }} />
                <span style={{ fontSize: '15px', fontWeight: 700, color: '#1e293b' }}>노드 설정</span>
                <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 600 }}>「{nodeSettingsMenuNode.label}」</span>
              </div>
              <button
                type="button"
                className="fm-close"
                onClick={() => setNodeSettingsMenuNode(null)}
                title="닫기"
              >
                <X size={16} />
              </button>
            </div>

            {/* 본문: 링크와 선택 두 개의 액션 카드 */}
            <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* 링크 버튼 */}
              <button
                type="button"
                onClick={() => {
                  const nid = nodeSettingsMenuNode.id;
                  const nlbl = nodeSettingsMenuNode.label;
                  setNodeSettingsMenuNode(null);
                  setLinkingNodeId(nid);
                  setLinkingNodeLabel(nlbl);
                  setLinkingTab('field');
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                  padding: '14px 16px',
                  borderRadius: '10px',
                  border: '1.5px solid #e2e8f0',
                  background: '#ffffff',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = '#3b82f6';
                  e.currentTarget.style.background = '#eff6ff';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = '#e2e8f0';
                  e.currentTarget.style.background = '#ffffff';
                }}
              >
                <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1d4ed8', flexShrink: 0 }}>
                  <Link2 size={20} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#1e293b', marginBottom: '2px' }}>
                    🔗 링크 (필드 &amp; 도메인 연동)
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.35 }}>
                    데이터 필드 또는 도메인과 노드를 상호 연동하고 실데이터를 참조합니다.
                  </div>
                </div>
              </button>

              {/* 선택 버튼 */}
              <button
                type="button"
                onClick={() => {
                  const nid = nodeSettingsMenuNode.id;
                  const nlbl = nodeSettingsMenuNode.label;
                  setNodeSettingsMenuNode(null);
                  openNodeSelectionModal(nid, nlbl);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                  padding: '14px 16px',
                  borderRadius: '10px',
                  border: '1.5px solid #e2e8f0',
                  background: '#ffffff',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = '#8b5cf6';
                  e.currentTarget.style.background = '#f5f3ff';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = '#e2e8f0';
                  e.currentTarget.style.background = '#ffffff';
                }}
              >
                <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#ede9fe', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6d28d9', flexShrink: 0 }}>
                  <ListChecks size={20} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#1e293b', marginBottom: '2px' }}>
                    ☑️ 선택 (분류트리 항목 &amp; 선택수)
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.35 }}>
                    분류트리 항목 목록을 선택하고 선택 가능한 개수(선택수)를 설정합니다.
                  </div>
                </div>
              </button>
            </div>

            {/* 푸터 */}
            <div style={{ padding: '12px 20px', background: '#f8fafc', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="fm-btn-cancel"
                onClick={() => setNodeSettingsMenuNode(null)}
                style={{ padding: '6px 16px', fontSize: '12px' }}
              >
                닫기
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 2. 분류트리 목록 선택 & 선택수 설정 전용 팝업 모달 */}
      {nodeSelectionModal && typeof document !== 'undefined' && createPortal(
        (() => {
          // 등록된 모든 분류트리 목록 (사료분류, 필드.도메인분류, 소장품 등)
          const availableTreeBlueprints = blueprints.filter(
            b => b.inputType === 'tree' && !['활동히스토리', '시장카테고리분류', '활동분류'].includes(b.name)
          );

          const isSelected = (id: string, label: string) =>
            nodeSelectionModal.selectedIds.includes(id) || nodeSelectionModal.selectedLabels.includes(label);

          const toggleSelect = (id: string, label: string) => {
            const alreadySelected = isSelected(id, label);
            if (alreadySelected) {
              setNodeSelectionModal({
                ...nodeSelectionModal,
                selectedIds: nodeSelectionModal.selectedIds.filter(x => x !== id && x !== label),
                selectedLabels: nodeSelectionModal.selectedLabels.filter(x => x !== label),
              });
            } else {
              setNodeSelectionModal({
                ...nodeSelectionModal,
                selectedIds: [...nodeSelectionModal.selectedIds, id],
                selectedLabels: [...nodeSelectionModal.selectedLabels, label],
              });
            }
          };

          const selectAllTrees = () => {
            setNodeSelectionModal({
              ...nodeSelectionModal,
              selectedIds: availableTreeBlueprints.map(b => b.id),
              selectedLabels: availableTreeBlueprints.map(b => b.name),
            });
          };

          const clearAll = () => {
            setNodeSelectionModal({
              ...nodeSelectionModal,
              selectedIds: [],
              selectedLabels: [],
            });
          };

          const filteredTrees = availableTreeBlueprints.filter(b => {
            if (!selectionSearch) return true;
            const q = selectionSearch.toLowerCase();
            return b.name.toLowerCase().includes(q) || (b.description && b.description.toLowerCase().includes(q));
          });

          return (
            <div className="fm-node-link-overlay" onClick={e => e.stopPropagation()} style={{ zIndex: 10400 }}>
              <div
                className="fm-node-link-modal"
                onClick={e => e.stopPropagation()}
                style={{ width: '650px', maxWidth: '94vw', maxHeight: '88vh', display: 'flex', flexDirection: 'column', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 25px 30px -5px rgba(0,0,0,0.2)' }}
              >
                {/* 헤더 */}
                <div className="fm-node-link-header" style={{ padding: '16px 22px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                  <div className="fm-node-link-title" style={{ gap: '8px' }}>
                    <ListChecks size={18} style={{ color: '#7c3aed' }} />
                    <span style={{ fontSize: '15px', fontWeight: 700 }}>분류트리 선택 및 선택수 설정</span>
                    <span className="fm-node-link-node-name" style={{ color: '#6d28d9', background: '#ede9fe', padding: '2px 8px', borderRadius: '6px' }}>
                      「{nodeSelectionModal.nodeLabel}」
                    </span>
                  </div>
                  <button className="fm-close" onClick={() => setNodeSelectionModal(null)} title="닫기"><X size={16} /></button>
                </div>

                {/* 바디 스크롤 영역 */}
                <div style={{ flex: '1 1 auto', overflowY: 'auto', padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  
                  {/* 1. 선택수 입력 영역 */}
                  <div style={{ background: '#f5f3ff', border: '1.5px solid #ddd6fe', borderRadius: '10px', padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <label style={{ fontSize: '13px', fontWeight: 700, color: '#5b21b6' }}>
                        선택수 (선택 허용 개수)
                      </label>
                      <span style={{ fontSize: '11.5px', color: '#6d28d9' }}>
                        * 비워두면 제한 없이 다중 선택 가능
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                      <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                        <input
                          type="number"
                          min="1"
                          max="99"
                          value={nodeSelectionModal.maxSelect}
                          onChange={e => {
                            const val = e.target.value;
                            setNodeSelectionModal({
                              ...nodeSelectionModal,
                              maxSelect: val === '' ? '' : Math.max(1, parseInt(val) || 1)
                            });
                          }}
                          placeholder="무제한"
                          style={{
                            width: '100px',
                            padding: '7px 12px',
                            fontSize: '14px',
                            fontWeight: 700,
                            textAlign: 'center',
                            border: '1.5px solid #8b5cf6',
                            borderRadius: '8px',
                            background: '#fff',
                            color: '#4c1d95',
                            outline: 'none'
                          }}
                        />
                        <span style={{ marginLeft: '6px', fontSize: '13px', fontWeight: 600, color: '#6d28d9' }}>개</span>
                      </div>

                      {/* 빠른 선택수 버튼 */}
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {[1, 2, 3, 5].map(cnt => (
                          <button
                            key={cnt}
                            type="button"
                            onClick={() => setNodeSelectionModal({ ...nodeSelectionModal, maxSelect: cnt })}
                            style={{
                              padding: '5px 11px',
                              fontSize: '12px',
                              borderRadius: '6px',
                              border: nodeSelectionModal.maxSelect === cnt ? '1.5px solid #7c3aed' : '1px solid #cbd5e1',
                              background: nodeSelectionModal.maxSelect === cnt ? '#7c3aed' : '#ffffff',
                              color: nodeSelectionModal.maxSelect === cnt ? '#ffffff' : '#475569',
                              fontWeight: nodeSelectionModal.maxSelect === cnt ? 700 : 500,
                              cursor: 'pointer'
                            }}
                          >
                            {cnt}개
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => setNodeSelectionModal({ ...nodeSelectionModal, maxSelect: '' })}
                          style={{
                            padding: '5px 11px',
                            fontSize: '12px',
                            borderRadius: '6px',
                            border: nodeSelectionModal.maxSelect === '' ? '1.5px solid #7c3aed' : '1px solid #cbd5e1',
                            background: nodeSelectionModal.maxSelect === '' ? '#7c3aed' : '#ffffff',
                            color: nodeSelectionModal.maxSelect === '' ? '#ffffff' : '#475569',
                            fontWeight: nodeSelectionModal.maxSelect === '' ? 700 : 500,
                            cursor: 'pointer'
                          }}
                        >
                          무제한
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* 2. 현재 선택된 항목 요약 리스트 */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>
                        선택된 분류트리 / 항목 <span style={{ color: '#7c3aed' }}>({nodeSelectionModal.selectedLabels.length}개)</span>
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          type="button"
                          onClick={selectAllTrees}
                          style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#f8fafc', cursor: 'pointer', color: '#475569' }}
                        >
                          전체 트리 선택
                        </button>
                        <button
                          type="button"
                          onClick={clearAll}
                          style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#f8fafc', cursor: 'pointer', color: '#ef4444' }}
                        >
                          선택 해제
                        </button>
                      </div>
                    </div>

                    <div style={{
                      minHeight: '44px',
                      maxHeight: '110px',
                      overflowY: 'auto',
                      padding: '8px 10px',
                      background: '#f8fafc',
                      borderRadius: '8px',
                      border: '1px solid #e2e8f0',
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '6px',
                      alignItems: 'center'
                    }}>
                      {nodeSelectionModal.selectedLabels.length === 0 ? (
                        <span style={{ fontSize: '12px', color: '#94a3b8' }}>아래 분류트리 리스트(사료분류, 필드.도메인분류, 소장품 등)에서 선택해주세요.</span>
                      ) : (
                        nodeSelectionModal.selectedLabels.map((lbl, idx) => {
                          const id = nodeSelectionModal.selectedIds[idx] || lbl;
                          return (
                            <span
                              key={id || idx}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                padding: '4px 9px',
                                borderRadius: '6px',
                                background: '#ede9fe',
                                color: '#5b21b6',
                                border: '1px solid #c4b5fd',
                                fontSize: '12.5px',
                                fontWeight: 600
                              }}
                            >
                              <FolderTree size={12} color="#7c3aed" />
                              <span>{lbl}</span>
                              <X
                                size={12}
                                style={{ cursor: 'pointer', color: '#7c3aed', marginLeft: '2px' }}
                                onClick={() => toggleSelect(id, lbl)}
                              />
                            </span>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* 3. 분류트리 리스트 (사료분류, 필드.도메인분류, 소장품 등) */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>
                        분류트리 목록 (총 {availableTreeBlueprints.length}개)
                      </div>
                    </div>

                    <div className="fm-node-link-search" style={{ margin: 0 }}>
                      <Search size={14} />
                      <input
                        type="text"
                        value={selectionSearch}
                        onChange={e => setSelectionSearch(e.target.value)}
                        placeholder="분류트리 이름 또는 설명 검색..."
                        style={{ width: '100%' }}
                      />
                      {selectionSearch && <button type="button" onClick={() => setSelectionSearch('')}><X size={12} /></button>}
                    </div>

                    <div style={{
                      maxHeight: '290px',
                      overflowY: 'auto',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      background: '#ffffff',
                      padding: '6px'
                    }}>
                      {filteredTrees.length === 0 ? (
                        <div style={{ padding: '24px', textAlign: 'center', fontSize: '12px', color: '#94a3b8' }}>
                          검색 결과와 일치하는 분류트리가 없습니다.
                        </div>
                      ) : (
                        filteredTrees.map(treeBp => {
                          const checked = isSelected(treeBp.id, treeBp.name);
                          const nodeCount = treeBp.treeData ? treeBp.treeData.length : 0;
                          const isTreeExpanded = selectionExpandedTreeIds.has(treeBp.id);
                          const treeSubNodes = treeBp.treeData ? getAllNodesWithPath(treeBp.treeData) : [];

                          return (
                            <div key={treeBp.id} style={{ marginBottom: '6px' }}>
                              {/* 분류트리 자체 선택 행 */}
                              <div
                                onClick={() => toggleSelect(treeBp.id, treeBp.name)}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '12px',
                                  padding: '10px 14px',
                                  borderRadius: '8px',
                                  cursor: 'pointer',
                                  background: checked ? '#f5f3ff' : '#ffffff',
                                  border: checked ? '1.5px solid #a78bfa' : '1px solid #e2e8f0',
                                  transition: 'all 0.12s'
                                }}
                                onMouseEnter={e => {
                                  if (!checked) e.currentTarget.style.background = '#f8fafc';
                                }}
                                onMouseLeave={e => {
                                  if (!checked) e.currentTarget.style.background = '#ffffff';
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => {}}
                                  style={{ width: '17px', height: '17px', accentColor: '#7c3aed', cursor: 'pointer' }}
                                />
                                <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: checked ? '#ede9fe' : '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: checked ? '#6d28d9' : '#64748b', flexShrink: 0 }}>
                                  <FolderTree size={18} />
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                                    <span style={{ fontSize: '14.5px', fontWeight: 700, color: checked ? '#5b21b6' : '#1e293b' }}>
                                      {treeBp.name}
                                    </span>
                                    <span style={{ fontSize: '10.5px', color: '#7c3aed', background: '#ede9fe', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>
                                      분류트리
                                    </span>
                                    {nodeCount > 0 && (
                                      <span style={{ fontSize: '11px', color: '#64748b' }}>
                                        (노드 {nodeCount}개)
                                      </span>
                                    )}
                                  </div>
                                  {treeBp.description && (
                                    <div style={{ fontSize: '12px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {treeBp.description}
                                    </div>
                                  )}
                                </div>

                                {/* 하위 노드 펼치기 토글 */}
                                {treeSubNodes.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectionExpandedTreeIds(prev => {
                                        const next = new Set(prev);
                                        if (next.has(treeBp.id)) next.delete(treeBp.id);
                                        else next.add(treeBp.id);
                                        return next;
                                      });
                                    }}
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '3px',
                                      background: '#f8fafc',
                                      border: '1px solid #cbd5e1',
                                      borderRadius: '6px',
                                      padding: '4px 8px',
                                      fontSize: '11px',
                                      color: '#475569',
                                      cursor: 'pointer',
                                      fontWeight: 500
                                    }}
                                  >
                                    <span>하위 노드 ({treeSubNodes.length})</span>
                                    {isTreeExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                  </button>
                                )}
                              </div>

                              {/* 펼쳐진 하위 노드 세부 목록 */}
                              {isTreeExpanded && treeSubNodes.length > 0 && (
                                <div style={{
                                  marginLeft: '28px',
                                  marginTop: '4px',
                                  padding: '6px 10px',
                                  background: '#faf5ff',
                                  borderRadius: '8px',
                                  border: '1px dashed #d8b4fe',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '4px'
                                }}>
                                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#7c3aed', marginBottom: '2px' }}>
                                    └ 「{treeBp.name}」 세부 노드 선택:
                                  </div>
                                  {treeSubNodes.map(subNode => {
                                    const subChecked = isSelected(subNode.id, subNode.label);
                                    return (
                                      <div
                                        key={subNode.id}
                                        onClick={() => toggleSelect(subNode.id, `${treeBp.name} > ${subNode.label}`)}
                                        style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: '8px',
                                          padding: '5px 8px',
                                          borderRadius: '5px',
                                          cursor: 'pointer',
                                          background: subChecked ? '#ede9fe' : 'transparent',
                                          transition: 'background 0.1s'
                                        }}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={subChecked}
                                          onChange={() => {}}
                                          style={{ width: '14px', height: '14px', accentColor: '#7c3aed', cursor: 'pointer' }}
                                        />
                                        <span style={{ fontSize: '12px', fontWeight: subChecked ? 700 : 500, color: subChecked ? '#5b21b6' : '#334155' }}>
                                          {subNode.label}
                                        </span>
                                        <span style={{ fontSize: '10.5px', color: '#94a3b8' }}>
                                          ({subNode.fullPath})
                                        </span>
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
                  </div>

                </div>

                {/* 푸터 */}
                <div style={{ padding: '14px 22px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button
                    type="button"
                    className="fm-btn-cancel"
                    onClick={() => setNodeSelectionModal(null)}
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    className="fm-node-link-done-btn"
                    onClick={saveNodeSelectionModal}
                    style={{ background: '#7c3aed' }}
                  >
                    <Check size={14} /> 설정 저장
                  </button>
                </div>
              </div>
            </div>
          );
        })(),
        document.body
      )}
    </div>
  );
};
