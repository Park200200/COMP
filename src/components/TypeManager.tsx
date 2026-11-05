import React, { useState, useRef } from 'react';
import { useDataStore } from '../store/useDataStore';
import type { DataTypeDef } from '../types';
import { X, Edit2, Trash2, Check, Tag, Database, GitBranch, Type, AlignLeft, FolderTree, Phone, Calendar, Hash, Image as ImageIcon, Camera } from 'lucide-react';
import { IconSelect, type IconSelectOption } from './IconSelect';
import './TypeManager.css';

interface TypeManagerProps {
  onClose: () => void;
}


const TYPE_INPUT_OPTIONS: IconSelectOption[] = [
  { value: 'text', label: '일반 단문 텍스트 (text)', icon: Type },
  { value: 'textarea', label: '장문 텍스트 박스 (textarea)', icon: AlignLeft },
  { value: 'tree', label: '트리 계층 필드 (tree)', icon: FolderTree },
  { value: 'tel', label: '전화번호 형식 (tel)', icon: Phone },
  { value: 'date', label: '달력 날짜 선택기 (date)', icon: Calendar },
  { value: 'number', label: '숫자 전용 필드 (number)', icon: Hash },
  { value: 'image', label: '이미지 / 사진 (image)', icon: ImageIcon },
  { value: 'camera', label: '카메라 연결 (camera)', icon: Camera },
];

