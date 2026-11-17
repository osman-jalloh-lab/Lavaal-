// Runs before static serving, including souls retained for the ops function.
export const config = {
  matcher: ['/docs/:path*', '/tests/:path*', '/scripts/:path*', '/:file([^/]+\\.md)']
};

export default function middleware() {
  return new Response('Not Found', { status: 404 });
}
