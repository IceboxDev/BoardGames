import { Hono } from "hono";
import type { AdminEnv, AppEnv, PublicEnv } from "./types.ts";

export const authedApp = () => new Hono<AppEnv>();
export const adminApp = () => new Hono<AdminEnv>();
export const publicApp = () => new Hono<PublicEnv>();