export const TypeManager: React.FC<TypeManagerProps> = ({ onClose }) => {
  const {
    types,
    atoms,
    addTypeDef,
    updateTypeDef,
    deleteTypeDef,
    getNeighbors
  } = useDataStore();

  const [activeTab, setActiveTab] = useState<'types' | 'data' | 'map'>('types');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedLink, setExpandedLink] = useState<string | null>(null);
  const [mapCenterAtomId, setMapCenterAtomId] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  
  // 폼 상태
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [synonyms, setSynonyms] = useState<string[]>([]);
  const [inputType, setInputType] = useState<DataTypeDef['inputType']>('text');
  const [displayWidth, setDisplayWidth] = useState<DataTypeDef['displayWidth']>('half');
  
  const [synonymInput, setSynonymInput] = useState('');

  // 편집 모드 세팅
  const startEdit = (t: DataTypeDef) => {
    setEditingId(t.id);
    setName(t.name);
    setDescription(t.description);
    setSynonyms(t.synonyms.filter(s => s !== t.name));
    setInputType(t.inputType);
    setDisplayWidth(t.displayWidth);
    setSynonymInput('');
  };

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setDescription('');
    setSynonyms([]);
    setInputType('text');
    setDisplayWidth('half');
    setSynonymInput('');
  };

  const handleSynonymAdd = () => {
    const val = synonymInput.trim();
    if (val && !synonyms.includes(val) && val !== name) {
      setSynonyms(prev => [...prev, val]);
    }
    setSynonymInput('');
  };

  const handleSynonymKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      handleSynonymAdd();
    }
  };

  const removeSynonym = (syn: string) => {
    setSynonyms(prev => prev.filter(s => s !== syn));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    if (editingId) {
      updateTypeDef(editingId, {
        name: name.trim(),
        description: description.trim(),
        synonyms: synonyms,
        inputType,
        displayWidth
      });
      alert('데이터 종류가 수정되었습니다.');
    } else {
      addTypeDef(name.trim(), synonyms, description.trim(), inputType, displayWidth);
      alert('새로운 데이터 종류가 등록되었습니다.');
    }
    resetForm();
  };

  const handleDelete = (id: string, typeName: string) => {
    if (window.confirm(`"${typeName}" 종류를 삭제하시겠습니까? 연결된 모든 데이터 조각들도 제거됩니다.`)) {
      deleteTypeDef(id);
      if (editingId === id) resetForm();
    }
  };

  // DATA 탭: 같은 값 그룹핑 + 연결 종류별 고유 값 수 합산
  const getDataByType = () => {
    return types.map(t => {
      const typeAtoms = atoms.filter(a => a.typeId === t.id);
      
      // 같은 value끼리 그룹핑
      const valueMap = new Map<string, { atomIds: string[]; typeDetails: Map<string, Set<string>> }>();
      
      typeAtoms.forEach(atom => {
        const neighbors = getNeighbors(atom.id);
        if (neighbors.length === 0) return;
        
        const existing = valueMap.get(atom.value) || { 
          atomIds: [], 
          typeDetails: new Map<string, Set<string>>() 
        };
        existing.atomIds.push(atom.id);
        
        neighbors.forEach(n => {
          const typeName = types.find(tp => tp.id === n.typeId)?.name || '알수없음';
          const valSet = existing.typeDetails.get(typeName) || new Set<string>();
          valSet.add(n.value);
          existing.typeDetails.set(typeName, valSet);
        });
        
        valueMap.set(atom.value, existing);
      });
      
      const grouped = Array.from(valueMap.entries()).map(([value, data]) => {
        const typeDetails = Array.from(data.typeDetails.entries()).map(([typeName, valSet]) => ({
          typeName,
          count: valSet.size,
          values: Array.from(valSet)
        }));
        const totalLinked = typeDetails.reduce((sum, td) => sum + td.count, 0);
        return {
          value,
          atomIds: data.atomIds,
          neighborCount: totalLinked,
          typeDetails
        };
      });
      
      return { type: t, items: grouped };
    });
  };

  const toggleLink = (value: string, typeId: string, typeName: string) => {
    const key = `${typeId}::${value}::${typeName}`;
    setExpandedLink(prev => prev === key ? null : key);
  };

  return (
    <div className="type-manager-overlay">
      <div className="type-manager-container">
        
        {/* 모달 헤더 */}
        <div className="type-manager-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h2>데이터 관리</h2>
            <div className="tm-tab-group">
              <button 
                className={`tm-tab-btn ${activeTab === 'types' ? 'active' : ''}`}
                onClick={() => setActiveTab('types')}
              >
                종류
              </button>
              <button 
                className={`tm-tab-btn ${activeTab === 'data' ? 'active' : ''}`}
                onClick={() => setActiveTab('data')}
              >
                <Database size={13} />
                DATA
              </button>
              <button 
                className={`tm-tab-btn ${activeTab === 'map' ? 'active' : ''}`}
                onClick={() => setActiveTab('map')}
              >
                <GitBranch size={13} />
                MAP
              </button>
            </div>
          </div>
          <button className="btn-secondary" style={{ padding: '6px' }} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="type-manager-content">

          {/* 종류 탭 */}
          {activeTab === 'types' && (
            <>
              {/* 생성 / 수정 폼 */}
              <div className="type-form-card">
                <h3 className="type-form-title">
                  {editingId ? '데이터 종류 정보 수정' : '새로운 데이터 종류 등록'}
                </h3>
                
                <form onSubmit={handleSubmit} className="type-form-grid">
                  
                  <div className="form-group">
                    <label className="form-label">정식 종류 이름 (필수)</label>
                    <input
                      type="text"
                      className="form-input"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="예: 이메일, 거주지, 회사연락처"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">동의어 관리 (이명/유사어 검색용)</label>
                    <div className="synonym-tags-container">
                      {synonyms.map(s => (
                        <span key={s} className="synonym-tag">
                          <Tag size={10} />
                          {s}
                          <button type="button" className="synonym-tag-remove" onClick={() => removeSynonym(s)}>
                            <X size={10} />
                          </button>
                        </span>
                      ))}
                      <input
                        type="text"
                        className="synonym-input"
                        value={synonymInput}
                        onChange={(e) => setSynonymInput(e.target.value)}
                        onKeyDown={handleSynonymKeyDown}
                        onBlur={handleSynonymAdd}
                        placeholder="동의어 입력 후 엔터 또는 쉼표"
                      />
                    </div>
                  </div>

                  <div className="form-group full-width">
                    <label className="form-label">데이터 정의 및 설명</label>
                    <input
                      type="text"
                      className="form-input"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="이 종류가 무엇을 기록하고 관리하는지에 대한 정보 설명"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">입력 컨트롤 형식 (Widget Type)</label>
                    <IconSelect
                      value={inputType}
                      onChange={(val) => setInputType(val as any)}
                      options={TYPE_INPUT_OPTIONS}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">출력 배치 크기 (Layout Width)</label>
                    <select 
                      className="form-input" 
                      value={displayWidth} 
                      onChange={(e) => setDisplayWidth(e.target.value as any)}
                    >
                      <option value="third">카드 폭의 33% 1/3 폭 정렬 (Third)</option>
                      <option value="half">카드 폭의 50% 반 폭 정렬 (Half)</option>
                      <option value="full">카드 폭의 100% 한 줄 전체 차지 (Full)</option>
                      <option value="thumbnail">썸네일 / 프로필형 (Thumbnail)</option>
                    </select>
                  </div>

                  <div className="form-group full-width" style={{ display: 'flex', flexDirection: 'row', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                    {editingId && (
                      <button type="button" className="btn-secondary" onClick={resetForm}>
                        취소
                      </button>
                    )}
                    <button type="submit" className="btn-primary">
                      <Check size={16} />
                      {editingId ? '수정 사항 저장' : '새로운 종류 생성'}
                    </button>
                  </div>

                </form>
              </div>

              {/* 등록된 종류 리스트 */}
              <div className="types-list-section">
                <h3 className="types-list-title">등록된 데이터 종류 ({types.length}개)</h3>
                
                <div className="types-grid">
                  {types.map(t => (
                    <div key={t.id} className="type-list-card">
                      <div className="type-info-main">
                        <div className="type-name-badge">
                          <h4>{t.name}</h4>
                          <span className="badge badge-primary" style={{ fontSize: '0.65rem', padding: '1px 6px' }}>
                            {t.inputType} / {t.displayWidth}
                          </span>
                          <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#6366f1', background: 'rgba(99,102,241,0.08)', padding: '1px 8px', borderRadius: '10px' }}>
                            {atoms.filter(a => a.typeId === t.id).length}건
                          </span>
                        </div>
                        {t.description && <span className="type-desc">{t.description}</span>}
                        {t.synonyms.length > 1 && (
                          <div className="type-synonyms-row">
                            {t.synonyms.filter(s => s !== t.name).map(s => (
                              <span key={s} className="type-mini-tag">{s}</span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="type-actions">
                        <button className="btn-secondary" style={{ padding: '6px' }} onClick={() => startEdit(t)} title="수정">
                          <Edit2 size={14} />
                        </button>
                        <button className="btn-secondary" style={{ padding: '6px', color: 'var(--error)' }} onClick={() => handleDelete(t.id, t.name)} title="삭제">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* DATA 탭 */}
          {activeTab === 'data' && (
            <div className="data-tab-content">
              {getDataByType().map(({ type, items }) => (
                items.length > 0 && (
                  <div key={type.id} className="data-type-section">
                    <div className="data-type-header">
                      <h4>{type.name}</h4>
                      <span className="data-type-count">{items.length}건</span>
                    </div>
                    <div className="data-items-grid">
                      {items.map(({ value, neighborCount, typeDetails }) => (
                        <div key={value} className="data-item-card">
                          <div className="data-item-top">
                            <span className="data-item-value">{value}</span>
                            <span className="data-link-total">{neighborCount}</span>
                          </div>
                          <div className="data-item-links">
                            {typeDetails.map(({ typeName, count }) => (
                              <span
                                key={typeName}
                                className={`data-link-tag clickable ${expandedLink === `${type.id}::${value}::${typeName}` ? 'active' : ''}`}
                                onClick={() => toggleLink(value, type.id, typeName)}
                              >
                                {typeName}<strong>{count}</strong>
                              </span>
                            ))}
                          </div>
                          {typeDetails.map(({ typeName, values }) => (
                            expandedLink === `${type.id}::${value}::${typeName}` && (
                              <div key={typeName} className="data-link-detail">
                                {values.map((v, i) => (
                                  <span key={i} className="data-link-value">{v}</span>
                                ))}
                              </div>
                            )
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              ))}
            </div>
          )}

          {/* MAP 탭 */}
          {activeTab === 'map' && (() => {
            const connectedAtoms = atoms.filter(a => getNeighbors(a.id).length > 0);
            const centerAtom = mapCenterAtomId ? atoms.find(a => a.id === mapCenterAtomId) : null;
            
            // 종류별 색상 팔레트
            const typeColors: Record<string, string> = {};
            const palette = ['#6366f1', '#ec4899', '#14b8a6', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#84cc16', '#f97316', '#a855f7', '#3b82f6', '#10b981', '#e11d48'];
            types.forEach((t, i) => { typeColors[t.id] = palette[i % palette.length]; });

            const W = 780, H = 500;
            const CX = W / 2, CY = H / 2;

            // 중심 노드의 연결 데이터 계산
            let mapNodes: { id: string; value: string; typeId: string; typeName: string; x: number; y: number; isCenter: boolean }[] = [];
            let mapEdges: { x1: number; y1: number; x2: number; y2: number; color: string }[] = [];

            if (centerAtom) {
              const neighbors = getNeighbors(centerAtom.id);
              // 종류별 그룹핑
              const byType = new Map<string, typeof neighbors>();
              neighbors.forEach(n => {
                const arr = byType.get(n.typeId) || [];
                arr.push(n);
                byType.set(n.typeId, arr);
              });

              // 중심 노드
              const centerTypeName = types.find(t => t.id === centerAtom.typeId)?.name || '';
              mapNodes.push({ id: centerAtom.id, value: centerAtom.value, typeId: centerAtom.typeId, typeName: centerTypeName, x: CX, y: CY, isCenter: true });

              // 종류별로 부채꼴 배치
              const typeGroups = Array.from(byType.entries());
              const totalTypes = typeGroups.length;
              const anglePerType = (2 * Math.PI) / Math.max(totalTypes, 1);

              typeGroups.forEach(([typeId, groupAtoms], typeIdx) => {
                const baseAngle = typeIdx * anglePerType - Math.PI / 2;
                const typeName = types.find(t => t.id === typeId)?.name || '';
                const radius = 160;
                
                groupAtoms.forEach((n, ni) => {
                  const spread = groupAtoms.length > 1 ? (anglePerType * 0.6) : 0;
                  const angle = baseAngle + (groupAtoms.length > 1 ? (ni / (groupAtoms.length - 1) - 0.5) * spread : 0);
                  const r = radius + (ni % 2) * 40;
                  const nx = CX + Math.cos(angle) * r;
                  const ny = CY + Math.sin(angle) * r;
                  
                  mapNodes.push({ id: n.id, value: n.value, typeId, typeName, x: nx, y: ny, isCenter: false });
                  mapEdges.push({ x1: CX, y1: CY, x2: nx, y2: ny, color: typeColors[typeId] || '#94a3b8' });
                });
              });
            }

            return (
              <div className="map-tab-content">
                {/* 노드 선택 */}
                <div className="map-selector">
                  <select 
                    className="form-input"
                    value={mapCenterAtomId || ''}
                    onChange={e => setMapCenterAtomId(e.target.value || null)}
                    style={{ maxWidth: '300px' }}
                  >
                    <option value="">중심 데이터를 선택하세요</option>
                    {types.map(t => {
                      const ta = connectedAtoms.filter(a => a.typeId === t.id);
                      // 같은 값 중복 제거
                      const unique = Array.from(new Map(ta.map(a => [a.value, a])).values());
                      if (unique.length === 0) return null;
                      return (
                        <optgroup key={t.id} label={`${t.name} (${unique.length})`}>
                          {unique.map(a => (
                            <option key={a.id} value={a.id}>{a.value}</option>
                          ))}
                        </optgroup>
                      );
                    })}
                  </select>
                  {/* 종류 범례 */}
                  <div className="map-legend">
                    {types.map(t => (
                      <span key={t.id} className="map-legend-item">
                        <span className="map-legend-dot" style={{ background: typeColors[t.id] }}></span>
                        {t.name}
                      </span>
                    ))}
                  </div>
                </div>

                {/* SVG 마인드맵 */}
                {centerAtom ? (
                  <div className="map-svg-wrapper">
                    <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="map-svg">
                      {/* 연결선 */}
                      {mapEdges.map((e, i) => (
                        <line key={i} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} stroke={e.color} strokeWidth={2} strokeOpacity={0.3} />
                      ))}
                      {/* 노드 */}
                      {mapNodes.map(node => {
                        const color = typeColors[node.typeId] || '#94a3b8';
                        const r = node.isCenter ? 40 : 30;
                        return (
                          <g key={node.id} 
                            onClick={() => !node.isCenter && setMapCenterAtomId(node.id)}
                            style={{ cursor: node.isCenter ? 'default' : 'pointer' }}
                          >
                            <circle cx={node.x} cy={node.y} r={r} fill={node.isCenter ? color : '#ffffff'} stroke={color} strokeWidth={node.isCenter ? 3 : 2} />
                            {!node.isCenter && <circle cx={node.x} cy={node.y} r={r} fill={color} fillOpacity={0.08} />}
                            <text x={node.x} y={node.y - 6} textAnchor="middle" fontSize={node.isCenter ? 11 : 9} fontWeight={node.isCenter ? 700 : 500} fill={node.isCenter ? '#fff' : '#1e293b'}>
                              {node.value.length > 8 ? node.value.slice(0, 8) + '…' : node.value}
                            </text>
                            <text x={node.x} y={node.y + 10} textAnchor="middle" fontSize={8} fill={node.isCenter ? 'rgba(255,255,255,0.7)' : color} fontWeight={600}>
                              {node.typeName}
                            </text>
                          </g>
                        );
                      })}
                    </svg>
                  </div>
                ) : (
                  <div className="map-empty">
                    <GitBranch size={48} strokeWidth={1} color="#cbd5e1" />
                    <p>중심이 될 데이터를 선택하면 연결 관계가 마인드맵으로 표시됩니다.</p>
                  </div>
                )}
              </div>
            );
          })()}

        </div>

      </div>
    </div>
  );
};
