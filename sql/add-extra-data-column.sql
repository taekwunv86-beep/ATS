-- =====================================================
-- 지원자 테이블에 원본 엑셀 데이터 저장 컬럼 추가
-- =====================================================

-- extra_data 컬럼 추가 (JSONB 타입으로 모든 원본 데이터 저장)
ALTER TABLE applicants
ADD COLUMN IF NOT EXISTS extra_data JSONB DEFAULT '{}';

-- 인덱스 추가 (검색 성능 향상)
CREATE INDEX IF NOT EXISTS idx_applicants_extra_data ON applicants USING GIN (extra_data);

-- 코멘트 추가
COMMENT ON COLUMN applicants.extra_data IS '원본 엑셀 파일의 모든 컬럼 데이터를 JSON 형태로 저장';
