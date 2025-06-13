import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PDFDocument, rgb, PDFPage } from 'pdf-lib';
import * as fs from 'fs';
import * as path from 'path';

interface TreeNode {
  id: string;
  name: string;
  birthYear: number | null;
  deathYear: number | null;
  children: TreeNode[];
}

@Injectable()
export class PdfExportService {
  private readonly BOX_WIDTH = 200;
  private readonly BOX_HEIGHT = 80;
  private readonly HORIZONTAL_SPACING = 250;
  private readonly VERTICAL_SPACING = 150;

  constructor(private readonly prisma: PrismaService) {}

  async generateTreePdf(treeId: string, outputPath: string) {
    const tree = await this.prisma.tree.findUnique({
      where: { id: treeId },
      include: {
        members: {
          include: {
            relatedTo: true,
            relatedFrom: true,
          },
        },
      },
    });

    if (!tree) {
      throw new Error('Tree not found');
    }

    const treeStructure = this.buildTreeStructure(tree.members);
    const positions = this.calculatePositions(treeStructure);

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([1200, 800]);

    // Add title
    page.drawText(tree.name, {
      x: 50,
      y: 750,
      size: 24,
      color: rgb(0, 0, 0),
    });

    // Add date
    const date = new Date().toLocaleDateString();
    page.drawText(`Generated on: ${date}`, {
      x: 50,
      y: 720,
      size: 12,
      color: rgb(0.5, 0.5, 0.5),
    });

    // Draw tree
    this.drawTree(page, treeStructure, positions);

    // Add footer
    page.drawText('Family Tree Generator', {
      x: 50,
      y: 30,
      size: 10,
      color: rgb(0.5, 0.5, 0.5),
    });

    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(outputPath, pdfBytes);
  }

  private buildTreeStructure(members: any[]): TreeNode[] {
    const memberMap = new Map<string, TreeNode>();
    const roots: TreeNode[] = [];

    // First pass: Create all nodes
    for (const member of members) {
      memberMap.set(member.id, {
        id: member.id,
        name: member.fullName,
        birthYear: member.birthYear,
        deathYear: member.deathYear,
        children: [],
      });
    }

    // Second pass: Build relationships
    for (const member of members) {
      const node = memberMap.get(member.id);
      if (!node) continue;

      const parents = member.relatedFrom.filter(rel =>
        rel.relationType === 'PARENT'
      );

      if (parents.length === 0) {
        roots.push(node);
      } else {
        for (const parent of parents) {
          const parentNode = memberMap.get(parent.id);
          if (parentNode) {
            parentNode.children.push(node);
          }
        }
      }
    }

    return roots;
  }

  private calculatePositions(nodes: TreeNode[], level = 0, x = 0): Map<string, { x: number; y: number }> {
    const positions = new Map<string, { x: number; y: number }>();
    let currentX = x;

    for (const node of nodes) {
      positions.set(node.id, {
        x: currentX,
        y: 600 - level * this.VERTICAL_SPACING,
      });

      if (node.children.length > 0) {
        const childPositions = this.calculatePositions(
          node.children,
          level + 1,
          currentX
        );
        for (const [id, pos] of childPositions) {
          positions.set(id, pos);
        }
      }

      currentX += this.HORIZONTAL_SPACING;
    }

    return positions;
  }

  private drawTree(page: PDFPage, nodes: TreeNode[], positions: Map<string, { x: number; y: number }>) {
    for (const node of nodes) {
      const pos = positions.get(node.id);
      if (!pos) continue;

      // Draw box
      page.drawRectangle({
        x: pos.x,
        y: pos.y,
        width: this.BOX_WIDTH,
        height: this.BOX_HEIGHT,
        borderColor: rgb(0, 0, 0),
        borderWidth: 1,
      });

      // Draw name
      page.drawText(node.name, {
        x: pos.x + 10,
        y: pos.y + this.BOX_HEIGHT - 20,
        size: 12,
        color: rgb(0, 0, 0),
      });

      // Draw years
      const years = [
        node.birthYear,
        node.deathYear,
      ].filter(Boolean).join(' - ');
      page.drawText(years, {
        x: pos.x + 10,
        y: pos.y + 10,
        size: 10,
        color: rgb(0.5, 0.5, 0.5),
      });

      // Draw lines to children
      for (const child of node.children) {
        const childPos = positions.get(child.id);
        if (!childPos) continue;

        page.drawLine({
          start: { x: pos.x + this.BOX_WIDTH / 2, y: pos.y },
          end: { x: childPos.x + this.BOX_WIDTH / 2, y: childPos.y + this.BOX_HEIGHT },
          color: rgb(0, 0, 0),
          thickness: 1,
        });
      }

      // Recursively draw children
      if (node.children.length > 0) {
        this.drawTree(page, node.children, positions);
      }
    }
  }
} 