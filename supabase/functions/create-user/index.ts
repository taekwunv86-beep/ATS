// Supabase Edge Function: Create User
// 관리자가 새 사용자를 생성할 수 있는 API (Admin API 사용)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Authorization 헤더에서 JWT 토큰 추출
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: '인증이 필요합니다.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 요청 본문 파싱
    const { email, password, name, role, department } = await req.json()

    // 필수값 검증
    if (!email || !password || !name) {
      return new Response(
        JSON.stringify({ error: '이메일, 비밀번호, 이름은 필수입니다.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (password.length < 6) {
      return new Response(
        JSON.stringify({ error: '비밀번호는 최소 6자 이상이어야 합니다.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 역할 검증
    const validRoles = ['user', 'admin', 'super_admin']
    const userRole = validRoles.includes(role) ? role : 'user'

    // Supabase 클라이언트 생성
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // 요청자 권한 확인
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    })

    const { data: { user: currentUser }, error: userError } = await supabaseClient.auth.getUser()

    if (userError || !currentUser) {
      return new Response(
        JSON.stringify({ error: '인증에 실패했습니다.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 현재 사용자의 프로필에서 역할 확인
    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('role')
      .eq('id', currentUser.id)
      .single()

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ error: '프로필 정보를 가져올 수 없습니다.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 슈퍼관리자만 사용자 생성 가능
    if (profile.role !== 'super_admin') {
      return new Response(
        JSON.stringify({ error: '권한이 없습니다. 슈퍼관리자만 사용자를 생성할 수 있습니다.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Admin 클라이언트로 사용자 생성
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // Admin API로 사용자 생성 (이메일 자동 확인)
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true, // 이메일 자동 확인
      user_metadata: {
        name: name,
        role: userRole,
        department: department
      }
    })

    if (createError) {
      console.error('User creation error:', createError)
      return new Response(
        JSON.stringify({ error: '사용자 생성에 실패했습니다: ' + createError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 프로필 테이블에 사용자 정보 추가
    const { error: insertProfileError } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: newUser.user.id,
        email: email,
        name: name,
        role: userRole,
        department: department || null,
        is_active: true
      })

    if (insertProfileError) {
      console.error('Profile creation error:', insertProfileError)
      // 프로필 생성 실패해도 사용자는 생성됨
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: '사용자가 성공적으로 생성되었습니다.',
        userId: newUser.user.id
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: '서버 오류가 발생했습니다: ' + (error instanceof Error ? error.message : String(error)) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
