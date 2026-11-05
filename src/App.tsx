import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { DataStoreProvider, useDataStore } from './store/useDataStore';
import { OmniBar } from './components/OmniBar';
import { CrudCard } from './components/CrudCard';
import { TypeManager } from './components/TypeManager';
import { DomainView } from './components/DomainView';
import { FieldManager } from './components/FieldManager';
import { AutoScanPage } from './components/AutoScan/AutoScanPage';
import { SettingsPage } from './components/SettingsPage';
import { OwnerManagerPage } from './components/OwnerManagerPage';
import { OwnerModal } from './components/OwnerModal';
import { ArchiveSearchPage } from './components/ArchiveSearchPage';
import { ArchivalDescriptionPage } from './components/ArchivalDescription/ArchivalDescriptionPage';
import { LocalHistoryPage } from './components/LocalHistoryPage';
import { PlacementSlot } from './components/PlacementSlot';
import { Network, HelpCircle, ExternalLink, Lock, LogIn, LogOut, ChevronDown, ChevronRight, Menu, X, FileText, ScanLine, SlidersHorizontal, UserCog, FolderSearch, Layers, BookOpen } from 'lucide-react';
import logo from './assets/logo.png';
import './App.css';
import type { DataAtom, DataLink } from './types';

// 연결된 아톰 그룹(Connected Components)들을 연산하여 대표 앵커 아톰들을 수집하는 함수
// 동일한 데이터 셋(typeId:value 조합이 같은 그룹)은 한 번만 표시
const getAnchorAtoms = (atoms: DataAtom[], links: DataLink[], nameTypeId?: string) => {
  const visited = new Set<string>();
  const anchors: DataAtom[] = [];
  const seenFingerprints = new Set<string>();

  // 1. 아톰 ID 기반 인접 리스트 생성
  const adj = new Map<string, string[]>();
  atoms.forEach(a => adj.set(a.id, []));
  links.forEach(l => {
    if (adj.has(l.sourceId) && adj.has(l.targetId)) {
      adj.get(l.sourceId)!.push(l.targetId);
      adj.get(l.targetId)!.push(l.sourceId);
    }
  });

  // 2. BFS 탐색으로 연결 성분 수집
  atoms.forEach(atom => {
    if (!visited.has(atom.id)) {
      const component: DataAtom[] = [];
      const queue: string[] = [atom.id];
      visited.add(atom.id);

      while (queue.length > 0) {
        const currId = queue.shift()!;
        const currAtom = atoms.find(a => a.id === currId);
        if (currAtom) {
          component.push(currAtom);
        }

        const neighbors = adj.get(currId) || [];
        neighbors.forEach(nId => {
          if (!visited.has(nId)) {
            visited.add(nId);
            queue.push(nId);
          }
        });
      }

      // 3. 이 컴포넌트(그룹)의 대표 앵커 결정
      if (component.length > 0) {
        // fingerprint: typeId:value 조합을 정렬하여 비교
        const fingerprint = component
          .map(a => `${a.typeId}::${a.value.trim().toLowerCase()}`)
          .sort()
          .join('|||');
        
        // 동일한 데이터 셋이 이미 있으면 건너뜀
        if (seenFingerprints.has(fingerprint)) return;
        seenFingerprints.add(fingerprint);

        // 이름 타입 우선
        let anchor = component.find(a => a.typeId === nameTypeId);
        if (!anchor) {
          anchor = component[0];
        }
        if (anchor) {
          anchors.push(anchor);
        }
      }
    }
  });

  return anchors;
};

