import { normalizeAddress } from "../wallets/domain.js";

export class RoleError extends Error {
  constructor(
    public readonly code:
      | "adminOnly"
      | "invalidRule"
      | "notFound"
      | "provider"
      | "permissions"
      | "busy"
      | "changed"
      | "partial"
      | "limit"
      | "memberGone",
    // A confirmed Unknown Member response is different from permissions/network failures.
  ) {
    super(code);
  }
}
export type Rule = {
  id: string;
  guildId: string;
  group: string;
  chainId: number;
  contract: string;
  tokenIds: string[];
  minimum: string;
  roleId: string;
};
export type RuleInput = Omit<Rule, "id" | "guildId">;
export const uint256 = (value: string) => {
  if (!/^(0|[1-9][0-9]{0,77}|0x[0-9a-fA-F]{1,64})$/.test(value))
    throw new RoleError("invalidRule");
  const parsed = BigInt(value);
  if (parsed >= 2n ** 256n) throw new RoleError("invalidRule");
  return parsed.toString();
};
export function ruleInput(input: RuleInput): RuleInput {
  if (
    ![1, 137].includes(input.chainId) ||
    !/^[a-z0-9_-]{1,32}$/.test(input.group) ||
    !/^\d{17,20}$/.test(input.roleId) ||
    input.tokenIds.length > 50
  )
    throw new RoleError("invalidRule");
  let contract: string;
  try {
    contract = normalizeAddress(input.contract);
  } catch {
    throw new RoleError("invalidRule");
  }
  const minimum = uint256(input.minimum);
  if (minimum === "0") throw new RoleError("invalidRule");
  const tokenIds = [...new Set(input.tokenIds.map(uint256))].sort((a, b) =>
    BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0,
  );
  return { ...input, contract, minimum, tokenIds };
}
export const sourceKey = (rule: Pick<Rule, "chainId" | "contract">) =>
  `${rule.chainId}:${rule.contract}`;
export const groupSource = (rule: RuleInput) =>
  `${sourceKey(rule)}:${rule.tokenIds.join(",")}`;
export type Inventory = Map<string, Map<string, bigint>>;
export function evaluate(
  rules: Rule[],
  holdings: Inventory,
  stacking: boolean,
) {
  const desired = new Set<string>();
  const winners = new Map<string, Rule>();
  const counts = new Map<string, bigint>();
  for (const rule of rules) {
    const tokens = holdings.get(sourceKey(rule));
    if (!tokens) throw new RoleError("provider");
    const count = rule.tokenIds.length
      ? rule.tokenIds.reduce((sum, id) => sum + (tokens.get(id) ?? 0n), 0n)
      : [...tokens.values()].reduce((sum, balance) => sum + balance, 0n);
    counts.set(rule.id, count);
    if (count < BigInt(rule.minimum)) continue;
    if (stacking) desired.add(rule.roleId);
    else {
      const previous = winners.get(rule.group);
      if (!previous || BigInt(rule.minimum) > BigInt(previous.minimum))
        winners.set(rule.group, rule);
    }
  }
  if (!stacking)
    for (const winner of winners.values()) desired.add(winner.roleId);
  return { desired, counts };
}
