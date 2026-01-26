// =====================================================
// Database CRUD Module
// Supabase 데이터베이스 CRUD 작업
// =====================================================

const DB = {
    // =====================================================
    // 사용자 관리
    // =====================================================

    // 모든 사용자 조회
    async getUsers() {
        try {
            const { data, error } = await supabaseClient
                .from('profiles')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            return { success: true, data };
        } catch (err) {
            console.error('사용자 목록 조회 실패:', err);
            return { success: false, error: err.message, data: [] };
        }
    },

    // 사용자 생성 (슈퍼관리자 전용 - Supabase Admin API 필요)
    async createUser(userData) {
        try {
            // 참고: 실제 사용자 생성은 Supabase Admin API를 통해 서버 사이드에서 처리해야 함
            // 여기서는 프로필만 업데이트하는 용도로 사용
            const { data, error } = await supabaseClient
                .from('profiles')
                .insert(userData)
                .select()
                .single();

            if (error) throw error;
            return { success: true, data };
        } catch (err) {
            console.error('사용자 생성 실패:', err);
            return { success: false, error: err.message };
        }
    },

    // 사용자 업데이트
    async updateUser(userId, updates) {
        try {
            const { data, error } = await supabaseClient
                .from('profiles')
                .update(updates)
                .eq('id', userId)
                .select()
                .single();

            if (error) throw error;
            return { success: true, data };
        } catch (err) {
            console.error('사용자 업데이트 실패:', err);
            return { success: false, error: err.message };
        }
    },

    // 사용자 활성/비활성 토글
    async toggleUserActive(userId, isActive) {
        return this.updateUser(userId, { is_active: isActive });
    },

    // =====================================================
    // 공고 관리
    // =====================================================

    // 모든 공고 조회 (지원자 수 포함)
    async getPostings() {
        try {
            const { data, error } = await supabaseClient
                .from('postings')
                .select('*, applicants(count)')
                .order('created_at', { ascending: false });

            if (error) throw error;

            // 지원자 수를 applicant_count 필드로 추가
            const postingsWithCount = data.map(p => ({
                ...p,
                applicant_count: p.applicants?.[0]?.count || 0
            }));

            return { success: true, data: postingsWithCount };
        } catch (err) {
            console.error('공고 목록 조회 실패:', err);
            return { success: false, error: err.message, data: [] };
        }
    },

    // 단일 공고 조회
    async getPosting(id) {
        try {
            const { data, error } = await supabaseClient
                .from('postings')
                .select('*')
                .eq('id', id)
                .single();

            if (error) throw error;
            return { success: true, data };
        } catch (err) {
            console.error('공고 조회 실패:', err);
            return { success: false, error: err.message };
        }
    },

    // 공고 생성
    async createPosting(postingData) {
        try {
            const { data, error } = await supabaseClient
                .from('postings')
                .insert({
                    ...postingData,
                    created_by: Auth.currentUser?.id
                })
                .select()
                .single();

            if (error) throw error;
            return { success: true, data };
        } catch (err) {
            console.error('공고 생성 실패:', err);
            return { success: false, error: err.message };
        }
    },

    // 공고 업데이트
    async updatePosting(id, updates) {
        try {
            const { data, error } = await supabaseClient
                .from('postings')
                .update(updates)
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;
            return { success: true, data };
        } catch (err) {
            console.error('공고 업데이트 실패:', err);
            return { success: false, error: err.message };
        }
    },

    // 공고 삭제
    async deletePosting(id) {
        try {
            const { error } = await supabaseClient
                .from('postings')
                .delete()
                .eq('id', id);

            if (error) throw error;
            return { success: true };
        } catch (err) {
            console.error('공고 삭제 실패:', err);
            return { success: false, error: err.message };
        }
    },

    // 공고 복제
    async duplicatePosting(id) {
        try {
            const { data: original } = await this.getPosting(id);
            if (!original) throw new Error('원본 공고를 찾을 수 없습니다.');

            const newPosting = {
                title: original.title + ' (복사본)',
                department: original.department,
                headcount: original.headcount,
                status: 'draft',
                start_date: original.start_date,
                end_date: original.end_date,
                description: original.description,
                assigned_users: original.assigned_users
            };

            return this.createPosting(newPosting);
        } catch (err) {
            console.error('공고 복제 실패:', err);
            return { success: false, error: err.message };
        }
    },

    // =====================================================
    // 지원자 관리
    // =====================================================

    // 공고별 지원자 조회
    async getApplicants(postingId) {
        try {
            let query = supabaseClient
                .from('applicants')
                .select(`
                    *,
                    attachments (*)
                `)
                .order('created_at', { ascending: false });

            if (postingId) {
                query = query.eq('posting_id', postingId);
            }

            const { data, error } = await query;

            if (error) throw error;
            return { success: true, data };
        } catch (err) {
            console.error('지원자 목록 조회 실패:', err);
            return { success: false, error: err.message, data: [] };
        }
    },

    // 단일 지원자 조회
    async getApplicant(id) {
        try {
            const { data, error } = await supabaseClient
                .from('applicants')
                .select(`
                    *,
                    attachments (*)
                `)
                .eq('id', id)
                .single();

            if (error) throw error;
            return { success: true, data };
        } catch (err) {
            console.error('지원자 조회 실패:', err);
            return { success: false, error: err.message };
        }
    },

    // 지원자 생성
    async createApplicant(applicantData) {
        try {
            let { data, error } = await supabaseClient
                .from('applicants')
                .insert(applicantData)
                .select()
                .single();

            // extra_data 컬럼 관련 에러시 extra_data 제외하고 재시도
            if (error && (error.message.includes('extra_data') || error.code === '42703')) {
                const { extra_data, ...dataWithoutExtra } = applicantData;
                const retry = await supabaseClient
                    .from('applicants')
                    .insert(dataWithoutExtra)
                    .select()
                    .single();
                data = retry.data;
                error = retry.error;
            }

            if (error) throw error;
            return { success: true, data };
        } catch (err) {
            console.error('지원자 생성 실패:', err);
            return { success: false, error: err.message };
        }
    },

    // 특정 공고의 기존 지원자 이메일 목록 조회
    async getExistingEmails(postingId) {
        try {
            const { data, error } = await supabaseClient
                .from('applicants')
                .select('email')
                .eq('posting_id', postingId)
                .not('email', 'is', null)
                .neq('email', '');

            if (error) throw error;
            return { success: true, emails: data.map(d => d.email.toLowerCase().trim()) };
        } catch (err) {
            console.error('이메일 목록 조회 실패:', err);
            return { success: false, emails: [] };
        }
    },

    // 여러 지원자 일괄 생성 (엑셀 업로드용) - 이메일 중복 체크 포함
    async createApplicants(applicantsData, skipDuplicates = true) {
        try {
            if (applicantsData.length === 0) {
                return { success: true, data: [], count: 0, skipped: 0 };
            }

            let dataToInsert = applicantsData;
            let skippedCount = 0;

            // 중복 체크가 활성화된 경우
            if (skipDuplicates) {
                const postingId = applicantsData[0].posting_id;
                const existingResult = await this.getExistingEmails(postingId);
                const existingEmails = new Set(existingResult.emails || []);

                // 새로 추가할 데이터 중에서도 중복 제거
                const seenEmails = new Set();
                dataToInsert = applicantsData.filter(a => {
                    const email = (a.email || '').toLowerCase().trim();
                    if (!email) return true; // 이메일이 없는 경우는 통과
                    if (existingEmails.has(email) || seenEmails.has(email)) {
                        skippedCount++;
                        return false;
                    }
                    seenEmails.add(email);
                    return true;
                });
            }

            if (dataToInsert.length === 0) {
                return { success: true, data: [], count: 0, skipped: skippedCount };
            }

            // 먼저 extra_data 포함해서 시도
            let { data, error } = await supabaseClient
                .from('applicants')
                .insert(dataToInsert)
                .select();

            // extra_data 컬럼 관련 에러시 extra_data 제외하고 재시도
            if (error && (error.message.includes('extra_data') || error.code === '42703')) {
                console.log('extra_data 컬럼이 없습니다. 해당 필드 제외 후 재시도...');
                const dataWithoutExtra = dataToInsert.map(({ extra_data, ...rest }) => rest);
                const retry = await supabaseClient
                    .from('applicants')
                    .insert(dataWithoutExtra)
                    .select();
                data = retry.data;
                error = retry.error;
            }

            if (error) throw error;
            return { success: true, data, count: data.length, skipped: skippedCount };
        } catch (err) {
            console.error('지원자 일괄 생성 실패:', err);
            return { success: false, error: err.message };
        }
    },

    // 지원자 업데이트
    async updateApplicant(id, updates) {
        try {
            const { data, error } = await supabaseClient
                .from('applicants')
                .update(updates)
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;
            return { success: true, data };
        } catch (err) {
            console.error('지원자 업데이트 실패:', err);
            return { success: false, error: err.message };
        }
    },

    // 지원자 상태 일괄 변경
    async updateApplicantsStatus(ids, status) {
        try {
            const { data, error } = await supabaseClient
                .from('applicants')
                .update({ status })
                .in('id', ids)
                .select();

            if (error) throw error;
            return { success: true, data };
        } catch (err) {
            console.error('지원자 상태 일괄 변경 실패:', err);
            return { success: false, error: err.message };
        }
    },

    // 지원자 삭제
    async deleteApplicant(id) {
        try {
            const { error } = await supabaseClient
                .from('applicants')
                .delete()
                .eq('id', id);

            if (error) throw error;
            return { success: true };
        } catch (err) {
            console.error('지원자 삭제 실패:', err);
            return { success: false, error: err.message };
        }
    },

    // 공고의 모든 지원자 삭제
    async deleteApplicantsByPosting(postingId) {
        try {
            const { error } = await supabaseClient
                .from('applicants')
                .delete()
                .eq('posting_id', postingId);

            if (error) throw error;
            return { success: true };
        } catch (err) {
            console.error('지원자 일괄 삭제 실패:', err);
            return { success: false, error: err.message };
        }
    },

    // 지원자 수 조회
    async getApplicantCount(postingId) {
        try {
            const { count, error } = await supabaseClient
                .from('applicants')
                .select('*', { count: 'exact', head: true })
                .eq('posting_id', postingId);

            if (error) throw error;
            return count || 0;
        } catch (err) {
            console.error('지원자 수 조회 실패:', err);
            return 0;
        }
    },

    // 통계용 전체 지원자 조회 (첨부파일 제외, 가벼운 쿼리)
    async getAllApplicantsForStats(postingIds = null) {
        try {
            let query = supabaseClient
                .from('applicants')
                .select('id, posting_id, name, status, source, applied_at');

            if (postingIds && postingIds.length > 0) {
                query = query.in('posting_id', postingIds);
            }

            const { data, error } = await query;

            if (error) throw error;
            return { success: true, data };
        } catch (err) {
            console.error('통계용 지원자 조회 실패:', err);
            return { success: false, error: err.message, data: [] };
        }
    },

    // =====================================================
    // 면접 관리
    // =====================================================

    // 면접 목록 조회
    async getInterviews(postingId = null) {
        try {
            let query = supabaseClient
                .from('interviews')
                .select(`
                    *,
                    applicants (name, email, phone)
                `)
                .order('date', { ascending: true });

            if (postingId) {
                query = query.eq('posting_id', postingId);
            }

            const { data, error } = await query;

            if (error) throw error;
            return { success: true, data };
        } catch (err) {
            console.error('면접 목록 조회 실패:', err);
            return { success: false, error: err.message, data: [] };
        }
    },

    // 면접 생성
    async createInterview(interviewData) {
        try {
            const { data, error } = await supabaseClient
                .from('interviews')
                .insert(interviewData)
                .select()
                .single();

            if (error) throw error;
            return { success: true, data };
        } catch (err) {
            console.error('면접 생성 실패:', err);
            return { success: false, error: err.message };
        }
    },

    // 면접 업데이트
    async updateInterview(id, updates) {
        try {
            const { data, error } = await supabaseClient
                .from('interviews')
                .update(updates)
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;
            return { success: true, data };
        } catch (err) {
            console.error('면접 업데이트 실패:', err);
            return { success: false, error: err.message };
        }
    },

    // 면접 삭제
    async deleteInterview(id) {
        try {
            const { error } = await supabaseClient
                .from('interviews')
                .delete()
                .eq('id', id);

            if (error) throw error;
            return { success: true };
        } catch (err) {
            console.error('면접 삭제 실패:', err);
            return { success: false, error: err.message };
        }
    },

    // =====================================================
    // 첨부파일 메타데이터 관리
    // =====================================================

    // 첨부파일 메타데이터 생성
    async createAttachment(attachmentData) {
        try {
            const { data, error } = await supabaseClient
                .from('attachments')
                .insert(attachmentData)
                .select()
                .single();

            if (error) throw error;
            return { success: true, data };
        } catch (err) {
            console.error('첨부파일 메타데이터 생성 실패:', err);
            return { success: false, error: err.message };
        }
    },

    // 첨부파일 메타데이터 삭제
    async deleteAttachment(id) {
        try {
            const { error } = await supabaseClient
                .from('attachments')
                .delete()
                .eq('id', id);

            if (error) throw error;
            return { success: true };
        } catch (err) {
            console.error('첨부파일 메타데이터 삭제 실패:', err);
            return { success: false, error: err.message };
        }
    },

    // 지원자의 첨부파일 목록 조회
    async getAttachments(applicantId) {
        try {
            const { data, error } = await supabaseClient
                .from('attachments')
                .select('*')
                .eq('applicant_id', applicantId)
                .order('uploaded_at', { ascending: false });

            if (error) throw error;
            return { success: true, data };
        } catch (err) {
            console.error('첨부파일 목록 조회 실패:', err);
            return { success: false, error: err.message, data: [] };
        }
    },

    // =====================================================
    // 관리자 코멘트 관리
    // =====================================================

    // 지원자의 코멘트 목록 조회
    async getApplicantComments(applicantId) {
        try {
            const { data, error } = await supabaseClient
                .from('applicant_comments')
                .select(`
                    *,
                    profiles:user_id (name, email)
                `)
                .eq('applicant_id', applicantId)
                .order('created_at', { ascending: true });

            if (error) throw error;
            return { success: true, data };
        } catch (err) {
            console.error('코멘트 목록 조회 실패:', err);
            return { success: false, error: err.message, data: [] };
        }
    },

    // 코멘트 추가
    async addApplicantComment(applicantId, content) {
        try {
            const { data, error } = await supabaseClient
                .from('applicant_comments')
                .insert({
                    applicant_id: applicantId,
                    user_id: Auth.currentUser?.id,
                    content: content
                })
                .select(`
                    *,
                    profiles:user_id (name, email)
                `)
                .single();

            if (error) throw error;
            return { success: true, data };
        } catch (err) {
            console.error('코멘트 추가 실패:', err);
            return { success: false, error: err.message };
        }
    },

    // 코멘트 삭제
    async deleteApplicantComment(commentId) {
        try {
            const { error } = await supabaseClient
                .from('applicant_comments')
                .delete()
                .eq('id', commentId);

            if (error) throw error;
            return { success: true };
        } catch (err) {
            console.error('코멘트 삭제 실패:', err);
            return { success: false, error: err.message };
        }
    },

    // =====================================================
    // 유틸리티 함수
    // =====================================================

    // 상태명 변환
    getStatusName(status) {
        const names = {
            received: '서류접수',
            reviewing: '서류심사',
            interview1: '1차면접',
            interview2: '2차면접',
            passed: '합격',
            failed: '불합격'
        };
        return names[status] || status;
    },

    // 공고 상태명 변환
    getPostingStatusName(status) {
        const names = {
            draft: '작성중',
            open: '진행중',
            closed: '마감',
            completed: '완료'
        };
        return names[status] || status;
    }
};

// Export
window.DB = DB;
