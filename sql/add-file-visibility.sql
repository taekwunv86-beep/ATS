-- =====================================================
-- 파일 가시성 및 권한 기반 지원자 조회 마이그레이션
--
-- 변경 내용:
-- 1. attachments 테이블에 visibility 컬럼 추가
-- 2. 일반 사용자는 '서류접수', '서류심사', '불합격' 상태 지원자를 볼 수 없음
-- 3. 파일 업로드는 관리자/슈퍼관리자만 가능
-- 4. admin_only 파일은 관리자/슈퍼관리자만 볼 수 있음
-- =====================================================

-- 1. attachments 테이블에 visibility 컬럼 추가
-- 'all': 모든 권한자가 볼 수 있음
-- 'admin_only': 관리자/슈퍼관리자만 볼 수 있음
ALTER TABLE attachments
ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'all'
CHECK (visibility IN ('all', 'admin_only'));

-- 2. attachments 테이블에 uploaded_by 컬럼 추가 (업로드한 사용자 추적)
ALTER TABLE attachments
ADD COLUMN IF NOT EXISTS uploaded_by UUID REFERENCES profiles(id);

-- =====================================================
-- Applicants RLS 정책 수정
-- 일반 사용자는 '서류접수', '서류심사' 상태 지원자 조회 불가
-- =====================================================

-- 기존 정책 삭제
DROP POLICY IF EXISTS "applicants_select_policy" ON applicants;

-- 새로운 조회 정책: 관리자/슈퍼관리자는 모두 조회, 일반 사용자는 received/reviewing/failed 제외
CREATE POLICY "applicants_select_policy" ON applicants
  FOR SELECT USING (
    can_access_posting(posting_id)
    AND (
      -- 관리자/슈퍼관리자는 모든 상태 조회 가능
      is_admin_or_above()
      OR
      -- 일반 사용자는 received, reviewing, failed 상태 제외
      status NOT IN ('received', 'reviewing', 'failed')
    )
  );

-- =====================================================
-- Attachments RLS 정책 수정
-- =====================================================

-- 기존 정책 삭제
DROP POLICY IF EXISTS "attachments_select_policy" ON attachments;
DROP POLICY IF EXISTS "attachments_insert_policy" ON attachments;
DROP POLICY IF EXISTS "attachments_delete_policy" ON attachments;

-- 새로운 조회 정책: visibility 및 권한 기반 필터링
CREATE POLICY "attachments_select_policy" ON attachments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM applicants a
      WHERE a.id = attachments.applicant_id
      AND can_access_posting(a.posting_id)
    )
    AND (
      -- 관리자/슈퍼관리자는 모든 파일 조회 가능
      is_admin_or_above()
      OR
      -- 일반 사용자는 'all' visibility 파일만 조회 가능
      visibility = 'all'
    )
  );

-- 새로운 생성 정책: 관리자/슈퍼관리자만 업로드 가능
CREATE POLICY "attachments_insert_policy" ON attachments
  FOR INSERT WITH CHECK (
    is_admin_or_above()
    AND EXISTS (
      SELECT 1 FROM applicants a
      WHERE a.id = applicant_id
      AND can_access_posting(a.posting_id)
    )
  );

-- 새로운 삭제 정책: 관리자/슈퍼관리자만 삭제 가능
CREATE POLICY "attachments_delete_policy" ON attachments
  FOR DELETE USING (
    is_admin_or_above()
    AND EXISTS (
      SELECT 1 FROM applicants a
      WHERE a.id = attachments.applicant_id
      AND can_access_posting(a.posting_id)
    )
  );

-- =====================================================
-- Storage 정책 수정 (파일 업로드 권한)
-- =====================================================

-- 기존 정책 삭제
DROP POLICY IF EXISTS "storage_attachments_insert" ON storage.objects;
DROP POLICY IF EXISTS "storage_attachments_select" ON storage.objects;
DROP POLICY IF EXISTS "storage_attachments_delete" ON storage.objects;

-- 새로운 업로드 정책: 관리자/슈퍼관리자만 업로드 가능
CREATE POLICY "storage_attachments_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'attachments'
    AND auth.role() = 'authenticated'
    AND is_admin_or_above()
  );

-- 조회 정책: 인증된 사용자 조회 가능 (메타데이터 RLS에서 추가 필터링)
CREATE POLICY "storage_attachments_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'attachments'
    AND auth.role() = 'authenticated'
  );

-- 삭제 정책: 관리자/슈퍼관리자만 삭제 가능
CREATE POLICY "storage_attachments_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'attachments'
    AND auth.role() = 'authenticated'
    AND is_admin_or_above()
  );

-- =====================================================
-- 인덱스 추가 (성능 최적화)
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_attachments_visibility ON attachments(visibility);
CREATE INDEX IF NOT EXISTS idx_attachments_uploaded_by ON attachments(uploaded_by);
