-- =====================================================
-- Migration: Add admin_comment column to applicants table
-- 관리자 전용 코멘트 필드 추가 (일반 사용자에게 비공개)
-- =====================================================

-- admin_comment 컬럼 추가
ALTER TABLE applicants ADD COLUMN IF NOT EXISTS admin_comment TEXT;

-- 코멘트 추가
COMMENT ON COLUMN applicants.admin_comment IS '관리자 전용 코멘트 (일반 사용자에게 비공개)';
