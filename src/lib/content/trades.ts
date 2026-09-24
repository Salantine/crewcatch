import { z } from "zod";
import {
  Trade as TradeEnum,
  TRADE_LABEL,
  type Trade,
} from "@/lib/domain/schemas";

/**
 * Frontmatter is validated at build time, so a malformed trade slug or an
 * unknown trade enum fails the build rather than rendering a broken page.
 */
export const TradeFrontmatter = z.object({
  trade: TradeEnum,
  tier: z.enum(["emergency", "design_build", "maintenance", "specialized"]),
  title: z.string().min(1),
  metaDescription: z.string().min(1),
  avgTicket: z.number().positive(),
});

export type TradeFrontmatter = z.infer<typeof TradeFrontmatter>;

export const ALL_TRADES = TradeEnum.options;

export function isTrade(value: string): value is Trade {
  return (ALL_TRADES as string[]).includes(value);
}

export function tradeLabel(trade: Trade): string {
  return TRADE_LABEL[trade];
}
