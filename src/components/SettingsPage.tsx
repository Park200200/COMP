import React from 'react';
import { FieldManager } from './FieldManager';
import './SettingsPage.css';

interface SettingsPageProps {
  onBack: () => void;
}

/**
 * SettingsPage - 기본설정 전체 페이지
 * FieldManager를 모달이 아닌 전체 페이지로 표시
 * onClose를 onBack으로 연결
 */
export const SettingsPage: React.FC<SettingsPageProps> = ({ onBack }) => {
  return (
    <div className="settings-page">
      <FieldManager onClose={onBack} />
    </div>
  );
};
