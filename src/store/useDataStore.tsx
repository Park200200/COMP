import { getAllAtomImages, saveAtomImage, migrateLocalStorageImages, deleteAtomImage, migrateIDBImagesToFiles, isLocalImagePath, getLocalImagesList, findMatchingLocalImage } from './imageStorage';
import React, {
  createContext, useContext, useState, useEffect, useCallback, useMemo,
} from "react";
import type {
  Atom, Blueprint, Domain, DataTypeDef, DataAtom, DataLink, TreeNode,
  DomainPlacement, DomainDataShape, DomainRelation,
} from "../types";
import {
  assembleComposite, parseCompositeValue
} from "../utils/formatters";

interface DataStoreContextProps {
  blueprints: Blueprint[];
  allAtoms: Atom[];
  domains: Domain[];
  activeDomain: Domain | null;
  relations: DomainRelation[];
  setActiveDomainById: (id: string | null) => void;
  addDomain: (name: string, icon: string, fields: string[], description: string, anchor?: string, useTree?: boolean, parentId?: string | string[], placement?: DomainPlacement, dataShape?: DomainDataShape) => Domain;
  updateDomain: (id: string, updates: Partial<Omit<Domain, 'id' | 'createdAt'>>) => void;
  deleteDomain: (id: string) => void;
  addRelation: (relation: Omit<DomainRelation, 'id' | 'createdAt'>) => DomainRelation;
  deleteRelation: (id: string) => void;
  getRelationsForDomain: (domainId: string) => DomainRelation[];
  createLinkedDomainFromRecord: (sourceDomainId: string, anchorId: string, domainName: string, initialFields?: string[]) => { newDomain: Domain; relation: DomainRelation };
  getFieldsForDomain: (domainId: string) => Blueprint[];
  getAtomsForDomain: (domainId: string) => {
    anchorId: string;
    data: Record<string, string>
  }[];
  getAllPersonData: () => {
    anchorId: string;
    data: Record<string, string>
  }[];
  addEntityToDomain: (domainId: string, data: Record<string, string>) => string;
  addFieldToDomain: (domainId: string, fieldName: string, inputType?: Blueprint['inputType']) => void;
  updateEntityField: (anchorId: string, fieldType: string, newValue: string) => void;
  removeEntityFromDomain: (domainId: string, anchorId: string) => void;
  linkEntityToDomain: (anchorId: string, domainId: string) => void;
  unlinkEntityFromDomain: (anchorId: string, domainId: string) => void;
  getEntityDomains: (anchorId: string) => Domain[];
  deduplicateDomain: (domainId: string) => number;
  createAtom: (type: string, value?: string, from?: string, to?: string, meta?: Record<string, any>) => string;
  softDeleteAtom: (id: string) => void;
  restoreAtom: (id: string) => void;
  getConnected: (atomId: string, depth?: number) => Atom[];
  getHistory: (atomId: string) => Atom[];
  assemble: (atomId: string) => string;
  createBlueprint: (name: string, synonyms: string[], description: string, inputType: Blueprint['inputType'], displayWidth: Blueprint['displayWidth'], format?: Blueprint['format'], treeData?: TreeNode[]) => Blueprint;
  updateBlueprint: (id: string, updates: Partial<Omit<Blueprint, 'id' | 'createdAt'>>) => void;
  deleteBlueprint: (id: string) => void;
  getFieldValues: (fieldName: string, domainTag?: string) => {
    value: string;
    count: number;
    domainTag?: string;
    usages: {
      domainId: string;
      domainName: string;
      domainIcon?: string;
      anchorId: string;
      entityName: string;
    }[];
  }[];
  updateFieldValue: (fieldName: string, oldValue: string, newValue: string, domainTag?: string) => void;
  deleteFieldValue: (fieldName: string, value: string, domainTag?: string) => void;
  deleteFieldValues: (fieldName: string, values: string[]) => void;
  addFieldValue: (fieldName: string, value: string, domainTag?: string) => void;
  types: DataTypeDef[];
  atoms: DataAtom[];
  links: DataLink[];
  addTypeDef: (name: string, synonyms: string[], description: string, inputType: DataTypeDef['inputType'], displayWidth: DataTypeDef['displayWidth']) => DataTypeDef;
  updateTypeDef: (id: string, updates: Partial<Omit<DataTypeDef, 'id' | 'createdAt'>>) => void;
  deleteTypeDef: (id: string) => void;
  findTypeByNameOrSynonym: (query: string) => DataTypeDef | undefined;
  searchTypes: (query: string) => DataTypeDef[];
  addAtom: (typeId: string, value: string) => DataAtom;
  updateAtom: (id: string, value: string) => void;
  deleteAtom: (id: string) => void;
  getAtomsByType: (typeId: string) => DataAtom[];
  searchAtoms: (query: string, typeId?: string) => DataAtom[];
  linkAtoms: (atomId1: string, atomId2: string) => void;
  unlinkAtoms: (atomId1: string, atomId2: string) => void;
  getNeighbors: (atomId: string) => DataAtom[];
  getConnectedGroup: (atomId: string) => DataAtom[];
  saveInputChain: (chain: {
    typeId: string; value: string
  }[]) => string;
  updateConnectedGroup: (anchorAtomId: string, groupData: {
    typeId: string; value: string
  }[]) => void;
  deleteConnectedGroup: (anchorAtomId: string) => void;
  searchConditions: {
    typeId: string;
    typeName: string;
    value: string
  }[];
  setSearchConditions: React.Dispatch<React.SetStateAction<{
    typeId: string;
    typeName: string;
    value: string
  }[]>>;
  searchChain: {
    typeId: string;
    typeName: string
  }[];
  setSearchChain: React.Dispatch<React.SetStateAction<{
    typeId: string;
    typeName: string
  }[]>>;
  isInputMode: boolean;
  setIsInputMode: React.Dispatch<React.SetStateAction<boolean>>;
}

const DataStoreContext = createContext<DataStoreContextProps | undefined>(undefined);

const uuid = () => Math.random().toString(36).substr(2, 9);

// ===== 초기 Blueprint 정의 =====
const INITIAL_BLUEPRINTS: Blueprint[] = [
  {
    id: 'bp-name', name: '이름', synonyms: ['성명', '이름', 'name', '성함'], description: '성+명 복합 필드', inputType: 'composite', parts: ['성', '명'], display: '{성}{명}', displayWidth: 'half', createdAt: Date.now()
  }, {
    id: 'bp-photo', name: '사진', synonyms: ['프로필', '프로필사진', '얼굴', 'photo'], description: '인물/아티클 사진', inputType: 'image', displayWidth: 'thumbnail', createdAt: Date.now()
  }, {
    id: 'bp-image', name: '이미지', synonyms: ['사진', '그림', 'image', '첨부이미지'], description: '첨부 이미지 파일', inputType: 'image', displayWidth: 'thumbnail', createdAt: Date.now()
  }, {
    id: 'bp-lastname', name: '성', synonyms: ['성씨', 'last name', 'family name'], description: '성(姓)', inputType: 'text', displayWidth: 'third', createdAt: Date.now()
  }, {
    id: 'bp-firstname', name: '명', synonyms: ['이름(명)', 'first name', 'given name'], description: '이름(명)', inputType: 'text', displayWidth: 'third', createdAt: Date.now()
  }, {
    id: 'bp-tel', name: '전화번호', synonyms: ['연락처', '핸드폰', '휴대폰', 'phone', '모바일'], description: '연락 가능한 전화번호', inputType: 'tel', displayWidth: 'half', format: 'phone', createdAt: Date.now()
  }, {
    id: 'bp-email', name: '이메일', synonyms: ['메일', 'email', '전자우편'], description: '전자우편 주소', inputType: 'text', displayWidth: 'half', createdAt: Date.now()
  }, {
    id: 'bp-addr', name: '주소', synonyms: ['거주지', '집주소', 'address', '위치'], description: '거주 혹은 배송 주소', inputType: 'textarea', displayWidth: 'full', createdAt: Date.now()
  }, {
    id: 'bp-birth', name: '생일', synonyms: ['생년월일', 'birthday', '태어난날'], description: '생년월일', inputType: 'date', displayWidth: 'half', createdAt: Date.now()
  }, {
    id: 'bp-company', name: '회사', synonyms: ['직장', '소속', 'company', '근무지'], description: '근무 중인 직장', inputType: 'text', displayWidth: 'half', createdAt: Date.now()
  }, {
    id: 'bp-memo', name: '메모', synonyms: ['비고', '노트', 'memo', '참고'], description: '자유 메모', inputType: 'textarea', displayWidth: 'full', createdAt: Date.now()
  }, {
    id: 'bp-title', name: '직위', synonyms: ['직급', '직책', 'title', 'position'], description: '직위/직급', inputType: 'text', displayWidth: 'half', createdAt: Date.now()
  }, {
    id: 'bp-dept', name: '부서', synonyms: ['팀', '부문', 'department'], description: '소속 부서', inputType: 'text', displayWidth: 'half', createdAt: Date.now()
  }, {
    id: 'bp-fax', name: '팩스', synonyms: ['fax', '팩스번호'], description: '팩스 번호', inputType: 'tel', displayWidth: 'half', format: 'phone', createdAt: Date.now()
  }, {
    id: 'bp-homepage', name: '홈페이지', synonyms: ['웹사이트', 'URL', 'homepage', '사이트'], description: '웹사이트 주소', inputType: 'text', displayWidth: 'half', createdAt: Date.now()
  }, {
    id: 'bp-school', name: '학교', synonyms: ['출신학교', '모교', 'school'], description: '출신 학교', inputType: 'text', displayWidth: 'half', createdAt: Date.now()
  }, {
    id: 'bp-gradyear', name: '졸업년도', synonyms: ['졸업', '기수', '학번'], description: '졸업 년도', inputType: 'text', displayWidth: 'half', createdAt: Date.now()
  }, {
    id: 'bp-blood', name: '혈액형', synonyms: ['blood type', '피형'], description: '혈액형', inputType: 'text', displayWidth: 'half', createdAt: Date.now()
  }, {
    id: 'bp-nickname', name: '별명', synonyms: ['닉네임', 'nickname', '애칭'], description: '별명/닉네임', inputType: 'text', displayWidth: 'half', createdAt: Date.now()
  }, {
    id: 'bp-groupname', name: '모임명', synonyms: ['그룹명', '클럽명', '동호회명'], description: '모임/그룹 이름', inputType: 'text', displayWidth: 'half', createdAt: Date.now()
  }, {
    id: 'bp-meetday', name: '모임일', synonyms: ['정기모임', '모임날짜'], description: '정기 모임일', inputType: 'text', displayWidth: 'half', createdAt: Date.now()
  }, {
    id: 'bp-place', name: '장소', synonyms: ['모임장소', '위치', 'place'], description: '모임 장소', inputType: 'text', displayWidth: 'half', createdAt: Date.now()
  }, {
    id: 'bp-fee', name: '회비', synonyms: ['월회비', '회비금액', 'fee'], description: '회비 금액', inputType: 'number', displayWidth: 'half', createdAt: Date.now()
  }, {
    id: 'bp-role', name: '역할', synonyms: ['담당', '직책(모임)'], description: '모임 내 역할', inputType: 'text', displayWidth: 'half', createdAt: Date.now()
  }, {
    id: 'bp-ssn', name: '주민번호', synonyms: ['주민등록번호', 'ssn', '식별번호'], description: '주민등록번호', inputType: 'text', displayWidth: 'half', format: 'residentno', createdAt: Date.now()
  }, {
    id: 'bp-father', name: '아버지', synonyms: ['부친', 'father', '아빠'], description: '아버지 성함', inputType: 'text', displayWidth: 'half', createdAt: Date.now()
  }, {
    id: 'bp-bizno', name: '사업자번호', synonyms: ['사업자등록번호', 'bizno', '사업자'], description: '사업자등록번호', inputType: 'text', displayWidth: 'half', format: 'bizno', createdAt: Date.now()
  }, {
    id: 'bp-request-qty', name: '의뢰수량', synonyms: ['의뢰량', '수량', '의뢰건수'], description: '의뢰 수량', inputType: 'text', displayWidth: 'half', createdAt: Date.now()
  }, {
    id: 'bp-comment', name: '소감한마디', synonyms: ['한마디', '소감', '코멘트'], description: '소감 한마디', inputType: 'textarea', displayWidth: 'full', createdAt: Date.now()
  },
];

// ===== 초기 도메인 정의 =====
const INITIAL_DOMAINS: Domain[] = [
  {
    id: 'dom-bizcard', name: '명함', icon: '', anchor: '이름', fields: ['이름', '전화번호', '이메일', '회사', '직위', '부서', '주소', '팩스', '홈페이지', '메모'], description: '비즈니스 인맥 관리', createdAt: Date.now()
  }, {
    id: 'dom-alumni', name: '동창', icon: '', anchor: '이름', fields: ['이름', '전화번호', '학교', '졸업년도', '혈액형', '생일', '별명', '메모'], description: '학교/동기 관리', createdAt: Date.now()
  }, {
    id: 'dom-group', name: '모임', icon: '', anchor: '모임명', fields: ['모임명', '모임일', '장소', '회비', '이름', '전화번호', '역할', '메모'], description: '그룹/동호회 관리', createdAt: Date.now()
  }, {
    id: 'dom-company', name: '회사', icon: '', anchor: '회사', fields: ['회사', '전화번호', '이메일', '사업자번호', '이름', '직위'], gridFields: ['회사', '전화번호', '이메일', '사업자번호'], description: '회사/기관 관리', createdAt: Date.now()
  },
];

const T = Date.now();

// ===== 시드 데이터 생성 함수 =====
function createPersonSeed(prefix: string, data: Record<string, string>): Atom[] {
  const atoms: Atom[] = [];
  const anchorId = `${prefix}-이름`;
  const companyContextFields = new Set(['직위', '부서']);
  const processedData: Record<string, string> = {};

  Object.entries(data).forEach(([type, value]) => {
    if (type === '이름' && value.length >= 2) {
      processedData['이름'] = value;
      processedData['성'] = value.charAt(0);
      processedData['명'] = value.substring(1);
    } else if (!companyContextFields.has(type)) {
      processedData[type] = value;
    }
  });

  Object.entries(processedData).forEach(([type, value]) => {
    atoms.push({
      id: `${prefix}-${type}`, type, value, createdAt: T
    });
  });

  Object.keys(processedData).forEach(type => {
    if (type !== '이름') {
      atoms.push({
        id: `${prefix}-r-${type}`, type: '연결', from: anchorId, to: `${prefix}-${type}`, createdAt: T
      });
    }
  });

  if (data['회사']) {
    const companyConnId = `${prefix}-r-회사`;
    companyContextFields.forEach(field => {
      if (data[field]) {
        atoms.push({
          id: `${companyConnId}-${field}`, type: field, value: data[field], from: companyConnId, createdAt: T
        });
      }
    });
  }

  return atoms;
}

