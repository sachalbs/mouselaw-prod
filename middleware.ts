import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
          });
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // IMPORTANT: Refresh session if expired - required for SSR
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // If user is authenticated and tries to access /login or /auth/login, redirect to /chat
  if (user && (request.nextUrl.pathname === '/login' || request.nextUrl.pathname === '/auth/login')) {
    return NextResponse.redirect(new URL('/chat', request.url));
  }

  // If user is not authenticated and tries to access /chat, redirect to /auth/login
  if (!user && request.nextUrl.pathname.startsWith('/chat')) {
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: ['/chat/:path*', '/login', '/auth/login', '/auth/signup'],
};
