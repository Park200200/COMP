import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { Domain } from '../../types';

export interface OwnerEntity {
  anchorId: string;
  data: Record<string, string>;
}

export interface SelectedOwnerInfo {
  anchorId: string;
  label: string;
  phone?: string;
  detail?: { key: string; value: string }[];
}

interface UseOwnerSelectionProps {
  ownerDomain: Domain | undefined;
  getAtomsForDomain: (domainId: string) => OwnerEntity[];
  getAllPersonData?: () => OwnerEntity[];
  ownerAnchorField: string;
  ownerNormalizedFields: string[];
}

const STORAGE_KEY = 'colib_selected_owner_id';

/**
 * 🔒 소장자 선택 및 상태 관리 전용 훅 (CRITICAL MODULE: 절대 임의 수정 금지)
 * - 소장자 진동(Flicker / 무한 핑퐁 렌더링)을 영구 방지하기 위해 캡슐화됨.
 * - 초기 마운트 시 1회만 localStorage에서 안전 복원.
 * - 선택 및 해제 시 localStorage 동기화 즉시 처리.
 * - 컴포넌트 리렌더링 시 사용자의 선택을 강제 롤백하지 않음.
 */
export function useOwnerSelection({
  ownerDomain,
  getAtomsForDomain,
  getAllPersonData,
  ownerAnchorField,
  ownerNormalizedFields,
}: UseOwnerSelectionProps) {
  // 1. 소장자 엔티티 목록 추출
  const ownerEntities = useMemo(() => {
    let list: OwnerEntity[] = [];
    if (ownerDomain) {
      list = getAtomsForDomain(ownerDomain.id);
    }
    if (list.length === 0 && getAllPersonData) {
      const allPersons = getAllPersonData();
      list = allPersons.map(p => ({
        anchorId: p.anchorId,
        data: p.data,
      }));
    }

    const isValidText = (v: string | undefined) => {
      if (!v || typeof v !== 'string') return false;
      const t = v.trim();
      return (
        t.length > 0 &&
        t.length <= 100 &&
        !t.startsWith('data:') &&
        !t.startsWith('blob:') &&
        !t.startsWith('http') &&
        !t.startsWith('__')
      );
    };

    return list.filter(e => {
      if (isValidText(e.data[ownerAnchorField])) return true;
      if (isValidText(e.data['이름'])) return true;
      const nameKey = Object.keys(e.data).find(
        k =>
          (k.includes('이름') || k.includes('성명') || k.toLowerCase().includes('name')) &&
          isValidText(e.data[k])
      );
      if (nameKey) return true;
      return Object.values(e.data).some(v => isValidText(v));
    });
  }, [ownerDomain, getAtomsForDomain, getAllPersonData, ownerAnchorField]);

  // 2. 상태 정의
  const [selectedOwner, setSelectedOwner] = useState<SelectedOwnerInfo | null>(null);
  const [ownerDetailExpanded, setOwnerDetailExpanded] = useState(false);
  const [ownerSearchQuery, setOwnerSearchQuery] = useState('');
  const [ownerSearchFocused, setOwnerSearchFocused] = useState(false);

  // 3. 엔티티 데이터로부터 안전한 라벨/전화번호/상세 정보 파싱
  const parseOwnerInfo = useCallback(
    (owner: OwnerEntity): SelectedOwnerInfo => {
      const rawAnchorVal = owner.data[ownerAnchorField];
      const labelFromAnchor =
        rawAnchorVal &&
        typeof rawAnchorVal === 'string' &&
        !rawAnchorVal.startsWith('data:') &&
        !rawAnchorVal.startsWith('blob:') &&
        rawAnchorVal.trim()
          ? rawAnchorVal.trim()
          : undefined;

      const labelFromFields = ownerNormalizedFields
        .map(f => owner.data[f])
        .find(
          v =>
            v &&
            typeof v === 'string' &&
            !v.startsWith('data:') &&
            !v.startsWith('blob:') &&
            v.trim().length > 0 &&
            v.length < 50
        );

      const label = labelFromAnchor || labelFromFields || '소장자';

      const phoneEntry = Object.entries(owner.data).find(
        ([k, v]) =>
          k !== ownerAnchorField &&
          v &&
          (k.includes('전화') || k.includes('phone') || k.includes('tel') || k.includes('Phone'))
      );

      const detail = Object.entries(owner.data)
        .filter(
          ([k, v]) =>
            k !== ownerAnchorField &&
            !k.startsWith('_') &&
            v &&
            k !== (phoneEntry?.[0] || '') &&
            v !== label
        )
        .map(([k, v]) => ({ key: k, value: v }));

      return {
        anchorId: owner.anchorId,
        label,
        phone: phoneEntry ? phoneEntry[1] : undefined,
        detail: detail.length > 0 ? detail : undefined,
      };
    },
    [ownerAnchorField, ownerNormalizedFields]
  );

  // 4. 초기 마운트 시 1회만 localStorage에서 안전하게 복원
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    if (ownerEntities.length === 0) return;
    if (selectedOwner) {
      restoredRef.current = true;
      return;
    }

    const savedOwnerId = localStorage.getItem(STORAGE_KEY);
    const matched = savedOwnerId
      ? ownerEntities.find(
          e =>
            e.anchorId === savedOwnerId ||
            e.anchorId.replace(/-이름$/, '') === savedOwnerId.replace(/-이름$/, '')
        )
      : ownerEntities[0];

    if (matched) {
      const info = parseOwnerInfo(matched);
      setSelectedOwner(info);
      restoredRef.current = true;
    }
  }, [ownerEntities, selectedOwner, parseOwnerInfo]);

  // 5. 소장자 선택 핸들러 (동기적 상태 변경 및 localStorage 저장)
  const handleSelectOwner = useCallback(
    (owner: OwnerEntity) => {
      restoredRef.current = true;
      const info = parseOwnerInfo(owner);
      setSelectedOwner(info);
      try {
        localStorage.setItem(STORAGE_KEY, owner.anchorId);
      } catch (_) {}
      setOwnerDetailExpanded(false);
      setOwnerSearchQuery('');
      setOwnerSearchFocused(false);
    },
    [parseOwnerInfo]
  );

  // 6. 소장자 선택 해제 핸들러 (동기적 리셋 및 localStorage 제거)
  const handleClearOwner = useCallback(() => {
    restoredRef.current = true;
    setSelectedOwner(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (_) {}
    setOwnerSearchQuery('');
    setOwnerDetailExpanded(false);
  }, []);

  // 7. 비정상 데이터 방어 리셋
  useEffect(() => {
    if (
      selectedOwner &&
      selectedOwner.label &&
      (selectedOwner.label.startsWith('data:') ||
        selectedOwner.label.startsWith('blob:') ||
        selectedOwner.label.length > 50)
    ) {
      handleClearOwner();
    }
  }, [selectedOwner, handleClearOwner]);

  // 8. 검색 필터링된 소장자 목록
  const filteredOwnerEntities = useMemo(() => {
    const base = ownerEntities;
    if (!ownerSearchQuery.trim()) return base;
    const normalize = (str: string) => str.replace(/[\s\-_().]/g, '').toLowerCase();
    const cleanQuery = normalize(ownerSearchQuery);
    if (!cleanQuery) return base;

    return base.filter(e => {
      const matchInField = Object.values(e.data).some(
        v =>
          typeof v === 'string' &&
          !v.startsWith('data:') &&
          !v.startsWith('blob:') &&
          (v.toLowerCase().includes(ownerSearchQuery.trim().toLowerCase()) ||
            normalize(v).includes(cleanQuery))
      );
      if (matchInField) return true;

      const name = e.data[ownerAnchorField] || e.data['이름'] || '';
      const phone =
        Object.entries(e.data).find(
          ([k, v]) => (k.includes('전화') || k.includes('phone') || k.includes('tel')) && v
        )?.[1] || '';
      return normalize(`${name} ${phone}`).includes(cleanQuery);
    });
  }, [ownerEntities, ownerSearchQuery, ownerAnchorField]);

  return {
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
  };
}
