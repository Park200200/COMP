import React, { useState } from 'react';
import { useDataStore } from '../store/useDataStore';
import { ClipboardList, Plus, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';
import './QuickForm.css';

interface QuickFormProps {
  onSaveSuccess: (anchorId: string) => void;
}

export const QuickForm: React.FC<QuickFormProps> = ({ onSaveSuccess }) => {
  const { types, addTypeDef, saveInputChain } = useDataStore();

  const [isCollapsed, setIsCollapsed] = useState(false);

  // 템플릿 필드 값 상태
  const [name, setName] = useState('');
  const [tel, setTel] = useState('');
  const [birth, setBirth] = useState('');
  const [ssn, setSsn] = useState('');
  const [bizno, setBizno] = useState('');
  const [email, setEmail] = useState('');

  // 특정 종류 이름을 가진 typeId를 조회 또는 동적 생성
  const getOrCreateType = (nameStr: string, synonyms: string[], inputType: any, desc: string) => {
    const existing = types.find(t => t.name === nameStr);
    if (existing) return existing.id;
    // 없을 경우 동적 추가
    const newType = addTypeDef(nameStr, synonyms, desc, inputType, 'half');
    return newType.id;
  };

  const handleReset = () => {
    setName('');
    setTel('');
    setBirth('');
    setSsn('');
    setBizno('');
    setEmail('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() && !tel.trim() && !birth.trim() && !ssn.trim() && !bizno.trim() && !email.trim()) {
      alert('최소 하나의 필드는 입력되어야 합니다.');
      return;
    }

    // 각 필드의 타겟 typeId 획득
    const nameTypeId = getOrCreateType('이름', ['성명', 'name'], 'text', '이름');
    const telTypeId = getOrCreateType('전화번호', ['연락처', 'phone'], 'tel', '전화번호');
    const birthTypeId = getOrCreateType('생일', ['생년월일', 'birthday'], 'date', '생일');
    const ssnTypeId = getOrCreateType('주민번호', ['ssn'], 'text', '주민등록번호');
    const biznoTypeId = getOrCreateType('사업자번호', ['bizno'], 'text', '사업자등록번호');
    const emailTypeId = getOrCreateType('이메일', ['email', '메일'], 'text', '이메일 주소');

    // 입력된 값들만 추려서 체인 빌딩
    const chain: { typeId: string; value: string }[] = [];
    
    chain.push({ typeId: nameTypeId, value: name });
    if (tel.trim()) chain.push({ typeId: telTypeId, value: tel });
    if (birth.trim()) chain.push({ typeId: birthTypeId, value: birth });
    if (ssn.trim()) chain.push({ typeId: ssnTypeId, value: ssn });
    if (bizno.trim()) chain.push({ typeId: biznoTypeId, value: bizno });
    if (email.trim()) chain.push({ typeId: emailTypeId, value: email });

    // 일괄 저장 수행
    const anchorId = saveInputChain(chain);
    if (anchorId) {
      handleReset();
      onSaveSuccess(anchorId);
      alert('템플릿 데이터가 성공적으로 일괄 등록되었습니다.');
    }
  };

  // Shift + Enter 일괄 등록 단축키 연동
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.shiftKey && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="quick-form-wrapper" onKeyDown={handleKeyDown}>
      <div className="quick-form-card">
        
        {/* 헤더 토글 */}
        <div className="quick-form-header" onClick={() => setIsCollapsed(prev => !prev)}>
          <div className="quick-form-header-title">
            <ClipboardList size={18} style={{ color: 'var(--primary-light)' }} />
            <h3>빠른 일괄 템플릿 입력 폼</h3>
            <p>자주 쓰이는 기본 신상/비즈니스 데이터를 한 번에 입력하여 연결 프로필을 생성합니다.</p>
          </div>
          <button className="btn-secondary" style={{ padding: '4px' }}>
            {isCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </button>
        </div>

        {/* 폼 본문 */}
        {!isCollapsed && (
          <form onSubmit={handleSubmit} className="quick-form-grid">
            
            <div className="quick-form-group">
              <label className="quick-form-label">이름</label>
              <input
                type="text"
                className="quick-form-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: 홍길동"
              />
            </div>

            <div className="quick-form-group">
              <label className="quick-form-label">전화번호</label>
              <input
                type="tel"
                className="quick-form-input"
                value={tel}
                onChange={(e) => setTel(e.target.value)}
                placeholder="예: 010-1234-5678"
              />
            </div>

            <div className="quick-form-group">
              <label className="quick-form-label">생년월일</label>
              <input
                type="date"
                className="quick-form-input"
                value={birth}
                onChange={(e) => setBirth(e.target.value)}
              />
            </div>

            <div className="quick-form-group">
              <label className="quick-form-label">주민번호</label>
              <input
                type="text"
                className="quick-form-input"
                value={ssn}
                onChange={(e) => setSsn(e.target.value)}
                placeholder="예: 900101-1234567"
              />
            </div>

            <div className="quick-form-group">
              <label className="quick-form-label">사업자번호</label>
              <input
                type="text"
                className="quick-form-input"
                value={bizno}
                onChange={(e) => setBizno(e.target.value)}
                placeholder="예: 123-45-67890"
              />
            </div>

            <div className="quick-form-group">
              <label className="quick-form-label">이메일</label>
              <input
                type="email"
                className="quick-form-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="예: email@domain.com"
              />
            </div>

            <div className="quick-form-actions">
              <button type="button" className="btn-secondary" onClick={handleReset}>
                <RotateCcw size={14} />
                값 초기화
              </button>
              <button type="submit" className="btn-primary">
                <Plus size={14} />
                프로필 일괄 저장 (Shift+Enter)
              </button>
            </div>

          </form>
        )}

      </div>
    </div>
  );
};
