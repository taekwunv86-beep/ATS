// =====================================================
// Main Application Logic
// ATS 시스템 메인 앱 로직
// =====================================================

// XSS 방지를 위한 HTML 이스케이프 함수
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// 전역으로 사용 가능하도록 export
window.escapeHtml = escapeHtml;

const App = {
    // 앱 상태
    state: {
        currentUser: null,
        currentPage: 'login',
        postings: [],
        applicants: [],
        users: [],
        interviews: [],
        selectedPosting: null,
        filters: { status: '', search: '' },
        sortBy: { field: 'applied_at', order: 'desc' },
        pagination: { page: 1, perPage: 10 },
        calendarMonth: new Date(),
        recruitmentTab: 'postings',
        settingsTab: 'users',
        selectedApplicants: [],
        loading: false
    },

    // =====================================================
    // 초기화
    // =====================================================

    async init() {
        this.showLoading(true);

        try {
            // Supabase 설정 확인
            if (!checkSupabaseConfig()) {
                this.showConfigError();
                return;
            }

            // 인증 초기화
            const user = await Auth.init();

            if (user) {
                this.state.currentUser = user;
                this.state.currentPage = 'recruitment';
                await this.loadData();
            }
        } catch (err) {
            console.error('앱 초기화 오류:', err);
        }

        this.showLoading(false);
        this.render();
    },

    // 데이터 로드
    async loadData() {
        try {
            const [usersResult, postingsResult, interviewsResult] = await Promise.all([
                DB.getUsers(),
                DB.getPostings(),
                DB.getInterviews()
            ]);

            this.state.users = usersResult.data || [];
            this.state.postings = postingsResult.data || [];
            this.state.interviews = interviewsResult.data || [];

            // 선택된 공고가 있으면 지원자도 로드
            if (this.state.selectedPosting) {
                const applicantsResult = await DB.getApplicants(this.state.selectedPosting);
                this.state.applicants = applicantsResult.data || [];
            }
        } catch (err) {
            console.error('데이터 로드 오류:', err);
        }
    },

    // 지원자 로드
    async loadApplicants(postingId) {
        try {
            const result = await DB.getApplicants(postingId);
            this.state.applicants = result.data || [];
        } catch (err) {
            console.error('지원자 로드 오류:', err);
            this.state.applicants = [];
        }
    },

    // =====================================================
    // 로그인/로그아웃
    // =====================================================

    async login(email, password) {
        this.showLoading(true);

        const result = await Auth.login(email, password);

        if (result.success) {
            this.state.currentUser = result.user;
            this.state.currentPage = 'recruitment';
            await this.loadData();
        }

        this.showLoading(false);
        this.render();

        return result.success;
    },

    async logout() {
        await Auth.logout();
        this.state.currentUser = null;
        this.state.currentPage = 'login';
        this.state.postings = [];
        this.state.applicants = [];
        this.state.interviews = [];
        this.state.selectedPosting = null;
        this.render();
    },

    // =====================================================
    // 네비게이션
    // =====================================================

    navigate(page, keepPosting = false) {
        this.state.currentPage = page;
        if (!keepPosting && page !== 'applicants') {
            this.state.selectedPosting = null;
            this.state.selectedApplicants = [];
        }
        this.render();
    },

    // =====================================================
    // 권한 확인
    // =====================================================

    canAccessPosting(postingId) {
        const user = this.state.currentUser;
        if (!user) return false;
        if (user.role === 'super_admin') return true;
        const posting = this.state.postings.find(p => p.id === postingId);
        return posting?.assigned_users?.includes(user.id) || posting?.created_by === user.id;
    },

    getAccessiblePostings() {
        const user = this.state.currentUser;
        if (!user) return [];
        if (user.role === 'super_admin') return this.state.postings;
        return this.state.postings.filter(p =>
            p.assigned_users?.includes(user.id) || p.created_by === user.id
        );
    },

    getAccessibleApplicants() {
        const accessiblePostingIds = this.getAccessiblePostings().map(p => p.id);
        return this.state.applicants.filter(a => accessiblePostingIds.includes(a.posting_id));
    },

    // =====================================================
    // 로딩/에러 표시
    // =====================================================

    showLoading(show) {
        this.state.loading = show;
        const loadingEl = document.getElementById('loadingOverlay');
        if (loadingEl) {
            loadingEl.style.display = show ? 'flex' : 'none';
        }
    },

    showConfigError() {
        const app = document.getElementById('app');
        app.innerHTML = `
            <div class="min-h-screen flex items-center justify-center bg-gray-100">
                <div class="bg-white p-8 rounded-xl shadow-lg max-w-md text-center">
                    <div class="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <i class="fas fa-exclamation-triangle text-3xl text-red-500"></i>
                    </div>
                    <h2 class="text-xl font-bold text-gray-800 mb-2">설정 오류</h2>
                    <p class="text-gray-600 mb-4">Supabase 설정이 완료되지 않았습니다.</p>
                    <p class="text-sm text-gray-500">js/supabase.js 파일에서 SUPABASE_URL과 SUPABASE_ANON_KEY를 설정하세요.</p>
                </div>
            </div>
        `;
    },

    // =====================================================
    // 렌더링
    // =====================================================

    render() {
        const app = document.getElementById('app');

        if (!this.state.currentUser) {
            app.innerHTML = this.renderLoginPage();
        } else {
            app.innerHTML = this.renderMainLayout();
        }

        this.bindEvents();
    },

    // =====================================================
    // 페이지 렌더링
    // =====================================================

    renderLoginPage() {
        return `
            <div class="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-primary-500 to-primary-800">
                <div class="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-md">
                    <div class="text-center mb-8">
                        <img src="tpc_wordmark_fullcolors.png" alt="The Play Company" class="h-10 mx-auto mb-4" onerror="this.style.display='none'">
                        <h1 class="text-2xl font-bold text-gray-800">채용관리 시스템</h1>
                        <p class="text-gray-500 mt-2">ATS (Applicant Tracking System)</p>
                    </div>
                    <form id="loginForm" class="space-y-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">이메일</label>
                            <input type="email" id="loginEmail" class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" placeholder="이메일 입력" required>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">비밀번호</label>
                            <input type="password" id="loginPassword" class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" placeholder="비밀번호 입력" required>
                        </div>
                        <div id="loginError" class="text-red-500 text-sm hidden">이메일 또는 비밀번호가 올바르지 않습니다.</div>
                        <button type="submit" class="w-full bg-primary-500 text-white py-3 rounded-lg font-semibold hover:bg-primary-600 transition">로그인</button>
                    </form>
                </div>
                <div class="mt-6 text-center text-white text-sm">
                    <a href="privacy.html" class="hover:underline">개인정보 처리방침</a>
                    <span class="mx-2">|</span>
                    <a href="terms.html" class="hover:underline">이용약관</a>
                </div>
            </div>
        `;
    },

    renderMainLayout() {
        const user = this.state.currentUser;
        return `
            <div class="flex h-screen">
                <!-- Sidebar -->
                <aside class="sidebar w-64 bg-white shadow-lg flex flex-col">
                    <div class="p-6 border-b">
                        <div class="flex items-center gap-3">
                            <img src="tpc_wordmark_fullcolors.png" alt="The Play Company" class="h-6" onerror="this.style.display='none'">
                        </div>
                        <p class="text-xs text-gray-500 mt-2">채용관리 시스템</p>
                    </div>

                    <nav class="flex-1 p-4">
                        <ul class="space-y-2">
                            <li>
                                <a href="#" data-page="recruitment" class="nav-item flex items-center gap-3 px-4 py-3 rounded-lg ${this.state.currentPage === 'recruitment' ? 'active' : ''}">
                                    <i class="fas fa-briefcase w-5"></i> 채용관리
                                </a>
                            </li>
                            ${user.role === 'super_admin' ? `
                            <li>
                                <a href="#" data-page="admin-settings" class="nav-item flex items-center gap-3 px-4 py-3 rounded-lg ${this.state.currentPage === 'admin-settings' ? 'active' : ''}">
                                    <i class="fas fa-cog w-5"></i> 설정
                                </a>
                            </li>
                            ` : ''}
                        </ul>
                    </nav>

                    <div class="p-4 border-t">
                        <div class="flex items-center gap-3 mb-3 p-2 rounded-lg -mx-2">
                            <div class="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                                <i class="fas fa-user text-gray-500"></i>
                            </div>
                            <div>
                                <p class="font-medium text-sm">${escapeHtml(user.name)}</p>
                                <p class="text-xs text-gray-500">${escapeHtml(Auth.getRoleName(user.role))}</p>
                            </div>
                        </div>
                        <button id="logoutBtn" class="w-full px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition">
                            <i class="fas fa-sign-out-alt mr-2"></i>로그아웃
                        </button>
                    </div>
                </aside>

                <!-- Main Content -->
                <main class="flex-1 overflow-auto bg-gray-50">
                    ${this.renderCurrentPage()}
                </main>
            </div>

            <!-- Modal Container -->
            <div id="modalContainer"></div>

            <!-- Loading Overlay -->
            <div id="loadingOverlay" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" style="display: none;">
                <div class="bg-white p-6 rounded-lg shadow-xl">
                    <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-500 mx-auto"></div>
                    <p class="text-gray-600 mt-4">처리 중...</p>
                </div>
            </div>
        `;
    },

    renderCurrentPage() {
        switch (this.state.currentPage) {
            case 'recruitment':
                return this.renderRecruitmentPage();
            case 'admin-settings':
                return this.renderAdminSettingsPage();
            default:
                return '<div class="p-8">페이지를 찾을 수 없습니다.</div>';
        }
    },

    // =====================================================
    // 채용관리 페이지
    // =====================================================

    renderRecruitmentPage() {
        const tab = this.state.recruitmentTab;

        return `
            <div class="p-6">
                <h1 class="text-2xl font-bold text-gray-800 mb-6">채용관리</h1>

                <div class="bg-white rounded-xl shadow-sm">
                    <!-- 탭 네비게이션 -->
                    <div class="flex border-b">
                        <button class="recruitment-tab px-6 py-4 font-medium ${tab === 'postings' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-gray-500 hover:text-gray-700'}" data-tab="postings">
                            <i class="fas fa-clipboard-list mr-2"></i>공고 관리
                        </button>
                        <button class="recruitment-tab px-6 py-4 font-medium ${tab === 'interviews' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-gray-500 hover:text-gray-700'}" data-tab="interviews">
                            <i class="fas fa-calendar-alt mr-2"></i>면접 일정
                        </button>
                        <button class="recruitment-tab px-6 py-4 font-medium ${tab === 'reports' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-gray-500 hover:text-gray-700'}" data-tab="reports">
                            <i class="fas fa-chart-bar mr-2"></i>통계
                        </button>
                    </div>

                    <!-- 탭 컨텐츠 -->
                    <div class="p-6">
                        ${this.renderRecruitmentTabContent()}
                    </div>
                </div>
            </div>
        `;
    },

    renderRecruitmentTabContent() {
        switch (this.state.recruitmentTab) {
            case 'postings':
                return this.state.selectedPosting ? this.renderApplicantsContent() : this.renderPostingsContent();
            case 'interviews':
                return this.renderInterviewsContent();
            case 'reports':
                return this.renderReportsContent();
            default:
                return this.renderPostingsContent();
        }
    },

    renderPostingsContent() {
        const postings = this.getAccessiblePostings().sort((a, b) =>
            new Date(b.created_at) - new Date(a.created_at)
        );
        const isSuperAdmin = this.state.currentUser?.role === 'super_admin';

        return `
            <div class="flex items-center justify-between mb-4">
                <h2 class="text-lg font-semibold">공고 목록</h2>
                ${isSuperAdmin ? `
                    <button id="addPostingBtn" class="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 text-sm">
                        <i class="fas fa-plus mr-2"></i>새 공고
                    </button>
                ` : ''}
            </div>
            <div class="overflow-x-auto">
                <table class="w-full">
                    <thead class="bg-gray-50">
                        <tr>
                            <th class="px-4 py-3 text-left text-sm font-semibold text-gray-600">공고명</th>
                            <th class="px-4 py-3 text-left text-sm font-semibold text-gray-600">부서</th>
                            <th class="px-4 py-3 text-left text-sm font-semibold text-gray-600">모집</th>
                            <th class="px-4 py-3 text-left text-sm font-semibold text-gray-600">지원자</th>
                            <th class="px-4 py-3 text-left text-sm font-semibold text-gray-600">마감일</th>
                            <th class="px-4 py-3 text-left text-sm font-semibold text-gray-600">상태</th>
                            <th class="px-4 py-3 text-left text-sm font-semibold text-gray-600">관리</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${postings.map(p => `
                            <tr class="border-t hover:bg-gray-50">
                                <td class="px-4 py-3">
                                    <p class="font-medium">${escapeHtml(p.title)}</p>
                                </td>
                                <td class="px-4 py-3 text-gray-600 text-sm">${escapeHtml(p.department) || '-'}</td>
                                <td class="px-4 py-3 text-gray-600 text-sm">${p.headcount}명</td>
                                <td class="px-4 py-3">
                                    <button class="view-applicants-btn text-primary-500 font-medium hover:underline" data-posting-id="${p.id}">
                                        ${p.applicant_count || 0}명 보기
                                    </button>
                                </td>
                                <td class="px-4 py-3 text-gray-600 text-sm">${p.end_date || '-'}</td>
                                <td class="px-4 py-3">
                                    <select class="posting-status-select text-sm border rounded px-2 py-1" data-posting-id="${p.id}">
                                        <option value="draft" ${p.status === 'draft' ? 'selected' : ''}>작성중</option>
                                        <option value="open" ${p.status === 'open' ? 'selected' : ''}>진행중</option>
                                        <option value="closed" ${p.status === 'closed' ? 'selected' : ''}>마감</option>
                                        <option value="completed" ${p.status === 'completed' ? 'selected' : ''}>완료</option>
                                    </select>
                                </td>
                                <td class="px-4 py-3">
                                    <div class="flex gap-1">
                                        <button class="edit-posting-btn p-2 hover:bg-gray-100 rounded text-gray-500" data-posting-id="${p.id}" title="수정">
                                            <i class="fas fa-edit"></i>
                                        </button>
                                        <button class="duplicate-posting-btn p-2 hover:bg-gray-100 rounded text-purple-500" data-posting-id="${p.id}" title="복제">
                                            <i class="fas fa-copy"></i>
                                        </button>
                                        <button class="delete-posting-btn p-2 hover:bg-red-50 rounded text-red-500" data-posting-id="${p.id}" title="삭제">
                                            <i class="fas fa-trash"></i>
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        `).join('') || '<tr><td colspan="7" class="px-4 py-8 text-center text-gray-500">등록된 공고가 없습니다.</td></tr>'}
                    </tbody>
                </table>
            </div>
        `;
    },

    renderApplicantsContent() {
        const posting = this.state.postings.find(p => p.id === this.state.selectedPosting);
        if (!posting) {
            this.state.selectedPosting = null;
            return this.renderPostingsContent();
        }

        let applicants = [...this.state.applicants];

        // 필터링
        if (this.state.filters.status) {
            applicants = applicants.filter(a => a.status === this.state.filters.status);
        }
        if (this.state.filters.search) {
            const search = this.state.filters.search.toLowerCase();
            applicants = applicants.filter(a =>
                a.name?.toLowerCase().includes(search) ||
                a.email?.toLowerCase().includes(search) ||
                a.phone?.includes(search)
            );
        }

        // 정렬
        applicants.sort((a, b) => {
            const field = this.state.sortBy.field;
            const order = this.state.sortBy.order === 'asc' ? 1 : -1;
            const aVal = a[field] || '';
            const bVal = b[field] || '';
            if (aVal < bVal) return -1 * order;
            if (aVal > bVal) return 1 * order;
            return 0;
        });

        return `
            <div class="flex items-center gap-4 mb-4">
                <button id="backToPostings" class="p-2 hover:bg-gray-100 rounded-lg">
                    <i class="fas fa-arrow-left"></i>
                </button>
                <div class="flex-1">
                    <h2 class="text-lg font-semibold">${escapeHtml(posting.title)}</h2>
                    <p class="text-sm text-gray-500">${escapeHtml(posting.department) || ''} · 모집 ${posting.headcount}명</p>
                </div>
                ${this.state.selectedApplicants.length > 0 ? `
                <button id="downloadAttachmentsBtn" class="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm">
                    <i class="fas fa-file-archive mr-1"></i>첨부파일 다운로드 (${this.state.selectedApplicants.length}명)
                </button>
                ` : ''}
                <button id="uploadExcelBtn" class="px-3 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 text-sm">
                    <i class="fas fa-file-excel mr-1"></i>엑셀 업로드
                </button>
                <button id="downloadExcelBtn" class="px-3 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm">
                    <i class="fas fa-download mr-1"></i>엑셀 다운로드
                </button>
                <button id="addApplicantBtn" class="px-3 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 text-sm">
                    <i class="fas fa-plus mr-1"></i>지원자 추가
                </button>
            </div>

            <div class="flex gap-4 mb-4">
                <input type="text" id="searchInput" class="flex-1 px-4 py-2 border rounded-lg text-sm" placeholder="이름, 이메일, 연락처 검색..." value="${this.state.filters.search}">
                <select id="statusFilter" class="px-4 py-2 border rounded-lg text-sm">
                    <option value="">전체 상태</option>
                    <option value="received" ${this.state.filters.status === 'received' ? 'selected' : ''}>서류접수</option>
                    <option value="reviewing" ${this.state.filters.status === 'reviewing' ? 'selected' : ''}>서류심사</option>
                    <option value="interview1" ${this.state.filters.status === 'interview1' ? 'selected' : ''}>1차면접</option>
                    <option value="interview2" ${this.state.filters.status === 'interview2' ? 'selected' : ''}>2차면접</option>
                    <option value="passed" ${this.state.filters.status === 'passed' ? 'selected' : ''}>합격</option>
                    <option value="failed" ${this.state.filters.status === 'failed' ? 'selected' : ''}>불합격</option>
                </select>
            </div>

            <div class="overflow-x-auto">
                <table class="w-full text-sm">
                    <thead class="bg-gray-50">
                        <tr>
                            <th class="px-3 py-2 text-center">
                                <input type="checkbox" id="selectAllApplicants" class="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500">
                            </th>
                            <th class="px-3 py-2 text-left font-semibold text-gray-600">이름</th>
                            <th class="px-3 py-2 text-left font-semibold text-gray-600">연락처</th>
                            <th class="px-3 py-2 text-left font-semibold text-gray-600">이메일</th>
                            <th class="px-3 py-2 text-left font-semibold text-gray-600">학력</th>
                            <th class="px-3 py-2 text-left font-semibold text-gray-600">경력</th>
                            <th class="px-3 py-2 text-left font-semibold text-gray-600">지원일</th>
                            <th class="px-3 py-2 text-left font-semibold text-gray-600">상태</th>
                            <th class="px-3 py-2 text-left font-semibold text-gray-600">관리</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${applicants.map(a => `
                            <tr class="border-t hover:bg-gray-50">
                                <td class="px-3 py-2 text-center">
                                    <input type="checkbox" class="applicant-checkbox w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" data-applicant-id="${a.id}" ${this.state.selectedApplicants.includes(a.id) ? 'checked' : ''}>
                                </td>
                                <td class="px-3 py-2 font-medium">${escapeHtml(a.name)}</td>
                                <td class="px-3 py-2 text-gray-600">${escapeHtml(a.phone) || '-'}</td>
                                <td class="px-3 py-2 text-gray-600">${escapeHtml(a.email) || '-'}</td>
                                <td class="px-3 py-2 text-gray-600">${escapeHtml(a.education) || '-'}</td>
                                <td class="px-3 py-2 text-gray-600">${escapeHtml(a.experience) || '-'}</td>
                                <td class="px-3 py-2 text-gray-600">${a.applied_at || '-'}</td>
                                <td class="px-3 py-2">
                                    <select class="applicant-status-select text-xs border rounded px-2 py-1" data-applicant-id="${a.id}">
                                        <option value="received" ${a.status === 'received' ? 'selected' : ''}>서류접수</option>
                                        <option value="reviewing" ${a.status === 'reviewing' ? 'selected' : ''}>서류심사</option>
                                        <option value="interview1" ${a.status === 'interview1' ? 'selected' : ''}>1차면접</option>
                                        <option value="interview2" ${a.status === 'interview2' ? 'selected' : ''}>2차면접</option>
                                        <option value="passed" ${a.status === 'passed' ? 'selected' : ''}>합격</option>
                                        <option value="failed" ${a.status === 'failed' ? 'selected' : ''}>불합격</option>
                                    </select>
                                </td>
                                <td class="px-3 py-2">
                                    <div class="flex gap-1">
                                        <button class="view-applicant-btn p-1.5 hover:bg-gray-100 rounded" data-id="${a.id}" title="상세보기">
                                            <i class="fas fa-eye text-gray-500"></i>
                                        </button>
                                        <button class="edit-applicant-btn p-1.5 hover:bg-gray-100 rounded" data-id="${a.id}" title="수정">
                                            <i class="fas fa-edit text-gray-500"></i>
                                        </button>
                                        <button class="delete-applicant-btn p-1.5 hover:bg-red-50 rounded" data-id="${a.id}" title="삭제">
                                            <i class="fas fa-trash text-red-500"></i>
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        `).join('') || `
                            <tr>
                                <td colspan="9" class="px-4 py-8 text-center text-gray-500">
                                    지원자가 없습니다. 엑셀 파일을 업로드하거나 직접 추가하세요.
                                </td>
                            </tr>
                        `}
                    </tbody>
                </table>
            </div>
            <input type="file" id="excelFileInput" class="hidden" accept=".xlsx,.xls">
        `;
    },

    renderInterviewsContent() {
        const month = this.state.calendarMonth;
        const year = month.getFullYear();
        const monthNum = month.getMonth();
        const firstDay = new Date(year, monthNum, 1).getDay();
        const daysInMonth = new Date(year, monthNum + 1, 0).getDate();
        const monthNames = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];

        const interviews = this.state.interviews;
        const today = new Date().toISOString().split('T')[0];

        const getInterviewsForDate = (day) => {
            const dateStr = `${year}-${String(monthNum + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            return interviews.filter(i => i.date === dateStr);
        };

        let calendarDays = '';
        for (let i = 0; i < firstDay; i++) {
            calendarDays += '<div class="h-20 bg-gray-50"></div>';
        }
        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${year}-${String(monthNum + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayInterviews = getInterviewsForDate(day);
            const isToday = dateStr === today;
            calendarDays += `
                <div class="h-20 border p-1 ${isToday ? 'bg-primary-50 border-primary-300' : 'bg-white'} hover:bg-gray-50 cursor-pointer" data-add-interview="${dateStr}">
                    <div class="text-xs font-medium ${isToday ? 'text-primary-600' : ''}">${day}</div>
                    <div class="space-y-0.5 mt-0.5">
                        ${dayInterviews.slice(0, 2).map(i => {
                            return `<div class="text-xs p-0.5 rounded ${i.type === '1차' ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700'} truncate">${escapeHtml(i.applicants?.name) || ''}</div>`;
                        }).join('')}
                        ${dayInterviews.length > 2 ? `<div class="text-xs text-gray-500">+${dayInterviews.length - 2}</div>` : ''}
                    </div>
                </div>
            `;
        }

        const upcomingInterviews = interviews
            .filter(i => i.date >= today)
            .sort((a, b) => a.date.localeCompare(b.date))
            .slice(0, 5);

        return `
            <div class="flex items-center justify-between mb-4">
                <h2 class="text-lg font-semibold">면접 일정</h2>
                <button id="addInterviewBtn" class="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 text-sm">
                    <i class="fas fa-plus mr-2"></i>면접 등록
                </button>
            </div>
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div class="lg:col-span-2">
                    <div class="flex items-center justify-between mb-3">
                        <button id="prevMonth" class="p-2 hover:bg-gray-100 rounded-lg"><i class="fas fa-chevron-left"></i></button>
                        <h3 class="font-semibold">${year}년 ${monthNames[monthNum]}</h3>
                        <button id="nextMonth" class="p-2 hover:bg-gray-100 rounded-lg"><i class="fas fa-chevron-right"></i></button>
                    </div>
                    <div class="grid grid-cols-7 gap-px mb-1">
                        ${['일', '월', '화', '수', '목', '금', '토'].map(d => `<div class="text-center text-xs font-medium text-gray-500 py-1">${d}</div>`).join('')}
                    </div>
                    <div class="grid grid-cols-7 gap-px">
                        ${calendarDays}
                    </div>
                </div>
                <div>
                    <h3 class="font-semibold mb-3">예정된 면접</h3>
                    <div class="space-y-2">
                        ${upcomingInterviews.length ? upcomingInterviews.map(i => `
                            <div class="p-3 border rounded-lg hover:bg-gray-50">
                                <div class="flex items-center justify-between">
                                    <span class="text-sm font-medium">${escapeHtml(i.applicants?.name) || '알 수 없음'}</span>
                                    <span class="text-xs px-2 py-0.5 rounded ${i.type === '1차' ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700'}">${escapeHtml(i.type)}면접</span>
                                </div>
                                <p class="text-xs text-gray-500 mt-1">${escapeHtml(i.date)} ${escapeHtml(i.time) || ''}</p>
                            </div>
                        `).join('') : '<p class="text-gray-500 text-sm text-center py-4">예정된 면접이 없습니다.</p>'}
                    </div>
                </div>
            </div>
        `;
    },

    renderReportsContent() {
        const postings = this.getAccessiblePostings();
        const applicants = this.getAccessibleApplicants();

        const statusCounts = {
            received: applicants.filter(a => a.status === 'received').length,
            reviewing: applicants.filter(a => a.status === 'reviewing').length,
            interview1: applicants.filter(a => a.status === 'interview1').length,
            interview2: applicants.filter(a => a.status === 'interview2').length,
            passed: applicants.filter(a => a.status === 'passed').length,
            failed: applicants.filter(a => a.status === 'failed').length
        };

        const sourceCounts = {};
        applicants.forEach(a => {
            if (a.source) {
                sourceCounts[a.source] = (sourceCounts[a.source] || 0) + 1;
            }
        });

        return `
            <h2 class="text-lg font-semibold mb-4">채용 통계</h2>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div class="bg-gray-50 p-4 rounded-lg">
                    <h3 class="font-medium mb-3">진행 단계별 현황</h3>
                    <div class="space-y-2 text-sm">
                        ${[
                            { label: '서류접수', value: statusCounts.received, color: 'gray' },
                            { label: '서류심사', value: statusCounts.reviewing, color: 'blue' },
                            { label: '1차면접', value: statusCounts.interview1, color: 'purple' },
                            { label: '2차면접', value: statusCounts.interview2, color: 'indigo' },
                            { label: '합격', value: statusCounts.passed, color: 'green' },
                            { label: '불합격', value: statusCounts.failed, color: 'red' }
                        ].map(s => `
                            <div class="flex items-center gap-2">
                                <span class="w-16">${s.label}</span>
                                <div class="flex-1 h-2 bg-gray-200 rounded-full">
                                    <div class="h-2 bg-${s.color}-500 rounded-full" style="width: ${applicants.length ? (s.value / applicants.length * 100) : 0}%"></div>
                                </div>
                                <span class="w-8 text-right">${s.value}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
                <div class="bg-gray-50 p-4 rounded-lg">
                    <h3 class="font-medium mb-3">유입 경로별 현황</h3>
                    <div class="space-y-2 text-sm">
                        ${Object.entries(sourceCounts).sort((a, b) => b[1] - a[1]).map(([source, count]) => `
                            <div class="flex items-center gap-2">
                                <span class="w-20 truncate">${source}</span>
                                <div class="flex-1 h-2 bg-gray-200 rounded-full">
                                    <div class="h-2 bg-primary-500 rounded-full" style="width: ${applicants.length ? (count / applicants.length * 100) : 0}%"></div>
                                </div>
                                <span class="w-8 text-right">${count}</span>
                            </div>
                        `).join('') || '<p class="text-gray-500">데이터가 없습니다.</p>'}
                    </div>
                </div>
            </div>
        `;
    },

    // =====================================================
    // 설정 페이지
    // =====================================================

    renderAdminSettingsPage() {
        const tab = this.state.settingsTab;

        return `
            <div class="p-6">
                <h1 class="text-2xl font-bold text-gray-800 mb-6">설정</h1>

                <div class="bg-white rounded-xl shadow-sm">
                    <div class="flex border-b">
                        <button class="settings-tab px-6 py-4 font-medium ${tab === 'users' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-gray-500 hover:text-gray-700'}" data-tab="users">
                            <i class="fas fa-user-cog mr-2"></i>사용자 관리
                        </button>
                        <button class="settings-tab px-6 py-4 font-medium ${tab === 'profile' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-gray-500 hover:text-gray-700'}" data-tab="profile">
                            <i class="fas fa-user mr-2"></i>내 정보
                        </button>
                    </div>

                    <div class="p-6">
                        ${this.renderSettingsTabContent()}
                    </div>
                </div>
            </div>
        `;
    },

    renderSettingsTabContent() {
        switch (this.state.settingsTab) {
            case 'users':
                return this.renderUsersContent();
            case 'profile':
                return this.renderProfileContent();
            default:
                return this.renderUsersContent();
        }
    },

    renderUsersContent() {
        const users = this.state.users;

        return `
            <div class="flex items-center justify-between mb-4">
                <h2 class="text-lg font-semibold">사용자 목록</h2>
                <div class="flex gap-2">
                    <button id="downloadUserTemplateBtn" class="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 text-sm">
                        <i class="fas fa-download mr-2"></i>양식 다운로드
                    </button>
                    <button id="uploadUserExcelBtn" class="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 text-sm">
                        <i class="fas fa-file-excel mr-2"></i>엑셀 업로드
                    </button>
                    <input type="file" id="userExcelFileInput" accept=".xlsx,.xls" class="hidden">
                    <button id="addUserBtn" class="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 text-sm">
                        <i class="fas fa-plus mr-2"></i>사용자 추가
                    </button>
                </div>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full">
                    <thead class="bg-gray-50">
                        <tr>
                            <th class="px-4 py-3 text-left text-sm font-semibold text-gray-600">이름</th>
                            <th class="px-4 py-3 text-left text-sm font-semibold text-gray-600">이메일</th>
                            <th class="px-4 py-3 text-left text-sm font-semibold text-gray-600">부서</th>
                            <th class="px-4 py-3 text-left text-sm font-semibold text-gray-600">역할</th>
                            <th class="px-4 py-3 text-left text-sm font-semibold text-gray-600">상태</th>
                            <th class="px-4 py-3 text-left text-sm font-semibold text-gray-600">관리</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${users.map(u => `
                            <tr class="border-t hover:bg-gray-50">
                                <td class="px-4 py-3 font-medium">${escapeHtml(u.name)}</td>
                                <td class="px-4 py-3 text-gray-600">${escapeHtml(u.email)}</td>
                                <td class="px-4 py-3 text-gray-600">${escapeHtml(u.department) || '-'}</td>
                                <td class="px-4 py-3">
                                    <span class="text-xs px-2 py-1 rounded ${u.role === 'super_admin' ? 'bg-purple-100 text-purple-700' : u.role === 'admin' ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-700'}">
                                        ${escapeHtml(Auth.getRoleName(u.role))}
                                    </span>
                                </td>
                                <td class="px-4 py-3">
                                    <span class="text-xs px-2 py-1 rounded ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">
                                        ${u.is_active ? '활성' : '비활성'}
                                    </span>
                                </td>
                                <td class="px-4 py-3">
                                    <div class="flex gap-1">
                                        <button class="edit-user-btn p-2 hover:bg-gray-100 rounded text-gray-500" data-user-id="${u.id}" title="수정">
                                            <i class="fas fa-edit"></i>
                                        </button>
                                        ${u.id !== this.state.currentUser.id ? `
                                            <button class="toggle-user-btn p-2 hover:bg-gray-100 rounded ${u.is_active ? 'text-red-500' : 'text-green-500'}" data-user-id="${u.id}" data-active="${u.is_active}" title="${u.is_active ? '비활성화' : '활성화'}">
                                                <i class="fas fa-${u.is_active ? 'ban' : 'check'}"></i>
                                            </button>
                                            <button class="delete-user-btn p-2 hover:bg-gray-100 rounded text-red-500" data-user-id="${u.id}" data-user-name="${escapeHtml(u.name)}" title="삭제">
                                                <i class="fas fa-trash"></i>
                                            </button>
                                        ` : ''}
                                    </div>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    },

    renderProfileContent() {
        const user = this.state.currentUser;

        return `
            <div class="max-w-md">
                <h2 class="text-lg font-semibold mb-4">내 정보</h2>
                <form id="profileForm" class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">이름</label>
                        <input type="text" name="name" class="w-full px-4 py-2 border rounded-lg" value="${escapeHtml(user.name)}" required>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">이메일</label>
                        <input type="email" class="w-full px-4 py-2 border rounded-lg bg-gray-100" value="${escapeHtml(user.email)}" disabled>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">부서</label>
                        <input type="text" name="department" class="w-full px-4 py-2 border rounded-lg" value="${escapeHtml(user.department) || ''}">
                    </div>
                    <button type="submit" class="px-6 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600">
                        저장
                    </button>
                </form>

                <hr class="my-6">

                <h3 class="text-lg font-semibold mb-4">비밀번호 변경</h3>
                <form id="passwordForm" class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">새 비밀번호</label>
                        <input type="password" name="newPassword" class="w-full px-4 py-2 border rounded-lg" required minlength="6">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">비밀번호 확인</label>
                        <input type="password" name="confirmPassword" class="w-full px-4 py-2 border rounded-lg" required minlength="6">
                    </div>
                    <button type="submit" class="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700">
                        비밀번호 변경
                    </button>
                </form>
            </div>
        `;
    },

    // =====================================================
    // 모달
    // =====================================================

    showModal(title, content, onConfirm, confirmText = '저장') {
        const modal = document.getElementById('modalContainer');
        modal.innerHTML = `
            <div class="modal fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div class="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-auto">
                    <div class="flex items-center justify-between p-6 border-b">
                        <h2 class="text-xl font-bold">${title}</h2>
                        <button id="closeModal" class="p-2 hover:bg-gray-100 rounded-lg">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="p-6">
                        ${content}
                    </div>
                    <div class="flex justify-end gap-3 p-6 border-t">
                        <button id="cancelModal" class="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">취소</button>
                        <button id="confirmModal" class="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600">${confirmText}</button>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('closeModal').onclick = () => modal.innerHTML = '';
        document.getElementById('cancelModal').onclick = () => modal.innerHTML = '';
        document.getElementById('confirmModal').onclick = async () => {
            const result = await onConfirm();
            if (result !== false) {
                modal.innerHTML = '';
            }
        };
    },

    // =====================================================
    // 이벤트 바인딩
    // =====================================================

    bindEvents() {
        // 로그인 폼
        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            loginForm.onsubmit = async (e) => {
                e.preventDefault();
                const email = document.getElementById('loginEmail').value;
                const password = document.getElementById('loginPassword').value;
                const success = await this.login(email, password);
                if (!success) {
                    document.getElementById('loginError').classList.remove('hidden');
                }
            };
        }

        // 로그아웃
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.onclick = () => this.logout();
        }

        // 네비게이션
        document.querySelectorAll('[data-page]').forEach(el => {
            el.onclick = (e) => {
                e.preventDefault();
                this.navigate(el.dataset.page);
            };
        });

        // 채용관리 탭 전환
        document.querySelectorAll('.recruitment-tab').forEach(el => {
            el.onclick = () => {
                this.state.recruitmentTab = el.dataset.tab;
                this.state.selectedPosting = null;
                this.state.selectedApplicants = [];
                this.render();
            };
        });

        // 설정 탭 전환
        document.querySelectorAll('.settings-tab').forEach(el => {
            el.onclick = () => {
                this.state.settingsTab = el.dataset.tab;
                this.render();
            };
        });

        // 공고 관련 이벤트
        this.bindPostingEvents();

        // 지원자 관련 이벤트
        this.bindApplicantEvents();

        // 면접 관련 이벤트
        this.bindInterviewEvents();

        // 사용자 관련 이벤트
        this.bindUserEvents();

        // 프로필 관련 이벤트
        this.bindProfileEvents();
    },

    bindPostingEvents() {
        // 공고 추가
        const addPostingBtn = document.getElementById('addPostingBtn');
        if (addPostingBtn) {
            addPostingBtn.onclick = () => this.showPostingModal();
        }

        // 지원자 목록 보기
        document.querySelectorAll('.view-applicants-btn').forEach(el => {
            el.onclick = async () => {
                const postingId = parseInt(el.dataset.postingId);
                this.state.selectedPosting = postingId;
                this.state.selectedApplicants = [];
                this.state.filters = { status: '', search: '' };
                this.showLoading(true);
                await this.loadApplicants(postingId);
                this.showLoading(false);
                this.render();
            };
        });

        // 뒤로가기
        const backBtn = document.getElementById('backToPostings');
        if (backBtn) {
            backBtn.onclick = () => {
                this.state.selectedPosting = null;
                this.state.selectedApplicants = [];
                this.render();
            };
        }

        // 공고 수정
        document.querySelectorAll('.edit-posting-btn').forEach(el => {
            el.onclick = () => {
                const posting = this.state.postings.find(p => p.id === parseInt(el.dataset.postingId));
                this.showPostingModal(posting);
            };
        });

        // 공고 복제
        document.querySelectorAll('.duplicate-posting-btn').forEach(el => {
            el.onclick = async () => {
                if (confirm('이 공고를 복제하시겠습니까?')) {
                    this.showLoading(true);
                    const result = await DB.duplicatePosting(parseInt(el.dataset.postingId));
                    if (result.success) {
                        await this.loadData();
                        this.render();
                    } else {
                        alert('공고 복제에 실패했습니다.');
                    }
                    this.showLoading(false);
                }
            };
        });

        // 공고 삭제
        document.querySelectorAll('.delete-posting-btn').forEach(el => {
            el.onclick = async () => {
                if (confirm('정말 삭제하시겠습니까? 해당 공고의 모든 지원자 정보도 함께 삭제됩니다.')) {
                    this.showLoading(true);
                    const result = await DB.deletePosting(parseInt(el.dataset.postingId));
                    if (result.success) {
                        await this.loadData();
                        this.render();
                    } else {
                        alert('삭제에 실패했습니다.');
                    }
                    this.showLoading(false);
                }
            };
        });

        // 공고 상태 변경
        document.querySelectorAll('.posting-status-select').forEach(el => {
            el.onchange = async () => {
                const postingId = parseInt(el.dataset.postingId);
                const result = await DB.updatePosting(postingId, { status: el.value });
                if (!result.success) {
                    alert('상태 변경에 실패했습니다.');
                    await this.loadData();
                    this.render();
                }
            };
        });
    },

    bindApplicantEvents() {
        // 지원자 추가
        const addApplicantBtn = document.getElementById('addApplicantBtn');
        if (addApplicantBtn) {
            addApplicantBtn.onclick = () => this.showApplicantModal();
        }

        // 검색
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            let searchTimeout;
            searchInput.oninput = () => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    this.state.filters.search = searchInput.value;
                    this.render();
                }, 300);
            };
        }

        // 상태 필터
        const statusFilter = document.getElementById('statusFilter');
        if (statusFilter) {
            statusFilter.onchange = () => {
                this.state.filters.status = statusFilter.value;
                this.render();
            };
        }

        // 지원자 수정
        document.querySelectorAll('.edit-applicant-btn').forEach(el => {
            el.onclick = () => {
                const applicant = this.state.applicants.find(a => a.id === parseInt(el.dataset.id));
                this.showApplicantModal(applicant);
            };
        });

        // 지원자 상세 보기
        document.querySelectorAll('.view-applicant-btn').forEach(el => {
            el.onclick = () => {
                const applicant = this.state.applicants.find(a => a.id === parseInt(el.dataset.id));
                this.showApplicantDetailModal(applicant);
            };
        });

        // 지원자 삭제
        document.querySelectorAll('.delete-applicant-btn').forEach(el => {
            el.onclick = async () => {
                if (confirm('정말 삭제하시겠습니까?')) {
                    this.showLoading(true);
                    const applicantId = parseInt(el.dataset.id);
                    await Storage.deleteAllAttachments(applicantId);
                    const result = await DB.deleteApplicant(applicantId);
                    if (result.success) {
                        await this.loadApplicants(this.state.selectedPosting);
                        this.render();
                    } else {
                        alert('삭제에 실패했습니다.');
                    }
                    this.showLoading(false);
                }
            };
        });

        // 지원자 상태 변경
        document.querySelectorAll('.applicant-status-select').forEach(el => {
            el.onchange = async () => {
                const applicantId = parseInt(el.dataset.applicantId);
                const result = await DB.updateApplicant(applicantId, { status: el.value });
                if (!result.success) {
                    alert('상태 변경에 실패했습니다.');
                    await this.loadApplicants(this.state.selectedPosting);
                    this.render();
                }
            };
        });

        // 전체 선택
        const selectAll = document.getElementById('selectAllApplicants');
        if (selectAll) {
            selectAll.onchange = () => {
                const checkboxes = document.querySelectorAll('.applicant-checkbox');
                if (selectAll.checked) {
                    this.state.selectedApplicants = this.state.applicants.map(a => a.id);
                } else {
                    this.state.selectedApplicants = [];
                }
                checkboxes.forEach(cb => cb.checked = selectAll.checked);
                this.updateDownloadAttachmentsButton();
            };
        }

        // 개별 선택
        document.querySelectorAll('.applicant-checkbox').forEach(cb => {
            cb.onchange = () => {
                const id = parseInt(cb.dataset.applicantId);
                if (cb.checked) {
                    if (!this.state.selectedApplicants.includes(id)) {
                        this.state.selectedApplicants.push(id);
                    }
                } else {
                    this.state.selectedApplicants = this.state.selectedApplicants.filter(i => i !== id);
                }
                this.updateDownloadAttachmentsButton();
            };
        });

        // 엑셀 업로드
        const uploadExcelBtn = document.getElementById('uploadExcelBtn');
        const excelFileInput = document.getElementById('excelFileInput');
        if (uploadExcelBtn && excelFileInput) {
            uploadExcelBtn.onclick = () => excelFileInput.click();
            excelFileInput.onchange = () => {
                if (excelFileInput.files[0]) {
                    this.handleExcelUpload(excelFileInput.files[0]);
                }
            };
        }

        // 엑셀 다운로드
        const downloadExcelBtn = document.getElementById('downloadExcelBtn');
        if (downloadExcelBtn) {
            downloadExcelBtn.onclick = () => this.exportApplicantsToExcel();
        }

        // 선택 지원자 첨부파일 일괄 다운로드
        const downloadAttachmentsBtn = document.getElementById('downloadAttachmentsBtn');
        if (downloadAttachmentsBtn) {
            downloadAttachmentsBtn.onclick = () => this.downloadSelectedApplicantsAttachments();
        }
    },

    bindInterviewEvents() {
        // 면접 추가
        const addInterviewBtn = document.getElementById('addInterviewBtn');
        if (addInterviewBtn) {
            addInterviewBtn.onclick = () => this.showInterviewModal();
        }

        // 캘린더 네비게이션
        const prevMonth = document.getElementById('prevMonth');
        const nextMonth = document.getElementById('nextMonth');
        if (prevMonth) {
            prevMonth.onclick = () => {
                this.state.calendarMonth = new Date(
                    this.state.calendarMonth.getFullYear(),
                    this.state.calendarMonth.getMonth() - 1,
                    1
                );
                this.render();
            };
        }
        if (nextMonth) {
            nextMonth.onclick = () => {
                this.state.calendarMonth = new Date(
                    this.state.calendarMonth.getFullYear(),
                    this.state.calendarMonth.getMonth() + 1,
                    1
                );
                this.render();
            };
        }
    },

    bindUserEvents() {
        // 사용자 추가
        const addUserBtn = document.getElementById('addUserBtn');
        if (addUserBtn) {
            addUserBtn.onclick = () => this.showAddUserModal();
        }

        // 사용자 엑셀 양식 다운로드
        const downloadUserTemplateBtn = document.getElementById('downloadUserTemplateBtn');
        if (downloadUserTemplateBtn) {
            downloadUserTemplateBtn.onclick = () => this.downloadUserTemplate();
        }

        // 사용자 엑셀 업로드
        const uploadUserExcelBtn = document.getElementById('uploadUserExcelBtn');
        const userExcelFileInput = document.getElementById('userExcelFileInput');
        if (uploadUserExcelBtn && userExcelFileInput) {
            uploadUserExcelBtn.onclick = () => userExcelFileInput.click();
            userExcelFileInput.onchange = () => {
                if (userExcelFileInput.files[0]) {
                    this.handleUserExcelUpload(userExcelFileInput.files[0]);
                    userExcelFileInput.value = ''; // 같은 파일 재선택 가능하도록
                }
            };
        }

        // 사용자 수정
        document.querySelectorAll('.edit-user-btn').forEach(el => {
            el.onclick = () => {
                const user = this.state.users.find(u => u.id === el.dataset.userId);
                this.showUserModal(user);
            };
        });

        // 사용자 활성/비활성 토글
        document.querySelectorAll('.toggle-user-btn').forEach(el => {
            el.onclick = async () => {
                const isActive = el.dataset.active === 'true';
                const action = isActive ? '비활성화' : '활성화';
                if (confirm(`이 사용자를 ${action}하시겠습니까?`)) {
                    this.showLoading(true);
                    const result = await DB.toggleUserActive(el.dataset.userId, !isActive);
                    if (result.success) {
                        await this.loadData();
                        this.render();
                    } else {
                        alert(`${action}에 실패했습니다.`);
                    }
                    this.showLoading(false);
                }
            };
        });

        // 사용자 삭제
        document.querySelectorAll('.delete-user-btn').forEach(el => {
            el.onclick = async () => {
                const userName = el.dataset.userName;
                if (confirm(`"${userName}" 사용자를 삭제하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다.`)) {
                    this.showLoading(true);
                    const result = await Auth.deleteUser(el.dataset.userId);
                    if (result.success) {
                        alert('사용자가 삭제되었습니다.');
                        await this.loadData();
                        this.render();
                    } else {
                        alert('삭제에 실패했습니다: ' + result.error);
                    }
                    this.showLoading(false);
                }
            };
        });
    },

    bindProfileEvents() {
        // 프로필 저장
        const profileForm = document.getElementById('profileForm');
        if (profileForm) {
            profileForm.onsubmit = async (e) => {
                e.preventDefault();
                const formData = new FormData(profileForm);
                this.showLoading(true);
                const result = await Auth.updateProfile({
                    name: formData.get('name'),
                    department: formData.get('department')
                });
                if (result.success) {
                    this.state.currentUser = result.profile;
                    alert('프로필이 저장되었습니다.');
                    this.render();
                } else {
                    alert('프로필 저장에 실패했습니다.');
                }
                this.showLoading(false);
            };
        }

        // 비밀번호 변경
        const passwordForm = document.getElementById('passwordForm');
        if (passwordForm) {
            passwordForm.onsubmit = async (e) => {
                e.preventDefault();
                const formData = new FormData(passwordForm);
                const newPassword = formData.get('newPassword');
                const confirmPassword = formData.get('confirmPassword');

                if (newPassword !== confirmPassword) {
                    alert('비밀번호가 일치하지 않습니다.');
                    return;
                }

                this.showLoading(true);
                const result = await Auth.changePassword(newPassword);
                if (result.success) {
                    alert('비밀번호가 변경되었습니다.');
                    passwordForm.reset();
                } else {
                    alert('비밀번호 변경에 실패했습니다.');
                }
                this.showLoading(false);
            };
        }
    },

    // =====================================================
    // 공고 모달
    // =====================================================

    showPostingModal(posting = null) {
        const isEdit = !!posting;
        const users = this.state.users.filter(u => u.role !== 'super_admin' && u.is_active);
        const assignedUserIds = posting?.assigned_users || [];

        const content = `
            <form id="postingForm" class="space-y-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">공고명 *</label>
                    <input type="text" name="title" class="w-full px-4 py-2 border rounded-lg" value="${escapeHtml(posting?.title) || ''}" required>
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">부서</label>
                        <input type="text" name="department" class="w-full px-4 py-2 border rounded-lg" value="${escapeHtml(posting?.department) || ''}">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">모집인원</label>
                        <input type="number" name="headcount" class="w-full px-4 py-2 border rounded-lg" value="${posting?.headcount || 1}" min="1">
                    </div>
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">시작일</label>
                        <input type="date" name="start_date" class="w-full px-4 py-2 border rounded-lg" value="${posting?.start_date || ''}">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">마감일</label>
                        <input type="date" name="end_date" class="w-full px-4 py-2 border rounded-lg" value="${posting?.end_date || ''}">
                    </div>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">상세내용</label>
                    <textarea name="description" class="w-full px-4 py-2 border rounded-lg" rows="3">${escapeHtml(posting?.description) || ''}</textarea>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">열람 권한 할당</label>
                    <p class="text-xs text-gray-500 mb-2">이 공고를 열람할 수 있는 사용자를 선택하세요. (슈퍼관리자는 항상 열람 가능)</p>
                    <div class="max-h-40 overflow-y-auto border rounded-lg p-2 space-y-1">
                        ${users.length > 0 ? users.map(u => `
                            <label class="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer">
                                <input type="checkbox" name="assigned_users" value="${u.id}" class="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" ${assignedUserIds.includes(u.id) ? 'checked' : ''}>
                                <span class="text-sm">${escapeHtml(u.name)}</span>
                                <span class="text-xs text-gray-400">(${escapeHtml(u.email)})</span>
                                <span class="text-xs px-1.5 py-0.5 rounded ${u.role === 'admin' ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-600'}">${Auth.getRoleName(u.role)}</span>
                            </label>
                        `).join('') : '<p class="text-sm text-gray-400 text-center py-2">할당 가능한 사용자가 없습니다.</p>'}
                    </div>
                </div>
            </form>
        `;

        this.showModal(isEdit ? '공고 수정' : '새 공고 등록', content, async () => {
            const form = document.getElementById('postingForm');
            const formData = new FormData(form);

            // 선택된 사용자 ID 배열 가져오기
            const selectedUsers = Array.from(form.querySelectorAll('input[name="assigned_users"]:checked')).map(cb => cb.value);

            const data = {
                title: formData.get('title'),
                department: formData.get('department'),
                headcount: parseInt(formData.get('headcount')) || 1,
                start_date: formData.get('start_date') || null,
                end_date: formData.get('end_date') || null,
                description: formData.get('description'),
                assigned_users: selectedUsers
            };

            if (!data.title) {
                alert('공고명을 입력하세요.');
                return false;
            }

            this.showLoading(true);
            let result;
            if (isEdit) {
                result = await DB.updatePosting(posting.id, data);
            } else {
                result = await DB.createPosting(data);
            }

            if (result.success) {
                await this.loadData();
                this.render();
            } else {
                alert('저장에 실패했습니다.');
            }
            this.showLoading(false);
            return result.success;
        });
    },

    // =====================================================
    // 지원자 모달
    // =====================================================

    showApplicantModal(applicant = null) {
        const isEdit = !!applicant;
        const content = `
            <form id="applicantForm" class="space-y-4">
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">이름 *</label>
                        <input type="text" name="name" class="w-full px-4 py-2 border rounded-lg" value="${escapeHtml(applicant?.name) || ''}" required>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">연락처</label>
                        <input type="tel" name="phone" class="w-full px-4 py-2 border rounded-lg" value="${escapeHtml(applicant?.phone) || ''}" placeholder="010-0000-0000">
                    </div>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">이메일</label>
                    <input type="email" name="email" class="w-full px-4 py-2 border rounded-lg" value="${escapeHtml(applicant?.email) || ''}">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">학력</label>
                    <input type="text" name="education" class="w-full px-4 py-2 border rounded-lg" value="${escapeHtml(applicant?.education) || ''}">
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">경력</label>
                        <input type="text" name="experience" class="w-full px-4 py-2 border rounded-lg" value="${escapeHtml(applicant?.experience) || ''}" placeholder="예: 3년">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">희망연봉</label>
                        <input type="text" name="desired_salary" class="w-full px-4 py-2 border rounded-lg" value="${escapeHtml(applicant?.desired_salary) || ''}">
                    </div>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">유입경로</label>
                    <select name="source" class="w-full px-4 py-2 border rounded-lg">
                        <option value="사람인" ${applicant?.source === '사람인' ? 'selected' : ''}>사람인</option>
                        <option value="잡코리아" ${applicant?.source === '잡코리아' ? 'selected' : ''}>잡코리아</option>
                        <option value="직접지원" ${applicant?.source === '직접지원' ? 'selected' : ''}>직접지원</option>
                        <option value="추천" ${applicant?.source === '추천' ? 'selected' : ''}>추천</option>
                        <option value="기타" ${applicant?.source === '기타' ? 'selected' : ''}>기타</option>
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">메모</label>
                    <textarea name="notes" class="w-full px-4 py-2 border rounded-lg" rows="2">${escapeHtml(applicant?.notes) || ''}</textarea>
                </div>
            </form>
        `;

        this.showModal(isEdit ? '지원자 수정' : '지원자 추가', content, async () => {
            const form = document.getElementById('applicantForm');
            const formData = new FormData(form);

            const data = {
                name: formData.get('name'),
                phone: formData.get('phone'),
                email: formData.get('email'),
                education: formData.get('education'),
                experience: formData.get('experience'),
                desired_salary: formData.get('desired_salary'),
                source: formData.get('source'),
                notes: formData.get('notes')
            };

            if (!data.name) {
                alert('이름을 입력하세요.');
                return false;
            }

            this.showLoading(true);
            let result;
            if (isEdit) {
                result = await DB.updateApplicant(applicant.id, data);
            } else {
                data.posting_id = this.state.selectedPosting;

                // 이메일 중복 체크
                if (data.email && data.email.trim()) {
                    const existingResult = await DB.getExistingEmails(data.posting_id);
                    const existingEmails = existingResult.emails || [];
                    if (existingEmails.includes(data.email.toLowerCase().trim())) {
                        alert('이미 동일한 이메일의 지원자가 등록되어 있습니다.');
                        this.showLoading(false);
                        return false;
                    }
                }

                result = await DB.createApplicant(data);
            }

            if (result.success) {
                await this.loadApplicants(this.state.selectedPosting);
                this.render();
            } else {
                alert('저장에 실패했습니다.');
            }
            this.showLoading(false);
            return result.success;
        });
    },

    // =====================================================
    // 지원자 상세 모달
    // =====================================================

    async showApplicantDetailModal(applicant) {
        const posting = this.state.postings.find(p => p.id === applicant.posting_id);
        const attachments = applicant.attachments || [];
        const modal = document.getElementById('modalContainer');

        modal.innerHTML = `
            <div class="modal fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div class="bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-auto">
                    <div class="flex items-center justify-between p-6 border-b">
                        <h2 class="text-xl font-bold">지원자 상세정보</h2>
                        <button id="closeDetailModal" class="p-2 hover:bg-gray-100 rounded-lg">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="p-6">
                        <div class="flex items-start gap-6 mb-6">
                            <div class="w-20 h-20 bg-gray-200 rounded-full flex items-center justify-center">
                                <i class="fas fa-user text-3xl text-gray-400"></i>
                            </div>
                            <div>
                                <h3 class="text-2xl font-bold">${escapeHtml(applicant.name)}</h3>
                                <p class="text-gray-500">${escapeHtml(posting?.title) || '알 수 없음'}</p>
                                <span class="status-badge status-${applicant.status} mt-2 inline-block">${escapeHtml(DB.getStatusName(applicant.status))}</span>
                            </div>
                        </div>

                        <div class="grid grid-cols-2 gap-6">
                            <div>
                                <h4 class="font-semibold text-gray-700 mb-3">연락처 정보</h4>
                                <div class="space-y-2 text-sm">
                                    <p><i class="fas fa-phone w-5 text-gray-400"></i> ${escapeHtml(applicant.phone) || '-'}</p>
                                    <p><i class="fas fa-envelope w-5 text-gray-400"></i> ${escapeHtml(applicant.email) || '-'}</p>
                                </div>
                            </div>
                            <div>
                                <h4 class="font-semibold text-gray-700 mb-3">지원 정보</h4>
                                <div class="space-y-2 text-sm">
                                    <p><i class="fas fa-calendar w-5 text-gray-400"></i> 지원일: ${escapeHtml(applicant.applied_at) || '-'}</p>
                                    <p><i class="fas fa-link w-5 text-gray-400"></i> 유입경로: ${escapeHtml(applicant.source) || '-'}</p>
                                </div>
                            </div>
                        </div>

                        <div class="mt-6">
                            <h4 class="font-semibold text-gray-700 mb-3">경력 사항</h4>
                            <div class="bg-gray-50 p-4 rounded-lg space-y-2 text-sm">
                                <p><strong>학력:</strong> ${escapeHtml(applicant.education) || '-'}</p>
                                <p><strong>경력:</strong> ${escapeHtml(applicant.experience) || '-'}</p>
                                <p><strong>희망연봉:</strong> ${escapeHtml(applicant.desired_salary) || '-'}</p>
                            </div>
                        </div>

                        <div class="mt-6">
                            <div class="flex items-center justify-between mb-3">
                                <h4 class="font-semibold text-gray-700">첨부파일</h4>
                                <label class="px-3 py-1 text-sm bg-primary-50 text-primary-600 rounded cursor-pointer hover:bg-primary-100">
                                    <i class="fas fa-upload mr-1"></i>파일 추가
                                    <input type="file" id="attachmentInput" class="hidden" data-applicant-id="${applicant.id}" accept=".pdf,.doc,.docx,.hwp,.jpg,.png" multiple>
                                </label>
                            </div>
                            <!-- 드래그앤드롭 영역 -->
                            <div id="dropZone" class="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-primary-400 transition-colors cursor-pointer" data-applicant-id="${applicant.id}">
                                <i class="fas fa-cloud-upload-alt text-2xl text-gray-400 mb-2"></i>
                                <p class="text-sm text-gray-500">파일을 여기에 드래그하거나 클릭하여 업로드</p>
                                <input type="file" id="dropZoneInput" class="hidden" accept=".pdf,.doc,.docx,.hwp,.jpg,.png" multiple>
                            </div>
                            <div class="mt-3 space-y-2" id="attachmentList">
                                ${attachments.length ? attachments.map(att => {
                                    const isPdf = Storage.isPdf(att.file_name);
                                    return `
                                    <div class="flex items-center justify-between p-2 bg-gray-50 rounded">
                                        <div class="flex items-center gap-2 flex-1">
                                            <i class="fas ${Storage.getFileIcon(att.file_type)}"></i>
                                            ${isPdf ? `
                                                <a href="#" class="pdf-view-link text-sm text-blue-600 hover:underline cursor-pointer" data-path="${escapeHtml(att.storage_path)}">${escapeHtml(att.file_name)}</a>
                                            ` : `
                                                <span class="text-sm">${escapeHtml(att.file_name)}</span>
                                            `}
                                            <span class="text-xs text-gray-400">(${escapeHtml(att.file_size)})</span>
                                        </div>
                                        <div class="flex items-center gap-2">
                                            ${isPdf ? `
                                                <button class="pdf-view-btn text-green-500 hover:text-green-700 p-1" data-path="${escapeHtml(att.storage_path)}" title="브라우저에서 보기">
                                                    <i class="fas fa-eye text-sm"></i>
                                                </button>
                                            ` : ''}
                                            <button class="attachment-download-btn text-blue-500 hover:text-blue-700 p-1" data-path="${escapeHtml(att.storage_path)}" data-name="${escapeHtml(att.file_name)}" title="다운로드">
                                                <i class="fas fa-download text-sm"></i>
                                            </button>
                                            <button class="delete-attachment-btn text-red-500 hover:text-red-700 p-1" data-id="${att.id}" data-path="${escapeHtml(att.storage_path)}" title="삭제">
                                                <i class="fas fa-trash text-sm"></i>
                                            </button>
                                        </div>
                                    </div>
                                `}).join('') : '<p class="text-sm text-gray-400 text-center py-2">첨부된 파일이 없습니다.</p>'}
                            </div>
                        </div>

                        ${applicant.notes ? `
                            <div class="mt-6">
                                <h4 class="font-semibold text-gray-700 mb-3">메모</h4>
                                <div class="bg-yellow-50 p-4 rounded-lg text-sm">
                                    ${escapeHtml(applicant.notes)}
                                </div>
                            </div>
                        ` : ''}

                        ${Auth.isAdminOrAbove() ? `
                            <div class="mt-6">
                                <h4 class="font-semibold text-gray-700 mb-3">
                                    <i class="fas fa-comments text-purple-500 mr-2"></i>관리자 코멘트
                                    <span class="text-xs font-normal text-gray-400 ml-2">(일반 사용자에게 비공개)</span>
                                </h4>
                                <div class="bg-purple-50 p-4 rounded-lg">
                                    <!-- 코멘트 히스토리 -->
                                    <div id="commentHistory" class="space-y-3 mb-4 max-h-60 overflow-y-auto">
                                        <p class="text-sm text-gray-400 text-center py-2">코멘트를 불러오는 중...</p>
                                    </div>
                                    <!-- 새 코멘트 입력 -->
                                    <div class="flex gap-2">
                                        <input type="text" id="newCommentInput" class="flex-1 px-3 py-2 border border-purple-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-400 focus:border-transparent" placeholder="코멘트를 입력하세요...">
                                        <button id="addCommentBtn" class="px-4 py-2 bg-purple-500 text-white text-sm rounded-lg hover:bg-purple-600 transition whitespace-nowrap">
                                            <i class="fas fa-plus mr-1"></i>추가
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;

        document.getElementById('closeDetailModal').onclick = () => modal.innerHTML = '';

        // 첨부파일 업로드
        const attachmentInput = document.getElementById('attachmentInput');
        if (attachmentInput) {
            attachmentInput.onchange = async () => {
                const files = Array.from(attachmentInput.files);
                if (files.length > 0) {
                    this.showLoading(true);
                    const result = await Storage.uploadFiles(applicant.id, files);
                    this.showLoading(false);

                    if (result.successCount > 0) {
                        // 지원자 정보 다시 로드
                        const updated = await DB.getApplicant(applicant.id);
                        if (updated.success) {
                            this.showApplicantDetailModal(updated.data);
                        }
                    }

                    if (result.failedCount > 0) {
                        alert(`${result.successCount}개 파일 업로드 완료, ${result.failedCount}개 파일 실패`);
                    } else {
                        alert(`${result.successCount}개의 파일이 추가되었습니다.`);
                    }
                }
            };
        }

        // 드래그앤드롭 영역 이벤트
        const dropZone = document.getElementById('dropZone');
        const dropZoneInput = document.getElementById('dropZoneInput');

        if (dropZone && dropZoneInput) {
            // 클릭 시 파일 선택
            dropZone.onclick = () => dropZoneInput.click();

            // 파일 선택 시 업로드
            dropZoneInput.onchange = async () => {
                const files = Array.from(dropZoneInput.files);
                if (files.length > 0) {
                    this.showLoading(true);
                    const result = await Storage.uploadFiles(applicant.id, files);
                    this.showLoading(false);

                    if (result.successCount > 0) {
                        const updated = await DB.getApplicant(applicant.id);
                        if (updated.success) {
                            this.showApplicantDetailModal(updated.data);
                        }
                    }
                    alert(`${result.successCount}개 파일 업로드 완료${result.failedCount > 0 ? `, ${result.failedCount}개 실패` : ''}`);
                }
            };

            // 드래그 이벤트
            dropZone.ondragover = (e) => {
                e.preventDefault();
                dropZone.classList.add('border-primary-500', 'bg-primary-50');
            };

            dropZone.ondragleave = (e) => {
                e.preventDefault();
                dropZone.classList.remove('border-primary-500', 'bg-primary-50');
            };

            dropZone.ondrop = async (e) => {
                e.preventDefault();
                dropZone.classList.remove('border-primary-500', 'bg-primary-50');

                const files = Array.from(e.dataTransfer.files);
                if (files.length > 0) {
                    this.showLoading(true);
                    const result = await Storage.uploadFiles(applicant.id, files);
                    this.showLoading(false);

                    if (result.successCount > 0) {
                        const updated = await DB.getApplicant(applicant.id);
                        if (updated.success) {
                            this.showApplicantDetailModal(updated.data);
                        }
                    }
                    alert(`${result.successCount}개 파일 업로드 완료${result.failedCount > 0 ? `, ${result.failedCount}개 실패` : ''}`);
                }
            };
        }

        // PDF 브라우저에서 보기 (버튼)
        document.querySelectorAll('.pdf-view-btn').forEach(btn => {
            btn.onclick = async () => {
                await Storage.viewPdfInBrowser(btn.dataset.path);
            };
        });

        // PDF 브라우저에서 보기 (파일명 클릭)
        document.querySelectorAll('.pdf-view-link').forEach(link => {
            link.onclick = async (e) => {
                e.preventDefault();
                await Storage.viewPdfInBrowser(link.dataset.path);
            };
        });

        // 첨부파일 다운로드 버튼
        document.querySelectorAll('.attachment-download-btn').forEach(btn => {
            btn.onclick = async () => {
                await Storage.downloadFile(btn.dataset.path, btn.dataset.name);
            };
        });

        // 첨부파일 삭제
        document.querySelectorAll('.delete-attachment-btn').forEach(btn => {
            btn.onclick = async () => {
                if (confirm('이 파일을 삭제하시겠습니까?')) {
                    this.showLoading(true);
                    await Storage.deleteFile(btn.dataset.path);
                    await DB.deleteAttachment(btn.dataset.id);
                    this.showLoading(false);

                    // 지원자 정보 다시 로드
                    const updated = await DB.getApplicant(applicant.id);
                    if (updated.success) {
                        this.showApplicantDetailModal(updated.data);
                    }
                }
            };
        });

        // 관리자 코멘트 히스토리
        const commentHistory = document.getElementById('commentHistory');
        const newCommentInput = document.getElementById('newCommentInput');
        const addCommentBtn = document.getElementById('addCommentBtn');

        if (commentHistory && Auth.isAdminOrAbove()) {
            // 코멘트 렌더링 함수
            const renderComments = (comments) => {
                if (!comments || comments.length === 0) {
                    commentHistory.innerHTML = '<p class="text-sm text-gray-400 text-center py-2">아직 코멘트가 없습니다.</p>';
                    return;
                }

                commentHistory.innerHTML = comments.map(c => {
                    const authorName = c.profiles?.name || '알 수 없음';
                    const date = new Date(c.created_at);
                    const dateStr = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
                    const isOwn = c.user_id === Auth.currentUser?.id;
                    const isSuperAdmin = Auth.isSuperAdmin();

                    return `
                        <div class="bg-white p-3 rounded-lg shadow-sm border border-purple-100">
                            <div class="flex justify-between items-start">
                                <div class="flex-1">
                                    <div class="flex items-center gap-2 mb-1">
                                        <span class="font-medium text-sm text-purple-700">${escapeHtml(authorName)}</span>
                                        <span class="text-xs text-gray-400">${dateStr}</span>
                                    </div>
                                    <p class="text-sm text-gray-700">${escapeHtml(c.content)}</p>
                                </div>
                                ${isOwn || isSuperAdmin ? `
                                    <button class="delete-comment-btn text-red-400 hover:text-red-600 p-1" data-comment-id="${c.id}" title="삭제">
                                        <i class="fas fa-times text-xs"></i>
                                    </button>
                                ` : ''}
                            </div>
                        </div>
                    `;
                }).join('');

                // 삭제 버튼 이벤트
                commentHistory.querySelectorAll('.delete-comment-btn').forEach(btn => {
                    btn.onclick = async () => {
                        if (!confirm('이 코멘트를 삭제하시겠습니까?')) return;

                        const commentId = parseInt(btn.dataset.commentId);
                        const result = await DB.deleteApplicantComment(commentId);
                        if (result.success) {
                            loadComments();
                        } else {
                            alert('코멘트 삭제에 실패했습니다.');
                        }
                    };
                });

                // 스크롤을 맨 아래로
                commentHistory.scrollTop = commentHistory.scrollHeight;
            };

            // 코멘트 로드 함수
            const loadComments = async () => {
                const result = await DB.getApplicantComments(applicant.id);
                if (result.success) {
                    renderComments(result.data);
                } else {
                    commentHistory.innerHTML = '<p class="text-sm text-red-400 text-center py-2">코멘트를 불러오는데 실패했습니다.</p>';
                }
            };

            // 초기 로드
            loadComments();

            // 코멘트 추가
            if (addCommentBtn && newCommentInput) {
                const addComment = async () => {
                    const content = newCommentInput.value.trim();
                    if (!content) {
                        alert('코멘트 내용을 입력하세요.');
                        return;
                    }

                    addCommentBtn.disabled = true;
                    const result = await DB.addApplicantComment(applicant.id, content);
                    addCommentBtn.disabled = false;

                    if (result.success) {
                        newCommentInput.value = '';
                        loadComments();
                    } else {
                        alert('코멘트 추가에 실패했습니다: ' + result.error);
                    }
                };

                addCommentBtn.onclick = addComment;
                newCommentInput.onkeypress = (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        addComment();
                    }
                };
            }
        }
    },

    // =====================================================
    // 면접 모달
    // =====================================================

    showInterviewModal(interview = null, defaultDate = null) {
        const isEdit = !!interview;
        const applicants = this.getAccessibleApplicants().filter(a =>
            ['reviewing', 'interview1', 'interview2'].includes(a.status)
        );

        const content = `
            <form id="interviewForm" class="space-y-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">지원자 *</label>
                    <select name="applicant_id" class="w-full px-4 py-2 border rounded-lg" required ${isEdit ? 'disabled' : ''}>
                        <option value="">지원자 선택</option>
                        ${applicants.map(a => {
                            const posting = this.state.postings.find(p => p.id === a.posting_id);
                            return `<option value="${a.id}" ${interview?.applicant_id === a.id ? 'selected' : ''}>${escapeHtml(a.name)} - ${escapeHtml(posting?.title) || ''}</option>`;
                        }).join('')}
                    </select>
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">면접 유형 *</label>
                        <select name="type" class="w-full px-4 py-2 border rounded-lg" required>
                            <option value="1차" ${interview?.type === '1차' ? 'selected' : ''}>1차 면접</option>
                            <option value="2차" ${interview?.type === '2차' ? 'selected' : ''}>2차 면접</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">면접 일시 *</label>
                        <input type="date" name="date" class="w-full px-4 py-2 border rounded-lg" value="${interview?.date || defaultDate || ''}" required>
                    </div>
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">시작 시간 *</label>
                        <input type="time" name="time" class="w-full px-4 py-2 border rounded-lg" value="${interview?.time || '10:00'}" required>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">소요 시간</label>
                        <select name="duration" class="w-full px-4 py-2 border rounded-lg">
                            <option value="30" ${interview?.duration === 30 ? 'selected' : ''}>30분</option>
                            <option value="60" ${interview?.duration === 60 || !interview ? 'selected' : ''}>1시간</option>
                            <option value="90" ${interview?.duration === 90 ? 'selected' : ''}>1시간 30분</option>
                            <option value="120" ${interview?.duration === 120 ? 'selected' : ''}>2시간</option>
                        </select>
                    </div>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">장소</label>
                    <input type="text" name="location" class="w-full px-4 py-2 border rounded-lg" value="${escapeHtml(interview?.location) || ''}" placeholder="예: 본사 3층 회의실">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">면접관</label>
                    <input type="text" name="interviewers" class="w-full px-4 py-2 border rounded-lg" value="${escapeHtml(interview?.interviewers) || ''}" placeholder="예: 김팀장, 이과장">
                </div>
            </form>
        `;

        this.showModal(isEdit ? '면접 수정' : '면접 등록', content, async () => {
            const form = document.getElementById('interviewForm');
            const formData = new FormData(form);

            const applicantId = parseInt(formData.get('applicant_id'));
            if (!applicantId) {
                alert('지원자를 선택하세요.');
                return false;
            }

            const applicant = this.state.applicants.find(a => a.id === applicantId) ||
                this.getAccessibleApplicants().find(a => a.id === applicantId);

            const data = {
                applicant_id: applicantId,
                posting_id: applicant?.posting_id,
                type: formData.get('type'),
                date: formData.get('date'),
                time: formData.get('time'),
                duration: parseInt(formData.get('duration')),
                location: formData.get('location'),
                interviewers: formData.get('interviewers')
            };

            this.showLoading(true);
            let result;
            if (isEdit) {
                result = await DB.updateInterview(interview.id, data);
            } else {
                result = await DB.createInterview(data);
            }

            if (result.success) {
                // 지원자 상태 업데이트
                if (applicant) {
                    await DB.updateApplicant(applicantId, {
                        status: data.type === '1차' ? 'interview1' : 'interview2'
                    });
                }
                await this.loadData();
                this.render();
            } else {
                alert('저장에 실패했습니다.');
            }
            this.showLoading(false);
            return result.success;
        });
    },

    // =====================================================
    // 사용자 모달
    // =====================================================

    showUserModal(user) {
        const content = `
            <form id="userForm" class="space-y-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">이름</label>
                    <input type="text" name="name" class="w-full px-4 py-2 border rounded-lg" value="${escapeHtml(user.name)}" required>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">이메일</label>
                    <input type="email" class="w-full px-4 py-2 border rounded-lg bg-gray-100" value="${escapeHtml(user.email)}" disabled>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">부서</label>
                    <input type="text" name="department" class="w-full px-4 py-2 border rounded-lg" value="${escapeHtml(user.department) || ''}">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">역할</label>
                    <select name="role" class="w-full px-4 py-2 border rounded-lg">
                        <option value="user" ${user.role === 'user' ? 'selected' : ''}>일반 사용자</option>
                        <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>관리자</option>
                        <option value="super_admin" ${user.role === 'super_admin' ? 'selected' : ''}>슈퍼관리자</option>
                    </select>
                </div>
                <hr class="my-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">새 비밀번호 설정</label>
                    <p class="text-xs text-gray-500 mb-2">비밀번호를 변경하려면 입력하세요. (비워두면 기존 비밀번호 유지)</p>
                    <input type="password" name="newPassword" class="w-full px-4 py-2 border rounded-lg" placeholder="새 비밀번호 (최소 6자)" minlength="6">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">비밀번호 확인</label>
                    <input type="password" name="confirmPassword" class="w-full px-4 py-2 border rounded-lg" placeholder="비밀번호 재입력" minlength="6">
                </div>
            </form>
        `;

        this.showModal('사용자 수정', content, async () => {
            const form = document.getElementById('userForm');
            const formData = new FormData(form);

            const newPassword = formData.get('newPassword');
            const confirmPassword = formData.get('confirmPassword');

            // 비밀번호 변경 시 유효성 검사
            if (newPassword) {
                if (newPassword.length < 6) {
                    alert('비밀번호는 최소 6자 이상이어야 합니다.');
                    return false;
                }
                if (newPassword !== confirmPassword) {
                    alert('비밀번호가 일치하지 않습니다.');
                    return false;
                }
            }

            const data = {
                name: formData.get('name'),
                department: formData.get('department'),
                role: formData.get('role')
            };

            this.showLoading(true);

            // 프로필 정보 업데이트
            const result = await DB.updateUser(user.id, data);

            // 비밀번호 변경이 필요한 경우 Edge Function 호출
            if (newPassword && result.success) {
                const pwResult = await Auth.changeUserPassword(user.id, newPassword);
                if (pwResult.success) {
                    alert('비밀번호가 성공적으로 변경되었습니다.');
                } else {
                    alert('비밀번호 변경 실패: ' + pwResult.error);
                }
            }

            if (result.success) {
                await this.loadData();
                this.render();
            } else {
                alert('저장에 실패했습니다.');
            }
            this.showLoading(false);
            return result.success;
        });
    },

    // 새 사용자 추가 모달
    showAddUserModal() {
        const content = `
            <form id="addUserForm" class="space-y-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">이메일 *</label>
                    <input type="email" name="email" class="w-full px-4 py-2 border rounded-lg" placeholder="example@company.com" required>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">비밀번호 *</label>
                    <input type="password" name="password" class="w-full px-4 py-2 border rounded-lg" placeholder="최소 6자 이상" minlength="6" required>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">비밀번호 확인 *</label>
                    <input type="password" name="passwordConfirm" class="w-full px-4 py-2 border rounded-lg" placeholder="비밀번호 재입력" minlength="6" required>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">이름 *</label>
                    <input type="text" name="name" class="w-full px-4 py-2 border rounded-lg" placeholder="홍길동" required>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">부서</label>
                    <input type="text" name="department" class="w-full px-4 py-2 border rounded-lg" placeholder="인사팀">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">역할 *</label>
                    <select name="role" class="w-full px-4 py-2 border rounded-lg" required>
                        <option value="user">일반 사용자 (열람자)</option>
                        <option value="admin">관리자</option>
                        <option value="super_admin">슈퍼관리자</option>
                    </select>
                    <p class="text-xs text-gray-500 mt-1">
                        • 일반 사용자: 할당된 공고 열람만 가능<br>
                        • 관리자: 공고 및 지원자 관리 가능<br>
                        • 슈퍼관리자: 모든 권한 (사용자 관리 포함)
                    </p>
                </div>
            </form>
        `;

        this.showModal('새 사용자 추가', content, async () => {
            const form = document.getElementById('addUserForm');
            const formData = new FormData(form);

            const email = formData.get('email');
            const password = formData.get('password');
            const passwordConfirm = formData.get('passwordConfirm');
            const name = formData.get('name');
            const department = formData.get('department');
            const role = formData.get('role');

            // 유효성 검사
            if (!email || !password || !name || !role) {
                alert('필수 항목을 모두 입력해주세요.');
                return false;
            }

            if (password !== passwordConfirm) {
                alert('비밀번호가 일치하지 않습니다.');
                return false;
            }

            if (password.length < 6) {
                alert('비밀번호는 최소 6자 이상이어야 합니다.');
                return false;
            }

            this.showLoading(true);
            const result = await Auth.createNewUser(email, password, name, role, department);
            this.showLoading(false);

            if (result.success) {
                alert(result.message);
                // 사용자 목록 새로고침
                await this.loadData();
                this.render();
                return true;
            } else {
                alert('사용자 생성 실패: ' + result.error);
                return false;
            }
        });
    },

    // =====================================================
    // 엑셀 처리
    // =====================================================

    async handleExcelUpload(file) {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];

                const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                let headerRowIndex = 0;
                const headerKeywords = ['이름', '성명', '후보자명', '지원자명', 'name'];

                for (let i = 0; i < Math.min(5, rawData.length); i++) {
                    const row = rawData[i];
                    if (row && row.some(cell => headerKeywords.some(kw => String(cell).includes(kw)))) {
                        headerRowIndex = i;
                        break;
                    }
                }

                const jsonData = XLSX.utils.sheet_to_json(worksheet, { range: headerRowIndex });

                if (jsonData.length === 0) {
                    alert('엑셀 파일에 데이터가 없습니다.');
                    return;
                }

                const columns = Object.keys(jsonData[0]);
                let platform = 'unknown';

                if (columns.some(c => c.includes('후보자명') || c.includes('유입 경로'))) {
                    platform = '사람인';
                } else if (columns.some(c => c.includes('포지션') || c.includes('나이 출생년도'))) {
                    platform = '잡코리아';
                }

                const columnMap = {
                    '사람인': {
                        name: ['후보자명', '이름', '성명'],
                        phone: ['연락처', '휴대폰', '전화번호'],
                        email: ['이메일', 'E-mail', 'Email'],
                        education: ['학력', '최종학력'],
                        experience: ['경력', '경력사항'],
                        desiredSalary: ['희망연봉', '희망 연봉'],
                        source: ['유입경로', '유입 경로', '지원경로', '지원 경로', '채널', 'source', '출처']
                    },
                    '잡코리아': {
                        name: ['이름', '성명', '지원자명'],
                        phone: ['연락처', '휴대폰'],
                        email: ['이메일', 'E-mail'],
                        education: ['학력', '최종학력'],
                        experience: ['총경력', '경력'],
                        desiredSalary: ['희망연봉'],
                        source: ['유입경로', '유입 경로', '지원경로', '지원 경로', '채널', 'source', '출처']
                    },
                    'unknown': {
                        name: ['이름', '성명', '후보자명', '지원자명', 'name'],
                        phone: ['연락처', '휴대폰', '전화번호', 'phone'],
                        email: ['이메일', 'E-mail', 'Email', 'email'],
                        education: ['학력', '최종학력', 'education'],
                        experience: ['경력', '총경력', 'experience'],
                        desiredSalary: ['희망연봉', '희망 연봉', 'salary'],
                        source: ['유입경로', '유입 경로', '지원경로', '지원 경로', '채널', 'source', '출처']
                    }
                };

                const map = columnMap[platform];
                const findColumn = (keys) => {
                    for (const key of keys) {
                        const found = columns.find(c => c.includes(key));
                        if (found) return found;
                    }
                    return null;
                };

                const nameCol = findColumn(map.name);
                const phoneCol = findColumn(map.phone);
                const emailCol = findColumn(map.email);
                const educationCol = findColumn(map.education);
                const experienceCol = findColumn(map.experience);
                const salaryCol = findColumn(map.desiredSalary);
                const sourceCol = findColumn(map.source);

                const applicantsToInsert = [];
                const postingId = this.state.selectedPosting;

                jsonData.forEach(row => {
                    const name = nameCol ? row[nameCol] : null;
                    if (!name) return;

                    let sourceValue = sourceCol ? (row[sourceCol] || '').trim() : '';
                    if (!sourceValue) {
                        sourceValue = platform !== 'unknown' ? platform : '직접지원';
                    }

                    // 원본 엑셀의 모든 데이터를 extra_data에 저장
                    const extraData = {};
                    Object.keys(row).forEach(key => {
                        // 기본 필드가 아닌 모든 컬럼을 extra_data에 저장
                        if (key !== nameCol && key !== phoneCol && key !== emailCol &&
                            key !== educationCol && key !== experienceCol && key !== salaryCol && key !== sourceCol) {
                            extraData[key] = row[key] || '';
                        }
                    });

                    applicantsToInsert.push({
                        posting_id: postingId,
                        name: name,
                        phone: phoneCol ? row[phoneCol] || '' : '',
                        email: emailCol ? row[emailCol] || '' : '',
                        education: educationCol ? row[educationCol] || '' : '',
                        experience: experienceCol ? row[experienceCol] || '' : '',
                        desired_salary: salaryCol ? row[salaryCol] || '' : '',
                        source: sourceValue,
                        status: 'received',
                        extra_data: extraData
                    });
                });

                this.showLoading(true);
                const result = await DB.createApplicants(applicantsToInsert);
                if (result.success) {
                    await this.loadApplicants(postingId);
                    this.render();
                    let message = platform !== 'unknown' ? platform + ' 형식으로 감지되었습니다.\n' : '';
                    message += `${result.count}명의 지원자가 추가되었습니다.`;
                    if (result.skipped > 0) {
                        message += `\n(이메일 중복으로 ${result.skipped}명 제외)`;
                    }
                    alert(message);
                } else {
                    alert('지원자 추가에 실패했습니다.');
                }
                this.showLoading(false);

            } catch (err) {
                console.error(err);
                alert('엑셀 파일 처리 중 오류가 발생했습니다.');
            }
        };
        reader.readAsArrayBuffer(file);
    },

    exportApplicantsToExcel() {
        const posting = this.state.postings.find(p => p.id === this.state.selectedPosting);
        if (!posting) return;

        let applicants = [...this.state.applicants];

        if (this.state.filters.status) {
            applicants = applicants.filter(a => a.status === this.state.filters.status);
        }
        if (this.state.filters.search) {
            const search = this.state.filters.search.toLowerCase();
            applicants = applicants.filter(a =>
                a.name?.toLowerCase().includes(search) ||
                a.email?.toLowerCase().includes(search) ||
                a.phone?.includes(search)
            );
        }

        if (applicants.length === 0) {
            alert('다운로드할 지원자가 없습니다.');
            return;
        }

        // 모든 extra_data 컬럼 수집 (중복 제거)
        const extraColumns = new Set();
        applicants.forEach(a => {
            if (a.extra_data && typeof a.extra_data === 'object') {
                Object.keys(a.extra_data).forEach(key => extraColumns.add(key));
            }
        });

        const data = applicants.map((a, idx) => {
            // 기본 데이터
            const row = {
                '순번': idx + 1,
                '이름': a.name,
                '연락처': a.phone,
                '이메일': a.email,
                '학력': a.education,
                '경력': a.experience,
                '희망연봉': a.desired_salary || '',
                '지원경로': a.source || '',
                '지원일': a.applied_at,
                '상태': DB.getStatusName(a.status),
                '메모': a.notes || ''
            };

            // extra_data의 모든 컬럼 추가
            if (a.extra_data && typeof a.extra_data === 'object') {
                extraColumns.forEach(col => {
                    row[col] = a.extra_data[col] || '';
                });
            }

            return row;
        });

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, '지원자목록');

        const fileName = `${posting.title}_지원자목록_${new Date().toISOString().split('T')[0]}.xlsx`;
        XLSX.writeFile(wb, fileName);
    },

    // 사용자 일괄 등록 양식 다운로드
    downloadUserTemplate() {
        const templateData = [
            {
                '이름': '홍길동',
                '이메일': 'hong@example.com',
                '비밀번호': 'password123',
                '부서': '개발팀',
                '역할': 'user'
            },
            {
                '이름': '김철수',
                '이메일': 'kim@example.com',
                '비밀번호': 'password456',
                '부서': '인사팀',
                '역할': 'admin'
            }
        ];

        // 설명 시트 데이터
        const instructions = [
            { '항목': '이름', '설명': '사용자 이름 (필수)', '예시': '홍길동' },
            { '항목': '이메일', '설명': '로그인에 사용할 이메일 주소 (필수)', '예시': 'hong@example.com' },
            { '항목': '비밀번호', '설명': '초기 비밀번호, 최소 6자 이상 (필수)', '예시': 'password123' },
            { '항목': '부서', '설명': '소속 부서 (선택)', '예시': '개발팀' },
            { '항목': '역할', '설명': 'user(일반사용자), admin(관리자), super_admin(슈퍼관리자) 중 선택 (선택, 기본값: user)', '예시': 'user' }
        ];

        const wb = XLSX.utils.book_new();

        // 사용자 목록 시트
        const wsUsers = XLSX.utils.json_to_sheet(templateData);
        wsUsers['!cols'] = [{ wch: 15 }, { wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 10 }];
        XLSX.utils.book_append_sheet(wb, wsUsers, '사용자목록');

        // 설명 시트
        const wsInstructions = XLSX.utils.json_to_sheet(instructions);
        wsInstructions['!cols'] = [{ wch: 12 }, { wch: 50 }, { wch: 20 }];
        XLSX.utils.book_append_sheet(wb, wsInstructions, '작성요령');

        XLSX.writeFile(wb, '사용자_일괄등록_양식.xlsx');
    },

    // 사용자 엑셀 일괄 등록
    async handleUserExcelUpload(file) {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet);

                if (jsonData.length === 0) {
                    alert('엑셀 파일에 데이터가 없습니다.');
                    return;
                }

                // 필수 컬럼 확인
                const requiredCols = ['이름', '이메일', '비밀번호'];
                const columns = Object.keys(jsonData[0]);
                const missingCols = requiredCols.filter(col => !columns.some(c => c.includes(col)));

                if (missingCols.length > 0) {
                    alert(`필수 컬럼이 없습니다: ${missingCols.join(', ')}\n\n양식 다운로드 버튼을 클릭하여 올바른 양식을 사용하세요.`);
                    return;
                }

                // 컬럼명 매핑
                const findColumn = (keywords) => {
                    return columns.find(c => keywords.some(kw => c.includes(kw)));
                };

                const colMap = {
                    name: findColumn(['이름', '성명', 'name']),
                    email: findColumn(['이메일', 'email', 'Email']),
                    password: findColumn(['비밀번호', 'password', 'Password']),
                    department: findColumn(['부서', 'department', 'Department']),
                    role: findColumn(['역할', 'role', 'Role'])
                };

                // 데이터 유효성 검사
                const users = [];
                const errors = [];

                for (let i = 0; i < jsonData.length; i++) {
                    const row = jsonData[i];
                    const rowNum = i + 2; // 엑셀 행 번호 (헤더 + 1-based)

                    const name = row[colMap.name]?.toString().trim();
                    const email = row[colMap.email]?.toString().trim();
                    const password = row[colMap.password]?.toString().trim();
                    const department = colMap.department ? row[colMap.department]?.toString().trim() : '';
                    let role = colMap.role ? row[colMap.role]?.toString().trim().toLowerCase() : 'user';

                    // 필수값 검사
                    if (!name) {
                        errors.push(`${rowNum}행: 이름이 없습니다.`);
                        continue;
                    }
                    if (!email) {
                        errors.push(`${rowNum}행: 이메일이 없습니다.`);
                        continue;
                    }
                    if (!password || password.length < 6) {
                        errors.push(`${rowNum}행: 비밀번호는 최소 6자 이상이어야 합니다.`);
                        continue;
                    }

                    // 이메일 형식 검사
                    if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
                        errors.push(`${rowNum}행: 이메일 형식이 올바르지 않습니다.`);
                        continue;
                    }

                    // 역할 검사
                    if (!['user', 'admin', 'super_admin'].includes(role)) {
                        role = 'user';
                    }

                    users.push({ name, email, password, department, role });
                }

                if (errors.length > 0 && users.length === 0) {
                    alert('유효한 데이터가 없습니다.\n\n' + errors.join('\n'));
                    return;
                }

                // 등록 확인
                let confirmMsg = `${users.length}명의 사용자를 등록하시겠습니까?`;
                if (errors.length > 0) {
                    confirmMsg += `\n\n⚠️ ${errors.length}건의 오류가 있어 제외됩니다:\n${errors.slice(0, 5).join('\n')}`;
                    if (errors.length > 5) {
                        confirmMsg += `\n... 외 ${errors.length - 5}건`;
                    }
                }

                if (!confirm(confirmMsg)) {
                    return;
                }

                // 사용자 일괄 등록
                this.showLoading(true);
                const results = { success: 0, failed: 0, failedUsers: [] };

                for (const user of users) {
                    const result = await Auth.createNewUser(
                        user.email,
                        user.password,
                        user.name,
                        user.role,
                        user.department
                    );

                    if (result.success) {
                        results.success++;
                    } else {
                        results.failed++;
                        results.failedUsers.push(`${user.name} (${user.email}): ${result.error}`);
                    }
                }

                this.showLoading(false);

                // 결과 표시
                let resultMsg = `등록 완료: ${results.success}명 성공`;
                if (results.failed > 0) {
                    resultMsg += `, ${results.failed}명 실패\n\n실패 목록:\n${results.failedUsers.join('\n')}`;
                }

                alert(resultMsg);

                // 사용자 목록 새로고침
                if (results.success > 0) {
                    await this.loadData();
                    this.render();
                }

            } catch (err) {
                console.error('사용자 엑셀 업로드 오류:', err);
                alert('엑셀 파일 처리 중 오류가 발생했습니다: ' + err.message);
            }
        };
        reader.readAsArrayBuffer(file);
    },

    // 첨부파일 다운로드 버튼 업데이트
    updateDownloadAttachmentsButton() {
        const container = document.querySelector('.flex.items-center.gap-4.mb-4 .flex-1').parentElement;
        const existingBtn = document.getElementById('downloadAttachmentsBtn');

        if (this.state.selectedApplicants.length > 0) {
            if (!existingBtn) {
                // 버튼 생성
                const btn = document.createElement('button');
                btn.id = 'downloadAttachmentsBtn';
                btn.className = 'px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm';
                btn.innerHTML = `<i class="fas fa-file-archive mr-1"></i>첨부파일 다운로드 (${this.state.selectedApplicants.length}명)`;
                btn.onclick = () => this.downloadSelectedApplicantsAttachments();

                // uploadExcelBtn 앞에 삽입
                const uploadBtn = document.getElementById('uploadExcelBtn');
                if (uploadBtn) {
                    container.insertBefore(btn, uploadBtn);
                }
            } else {
                // 버튼 텍스트 업데이트
                existingBtn.innerHTML = `<i class="fas fa-file-archive mr-1"></i>첨부파일 다운로드 (${this.state.selectedApplicants.length}명)`;
            }
        } else {
            // 버튼 제거
            if (existingBtn) {
                existingBtn.remove();
            }
        }
    },

    // 선택 지원자 첨부파일 일괄 다운로드 (지원자별 폴더 생성)
    async downloadSelectedApplicantsAttachments() {
        if (this.state.selectedApplicants.length === 0) {
            alert('선택된 지원자가 없습니다.');
            return;
        }

        const posting = this.state.postings.find(p => p.id === this.state.selectedPosting);
        if (!posting) return;

        this.showLoading(true);

        try {
            const zip = new JSZip();
            let totalFiles = 0;

            for (const applicantId of this.state.selectedApplicants) {
                const applicant = this.state.applicants.find(a => a.id === applicantId);
                if (!applicant) continue;

                const attachments = applicant.attachments || [];
                if (attachments.length === 0) continue;

                // 지원자 이름으로 폴더 생성 (특수문자 제거)
                const folderName = applicant.name.replace(/[\\/:*?"<>|]/g, '_');
                const folder = zip.folder(folderName);

                for (const attachment of attachments) {
                    try {
                        const { data, error } = await supabaseClient.storage
                            .from('attachments')
                            .download(attachment.storage_path);

                        if (error) {
                            console.error(`파일 다운로드 실패: ${attachment.file_name}`, error);
                            continue;
                        }

                        folder.file(attachment.file_name, data);
                        totalFiles++;
                    } catch (err) {
                        console.error(`파일 처리 실패: ${attachment.file_name}`, err);
                    }
                }
            }

            if (totalFiles === 0) {
                alert('다운로드할 첨부파일이 없습니다.');
                this.showLoading(false);
                return;
            }

            const content = await zip.generateAsync({ type: 'blob' });
            const url = URL.createObjectURL(content);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${posting.title}_첨부파일_${new Date().toISOString().split('T')[0]}.zip`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            alert(`${totalFiles}개의 파일이 다운로드되었습니다.`);
        } catch (err) {
            console.error('첨부파일 일괄 다운로드 실패:', err);
            alert('다운로드 중 오류가 발생했습니다.');
        }

        this.showLoading(false);
    }
};

// Export
window.App = App;

// 앱 초기화
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
