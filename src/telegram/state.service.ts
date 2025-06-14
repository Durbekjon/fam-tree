import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RelationType } from '@prisma/client';

export type ActionType = 
  | 'searching' 
  | 'adding_member' 
  | 'viewing_tree'
  | 'creating_tree'
  | 'settings';

export type StepType = 
  | 'select_relation' 
  | 'enter_name' 
  | 'enter_birth_year' 
  | 'select_related_member'
  | 'enter_tree_name'
  | 'enter_tree_description';

export interface UserStateData {
  name?: string;
  birthYear?: number;
  relationType?: RelationType;
  selectedMemberId?: number;
  treeName?: string;
  treeDescription?: string;
  searchQuery?: string;
}

export interface UserState {
  action: ActionType;
  step: StepType;
  data: UserStateData;
}

@Injectable()
export class StateService {
  private readonly logger = new Logger(StateService.name);
  private userStates: Map<string, UserState> = new Map();

  constructor(private readonly prisma: PrismaService) {}

  setState(userId: string, state: Partial<UserState>): void {
    const currentState = this.userStates.get(userId) || {
      action: 'searching',
      step: 'enter_name',
      data: {}
    };

    const newState = {
      ...currentState,
      ...state,
      data: {
        ...currentState.data,
        ...(state.data || {})
      }
    };

    this.userStates.set(userId, newState);
    this.logger.debug(`Updated state for user ${userId}:`, newState);
  }

  getState(userId: string): UserState | null {
    const state = this.userStates.get(userId);
    this.logger.debug(`Getting state for user ${userId}:`, state);
    return state || null;
  }

  getStateData(userId: string): UserStateData | null {
    const state = this.userStates.get(userId);
    this.logger.debug(`Getting state data for user ${userId}:`, state?.data);
    return state?.data || null;
  }

  clearState(userId: string): void {
    this.logger.debug(`Clearing state for user ${userId}`);
    this.userStates.delete(userId);
  }

  isAddingFamilyMember(userId: string): boolean {
    const state = this.userStates.get(userId);
    return state?.action === 'adding_member';
  }

  isSelectingRelation(userId: string): boolean {
    const state = this.userStates.get(userId);
    return state?.action === 'adding_member' && state?.step === 'select_relation';
  }

  isWaitingForName(userId: string): boolean {
    const state = this.userStates.get(userId);
    return state?.action === 'adding_member' && state?.step === 'enter_name';
  }

  isWaitingForBirthYear(userId: string): boolean {
    const state = this.userStates.get(userId);
    return state?.action === 'adding_member' && state?.step === 'enter_birth_year';
  }

  isCreatingTree(userId: string): boolean {
    const state = this.userStates.get(userId);
    return state?.action === 'creating_tree';
  }

  isInSettings(userId: string): boolean {
    const state = this.userStates.get(userId);
    return state?.action === 'settings';
  }

  validateState(userId: string): { isValid: boolean; error?: string } {
    const state = this.userStates.get(userId);
    if (!state) {
      return { isValid: false, error: 'No state found' };
    }

    switch (state.action) {
      case 'adding_member':
        if (state.step === 'enter_name' && !state.data.relationType) {
          return { isValid: false, error: 'Relation type is missing in state' };
        }
        if (state.step === 'enter_birth_year' && !state.data.name) {
          return { isValid: false, error: 'Name is missing in state' };
        }
        break;

      case 'creating_tree':
        if (state.step === 'enter_tree_description' && !state.data.treeName) {
          return { isValid: false, error: 'Tree name is missing in state' };
        }
        break;

      case 'searching':
        if (!state.data.searchQuery) {
          return { isValid: false, error: 'Search query is missing in state' };
        }
        break;
    }

    return { isValid: true };
  }

  resetState(userId: string): void {
    this.clearState(userId);
    this.setState(userId, {
      action: 'searching',
      step: 'enter_name',
      data: {}
    });
  }
} 