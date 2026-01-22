-- =====================================================
-- 초기 사용자 시드 데이터
-- Supabase Auth에서 사용자 생성 후 이 스크립트 실행
-- =====================================================

-- 주의: 아래 UUID는 Supabase Auth에서 사용자 생성 후
-- 실제 user.id 값으로 교체해야 합니다.

-- 슈퍼관리자 (admin@company.com)
-- INSERT INTO profiles (id, email, name, role, department, is_active)
-- VALUES (
--     '실제-사용자-UUID-여기에-입력',
--     'admin@company.com',
--     '시스템관리자',
--     'super_admin',
--     'IT팀',
--     true
-- );

-- 관리자 (hr@company.com)
-- INSERT INTO profiles (id, email, name, role, department, is_active)
-- VALUES (
--     '실제-사용자-UUID-여기에-입력',
--     'hr@company.com',
--     '김인사',
--     'admin',
--     '인사팀',
--     true
-- );

-- 일반 사용자 (user@company.com)
-- INSERT INTO profiles (id, email, name, role, department, is_active)
-- VALUES (
--     '실제-사용자-UUID-여기에-입력',
--     'user@company.com',
--     '박담당',
--     'user',
--     '개발팀',
--     true
-- );

-- =====================================================
-- 초기 테스트 공고 데이터 (선택사항)
-- =====================================================

-- INSERT INTO postings (title, department, headcount, status, start_date, end_date, description, created_by)
-- VALUES
--     ('프론트엔드 개발자', '개발팀', 2, 'open', '2025-01-01', '2025-02-28', 'React/Vue 경험자 우대', '슈퍼관리자-UUID'),
--     ('백엔드 개발자', '개발팀', 1, 'open', '2025-01-15', '2025-03-15', 'Node.js/Python 경험자', '슈퍼관리자-UUID'),
--     ('UI/UX 디자이너', '디자인팀', 1, 'draft', '2025-02-01', '2025-03-31', 'Figma 능숙자', '관리자-UUID');
