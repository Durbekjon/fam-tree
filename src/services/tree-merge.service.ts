import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MergeStatus } from '../enums/merge-status.enum';
import { RelationType, FamilyMember } from '@prisma/client';

interface SharedAncestor {
  sourceMember: FamilyMember;
  targetMember: FamilyMember;
}

@Injectable()
export class TreeMergeService {
  constructor(private readonly prisma: PrismaService) {}

  async findSharedAncestors(sourceTreeId: string, targetTreeId: string): Promise<SharedAncestor[]> {
    const sourceMembers = await this.prisma.familyMember.findMany({
      where: { treeId: sourceTreeId },
      include: {
        relatedTo: true,
        relatedFrom: true,
      },
    });

    const targetMembers = await this.prisma.familyMember.findMany({
      where: { treeId: targetTreeId },
      include: {
        relatedTo: true,
        relatedFrom: true,
      },
    });

    const sharedAncestors: SharedAncestor[] = [];

    for (const sourceMember of sourceMembers) {
      for (const targetMember of targetMembers) {
        if (
          sourceMember.fullName === targetMember.fullName &&
          sourceMember.birthYear === targetMember.birthYear
        ) {
          sharedAncestors.push({
            sourceMember,
            targetMember,
          });
        }
      }
    }

    return sharedAncestors;
  }

  async requestMerge(
    sourceTreeId: string,
    targetTreeId: string,
    requesterId: string,
    approverId: string,
  ) {
    const merge = await this.prisma.treeMerge.create({
      data: {
        sourceTreeId,
        targetTreeId,
        requesterId,
        approverId,
        status: MergeStatus.PENDING,
      },
    });

    return merge;
  }

  async approveMerge(mergeId: string, approverId: string) {
    const merge = await this.prisma.treeMerge.findUnique({
      where: { id: mergeId },
      include: {
        sourceTree: {
          include: {
            members: true,
          },
        },
        targetTree: {
          include: {
            members: true,
          },
        },
      },
    });

    if (!merge) {
      throw new Error('Merge request not found');
    }

    if (merge.approverId !== approverId) {
      throw new Error('Not authorized to approve this merge');
    }

    if (merge.status !== MergeStatus.PENDING) {
      throw new Error('Merge request is not pending');
    }

    // Start a transaction to merge the trees
    await this.prisma.$transaction(async (prisma) => {
      // Update merge status
      await prisma.treeMerge.update({
        where: { id: mergeId },
        data: { status: MergeStatus.APPROVED },
      });

      // Move all members from source tree to target tree
      await prisma.familyMember.updateMany({
        where: { treeId: merge.sourceTreeId },
        data: { treeId: merge.targetTreeId },
      });

      // Delete the source tree
      await prisma.tree.delete({
        where: { id: merge.sourceTreeId },
      });
    });

    return true;
  }
} 