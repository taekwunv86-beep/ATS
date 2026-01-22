# ATS System (채용관리 시스템)

Supabase 기반 멀티유저 채용관리 시스템 (Applicant Tracking System)

## 프로젝트 구조

```
ats-system/
├── index.html          # 메인 애플리케이션
├── migration.html      # 데이터 마이그레이션 도구
├── vercel.json         # Vercel 배포 설정
├── js/
│   ├── supabase.js     # Supabase 클라이언트 설정
│   ├── auth.js         # 인증 모듈
│   ├── db.js           # 데이터베이스 CRUD 모듈
│   ├── storage.js      # 파일 스토리지 모듈
│   └── app.js          # 메인 앱 로직
└── sql/
    ├── schema.sql      # 데이터베이스 스키마
    └── seed-users.sql  # 초기 사용자 데이터
```

## 설정 가이드

### 1. Supabase 프로젝트 생성

1. https://supabase.com 접속
2. 새 프로젝트 생성 (리전: Northeast Asia - Tokyo 권장)
3. Project URL 및 anon key 저장

### 2. 데이터베이스 설정

1. Supabase 대시보드 > SQL Editor 이동
2. `sql/schema.sql` 파일 내용 실행
3. 스키마, RLS 정책, 트리거가 자동 생성됨

### 3. Storage 버킷 확인

SQL 스키마에서 자동 생성되지만, 확인 필요:
- Supabase 대시보드 > Storage
- `attachments` 버킷이 있는지 확인

### 4. 애플리케이션 설정

`index.html` 파일에서 Supabase 설정 수정:

```javascript
window.SUPABASE_URL = 'https://your-project.supabase.co';
window.SUPABASE_ANON_KEY = 'your-anon-key';
```

또는 `js/supabase.js`에서 직접 수정:

```javascript
const SUPABASE_URL = 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-key';
```

### 5. 초기 사용자 생성

Supabase 대시보드 > Authentication > Users에서 사용자 생성:

1. "Add user" 클릭
2. 이메일/비밀번호 입력
3. 생성된 사용자의 UUID 복사
4. SQL Editor에서 profiles 테이블에 프로필 정보 입력:

```sql
INSERT INTO profiles (id, email, name, role, department, is_active)
VALUES (
    '사용자-UUID',
    'admin@company.com',
    '시스템관리자',
    'super_admin',
    'IT팀',
    true
);
```

## Vercel 배포

### 1. GitHub 저장소 생성

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/username/ats-system.git
git push -u origin main
```

### 2. Vercel 배포

1. https://vercel.com 접속
2. "Import Project" 클릭
3. GitHub 저장소 선택
4. 환경 변수 설정 (선택사항):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. "Deploy" 클릭

## 데이터 마이그레이션 (기존 localStorage 데이터)

기존 `ats-system.html` 사용자의 경우:

1. 기존 페이지에서 `migration.html` 열기
2. Supabase URL과 Service Role Key 입력
3. "데이터 불러오기" 클릭하여 확인
4. "JSON으로 내보내기"로 백업
5. "마이그레이션 시작" 클릭

**주의**: 첨부파일은 별도 마이그레이션 필요

## 주요 기능

- **인증**: Supabase Auth 기반 이메일/비밀번호 인증
- **권한 관리**: super_admin, admin, user 역할
- **공고 관리**: CRUD, 담당자 배정
- **지원자 관리**: CRUD, 상태 관리, 엑셀 업로드/다운로드
- **첨부파일**: Supabase Storage 기반 파일 관리
- **면접 일정**: 캘린더 뷰, 일정 관리
- **통계**: 채용 현황 리포트

## 보안

- Row Level Security (RLS) 정책 적용
- 역할 기반 접근 제어 (RBAC)
- 세션 타임아웃 (30분)
- 파일 접근 권한 제어

## 트러블슈팅

### "Supabase 설정이 완료되지 않았습니다" 오류

- `index.html` 또는 `js/supabase.js`에서 URL과 Key가 올바르게 설정되어 있는지 확인

### 로그인 실패

1. Supabase 대시보드에서 사용자가 생성되어 있는지 확인
2. profiles 테이블에 해당 사용자 프로필이 있는지 확인
3. 사용자의 is_active가 true인지 확인

### 공고/지원자가 보이지 않음

- RLS 정책 확인
- 사용자가 해당 공고에 할당되어 있는지 확인
- super_admin 역할인 경우 모든 데이터 접근 가능

### 파일 업로드 실패

1. Storage 버킷 `attachments`가 있는지 확인
2. Storage 정책이 올바르게 설정되어 있는지 확인
3. 파일 크기 제한 확인 (기본 50MB)

## 라이센스

Private - 내부 사용 전용
