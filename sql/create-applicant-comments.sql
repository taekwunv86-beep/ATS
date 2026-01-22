-- =====================================================
-- Migration: Create applicant_comments table
-- 지원자별 관리자 코멘트 히스토리
-- =====================================================

-- 코멘트 테이블 생성
CREATE TABLE IF NOT EXISTS applicant_comments (
    id SERIAL PRIMARY KEY,
    applicant_id INTEGER REFERENCES applicants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스 추가 (조회 성능)
CREATE INDEX IF NOT EXISTS idx_applicant_comments_applicant_id ON applicant_comments(applicant_id);
CREATE INDEX IF NOT EXISTS idx_applicant_comments_created_at ON applicant_comments(created_at DESC);

-- RLS 활성화
ALTER TABLE applicant_comments ENABLE ROW LEVEL SECURITY;

-- RLS 정책: 관리자 이상만 조회/작성 가능
CREATE POLICY "관리자 코멘트 조회" ON applicant_comments FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND role IN ('super_admin', 'admin')
        )
    );

CREATE POLICY "관리자 코멘트 작성" ON applicant_comments FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND role IN ('super_admin', 'admin')
        )
    );

CREATE POLICY "본인 코멘트 삭제" ON applicant_comments FOR DELETE
    USING (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND role = 'super_admin'
        )
    );

-- 테이블 코멘트
COMMENT ON TABLE applicant_comments IS '지원자별 관리자 코멘트 히스토리';
COMMENT ON COLUMN applicant_comments.applicant_id IS '지원자 ID';
COMMENT ON COLUMN applicant_comments.user_id IS '작성자 ID';
COMMENT ON COLUMN applicant_comments.content IS '코멘트 내용';
COMMENT ON COLUMN applicant_comments.created_at IS '작성 시간';
