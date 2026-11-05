// 입력값 자동 서식 유틸리티

// ── 전화번호 자동 하이픈 ──
// 숫자만 입력하면 자동으로 010-1234-5678 형식으로 변환
export function formatPhoneNumber(value: string): string {
  const digits = value.replace(/\D/g, '');

  // 서울 (02-XXXX-XXXX)
  if (digits.startsWith('02')) {
    if (digits.length <= 2) return digits;
    if (digits.length <= 5) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
    if (digits.length <= 9) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
    return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6, 10)}`;
  }

  // 일반 (010-XXXX-XXXX, 031-XXX-XXXX 등)
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  if (digits.length <= 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
}

// ── 사업자등록번호 자동 하이픈 ──
// 숫자만 입력하면 자동으로 123-45-67890 형식으로 변환
export function formatBusinessNumber(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length <= 3) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5, 10)}`;
}

// ── 주민등록번호 자동 하이픈 ──
// 숫자만 입력하면 자동으로 670724-1328811 형식으로 변환
export function formatSSN(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length <= 6) return digits;
  return `${digits.slice(0, 6)}-${digits.slice(6, 13)}`;
}

// ── 숫자 3자리 콤마 포맷터 ──
export function formatNumberWithCommas(value: string): string {
  const isNegative = value.startsWith('-');
  const clean = value.replace(/[^\d.]/g, '');
  if (!clean) return isNegative ? '-' : '';
  const parts = clean.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const result = parts.length > 1 ? `${parts[0]}.${parts.slice(1).join('')}` : parts[0];
  return isNegative ? `-${result}` : result;
}

