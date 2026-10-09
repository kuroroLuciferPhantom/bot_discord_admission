import {
  PermissionFlagsBits,
  DiscordAPIError,
  type Client,
  type Guild,
  type Role,
} from "discord.js";
import { RoleError } from "./domain.js";
const dangerous =
  PermissionFlagsBits.Administrator |
  PermissionFlagsBits.ManageRoles |
  PermissionFlagsBits.ManageGuild |
  PermissionFlagsBits.ManageChannels |
  PermissionFlagsBits.ManageWebhooks |
  PermissionFlagsBits.BanMembers |
  PermissionFlagsBits.KickMembers |
  PermissionFlagsBits.ManageMessages |
  PermissionFlagsBits.ModerateMembers |
  PermissionFlagsBits.ManageThreads |
  PermissionFlagsBits.MentionEveryone |
  PermissionFlagsBits.MuteMembers |
  PermissionFlagsBits.DeafenMembers |
  PermissionFlagsBits.MoveMembers;
export function roleAllowed(role: Role, guild: Guild) {
  const me = guild.members.me;
  return (
    role.id !== guild.id &&
    !role.managed &&
    (role.permissions.bitfield & dangerous) === 0n &&
    !!me?.permissions.has(PermissionFlagsBits.ManageRoles) &&
    me.roles.highest.comparePositionTo(role) > 0
  );
}
export interface RoleGateway {
  validate(guildId: string, roleId: string): Promise<void>;
  prepare(
    guildId: string,
    userId: string,
    managed: string[],
    desired: Set<string>,
  ): Promise<{
    current: Set<string>;
    add(id: string): Promise<void>;
    remove(id: string): Promise<void>;
  }>;
}
export function createRoleGateway(client: Client): RoleGateway {
  return {
    async validate(guildId, roleId) {
      const guild = await client.guilds.fetch(guildId);
      await guild.members.fetchMe({ force: true });
      const role = await guild.roles.fetch(roleId);
      if (!role || !roleAllowed(role, guild))
        throw new RoleError("permissions");
    },
    async prepare(guildId, userId, managed, desired) {
      const guild = await client.guilds.fetch(guildId);
      await guild.members.fetchMe({ force: true });
      const roles = await guild.roles.fetch();
      const member = await guild.members
        .fetch({ user: userId, force: true })
        .catch((error) => {
          if (error instanceof DiscordAPIError && error.code === 10007)
            throw new RoleError("memberGone");
          throw error;
        });
      const current = new Set(
        [...member.roles.cache.keys()].filter((id) => managed.includes(id)),
      );
      if (
        (current.size > 0 || desired.size > 0) &&
        !guild.members.me?.permissions.has(PermissionFlagsBits.ManageRoles)
      )
        throw new RoleError("permissions");
      for (const id of managed) {
        if (!current.has(id) && !desired.has(id)) continue;
        const role = roles.get(id);
        if ((!role && desired.has(id)) || (role && !roleAllowed(role, guild)))
          throw new RoleError("permissions");
      }
      return {
        current,
        async add(id) {
          await member.roles.add(id, "NFT holder eligibility");
        },
        async remove(id) {
          if (roles.has(id))
            await member.roles.remove(id, "NFT holder eligibility");
        },
      };
    },
  };
}
