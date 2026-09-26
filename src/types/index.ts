export interface Env {
  API_KEY: string;
  ENVIRONMENT: string;
  SOL_API_URL: string;
  SOL_API_KEY: string;
  RESEND_API_KEY: string;
  /** Only set on ephemeral per-PR preview Workers (ENVIRONMENT=preview), which send into a Mailtrap sandbox inbox — see src/lib/email-sender.ts. */
  MAILTRAP_API_TOKEN?: string;
  MAILTRAP_INBOX_ID?: string;
  /** Released package.json version, injected at deploy time by CI (release.yml). Unset locally. */
  APP_VERSION?: string;
}

export type AppEnv = {
  Bindings: Env;
  Variables: { requestId: string };
};

export enum ErrorCode {
  UNAUTHORIZED = "UNAUTHORIZED",
  NOT_FOUND = "NOT_FOUND",
  VALIDATION_ERROR = "VALIDATION_ERROR",
  INTERNAL_ERROR = "INTERNAL_ERROR",
}

export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: { code: ErrorCode; message: string; details?: unknown } };
