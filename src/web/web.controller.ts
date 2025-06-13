import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TreeVisualizationService } from '../services/tree-visualization.service';
import { PrismaService } from '../prisma/prisma.service';
import { FamilyMember } from '@prisma/client';

type FamilyMemberWithRelations = FamilyMember & {
  relatedTo: FamilyMember[];
  relatedFrom: FamilyMember[];
};

@Controller('web')
export class WebController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly treeVisualizationService: TreeVisualizationService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get('tree')
  async getTree(@Req() req: any) {
    const user = await this.prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        familyMembers: {
          include: {
            relatedTo: true,
            relatedFrom: true,
          },
        },
      },
    });

    if (!user || !user.familyMembers.length) {
      return { message: 'No family tree found' };
    }

    const treeText = this.treeVisualizationService.generateTextTree(
      user.familyMembers as FamilyMemberWithRelations[]
    );
    return { tree: treeText };
  }
} 