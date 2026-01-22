// =====================================================
// Authentication Module
// Supabase Auth 기반 인증 관리
// =====================================================

const Auth = {
    // 현재 사용자 정보 캐시
    currentUser: null,
    currentProfile: null,

    // 세션 타임아웃 설정 (30분)
    sessionTimeoutDuration: 30 * 60 * 1000,
    sessionTimeoutId: null,

    // 초기화
    async init() {
        // 세션 상태 변경 리스너 (로그인/로그아웃 시에만 동작)
        supabaseClient.auth.onAuthStateChange((event, session) => {
            console.log('Auth state changed:', event);
            if (event === 'SIGNED_OUT') {
                this.clearSession();
            }
        });

        // 기존 세션은 체크하지 않음 (새로고침 시 로그인 필요)
        // 이렇게 하면 로딩이 멈추지 않음
        return null;
    },

    // 로그인
    async login(email, password) {
        try {
            const { data, error } = await supabaseClient.auth.signInWithPassword({
                email,
                password
            });

            if (error) {
                console.error('로그인 실패:', error.message);
                return { success: false, error: error.message };
            }

            await this.loadUserProfile(data.user);
            this.setupActivityListeners();
            this.resetSessionTimeout();

            return { success: true, user: this.currentProfile };
        } catch (err) {
            console.error('로그인 오류:', err);
            return { success: false, error: '로그인 중 오류가 발생했습니다.' };
        }
    },

    // 로그아웃
    async logout() {
        try {
            this.clearSessionTimeout();
            await supabaseClient.auth.signOut();
            this.clearSession();
            return { success: true };
        } catch (err) {
            console.error('로그아웃 오류:', err);
            return { success: false, error: err.message };
        }
    },

    // 현재 사용자 정보 가져오기
    async getCurrentUser() {
        if (this.currentProfile) {
            return this.currentProfile;
        }

        const { data: { user } } = await supabaseClient.auth.getUser();
        if (user) {
            await this.loadUserProfile(user);
        }

        return this.currentProfile;
    },

    // 사용자 프로필 로드
    async loadUserProfile(user) {
        if (!user) {
            this.currentUser = null;
            this.currentProfile = null;
            return null;
        }

        this.currentUser = user;

        const { data: profile, error } = await supabaseClient
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();

        if (error) {
            console.error('프로필 로드 실패:', error);
            this.currentProfile = null;
        } else {
            this.currentProfile = profile;
        }

        return this.currentProfile;
    },

    // 프로필 업데이트
    async updateProfile(updates) {
        if (!this.currentUser) {
            return { success: false, error: '로그인이 필요합니다.' };
        }

        try {
            const { data, error } = await supabaseClient
                .from('profiles')
                .update(updates)
                .eq('id', this.currentUser.id)
                .select()
                .single();

            if (error) throw error;

            this.currentProfile = data;
            return { success: true, profile: data };
        } catch (err) {
            console.error('프로필 업데이트 실패:', err);
            return { success: false, error: err.message };
        }
    },

    // 비밀번호 변경
    async changePassword(newPassword) {
        try {
            const { error } = await supabaseClient.auth.updateUser({
                password: newPassword
            });

            if (error) throw error;

            return { success: true };
        } catch (err) {
            console.error('비밀번호 변경 실패:', err);
            return { success: false, error: err.message };
        }
    },

    // 새 사용자 생성 (슈퍼관리자 전용)
    async createNewUser(email, password, name, role, department) {
        try {
            // 현재 관리자 세션 저장
            const currentAdminEmail = this.currentProfile?.email;

            // 새 사용자 생성 (Supabase Auth에 등록)
            const { data: signUpData, error: signUpError } = await supabaseClient.auth.signUp({
                email: email,
                password: password,
                options: {
                    data: {
                        name: name,
                        role: role,
                        department: department
                    }
                }
            });

            if (signUpError) {
                throw signUpError;
            }

            if (!signUpData.user) {
                throw new Error('사용자 생성에 실패했습니다.');
            }

            const newUserId = signUpData.user.id;

            // 프로필 테이블에 사용자 정보 추가/업데이트
            const { error: profileError } = await supabaseClient
                .from('profiles')
                .upsert({
                    id: newUserId,
                    email: email,
                    name: name,
                    role: role,
                    department: department || null,
                    is_active: true
                });

            if (profileError) {
                console.error('프로필 생성 실패:', profileError);
                // 프로필 생성 실패해도 계속 진행 (트리거로 생성될 수 있음)
            }

            // 관리자 세션으로 복귀하기 위해 로그아웃
            // (signUp이 새 사용자로 자동 로그인하므로)
            await supabaseClient.auth.signOut();

            return {
                success: true,
                userId: newUserId,
                message: '사용자가 생성되었습니다. 다시 로그인해 주세요.',
                needRelogin: true,
                adminEmail: currentAdminEmail
            };
        } catch (err) {
            console.error('사용자 생성 실패:', err);
            return { success: false, error: err.message };
        }
    },

    // 권한 확인
    canAccess(requiredRoles) {
        if (!this.currentProfile) return false;
        return requiredRoles.includes(this.currentProfile.role);
    },

    // 슈퍼관리자 확인
    isSuperAdmin() {
        return this.currentProfile?.role === 'super_admin';
    },

    // 관리자 이상 확인
    isAdminOrAbove() {
        return ['super_admin', 'admin'].includes(this.currentProfile?.role);
    },

    // 세션 정리
    clearSession() {
        this.currentUser = null;
        this.currentProfile = null;
        this.clearSessionTimeout();
    },

    // 세션 타임아웃 리셋
    resetSessionTimeout() {
        this.clearSessionTimeout();

        if (this.currentProfile) {
            this.sessionTimeoutId = setTimeout(() => {
                this.sessionExpired();
            }, this.sessionTimeoutDuration);
        }
    },

    // 세션 타임아웃 제거
    clearSessionTimeout() {
        if (this.sessionTimeoutId) {
            clearTimeout(this.sessionTimeoutId);
            this.sessionTimeoutId = null;
        }
    },

    // 세션 만료 처리
    sessionExpired() {
        alert('세션이 만료되었습니다. 다시 로그인해 주세요.');
        this.logout();
        if (window.App) {
            window.App.render();
        }
    },

    // 활동 감지 이벤트 리스너 설정
    setupActivityListeners() {
        const activityEvents = ['click', 'keydown', 'mousemove', 'scroll', 'touchstart'];
        const resetTimeout = () => {
            if (this.currentProfile) {
                this.resetSessionTimeout();
            }
        };

        // 이벤트 리스너 등록
        activityEvents.forEach(event => {
            document.removeEventListener(event, resetTimeout);
            document.addEventListener(event, resetTimeout, { passive: true });
        });
    },

    // 역할 이름 반환
    getRoleName(role) {
        const names = {
            super_admin: '슈퍼관리자',
            admin: '관리자',
            user: '일반 사용자'
        };
        return names[role] || role;
    }
};

// Export
window.Auth = Auth;
