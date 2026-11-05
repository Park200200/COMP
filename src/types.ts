export interface TreeNodeSelectionConfig {
  selectedNodeIds?: string[];
  selectedNodeLabels?: string[];
  maxSelect?: number;
}

// ===== 트리 노드 구조 =====
export interface TreeNode {
  id: string;
  label: string;
  code?: string;           // 분류 식별 코드 (예: HIST-01, ARC-1950)
  description?: string;    // 분류 설명/메모
  icon?: string;           // 노드별 커스텀 아이콘 (예: 📁, 📜, 🏛️, 🏷️ 등)
  color?: string;          // 라벨 태그 색상
  children?: TreeNode[];
  linkedDomainId?: string; // 연결된 도메인 ID (하위 호환)
  linkedDomainIds?: string[]; // 복수 연결 도메인 ID 목록
  linkedFieldId?: string; // 연결된 필드(Blueprint) ID
  linkedFieldIds?: string[]; // 복수 연결 필드 ID 목록
  linkedFieldName?: string; // 연결된 필드명
  linkedFieldNames?: string[]; // 복수 연결 필드명 목록
  selectionConfig?: TreeNodeSelectionConfig; // 노드별 선택 항목 및 선택수 설정
}

// ===== 궁극의 자료관리 — 통합 데이터 모델 =====

/**
 * Atom — 세상의 모든 자료를 담는 유일한 구조
 * 
 * - value만 있으면 → 최소 단위 자료 (잎 노드)
 * - from/to가 있으면 → 연결 (이것도 Atom이므로 다시 연결 가능)
 * - deletedAt이 있으면 → 삭제된 흔적 (이것도 자료)
 */
export interface Atom {
  id: string;
  type: string;           // Blueprint name ("이름", "전화번호", "연결", "소유", "_domainLink"...)
  value?: string;         // 최소 단위 값 (연결 Atom은 value 없을 수 있음)
  from?: string;          // 연결 출발 Atom ID
  to?: string;            // 연결 도착 Atom ID
  createdAt: number;
  deletedAt?: number;     // soft delete → 흔적 보존
  meta?: Record<string, any>;  // 확장 메타데이터
}

export interface ExtraInputField {
  id: string;
  inputType: 'text' | 'textarea' | 'tel' | 'date' | 'number' | 'composite' | 'image' | 'tree' | 'camera' | 'fullname' | 'bizno' | 'residentno' | 'file';
  label: string; // 설명라벨
}

/**
 * Blueprint — Atom 조립 레시피 (UI 표현 규칙)
 * 
 * 저장에는 관여하지 않음. 오직 "어떻게 보여줄까"만 정의.
 */
export interface Blueprint {
  id: string;
  name: string;
  synonyms: string[];
  description: string;
  parts?: string[];
  display?: string;
  inputType: 'text' | 'textarea' | 'tel' | 'date' | 'number' | 'composite' | 'image' | 'tree' | 'camera' | 'fullname' | 'bizno' | 'residentno' | 'file';
  extraFields?: ExtraInputField[]; // 추가 복수 입력 필드 설정
  treeData?: TreeNode[];  // tree 타입용 계층 데이터 정의
  dateParts?: string[];   // date 타입용 세부 구성요소 ['calendar', 'year', 'month', 'day', 'weekday', 'hour', 'minute']
  calendarType?: 'both' | 'solar' | 'lunar'; // 양력/음력 선택 ('both': 양력/음력 선택가능, 'solar': 양력 전용, 'lunar': 음력 전용)
  dateFormat?: string;    // date 타입용 포맷 문자열 (예: YYYY-MM-DD HH:mm)
  fileMode?: 'single' | 'multiple'; // 파일업로드 단수/복수 선택 ('single': 단수, 'multiple': 복수)
  multiple?: boolean;     // 다중 업로드 여부 호환 플래그
  inputGuide?: string[];
  categoryPath?: string;  // 필드분류경로 (하위 호환, 단일 경로)
  categoryPaths?: string[];  // 필드분류경로 복수 (분류트리 노드 경로 배열)
  linkedFieldNames?: string[]; // 분류트리 참조/연동 필드명 목록
  displayWidth: 'full' | 'half' | 'third' | 'thumbnail';
  format?: 'none' | 'phone' | 'bizno' | 'residentno' | 'name';  // 자동 포맷팅
  createdAt: number;
}

export type DomainPlacement = 'left-menu' | 'top-tab' | 'main-content' | 'sidebar';
export type DomainDataShape = 'gallery' | 'card' | 'list' | 'tree';

/**
 * DomainRelation — 도메인 간의 연결 관계 정의 (Domain Relation Model)
 * 
 * 1. parent-child: 상하위 계층 관계 (예: 책 -> 표지, 명함 -> 회사/학교)
 * 2. linked: 트리 분류 노드와 도메인 간의 매핑 연동
 * 3. reference: N:M 상호 참조 및 레코드 간 연결 관계
 */
export interface DomainRelation {
  id: string;
  type: 'parent-child' | 'linked' | 'reference';
  sourceDomainId: string;
  targetDomainId: string;
  cardinality: '1:1' | '1:N' | 'N:M';
  label?: string; // 관계 라벨 (예: '소속', '출신', '보유', '기록물', '참조')
  createdAt: number;
}

/**
 * Domain — 데이터를 바라보는 관점 (뷰/탭)
 * 
 * 같은 Atom 풀을 다른 필드 조합으로 보여주는 렌즈.
 * 도메인이 데이터를 소유하지 않음 — 어떤 필드를 "보여줄지"만 정의.
 */
export interface Domain {
  id: string;
  name: string;
  icon: string;
  fields: string[];           // 전체 필드 목록
  localFields?: string[];     // 이 도메인 전용 종속 필드 목록 (Blueprint 추가 생성 없이 meta.domainTag로 구분)
  gridFields?: string[];      // 그리드(테이블 컬럼) 노출 필드 (미설정 시 전체)
  anchor: string;
  excludedAnchors?: string[];
  description: string;
  useTree?: boolean;          // 트리 분류 적용 여부
  parentId?: string;          // 상위(부모) 도메인 ID (하위 호환용)
  parentIds?: string[];       // 상위(부모) 도메인 ID 목록 (복수 선택 / 다중 소속)
  placement?: DomainPlacement; // 배치 위치: 좌측메뉴 | 상단탭 | 메인컨텐츠 | 사이드바
  dataShape?: DomainDataShape; // 렌더링 형태: 갤러리 | 카드 | 리스트 | 트리
  createdAt: number;
}

// ===== v1 호환 타입 (마이그레이션용) =====
export interface DataTypeDef {
  id: string;
  name: string;
  synonyms: string[];
  description: string;
  inputType: 'text' | 'textarea' | 'tel' | 'date' | 'number' | 'image' | 'file';
  displayWidth: 'full' | 'half' | 'third' | 'thumbnail';
  createdAt: number;
}

export interface DataAtom {
  id: string;
  typeId: string;
  value: string;
  createdAt: number;
}

export interface DataLink {
  id: string;
  sourceId: string;
  targetId: string;
}
