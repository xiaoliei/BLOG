import { drizzle } from "drizzle-orm/d1";
import type { Env } from "../env";

/** 从 D1 绑定创建 Drizzle 实例 */
export const db = (env: Env) => drizzle(env.DB);