// ===== 초기 Atom 데이터 =====
const INITIAL_ATOMS: Atom[] = [
  ...createPersonSeed('p1', {
    '이름': '박정훈', '전화번호': '010-6381-2233', '이메일': 'jhpark@email.com', '회사': 'LNote', '직위': '대표', '부서': '경영', '주소': '강원도 원주시 이화4길 19 2F', '학교': '서울대', '졸업년도': '1990', '혈액형': 'A', '생일': '1967-07-24'
  }),
  ...createPersonSeed('p2', {
    '이름': '김영희', '전화번호': '010-6381-5678', '이메일': 'yhkim@tech.com', '회사': '테크솔루션', '직위': '이사', '부서': '개발', '학교': '서울대', '졸업년도': '1990', '혈액형': 'B', '생일': '1985-03-15'
  }),
  ...createPersonSeed('p3', {
    '이름': '이철수', '전화번호': '010-1234-5678', '이메일': 'cslee@design.com', '회사': '디자인랩', '직위': '팀장', '부서': '디자인', '학교': '고려대', '졸업년도': '1992', '혈액형': 'O'
  }),
  ...createPersonSeed('p4', {
    '이름': '최민수', '전화번호': '010-9876-5432', '이메일': 'minsu@free.com', '회사': '프리랜서', '학교': '서울대', '졸업년도': '1990', '혈액형': 'AB'
  }),
  ...createPersonSeed('p5', {
    '이름': '정수진', '전화번호': '010-5555-1234', '이메일': 'sjjung@bank.com', '회사': '한국은행', '직위': '과장', '학교': '서울대', '졸업년도': '1991', '혈액형': 'A'
  }),
  ...createPersonSeed('p6', {
    '이름': '한미영', '전화번호': '010-7777-8888', '회사': '법무법인', '직위': '변호사', '학교': '고려대', '졸업년도': '1991', '혈액형': 'B'
  }),
  ...createPersonSeed('p7', {
    '이름': '오세훈', '전화번호': '010-3333-4444', '회사': '시청', '직위': '국장', '학교': '서울대', '졸업년도': '1989', '혈액형': 'O'
  }),
  ...createPersonSeed('p8', {
    '이름': '송지은', '전화번호': '010-2222-3333', '이메일': 'jieun@gmail.com', '학교': '서울대', '졸업년도': '1990', '혈액형': 'A'
  }),
  ...createPersonSeed('p9', {
    '이름': '강동원', '전화번호': '010-8888-9999', '혈액형': 'B'
  }),
  ...createPersonSeed('p10', {
    '이름': '윤서영', '전화번호': '010-4444-5555', '회사': '대학병원', '직위': '교수', '학교': '고려대', '졸업년도': '1990', '혈액형': 'A'
  }),
  // 모임 1: 서울대 90동기회
  {
    id: 'g1-name', type: '모임명', value: '서울대 90동기회', createdAt: T
  }, {
    id: 'g1-day', type: '모임일', value: '매월 첫째 토요일', createdAt: T
  }, {
    id: 'g1-place', type: '장소', value: '서울 OO음식점', createdAt: T
  }, {
    id: 'g1-fee', type: '회비', value: '30000', createdAt: T
  }, {
    id: 'g1-c01', type: '연결', from: 'g1-name', to: 'g1-day', createdAt: T
  }, {
    id: 'g1-c02', type: '연결', from: 'g1-name', to: 'g1-place', createdAt: T
  }, {
    id: 'g1-c03', type: '연결', from: 'g1-name', to: 'g1-fee', createdAt: T
  }, {
    id: 'g1-m1', type: '연결', from: 'p1-이름', to: 'g1-name', createdAt: T
  }, {
    id: 'g1-m1r', type: '역할', value: '회장님', from: 'g1-m1', createdAt: T
  }, {
    id: 'g1-m2', type: '연결', from: 'p2-이름', to: 'g1-name', createdAt: T
  }, {
    id: 'g1-m2r', type: '역할', value: '총무', from: 'g1-m2', createdAt: T
  }, {
    id: 'g1-m3', type: '연결', from: 'p4-이름', to: 'g1-name', createdAt: T
  }, {
    id: 'g1-m3r', type: '역할', value: '회원', from: 'g1-m3', createdAt: T
  }, {
    id: 'g1-m4', type: '연결', from: 'p8-이름', to: 'g1-name', createdAt: T
  }, {
    id: 'g1-m4r', type: '역할', value: '회원', from: 'g1-m4', createdAt: T
  },
  // 모임 2: 독서모임
  {
    id: 'g2-name', type: '모임명', value: '독서모임', createdAt: T
  }, {
    id: 'g2-day', type: '모임일', value: '격주 수요일', createdAt: T
  }, {
    id: 'g2-place', type: '장소', value: '강남카페', createdAt: T
  }, {
    id: 'g2-fee', type: '회비', value: '10000', createdAt: T
  }, {
    id: 'g2-c01', type: '연결', from: 'g2-name', to: 'g2-day', createdAt: T
  }, {
    id: 'g2-c02', type: '연결', from: 'g2-name', to: 'g2-place', createdAt: T
  }, {
    id: 'g2-c03', type: '연결', from: 'g2-name', to: 'g2-fee', createdAt: T
  }, {
    id: 'g2-m1', type: '연결', from: 'p1-이름', to: 'g2-name', createdAt: T
  }, {
    id: 'g2-m1r', type: '역할', value: '회원', from: 'g2-m1', createdAt: T
  }, {
    id: 'g2-m2', type: '연결', from: 'p3-이름', to: 'g2-name', createdAt: T
  }, {
    id: 'g2-m2r', type: '역할', value: '회원', from: 'g2-m2', createdAt: T
  }, {
    id: 'g2-m3', type: '연결', from: 'p6-이름', to: 'g2-name', createdAt: T
  }, {
    id: 'g2-m3r', type: '역할', value: '회원', from: 'g2-m3', createdAt: T
  }, {
    id: 'g2-m4', type: '연결', from: 'p10-이름', to: 'g2-name', createdAt: T
  }, {
    id: 'g2-m4r', type: '역할', value: '회원', from: 'g2-m4', createdAt: T
  },
  // 회사 데이터
  {
    id: 'c1-tel', type: '전화번호', value: '0258223900', createdAt: T
  }, {
    id: 'c1-email', type: '이메일', value: 'info@lnote.com', createdAt: T
  }, {
    id: 'c1-bizno', type: '사업자번호', value: '2158705030', createdAt: T
  }, {
    id: 'c1-r-tel', type: '연결', from: 'p1-이름', to: 'c1-tel', createdAt: T
  }, {
    id: 'c1-r-email', type: '연결', from: 'p1-이름', to: 'c1-email', createdAt: T
  }, {
    id: 'c1-r-bizno', type: '연결', from: 'p1-이름', to: 'c1-bizno', createdAt: T
  }, {
    id: 'c2-tel', type: '전화번호', value: '0234559474', createdAt: T
  }, {
    id: 'c2-email', type: '이메일', value: 'info@techsol.com', createdAt: T
  }, {
    id: 'c2-r-tel', type: '연결', from: 'p2-이름', to: 'c2-tel', createdAt: T
  }, {
    id: 'c2-r-email', type: '연결', from: 'p2-이름', to: 'c2-email', createdAt: T
  },
];

// ===== v1 → v2 마이그레이션 =====
function migrateV1toV2(): {
  blueprints: Blueprint[]; atoms: Atom[]
} | null {
  const v1Types = localStorage.getItem('COMP_types');
  const v1Atoms = localStorage.getItem('COMP_atoms');
  const v1Links = localStorage.getItem('COMP_links');
  if (!v1Types && !v1Atoms) return null;
  const types: DataTypeDef[] = v1Types ? JSON.parse(v1Types) : [];
  const atoms: DataAtom[] = v1Atoms ? JSON.parse(v1Atoms) : [];
  const links: DataLink[] = v1Links ? JSON.parse(v1Links) : [];

  const blueprints: Blueprint[] = types.map(t => ({
    id: t.id.replace('type-', 'bp-'),
    name: t.name,
    synonyms: t.synonyms,
    description: t.description,
    inputType: t.inputType as Blueprint['inputType'],
    displayWidth: t.displayWidth,
    createdAt: t.createdAt,
  }));

  // Atom (type = Blueprint name)
  const typeMap = new Map(types.map(t => [t.id, t.name]));
  const newAtoms: Atom[] = atoms.map(a => ({
    id: a.id,
    type: typeMap.get(a.typeId) || 'unknown',
    value: a.value,
    createdAt: a.createdAt,
  }));

  // Atom (from/to)
  const linkAtoms: Atom[] = links.map(l => ({
    id: l.id,
    type: '연결',
    from: l.sourceId,
    to: l.targetId,
    createdAt: Date.now(),
  }));

  return {
    blueprints, atoms: [...newAtoms, ...linkAtoms]
  };
}

