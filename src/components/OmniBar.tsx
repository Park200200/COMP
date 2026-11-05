import React, { useState, useEffect, useRef } from 'react';
import { useDataStore } from '../store/useDataStore';
import type { DataTypeDef, DataAtom } from '../types';
import { Search, Plus, X, Keyboard, Check, MapPin } from 'lucide-react';
import { applyAutoFormat, applyNameFormatOnBlur } from '../utils/formatters';
import './OmniBar.css';

interface OmniBarProps {
  onSearchSelect: (anchorAtomId: string | null) => void;
  onOpenSettings: () => void;
  resetTrigger: number;
  onEditingChange: (isEditing: boolean) => void;
  onInputActiveChange?: (isActive: boolean) => void;
  onExecuteSearch?: () => void;
}

type Mode = 'input-type' | 'search-type' | 'search-val' | 'search-relations';

interface DropdownItem {
  id: string;
  name: string;
  type: string;
  meta: string;
  details?: { typeName: string; value: string }[];
  isSelected?: boolean;
  targetTypeId?: string;
  targetTypeName?: string;
  value?: string;
}

export const OmniBar: React.FC<OmniBarProps> = ({ onSearchSelect, onOpenSettings: _onOpenSettings, resetTrigger, onEditingChange, onInputActiveChange, onExecuteSearch }) => {
  const {
    types,
    atoms,
    searchTypes,
    searchAtoms,
    addTypeDef,
    saveInputChain,
    getNeighbors,
    getConnectedGroup,
    searchConditions,
    setSearchConditions,
    searchChain,
    setSearchChain,
    isInputMode,
    setIsInputMode,
    findTypeByNameOrSynonym
  } = useDataStore();

  const [mode, setMode] = useState<Mode>('search-type');
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  
  // 입력 체인 종류 상태: [{ typeId, typeName }]
  const [inputChain, setInputChain] = useState<{ typeId: string; typeName: string }[]>([]);
  // 각 종류별 입력 중인 값 맵 상태: { [typeId]: value }
  const [chainValues, setChainValues] = useState<Record<string, string>>({});
  // 각 종류별 입력 중인 검색 값 맵 상태: { [typeId]: value }
  const [searchValues, setSearchValues] = useState<Record<string, string>>({});

  // 추천 선택 시 표시할 연결 상세 정보 가이드 텍스트 상태
  const [activeNeighborsText, setActiveNeighborsText] = useState<string>('');

  // 상단 입력 카드에서 현재 포커싱 및 타이핑 중인 필드의 typeId
  const [focusedFieldTypeId, setFocusedFieldTypeId] = useState<string | null>(null);

  // 이번 세션에서 저장한 항목의 앵커 Atom ID 목록 (입력 카드 아래에 리스트로 표시)
  const [savedAnchorIds, setSavedAnchorIds] = useState<string[]>([]);

  // 로고 클릭을 통한 강제 리셋 트리거 감지
  useEffect(() => {
    if (resetTrigger > 0) {
      resetAll();
    }
  }, [resetTrigger]);

  // 상단 폼 카드 입력 상태 변화 감지하여 부모에 전파
  useEffect(() => {
    onEditingChange(focusedFieldTypeId !== null);
  }, [focusedFieldTypeId]);

  // 입력 카드 활성 상태(체인 필드 추가 여부) 변화 감지하여 부모에 전파
  useEffect(() => {
    onInputActiveChange?.(isInputMode && inputChain.length > 0);
  }, [isInputMode, inputChain, onInputActiveChange]);

  // 검색 조건 상태
  const [searchFilterType, setSearchFilterType] = useState<DataTypeDef | null>(null);
  const [selectedAnchorAtom, setSelectedAnchorAtom] = useState<DataAtom | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 바깥 영역 클릭 시 드롭다운 닫기
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setFocusedFieldTypeId(null);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // 모드가 변경되면 입력창 초기화 및 포커싱
  useEffect(() => {
    setInputValue('');
    setSelectedIndex(0);
    if (isOpen && mode !== 'search-val') {
      inputRef.current?.focus();
    }
  }, [mode, searchFilterType]);

  // "이름 박정훈"처럼 [필드명/동의어] [값] 패턴 분석
  const parseFieldAndValue = (input: string) => {
    const trimmed = input.trim();
    if (!trimmed.includes(' ')) return null;

    const words = trimmed.split(/\s+/);
    // 가장 긴 필드명 매칭부터 시도
    for (let i = words.length - 1; i >= 1; i--) {
      const fieldCandidate = words.slice(0, i).join(' ');
      const valCandidate = words.slice(i).join(' ');
      const matched = findTypeByNameOrSynonym(fieldCandidate);
      if (matched && valCandidate) {
        return {
          type: matched,
          fieldName: matched.name,
          value: valCandidate
        };
      }
    }
    return null;
  };

  // 자동완성 추천 필터링 데이터 계산
  const getDropdownItems = (): DropdownItem[] => {
    // 필드 포커싱 시 필터링 결과 노출
    if (focusedFieldTypeId && searchFilterType) {
      const fieldVal = isInputMode 
        ? (chainValues[focusedFieldTypeId] || '') 
        : (searchValues[focusedFieldTypeId] || '');
      const matchedAtoms = searchAtoms(fieldVal, searchFilterType.id);
      
      // 값+연결데이터 조합으로 고유성 판단 (같은 이름이라도 다른 연결이면 모두 표시)
      const seenFingerprints = new Set<string>();
      const uniqueAtoms: DataAtom[] = [];
      
      matchedAtoms.forEach(a => {
        const neighbors = getNeighbors(a.id);
        const fingerprint = `${a.value}||${neighbors.map(n => `${n.typeId}:${n.value}`).sort().join('|')}`;
        if (!seenFingerprints.has(fingerprint)) {
          seenFingerprints.add(fingerprint);
          uniqueAtoms.push(a);
        }
      });
      
      return uniqueAtoms.map(a => {
        const neighbors = getNeighbors(a.id);
        const details = neighbors.map(n => {
          const t = types.find(type => type.id === n.typeId);
          return {
            typeName: t ? t.name : '알수없음',
            value: n.value
          };
        });

        return {
          id: a.id,
          name: a.value,
          type: 'atom',
          meta: '',
          details: details.length > 0 ? details : undefined
        };
      });
    }

    if (mode === 'input-type') {
      const parsed = parseFieldAndValue(inputValue);
      if (parsed) {
        const isSelected = inputChain.some(c => c.typeId === parsed.type.id);
        return [
          {
            id: `field-val-${parsed.type.id}`,
            name: `${parsed.fieldName}: ${parsed.value}`,
            type: 'field-with-value',
            meta: `'${parsed.fieldName}' 필드에 "${parsed.value}" 입력`,
            targetTypeId: parsed.type.id,
            targetTypeName: parsed.type.name,
            value: parsed.value,
            isSelected
          }
        ];
      }

      const filteredTypes = searchTypes(inputValue);
      const items = filteredTypes.map(t => {
        const isSelected = inputChain.some(c => c.typeId === t.id);
        return {
          id: t.id,
          name: t.name,
          type: 'type',
          meta: t.synonyms.length > 1 ? `동의어: ${t.synonyms.slice(1).join(', ')}` : t.description,
          isSelected
        };
      });
      
      const exactMatch = types.some(t => t.name.toLowerCase() === inputValue.trim().toLowerCase());
      if (inputValue.trim() && !exactMatch) {
        items.push({
          id: 'new-type-create',
          name: `"${inputValue.trim()}" 종류 새로 등록하기`,
          type: 'new-type',
          meta: '기본 텍스트 서식으로 등록',
          isSelected: false
        });
      }
      return items;
    }

    if (mode === 'search-type') {
      const parsed = parseFieldAndValue(inputValue);
      if (parsed) {
        const isSelected = searchChain.some(c => c.typeId === parsed.type.id);
        return [
          {
            id: `search-field-val-${parsed.type.id}`,
            name: `${parsed.fieldName}: ${parsed.value}`,
            type: 'search-field-with-value',
            meta: `'${parsed.fieldName}' 필드에서 "${parsed.value}" 검색`,
            targetTypeId: parsed.type.id,
            targetTypeName: parsed.type.name,
            value: parsed.value,
            isSelected
          }
        ];
      }

      const filteredTypes = searchTypes(inputValue);
      return filteredTypes.map(t => {
        const isSelected = searchChain.some(c => c.typeId === t.id);
        return {
          id: t.id,
          name: t.name,
          type: 'type',
          meta: t.description,
          isSelected
        };
      });
    }

    if (mode === 'search-val' && searchFilterType) {
      const matchedAtoms = searchAtoms(inputValue, searchFilterType.id);
      const uniqueValues = new Map<string, DataAtom>();
      matchedAtoms.forEach(a => {
        if (!uniqueValues.has(a.value)) {
          uniqueValues.set(a.value, a);
        }
      });
      
      return Array.from(uniqueValues.values()).map(a => {
        const neighbors = getNeighbors(a.id);
        const details = neighbors.map(n => {
          const t = types.find(type => type.id === n.typeId);
          return {
            typeName: t ? t.name : '알수없음',
            value: n.value
          };
        });

        return {
          id: a.id,
          name: a.value,
          type: 'atom',
          meta: '',
          details: details.length > 0 ? details : undefined
        };
      });
    }

    if (mode === 'search-relations' && selectedAnchorAtom) {
      const neighbors = getNeighbors(selectedAnchorAtom.id);
      const neighborTypeIds = neighbors.map(n => n.typeId);
      
      const otherTypes = types.filter(t => t.id !== selectedAnchorAtom.typeId);
      return otherTypes.map(t => {
        const isLinked = neighborTypeIds.includes(t.id);
        const linkedVal = isLinked ? neighbors.find(n => n.typeId === t.id)?.value : '';
        return {
          id: t.id,
          name: t.name,
          type: 'relation',
          meta: isLinked ? `연결됨: ${linkedVal}` : '미연결 (추가 가능)'
        };
      });
    }

    return [];
  };

  const dropdownItems = getDropdownItems();

  // 특정 항목 선택 시 처리
  const handleSelect = (item: any) => {
    // 0. 필드명 + 값 형태 선택 처리 (예: "이름 박정훈")
    if (item.type === 'field-with-value') {
      const targetTypeId = item.targetTypeId!;
      const targetTypeName = item.targetTypeName!;
      const rawVal = item.value || '';
      const typeDef = types.find(t => t.id === targetTypeId);

      let formatted = applyAutoFormat(rawVal, targetTypeName, typeDef?.inputType || 'text');
      formatted = applyNameFormatOnBlur(formatted, targetTypeName);

      // inputChain에 필드가 없으면 추가
      setInputChain(prev => {
        if (prev.some(c => c.typeId === targetTypeId)) return prev;
        return [...prev, { typeId: targetTypeId, typeName: targetTypeName }];
      });

      // chainValues에 값 주입
      setChainValues(prev => ({
        ...prev,
        [targetTypeId]: formatted
      }));

      setInputValue('');
      setIsOpen(false);

      // 해당 입력 필드로 포커스 이동
      setTimeout(() => {
        const el = document.getElementById(`field-input-${targetTypeId}`);
        el?.focus();
      }, 50);
      return;
    }

    if (item.type === 'search-field-with-value') {
      const targetTypeId = item.targetTypeId!;
      const targetTypeName = item.targetTypeName!;
      const rawVal = item.value || '';

      setSearchChain(prev => {
        if (prev.some(c => c.typeId === targetTypeId)) return prev;
        return [...prev, { typeId: targetTypeId, typeName: targetTypeName }];
      });

      setSearchValues(prev => ({ ...prev, [targetTypeId]: rawVal }));

      // searchConditions 즉시 반영 → App.tsx anchorAtoms 필터링 자동 적용
      setSearchConditions(prev => [
        ...prev.filter(c => c.typeId !== targetTypeId),
        { typeId: targetTypeId, typeName: targetTypeName, value: rawVal }
      ]);

      setInputValue('');
      setIsOpen(false);
      // 목록 필터링 모드 (단일 카드 선택 해제)
      onSearchSelect(null);
      onExecuteSearch?.();
      return;
    }

    // A. 상단 필드 자동완성 검색 중 선택 처리
    if (focusedFieldTypeId && item.type === 'atom') {
      const selectedAtom = atoms.find(a => a.id === item.id);
      if (selectedAtom) {
        // 1. 선택된 값을 포커싱된 필드에 주입
        setChainValues(prev => ({ ...prev, [focusedFieldTypeId]: selectedAtom.value }));

        // 2. 연결된 데이터 중 같은 종류의 빈 필드에만 값 자동 채우기
        const neighbors = getNeighbors(selectedAtom.id);
        
        neighbors.forEach(n => {
          const isInChain = inputChain.some(c => c.typeId === n.typeId);
          if (isInChain) {
            setChainValues(prev => {
              // 이미 값이 있는 필드는 변경하지 않음
              const existingVal = prev[n.typeId] || '';
              if (existingVal.trim() !== '') return prev;
              // 빈 필드에만 연결 데이터 채움
              return { ...prev, [n.typeId]: n.value };
            });
          }
        });

        // 3. 연결된 모든 정보는 하단 가이드 텍스트로도 표시
        const guideText = neighbors
          .map(n => {
            const t = types.find(type => type.id === n.typeId);
            return `${t ? t.name : '알수없음'}: ${n.value}`;
          })
          .join(' | ');
        setActiveNeighborsText(guideText);
      }

      setFocusedFieldTypeId(null);
      setSearchFilterType(null);
      setInputValue('');
      setIsOpen(false);
      return;
    }

    if (mode === 'input-type') {
      let targetTypeId = item.id;
      let targetTypeName = item.name;

      if (item.id === 'new-type-create') {
        const cleanName = inputValue.trim();
        const newType = addTypeDef(cleanName, [], `${cleanName} 정의`, 'text', 'half');
        targetTypeId = newType.id;
        targetTypeName = newType.name;
      }

      const exists = inputChain.some(c => c.typeId === targetTypeId);
      if (exists) {
        // 이미 선택된 항목을 재선택 시 해제(삭제) 처리
        handleChipRemove(targetTypeId);
      } else {
        // 새로 선택 시 추가
        setInputChain(prev => [...prev, { typeId: targetTypeId, typeName: targetTypeName }]);
        setChainValues(prev => ({ ...prev, [targetTypeId]: '' }));
      }
      
      setInputValue('');
      setIsOpen(false);
      return;
    }

    if (mode === 'search-type') {
      const targetType = types.find(t => t.id === item.id);
      if (targetType) {
        const exists = searchChain.some(c => c.typeId === targetType.id);
        if (exists) {
          // 이미 선택된 항목을 재선택 시 해제(삭제) 처리
          handleSearchChipRemove(targetType.id);
        } else {
          // 새로 선택 시 추가
          setSearchChain(prev => [...prev, { typeId: targetType.id, typeName: targetType.name }]);
          setSearchValues(prev => ({ ...prev, [targetType.id]: '' }));
        }
        setInputValue('');
        setIsOpen(false);
      }
      return;
    }

    if (mode === 'search-val' && searchFilterType) {
      const valToAdd = item.name;
      
      if (isInputMode) {
        // 입력 모드 처리
      } else {
        // 검색 모드 처리
        if (focusedFieldTypeId) {
          setSearchValues(prev => {
            const updated = { ...prev, [focusedFieldTypeId]: valToAdd };
            
            // 변경된 검색 값들을 바탕으로 searchConditions 빌드 및 실시간 필터링 반영
            const newConds = searchChain
              .map(sc => ({
                typeId: sc.typeId,
                typeName: sc.typeName,
                value: sc.typeId === focusedFieldTypeId ? valToAdd : (updated[sc.typeId] || '')
              }))
              .filter(cond => cond.value.trim() !== '');
            setSearchConditions(newConds);
            
            return updated;
          });
          
          setFocusedFieldTypeId(null);
          setSearchFilterType(null);
          setMode('search-type');
          setInputValue('');
          setIsOpen(false);
          
          // 매칭된 프로필 리스트 갱신 실행
          setTimeout(() => handleExecuteSearch(), 50);
        }
      }
      return;
    }
  };

  // 검색 돋보기 실행 핸들러
  const handleExecuteSearch = () => {
    onExecuteSearch?.();
    // 드롭다운 리스트 닫기
    setIsOpen(false);
    setFocusedFieldTypeId(null);
    setSearchFilterType(null);

    // 검색 조건이 있으면 목록 필터링 모드 (단일 선택 X)
    // searchConditions는 store에서 관리 → App.tsx의 anchorAtoms 필터링에 반영됨
    // onSearchSelect(null)로 단일 카드 선택 해제하여 목록 뷰에서 필터 결과 표시
    onSearchSelect(null);

    // 입력 필드 포커스 해제
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  };

  // 검색 모드 종류 칩 삭제 핸들러
  const handleSearchChipRemove = (typeId: string) => {
    setSearchChain(prev => prev.filter(item => item.typeId !== typeId));
    setSearchValues(prev => {
      const copy = { ...prev };
      delete copy[typeId];
      
      const newConds = searchChain
        .filter(sc => sc.typeId !== typeId)
        .map(sc => ({
          typeId: sc.typeId,
          typeName: sc.typeName,
          value: copy[sc.typeId] || ''
        }))
        .filter(cond => cond.value.trim() !== '');
      setSearchConditions(newConds);
      
      return copy;
    });
    if (focusedFieldTypeId === typeId) {
      setFocusedFieldTypeId(null);
      setSearchFilterType(null);
      setMode('search-type');
      setIsOpen(false);
    }
    inputRef.current?.focus();
    
    // 칩 삭제 시 매칭된 프로필 리스트 갱신 실행
    setTimeout(() => {
      const activeConds = searchChain
        .filter(sc => sc.typeId !== typeId)
        .map(sc => ({
          typeId: sc.typeId,
          typeName: sc.typeName,
          value: searchValues[sc.typeId] || ''
        }))
        .filter(cond => cond.value.trim() !== '');
        
      const nameType = types.find(t => t.name === '이름');
      const matchedAnchor = atoms.find(a => {
        if (a.typeId !== nameType?.id) return false;
        const neighbors = getNeighbors(a.id);
        const group = [a, ...neighbors];
        return activeConds.every(cond => 
          group.some(atom => atom.typeId === cond.typeId && atom.value.toLowerCase().includes(cond.value.toLowerCase()))
        );
      });
      
      if (matchedAnchor) {
        onSearchSelect(matchedAnchor.id);
      } else {
        onSearchSelect(null);
      }
    }, 50);
  };

  // 상단 동적 카드 즉시 저장 실행
  const handleSaveChain = () => {
    // 1. 적어도 하나의 값이 작성되었는지 검사
    const hasVal = Object.values(chainValues).some(val => val.trim() !== '');
    if (!hasVal) {
      return;
    }

    // 2. 현재 입력된 값들만 추려서 체인 빌딩
    const chainData = inputChain
      .map(item => ({
        typeId: item.typeId,
        value: chainValues[item.typeId] || ''
      }))
      .filter(item => item.value.trim() !== '');

    if (chainData.length > 0) {
      const anchorId = saveInputChain(chainData);
      if (anchorId) {
        // 성공 시: 필드 구조는 유지하고 값만 클리어 (연속 입력 가능)
        const clearedValues: Record<string, string> = {};
        inputChain.forEach(item => { clearedValues[item.typeId] = ''; });
        setChainValues(clearedValues);
        setActiveNeighborsText('');
        setIsOpen(false);
        setFocusedFieldTypeId(null);
        setSearchFilterType(null);
        setMode('input-type');
        // 저장된 항목 리스트에 추가
        setSavedAnchorIds(prev => [anchorId, ...prev]);
        
        // 첫 번째 입력 필드에 포커스
        if (inputChain.length > 0) {
          setTimeout(() => {
            const firstFieldId = `field-${inputChain[0].typeId}`;
            const firstField = document.getElementById(firstFieldId) as HTMLInputElement | null;
            if (firstField) {
              firstField.focus();
            }
          }, 50);
        }
      }
    }
  };



  // 키보드 핸들러
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.shiftKey && e.key === 'Enter') {
      e.preventDefault();
      if (isInputMode && inputChain.length > 0) {
        handleSaveChain();
      }
      return;
    }

    if (e.key === 'Backspace' && inputValue === '') {
      if (mode === 'input-type' && inputChain.length > 0) {
        e.preventDefault();
        const removedItem = inputChain[inputChain.length - 1];
        setInputChain(prev => prev.slice(0, -1));
        setChainValues(prev => {
          const copy = { ...prev };
          delete copy[removedItem.typeId];
          return copy;
        });
      } else if (mode === 'search-val') {
        e.preventDefault();
        setSearchFilterType(null);
        setMode('search-type');
      } else if (mode === 'search-relations') {
        e.preventDefault();
        setSelectedAnchorAtom(null);
        onSearchSelect(null);
        setMode('search-type');
      }
      return;
    }

    // 한글 IME 조합 중복 엔터 방지
    if (e.nativeEvent.isComposing) return;

    // 방향키 및 ESC 처리
    if (isOpen && dropdownItems.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % dropdownItems.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + dropdownItems.length) % dropdownItems.length);
        return;
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
        setFocusedFieldTypeId(null);
        return;
      }
    }

    // Enter 키 통합 처리
    if (e.key === 'Enter') {
      e.preventDefault();
      const typedVal = inputValue.trim();

      // 1. 방향키로 드롭다운 항목을 명시적으로 선택한 경우 (selectedIndex >= 0)
      if (isOpen && dropdownItems.length > 0 && selectedIndex >= 0 && dropdownItems[selectedIndex]) {
        handleSelect(dropdownItems[selectedIndex]);
        return;
      }

      // 2. 검색 모드에서 사용자가 타이핑 후 바로 Enter를 친 경우 (직접 검색)
      if (!isInputMode && typedVal) {
        const parsed = parseFieldAndValue(typedVal);
        if (parsed) {
          // "이름 박근혜"처럼 [필드명] [값] 형태 매칭
          const newCond = { typeId: parsed.type.id, typeName: parsed.type.name, value: parsed.value };
          setSearchChain(prev => prev.some(c => c.typeId === parsed.type.id) ? prev : [...prev, { typeId: parsed.type.id, typeName: parsed.type.name }]);
          setSearchValues(prev => ({ ...prev, [parsed.type.id]: parsed.value }));
          setSearchConditions(prev => [...prev.filter(c => c.typeId !== parsed.type.id), newCond]);
        } else {
          // "박근혜" 등 일반 텍스트는 전체 필드 검색
          const globalCond = { typeId: '*', typeName: '전체', value: typedVal };
          setSearchConditions([globalCond]);
          setSearchChain([]);
          setSearchValues({});
        }
        setInputValue('');
        setIsOpen(false);
        setFocusedFieldTypeId(null);
        setSearchFilterType(null);
        onSearchSelect(null);
        setTimeout(() => handleExecuteSearch(), 50);
        return;
      }

      // 3. search-val 모드에서 필드 값 타이핑 후 Enter
      if (mode === 'search-val' && searchFilterType && typedVal) {
        const currentConditions = [...searchConditions, { typeId: searchFilterType.id, typeName: searchFilterType.name, value: typedVal }];
        setSearchConditions(currentConditions);
        setSearchFilterType(null);
        setMode('search-type');
        setInputValue('');
        setIsOpen(false);
        setTimeout(() => handleExecuteSearch(), 50);
        return;
      }
    }
  };

  const handleChipRemove = (typeId: string) => {
    setInputChain(prev => prev.filter(item => item.typeId !== typeId));
    setChainValues(prev => {
      const copy = { ...prev };
      delete copy[typeId];
      return copy;
    });
    if (focusedFieldTypeId === typeId) {
      setFocusedFieldTypeId(null);
      setSearchFilterType(null);
      setMode('input-type');
      setIsOpen(false);
    }
    inputRef.current?.focus();
  };

  const resetAll = () => {
    setInputValue('');
    setInputChain([]);
    setChainValues({});
    setActiveNeighborsText('');
    setSearchChain([]);
    setSearchValues({});
    setSearchConditions([]);
    setSearchFilterType(null);
    setSelectedAnchorAtom(null);
    setFocusedFieldTypeId(null);
    setSavedAnchorIds([]);
    onSearchSelect(null);
    
    if (isInputMode) {
      setMode('input-type');
    } else {
      setMode('search-type');
    }
  };

  const handleSwitchChange = (toInput: boolean) => {
    setIsInputMode(toInput);
    setInputValue('');
    setInputChain([]);
    setChainValues({});
    setActiveNeighborsText('');
    setSearchChain([]);
    setSearchValues({});
    setSearchConditions([]);
    setSearchFilterType(null);
    setSelectedAnchorAtom(null);
    setFocusedFieldTypeId(null);
    
    if (toInput) {
      setMode('input-type');
    } else {
      setMode('search-type');
      onSearchSelect(null);
    }
    inputRef.current?.focus();
  };

  // 상단 동적 카드 내 인풋 필드 포커싱 시 이벤트
  const handleFieldFocus = (typeId: string) => {
    const t = types.find(type => type.id === typeId);
    if (t) {
      setFocusedFieldTypeId(typeId);
      setSearchFilterType(t);
      // 기존 드롭다운 팝업을 해당 종류의 기존 값 검색 상태로 전환
      setMode('search-val');
      setIsOpen(true);
    }
  };

  // 입력 필드 엔터키 → 다음 필드로 이동 (Shift+Enter는 저장)
  const handleFieldKeyDown = (e: React.KeyboardEvent, typeId: string) => {
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      handleSaveChain();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const currentIndex = inputChain.findIndex(c => c.typeId === typeId);
      if (currentIndex < inputChain.length - 1) {
        const nextItem = inputChain[currentIndex + 1];
        const nextEl = document.getElementById(`field-input-${nextItem.typeId}`);
        if (nextEl) {
          nextEl.focus();
        }
      } else {
        // 마지막 필드에서 엔터 → 저장
        handleSaveChain();
      }
    }
  };

  // 다음 우편번호 API 주소 검색
  const openAddressSearch = (typeId: string) => {
    if (typeof daum === 'undefined' || !daum.Postcode) {
      alert('주소 검색 서비스를 불러오는 중입니다. 잠시 후 다시 시도해 주세요.');
      return;
    }
    new daum.Postcode({
      oncomplete: (data) => {
        const fullAddress = data.address;
        const extraInfo = data.buildingName ? ` (${data.buildingName})` : '';
        const addressValue = `${fullAddress}${extraInfo} `;
        
        setChainValues(prev => ({ ...prev, [typeId]: addressValue }));
        
        // 상세주소 입력을 위해 해당 필드에 포커스
        setTimeout(() => {
          const el = document.getElementById(`field-input-${typeId}`) as HTMLInputElement | HTMLTextAreaElement | null;
          if (el) {
            el.focus();
            // 커서를 끝으로 이동하여 상세주소 이어서 입력 가능
            const len = addressValue.length;
            el.setSelectionRange(len, len);
          }
        }, 100);
      }
    }).open();
  };

  // 주소 관련 종류인지 판별
  const isAddressType = (typeName: string) => {
    const n = typeName.toLowerCase();
    return n.includes('주소') || n.includes('address') || n.includes('거주지') || n.includes('위치');
  };
  return (
    <div className="omnibar-wrapper" ref={containerRef}>
      {/* 검색창 및 드롭다운/헬퍼 그룹 */}
      <div className="omnibar-search-group" style={{ position: 'relative' }}>
        {/* 2. OmniBar 검색창 */}
        <div 
          className={`omnibar-container ${isOpen ? 'active' : ''} ${isInputMode && focusedFieldTypeId ? 'hidden' : ''}`} 
          onClick={() => {
            setIsOpen(true);
            // 검색바 클릭 시 항상 종류 선택 모드로 전환 (필드 포커싱 해제)
            setFocusedFieldTypeId(null);
            setSearchFilterType(null);
            setMode(isInputMode ? 'input-type' : 'search-type');
          }}
        >
          
          {/* 입력 / 검색 물리 토글 스위치 */}
          <div className="omnibar-switch">
            <div className={`switch-slider ${isInputMode ? 'input' : 'search'}`}></div>
            <button 
              type="button" 
              className={`switch-btn ${isInputMode ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                handleSwitchChange(true);
              }}
            >
              입력
            </button>
            <button 
              type="button" 
              className={`switch-btn ${!isInputMode ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                handleSwitchChange(false);
              }}
            >
              검색
            </button>
          </div>

          {/* 입력 모드 시 OmniBar 내에 누적되는 종류 칩 목록 제거 (아래 동적 카드에만 노출) */}



          {/* 핵심 텍스트 입력창 */}
          <input
            ref={inputRef}
            type="text"
            className="omnibar-input-element"
            placeholder={
              isInputMode ? '등록할 데이터 종류를 선택해 주세요...' :
              '검색어 입력 후 Enter (전체 검색), 또는 필드 종류 선택...'
            }
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              setSelectedIndex(-1);
              setIsOpen(true);
            }}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              setIsOpen(true);
              setFocusedFieldTypeId(null);
              setSearchFilterType(null);
              setMode(isInputMode ? 'input-type' : 'search-type');
            }}
          />

          {/* 컨트롤용 버튼 */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {(inputValue || inputChain.length > 0 || selectedAnchorAtom) && (
              <button className="btn-secondary" style={{ padding: '6px' }} onClick={resetAll} title="처음으로 돌아가기">
                <X size={16} />
              </button>
            )}

          </div>
        </div>

        {/* 드롭다운 자동완성 창 (값 검색 시에만 표시 - 종류 선택은 카드 아래로 이동) */}
        {isOpen && !focusedFieldTypeId && mode !== 'input-type' && mode !== 'search-type' && dropdownItems.length > 0 && (
          <div className="omnibar-dropdown" onClick={(e) => e.stopPropagation()}>
            <div className="dropdown-header">
              <span>
                {mode === 'search-val' ? '데이터 검색 결과' : '연계 데이터 종류 추가'}
              </span>
              <span>방향키로 이동, Enter로 선택</span>
            </div>
            <ul className="dropdown-list">
              {dropdownItems.map((item, idx) => (
                <li
                  key={item.id}
                  className={`dropdown-item ${idx === selectedIndex ? 'selected' : ''} ${item.isSelected ? 'already-selected' : ''}`}
                  onClick={() => {
                    handleSelect(item);
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                >
                  <div className="item-main">
                    {item.type === 'type' && item.isSelected && <Check size={14} style={{ color: 'var(--primary)' }} />}
                    {item.type === 'new-type' && <Plus size={14} style={{ color: 'var(--accent)' }} />}
                    {item.type === 'field-with-value' && <Keyboard size={14} style={{ color: 'var(--primary)' }} />}
                    {item.type === 'search-field-with-value' && <Search size={14} style={{ color: 'var(--secondary)' }} />}
                    {item.type === 'atom' && <Search size={14} style={{ color: 'var(--secondary)' }} />}
                    {item.type === 'relation' && <Check size={14} style={{ color: 'var(--text-muted)' }} />}
                    <span style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>{item.name}</span>
                    {item.details && (
                      <span className="item-details" style={{ display: 'flex', alignItems: 'center', gap: '2px', marginLeft: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {item.details.map((detail: any, dIdx: number) => (
                          <span key={dIdx} style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', flexShrink: 0, whiteSpace: 'nowrap' }}>
                            {dIdx > 0 && <span style={{ color: '#e2e8f0', margin: '0 6px', fontWeight: 'normal' }}> </span>}
                            <span style={{ color: '#64748b', marginRight: '4px' }}>{detail.typeName}:</span>
                            <strong style={{ color: '#1e293b', fontWeight: '700' }}>{detail.value}</strong>
                          </span>
                        ))}
                      </span>
                    )}
                  </div>
                  <span className="item-meta" style={{ flexShrink: 0 }}>{item.meta}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 실시간 단축키 헬프 안내 바 */}
        {isOpen && (
          <div className="omnibar-helper-text">
            <span>
              <Keyboard size={12} />
              {focusedFieldTypeId ? '글자를 치면 매칭되는 기존 등록 데이터가 드롭다운에 즉시 검색되어 나옵니다.' : 
               isInputMode ? '종류를 검색해 추가하고, 위 생성된 카드에 값을 직접 입력하세요.' : '키보드로 모든 제어가 가능합니다.'}
            </span>
            {isInputMode && inputChain.length > 0 && (
              <span>
                <span className="key-pill">Shift + Enter</span> 위 카드 데이터 일괄 생성 및 저장
              </span>
            )}
          </div>
        )}
      </div>

      {/* 4. 입력 모드 시 하단에 자동으로 나타나는 동적 입력 필드 카드 */}
      {isInputMode && inputChain.length > 0 && (
        <div className="dynamic-input-card animate-slide-up" onClick={(e) => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          
          {/* 첫 번째 입력 행 (신규 입력용) */}
          <div className="dynamic-fields-wrapper">
            <div className="dynamic-fields-grid">
              {inputChain.map(item => {
                const typeDef = types.find(t => t.id === item.typeId);
                return (
                  <div key={item.typeId} className="dynamic-field-group">
                    <span 
                      className="dynamic-field-label"
                      onClick={(e) => {
                        e.stopPropagation();
                        setChainValues(prev => ({ ...prev, [item.typeId]: '' }));
                        if (focusedFieldTypeId === item.typeId) {
                          setInputValue('');
                        }
                      }}
                      title={`${item.typeName} 값 비우기`}
                    >
                      {item.typeName}
                    </span>
                    {typeDef?.inputType === 'textarea' ? (
                      <textarea
                        id={`field-input-${item.typeId}`}
                        className="dynamic-field-input"
                        style={{ height: '42px', resize: 'none', paddingRight: isAddressType(item.typeName) ? '60px' : '32px' }}
                        placeholder={isAddressType(item.typeName) ? '🔍 검색 버튼으로 주소 찾기' : `${item.typeName} 값 입력`}
                        value={chainValues[item.typeId] || ''}
                        onFocus={() => handleFieldFocus(item.typeId)}
                        onKeyDown={(e) => handleFieldKeyDown(e, item.typeId)}
                        onChange={(e) => {
                          const formatted = applyAutoFormat(e.target.value, item.typeName, typeDef?.inputType || 'text');
                          setChainValues(prev => ({ ...prev, [item.typeId]: formatted }));
                          setInputValue(e.target.value);
                        }}
                        onBlur={(e) => {
                          const formatted = applyNameFormatOnBlur(e.target.value, item.typeName);
                          if (formatted !== e.target.value) {
                            setChainValues(prev => ({ ...prev, [item.typeId]: formatted }));
                          }
                        }}
                      />
                    ) : (
                      <input
                        id={`field-input-${item.typeId}`}
                        type={typeDef?.inputType === 'image' ? 'text' : (typeDef?.inputType || 'text')}
                        className="dynamic-field-input"
                        style={{ paddingRight: isAddressType(item.typeName) ? '60px' : '32px' }}
                        placeholder={isAddressType(item.typeName) ? '🔍 검색 버튼으로 주소 찾기' : `${item.typeName} 값 입력`}
                        value={chainValues[item.typeId] || ''}
                        onFocus={() => handleFieldFocus(item.typeId)}
                        onKeyDown={(e) => handleFieldKeyDown(e, item.typeId)}
                        onChange={(e) => {
                          const formatted = applyAutoFormat(e.target.value, item.typeName, typeDef?.inputType || 'text');
                          setChainValues(prev => ({ ...prev, [item.typeId]: formatted }));
                          setInputValue(formatted);
                        }}
                        onBlur={(e) => {
                          const formatted = applyNameFormatOnBlur(e.target.value, item.typeName);
                          if (formatted !== e.target.value) {
                            setChainValues(prev => ({ ...prev, [item.typeId]: formatted }));
                          }
                        }}
                      />
                    )}
                    {/* 주소 타입이면 우편번호 검색 버튼 표시 */}
                    {isAddressType(item.typeName) && (
                      <button
                        type="button"
                        className="btn-address-search"
                        onClick={(e) => {
                          e.stopPropagation();
                          openAddressSearch(item.typeId);
                        }}
                        title="우편번호로 주소 검색"
                      >
                        <MapPin size={14} />
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn-field-remove"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleChipRemove(item.typeId);
                      }}
                      title={`${item.typeName} 필드 제거`}
                    >
                      <X size={14} />
                    </button>
                  </div>
                );
              })}
            </div>

            {/* 플러스 즉시 저장 버튼 */}
            <button 
              type="button" 
              className="btn-add-chain" 
              onClick={handleSaveChain} 
              title="입력 데이터 즉시 저장 (+)"
            >
              <Plus size={22} />
            </button>
          </div>

          {/* 가져온 데이터의 나머지 연결 상세 정보 노출 가이드 박스 */}
          {activeNeighborsText && (
            <div className="dynamic-card-guide-box">
              {activeNeighborsText}
            </div>
          )}

          {/* 입력 카드 필드 포커싱 시 해당 종류의 기존 값 목록 드롭다운 */}
          {isOpen && focusedFieldTypeId && (
            <div className="field-autocomplete-dropdown" onClick={(e) => e.stopPropagation()}>
              {dropdownItems.length > 0 ? (
                <>
                  <div className="dropdown-header">
                    <span>"{types.find(t => t.id === focusedFieldTypeId)?.name}" 기존 저장된 값 목록</span>
                    <span>방향키로 이동, Enter로 선택</span>
                  </div>
                  <ul className="dropdown-list">
                    {dropdownItems.map((item, idx) => (
                      <li
                        key={item.id}
                        className={`dropdown-item ${idx === selectedIndex ? 'selected' : ''}`}
                        onClick={() => handleSelect(item)}
                        onMouseEnter={() => setSelectedIndex(idx)}
                      >
                        <div className="item-main">
                          <Search size={14} style={{ color: 'var(--secondary)' }} />
                          <span style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>{item.name}</span>
                          {item.details && (
                            <span className="item-details" style={{ display: 'flex', alignItems: 'center', gap: '2px', marginLeft: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {item.details.map((detail: any, dIdx: number) => (
                                <span key={dIdx} style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', flexShrink: 0, whiteSpace: 'nowrap' }}>
                                  {dIdx > 0 && <span style={{ color: '#e2e8f0', margin: '0 6px', fontWeight: 'normal' }}> </span>}
                                  <span style={{ color: '#64748b', marginRight: '4px' }}>{detail.typeName}:</span>
                                  <strong style={{ color: '#1e293b', fontWeight: '700' }}>{detail.value}</strong>
                                </span>
                              ))}
                            </span>
                          )}
                        </div>
                        <span className="item-meta" style={{ flexShrink: 0 }}>{item.meta}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                chainValues[focusedFieldTypeId]?.trim() ? (
                  <div className="dropdown-empty-hint">
                    검색 결과 없음 — 입력한 값 "{chainValues[focusedFieldTypeId]}"이(가) 그대로 사용됩니다.
                  </div>
                ) : null
              )}
            </div>
          )}

        </div>
      )}

      {/* 입력 모드: 카드 아래 종류 선택 리스트 */}
      {isInputMode && isOpen && mode === 'input-type' && dropdownItems.length > 0 && (
        <div className="field-autocomplete-dropdown" onClick={(e) => e.stopPropagation()}>
          <div className="dropdown-header">
            <span>등록할 종류 선택 (동의어 매핑 지원)</span>
            <span>방향키로 이동, Enter로 선택</span>
          </div>
          <ul className="dropdown-list">
            {dropdownItems.map((item, idx) => (
              <li
                key={item.id}
                className={`dropdown-item ${idx === selectedIndex ? 'selected' : ''} ${item.isSelected ? 'already-selected' : ''}`}
                onClick={() => handleSelect(item)}
                onMouseEnter={() => setSelectedIndex(idx)}
              >
                <div className="item-main">
                  {item.type === 'type' && item.isSelected && <Check size={14} style={{ color: 'var(--primary)' }} />}
                  {item.type === 'new-type' && <Plus size={14} style={{ color: 'var(--accent)' }} />}
                  {item.type === 'field-with-value' && <Keyboard size={14} style={{ color: 'var(--primary)' }} />}
                  <span style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>{item.name}</span>
                </div>
                <span className="item-meta" style={{ flexShrink: 0 }}>{item.meta}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 6. 저장된 항목 리스트 (입력 카드 아래에 그리드로 표시) */}
      {isInputMode && savedAnchorIds.length > 0 && (
        <div className="saved-items-grid">
          {savedAnchorIds.map(anchorId => {
            const group = getConnectedGroup(anchorId);
            if (group.length === 0) return null;
            return (
              <div key={anchorId} className="saved-item-card animate-slide-up">
                {group.map(atom => {
                  const typeDef = types.find(t => t.id === atom.typeId);
                  return (
                    <div key={atom.id} className="saved-item-field">
                      <span className="saved-field-label">{typeDef?.name || ''}</span>
                      <span className="saved-field-value">{atom.value}</span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* 5. 검색 모드 시 하단에 나타나는 동적 검색 필드 카드 */}
      {/* 5a. 전체 필드 검색 조건 칩 */}
      {!isInputMode && searchChain.length === 0 && searchConditions.some(c => c.typeId === '*') && (
        <div className="dynamic-input-card animate-slide-up" onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px' }}>
          <Search size={15} style={{ color: 'var(--secondary)', flexShrink: 0 }} />
          <span style={{ fontSize: '0.82rem', color: '#64748b' }}>전체 필드 검색:</span>
          {searchConditions.filter(c => c.typeId === '*').map((cond, i) => (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: '#e0f2fe', color: '#0369a1', borderRadius: '12px', padding: '3px 10px', fontSize: '0.85rem', fontWeight: 600 }}>
              {cond.value}
              <button
                type="button"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
                onClick={() => {
                  setSearchConditions([]);
                  onSearchSelect(null);
                }}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* 5b. 필드별 검색 카드 */}
      {!isInputMode && searchChain.length > 0 && (
        <div className="dynamic-input-card animate-slide-up" onClick={(e) => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          
          <div className="dynamic-fields-wrapper">
            <div className="dynamic-fields-grid">
              {searchChain.map(item => {
                const typeDef = types.find(t => t.id === item.typeId);
                return (
                  <div key={item.typeId} className="dynamic-field-group">
                    <span 
                      className="dynamic-field-label"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSearchValues(prev => {
                          const updated = { ...prev, [item.typeId]: '' };
                          const newConds = searchChain
                            .map(sc => ({
                              typeId: sc.typeId,
                              typeName: sc.typeName,
                              value: updated[sc.typeId] || ''
                            }))
                            .filter(cond => cond.value.trim() !== '');
                          setSearchConditions(newConds);
                          return updated;
                        });
                        if (focusedFieldTypeId === item.typeId) {
                          setInputValue('');
                        }
                      }}
                      title={`${item.typeName} 값 비우기`}
                    >
                      {item.typeName}
                    </span>
                    {typeDef?.inputType === 'textarea' ? (
                      <textarea
                        className="dynamic-field-input"
                        style={{ height: '42px', resize: 'none', paddingRight: '32px' }}
                        placeholder={`${item.typeName} 값 입력`}
                        value={searchValues[item.typeId] || ''}
                        onFocus={() => handleFieldFocus(item.typeId)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleExecuteSearch();
                          }
                        }}
                        onChange={(e) => {
                          const newVal = e.target.value;
                          setSearchValues(prev => {
                            const updated = { ...prev, [item.typeId]: newVal };
                            
                            const newConds = searchChain
                              .map(sc => ({
                                typeId: sc.typeId,
                                typeName: sc.typeName,
                                value: updated[sc.typeId] || ''
                              }))
                              .filter(cond => cond.value.trim() !== '');
                            setSearchConditions(newConds);
                            
                            return updated;
                          });
                          setInputValue(newVal);
                        }}
                      />
                    ) : (
                      <input
                        type={typeDef?.inputType === 'image' ? 'text' : (typeDef?.inputType || 'text')}
                        className="dynamic-field-input"
                        style={{ paddingRight: '32px' }}
                        placeholder={`${item.typeName} 값 입력`}
                        value={searchValues[item.typeId] || ''}
                        onFocus={() => handleFieldFocus(item.typeId)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleExecuteSearch();
                          }
                        }}
                        onChange={(e) => {
                          const newVal = e.target.value;
                          setSearchValues(prev => {
                            const updated = { ...prev, [item.typeId]: newVal };
                            
                            const newConds = searchChain
                              .map(sc => ({
                                typeId: sc.typeId,
                                typeName: sc.typeName,
                                value: updated[sc.typeId] || ''
                              }))
                              .filter(cond => cond.value.trim() !== '');
                            setSearchConditions(newConds);
                            
                            return updated;
                          });
                          setInputValue(newVal);
                        }}
                      />
                    )}
                    <button
                      type="button"
                      className="btn-field-remove"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSearchChipRemove(item.typeId);
                      }}
                      title={`${item.typeName} 필드 제거`}
                    >
                      <X size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
            
            {/* 돋보기 검색 실행 버튼 */}
            <button 
              type="button" 
              className="btn-add-chain" 
              onClick={handleExecuteSearch} 
              title="조건 검색 실행"
            >
              <Search size={20} />
            </button>
          </div>
        </div>
      )}

      {/* 검색 모드: 카드 아래 종류 선택 리스트 */}
      {!isInputMode && isOpen && mode === 'search-type' && dropdownItems.length > 0 && (
        <div className="field-autocomplete-dropdown" onClick={(e) => e.stopPropagation()}>
          <div className="dropdown-header">
            <span>검색할 종류 선택</span>
            <span>방향키로 이동, Enter로 선택</span>
          </div>
          <ul className="dropdown-list">
            {dropdownItems.map((item, idx) => (
              <li
                key={item.id}
                className={`dropdown-item ${idx === selectedIndex ? 'selected' : ''} ${item.isSelected ? 'already-selected' : ''}`}
                onClick={() => handleSelect(item)}
                onMouseEnter={() => setSelectedIndex(idx)}
              >
                <div className="item-main">
                  {item.type === 'type' && item.isSelected && <Check size={14} style={{ color: 'var(--secondary)' }} />}
                  {item.type === 'search-field-with-value' && <Search size={14} style={{ color: 'var(--secondary)' }} />}
                  <span style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>{item.name}</span>
                </div>
                <span className="item-meta" style={{ flexShrink: 0 }}>{item.meta}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 검색 모드: 필드 포커싱 시 값 자동완성 드롭다운 */}
      {!isInputMode && isOpen && focusedFieldTypeId && (
        <div className="field-autocomplete-dropdown" onClick={(e) => e.stopPropagation()}>
          {dropdownItems.length > 0 ? (
            <>
              <div className="dropdown-header">
                <span>"{types.find(t => t.id === focusedFieldTypeId)?.name}" 기존 저장된 값 목록</span>
                <span>방향키로 이동, Enter로 선택</span>
              </div>
              <ul className="dropdown-list">
                {dropdownItems.map((item, idx) => (
                  <li
                    key={item.id}
                    className={`dropdown-item ${idx === selectedIndex ? 'selected' : ''}`}
                    onClick={() => handleSelect(item)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                  >
                    <div className="item-main">
                      <Search size={14} style={{ color: 'var(--secondary)' }} />
                      <span style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>{item.name}</span>
                      {item.details && (
                        <span className="item-details" style={{ display: 'flex', alignItems: 'center', gap: '2px', marginLeft: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {item.details.map((detail: any, dIdx: number) => (
                            <span key={dIdx} style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', flexShrink: 0, whiteSpace: 'nowrap' }}>
                              {dIdx > 0 && <span style={{ color: '#e2e8f0', margin: '0 6px', fontWeight: 'normal' }}> </span>}
                              <span style={{ color: '#64748b', marginRight: '4px' }}>{detail.typeName}:</span>
                              <strong style={{ color: '#1e293b', fontWeight: '700' }}>{detail.value}</strong>
                            </span>
                          ))}
                        </span>
                      )}
                    </div>
                    <span className="item-meta" style={{ flexShrink: 0 }}>{item.meta}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            searchValues[focusedFieldTypeId]?.trim() ? (
              <div className="dropdown-empty-hint">
                검색 결과 없음 — 입력한 값 "{searchValues[focusedFieldTypeId]}"로 검색합니다.
              </div>
            ) : null
          )}
        </div>
      )}
    </div>
  );
};
