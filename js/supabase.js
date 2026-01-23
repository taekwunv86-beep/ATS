// =====================================================
// Supabase Client Configuration
// =====================================================

// Supabase 프로젝트 설정 (배포 시 환경변수로 대체)
const SUPABASE_URL = window.SUPABASE_URL || 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || 'YOUR_SUPABASE_ANON_KEY';

// Supabase 클라이언트 생성
// CDN 버전에서는 window.supabase.createClient로 접근
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        persistSession: true,           // localStorage에 세션 저장 (새로고침해도 유지)
        autoRefreshToken: true,         // 토큰 만료 전 자동 갱신
        detectSessionInUrl: true,       // URL에서 세션 감지 (OAuth 등)
        storageKey: 'ats-auth-token',   // localStorage 키 이름
        storage: window.localStorage    // 세션 저장소 명시
    }
});

// 환경 확인 (개발용)
function checkSupabaseConfig() {
    if (SUPABASE_URL === 'YOUR_SUPABASE_URL' || SUPABASE_ANON_KEY === 'YOUR_SUPABASE_ANON_KEY') {
        console.warn('Supabase 설정이 완료되지 않았습니다. js/supabase.js 파일에서 URL과 Key를 설정하세요.');
        return false;
    }
    return true;
}

// Export for use in other modules
window.supabaseClient = supabaseClient;
window.checkSupabaseConfig = checkSupabaseConfig;
window.SUPABASE_URL = SUPABASE_URL;