// ===== Provider =====
export const DataStoreProvider: React.FC<{
  children: React.ReactNode
}> = ({
  children
}) => {
  const [searchConditions, setSearchConditions] = useState<{
    typeId: string; typeName: string; value: string
  }[]>([]);
  const [searchChain, setSearchChain] = useState<{
    typeId: string; typeName: string
  }[]>([]);
  const [isInputMode, setIsInputMode] = useState(false);

  const [blueprints, setBlueprints] = useState<Blueprint[]>(() => {
    const v2 = localStorage.getItem('COMP_v3_blueprints');
    let list: Blueprint[] = [];
    if (v2) {
      try {
        list = JSON.parse(v2);
      } catch (e) {
        list = INITIAL_BLUEPRINTS;
      }
    } else {
      const migrated = migrateV1toV2();
      list = migrated ? migrated.blueprints : INITIAL_BLUEPRINTS;
    }

    if (!list.some(b => b.name === '사진')) {
      const photoBp: Blueprint = {
        id: 'bp-photo', name: '사진', synonyms: ['프로필', '프로필사진', '얼굴', 'photo'], description: '인물/아티클 사진', inputType: 'image', displayWidth: 'thumbnail', createdAt: Date.now(),
      };
      list = [...list, photoBp];
    }

    if (!list.some(b => b.name === '이미지')) {
      const imageBp: Blueprint = {
        id: 'bp-image', name: '이미지', synonyms: ['사진', '그림', 'image', '첨부이미지'], description: '첨부 이미지 파일', inputType: 'image', displayWidth: 'thumbnail', createdAt: Date.now(),
      };
      list = [...list, imageBp];
    }

    if (!list.some(b => b.name === '분류' || b.inputType === 'tree')) {
      const treeBp: Blueprint = {
        id: 'bp-tree-default', name: '분류', synonyms: ['카테고리', '유형', '카테고리', '분류', 'tree'], description: '계층적 분류 체계', inputType: 'tree', displayWidth: 'half', treeData: [
          {
            id: 'tn-1', label: '분류A', children: [
              {
                id: 'tn-1-1', label: '세부분류A1', children: [
                  { id: 'tn-1-1-1', label: '세부세부분류A1a' },
                  { id: 'tn-1-1-2', label: '세부세부분류A1b' }
                ]
              }, {
                id: 'tn-1-2', label: '세부분류A2', children: [
                  { id: 'tn-1-2-1', label: '세부세부분류A2a' },
                  { id: 'tn-1-2-2', label: '세부세부분류A2b' }
                ]
              }
            ]
          }, {
            id: 'tn-2', label: '분류B', children: [
              { id: 'tn-2-1', label: '세부분류B1' },
              { id: 'tn-2-2', label: '세부분류B2' }
            ]
          }
        ], createdAt: Date.now(),
      };
      list = [...list, treeBp];
    }

    if (!list.some(b => b.name === '사료분류')) {
      const recordTreeBp: Blueprint = {
        id: 'bp-tree-record-class',
        name: '사료분류',
        synonyms: ['사료분류', '사료', '기록물분류', '분류'],
        description: '사료분류 계층 분류 체계',
        inputType: 'tree',
        displayWidth: 'half',
        treeData: [
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
        ],
        createdAt: Date.now(),
      };
      list = [...list, recordTreeBp];
    }

    if (!list.some(b => b.name === '제목')) {
      list.push({
        id: 'bp-title-book',
        name: '제목',
        synonyms: ['도서명', '책제목', 'title'],
        description: '자료 또는 책 제목',
        inputType: 'text',
        displayWidth: 'full',
        createdAt: Date.now()
      });
    }
    if (!list.some(b => b.name === '이미지업로드')) {
      list.push({
        id: 'bp-img-upload',
        name: '이미지업로드',
        synonyms: ['이미지', '사진업로드', 'file'],
        description: '자료 이미지 파일',
        inputType: 'image',
        displayWidth: 'full',
        extraFields: [
          {
            id: 'ext-img-desc',
            inputType: 'text',
            label: '이미지설명'
          }
        ],
        createdAt: Date.now()
      });
    } else {
      const imgUploadBp = list.find(b => b.name === '이미지업로드');
      if (imgUploadBp && (!imgUploadBp.extraFields || imgUploadBp.extraFields.length === 0)) {
        imgUploadBp.extraFields = [
          {
            id: 'ext-img-desc',
            inputType: 'text',
            label: '이미지설명'
          }
        ];
      }
    }
    if (!list.some(b => b.name === '페이지수')) {
      list.push({
        id: 'bp-page-count',
        name: '페이지수',
        synonyms: ['쪽수', 'page', 'pages'],
        description: '총 페이지 수',
        inputType: 'number',
        displayWidth: 'half',
        createdAt: Date.now()
      });
    }

    if (!list.some(b => b.name === '상세설명')) {
      list.push({
        id: 'bp-detail-desc',
        name: '상세설명',
        synonyms: ['설명', '비고', 'description'],
        description: '자료 또는 대상의 상세 설명',
        inputType: 'textarea',
        displayWidth: 'full',
        createdAt: Date.now()
      });
    }

    if (!list.some(b => b.name === '소장품')) {
      const sojangBp: Blueprint = {
        id: 'bp-tree-sojang',
        name: '소장품',
        synonyms: ['소장품', '유물', '자료', '소장품분류'],
        description: '소장품들의 분류와 분류 내용에 따른 세분류를 위한 기준정리',
        inputType: 'tree',
        displayWidth: 'half',
        treeData: [
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
                linkedDomainIds: ['dom-book'],
                children: [
                  { id: 'tn-book-cover', label: '표지', linkedDomainIds: ['dom-book-cover'] },
                  { id: 'tn-book-pages', label: '속지', linkedDomainIds: ['dom-book-pages'] }
                ]
              }
            ]
          }
        ],
        createdAt: Date.now(),
      };
      list = [...list, sojangBp];
    }

    const EXCLUDED_TREE_NAMES = ['활동히스토리', '시장카테고리분류', '활동분류'];
    list = list.filter(b => !EXCLUDED_TREE_NAMES.includes(b.name));

    // 누락된 기본 Blueprint 자동 보충 (INITIAL_BLUEPRINTS에 있지만 localStorage에 없는 것)
    for (const initBp of INITIAL_BLUEPRINTS) {
      if (!list.some(b => b.id === initBp.id || b.name === initBp.name)) {
        list.push({ ...initBp });
      }
    }

    return list;
  });

  const [allAtoms, setAllAtoms] = useState<Atom[]>(() => {
    let list: Atom[] = [];
    const v2 = localStorage.getItem('COMP_v3_atoms');
    if (v2) {
      list = JSON.parse(v2);
    } else {
      const migrated = migrateV1toV2();
      list = migrated ? migrated.atoms : INITIAL_ATOMS;
    }

    if (!list.some(a => a.type === '이름' && a.value === '박근혜')) {
      const pId = 'owner-p-park';
      const parkAtoms: Atom[] = [
        { id: `${pId}-이름`, type: '이름', value: '박근혜', meta: { domainId: 'dom-owner' }, createdAt: Date.now() },
        { id: `${pId}-전화번호`, type: '전화번호', value: '010-8484-7363', meta: { domainId: 'dom-owner' }, createdAt: Date.now() },
        { id: `${pId}-메모`, type: '메모', value: '서적:7권, 서화:12점, 병풍:2점', meta: { domainId: 'dom-owner' }, createdAt: Date.now() },
        { id: `${pId}-r-전화번호`, type: '연결', from: `${pId}-이름`, to: `${pId}-전화번호`, createdAt: Date.now() },
        { id: `${pId}-r-메모`, type: '연결', from: `${pId}-이름`, to: `${pId}-메모`, createdAt: Date.now() },
      ];
      list = [...list, ...parkAtoms];
    }

    // 기존 owner-p-* atom에 meta.domainId가 없으면 자동 추가 (마이그레이션)
    list.forEach(a => {
      if (a.id.startsWith('owner-') && a.type !== '연결' && (!a.meta || !a.meta.domainId)) {
        a.meta = { ...(a.meta || {}), domainId: 'dom-owner' };
      }
    });
    return list;
  });

  const [domains, setDomains] = useState<Domain[]>(() => {
    let list: Domain[] = [];
    const v2 = localStorage.getItem('COMP_v3_domains');
    if (v2) {
      const EXCLUDED_TREE_NAMES = ['활동히스토리', '시장카테고리분류', '활동분류'];
      const parsed: Domain[] = JSON.parse(v2);
      list = parsed.map(d => {
        d.fields = d.fields.filter(f => !EXCLUDED_TREE_NAMES.includes(f));
        if (d.gridFields) d.gridFields = d.gridFields.filter(f => !EXCLUDED_TREE_NAMES.includes(f));
        const isImg = (name: string) => {
          const n = (name || '').toLowerCase();
          return n.includes('이미지') || n.includes('사진') || n.includes('image') || n.includes('camera') || n.includes('업로드');
        };
        const firstNonImgField = d.fields.find(f => !isImg(f)) || '등록설명';
        if (!d.anchor || isImg(d.anchor) || (d.anchor === '이름' && firstNonImgField !== '이름') || (d.name === '활동분류' && d.anchor !== firstNonImgField)) {
          return { ...d, anchor: firstNonImgField };
        }
        return d;
      });
    } else {
      list = INITIAL_DOMAINS;
    }

    if (!list.some(d => d.name === '소장자')) {
      list.push({
        id: 'dom-owner',
        name: '소장자',
        icon: '',
        anchor: '이름',
        fields: ['사진', '이름', '전화번호', '주소', '의뢰수량', '소감한마디'],
        description: '소장품 및 사료 소장자 정보 관리',
        createdAt: Date.now()
      });
    }

    // ─────────────────────────────────────────────────────────────────
    // 트리 블루프린트의 linkedDomainIds에 정의된 아카이브 전용 도메인 자동 보완
    // localStorage에 'COMP_v3_blueprints'가 있으면 거기서 노드 정보를 읽어
    // 해당 linkedDomainId에 매칭되는 도메인이 없으면 노드 label 기반으로 자동 생성
    // ─────────────────────────────────────────────────────────────────
    try {
      const bpRaw = localStorage.getItem('COMP_v3_blueprints');
      if (bpRaw) {
        const bps = JSON.parse(bpRaw) as Array<any>;
        const collectNodes = (nodes: any[]): any[] => {
          let result: any[] = [];
          for (const n of nodes || []) {
            result.push(n);
            result = result.concat(collectNodes(n.children || []));
          }
          return result;
        };
        bps.forEach(bp => {
          if (bp.inputType !== 'tree' || !bp.treeData) return;
          const allNodes = collectNodes(bp.treeData);
          allNodes.forEach(node => {
            const linkedIds: string[] = Array.isArray(node.linkedDomainIds)
              ? node.linkedDomainIds
              : (node.linkedDomainId ? [node.linkedDomainId] : []);
            linkedIds.forEach(lid => {
              if (list.some(d => d.id === lid)) return;
              const nodeFields: string[] = Array.isArray(node.fields) && node.fields.length > 0
                ? node.fields
                : (node.label === '표지'
                    ? ['이미지업로드', '요약설명', '면구분', '간략설명', '상태']
                    : node.label === '속지'
                    ? ['이미지업로드', '요약설명', '페이지번호', '행자수', '인쇄상태', '특이사항']
                    : node.label === '봉투'
                    ? ['이미지업로드', '요약설명', '우표날인', '보존등급']
                    : node.label === '편지지'
                    ? ['이미지업로드', '요약설명', '장수', '필기구']
                    : node.label === '폭 이미지'
                    ? ['이미지업로드', '요약설명', '폭번호', '상태']
                    : ['이미지업로드', '요약설명']);
              const isImgField = (f: string) => {
                const fn = (f || '').toLowerCase();
                return fn.includes('이미지') || fn.includes('사진') || fn.includes('image') || fn.includes('업로드');
              };
              list.push({
                id: lid,
                name: node.label,
                icon: '',
                anchor: nodeFields.find(f => !isImgField(f)) || '요약설명',
                fields: nodeFields,
                description: node.label + ' 아카이브 기록물 도메인 (자동 생성)',
                createdAt: Date.now()
              });
            });
          });
        });
      }
    } catch (_) { /* 파싱 오류 무시 */ }

    // 도메인은 사용자가 직접 생성/수정/삭제하므로 하드코딩하지 않음
    return list;
  });

  // ===== 도메인 관계(DomainRelation) 통합 관리 상태 =====
  const [relations, setRelations] = useState<DomainRelation[]>(() => {
    try {
      const raw = localStorage.getItem('COMP_v3_relations');
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return [];
  });

  useEffect(() => {
    try {
      localStorage.setItem('COMP_v3_relations', JSON.stringify(relations));
    } catch (_) {}
  }, [relations]);

  // 도메인의 parentIds 계층 관계 자동 동기화 (기존 데이터 하위 호환)
  useEffect(() => {
    setRelations(prev => {
      let changed = false;
      const next = [...prev];
      domains.forEach(dom => {
        const pIds = dom.parentIds || (dom.parentId ? [dom.parentId] : []);
        pIds.forEach(pId => {
          const exists = next.some(r => r.sourceDomainId === pId && r.targetDomainId === dom.id && r.type === 'parent-child');
          if (!exists) {
            next.push({
              id: `rel-${uuid()}`,
              type: 'parent-child',
              sourceDomainId: pId,
              targetDomainId: dom.id,
              cardinality: '1:N',
              label: '하위',
              createdAt: Date.now()
            });
            changed = true;
          }
        });
      });
      return changed ? next : prev;
    });
  }, [domains]);



  const [activeDomainId, setActiveDomainId] = useState<string | null>(null);
  const activeDomain = activeDomainId ? domains.find(d => d.id === activeDomainId) || null : null;

  // 마이그레이션: 제외 트리 필드 제거 및 기본 도메인/필드 동기화
  useEffect(() => {
    const EXCLUDED_TREE_NAMES = ['활동히스토리', '시장카테고리분류', '활동분류'];
    setBlueprints(prev => {
      let changed = false;
      let next = prev.filter(b => !EXCLUDED_TREE_NAMES.includes(b.name));
      if (next.length !== prev.length) changed = true;

      // 이미지업로드 Blueprint에 extraFields 보정
      const imgBp = next.find(b => b.name === '이미지업로드');
      if (imgBp && (!imgBp.extraFields || imgBp.extraFields.length === 0)) {
        imgBp.extraFields = [{ id: 'ext-img-desc', inputType: 'text', label: '이미지설명' }];
        changed = true;
      }

      // 약속 Blueprint에 extraFields (장소, 목적) 보정
      const yakBp = next.find(b => b.name === '약속');
      if (yakBp && (!yakBp.extraFields || yakBp.extraFields.length === 0)) {
        yakBp.extraFields = [
          { id: 'ext-yak-place', inputType: 'text', label: '장소' },
          { id: 'ext-yak-purpose', inputType: 'text', label: '목적' }
        ];
        changed = true;
      }

      // 소장품 트리 속지 노드 연결 보정
      const sojangBp = next.find(b => b.name === '소장품');
      if (sojangBp && sojangBp.treeData) {
        const attachSokji = (nodes: any[]): boolean => {
          let attached = false;
          for (const n of nodes) {
            if (n.label === '속지' && (!n.linkedDomainIds || !n.linkedDomainIds.includes('dom-book-pages'))) {
              n.linkedDomainIds = ['dom-book-pages'];
              attached = true;
            }
            if (n.children && attachSokji(n.children)) attached = true;
          }
          return attached;
        };
        if (attachSokji(sojangBp.treeData)) changed = true;
      }

      if (changed) {
        localStorage.setItem('COMP_v3_blueprints', JSON.stringify(next));
        return [...next];
      }
      return prev;
    });

    setDomains(prev => {
      let changed = false;
      let next = prev.map(d => {
        const nextFields = d.fields.filter(f => !EXCLUDED_TREE_NAMES.includes(f));
        if (nextFields.length !== d.fields.length) changed = true;
        return { ...d, fields: nextFields };
      });

      if (changed) {
        localStorage.setItem('COMP_v3_domains', JSON.stringify(next));
        return next;
      }
      return prev;
    });
    setAllAtoms(prev => {
      const next = prev.filter(a => !EXCLUDED_TREE_NAMES.includes(a.type));
      if (next.length !== prev.length) {
        localStorage.setItem('COMP_v3_atoms', JSON.stringify(next));
        return next;
      }
      return prev;
    });
  }, []);

  // 마이그레이션: '약속:목적' Blueprint atoms → '목적' Blueprint + meta.domainTag='약속'
  useEffect(() => {
    const migrationKey = 'COMP_migrated_domainTag_v1';
    if (localStorage.getItem(migrationKey)) return;

    setAllAtoms(prev => {
      const hasYakSokMokjeok = prev.some(a => !a.deletedAt && a.type === '약속:목적');
      if (!hasYakSokMokjeok) {
        localStorage.setItem(migrationKey, '1');
        return prev;
      }
      const next = prev.map(a => {
        if (!a.deletedAt && a.type === '약속:목적' && !a.from && !a.to) {
          return {
            ...a,
            type: '목적',
            meta: { ...(a.meta || {}), domainTag: '약속' }
          };
        }
        return a;
      });
      localStorage.setItem(migrationKey, '1');
      return next;
    });

    setBlueprints(prev => {
      const yakSokMokjeokBp = prev.find(b => b.name === '약속:목적');
      if (!yakSokMokjeokBp) return prev;
      const next = prev.filter(b => b.name !== '약속:목적');
      return next;
    });

    setDomains(prev => {
      return prev.map(d => {
        if (d.fields.includes('약속:목적')) {
          return {
            ...d,
            fields: d.fields.filter(f => f !== '약속:목적')
          };
        }
        return d;
      });
    });
  }, []);

  useEffect(() => {
    localStorage.setItem('COMP_v3_blueprints', JSON.stringify(blueprints));
  }, [blueprints]);

  useEffect(() => {
    // Base64 이미지는 IndexedDB에만 저장, localStorage에는 __img__ 플래그로 표시
    // 로컬 파일 경로(/local-images/...)인 경우 그대로 저장 (경량)
    const atomsWithoutImages = allAtoms.map(a => {
      if (a.value && typeof a.value === 'string' && a.value.startsWith('data:image')) {
        saveAtomImage(a.id, a.value).catch(console.error);
        return { ...a, value: '__img__' };
      }
      return a;
    });
    try {
      localStorage.setItem('COMP_v3_atoms', JSON.stringify(atomsWithoutImages));
    } catch (e) {
      console.error('localStorage atoms 저장 실패:', e);
    }
  }, [allAtoms]);

  // 앱 시작 시 이미지 마이그레이션 (IndexedDB base64 → 로컬 파일 경로)
  // 및 기존 __img__ 플래그 복원
  useEffect(() => {
    (async () => {
      // localStorage에서 이미지 마이그레이션 (v1 호환)
      await migrateLocalStorageImages();

      // IndexedDB → 로컬 파일 마이그레이션 시도
      try {
        const migratedPaths = await migrateIDBImagesToFiles();
        if (Object.keys(migratedPaths).length > 0) {
          // __img__ 플래그를 로컬 파일 경로로 교체
          setAllAtoms(prev => {
            const excludedAnchorIds = new Set<string>();
            try {
              const doms: Array<{ excludedAnchors?: string[] }> = JSON.parse(
                localStorage.getItem('COMP_v3_domains') || '[]'
              );
              doms.forEach(d => (d.excludedAnchors || []).forEach(id => excludedAnchorIds.add(id)));
            } catch { /* 파싱 실패 시 무시 */ }

            const restoredIds = new Set<string>();
            const result = prev.map(a => {
              if (a.value === '__img__' && migratedPaths[a.id] && !a.deletedAt) {
                restoredIds.add(a.id);
                return { ...a, value: migratedPaths[a.id] };
              }
              return a;
            });

            if (restoredIds.size > 0) {
              const resultMap = new Map(result.map(a => [a.id, a]));
              return result.map(a => {
                if (
                  a.type === '연결' &&
                  a.to &&
                  restoredIds.has(a.to) &&
                  a.deletedAt &&
                  a.from &&
                  !excludedAnchorIds.has(a.from)
                ) {
                  const fromAtom = resultMap.get(a.from);
                  if (fromAtom && fromAtom.deletedAt) return a;
                  return { ...a, deletedAt: undefined };
                }
                return a;
              });
            }
            return result;
          });
          console.log('[useDataStore] IndexedDB 이미지 → 로컬 파일 마이그레이션 완료');
        }
      } catch (e) {
        console.warn('[useDataStore] 로컬 파일 마이그레이션 실패, IndexedDB 폴백:', e);
      }

      // 로컬 디렉터리에 이미 저장된 파일들과 __img__ 아톰 매칭 복구
      try {
        const localFiles = await getLocalImagesList();
        if (localFiles.length > 0) {
          setAllAtoms(prev => {
            let changed = false;
            const updated = prev.map(a => {
              if (a.value === '__img__' && !a.deletedAt) {
                const matchedPath = findMatchingLocalImage(a.id, localFiles);
                if (matchedPath) {
                  changed = true;
                  return { ...a, value: matchedPath };
                }
              }
              return a;
            });
            if (changed) {
              console.log('[useDataStore] 기존 __img__ 아톰을 로컬 파일 경로로 자동 복구 완료');
              return updated;
            }
            return prev;
          });
        }
      } catch (err) {
        console.warn('[useDataStore] 로컬 이미지 목록 복구 실패:', err);
      }

      // 폴백: 마이그레이션 실패 시 기존 IndexedDB 방식으로 __img__ 교체
      const imgMap = await getAllAtomImages();
      if (Object.keys(imgMap).length > 0) {
        setAllAtoms(prev => {
          const needsUpdate = prev.some(a => a.value === '__img__' && imgMap[a.id] && !a.deletedAt);
          if (!needsUpdate) return prev;

          const excludedAnchorIds = new Set<string>();
          try {
            const doms: Array<{ excludedAnchors?: string[] }> = JSON.parse(
              localStorage.getItem('COMP_v3_domains') || '[]'
            );
            doms.forEach(d => (d.excludedAnchors || []).forEach(id => excludedAnchorIds.add(id)));
          } catch { /* 파싱 실패 시 무시 */ }

          const restoredIds = new Set<string>();
          const result = prev.map(a => {
            if (a.value === '__img__' && imgMap[a.id] && !a.deletedAt) {
              restoredIds.add(a.id);
              return { ...a, value: imgMap[a.id] };
            }
            return a;
          });
          if (restoredIds.size > 0) {
            const resultMap = new Map(result.map(a => [a.id, a]));
            return result.map(a => {
              if (
                a.type === '연결' &&
                a.to &&
                restoredIds.has(a.to) &&
                a.deletedAt &&
                a.from &&
                !excludedAnchorIds.has(a.from)
              ) {
                const fromAtom = resultMap.get(a.from);
                if (fromAtom && fromAtom.deletedAt) return a;
                return { ...a, deletedAt: undefined };
              }
              return a;
            });
          }
          return result;
        });
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    localStorage.setItem('COMP_v3_domains', JSON.stringify(domains));
  }, [domains]);

    // ===== 유령/중복 엔티티 자동 정리 (앱 시작시 1회만) =====
  useEffect(() => {
    // 1. _parentInstanceId가 앵커(연결의 to가 없는) atom이고 자식(from=a.id)이 있는 것 삭제
    const active = allAtoms.filter(a => !a.deletedAt);
    const badAnchorPidIds = new Set(
      active.filter(a => a.type === '_parentInstanceId' && !a.to && active.some(c => c.from === a.id)).map(a => a.id)
    );

    const toDeleteIds = new Set<string>(badAnchorPidIds);

    // 2. 내용이 완전히 동일한 중복 엔티티 삭제
    domains.forEach(dom => {
      const anchorType = (dom.anchor && dom.fields.includes(dom.anchor)) ? dom.anchor : (dom.fields[0] || '이름');
      const connectionAtoms = active.filter(a => a.from && a.to);
      const leafAtoms = active.filter(a => !a.from && !a.to && a.value && a.type !== '_parentInstanceId');

      // 해당 도메인의 앵커 atom 찾기
      const domainAnchors = leafAtoms.filter(a => 
        (a.type === anchorType || dom.fields.includes(a.type)) &&
        (a.id.startsWith('e-') || a.id.startsWith('p') || a.id.startsWith('g') || a.id.startsWith('c'))
      );

      // 중복 방지용 Map: signature -> firstAnchorId
      const seenSignatures = new Map<string, string>();

      domainAnchors.forEach(anchor => {
        // 해당 앵커의 연결된 데이터 수집
        const connTargets = connectionAtoms.filter(c => c.from === anchor.id || c.to === anchor.id);
        const fieldValues: Record<string, string> = { [anchor.type]: anchor.value || '' };

        connTargets.forEach(c => {
          const otherId = c.from === anchor.id ? c.to : c.from;
          const targetAtom = leafAtoms.find(a => a.id === otherId);
          if (targetAtom && dom.fields.includes(targetAtom.type)) {
            fieldValues[targetAtom.type] = targetAtom.value || '';
          }
        });

        // 유효한 필드만 (도메인 필드 중 값이 있는 것)
        const filledFields = Object.entries(fieldValues).filter(([k, v]) => dom.fields.includes(k) && v.trim());

        // 사용자 등록 엔티티(e-)는 자동 클린업에서 절대 삭제하지 않음 (사용자 데이터 보호)
        if (anchor.id.startsWith('e-')) return;

        // 빈 엔티티 삭제(시드 데이터나 기존 데이터는 제외)
        if (filledFields.length === 0 && !anchor.id.startsWith('p') && !anchor.id.startsWith('g') && !anchor.id.startsWith('c')) {
          toDeleteIds.add(anchor.id);
          connTargets.forEach(c => toDeleteIds.add(c.id));
          return;
        }

        // 중복 서명 계산 (시드 데이터는 제외)
        const signature = filledFields.map(([k, v]) => `${k}:${v.trim().toLowerCase()}`).sort().join('|');
        if (signature) {
          if (seenSignatures.has(signature)) {
            // 이전에 같은 서명의 엔티티가 있으면 현재 것을 중복으로 삭제!
            toDeleteIds.add(anchor.id);
            connTargets.forEach(c => toDeleteIds.add(c.id));
          } else {
            seenSignatures.set(signature, anchor.id);
          }
        }
      });
    });

    if (toDeleteIds.size > 0) {
      console.log('[COMP Clean] Removing ghost/duplicate atom IDs:', toDeleteIds.size);
      const now = Date.now();
      setAllAtoms(prev => prev.map(a => toDeleteIds.has(a.id) ? { ...a, deletedAt: now } : a));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setActiveDomainById = useCallback((id: string | null) => {
    setActiveDomainId(id);
  }, []);

  const addDomain = useCallback((name: string, icon: string, fields: string[], description: string, anchor?: string, useTree?: boolean, parentId?: string | string[], placement?: DomainPlacement, dataShape?: DomainDataShape): Domain => {
    const normalizedParentIds: string[] = Array.isArray(parentId) ? parentId.filter(Boolean) : (parentId ? [parentId] : []);
    const dom: Domain = {
      id: `dom-${uuid()}`,
      name,
      icon,
      fields,
      anchor: anchor || '이름',
      description,
      useTree: !!useTree,
      parentId: normalizedParentIds[0] || undefined,
      parentIds: normalizedParentIds,
      placement: placement || 'main-content',
      dataShape,
      createdAt: Date.now()
    };
    setDomains(prev => [dom, ...prev]);
    return dom;
  }, []);

  const updateDomain = useCallback((id: string, updates: Partial<Omit<Domain, 'id' | 'createdAt'>>) => {
    setDomains(prev => prev.map(d => {
      if (d.id !== id) return d;
      const next = { ...d, ...updates };
      if (updates.parentIds !== undefined) {
        next.parentId = updates.parentIds[0] || undefined;
      } else if (updates.parentId !== undefined && !updates.parentIds) {
        next.parentIds = updates.parentId ? [updates.parentId] : [];
      }
      return next;
    }));
  }, []);

  const deleteDomain = useCallback((id: string) => {
    setDomains(prev => prev.filter(d => d.id !== id).map(d => {
      const newParentIds = d.parentIds ? d.parentIds.filter(pId => pId !== id) : [];
      const newParentId = d.parentId === id ? undefined : d.parentId;
      return {
        ...d, parentId: newParentId, parentIds: newParentIds.length > 0 ? newParentIds : undefined
      };
    }));
    if (activeDomainId === id) setActiveDomainId(null);
  }, [activeDomainId]);

  // ===== 텍스트 Atom 검색/인덱싱 최적화 (O(1) Map 기반 복합 인덱스) =====
  interface AtomIndex {
    active: Atom[];
    atomById: Map<string, Atom>;
    leafAtoms: Atom[];
    connectionAtoms: Atom[];
    contextAtoms: Atom[];
    pidLeafAtoms: Atom[];
    connsFrom: Map<string, Atom[]>;
    connsTo: Map<string, Atom[]>;
    contextByFrom: Map<string, Atom[]>;
    domainLinksByTo: Map<string, string[]>;
    domainMetaByDomainId: Map<string, Atom[]>;
    atomsByType: Map<string, Atom[]>;
  }

  const atomIndex = useMemo((): AtomIndex => {
    const active: Atom[] = [];
    const atomById = new Map<string, Atom>();
    const leafAtoms: Atom[] = [];
    const connectionAtoms: Atom[] = [];
    const contextAtoms: Atom[] = [];
    const pidLeafAtoms: Atom[] = [];
    const connsFrom = new Map<string, Atom[]>();
    const connsTo = new Map<string, Atom[]>();
    const contextByFrom = new Map<string, Atom[]>();
    const domainLinksByTo = new Map<string, string[]>();
    const domainMetaByDomainId = new Map<string, Atom[]>();
    const atomsByType = new Map<string, Atom[]>();

    for (let i = 0; i < allAtoms.length; i++) {
      const a = allAtoms[i];
      if (a.deletedAt) continue;

      active.push(a);
      atomById.set(a.id, a);

      let byType = atomsByType.get(a.type);
      if (!byType) {
        byType = [];
        atomsByType.set(a.type, byType);
      }
      byType.push(a);

      if (!a.from && !a.to) {
        if (a.value && a.type === '_parentInstanceId') {
          pidLeafAtoms.push(a);
        } else if (a.value) {
          leafAtoms.push(a);
        }
        if (a.meta?.domainId) {
          let dList = domainMetaByDomainId.get(a.meta.domainId);
          if (!dList) {
            dList = [];
            domainMetaByDomainId.set(a.meta.domainId, dList);
          }
          dList.push(a);
        }
      } else if (a.from && a.to) {
        connectionAtoms.push(a);

        let fList = connsFrom.get(a.from);
        if (!fList) {
          fList = [];
          connsFrom.set(a.from, fList);
        }
        fList.push(a);

        let tList = connsTo.get(a.to);
        if (!tList) {
          tList = [];
          connsTo.set(a.to, tList);
        }
        tList.push(a);

        if (a.type === '_domainLink') {
          let dlList = domainLinksByTo.get(a.to);
          if (!dlList) {
            dlList = [];
            domainLinksByTo.set(a.to, dlList);
          }
          dlList.push(a.from);
        }
      } else if (a.from && !a.to && a.value) {
        contextAtoms.push(a);

        let cList = contextByFrom.get(a.from);
        if (!cList) {
          cList = [];
          contextByFrom.set(a.from, cList);
        }
        cList.push(a);
      }
    }

    return {
      active,
      atomById,
      leafAtoms,
      connectionAtoms,
      contextAtoms,
      pidLeafAtoms,
      connsFrom,
      connsTo,
      contextByFrom,
      domainLinksByTo,
      domainMetaByDomainId,
      atomsByType
    };
  }, [allAtoms]);

  const compositeBlueprints = useMemo(() => {
    return blueprints.filter(b => b.inputType === 'composite' && b.parts && b.display);
  }, [blueprints]);

  const getFieldsForDomain = useCallback((domainId: string): Blueprint[] => {
    const dom = domains.find(d => d.id === domainId);
    if (!dom) return [];
    // Blueprint ID 또는 name으로 Blueprint 찾기 (Blueprint ID 우선)
    return dom.fields.map(f => blueprints.find(b => b.name === f || b.id === f)).filter((b): b is Blueprint => !!b);
  }, [domains, blueprints]);

  const getAtomsForDomain = useCallback((domainId: string): {
    anchorId: string; data: Record<string, string>
  }[] => {
    const dom = domains.find(d => d.id === domainId);
    if (!dom) return [];

    const {
      leafAtoms,
      atomById,
      connsFrom,
      connsTo,
      contextByFrom,
      domainLinksByTo,
      domainMetaByDomainId
    } = atomIndex;

    // fields/anchor를 Blueprint ID 형식(atom-xxx)이면 Blueprint name으로 해석
    const resolveFieldName = (fieldId: string): string => {
      if (!fieldId.startsWith('atom-')) return fieldId;
      const bp = blueprints.find(b => b.id === fieldId);
      return bp?.name || fieldId;
    };
    // dom.fields 정규화(Blueprint ID→name)
    const normalizedFields = dom.fields.map(resolveFieldName);
    // dom.anchor 정규화
    const normalizedAnchor = dom.anchor ? resolveFieldName(dom.anchor) : undefined;

    // 1. 앵커 유형으로 앵커 atom 찾기
    // 이미지/카메라 계열 Blueprint는 anchor 후보에서 제외
    const isImageBlueprintName = (name: string): boolean => {
      const n = name.toLowerCase();
      return n.includes('이미지') || n.includes('사진') || n.includes('image') ||
        n.includes('photo') || n.includes('camera') || n.includes('업로드');
    };
    // normalizedAnchor가 이미지 필드가 아닌지 확인
    const anchorIsImage = normalizedAnchor ? isImageBlueprintName(normalizedAnchor) : false;
    // 이미지가 아닌 첫 번째 필드를 폴백으로 사용
    const firstNonImageField = normalizedFields.find(f => !isImageBlueprintName(f));
    let anchorType = (normalizedAnchor && !anchorIsImage && normalizedFields.includes(normalizedAnchor))
      ? normalizedAnchor
      : (firstNonImageField || normalizedAnchor || '이름');

    // 2. 실제로 쓸 앵커 atom 목록:
    // (A) _domainLink로 명시 연결되었거나 meta.domainId로 명시 등록된 앵커 atom (최우선)
    // (B) anchorType에 맞는 leaf atom (단, 다른 도메인에 명시된 아톰은 엄격히 제외)
    // (C) 해당 fields 중 하나에 연결된 leaf atom

    // _domainLink로 이 도메인에 명시 연결된 앵커 ID 집합 (O(1) 인덱스)
    const linkedAnchorIds = new Set(domainLinksByTo.get(dom.id) || []);
    const explicitlyLinkedAnchors = Array.from(linkedAnchorIds)
      .map(id => atomById.get(id))
      .filter((a): a is Atom => !!a && !a.deletedAt);

    const allMetaAtoms = domainMetaByDomainId.get(dom.id) || [];
    const directMetaAnchors = allMetaAtoms.filter(a => a.type === anchorType);

    let anchorAtoms: Atom[] = [];
    if (directMetaAnchors.length > 0 || explicitlyLinkedAnchors.length > 0) {
      // directMetaAnchors와 explicitlyLinkedAnchors 통합 (중복 ID 방지)
      const anchorMap = new Map<string, Atom>();
      directMetaAnchors.forEach(a => anchorMap.set(a.id, a));
      explicitlyLinkedAnchors.forEach(a => anchorMap.set(a.id, a));
      anchorAtoms = Array.from(anchorMap.values());
    } else if (allMetaAtoms.length > 0) {
      // anchorType 매칭이 없으면, 이미지가 아닌 첫 번째 필드 타입의 atom을 앵커로 사용
      for (const f of normalizedFields) {
        if (isImageBlueprintName(f)) continue;
        const found = allMetaAtoms.filter(a => a.type === f);
        if (found.length > 0) {
          anchorType = f;
          anchorAtoms = found;
          break;
        }
      }
    } else {
      anchorAtoms = leafAtoms.filter(a => {
        if (a.type !== anchorType) return false;
        // _domainLink 소속 검사: 현재 도메인 링크가 있으면 포함, 다른 도메인 링크만 있으면 제외
        const myConns = connsFrom.get(a.id) || [];
        const hasThisDomainLink = myConns.some(c => c.type === '_domainLink' && c.to === dom.id);
        const hasOtherDomainLink = myConns.some(c => c.type === '_domainLink' && c.to !== dom.id);
        if (hasThisDomainLink) return true;
        if (hasOtherDomainLink) return false;

        // 다른 도메인에 명시적으로 속한 아톰은 절대 다른 도메인의 앵커가 될 수 없음
        if (a.meta?.domainId && a.meta.domainId !== dom.id) return false;
        // 엔티티 ID에 도메인 식별자가 포함된 경우 (예: e-dombook-... 은 dom-book 외에 앵커 불가)
        if (a.id.startsWith('e-dom')) {
          const cleanDomId = dom.id.replace(/-/g, '');
          const matchPrefix = a.id.split('-').slice(0, 2).join('').replace('e', '');
          if (!cleanDomId.includes(matchPrefix) && !matchPrefix.includes(cleanDomId)) {
            return false;
          }
        }
        // 특정 시드(p:사람, g:모임, c:회사)는 해당 도메인에서만 보이도록
        if (dom.id !== 'dom-bizcard' && dom.id !== 'dom-alumni' && (a.id.startsWith('p') && anchorType !== '이름')) return false;
        if (dom.id !== 'dom-group' && a.id.startsWith('g')) return false;
        if (dom.id !== 'dom-company' && a.id.startsWith('c')) return false;
        return true;
      });
    }

    // 폴백: normalizedFields 중 하나로 연결된 atom 검색 (이미지 필드는 anchor로 사용하지 않음)
    if (anchorAtoms.length === 0 && normalizedFields.length > 0) {
      for (const f of normalizedFields) {
        if (isImageBlueprintName(f)) continue;
        const found = leafAtoms.filter(a => {
          if (a.type !== f) return false;
          const myConns = connsFrom.get(a.id) || [];
          const hasThisDomainLink = myConns.some(c => c.type === '_domainLink' && c.to === dom.id);
          const hasOtherDomainLink = myConns.some(c => c.type === '_domainLink' && c.to !== dom.id);
          if (hasThisDomainLink) return true;
          if (hasOtherDomainLink) return false;
          // 다른 도메인 소속 아톰은 제외
          if (a.meta?.domainId && a.meta.domainId !== dom.id) return false;
          // 이미지 데이터값을 가진 atom은 anchor에서 제외
          if (a.value && (a.value.startsWith('data:') || a.value.startsWith('blob:') || a.value.startsWith('__img__') || a.value.startsWith('/local-images/'))) return false;
          if (dom.id !== 'dom-bizcard' && dom.id !== 'dom-alumni' && a.id.startsWith('p')) return false;
          if (dom.id !== 'dom-group' && a.id.startsWith('g')) return false;
          if (dom.id !== 'dom-company' && a.id.startsWith('c')) return false;
          return myConns.length > 0;
        });
        if (found.length > 0) {
          anchorType = f;
          anchorAtoms = found;
          break;
        }
      }
    }

    // 3. 행 생성 (O(1) 인덱스 기반 고속 조합)
    const rows = anchorAtoms.map(anchor => {
      const currentAnchorType = anchor.type || anchorType;
      const multiData: Record<string, string[]> = {
        [currentAnchorType]: [anchor.value || '']
      };

      const addValue = (type: string, value: string) => {
        // _로 시작하는 내부 메타 필드는 별도로 수집하므로 제외
        if (type.startsWith('_')) return;
        if (!multiData[type]) multiData[type] = [];
        if (!multiData[type].includes(value)) multiData[type].push(value);
      };

      // 1) 앵커에서 나가는 연결 (anchor -> target) - O(1) 인덱스
      const myConnsFrom = connsFrom.get(anchor.id) || [];
      for (let i = 0; i < myConnsFrom.length; i++) {
        const conn = myConnsFrom[i];
        if (conn.to) {
          const target = atomById.get(conn.to);
          if (target?.value) addValue(target.type, target.value);
        }
        const ctxs = contextByFrom.get(conn.id);
        if (ctxs) {
          for (let j = 0; j < ctxs.length; j++) {
            if (ctxs[j].value) addValue(ctxs[j].type, ctxs[j].value);
          }
        }
      }

      // 2) 앵커로 들어오는 연결 (source -> anchor) - O(1) 인덱스
      const myConnsTo = connsTo.get(anchor.id) || [];
      for (let i = 0; i < myConnsTo.length; i++) {
        const conn = myConnsTo[i];
        if (conn.from) {
          const source = atomById.get(conn.from);
          if (source?.value) addValue(source.type, source.value);
        }
        const ctxs = contextByFrom.get(conn.id);
        if (ctxs) {
          for (let j = 0; j < ctxs.length; j++) {
            if (ctxs[j].value) addValue(ctxs[j].type, ctxs[j].value);
          }
        }
      }

      compositeBlueprints.forEach(bp => {
        let assembled = bp.display!;
        let allPartsExist = true;
        bp.parts!.forEach(p => {
          if (multiData[p]?.[0]) assembled = assembled.replace(`{${p}}`, multiData[p][0]);
          else allPartsExist = false;
        });
        if (allPartsExist) addValue(bp.name, assembled);
      });

      const data: Record<string, string> = {};
      Object.entries(multiData).forEach(([key, values]) => {
        data[key] = [...new Set(values)].join(', ');
      });

      // _parentInstanceId와 _treeNodeId, _ownerId, _linkedClassifications, _savedAt 수집 (양방향 연결 지원)
      const checkOther = (otherId: string | undefined) => {
        if (!otherId) return;
        const otherAtom = atomById.get(otherId);
        if (otherAtom?.value) {
          if (otherAtom.type === '_parentInstanceId' && !data._parentInstanceId) data._parentInstanceId = otherAtom.value;
          if (otherAtom.type === '_treeNodeId' && !data._treeNodeId) data._treeNodeId = otherAtom.value;
          if (otherAtom.type === '_ownerId' && !data._ownerId) data._ownerId = otherAtom.value;
          if (otherAtom.type === '_linkedClassifications' && !data._linkedClassifications) data._linkedClassifications = otherAtom.value;
          if (otherAtom.type === '_savedAt' && !data._savedAt) data._savedAt = otherAtom.value;
        }
      };

      for (let i = 0; i < myConnsFrom.length; i++) {
        checkOther(myConnsFrom[i].to);
      }
      for (let i = 0; i < myConnsTo.length; i++) {
        checkOther(myConnsTo[i].from);
      }

      // 연결된 분류항이 저장되어 있다면 데이터가 없더라도 필드로 복원하여 유지
      if (data._linkedClassifications) {
        try {
          const parsed = JSON.parse(data._linkedClassifications);
          if (Array.isArray(parsed)) {
            parsed.forEach((label: string) => {
              if (data[label] === undefined) {
                data[label] = '';
              }
            });
          }
        } catch (_) {}
      }

      return { anchorId: anchor.id, data };
    });

    // 4. 제외 목록 필터, 빈 행 제거, 중복 제거
    const excluded = dom.excludedAnchors || [];
    const seenContentSignatures = new Set<string>();

    return rows.filter(row => {
      if (excluded.includes(row.anchorId)) return false;

      // 유효한 필드가 하나라도 채워진 행만 포함 (이미지 데이터도 유효)
      const hasAnyFieldValue = Object.values(row.data).some(val => {
        if (!val) return false;
        // 이미지 필드는 trim 없이 유효
        if (val.startsWith('data:image') || val.startsWith('blob:')) return true;
        return val.trim().length > 0;
      });
      if (!hasAnyFieldValue) return false;

      // 내용 기반 중복 제거 (첫 1개만 남김, 이미지 데이터는 시그니처에서 제외)
      const signatureParts = normalizedFields
        .map(f => {
          const val = (row.data[f] || '').trim();
          // 이미지 데이터는 시그니처에 'img' 플래그만 포함 (대용량 비교 방지)
          if (val.startsWith('data:image') || val.startsWith('blob:') || val.startsWith('/local-images/')) return `${f}:__img__`;
          return `${f}:${val.toLowerCase()}`;
        })
        .filter(s => !s.endsWith(':'));
      
      // parentInstanceId가 있으면 그것도 서명에 포함
      if (row.data._parentInstanceId) {
        signatureParts.push(`_pid:${row.data._parentInstanceId}`);
      }

      const signature = signatureParts.sort().join('||');
      if (signature) {
        if (seenContentSignatures.has(signature)) {
          return false; // 이전에 같은 내용의 행이 있으면 중복 제거!
        }
        seenContentSignatures.add(signature);
      }

      return true;
    });
  }, [domains, atomIndex, blueprints, compositeBlueprints]);

  const getAllPersonData = useCallback((): {
    anchorId: string; data: Record<string, string>
  }[] => {
    const { leafAtoms, connsFrom, atomById } = atomIndex;
    const nameAtoms = leafAtoms.filter(a => a.type === '이름');

    return nameAtoms.map(anchor => {
      const data: Record<string, string> = {
        '이름': anchor.value!
      };
      const myConns = connsFrom.get(anchor.id) || [];
      for (let i = 0; i < myConns.length; i++) {
        const conn = myConns[i];
        if (conn.type === '연결' && conn.to) {
          const target = atomById.get(conn.to);
          if (target?.value && !data[target.type]) {
            data[target.type] = target.value;
          }
        }
      }
      compositeBlueprints.forEach(bp => {
        let assembled = bp.display!;
        let allPartsExist = true;
        bp.parts!.forEach(p => {
          if (data[p]) assembled = assembled.replace(`{${p}}`, data[p]);
          else allPartsExist = false;
        });
        if (allPartsExist && !data[bp.name]) data[bp.name] = assembled;
      });
      if (!data['이름']) return null;
      return { anchorId: anchor.id, data };
    }).filter((x): x is {
      anchorId: string; data: Record<string, string>
    } => x !== null);
  }, [atomIndex, compositeBlueprints]);

  const updateEntityField = useCallback((anchorId: string, fieldType: string, newValue: string) => {
    const active = allAtoms.filter(a => !a.deletedAt);
    const connections = active.filter(a => a.type === '연결' && a.from === anchorId);
    // 이미지 데이터(base64)는 trim하지 않음
    const isImageData = typeof newValue === 'string' && (newValue.startsWith('data:image') || newValue.startsWith('blob:') || newValue.startsWith('/local-images/'));
    const trimmedVal = isImageData ? newValue : newValue.trim();

    const anchorAtom = active.find(a => a.id === anchorId);
    if (anchorAtom && anchorAtom.type === fieldType) {
      setAllAtoms(prev => prev.map(a => a.id === anchorId ? { ...a, value: trimmedVal } : a));
    }

    const conn = connections.find(c => {
      const target = active.find(a => a.id === c.to && a.type === fieldType);
      return !!target;
    });

    if (trimmedVal) {
      // 이미지 데이터는 기존 atom 재사용 비교 건너뜀 (대용량 비교 방지)
      const existingAtom = isImageData ? undefined : active.find(a =>
        !a.from && !a.to && a.type === fieldType &&
        (a.value || '').trim().toLowerCase() === trimmedVal.toLowerCase()
      );

      if (conn) {
        if (!isImageData && existingAtom) {
          setAllAtoms(prev => prev.map(a => a.id === conn.id ? { ...a, to: existingAtom.id } : a));
        } else {
          const isShared = active.some(c => c.type === '연결' && c.to === conn.to && c.from !== anchorId);
          if (isShared) {
            const newAtomId = `${anchorId}-${fieldType}-${Date.now()}`;
            setAllAtoms(prev => [
              ...prev.map(a => a.id === conn.id ? { ...a, to: newAtomId } : a),
              { id: newAtomId, type: fieldType, value: trimmedVal, createdAt: Date.now() }
            ]);
          } else {
            setAllAtoms(prev => prev.map(a => a.id === conn.to && a.type === fieldType ? { ...a, value: trimmedVal } : a));
          }
        }
      } else {
        // 연결이 없을 때: 삭제된 연결이 있는지 먼저 확인하고 복원
        const allConns = allAtoms.filter(a => a.type === '연결' && a.from === anchorId);
        const deletedConn = allConns.find(c => {
          const target = allAtoms.find(a => a.id === c.to && a.type === fieldType);
          return !!target && !!c.deletedAt;
        });
        if (deletedConn) {
          // 삭제된 연결 및 타겟 atom 복원 + 값 업데이트
          setAllAtoms(prev => prev.map(a => {
            if (a.id === deletedConn.id) return { ...a, deletedAt: undefined };
            if (a.id === deletedConn.to && a.type === fieldType) return { ...a, value: trimmedVal, deletedAt: undefined };
            return a;
          }));
        } else if (!isImageData && existingAtom) {
          const connId = `${anchorId}-r-${fieldType}-${Date.now()}`;
          setAllAtoms(prev => [
            ...prev,
            { id: connId, type: '연결', from: anchorId, to: existingAtom.id, createdAt: Date.now() }
          ]);
        } else {
          const atomId = `${anchorId}-${fieldType}-${Date.now()}`;
          setAllAtoms(prev => [
            ...prev,
            { id: atomId, type: fieldType, value: trimmedVal, createdAt: Date.now() },
            { id: `${atomId}-r`, type: '연결', from: anchorId, to: atomId, createdAt: Date.now() },
          ]);
        }
      }
    } else if (conn) {
      setAllAtoms(prev => prev.map(a => a.id === conn.id ? { ...a, deletedAt: Date.now() } : a));
    }

    // composite 처리
    const compBp = blueprints.find(b => b.name === fieldType && b.inputType === 'composite' && b.parts);
    if (compBp && compBp.parts && trimmedVal) {
      const parsedParts = parseCompositeValue(trimmedVal, compBp.parts, compBp.display);
      Object.entries(parsedParts).forEach(([pName, pVal]) => {
        const pTrimmed = pVal?.trim();
        if (!pTrimmed) return;

        const partConn = connections.find(c => {
          const target = active.find(a => a.id === c.to && a.type === pName);
          return !!target;
        });

        const existingPartAtom = active.find(a =>
          !a.from && !a.to && a.type === pName &&
          (a.value || '').trim().toLowerCase() === pTrimmed.toLowerCase()
        );

        if (partConn) {
          if (existingPartAtom) {
            setAllAtoms(prev => prev.map(a => a.id === partConn.id ? { ...a, to: existingPartAtom.id } : a));
          } else {
            const isShared = active.some(c => c.type === '연결' && c.to === partConn.to && c.from !== anchorId);
            if (isShared) {
              const newPartAtomId = `${anchorId}-${pName}-${Date.now()}`;
              setAllAtoms(prev => [
                ...prev.map(a => a.id === partConn.id ? { ...a, to: newPartAtomId } : a),
                { id: newPartAtomId, type: pName, value: pTrimmed, createdAt: Date.now() }
              ]);
            } else {
              setAllAtoms(prev => prev.map(a => a.id === partConn.to && a.type === pName ? { ...a, value: pTrimmed } : a));
            }
          }
        } else {
          if (existingPartAtom) {
            const connId = `${anchorId}-r-${pName}-${Date.now()}`;
            setAllAtoms(prev => [
              ...prev,
              { id: connId, type: '연결', from: anchorId, to: existingPartAtom.id, createdAt: Date.now() }
            ]);
          } else {
            const partAtomId = `${anchorId}-${pName}-${Date.now()}`;
            setAllAtoms(prev => [
              ...prev,
              { id: partAtomId, type: pName, value: pTrimmed, createdAt: Date.now() },
              { id: `${partAtomId}-r`, type: '연결', from: anchorId, to: partAtomId, createdAt: Date.now() },
            ]);
          }
        }
      });
    }
  }, [allAtoms, blueprints]);

  const addEntityToDomain = useCallback((domainId: string, data: Record<string, string>): string => {
    const dom = domains.find(d => d.id === domainId);
    if (!dom) return '';

    // 유효한 입력이 하나라도 있어야 진행
    const validInputs = Object.entries(data).filter(([k, v]) => k !== '_parentInstanceId' && typeof v === 'string' && v.trim().length > 0);
    if (validInputs.length === 0) return '';

    // 이미지 계열 키 판별 헬퍼 (이미지는 절대 앵커 atom의 value가 될 수 없음)
    const isImageKey = (name: string): boolean => {
      const n = name.toLowerCase();
      return n.includes('이미지') || n.includes('사진') || n.includes('image') ||
        n.includes('photo') || n.includes('camera') || n.includes('업로드');
    };

    const existingEntities = getAtomsForDomain(domainId);

    // 1) 비이미지 텍스트 필드 우선 탐색
    const nonImageFields = dom.fields.filter(f => !isImageKey(f));
    let anchorType = (dom.anchor && !isImageKey(dom.anchor) && dom.fields.includes(dom.anchor))
      ? dom.anchor
      : (nonImageFields[0] || '자료명');

    let anchorValue = '';
    // 지정된 anchorType의 값이 있으면 사용
    if (typeof data[anchorType] === 'string' && data[anchorType].trim() && !isImageKey(anchorType) && !data[anchorType].startsWith('data:') && !data[anchorType].startsWith('blob:')) {
      anchorValue = data[anchorType].trim();
    } else {
      // 비이미지 입력 중 첫 번째 값을 앵커로
      const firstNonImageInput = validInputs.find(([k, v]) => !isImageKey(k) && !k.startsWith('_') && !v.startsWith('data:') && !v.startsWith('blob:'));
      if (firstNonImageInput) {
        anchorType = firstNonImageInput[0];
        anchorValue = firstNonImageInput[1].trim();
      } else {
        // 이미지만 입력된 경우: 안정적인 순번/라벨을 앵커 값으로 자동 생성 (예: #1, #2)
        anchorValue = `#${existingEntities.length + 1}`;
      }
    }

    // 앵커가 dom.fields에 없는 경우 nonImageFields의 첫 번째 필드나 새로 추가된 필드로 설정
    if (!dom.fields.includes(dom.anchor) && dom.fields.includes(anchorType)) {
      setDomains(prev => prev.map(d => d.id === domainId ? { ...d, anchor: anchorType } : d));
    }

    // ===== 중복 방지 체크 (완전 동일 내용은 기존 anchorId 반환) =====
    const targetPid = typeof data._parentInstanceId === 'string' ? data._parentInstanceId.trim() : '';

    // 완전 동일한 엔티티(내용 기준 ID 불문한 위치)
    const exactDuplicate = existingEntities.find(ent => {
      // parentInstanceId가 다르면 다른 엔티티
      if (targetPid && ent.data._parentInstanceId && ent.data._parentInstanceId !== targetPid) {
        return false;
      }
      return validInputs.every(([k, v]) => (typeof ent.data[k] === 'string' ? ent.data[k].trim().toLowerCase() : '') === v.trim().toLowerCase());
    });

    if (exactDuplicate) {
      console.log('[COMP] Duplicate entity prevented, reusing anchorId:', exactDuplicate.anchorId);
      return exactDuplicate.anchorId;
    }

    // 새 엔티티 ID: e-{domId}-{random} (필드명에 종속되지 않는 순수 식별자)
    const cleanDomId = domainId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8);
    const prefix = `e-${cleanDomId}-${uuid().slice(0, 6)}`;
    const anchorId = prefix;
    const newAtoms: Atom[] = [];

    newAtoms.push({
      id: anchorId,
      type: anchorType,
      value: anchorValue,
      meta: { domainId },
      createdAt: Date.now()
    });

    // _domainLink 연결 Atom 생성 (다중 도메인 표준 연결 아톰)
    newAtoms.push({
      id: `${prefix}-dl-${cleanDomId}`,
      type: '_domainLink',
      from: anchorId,
      to: domainId,
      createdAt: Date.now()
    });

    const processedData: Record<string, string> = { ...data };

    if (anchorType === '이름' && anchorValue.length >= 2) {
      processedData['성'] = anchorValue.charAt(0);
      processedData['명'] = anchorValue.substring(1);
    }

    blueprints.filter(b => b.inputType === 'composite' && b.parts && b.parts.length > 0).forEach(bp => {
      const compVal = processedData[bp.name];
      if (typeof compVal === 'string' && compVal.trim()) {
        const parsed = parseCompositeValue(compVal, bp.parts!, bp.display);
        Object.entries(parsed).forEach(([partName, partVal]) => {
          if (partVal && !processedData[partName]) {
            processedData[partName] = partVal;
          }
        });
      } else {
        const hasParts = bp.parts!.some(p => typeof processedData[p] === 'string' && processedData[p].trim());
        if (hasParts) {
          const assembled = assembleComposite(bp.parts!, bp.display, processedData);
          if (assembled && assembled.trim()) {
            processedData[bp.name] = assembled;
          }
        }
      }
    });

    Object.entries(processedData).forEach(([type, value]) => {
      if (type === anchorType || type === '_parentInstanceId' || !value || typeof value !== 'string') return;
      // 이미지 데이터(base64)는 trim 없이 그대로 사용
      const isImageData = value.startsWith('data:image') || value.startsWith('blob:') || value.startsWith('/local-images/');
      const trimmedVal = isImageData ? value : value.trim();
      if (!trimmedVal) return;

      // 이미지 데이터는 항상 새 atom 생성 (대용량 비교 방지 + 도메인 간 공유 방지)
      let targetAtomId: string;
      if (isImageData) {
        targetAtomId = `${prefix}-${type}`;
        newAtoms.push({
          id: targetAtomId,
          type,
          value: trimmedVal,
          createdAt: Date.now()
        });
      } else {
      const existingInPrev = allAtoms.find(a =>
        !a.deletedAt && !a.from && !a.to && a.type === type &&
        (a.value || '').trim().toLowerCase() === trimmedVal.toLowerCase()
      );
      const existingInNew = newAtoms.find(a =>
        !a.from && !a.to && a.type === type &&
        (a.value || '').trim().toLowerCase() === trimmedVal.toLowerCase()
      );

      if (existingInPrev) {
        targetAtomId = existingInPrev.id;
      } else if (existingInNew) {
        targetAtomId = existingInNew.id;
      } else {
        targetAtomId = `${prefix}-${type}`;
        newAtoms.push({
          id: targetAtomId,
          type,
          value: trimmedVal,
          createdAt: Date.now()
        });
      }
      }

      newAtoms.push({
        id: `${prefix}-r-${type}`,
        type: '연결',
        from: anchorId,
        to: targetAtomId,
        createdAt: Date.now()
      });
    });

    // _parentInstanceId 전용 atom 생성 (트리 소속 표시)
    if (data._parentInstanceId) {
      const pidAtomId = `${prefix}-_parentInstanceId`;
      newAtoms.push({
        id: pidAtomId,
        type: '_parentInstanceId',
        value: data._parentInstanceId,
        createdAt: Date.now()
      });
      newAtoms.push({
        id: `${prefix}-r-_parentInstanceId`,
        type: '연결',
        from: anchorId,
        to: pidAtomId,
        createdAt: Date.now()
      });
    }

    // _treeNodeId 전용 atom 생성 (트리 노드 표시)
    if (data._treeNodeId) {
      const nodeAtomId = `${prefix}-_treeNodeId`;
      newAtoms.push({
        id: nodeAtomId,
        type: '_treeNodeId',
        value: data._treeNodeId,
        createdAt: Date.now()
      });
      newAtoms.push({
        id: `${prefix}-r-_treeNodeId`,
        type: '연결',
        from: anchorId,
        to: nodeAtomId,
        createdAt: Date.now()
      });
    }

    setAllAtoms(prev => [...prev, ...newAtoms]);
    return anchorId;
  }, [domains, getAtomsForDomain, updateEntityField, allAtoms, blueprints]);

  // 중복 제거 (soft-delete)
  const deduplicateDomain = useCallback((domainId: string): number => {
    const dom = domains.find(d => d.id === domainId);
    if (!dom) return 0;
    const entities = getAtomsForDomain(domainId);
    const anchorType = (dom.anchor && dom.fields.includes(dom.anchor)) ? dom.anchor : (dom.fields[0] || dom.anchor || '이름');
    const seen = new Map<string, string>();
    const toDeleteAnchorIds = new Set<string>();

    entities.forEach(ent => {
      const anchorVal = (ent.data[anchorType] || '').trim().toLowerCase();
      if (!anchorVal) return;
      const otherFieldsKey = Object.keys(ent.data)
        .filter(k => k !== anchorType && ent.data[k]?.trim())
        .sort()
        .map(k => `${k}:${ent.data[k].trim().toLowerCase()}`)
        .join('|');
      const contentKey = `${anchorVal}__${otherFieldsKey}`;
      if (seen.has(contentKey)) {
        toDeleteAnchorIds.add(ent.anchorId);
      } else {
        seen.set(contentKey, ent.anchorId);
      }
    });

    if (toDeleteAnchorIds.size > 0) {
      const now = Date.now();
      setAllAtoms(prev => prev.map(a => {
        if (toDeleteAnchorIds.has(a.id) || (a.from && toDeleteAnchorIds.has(a.from))) {
          return { ...a, deletedAt: now };
        }
        return a;
      }));
    }

    return toDeleteAnchorIds.size;
  }, [domains, getAtomsForDomain]);

  const removeEntityFromDomain = useCallback((domainId: string, anchorId: string) => {
    const now = Date.now();

    // 1. 도메인의 excludedAnchors에 추가하여 목록에서 숨김
    setDomains(prev => prev.map(d => {
      if (d.id !== domainId) return d;
      const excluded = d.excludedAnchors || [];
      if (excluded.includes(anchorId)) return d;
      return { ...d, excludedAnchors: [...excluded, anchorId] };
    }));

    // 2. 다른 활성 도메인에도 속해 있는지 확인
    const active = allAtoms.filter(a => !a.deletedAt);
    const otherDomains = domains.filter(d => {
      if (d.id === domainId) return false;
      if ((d.excludedAnchors || []).includes(anchorId)) return false;
      const hasDomainLink = active.some(a => a.type === '_domainLink' && a.from === anchorId && a.to === d.id);
      if (hasDomainLink) return true;
      const anchorAtom = active.find(a => a.id === anchorId);
      if (anchorAtom?.meta?.domainId === d.id) return true;
      return false;
    });

    if (otherDomains.length > 0) {
      // 다른 도메인에도 속해 있다면, 이 도메인과의 _domainLink만 삭제하고 엔티티 데이터는 보존
      setAllAtoms(prev => prev.map(a => {
        if (!a.deletedAt && a.type === '_domainLink' && a.from === anchorId && a.to === domainId) {
          return { ...a, deletedAt: now };
        }
        return a;
      }));
      console.log('[COMP] Unlinked entity from domain (preserved in other domains):', domainId, 'anchorId:', anchorId, 'remaining domains:', otherDomains.map(d => d.name));
      return;
    }

    // 3. 다른 도메인에 속하지 않는 단독 엔티티인 경우: 전체 소프트 삭제
    setAllAtoms(prev => {
      const targetIds = new Set<string>([anchorId]);

      // 앵커에 연결된 모든 연결 atom 찾기
      const relatedConns = prev.filter(a => !a.deletedAt && (a.from === anchorId || a.to === anchorId));
      relatedConns.forEach(c => {
        targetIds.add(c.id);
        const otherId = c.from === anchorId ? c.to : c.from;
        if (otherId) {
          // 다른 엔티티와 공유된 atom이면 삭제 안 함
          const isSharedWithOther = prev.some(other => 
            !other.deletedAt && 
            other.id !== c.id && 
            (other.from === otherId || other.to === otherId) &&
            other.from !== anchorId && other.to !== anchorId
          );
          if (!isSharedWithOther) {
            targetIds.add(otherId);
          }
        }
      });

      console.log('[COMP] Removing entity completely from all domains:', domainId, 'anchorId:', anchorId, 'total atoms removed:', targetIds.size);
      return prev.map(a => targetIds.has(a.id) ? { ...a, deletedAt: now } : a);
    });

    // 4. IndexedDB에서 연결된 이미지 atom들도 삭제 (새로고침 시 복원 방지)
    const savedAtoms: Atom[] = JSON.parse(localStorage.getItem('COMP_v3_atoms') || '[]');
    const toDeleteImgIds = new Set<string>([anchorId]);
    savedAtoms
      .filter(a => a.from === anchorId || a.to === anchorId)
      .forEach(c => {
        const imgId = c.from === anchorId ? c.to : c.from;
        if (imgId) toDeleteImgIds.add(imgId);
        toDeleteImgIds.add(c.id);
      });
    toDeleteImgIds.forEach(id => deleteAtomImage(id).catch(() => {}));
  }, [allAtoms, domains]);

  const linkEntityToDomain = useCallback((anchorId: string, domainId: string) => {
    if (!anchorId || !domainId) return;
    const dom = domains.find(d => d.id === domainId);
    if (!dom) return;

    // 만약 해당 도메인의 excludedAnchors에 있었다면 제거 (보이도록 복원)
    setDomains(prev => prev.map(d => {
      if (d.id !== domainId) return d;
      if (!d.excludedAnchors || !d.excludedAnchors.includes(anchorId)) return d;
      return { ...d, excludedAnchors: d.excludedAnchors.filter(id => id !== anchorId) };
    }));

    setAllAtoms(prev => {
      // 이미 활성 _domainLink가 있으면 무시
      const existingActive = prev.find(a => 
        !a.deletedAt && a.type === '_domainLink' && a.from === anchorId && a.to === domainId
      );
      if (existingActive) return prev;

      // 삭제된 _domainLink가 있으면 복원
      const deletedLink = prev.find(a => 
        a.deletedAt && a.type === '_domainLink' && a.from === anchorId && a.to === domainId
      );
      if (deletedLink) {
        return prev.map(a => a.id === deletedLink.id ? { ...a, deletedAt: undefined } : a);
      }

      // 새 _domainLink 생성
      const cleanDom = domainId.replace(/[^a-zA-Z0-9]/g, '');
      const newLink: Atom = {
        id: `dl-${anchorId.replace(/[^a-zA-Z0-9]/g, '')}-${cleanDom}-${uuid().slice(0, 6)}`,
        type: '_domainLink',
        from: anchorId,
        to: domainId,
        createdAt: Date.now()
      };
      return [...prev, newLink];
    });
  }, [domains]);

  const unlinkEntityFromDomain = useCallback((anchorId: string, domainId: string) => {
    if (!anchorId || !domainId) return;
    const now = Date.now();

    // 1. 해당 도메인의 excludedAnchors에 추가하여 목록에서 즉시 숨김
    setDomains(prev => prev.map(d => {
      if (d.id !== domainId) return d;
      const excluded = d.excludedAnchors || [];
      if (excluded.includes(anchorId)) return d;
      return { ...d, excludedAnchors: [...excluded, anchorId] };
    }));

    // 2. _domainLink 소프트 삭제
    setAllAtoms(prev => prev.map(a => {
      if (!a.deletedAt && a.type === '_domainLink' && a.from === anchorId && a.to === domainId) {
        return { ...a, deletedAt: now };
      }
      return a;
    }));
  }, []);

  const getEntityDomains = useCallback((anchorId: string): Domain[] => {
    if (!anchorId) return [];
    const { atomById, connsFrom } = atomIndex;
    const anchorAtom = atomById.get(anchorId);
    if (!anchorAtom) return [];

    const domainIds = new Set<string>();
    if (anchorAtom.meta?.domainId) {
      domainIds.add(anchorAtom.meta.domainId);
    }
    const myConns = connsFrom.get(anchorId) || [];
    for (let i = 0; i < myConns.length; i++) {
      const c = myConns[i];
      if (c.type === '_domainLink' && c.to) {
        domainIds.add(c.to);
      }
    }

    return domains.filter(d => domainIds.has(d.id) && !(d.excludedAnchors || []).includes(anchorId));
  }, [atomIndex, domains]);

  const blueprintById = useCallback((id: string) => blueprints.find(b => b.id === id), [blueprints]);

  const createAtom = useCallback((type: string, value?: string, from?: string, to?: string, meta?: Record<string, any>): string => {
    const newAtom: Atom = {
      id: `a-${uuid()}`, type,
      ...(value !== undefined && value !== null ? { value } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(meta ? { meta } : {}),
      createdAt: Date.now(),
    };
    setAllAtoms(prev => [...prev, newAtom]);
    return newAtom.id;
  }, []);

  // ===== 도메인 관계(DomainRelation) 조작 메소드 =====
  const addRelation = useCallback((rel: Omit<DomainRelation, 'id' | 'createdAt'>): DomainRelation => {
    const newRel: DomainRelation = {
      ...rel,
      id: `rel-${uuid()}`,
      createdAt: Date.now(),
    };
    setRelations(prev => [newRel, ...prev]);
    return newRel;
  }, []);

  const deleteRelation = useCallback((id: string) => {
    setRelations(prev => prev.filter(r => r.id !== id));
  }, []);

  const getRelationsForDomain = useCallback((domainId: string): DomainRelation[] => {
    return relations.filter(r => r.sourceDomainId === domainId || r.targetDomainId === domainId);
  }, [relations]);

  const createLinkedDomainFromRecord = useCallback((
    sourceDomainId: string,
    anchorId: string,
    domainName: string,
    initialFields: string[] = []
  ): { newDomain: Domain; relation: DomainRelation } => {
    const newFields = initialFields.length > 0 ? initialFields : ['이름', '설명'];
    const newDomain = addDomain(
      domainName.trim(),
      '📁',
      newFields,
      `${domainName} (연결 도메인)`,
      newFields[0] || '이름',
      false,
      [sourceDomainId],
      'main-content',
      'card'
    );

    const rel = addRelation({
      type: 'parent-child',
      sourceDomainId,
      targetDomainId: newDomain.id,
      cardinality: '1:N',
      label: domainName.trim(),
    });

    createAtom('도메인연결', newDomain.id, anchorId, undefined, {
      sourceDomainId,
      targetDomainId: newDomain.id,
      linkedAt: Date.now()
    });

    return { newDomain, relation: rel };
  }, [addDomain, addRelation, createAtom]);

  const softDeleteAtom = useCallback((id: string) => {
    setAllAtoms(prev => prev.map(a => a.id === id ? { ...a, deletedAt: Date.now() } : a));
  }, []);

  const restoreAtom = useCallback((id: string) => {
    setAllAtoms(prev => prev.map(a => a.id === id ? { ...a, deletedAt: undefined } : a));
  }, []);

  const getConnected = useCallback((atomId: string, depth: number = Infinity): Atom[] => {
    const { atomById, connsFrom, connsTo } = atomIndex;
    const visited = new Set<string>();
    const result: Atom[] = [];
    const queue: { id: string; d: number }[] = [{ id: atomId, d: 0 }];
    visited.add(atomId);

    while (queue.length > 0) {
      const { id: currId, d } = queue.shift()!;
      const curr = atomById.get(currId);
      if (curr) result.push(curr);
      if (d >= depth) continue;

      const myConns = [...(connsFrom.get(currId) || []), ...(connsTo.get(currId) || [])];
      for (let i = 0; i < myConns.length; i++) {
        const a = myConns[i];
        if (!visited.has(a.id)) {
          visited.add(a.id);
          result.push(a);
        }
        const otherId = a.from === currId ? a.to : a.from;
        if (otherId && !visited.has(otherId)) {
          visited.add(otherId);
          queue.push({ id: otherId, d: d + 1 });
        }
      }
    }

    return result;
  }, [atomIndex]);

  const getHistory = useCallback((atomId: string): Atom[] => {
    const { connsFrom, connsTo, atomById } = atomIndex;
    const res: Atom[] = [];
    const main = atomById.get(atomId);
    if (main) res.push(main);
    (connsFrom.get(atomId) || []).forEach(a => res.push(a));
    (connsTo.get(atomId) || []).forEach(a => res.push(a));
    return res;
  }, [atomIndex]);

  const assemble = useCallback((atomId: string): string => {
    const { atomById } = atomIndex;
    const atom = atomById.get(atomId);
    if (!atom || atom.deletedAt) return '';
    if (atom.value) return atom.value;
    // 연결 Atom: from과 to
    const fromVal = atom.from ? atomById.get(atom.from)?.value || '' : '';
    const toVal = atom.to ? atomById.get(atom.to)?.value || '' : '';
    return [fromVal, toVal].filter(Boolean).join(' →');
  }, [atomIndex]);

  const createBlueprint = useCallback((name: string, synonyms: string[], description: string, inputType: Blueprint['inputType'], displayWidth: Blueprint['displayWidth'], format?: Blueprint['format'], treeData?: TreeNode[]): Blueprint => {
    const bp: Blueprint = {
      id: `bp-${uuid()}`, name,
      synonyms: Array.from(new Set([name, ...synonyms])).filter(Boolean),
      description, inputType, displayWidth,
      ...(format && format !== 'none' ? { format } : {}),
      ...(treeData && treeData.length > 0 ? { treeData } : {}),
      createdAt: Date.now(),
    };
    setBlueprints(prev => [bp, ...prev]); // 새 필드를 목록 최상단에 추가
    return bp;
  }, []);

  const addFieldToDomain = useCallback((domainId: string, fieldName: string, inputType: Blueprint['inputType'] = 'text') => {
    const cleanName = fieldName.trim();
    if (!domainId || !cleanName) return;

    // 1. 도메인의 fields 및 gridFields에 추가 (중복 방지)
    setDomains(prev => prev.map(d => {
      if (d.id !== domainId) return d;
      const nextFields = d.fields.includes(cleanName) ? d.fields : [...d.fields, cleanName];
      const nextGridFields = d.gridFields && d.gridFields.length > 0 && !d.gridFields.includes(cleanName)
        ? [...d.gridFields, cleanName]
        : d.gridFields;
      return {
        ...d,
        fields: nextFields,
        ...(nextGridFields ? { gridFields: nextGridFields } : {})
      };
    }));

    // 2. Blueprint가 없으면 자동 생성
    const exists = blueprints.some(b => b.name === cleanName || b.id === cleanName);
    if (!exists) {
      createBlueprint(cleanName, [], '', inputType, 'half');
    }
  }, [blueprints, createBlueprint]);

  const updateBlueprint = useCallback((id: string, updates: Partial<Omit<Blueprint, 'id' | 'createdAt'>>) => {
    const oldBp = blueprints.find(b => b.id === id);
    const oldName = oldBp?.name;
    const newName = updates.name?.trim();

    setBlueprints(prev => prev.map(b => {
      if (b.id === id) {
        const merged = updates.name || updates.synonyms
          ? Array.from(new Set([updates.name || b.name, ...(updates.synonyms || b.synonyms)])).filter(Boolean)
          : b.synonyms;
        return { ...b, ...updates, synonyms: merged };
      }
      return b;
    }));

    if (oldName && newName && oldName !== newName) {
      setAllAtoms(prev => prev.map(a => {
        if (a.type === oldName) {
          return { ...a, type: newName };
        }
        return a;
      }));
      setDomains(prev => prev.map(d => ({
        ...d,
        anchor: d.anchor === oldName ? newName : d.anchor,
        fields: d.fields.map(f => f === oldName ? newName : f),
        gridFields: d.gridFields ? d.gridFields.map(f => f === oldName ? newName : f) : undefined,
      })));
    }
  }, [blueprints]);

  const deleteBlueprint = useCallback((id: string) => {
    const bp = blueprints.find(b => b.id === id);
    if (!bp) return;
    setAllAtoms(prev => {
      const affectedIds = prev.filter(a => a.type === bp.name && !a.deletedAt).map(a => a.id);
      return prev.map(a => {
        if (affectedIds.includes(a.id)) return { ...a, deletedAt: Date.now() };
        if (a.from && affectedIds.includes(a.from)) return { ...a, deletedAt: Date.now() };
        if (a.to && affectedIds.includes(a.to)) return { ...a, deletedAt: Date.now() };
        return a;
      });
    });
    setBlueprints(prev => prev.filter(b => b.id !== id));
  }, [blueprints]);

  // ===== 필드 값 관리 =====
  const getFieldValues = useCallback((fieldName: string, domainTag?: string): {
    value: string;
    count: number;
    domainTag?: string;
    usages: {
      domainId: string;
      domainName: string;
      domainIcon?: string;
      anchorId: string;
      entityName: string;
    }[];
  }[] => {
    if (!fieldName) return [];

    // 1. 해당 필드의 고유 값들 (O(1) 타입 인덱스 활용)
    // domainTag 필터를 적용하여 atoms 수집
    const matchingAtoms = atomIndex.atomsByType.get(fieldName) || [];
    const uniqueVals = new Map<string, string | undefined>(); // value -> domainTag
    for (let i = 0; i < matchingAtoms.length; i++) {
      const a = matchingAtoms[i];
      if (!a.from && !a.to && a.value && a.value.trim()) {
        const atomDomainTag = a.meta?.domainTag as string | undefined;
        // domainTag 필터 적용
        if (domainTag !== undefined) {
          const matches = domainTag === null
            ? atomDomainTag === undefined || atomDomainTag === null
            : atomDomainTag === domainTag;
          if (!matches) continue;
        }
        if (!uniqueVals.has(a.value.trim())) {
          uniqueVals.set(a.value.trim(), atomDomainTag);
        }
      }
    }

    // 1-2. 해당 필드에 명시적으로 연결된 분류트리의 노드들도 데이터 값으로 수집
    // (domainTag 필터가 없는 경우에만 적용)
    if (domainTag === undefined) {
      blueprints
        .filter(b => b.inputType === 'tree' && b.treeData && b.treeData.length > 0)
        .forEach(b => {
          const isTreeLinked = b.linkedFieldNames && b.linkedFieldNames.includes(fieldName);
          const traverse = (nodes: TreeNode[]) => {
            for (const n of nodes) {
              const isNodeLinked = isTreeLinked || (n.linkedFieldNames && n.linkedFieldNames.includes(fieldName));
              if (isNodeLinked && n.label && n.label.trim()) {
                if (!uniqueVals.has(n.label.trim())) uniqueVals.set(n.label.trim(), undefined);
              }
              if (n.children && n.children.length > 0) traverse(n.children);
            }
          };
          traverse(b.treeData!);
        });
    }

    // 2. 각 도메인에서의 엔티티 목록
    const domainEnts = domains.map(dom => ({
      domain: dom,
      entities: getAtomsForDomain(dom.id)
    }));

    // 3. 각 고유 값에 대해 사용 중인 엔티티 목록 수집
    const result: {
      value: string;
      count: number;
      domainTag?: string;
      usages: {
        domainId: string;
        domainName: string;
        domainIcon?: string;
        anchorId: string;
        entityName: string;
      }[];
    }[] = [];

    uniqueVals.forEach((tag, val) => {
      const valNorm = val.replace(/\s+/g, '').toLowerCase();
      const usagesMap = new Map<string, {
        domainId: string;
        domainName: string;
        domainIcon?: string;
        anchorId: string;
        entityName: string;
      }>();

      domainEnts.forEach(({ domain, entities }) => {
        entities.forEach(ent => {
          const rawFieldValue = ent.data[fieldName];
          if (!rawFieldValue) return;
          const fieldNorm = rawFieldValue.trim().replace(/\s+/g, '').toLowerCase();

          if (fieldNorm === valNorm) {
            const repName = ent.data[domain.anchor] || ent.data[domain.fields[0]] || ent.anchorId;
            const usageKey = `${domain.id}-${ent.anchorId}`;
            if (!usagesMap.has(usageKey)) {
              usagesMap.set(usageKey, {
                domainId: domain.id,
                domainName: domain.name,
                domainIcon: domain.icon,
                anchorId: ent.anchorId,
                entityName: repName
              });
            }
          }
        });
      });

      const usages = Array.from(usagesMap.values());
      result.push({
        value: val,
        count: usages.length,
        domainTag: tag,
        usages
      });
    });

    return result.sort((a, b) => a.value.localeCompare(b.value, 'ko'));
  }, [atomIndex, blueprints, domains, getAtomsForDomain]);

  const updateFieldValue = useCallback((fieldName: string, oldValue: string, newValue: string, domainTag?: string) => {
    const oldVal = oldValue.trim();
    const nextVal = newValue.trim();
    if (!fieldName || !oldVal || !nextVal || oldVal === nextVal) return;
    setAllAtoms(prev => prev.map(a => {
      if (!a.deletedAt && a.type === fieldName && (a.value || '').trim() === oldVal && !a.from && !a.to) {
        // domainTag가 지정된 경우 해당 태그를 가진 atom만 수정
        if (domainTag !== undefined) {
          const atomTag = a.meta?.domainTag;
          if (atomTag !== domainTag) return a;
        }
        return { ...a, value: nextVal };
      }
      return a;
    }));
  }, []);

  const deleteFieldValue = useCallback((fieldName: string, value: string, domainTag?: string) => {
    const targetVal = value.trim();
    if (!fieldName || !targetVal) return;
    const now = Date.now();
    setAllAtoms(prev => {
      const matchAtoms = prev.filter(a => {
        if (a.deletedAt || a.type !== fieldName || (a.value || '').trim() !== targetVal || a.from || a.to) return false;
        if (domainTag !== undefined) {
          return (a.meta?.domainTag ?? null) === (domainTag ?? null);
        }
        return true;
      });
      const matchIds = new Set(matchAtoms.map(a => a.id));
      if (matchIds.size === 0) return prev;
      return prev.map(a => {
        if (matchIds.has(a.id)) {
          return { ...a, deletedAt: now };
        }
        if (a.type === '연결' && ((a.from && matchIds.has(a.from)) || (a.to && matchIds.has(a.to)))) {
          return { ...a, deletedAt: now };
        }
        return a;
      });
    });
  }, []);

  const deleteFieldValues = useCallback((fieldName: string, values: string[]) => {
    const valSet = new Set(values.map(v => v.trim()).filter(Boolean));
    if (!fieldName || valSet.size === 0) return;
    const now = Date.now();
    setAllAtoms(prev => {
      const matchAtoms = prev.filter(a => !a.deletedAt && a.type === fieldName && valSet.has((a.value || '').trim()) && !a.from && !a.to);
      const matchIds = new Set(matchAtoms.map(a => a.id));
      if (matchIds.size === 0) return prev;
      return prev.map(a => {
        if (matchIds.has(a.id)) {
          return { ...a, deletedAt: now };
        }
        if (a.type === '연결' && ((a.from && matchIds.has(a.from)) || (a.to && matchIds.has(a.to)))) {
          return { ...a, deletedAt: now };
        }
        return a;
      });
    });
  }, []);

  const addFieldValue = useCallback((fieldName: string, value: string, domainTag?: string) => {
    const val = value.trim();
    if (!fieldName || !val) return;
    const exists = allAtoms.some(a =>
      !a.deletedAt && a.type === fieldName &&
      (a.value || '').trim().toLowerCase() === val.toLowerCase() &&
      !a.from && !a.to &&
      (domainTag !== undefined
        ? (a.meta?.domainTag ?? null) === (domainTag ?? null)
        : true)
    );
    if (exists) return;
    createAtom(fieldName, val, undefined, undefined, domainTag ? { domainTag } : undefined);
  }, [allAtoms, createAtom]);

  // ===== v1 호환 래퍼 =====
  const types: DataTypeDef[] = blueprints.map(b => ({
    id: b.id, name: b.name, synonyms: b.synonyms, description: b.description,
    inputType: (b.inputType === 'composite' || b.inputType === 'tree' ? 'text' : b.inputType) as DataTypeDef['inputType'],
    displayWidth: b.displayWidth, createdAt: b.createdAt,
  }));

  const atoms: DataAtom[] = allAtoms
    .filter(a => !a.from && !a.to && !a.deletedAt && a.value)
    .map(a => {
      const bp = blueprints.find(b => b.name === a.type);
      return {
        id: a.id, typeId: bp?.id || '', value: a.value || '', createdAt: a.createdAt,
      };
    });

  const links: DataLink[] = allAtoms
    .filter(a => a.from && a.to && !a.deletedAt)
    .map(a => ({
      id: a.id, sourceId: a.from!, targetId: a.to!,
    }));

  const addTypeDef = (name: string, synonyms: string[], description: string, inputType: DataTypeDef['inputType'], displayWidth: DataTypeDef['displayWidth']): DataTypeDef => {
    const bp = createBlueprint(name, synonyms, description, inputType, displayWidth);
    return {
      id: bp.id, name: bp.name, synonyms: bp.synonyms, description: bp.description,
      inputType: (bp.inputType === 'composite' || bp.inputType === 'tree' ? 'text' : bp.inputType) as DataTypeDef['inputType'],
      displayWidth: bp.displayWidth, createdAt: bp.createdAt
    };
  };

  const updateTypeDef = (id: string, updates: Partial<Omit<DataTypeDef, 'id' | 'createdAt'>>) => {
    updateBlueprint(id, updates as any);
  };

  const deleteTypeDef = (id: string) => {
    deleteBlueprint(id);
  };

  const findTypeByNameOrSynonym = (query: string): DataTypeDef | undefined => {
    const q = query.trim().toLowerCase();
    if (!q) return undefined;
    const bp = blueprints.find(b =>
      b.name.toLowerCase() === q || b.synonyms.some(s => s.toLowerCase() === q)
    );
    if (!bp) return undefined;
    return types.find(t => t.id === bp.id);
  };

  const searchTypes = (query: string): DataTypeDef[] => {
    const q = query.trim().toLowerCase();
    if (!q) return types;
    return types.filter(t =>
      t.name.toLowerCase().includes(q) || t.synonyms.some(s => s.toLowerCase().includes(q))
    );
  };

  const addAtom = (typeId: string, value: string): DataAtom => {
    const bp = blueprintById(typeId);
    const typeName = bp?.name || 'unknown';
    const id = createAtom(typeName, value);
    return { id, typeId, value, createdAt: Date.now() };
  };

  const updateAtom = (id: string, value: string) => {
    setAllAtoms(prev => prev.map(a => a.id === id ? { ...a, value } : a));
  };

  const deleteAtom = (id: string) => {
    setAllAtoms(prev => prev.map(a => {
      if (a.id === id) return { ...a, deletedAt: Date.now() };
      if (a.from === id || a.to === id) return { ...a, deletedAt: Date.now() };
      return a;
    }));
  };

  const getAtomsByType = (typeId: string): DataAtom[] => {
    const bp = blueprintById(typeId);
    if (!bp) return [];
    return atoms.filter(a => a.typeId === typeId);
  };

  const searchAtoms = (query: string, typeId?: string): DataAtom[] => {
    const q = query.trim().toLowerCase();
    return atoms.filter(a => {
      const matchType = typeId ? a.typeId === typeId : true;
      const matchVal = q ? a.value.toLowerCase().includes(q) : true;
      return matchType && matchVal;
    });
  };

  const linkAtoms = (atomId1: string, atomId2: string) => {
    if (atomId1 === atomId2) return;
    const exists = allAtoms.some(a =>
      !a.deletedAt && (
        (a.from === atomId1 && a.to === atomId2) ||
        (a.from === atomId2 && a.to === atomId1)
      )
    );
    if (!exists) {
      createAtom('연결', undefined, atomId1, atomId2);
    }
  };

  const unlinkAtoms = (atomId1: string, atomId2: string) => {
    setAllAtoms(prev => prev.map(a => {
      if (!a.deletedAt && (
        (a.from === atomId1 && a.to === atomId2) ||
        (a.from === atomId2 && a.to === atomId1)
      )) {
        return { ...a, deletedAt: Date.now() };
      }
      return a;
    }));
  };

  const getNeighbors = (atomId: string): DataAtom[] => {
    const { connsFrom, connsTo } = atomIndex;
    const neighborIds = new Set<string>();
    (connsFrom.get(atomId) || []).forEach(a => { if (a.to) neighborIds.add(a.to); });
    (connsTo.get(atomId) || []).forEach(a => { if (a.from) neighborIds.add(a.from); });
    return atoms.filter(a => neighborIds.has(a.id));
  };

  const getConnectedGroup = (atomId: string): DataAtom[] => {
    const { connsFrom, connsTo } = atomIndex;
    const visited = new Set<string>();
    const group: DataAtom[] = [];
    const queue: string[] = [atomId];
    visited.add(atomId);

    while (queue.length > 0) {
      const currId = queue.shift()!;
      const da = atoms.find(a => a.id === currId);
      if (da) group.push(da);
      const fromList = connsFrom.get(currId) || [];
      const toList = connsTo.get(currId) || [];
      for (let i = 0; i < fromList.length; i++) {
        const otherId = fromList[i].to;
        if (otherId && !visited.has(otherId)) {
          visited.add(otherId);
          queue.push(otherId);
        }
      }
      for (let i = 0; i < toList.length; i++) {
        const otherId = toList[i].from;
        if (otherId && !visited.has(otherId)) {
          visited.add(otherId);
          queue.push(otherId);
        }
      }
    }

    return group;
  };

  const saveInputChain = (chain: {
    typeId: string; value: string
  }[]): string => {
    if (chain.length === 0) return '';
    const validChain = chain.filter(item => item.value.trim() !== '');
    if (validChain.length === 0) return '';

    const resolved = validChain.map(item => {
      const bp = blueprintById(item.typeId);
      const typeName = bp?.name || 'unknown';
      const trimmedValue = item.value.trim();
      const existing = allAtoms.find(a =>
        !a.deletedAt && !a.from && !a.to && a.type === typeName &&
        (a.value || '').trim().toLowerCase() === trimmedValue.toLowerCase()
      );
      return {
        typeId: item.typeId, typeName, value: trimmedValue, existingAtom: existing || null
      };
    });

    const allExist = resolved.every(r => r.existingAtom !== null);

    if (allExist) {
      const existingIds = resolved.map(r => r.existingAtom!.id);
      let allConnected = true;
      for (let i = 0; i < existingIds.length && allConnected; i++) {
        for (let j = i + 1; j < existingIds.length && allConnected; j++) {
          const linked = allAtoms.some(a =>
            !a.deletedAt && (
              (a.from === existingIds[i] && a.to === existingIds[j]) ||
              (a.from === existingIds[j] && a.to === existingIds[i])
            )
          );
          if (!linked) allConnected = false;
        }
      }
      if (allConnected) return existingIds[0];

      const newConns: Atom[] = [];
      for (let i = 0; i < existingIds.length; i++) {
        for (let j = i + 1; j < existingIds.length; j++) {
          const linked = allAtoms.some(a =>
            !a.deletedAt && (
              (a.from === existingIds[i] && a.to === existingIds[j]) ||
              (a.from === existingIds[j] && a.to === existingIds[i])
            )
          );
          if (!linked) {
            newConns.push({
              id: `a-${uuid()}`, type: '연결', from: existingIds[i], to: existingIds[j], createdAt: Date.now()
            });
          }
        }
      }
      if (newConns.length > 0) setAllAtoms(prev => [...prev, ...newConns]);
      return existingIds[0];
    }

    const finalIds: string[] = [];
    const newAtomsList: Atom[] = [];

    resolved.forEach(r => {
      if (r.existingAtom) {
        finalIds.push(r.existingAtom.id);
      } else {
        const newA: Atom = {
          id: `a-${uuid()}`, type: r.typeName, value: r.value, createdAt: Date.now()
        };
        finalIds.push(newA.id);
        newAtomsList.push(newA);
      }
    });

    const newConns: Atom[] = [];
    for (let i = 0; i < finalIds.length; i++) {
      for (let j = i + 1; j < finalIds.length; j++) {
        const linked = allAtoms.some(a =>
          !a.deletedAt && (
            (a.from === finalIds[i] && a.to === finalIds[j]) ||
            (a.from === finalIds[j] && a.to === finalIds[i])
          )
        );
        if (!linked) {
          newConns.push({
            id: `a-${uuid()}`, type: '연결', from: finalIds[i], to: finalIds[j], createdAt: Date.now()
          });
        }
      }
    }

    setAllAtoms(prev => [...prev, ...newAtomsList, ...newConns]);
    return finalIds[0];
  };

  const updateConnectedGroup = (anchorAtomId: string, groupData: {
    typeId: string; value: string
  }[]) => {
    const anchor = atoms.find(a => a.id === anchorAtomId);
    if (!anchor) return;
    const existingNeighbors = getNeighbors(anchorAtomId);

    // 앵커 아톰(이름 등 개인 고유값)은 직접 값 수정
    const anchorInput = groupData.find(item => item.typeId === anchor.typeId);
    if (anchorInput) updateAtom(anchorAtomId, anchorInput.value);

    groupData.forEach(item => {
      if (item.typeId === anchor.typeId) return;

      const newVal = item.value.trim();
      const existing = existingNeighbors.find(n => n.typeId === item.typeId);

      if (existing) {
        if (newVal === '') {
          // 빈 값 → 기존 아톰과의 링크만 끊음 (아톰 자체는 보존 — 다른 사람이 참조 중일 수 있음)
          unlinkAtoms(anchorAtomId, existing.id);
        } else if (newVal !== existing.value.trim()) {
          // 값이 변경됨 → 기존 링크를 끊고, 새 값의 아톰을 찾거나 생성해 연결
          unlinkAtoms(anchorAtomId, existing.id);

          // 같은 typeId + 같은 값을 가진 기존 아톰 재사용 (공유 참조)
          const reusable = atoms.find(a => a.typeId === item.typeId && a.value.trim() === newVal);
          if (reusable) {
            // 이미 존재하는 아톰에 링크만 추가
            linkAtoms(anchorAtomId, reusable.id);
          } else {
            // 새 아톰 생성 후 링크
            const bp = blueprintById(item.typeId);
            const typeName = bp?.name || 'unknown';
            const newId = createAtom(typeName, newVal);
            createAtom('연결', undefined, anchorAtomId, newId);
          }
        }
        // 값이 동일하면 아무것도 하지 않음 (그대로 유지)
      } else if (newVal !== '') {
        // 새 필드 추가: 기존 아톰 재사용 or 신규 생성
        const reusable = atoms.find(a => a.typeId === item.typeId && a.value.trim() === newVal);
        if (reusable) {
          linkAtoms(anchorAtomId, reusable.id);
        } else {
          const bp = blueprintById(item.typeId);
          const typeName = bp?.name || 'unknown';
          const newId = createAtom(typeName, newVal);
          createAtom('연결', undefined, anchorAtomId, newId);
        }
      }
    });

    // groupData에 없는 필드(체크박스로 제거된 필드) → 링크만 끊음
    existingNeighbors.forEach(n => {
      const isKept = groupData.some(item => item.typeId === n.typeId);
      if (!isKept) unlinkAtoms(anchorAtomId, n.id);
    });
  };

  const deleteConnectedGroup = (anchorAtomId: string) => {
    const neighbors = getNeighbors(anchorAtomId);
    const allIds = [anchorAtomId, ...neighbors.map(n => n.id)];
    setAllAtoms(prev => prev.map(a => {
      if (allIds.includes(a.id)) return { ...a, deletedAt: Date.now() };
      if (a.from && allIds.includes(a.from)) return { ...a, deletedAt: Date.now() };
      if (a.to && allIds.includes(a.to)) return { ...a, deletedAt: Date.now() };
      return a;
    }));
  };

  const storeValue = {
    blueprints, allAtoms, domains, activeDomain, relations,
    setActiveDomainById, addDomain, updateDomain, deleteDomain,
    addRelation, deleteRelation, getRelationsForDomain, createLinkedDomainFromRecord,
    getFieldsForDomain, getAtomsForDomain, getAllPersonData,
    addEntityToDomain, addFieldToDomain, updateEntityField, removeEntityFromDomain,
    linkEntityToDomain, unlinkEntityFromDomain, getEntityDomains,
    deduplicateDomain, createAtom, softDeleteAtom, restoreAtom,
    getConnected, getHistory, assemble,
    createBlueprint, updateBlueprint, deleteBlueprint,
    getFieldValues, updateFieldValue, deleteFieldValue, deleteFieldValues, addFieldValue,
    types, atoms, links,
    addTypeDef, updateTypeDef, deleteTypeDef,
    findTypeByNameOrSynonym, searchTypes,
    addAtom, updateAtom, deleteAtom, getAtomsByType, searchAtoms,
    linkAtoms, unlinkAtoms, getNeighbors, getConnectedGroup,
    saveInputChain, updateConnectedGroup, deleteConnectedGroup,
    searchConditions, setSearchConditions,
    searchChain, setSearchChain,
    isInputMode, setIsInputMode,
  };

  if (typeof window !== 'undefined') {
    (window as any).__dataStore = storeValue;
  }

  return (
    <DataStoreContext.Provider value={storeValue}>
      {children}
    </DataStoreContext.Provider>
  );
};

export const useDataStore = () => {
  const context = useContext(DataStoreContext);
  if (!context) {
    throw new Error('useDataStore must be used within a DataStoreProvider');
  }
  return context;
};
