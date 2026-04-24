import crypto from "node:crypto";

import type { Request, Response } from "express";

import type { LineaManagedAccessSnapshot } from "../../src/lib/linea-access";
import { getManagedAccessConfig } from "./config";

type DirectXSessionProfile = NonNullable<LineaManagedAccessSnapshot["user"]>;

type XAuthFlowCookie = {
  state: string;
  codeVerifier: string;
  returnTo: string;
  issuedAt: number;
};

type XSessionCookie = {
  provider: "x";
  id: string;
  email: string | null;
  firstName: string | null;
  imageUrl: string | null;
  issuedAt: number;
  expiresAt: number;
};

type XTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
};

type XUserResponse = {
  data?: {
    id?: string;
    name?: string;
    username?: string;
    profile_image_url?: string;
    confirmed_email?: string | boolean | null;
  };
  errors?: Array<{ detail?: string; message?: string }>;
};

const FLOW_COOKIE_NAME = "linea_x_auth_flow";
const SESSION_COOKIE_NAME = "linea_x_session";
const FLOW_MAX_AGE_MS = 10 * 60 * 1000;
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const X_AUTHORIZE_URL = "https://x.com/i/oauth2/authorize";
const X_TOKEN_URL = "https://api.x.com/2/oauth2/token";
const X_ME_URL = "https://api.x.com/2/users/me";

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function trimString(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function encodeBase64Url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function decodeBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signValue(value: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function encodeSignedCookie(payload: unknown, secret: string) {
  const body = encodeBase64Url(JSON.stringify(payload));
  const signature = signValue(body, secret);
  return `${body}.${signature}`;
}

function decodeSignedCookie<T>(rawValue: string | undefined, secret: string): T | null {
  if (!rawValue) {
    return null;
  }

  const [body, signature] = rawValue.split(".");
  if (!body || !signature) {
    return null;
  }

  const expectedSignature = Buffer.from(signValue(body, secret), "base64url");
  const providedSignature = Buffer.from(signature, "base64url");

  if (
    expectedSignature.length !== providedSignature.length ||
    !crypto.timingSafeEqual(expectedSignature, providedSignature)
  ) {
    return null;
  }

  try {
    return JSON.parse(decodeBase64Url(body)) as T;
  } catch {
    return null;
  }
}

function readCookie(req: Request, name: string) {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) {
    return undefined;
  }

  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    if (key !== name) {
      continue;
    }

    return decodeURIComponent(trimmed.slice(separatorIndex + 1));
  }

  return undefined;
}

function getRequestProtocol(req: Request) {
  const forwardedProto = req.headers["x-forwarded-proto"];

  if (typeof forwardedProto === "string" && forwardedProto.trim()) {
    return forwardedProto.split(",")[0]?.trim() || "http";
  }

  if (Array.isArray(forwardedProto) && forwardedProto[0]) {
    return forwardedProto[0];
  }

  return req.protocol || "http";
}

function getRequestHost(req: Request) {
  const forwardedHost = req.headers["x-forwarded-host"];

  if (typeof forwardedHost === "string" && forwardedHost.trim()) {
    return forwardedHost.split(",")[0]?.trim() || null;
  }

  if (Array.isArray(forwardedHost) && forwardedHost[0]) {
    return forwardedHost[0];
  }

  return req.headers.host ?? null;
}

function getRequestOrigin(req: Request) {
  const host = getRequestHost(req);
  if (!host) {
    return null;
  }

  return `${getRequestProtocol(req)}://${host}`;
}

