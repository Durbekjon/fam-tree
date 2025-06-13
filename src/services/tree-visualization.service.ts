import { Injectable } from '@nestjs/common';
import { FamilyMember, RelationType } from '@prisma/client';

type FamilyMemberWithRelations = FamilyMember & {
  relatedTo: FamilyMember[];
  relatedFrom: FamilyMember[];
};

@Injectable()
export class TreeVisualizationService {
  generateTextTree(members: FamilyMemberWithRelations[]): string {
    if (!members.length) {
      return 'Oila daraxti bo\'sh';
    }

    let tree = '';

    // Group members by their relation types
    const membersByType = this.groupMembersByRelationType(members);

    // Display parents first
    if (membersByType.parents.length > 0) {
      tree += '👨‍👩‍👧‍👦 *Ota-ona:*\n';
      for (const parent of membersByType.parents) {
        tree += this.formatMemberWithRelations(parent, members);
      }
      tree += '\n';
    }

    // Display siblings
    if (membersByType.siblings.length > 0) {
      tree += '👥 *Aka-uka/Singillar:*\n';
      for (const sibling of membersByType.siblings) {
        tree += this.formatMemberWithRelations(sibling, members);
      }
      tree += '\n';
    }

    // Display spouse
    if (membersByType.spouse) {
      tree += '💑 *Turmush o\'rtog\'i:*\n';
      tree += this.formatMemberWithRelations(membersByType.spouse, members);
      tree += '\n';
    }

    // Display children
    if (membersByType.children.length > 0) {
      tree += '👶 *Farzandlar:*\n';
      for (const child of membersByType.children) {
        tree += this.formatMemberWithRelations(child, members);
      }
    }

    return tree;
  }

  private groupMembersByRelationType(members: FamilyMemberWithRelations[]) {
    const grouped = {
      parents: [] as FamilyMemberWithRelations[],
      siblings: [] as FamilyMemberWithRelations[],
      spouse: null as FamilyMemberWithRelations | null,
      children: [] as FamilyMemberWithRelations[],
    };

    for (const member of members) {
      switch (member.relationType) {
        case RelationType.FATHER:
        case RelationType.MOTHER:
          grouped.parents.push(member);
          break;
        case RelationType.SIBLING:
          grouped.siblings.push(member);
          break;
        case RelationType.SPOUSE:
          grouped.spouse = member;
          break;
        case RelationType.CHILD:
          grouped.children.push(member);
          break;
      }
    }

    return grouped;
  }

  private formatMemberWithRelations(
    member: FamilyMemberWithRelations,
    allMembers: FamilyMemberWithRelations[],
  ): string {
    let text = `• *${member.fullName}* (${member.birthYear})\n`;

    // Add related members information
    const relatedMembers = this.getRelatedMembers(member, allMembers);
    if (relatedMembers.length > 0) {
      text += '  Bog\'lanishlar:\n';
      for (const related of relatedMembers) {
        text += `  - ${this.getRelationName(related.relationType)}: ${related.fullName}\n`;
      }
    }

    return text;
  }

  private getRelatedMembers(
    member: FamilyMemberWithRelations,
    allMembers: FamilyMemberWithRelations[],
  ): FamilyMemberWithRelations[] {
    const relatedIds = new Set([
      ...member.relatedTo.map(r => r.id),
      ...member.relatedFrom.map(r => r.id),
    ]);

    return allMembers.filter(m => relatedIds.has(m.id));
  }

  private getRelationName(relationType: RelationType): string {
    const names: Record<RelationType, string> = {
      [RelationType.FATHER]: 'Ota',
      [RelationType.MOTHER]: 'Ona',
      [RelationType.SIBLING]: 'Aka-uka/Singil',
      [RelationType.CHILD]: 'Farzand',
      [RelationType.SPOUSE]: 'Turmush o\'rtog\'i',
    };
    return names[relationType] || relationType.toLowerCase();
  }
} 