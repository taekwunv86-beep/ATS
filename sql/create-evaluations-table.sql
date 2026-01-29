-- 관리자 평가 테이블 생성
CREATE TABLE IF NOT EXISTS applicant_evaluations (
    id SERIAL PRIMARY KEY,
    applicant_id INTEGER NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    evaluation VARCHAR(1) CHECK (evaluation IN ('O', 'X')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(applicant_id, user_id)
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_evaluations_applicant ON applicant_evaluations(applicant_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_user ON applicant_evaluations(user_id);

-- RLS 정책 설정
ALTER TABLE applicant_evaluations ENABLE ROW LEVEL SECURITY;

-- 관리자 이상만 평가 조회/생성/수정 가능
CREATE POLICY "Admins can view evaluations"
    ON applicant_evaluations FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('super_admin', 'admin')
        )
    );

CREATE POLICY "Admins can insert evaluations"
    ON applicant_evaluations FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('super_admin', 'admin')
        )
    );

CREATE POLICY "Admins can update evaluations"
    ON applicant_evaluations FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('super_admin', 'admin')
        )
    );

CREATE POLICY "Admins can delete evaluations"
    ON applicant_evaluations FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('super_admin', 'admin')
        )
    );
