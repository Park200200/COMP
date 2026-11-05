/**
 * koreanName.ts
 * 한국 성씨 자동 인식 및 성/이름 분리 유틸리티
 *
 * 복성(2자 성씨)을 먼저 검사하고, 단성(1자 성씨)을 후순위로 적용.
 * 저장 형식: "성 이름" (공백 구분)
 */

// ──────────────────────────────────────────────────────────────
// 한국 복성 목록 (2글자 성씨)
// ──────────────────────────────────────────────────────────────
const COMPOUND_SURNAMES: readonly string[] = [
  '남궁', '독고', '사공', '선우', '황보', '제갈', '동방',
  '서문', '서문', '장곡', '망절', '무본', '소봉', '어금',
  '소봉', '소봉', '부여', '즙항', '은정',
];

// ──────────────────────────────────────────────────────────────
// 한국 단성 목록 (빈도순·가나다순 혼합, 등록 성씨 기준)
// ──────────────────────────────────────────────────────────────
const SINGLE_SURNAMES: readonly string[] = [
  '김', '이', '박', '최', '정', '강', '조', '윤', '장', '임',
  '한', '오', '서', '신', '권', '황', '안', '송', '류', '전',
  '홍', '고', '문', '양', '손', '배', '백', '허', '유', '남',
  '심', '노', '정', '하', '곽', '성', '차', '주', '우', '구',
  '민', '유', '나', '진', '지', '엄', '채', '원', '천', '방',
  '공', '강', '현', '함', '변', '염', '여', '추', '도', '소',
  '석', '선', '설', '마', '길', '연', '위', '표', '명', '기',
  '반', '왕', '금', '옥', '육', '인', '맹', '제', '모', '국',
  '어', '은', '편', '팽', '부', '봉', '탁', '감', '갈', '견',
  '경', '계', '곡', '내', '단', '담', '당', '대', '도', '두',
  '등', '마', '망', '매', '맹', '모', '목', '묵', '미', '민',
  '밀', '방', '배', '번', '벽', '별', '복', '봉', '사', '삼',
  '상', '색', '생', '서', '석', '선', '설', '섭', '소', '속',
  '손', '송', '수', '순', '습', '승', '시', '신', '심', '아',
  '악', '안', '애', '야', '양', '어', '언', '여', '연', '예',
  '오', '옥', '온', '완', '왕', '요', '용', '우', '운', '웅',
  '원', '위', '육', '윤', '은', '음', '이', '인', '임', '입',
  '자', '잠', '장', '재', '저', '전', '정', '제', '조', '종',
  '좌', '주', '준', '즙', '지', '진', '차', '창', '채', '천',
  '초', '최', '추', '탁', '탄', '태', '통', '편', '평', '포',
  '표', '풍', '피', '필', '하', '학', '한', '함', '해', '허',
  '혁', '현', '형', '호', '홍', '화', '환', '황',
];

// 중복 제거 및 정렬 (복성은 따로 관리)
const UNIQUE_COMPOUND = [...new Set(COMPOUND_SURNAMES)];
const UNIQUE_SINGLE = [...new Set(SINGLE_SURNAMES)];

/**
 * 한국 이름 문자열에서 성과 이름을 자동 분리합니다.
 *
 * @param name - 입력 이름 (예: "남궁정훈", "박정훈", "박 정훈")
 * @returns [성, 이름] 튜플. 분리 불가 시 ['', name] 반환.
 *
 * @example
 * splitKoreanName("남궁정훈") // ["남궁", "정훈"]
 * splitKoreanName("박정훈")   // ["박", "정훈"]
 * splitKoreanName("박 정훈")  // ["박", "정훈"]
 */
export function splitKoreanName(name: string): [string, string] {
  const trimmed = name.trim();
  if (!trimmed) return ['', ''];

  // 이미 공백으로 분리된 경우
  if (trimmed.includes(' ')) {
    const spaceIdx = trimmed.indexOf(' ');
    const surname = trimmed.slice(0, spaceIdx).trim();
    const givenName = trimmed.slice(spaceIdx + 1).trim();
    return [surname, givenName];
  }

  // 너무 짧으면 전체를 이름으로
  if (trimmed.length <= 1) return ['', trimmed];

  // 복성 우선 검사 (2글자)
  for (const compound of UNIQUE_COMPOUND) {
    if (trimmed.startsWith(compound) && trimmed.length > compound.length) {
      return [compound, trimmed.slice(compound.length)];
    }
  }

  // 단성 검사 (1글자)
  for (const single of UNIQUE_SINGLE) {
    if (trimmed.startsWith(single) && trimmed.length > 1) {
      return [single, trimmed.slice(1)];
    }
  }

  // 매칭 실패: 첫 글자를 성으로 처리
  return [trimmed.slice(0, 1), trimmed.slice(1)];
}

/**
 * 성과 이름을 합쳐서 "성 이름" 형태로 반환합니다.
 */
export function joinKoreanName(surname: string, givenName: string): string {
  const s = surname.trim();
  const g = givenName.trim();
  if (!s && !g) return '';
  if (!s) return g;
  if (!g) return s;
  return `${s} ${g}`;
}