const MainDashboard: React.FC = () => {
  const { atoms, links, types, domains, getNeighbors, getConnectedGroup, searchConditions, searchChain, isInputMode, activeDomain, setActiveDomainById, getAtomsForDomain } = useDataStore();
  const [selectedAnchorId, setSelectedAnchorId] = useState<string | null>(null);
  const [isTypeManagerOpen, setIsTypeManagerOpen] = useState(false);
  const [isFieldManagerOpen, setIsFieldManagerOpen] = useState(false);
  
  // 메인 대시보드(상세 콘텐츠 영역) 노출 여부 상태: sessionStorage 복원 지원
  const [showDashboard, setShowDashboard] = useState<boolean>(() => {
    return sessionStorage.getItem('lnote_showDashboard') === 'true';
  });
  // 로고 클릭 시 하위 상태 강제 리셋용 카운터
  const [logoClickTrigger, setLogoClickTrigger] = useState(0);
  // 상단 입력 카드 편집 중 여부 상태 (아래쪽 UI 감춤용)
  const [isInputEditing, setIsInputEditing] = useState(false);
  // 입력 카드가 생성되어 값 기입을 대기하는 상태 여부
  const [isInputActive, setIsInputActive] = useState(false);
  // 아코디언 펼쳐진 행 ID들 (여러 행 동시 펼치기 가능)
  const [expandedRowIds, setExpandedRowIds] = useState<Set<string>>(new Set());
  // 로그인 모달 노출 상태
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isSideMenuOpen, setIsSideMenuOpen] = useState(false);
  const [isLocalHistoryOpen, setIsLocalHistoryOpen] = useState(() => {
    // 향토사연구 서브메뉴: 현재 활성 페이지가 하위 메뉴면 자동 펼침
    try {
      const hash = window.location.hash.replace(/^#\/?/, '').trim();
      return ['autoscan', 'archivesearch', 'archival-description', 'local-history'].includes(hash);
    } catch { return false; }
  });
  const [activePage, setActivePage] = useState<string>(() => {
    try {
      const hash = window.location.hash.replace(/^#\/?/, '').trim();
      const validPages = ['lnote', 'autoscan', 'archivesearch', 'archival-description', 'settings', 'owners', 'local-history'];
      if (hash && validPages.includes(hash)) return hash;
      const stored = localStorage.getItem('colib_active_page');
      if (stored && validPages.includes(stored)) return stored;
      return 'lnote';
    } catch {
      return 'lnote';
    }
  });
  const [showOwnerModal, setShowOwnerModal] = useState(false);

  // 최신 빌드 자동 동기화
  useEffect(() => {
    const CURRENT_VER = '20261026-011400';
    const savedVer = localStorage.getItem('LNOTE_BUILD_VER');
    if (savedVer && savedVer !== CURRENT_VER) {
      localStorage.setItem('LNOTE_BUILD_VER', CURRENT_VER);
      window.location.reload();
    } else if (!savedVer) {
      localStorage.setItem('LNOTE_BUILD_VER', CURRENT_VER);
    }
  }, []);

  // activePage 변경 시 localStorage, sessionStorage 및 window.location.hash 저장 (새로고침 시 현재 페이지 100% 유지)
  useEffect(() => {
    try {
      localStorage.setItem('colib_active_page', activePage);
      sessionStorage.setItem('lnote_activePage', activePage);
      if (window.location.hash.replace(/^#\/?/, '') !== activePage) {
        window.location.hash = activePage;
      }
    } catch { /* ignore */ }
  }, [activePage]);

  // 브라우저 뒤로가기/앞으로가기 (hashchange) 지원
  useEffect(() => {
    const handleHashChange = () => {
      try {
        const hash = window.location.hash.replace(/^#\/?/, '').trim();
        const validPages = ['lnote', 'autoscan', 'archivesearch', 'archival-description', 'settings', 'owners', 'local-history'];
        if (hash && validPages.includes(hash)) {
          setActivePage(hash);
        }
      } catch { /* ignore */ }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // '이름' 종류의 조각들을 앵커 리스트로 로드
  const nameType = types.find(t => t.name === '이름');
  let anchorAtoms = getAnchorAtoms(atoms, links, nameType?.id);

  // 다중 AND 조건 검색 필터링 적용
  // normalize: 공백 제거 + 소문자 변환 (예: "박 근혜" → "박근혜")
  const normalizeVal = (s: string) => s.replace(/\s+/g, '').toLowerCase();

  if (searchConditions && searchConditions.length > 0) {
    anchorAtoms = anchorAtoms.filter(anchor => {
      // getNeighbors + anchor 자체로 그룹 구성 (getConnectedGroup보다 안정적)
      const neighbors = getNeighbors(anchor.id);
      const group = [anchor, ...neighbors];

      return searchConditions.every(cond => {
        const condVal = normalizeVal(cond.value);

        if (cond.typeId === '*') {
          // 전체 필드 검색: 앵커 value 직접 포함 체크 우선 → 그룹 전체 체크
          if (normalizeVal(anchor.value).includes(condVal)) return true;
          return group.some(atom => normalizeVal(atom.value).includes(condVal));
        }

        // 특정 필드 검색:
        // 1) typeId 직접 일치 비교
        // 2) typeId가 불일치해도 condTypeName과 atom 타입명이 일치하면 허용 (blueprint id 불일치 fallback)
        return group.some(atom => {
          const valMatch = normalizeVal(atom.value).includes(condVal);
          if (!valMatch) return false;
          if (atom.typeId === cond.typeId) return true;
          // typeName fallback
          const atomTypeDef = types.find(t => t.id === atom.typeId);
          return atomTypeDef?.name === cond.typeName;
        });
      });
    });
  }

  const handleLoginToggle = () => {
    if (isLoggedIn) {
      setIsLoggedIn(false);
      alert('로그아웃 되었습니다.');
    } else {
      setIsLoginOpen(true);
    }
  };

  const executeLogin = () => {
    setIsLoggedIn(true);
    setIsLoginOpen(false);
    alert('성공적으로 로그인되었습니다!');
  };

  // 좌측 상단 로고 클릭 핸들러 (홈으로 이동: 입력 취소, 검색창 중앙 복구 및 아래 UI 원복)
  const handleLogoClick = () => {
    sessionStorage.removeItem('lnote_showDashboard');
    sessionStorage.removeItem('lnote_activePage');
    localStorage.setItem('colib_active_page', 'lnote');
    window.location.hash = 'lnote';
    setLogoClickTrigger(prev => prev + 1);
    setIsInputEditing(false);
    setSelectedAnchorId(null);
    setShowDashboard(false);
    setActivePage('lnote');
    setActiveDomainById(null);
  };

  return (
    <div className="app-layout">
      {/* 좌측 슬라이드 메뉴 오버레이 */}
      {isSideMenuOpen && (
        <div className="side-menu-overlay" onClick={() => setIsSideMenuOpen(false)} />
      )}

      {/* 좌측 슬라이드 메뉴 */}
      <aside className={`side-menu ${isSideMenuOpen ? 'open' : ''}`}>
        <div className="side-menu-header">
          <span className="side-menu-title">CoLib</span>
          <button className="side-menu-close" onClick={() => setIsSideMenuOpen(false)}>
            <X size={18} />
          </button>
        </div>
        <nav className="side-menu-nav">
          <button 
            className={`side-menu-item ${activePage === 'lnote' ? 'active' : ''}`}
            onClick={() => { setActivePage('lnote'); setIsSideMenuOpen(false); }}
          >
            <FileText size={18} />
            <span>LNote</span>
          </button>

          {/* 향토사연구 (서브메뉴 포함) */}
          <button
            className={`side-menu-item ${['local-history', 'autoscan', 'archivesearch', 'archival-description'].includes(activePage) ? 'active' : ''}`}
            onClick={() => setIsLocalHistoryOpen(prev => !prev)}
            style={{ justifyContent: 'space-between' }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <BookOpen size={18} />
              <span>향토사연구</span>
            </span>
            <ChevronDown
              size={15}
              style={{
                transition: 'transform 0.2s',
                transform: isLocalHistoryOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                color: '#94a3b8',
                flexShrink: 0,
              }}
            />
          </button>

          {/* 서브메뉴 */}
          {isLocalHistoryOpen && (
            <div style={{ overflow: 'hidden' }}>
              <button
                className={`side-menu-item side-menu-sub-item ${activePage === 'local-history' ? 'active' : ''}`}
                onClick={() => { setActivePage('local-history'); setIsSideMenuOpen(false); }}
              >
                <BookOpen size={15} />
                <span>향토사연구 홈</span>
              </button>
              <button
                className={`side-menu-item side-menu-sub-item ${activePage === 'autoscan' ? 'active' : ''}`}
                onClick={() => { setActivePage('autoscan'); setIsSideMenuOpen(false); }}
              >
                <ScanLine size={15} />
                <span>Archive</span>
              </button>
              <button
                className={`side-menu-item side-menu-sub-item ${activePage === 'archival-description' ? 'active' : ''}`}
                onClick={() => { setActivePage('archival-description'); setIsSideMenuOpen(false); }}
              >
                <Layers size={15} />
                <span>Records Research</span>
              </button>
              <button
                className={`side-menu-item side-menu-sub-item ${activePage === 'archivesearch' ? 'active' : ''}`}
                onClick={() => { setActivePage('archivesearch'); setIsSideMenuOpen(false); }}
              >
                <FolderSearch size={15} />
                <span>Archive Search</span>
              </button>
            </div>
          )}

          <div className="side-menu-divider" />
          {/* Placement: 좌측 메뉴에 배치된 도메인 자동 슬롯 */}
          <PlacementSlot
            position="left-menu"
            activeDomainId={activeDomain?.id}
            onSelectDomain={(d) => {
              setActivePage('lnote');
              setActiveDomainById(d.id);
              setShowDashboard(true);
              setIsSideMenuOpen(false);
            }}
          />
          <button
            className={`side-menu-item ${activePage === 'settings' ? 'active' : ''}`}
            onClick={() => { setActivePage('settings'); setIsSideMenuOpen(false); }}
          >
            <SlidersHorizontal size={18} />
            <span>기본설정</span>
          </button>
        </nav>
        <div className="side-menu-footer">
          <span>© 2026 CoLib</span>
        </div>
      </aside>

      {/* 공통 헤더 - autoscan, archival-description, archivesearch 페이지에서는 표시하지 않음 */}
      {activePage !== 'autoscan' && activePage !== 'archival-description' && activePage !== 'archivesearch' && (
        <header className="dashboard-header">
          <div className="header-logo" onClick={handleLogoClick} style={{ cursor: 'pointer' }} title="홈화면으로 돌아가기 (입력 초기화)">
            <img src={logo} alt="LNote Logo" className="logo-image" />
            <div className="logo-text-group">
              <p className="logo-subtitle">조각 데이터 연결 관리 솔루션</p>
            </div>
          </div>

          {/* lnote 페이지 + 검색 활성 시에만 헤더 OmniBar 표시 */}
          {activePage === 'lnote' && showDashboard && (
            <div className="header-search-bar-wrapper">
              <OmniBar
                onSearchSelect={(id) => {
                  if (id) {
                    setSelectedAnchorId(id);
                    setShowDashboard(true);
                  } else {
                    setSelectedAnchorId(null);
                  }
                }}
                onExecuteSearch={() => {
                  sessionStorage.setItem('lnote_showDashboard', 'true');
                  setShowDashboard(true);
                }}
                onOpenSettings={() => setIsTypeManagerOpen(true)}
                resetTrigger={logoClickTrigger}
                onEditingChange={(isEditing) => setIsInputEditing(isEditing)}
                onInputActiveChange={(isActive) => setIsInputActive(isActive)}
              />
            </div>
          )}

          <div className="header-actions">
            {/* 소장자관리 버튼 */}
            <button
              className={`btn-gray-circle${showOwnerModal ? ' active' : ''}`}
              onClick={() => setShowOwnerModal(true)}
              title="소장자 관리"
            >
              <UserCog size={18} />
            </button>
            {/* 로그인 버튼 */}
            <button
              className="btn-gray-circle"
              onClick={handleLoginToggle}
              title={isLoggedIn ? '로그아웃' : '로그인'}
            >
              {isLoggedIn ? <LogOut size={18} /> : <LogIn size={18} />}
            </button>

            {/* 햄버거 메뉴 버튼 - 우측 상단 */}
            <button className="btn-hamburger" onClick={() => setIsSideMenuOpen(true)} title="메뉴">
              <Menu size={20} />
            </button>
          </div>
        </header>
      )}

      {activePage === 'autoscan' ? (
        <div className="page-wrapper">
          <AutoScanPage onBack={() => setActivePage('lnote')} onOpenOwners={() => setShowOwnerModal(true)} />
        </div>
      ) : activePage === 'settings' ? (
        <div className="page-wrapper">
          <SettingsPage onBack={() => setActivePage('lnote')} />
        </div>
      ) : activePage === 'owners' ? (
        <div className="page-wrapper">
          <OwnerManagerPage onBack={() => setActivePage('lnote')} />
        </div>
      ) : activePage === 'archivesearch' ? (
        <ArchiveSearchPage onBack={() => setActivePage('lnote')} />
      ) : activePage === 'archival-description' ? (
        <div className="page-wrapper">
          <ArchivalDescriptionPage onBack={() => setActivePage('lnote')} />
        </div>
      ) : activePage === 'local-history' ? (
        <div className="page-wrapper">
          <LocalHistoryPage onBack={() => setActivePage('lnote')} />
        </div>
      ) : (
    <div className="container animate-fade">

      {/* 2. 도메인 탭 (헤더 아래) - 검색 후 대시보드 모드일 때만 표시 */}
      {showDashboard && <DomainView />}

      {/* 3. 대시보드 상태에 따라 중앙/상단 정렬이 동적 전환되는 메인 영역 */}
      <main className={`main-wrapper ${showDashboard ? 'top-aligned' : 'centered'}`}>

        {/* 3. 우측 상단 1원 버튼 클릭 시에만 드러나는 상세 대시보드 영역 */}
        
        {/* 초기 중앙 검색 화면 (구글 스타일) */}
        {!showDashboard && (
          <div className="centered-search-area">
            <div className="centered-logo" onClick={handleLogoClick} style={{ cursor: 'pointer' }}>
              <img src={logo} alt="LNote Logo" className="centered-logo-image" />
            </div>
            <div className="centered-omnibar-wrapper">
              <OmniBar 
                onSearchSelect={(id) => {
                  if (id) {
                    setSelectedAnchorId(id);
                    setShowDashboard(true);
                  }
                }} 
                onExecuteSearch={() => {
                  sessionStorage.setItem('lnote_showDashboard', 'true');
                  setShowDashboard(true);
                }}
                onOpenSettings={() => setIsTypeManagerOpen(true)}
                resetTrigger={logoClickTrigger}
                onEditingChange={(isEditing) => setIsInputEditing(isEditing)}
                onInputActiveChange={(isActive) => setIsInputActive(isActive)}
              />
            </div>
          </div>
        )}

        {showDashboard && !isInputEditing && !isInputActive && (
          <div className="dashboard-content-area animate-slide-up">

            {/* 하단 영역: 저장된 데이터 앵커 전체 목록 (빠른 탐색 카드 그리드) */}
            <section className="dashboard-footer-grid">
              <div className="grid-header">
                <h3>
                  <Network size={14} style={{ color: 'var(--secondary)', marginRight: '4px' }} />
                  등록된 프로필 목록 ({anchorAtoms.length}명)
                </h3>
                <p>이름 조각을 클릭하면 연결된 세부 정보(전화번호, 주소, 주민번호, 생일 등)가 상세 카드 뷰로 즉시 로드됩니다.</p>
              </div>

              {!isInputMode && searchConditions.length > 0 ? (
                /* ===== 새 검색 결과 레이아웃 ===== */
                (() => {
                  const normalizeVal = (s: string) => s.replace(/\s+/g, '').toLowerCase();
                  const searchVal = searchConditions.map(c => normalizeVal(c.value)).join('');

                  // 1. 도메인별 매칭 집계
                  const domainMatches: { domain: typeof domains[0]; matchedRows: { anchorId: string; rowData: Record<string, string>; displayLabel: string }[] }[] = [];
                  for (const domain of domains) {
                    const rows = getAtomsForDomain(domain.id);
                    const matched = rows.filter(row => {
                      return Object.values(row.data).some(v => normalizeVal(v).includes(searchVal));
                    });
                    if (matched.length > 0) {
                      const domainFields = types.filter(t => domain.fields.includes(t.name));
                      const anchorFieldName = domain.anchor || '이름';
                      domainMatches.push({
                        domain,
                        matchedRows: matched.map(row => ({
                          anchorId: row.anchorId,
                          rowData: row.data,
                          displayLabel: row.data[anchorFieldName] || row.data[Object.keys(row.data)[0]] || row.anchorId,
                        }))
                      });
                    }
                  }

                  return (
                    <div style={{ marginTop: '1rem' }}>
                      {/* ── 상단: 도메인명 + 건수 뱃지 ── */}
                      {domainMatches.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '20px' }}>
                          {domainMatches.map(({ domain, matchedRows }) => (
                            <div key={domain.id} style={{
                              display: 'inline-flex', alignItems: 'center', gap: '6px',
                              padding: '6px 14px', borderRadius: '20px',
                              background: '#f1f5f9', border: '1px solid #e2e8f0',
                              fontSize: '0.84rem', fontWeight: 600, color: '#334155',
                              cursor: 'pointer', transition: 'all 0.15s'
                            }}
                              onClick={() => {
                                const el = document.getElementById(`domain-section-${domain.id}`);
                                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                              }}
                            >
                              <span>{domain.icon}</span>
                              <span>{domain.name}</span>
                              <span style={{
                                background: '#6366f1', color: '#fff',
                                borderRadius: '10px', padding: '1px 8px',
                                fontSize: '0.75rem', fontWeight: 700, minWidth: '20px', textAlign: 'center'
                              }}>{matchedRows.length}</span>
                            </div>
                          ))}
                          {/* anchorAtoms 기반 개인 프로필도 표시 */}
                          {anchorAtoms.length > 0 && (
                            <div style={{
                              display: 'inline-flex', alignItems: 'center', gap: '6px',
                              padding: '6px 14px', borderRadius: '20px',
                              background: '#f0fdf4', border: '1px solid #bbf7d0',
                              fontSize: '0.84rem', fontWeight: 600, color: '#166534',
                              cursor: 'pointer'
                            }}
                              onClick={() => {
                                const el = document.getElementById('profile-section');
                                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                              }}
                            >
                              <span>👤</span>
                              <span>개인 프로필</span>
                              <span style={{
                                background: '#16a34a', color: '#fff',
                                borderRadius: '10px', padding: '1px 8px',
                                fontSize: '0.75rem', fontWeight: 700
                              }}>{anchorAtoms.length}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* ── 하단: 개인 프로필 섹션 ── */}
                      {anchorAtoms.length > 0 && (
                        <div id="profile-section" style={{ marginBottom: '24px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                            <span style={{ fontSize: '1rem' }}>👤</span>
                            <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1e293b' }}>개인 프로필</span>
                            <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>{anchorAtoms.length}건</span>
                          </div>
                          <div style={{ background: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                            {anchorAtoms.map((anchor, ri) => {
                              const neighbors = getNeighbors(anchor.id);
                              const group = [anchor, ...neighbors];
                              return (
                                <div
                                  key={anchor.id}
                                  onClick={() => setSelectedAnchorId(anchor.id)}
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: '12px',
                                    padding: '10px 16px',
                                    borderBottom: ri < anchorAtoms.length - 1 ? '1px solid #f1f5f9' : 'none',
                                    cursor: 'pointer', transition: 'background 0.12s'
                                  }}
                                  onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                >
                                  <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1e293b', minWidth: '80px' }}>
                                    {anchor.value.startsWith('data:image/')
                                      ? <img src={anchor.value} alt="사진" style={{ width: 28, height: 28, objectFit: 'cover', borderRadius: 4, border: '1px solid #cbd5e1' }} />
                                      : anchor.value}
                                  </span>
                                  <span style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                    {group.filter(a => a.id !== anchor.id).slice(0, 5).map(a => {
                                      const t = types.find(tp => tp.id === a.typeId);
                                      return (
                                        <span key={a.id} style={{ fontSize: '0.78rem', color: '#64748b' }}>
                                          <span style={{ color: '#94a3b8', marginRight: 2 }}>{t?.name}:</span>
                                          {a.value.startsWith('data:image/')
                                            ? <img src={a.value} alt={t?.name} style={{ width: 16, height: 16, objectFit: 'cover', borderRadius: 2, verticalAlign: 'middle' }} />
                                            : a.value}
                                        </span>
                                      );
                                    })}
                                  </span>
                                  <ChevronRight size={14} style={{ color: '#cbd5e1', marginLeft: 'auto', flexShrink: 0 }} />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* ── 하단: 도메인별 레코드 섹션 ── */}
                      {domainMatches.map(({ domain, matchedRows }) => {
                        const domainFields = types.filter(t => domain.fields.includes(t.name)).slice(0, 4);
                        return (
                          <div key={domain.id} id={`domain-section-${domain.id}`} style={{ marginBottom: '24px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                              <span style={{ fontSize: '1rem' }}>{domain.icon}</span>
                              <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1e293b' }}>{domain.name}</span>
                              <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>{matchedRows.length}건</span>
                            </div>
                            <div style={{ background: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                              {/* 헤더 */}
                              <div style={{
                                display: 'grid',
                                gridTemplateColumns: `1fr ${domainFields.slice(1).map(() => '1fr').join(' ')} 24px`,
                                padding: '8px 16px',
                                background: '#f8fafc',
                                borderBottom: '1px solid #e2e8f0',
                                fontSize: '0.75rem', fontWeight: 700, color: '#64748b'
                              }}>
                                {domainFields.map(f => <span key={f.id}>{f.name}</span>)}
                                <span />
                              </div>
                              {/* 레코드 행 */}
                              {matchedRows.map((row, ri) => (
                                <div
                                  key={row.anchorId}
                                  style={{
                                    display: 'grid',
                                    gridTemplateColumns: `1fr ${domainFields.slice(1).map(() => '1fr').join(' ')} 24px`,
                                    padding: '10px 16px',
                                    borderBottom: ri < matchedRows.length - 1 ? '1px solid #f1f5f9' : 'none',
                                    cursor: 'pointer', fontSize: '0.87rem', color: '#1e293b',
                                    alignItems: 'center', transition: 'background 0.12s'
                                  }}
                                  onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                >
                                  {domainFields.map((f, fi) => {
                                    const val = row.rowData[f.name];
                                    return (
                                      <span key={f.id} style={{ fontWeight: fi === 0 ? 600 : 400, color: fi === 0 ? '#1e293b' : '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {val
                                          ? val.startsWith('data:image/')
                                            ? <img src={val} alt={f.name} style={{ width: 24, height: 24, objectFit: 'cover', borderRadius: 3, border: '1px solid #cbd5e1', verticalAlign: 'middle' }} />
                                            : val
                                          : <span style={{ color: '#cbd5e1' }}>-</span>}
                                      </span>
                                    );
                                  })}
                                  <ChevronRight size={14} style={{ color: '#cbd5e1', justifySelf: 'end' }} />
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}

                      {/* 아무것도 없을 때 */}
                      {anchorAtoms.length === 0 && domainMatches.length === 0 && (
                        <div style={{ padding: '32px 16px', textAlign: 'center', color: '#94a3b8', fontStyle: 'italic', fontSize: '0.88rem' }}>
                          검색 조건에 부합하는 데이터가 없습니다.
                        </div>
                      )}
                    </div>
                  );
                })()
              ) : (
                /* 기존의 미니 카드 그리드 렌더링 */
                <div className="anchor-cards-grid">
                  {anchorAtoms.map(atom => {
                    const neighbors = getNeighbors(atom.id);
                    return (
                      <div 
                        key={atom.id} 
                        className={`glass-panel anchor-mini-card ${selectedAnchorId === atom.id ? 'active' : ''}`}
                        onDoubleClick={() => setSelectedAnchorId(atom.id)}
                      >
                        <div className="card-top">
                          <h4>
                            {atom.value.startsWith('data:image/') ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <img src={atom.value} alt="대표 사진" style={{ width: 28, height: 28, objectFit: 'cover', borderRadius: 4, border: '1px solid #cbd5e1' }} />
                                <span style={{ fontSize: '0.85rem', color: '#64748b' }}>(사진)</span>
                              </div>
                            ) : (
                              atom.value
                            )}
                          </h4>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <ExternalLink size={14} className="card-link-icon" />
                          </div>
                        </div>
                        <div className="card-body">
                          {neighbors.length > 0 ? (
                            <div className="neighbor-badges-row">
                              {neighbors.slice(0, 3).map(n => {
                                const t = types.find(type => type.id === n.typeId);
                                const isImg = n.value.startsWith('data:image/');
                                return (
                                  <span key={n.id} className="neighbor-mini-tag" title={`${t?.name}: ${isImg ? '(사진)' : n.value}`}>
                                    <strong>{t?.name}</strong> {isImg ? <img src={n.value} alt="thumb" style={{ width: 14, height: 14, objectFit: 'cover', borderRadius: 2, verticalAlign: 'middle', marginLeft: 2 }} /> : n.value}
                                  </span>
                                );
                              })}
                              {neighbors.length > 3 && (
                                <span className="neighbor-mini-tag count">+{neighbors.length - 3}</span>
                              )}
                            </div>
                          ) : (
                            <span className="no-links-text">연결 정보 없음</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* 도움말 카드 (UI 풋터) */}
            <footer className="dashboard-footer-guide glass-panel">
              <HelpCircle size={18} style={{ color: 'var(--primary-light)', marginTop: '2px' }} />
              <div className="guide-content">
                <h4>키보드 중심 고속 조작 가이드</h4>
                <ul>
                  <li><strong>시작하기</strong>: 입력창 포커스 시 <code>입력</code> 또는 <code>검색</code> 모드를 화살표 키로 선택 후 엔터</li>
                  <li><strong>연쇄 데이터 입력</strong>: 값 입력창에서 <code>Tab</code> 또는 <code>Ctrl + Space</code>를 누르면 우측에 새로운 연계 속성 검색창이 즉시 생성</li>
                  <li><strong>즉시 저장 및 카드 뷰 생성</strong>: 입력 흐름 도중 언제든 <code>Shift + Enter</code>를 누르면 화면에 CRUD 카드가 자동 생성되고 로컬 스토리지에 영구 보존</li>
                </ul>
              </div>
            </footer>

          </div>
        )}
      </main>

      {/* 종류 관리 모달 */}
      {isTypeManagerOpen && typeof document !== 'undefined' && createPortal(
        <TypeManager onClose={() => setIsTypeManagerOpen(false)} />,
        document.body
      )}

      {/* 필드 관리 모달 */}
      {isFieldManagerOpen && typeof document !== 'undefined' && createPortal(
        <FieldManager onClose={() => setIsFieldManagerOpen(false)} />,
        document.body
      )}

      {/* 모의 로그인 모달 (WOW 포인트 디자인) */}
      {isLoginOpen && typeof document !== 'undefined' && createPortal(
        <div className="login-modal-overlay" onClick={() => setIsLoginOpen(false)}>
          <div className="login-card animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <Lock size={36} style={{ color: 'var(--primary)' }} />
            <div>
              <h3>NoteL 로그인</h3>
              <p>안전한 조각 데이터 관리를 위해 로그인해 주세요. (데모 서버 연결)</p>
            </div>
            
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <input type="text" className="quick-form-input" placeholder="사용자 계정 (ID)" defaultValue="admin" />
              <input type="password" className="quick-form-input" placeholder="비밀번호" defaultValue="••••••••" />
            </div>

            <div style={{ display: 'flex', gap: '8px', width: '100%', justifyContent: 'stretch' }}>
              <button 
                className="btn-secondary" 
                style={{ flex: 1, justifyContent: 'center' }} 
                onClick={() => setIsLoginOpen(false)}
              >
                취소
              </button>
              <button 
                className="btn-primary" 
                style={{ flex: 1, justifyContent: 'center' }} 
                onClick={executeLogin}
              >
                로그인 완료
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 상세 CRUD 카드 팝업 모달 */}
      {selectedAnchorId && typeof document !== 'undefined' && createPortal(
        <div className="crud-modal-overlay" onClick={() => setSelectedAnchorId(null)}>
          <div className="crud-modal-content" onClick={(e) => e.stopPropagation()}>
            <CrudCard 
              anchorAtomId={selectedAnchorId} 
              onClose={() => setSelectedAnchorId(null)} 
            />
          </div>
        </div>
      , document.body
      )}
    </div>
    )}

    {/* 소장자 관리 모달 */}
    {showOwnerModal && <OwnerModal onClose={() => setShowOwnerModal(false)} />}
  </div>
  );
};

function App() {
  return (
    <DataStoreProvider>
      <MainDashboard />
    </DataStoreProvider>
  );
}

export default App;