// ── 날짜 자동 하이픈 (YYYY-MM-DD) ──
export function formatDateHyphen(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

// ── 날짜 커스텀 체크 항목 정의 ──
export const DATE_PART_OPTIONS = [
  { id: 'calendar', label: '음력/양력', subLabel: '양/음', code: '양/음', sample: '(양)' },
  { id: 'year', label: '년', code: 'YYYY', sample: '2026' },
  { id: 'month', label: '월', code: 'MM', sample: '10' },
  { id: 'day', label: '일', code: 'DD', sample: '28' },
  { id: 'weekday', label: '날자', subLabel: '요일', code: '요일', sample: '(수)' },
  { id: 'hour', label: '시', code: 'HH', sample: '21' },
  { id: 'minute', label: '분', code: 'mm', sample: '17' },
] as const;

export function getDateFormatInfo(parts?: string[], calendarType?: string): { formatStr: string; sampleStr: string } {
  const p = parts && parts.length > 0 ? parts : ['year', 'month', 'day'];
  const hasCalendar = p.includes('calendar');
  const hasYear = p.includes('year');
  const hasMonth = p.includes('month');
  const hasDay = p.includes('day');
  const hasWeekday = p.includes('weekday');
  const hasHour = p.includes('hour');
  const hasMinute = p.includes('minute');

  let calPartStr = '';
  let sampleCalStr = '';
  if (hasCalendar) {
    if (calendarType === 'lunar') {
      calPartStr = '(음)';
      sampleCalStr = '(음)';
    } else if (calendarType === 'solar') {
      calPartStr = '(양)';
      sampleCalStr = '(양)';
    } else {
      calPartStr = '(양/음)';
      sampleCalStr = '(양)';
    }
  }

  const dateTokens: string[] = [];
  const sampleDateTokens: string[] = [];

  if (hasYear) { dateTokens.push('YYYY'); sampleDateTokens.push('2026'); }
  if (hasMonth) { dateTokens.push('MM'); sampleDateTokens.push('10'); }
  if (hasDay) { dateTokens.push('DD'); sampleDateTokens.push('28'); }

  let datePartStr = '';
  let sampleDateStr = '';

  if (dateTokens.length > 0) {
    if (dateTokens.length === 1 && hasYear) {
      datePartStr = 'YYYY년';
      sampleDateStr = '2026년';
    } else {
      datePartStr = dateTokens.join('-');
      sampleDateStr = sampleDateTokens.join('-');
    }
  }

  if (hasWeekday) {
    if (datePartStr) {
      // 시간이 있을 경우엔 요일을 별도 분리하여 처리 위해 weekdayStr을 따로 보관
      datePartStr += ' (요일)';
      sampleDateStr += ' (수)';
    } else {
      datePartStr = '요일';
      sampleDateStr = '수요일';
    }
  }

  const timeTokens: string[] = [];
  const sampleTimeTokens: string[] = [];
  if (hasHour) { timeTokens.push('HH'); sampleTimeTokens.push('21'); }
  if (hasMinute) { timeTokens.push('mm'); sampleTimeTokens.push('17'); }

  let timePartStr = '';
  let sampleTimeStr = '';
  if (timeTokens.length > 0) {
    if (timeTokens.length === 1 && hasHour) {
      timePartStr = 'HH시';
      sampleTimeStr = '21시';
    } else if (timeTokens.length === 1 && hasMinute) {
      timePartStr = 'mm분';
      sampleTimeStr = '17분';
    } else {
      timePartStr = timeTokens.join(':');
      sampleTimeStr = sampleTimeTokens.join(':');
    }
  }

  // 날짜+시간 결합: 날짜부분과 시간부분 사이는 '-' 사용
  const mainFormat = [datePartStr, timePartStr].filter(Boolean).join('-');
  const mainSample = [sampleDateStr, sampleTimeStr].filter(Boolean).join('-');

  const combinedFormat = [calPartStr, mainFormat].filter(Boolean).join(' ') || '선택 없음';
  const combinedSample = [sampleCalStr, mainSample].filter(Boolean).join(' ') || '-';

  return { formatStr: combinedFormat, sampleStr: combinedSample };
}

// ── 세부 파트 구성에 따른 날짜 자동 포맷팅 ──
export function formatCustomDate(value: string, dateParts?: string[], calendarType?: string): string {
  if (!dateParts || dateParts.length === 0) {
    return formatDateHyphen(value);
  }

  const hasCalendar = dateParts.includes('calendar');
  const hasYear = dateParts.includes('year');
  const hasMonth = dateParts.includes('month');
  const hasDay = dateParts.includes('day');
  const hasHour = dateParts.includes('hour');
  const hasMinute = dateParts.includes('minute');

  let calPrefix = '';
  const trimmed = value.trim();
  if (hasCalendar) {
    if (trimmed.startsWith('(양)') || trimmed.startsWith('양력') || trimmed.startsWith('양 ')) {
      calPrefix = '(양) ';
    } else if (trimmed.startsWith('(음)') || trimmed.startsWith('음력') || trimmed.startsWith('음 ')) {
      calPrefix = '(음) ';
    } else if (calendarType === 'lunar') {
      calPrefix = '(음) ';
    } else if (calendarType === 'solar') {
      calPrefix = '(양) ';
    }
  }

  const digits = value.replace(/\D/g, '');

  let formattedDate = '';
  // 1. 년, 월, 일 + 시, 분 (전체 일시)
  if (hasYear && hasMonth && hasDay && (hasHour || hasMinute)) {
    const d = digits.slice(0, 12);
    if (d.length <= 4) formattedDate = d;
    else if (d.length <= 6) formattedDate = `${d.slice(0, 4)}-${d.slice(4)}`;
    else if (d.length <= 8) formattedDate = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`;
    else if (d.length <= 10) formattedDate = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}-${d.slice(8)}`;
    else formattedDate = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}-${d.slice(8, 10)}:${d.slice(10, 12)}`;
  } else if (hasYear && hasMonth && hasDay) {
    formattedDate = formatDateHyphen(value);
  } else if (hasYear && hasMonth && !hasDay) {
    const d = digits.slice(0, 6);
    if (d.length <= 4) formattedDate = d;
    else formattedDate = `${d.slice(0, 4)}-${d.slice(4, 6)}`;
  } else if (hasYear && !hasMonth && !hasDay && !hasHour && !hasMinute) {
    formattedDate = digits.slice(0, 4);
  } else if (!hasYear && !hasMonth && !hasDay && hasHour && hasMinute) {
    const d = digits.slice(0, 4);
    if (d.length <= 2) formattedDate = d;
    else formattedDate = `${d.slice(0, 2)}:${d.slice(2, 4)}`;
  } else {
    formattedDate = formatDateHyphen(value);
  }

  return calPrefix ? `${calPrefix}${formattedDate}` : formattedDate;
}

// ── 한국 이름 성/이름 자동 분리 ──
const TWO_CHAR_SURNAMES = [
  '남궁', '사공', '선우', '제갈', '황보', '독고', '동방', '서문',
  '소봉', '장곡', '제갈', '사마', '탁발', '어금', '등정', '망절'
];

export function formatKoreanName(value: string): string {
  const trimmed = value.trim();
  // 이미 공백이 있으면 그대로
  if (trimmed.includes(' ')) return value;
  // 한글만으로 구성되지 않으면 그대로
  if (!/^[가-힣]+$/.test(trimmed)) return value;
  // 2글자 미만이면 그대로
  if (trimmed.length < 2) return value;
  
  // 복성(2글자 성) 확인
  if (trimmed.length >= 3 && TWO_CHAR_SURNAMES.includes(trimmed.slice(0, 2))) {
    return trimmed.slice(0, 2) + ' ' + trimmed.slice(2);
  }
  // 기본: 외자 성 (1글자) + 이름
  return trimmed.slice(0, 1) + ' ' + trimmed.slice(1);
}

// ── 종류(TypeDef)에 따라 적절한 포맷터 적용 (실시간 타이핑용) ──
export function applyAutoFormat(
  value: string,
  typeName: string,
  inputType: string,
  format?: string,
  dateParts?: string[],
  calendarType?: string
): string {
  const name = typeName.toLowerCase();

  // 전화번호 계열
  if (
    inputType === 'tel' ||
    format === 'phone' ||
    name.includes('전화') ||
    name.includes('연락') ||
    name.includes('핸드폰') ||
    name.includes('모바일') ||
    name.includes('휴대폰')
  ) {
    return formatPhoneNumber(value);
  }
  
  // 사업자등록번호
  if (
    inputType === 'bizno' ||
    format === 'bizno' ||
    name.includes('사업자') ||
    name.includes('사업자등록')
  ) {
    return formatBusinessNumber(value);
  }

  // 주민번호
  if (
    inputType === 'residentno' ||
    format === 'residentno' ||
    name.includes('주민번호') ||
    name.includes('주민등록')
  ) {
    return formatSSN(value);
  }

  // 숫자 (3자리 콤마)
  if (
    inputType === 'number' ||
    format === 'number' ||
    name.includes('금액') ||
    name.includes('가격') ||
    name.includes('비용')
  ) {
    return formatNumberWithCommas(value);
  }

  // 날짜 (체크된 구성 요소에 따른 커스텀 날짜 포맷)
  if (
    inputType === 'date' ||
    format === 'date' ||
    name.includes('날짜') ||
    name.includes('일자') ||
    name.includes('생일') ||
    name.includes('생년월일') ||
    name.includes('날자') ||
    name.includes('일시')
  ) {
    return formatCustomDate(value, dateParts, calendarType);
  }
  
  return value;
}

// ── 이름 포맷은 blur 시에만 적용 (타이핑 중 한글 조합 방해 방지) ──
export function applyNameFormatOnBlur(
  value: string,
  typeName: string,
  inputType?: string,
  format?: string
): string {
  const name = typeName.toLowerCase();
  if (
    inputType === 'fullname' ||
    format === 'name' ||
    name === '이름' ||
    name === '성명' ||
    name === '성함' ||
    name.includes('이름') ||
    name.includes('성명')
  ) {
    return formatKoreanName(value);
  }
  return value;
}

// ── 이미지 파일 압축 (최대 1000px, JPEG 0.85) ──
export function compressImageFile(file: File, maxSize = 1000, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > maxSize) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width = Math.round((width * maxSize) / height);
            height = maxSize;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        } else {
          resolve(e.target?.result as string);
        }
      };
      img.onerror = () => resolve(e.target?.result as string);
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── 복합(조립) 필드 유틸리티 ──

/**
 * 구성 파트 값들을 조립 형식(display) 템플릿에 맞추어 하나의 문자열로 결합
 */
export function assembleComposite(
  parts: string[],
  display: string | undefined,
  partValues: Record<string, string>
): string {
  if (!parts || parts.length === 0) return '';
  if (!display) {
    return parts.map(p => (partValues[p] || '').trim()).filter(Boolean).join(' ');
  }
  let result = display;
  let hasAny = false;
  parts.forEach(p => {
    const val = (partValues[p] || '').trim();
    if (val) hasAny = true;
    result = result.replace(new RegExp(`\\{${p}\\}`, 'g'), val);
  });
  return hasAny ? result : '';
}

/**
 * 조립된 문자열을 각 구성 파트(parts)별 값으로 역분해
 */
export function parseCompositeValue(
  value: string,
  parts: string[],
  display?: string
): Record<string, string> {
  const result: Record<string, string> = {};
  parts.forEach(p => { result[p] = ''; });

  if (!value || !value.trim() || !parts || parts.length === 0) {
    return result;
  }

  const trimmed = value.trim();

  // 1. 조립 형식(display) 템플릿 기반 정규식 매칭
  if (display && display.includes('{')) {
    try {
      const partRegexOrder: string[] = [];
      let regexStr = '^' + display.replace(/[-/\\^$*+?.()|[\]{}]/g, match => {
        if (match === '{' || match === '}') return match;
        return '\\' + match;
      });

      parts.forEach(p => {
        if (regexStr.includes(`{${p}}`)) {
          partRegexOrder.push(p);
        }
      });

      parts.forEach(p => {
        regexStr = regexStr.replace(`{${p}}`, '(.+?)');
      });
      // 마지막 그룹은 탐욕적 일치
      regexStr = regexStr.replace(/\(\.\+\?\)\$/, '(.+)$');
      regexStr += '$';

      const regex = new RegExp(regexStr);
      const match = trimmed.match(regex);
      if (match && match.length - 1 === partRegexOrder.length) {
        partRegexOrder.forEach((p, idx) => {
          result[p] = (match[idx + 1] || '').trim();
        });
        return result;
      }
    } catch {
      // 파싱 실패 시 폴백 진행
    }
  }

  // 2. 한국어 이름 폴백 (성 + 명)
  if (parts.length === 2 && parts[0] === '성' && parts[1] === '명' && trimmed.length >= 2) {
    result['성'] = trimmed.charAt(0);
    result['명'] = trimmed.substring(1);
    return result;
  }

  // 3. 구분자 기반 분할 폴백 (X, x, *, -, _, 공백 등)
  const delimiters = display ? display.replace(/\{[^}]+\}/g, ' ').trim().split(/\s+/).filter(Boolean) : ['X', 'x', '*', '-', '_', ' '];
  for (const delim of delimiters) {
    if (trimmed.includes(delim)) {
      const tokens = trimmed.split(delim);
      if (tokens.length >= parts.length) {
        parts.forEach((p, idx) => {
          result[p] = (tokens[idx] || '').trim();
        });
        return result;
      }
    }
  }

  // 4. 기본값: 첫 번째 파트에 전체 값 할당
  result[parts[0]] = trimmed;
  return result;
}

/**
 * 엔티티 ID에서 기본 접두어(prefix)를 안전하게 추출
 * - 레거시: e-{domId}-{random}-{field} (4단락 이상) → e-{domId}-{random}
 * - 레거시 시드: p1-이름 → p1
 * - 레거시 소장자: owner-p1-이름 → owner-p1
 * - 신규: e-{domId}-{random} (순수 UUID 기반) → e-{domId}-{random} 그대로 유지
 */
export function getEntityBasePrefix(anchorId: string): string {
  if (!anchorId) return '';
  if (anchorId.endsWith('-이름')) {
    return anchorId.replace(/-이름$/, '');
  }
  const parts = anchorId.split('-');
  if (parts.length >= 4) {
    return parts.slice(0, 3).join('-');
  }
  if (parts.length === 2 && (parts[0].startsWith('p') || parts[0].startsWith('g') || parts[0].startsWith('c') || parts[0] === 'owner')) {
    return parts[0];
  }
  return anchorId;
}
