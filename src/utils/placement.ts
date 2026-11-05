import type { Blueprint, Domain, DomainDataShape, DomainPlacement } from '../types';

/**
 * 도메인의 필드 구조를 기반으로 가장 적합한 UI 데이터 형태(dataShape)를 자동 추론
 * 
 * 규칙 (architecture-discussion.md 스펙 준수):
 * 1. useTree === true 또는 tree 타입 필드 보유 → 'tree'
 * 2. 이미지/카메라 관련 필드가 전체의 50% 이상 → 'gallery'
 * 3. 전체 필드 수 3개 이하 → 'list'
 * 4. 그 외 일반 필드 구성 → 'card'
 */
export function inferDataShape(
  fields: string[],
  blueprints: Blueprint[],
  useTree?: boolean
): DomainDataShape {
  // 1. 트리 여부 판별
  if (useTree) return 'tree';

  const bpMap = new Map<string, Blueprint>(blueprints.map(b => [b.name, b]));
  const domainBps = fields.map(f => bpMap.get(f)).filter(Boolean) as Blueprint[];

  if (domainBps.some(b => b.inputType === 'tree')) {
    return 'tree';
  }

  // 2. 이미지/미디어 필드 비율 판별
  if (domainBps.length > 0) {
    const mediaCount = domainBps.filter(b => b.inputType === 'image' || b.inputType === 'camera').length;
    if (mediaCount / domainBps.length >= 0.5) {
      return 'gallery';
    }
  }

  // 3. 필드 수 기반 목록형 판별
  if (fields.length <= 3) {
    return 'list';
  }

  // 4. 기본 형태: 카드형
  return 'card';
}

/**
 * 도메인의 최종 dataShape를 반환 (명시적으로 지정된 값이 있으면 우선 적용, 없으면 자동 추론)
 */
export function resolveDomainDataShape(
  domain: Domain,
  blueprints: Blueprint[]
): DomainDataShape {
  if (domain.dataShape) {
    return domain.dataShape;
  }
  return inferDataShape(domain.fields || [], blueprints, domain.useTree);
}

/**
 * 도메인의 최종 placement를 반환 (기본값: 'main-content')
 */
export function resolveDomainPlacement(domain: Domain): DomainPlacement {
  return domain.placement || 'main-content';
}

/**
 * Placement별 한글 메타데이터
 */
export const PLACEMENT_INFO: Record<DomainPlacement, { label: string; desc: string; icon: string }> = {
  'main-content': {
    label: '메인 컨텐츠',
    desc: '화면 중앙 핵심 작업 영역에 렌더링',
    icon: 'Layout',
  },
  'left-menu': {
    label: '좌측 메뉴',
    desc: '좌측 네비게이션/사이드 트리 형태로 렌더링',
    icon: 'Menu',
  },
  'top-tab': {
    label: '상단 탭',
    desc: '상단 수평 탭/필터 바로 렌더링',
    icon: 'Layers',
  },
  'sidebar': {
    label: '사이드바',
    desc: '우측 보조 패널 및 속성 영역에 렌더링',
    icon: 'Sidebar',
  },
};

/**
 * DataShape별 한글 메타데이터
 */
export const DATA_SHAPE_INFO: Record<DomainDataShape, { label: string; desc: string; icon: string }> = {
  'card': {
    label: '카드형',
    desc: '풍부한 속성을 가진 레코드를 개별 카드로 표현',
    icon: 'Square',
  },
  'gallery': {
    label: '갤러리형',
    desc: '대표 이미지/사진 중심의 그리드 뷰로 표현',
    icon: 'Image',
  },
  'list': {
    label: '목록형',
    desc: '간결한 핵심 정보 중심의 테이블/리스트 뷰로 표현',
    icon: 'List',
  },
  'tree': {
    label: '트리형',
    desc: '상하위 계층 분류 구조 중심으로 표현',
    icon: 'FolderTree',
  },
};
