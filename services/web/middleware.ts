import { NextRequest, NextResponse } from "next/server";

const LANDING_PATHS = new Set(["/", "/demo"]);
const APP_PATHS = ["/app", "/experiments"];

export function middleware(request: NextRequest) {
  const surface = process.env.APERTURE_SURFACE;
  const { pathname, search } = request.nextUrl;

  if (!surface || pathname.startsWith("/_next/") || pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  if (surface === "landing") {
    if (LANDING_PATHS.has(pathname)) return NextResponse.next();

    const appUrl = process.env.APP_URL;
    if (appUrl) {
      const destination = new URL(pathname + search, appUrl);
      return NextResponse.redirect(destination);
    }
    return new NextResponse("Not found", { status: 404 });
  }

  if (surface === "app") {
    if (pathname === "/") {
      const destination = request.nextUrl.clone();
      destination.pathname = "/app";
      return NextResponse.redirect(destination);
    }
    if (APP_PATHS.some((base) => pathname === base || pathname.startsWith(`${base}/`))) {
      return NextResponse.next();
    }
    return new NextResponse("Not found", { status: 404 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
