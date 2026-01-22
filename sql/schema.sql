-- =====================================================
-- ATS System Supabase Schema
-- 채용관리 시스템 데이터베이스 스키마
-- =====================================================

-- 1. 사용자 프로필 테이블 (auth.users 확장)
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT CHECK (role IN ('super_admin', 'admin', 'user')) DEFAULT 'user',
  department TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 채용공고 테이블
CREATE TABLE postings (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  department TEXT,
  headcount INTEGER DEFAULT 1,
  status TEXT CHECK (status IN ('draft', 'open', 'closed', 'completed')) DEFAULT 'draft',
  start_date DATE,
  end_date DATE,
  description TEXT,
  created_by UUID REFERENCES profiles(id),
  assigned_users UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 지원자 테이블
CREATE TABLE applicants (
  id SERIAL PRIMARY KEY,
  posting_id INTEGER REFERENCES postings(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  education TEXT,
  experience TEXT,
  desired_salary TEXT,
  source TEXT,
  status TEXT CHECK (status IN ('received', 'reviewing', 'interview1', 'interview2', 'passed', 'failed')) DEFAULT 'received',
  applied_at DATE DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. 첨부파일 메타데이터 테이블
CREATE TABLE attachments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  applicant_id INTEGER REFERENCES applicants(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_type TEXT,
  file_size TEXT,
  storage_path TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. 면접 테이블
CREATE TABLE interviews (
  id SERIAL PRIMARY KEY,
  applicant_id INTEGER REFERENCES applicants(id) ON DELETE CASCADE,
  posting_id INTEGER REFERENCES postings(id) ON DELETE CASCADE,
  type TEXT CHECK (type IN ('1차', '2차')),
  date DATE,
  time TIME,
  duration INTEGER DEFAULT 60,
  location TEXT,
  interviewers TEXT,
  notes TEXT,
  status TEXT DEFAULT 'scheduled',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 인덱스 생성
-- =====================================================

CREATE INDEX idx_applicants_posting_id ON applicants(posting_id);
CREATE INDEX idx_applicants_status ON applicants(status);
CREATE INDEX idx_attachments_applicant_id ON attachments(applicant_id);
CREATE INDEX idx_interviews_applicant_id ON interviews(applicant_id);
CREATE INDEX idx_interviews_posting_id ON interviews(posting_id);
CREATE INDEX idx_interviews_date ON interviews(date);

-- =====================================================
-- Helper Functions (SECURITY DEFINER로 RLS 우회)
-- =====================================================

-- 현재 사용자의 역할 가져오기 (RLS 우회)
CREATE OR REPLACE FUNCTION get_current_user_role()
RETURNS TEXT AS $$
DECLARE
  user_role TEXT;
BEGIN
  SELECT role INTO user_role FROM profiles WHERE id = auth.uid();
  RETURN user_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 슈퍼관리자 여부 확인
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN get_current_user_role() = 'super_admin';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 관리자 이상 여부 확인
CREATE OR REPLACE FUNCTION is_admin_or_above()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN get_current_user_role() IN ('super_admin', 'admin');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 공고 접근 권한 확인
CREATE OR REPLACE FUNCTION can_access_posting(posting_id INTEGER)
RETURNS BOOLEAN AS $$
DECLARE
  p_assigned_users UUID[];
  p_created_by UUID;
BEGIN
  IF is_super_admin() THEN
    RETURN TRUE;
  END IF;

  SELECT assigned_users, created_by INTO p_assigned_users, p_created_by
  FROM postings WHERE id = posting_id;

  RETURN auth.uid() = ANY(p_assigned_users) OR auth.uid() = p_created_by;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- =====================================================
-- Row Level Security (RLS) 활성화
-- =====================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE postings ENABLE ROW LEVEL SECURITY;
ALTER TABLE applicants ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE interviews ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- Profiles 정책
-- =====================================================

-- 모든 인증된 사용자가 프로필 조회 가능
CREATE POLICY "profiles_select_policy" ON profiles
  FOR SELECT USING (auth.role() = 'authenticated');

-- 본인 프로필 수정 가능
CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- 슈퍼관리자는 모든 프로필 업데이트 가능
CREATE POLICY "profiles_update_super_admin" ON profiles
  FOR UPDATE USING (is_super_admin());

-- =====================================================
-- Postings 정책
-- =====================================================

-- 공고 조회: 슈퍼관리자, 담당자, 생성자
CREATE POLICY "postings_select_policy" ON postings
  FOR SELECT USING (
    is_super_admin()
    OR auth.uid() = ANY(assigned_users)
    OR created_by = auth.uid()
  );

-- 공고 생성: 슈퍼관리자, 관리자만
CREATE POLICY "postings_insert_policy" ON postings
  FOR INSERT WITH CHECK (is_admin_or_above());

-- 공고 수정: 슈퍼관리자, 생성자
CREATE POLICY "postings_update_policy" ON postings
  FOR UPDATE USING (
    is_super_admin() OR created_by = auth.uid()
  );

-- 공고 삭제: 슈퍼관리자만
CREATE POLICY "postings_delete_policy" ON postings
  FOR DELETE USING (is_super_admin());

-- =====================================================
-- Applicants 정책 (공고 접근 권한 상속)
-- =====================================================

-- 지원자 조회
CREATE POLICY "applicants_select_policy" ON applicants
  FOR SELECT USING (can_access_posting(posting_id));

-- 지원자 생성
CREATE POLICY "applicants_insert_policy" ON applicants
  FOR INSERT WITH CHECK (can_access_posting(posting_id));

-- 지원자 수정
CREATE POLICY "applicants_update_policy" ON applicants
  FOR UPDATE USING (can_access_posting(posting_id));

-- 지원자 삭제
CREATE POLICY "applicants_delete_policy" ON applicants
  FOR DELETE USING (can_access_posting(posting_id));

-- =====================================================
-- Attachments 정책
-- =====================================================

-- 첨부파일 조회
CREATE POLICY "attachments_select_policy" ON attachments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM applicants a
      WHERE a.id = attachments.applicant_id
      AND can_access_posting(a.posting_id)
    )
  );

-- 첨부파일 생성
CREATE POLICY "attachments_insert_policy" ON attachments
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM applicants a
      WHERE a.id = applicant_id
      AND can_access_posting(a.posting_id)
    )
  );

-- 첨부파일 삭제
CREATE POLICY "attachments_delete_policy" ON attachments
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM applicants a
      WHERE a.id = attachments.applicant_id
      AND can_access_posting(a.posting_id)
    )
  );

