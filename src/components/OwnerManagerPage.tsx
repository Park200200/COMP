import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Plus, Search, Pencil, Trash2, Check, X, User, Phone, MapPin, Mail, FileText, ChevronDown, ChevronUp } from 'lucide-react';
import './OwnerManagerPage.css';

// ── 소장자 데이터 타입 ──
export interface Owner {
  id: string;
  name: string;         // 이름
  phone?: string;       // 연락처
  address?: string;     // 주소
  email?: string;       // 이메일
  memo?: string;        // 메모
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = 'colib_owners';

function loadOwners(): Owner[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveOwners(owners: Owner[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(owners));
}

function uuid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// 전화번호 자동 포맷
function formatPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  if (digits.length <= 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
}

interface OwnerManagerPageProps {
  onBack: () => void;
}

const EMPTY_FORM = { name: '', phone: '', address: '', email: '', memo: '' };

export const OwnerManagerPage: React.FC<OwnerManagerPageProps> = ({ onBack }) => {
  const [owners, setOwners] = useState<Owner[]>(loadOwners);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);   // null = 신규 추가 폼 숨김
  const [isAdding, setIsAdding] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // 저장
  useEffect(() => { saveOwners(owners); }, [owners]);

  // 신규 추가 폼 열릴 때 이름 input 포커스
  useEffect(() => {
    if (isAdding && nameInputRef.current) {
      nameInputRef.current.focus();
    }
  }, [isAdding]);

  // 검색 필터
  const filtered = owners.filter(o =>
    o.name.includes(search) ||
    (o.phone || '').includes(search) ||
    (o.email || '').includes(search) ||
    (o.address || '').includes(search) ||
    (o.memo || '').includes(search)
  ).sort((a, b) => b.updatedAt - a.updatedAt);

  // 신규 추가 시작
  const handleStartAdd = () => {
    setIsAdding(true);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDeleteConfirmId(null);
  };

  // 편집 시작
  const handleStartEdit = (owner: Owner) => {
    setEditingId(owner.id);
    setIsAdding(false);
    setForm({
      name: owner.name,
      phone: owner.phone || '',
      address: owner.address || '',
      email: owner.email || '',
      memo: owner.memo || '',
    });
    setExpandedId(owner.id);
    setDeleteConfirmId(null);
  };

  // 저장 (신규/수정 공용)
  const handleSave = () => {
    const trimName = form.name.trim();
    if (!trimName) return;

    if (isAdding) {
      const newOwner: Owner = {
        id: uuid(),
        name: trimName,
        phone: form.phone.trim() || undefined,
        address: form.address.trim() || undefined,
        email: form.email.trim() || undefined,
        memo: form.memo.trim() || undefined,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setOwners(prev => [newOwner, ...prev]);
      setIsAdding(false);
      setForm(EMPTY_FORM);
    } else if (editingId) {
      setOwners(prev => prev.map(o =>
        o.id === editingId
          ? {
              ...o,
              name: trimName,
              phone: form.phone.trim() || undefined,
              address: form.address.trim() || undefined,
              email: form.email.trim() || undefined,
              memo: form.memo.trim() || undefined,
              updatedAt: Date.now(),
            }
          : o
      ));
      setEditingId(null);
      setForm(EMPTY_FORM);
    }
  };

  // 취소
  const handleCancel = () => {
    setIsAdding(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDeleteConfirmId(null);
  };

  // 삭제
  const handleDelete = (id: string) => {
    setOwners(prev => prev.filter(o => o.id !== id));
    setDeleteConfirmId(null);
    if (editingId === id) { setEditingId(null); setForm(EMPTY_FORM); }
    if (expandedId === id) setExpandedId(null);
  };

  // 폼 필드
  const FormFields = () => (
    <div className="om-form-fields">
      <div className="om-field-row">
        <label><User size={13} /> 이름 <span className="om-required">*</span></label>
        <input
          ref={nameInputRef}
          className="om-input"
          placeholder="소장자 이름"
          value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') handleCancel(); }}
        />
      </div>
      <div className="om-field-row">
        <label><Phone size={13} /> 연락처</label>
        <input
          className="om-input"
          placeholder="010-0000-0000"
          value={form.phone}
          onChange={e => setForm(f => ({ ...f, phone: formatPhone(e.target.value) }))}
          onKeyDown={e => { if (e.key === 'Escape') handleCancel(); }}
        />
      </div>
      <div className="om-field-row">
        <label><Mail size={13} /> 이메일</label>
        <input
          className="om-input"
          placeholder="example@email.com"
          value={form.email}
          onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
          onKeyDown={e => { if (e.key === 'Escape') handleCancel(); }}
        />
      </div>
      <div className="om-field-row">
        <label><MapPin size={13} /> 주소</label>
        <input
          className="om-input"
          placeholder="주소"
          value={form.address}
          onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
          onKeyDown={e => { if (e.key === 'Escape') handleCancel(); }}
        />
      </div>
      <div className="om-field-row">
        <label><FileText size={13} /> 메모</label>
        <textarea
          className="om-textarea"
          placeholder="메모"
          rows={2}
          value={form.memo}
          onChange={e => setForm(f => ({ ...f, memo: e.target.value }))}
        />
      </div>
      <div className="om-form-actions">
        <button className="om-btn-cancel" onClick={handleCancel}><X size={14} /> 취소</button>
        <button className="om-btn-save" onClick={handleSave} disabled={!form.name.trim()}>
          <Check size={14} /> 저장
        </button>
      </div>
    </div>
  );

  return (
    <div className="om-page">
      {/* 헤더 */}
      <div className="om-header">
        <button className="om-back-btn" onClick={onBack} title="뒤로가기">
          <ArrowLeft size={18} />
        </button>
        <span className="om-title">소장자 관리</span>
        <span className="om-count">{owners.length}명</span>
      </div>

      {/* 검색 + 추가 버튼 */}
      <div className="om-toolbar">
        <div className="om-search-wrap">
          <Search size={15} className="om-search-icon" />
          <input
            className="om-search"
            placeholder="이름, 연락처, 이메일로 검색..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className="om-search-clear" onClick={() => setSearch('')}><X size={13} /></button>
          )}
        </div>
        <button className="om-btn-add" onClick={handleStartAdd}>
          <Plus size={15} /> 추가
        </button>
      </div>

      {/* 신규 추가 폼 */}
      {isAdding && (
        <div className="om-form-card om-form-new">
          <div className="om-form-title"><Plus size={14} /> 새 소장자 추가</div>
          <FormFields />
        </div>
      )}

      {/* 목록 */}
      <div className="om-list">
        {filtered.length === 0 && !isAdding && (
          <div className="om-empty">
            {search ? `"${search}" 검색 결과가 없습니다` : '등록된 소장자가 없습니다'}
          </div>
        )}

        {filtered.map(owner => {
          const isExpanded = expandedId === owner.id;
          const isEditing = editingId === owner.id;
          const isDeleteConfirm = deleteConfirmId === owner.id;

          return (
            <div key={owner.id} className={`om-card ${isEditing ? 'om-card-editing' : ''}`}>
              {/* 카드 헤더 */}
              <div className="om-card-header" onClick={() => {
                if (!isEditing) setExpandedId(isExpanded ? null : owner.id);
              }}>
                <div className="om-card-avatar">
                  {owner.name.charAt(0)}
                </div>
                <div className="om-card-info">
                  <span className="om-card-name">{owner.name}</span>
                  {owner.phone && <span className="om-card-sub">{owner.phone}</span>}
                  {!owner.phone && owner.email && <span className="om-card-sub">{owner.email}</span>}
                </div>
                <div className="om-card-actions" onClick={e => e.stopPropagation()}>
                  {!isEditing && !isDeleteConfirm && (
                    <>
                      <button className="om-icon-btn" onClick={() => handleStartEdit(owner)} title="편집">
                        <Pencil size={14} />
                      </button>
                      <button className="om-icon-btn danger" onClick={() => setDeleteConfirmId(owner.id)} title="삭제">
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                  {isDeleteConfirm && (
                    <div className="om-delete-confirm">
                      <span>삭제할까요?</span>
                      <button className="om-btn-del-yes" onClick={() => handleDelete(owner.id)}>삭제</button>
                      <button className="om-btn-del-no" onClick={() => setDeleteConfirmId(null)}>취소</button>
                    </div>
                  )}
                  {!isEditing && !isDeleteConfirm && (
                    <button className="om-icon-btn expand" title={isExpanded ? '접기' : '펼치기'}>
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                  )}
                </div>
              </div>

              {/* 편집 폼 */}
              {isEditing && (
                <div className="om-form-inline">
                  <FormFields />
                </div>
              )}

              {/* 상세 보기 (펼침) */}
              {isExpanded && !isEditing && (
                <div className="om-card-detail">
                  {owner.email && (
                    <div className="om-detail-row">
                      <Mail size={12} />
                      <span>{owner.email}</span>
                    </div>
                  )}
                  {owner.address && (
                    <div className="om-detail-row">
                      <MapPin size={12} />
                      <span>{owner.address}</span>
                    </div>
                  )}
                  {owner.memo && (
                    <div className="om-detail-row memo">
                      <FileText size={12} />
                      <span>{owner.memo}</span>
                    </div>
                  )}
                  <div className="om-detail-date">
                    등록: {new Date(owner.createdAt).toLocaleDateString('ko-KR')}
                    {owner.updatedAt !== owner.createdAt && ` · 수정: ${new Date(owner.updatedAt).toLocaleDateString('ko-KR')}`}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
