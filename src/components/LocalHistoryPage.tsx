import React from 'react';
import { BookOpen, ArrowLeft, MapPin, Calendar, Users, FileText, Search, PenLine } from 'lucide-react';

interface LocalHistoryPageProps {
  onBack: () => void;
}

export const LocalHistoryPage: React.FC<LocalHistoryPageProps> = ({ onBack }) => {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#f8fafc',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* 헤더 */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '16px 24px',
        background: '#fff',
        borderBottom: '1px solid #e2e8f0',
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      }}>
        <button
          onClick={onBack}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '6px 12px', borderRadius: '8px',
            border: '1px solid #e2e8f0', background: '#f8fafc',
            color: '#64748b', fontSize: '13px', cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          <ArrowLeft size={16} />
          뒤로
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <BookOpen size={22} style={{ color: '#7c3aed' }} />
          <span style={{ fontSize: '18px', fontWeight: 700, color: '#1e293b' }}>향토사연구</span>
          <span style={{
            fontSize: '11px', background: '#ede9fe', color: '#7c3aed',
            borderRadius: '20px', padding: '2px 10px', fontWeight: 600,
          }}>
            Local History Research
          </span>
        </div>
      </header>

      {/* 메인 콘텐츠 */}
      <main style={{ flex: 1, padding: '32px 24px', maxWidth: '1100px', margin: '0 auto', width: '100%' }}>

        {/* 안내 배너 */}
        <div style={{
          background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)',
          borderRadius: '16px',
          padding: '32px',
          color: '#fff',
          marginBottom: '32px',
          display: 'flex',
          alignItems: 'center',
          gap: '24px',
        }}>
          <BookOpen size={48} style={{ opacity: 0.9, flexShrink: 0 }} />
          <div>
            <h2 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '8px' }}>향토사 연구 관리 시스템</h2>
            <p style={{ fontSize: '14px', opacity: 0.85, lineHeight: 1.6 }}>
              지역의 역사·문화·인물·지명 등 향토 관련 사료를 체계적으로 수집·분류·관리합니다.<br />
              CoLib의 아카이브 기능과 연계하여 디지털 향토지를 구축하세요.
            </p>
          </div>
        </div>

        {/* 기능 카드 그리드 */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: '16px',
          marginBottom: '32px',
        }}>
          {[
            { icon: <MapPin size={28} style={{ color: '#7c3aed' }} />, title: '지명·유적 사료', desc: '지역 내 고지명, 유적지, 문화재 관련 자료를 등록·관리합니다.', color: '#ede9fe' },
            { icon: <Users size={28} style={{ color: '#0891b2' }} />, title: '인물 연구', desc: '지역 역사 인물의 행적, 저술, 관련 기록을 정리합니다.', color: '#e0f2fe' },
            { icon: <Calendar size={28} style={{ color: '#059669' }} />, title: '연표·사건', desc: '향토 관련 주요 사건과 연대기를 시계열로 정리합니다.', color: '#d1fae5' },
            { icon: <FileText size={28} style={{ color: '#d97706' }} />, title: '문헌·고문서', desc: '고문서, 고서, 향토지 등 문헌 사료를 디지털로 보존합니다.', color: '#fef3c7' },
            { icon: <Search size={28} style={{ color: '#dc2626' }} />, title: '사료 검색', desc: '등록된 향토사 사료를 키워드·분류별로 빠르게 검색합니다.', color: '#fee2e2' },
            { icon: <PenLine size={28} style={{ color: '#7c3aed' }} />, title: '연구 노트', desc: '연구 과정에서 발견한 사실과 가설을 기록·공유합니다.', color: '#f3e8ff' },
          ].map((item, idx) => (
            <div
              key={idx}
              style={{
                background: '#fff',
                borderRadius: '12px',
                border: '1px solid #e2e8f0',
                padding: '20px',
                cursor: 'pointer',
                transition: 'box-shadow 0.2s, transform 0.1s',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 16px rgba(0,0,0,0.10)';
                (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
                (e.currentTarget as HTMLDivElement).style.transform = 'none';
              }}
            >
              <div style={{
                width: '52px', height: '52px', borderRadius: '12px',
                background: item.color, display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: '14px',
              }}>
                {item.icon}
              </div>
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>{item.title}</h3>
              <p style={{ fontSize: '12.5px', color: '#64748b', lineHeight: 1.6 }}>{item.desc}</p>
            </div>
          ))}
        </div>

        {/* 준비 중 안내 */}
        <div style={{
          background: '#fff',
          borderRadius: '12px',
          border: '1px solid #e2e8f0',
          padding: '32px',
          textAlign: 'center',
          color: '#94a3b8',
        }}>
          <BookOpen size={40} style={{ marginBottom: '12px', opacity: 0.4 }} />
          <p style={{ fontSize: '14px', fontWeight: 500 }}>향토사연구 세부 기능은 현재 개발 중입니다.</p>
          <p style={{ fontSize: '12px', marginTop: '6px' }}>Archive 및 Archival Description 기능과 연계하여 순차적으로 제공될 예정입니다.</p>
        </div>
      </main>
    </div>
  );
};