-- =====================================================
-- Interviews 정책
-- =====================================================

-- 면접 조회
CREATE POLICY "interviews_select_policy" ON interviews
  FOR SELECT USING (can_access_posting(posting_id));

-- 면접 생성
CREATE POLICY "interviews_insert_policy" ON interviews
  FOR INSERT WITH CHECK (can_access_posting(posting_id));

-- 면접 수정
CREATE POLICY "interviews_update_policy" ON interviews
  FOR UPDATE USING (can_access_posting(posting_id));

-- 면접 삭제
CREATE POLICY "interviews_delete_policy" ON interviews
  FOR DELETE USING (can_access_posting(posting_id));

-- =====================================================
-- Storage 버킷 및 정책
-- =====================================================

-- 첨부파일 버킷 생성 (Supabase 대시보드에서 실행하거나 아래 SQL 사용)
INSERT INTO storage.buckets (id, name, public)
VALUES ('attachments', 'attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Storage 정책: 인증된 사용자만 업로드 가능
CREATE POLICY "storage_attachments_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'attachments'
    AND auth.role() = 'authenticated'
  );

-- Storage 정책: 인증된 사용자만 조회 가능
CREATE POLICY "storage_attachments_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'attachments'
    AND auth.role() = 'authenticated'
  );

-- Storage 정책: 인증된 사용자만 삭제 가능
CREATE POLICY "storage_attachments_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'attachments'
    AND auth.role() = 'authenticated'
  );

-- =====================================================
-- 트리거: updated_at 자동 갱신
-- =====================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_postings_updated_at
    BEFORE UPDATE ON postings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_applicants_updated_at
    BEFORE UPDATE ON applicants
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_interviews_updated_at
    BEFORE UPDATE ON interviews
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 신규 사용자 자동 프로필 생성 트리거
-- =====================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, name, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
        COALESCE(NEW.raw_user_meta_data->>'role', 'user')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();
