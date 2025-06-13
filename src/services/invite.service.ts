import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TreeRole } from '../enums/tree-role.enum';

@Injectable()
export class InviteService {
  constructor(private readonly prisma: PrismaService) {}

  async createInvite(treeId: string, role: TreeRole = TreeRole.VIEWER) {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

    const invite = await this.prisma.invite.create({
      data: {
        treeId,
        role,
        expiresAt,
      },
    });

    return {
      inviteUrl: `${process.env.BOT_URL}/join/${invite.id}`,
      invite,
    };
  }

  async acceptInvite(inviteId: string, userId: string) {
    const invite = await this.prisma.invite.findUnique({
      where: { id: inviteId },
    });

    if (!invite) {
      throw new Error('Invite not found');
    }

    if (invite.expiresAt < new Date()) {
      throw new Error('Invite has expired');
    }

    await this.prisma.treeAccess.create({
      data: {
        treeId: invite.treeId,
        userId,
        role: invite.role,
      },
    });

    await this.prisma.invite.delete({
      where: { id: inviteId },
    });

    return true;
  }

  async getUserTrees(userId: string) {
    const trees = await this.prisma.treeAccess.findMany({
      where: { userId },
      include: {
        tree: true,
      },
    });

    return trees.map(access => access.tree);
  }

  async getUserRole(treeId: string, userId: string) {
    const access = await this.prisma.treeAccess.findUnique({
      where: {
        treeId_userId: {
          treeId,
          userId,
        },
      },
    });

    return access?.role || null;
  }
} 