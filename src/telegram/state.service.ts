import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RelationType } from '@prisma/client';

export type ActionType = 'searching' | 'adding_member' | 'viewing_tree';
export type StepType = 'enter_name' | 'enter_birth_year' | 'select_related_member';

export interface UserStateData {
  name?: string;
  birthYear?: number;
  relationType?: RelationType;
  selectedMemberId?: number;
}

export interface UserState {
  action: ActionType;
  step: StepType;
  data: UserStateData;
}

@Injectable()
export class StateService {
  private userStates: Map<string, UserState> = new Map();

  constructor(private readonly prisma: PrismaService) {}

  setState(userId: string, state: Partial<UserState>): void {
    const currentState = this.userStates.get(userId) || {
      action: 'searching',
      step: 'enter_name',
      data: {}
    };

    this.userStates.set(userId, {
      ...currentState,
      ...state,
      data: {
        ...currentState.data,
        ...(state.data || {})
      }
    });

    console.log('Updated state for user', userId, ':', this.userStates.get(userId));
  }

  getState(userId: string): UserState | null {
    const state = this.userStates.get(userId);
    console.log('Getting state for user', userId, ':', state);
    return state || null;
  }

  getStateData(userId: string): UserStateData | null {
    const state = this.userStates.get(userId);
    console.log('Getting state data for user', userId, ':', state?.data);
    return state?.data || null;
  }

  clearState(userId: string): void {
    console.log('Clearing state for user', userId);
    this.userStates.delete(userId);
  }

  isAddingFamilyMember(userId: string): boolean {
    const state = this.userStates.get(userId);
    return state?.action === 'adding_member';
  }

  isWaitingForName(userId: string): boolean {
    const state = this.userStates.get(userId);
    return state?.action === 'adding_member' && state?.step === 'enter_name';
  }

  isWaitingForBirthYear(userId: string): boolean {
    const state = this.userStates.get(userId);
    return state?.action === 'adding_member' && state?.step === 'enter_birth_year';
  }
} 