function sanitizeReturnTo(req: Request, rawValue: string | null | undefined) {
  if (!rawValue) {
    return "/";
  }

  if (rawValue.startsWith("/")) {
    return rawValue;
  }

  const origin = getRequestOrigin(req);
  if (!origin) {
    return "/";
  }

  try {
    const nextUrl = new URL(rawValue);
    const requestOrigin = new URL(origin);

    if (nextUrl.origin !== requestOrigin.origin) {
      return "/";
    }

    return `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
  } catch {
    return "/";
  }
}

function isSecureRequest(req: Request) {
  return getRequestProtocol(req) === "https";
}

function setSignedCookie(
  req: Request,
  res: Response,
  name: string,
  payload: unknown,
  options: { path: string; maxAge: number },
) {
  const config = getManagedAccessConfig();
  if (!config.sessionSecret) {
    throw new Error("LINEA_SESSION_SECRET is required for direct X auth.");
  }

  res.cookie(name, encodeSignedCookie(payload, config.sessionSecret), {
    httpOnly: true,
    maxAge: options.maxAge,
    path: options.path,
    sameSite: "lax",
    secure: isSecureRequest(req),
  });
}

function clearCookie(req: Request, res: Response, name: string, path: string) {
  res.clearCookie(name, {
    httpOnly: true,
    path,
    sameSite: "lax",
    secure: isSecureRequest(req),
  });
}

function createCodeVerifier() {
  return crypto.randomBytes(32).toString("base64url");
}

function createCodeChallenge(codeVerifier: string) {
  return crypto.createHash("sha256").update(codeVerifier).digest("base64url");
}

function createState() {
  return crypto.randomBytes(18).toString("base64url");
}

function buildBasicAuthorizationHeader(clientId: string, clientSecret: string) {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

function extractErrorMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") {
    return fallback;
  }

  const detail = "detail" in payload && typeof payload.detail === "string" ? payload.detail : null;
  const error = "error" in payload && typeof payload.error === "string" ? payload.error : null;
  const message = "message" in payload && typeof payload.message === "string" ? payload.message : null;

  if (detail) {
    return detail;
  }

  if (error) {
    return error;
  }

  if (message) {
    return message;
  }

  return fallback;
}

async function exchangeCodeForToken(code: string, codeVerifier: string) {
  const config = getManagedAccessConfig();
  if (!config.xClientId || !config.xClientSecret || !config.xCallbackUrl) {
    throw new Error("Direct X auth is not configured.");
  }

  const body = new URLSearchParams({
    code,
    grant_type: "authorization_code",
    redirect_uri: config.xCallbackUrl,
    code_verifier: codeVerifier,
  });

  const response = await fetch(X_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: buildBasicAuthorizationHeader(config.xClientId, config.xClientSecret),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  const payload = (await response.json().catch(() => null)) as XTokenResponse | null;

  if (!response.ok || !payload?.access_token) {
    throw new Error(
      extractErrorMessage(payload, "X did not return an access token."),
    );
  }

  return payload.access_token;
}

async function fetchAuthenticatedUser(accessToken: string) {
  const requestUrl = new URL(X_ME_URL);
  requestUrl.searchParams.set("user.fields", "profile_image_url,confirmed_email");

  const response = await fetch(requestUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const payload = (await response.json().catch(() => null)) as XUserResponse | null;

  if (!response.ok || !payload?.data?.id) {
    throw new Error(
      extractErrorMessage(payload, "X did not return a usable user profile."),
    );
  }

  return payload.data;
}

function toSessionProfile(user: NonNullable<XUserResponse["data"]>): XSessionCookie {
  return {
    provider: "x",
    id: `x:${user.id}`,
    email:
      typeof user.confirmed_email === "string" && user.confirmed_email.includes("@")
        ? normalizeEmail(user.confirmed_email)
        : null,
    firstName: trimString(user.name),
    imageUrl: trimString(user.profile_image_url),
    issuedAt: Date.now(),
    expiresAt: Date.now() + SESSION_MAX_AGE_MS,
  };
}

export function getDirectXSession(req: Request): DirectXSessionProfile | null {
  const config = getManagedAccessConfig();
  if (!config.sessionSecret) {
    return null;
  }

  const payload = decodeSignedCookie<XSessionCookie>(
    readCookie(req, SESSION_COOKIE_NAME),
    config.sessionSecret,
  );

  if (!payload || payload.provider !== "x" || payload.expiresAt <= Date.now()) {
    return null;
  }

  return {
    id: payload.id,
    email: payload.email,
    firstName: payload.firstName,
    imageUrl: payload.imageUrl,
  };
}

export function clearDirectXSession(req: Request, res: Response) {
  clearCookie(req, res, SESSION_COOKIE_NAME, "/");
  clearCookie(req, res, FLOW_COOKIE_NAME, "/api/access/auth/x");
}

export function startDirectXAuth(req: Request, res: Response) {
  const config = getManagedAccessConfig();
  if (!config.xConfigured || !config.xClientId || !config.xCallbackUrl) {
    res.status(503).send("Direct X auth is not configured on this deployment.");
    return;
  }

  const returnTo = sanitizeReturnTo(req, req.query.return_to?.toString());
  const state = createState();
  const codeVerifier = createCodeVerifier();
  const codeChallenge = createCodeChallenge(codeVerifier);

  setSignedCookie(req, res, FLOW_COOKIE_NAME, {
    codeVerifier,
    issuedAt: Date.now(),
    returnTo,
    state,
  } satisfies XAuthFlowCookie, {
    path: "/api/access/auth/x",
    maxAge: FLOW_MAX_AGE_MS,
  });

  const authorizeUrl = new URL(X_AUTHORIZE_URL);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", config.xClientId);
  authorizeUrl.searchParams.set("redirect_uri", config.xCallbackUrl);
  authorizeUrl.searchParams.set("scope", "users.read users.email");
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("code_challenge", codeChallenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");
  authorizeUrl.searchParams.set("prompt", "select_account");

  res.redirect(authorizeUrl.toString());
}

export async function handleDirectXCallback(req: Request, res: Response) {
  const config = getManagedAccessConfig();
  if (!config.xConfigured || !config.sessionSecret) {
    res.status(503).send("Direct X auth is not configured on this deployment.");
    return;
  }

  const flow = decodeSignedCookie<XAuthFlowCookie>(
    readCookie(req, FLOW_COOKIE_NAME),
    config.sessionSecret,
  );
  clearCookie(req, res, FLOW_COOKIE_NAME, "/api/access/auth/x");

  if (!flow || Date.now() - flow.issuedAt > FLOW_MAX_AGE_MS) {
    res.status(400).send("The X sign-in flow expired. Please try again.");
    return;
  }

  const oauthError = trimString(req.query.error?.toString());
  const oauthErrorDescription = trimString(req.query.error_description?.toString());
  if (oauthError) {
    res.status(400).send(oauthErrorDescription ?? `X sign-in failed: ${oauthError}`);
    return;
  }

  const state = trimString(req.query.state?.toString());
  const code = trimString(req.query.code?.toString());

  if (!state || state !== flow.state || !code) {
    res.status(400).send("The X sign-in response was missing a valid state or code.");
    return;
  }

  try {
    const accessToken = await exchangeCodeForToken(code, flow.codeVerifier);
    const user = await fetchAuthenticatedUser(accessToken);
    const sessionProfile = toSessionProfile(user);

    setSignedCookie(req, res, SESSION_COOKIE_NAME, sessionProfile, {
      path: "/",
      maxAge: SESSION_MAX_AGE_MS,
    });

    res.redirect(flow.returnTo || "/");
  } catch (error) {
    clearCookie(req, res, SESSION_COOKIE_NAME, "/");
    res.status(400).send(error instanceof Error ? error.message : "Could not complete X sign-in.");
  }
}
